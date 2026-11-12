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
        data.kpHist = all.sort((a, b) => a.t - b.t).slice(-8);       // the last day's eight 3-hour blocks, for the bars
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
        const one = (o) => {
          if (!o || typeof o !== "object") return null;
          const t = tagMs(`${o.DateStamp}T${o.TimeStamp}`), sc = (x) => { const v = num(x && x.Scale, 0, 5); return isFinite(v) ? v : null; };
          return { t, R: sc(o.R), S: sc(o.S), G: sc(o.G) };
        };
        const now = one(s && s["0"]), max = one(s && s["-1"]);
        if (!now || !isFinite(now.t)) throw new Error("no current scales");
        data.scales = { now, max };
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
  };
  const data = { kp: null, kpHist: [], kpEst: null, scales: null, swmf: null };
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
  try { open = localStorage.getItem("helios-now-panel") !== "closed"; } catch (e) { /* open */ }
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
      if (b.dataset.now === "fold") { open = !open; try { localStorage.setItem("helios-now-panel", open ? "open" : "closed"); } catch (er) { /* this visit */ } render(); }
      if (b.dataset.now === "follow" && stage && stage.home) stage.home();
    });
    for (const ev of ["pointerdown", "wheel"]) panel.addEventListener(ev, (e) => e.stopPropagation(), { passive: true });
    panel.addEventListener("toggle", (e) => { if (e.target.classList && e.target.classList.contains("np-more")) moreOpen = e.target.open; }, true);
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
      if (!isFinite(s.newest)) { cls = "stale"; txt = `fetched ${hms(s.fetched)} · no rows in the last 90 min`; }
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
  const kpColor = (k) => (!isFinite(k) ? "#6c6c74" : kpG(k) ? NOAA_COL[kpG(k)] : k >= 3.66 ? "#c9d65b" : "#5fd08a");
  const kpWord = (k) => (!isFinite(k) ? "no Kp" : kpG(k) ? `G${kpG(k)} geomagnetic storm` : k >= 3.66 ? "active" : k >= 2.66 ? "unsettled" : "quiet");
  const rangeSpeed = (lo, hi) => { const m = (lo + hi) / 2, s = Math.max(hi - lo, 80) * 1.2; return [m - s / 2, m + s / 2]; };
  const rangeDensity = (lo, hi) => [0, Math.max(4, hi * 1.15)];
  const rangeBz = (lo, hi) => { const a = Math.max(5, Math.abs(lo), Math.abs(hi)) * 1.1; return [-a, a]; };
  /** One quantity against the time it reaches the bow-shock nose, from two hours ago to the newest minute still on its
   *  way from L1: what has arrived solid, what is on its way faint and dashed, a line at now; for B_z, a zero line and
   *  the southward minutes shaded. */
  function spark(key, now, range) {
    const W = 186, H = 30, t0 = now - 2 * 3600e3;
    const list = [...rows.values()].filter(r => isFinite(r.arr) && r.arr >= t0 && isFinite(r[key])).sort((a, b) => a.arr - b.arr);
    if (list.length < 2) return `<svg class="np-sp" viewBox="0 0 ${W} ${H}" aria-hidden="true"></svg>`;
    const t1 = Math.max(now + 5 * MIN, list[list.length - 1].arr);
    let lo = Infinity, hi = -Infinity;
    for (const r of list) { lo = Math.min(lo, r[key]); hi = Math.max(hi, r[key]); }
    [lo, hi] = range(lo, hi);
    const X = (t) => (((t - t0) / (t1 - t0)) * W).toFixed(1), Y = (v) => (H - 2 - ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * (H - 4)).toFixed(1);
    let past = "", ahead = "", south = "", prev = null;
    for (const r of list) {
      const x = X(r.arr), y = Y(r[key]), gap = !prev || r.arr - prev.arr > 4 * MIN;
      if (r.arr <= now) past += `${gap ? "M" : "L"}${x} ${y}`;
      else ahead += gap ? `M${x} ${y}` : prev.arr <= now ? `M${X(prev.arr)} ${Y(prev[key])}L${x} ${y}` : `L${x} ${y}`;
      if (key === "bz" && r[key] < 0) south += `M${x} ${Y(0)}V${y}`;
      prev = r;
    }
    const xn = X(now);
    return `<svg class="np-sp" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">`
      + (key === "bz" ? `<path class="s" d="${south}"/><line class="z" x1="0" x2="${W}" y1="${Y(0)}" y2="${Y(0)}"/>` : "")
      + `<line class="now" x1="${xn}" x2="${xn}" y1="0" y2="${H}"/><path class="a" d="${ahead}"/><path class="p" d="${past}"/></svg>`;
  }
  /** A row of the solar-wind block: the name, the value reaching Earth now with a word for it, and the trend line. */
  const windRow = (label, value, unit, word, cls, svg) =>
    `<div class="np-w ${cls}"><p><span>${label}</span><b>${value}</b><small>${unit}</small>${word ? `<em>${word}</em>` : ""}</p>${svg}</div>`;
  /** The dayside in the noon–midnight plane, the Sun to the left (4.2 px per R_E): Earth, geosynchronous orbit (dashed
   *  circle), the Shue (1998) magnetopause for the wind reaching Earth (solid) and for the newest L1 minute (dashed), the
   *  Jelínek (2012) bow shock (dotted), and CCMC's SWMF standoff (a tick on the Sun–Earth line). */
  function mpSketch(R0, p, bz, R0L, pL, bzL, RB, swmf) {
    const W = 120, H = 92, ex = 104, ey = 46, s = 4.2;
    const alpha = (b, q) => Math.max((0.58 - 0.007 * b) * (1 + 0.024 * Math.log(q)), 0.05);
    const path = (rOf) => {
      let d = "";
      for (let th = -150; th <= 150; th += 5) {
        const t = th * Math.PI / 180, r = rOf(t);
        if (!isFinite(r) || r > 60) { continue; }
        d += `${d ? "L" : "M"}${(ex - s * r * Math.cos(t)).toFixed(1)} ${(ey - s * r * Math.sin(t)).toFixed(1)}`;
      }
      return d;
    };
    const shue = (r0, a) => (t) => r0 * Math.pow(2 / (1 + Math.cos(t)), a);
    const bow = (R) => (t) => { const c = Math.cos(t), sn = Math.sin(t), d = c + Math.sqrt(c * c + 1.17 * 1.17 * sn * sn); return d > 1e-6 ? 2 * R / d : NaN; };
    let g = `<circle class="geo" cx="${ex}" cy="${ey}" r="${(GEO_RE * s).toFixed(1)}"/>`;
    if (isFinite(RB)) g += `<path class="bs" d="${path(bow(RB))}"/>`;
    if (isFinite(R0L)) g += `<path class="mpl" d="${path(shue(R0L, alpha(bzL, pL)))}"/>`;
    if (isFinite(R0)) g += `<path class="mp${R0 < GEO_RE ? " in" : ""}" d="${path(shue(R0, alpha(bz, p)))}"/>`;
    if (isFinite(swmf)) { const x = (ex - s * swmf).toFixed(1); g += `<line class="swmf" x1="${x}" x2="${x}" y1="${ey - 5}" y2="${ey + 5}"/>`; }
    g += `<circle class="earth" cx="${ex}" cy="${ey}" r="${(s * 1.15).toFixed(1)}"/><path class="night" d="M${ex} ${(ey - s * 1.15).toFixed(1)}A${(s * 1.15).toFixed(1)} ${(s * 1.15).toFixed(1)} 0 0 1 ${ex} ${(ey + s * 1.15).toFixed(1)}Z"/>`;
    g += `<path class="sun" d="M4 ${ey}h9m-3-3 3 3-3 3"/><text x="3" y="${ey - 6}">Sun</text><text class="gl" x="${ex}" y="${(ey + GEO_RE * s + 9).toFixed(1)}">GEO</text>`;
    return `<svg class="np-mps" viewBox="0 0 ${W} ${H}" role="img" aria-label="Magnetopause at ${f(R0, 1)} Earth radii, geosynchronous orbit at 6.6">${g}</svg>`;
  }
  /** The last day's eight 3-hour Kp blocks as bars colored by NOAA's G scale, the estimate now as a lighter last bar,
   *  and a line at Kp 5 (G1). */
  function kpBars(hist, est) {
    const W = 150, H = 40, list = (hist || []).slice(-8), n = list.length + (est ? 1 : 0);
    if (!n) return `<svg class="np-kb" viewBox="0 0 ${W} ${H}" aria-hidden="true"></svg>`;
    const bw = W / Math.max(n, 9), Y = (k) => H - 1 - (Math.min(9, Math.max(0, k)) / 9) * (H - 3);
    let g = "";
    for (let i = 0; i < Math.max(n, 9); i++) g += `<rect class="slot" x="${(i * bw + 1).toFixed(1)}" y="1" width="${(bw - 2).toFixed(1)}" height="${H - 2}"/>`;
    g += `<line class="g1" x1="0" x2="${W}" y1="${Y(5).toFixed(1)}" y2="${Y(5).toFixed(1)}"/>`;
    list.forEach((b, i) => { const y = Y(Math.max(b.k, 0.3)); g += `<rect x="${(i * bw + 1).toFixed(1)}" y="${y.toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${(H - 1 - y).toFixed(1)}" fill="${kpColor(b.k)}"><title>Kp ${kpThirds(b.k)}, ${hm(b.t)}–${hm(b.t + 3 * 3600e3)} UTC</title></rect>`; });
    if (est) { const i = list.length, y = Y(Math.max(est.k, 0.3)); g += `<rect class="est" x="${(i * bw + 1).toFixed(1)}" y="${y.toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${(H - 1 - y).toFixed(1)}" fill="${kpColor(est.k)}"><title>Kp ${kpThirds(est.k)} estimated, ${hm(est.t)} UTC</title></rect>`; }
    return `<svg class="np-kb" viewBox="0 0 ${W} ${H}" role="img" aria-label="Kp over the last day">${g}<text x="${W}" y="${(Y(5) - 2).toFixed(1)}">G1</text></svg>`;
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
  let moreOpen = false;
  const scaleTxt = (o, k) => (o && o[k] !== null && o[k] !== undefined ? `${k}${o[k]}` : `${k}–`);
  function render() {
    if (!panel) return;
    const now = Date.now(), st = state.rtsw, fresh = (k) => state[k] && state[k].fetched && isFinite(state[k].newest) && now - state[k].newest <= FEEDS[k].stale;
    const nose = atNose(now), last = newestRow(), view = stage && stage.scene && stage.scene.boundaryAt ? stage.scene.boundaryAt((now - T0) / 1000) : null;
    const scrubbed = stage && stage.scrubbed;
    const head = `<div class="np-h"><b>NOW</b><span>${day(now)} · ${hm(now)} UTC</span>${scrubbed ? '<button data-now="follow" class="np-follow" title="The view was moved off the present: back to it">Follow the clock</button>' : '<i class="np-live" title="The view follows the clock">following the clock</i>'}<button data-now="fold" class="np-fold" aria-expanded="${open}" title="${open ? "Fold the panel" : "Open the panel"}">${open ? "–" : "+"}</button></div>`;
    // Folded, the panel is its header alone. What is drawn is recorded either way: a reopened panel compared itself with
    // the last open drawing, found it unchanged, and stayed a header with a "+" (user report, 2026-11-12).
    if (!open) { if (panel.dataset.html !== head) { panel.innerHTML = head; panel.dataset.html = head; } panel.classList.add("folded"); return; }
    panel.classList.remove("folded");
    let h = head;
    const swOK = fresh("rtsw"), bad = [];
    // ── what must not be missed: stale or missing wind, a boundary held on an old sample ──
    if (last && !swOK) bad.push(`Solar wind is stale: the newest L1 sample is ${age(now - last.t)} old.`);
    if (nose && nose.row.arr + 30e3 < now - 10 * MIN) bad.push(`No measured wind has reached Earth since ${hm(nose.row.arr)} UTC: the boundaries hold that sample.`);
    for (const b of bad) h += `<p class="np-warn">${b}</p>`;

    // ── the solar wind reaching Earth: three trend lines, arrived (solid) and still on its way from L1 (faint) ──
    const lag = last && isFinite(last.arr) ? (last.arr - last.t) / 60e3 : NaN;
    h += `<p class="np-s">Solar wind <em title="Measured at L1 by ${esc(activeSrc || "the active monitor")}, via NOAA SWPC">reaching Earth${isFinite(lag) ? ` · ${f(lag, 0)} min from L1` : ""}</em></p>`;
    if (!nose || !last) {
      h += `<p class="np-n bad">${st && st.loading && !st.fetched ? "Fetching NOAA SWPC's real-time solar wind…" : "No real-time solar wind: the boundaries are drawn for Helios's default (2 nPa, B<sub>z</sub> 0)."}</p>`;
    } else {
      const speedWord = nose.v >= 600 ? "fast" : nose.v >= 450 ? "moderate" : "slow";
      const bzWord = !isFinite(nose.bz) ? "" : nose.bz < -0.5 ? "southward" : nose.bz > 0.5 ? "northward" : "near zero";
      h += `<div class="np-sw">`
        + windRow("Speed", f(nose.v, 0), "km/s", speedWord, "", spark("v", now, rangeSpeed))
        + windRow("Density", f(nose.n, 1), "cm⁻³", "", "", spark("n", now, rangeDensity))
        + windRow("IMF B<sub>z</sub>", sg(nose.bz, 1), "nT", bzWord, nose.bz < -0.5 ? "south" : "", spark("bz", now, rangeBz))
        + `</div><p class="np-key"><i class="k past"></i>arrived · <i class="k ahead"></i>on its way from L1 · last 2 h</p>`;
    }

    // ── the magnetopause: a sketch of the dayside, and the standoff ──
    if (nose && last) {
      const dpN = flowPressure(nose.n, nose.v), dpL = flowPressure(last.n, last.v);
      const bzN = isFinite(nose.bz) ? nose.bz : 0, bzL = isFinite(last.bz) ? last.bz : 0;
      const pN = isFinite(dpN) ? Math.max(dpN, 0.01) : NaN, pL = isFinite(dpL) ? Math.max(dpL, 0.01) : NaN;
      const R0 = isFinite(pN) ? shueR0(pN, bzN) : NaN, R0L = isFinite(pL) ? shueR0(pL, bzL) : NaN, RB = isFinite(pN) ? jelinekR0(pN) : NaN;
      const inside = R0 < GEO_RE, insideL = R0L < GEO_RE, sw = data.swmf;
      h += `<p class="np-s">Magnetopause <em>model, for the wind reaching Earth</em></p>`;
      h += `<div class="np-mp">${mpSketch(R0, pN, bzN, R0L, pL, bzL, RB, sw ? sw.noon : NaN)}<div>`
        + `<p class="np-r0${inside ? " geo" : ""}"><b>${f(R0, 1)}</b> R<sub>E</sub></p><p class="np-sub">standoff · Shue et al. 1998</p>`
        + `<p class="np-chip ${inside ? "geo" : "ok"}">${inside ? "Inside geosynchronous orbit" : "Outside geosynchronous orbit"}</p>`
        + (isFinite(R0L) ? `<p class="np-sub"><i class="k dash"></i>${f(R0L, 1)} R<sub>E</sub> by ${hm(last.arr)}${insideL ? ' <b class="geo">inside GEO</b>' : ""}</p>` : "")
        + (sw ? `<p class="np-sub"><i class="k tick"></i>SWMF model ${f(sw.noon, 1)} R<sub>E</sub>${fresh("swmf") ? "" : " · stale"}</p>` : "")
        + `</div></div>`;
    }

    // ── geomagnetic activity: the last day's Kp as bars, and NOAA's scales ──
    const kp = data.kp, ke = data.kpEst, sc = data.scales, kNow = ke ? ke.k : kp ? kp.k : NaN;
    h += `<p class="np-s">Geomagnetic activity <em>NOAA SWPC</em></p>`;
    h += `<div class="np-kp">${kpBars(data.kpHist, ke)}<div><p class="np-kpv" style="--c:${kpColor(kNow)}"><b>${kpThirds(kNow).replace(/o$/, "")}</b> Kp</p><p class="np-sub">${esc(kpWord(kNow))}${ke ? " · estimated now" : ""}${fresh("kpEst") || fresh("kp") ? "" : " · stale"}</p></div></div>`;
    if (sc) {
      const pill = (k, word) => { const v = sc.now[k], m = sc.max && sc.max[k]; return `<span class="np-pill" style="--c:${scaleColor(v)}" title="${word}: ${k}${v ?? "–"} now${m !== null && m !== undefined ? `, ${k}${m} at most in the last 24 h` : ""}"><b>${k}${v ?? "–"}</b>${word}</span>`; };
      h += `<p class="np-pills">${pill("R", "radio")}${pill("S", "radiation")}${pill("G", "storm")}</p>`;
    }

    // ── the spacecraft, grouped by the model's region ──
    h += `<p class="np-s">Spacecraft <em>model regions</em></p>`;
    if (!stage || !stage.scene || !stage.scene.regionsAt) h += `<p class="np-n">${failed ? "The positions could not be loaded." : "Waiting for the positions…"}</p>`;
    else {
      const groups = new Map();
      for (const c of stage.scene.regionsAt((now - T0) / 1000)) {
        if (!groups.has(c.region)) groups.set(c.region, { color: c.color, list: [] });
        groups.get(c.region).list.push(c);
      }
      h += `<ul class="np-reg">${[...groups].map(([reg, g]) => `<li><span class="np-rn" style="--c:${esc(g.color)}">${esc(reg)}</span><span class="np-rc">${g.list.map(c => `<i title="${esc(c.name)}: ${f(c.r, c.r >= 100 ? 0 : c.r < 2 ? 2 : 1)} R_E from Earth">${esc(c.name)}</i>`).join("")}</span></li>`).join("")}</ul>`;
    }

    // ── the numbers and the feeds, folded away: a dot per feed, and the details behind them ──
    const dots = Object.keys(FEEDS).map(k => `<i class="${feedClass(k)}" title="${esc(FEEDS[k].label)}"></i>`).join("");
    const nBad = Object.keys(FEEDS).filter(k => ["bad", "stale"].includes(feedClass(k))).length;
    h += `<details class="np-more"${moreOpen ? " open" : ""}><summary><span>Numbers and sources</span><span class="np-dots">${dots}</span><em>${nBad ? `${nBad} feed${nBad > 1 ? "s" : ""} need${nBad > 1 ? "" : "s"} a look` : "all feeds current"}</em></summary>`;
    if (nose && last) {
      const dpN = flowPressure(nose.n, nose.v), dpL = flowPressure(last.n, last.v);
      const row = (k, a, b) => `<tr><th>${k}</th><td>${a}</td><td>${b}</td></tr>`;
      h += `<table class="np-t"><thead><tr><th></th><td>Reaching Earth</td><td>Newest at L1</td></tr></thead><tbody>`
        + row("Measured at L1", `${hm(nose.row.t)}`, `${hm(last.t)}`) + row("Reaches the nose", `${hm(nose.row.arr)}`, isFinite(last.arr) ? `${hm(last.arr)}` : "—")
        + row("Speed, km/s", f(nose.v, 0), f(last.v, 0)) + row("Density, cm⁻³", f(nose.n, 2), f(last.n, 2)) + row("Pressure, nPa", f(dpN, 2), f(dpL, 2))
        + row("B<sub>z</sub> GSM, nT", sg(nose.bz, 1), sg(last.bz, 1)) + row("B<sub>t</sub>, nT", f(nose.bt, 1), f(last.bt, 1)) + `</tbody></table>`;
      h += `<p class="np-n">Each L1 minute is carried to the bow-shock nose (Jelínek et al. 2012, ${f(last.rbs, 1)} R<sub>E</sub>) as a flat front along GSE X at its measured V<sub>x</sub>, ${last.how === "eph" ? `from X = ${f(last.xL1, 0)} R<sub>E</sub> (SWPC's position)` : "from SWPC's propagation to 32 R<sub>E</sub>"}.${isFinite(last.tSwpc) ? ` SWPC's own propagation reaches 32 R<sub>E</sub> at ${hm(last.tSwpc)}.` : ""}${view ? ` The drawn surface (Lin et al. 2010) has its nose at ${f(view.linR0, 1)} R<sub>E</sub>.` : ""}</p>`;
    }
    if (kp) h += `<p class="np-n">Kp, 3-hour: ${f(kp.k, 2)} for ${hm(kp.t)}–${hm(kp.t + 3 * 3600e3)} UTC${isFinite(kp.n) ? ` (${kp.n} stations)` : ""}${ke ? `; estimated ${f(ke.k, 2)} at ${hm(ke.t)} UTC` : ""}.${sw2(data.swmf)}</p>`;
    if (stage && stage.S) {
      const miss = stage.S.nowMissing || [];
      h += `<p class="np-n">Positions are SSCWeb's ephemeris, for the present the missions' predicted orbits.${miss.length ? ` No position for the present: ${miss.map(esc).join(", ")}.` : ""} ${stage.S.kpSrcNow ? `Field lines and the oval use Kp ${f(stage.S.kp, 2)} (${esc(stage.S.kpSrcNow)}, set when the page opened).` : `Field lines and the oval use Kp ${f(stage.S.kp, 1)}, Helios's assumed value: NOAA's Kp did not load.`}</p>`;
    }
    h += `<ul class="np-a"><li class="n">No MMS science data in real time: Level 2 files reach the archives weeks after the day.</li><li class="n">THEMIS, Cluster, GOES, ACE, Wind, DSCOVR and OMNI windows follow by days to weeks; pick a past moment for them.</li></ul>`;
    h += `<p class="np-s">Feeds <em>${document.visibilityState === "hidden" ? "paused while the tab is hidden" : "refreshed while this tab is open"}</em></p><ul class="np-f">${Object.keys(FEEDS).map(feedLine).join("")}</ul></details>`;
    if (panel.dataset.html !== h) { panel.innerHTML = h; panel.dataset.html = h; }
  }
  const boot = () => { build(); tickClock(); setInterval(() => { tickClock(); render(); }, 15000); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
