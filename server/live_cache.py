#!/usr/bin/env python3
"""A caching relay for Helios live (live.html): CDAWeb's HAPI server and SSCWeb behind one origin, with a disk cache.

Usage: python3 live_cache.py [--port 8790] [--dir ~/.helios-live-cache] [--max-gb 20] [--origin *]

    GET /hapi/<endpoint>?...   CDAWeb HAPI (catalog, info, data as csv or binary)
    GET /sscweb/<path>         SSCWeb's REST service (locations, observatories), JSON
    GET /health, /stats        liveness and hit counts

Why tiles: the page asks for arbitrary windows around arbitrary moments, which would rarely repeat. Each HAPI data
request is cut into fixed tiles sized to the data's cadence (a day for ephemeris and OMNI, an hour for survey FGM, ten
minutes for burst moments and fields, a second for FPI
distributions), each tile is fetched once, filtered to its own interval (CDAWeb answers an empty interval with the
nearest record outside it) and kept on disk; a request is answered by joining the tiles it touches. So the second
visitor to an event, or the same visitor moving a cut, reads from disk.

Upstream etiquette: at most six requests to each archive at a time, identical tile fetches coalesced, retries with
backoff on 5xx and timeouts. Tiles that end within two days of now are kept for an hour only (data still arriving);
the rest for 30 days (the archives do reprocess). Responses are gzipped when the browser accepts it (CSV shrinks ~4×).

Standard library only, so it runs anywhere with Python 3.9+.
"""
import argparse, calendar, gzip, hashlib, json, os, re, threading, time, urllib.error, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HAPI = "https://cdaweb.gsfc.nasa.gov/hapi"
SSC = "https://sscweb.gsfc.nasa.gov/WS/sscr/2"
UA = "helios-live-cache/0.1 (+https://j-beedle.github.io/helios-website/)"
LONG, SHORT = 30 * 86400, 3600

# ───────────────────────── time ─────────────────────────
def to_ns(s):
    """'2015-10-16T11:00:00.024201612Z' (or shorter) → ns since 1970, without datetime's microsecond limit."""
    s = s.strip().rstrip("Z")
    date, _, clock = s.partition("T")
    y, mo, d = (int(x) for x in date.split("-"))
    hh, mm, ss = (clock.split(":") + ["0", "0", "0"])[:3] if clock else ("0", "0", "0")
    sec, _, frac = ss.partition(".")
    days = calendar.timegm((y, mo, d, 0, 0, 0, 0, 0, 0)) // 86400
    return ((int(days) * 86400 + int(hh or 0) * 3600 + int(mm or 0) * 60 + int(sec or 0)) * 10**9) + int((frac + "000000000")[:9] or 0)

def iso(ns):
    t = time.gmtime(ns // 10**9)
    return time.strftime("%Y-%m-%dT%H:%M:%S", t) + "Z"

def tile_seconds(dataset):
    """Tiles sized to each dataset's cadence, so a tile is a few MB at most and a request a handful of tiles."""
    d = dataset.upper()
    if "DIST" in d: return 1                               # FPI distributions: ~4 MB a second
    if "BRST" in d: return 600                             # burst fields and moments
    if "FGM_SRVY" in d: return 3600                        # 16 samples a second
    if "MEC" in d or "OMNI" in d: return 86400             # a sample a minute or so
    return 6 * 3600                                        # survey moments, THEMIS, Cluster

# ───────────────────────── the disk cache ─────────────────────────
class Cache:
    def __init__(self, root, max_bytes):
        self.root, self.max = root, max_bytes
        os.makedirs(root, exist_ok=True)
        self.lock = threading.Lock()
        self.stats = {"hits": 0, "misses": 0, "upstream_bytes": 0, "served_bytes": 0}
    def path(self, key):
        h = hashlib.sha256(key.encode()).hexdigest()
        return os.path.join(self.root, h[:2], h)
    def get(self, key):
        p = self.path(key)
        try:
            with open(p + ".meta") as f:
                meta = json.load(f)
            if meta["expires"] < time.time():
                return None
            with open(p, "rb") as f:
                body = f.read()
            os.utime(p)                                    # recency, for eviction
            with self.lock: self.stats["hits"] += 1
            return body, meta
        except (OSError, ValueError, KeyError):
            return None
    def put(self, key, body, meta):
        p = self.path(key)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        tmp = p + f".{threading.get_ident()}.tmp"
        with open(tmp, "wb") as f: f.write(body)
        os.replace(tmp, p)
        with open(p + ".meta", "w") as f: json.dump(meta, f)
        with self.lock: self.stats["misses"] += 1
    def evict(self):
        """Oldest files out until the cache is under its cap."""
        files = []
        for dp, _, fs in os.walk(self.root):
            for f in fs:
                if f.endswith(".meta") or f.endswith(".tmp"): continue
                p = os.path.join(dp, f)
                try: st = os.stat(p); files.append((st.st_mtime, st.st_size, p))
                except OSError: pass
        total = sum(s for _, s, _ in files)
        for _, size, p in sorted(files):
            if total <= self.max: break
            for q in (p, p + ".meta"):
                try: os.remove(q)
                except OSError: pass
            total -= size

# ───────────────────────── upstream ─────────────────────────
class Upstream:
    """At most `n` requests in flight per host, identical fetches coalesced, retries with backoff."""
    def __init__(self, n=4):
        self.sem = {"cdaweb": threading.BoundedSemaphore(n), "sscweb": threading.BoundedSemaphore(n)}
        self.inflight, self.lock = {}, threading.Lock()
    def fetch(self, url, host, accept=None, timeout=60):
        with self.lock:
            ev = self.inflight.get(url)
            if ev is None:
                ev = self.inflight[url] = {"done": threading.Event(), "result": None, "owner": True}
                owner = True
            else:
                owner = False
        if not owner:
            ev["done"].wait(timeout * 4)
            if ev["result"] is None: raise RuntimeError("upstream fetch failed")
            return ev["result"]
        try:
            ev["result"] = self._fetch(url, host, accept, timeout)
            return ev["result"]
        finally:
            ev["done"].set()
            with self.lock: self.inflight.pop(url, None)
    def _fetch(self, url, host, accept, timeout):
        last = None
        for k in range(4):
            with self.sem[host]:
                try:
                    req = urllib.request.Request(url, headers={"User-Agent": UA, **({"Accept": accept} if accept else {})})
                    with urllib.request.urlopen(req, timeout=timeout) as r:
                        return r.status, r.read(), r.headers.get("Content-Type", "")
                except urllib.error.HTTPError as e:
                    body = e.read()
                    if e.code == 404 or e.code < 500 and e.code != 429:
                        return e.code, body, e.headers.get("Content-Type", "")
                    last = e
                except Exception as e:                     # timeouts, resets
                    last = e
            time.sleep(1.5 * 2 ** k)
        raise RuntimeError(f"upstream: {last}")

# ───────────────────────── HAPI ─────────────────────────
class HapiTiles:
    def __init__(self, cache, up):
        self.cache, self.up = cache, up
    def passthrough(self, path, query, ttl=86400):
        url = f"{HAPI}/{path}" + (f"?{query}" if query else "")
        hit = self.cache.get("pass:" + url)
        if hit: return hit[0], hit[1]["type"]
        status, body, ctype = self.up.fetch(url, "cdaweb")
        if status == 200:
            self.cache.put("pass:" + url, body, {"type": ctype, "expires": time.time() + ttl})
        return body, ctype
    def record_layout(self, dataset, params):
        """Bytes per binary record: Time's length, then each parameter (doubles 8, integers 4, strings their length)."""
        body, _ = self.passthrough("info", urllib.parse.urlencode({"id": dataset, "parameters": ",".join(params)}))
        info = json.loads(body)
        tl, n = 0, 0
        for p in info["parameters"]:
            k = 1
            for s in p.get("size") or [1]: k *= s
            if p["name"] == "Time": tl = int(p.get("length") or 30); continue
            w = 8 if p.get("type") == "double" else 4 if p.get("type") == "integer" else int(p.get("length") or 8)
            n += k * w
        return tl, tl + n
    def tile(self, dataset, params, fmt, start_ns, secs):
        """One tile's records, kept to [start, start + secs)."""
        end_ns = start_ns + secs * 10**9
        key = f"tile:{dataset}|{','.join(params)}|{fmt}|{start_ns}|{secs}"
        hit = self.cache.get(key)
        if hit: return hit[0]
        q = {"id": dataset, "parameters": ",".join(params), "time.min": iso(start_ns), "time.max": iso(end_ns)}
        if fmt == "binary": q["format"] = "binary"
        status, body, _ = self.up.fetch(f"{HAPI}/data?{urllib.parse.urlencode(q)}", "cdaweb", timeout=90)
        if status == 404 or body[:1] in (b"{", b","):      # HAPI 1201: nothing in the tile
            if status not in (200, 404) and b"1201" not in body: raise RuntimeError(body[:200].decode(errors="replace"))
            body = b""
        elif status != 200:
            raise RuntimeError(f"HAPI {status}")
        body = self.clip(body, fmt, start_ns, end_ns, dataset, params)
        recent = end_ns / 1e9 > time.time() - 2 * 86400
        self.cache.put(key, body, {"type": "tile", "expires": time.time() + (SHORT if recent else LONG)})
        return body
    def records(self, body, fmt, dataset, params):
        if not body: return
        if fmt == "csv":
            for ln in body.split(b"\n"):
                if ln and not ln.startswith(b"#"):
                    yield to_ns(ln.split(b",", 1)[0].decode()), ln + b"\n"
        else:
            tl, rec = self.record_layout(dataset, params)
            for o in range(0, len(body) - rec + 1, rec):
                yield to_ns(body[o:o + tl].decode(errors="replace").strip("\x00")), body[o:o + rec]
    def clip(self, body, fmt, a, b, dataset, params):
        return b"".join(r for t, r in self.records(body, fmt, dataset, params) if a <= t < b)
    def data(self, query):
        q = dict(urllib.parse.parse_qsl(query, keep_blank_values=True))
        dataset, params = q["id"], [p for p in q.get("parameters", "").split(",") if p]
        fmt = "binary" if q.get("format") == "binary" else "csv"
        a, b = to_ns(q.get("time.min") or q.get("start")), to_ns(q.get("time.max") or q.get("stop"))
        secs = tile_seconds(dataset)
        step = secs * 10**9
        first = a // step * step
        starts = list(range(first, b, step))
        with ThreadPoolExecutor(max_workers=min(6, len(starts)) or 1) as ex:   # the upstream semaphore still caps the archive
            bodies = list(ex.map(lambda s: self.tile(dataset, params, fmt, s, secs), starts))
        out = []
        for body in bodies:
            out.extend(r for t, r in self.records(body, fmt, dataset, params) if a <= t < b)
        return b"".join(out), ("application/octet-stream" if fmt == "binary" else "text/csv")

# ───────────────────────── SSCWeb ─────────────────────────
def sscweb(cache, up, path):
    url = f"{SSC}/{path}"
    hit = cache.get("ssc:" + url)
    if hit: return hit[0]
    status, body, _ = up.fetch(url, "sscweb", accept="application/json", timeout=90)
    if status != 200: raise RuntimeError(f"SSCWeb {status}")
    m = re.search(r",(\d{8}T\d{6}Z)/", path)               # the interval's end: recent data are kept an hour
    end = to_ns(m.group(1)[:4] + "-" + m.group(1)[4:6] + "-" + m.group(1)[6:11] + ":" + m.group(1)[11:13] + ":" + m.group(1)[13:15]) / 1e9 if m else 0
    cache.put("ssc:" + url, body, {"type": "json", "expires": time.time() + (SHORT if end > time.time() - 2 * 86400 else LONG)})
    return body

# ───────────────────────── the server ─────────────────────────
def make_handler(cache, up, hapi, origin):
    class H(BaseHTTPRequestHandler):
        server_version = "HeliosLiveCache/0.1"
        def log_message(self, fmt, *args):
            pass
        def send(self, code, body, ctype):
            gz = "gzip" in (self.headers.get("Accept-Encoding") or "") and len(body) > 1024
            if gz: body = gzip.compress(body, 5)
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Cache-Control", "public, max-age=3600")
            if gz: self.send_header("Content-Encoding", "gzip")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            with cache.lock: cache.stats["served_bytes"] += len(body)
        def do_OPTIONS(self):
            self.send_response(204)
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Accept, Content-Type")
            self.end_headers()
        def do_GET(self):
            u = urllib.parse.urlsplit(self.path)
            try:
                if u.path == "/health":
                    return self.send(200, b'{"ok":true}', "application/json")
                if u.path == "/stats":
                    return self.send(200, json.dumps(cache.stats).encode(), "application/json")
                if u.path == "/hapi/data":
                    body, ctype = hapi.data(u.query)
                    return self.send(200, body, ctype)
                # only the endpoints the page uses: a relay must not fetch whatever path a caller writes
                if u.path in ("/hapi/catalog", "/hapi/info", "/hapi/capabilities", "/hapi/about"):
                    body, ctype = hapi.passthrough(u.path[len("/hapi/"):], u.query)
                    return self.send(200, body, ctype or "application/json")
                if re.fullmatch(r"/sscweb/locations/[A-Za-z0-9_,]+/\d{8}T\d{6}Z,\d{8}T\d{6}Z/gse/", u.path):
                    return self.send(200, sscweb(cache, up, u.path[len("/sscweb/"):]), "application/json")
                self.send(404, b'{"error":"not found"}', "application/json")
            except Exception as e:                         # an upstream that would not answer
                self.send(502, json.dumps({"error": str(e)[:300]}).encode(), "application/json")
    return H

def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--port", type=int, default=8790)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--dir", default=os.path.expanduser("~/.helios-live-cache"))
    ap.add_argument("--max-gb", type=float, default=20)
    ap.add_argument("--origin", default="*", help="the site allowed to read the relay (default: any)")
    a = ap.parse_args()
    cache, up = Cache(a.dir, int(a.max_gb * 1e9)), Upstream(6)
    hapi = HapiTiles(cache, up)
    def janitor():
        while True:
            time.sleep(600)
            try: cache.evict()
            except Exception: pass
    threading.Thread(target=janitor, daemon=True).start()
    srv = ThreadingHTTPServer((a.host, a.port), make_handler(cache, up, hapi, a.origin))
    print(f"Helios live cache on http://{a.host}:{a.port}, cache in {a.dir} (≤ {a.max_gb:g} GB)", flush=True)
    srv.serve_forever()

if __name__ == "__main__":
    main()
