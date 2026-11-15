/* Helios Live in real time (app.html?t=now): the HSO screen at the present, following the clock, for people watching
 * space weather and for mission operations.
 *
 * What it adds to the any-moment page (which it leaves alone when the address names a moment):
 *   - NOAA SWPC's real-time solar wind (RTSW, 1-minute, the active L1 source), carried to the bow-shock nose, as the
 *     wind that sizes the drawn magnetopause and bow shock (hso-live.js asks HSO_NOW.wind() in place of OMNI);
 *   - NOAA's Kp (3-hour planetary and the 1-minute estimate) and the NOAA G/S/R scales;
 *   - CCMC's real-time SWMF run's magnetopause standoff (a model), for comparison;
 *   - the Now panel: the read-out, the model's region for each drawn spacecraft, what is and is not available now,
 *     and when each feed was last fetched and how old its newest sample is.
 *
 * A polite client: one request per feed per refresh (the solar wind's full-day pair excepted, two files every 30 min),
 * no feed more often than once a minute, each feed backing off (doubling, to 30 min) after a failure, and nothing
 * fetched while the tab is hidden. Everything downloaded is treated as untrusted: numbers are range-checked, names
 * pattern-checked, and nothing from a feed is put into the page as markup.
 *
 * Runs after app-page.js and before hso-live.js; hso.js hands it the drawn view (window.HSO_STAGE) once it is up.
 */
(function () {
  "use strict";

  const q = new URLSearchParams(location.search);
  if ((q.get("t") || "").trim().toLowerCase() !== "now" || window.HSO_GATED) return;
  const SOLO = q.has("solo");

  // ── the moment the page opened on, to the minute; the view's clock runs two hours either side of it ──
  const AT = window.HSO_NOW_AT || Math.floor(Date.now() / 60000) * 60000;
  const HALF = 7200, SPAN = 2 * HALF, T0 = AT - HALF * 1000;
  const RE_KM = 6371.2, MIN = 60e3, STALE = 15 * MIN;
  const SWPC = "https://services.swpc.noaa.gov";
  const ISWA = "https://iswa.ccmc.gsfc.nasa.gov/hapi/data";
  let panel = null, open = true, stage = null, failed = false;   // the Now panel; the drawn view, once hso.js has it up

  // ───────────────────────── small helpers ─────────────────────────
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (x) => String(x).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const pad = (n) => String(n).padStart(2, "0");
  const hm = (ms) => { const d = new Date(ms); return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; };
  const hms = (ms) => { const d = new Date(ms); return `${hm(ms)}:${pad(d.getUTCSeconds())}`; };
  const M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const day = (ms) => { const d = new Date(ms); return `${d.getUTCDate()} ${M[d.getUTCMonth()]}`; };
  /** "3 min", "1 h 05 min": how long ago (or ahead, for a negative age). */
  function age(ms) {
    const s = Math.round(Math.abs(ms) / 1000), sign = ms < 0 ? "in " : "";
    if (s < 90) return `${sign}${s} s`;
    const m = Math.round(s / 60);
    return m < 90 ? `${sign}${m} min` : `${sign}${Math.floor(m / 60)} h ${pad(m % 60)} min`;
  }
  /** A number from an untrusted feed: finite and inside [lo, hi], else NaN. */
  const num = (x, lo, hi) => { const v = typeof x === "number" ? x : typeof x === "string" && x.trim() !== "" ? Number(x) : NaN; return isFinite(v) && v >= lo && v <= hi ? v : NaN; };
  /** An ISO time from a feed ("2026-11-12T14:03:00", with or without Z), as ms; anything else NaN. */
  const tagMs = (s) => (typeof s === "string" && /^\d{4}-\d\d-\d\d[T ]\d\d:\d\d(:\d\d(\.\d+)?)?Z?$/.test(s.trim()) ? Date.parse(s.trim().replace(" ", "T").replace(/Z?$/, "Z")) : NaN);
  const name = (s) => (typeof s === "string" && /^[A-Za-z0-9 _-]{1,20}$/.test(s) ? s : null);
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const f = (v, d) => (isFinite(v) ? v.toFixed(d) : "—");
  const sg = (v, d) => (isFinite(v) ? `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(d)}` : "—");
  /** Kp in NOAA's thirds: 0.67 → "1−", 1.33 → "1+". */
  const kpThirds = (k) => { if (!isFinite(k)) return "—"; const r = Math.round(k * 3) / 3, n = Math.round(r); const d = Math.round((r - n) * 3); return `${n}${d > 0 ? "+" : d < 0 ? "−" : "o"}`; };

  /** One GET as text: no credentials, revalidated with the server (the files say max-age=60), 30 s at most, 25 MB at most. */
  async function getText(url) {
    const r = await fetch(url, { cache: "no-cache", credentials: "omit", signal: AbortSignal.timeout(30000) });
    if (r.status === 404) return { status: 404, text: await r.text().catch(() => "") };
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const text = await r.text();
    if (text.length > 25e6) throw new Error("answer too large");
    return { status: r.status, text };
  }
  const getJSON = async (url) => { const { status, text } = await getText(url); if (status === 404) throw new Error("HTTP 404"); return JSON.parse(text); };

  // ───────────────────────── the boundary formulas the view draws (hsoview.js, MagnetosphereModel.swift) ─────────────────────────
  /** OMNI's flow pressure, nPa: 2×10⁻⁶ n V² (n in cm⁻³, V in km/s; the factor allows for ~4% alphas). */
  const flowPressure = (n, v) => (n > 0 && v > 0 ? 2e-6 * n * v * v : NaN);
  /** Shue et al. (1998) standoff, R_E. */
  const shueR0 = (dp, bz) => (10.22 + 1.29 * Math.tanh(0.184 * (bz + 8.14))) * Math.pow(dp, -1 / 6.6);
  /** Jelínek et al. (2012) bow-shock nose, R_E. */
  const jelinekR0 = (dp) => 15.02 * Math.pow(dp, -1 / 6.55);
  const GEO_RE = 6.6;

  // ───────────────────────── the real-time solar wind: NOAA SWPC RTSW ─────────────────────────
  // rows by their L1 time (ms): { t, v, vx, n, temp, bx, by, bz, bt (nT, GSM; Bx is the same in GSE), src, tSwpc (SWPC's
  // propagated time to ~32 R_E, ms), dp, rbs, arr (arrival at the bow-shock nose, ms), how }
  const rows = new Map();
  let activeSrc = null, lastDay = 0;
  const blank = (t) => ({ t, v: NaN, vx: NaN, n: NaN, temp: NaN, bx: NaN, by: NaN, bz: NaN, bt: NaN, src: null, tSwpc: NaN });
  const rowAt = (t) => { let r = rows.get(t); if (!r) rows.set(t, r = blank(t)); return r; };
  /** The full day (rtsw_wind_1m + rtsw_mag_1m): the active source's rows only, flagged rows (overall_quality ≠ 0) left out. */
  function takeDay(wind, mag) {
    for (const r of Array.isArray(wind) ? wind : []) {
      if (!r || r.active !== true || (r.overall_quality ?? 0) !== 0) continue;
      const t = tagMs(r.time_tag); if (!isFinite(t)) continue;
      const o = rowAt(t);
      o.v = num(r.proton_speed, 50, 3500); o.vx = num(r.proton_vx_gse, -3500, 500); o.n = num(r.proton_density, 0, 1000); o.temp = num(r.proton_temperature, 0, 1e9);
      o.src = name(r.source) || o.src;
    }
    for (const r of Array.isArray(mag) ? mag : []) {
      if (!r || r.active !== true || (r.overall_quality ?? 0) !== 0) continue;
      const t = tagMs(r.time_tag); if (!isFinite(t)) continue;
      const o = rowAt(t);
      o.bx = num(r.bx_gsm, -1000, 1000); o.by = num(r.by_gsm, -1000, 1000); o.bz = num(r.bz_gsm, -1000, 1000); o.bt = num(r.bt, 0, 1000);
      o.src = name(r.source) || o.src;
    }
    let newest = -Infinity, src = null;
    for (const r of rows.values()) if (r.src && r.t > newest) { newest = r.t; src = r.src; }
    if (src) activeSrc = src;
  }
  /** The last hour (products/geospace/propagated-solar-wind-1-hour.json): the active source's values, B in GSM, with
   *  SWPC's own propagated time. Its columns are found by their header names. */
  function takeHour(tab) {
    if (!Array.isArray(tab) || !Array.isArray(tab[0])) throw new Error("not a table");
    const H = tab[0].map(String), c = (k) => H.indexOf(k);
    const need = ["time_tag", "speed", "density", "temperature", "bx", "by", "bz", "bt", "vx", "propagated_time_tag"];
    if (need.some(k => c(k) < 0)) throw new Error("columns changed");
    for (const r of tab.slice(1)) {
      if (!Array.isArray(r)) continue;
      const t = tagMs(r[c("time_tag")]); if (!isFinite(t)) continue;
      const o = rowAt(t), keep = (k, v) => { if (isFinite(v) || !isFinite(o[k])) o[k] = v; };
      keep("v", num(r[c("speed")], 50, 3500)); keep("vx", num(r[c("vx")], -3500, 500)); keep("n", num(r[c("density")], 0, 1000)); keep("temp", num(r[c("temperature")], 0, 1e9));
      keep("bx", num(r[c("bx")], -1000, 1000)); keep("by", num(r[c("by")], -1000, 1000)); keep("bz", num(r[c("bz")], -1000, 1000)); keep("bt", num(r[c("bt")], 0, 1000));
      o.tSwpc = tagMs(r[c("propagated_time_tag")]);
      if (!o.src) o.src = activeSrc;
    }
  }
  // the active L1 spacecraft's position (rtsw_ephemerides_1h.json: hourly, GSE, km)
  const eph = [];
  function takeEph(list) {
    const got = [];
    for (const r of Array.isArray(list) ? list : []) {
      if (!r || r.active !== true) continue;
      const t = tagMs(r.time_tag), x = num(r.x_gse, 5e5, 3e6);
      if (isFinite(t) && isFinite(x)) got.push({ t, x: x / RE_KM, src: name(r.source) });
    }
    if (!got.length) throw new Error("no active position");
    got.sort((a, b) => a.t - b.t);
    eph.length = 0; eph.push(...got);
  }
  /** X (R_E, GSE) of the active L1 spacecraft at t: the nearest hourly row within 3 h. */
  function ephX(t) {
    let best = null;
    for (const e of eph) if (Math.abs(e.t - t) <= 3 * 3600e3 && (!best || Math.abs(e.t - t) < Math.abs(best.t - t))) best = e;
    return best ? best.x : NaN;
  }
  /** Each row carried from L1 to the bow-shock nose: a flat front moving along GSE X at the measured Vx (the speed where
   *  Vx is missing), from the spacecraft's X to Jelínek's nose for the row's own pressure:
   *  Δt = (X_L1 − R_BS) · 6371.2 km / |Vx|. Where SWPC's position is missing, SWPC's own propagated time (to X ≈ 32 R_E)
   *  is carried on from 32 R_E the same way. */
  function propagate() {
    const list = [...rows.values()].sort((a, b) => a.t - b.t);
    let rbs = NaN;
    for (const r of list) {
      r.dp = flowPressure(r.n, r.v);
      if (isFinite(r.dp)) rbs = jelinekR0(Math.max(r.dp, 0.01));
      r.rbs = rbs;
      const u = isFinite(r.vx) && r.vx < -50 ? -r.vx : r.v, x = ephX(r.t);
      r.arr = NaN; r.how = null;
      if (!(u > 50) || !isFinite(rbs)) continue;
      if (isFinite(x)) { r.arr = r.t + (x - rbs) * RE_KM / u * 1000; r.how = "eph"; r.xL1 = x; }
      else if (isFinite(r.tSwpc)) { r.arr = r.tSwpc + (32 - rbs) * RE_KM / u * 1000; r.how = "swpc"; }
    }
    // a day kept: nothing older is wanted
    for (const [t] of rows) if (t < Date.now() - 26 * 3600e3) rows.delete(t);
    return list;
  }
  const usable = (r) => isFinite(r.arr) && (isFinite(r.v) || isFinite(r.bz));
  /** The view's wind (hso-live's OMNI set): t in seconds after T0 is the arrival at the nose. */
  function windSet() {
    const list = propagate().filter(usable).sort((a, b) => a.arr - b.arr);
    const F = (k) => Float32Array.from(list, r => r[k]);
    return { t: Float32Array.from(list, r => (r.arr - T0) / 1000), b: F("bt"), bx: F("bx"), by: F("by"), bz: F("bz"), v: F("v"), n: F("n"), p: F("dp"),
             cols: { t: 1, b: 1, bx: 1, by: 1, bz: 1, v: 1, n: 1, p: 1 } };
  }
  /** The sample the view draws at time tMs, picked as hsoview.js's Winds picks it: the row whose minute's middle
   *  (arrival + 30 s) is nearest, each quantity from the nearest row that has it within 30 minutes. */
  function atNose(tMs) {
    const list = [...rows.values()].filter(usable).sort((a, b) => a.arr - b.arr);
    if (!list.length) return null;
    let k = 0;
    for (let i = 1; i < list.length; i++) if (Math.abs(list[i].arr + 30e3 - tMs) < Math.abs(list[k].arr + 30e3 - tMs)) k = i;
    const r = list[k], out = { row: r };
    for (const key of ["v", "n", "bz", "by", "bt"]) {             // outward from the row, nearer side first
      let best = null;
      for (let d = 0; d < list.length && !best; d++) {
        const a = list[k - d], b = list[k + d], da = a ? r.arr - a.arr : Infinity, db = b ? b.arr - r.arr : Infinity;
        if (Math.min(da, db) > 1800e3) break;
        for (const s of da <= db ? [a, b] : [b, a]) if (s && isFinite(s[key]) && Math.abs(s.arr - r.arr) <= 1800e3) { best = s; break; }
      }
      out[key] = best ? best[key] : NaN;
    }
    return out;
  }
  /** The newest L1 minute with both plasma and field (the two files can be a minute or two apart), else the newest with
   *  either. */
  const newestRow = () => {
    let both = null, any = null;
    for (const r of rows.values()) {
      if ((isFinite(r.v) || isFinite(r.bz)) && (!any || r.t > any.t)) any = r;
      if (isFinite(r.v) && isFinite(r.n) && isFinite(r.bz) && (!both || r.t > both.t)) both = r;
    }
    return both && any && any.t - both.t <= 10 * MIN ? both : any;
  };

  /** A GOES flux file's rows as [{ t, v }] by time: the rows keep() picks, each value range-checked. */
  const series = (list, keep, lo, hi) => {
    const out = [];
    for (const r of Array.isArray(list) ? list : []) {
      if (!r || !keep(r)) continue;
      const t = tagMs(r.time_tag), v = num(r.flux, lo, hi);
      if (isFinite(t) && isFinite(v)) out.push({ t, v });
    }
    return out.sort((a, b) => a.t - b.t);
  };
  /** A flare class as NOAA writes it ("C1.0", "M5.2", "X12"), else null. */
  const flareClass = (s) => (typeof s === "string" && /^[ABCMX]\d{1,3}(\.\d{1,2})?$/.test(s) ? s : null);
  /** NOAA SWPC's messages (products/alerts.json, newest first) as what is in effect: a warning until its "Valid To" (or
   *  "Now Valid Until"), a watch through the last day it names, an alert or summary for a day after it is issued. One per
   *  product (the newest; an extension replaces what it extends), cancelled serial numbers left out. Text from the feed
   *  is kept as text: one headline, cut to 120 characters, escaped when drawn. */
  function takeAlerts(list) {
    const now = Date.now(), H = 3600e3, out = [], cancelled = new Set(), seen = new Set();
    const rowsA = (Array.isArray(list) ? list : []).filter(r => r && typeof r.message === "string" && r.message.length < 8000).slice(0, 120);
    const when = (s) => {                                      // "2026 Nov 10 1200 UTC"
      const m = /(\d{4}) ([A-Z][a-z]{2}) (\d{1,2}) (\d{2})(\d{2}) UTC/.exec(s || ""), mo = m ? M.indexOf(m[2]) : -1;
      return mo < 0 ? NaN : Date.UTC(+m[1], mo, +m[3], +m[4], +m[5]);
    };
    for (const r of rowsA) { const c = /Cancel Serial Number:\s*(\d+)/i.exec(r.message); if (c) cancelled.add(c[1]); }
    for (const r of rowsA) {
      const msg = r.message, issued = tagMs(r.issue_datetime);
      if (!isFinite(issued) || now - issued > 96 * H || issued > now + H) continue;
      const head = /^(CANCEL )?((?:EXTENDED |CONTINUED )?(WARNING|ALERT|WATCH|SUMMARY)):[ \t]*(.{3,160})$/m.exec(msg);
      if (!head || head[1]) continue;
      const serial = (/^Serial Number:\s*(\d+)/m.exec(msg) || [])[1];
      if (serial && cancelled.has(serial)) continue;
      const kind = head[3].toLowerCase(), code = typeof r.product_id === "string" && /^[A-Z0-9]{2,8}$/.test(r.product_id) ? r.product_id : head[4].slice(0, 40);
      if (seen.has(code)) continue;
      seen.add(code);                                          // the newest of each product decides, in effect or not
      const until = when((/^(?:Now Valid Until|Valid To|Valid Until):\s*(.+)$/m.exec(msg) || [])[1]);
      let live = now - issued < 24 * H, days = "";
      if (kind === "warning" && isFinite(until)) live = until > now;
      if (kind === "watch") {                                  // "Nov 14:  G1 (Minor)   Nov 15:  None (Below G1)"
        const y = new Date(issued).getUTCFullYear(), got = [];
        for (const m of msg.matchAll(/([A-Z][a-z]{2}) (\d{1,2}):\s+(G[1-5]|None)/g)) {
          const mo = M.indexOf(m[1]); if (mo < 0) continue;
          let t = Date.UTC(y, mo, +m[2]); if (t < issued - 200 * 24 * H) t = Date.UTC(y + 1, mo, +m[2]);
          got.push({ t, g: m[3] });
        }
        if (got.length) {
          live = got.some(d => d.t + 24 * H > now);
          days = got.filter(d => d.g !== "None" && d.t + 24 * H > now).map(d => `${d.g} on ${day(d.t)}`).join(", ");
        } else live = now - issued < 48 * H;
      }
      if (!live) continue;
      out.push({ kind, text: head[4].replace(/[^\x20-\x7E–−≥≤°µ]/g, "").trim().slice(0, 120), issued, until: kind === "warning" ? until : NaN, days });
    }
    const order = { warning: 0, watch: 1, alert: 2, summary: 3 };
    return out.sort((a, b) => order[a.kind] - order[b.kind] || b.issued - a.issued);
  }

  // ───────────────────────── the feeds ─────────────────────────
  const state = {};
  /** key: { label, every (ms), stale (ms, how old the newest sample may be), run () → newest sample time (ms) } */
  const FEEDS = {
    rtsw: { label: "Solar wind at L1", src: "NOAA SWPC RTSW, 1-min", every: MIN, stale: STALE,
      async run() {
        if (Date.now() - lastDay > 30 * MIN || !rows.size) {          // the full day: on opening, then every 30 min
          const [wind, mag] = await Promise.all([getJSON(`${SWPC}/json/rtsw/rtsw_wind_1m.json`), getJSON(`${SWPC}/json/rtsw/rtsw_mag_1m.json`)]);
          takeDay(wind, mag); lastDay = Date.now();
        } else takeHour(await getJSON(`${SWPC}/products/geospace/propagated-solar-wind-1-hour.json`));
        const n = newestRow();
        if (!n) throw new Error("no active-source rows");
        pushWind();
        return n.t;
      } },
    eph: { label: "L1 spacecraft position", src: "NOAA SWPC RTSW ephemeris, hourly", every: 60 * MIN, stale: 3 * 3600e3,
      async run() { takeEph(await getJSON(`${SWPC}/json/rtsw/rtsw_ephemerides_1h.json`)); pushWind(); return eph[eph.length - 1].t; } },
    kp: { label: "Kp, 3-hour", src: "NOAA SWPC planetary K index", every: 15 * MIN, stale: 4 * 3600e3,
      async run() {
        const list = await getJSON(`${SWPC}/products/noaa-planetary-k-index.json`);
        let best = null;
        const all = [];
        for (const r of Array.isArray(list) ? list : []) {
          const t = tagMs(r && r.time_tag), k = num(r && r.Kp, 0, 9);
          if (!isFinite(t) || !isFinite(k)) continue;
          all.push({ t, k });
          if (!best || t > best.t) best = { t, k, n: num(r.station_count, 0, 100) };
        }
        if (!best) throw new Error("no Kp");
        data.kp = best;
        data.kpHist = all.sort((a, b) => a.t - b.t).slice(-16);      // the last two days' 3-hour blocks, for the figure
        return best.t + 3 * 3600e3;                                    // a block's value describes its three hours
      } },
    kpEst: { label: "Kp, estimated", src: "NOAA SWPC 1-min estimated Kp", every: 5 * MIN, stale: STALE,
      async run() {
        const list = await getJSON(`${SWPC}/json/planetary_k_index_1m.json`);
        let best = null;
        for (const r of Array.isArray(list) ? list : []) {
          const t = tagMs(r && r.time_tag), k = num(r && r.estimated_kp, 0, 9);
          if (isFinite(t) && isFinite(k) && (!best || t > best.t)) best = { t, k };
        }
        if (!best) throw new Error("no estimate");
        data.kpEst = best;
        return best.t;
      } },
    scales: { label: "NOAA scales", src: "NOAA SWPC space weather scales", every: 5 * MIN, stale: STALE,
      async run() {
        const s = await getJSON(`${SWPC}/products/noaa-scales.json`);
        const sc = (x) => { const v = num(x && x.Scale, 0, 5); return isFinite(v) ? v : null; };
        const pc = (x) => { const v = num(x, 0, 100); return isFinite(v) ? Math.round(v) : null; };
        const one = (o) => {
          if (!o || typeof o !== "object") return null;
          return { t: tagMs(`${o.DateStamp}T${o.TimeStamp}`), R: sc(o.R), S: sc(o.S), G: sc(o.G) };
        };
        const now = one(s && s["0"]), max = one(s && s["-1"]);
        if (!now || !isFinite(now.t)) throw new Error("no current scales");
        // the forecast for today and the two days after: the chance of R1–R2 and of R3 or more, of S1 or more, and the G expected
        const fc = [];
        for (const k of ["1", "2", "3"]) {
          const o = s[k], t = o && typeof o === "object" ? tagMs(`${o.DateStamp}T00:00:00`) : NaN;
          if (isFinite(t)) fc.push({ t, rMinor: pc(o.R && o.R.MinorProb), rMajor: pc(o.R && o.R.MajorProb), s: pc(o.S && o.S.Prob), g: sc(o.G) });
        }
        data.scales = { now, max, fc };
        return now.t;
      } },
    swmf: { label: "SWMF standoff", src: "CCMC ISWA, real-time SWMF run (a model)", every: 2 * MIN, stale: STALE,
      async run() {
        const iso = (ms) => new Date(ms).toISOString().replace(/\.\d+Z$/, "Z");
        const now = Date.now(), url = `${ISWA}?id=SWMF2023_RT_STANDOFF_P1M&time.min=${iso(now - 90 * MIN)}&time.max=${iso(now + 90 * MIN)}&format=csv`;
        const { status, text } = await getText(url);
        const got = [];
        if (status !== 404) for (const ln of text.split("\n")) {     // 404 (HAPI 1406): no rows in the interval
          const c = ln.split(",");
          if (c.length < 5) continue;
          const t = tagMs(c[0]), noon = num(c[1], 1, 40), min = num(c[2], 1, 40), lt = num(c[3], 0, 24);
          if (isFinite(t) && isFinite(noon)) got.push({ t, noon, min, lt });
        }
        if (!got.length) { data.swmf = null; return NaN; }
        got.sort((a, b) => a.t - b.t);
        // the run can be ahead of the clock (it is driven by L1 wind still on its way): the row for now, if it has one
        const upTo = got.filter(r => r.t <= now);
        data.swmf = upTo.length ? upTo[upTo.length - 1] : got[0];
        data.swmfAhead = got[got.length - 1].t > now ? got[got.length - 1].t : null;
        return data.swmf.t;
      } },
    // ── what NOAA SWPC's dashboards lead with (2026-11-13): the Sun's X-rays and the particles at geosynchronous orbit,
    //    the forecast, the alerts in effect, Dst and the aurora's power ──
    xray: { label: "GOES X-ray flux", src: "NOAA SWPC, GOES primary, 0.1–0.8 nm, 1-min", every: 5 * MIN, stale: STALE,
      async run() {
        const list = await getJSON(`${SWPC}/json/goes/primary/xrays-6-hour.json`);
        const pts = series(list, (r) => r.energy === "0.1-0.8nm", 1e-10, 1);
        if (!pts.length) throw new Error("no long-channel rows");
        data.xray = pts;
        data.xrayS = series(list, (r) => r.energy === "0.05-0.4nm", 1e-10, 1);   // the short band, beside it in the figure
        return pts[pts.length - 1].t;
      } },
    flare: { label: "Latest flare", src: "NOAA SWPC, GOES flare list", every: MIN, stale: STALE,
      async run() {
        const list = await getJSON(`${SWPC}/json/goes/primary/xray-flares-latest.json`), r = Array.isArray(list) ? list[0] : null;
        const t = tagMs(r && r.time_tag);
        if (!isFinite(t)) throw new Error("no flare row");
        data.flare = { t, now: flareClass(r.current_class), max: flareClass(r.max_class), maxT: tagMs(r.max_time) };
        return t;
      } },
    prot: { label: "GOES protons", src: "NOAA SWPC, GOES primary, ≥10 MeV, 5-min", every: 10 * MIN, stale: 30 * MIN,
      async run() {
        const pts = series(await getJSON(`${SWPC}/json/goes/primary/integral-protons-6-hour.json`), (r) => r.energy === ">=10 MeV", 1e-4, 1e8);
        if (!pts.length) throw new Error("no ≥10 MeV rows");
        data.prot = pts;
        return pts[pts.length - 1].t;
      } },
    elec: { label: "GOES electrons", src: "NOAA SWPC, GOES primary, ≥2 MeV, 5-min", every: 10 * MIN, stale: 30 * MIN,
      async run() {
        const pts = series(await getJSON(`${SWPC}/json/goes/primary/integral-electrons-6-hour.json`), (r) => r.energy === ">=2 MeV", 1e-2, 1e9);
        if (!pts.length) throw new Error("no ≥2 MeV rows");
        data.elec = pts;
        return pts[pts.length - 1].t;
      } },
    kpFc: { label: "Kp forecast", src: "NOAA SWPC, 3-day planetary K forecast", every: 30 * MIN, stale: 3 * 3600e3, asOf: "fetch",
      async run() {
        const out = [];
        for (const r of await getJSON(`${SWPC}/products/noaa-planetary-k-index-forecast.json`)) {
          const t = tagMs(r && r.time_tag), k = num(r && r.kp, 0, 9);
          // today's blocks still to come are "estimated", the days after "predicted": both are NOAA's forecast
          if (isFinite(t) && isFinite(k) && (r.observed === "predicted" || r.observed === "estimated")) out.push({ t, k });
        }
        if (!out.length) throw new Error("no predicted rows");
        data.kpFc = out.sort((a, b) => a.t - b.t);
        return Date.now();
      } },
    alerts: { label: "Alerts, watches and warnings", src: "NOAA SWPC", every: 5 * MIN, stale: 60 * MIN, asOf: "fetch",
      async run() { data.alerts = takeAlerts(await getJSON(`${SWPC}/products/alerts.json`)); return Date.now(); } },
    dst: { label: "Dst", src: "WDC Kyoto's quick-look Dst, via NOAA SWPC, hourly", every: 30 * MIN, stale: 3 * 3600e3,
      async run() {
        const out = [];
        for (const r of await getJSON(`${SWPC}/products/kyoto-dst.json`)) {
          const t = tagMs(r && r.time_tag), v = num(r && r.dst, -3000, 500);
          if (isFinite(t) && isFinite(v)) out.push({ t, v });
        }
        if (!out.length) throw new Error("no Dst rows");
        data.dst = out.sort((a, b) => a.t - b.t).slice(-96);
        return data.dst[data.dst.length - 1].t;
      } },
    hp: { label: "Aurora hemispheric power", src: "NOAA SWPC, OVATION, a 30–90 min forecast", every: 5 * MIN, stale: 45 * MIN,
      async run() {
        const { status, text } = await getText(`${SWPC}/text/aurora-nowcast-hemi-power.txt`);
        if (status === 404) throw new Error("HTTP 404");
        let best = null;
        const all = [];                                             // the UTC day's rows, at their forecast times, for the figure
        for (const ln of text.split("\n")) {
          const m = /^(\d{4}-\d\d-\d\d)_(\d\d:\d\d)\s+(\d{4}-\d\d-\d\d)_(\d\d:\d\d)\s+(\d+)\s+(\d+)$/.exec(ln.trim());
          if (!m) continue;
          const t = tagMs(`${m[1]}T${m[2]}:00`), tf = tagMs(`${m[3]}T${m[4]}:00`), n = num(m[5], 0, 2000), s = num(m[6], 0, 2000);
          if (!isFinite(t) || !isFinite(n) || !isFinite(s)) continue;
          if (isFinite(tf)) all.push({ t: tf, n, s });
          if (!best || t > best.t) best = { t, tf, n, s };
        }
        if (!best) throw new Error("no rows");
        data.hp = best;
        data.hpS = all.sort((a, b) => a.t - b.t);
        return best.t;
      } },
    f107: { label: "F10.7", src: "NOAA SWPC, 10.7 cm radio flux", every: 60 * MIN, stale: 36 * 3600e3,
      async run() {
        const list = await getJSON(`${SWPC}/products/summary/10cm-flux.json`), r = Array.isArray(list) ? list[0] : list;
        const t = tagMs(r && r.time_tag), v = num(r && r.flux, 40, 1000);
        if (!isFinite(t) || !isFinite(v)) throw new Error("no value");
        data.f107 = { t, v };
        return t;
      } },
  };
  const data = { kp: null, kpHist: [], kpEst: null, scales: null, swmf: null, xray: [], xrayS: [], flare: null, prot: [], elec: [], kpFc: [], alerts: null, dst: [], hp: null, hpS: [], f107: null };
  const timers = {};
  let busy = 0;
  async function runFeed(key) {
    const F = FEEDS[key], s = state[key] = state[key] || { fails: 0 };
    clearTimeout(timers[key]);
    s.loading = true; busy++; render();
    try {
      s.newest = await F.run();
      s.fetched = Date.now(); s.fails = 0; s.error = null;
    } catch (e) {
      s.fails++; s.error = String(e && e.message || e).slice(0, 120); s.tried = Date.now();
      console.warn(`Now · ${F.label}:`, e);
    } finally { s.loading = false; busy--; }
    s.next = Date.now() + (s.fails ? Math.min(F.every * 2 ** s.fails, 30 * MIN) : F.every);
    schedule(key);
    render();
  }
  function schedule(key) {
    clearTimeout(timers[key]);
    if (document.visibilityState === "hidden") return;            // nothing while the tab is hidden
    const s = state[key];
    timers[key] = setTimeout(() => runFeed(key), Math.max(0, (s && s.next || 0) - Date.now()));
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") { for (const k in timers) clearTimeout(timers[k]); return; }
    for (const k of Object.keys(FEEDS)) if (!state[k] || !state[k].loading) schedule(k);   // what fell due while away runs now
    recenter(); render();
  });

  // ───────────────────────── what hso-live.js asks for ─────────────────────────
  // the first fetch of each feed starts at once, so the scene opens on them
  const first = {};
  for (const k of Object.keys(FEEDS)) first[k] = runFeed(k);
  window.HSO_NOW = {
    at: AT,
    /** The wind for the view, once the solar wind and the L1 position are in (or failed). */
    wind: async () => {
      await Promise.all([first.rtsw, first.eph]);
      if (!rows.size) throw new Error("NOAA SWPC's real-time solar wind did not load");
      return windSet();
    },
    /** Kp for T89 and the oval (set when the scene opens): NOAA's 1-minute estimate, else the last 3-hour value. */
    kp: async () => {
      await Promise.all([first.kpEst, first.kp]);
      if (data.kpEst) return { kp: data.kpEst.k, src: `NOAA estimated Kp, ${hm(data.kpEst.t)} UTC` };
      if (data.kp) return { kp: data.kp.k, src: `NOAA planetary Kp, ${hm(data.kp.t)}–${hm(data.kp.t + 3 * 3600e3)} UTC` };
      return null;
    },
  };
  /** New rows carried to the nose, and on to the drawn view (the boundaries re-drawn from them). */
  function pushWind() { const w = windSet(); if (stage && stage.scene && stage.scene.setWind && w.t.length) stage.scene.setWind(w); }
  /** The view's clock covers two hours either side of the opening; past its last quarter-hour the page opens afresh
   *  on the new present (only while it is being looked at). */
  function recenter() {
    if (document.visibilityState !== "hidden" && Date.now() > T0 + (SPAN - 15 * 60) * 1000) location.reload();
  }
  window.addEventListener("hso-ready", () => {
    stage = window.HSO_STAGE || null;
    pushWind();
    render();
  });
  window.addEventListener("hso-failed", () => { failed = true; render(); });

  // ───────────────────────── the bar and the rail follow the clock ─────────────────────────
  function tickClock() {
    const now = Date.now();
    const rd = $("#rail-day"), ry = $("#rail-year"), rh = $("#rail-hm");
    if (rd) { const d = new Date(now); rd.textContent = `${M[d.getUTCMonth()]} ${d.getUTCDate()}`; ry.textContent = d.getUTCFullYear(); rh.textContent = hm(now); }
    // The bar's year, month and day and its time follow the clock until the visitor starts to change them
    // (app-page.js's HSO_showNow decides, and keeps the three date fields and the calendar's copy together).
    const date = $("#live-date"), time = $("#live-time");
    if (window.HSO_showNow) window.HSO_showNow(now);
    else if (date && time && document.activeElement !== date && document.activeElement !== time && !time.dataset.edited) {
      date.value = new Date(now).toISOString().slice(0, 10); time.value = hm(now);
    }
    document.title = `Helios Live · Now · ${hm(now)} UTC`;
    recenter();
  }

  // ───────────────────────── the Now panel ─────────────────────────
  // Laid out after what NOAA SWPC's dashboards lead with (read 2026-11-13: the enthusiasts', satellite and electric-power
  // pages): the NOAA scales now, their 24-hour maximum and the 3-day forecast first, then the alerts in effect, then
  // the solar wind, the magnetopause, Kp with its forecast, Dst and the aurora's power, the Sun's X-rays and the
  // particles at geosynchronous orbit, and SWPC's latest images. Each section folds; the panel can go two columns wide.
  const LS = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } };
  const LSset = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* this visit only */ } };
  open = LS("helios-now-panel", "open") !== "closed";
  let wide = LS("helios-now-wide", "") === "1", imgBox = null, imgBucket = 0;
  const secOpen = { cond: true, alerts: true, wind: true, mp: true, geo: true, sun: true, craft: true, images: false, more: false };
  try { const saved = JSON.parse(LS("helios-now-sections", "{}")); for (const k of Object.keys(secOpen)) if (typeof saved[k] === "boolean") secOpen[k] = saved[k]; } catch (e) { /* the defaults */ }
  /** A folding section: its heading is the handle, and whether it is open is kept in this browser. */
  const sec = (k, title, em, body) => `<details class="np-sec" data-k="${k}"${secOpen[k] ? " open" : ""}><summary class="np-s"><span>${title}</span>${em ? `<em>${em}</em>` : ""}</summary>${body}</details>`;

  // SWPC's latest images, in a section of its own that is built once and moved back in after each redraw, so a redraw
  // never fetches a picture again. Nothing is fetched until the section is opened; then every 15 minutes while it is
  // open and the tab is looked at (the four come to about 1 MB).
  const IMAGES = [
    { k: "sun", label: "Sun · 195 Å", src: "images/animations/suvi/primary/195/latest.png", href: "https://www.swpc.noaa.gov/products/goes-solar-ultraviolet-imager-suvi", alt: "The Sun in extreme ultraviolet, GOES SUVI 195 Å" },
    { k: "c3", label: "Corona · C3", src: "images/animations/lasco-c3/latest.jpg", href: "https://www.swpc.noaa.gov/products/lasco-coronagraph", alt: "The outer corona, SOHO LASCO C3 coronagraph" },
    { k: "aur", label: "Aurora forecast", src: "images/animations/ovation/north/latest.jpg", href: "https://www.swpc.noaa.gov/products/aurora-30-minute-forecast", alt: "OVATION's aurora forecast, northern hemisphere" },
    { k: "enlil", label: "Solar wind forecast · WSA-Enlil", src: "images/animations/enlil/latest.jpg", href: "https://www.swpc.noaa.gov/products/wsa-enlil-solar-wind-prediction", alt: "WSA-Enlil's solar wind prediction", wide: true },
  ];
  function buildImages() {
    const d = document.createElement("details");
    d.className = "np-sec np-img"; d.dataset.k = "images"; d.open = secOpen.images;
    d.innerHTML = `<summary class="np-s"><span>Sun and aurora</span><em>NOAA SWPC's latest images</em></summary><div class="np-imgs">`
      + IMAGES.map(i => `<a class="${i.wide ? "w" : ""}" href="${i.href}" target="_blank" rel="noopener noreferrer" title="${esc(i.alt)}: open NOAA SWPC's page"><img data-k="${i.k}" alt="${esc(i.alt)}" decoding="async"><span>${esc(i.label)}</span></a>`).join("")
      + `</div><p class="np-n">Refreshed every 15 minutes while this is open. Served by NOAA SWPC: GOES SUVI, SOHO LASCO (ESA and NASA), OVATION and WSA-Enlil.</p>`;
    return d;
  }
  function loadImages() {
    if (!imgBox || !open || !secOpen.images || document.visibilityState === "hidden") return;
    const b = Math.floor(Date.now() / (15 * MIN));
    if (b === imgBucket) return;
    imgBucket = b;
    for (const i of IMAGES) { const el = imgBox.querySelector(`img[data-k="${i.k}"]`); if (el) el.src = `${SWPC}/${i.src}?b=${b}`; }
  }
  function build() {
    if (SOLO) return;
    const host = $("#stage-body");
    if (!host) return;
    panel = document.createElement("section");
    panel.className = "now-panel";
    panel.setAttribute("aria-label", "Now: the real-time read-out");
    host.appendChild(panel);
    panel.addEventListener("click", (e) => {
      const b = e.target.closest("[data-now]");
      if (!b) return;
      if (b.dataset.now === "fold") { open = !open; LSset("helios-now-panel", open ? "open" : "closed"); render(); }
      if (b.dataset.now === "wide") { wide = !wide; LSset("helios-now-wide", wide ? "1" : ""); render(); }
      if (b.dataset.now === "follow" && stage && stage.home) stage.home();
    });
    for (const ev of ["pointerdown", "wheel"]) panel.addEventListener(ev, (e) => e.stopPropagation(), { passive: true });
    panel.addEventListener("toggle", (e) => {                  // a section folded or opened by its heading
      const k = e.target.dataset && e.target.dataset.k;
      if (!k || !(k in secOpen) || secOpen[k] === e.target.open) return;
      secOpen[k] = e.target.open; LSset("helios-now-sections", JSON.stringify(secOpen));
      if (k === "images") loadImages();
    }, true);
    imgBox = buildImages();
    render();
  }
  /** A feed's status line: when it was fetched, how old its newest sample is, stale or failed. */
  function feedLine(key) {
    const F = FEEDS[key], s = state[key], now = Date.now();
    let cls = "ok", txt;
    if (!s || (s.loading && !s.fetched)) { cls = "wait"; txt = "fetching…"; }
    else if (!s.fetched) { cls = "bad"; txt = `failed (${esc(s.error || "no answer")}) · retry ${age(now - s.next)}`; }
    else {
      const old = isFinite(s.newest) ? now - s.newest : Infinity;
      if (F.asOf === "fetch") { if (old > F.stale) cls = "stale"; txt = `fetched ${hms(s.fetched)}${old > F.stale ? " · STALE" : ""}`; }
      else if (!isFinite(s.newest)) { cls = "stale"; txt = `fetched ${hms(s.fetched)} · no rows in the last 90 min`; }
      else {
        if (old > F.stale) cls = "stale";
        txt = `fetched ${hms(s.fetched)} · newest ${key === "kp" ? "block ended" : "sample"} ${hm(s.newest)} (${old >= 0 ? `${age(old)} old` : age(-old) + " ahead"})${old > F.stale ? " · STALE" : ""}`;
      }
      if (s.error) { cls = cls === "ok" ? "warn" : cls; txt += ` · last try failed, retry ${age(now - s.next)}`; }
    }
    return `<li class="${cls}"><span>${esc(F.label)}<small>${esc(F.src)}</small></span><b>${txt}</b></li>`;
  }
  // ── the panel's pictures (2026-11-12: "more visual and less number heavy"). SVG built here from numbers computed here;
  //    nothing a feed sent is put in as markup. ──
  const NOAA_COL = ["#5fd08a", "#f6eb14", "#ffc800", "#ff9600", "#ff3b30", "#c80000"];    // scale level 0–5, NOAA's colors
  const scaleColor = (v) => NOAA_COL[Math.max(0, Math.min(5, v ?? 0))];
  /** NOAA's G level for a Kp in thirds: 4.67 (5−) is G1, 8.67 (9−) still G4. */
  const kpG = (k) => (k >= 8.99 ? 5 : k >= 7.66 ? 4 : k >= 6.66 ? 3 : k >= 5.66 ? 2 : k >= 4.66 ? 1 : 0);
  const kpColor = (k) => (!isFinite(k) ? "#6c6c74" : k >= 7 ? "#d11a1a" : k >= 5 ? "#e8720c" : k >= 4 ? "#d9a400" : "#2e9e4f");   // the Kp figure's bands
  /** A small level dot, in the ToolsKit's way of marking a level beside text. */
  const dot = (c, title) => `<i class="np-dot" style="--c:${c}"${title ? ` title="${esc(title)}"` : ""}></i>`;
  /** A NOAA scale level as a pill: plain at level 0, NOAA's color from level 1. */
  const lvPill = (k, v, title) => `<i class="np-lv${v ? " up" : ""}"${v ? ` style="--c:${scaleColor(v)}"` : ""}${title ? ` title="${esc(title)}"` : ""}>${k}${v ?? "–"}</i>`;
  const kpWord = (k) => (!isFinite(k) ? "no Kp" : kpG(k) ? `G${kpG(k)} geomagnetic storm` : k >= 3.66 ? "active" : k >= 2.66 ? "unsettled" : "quiet");
  // ── the figures (2026-11-15): drawn by the data windows' own renderer (hso.js's HSO_FIGURE), white with black axes,
  //    tick marks inside the frame and the legend to the right, as every figure in Helios is. Each is a node built once
  //    and put back after a redraw of the panel, so a redraw neither flickers it nor loses its drawing. ──
  const BZ_BANDS = [[-1e9, "#d90d0d"], [0, "#000000"]];      // B_z drawn red where it is southward
  const LVL = ["#d9a400", "#e8720c", "#d11a1a"];              // guide colors for levels 1–3, as the Kp bands
  const NOW_COL = "#2e9e4f";
  const figs = {};
  /** The figure for slot k, made on first use; null until hso.js has loaded. */
  function figNode(k) {
    const K = window.HSO_FIGURE;
    if (!K) return null;
    if (!figs[k]) {
      const el = document.createElement("div");
      el.className = `np-fig np-fig-${k}`;
      if (k === "mp") {
        el.innerHTML = '<canvas class="np-fc" role="img" aria-label="The dayside: the magnetopause, the bow shock and geosynchronous orbit"></canvas>';
        const cv = el.firstChild, F = figs[k] = { el, o: null, draw: (o) => { if (o) F.o = o; mpFigure(cv, F.o); } };
        new ResizeObserver(() => F.draw()).observe(el);
      } else {
        const f = K.figure(el);
        figs[k] = { el, draw: (spec) => f.draw(spec) };
      }
    }
    return figs[k];
  }
  const figSlot = (k) => `<div class="np-slot np-slot-${k}" data-fig="${k}"></div>`;
  window.addEventListener("hso-figure", () => render());
  /** A value over its name, with its unit and a word for it. */
  const val = (label, value, unit, word, cls = "") => `<p class="np-v ${cls}"><span>${label}</span><b>${value}</b><small>${unit}</small>${word ? `<em>${word}</em>` : ""}</p>`;
  /** The solar wind against the time it reaches the bow-shock nose, from two hours ago to the newest minute still on its
   *  way from L1: what has arrived in black, what is on its way in gray, a line at now; B_z red where southward. */
  function windSpec(now) {
    const a = now - 2 * 3600e3, list = [...rows.values()].filter(r => isFinite(r.arr) && r.arr >= a - 5 * MIN).sort((p, q) => p.arr - q.arr);
    const b = Math.max(now + 5 * MIN, list.length ? list[list.length - 1].arr : now);
    const split = (key) => {
      const past = [], ahead = [];
      for (const r of list) if (isFinite(r[key])) (r.arr <= now ? past : ahead).push({ t: r.arr, v: r[key] });
      if (past.length && ahead.length) ahead.unshift(past[past.length - 1]);   // the gray line goes on from the black
      return [past, ahead];
    };
    const row = (key, title, label, unit, more = {}) => {
      const [p, q] = split(key);
      return Object.assign({ key: `nw_${key}`, title, label, short: label, unit,
        lines: [Object.assign({ color: "#000000", label, data: p }, more.line), { color: "#9a9ca3", label: "ahead", data: q }] }, more.row);
    };
    return { a, b, marks: [{ t: now, color: NOW_COL, label: "now" }],
             rows: [row("v", "Flow speed", "V", "(km/s)"), row("n", "Proton density", "N_{p}", "(cm⁻³)"),
                    row("bz", "IMF Bz (GSM)", "B_{z}", "(nT)", { row: { zero: true }, line: { bands: BZ_BANDS } })] };
  }
  /** Kp over the last two days and NOAA's forecast past now (3-hour steps; observed colored by the G scale as Helios's
   *  indices window colors Kp, the forecast gray), Dst, and OVATION's hemispheric power at its forecast times. */
  function geoSpec(now) {
    const K = window.HSO_FIGURE, H3 = 3 * 3600e3, a = now - 48 * 3600e3;
    const steps = (blocks) => {
      const out = [];
      for (const k of blocks) { for (let t = k.a; t < k.b; t += 5 * MIN) out.push({ t, v: k.k }); out.push({ t: k.b - 1000, v: k.k }); }
      return out;
    };
    const obs = (data.kpHist || []).map(k => ({ a: Math.max(k.t, a), b: Math.min(k.t + H3, now), k: k.k })).filter(k => k.b > k.a);
    const lastEnd = obs.length ? obs[obs.length - 1].b : a;
    if (data.kpEst && now - lastEnd > MIN) obs.push({ a: lastEnd, b: now, k: data.kpEst.k });   // NOAA's 1-minute estimate since the last block
    const fc = (data.kpFc || []).filter(k => k.t + H3 > now).map(k => ({ a: Math.max(k.t, now), b: k.t + H3, k: k.k }));
    const b = Math.min(now + 72 * 3600e3, Math.max(now + 6 * 3600e3, fc.length ? fc[fc.length - 1].b : now));
    const hp = (data.hpS || []).filter(q => q.t >= a);
    return { a, b, marks: [{ t: now, color: NOW_COL, label: "now" }], rows: [
      { key: "nw_kp", title: "Kp", label: "Kp", short: "Kp", unit: "", yRange: [0, 9],
        lines: [{ color: "#000000", label: "Kp", data: steps(obs), bands: K.KP_BANDS }, { color: "#8a8c94", label: "forecast", data: steps(fc) }] },
      { key: "nw_dst", title: "Dst", label: "Dst", short: "Dst", unit: "(nT)", zero: true, guides: [[-50, LVL[1], "−50"], [-100, LVL[2], "−100"]],
        lines: [{ color: K.COL.x, label: "Dst", data: (data.dst || []).filter(q => q.t >= a - 3600e3) }] },
      { key: "nw_hp", title: "Aurora power", label: "Aurora", short: "HP", unit: "(GW)",
        lines: [{ color: K.COL.x, label: "N", data: hp.map(q => ({ t: q.t, v: q.n })) }, { color: K.COL.z, label: "S", data: hp.map(q => ({ t: q.t, v: q.s })) }] },
    ] };
  }
  /** GOES's X-rays (both bands, the flare classes marked) and its ≥10 MeV protons and ≥2 MeV electrons over six hours,
   *  NOAA's levels marked: SWPC's "overview" plot, drawn as Helios draws a GOES window. */
  function sunSpec(now) {
    const K = window.HSO_FIGURE, a = now - 6 * 3600e3, inW = (pts) => (pts || []).filter(q => q.t >= a - 10 * MIN);
    /** A log axis from a whole decade under the data to a little over its top, reaching at least minHi (so a NOAA level
     *  shows with room for its label) and `span` decades tall. A level at the frame's edge would label the row above. */
    const decades = (pts, minHi, span) => {
      const v = inW(pts).map(q => q.v).filter(x => x > 0);
      if (!v.length) return null;
      const hi = Math.max(Math.log10(Math.max(...v)) + 0.35, minHi);
      return [Math.min(Math.floor(Math.log10(Math.min(...v)) + 1e-9), Math.floor(hi - span)), hi];
    };
    return { a, b: now, rows: [
      { key: "nw_x", title: "X-rays (XRS)", label: "X-rays", short: "X-rays", unit: "(W/m²)", log: true, yRange: [-9, -3],
        guides: [[-6, "#008000", "C"], [-5, "#ff9900", "M"], [-4, "#d90d0d", "X"]],
        lines: [{ color: K.COL.x, label: "1–8 Å", data: inW(data.xray) }, { color: K.COL.z, label: "0.5–4 Å", data: inW(data.xrayS) }] },
      { key: "nw_p", title: "Protons ≥10 MeV", label: "p^{+} ≥10 MeV", short: "p^{+}", unit: "(pfu)", log: true, yRange: decades(data.prot, 1.5, 2.5),
        guides: [[1, LVL[0], "S1"], [2, LVL[1], "S2"], [3, LVL[2], "S3"]], lines: [{ color: "#000000", label: "≥10 MeV", data: inW(data.prot) }] },
      { key: "nw_e", title: "Electrons ≥2 MeV", label: "e^{−} ≥2 MeV", short: "e^{−}", unit: "(pfu)", log: true, yRange: decades(data.elec, 3.5, 2.5),
        guides: [[3, LVL[1], "alert"]], lines: [{ color: "#000000", label: "≥2 MeV", data: inW(data.elec) }] },
    ] };
  }
  /** The dayside in the ecliptic (GSE X and Y, R_E, the Sun to the left), as a Helios figure: geosynchronous orbit
   *  (dashed), the Shue et al. (1998) magnetopause for the wind reaching Earth (solid; red inside GEO) and for the
   *  newest L1 minute (dashed), the Jelínek et al. (2012) bow shock (dotted), CCMC's SWMF standoff (a violet tick on
   *  the Sun–Earth line) and Earth, its night side dark. */
  function mpFigure(cv, o) {
    const K = window.HSO_FIGURE;
    if (!K || !o || !cv.clientWidth) return;
    const { ctx, w, h } = K.sizeCanvas(cv), rich = K.rich, C = K.COL;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
    const L = 30, R = 5, T = 5, B = 27, pw = w - L - R, ph = h - T - B, X0 = 22, X1 = -6, k = pw / (X0 - X1), Yh = ph / 2 / k;
    const px = (x) => L + (X0 - x) * k, py = (y) => T + ph / 2 - y * k;
    const alpha = (bz, q) => Math.max((0.58 - 0.007 * bz) * (1 + 0.024 * Math.log(q)), 0.05);
    const shue = (r0, al) => (t) => r0 * Math.pow(2 / (1 + Math.cos(t)), al);
    const bow = (Rb) => (t) => { const c = Math.cos(t), sn = Math.sin(t), d = c + Math.sqrt(c * c + 1.17 * 1.17 * sn * sn); return d > 1e-6 ? 2 * Rb / d : NaN; };
    const curve = (rOf, color, width, dash) => {
      ctx.beginPath();
      let on = false;
      for (let th = -170; th <= 170; th += 2) {
        const t = th * Math.PI / 180, r = rOf(t);
        if (!isFinite(r) || r > 80) { on = false; continue; }
        const x = px(r * Math.cos(t)), y = py(r * Math.sin(t));
        if (on) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        on = true;
      }
      ctx.save(); ctx.setLineDash(dash || []); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke(); ctx.restore();
    };
    ctx.save(); ctx.beginPath(); ctx.rect(L, T, pw, ph); ctx.clip();
    ctx.save(); ctx.setLineDash([2, 3]); ctx.strokeStyle = "rgba(0,0,0,0.45)"; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.arc(px(0), py(0), GEO_RE * k, 0, 2 * Math.PI); ctx.stroke(); ctx.restore();
    if (isFinite(o.RB)) curve(bow(o.RB), "#008000", 1.1, [1.5, 2.5]);
    if (isFinite(o.R0L)) curve(shue(o.R0L, alpha(o.bzL, o.pL)), o.R0L < GEO_RE ? "rgba(217,13,13,0.6)" : "rgba(0,26,242,0.55)", 1, [4, 3]);
    if (isFinite(o.R0)) curve(shue(o.R0, alpha(o.bz, o.p)), o.R0 < GEO_RE ? C.z : C.x, 1.6);
    if (isFinite(o.swmf)) { const x = px(o.swmf); ctx.strokeStyle = "#7f33b3"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, py(0) - 5); ctx.lineTo(x, py(0) + 5); ctx.stroke(); }
    const er = Math.max(2.5, k), ex = px(0), ey = py(0);
    ctx.beginPath(); ctx.arc(ex, ey, er, 0, 2 * Math.PI); ctx.fillStyle = "#fff"; ctx.fill();
    ctx.beginPath(); ctx.arc(ex, ey, er, -Math.PI / 2, Math.PI / 2); ctx.closePath(); ctx.fillStyle = "#000"; ctx.fill();   // the night side, away from the Sun
    ctx.beginPath(); ctx.arc(ex, ey, er, 0, 2 * Math.PI); ctx.strokeStyle = "#000"; ctx.lineWidth = 0.8; ctx.stroke();
    rich(ctx, "← Sun", L + 4, ey - 9, { size: 9, color: "#000" });   // on the Sun–Earth line, sunward of the bow shock
    rich(ctx, "GEO", ex, ey + GEO_RE * k + 7, { size: 8, align: "center", color: "rgba(0,0,0,0.55)" });
    ctx.restore();
    // the frame and the axes, as Helios draws them: ticks inside the frame, numbers outside
    ctx.strokeStyle = "#000"; ctx.lineWidth = 1; ctx.strokeRect(L + 0.5, T + 0.5, pw, ph);
    ctx.fillStyle = "#000";
    const num = (v) => String(v).replace("-", "−");
    for (let x = 20; x >= X1; x -= 5) { const X = px(x); ctx.fillRect(X - 0.3, T + ph - 3, 0.6, 3); rich(ctx, num(x), X, T + ph + 9, { size: 9, align: "center", color: "#000" }); }
    for (let y = -Math.floor(Yh / 5) * 5; y <= Yh; y += 5) { const Y = py(y); ctx.fillRect(L, Y - 0.3, 3, 0.6); rich(ctx, num(y), L - 3, Y, { size: 9, align: "right", color: "#000" }); }
    rich(ctx, "X_{GSE} (R_{E})", L + pw / 2, h - 6, { size: 9, align: "center", color: "#000" });
    ctx.save(); ctx.translate(8, T + ph / 2); ctx.rotate(-Math.PI / 2); rich(ctx, "Y_{GSE} (R_{E})", 0, 0, { size: 9, align: "center", color: "#000" }); ctx.restore();
  }
  /** ok / warn / stale / bad / wait, as each feed's status line. */
  function feedClass(key) {
    const F = FEEDS[key], s = state[key], now = Date.now();
    if (!s || (s.loading && !s.fetched)) return "wait";
    if (!s.fetched) return "bad";
    if (!isFinite(s.newest) || now - s.newest > F.stale) return "stale";
    return s.error ? "warn" : "ok";
  }
  const sw2 = (sw) => (sw ? ` CCMC's real-time SWMF run (a model): last closed field line at noon ${f(sw.noon, 1)} R<sub>E</sub>, closest ${f(sw.min, 1)} R<sub>E</sub> at ${f(sw.lt, 1)} h LT, model time ${hm(sw.t)} UTC${data.swmfAhead ? ` (run reached ${hm(data.swmfAhead)})` : ""}.` : "");
  // ── the pictures added 2026-11-13 ──
  const SCALE_NAME = { R: "Radio blackouts", S: "Solar radiation storms", G: "Geomagnetic storms" };
  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dayHm = (ms) => `${day(ms)} ${hm(ms)}`;
  /** The NOAA scales as SWPC's dashboards head every page: now, the last 24 hours' highest, and the forecast for
   *  today and the two days after (the chance of an R1–R2 blackout and of an S1 or stronger proton event, and the
   *  geomagnetic storm level expected). */
  function condGrid(sc) {
    const s = state.scales;
    if (!sc) return `<p class="np-n${s && s.fetched === undefined && !s.loading ? " bad" : ""}">${s && s.loading ? "Fetching NOAA's scales…" : "NOAA's scales did not load."}</p>`;
    const lv = (k, v, what) => lvPill(k, v, `${SCALE_NAME[k]}, ${what}: ${k}${v ?? "–"}`);
    const pct = (p, title) => `<i class="np-pc" title="${title}">${p === null ? "–" : `${p}%`}</i>`;
    const fc = sc.fc || [], gap = `<span class="gap"></span>`;
    let g = `<div class="np-cond" style="--n:${fc.length}"><span></span><span class="hd">Now</span><span class="hd" title="The highest in the last 24 hours">24 h</span>${gap}`
      + fc.map((d, i) => `<span class="hd" title="NOAA's forecast for ${day(d.t)}">${i ? DOW[new Date(d.t).getUTCDay()] : "Today"}</span>`).join("");
    g += `<span class="lb" title="${SCALE_NAME.R}, from the X-rays of solar flares">Radio</span>${lv("R", sc.now.R, "now")}${lv("R", sc.max ? sc.max.R : null, "the last 24 hours' highest")}${gap}`
      + fc.map(d => pct(d.rMinor, `${day(d.t)}: ${d.rMinor ?? "–"} % chance of R1–R2 (an M-class flare), ${d.rMajor ?? "–"} % of R3 or more (X-class)`)).join("");
    g += `<span class="lb" title="${SCALE_NAME.S}, from energetic protons">Radiation</span>${lv("S", sc.now.S, "now")}${lv("S", sc.max ? sc.max.S : null, "the last 24 hours' highest")}${gap}`
      + fc.map(d => pct(d.s, `${day(d.t)}: ${d.s ?? "–"} % chance of S1 or more (a solar proton event)`)).join("");
    g += `<span class="lb" title="${SCALE_NAME.G}, from Kp">Geomagnetic</span>${lv("G", sc.now.G, "now")}${lv("G", sc.max ? sc.max.G : null, "the last 24 hours' highest")}${gap}`
      + fc.map(d => lv("G", d.g, `forecast for ${day(d.t)}`)).join("") + `</div>`;
    return g + (fc.length ? `<p class="np-key">Forecast: the chance of R1–R2 and of S1 or more, and the G level expected</p>` : "");
  }
  const ALERT_TAG = { warning: "Warning", watch: "Watch", alert: "Alert", summary: "Summary" };
  function alertsBlock(now) {
    const s = state.alerts, list = data.alerts;
    if (!list) return `<p class="np-n${s && !s.loading ? " bad" : ""}">${s && !s.loading ? "NOAA's alerts did not load." : "Fetching NOAA's alerts…"}</p>`;
    const link = `<a href="https://www.swpc.noaa.gov/products/alerts-watches-and-warnings" target="_blank" rel="noopener noreferrer">NOAA SWPC's alerts page</a>`;
    if (!list.length) return `<p class="np-n">No watch or warning in effect, and no alert in the last 24 hours. ${link}</p>`;
    return `<ul class="np-al">${list.slice(0, 4).map(a => `<li class="${a.kind}"><b>${ALERT_TAG[a.kind]}</b><span>${esc(a.text)}<small>${
      a.kind === "warning" && isFinite(a.until) ? `in effect until ${dayHm(a.until)} UTC` : a.kind === "watch" && a.days ? esc(a.days) : `issued ${age(now - a.issued)} ago`}</small></span></li>`).join("")}</ul>`
      + `<p class="np-n">${list.length > 4 ? `${list.length - 4} more on ` : ""}${link}</p>`;
  }
  const last = (a) => (a && a.length ? a[a.length - 1] : null);
  /** A flux in W/m² as a flare class, and NOAA's R level for it (M1 is R1, M5 R2, X1 R3, X10 R4, X20 R5). */
  const xrayClass = (fx) => { if (!(fx > 0)) return "—"; const [c, b] = fx >= 1e-4 ? ["X", 1e-4] : fx >= 1e-5 ? ["M", 1e-5] : fx >= 1e-6 ? ["C", 1e-6] : fx >= 1e-7 ? ["B", 1e-7] : ["A", 1e-8]; return `${c}${(fx / b).toFixed(1)}`; };
  const xrayR = (fx) => (fx >= 2e-3 ? 5 : fx >= 1e-3 ? 4 : fx >= 1e-4 ? 3 : fx >= 5e-5 ? 2 : fx >= 1e-5 ? 1 : 0);
  const protS = (v) => (v >= 1e5 ? 5 : v >= 1e4 ? 4 : v >= 1e3 ? 3 : v >= 100 ? 2 : v >= 10 ? 1 : 0);
  /** The newest X-ray class, ≥10 MeV protons and ≥2 MeV electrons, each with NOAA's level for it. */
  function sunVals(now) {
    const x = last(data.xray), p = last(data.prot), e = last(data.elec), fl = data.flare;
    if (!x && !p && !e) return `<p class="np-n">${["xray", "prot", "elec"].some(k => state[k] && state[k].loading) ? "Fetching GOES's X-rays and particles…" : "GOES's X-rays and particles did not load."}</p>`;
    let h = `<div class="np-vals">`;
    if (x) { const cls = fl && fl.now && now - fl.t < STALE ? fl.now : xrayClass(x.v), r = xrayR(x.v); h += val("X-rays", esc(cls), "", r ? `${lvPill("R", r, `${SCALE_NAME.R}: R${r}`)} radio blackout` : "class now"); }
    else h += val("X-rays", "—", "", "");
    if (p) { const sL = protS(p.v); h += val("Protons ≥10 MeV", f(p.v, p.v < 10 ? 2 : 0), "pfu", sL ? `${lvPill("S", sL, `${SCALE_NAME.S}: S${sL}`)} radiation storm` : "background"); }
    else h += val("Protons ≥10 MeV", "—", "", "");
    if (e) { const hot = e.v >= 1000; h += val("Electrons ≥2 MeV", Math.round(e.v).toLocaleString("en-US"), "pfu", hot ? `${dot("#ffc44d", "Above NOAA's alert level of 1,000 pfu")}above alert level` : "below alert level"); }
    else h += val("Electrons ≥2 MeV", "—", "", "");
    h += `</div>`;
    if (fl && fl.max && isFinite(fl.maxT) && now - fl.maxT < 24 * 3600e3) h += `<p class="np-sub">Latest flare ${esc(fl.max)}, peaking ${hm(fl.maxT)} UTC</p>`;
    return h;
  }
  /** Dst and the aurora's power now, in words. */
  function geoLine() {
    const d = last(data.dst), hp = data.hp, bits = [];
    if (d) bits.push(`Dst <b>${sg(d.v, 0)}</b> nT, ${d.v > -30 ? "quiet" : d.v > -50 ? "weak storm" : d.v > -100 ? "moderate storm" : d.v > -250 ? "intense storm" : "extreme storm"}`);
    if (hp) bits.push(`<span title="OVATION's hemispheric power, forecast for ${hm(hp.tf)} UTC from the wind measured at ${hm(hp.t)}">aurora <b>${f(hp.n, 0)}</b> GW north, <b>${f(hp.s, 0)}</b> south</span>`);
    return bits.length ? `<p class="np-sub np-gl">${bits.join(" · ")}</p>` : "";
  }

  function render() {
    if (!panel) return;
    const now = Date.now(), st = state.rtsw, fresh = (k) => state[k] && state[k].fetched && isFinite(state[k].newest) && now - state[k].newest <= FEEDS[k].stale;
    const nose = atNose(now), lastRow = newestRow(), view = stage && stage.scene && stage.scene.boundaryAt ? stage.scene.boundaryAt((now - T0) / 1000) : null;
    const scrubbed = stage && stage.scrubbed, sc = data.scales;
    // the header: the clock, and the three scales now, which stay in sight when the panel is folded
    const chips = sc ? ["R", "S", "G"].map(k => lvPill(k, sc.now[k], `${SCALE_NAME[k]} now: ${k}${sc.now[k] ?? "–"}`)).join("") : "";
    const head = `<div class="np-h"><b>NOW</b><span>${day(now)} · ${hm(now)} UTC</span>`
      + (scrubbed ? '<button data-now="follow" class="np-follow" title="The view was moved off the present: back to it">Back to now</button>' : '<i class="np-live" title="The view follows the clock"></i>')
      + `<span class="np-chips">${chips}</span>`
      + (open ? `<button data-now="wide" class="np-fold" aria-pressed="${wide}" title="${wide ? "One column" : "Two columns, side by side"}"><svg viewBox="0 0 14 14" aria-hidden="true"><rect x="1.5" y="2.5" width="4.5" height="9" rx="1"/><rect x="8" y="2.5" width="4.5" height="9" rx="1"${wide ? "" : ' opacity="0.35"'}/></svg></button>` : "")
      + `<button data-now="fold" class="np-fold" aria-expanded="${open}" title="${open ? "Fold the panel" : "Open the panel"}">${open ? "–" : "+"}</button></div>`;
    panel.classList.toggle("wide", wide && open);
    // Folded, the panel is its header alone. What is drawn is recorded either way: a reopened panel compared itself with
    // the last open drawing, found it unchanged, and stayed a header with a "+" (user report, 2026-11-12).
    if (!open) { if (panel.dataset.html !== head) { panel.innerHTML = head; panel.dataset.html = head; } panel.classList.add("folded"); return; }
    panel.classList.remove("folded");
    let h = head;
    const swOK = fresh("rtsw"), bad = [];
    // ── what must not be missed: stale or missing wind, a boundary held on an old sample ──
    if (lastRow && !swOK) bad.push(`Solar wind is stale: the newest L1 sample is ${age(now - lastRow.t)} old.`);
    if (nose && nose.row.arr + 30e3 < now - 10 * MIN) bad.push(`No measured wind has reached Earth since ${hm(nose.row.arr)} UTC: the boundaries hold that sample.`);
    for (const b of bad) h += `<p class="np-warn">${b}</p>`;
    h += `<div class="np-body">`;

    // ── the NOAA scales: now, the last day's highest, and the forecast ──
    h += sec("cond", "Conditions", "NOAA scales · now and the outlook", condGrid(sc));
    const nAl = data.alerts ? data.alerts.length : 0;
    h += sec("alerts", "Alerts", data.alerts ? (nAl ? `${nAl} in effect or new · NOAA SWPC` : "none in effect") : "NOAA SWPC", alertsBlock(now));

    // ── the solar wind reaching Earth: three trend lines, arrived (solid) and still on its way from L1 (dashed) ──
    const lag = lastRow && isFinite(lastRow.arr) ? (lastRow.arr - lastRow.t) / 60e3 : NaN;
    let w;
    if (!nose || !lastRow) {
      w = `<p class="np-n bad">${st && st.loading && !st.fetched ? "Fetching NOAA SWPC's real-time solar wind…" : "No real-time solar wind: the boundaries are drawn for Helios's default (2 nPa, B<sub>z</sub> 0)."}</p>`;
    } else {
      const speedWord = nose.v >= 600 ? "fast" : nose.v >= 450 ? "moderate" : "slow";
      const bzWord = !isFinite(nose.bz) ? "" : nose.bz < -0.5 ? "southward" : nose.bz > 0.5 ? "northward" : "near zero";
      w = `<div class="np-vals">${val("Speed", f(nose.v, 0), "km/s", speedWord)}${val("Density", f(nose.n, 1), "cm⁻³", "")}`
        + `${val("IMF B<sub>z</sub>", sg(nose.bz, 1), "nT", nose.bz < -0.5 ? `${dot("#d90d0d", "Southward: red in the figure")}${bzWord}` : bzWord)}</div>${figSlot("wind")}`
        + `<p class="np-key">Black: arrived at Earth · gray: on its way from L1 · B<sub>z</sub> red when southward</p>`;
    }
    h += sec("wind", "Solar wind", `<span title="Measured at L1 by ${esc(activeSrc || "the active monitor")}, via NOAA SWPC">reaching Earth${isFinite(lag) ? ` · ${f(lag, 0)} min from L1` : ""}</span>`, w);

    // ── the magnetopause: the dayside as a figure, and the standoff ──
    let mpArgs = null;
    if (nose && lastRow) {
      const dpN = flowPressure(nose.n, nose.v), dpL = flowPressure(lastRow.n, lastRow.v);
      const bzN = isFinite(nose.bz) ? nose.bz : 0, bzL = isFinite(lastRow.bz) ? lastRow.bz : 0;
      const pN = isFinite(dpN) ? Math.max(dpN, 0.01) : NaN, pL = isFinite(dpL) ? Math.max(dpL, 0.01) : NaN;
      const R0 = isFinite(pN) ? shueR0(pN, bzN) : NaN, R0L = isFinite(pL) ? shueR0(pL, bzL) : NaN, RB = isFinite(pN) ? jelinekR0(pN) : NaN;
      const inside = R0 < GEO_RE, insideL = R0L < GEO_RE, sw = data.swmf;
      mpArgs = { R0, p: pN, bz: bzN, R0L, pL, bzL, RB, swmf: sw ? sw.noon : NaN };
      h += sec("mp", "Magnetopause", "model, for the wind reaching Earth", `<div class="np-mp">${figSlot("mp")}<div>`
        + `<p class="np-r0"><b>${f(R0, 1)}</b> R<sub>E</sub></p><p class="np-sub">standoff · Shue et al. 1998</p>`
        + (inside ? `<p class="np-caution"><b>Inside geosynchronous orbit</b>GEO satellites may be in the magnetosheath</p>` : `<p class="np-good"><i>✓</i>Outside geosynchronous orbit</p>`)
        + (isFinite(R0L) ? `<p class="np-sub"><i class="k dash"></i>${f(R0L, 1)} R<sub>E</sub> by ${hm(lastRow.arr)}${insideL ? " · inside GEO" : ""}</p>` : "")
        + (sw ? `<p class="np-sub"><i class="k tick"></i>SWMF model ${f(sw.noon, 1)} R<sub>E</sub>${fresh("swmf") ? "" : " · stale"}</p>` : "")
        + `</div></div>`);
    }

    // ── geomagnetic activity: Kp past and forecast, Dst, and the aurora's power ──
    const kp = data.kp, ke = data.kpEst, kNow = ke ? ke.k : kp ? kp.k : NaN;
    const ahead = (data.kpFc || []).filter(b => b.t > now && b.t < now + 48 * 3600e3);          // blocks still to begin
    const peak = ahead.reduce((m, b) => (!m || b.k > m.k ? b : m), null);
    h += sec("geo", "Geomagnetic activity", "Kp · Dst · aurora",
      `<div class="np-kph"><p class="np-kpv"><b>${kpThirds(kNow).replace(/o$/, "")}</b> Kp</p><p class="np-sub">${dot(kpColor(kNow))}${esc(kpWord(kNow))}${ke ? " · estimated now" : ""}${fresh("kpEst") || fresh("kp") ? "" : " · stale"}</p>`
      + (peak ? `<p class="np-sub pk">forecast peak ${dot(kpColor(peak.k))}<b>Kp ${kpThirds(peak.k).replace(/o$/, "")}</b>${kpG(peak.k) ? ` (G${kpG(peak.k)})` : ""} in the next 2 days · ${DOW[new Date(peak.t).getUTCDay()]} ${hm(peak.t)} UTC</p>` : "") + `</div>`
      + geoLine() + figSlot("geo")
      + `<p class="np-key">Kp colored by the G scale (green, yellow, orange G1, red G3) · gray: NOAA's forecast · aurora power is OVATION's, at the time it forecasts</p>`);

    // ── the Sun's X-rays and the particles at geosynchronous orbit ──
    h += sec("sun", "Sun and radiation", `GOES${data.f107 ? ` · F10.7 ${f(data.f107.v, 0)} sfu` : ""}`,
      sunVals(now) + (last(data.xray) || last(data.prot) || last(data.elec) ? figSlot("sun") + `<p class="np-key">GOES at geosynchronous orbit, last 6 h · 1 pfu = 1 particle/(cm² s sr) · S1–S3: NOAA's radiation storm levels</p>` : ""));

    // ── the spacecraft, grouped by the model's region ──
    let cr;
    if (!stage || !stage.scene || !stage.scene.regionsAt) cr = `<p class="np-n">${failed ? "The positions could not be loaded." : "Waiting for the positions…"}</p>`;
    else {
      const groups = new Map();
      for (const c of stage.scene.regionsAt((now - T0) / 1000)) {
        if (!groups.has(c.region)) groups.set(c.region, { color: c.color, list: [] });
        groups.get(c.region).list.push(c);
      }
      cr = `<ul class="np-reg">${[...groups].map(([reg, g]) => `<li><span class="np-rn"><i style="--c:${esc(g.color)}"></i>${esc(reg)}</span><span class="np-rc">${g.list.map(c => `<i title="${esc(c.name)}: ${f(c.r, c.r >= 100 ? 0 : c.r < 2 ? 2 : 1)} R_E from Earth">${esc(c.name)}</i>`).join("")}</span></li>`).join("")}</ul>`;
    }
    h += sec("craft", "Spacecraft", "model regions", cr);

    // ── the numbers and the feeds, folded away: a dot per feed, and the details behind them ──
    const dots = Object.keys(FEEDS).map(k => `<i class="${feedClass(k)}" title="${esc(FEEDS[k].label)}"></i>`).join("");
    const nBad = Object.keys(FEEDS).filter(k => ["bad", "stale"].includes(feedClass(k))).length;
    let m = "";
    if (nose && lastRow) {
      const dpN = flowPressure(nose.n, nose.v), dpL = flowPressure(lastRow.n, lastRow.v);
      const row = (k, a, b) => `<tr><th>${k}</th><td>${a}</td><td>${b}</td></tr>`;
      m += `<table class="np-t"><thead><tr><th></th><td>Reaching Earth</td><td>Newest at L1</td></tr></thead><tbody>`
        + row("Measured at L1", `${hm(nose.row.t)}`, `${hm(lastRow.t)}`) + row("Reaches the nose", `${hm(nose.row.arr)}`, isFinite(lastRow.arr) ? `${hm(lastRow.arr)}` : "—")
        + row("Speed, km/s", f(nose.v, 0), f(lastRow.v, 0)) + row("Density, cm⁻³", f(nose.n, 2), f(lastRow.n, 2)) + row("Pressure, nPa", f(dpN, 2), f(dpL, 2))
        + row("B<sub>z</sub> GSM, nT", sg(nose.bz, 1), sg(lastRow.bz, 1)) + row("B<sub>t</sub>, nT", f(nose.bt, 1), f(lastRow.bt, 1)) + `</tbody></table>`;
      m += `<p class="np-n">Each L1 minute is carried to the bow-shock nose (Jelínek et al. 2012, ${f(lastRow.rbs, 1)} R<sub>E</sub>) as a flat front along GSE X at its measured V<sub>x</sub>, ${lastRow.how === "eph" ? `from X = ${f(lastRow.xL1, 0)} R<sub>E</sub> (SWPC's position)` : "from SWPC's propagation to 32 R<sub>E</sub>"}.${isFinite(lastRow.tSwpc) ? ` SWPC's own propagation reaches 32 R<sub>E</sub> at ${hm(lastRow.tSwpc)}.` : ""}${view ? ` The drawn surface (Lin et al. 2010) has its nose at ${f(view.linR0, 1)} R<sub>E</sub>.` : ""}</p>`;
    }
    if (kp) m += `<p class="np-n">Kp, 3-hour: ${f(kp.k, 2)} for ${hm(kp.t)}–${hm(kp.t + 3 * 3600e3)} UTC${isFinite(kp.n) ? ` (${kp.n} stations)` : ""}${ke ? `; estimated ${f(ke.k, 2)} at ${hm(ke.t)} UTC` : ""}.${sw2(data.swmf)}</p>`;
    {
      const x = last(data.xray), p = last(data.prot), e = last(data.elec), d = last(data.dst), hp = data.hp, bits = [];
      if (x) bits.push(`X-rays (0.1–0.8 nm) ${x.v.toExponential(1)} W/m² at ${hm(x.t)}`);
      if (p) bits.push(`protons ≥10 MeV ${f(p.v, 2)} pfu`);
      if (e) bits.push(`electrons ≥2 MeV ${Math.round(e.v).toLocaleString("en-US")} pfu (NOAA's alert level is 1,000)`);
      if (bits.length) m += `<p class="np-n">GOES, the primary satellite: ${bits.join("; ")}.</p>`;
      const more = [];
      if (d) more.push(`Dst ${sg(d.v, 0)} nT for ${hm(d.t)} UTC (WDC Kyoto's quick-look value, provisional)`);
      if (hp) more.push(`aurora power ${f(hp.n, 0)} GW north and ${f(hp.s, 0)} GW south, OVATION's forecast for ${hm(hp.tf)} UTC`);
      if (data.f107) more.push(`F10.7 ${f(data.f107.v, 0)} sfu`);
      if (more.length) m += `<p class="np-n">${more.join("; ")}.</p>`;
    }
    if (stage && stage.S) {
      const miss = stage.S.nowMissing || [];
      m += `<p class="np-n">Positions are SSCWeb's ephemeris, for the present the missions' predicted orbits.${miss.length ? ` No position for the present: ${miss.map(esc).join(", ")}.` : ""} ${stage.S.kpSrcNow ? `Field lines and the oval use Kp ${f(stage.S.kp, 2)} (${esc(stage.S.kpSrcNow)}, set when the page opened).` : `Field lines and the oval use Kp ${f(stage.S.kp, 1)}, Helios's assumed value: NOAA's Kp did not load.`}</p>`;
    }
    m += `<ul class="np-a"><li class="n">No MMS science data in real time: Level 2 files reach the archives weeks after the day.</li><li class="n">GOES, SDO, SOLAR-1 and IMAP windows open in real time; THEMIS, Cluster, ACE, Wind, DSCOVR and OMNI follow by days to weeks, so pick a past moment for them.</li></ul>`;
    m += `<p class="np-h4">Feeds <em>${document.visibilityState === "hidden" ? "paused while the tab is hidden" : "refreshed while this tab is open"}</em></p><ul class="np-f">${Object.keys(FEEDS).map(feedLine).join("")}</ul>`;
    h += sec("more", "Numbers and sources", `<span class="np-dots">${dots}</span>${nBad ? `${nBad} feed${nBad > 1 ? "s" : ""} need${nBad > 1 ? "" : "s"} a look` : "all feeds current"}`, m);
    h += `</div>`;
    // Rebuilding the panel's contents put its scroll back at the top on every update (user report, 2026-11-15): the
    // position is kept across the rebuild.
    const scroll = panel.scrollTop;
    if (panel.dataset.html !== h) { panel.innerHTML = h; panel.dataset.html = h; }
    // SWPC's images go back in above "Numbers and sources": the same node, so its pictures are not fetched again
    const body = panel.querySelector(".np-body"), moreEl = body && body.querySelector('[data-k="more"]');
    if (body && imgBox && imgBox.parentNode !== body) body.insertBefore(imgBox, moreEl);
    // the figures: the same nodes, drawn again with the newest data
    if (window.HSO_FIGURE) {
      const specs = { wind: nose && lastRow ? windSpec(now) : null, mp: mpArgs, geo: geoSpec(now), sun: sunSpec(now) };
      for (const sl of panel.querySelectorAll(".np-slot")) {
        const F = figNode(sl.dataset.fig);
        if (!F) continue;
        if (sl.firstChild !== F.el) sl.replaceChildren(F.el);
        if (specs[sl.dataset.fig]) F.draw(specs[sl.dataset.fig]);
      }
    }
    if (panel.scrollTop !== scroll) panel.scrollTop = scroll;
    loadImages();
  }
  const boot = () => { build(); tickClock(); setInterval(() => { tickClock(); render(); }, 15000); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
