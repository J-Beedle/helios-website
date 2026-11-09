/* Helios live (prototype): the HSO screen and survey data for any moment, fetched in the browser from the public
 * archives — CDAWeb's HAPI server (MMS FGM, FPI and MEC; THEMIS; Cluster; OMNI) and SSCWeb (the rest of the fleet) —
 * and handed to hso.js in the shapes the demo's prepared files give it (prepare_hso_demo.py, prepare_hso_missions.py,
 * prepare_hso_scene.py). live.html?t=2015-10-16T13:07Z loads the four hours around that moment.
 *
 * Tier 1: survey data only. Burst data, VDFs, the Sun from SDO and the field topology stay with the demo for now.
 */
(function () {
  "use strict";

  const q = new URLSearchParams(location.search);
  const raw = (q.get("t") || "").trim();
  const AT = raw ? Date.parse(/Z$|[+-]\d\d:?\d\d$/.test(raw) ? raw : raw + "Z") : NaN;
  if (!isFinite(AT)) return;                               // no moment picked: the page shows its picker only

  const HALF = 2 * 3600, SPAN = 2 * HALF, T0 = AT - HALF * 1000;   // the overview runs two hours either side
  const KEEP = [-3 * 3600, SPAN + 3 * 3600];               // ephemeris kept around it, as the demo's scene
  let HAPI = "https://cdaweb.gsfc.nasa.gov/hapi", SSC = "https://sscweb.gsfc.nasa.gov/WS/sscr/2";
  const RE_KM = 6371.2, MK_EV = 86.1733, DEG = Math.PI / 180;
  // log10 keV/(cm² s sr keV) the 8-bit spectra are stored over: wide, so no flux is clipped; each window then picks
  // its own color range from the data, as Helios does (hso.js specRange)
  const SPEC_RANGE = { dis: [0.5, 10.0], des: [1.5, 10.0], hpca: [-1.0, 9.0], epsd: [-16.0, -2.0] };
  // FPI's fast-survey energy tables (eV), which HAPI does not serve: the same on all four probes in the demo's files
  const FPI_E = {
    dis: [11.33, 14.55, 18.69, 24.0, 30.83, 39.6, 50.87, 65.34, 83.92, 107.8, 138.46, 177.86, 228.45, 293.44, 376.92, 484.15,
          621.88, 798.8, 1026.04, 1317.93, 1692.86, 2174.45, 2793.05, 3587.62, 4608.24, 5919.2, 7603.11, 9766.07, 12544.35,
          16113.01, 20696.88, 26584.79],
    des: [11.66, 14.95, 19.17, 24.58, 31.52, 40.42, 51.83, 66.45, 85.21, 109.26, 140.09, 179.63, 230.33, 295.33, 378.69, 485.56,
          622.6, 798.32, 1023.63, 1312.53, 1682.97, 2157.95, 2766.99, 3547.92, 4549.25, 5833.18, 7479.48, 9590.41, 12297.11,
          15767.72, 20217.84, 25923.91],
  };
  const FPI_P2 = { dis: [2.16, 3.91, 7.07, 10.93, 14.47, 19.16, 25.37, 33.59, 44.48, 58.89, 77.98, 103.24, 136.7, 180.99, 239.63, 317.28,
                         420.09, 556.22, 736.45, 975.08, 1291.03, 1709.37, 2263.26, 2996.62, 3967.62, 5253.24, 6955.46, 9209.24, 12193.31, 16144.31, 21375.56, 28301.89] };
  const FPI_P3 = { dis: [2.16, 3.91, 7.07, 10.93, 14.24, 18.54, 24.14, 31.44, 40.94, 53.32, 69.44, 90.43, 117.77, 153.36, 199.72, 260.1,
                         338.72, 441.11, 574.45, 748.1, 974.23, 1268.72, 1652.24, 2151.68, 2802.1, 3649.12, 4752.19, 6188.69, 8059.43, 10495.65, 13668.31, 17800.0],
                   des: [6.52, 8.54, 11.17, 14.63, 19.15, 25.07, 32.81, 42.95, 56.23, 73.6, 96.34, 126.12, 165.09, 216.11, 282.89, 370.31,
                         484.74, 634.54, 830.63, 1087.31, 1423.32, 1863.16, 2438.92, 3192.61, 4179.2, 5470.68, 7161.25, 9374.25, 12271.12, 16063.2, 21027.11, 27525.0] };
  /** The table a record most likely flew when its own file could not be read (Helios's FPIEnergyTables.assumed): P1
   *  before 2016-09-26, then the P2 ions to 2018-02-01 and the P3 ("sheath") ions after; the electrons' P2 = P3. */
  const fpiAssumed = (sp, ms) => (ms < Date.UTC(2016, 8, 26) ? FPI_E[sp] : sp === "des" ? FPI_P3.des : ms < Date.UTC(2018, 1, 1) ? FPI_P2.dis : FPI_P3.dis);
  // FPI's two burst energy tables per species, alternating record by record: table k serves step-table parity k
  const FPI_EB = {
    dis: [[10.64, 13.66, 17.55, 22.55, 28.96, 37.2, 47.78, 61.37, 78.83, 101.26, 130.06, 167.06, 214.59, 275.64, 354.05, 454.78, 584.15,
           750.33, 963.79, 1237.97, 1590.15, 2042.53, 2623.59, 3369.96, 4328.65, 5560.08, 7141.83, 9173.56, 11783.28, 15135.42, 19441.19, 24971.88],
          [12.06, 15.49, 19.89, 25.55, 32.82, 42.16, 54.15, 69.56, 89.34, 114.76, 147.41, 189.34, 243.21, 312.4, 401.27, 515.42, 662.05,
           850.39, 1092.31, 1403.06, 1802.2, 2314.9, 2973.45, 3819.34, 4905.88, 6301.52, 8094.19, 10396.85, 13354.58, 17153.73, 22033.68, 28301.89]],
    des: [[10.96, 14.05, 18.02, 23.1, 29.62, 37.98, 48.7, 62.45, 80.07, 102.67, 131.65, 168.81, 216.45, 277.54, 355.87, 456.3, 585.09,
           750.22, 961.95, 1233.44, 1581.56, 2027.92, 2600.26, 3334.13, 4275.12, 5481.68, 7028.78, 9012.51, 11556.1, 14817.58, 18999.54, 24361.78],
          [12.41, 15.91, 20.4, 26.16, 33.54, 43.01, 55.15, 70.71, 90.67, 116.26, 149.08, 191.15, 245.1, 314.27, 402.97, 516.7, 662.53,
           849.51, 1089.27, 1396.69, 1790.88, 2296.32, 2944.42, 3775.42, 4840.95, 6207.21, 7959.08, 10205.36, 13085.62, 16778.78, 21514.25, 27586.21]],
  };
  const BURST_HALF = 600;                                    // burst data are fetched ±10 minutes around the moment
  // Helios's THEMIS ESA sweeps (ascending eV): HAPI does not serve them either (prepare_hso_missions.py)
  const ION32 = [5.8, 7.3, 10.0, 12.7, 16.5, 22.3, 29.2, 38.5, 50.4, 66.6, 87.7, 115.0, 151.2, 199.3, 262.0, 345.1, 453.6,
                 597.5, 787.2, 1035.4, 1363.2, 1794.5, 2362.7, 3109.5, 4093.4, 5388.4, 7092.9, 9336.7, 12290.5, 16178.4, 21296.3, 25213.4];
  const ION24 = [6.5, 11.4, 19.4, 33.9, 58.5, 101.4, 175.3, 303.6].concat(ION32.slice(16));
  const GMOM_E = [7.3, 9.2, 12.6, 16.0, 20.8, 28.1, 36.8, 48.5, 63.5, 83.9, 110.5, 144.9, 190.5, 251.1, 330.1, 434.8, 571.5,
                  752.8, 991.8, 1304.5, 1717.5, 2260.9, 2976.8, 3917.7, 5157.3, 6788.9, 8936.4, 11763.4, 15484.9, 20383.3, 26831.4];
  const ELEC32 = GMOM_E.slice(0, 31).concat([31766.6]);
  // Helios's fallback tables: GMOM's combined ESA∪SST sweeps (ascending; ions 40- and 48-live, electrons 46-live) and
  // ESA full mode (served high → low; ions 32, electrons 15-live — a 32-live electron sweep has no verified table)
  const GMOM_I40 = [6.5, 11.4, 19.4, 33.9, 58.5, 101.4, 175.3, 303.6, 453.6, 597.5, 787.2, 1035.4, 1363.2, 1794.5, 2362.7, 3109.5,
    4093.4, 5388.4, 7092.9, 9336.7, 12290.5, 16178.4, 21296.3, 25000, 26000, 28000, 30000, 34000, 41000, 53000, 67400, 95400,
    142600, 207400, 297000, 421800, 654600, 1134600, 2329800, 4005000];
  const GMOM_I48 = [5.6137, 7.1108, 9.7305, 12.3503, 16.0928, 21.7065, 28.443, 37.425, 49.0267, 64.7452, 85.329, 111.901, 147.08,
    193.861, 254.864, 335.702, 441.241, 581.21, 765.716, 1007.11, 1325.97, 1745.5, 2298.27, 3024.69, 3981.65, 5241.37, 6899.3,
    9081.92, 11955.0, 15736.8, 20715.1].concat(GMOM_I40.slice(23));
  const GMOM_E46 = GMOM_E.concat([27000, 28000, 29000, 30000, 31000, 41000, 52000, 65500, 93000, 139000, 203500, 293000, 408000, 561500, 719500]);
  const ESAF_E15 = [10.9, 18.4, 32.5, 56.0, 97.2, 167.7, 290.6, 503.2, 872.3, 1511.0, 2618.9, 4537.5, 7862.6, 13624.1, 23607.3];

  const iso = (ms) => new Date(ms).toISOString().replace(/\.\d+Z$/, "Z");
  const sec = (ms) => (ms - T0) / 1000;
  let bytes = 0;

  // ───────────────────────── what is loading, for the page ─────────────────────────
  const tasks = new Map();
  function track(label, p) {
    tasks.set(label, "loading"); emit();
    return p.then((v) => { tasks.set(label, v && v.empty ? "none" : "ok"); emit(); return v; },
                  (e) => { tasks.set(label, "error"); emit(); console.warn(label, e); throw e; });
  }
  function emit() { window.dispatchEvent(new CustomEvent("hso-live", { detail: { tasks: [...tasks], bytes, relay: viaRelay } })); }

  // ───────────────────────── the relay (server/live_cache.py): the archives behind one cached origin ─────────────────────────
  // ?cache=<url> or assets/data/live/config.json's "cache" names it; ?cache=off, no config or no answer within 2.5 s
  // means the archives directly, as before.
  let viaRelay = false;
  const relay = (async () => {
    let url = q.get("cache");
    if (url === null) url = (await fetch("assets/data/live/config.json").then(r => r.json()).catch(() => ({}))).cache || "";
    url = url.replace(/\/$/, "");
    if (!url || url === "off") return false;
    try {
      const r = await fetch(`${url}/health`, { signal: AbortSignal.timeout(2500) });
      if (r.ok) { HAPI = `${url}/hapi`; SSC = `${url}/sscweb`; viaRelay = true; emit(); return true; }
    } catch (e) { /* the archives directly */ }
    return false;
  })();

  // ───────────────────────── a polite client: a few requests at a time, retried when the server is busy ─────────────────────────
  let MAXQ = 4;
  const queue = [];
  let active = 0;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  /** Runs fn when one of MAXQ slots is free; `first` jumps the queue (a VDF cut the viewer is waiting on). */
  async function slot(fn, first) {
    if (await relay && MAXQ < 6) MAXQ = 6;                    // the relay keeps its own limit on the archives
    return new Promise((res, rej) => {
      const run = () => { active++; fn().then(res, rej).finally(() => { active--; const next = queue.shift(); if (next) next(); }); };
      if (active < MAXQ) run(); else if (first) queue.unshift(run); else queue.push(run);
    });
  }
  /** fetch, retried three times (1.5, 3, 6 s apart) on a network error, a 5xx/429 answer, or no answer within `wait` ms
   *  (CDAWeb sometimes sits on a request under load, then answers a retry in seconds). */
  async function get(url, init, wait = 45000, onBytes = null) {
    for (let k = 0; ; k++) {
      const ac = new AbortController(), timer = setTimeout(() => ac.abort(), wait);
      try {
        const r = await fetch(url, Object.assign({ signal: ac.signal }, init));
        if (r.ok && onBytes && r.body) {                    // streamed, so a progress bar can follow it
          const rd = r.body.getReader(), parts = [];
          let n = 0;
          for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); n += value.length; onBytes(value.length); }
          const body = new Uint8Array(n); let o = 0; for (const p of parts) { body.set(p, o); o += p.length; }
          clearTimeout(timer);
          return new Response(body, { status: r.status, headers: r.headers });
        }
        if (r.ok) { const body = await r.arrayBuffer(); clearTimeout(timer); return new Response(body, { status: r.status, headers: r.headers }); }
        clearTimeout(timer);
        if ((r.status >= 500 || r.status === 429) && k < 3) { await sleep(1500 * 2 ** k); continue; }
        return r;
      } catch (e) { clearTimeout(timer); if (k >= 3) throw e; await sleep(1500 * 2 ** k); }
    }
  }

  // ───────────────────────── HAPI ─────────────────────────
  /** "2015-10-16T11:00:00.024201612Z" → ms; HAPI's times carry up to nine decimals, which Date.parse refuses. */
  function hapiTime(s) {
    const ms = Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10), +s.slice(11, 13) || 0, +s.slice(14, 16) || 0);
    const r = s.length > 17 ? parseFloat(s.slice(17).replace("Z", "")) : 0;
    return ms + (isFinite(r) ? r * 1000 : 0);
  }
  /** One HAPI request as CSV: the rows inside [a, b] (CDAWeb answers an empty interval with the nearest record), their
   *  times in seconds after T0, and each column after Time; fill values (|x| ≥ 1e30) become NaN. */
  function hapi(id, params, a, b, first, openEnd, P = null) {
    return slot(async () => {
      const r = await get(`${HAPI}/data?id=${encodeURIComponent(id)}&parameters=${params.join(",")}&time.min=${iso(a)}&time.max=${iso(b)}`, undefined, 45000, P && P.add);
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`${id}: HTTP ${r.status}`);
      return r.text();
    }, first).then(text => parseCSV(id, text, a, openEnd ? b - 1e-3 : b));
  }
  function parseCSV(id, text, a, b) {
    if (text === null) return { t: new Float64Array(0), cols: [], n: 0 };
    if (/^\s*[{,]/.test(text)) {                             // a HAPI status in place of data
      const m = /"message":\s*"([^"]+)"/.exec(text);
      if (/1201|no data/i.test(m ? m[1] : "")) return { t: new Float64Array(0), cols: [], n: 0 };
      throw new Error(`${id}: ${m ? m[1] : "HAPI error"}`);
    }
    bytes += text.length; emit();
    const lines = text.split("\n"), t = [], rows = [];
    for (const ln of lines) {
      if (!ln || ln[0] === "#") continue;
      const f = ln.split(","), ms = hapiTime(f[0]);
      if (ms < a || ms > b) continue;
      t.push(sec(ms)); rows.push(f);
    }
    const nc = rows.length ? rows[0].length - 1 : 0, cols = [];
    for (let c = 0; c < nc; c++) {
      const v = new Float64Array(rows.length);
      for (let i = 0; i < rows.length; i++) { const x = parseFloat(rows[i][c + 1]); v[i] = Math.abs(x) >= 1e30 || !isFinite(x) ? NaN : x; }
      cols.push(v);
    }
    return { t: Float64Array.from(t), cols, n: rows.length };
  }
  /** A long request cut into pieces fetched side by side, joined in order. */
  async function hapiChunked(id, params, a, b, k, first) {
    // whole-second edges, each piece ending where the next begins (HAPI's time.max is exclusive and to the second here)
    const edge = (i) => (i === 0 ? Math.floor(a / 1000) * 1000 : i === k ? Math.ceil(b / 1000) * 1000 : Math.round((a + i * (b - a) / k) / 1000) * 1000);
    const parts = await Promise.all(Array.from({ length: k }, (_, i) => hapi(id, params, edge(i), edge(i + 1), first, i < k - 1)));
    const n = parts.reduce((s, p) => s + p.n, 0), nc = Math.max(0, ...parts.map(p => p.cols.length)), t = new Float64Array(n);
    const cols = Array.from({ length: nc }, () => new Float64Array(n));
    let o = 0;
    for (const p of parts) { t.set(p.t, o); p.cols.forEach((c, j) => cols[j].set(c, o)); o += p.n; }
    return { t, cols, n };
  }
  /** One parameter's bins (HAPI info), for spectra the server labels itself. */
  async function hapiBins(id, param, first) {
    const r = await slot(() => get(`${HAPI}/info?id=${encodeURIComponent(id)}&parameters=${param}`), first);   // HAPI is read inside, after the relay
    if (!r.ok) return null;
    const p = (await r.json()).parameters.find(x => x.name === param);
    return p && p.bins && p.bins[0].centers;
  }
  const stack = (cols, j, k) => {                          // columns j … j+k−1 as one row-major array
    const n = cols[j] ? cols[j].length : 0, out = new Float32Array(n * k);
    for (let c = 0; c < k; c++) { const v = cols[j + c]; if (v) for (let i = 0; i < n; i++) out[i * k + c] = v[i]; }
    return out;
  };
  const f32 = (a) => Float32Array.from(a || []);

  /** 8-bit log10 flux, 0 = no data (prepare_hso_demo.spec8). */
  function spec8(flux, n, nc, sp, zerosBlank = false) {
    lastFlux = flux; lastStore = SPEC_RANGE[sp];
    const [lo, hi] = SPEC_RANGE[sp], out = new Uint8Array(n * nc);
    for (let i = 0; i < n * nc; i++) {
      const f = flux[i];
      if (!isFinite(f) || f < 0 || (zerosBlank && f <= 0)) continue;   // negative flux blank (Helios); CIS zeros blank too
      const l = Math.log10(Math.max(f, 10 ** lo));
      out[i] = Math.max(1, Math.min(255, Math.round((l - lo) / (hi - lo) * 254) + 1));
    }
    return out;
  }
  /** A record set in the unpacked shape: arrays and their column counts. A spectrum also keeps its unrounded log10
   *  flux (specLog), so the color range is taken at full precision, as Helios takes it. */
  function set(fields) {
    const out = { cols: {} };
    for (const [k, [a, c]] of Object.entries(fields)) { out[k] = a; out.cols[k] = c; }
    if (lastFlux && out.spec && lastFlux.length === out.spec.length) out.specLog = Float32Array.from(lastFlux, f => (f > 0 && isFinite(f) ? Math.log10(f) : NaN));
    if (out.spec && lastStore) out.store = lastStore;            // the 8-bit scale, for the figure to read it back
    lastFlux = null; lastStore = null;
    return out;
  }
  let lastFlux = null, lastStore = null;
  /** J = e nₑ (Vᵢ − Vₑ) on the electrons' times, µA/m², none across gaps in the ions (prepare_hso_demo.current). */
  function current(ti, vi, te, ne, ve) {
    const n = te.length, out = new Float32Array(n * 3).fill(NaN);
    if (ti.length < 2 || n < 2) return out;
    const med = (t) => { const d = []; for (let i = 1; i < t.length; i++) d.push(t[i] - t[i - 1]); d.sort((p, r) => p - r); return d[d.length >> 1]; };
    const shift = med(te) / 2 - med(ti) / 2;                // 0.03/2 − 0.15/2 = −60 ms in burst, 0 in fast survey
    let k = 0;
    for (let i = 0; i < n; i++) {
      const t = te[i] + shift;
      while (k < ti.length - 2 && ti[k + 1] < t) k++;
      if (t < ti[0] || t > ti[ti.length - 1]) continue;
      const f = (t - ti[k]) / (ti[k + 1] - ti[k]);
      for (let c = 0; c < 3; c++) out[i * 3 + c] = 1.602176634e-4 * ne[i] * (vi[k * 3 + c] + (vi[(k + 1) * 3 + c] - vi[k * 3 + c]) * f - ve[i * 3 + c]);
    }
    return out;
  }
  /** Box-car means over `avg` seconds (the demo's survey B is a 1-s average). */
  function boxcar(t, cols, avg) {
    const T = [], C = cols.map(() => []);
    let i = 0;
    while (i < t.length) {
      const k = Math.floor(t[i] / avg);
      let j = i;
      const s = cols.map(() => 0), m = cols.map(() => 0);
      while (j < t.length && Math.floor(t[j] / avg) === k) { cols.forEach((c, q) => { if (isFinite(c[j])) { s[q] += c[j]; m[q]++; } }); j++; }
      T.push((k + 0.5) * avg); cols.forEach((c, q) => C[q].push(m[q] ? s[q] / m[q] : NaN));
      i = j;
    }
    return { t: T, cols: C };
  }
  const window_ = [T0 - 60e3, T0 + SPAN * 1000 + 60e3];

  // ───────────────────────── FPI's energy tables, from the L2 files (Helios's FPIEnergyTables) ─────────────────────────
  // FPI flies several sweeps — P1 (2015-09 → 2016-03), then tail, dayside and solar-wind tables switched by orbit and
  // region — so a date cannot say which one a record used. As Helios does, each record's table is read from CDAWeb's
  // original L2 fast-survey file (byte ranges: the header, Epoch and the energy variable, a few hundred KB per 2-hour
  // file); HAPI does not serve the variable.
  const CDA = "https://cdaweb.gsfc.nasa.gov/pub/data/mms";
  /** A CDF read by byte range: zVariables by name, their records as numbers (TT2000 Epoch as UTC ms). */
  function cdfFile(url, whole = false, P = null) {
    const CH = 65536, chunks = new Map();
    let all = null;
    const chunk = (k) => {
      if (whole) {
        all = all || slot(async () => {
          const r = await get(url, undefined, 120000, P && P.add);
          if (!r.ok) throw new Error(`CDF ${r.status}`);
          const b = new Uint8Array(await r.arrayBuffer()); bytes += b.length; emit();
          return b;
        }, true);
        return all.then(b => b.subarray(k * CH, (k + 1) * CH));
      }
      if (!chunks.has(k)) chunks.set(k, slot(async () => {
        const r = await get(url, { headers: { Range: `bytes=${k * CH}-${(k + 1) * CH - 1}` } }, 30000);
        if (!(r.status === 206 || r.status === 200)) throw new Error(`CDF ${r.status}`);
        const b = new Uint8Array(await r.arrayBuffer()); bytes += b.length; emit();
        return r.status === 200 ? b.subarray(k * CH, (k + 1) * CH) : b;
      }, true));
      return chunks.get(k);
    };
    const read = async (off, len) => {                     // len bytes at off, across chunks
      const out = new Uint8Array(len);
      for (let k = Math.floor(off / CH); k * CH < off + len; k++) {
        const c = await chunk(k), s0 = Math.max(off, k * CH), s1 = Math.min(off + len, k * CH + c.length);
        if (s1 > s0) out.set(c.subarray(s0 - k * CH, s1 - k * CH), s0 - off);
      }
      return new DataView(out.buffer);
    };
    const u64 = (dv, o) => Number(dv.getBigUint64(o));
    let headP = null;
    const head = () => (headP = headP || (async () => {
      const m = await read(0, 8);
      if (m.getUint32(0) !== 0xCDF30001 || m.getUint32(4) !== 0x0000FFFF) throw new Error("not an uncompressed CDF 3");
      const cdr = await read(8, 40), gdr = u64(cdr, 12), enc = cdr.getInt32(28), rowMajor = !!(cdr.getInt32(32) & 1);
      const little = [3, 4, 6, 13, 14, 15, 16, 17].includes(enc);
      const g = await read(gdr, 64), vars = {};
      for (let off = u64(g, 20); off;) {                     // the zVDR chain
        const v = await read(off, 360), name = new TextDecoder().decode(new Uint8Array(v.buffer, 84, 256)).replace(/\0[\s\S]*$/, "");
        const nd = v.getInt32(340), dims = []; for (let i = 0; i < nd; i++) dims.push((await read(off + 344 + 4 * i, 4)).getInt32(0));
        vars[name] = { type: v.getInt32(20), maxRec: v.getInt32(24), vxr: u64(v, 28), flags: v.getInt32(44), elems: dims.reduce((p, q) => p * q, 1) };
        off = u64(v, 12);
      }
      return { little, vars, rowMajor };
    })());
    /** Every record of a variable: a flat Float64Array (elems per record). */
    async function variable(name) {
      const { little, vars } = await head(), V = vars[name];
      if (!V) throw new Error(`no ${name}`);
      const size = { 1: 1, 2: 2, 4: 4, 8: 8, 11: 1, 12: 2, 14: 4, 21: 4, 22: 8, 31: 8, 33: 8, 41: 1, 44: 4, 45: 8 }[V.type];
      const n = V.maxRec + 1, recBytes = size * V.elems, out = new Float64Array(n * V.elems).fill(NaN);
      const put = (dv, at, first, count) => {
        for (let r = 0; r < count; r++) for (let e = 0; e < V.elems; e++) {
          const o = at + (r * V.elems + e) * size, i = (first + r) * V.elems + e;
          out[i] = V.type === 33 ? tt2000(dv.getBigInt64(o, little)) : size === 8 ? (V.type === 8 ? Number(dv.getBigInt64(o, little)) : dv.getFloat64(o, little))
            : V.type === 21 || V.type === 44 ? dv.getFloat32(o, little) : size === 4 ? dv.getInt32(o, little) : size === 2 ? dv.getInt16(o, little) : dv.getInt8(o);
        }
      };
      const walk = async (vxr) => {
        for (let off = vxr; off;) {
          const h = await read(off, 28), N = h.getInt32(20), used = h.getInt32(24), t = await read(off + 28, 16 * N);
          for (let k = 0; k < used; k++) {
            const first = t.getInt32(4 * k), last = t.getInt32(4 * N + 4 * k), at = u64(t, 8 * N + 8 * k), rh = await read(at, 24), rt = rh.getInt32(8);
            if (rt === 6) await walk(at);
            else if (rt === 7) put(await read(at + 12, (last - first + 1) * recBytes), 0, first, last - first + 1);
            else if (rt === 13) {                            // a gzip-compressed block
              const cs = u64(rh, 16), z = await read(at + 24, cs);
              const raw = await new Response(new Blob([z.buffer]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
              put(new DataView(raw), 0, first, last - first + 1);
            }
          }
          off = u64(h, 12);
        }
      };
      await walk(V.vxr);
      return { data: out, elems: V.elems, n };
    }
    return { variable, names: async () => Object.keys((await head()).vars), rowMajor: async () => (await head()).rowMajor };
  }
  /** TT2000 (ns from J2000 TT) → UTC ms: TT − 32.184 s − the leap seconds then in force. */
  function tt2000(ns) {
    const ms = Number(ns / 1000000n), utcGuess = Date.UTC(2000, 0, 1, 12) + ms;
    const leap = [[Date.UTC(2017, 0, 1), 37], [Date.UTC(2015, 6, 1), 36], [Date.UTC(2012, 6, 1), 35], [Date.UTC(2009, 0, 1), 34], [Date.UTC(2006, 0, 1), 33], [0, 32]];
    const dat = leap.find(([t0]) => utcGuess - 69e3 >= t0)[1];
    return utcGuess - 32184 - dat * 1000;
  }
  const fpiTablesMemo = new Map();
  /** The tables flown over [a, b]: { t (s after T0), idx, tables[[32]] } from the fast L2 moments files. */
  function fpiTables(n, sp, a, b) {
    const key = `${n}|${sp}`;
    if (fpiTablesMemo.has(key)) return fpiTablesMemo.get(key);
    const p = (async () => {
      const days = new Set([a, b].map(ms => new Date(ms).toISOString().slice(0, 10)));
      const files = [];
      for (const day of days) {
        const [y, m, d] = day.split("-"), dir = `${CDA}/mms${n}/fpi/fast/l2/${sp}-moms/${y}/${m}/`;
        const r = await slot(() => get(dir, undefined, 20000), true);
        if (!r.ok) continue;
        const html = await r.text(), best = {};
        for (const f of html.match(new RegExp(`mms${n}_fpi_fast_l2_${sp}-moms_${y}${m}${d}\\d{6}_v[\\d.]+\\.cdf`, "g")) || []) {
          const start = f.match(/_(\d{14})_/)[1], v = f.match(/_v([\d.]+)\.cdf/)[1].split(".").map(Number);
          if (!best[start] || v.join(".").localeCompare(best[start].v.join("."), undefined, { numeric: true }) > 0) best[start] = { f, v };
        }
        for (const [start, { f }] of Object.entries(best)) {
          const t0 = Date.UTC(+start.slice(0, 4), +start.slice(4, 6) - 1, +start.slice(6, 8), +start.slice(8, 10), +start.slice(10, 12));
          if (t0 <= b && t0 + 2 * 3600e3 >= a) files.push(dir + f);
        }
      }
      const tables = [], keys = new Map(), T = [], idx = [];
      for (const url of files) {
        const cdf = cdfFile(url), [ep, en] = await Promise.all([cdf.variable("Epoch"), cdf.variable(`mms${n}_${sp}_energy_fast`)]);
        for (let r = 0; r < ep.n; r++) {
          const row = Array.from(en.data.subarray(r * 32, r * 32 + 32), x => +x.toFixed(2));
          if (!row.every(x => x > 0)) continue;
          const k = row.join(",");
          if (!keys.has(k)) { keys.set(k, tables.length); tables.push(row); }
          T.push(sec(ep.data[r])); idx.push(keys.get(k));
        }
      }
      return T.length ? { t: T, idx, tables } : null;
    })().catch((e) => { console.warn("FPI energy tables", e); return null; });
    fpiTablesMemo.set(key, p);
    return p;
  }
  /** Relabel a record set with the tables flown: each record takes the nearest file record's table. */
  function applyTables(S, tb, burst = false) {
    if (!tb || !S.t.length) return false;
    const within = burst ? 10 : 2, nT = tb.tables.length, guess = fpiAssumed(S.sp || "dis", AT);
    S.etab = Float32Array.from(tb.tables.flat().concat(guess)); S.cols.etab = 32;
    let k = 0, assumed = 0;
    for (let i = 0; i < S.t.length; i++) {
      const t = S.t[i];
      while (k < tb.t.length - 1 && tb.t[k + 1] <= t) k++;
      const di = tb.t[k] <= t ? t - tb.t[k] : Infinity, j = tb.t[k] <= t ? k + 1 : k, dj = j < tb.t.length ? tb.t[j] - t : Infinity;
      const pick = di <= dj ? (di <= within ? k : -1) : (dj <= within ? j : -1);   // at-or-before wins a tie
      if (pick < 0) { S.eidx[i] = nT; assumed++; } else S.eidx[i] = tb.idx[pick];
    }
    if (assumed) console.warn(`FPI ${S.sp}: ${assumed} records without a table in their files take the ${new Date(AT).toISOString().slice(0, 10)} guess`);
    return true;
  }
  const P1_END = Date.UTC(2016, 2, 1);                       // after P1, a burst record's table is the fast table of its moment

  // ───────────────────────── MMS ─────────────────────────
  function fpiSet(r, sp, withST) {                         // columns: spectrum[32], n, V[3], (spin tone[3],) T∥, T⊥
    const n = r.n, nc = 32, o = withST ? 3 : 0;
    const flux = stack(r.cols, 0, nc);
    return gapFilled(set({
      t: [f32(r.t), 1], n: [f32(r.cols[32]), 1], v: [stack(r.cols, 33, 3), 3], tpar: [f32(r.cols[36 + o]), 1], tperp: [f32(r.cols[37 + o]), 1],
      ...(withST ? { vst: [stack(r.cols, 36, 3).map(x => (isFinite(x) ? x : 0)), 3] } : {}),
      spec: [spec8(flux, n, nc, sp), nc], etab: [Float32Array.from(fpiAssumed(sp, AT)), nc], eidx: [new Uint8Array(n), 1],
    }));
  }
  const gapFilled = (S) => { S.fillGaps = true; return S; };
  /** Burst moments: columns parity, spectrum[32], n, V[3], (spin tone[3],) T∥, T⊥, in HAPI's order. */
  function fpiBurstSet(r, sp, withST) {
    const n = r.n, o = withST ? 3 : 0, eidx = new Uint8Array(n);
    for (let i = 0; i < n; i++) eidx[i] = r.cols[0][i] === 1 ? 1 : 0;
    return gapFilled(set({
      t: [f32(r.t), 1], n: [f32(r.cols[33]), 1], v: [stack(r.cols, 34, 3), 3], tpar: [f32(r.cols[37 + o]), 1], tperp: [f32(r.cols[38 + o]), 1],
      ...(withST ? { vst: [stack(r.cols, 37, 3).map(x => (isFinite(x) ? x : 0)), 3] } : {}),
      spec: [spec8(stack(r.cols, 1, 32), n, 32, sp), 32], etab: [Float32Array.from(AT < Date.UTC(2016, 8, 26) ? FPI_EB[sp].flat() : fpiAssumed(sp, AT).concat(fpiAssumed(sp, AT))), 32], eidx: [eidx, 1],
    }));
  }
  async function mms(n) {
    const sc = `mms${n}`, [a, b] = window_;
    const moms = (sp, st) => [`${sc}_${sp}_energyspectr_omni_fast`, `${sc}_${sp}_numberdensity_fast`, `${sc}_${sp}_bulkv_gse_fast`,
                              ...(st ? [`${sc}_${sp}_bulkv_spintone_gse_fast`] : []), `${sc}_${sp}_temppara_fast`, `${sc}_${sp}_tempperp_fast`];   // HAPI's order
    const ba = AT - BURST_HALF * 1000, bb = AT + BURST_HALF * 1000;
    const bmoms = (sp, st) => [`${sc}_${sp}_steptable_parity_brst`, `${sc}_${sp}_energyspectr_omni_brst`, `${sc}_${sp}_numberdensity_brst`, `${sc}_${sp}_bulkv_gse_brst`,
                               ...(st ? [`${sc}_${sp}_bulkv_spintone_gse_brst`] : []), `${sc}_${sp}_temppara_brst`, `${sc}_${sp}_tempperp_brst`];
    const burst = Promise.all([
      track(`MMS${n} burst FGM`, hapiChunked(`MMS${n}_FGM_BRST_L2@0`, [`${sc}_fgm_b_gse_brst_l2`], ba, bb, 6)),
      track(`MMS${n} burst FPI ions`, hapi(`MMS${n}_FPI_BRST_L2_DIS-MOMS`, bmoms("dis", false), ba, bb)),
      track(`MMS${n} burst FPI electrons`, hapiChunked(`MMS${n}_FPI_BRST_L2_DES-MOMS`, bmoms("des", true), ba, bb, 3)),
    ]).catch((e) => { console.warn(e); return null; });
    const [fg, di, de] = await Promise.all([
      track(`MMS${n} FGM`, hapiChunked(`MMS${n}_FGM_SRVY_L2@0`, [`${sc}_fgm_b_gse_srvy_l2`], a, b, 8, true)),   // ahead of any burst loading
      track(`MMS${n} FPI ions`, hapi(`MMS${n}_FPI_FAST_L2_DIS-MOMS`, moms("dis", false), a, b, true)),
      track(`MMS${n} FPI electrons`, hapi(`MMS${n}_FPI_FAST_L2_DES-MOMS`, moms("des", true), a, b, true)),
    ]);
    const B = boxcar(fg.t, fg.cols.slice(0, 4), 1.0);
    const sv = {
      fgm: set({ t: [f32(B.t), 1], b: [stack(B.cols.map(f32), 0, 4), 4] }),
      dis: fpiSet(di, "dis", false),
      des: fpiSet(de, "des", true),
    };
    const [tbI, tbE] = await Promise.all([track(`MMS${n} FPI energy tables (L2 files)`, Promise.all([fpiTables(n, "dis", a, b), fpiTables(n, "des", a, b)]))]).then(x => x[0]);
    sv.dis.sp = "dis"; sv.des.sp = "des";
    applyTables(sv.dis, tbI); applyTables(sv.des, tbE);
    sv.des.j = current(sv.dis.t, sv.dis.v, sv.des.t, sv.des.n, sv.des.v); sv.des.cols.j = 3;
    const bu = burst.then((B3) => {                          // the burst data follow the survey, drawn when they arrive
      if (!B3 || !(B3[0].n || B3[1].n || B3[2].n)) return null;
      const out = { fgm: set({ t: [f32(B3[0].t), 1], b: [stack(B3[0].cols, 0, 4), 4] }), dis: fpiBurstSet(B3[1], "dis", false), des: fpiBurstSet(B3[2], "des", true) };
      out.dis.sp = "dis"; out.des.sp = "des";
      if (AT >= P1_END) { applyTables(out.dis, tbI, true); applyTables(out.des, tbE, true); }   // P2 on: both parities fly the fast table
      out.des.j = current(out.dis.t, out.dis.v, out.des.t, out.des.n, out.des.v); out.des.cols.j = 3;
      return out;
    });
    return { sv, bu: null, burst: bu, kind: "mms", empty: !fg.n && !di.n };
  }

  // ───────────────────────── THEMIS ─────────────────────────
  async function themis(key) {
    const L = key.slice(2).toUpperCase(), l = L.toLowerCase(), [a, b] = window_, P = { B: "ARTEMIS-P1", C: "ARTEMIS-P2" }[L] || `THEMIS-${L}`;
    // As Helios's fetchThemis: moments from MOM (spin cadence; non-Q values), field-aligned temperatures from its t3_mag,
    // E from FIT@1 (bit-identical to EFI where both exist, better coverage), spectrograms from ESA reduced mode
    // MOM non-Q, its data_quality first (dataset order); screened by bit as Helios's ThemisMOMFlag: ions drop 8
    // (low-energy mode) and 64 (maneuver), electrons 1 (no potential), 4 and 64; 16 and 32 are kept and counted
    const mom = (s) => [`th${l}_pe${s}m_data_quality`, `th${l}_pe${s}m_density`, `th${l}_pe${s}m_velocity_gse`, `th${l}_pe${s}m_t3_mag`];
    const esa = (s) => [`th${l}_pe${s}_density`, `th${l}_pe${s}_avgtemp`, `th${l}_pe${s}_en_eflux`, `th${l}_pe${s}_magt3`, `th${l}_pe${s}_velocity_gse`];
    const none = { t: new Float64Array(0), cols: [], n: 0 };
    const [fg, ir, er, mi, me, efi] = await Promise.all([
      track(`${P} FGM`, hapi(`TH${L}_L2_FGM@0`, [`th${l}_fgs_btotal`, `th${l}_fgs_gse`], a, b, true).catch(() => none)),
      track(`${P} ESA ion spectra`, hapi(`TH${L}_L2_ESA@2`, esa("ir"), a, b, true).catch(() => none)),
      track(`${P} ESA electron spectra`, hapi(`TH${L}_L2_ESA@3`, esa("er"), a, b, true).catch(() => none)),
      track(`${P} ion moments (MOM)`, hapi(`TH${L}_L2_MOM@0`, mom("i"), a, b, true).catch(() => none)),
      track(`${P} electron moments (MOM)`, hapi(`TH${L}_L2_MOM@1`, mom("e"), a, b, true).catch(() => none)),
      hapi(`TH${L}_L2_FIT@1`, [`th${l}_efs_dot0_gse`], a, b, true).catch(() => null),
    ]);
    const sv = {}, notes = [];
    const bm = stack(fg.cols, 0, 4), b4 = new Float32Array(fg.n * 4);
    for (let i = 0; i < fg.n; i++) { b4[i * 4] = bm[i * 4 + 1]; b4[i * 4 + 1] = bm[i * 4 + 2]; b4[i * 4 + 2] = bm[i * 4 + 3]; b4[i * 4 + 3] = bm[i * 4]; }
    sv.fgm = set({ t: [f32(fg.t), 1], b: [b4, 4] });
    // the spectra: the sweep chosen per record by how many channels are live (Helios's spectrogram(sweeps:)); a record
    // whose count has no verified table is left blank. Helios's per-probe ESA calibration applies to reduced mode only.
    const CAL = { ion: { B: 0.9753, C: 0.9753, D: 0.9753, E: 0.9727 }, elec: { B: 0.9825, C: 0.9825, D: 0.9825, E: 0.9835 } };
    const spectra = (r, off, tables, sp, o = {}) => {
      const n = r.n, nc = (o.nc || 32), flux = new Float32Array(n * 32).fill(NaN), eidx = new Uint8Array(n), tabs = [], keys = [], top = [];
      const cal = o.cal ? (CAL[sp === "dis" ? "ion" : "elec"][L] || 1) : 1;
      let used = 0;
      for (let i = 0; i < n; i++) {
        const row = []; for (let c = 0; c < nc; c++) row.push(r.cols[off + c] ? r.cols[off + c][i] : NaN);
        let last = -1; for (let c = 0; c < nc; c++) if (isFinite(row[c])) last = c;   // the sweep: its last live column (Helios)
        let tab = tables[last + 1];
        if (!tab) continue;
        let vals = row.slice(0, last + 1);
        if (o.desc) vals.reverse();                                      // each value in its own channel, gaps kept
        if (o.below) { const k = tab.filter(e => e < o.below).length; tab = tab.slice(0, k); vals = vals.slice(0, k); }   // GMOM cropped to ESA
        const key = `${tab.length}:${tab[0]}`;
        let k = keys.indexOf(key);
        if (k < 0) { keys.push(key); tabs.push(tab); top.push(-1); k = tabs.length - 1; }
        eidx[i] = k; used++;
        for (let c = 0; c < Math.min(tab.length, vals.length, 32); c++) { flux[i * 32 + c] = vals[c]; if (vals[c] > 0) top[k] = Math.max(top[k], c); }
      }
      if (!used) return null;
      const etab = new Float32Array(tabs.length * 32);
      tabs.forEach((tb, k) => { for (let c = 0; c < 32; c++) etab[k * 32 + c] = (c < tb.length ? tb[c] : tb[tb.length - 1] * (1 + 1e-3 * (c - tb.length + 1))) * cal; });
      // channels empty at every record (the dead top one) stay off the axis, as Helios drops them
      return { spec: [spec8(flux, n, 32, sp), 32], etab: [etab, 32], eidx: [eidx, 1], etabN: top.map((t, k) => Math.max(2, t + 1)), t: r.t };
    };
    // Helios's ionSpec / elecSpec: ESA reduced mode → GMOM cropped to its ESA range → ESA full mode
    const fallbackSpec = async (sp) => {
      const ion = sp === "dis", red = spectra(ion ? ir : er, 2, ion ? { 32: ION32, 31: ION32, 24: ION24, 23: ION24 } : { 32: ELEC32, 31: ELEC32 }, sp, { desc: true, cal: true });
      if (red) return [red, "ESA reduced mode"];
      const gm = await hapi(`TH${L}_L2_GMOM@${ion ? 2 : 3}`, [`th${l}_pt${ion ? "i" : "e"}rf_en_eflux`], a, b, true).catch(() => none);
      const g = gm.n ? spectra(gm, 0, ion ? { 40: GMOM_I40, 48: GMOM_I48 } : { 46: GMOM_E46 }, sp, { nc: gm.cols.length, below: ion ? 24000 : 26900 }) : null;
      if (g) return [g, "GMOM (its ESA range)"];
      const fu = await hapi(`TH${L}_L2_ESA@${ion ? 0 : 1}`, [`th${l}_pe${ion ? "i" : "e"}f_en_eflux`], a, b, true).catch(() => none);
      const f = fu.n ? spectra(fu, 0, ion ? { 32: ION32 } : { 15: ESAF_E15 }, sp, { nc: fu.cols.length, desc: true }) : null;
      return f ? [f, "ESA full mode"] : [null, null];
    };
    // the moments: MOM, screened; where CDAWeb's MOM is degenerate (< 5 % of a 3-s cadence — Helios then reads the
    // Berkeley archive, which a browser cannot), ESA reduced mode. T: MOM t3_mag → ESA full magt3 → ESA full t3 (scalar).
    const expected = (b - a) / 3000, degenerate = (k) => k < Math.max(3, 0.05 * expected);
    const moments = async (m, r, ion) => {
      const drop = ion ? 8 | 64 : 1 | 4 | 64, sp = ion ? "i" : "e", who = ion ? "ion" : "electron";
      const live = m && m.n ? Array.from({ length: m.n }, (_, i) => i).filter(i => isFinite(m.cols[1][i])) : [];
      let out, onMOM = false;
      if (!degenerate(live.length)) {
        const keep = live.filter(i => { const q = m.cols[0][i]; return !(isFinite(q) && q >= 0 && q < 1e6) || (Math.round(q) & drop) === 0; });
        const flagged = live.length - keep.length, cold = live.filter(i => Math.round(m.cols[0][i]) & 32).length, photo = live.filter(i => Math.round(m.cols[0][i]) & 16).length;
        const pct = (k) => { const p = 100 * k / Math.max(1, live.length); return p < 1 ? "<1 %" : `${p.toFixed(0)} %`; };
        if (flagged) notes.push(`MOM quality flags: dropped ${who} moments ${ion ? "in ESA low-energy mode or a maneuver" : "with no spacecraft potential, in low-energy mode or a maneuver"} (${pct(flagged)} of ${who} records).`);
        if (ion && cold) notes.push(`Kept but flagged: Nᵢ > 2 Nₑ, possible cold ions (${pct(cold)}).`);
        if (!ion && photo) notes.push(`Kept but flagged: Nₑ > 2 Nᵢ, possible photoelectrons (${pct(photo)}).`);
        const pick = (j) => Float32Array.from(keep, i => m.cols[j][i]);
        const v = new Float32Array(keep.length * 3), t3 = [];
        keep.forEach((i, k) => { for (let c = 0; c < 3; c++) { v[k * 3 + c] = m.cols[2 + c][i]; } t3.push([m.cols[5][i], m.cols[6][i], m.cols[7][i]]); });
        out = { t: [Float32Array.from(keep, i => m.t[i]), 1], n: [pick(1), 1], v: [v, 3] };
        onMOM = t3.some(x => x.every(isFinite));
        if (onMOM) out.t3 = t3;
      } else {
        if (r.n) notes.push(`CDAWeb's MOM had no usable ${who} moments in this window; they are ESA reduced-mode moments here (Helios reads the THEMIS archive at UC Berkeley instead).`);
        out = { t: [f32(r.t), 1], n: [f32(r.cols[0]), 1], v: [stack(r.cols, 37, 3), 3] };
        const t3 = Array.from({ length: r.n }, (_, i) => [r.cols[34][i], r.cols[35][i], r.cols[36][i]]);
        if (t3.some(x => x.every(isFinite))) out.t3 = t3;
      }
      const S = set({ t: out.t, n: out.n, v: out.v });
      const fa = (T, tt) => { const k = T.length, tpar = new Float32Array(k), tperp = new Float32Array(k); T.forEach((x, i) => { tpar[i] = x[2]; tperp[i] = 0.5 * (x[0] + x[1]); }); return { tt: f32(tt), tpar, tperp }; };
      let tf = out.t3 ? fa(out.t3, out.t[0]) : null, scalar = null;
      if (!tf) {                                              // ESA full mode: magt3, then the diagonalized t3 as a scalar
        const e = await hapi(`TH${L}_L2_ESA@${ion ? 0 : 1}`, [`th${l}_pe${sp}f_t3`, `th${l}_pe${sp}f_magt3`], a, b, true).catch(() => none);
        const mg = [], eg = [];
        for (let i = 0; i < e.n; i++) { const M = [e.cols[3][i], e.cols[4][i], e.cols[5][i]], G = [e.cols[0][i], e.cols[1][i], e.cols[2][i]]; if (M.every(isFinite)) mg.push([e.t[i], M]); if (G.every(isFinite)) eg.push([e.t[i], G]); }
        if (mg.length) { tf = fa(mg.map(x => x[1]), mg.map(x => x[0])); notes.push(`T${ion ? "ᵢ" : "ₑ"}: ESA full-mode field-aligned temperatures (MOM has none here).`); }
        else if (eg.length) { scalar = { t: f32(eg.map(x => x[0])), v: Float32Array.from(eg, x => (x[1][0] + x[1][1] + x[1][2]) / 3) }; notes.push(`T${ion ? "ᵢ" : "ₑ"}: ESA t3's eigenvalues as a scalar (trace/3), not ∥/⊥ — they are not field-aligned.`); }
      }
      // T on its own clock when it is not MOM's (the panels read tpar/tperp against S.t)
      if (tf && tf.tt.length === S.t.length && tf.tt.every((x, i) => x === S.t[i])) { S.tpar = tf.tpar; S.tperp = tf.tperp; S.cols.tpar = S.cols.tperp = 1; }
      else if (tf) sv[`t${sp}`] = set({ t: [tf.tt, 1], tpar: [tf.tpar, 1], tperp: [tf.tperp, 1] });
      if (scalar) sv[`t${sp}`] = set({ t: [scalar.t, 1], tsc: [scalar.v, 1] });
      return S;
    };
    // moments and spectra keep their own clocks: the moments as dis/des, the spectra as isp/esp
    const [[is, isrc], [es, esrc]] = await Promise.all([fallbackSpec("dis"), fallbackSpec("des")]);
    sv.dis = await moments(mi, ir, true); sv.des = await moments(me, er, false);
    const withN = (o) => { const { etabN, t, ...rest } = o; const S = set({ t: [f32(t), 1], ...rest }); S.etabN = etabN; S.fillGaps = true; return S; };
    if (is) sv.isp = withN(is);
    if (es) sv.esp = withN(es);
    if (isrc && isrc !== "ESA reduced mode") notes.push(`Ion spectrogram from ${isrc}: ESA reduced mode has none here.`);
    if (esrc && esrc !== "ESA reduced mode") notes.push(`Electron spectrogram from ${esrc}: ESA reduced mode has none here.`);
    sv.des.j = current(sv.dis.t, sv.dis.v, sv.des.t, sv.des.n, sv.des.v); sv.des.cols.j = 3;
    if (efi && efi.n) sv.efi = set({ t: [f32(efi.t), 1], e: [stack(efi.cols, 0, 3), 3] });
    // temperatures on a clock of their own, or a scalar, read from their own sets
    const relabel = { ionSpec: { spec: "isp" }, elecSpec: { spec: "esp" } };
    const tKind = (sp, name, sub) => (sv[`t${sp}`] && sv[`t${sp}`].tsc
      ? { title: "T (ESA t3, scalar)", lines: [{ ds: `t${sp}`, name: "tsc", c: 0, color: "#000000", label: `T_{${sub}}` }] }
      : sv[`t${sp}`] ? { lines: [{ ds: `t${sp}`, name: "tperp", c: 0, color: "#d90d0d", label: `T_{${sub}⊥}` }, { ds: `t${sp}`, name: "tpar", c: 0, color: "#001af2", label: `T_{${sub}∥}` }] } : null);
    const ti = tKind("i", "ti", "i"), te = tKind("e", "te", "e");
    if (ti) relabel.ti = ti;
    if (te) relabel.te = te;
    const label = { B: "ARTEMIS-P1", C: "ARTEMIS-P2" }[L] || `THEMIS-${L}`;
    const noPlasma = !sv.isp && !sv.esp && !sv.dis.t.length && !sv.des.t.length;
    const banner = noPlasma ? `CDAWeb has no ${label} plasma data in this window (no MOM, ESA or GMOM records). Where CDAWeb's copy of a day is broken, Helios reads the THEMIS archive at UC Berkeley instead; that archive does not accept requests from a web page.` : null;
    return { sv, bu: null, kind: "tha", label, relabel, banner, empty: !fg.n && !ir.n && !sv.isp,
             notes: "THEMIS L2 (UC Berkeley) via CDAWeb HAPI, live, as Helios reads them: FGM; moments from MOM (spin cadence, non-Q, screened by its quality bits) with field-aligned temperatures; E from FIT; spectra from ESA reduced mode, then GMOM, then ESA full mode." + (notes.length ? " " + notes.join(" ") : "") };
  }
  function interp(t, v, x) {
    const n = t.length;
    if (!n || x < t[0] || x > t[n - 1]) return NaN;
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (t[m] <= x) lo = m; else hi = m; }
    return hi === lo ? v[lo] : v[lo] + (v[hi] - v[lo]) * (x - t[lo]) / (t[hi] - t[lo]);
  }

  // ───────────────────────── Cluster ─────────────────────────
  // Helios's Cluster data-quality rules (ClusterCIS.swift)
  const CIS_FLUX_CEILING = 1e10, MAX_N = 1000, MAX_T_MK = 1160.45;
  const unfill = (x) => (isFinite(x) && Math.abs(x) < 1e30 ? x : NaN);
  /** A record outside physical bounds: N, V and T come from one distribution, so one absurd value drops the set. */
  const plausible = (n, v, ta, te, vmax) => !((isFinite(n) && !(n > 0 && n < MAX_N)) || (v && v.every(isFinite) && !(Math.hypot(...v) <= vmax)) ||
    [ta, te].some(t => isFinite(t) && !(t > 0 && t <= MAX_T_MK)));
  /** Isolated density dropouts: a record more than 20× below the median of the others within ±60 s (at least two). */
  function dropouts(t, n) {
    const out = new Set();
    for (let i = 0; i < t.length; i++) {
      if (!isFinite(n[i])) continue;
      const o = [];
      for (let k = i - 1; k >= 0 && t[i] - t[k] <= 60; k--) if (isFinite(n[k])) o.push(n[k]);
      for (let k = i + 1; k < t.length && t[k] - t[i] <= 60; k++) if (isFinite(n[k])) o.push(n[k]);
      if (o.length < 2) continue;
      o.sort((x, y) => x - y);
      const m = o.length % 2 ? o[o.length >> 1] : (o[o.length / 2 - 1] + o[o.length / 2]) / 2;
      if (n[i] * 20 < m) out.add(i);
    }
    return out;
  }
  /** One CIS 1-D spectrum, energies ascending: glitches above 10¹⁰ and the unswept half of a half-sweep record go to NaN;
   *  zeros stay zeros, drawn blank (clean1D, zerosBlank). */
  function cleanCIS(flux, n, nc) {
    for (let i = 0; i < n * nc; i++) if (isFinite(flux[i]) && flux[i] > CIS_FLUX_CEILING) flux[i] = NaN;
    const h = nc >> 1, low = [...Array(h).keys()], high = low.map(j => nc - h + j), orig = flux.slice();
    const at = (i, j) => orig[i * nc + j];
    const populated = (k, idx) => k >= 0 && k < n && idx.filter(j => at(k, j) > 0).length >= 3;
    for (let i = 0; i < n; i++)
      for (const [miss, other] of [[low, high], [high, low]])
        if (miss.every(j => at(i, j) === 0) && other.some(j => at(i, j) > 0) && (populated(i - 1, miss) || populated(i + 1, miss)))
          for (const j of miss) flux[i * nc + j] = NaN;
    return flux;
  }
  async function cluster(key) {
    const N = +key.slice(1), C = `C${N}`, [a, b] = window_, none = { t: [], cols: [], n: 0 };
    // the ion spectrogram: HIA on C1/C3, CODIF H⁺ on C4, none on C2 (clusterIonSpectrogram)
    const specId = N === 1 || N === 3 ? [`${C}_CP_CIS-HIA_HS_1D_PEF`, `flux__${C}_CP_CIS_HIA_HS_1D_PEF`] : N === 4 ? ["C4_CP_CIS-CODIF_H1_1D_PEF", "flux__C4_CP_CIS_CODIF_H1_1D_PEF"] : null;
    const peace = track(`Cluster-${N} PEACE spectrogram (ESA CSA)`, peaceSpectra(C, a, b)).catch(() => null);
    const cisP = ["N_p", "N_O1", "N_He1", "N_He2", "N_HIA", "V_p_xyz_gse", "V_HIA_xyz_gse", "T_p_par", "T_p_perp", "T_HIA_par", "T_HIA_perp"].map(q => `${q}__${C}_PP_CIS`);
    const [fg, cis, pea, sp, bins] = await Promise.all([
      track(`Cluster-${N} FGM`, hapi(`${C}_CP_FGM_SPIN`, [`B_vec_xyz_gse__${C}_CP_FGM_SPIN`, `B_mag__${C}_CP_FGM_SPIN`], a, b, true).catch(() => none)),
      N === 2 ? none : track(`Cluster-${N} CIS`, hapi(`${C}_PP_CIS`, cisP, a, b, true).catch(() => none)),
      track(`Cluster-${N} PEACE`, hapi(`${C}_PP_PEA`, [`N_e_den__${C}_PP_PEA`, `V_e_xyz_gse__${C}_PP_PEA`, `T_e_par__${C}_PP_PEA`, `T_e_perp__${C}_PP_PEA`], a, b, true).catch(() => none)),
      specId ? hapi(specId[0], [specId[1]], a, b, true).catch(() => none) : none,
      specId ? hapiBins(specId[0], specId[1], true).catch(() => null) : null,
    ]);
    const sv = { fgm: set({ t: [f32(fg.t), 1], b: [stack(fg.cols, 0, 4), 4] }) };
    const col = (r, k) => Float32Array.from(r.cols[k] || [], unfill);
    /** Moments from columns [n, v, T∥, T⊥] (T in MK), with the bounds and the dropout screen applied. */
    const moments = (r, [cn, cv, ca, ce], vmax) => {
      const n = col(r, cn), vx = col(r, cv), vy = col(r, cv + 1), vz = col(r, cv + 2), ta = col(r, ca), te = col(r, ce);
      const drop = dropouts(r.t, n), v = new Float32Array(r.n * 3);
      for (let i = 0; i < r.n; i++) {
        if (drop.has(i) || !plausible(n[i], [vx[i], vy[i], vz[i]], ta[i], te[i], vmax)) { n[i] = vx[i] = vy[i] = vz[i] = ta[i] = te[i] = NaN; }
        v[i * 3] = vx[i]; v[i * 3 + 1] = vy[i]; v[i * 3 + 2] = vz[i];
      }
      if (![n, vx, ta, te].some(c => c.some(isFinite))) return null;
      return set({ t: [f32(r.t), 1], n: [n, 1], v: [v, 3], tpar: [ta.map(x => x * MK_EV), 1], tperp: [te.map(x => x * MK_EV), 1] });
    };
    // the sensor is the spacecraft's (C1/C3 HIA, C4 CODIF), the other only when it alone has data
    let sensor = null;
    if (cis.n) {
      const any = (k) => col(cis, k).some(isFinite), hia = any(4), cod = any(0), prefersHIA = N === 1 || N === 3;
      sensor = prefersHIA ? (hia || !cod ? "HIA" : "CODIF") : (cod || !hia ? "CODIF" : "HIA");
      const m = moments(cis, sensor === "HIA" ? [4, 8, 13, 14] : [0, 5, 11, 12], 3000);
      if (m) sv.dis = m;
      // heavy-ion composition: O⁺, He⁺, He⁺⁺ densities, fill and ≤ 0 dropped rather than plotted; each species keeps only
      // the records it has, so its line joins them as Helios's composition chart does
      const ct = f32(cis.t);
      [["cmpO", 1], ["cmpHe1", 2], ["cmpHe2", 3]].forEach(([k, c]) => {
        const v = col(cis, c), keep = [];
        for (let i = 0; i < cis.n; i++) if (v[i] > 0 && v[i] < MAX_N) keep.push(i);
        if (keep.length) sv[k] = set({ t: [Float32Array.from(keep, i => ct[i]), 1], v: [Float32Array.from(keep, i => v[i]), 1] });
      });
    }
    if (pea.n) { const m = moments(pea, [0, 1, 4, 5], 10000); if (m) sv.des = m; }
    if (sp.n && bins) {                                      // served high → low; ascending here
      const nc = bins.length, flux = new Float32Array(sp.n * nc);
      for (let i = 0; i < sp.n; i++) for (let c = 0; c < nc; c++) flux[i * nc + c] = sp.cols[nc - 1 - c] ? unfill(sp.cols[nc - 1 - c][i]) : NaN;
      cleanCIS(flux, sp.n, nc);
      if (flux.some(isFinite)) sv.isp = set({ t: [f32(sp.t), 1], spec: [spec8(flux, sp.n, nc, "dis", true), nc], etab: [Float32Array.from(bins.slice().reverse()), nc], eidx: [new Uint8Array(sp.n), 1] });
    }
    const esp = await peace;
    if (esp) sv.esp = esp;
    if (sv.dis && sv.des) { sv.des.j = current(sv.dis.t, sv.dis.v, sv.des.t, sv.des.n, sv.des.v); sv.des.cols.j = 3; }
    const relabel = { ionSpec: { spec: "isp", label: N === 4 ? "CODIF H^{+}" : "HIA ions", title: N === 4 ? "CODIF H⁺ spectrogram" : "HIA ion spectrogram" } };
    return { sv, bu: null, kind: "c4", label: `Cluster-${N}`, relabel, empty: !fg.n,
             banner: N === 2 ? "Cluster-2 carries no working CIS instrument: there are no ion density, velocity, temperature or ion-spectrogram panels for this spacecraft, at any epoch. The field and PEACE electron panels are unaffected." : null,
             notes: `Cluster via CDAWeb HAPI, live, as Helios reads it: FGM spin; CIS prime-parameter moments from ${sensor || "no CIS sensor"}` +
                    `${N === 2 ? " (Cluster-2 has no working CIS)" : ""} and CIS composition; PEACE prime-parameter moments; the ${N === 4 ? "CODIF H⁺" : "HIA"} ion spectrogram; ` +
                    "PEACE's pitch-angle DEFlux from ESA's Cluster Science Archive. Records outside physical bounds, isolated density dropouts and CIS glitch cells are dropped, as in Helios." };
  }

  // ───────────────────────── OMNI and the L1 monitors (Helios's HSODataClient choices) ─────────────────────────
  const KELVIN_EV = 8.617333e-5, thermalEV = (w) => 5.2197e-3 * w * w;    // K → eV; proton thermal speed (km/s) → eV
  const fillNaN = (col, fill) => (col ? Float32Array.from(col, x => (x >= fill * 0.999 || x <= -1e30 ? NaN : x)) : new Float32Array(0));
  /** OMNI's 1-minute data at the bow shock's nose, as Helios's OMNI window rows (OmniPanel.rows). */
  async function omniWindow() {
    const [a, b] = window_;
    const P = ["F", "BX_GSE", "BY_GSM", "BZ_GSM", "flow_speed", "proton_density", "T", "Pressure", "E", "Beta", "Mach_num", "Mgs_mach_num", "AE_INDEX", "SYM_H", "PC_N_INDEX"];
    const F = [9999.99, 9999.99, 9999.99, 9999.99, 99999.9, 999.99, 9999999, 99.99, 999.99, 999.99, 999.9, 99.9, 99999, 99999, 999.99];
    const [r2, r1] = await track("OMNI window", Promise.all([hapi("OMNI_HRO2_1MIN", P, a - 3600e3, b + 3600e3, true).catch(() => null),
                                                             hapi("OMNI_HRO_1MIN", P, a - 3600e3, b + 3600e3, true)]));
    // HRO2 where it has the minute, HRO filling its ends (OmniPanel)
    let r = r1;
    if (r2 && r2.n) {
      const t2 = new Set(Array.from(r2.t, x => Math.round(x))), keep = [];
      for (let i = 0; i < r1.n; i++) if (!t2.has(Math.round(r1.t[i]))) keep.push(i);
      const idx = Array.from({ length: r2.n }, (_, i) => [r2.t[i], 2, i]).concat(keep.map(i => [r1.t[i], 1, i])).sort((p, q) => p[0] - q[0]);
      r = { n: idx.length, t: Float64Array.from(idx, x => x[0]), cols: P.map((_, k) => Float64Array.from(idx, ([, w, i]) => (w === 2 ? r2 : r1).cols[k][i])) };
    }
    r.t = Float64Array.from(r.t, x => x + 30);                    // each record at the middle of its minute
    const c = P.map((_, k) => fillNaN(r.cols[k], F[k]));
    for (let i = 0; i < r.n; i++) if (c[5][i] > 0 && c[4][i] > 0) c[7][i] = 2e-6 * c[5][i] * c[4][i] ** 2;   // Pdyn from n and V
    const n = r.n, r0 = new Float32Array(n), tp = new Float32Array(n);
    for (let i = 0; i < n; i++) {                             // Shue et al. (1998) stand-off, from the minute's Bz and pressure
      r0[i] = (10.22 + 1.29 * Math.tanh(0.184 * (c[3][i] + 8.14))) * Math.pow(c[7][i], -1 / 6.6);
      tp[i] = c[6][i];                                         // K, on a log axis (OmniPanel)
    }
    const one = (a_) => [a_, 1];
    const sv = { omni: set({ t: one(f32(r.t)), bt: one(c[0]), bx: one(c[1]), by: one(c[2]), bz: one(c[3]), v: one(c[4]), np: one(c[5]), tp: one(tp),
                             pdyn: one(c[7]), ey: one(c[8]), beta: one(c[9]), ma: one(c[10]), mms: one(c[11]), ae: one(c[12]), symh: one(c[13]), pcn: one(c[14]), r0: one(r0) }) };
    return { sv, bu: null, kind: "omni", label: "OMNI", empty: !r.n,
             notes: "OMNI 1-minute (NASA SPDF, via CDAWeb HAPI): IMF and plasma from the L1 monitors, time-shifted to the bow shock's nose; R₀ from Shue et al. (1998)." };
  }
  /** The Earth click's "Geomagnetic indices" window (Helios's GeoIndicesPanelView over fetchOmniIndices): ±3 days of
   *  OMNI's 1-min AE, AL, AU and SYM-H and its Mach pair, from the first of HRO2 and HRO with rows in the span, and the
   *  OMNI2 hourly Kp (one value per UTC 3-h block, stamped at the block's start) and Dst. The window opens at ±2 days. */
  const IDX_HALF = 3 * 86400, OMNI_SC = { 51: "Wind", 52: "Wind", 71: "ACE", 60: "Geotail", 50: "IMP 8" };
  async function indicesWindow() {
    const a = AT - IDX_HALF * 1000, b = AT + IDX_HALF * 1000, nil = { t: new Float64Array(0), cols: [], n: 0 };
    const omni = async (P) => {                              // HRO2, then HRO where HRO2 has nothing in the span
      for (const id of ["OMNI_HRO2_1MIN", "OMNI_HRO_1MIN"]) { const r = await hapi(id, P, a, b, true).catch(() => null); if (r && r.n) return r; }
      return nil;
    };
    const [ix, mach, k2] = await track("Geomagnetic indices (OMNI)", Promise.all([
      omni(["AE_INDEX", "AL_INDEX", "AU_INDEX", "SYM_H"]), omni(["IMF", "PLS", "Mach_num", "Mgs_mach_num"]),
      hapi("OMNI2_H0_MRG1HR", ["KP1800", "DST1800"], a, b, true).catch(() => nil)]));
    const keep = (r, j, ok) => { const t = [], v = []; for (let i = 0; i < r.n; i++) { const x = r.cols[j][i]; if (ok(x)) { t.push(r.t[i]); v.push(x); } } return set({ t: [f32(t), 1], v: [f32(v), 1] }); };
    const nT = (x) => isFinite(x) && Math.abs(x) < 30000, sv = {};
    if (ix.n) { sv.giAe = keep(ix, 0, nT); sv.giAl = keep(ix, 1, nT); sv.giAu = keep(ix, 2, nT); sv.giSymh = keep(ix, 3, nT); }
    if (mach.n) { sv.giMa = keep(mach, 2, x => x > 0 && x < 900); sv.giMms = keep(mach, 3, x => x > 0 && x < 99); }
    if (k2.n) {
      sv.giDst = keep(k2, 1, x => isFinite(x) && Math.abs(x) < 9999);
      const seen = new Set(), t = [], v = [];
      for (let i = 0; i < k2.n; i++) {                       // Kp × 10 in thirds; fill 99; the block's value twice → a staircase
        const c = k2.cols[0][i];
        if (!(c >= 0 && c < 99)) continue;
        const blk = Math.floor((T0 / 1000 + k2.t[i]) / 10800);
        if (seen.has(blk)) continue;
        seen.add(blk);
        const s0 = blk * 10800 - T0 / 1000, kp = Math.floor(Math.round(c) / 10) + Math.floor((Math.round(c) % 10) / 3) / 3;
        t.push(s0, s0 + 10799); v.push(kp, kp);
      }
      const o = t.map((_, i) => i).sort((p, q) => t[p] - t[q]);
      sv.giKp = set({ t: [Float32Array.from(o, i => t[i]), 1], v: [Float32Array.from(o, i => v[i]), 1] });
    }
    // who measured the wind behind M_A (OmniSourceSpan.summary): the distinct IMF and plasma monitors, in order
    const names = (j) => { const out = []; for (let i = 0; i < mach.n; i++) { const c = Math.round(mach.cols[j][i]), nm = c >= 1 && c !== 99 ? OMNI_SC[c] || `OMNI #${c}` : null; if (nm && !out.includes(nm)) out.push(nm); } return out.join(" → "); };
    const im = mach.n ? names(0) : "", pl = mach.n ? names(1) : "";
    const who = im && pl ? (im === pl ? `${im} (IMF & plasma)` : `${im} (IMF) · ${pl} (plasma)`) : im ? `${im} (IMF)` : pl ? `${pl} (plasma)` : "source not reported";
    return { sv, bu: null, kind: "idx", label: "Geomagnetic indices", empty: !Object.keys(sv).length,
             span: [HALF - IDX_HALF, HALF + IDX_HALF], wm: 2880,
             banner: mach.n ? `M_A from OMNI · ${who} · shifted to the bow-shock nose` : null,
             notes: "Geomagnetic indices, as Helios's Earth window: OMNI 1-minute AE, AL, AU and SYM-H and the Alfvén and magnetosonic Mach numbers (HRO2, then HRO), and OMNI2's hourly Kp (one value per 3-hour block) and Dst, via CDAWeb HAPI. OMNI's indices lag real time by weeks to months." };
  }
  /** One L1 monitor, as Helios's fetchAce / fetchWind / fetchDscovr: science products first, browse products where
   *  they stop. Rows: B (GSE), Nₚ, V (GSE), |V|, Tₚ. */
  async function l1Window(key) {
    const [a, b] = window_, name = { ace: "ACE", wind: "Wind", dscovr: "DSCOVR" }[key];
    let B = null, rows = [];                                // rows: [t, n, vx, vy, vz, speed, T eV]
    const vec = (r, j = 0) => r.n ? { t: r.t, x: fillNaN(r.cols[j], 1e30), y: fillNaN(r.cols[j + 1], 1e30), z: fillNaN(r.cols[j + 2], 1e30) } : null;
    if (key === "ace") {
      const nil = { t: [], cols: [], n: 0 }, [m, sw] = await Promise.all([hapi("AC_H0_MFI", ["BGSEc"], a, b, true).catch(() => nil), hapi("AC_H0_SWE", ["Np", "Vp", "Tpr", "V_GSE"], a, b, true).catch(() => nil)]);
      B = vec(m) || vec(await hapi("AC_K0_MFI", ["BGSEc"], a, b, true));
      if (sw.n) for (let i = 0; i < sw.n; i++) rows.push([sw.t[i], sw.cols[0][i], sw.cols[3][i], sw.cols[4][i], sw.cols[5][i], sw.cols[1][i], sw.cols[2][i] * KELVIN_EV]);
      else { const k = await hapi("AC_K0_SWE", ["Np", "Vp", "Tpr"], a, b, true); for (let i = 0; i < k.n; i++) rows.push([k.t[i], k.cols[0][i], NaN, NaN, NaN, k.cols[1][i], k.cols[2][i] * KELVIN_EV]); }
    } else if (key === "wind") {
      const nil = { t: [], cols: [], n: 0 }, [m, sw] = await Promise.all([hapi("WI_H0_MFI@0", ["BGSE"], a, b, true).catch(() => nil),
        hapi("WI_H1_SWE", ["fit_flag", "Proton_V_nonlin", "Proton_VX_nonlin", "Proton_VY_nonlin", "Proton_VZ_nonlin", "Proton_W_nonlin", "Proton_Np_nonlin"], a, b, true).catch(() => nil)]);
      B = vec(m) || vec(await hapi("WI_K0_MFI", ["BGSEc"], a, b, true));
      const ok = (x) => (x < 99990 ? x : NaN);
      for (let i = 0; i < sw.n; i++) if (sw.cols[0][i] >= 1) rows.push([sw.t[i], ok(sw.cols[6][i]), ok(sw.cols[2][i]), ok(sw.cols[3][i]), ok(sw.cols[4][i]), ok(sw.cols[1][i]), thermalEV(ok(sw.cols[5][i]))]);
      if (!rows.length) {
        const k = await hapi("WI_K0_SWE", ["V_GSE", "THERMAL_SPD", "Np"], a, b, true);
        for (let i = 0; i < k.n; i++) rows.push([k.t[i], k.cols[4][i], k.cols[0][i], k.cols[1][i], k.cols[2][i], Math.hypot(k.cols[0][i], k.cols[1][i], k.cols[2][i]), thermalEV(k.cols[3][i])]);
      }
    } else {
      const nil = { t: [], cols: [], n: 0 }, [m, fc] = await Promise.all([hapi("DSCOVR_H0_MAG", ["B1GSE"], a, b, true).catch(() => nil), hapi("DSCOVR_H1_FC", ["V_GSE", "THERMAL_SPD", "Np", "THERMAL_TEMP"], a, b, true).catch(() => nil)]);
      B = vec(m);
      for (let i = 0; i < fc.n; i++) {
        const tK = fc.cols[5][i];
        rows.push([fc.t[i], fc.cols[4][i], fc.cols[0][i], fc.cols[1][i], fc.cols[2][i], Math.hypot(fc.cols[0][i], fc.cols[1][i], fc.cols[2][i]), tK > 0 ? tK * KELVIN_EV : thermalEV(fc.cols[3][i])]);
      }
    }
    const sv = {};
    if (B) {
      const n = B.t.length, b4 = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) { b4[i * 4] = B.x[i]; b4[i * 4 + 1] = B.y[i]; b4[i * 4 + 2] = B.z[i]; b4[i * 4 + 3] = Math.hypot(B.x[i], B.y[i], B.z[i]); }
      sv.fgm = set({ t: [f32(B.t), 1], b: [b4, 4] });
    }
    if (rows.length) {
      const n = rows.length, col = (k) => Float32Array.from(rows, r => (isFinite(r[k]) && Math.abs(r[k]) < 1e30 && r[k] > -1e30 ? r[k] : NaN)), v = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) { const x = rows[i][2 + c]; v[i * 3 + c] = isFinite(x) && Math.abs(x) < 1e30 ? x : NaN; }
      sv.dis = set({ t: [col(0), 1], n: [col(1), 1], v: [v, 3], speed: [col(5), 1], tp: [col(6), 1] });
    }
    track(`${name} (L1)`, Promise.resolve(sv.fgm || sv.dis ? {} : { empty: true }));
    return { sv, bu: null, kind: "l1", label: name, empty: !sv.fgm && !sv.dis,
             notes: `${name} at L1 via CDAWeb HAPI, live, at the spacecraft's own time (not shifted to Earth). ${key === "dscovr" ? "DSCOVR's Faraday-cup plasma is on CDAWeb for 2016-06 to 2019-06 only." : key === "ace" ? "SWE H0 plasma ends 2024-07-09; the K0 browse products cover 2017-07 onward." : "SWE H1 non-linear proton fits, K0 where they stop."}` };
  }

  // ───────────────────────── GOES (Helios's GOES adapter: LASP's Space Weather Portal LaTiS) ─────────────────────────
  const LATIS = "https://lasp.colorado.edu/space-weather-portal/latis/dap";
  /** One LaTiS dataset over [a, b] as rows of numbers (time first, s after T0); fill (≤ −99999) as NaN. */
  function latis(ds, a, b) {
    const t0 = iso(a).slice(0, 19), t1 = iso(b).slice(0, 19);
    return slot(async () => {
      const r = await get(`${LATIS}/${ds}.csv?time%3E=${t0}&time%3C=${t1}&format_time(yyyy-MM-dd%27T%27HH:mm:ss%27Z%27)`);
      if (!r.ok) return [];
      const text = await r.text();
      bytes += text.length; emit();
      return text.split("\n").slice(1).filter(Boolean).map(ln => {
        const f = ln.split(",");
        return [sec(Date.parse(f[0])), ...f.slice(1).map(x => { const v = parseFloat(x); return isFinite(v) && v > -99999 && Math.abs(v) < 1e30 ? v : NaN; })];
      }).filter(r => isFinite(r[0]));
    }, true);
  }
  /** GOES-16 … 19, as Helios's fetchGoes: the named satellite's own NOAA L2 1-min field in GSE where LaTiS has it
   *  (~2018 → ~2025-04), else SWPC's primary (secondary for GOES-18) feed in the payload Hp/He/Hn frame; integral
   *  particle fluxes from that feed (they exist only per feed); the named satellite's XRS. */
  async function goesWindow(key) {
    const sat = key.slice(1), [a, b] = window_, feed = sat === "18" ? "goess" : "goesp", feedName = feed === "goess" ? "SWPC secondary feed" : "SWPC primary feed";
    const [own, part, xrs] = await Promise.all([
      sat === "19" ? Promise.resolve([]) : track(`GOES-${sat} magnetometer (NOAA L2)`, latis(`noaa_goes${sat}_magn_1m`, a, b)),
      track(`GOES ${feed === "goess" ? "secondary" : "primary"} feed particles`, latis(`${feed}_part_flux_P5M`, a, b)),
      track(`GOES-${sat} X-rays (XRS)`, latis(`noaa_goes${sat}_xrs_1m`, a, b)),
    ]);
    let rows = own.filter(r => [1, 2, 3].every(c => Math.abs(r[c]) < 9000)), fromFeed = false;
    if (!rows.length) {
      rows = (await track(`GOES ${feed === "goess" ? "secondary" : "primary"} feed magnetometer`, latis(`${feed}_mag_p1m`, a, b))).map(r => [r[0], r[1], r[2], r[3], NaN, NaN, NaN, r[4]]);
      fromFeed = rows.length > 0;
    }
    const sv = {};
    if (rows.length) {
      const n = rows.length, b4 = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) { const r = rows[i]; b4[i * 4] = r[1]; b4[i * 4 + 1] = r[2]; b4[i * 4 + 2] = r[3]; b4[i * 4 + 3] = isFinite(r[7]) ? r[7] : Math.hypot(r[1], r[2], r[3]); }
      sv.fgm = set({ t: [Float32Array.from(rows, r => r[0]), 1], b: [b4, 4] });
    }
    // integral fluxes, ascending by threshold: P1 P5 P10 P30 P50 (P60) P100 (P500); E 0.8, 2, 4 MeV
    const many = (cols) => {
      const keep = cols.filter(c => part.some(r => r[c] > 0));
      if (!keep.length) return null;
      const n = part.length, f = new Float32Array(n * keep.length);
      part.forEach((r, i) => keep.forEach((c, k) => { f[i * keep.length + k] = r[c] > 0 ? r[c] : NaN; }));
      return { set: set({ t: [Float32Array.from(part, r => r[0]), 1], f: [f, keep.length] }), keep };
    };
    const P = many([1, 2, 3, 4, 5, 10, 6, 11]), E = many([7, 8, 9]);
    const PL = { 1: ">1", 2: ">5", 3: ">10", 4: ">30", 5: ">50", 10: ">60", 6: ">100", 11: ">500" }, EL = { 7: ">0.8", 8: ">2", 9: ">4" };
    if (P) sv.gpro = P.set;
    if (E) sv.gele = E.set;
    if (xrs.length) {
      const n = xrs.length, f = new Float32Array(n * 2);
      // long (1–8 Å) and short (0.5–4 Å): the quality-masked columns, or the raw value where its flag is 0 (Helios)
      const pick = (raw, flag, masked) => (masked > 0 ? masked : flag === 0 && raw > 0 ? raw : NaN);
      xrs.forEach((r, i) => { f[i * 2] = pick(r[2], r[4], r[6]); f[i * 2 + 1] = pick(r[1], r[3], r[5]); });
      sv.gxrs = set({ t: [Float32Array.from(xrs, r => r[0]), 1], f: [f, 2] });
    }
    const PCOL = ["#001af2", "#d90d0d", "#008000", "#ff9900", "#7f33b3", "#008c8c"], ECOL = PCOL;   // Helios's fluxPalette, in order of appearance
    const relabel = {
      gP: { lines: (P ? P.keep : []).map((c, k) => ({ ds: "gpro", name: "f", c: k, color: PCOL[k % 6], label: `${PL[c]} MeV` })), title: `Protons >E, ${feed === "goess" ? "secondary" : "primary"} feed`, label: `Protons >E, ${feed === "goess" ? "secondary" : "primary"} feed` },
      gE: { lines: (E ? E.keep : []).map((c, k) => ({ ds: "gele", name: "f", c: k, color: ECOL[k % 6], label: `${EL[c]} MeV` })), title: `Electrons >E, ${feed === "goess" ? "secondary" : "primary"} feed`, label: `Electrons >E, ${feed === "goess" ? "secondary" : "primary"} feed` },
    };
    if (fromFeed) relabel.b = { title: "B — payload frame (Hp, He, Hn)", lines: [{ ds: "fgm", name: "b", c: 3, color: "#151515", label: "|B|" },
      { ds: "fgm", name: "b", c: 0, color: "#2a46d6", label: "H_{p}", vec: true }, { ds: "fgm", name: "b", c: 1, color: "#1e8a36", label: "H_{e}", vec: true },
      { ds: "fgm", name: "b", c: 2, color: "#d8282a", label: "H_{n}", vec: true }] };
    return { sv, bu: null, kind: "goes", label: `GOES-${sat}`, relabel, empty: !sv.fgm && !sv.gpro && !sv.gxrs,
             notes: `GOES-${sat} via LASP's Space Weather Portal (LaTiS), as Helios reads it. ${fromFeed ? `The field is the ${feedName}'s, in the payload Hp/He/Hn frame: GOES-${sat}'s own L2 magnetometer file is not available for this interval.` : `The field is GOES-${sat}'s own NOAA L2 1-minute product, in GSE.`} Integral particle fluxes exist only as the ${feedName}, which may be another satellite.` };
  }

  // ───────────────────────── all-sky imagers: which cameras imaged that day, and their keograms (UCalgary) ─────────────────────────
  const UC_API = "https://api.phys.ucalgary.ca/api/v1/data_distribution/urls";
  const KEO_DATASET = { themis: "THEMIS_ASI_DAILY_KEOGRAM_JPG", rego: "REGO_DAILY_KEOGRAM_JPG", trexRGB: "TREX_RGB_DAILY_KEOGRAM", smile: "SMILE_ASI_DAILY_KEOGRAM" };
  /** Each network's daily keograms for the moment's UT day: { network: { site: url } }, null where not answered. */
  async function keogramLists() {
    const d = new Date(AT).toISOString().slice(0, 10), out = {};
    await Promise.all(Object.entries(KEO_DATASET).map(async ([net, ds]) => {
      try {
        const r = await get(`${UC_API}?name=${ds}&start=${d}T00:00:00&end=${d}T23:59:59`, undefined, 15000);
        if (!r.ok) { out[net] = null; return; }
        const map = {};
        for (const u of (await r.json()).urls || []) {
          const m = /\/\d{8}__([a-z0-9]{4})_[^/]*-keogram[^/]*$/i.exec(u);
          if (m && /^https:\/\/data\.phys\.ucalgary\.ca\//.test(u)) map[m[1].toLowerCase()] = u;
        }
        out[net] = map;
      } catch (e) { out[net] = null; }
    }));
    return out;
  }

  // ───────────────────────── the sky images: THEMIS one-minute frames laid on the globe (Helios's AuroraLayer) ─────────────────────────
  // UCalgary's hourly montages (10 × 6 tiles of 64 × 64, one a minute) through each installation's skymap, reduced by
  // helios_website_tools/prepare_asi_skymaps.py to the tile: corners at 110 km and elevations. Each frame on Helios's
  // scale (SkyImageFrame.values): gray → counts on the montage's log curve, ÷ the frame's median sky, × 64/254.
  const MONTAGE_DS = "THEMIS_ASI_HOURLY_MONTAGE_JPG";
  let skyIndex = null;
  const montageLists = new Map(), montageImgs = new Map(), skymaps = new Map(), frames = new Map();
  /** One UT day's hourly montages for every THEMIS site: { site: { hour: url } }. */
  function montageList(day) {
    if (!montageLists.has(day)) montageLists.set(day, (async () => {
      const r = await get(`${UC_API}?name=${MONTAGE_DS}&start=${day}T00:00:00&end=${day}T23:59:59`, undefined, 15000);
      if (!r.ok) return {};
      const out = {};
      for (const u of (await r.json()).urls || []) {
        const m = /\/ut(\d\d)\/\d{8}_\d\d_([a-z]{4})_themis\d+_full-montage\.pgm\.jpg$/i.exec(u);
        if (m && /^https:\/\/data\.phys\.ucalgary\.ca\//.test(u)) (out[m[2].toLowerCase()] = out[m[2].toLowerCase()] || {})[+m[1]] = u;
      }
      return out;
    })().catch(() => ({})));
    return montageLists.get(day);
  }
  /** The installation's reduced skymap for a date: corners (65 × 65 lat, lon) and elevations (64 × 64). */
  async function skymap(site, ymd) {
    skyIndex = skyIndex || fetch("assets/data/live/skymaps/themis.json").then(r => r.json()).catch(() => ({}));
    const list = (await skyIndex)[site] || [];
    let pick = null;
    for (const [start, end, file] of list) if (start <= ymd && (end === "+" || end >= ymd) && (!pick || start >= pick[0])) pick = [start, file];
    if (!pick) for (const [start, , file] of list) if (start <= ymd && (!pick || start >= pick[0])) pick = [start, file];
    if (!pick) return null;
    if (!skymaps.has(pick[1])) skymaps.set(pick[1], fetch(`assets/data/live/skymaps/themis/${pick[1]}`).then(r => r.arrayBuffer()).then((buf) => {
      const q = new Int16Array(buf, 0, 65 * 65 * 2), el = new Uint8Array(buf, 65 * 65 * 4, 64 * 64);
      const lat = new Float32Array(65 * 65), lon = new Float32Array(65 * 65);
      for (let i = 0; i < 65 * 65; i++) { lat[i] = q[i] === -32768 ? NaN : q[i] / 100; lon[i] = q[65 * 65 + i] === -32768 ? NaN : q[65 * 65 + i] / 100; }
      const elev = Float32Array.from(el, e => (e === 255 ? NaN : e));
      // each corner's elevation as the camera sees it (spherical Earth, emission at 110 km), from the zenith's place:
      // the rim pixels whose own (block-mean) elevation passes 10° can still reach a corner far below it
      let zi = 0;
      for (let i = 1; i < 4096; i++) if (!(elev[zi] >= elev[i]) && isFinite(elev[i])) zi = i;
      const zr = Math.floor(zi / 64), zc = zi % 64, zc4 = [zr * 65 + zc, zr * 65 + zc + 1, (zr + 1) * 65 + zc, (zr + 1) * 65 + zc + 1];
      const zlat = zc4.reduce((a, i) => a + lat[i], 0) / 4 * DEG, zlon = zc4.reduce((a, i) => a + lon[i], 0) / 4 * DEG, k = 6371.2 / (6371.2 + 110);
      const cornerEl = new Float32Array(65 * 65).fill(NaN);
      for (let i = 0; i < 65 * 65; i++) {
        if (!isFinite(lat[i])) continue;
        const a = lat[i] * DEG, b = lon[i] * DEG, cg = Math.sin(a) * Math.sin(zlat) + Math.cos(a) * Math.cos(zlat) * Math.cos(b - zlon), g = Math.acos(Math.max(-1, Math.min(1, cg)));
        cornerEl[i] = Math.atan2(cg - k, Math.sin(g)) / DEG;
      }
      // the 10° rim: the ground circle the camera sees at 10° elevation, at 110 km (the clip that smooths the edge)
      const e10 = 10 * DEG, gam = Math.acos(k * Math.cos(e10)) - e10, rim = [];
      for (let j = 0; j <= 96; j++) {
        const az = j / 96 * 2 * Math.PI;
        const la2 = Math.asin(Math.sin(zlat) * Math.cos(gam) + Math.cos(zlat) * Math.sin(gam) * Math.cos(az));
        const lo2 = zlon + Math.atan2(Math.sin(az) * Math.sin(gam) * Math.cos(zlat), Math.cos(gam) - Math.sin(zlat) * Math.sin(la2));
        rim.push([la2 / DEG, lo2 / DEG]);
      }
      return { lat, lon, el: elev, cornerEl, rim };
    }).catch(() => null));
    return skymaps.get(pick[1]);
  }
  /** A montage's pixels (gray), decoded once. */
  function montagePixels(url) {
    if (!montageImgs.has(url)) montageImgs.set(url, new Promise((res) => {
      const im = new Image();
      im.crossOrigin = "anonymous";
      im.onload = () => {
        const c = document.createElement("canvas"); c.width = im.width; c.height = im.height;
        const g = c.getContext("2d"); g.drawImage(im, 0, 0);
        const d = g.getImageData(0, 0, im.width, im.height).data, gray = new Uint8Array(im.width * im.height);
        for (let i = 0; i < gray.length; i++) gray[i] = d[i * 4];
        bytes += 120e3; emit();
        res({ w: im.width, h: im.height, gray });
      };
      im.onerror = () => res(null);
      im.src = url;
    }));
    if (montageImgs.size > 120) montageImgs.delete(montageImgs.keys().next().value);   // the oldest hours go
    return montageImgs.get(url);
  }
  const counts = (g) => 1000 * Math.pow(10, (g - 109.1) / 195.7);
  const isStamp = (r, c) => r >= 50 && r < 64 && c >= 12 && c < 48;          // the HH:MM burned into each tile
  /** One site's frame at a time (s after T0): { lat, lon (corners), value (64 × 64, NaN off the sky) } or null. */
  function skyFrame(site, t) {
    const ms = T0 + t * 1000, d = new Date(ms), day = d.toISOString().slice(0, 10), hour = d.getUTCHours(), minute = d.getUTCMinutes();
    const key = `${site}|${day}|${hour}|${minute}`;
    if (frames.has(key)) return frames.get(key);
    const p = (async () => {
      const [list, map] = await Promise.all([montageList(day), skymap(site, day.replace(/-/g, ""))]);
      const url = list[site] && list[site][hour];
      if (!url || !map) return null;
      const img = await montagePixels(url);
      if (!img || img.w !== 640 || img.h !== 384) return null;
      const x0 = (minute % 10) * 64, y0 = Math.floor(minute / 10) * 64, c = new Float64Array(64 * 64).fill(NaN), sky = [];
      const draw = new Uint8Array(64 * 64);                  // drawn: any corner above 10° (the rim clip trims the rest)
      let sum = 0, sq = 0;
      for (let r = 0; r < 64; r++) for (let k = 0; k < 64; k++) {
        const g = img.gray[(y0 + r) * 640 + x0 + k];
        sum += g; sq += g * g;
        const e = map.el[r * 64 + k], ce = map.cornerEl, i0 = r * 65 + k;
        if (!(Math.max(ce[i0], ce[i0 + 1], ce[i0 + 65], ce[i0 + 66]) >= 10)) continue;
        draw[r * 64 + k] = 1;
        if (isStamp(r, k)) continue;                           // under the time stamp: drawn at the median sky (below)
        c[r * 64 + k] = counts(g);
        if (e >= 10) sky.push(c[r * 64 + k]);                  // the median from the sky above 10°, as Helios
      }
      const mean = sum / 4096;
      if (sky.length < 64 || (mean >= 250 && Math.sqrt(Math.max(0, sq / 4096 - mean * mean)) < 2)) return null;   // not imaged that minute
      sky.sort((a, b) => a - b);
      const k = (64 / 254) / Math.max(1, sky[sky.length >> 1]), value = new Float32Array(64 * 64);
      // sky that only the stamp covers is drawn at the median level, as Helios's SkyRaster does
      for (let i = 0; i < 4096; i++) value[i] = !draw[i] ? NaN : isFinite(c[i]) ? Math.min(1, c[i] * k) : 64 / 254;
      return { lat: map.lat, lon: map.lon, value, rim: map.rim };
    })().catch(() => null);
    frames.set(key, p);
    if (frames.size > 600) frames.delete(frames.keys().next().value);
    return p;
  }

  // ───────────────────────── ESA's Cluster Science Archive: PEACE, as CEF in a gzipped tar ─────────────────────────
  const CSA = "https://csa.esac.esa.int/csa-sl-tap/data";
  /** The .cef files in a product delivery (a .tgz). */
  async function csaFiles(dataset, a, b) {
    const url = `${CSA}?RETRIEVAL_TYPE=product&DATASET_ID=${dataset}&START_DATE=${iso(a)}&END_DATE=${iso(b)}&DELIVERY_FORMAT=CEF&DELIVERY_INTERVAL=ALL`;
    const gz = await slot(async () => { const r = await get(url, undefined, 90000); if (!r.ok) throw new Error(`CSA ${r.status}`); return r.arrayBuffer(); }, true);
    bytes += gz.byteLength; emit();
    if (new Uint8Array(gz)[0] !== 0x1f) return [];          // not gzip: no data for the interval
    const tar = new Uint8Array(await new Response(new Blob([gz]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer());
    const files = [], dec = new TextDecoder(), str = (x, y) => dec.decode(tar.subarray(x, y)).replace(/\0[\s\S]*$/, "");
    let longName = null;
    for (let o = 0; o + 512 <= tar.length;) {                // ustar: a 512-byte header, the file, padding to 512
      let name = str(o, o + 100);
      if (!name) break;
      const size = parseInt(str(o + 124, o + 136).trim() || "0", 8), type = String.fromCharCode(tar[o + 156]);
      if (type === "L") { longName = str(o + 512, o + 512 + size); o += 512 + Math.ceil(size / 512) * 512; continue; }   // GNU: the next entry's long name
      if (longName) { name = longName; longName = null; }
      if (/\.cef$/i.test(name)) files.push(dec.decode(tar.subarray(o + 512, o + 512 + size)));
      o += 512 + Math.ceil(size / 512) * 512;
    }
    return files;
  }
  /** One CEF file: the record-varying variables' places from the header (a variable with DATA there is a constant),
   *  then each record's tokens. Returns { consts, layout, records }. */
  function parseCEF(txt) {
    const cut = txt.indexOf("DATA_UNTIL"), head = txt.slice(0, cut), layout = {}, consts = {};
    let off = 0;
    for (const m of head.matchAll(/START_VARIABLE\s*=\s*(\S+)([\s\S]*?)END_VARIABLE/g)) {
      const name = m[1].split("__")[0], body = m[2], sz = /SIZES\s*=\s*([\d,\s]+)/.exec(body);
      const n = sz ? sz[1].split(",").map(x => +x.trim() || 1).reduce((p, q) => p * q, 1) : 1, data = /^\s*DATA\s*=\s*([^\n!]+(?:\n[ \t]+[-\d.,eE \t]+)*)/m.exec(body);
      if (data) consts[name] = data[1].replace(/[\s"]/g, "").split(",").filter(Boolean).map(Number);
      else { layout[name] = [off, n]; off += n; }
    }
    const body = txt.slice(txt.indexOf("\n", cut) + 1), records = [];
    for (const r of body.split("$")) {
      const line = r.trim();
      if (!line || line[0] === "!") continue;
      const tok = line.replace(/\n/g, " ").split(",").map(x => x.trim()).filter(Boolean);
      if (tok.length === off) records.push(tok);
    }
    return { consts, layout, records };
  }
  /** PEACE's pitch-angle DEFlux, averaged over pitch angle (sin-weighted) into an omni spectrogram on its own clock, as
   *  the demo's prepare_hso_missions.py builds Cluster 4's; energy tables per record, ascending. */
  async function peaceSpectra(C, a, b) {
    const files = await csaFiles(`${C}_CP_PEA_PITCH_SPIN_DEFlux`, a, b);
    if (!files.length) return null;
    const T = [], rows = [], tabs = [], keys = new Map(), eidx = [];
    for (const f of files) {
      const { consts, layout, records } = parseCEF(f), pitch = consts.Sweep_PitchAngle;
      const [oE, nE] = layout.Sweep_Energy || [], [oD, nD] = layout.Data || [];
      if (!pitch || oE === undefined || oD === undefined) continue;
      const np = pitch.length, ne = nE, w = pitch.map(p => Math.sin(p * DEG));
      for (const tok of records) {
        const ms = hapiTime(tok[0]);
        if (ms < a || ms > b) continue;
        const E = [];
        for (let k = 0; k < ne; k++) { const e = +tok[oE + k]; E.push(e > 0 ? e : NaN); }
        const omni = new Float64Array(ne).fill(NaN);
        for (let k = 0; k < ne; k++) {
          let s = 0, ws = 0;
          for (let p = 0; p < np; p++) { const v = +tok[oD + p * ne + k]; if (v >= 0 && v < 1e30) { s += v * w[p]; ws += w[p]; } }
          if (ws > 0) omni[k] = s / ws;
        }
        const order = E.map((e, k) => [e, k]).filter(([e]) => isFinite(e)).sort((p, q) => p[0] - q[0]).map(x => x[1]);
        if (!order.length) continue;
        if (!tabs.length) tabs.push(order.map(k => +E[k].toFixed(1)));          // the first good record's valid levels
        const Fs = tabs[0].map((_, j) => (j < order.length ? omni[order[j]] : NaN));
        T.push(sec(ms)); rows.push(Fs); eidx.push(0);
      }
    }
    if (!T.length) return null;
    const n = T.length, nc = tabs[0].length, flux = new Float32Array(n * nc);
    rows.forEach((r, i) => { for (let k = 0; k < nc; k++) flux[i * nc + k] = r[k]; });
    return set({ t: [Float32Array.from(T), 1], spec: [spec8(flux, n, nc, "des"), nc], etab: [Float32Array.from(tabs.flat()), nc], eidx: [Uint8Array.from(eidx), 1] });
  }

  // ───────────────────────── frames and the Sun ─────────────────────────
  /** MEC's quaternion ((qx, qy, qz), qw) as a row-major rotation matrix. */
  function rot(x, y, z, w) {
    return [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w),
            2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w),
            2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)];
  }
  const mul = (A, B) => { const C = new Array(9).fill(0); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) C[i * 3 + j] += A[i * 3 + k] * B[k * 3 + j]; return C; };
  const T_ = (A) => [A[0], A[3], A[6], A[1], A[4], A[7], A[2], A[5], A[8]];
  const app = (M, v) => [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]];
  /** The Sun's direction in J2000 (equatorial) and the obliquity, low precision (Astronomical Almanac): ~0.01°. */
  function sunJ2000(ms) {
    const d = (ms - Date.UTC(2000, 0, 1, 12)) / 864e5, g = (357.529 + 0.98560028 * d) * DEG, q_ = 280.459 + 0.98564736 * d;
    const L = (q_ + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * DEG, e = (23.439 - 0.00000036 * d) * DEG;
    return { u: [Math.cos(L), Math.cos(e) * Math.sin(L), Math.sin(e) * Math.sin(L)], eps: e };
  }
  /** J2000 → GSE from the Sun and the ecliptic pole alone (rows: X to the Sun, Y, Z the ecliptic pole). */
  function j2000ToGSEApprox(ms) {
    const { u: X, eps } = sunJ2000(ms), Z = [0, -Math.sin(eps), Math.cos(eps)];
    const Y = [Z[1] * X[2] - Z[2] * X[1], Z[2] * X[0] - Z[0] * X[2], Z[0] * X[1] - Z[1] * X[0]];
    return [...X, ...Y, ...Z];
  }

  // ───────────────────────── the planets (JPL's approximate elements, 1800–2050) ─────────────────────────
  const ELEM = {   // a (AU), e, I, L, ϖ, Ω (deg) and their rates per century
    mercury: [0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593, 0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081],
    venus: [0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255, 0.00000390, -0.00004107, -0.00078890, 58517.81538729, 0.00268329, -0.27769418],
    earth: [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0, 0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0],
    mars: [1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891, 0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343],
    jupiter: [5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909, -0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106],
  };
  /** Heliocentric J2000 equatorial position, AU. */
  function planet(name, ms) {
    const E_ = ELEM[name], T = (ms - Date.UTC(2000, 0, 1, 12)) / 864e5 / 36525, el = E_.slice(0, 6).map((v, i) => v + E_[i + 6] * T);
    const [a, e, I, L, w, O] = [el[0], el[1], el[2] * DEG, el[3] * DEG, el[4] * DEG, el[5] * DEG], om = w - O;
    let M = ((L - w) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI, Ea = M + e * Math.sin(M);
    for (let k = 0; k < 8; k++) Ea -= (Ea - e * Math.sin(Ea) - M) / (1 - e * Math.cos(Ea));
    const xp = a * (Math.cos(Ea) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(Ea);
    const co = Math.cos(om), so = Math.sin(om), cO = Math.cos(O), sO = Math.sin(O), cI = Math.cos(I), sI = Math.sin(I);
    const x = (co * cO - so * sO * cI) * xp + (-so * cO - co * sO * cI) * yp;
    const y = (co * sO + so * cO * cI) * xp + (-so * sO + co * cO * cI) * yp;
    const z = (so * sI) * xp + (co * sI) * yp, eps = 23.43928 * DEG;
    return [x, Math.cos(eps) * y - Math.sin(eps) * z, Math.sin(eps) * y + Math.cos(eps) * z];
  }

  // ───────────────────────── SSCWeb ─────────────────────────
  const stamp = (ms) => iso(ms).replace(/[-:]/g, "");
  /** Positions (GSE, R_E) of several observatories over [a, b]: { id: { t (s after T0), p } }. */
  async function ssc(ids, a, b) {
    await relay;
    const r = await get(`${SSC}/locations/${ids.join(",")}/${stamp(a)},${stamp(b)}/gse/`, { headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error(`SSCWeb: HTTP ${r.status}`);
    const text = await r.text();
    bytes += text.length; emit();
    const res = JSON.parse(text)[1].Result[1], out = {};
    for (const it of (res.Data && res.Data[1]) || []) {
      const s = it[1], c = s.Coordinates[1][0][1], X = c.X[1], Y = c.Y[1], Z = c.Z[1], T = s.Time[1];
      out[s.Id] = { t: T.map(x => sec(Date.parse(x[1]))), p: X.map((x, i) => [x / RE_KM, Y[i] / RE_KM, Z[i] / RE_KM]) };
    }
    return out;
  }
  const r3 = (p, d = 3) => p.map(x => +x.toFixed(d));
  function posAt(o, t) {
    const n = o.t.length;
    if (!n) return null;
    if (t <= o.t[0]) return o.p[0];
    if (t >= o.t[n - 1]) return o.p[n - 1];
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (o.t[m] <= t) lo = m; else hi = m; }
    const f = (t - o.t[lo]) / (o.t[hi] - o.t[lo]);
    return [0, 1, 2].map(i => o.p[lo][i] + (o.p[hi][i] - o.p[lo][i]) * f);
  }
  /** Every k-th sample, at most m of them, over [a, b] seconds. */
  function thin(o, a, b, m) {
    const idx = []; for (let i = 0; i < o.t.length; i++) if (o.t[i] >= a && o.t[i] <= b) idx.push(i);
    const k = Math.max(1, Math.ceil(idx.length / m));
    return idx.filter((_, j) => j % k === 0).map(i => r3(o.p[i]));
  }
  /** The timeline the view interpolates: samples every 10 minutes across KEEP, one past each end. */
  function timeline(o) {
    const t = [], p = [];
    let last = -Infinity;
    for (let i = 0; i < o.t.length; i++) {
      if (o.t[i] < KEEP[0] - 900 || o.t[i] > KEEP[1] + 900 || o.t[i] - last < 595) continue;
      t.push(+o.t[i].toFixed(1)); p.push(r3(o.p[i])); last = o.t[i];
    }
    return { t, p };
  }
  function lunarRing(q, a, b) {                               // Helios's lunarRing: the circle through the Moon in the arc's plane
    const R = Math.hypot(...q), cr = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const nz = (v) => { const m = Math.hypot(...v); return v.map(x => x / m); };
    const nrm = nz(cr(a, b)), u0 = q.map(x => x / R), v = nz(cr(nrm, u0)), u = cr(v, nrm);
    return Array.from({ length: 97 }, (_, k) => { const f = 2 * Math.PI * k / 96; return r3([0, 1, 2].map(i => R * (u[i] * Math.cos(f) + v[i] * Math.sin(f))), 2); });
  }

  // ───────────────────────── the scene ─────────────────────────
  let mecP = null;
  /** MMS1's MEC for ±43 h (the track, the frames, Kp and the dipole tilt) and MMS2–4's positions for the formation. */
  function mec() {
    if (mecP) return mecP;
    const a = AT - 43 * 3600e3, b = AT + 43 * 3600e3, k0 = T0 + KEEP[0] * 1000, k1 = T0 + KEEP[1] * 1000;
    mecP = Promise.all([
      track("MMS ephemeris (MEC)", hapiChunked("MMS1_MEC_SRVY_L2_EPHT89D", ["mms1_mec_dipole_tilt", "mms1_mec_kp",
        "mms1_mec_quat_eci_to_geo", "mms1_mec_quat_eci_to_sm", "mms1_mec_r_gse", "mms1_mec_quat_eci_to_gse"], a, b, 4).then(mecCols)),
      ...[2, 3, 4].map(n => hapi(`MMS${n}_MEC_SRVY_L2_EPHT89D`, [`mms${n}_mec_r_gse`], k0, k1).catch(() => null)),
    ]);
    return mecP;
  }
  /** MEC's columns in the order the rest reads them: r[3], Kp, tilt, GSE[4], GEO[4], SM[4]. */
  function mecCols(r) {
    const c = r.cols;
    return Object.assign({}, r, { cols: [c[10], c[11], c[12], c[1], c[0], c[13], c[14], c[15], c[16], c[2], c[3], c[4], c[5], c[6], c[7], c[8], c[9]] });
  }
  function nearest(t, x) { let b = 0; for (let i = 1; i < t.length; i++) if (Math.abs(t[i] - x) < Math.abs(t[b] - x)) b = i; return b; }

  async function context() {
    const [[m1], omni] = await Promise.all([mec(), track("OMNI solar wind", hapi("OMNI_HRO_1MIN",
      ["F", "BX_GSE", "BY_GSM", "BZ_GSM", "flow_speed", "proton_density", "Pressure"], T0 - 3600e3, T0 + (SPAN + 3600) * 1000))]);
    if (!m1.n) throw new Error("No MMS ephemeris for this moment (MEC starts 2015-09-01).");
    // MMS1's orbit, a point a minute across the overview, for the view's MMS1 marker
    const ot = [], or = [];
    for (let i = 0; i < m1.n; i++) {
      if (m1.t[i] < -3600 || m1.t[i] > SPAN + 3600 || (ot.length && m1.t[i] - ot[ot.length - 1] < 59)) continue;
      ot.push(m1.t[i]); or.push(m1.cols[0][i] / RE_KM, m1.cols[1][i] / RE_KM, m1.cols[2][i] / RE_KM);
    }
    const fill = { b: 9999.9, bx: 9999.9, by: 9999.9, bz: 9999.9, v: 99999.0, n: 999.9, p: 99.9 };
    const omniSet = { t: f32(omni.t), cols: { t: 1 } };
    Object.keys(fill).forEach((k, j) => { omniSet[k] = f32(omni.cols[j]).map(x => (x >= fill[k] ? NaN : x)); omniSet.cols[k] = 1; });
    const i0 = nearest(m1.t, HALF);
    const m = {
      event: { name: `Live · ${iso(AT)}`, t0: iso(T0), span: [0, SPAN], crossing: HALF, focus: [HALF - 300, HALF + 300],
               kp: m1.cols[3][i0], dipoleTilt: m1.cols[4][i0], rCrossing: [0, 1, 2].map(c => m1.cols[c][i0] / RE_KM), live: true },
      craft: { 1: {}, 2: {}, 3: {}, 4: {} },
      spectra: { dis: { log10: SPEC_RANGE.dis, units: "keV/(cm² s sr keV)" }, des: { log10: SPEC_RANGE.des, units: "keV/(cm² s sr keV)" } },
      units: { b: "nT", n: "cm⁻³", v: "km/s", t: "eV", e: "eV", j: "µA/m²", p: "nPa", r: "R_E (6371.2 km), GSE" },
      sources: ["CDAWeb HAPI (live)", "SSCWeb (live)"],
    };
    return { m, ctx: { orbit: { t: f32(ot), r: f32(or), cols: { t: 1, r: 3 } }, omni: omniSet } };
  }

  /** The MMS loop (prepare_hso_scene: computeLoopPoints): one orbital period between like extrema of |r|. */
  function loopOf(P) {
    const r = P.map(p => Math.hypot(...p)), n = r.length, minGap = Math.max(8, n >> 3), rmax = Math.max(...r), rmin = Math.min(...r);
    const extrema = (minima) => {
      const w = Math.max(4, minGap >> 1), idx = [];
      for (let i = 1; i < n - 1; i++) {
        let ok = true;
        for (let j = Math.max(0, i - w); j <= Math.min(n - 1, i + w) && ok; j++) if (j !== i && (minima ? r[j] < r[i] : r[j] > r[i])) ok = false;
        if (ok && (!idx.length || i - idx[idx.length - 1] >= minGap)) idx.push(i);
      }
      return idx;
    };
    for (const kind of [true, false]) {
      const e = extrema(kind);
      if (e.length >= 2 && Math.abs(r[e[0]] - r[e[1]]) < 0.25 * (rmax - rmin)) return [e[0], e[1]];
    }
    return [0, n - 1];
  }

  /** What sizes the oval and T89 (Helios AuroralDriverClient / OmniClient.fetchKpBlock): Kp from the OMNI2 hourly row
   *  nearest the moment (KP1800, rows repeat their 3-h block; tens + (units ÷ 3)/3, fill 99), and AL as the mean of
   *  OMNI's 1-min AL_INDEX over the hour centered on it (≥ 30 valid minutes; HRO2, then HRO). */
  async function auroralDriver() {
    const [k, al2, al1] = await Promise.all([
      hapi("OMNI2_H0_MRG1HR", ["KP1800"], AT - 5400e3, AT + 5400e3, true).catch(() => null),
      hapi("OMNI_HRO2_1MIN", ["AL_INDEX"], AT - 1800e3, AT + 1800e3, true).catch(() => null),
      hapi("OMNI_HRO_1MIN", ["AL_INDEX"], AT - 1800e3, AT + 1800e3, true).catch(() => null),
    ]);
    let kp = null;
    if (k && k.n) {
      let best = -1;
      for (let i = 0; i < k.n; i++) { const v = k.cols[0][i]; if (v >= 0 && v < 99 && (best < 0 || Math.abs(k.t[i] - HALF) < Math.abs(k.t[best] - HALF))) best = i; }
      if (best >= 0) { const c = Math.round(k.cols[0][best]); kp = Math.floor(c / 10) + Math.floor((c % 10) / 3) / 3; }
    }
    let al = null;
    for (const r of [al2, al1]) {
      if (!r || !r.n) continue;
      const v = Array.from(r.cols[0]).filter(x => isFinite(x) && Math.abs(x) < 99990);
      if (v.length >= 30) { al = v.reduce((p, q) => p + q, 0) / v.length; break; }
    }
    return { kp, al };
  }
  async function scene() {
    const keoP = track("All-sky imager keograms (UCalgary)", keogramLists()).catch(() => ({}));
    const driverP = track("Kp (OMNI2) and AL (OMNI)", auroralDriver()).catch(() => ({ kp: null, al: null }));
    const [[m1, ...others], sites, starsBuf, fleetA, fleetB, fleetC] = await Promise.all([
      mec(),
      fetch("assets/data/live/asi-sites.json").then(r => r.json()),
      fetch("assets/data/hso/stars.bin").then(r => r.arrayBuffer()),
      track("Fleet: THEMIS, ARTEMIS, Moon, SDO, Van Allen Probes, Arase, TRACERS", ssc(["themisa", "themisd", "themise", ...(AT >= Date.UTC(2011, 6, 1) ? ["artemisp1", "artemisp2"] : []), "moon", "sdo", "rbspa", "rbspb",
        ...(AT >= Date.UTC(2017, 0, 1) ? ["arase"] : []), ...(AT >= Date.UTC(2025, 6, 23) ? ["tracers1", "tracers2"] : [])], AT - 13 * 3600e3, AT + 13 * 3600e3)).catch(() => ({})),
      track("Fleet: Cluster", ssc(["cluster1", "cluster2", "cluster3", "cluster4"], AT - 27 * 3600e3, AT + 27 * 3600e3)).catch(() => ({})),
      track("Fleet: Geotail and the L1 monitors", ssc(["geotail", "ace", "dscovr", "wind"], AT - 62 * 3600e3, AT + 62 * 3600e3)).catch(() => ({})),
    ]);
    const GOES_SINCE = { goes16: Date.UTC(2017, 0, 1), goes17: Date.UTC(2018, 2, 1), goes18: Date.UTC(2022, 2, 1), goes19: Date.UTC(2024, 5, 1) };
    const goes = await track("Fleet: GOES-16 to 19", Promise.all(Object.entries(GOES_SINCE).filter(([, t]) => AT >= t)
      .map(([id]) => ssc([id], AT - 13 * 3600e3, AT + 13 * 3600e3).catch(() => ({}))))).then(xs => Object.assign({}, ...xs)).catch(() => ({}));
    const fleetData = Object.assign({}, fleetA, fleetB, fleetC, goes);
    // MMS1's track every 4 minutes over ±43 h, one period of it drawn; MMS2–4 beside it in km
    const T = [], P = [];
    for (let i = 0; i < m1.n; i++) {
      if (T.length && m1.t[i] - T[T.length - 1] < 239) continue;
      T.push(+m1.t[i].toFixed(1)); P.push(r3([m1.cols[0][i], m1.cols[1][i], m1.cols[2][i]].map(x => x / RE_KM)));
    }
    const formT = [], rel = { 2: [], 3: [], 4: [] };
    const o1 = { t: Array.from(m1.t), p: Array.from({ length: m1.n }, (_, i) => [m1.cols[0][i], m1.cols[1][i], m1.cols[2][i]]) };
    const op = others.map(o => (o && o.n ? { t: Array.from(o.t), p: Array.from({ length: o.n }, (_, i) => [o.cols[0][i], o.cols[1][i], o.cols[2][i]]) } : null));
    for (const t of T) {
      if (t < KEEP[0] || t > KEEP[1] || op.some(o => !o)) continue;
      const p1 = posAt(o1, t);
      formT.push(t);
      op.forEach((o, k) => { const p = posAt(o, t); rel[k + 2].push(r3([0, 1, 2].map(c => p[c] - p1[c]), 2)); });
    }
    // the frames every 5 minutes from MEC's quaternions, turned the way that lands the Sun on GSE +X
    const i0 = nearest(m1.t, HALF), q = (c, i) => rot(m1.cols[c][i], m1.cols[c + 1][i], m1.cols[c + 2][i], m1.cols[c + 3][i]);
    const sun = sunJ2000(AT).u, M0 = q(5, i0), flip = app(T_(M0), sun)[0] > app(M0, sun)[0];
    const eciTo = (c, i) => (flip ? T_(q(c, i)) : q(c, i));
    const J2G = eciTo(5, i0), frames = { t: [], geo: [], sm: [] };
    for (let t = KEEP[0]; t <= KEEP[1]; t += 300) {
      const i = nearest(m1.t, t);
      if (Math.abs(m1.t[i] - t) > 60) continue;
      const G = eciTo(5, i);
      frames.t.push(t);
      frames.geo.push(mul(G, T_(eciTo(9, i))).map(x => +x.toFixed(6)));
      frames.sm.push(mul(G, T_(eciTo(13, i))).map(x => +x.toFixed(6)));
    }
    // THEMIS and the SSCWeb fleet as the demo's scene carries them
    const th = [];
    for (const [id, L] of [["themisa", "A"], ["themisd", "D"], ["themise", "E"]]) {
      const o = fleetData[id];
      if (!o || !o.t.length) continue;
      th.push({ id: L, pos: r3(posAt(o, HALF)), track: thin(o, HALF - 12 * 3600, HALF + 12 * 3600, 150), timeline: timeline(o) });
    }
    const FLEET = [["moon", "Moon", "moon", 0], ["artemisp1", "ARTEMIS-P1", "artemis", 150], ["artemisp2", "ARTEMIS-P2", "artemis", 150],
                   ["ace", "ACE", "l1", 0], ["dscovr", "DSCOVR", "l1", 0], ["wind", "Wind", "l1", 0], ["sdo", "SDO", "sdo", 130],
                   ["cluster1", "Cluster-1", "cluster", 240], ["cluster2", "Cluster-2", "cluster", 240], ["cluster3", "Cluster-3", "cluster", 240],
                   ["cluster4", "Cluster-4", "cluster", 240], ["rbspa", "RBSP-A", "rbsp", 114], ["rbspb", "RBSP-B", "rbsp", 114], ["geotail", "Geotail", "geotail", 209],
                   ["goes16", "GOES-16", "goes", 97], ["goes17", "GOES-17", "goes", 97], ["goes18", "GOES-18", "goes", 97], ["goes19", "GOES-19", "goes", 97],
                   ["arase", "Arase", "arase", 114], ["tracers1", "TRACERS-1", "tracers", 30], ["tracers2", "TRACERS-2", "tracers", 30]];
    const span_ = { artemis: 13, sdo: 12, cluster: 27, rbsp: 4.5, geotail: 62, arase: 4.8, tracers: 0.8 };
    const fleet = [];
    for (const [id, name, cat, m] of FLEET) {
      const o = fleetData[id];
      if (!o || !o.t.length || o.t[0] > HALF || o.t[o.t.length - 1] < HALF) continue;
      const pos = posAt(o, HALF);
      let orbit = m && !(cat === "goes" && fleet.some(f => f.cat === "goes")) ? thin(o, HALF - (span_[cat] || 12) * 3600, HALF + (span_[cat] || 12) * 3600, m) : [];
      if (cat === "moon") orbit = lunarRing(pos, posAt(o, HALF - 12 * 3600), posAt(o, HALF + 12 * 3600));
      fleet.push({ id: name, cat, pos: r3(pos), orbit, timeline: timeline(o) });
    }
    // the planets in the sky and the inner solar system, in GSE's axes at the moment
    const AU_KM = 149597870.7, RE_AU = AU_KM / RE_KM, earth = planet("earth", AT);
    const planets = [["Mercury", "☿", "#9AA6B8"], ["Venus", "♀", "#E8C97A"], ["Mars", "♂", "#E07A55"]].map(([name, glyph, tint]) => {
      const p = planet(name.toLowerCase(), AT), g = [0, 1, 2].map(i => p[i] - earth[i]), d = Math.hypot(...g);
      return { name, glyph, tint, dir: r3(app(J2G, g.map(x => x / d)), 5), au: +d.toFixed(3) };
    });
    const helio = (name, ms) => app(J2G, planet(name, ms).map(x => x * RE_AU));
    const solar = { au_RE: RE_AU, fleet: [], planets: [["mercury", 87.97], ["venus", 224.70], ["earth", 365.256], ["mars", 686.98], ["jupiter", 4332.6]].map(([name, per]) => ({
      name: name[0].toUpperCase() + name.slice(1), pos: r3(helio(name, AT), 0), au: +(Math.hypot(...planet(name, AT))).toFixed(3),
      orbit: Array.from({ length: 181 }, (_, k) => r3(helio(name, AT + per * k / 180 * 864e5), 0)),
    })) };
    // the all-sky imagers running that month (Helios's site list)
    const d = new Date(AT), ym = d.getUTCFullYear() * 100 + d.getUTCMonth() + 1;
    const keo = await keoP;
    const asi = sites.map((s) => {
      let nets = s.cams.filter(c => ym >= c[1] && ym <= c[2]).map(c => c[0]);
      const urls = {};
      for (const net of Object.keys(KEO_DATASET)) if (keo[net] && keo[net][s.code]) urls[net] = keo[net][s.code];
      // where UCalgary answered for a network, its cameras in service that month are the ones that published a keogram
      // that day (Helios: in service at the instant, and once the listing is in, with a keogram that UT day)
      nets = nets.filter(net => !keo[net] || urls[net]);
      for (const net of Object.keys(urls)) if (!nets.includes(net)) delete urls[net];
      return { code: s.code, name: s.name, lat: s.lat, lon: s.lon, nets, keo: urls };
    }).filter(s => s.nets.length);
    // the stars: the demo's list is in GSE at its own moment; turned back to J2000 and on to GSE at this one
    const demoMs = Date.UTC(2015, 9, 16, 13, 7, 2), R = mul(j2000ToGSEApprox(AT), T_(j2000ToGSEApprox(demoMs)));
    const sv = new DataView(starsBuf), out = new DataView(new ArrayBuffer(starsBuf.byteLength));
    for (let o = 0; o + 10 <= starsBuf.byteLength; o += 10) {
      const u = app(R, [sv.getInt16(o, true) / 32767, sv.getInt16(o + 2, true) / 32767, sv.getInt16(o + 4, true) / 32767]);
      for (let c = 0; c < 3; c++) out.setInt16(o + c * 2, Math.round(Math.max(-1, Math.min(1, u[c])) * 32767), true);
      for (let c = 6; c < 10; c++) out.setUint8(o + c, sv.getUint8(o + c));
    }
    const S = {
      epoch: HALF, mms: { t: T, p: P, loop: loopOf(P), formation: { t: formT, rel } }, themis: th, fleet, frames, planets, solar, asi,
      ...(await driverP.then(({ kp, al }) => {
        const mk = m1.cols[3][i0], k = kp ?? (isFinite(mk) && mk >= 0 && mk <= 9 ? mk : 2);    // Kp 0 is a value, not a gap
        return { kp: +k.toFixed(2), al: al === null ? null : +al.toFixed(0), kpSrc: kp !== null ? "OMNI2" : isFinite(mk) ? "MEC" : "assumed" };
      })), sources: "Live: MMS MEC via CDAWeb HAPI, SSCWeb, JPL approximate planetary elements, Yale BSC",
    };
    return [S, out.buffer];
  }

  // ───────────────────────── FPI burst distributions (DES and DIS), on demand ─────────────────────────
  // log10 s³/cm⁶ the 8-bit phase-space densities are stored over, per species; each record's accumulation; the span fetched
  const DIST = { des: { lo: -35, hi: -23, dt: 0.03, pad: 1 }, dis: { lo: -31, hi: -17, dt: 0.15, pad: 3 } };
  /** HAPI's binary format: each record an ASCII time (its length found from the first 'Z'), then little-endian doubles. */
  async function hapiBinary(id, params, a, b, nd) {
    const buf = await slot(async () => {
      const r = await get(`${HAPI}/data?id=${encodeURIComponent(id)}&parameters=${params.join(",")}&time.min=${iso(a)}&time.max=${iso(b)}&format=binary`, undefined, 90000);   // CDAWeb can take a minute to cut a fresh distribution file
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`${id}: HTTP ${r.status}`);
      return r.arrayBuffer();
    }, true);
    if (!buf) return [];
    const u8 = new Uint8Array(buf);
    bytes += buf.byteLength; emit();
    if (!u8.length || u8[0] === 123 || u8[0] === 44) return [];            // "{" or ",": a status, no records
    let tl = 0; while (tl < 40 && u8[tl] !== 90) tl++; tl++;                // through the "Z"
    const rec = tl + 8 * nd, out = [], dec = new TextDecoder();
    for (let o = 0; o + rec <= buf.byteLength; o += rec) {
      const ms = hapiTime(dec.decode(u8.subarray(o, o + tl)));
      if (ms < a || ms > b) continue;
      out.push({ t: sec(ms), v: new Float64Array(buf.slice(o + tl, o + rec)) });
    }
    return out;
  }
  const vdfStores = {};
  /** A probe's distributions as hso.js reads them (the demo's vdf-mmsN.bin layout), growing a block at a time:
   *  ensure(t) fetches the records within a second of t, with B (FGM, DMPA) and the electron bulk velocity (DBCS) at
   *  each, and the DBCS → GSE rotation from the probe's own MEC attitude, as Helios takes it. */
  function vdfStore(n, sp = "des") {
    if (vdfStores[`${n}${sp}`]) return vdfStores[`${n}${sp}`];
    const sc = `mms${n}`, P = DIST[sp], S = vdfStores[`${n}${sp}`] = {
      n, t: [], E: new Float32Array(0), PHI: new Float32Array(0), B: new Float32Array(0), V: new Float32Array(0), Q: new Float32Array(0),
      D: new Uint8Array(0), lo: P.lo, hi: P.hi, dt: P.dt, sp, dbcsToGSE: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], mecOK: false, spans: [], pending: null, live: true, enc2: true,
      covers(t) { return this.spans.some(([a, b]) => t >= a && t <= b); },
      ensure(t) {
        if (this.covers(t)) return Promise.resolve(true);
        if (this.pending) return this.pending.then(() => this.ensure(t));
        const a = T0 + (t - P.pad) * 1000, b = T0 + (t + P.pad) * 1000;
        this.pending = track(`MMS${n} ${sp === "dis" ? "ion" : "electron"} distributions ${new Date(T0 + t * 1000).toISOString().slice(11, 19)}`, Promise.all([
          hapiBinary(`MMS${n}_FPI_BRST_L2_${sp.toUpperCase()}-DIST`, [`${sc}_${sp}_dist_brst`, `${sc}_${sp}_phi_brst`, `${sc}_${sp}_energy_brst`], a, b, 16384 + 64),
          hapi(`MMS${n}_FPI_BRST_L2_${sp.toUpperCase()}-MOMS`, [`${sc}_${sp}_bulkv_dbcs_brst`], a - 100, b + 100, true),
          hapi(`MMS${n}_FGM_BRST_L2@0`, [`${sc}_fgm_b_dmpa_brst_l2`], a - 100, b + 100, true),
          this.mecOK ? null : hapi(`MMS${n}_MEC_SRVY_L2_EPHT89D`, [`${sc}_mec_quat_eci_to_dbcs`, `${sc}_mec_quat_eci_to_gse`], a - 60e3, b + 60e3, true).catch(() => null),
        ])).then(([dist, mom, fgm, mecq]) => {
          if (mecq && mecq.n) {                              // DBCS → GSE = (ECI → GSE)(ECI → DBCS)ᵀ, turned the way that puts the Sun on +X
            const i = nearest(mecq.t, t), q = (c) => rot(mecq.cols[c][i], mecq.cols[c + 1][i], mecq.cols[c + 2][i], mecq.cols[c + 3][i]);
            const sun = sunJ2000(T0 + t * 1000).u, G0 = q(4), flip = app(T_(G0), sun)[0] > app(G0, sun)[0];
            const G = flip ? T_(G0) : G0, Dm = flip ? T_(q(0)) : q(0), M = mul(G, T_(Dm));
            if (M.every(isFinite)) { this.dbcsToGSE = [M.slice(0, 3), M.slice(3, 6), M.slice(6, 9)]; this.mecOK = true; }
          }
          this.spans.push([t - P.pad, t + P.pad]);
          const have = new Set(this.t.map(x => x.toFixed(4))), add = dist.filter(d => !have.has(d.t.toFixed(4)));
          if (!add.length) return this.covers(t);
          const all = this.t.map((x, i) => ({ t: x, i, old: true })).concat(add.map((d, i) => ({ t: d.t, i, old: false }))).sort((p, q_) => p.t - q_.t);
          const N = all.length, E = new Float32Array(N * 32), PHI = new Float32Array(N * 32), B = new Float32Array(N * 3), V = new Float32Array(N * 3), D = new Uint8Array(N * 16384);
          const span = P.hi - P.lo;
          all.forEach((r, k) => {
            if (r.old) {
              E.set(this.E.subarray(r.i * 32, r.i * 32 + 32), k * 32); PHI.set(this.PHI.subarray(r.i * 32, r.i * 32 + 32), k * 32);
              B.set(this.B.subarray(r.i * 3, r.i * 3 + 3), k * 3); V.set(this.V.subarray(r.i * 3, r.i * 3 + 3), k * 3);
              D.set(this.D.subarray(r.i * 16384, r.i * 16384 + 16384), k * 16384);
              return;
            }
            const d = add[r.i].v;
            for (let j = 0; j < 16384; j++) {
              const f = d[j];
              if (f === 0) D[k * 16384 + j] = 1;
              else if (f > 0 && f < 1e-10) D[k * 16384 + j] = Math.max(2, Math.min(255, Math.round(2 + (Math.log10(f) - P.lo) / span * 253)));
            }
            PHI.set(d.subarray(16384, 16416), k * 32); E.set(d.subarray(16416, 16448), k * 32);
            const vi = nearest(mom.t, r.t);                   // the moments share the distributions' records
            for (let c = 0; c < 3; c++) V[k * 3 + c] = mom.n && Math.abs(mom.t[vi] - r.t) < P.dt / 2 ? mom.cols[c][vi] : NaN;
            const s3 = [0, 0, 0]; let m = 0;                    // B over the record's accumulation
            for (let j = 0; j < fgm.n; j++) if (fgm.t[j] >= r.t && fgm.t[j] < r.t + P.dt) { for (let c = 0; c < 3; c++) s3[c] += fgm.cols[c][j]; m++; }
            for (let c = 0; c < 3; c++) B[k * 3 + c] = m ? s3[c] / m : NaN;
          });
          Object.assign(this, { t: all.map(r => r.t), E, PHI, B, V, Q: new Float32Array(N), D });
          return this.covers(t) && add.length > 0;
        }).finally(() => { this.pending = null; });
        return this.pending;
      },
    };
    return S;
  }

  // ───────────────────────── HPCA (Helios's HPCAFullSpan / HPCASpinAccumulator) ─────────────────────────
  const HPCA_E = [1.355, 1.5718, 1.8428, 2.2222, 2.6016, 3.0894, 3.6314, 4.2818, 5.0406, 5.962, 6.9918, 8.2384, 9.756, 11.49, 13.55, 15.989,
    18.862, 22.276, 26.233, 30.948, 36.531, 43.089, 50.785, 59.945, 70.677, 83.414, 98.373, 116.04, 136.85, 161.46, 190.46, 224.66, 264.98,
    312.57, 368.72, 434.95, 513.06, 605.2, 713.87, 842.05, 993.32, 1171.7, 1382.1, 1630.3, 1923.1, 2268.4, 2675.8, 3156.3, 3723.1, 4391.7,
    5180.4, 6110.7, 7208.1, 8502.6, 10030.0, 11831.0, 13955.0, 16461.0, 19418.0, 22905.0, 27018.0, 31870.0, 37593.0];   // eV/q (HAPI bins)
  const HPCA_SP = [["hpH", "hplus"], ["hpHepp", "heplusplus"], ["hpHep", "heplus"], ["hpO", "oplus"]];
  const HPCA_HALF = 4500;                                    // the spectra span ±75 min about the moment (Helios's 2.5 h cap)
  const CDAS = "https://cdaweb.gsfc.nasa.gov/WS/cdasr/1/dataviews/sp_phys/datasets";
  const cdasStamp = (ms) => iso(ms).replace(/[-:]/g, "").replace(/\.\d+/, "");
  /** One CDAS subset as a CDF (its variables gzip-compressed), read whole: the survey ION product is full resolution
   *  ([16 anodes × 63 energies] per 0.625-s sweep), 64 MB per species-hour as HAPI CSV, a few MB this way. */
  async function cdas(id, vars, a, b, P = null) {
    const r = await slot(() => get(`${CDAS}/${id}/data/${cdasStamp(a)},${cdasStamp(b)}/${vars.join(",")}?format=cdf`, { headers: { Accept: "application/json" } }, 120000), true);
    if (!r.ok) throw new Error(`${id}: HTTP ${r.status}`);
    const j = await r.json(), f = j.FileDescription && j.FileDescription[0];
    if (f && P) P.expect(f.Length || 0);                    // CDAWeb says each subset's size: the bar knows its end
    return f ? cdfFile(f.Name, true, P) : null;
  }
  /** The sky-mean differential energy flux per half-spin, eV/(cm² s sr eV): per sweep the mean over the anodes with a
   *  value (negatives as 0), × E; the mean of those over the sweeps of a half-spin, which closes where start_azimuth = 0.
   *  A column is stamped with its half-spin's first sweep; only half-spins starting in [a, b) are kept (chunks never
   *  overlap or leave a seam). */
  function hpcaSpin(ep, az, flux, a, b, rowMajor = false) {
    const nE = 63, out = { t: [], f: [] };
    let t0 = null, acc = new Float64Array(nE), accN = new Int32Array(nE), rows = 0;
    const close = () => {
      if (t0 !== null && rows > 0 && t0 >= a && t0 < b) out.f.push(Array.from(acc, (x, e) => (accN[e] ? x / accN[e] : NaN))), out.t.push(t0);
      acc = new Float64Array(nE); accN = new Int32Array(nE); rows = 0; t0 = null;
    };
    for (let r = 0; r < ep.n; r++) {
      const t = ep.data[r];
      if (!isFinite(t)) continue;
      if (az.data[r] === 0 || t0 === null) { close(); t0 = t; }
      for (let e = 0; e < nE; e++) {                    // the CDF's record is [63 E][16 anodes], energy-major (HAPI serves it anode-major)
        let sum = 0, cnt = 0;
        for (let an = 0; an < 16; an++) { const v = flux.data[rowMajor ? (r * 16 + an) * nE + e : (r * nE + e) * 16 + an]; if (isFinite(v) && Math.abs(v) < 1e20) { sum += Math.max(v, 0); cnt++; } }
        if (cnt) { acc[e] += sum / cnt * HPCA_E[e]; accN[e]++; }
      }
      rows++;
    }
    close();
    return out;
  }
  /** H⁺, He⁺⁺, He⁺ and O⁺ spectrograms over ±1 h of the moment: one CDAS request per UTC hour, padded 80 s each side
   *  so every half-spin is whole. */
  /** One species' spectrogram (key "hpH", "hpHepp", "hpHep" or "hpO") over ±1 h of the moment, in two hour-long
   *  requests from the moment's own edges, each padded 80 s so every half-spin is whole. */
  async function hpcaSpectra(n, P, only) {
    const sc = `mms${n}`, SP = HPCA_SP.filter(([k]) => k === only), parts = [];
    for (let h = AT - HPCA_HALF * 1000; h < AT + HPCA_HALF * 1000; h += 3600e3) parts.push(h);
    const vars = [`${sc}_hpca_start_azimuth`, ...SP.map(([, v]) => `${sc}_hpca_${v}_flux`)];
    const got = await Promise.all(parts.map(async (h) => {
      const end = Math.min(h + 3600e3, AT + HPCA_HALF * 1000);
      const cdf = await cdas(`MMS${n}_HPCA_SRVY_L2_ION`, vars, h - 80e3, end + 80e3, P).catch((e) => { console.warn(e); return null; });
      if (!cdf) return null;
      const [ep, az, rm, ...fl] = await Promise.all([cdf.variable("Epoch"), cdf.variable(vars[0]), cdf.rowMajor(), ...vars.slice(1).map(v => cdf.variable(v))]);
      return fl.map(f => hpcaSpin(ep, az, f, h, end, rm));
    }));
    const sets = {};
    SP.forEach(([key], k) => {
      const t = [], f = [];
      for (const g of got) if (g) { t.push(...g[k].t); f.push(...g[k].f); }
      const m = t.length, flux = new Float32Array(m * 63);
      f.forEach((row, i) => row.forEach((v, e) => { flux[i * 63 + e] = v > 0 ? v : NaN; }));
      sets[key] = set({ t: [Float32Array.from(t, sec), 1], spec: [spec8(flux, m, 63, "hpca"), 63], etab: [Float32Array.from(HPCA_E), 63], eidx: [new Uint8Array(m), 1] });
    });
    return { sets, empty: !got.some(Boolean) };
  }
  /** HPCA's survey moments (MOMENTS): each species' density, bulk velocity (GSE) and scalar temperature. */
  async function hpcaMoments(n, P) {
    const sc = `mms${n}`, [a, b] = window_, order = ["hplus", "heplus", "heplusplus", "oplus"], P_ = [];
    for (const v of order) P_.push(`${sc}_hpca_${v}_number_density`, `${sc}_hpca_${v}_ion_bulk_velocity`, `${sc}_hpca_${v}_scalar_temperature`);
    const [r, mec] = await Promise.all([hapi(`MMS${n}_HPCA_SRVY_L2_MOMENTS`, P_, a, b, true, false, P),
      hapi(`MMS${n}_MEC_SRVY_L2_EPHT89D`, [`${sc}_mec_quat_eci_to_dbcs`, `${sc}_mec_quat_eci_to_gse`], AT - 90e3, AT + 90e3, true).catch(() => null)]);
    let M = null;                                            // DBCS → GSE = R_gse · R_dbcsᵀ, from the row nearest the moment
    if (mec && mec.n) {
      const i = nearest(mec.t, HALF), q = mec.cols.map(c => c[i]);
      if (q.length >= 8 && q.every(v => isFinite(v) && Math.abs(v) <= 1.5)) M = mul(rot(...q.slice(4, 8)), T_(rot(...q.slice(0, 4))));
    }
    const dts = []; for (let i = 1; i < r.n; i++) dts.push(r.t[i] - r.t[i - 1]); dts.sort((p, q) => p - q);
    const half = dts.length ? dts[dts.length >> 1] / 2 : 5;
    const pick = (j) => fillNaN(r.cols[j], 1e30), N = new Float32Array(r.n * 4), T = new Float32Array(r.n * 4), out = { t: [f32(Array.from(r.t, x => x + half)), 1] };
    HPCA_SP.forEach(([key, v], k) => {
      const j = order.indexOf(v) * 5, nn = pick(j), tt = pick(j + 4);          // n, V[3], T per species, in HAPI's order
      for (let i = 0; i < r.n; i++) { N[i * 4 + k] = nn[i] >= 0 ? nn[i] : NaN; T[i * 4 + k] = tt[i] >= 0 ? tt[i] : NaN; }
      const w = stack(r.cols, j + 1, 3).map(x => (Math.abs(x) < 1e30 ? x : NaN));
      if (M) for (let i = 0; i < r.n; i++) { const g = app(M, [w[i * 3], w[i * 3 + 1], w[i * 3 + 2]]); w[i * 3] = g[0]; w[i * 3 + 1] = g[1]; w[i * 3 + 2] = g[2]; }
      out[`v${key.slice(2)}`] = [w, 3];
    });
    out.n = [N, 4]; out.T = [T, 4];
    const sp = new Float32Array(r.n * 4);                    // |V| per species, Helios's bulk-speed panel
    HPCA_SP.forEach(([key], k) => { const v = out[`v${key.slice(2)}`][0]; for (let i = 0; i < r.n; i++) sp[i * 4 + k] = Math.hypot(v[i * 3], v[i * 3 + 1], v[i * 3 + 2]); });
    out.speed = [sp, 4];
    return { sets: { hpm: set(out) }, empty: !r.n, frame: M ? "GSE" : "DBCS" };
  }

  // ───────────────────────── HPCA distributions (Helios's assembleHPCAFromHAPI + HPCAPitchAngle) ─────────────────────────
  // One half-spin of survey phase-space density from CDAWeb (16 sweeps = the 16 azimuth sectors, each 16 anodes × 63
  // energies), its azimuth table rebuilt from MEC's spin phase — φ = μ + ψ(t) + c₀ + s(sector) + h(anode) + o(energy),
  // the structure Helios measured on the SDC's ancillary to 0.02° — so nothing is asked of the rate-limited SDC.
  const HPCA_AZ = {
    sector: [0.0, 11.4445, 22.889, 34.3336, 45.7781, 57.2226, 68.6671, 80.1117, 91.5562, 103.0007, 114.4452, 125.8897, 137.3343, 148.7788, 160.2233, 171.6678],
    anodeHalf: [180, 180, 180, 180, 180, 180, 0, 0, 0, 0, 0, 0, 0, 0, 180, 180],
    energy: [0.0, 0.173, 0.3461, 0.5191, 0.6922, 0.8652, 1.0382, 1.2113, 1.3843, 1.5574, 1.7304, 1.9035, 2.0765, 2.2495, 2.4226, 2.5956,
      2.7687, 2.9417, 3.1147, 3.2878, 3.4608, 3.6339, 3.8069, 3.9799, 4.153, 4.326, 4.4991, 4.6721, 4.8452, 5.0182, 5.1912, 5.3643, 5.5373,
      5.7104, 5.8834, 6.0564, 6.2295, 6.4025, 6.5756, 6.7486, 6.9216, 7.0947, 7.2677, 7.4408, 7.6138, 7.7869, 7.9599, 8.1329, 8.306, 8.479,
      8.6521, 8.8251, 8.9981, 9.1712, 9.3453, 9.5215, 9.6998, 9.8809, 10.0651, 10.2532, 10.446, 10.6445, 10.8498],
    base: 354.56, rate: 18.3112, nominal: 18.31, mount: { 1: 140.63, 2: 140.63, 3: 140.69, 4: 140.52 },
    colat: [123.75, 101.25, 78.75, 56.25, 33.75, 11.25, 11.25, 33.75, 56.25, 78.75, 101.25, 123.75, 146.25, 168.75, 168.75, 146.25],
  };
  const HPCA_VAR = { H: "hplus", He: "heplus", O: "oplus" };
  /** The despun spin-plane frame's axes as GSE rows: x the Sun projected on the spin plane, z the spin axis. */
  function despunAxes(qb, qg) {
    const M = mul(rot(...qb), T_(rot(...qg))), z = [M[6], M[7], M[8]];
    let rx = [1 - z[0] * z[0], -z[0] * z[1], -z[0] * z[2]];
    const rm = Math.hypot(...rx);
    if (!(rm > 1e-6)) return null;
    rx = rx.map(v => v / rm);
    return [rx, [z[1] * rx[2] - z[2] * rx[1], z[2] * rx[0] - z[0] * rx[2], z[0] * rx[1] - z[1] * rx[0]], z];
  }
  /** ψ: the BCS x-axis' azimuth in the spin plane from the projected Sun (GSE x), degrees. */
  function sunPhase(qb, qg) {
    const Rb = rot(...qb), Rg = rot(...qg), M = mul(Rb, T_(Rg));          // GSE → BCS
    const z = [M[6], M[7], M[8]], xb = [M[0], M[1], M[2]];
    let rx = [1 - z[0] * z[0], -z[0] * z[1], -z[0] * z[2]];
    const rm = Math.hypot(...rx);
    if (!(rm > 1e-6)) return NaN;
    rx = rx.map(v => v / rm);
    const ry = [z[1] * rx[2] - z[2] * rx[1], z[2] * rx[0] - z[0] * rx[2], z[0] * rx[1] - z[1] * rx[0]];
    return Math.atan2(xb[0] * ry[0] + xb[1] * ry[1] + xb[2] * ry[2], xb[0] * rx[0] + xb[1] * rx[1] + xb[2] * rx[2]) / DEG;
  }
  const hpcaMemo = new Map();
  /** The half-spin nearest t (s after T0) for species "H", "He" or "O": { t0, psd, phi, bulk (DBCS ≈ the despun
   *  frame), b (GSE) } — or { error }. */
  function hpcaDist(n, sp, t) {
    const key = `${n}|${sp}|${Math.round(t * 10)}`;
    if (hpcaMemo.has(key)) return hpcaMemo.get(key);
    const sc = `mms${n}`, at = T0 + t * 1000;
    const p = track(`MMS${n} HPCA ${{ H: "H⁺", He: "He⁺", O: "O⁺" }[sp]} distribution ${new Date(at).toISOString().slice(11, 19)}`, (async () => {
      const r = await hapi(`MMS${n}_HPCA_SRVY_L2_ION`, [`${sc}_hpca_start_azimuth`, `${sc}_hpca_${HPCA_VAR[sp]}_phase_space_density`], at - 30e3, at + 30e3, true);
      if (!r.n) return { error: "No HPCA survey distribution within 30 s of this time." };
      // pyspedas's pick: the half-spin whose center (sector-0 sweep + 9.375 s) is nearest
      let i0 = -1, best = Infinity;
      for (let i = 0; i < r.n; i++) if (r.cols[0][i] === 0) { const d = Math.abs(r.t[i] + 9.375 - t); if (d < best) { best = d; i0 = i; } }
      if (i0 < 0 || best > 60 || i0 + 15 >= r.n) return { error: "No whole HPCA half-spin near this time." };
      const psd = new Float64Array(16 * 16 * 63).fill(NaN);
      for (let a = 0; a < 16; a++) {
        const i = i0 + a;
        if (r.cols[0][i] !== a || r.t[i] - r.t[i0] >= 12) return { error: "The half-spin's 16 sectors are not all there." };
        for (let k = 0; k < 16; k++) for (let e = 0; e < 63; e++) { const v = r.cols[1 + k * 63 + e][i]; if (isFinite(v) && v >= 0 && v < 1e20) psd[(a * 16 + k) * 63 + e] = v; }
      }
      const t0 = r.t[i0], ms0 = T0 + t0 * 1000;
      const [mec, mom, fg] = await Promise.all([
        hapi(`MMS${n}_MEC_SRVY_L2_EPHT89D`, [`${sc}_mec_quat_eci_to_bcs`, `${sc}_mec_quat_eci_to_gse`], ms0 - 210e3, ms0 + 210e3, true),
        hapi(`MMS${n}_HPCA_SRVY_L2_MOMENTS`, [`${sc}_hpca_${HPCA_VAR[sp]}_ion_bulk_velocity`], ms0 - 30e3, ms0 + 40e3, true).catch(() => null),
        hapi(`MMS${n}_FGM_SRVY_L2@0`, [`${sc}_fgm_b_gse_srvy_l2`], ms0 - 2e3, ms0 + 12e3, true).catch(() => null),
      ]);
      // the spin phase: MEC's 30-s samples unwrapped with the nominal rate, interpolated to the sector-0 sweep
      const ts = [], ps = [];
      let axes = null, best_ = Infinity;
      for (let i = 0; i < mec.n; i++) {
        const q = mec.cols.slice(0, 8).map(c => c[i]);
        if (!q.every(v => isFinite(v) && Math.abs(v) <= 1.5)) continue;
        const ph = sunPhase(q.slice(0, 4), q.slice(4, 8));
        if (isFinite(ph)) { ts.push(mec.t[i]); ps.push(ph); }
        if (Math.abs(mec.t[i] - t0) < best_) { best_ = Math.abs(mec.t[i] - t0); axes = despunAxes(q.slice(0, 4), q.slice(4, 8)); }
      }
      if (ts.length < 2) return { error: "No MEC attitude near this time for HPCA's spin phase." };
      const un = [ps[0]];
      for (let i = 1; i < ts.length; i++) {
        let d = (ps[i] - ps[i - 1]) % 360; if (d < 0) d += 360;
        un.push(un[i - 1] + d + 360 * Math.round((HPCA_AZ.nominal * (ts[i] - ts[i - 1]) - d) / 360));
      }
      let j = 1; while (j < ts.length - 1 && ts[j] < t0) j++;
      const psi = un[j - 1] + (un[j] - un[j - 1]) * (t0 - ts[j - 1]) / (ts[j] - ts[j - 1]);
      const rate = (un[un.length - 1] - un[0]) / (ts[ts.length - 1] - ts[0]), scale = rate > 5 && rate < 60 ? rate / HPCA_AZ.rate : 1;
      const phi = new Float64Array(16 * 16 * 63), base = (HPCA_AZ.mount[n] ?? 140.63) + psi;
      for (let a = 0; a < 16; a++) for (let k = 0; k < 16; k++) {
        const c = base + HPCA_AZ.base + HPCA_AZ.sector[a] * scale + HPCA_AZ.anodeHalf[k];
        for (let e = 0; e < 63; e++) { let v = (c + HPCA_AZ.energy[e] * scale) % 360; if (v < 0) v += 360; phi[(a * 16 + k) * 63 + e] = v; }
      }
      let bulk = [0, 0, 0];
      if (mom && mom.n) { const i = nearest(mom.t, t); const v = [0, 1, 2].map(c => mom.cols[c][i]); if (v.every(x => isFinite(x) && Math.abs(x) < 1e4)) bulk = v; }   // the moment at the cut's time
      let b = null;
      if (fg && fg.n) { const s = [0, 0, 0]; let m = 0; for (let i = 0; i < fg.n; i++) if (fg.t[i] >= t0 && fg.t[i] <= t0 + 10 && [0, 1, 2].every(c => isFinite(fg.cols[c][i]))) { for (let c = 0; c < 3; c++) s[c] += fg.cols[c][i]; m++; } if (m) b = s.map(x => x / m); }
      return { t0, psd, phi, colat: HPCA_AZ.colat, energy: HPCA_E, bulk, b, sp, axes };
    })().catch((e) => ({ error: `CDAWeb did not answer: ${e.message || e}` })));
    hpcaMemo.set(key, p);
    return p;
  }

  // ───────────────────────── EDP: the electric field and the spacecraft potential; DSP: E-field spectra ─────────────────────────
  async function edp(n, P) {
    const sc = `mms${n}`, [a, b] = window_, ba = AT - 60e3, bb = AT + 60e3;
    // CDAWeb's REST subsets as CDF: the fast survey's 32 S/s over the four hours is ~9 MB this way, ~40 MB as HAPI CSV
    const read = async (id, ep, vars, a_, b_) => {
      const cdf = await cdas(id, vars, a_, b_, P).catch((e) => { console.warn(e); return null; });
      if (!cdf) return null;
      const got = await Promise.all([ep, ...vars].map(v => cdf.variable(v).catch(() => null)));
      return got[0] && got[1] ? got : null;
    };
    const [fast, pot] = await Promise.all([
      read(`MMS${n}_EDP_FAST_L2_DCE`, `${sc}_edp_epoch_fast_l2`, [`${sc}_edp_dce_gse_fast_l2`], a, b),
      read(`MMS${n}_EDP_FAST_L2_SCPOT`, `${sc}_edp_epoch_fast_l2`, [`${sc}_edp_scpot_fast_l2`], a, b),
    ]);
    const secs = (ep) => Float64Array.from(ep.data, ms => sec(ms));
    const comp = (v, c, q) => Float64Array.from({ length: v.n }, (_, i) => { const x = v.data[i * v.elems + c]; return Math.abs(x) < 1e30 && !(q && q.data[i] === 0) ? x : NaN; });
    const sets = {};
    if (fast) {                                              // Helios's tiers: native 32 Hz, 0.15 s and 4.5 s box means
      const [ep, e] = fast, t = secs(ep), C3 = [0, 1, 2].map(c => comp(e, c));
      sets.efiN = set({ t: [f32(t), 1], e: [stack(C3.map(f32), 0, 3), 3] });
      for (const [k, w] of [["efi15", 0.15], ["efi45", 4.5]]) { const F = boxcar(t, C3, w); sets[k] = set({ t: [f32(F.t), 1], e: [stack(F.cols.map(f32), 0, 3), 3] }); }
      sets.efi = sets.efi15;
    }
    if (pot) { const [ep, v] = pot; sets.pot = set({ t: [f32(secs(ep)), 1], v: [f32(comp(v, 0)), 1] }); }
    return { sets, burst: null, empty: !fast };
  }
  /** DSP's fast-survey E-field power spectral density (omni) over frequency. */
  async function dsp(n, P) {
    const sc = `mms${n}`, [a, b] = window_;
    const [r, f] = await Promise.all([hapi(`MMS${n}_DSP_FAST_L2_EPSD`, [`${sc}_dsp_epsd_omni`], a, b, true, false, P), hapiBins(`MMS${n}_DSP_FAST_L2_EPSD`, `${sc}_dsp_epsd_omni`, true)]);
    const nf = r.cols.length, flux = stack(r.cols, 0, nf).map(x => (x > 0 ? x : NaN));
    const freq = (f || []).slice(0, nf).map(x => Math.max(x, 1));
    return { sets: { epsd: set({ t: [f32(r.t), 1], spec: [spec8(flux, r.n, nf, "epsd"), nf], etab: [Float32Array.from(freq), nf], eidx: [new Uint8Array(r.n), 1] }) }, empty: !r.n };
  }
  const LAZY = { hpH: ["HPCA H⁺ spectra (±1 h)", (n, P) => hpcaSpectra(n, P, "hpH")], hpHepp: ["HPCA He⁺⁺ spectra (±1 h)", (n, P) => hpcaSpectra(n, P, "hpHepp")],
                 hpHep: ["HPCA He⁺ spectra (±1 h)", (n, P) => hpcaSpectra(n, P, "hpHep")], hpO: ["HPCA O⁺ spectra (±1 h)", (n, P) => hpcaSpectra(n, P, "hpO")], hpcaMom: ["HPCA moments", hpcaMoments], edp: ["EDP electric field", edp], dsp: ["DSP E-field spectra", dsp] };
  const lazyMemo = {}, progress = {};
  /** A group's download so far: bytes in, and the bytes expected where the archive said (CDAS subsets). */
  function progressOf(n, g) {
    const k = `${n}|${g}`;
    if (progress[k]) return progress[k];
    let queued = false;
    const P = progress[k] = { loaded: 0, total: 0, done: false,
      add: (b) => { P.loaded += b; ping(); }, expect: (b) => { P.total += b; ping(); } };
    const ping = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; window.dispatchEvent(new CustomEvent("hso-progress", { detail: { n, g } })); }); };
    return P;
  }

  // ───────────────────────── the source hso.js reads ─────────────────────────
  const craftCache = {};
  window.HSO_SOURCE = {
    live: true, at: AT, t0: T0, half: HALF,
    get bytes() { return bytes; },
    load: () => context(),
    craft: (n) => (craftCache[n] = craftCache[n] || mms(n)),
    mission: (key) => (craftCache[key] = craftCache[key] || (/^th/.test(key) ? themis(key) : key === "omni" ? omniWindow() : key === "idx" ? indicesWindow() : /^(ace|wind|dscovr)$/.test(key) ? l1Window(key) : /^g\d\d$/.test(key) ? goesWindow(key) : cluster(key))
      .catch((e) => { delete craftCache[key]; throw e; })),
    scene,
    vdf: (n, sp) => vdfStore(n, sp),
    hpcaDist: (n, sp, t) => hpcaDist(n, sp, t),
    /** An MMS probe's on-demand group (HPCA, EDP, DSP): { sets, burst?, empty }. */
    lazy: (n, g) => (lazyMemo[`${n}|${g}`] = lazyMemo[`${n}|${g}`] || track(`MMS${n} ${LAZY[g][0]}`, LAZY[g][1](n, progressOf(n, g))).catch((e) => { console.warn(e); return { sets: {}, empty: true }; }).finally(() => { progressOf(n, g).done = true; })),
    progress: (n, g) => progressOf(n, g),
    sky: skyFrame,
    burstHalf: BURST_HALF,
    tasks: () => [...tasks],
  };
})();
