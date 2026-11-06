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
  const SPEC_RANGE = { dis: [3.5, 7.8], des: [4.8, 8.8] };   // log10 keV/(cm² s sr keV), as the demo
  // FPI's fast-survey energy tables (eV), which HAPI does not serve: the same on all four probes in the demo's files
  const FPI_E = {
    dis: [11.33, 14.55, 18.69, 24.0, 30.83, 39.6, 50.87, 65.34, 83.92, 107.8, 138.46, 177.86, 228.45, 293.44, 376.92, 484.15,
          621.88, 798.8, 1026.04, 1317.93, 1692.86, 2174.45, 2793.05, 3587.62, 4608.24, 5919.2, 7603.11, 9766.07, 12544.35,
          16113.01, 20696.88, 26584.79],
    des: [11.66, 14.95, 19.17, 24.58, 31.52, 40.42, 51.83, 66.45, 85.21, 109.26, 140.09, 179.63, 230.33, 295.33, 378.69, 485.56,
          622.6, 798.32, 1023.63, 1312.53, 1682.97, 2157.95, 2766.99, 3547.92, 4549.25, 5833.18, 7479.48, 9590.41, 12297.11,
          15767.72, 20217.84, 25923.91],
  };
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
  async function get(url, init, wait = 45000) {
    for (let k = 0; ; k++) {
      const ac = new AbortController(), timer = setTimeout(() => ac.abort(), wait);
      try {
        const r = await fetch(url, Object.assign({ signal: ac.signal }, init));
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
  function hapi(id, params, a, b, first, openEnd) {
    return slot(async () => {
      const r = await get(`${HAPI}/data?id=${encodeURIComponent(id)}&parameters=${params.join(",")}&time.min=${iso(a)}&time.max=${iso(b)}`);
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
  function spec8(flux, n, nc, sp) {
    const [lo, hi] = SPEC_RANGE[sp], out = new Uint8Array(n * nc);
    for (let i = 0; i < n * nc; i++) {
      const f = flux[i];
      if (!isFinite(f)) continue;
      const l = Math.log10(Math.max(f, 10 ** lo));
      out[i] = Math.max(1, Math.min(255, Math.round((l - lo) / (hi - lo) * 254) + 1));
    }
    return out;
  }
  /** A record set in the unpacked shape: arrays and their column counts. */
  function set(fields) {
    const out = { cols: {} };
    for (const [k, [a, c]] of Object.entries(fields)) { out[k] = a; out.cols[k] = c; }
    return out;
  }
  /** J = e nₑ (Vᵢ − Vₑ) on the electrons' times, µA/m², none across gaps in the ions (prepare_hso_demo.current). */
  function current(ti, vi, te, ne, ve) {
    const n = te.length, out = new Float32Array(n * 3).fill(NaN);
    if (ti.length < 2) return out;
    const dts = []; for (let i = 1; i < ti.length; i++) dts.push(ti[i] - ti[i - 1]);
    dts.sort((p, r) => p - r);
    const gap = 3 * dts[dts.length >> 1];
    let k = 0;
    for (let i = 0; i < n; i++) {
      const t = te[i];
      while (k < ti.length - 2 && ti[k + 1] < t) k++;
      if (t < ti[0] || t > ti[ti.length - 1] || ti[k + 1] - ti[k] > gap) continue;
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

  // ───────────────────────── MMS ─────────────────────────
  function fpiSet(r, sp, withST) {                         // columns: spectrum[32], n, V[3], (spin tone[3],) T∥, T⊥
    const n = r.n, nc = 32, o = withST ? 3 : 0;
    const flux = stack(r.cols, 0, nc);
    return set({
      t: [f32(r.t), 1], n: [f32(r.cols[32]), 1], v: [stack(r.cols, 33, 3), 3], tpar: [f32(r.cols[36 + o]), 1], tperp: [f32(r.cols[37 + o]), 1],
      ...(withST ? { vst: [stack(r.cols, 36, 3).map(x => (isFinite(x) ? x : 0)), 3] } : {}),
      spec: [spec8(flux, n, nc, sp), nc], etab: [Float32Array.from(FPI_E[sp]), nc], eidx: [new Uint8Array(n), 1],
    });
  }
  /** Burst moments: columns parity, spectrum[32], n, V[3], (spin tone[3],) T∥, T⊥, in HAPI's order. */
  function fpiBurstSet(r, sp, withST) {
    const n = r.n, o = withST ? 3 : 0, eidx = new Uint8Array(n);
    for (let i = 0; i < n; i++) eidx[i] = r.cols[0][i] === 1 ? 1 : 0;
    return set({
      t: [f32(r.t), 1], n: [f32(r.cols[33]), 1], v: [stack(r.cols, 34, 3), 3], tpar: [f32(r.cols[37 + o]), 1], tperp: [f32(r.cols[38 + o]), 1],
      ...(withST ? { vst: [stack(r.cols, 37, 3).map(x => (isFinite(x) ? x : 0)), 3] } : {}),
      spec: [spec8(stack(r.cols, 1, 32), n, 32, sp), 32], etab: [Float32Array.from(FPI_EB[sp].flat()), 32], eidx: [eidx, 1],
    });
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
    sv.des.j = current(sv.dis.t, sv.dis.v, sv.des.t, sv.des.n, sv.des.v); sv.des.cols.j = 3;
    const bu = burst.then((B3) => {                          // the burst data follow the survey, drawn when they arrive
      if (!B3 || !(B3[0].n || B3[1].n || B3[2].n)) return null;
      const out = { fgm: set({ t: [f32(B3[0].t), 1], b: [stack(B3[0].cols, 0, 4), 4] }), dis: fpiBurstSet(B3[1], "dis", false), des: fpiBurstSet(B3[2], "des", true) };
      out.des.j = current(out.dis.t, out.dis.v, out.des.t, out.des.n, out.des.v); out.des.cols.j = 3;
      return out;
    });
    return { sv, bu: null, burst: bu, kind: "mms", empty: !fg.n && !di.n };
  }

  // ───────────────────────── THEMIS ─────────────────────────
  async function themis(key) {
    const L = key.slice(2).toUpperCase(), l = L.toLowerCase(), [a, b] = window_, P = { B: "ARTEMIS-P1", C: "ARTEMIS-P2" }[L] || `THEMIS-${L}`;
    const esa = (s) => [`th${l}_pe${s}_density`, `th${l}_pe${s}_avgtemp`, `th${l}_pe${s}_en_eflux`, `th${l}_pe${s}_magt3`, `th${l}_pe${s}_velocity_gse`];
    const [fg, ir, er, ef, efi, fi] = await Promise.all([
      track(`${P} FGM`, hapi(`TH${L}_L2_FGM@0`, [`th${l}_fgs_btotal`, `th${l}_fgs_gse`], a, b, true)),
      track(`${P} ESA ions`, hapi(`TH${L}_L2_ESA@2`, esa("ir"), a, b, true)),
      track(`${P} ESA electrons`, hapi(`TH${L}_L2_ESA@3`, esa("er"), a, b, true)),
      hapi(`TH${L}_L2_ESA@1`, [`th${l}_peef_density`, `th${l}_peef_magt3`, `th${l}_peef_velocity_gse`], a, b, true).catch(() => null),
      hapi(`TH${L}_L2_EFI@0`, [`th${l}_efs_dot0_gse`], a, b, true).catch(() => null),
      hapi(`TH${L}_L2_ESA@0`, [`th${l}_peif_density`, `th${l}_peif_magt3`, `th${l}_peif_velocity_gse`], a, b, true).catch(() => null),
    ]);
    const sv = {};
    const bm = stack(fg.cols, 0, 4), b4 = new Float32Array(fg.n * 4);
    for (let i = 0; i < fg.n; i++) { b4[i * 4] = bm[i * 4 + 1]; b4[i * 4 + 1] = bm[i * 4 + 2]; b4[i * 4 + 2] = bm[i * 4 + 3]; b4[i * 4 + 3] = bm[i * 4]; }
    sv.fgm = set({ t: [f32(fg.t), 1], b: [b4, 4] });
    // the reduced-mode sweeps: which table a record uses follows from how many channels are live (prepare_hso_missions)
    const species = (sp, r, tables, full, velOnly) => {
      const n = r.n, flux = new Float32Array(n * 32).fill(NaN), eidx = new Uint8Array(n), tabs = [], keys = [];
      let N = r.cols[0], magt3 = stack(r.cols, 34, 3), vel = stack(r.cols, 37, 3);
      if (full && full.n) {                                // reduced mode has no electron velocity: moments from full mode
        const at = (col) => { const out = new Float64Array(n); for (let i = 0; i < n; i++) out[i] = interp(full.t, col, r.t[i]); return out; };
        const fv = stack([0, 1, 2].map(c => at(full.cols[4 + c])), 0, 3);
        if (velOnly) { for (let i = 0; i < n * 3; i++) if (!isFinite(vel[i])) vel[i] = fv[i]; }   // ions: full mode only where reduced has no V
        else { N = at(full.cols[0]); magt3 = stack([0, 1, 2].map(c => at(full.cols[1 + c])), 0, 3); vel = fv; }
      }
      for (let i = 0; i < n; i++) {
        const row = []; for (let c = 0; c < 32; c++) row.push(r.cols[2 + c][i]);
        const live = row.filter(isFinite).length, tab = tables[live];
        if (!tab) continue;
        const key = tab.length;
        let k = keys.indexOf(key);
        if (k < 0) { keys.push(key); tabs.push(tab); k = tabs.length - 1; }
        eidx[i] = k;
        const asc = row.slice().reverse().filter(isFinite);   // ascending energy, the dead top channel dropped
        for (let c = 0; c < Math.min(tab.length, asc.length); c++) flux[i * 32 + c] = asc[c];
      }
      if (!tabs.length) tabs.push(tables[32]);
      const etab = new Float32Array(tabs.length * 32);
      tabs.forEach((tb, k) => { for (let c = 0; c < 32; c++) etab[k * 32 + c] = c < tb.length ? tb[c] : tb[tb.length - 1] * 1.3 ** (c - tb.length + 1); });
      const tpar = new Float32Array(n), tperp = new Float32Array(n);
      for (let i = 0; i < n; i++) { tpar[i] = magt3[i * 3 + 2]; tperp[i] = 0.5 * (magt3[i * 3] + magt3[i * 3 + 1]); }
      sv[sp] = set({ t: [f32(r.t), 1], n: [f32(N), 1], v: [vel, 3], tpar: [tpar, 1], tperp: [tperp, 1],
                     spec: [spec8(flux, n, 32, sp), 32], etab: [etab, 32], eidx: [eidx, 1] });
    };
    species("dis", ir, { 32: ION32, 31: ION32, 24: ION24, 23: ION24 }, fi, true);
    species("des", er, { 32: ELEC32, 31: ELEC32 }, ef);
    sv.des.j = current(sv.dis.t, sv.dis.v, sv.des.t, sv.des.n, sv.des.v); sv.des.cols.j = 3;
    if (efi && efi.n) sv.efi = set({ t: [f32(efi.t), 1], e: [stack(efi.cols, 0, 3), 3] });
    const label = { B: "ARTEMIS-P1", C: "ARTEMIS-P2" }[L] || `THEMIS-${L}`;
    return { sv, bu: null, kind: "tha", label, notes: "THEMIS L2 (UC Berkeley) via CDAWeb HAPI, live: FGM, ESA reduced mode, EFI.", empty: !fg.n && !ir.n };
  }
  function interp(t, v, x) {
    const n = t.length;
    if (!n || x < t[0] || x > t[n - 1]) return NaN;
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (t[m] <= x) lo = m; else hi = m; }
    return hi === lo ? v[lo] : v[lo] + (v[hi] - v[lo]) * (x - t[lo]) / (t[hi] - t[lo]);
  }

  // ───────────────────────── Cluster ─────────────────────────
  async function cluster(key) {
    const N = key.slice(1), C = `C${N}`, [a, b] = window_;
    const hiaSpec = (N === "1" || N === "3") ? Promise.all([
      hapi(`${C}_CP_CIS-HIA_HS_1D_PEF`, [`flux__${C}_CP_CIS_HIA_HS_1D_PEF`], a, b, true).catch(() => ({ t: [], cols: [], n: 0 })),
      hapiBins(`${C}_CP_CIS-HIA_HS_1D_PEF`, `flux__${C}_CP_CIS_HIA_HS_1D_PEF`, true).catch(() => null)]) : Promise.resolve(null);
    const peace = track(`Cluster-${N} PEACE spectrogram (ESA CSA)`, peaceSpectra(C, a, b)).catch(() => null);
    const [fg, cis, pea, cod, bins] = await Promise.all([
      track(`Cluster-${N} FGM`, hapi(`${C}_CP_FGM_SPIN`, [`B_vec_xyz_gse__${C}_CP_FGM_SPIN`, `B_mag__${C}_CP_FGM_SPIN`], a, b, true)),
      track(`Cluster-${N} CIS`, hapi(`${C}_PP_CIS`, (N === "1" || N === "3")
        ? [`N_p__${C}_PP_CIS`, `N_HIA__${C}_PP_CIS`, `V_p_xyz_gse__${C}_PP_CIS`, `V_HIA_xyz_gse__${C}_PP_CIS`, `T_p_par__${C}_PP_CIS`, `T_p_perp__${C}_PP_CIS`, `T_HIA_par__${C}_PP_CIS`, `T_HIA_perp__${C}_PP_CIS`]
        : [`N_p__${C}_PP_CIS`, `V_p_xyz_gse__${C}_PP_CIS`, `T_p_par__${C}_PP_CIS`, `T_p_perp__${C}_PP_CIS`], a, b, true).catch(() => ({ t: [], cols: [], n: 0 }))),
      track(`Cluster-${N} PEACE`, hapi(`${C}_PP_PEA`, [`N_e_den__${C}_PP_PEA`, `V_e_xyz_gse__${C}_PP_PEA`, `T_e_par__${C}_PP_PEA`, `T_e_perp__${C}_PP_PEA`], a, b, true).catch(() => ({ t: [], cols: [], n: 0 }))),
      hapi(`${C}_CP_CIS-CODIF_H1_1D_PEF`, [`flux__${C}_CP_CIS_CODIF_H1_1D_PEF`], a, b, true).catch(() => ({ t: [], cols: [], n: 0 })),
      hapiBins(`${C}_CP_CIS-CODIF_H1_1D_PEF`, `flux__${C}_CP_CIS_CODIF_H1_1D_PEF`, true).catch(() => null),
    ]);
    const sv = { fgm: set({ t: [f32(fg.t), 1], b: [stack(fg.cols, 0, 4), 4] }) };
    const mom = (r, c) => set({ t: [f32(r.t), 1], n: [f32(r.cols[c[0]]), 1], v: [stack(r.cols, c[1], 3), 3],
                                tpar: [f32(r.cols[c[2]]).map(x => x * MK_EV), 1], tperp: [f32(r.cols[c[3]]).map(x => x * MK_EV), 1] });
    const live = (col) => col && col.some(isFinite);
    let relabel = null;
    if (cis.n && (N === "1" || N === "3")) {                  // C1/C3 carry CODIF H⁺ and HIA (all ions): CODIF where it ran, else HIA
      if (live(cis.cols[0])) sv.dis = mom(cis, [0, 2, 8, 9]);
      else if (live(cis.cols[1])) { sv.dis = mom(cis, [1, 5, 10, 11]); relabel = { n: { lines: [{ ds: "dis", name: "n", c: 0, color: "#2a46d6", label: "N_{i}" }, { ds: "des", name: "n", c: 0, color: "#ee8a1c", label: "N_{e}" }] } }; }
    } else if (cis.n && live(cis.cols[0])) sv.dis = mom(cis, [0, 1, 4, 5]);
    if (pea.n && live(pea.cols[0])) sv.des = mom(pea, [0, 1, 4, 5]);
    if (!sv.dis && sv.des) relabel = { n: { lines: [{ ds: "des", name: "n", c: 0, color: "#ee8a1c", label: "N_{e}" }] } };   // no ions that day
    if (cod.n && bins) {                                     // CODIF H⁺ flux on its own clock, served high → low
      const nc = bins.length, flux = new Float32Array(cod.n * nc);
      for (let i = 0; i < cod.n; i++) for (let c = 0; c < nc; c++) flux[i * nc + c] = cod.cols[nc - 1 - c] ? cod.cols[nc - 1 - c][i] : NaN;
      sv.isp = set({ t: [f32(cod.t), 1], spec: [spec8(flux, cod.n, nc, "dis"), nc], etab: [Float32Array.from(bins.slice().reverse()), nc], eidx: [new Uint8Array(cod.n), 1] });
    }
    if (!sv.isp) {                                            // no CODIF H⁺ spectra: HIA's (C1, C3), all ions
      const h = await hiaSpec;
      if (h && h[0].n && h[1]) {
        const [r, hb] = h, nc = hb.length, flux = new Float32Array(r.n * nc);
        for (let i = 0; i < r.n; i++) for (let c = 0; c < nc; c++) flux[i * nc + c] = r.cols[nc - 1 - c] ? r.cols[nc - 1 - c][i] : NaN;
        if (flux.some(isFinite)) {
          sv.isp = set({ t: [f32(r.t), 1], spec: [spec8(flux, r.n, nc, "dis"), nc], etab: [Float32Array.from(hb.slice().reverse()), nc], eidx: [new Uint8Array(r.n), 1] });
          relabel = Object.assign(relabel || {}, { ionSpec: { spec: "isp", label: "Ions", title: "HIA ion spectrogram" } });
        }
      }
    }
    const esp = await peace;
    if (esp) sv.esp = esp;
    if (sv.dis && sv.des) { sv.des.j = current(sv.dis.t, sv.dis.v, sv.des.t, sv.des.n, sv.des.v); sv.des.cols.j = 3; }
    return { sv, bu: null, kind: "c4", label: `Cluster-${N}`, relabel, empty: !fg.n,
             notes: "Cluster via CDAWeb HAPI, live: FGM spin, CIS (CODIF H⁺, or HIA on C1/C3 where CODIF is off) and PEACE prime parameters, CIS ion spectra; PEACE's pitch-angle DEFlux from ESA's Cluster Science Archive." };
  }

  // ───────────────────────── OMNI and the L1 monitors (Helios's HSODataClient choices) ─────────────────────────
  const KELVIN_EV = 8.617333e-5, thermalEV = (w) => 5.2197e-3 * w * w;    // K → eV; proton thermal speed (km/s) → eV
  const fillNaN = (col, fill) => (col ? Float32Array.from(col, x => (x >= fill * 0.999 || x <= -1e30 ? NaN : x)) : new Float32Array(0));
  /** OMNI's 1-minute data at the bow shock's nose, as Helios's OMNI window rows (OmniPanel.rows). */
  async function omniWindow() {
    const [a, b] = window_;
    const P = ["F", "BX_GSE", "BY_GSM", "BZ_GSM", "flow_speed", "proton_density", "T", "Pressure", "E", "Beta", "Mach_num", "Mgs_mach_num", "AE_INDEX", "SYM_H", "PC_N_INDEX"];
    const F = [9999.99, 9999.99, 9999.99, 9999.99, 99999.9, 999.99, 9999999, 99.99, 999.99, 999.99, 999.9, 99.9, 99999, 99999, 999.99];
    const r = await track("OMNI window", hapi("OMNI_HRO_1MIN", P, a - 3600e3, b + 3600e3, true));
    const c = P.map((_, k) => fillNaN(r.cols[k], F[k]));
    const n = r.n, r0 = new Float32Array(n), tp = new Float32Array(n);
    for (let i = 0; i < n; i++) {                             // Shue et al. (1998) stand-off, from the minute's Bz and pressure
      r0[i] = (10.22 + 1.29 * Math.tanh(0.184 * (c[3][i] + 8.14))) * Math.pow(c[7][i], -1 / 6.6);
      tp[i] = c[6][i] * KELVIN_EV;
    }
    const one = (a_) => [a_, 1];
    const sv = { omni: set({ t: one(f32(r.t)), bt: one(c[0]), bx: one(c[1]), by: one(c[2]), bz: one(c[3]), v: one(c[4]), np: one(c[5]), tp: one(tp),
                             pdyn: one(c[7]), ey: one(c[8]), beta: one(c[9]), ma: one(c[10]), mms: one(c[11]), ae: one(c[12]), symh: one(c[13]), pcn: one(c[14]), r0: one(r0) }) };
    return { sv, bu: null, kind: "omni", label: "OMNI", empty: !r.n,
             notes: "OMNI 1-minute (NASA SPDF, via CDAWeb HAPI): IMF and plasma from the L1 monitors, time-shifted to the bow shock's nose; R₀ from Shue et al. (1998)." };
  }
  /** One L1 monitor, as Helios's fetchAce / fetchWind / fetchDscovr: science products first, browse products where
   *  they stop. Rows: B (GSE), Nₚ, V (GSE), |V|, Tₚ. */
  async function l1Window(key) {
    const [a, b] = window_, name = { ace: "ACE", wind: "Wind", dscovr: "DSCOVR" }[key];
    let B = null, rows = [];                                // rows: [t, n, vx, vy, vz, speed, T eV]
    const vec = (r, j = 0) => r.n ? { t: r.t, x: fillNaN(r.cols[j], 1e30), y: fillNaN(r.cols[j + 1], 1e30), z: fillNaN(r.cols[j + 2], 1e30) } : null;
    if (key === "ace") {
      const [m, sw] = await Promise.all([hapi("AC_H0_MFI", ["BGSEc"], a, b, true), hapi("AC_H0_SWE", ["Np", "Vp", "Tpr", "V_GSE"], a, b, true)]);
      B = vec(m) || vec(await hapi("AC_K0_MFI", ["BGSEc"], a, b, true));
      if (sw.n) for (let i = 0; i < sw.n; i++) rows.push([sw.t[i], sw.cols[0][i], sw.cols[3][i], sw.cols[4][i], sw.cols[5][i], sw.cols[1][i], sw.cols[2][i] * KELVIN_EV]);
      else { const k = await hapi("AC_K0_SWE", ["Np", "Vp", "Tpr"], a, b, true); for (let i = 0; i < k.n; i++) rows.push([k.t[i], k.cols[0][i], NaN, NaN, NaN, k.cols[1][i], k.cols[2][i] * KELVIN_EV]); }
    } else if (key === "wind") {
      const [m, sw] = await Promise.all([hapi("WI_H0_MFI@0", ["BGSE"], a, b, true),
        hapi("WI_H1_SWE", ["fit_flag", "Proton_V_nonlin", "Proton_VX_nonlin", "Proton_VY_nonlin", "Proton_VZ_nonlin", "Proton_W_nonlin", "Proton_Np_nonlin"], a, b, true)]);
      B = vec(m) || vec(await hapi("WI_K0_MFI", ["BGSEc"], a, b, true));
      const ok = (x) => (x < 99990 ? x : NaN);
      for (let i = 0; i < sw.n; i++) if (sw.cols[0][i] >= 1) rows.push([sw.t[i], ok(sw.cols[6][i]), ok(sw.cols[2][i]), ok(sw.cols[3][i]), ok(sw.cols[4][i]), ok(sw.cols[1][i]), thermalEV(ok(sw.cols[5][i]))]);
      if (!rows.length) {
        const k = await hapi("WI_K0_SWE", ["V_GSE", "THERMAL_SPD", "Np"], a, b, true);
        for (let i = 0; i < k.n; i++) rows.push([k.t[i], k.cols[4][i], k.cols[0][i], k.cols[1][i], k.cols[2][i], Math.hypot(k.cols[0][i], k.cols[1][i], k.cols[2][i]), thermalEV(k.cols[3][i])]);
      }
    } else {
      const [m, fc] = await Promise.all([hapi("DSCOVR_H0_MAG", ["B1GSE"], a, b, true), hapi("DSCOVR_H1_FC", ["V_GSE", "THERMAL_SPD", "Np", "THERMAL_TEMP"], a, b, true)]);
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
        const order = E.map((e, k) => [isFinite(e) ? e : Infinity, k]).sort((p, q) => p[0] - q[0]).map(x => x[1]);
        const Es = order.map(k => E[k]), Fs = order.map(k => omni[k]);
        const last = Es.filter(isFinite).pop() || 1;                          // unused levels continue the sweep upward
        let extra = 0;
        const tab = Es.map(e => (isFinite(e) ? +e.toFixed(1) : +(last * 1.15 ** ++extra).toFixed(1)));
        const key = tab.join(",");
        if (!keys.has(key)) { keys.set(key, tabs.length); tabs.push(tab); }
        T.push(sec(ms)); rows.push(Fs); eidx.push(keys.get(key));
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

  async function scene() {
    const keoP = track("All-sky imager keograms (UCalgary)", keogramLists()).catch(() => ({}));
    const [[m1, ...others], sites, starsBuf, fleetA, fleetB, fleetC] = await Promise.all([
      mec(),
      fetch("assets/data/live/asi-sites.json").then(r => r.json()),
      fetch("assets/data/hso/stars.bin").then(r => r.arrayBuffer()),
      track("Fleet: THEMIS, ARTEMIS, Moon, SDO, Van Allen Probes", ssc(["themisa", "themisd", "themise", "artemisp1", "artemisp2", "moon", "sdo", "rbspa", "rbspb"], AT - 13 * 3600e3, AT + 13 * 3600e3)).catch(() => ({})),
      track("Fleet: Cluster", ssc(["cluster1", "cluster2", "cluster3", "cluster4"], AT - 27 * 3600e3, AT + 27 * 3600e3)).catch(() => ({})),
      track("Fleet: Geotail and the L1 monitors", ssc(["geotail", "ace", "dscovr", "wind"], AT - 62 * 3600e3, AT + 62 * 3600e3)).catch(() => ({})),
    ]);
    const fleetData = Object.assign({}, fleetA, fleetB, fleetC);
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
                   ["cluster4", "Cluster-4", "cluster", 240], ["rbspa", "RBSP-A", "rbsp", 114], ["rbspb", "RBSP-B", "rbsp", 114], ["geotail", "Geotail", "geotail", 209]];
    const span_ = { artemis: 13, sdo: 12, cluster: 27, rbsp: 4.5, geotail: 62 };
    const fleet = [];
    for (const [id, name, cat, m] of FLEET) {
      const o = fleetData[id];
      if (!o || !o.t.length || o.t[0] > HALF || o.t[o.t.length - 1] < HALF) continue;
      const pos = posAt(o, HALF);
      let orbit = m ? thin(o, HALF - (span_[cat] || 12) * 3600, HALF + (span_[cat] || 12) * 3600, m) : [];
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
      // where UCalgary answered for a network, its cameras are the ones that published a keogram that day
      nets = nets.filter(net => !keo[net] || urls[net]);
      for (const net of Object.keys(urls)) if (!nets.includes(net)) nets.push(net);
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
      kp: +(m1.cols[3][i0] || 2).toFixed(2), sources: "Live: MMS MEC via CDAWeb HAPI, SSCWeb, JPL approximate planetary elements, Yale BSC",
    };
    return [S, out.buffer];
  }

  // ───────────────────────── FPI-DES burst distributions, on demand ─────────────────────────
  const DIST_LO = -35, DIST_HI = -23;                        // log10 s³/cm⁶ for the 8-bit phase-space densities
  /** HAPI's binary format: each record an ASCII time (its length found from the first 'Z'), then little-endian doubles. */
  async function hapiBinary(id, params, a, b, nd) {
    const buf = await slot(async () => {
      const r = await get(`${HAPI}/data?id=${encodeURIComponent(id)}&parameters=${params.join(",")}&time.min=${iso(a)}&time.max=${iso(b)}&format=binary`, undefined, 20000);
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
  function vdfStore(n) {
    if (vdfStores[n]) return vdfStores[n];
    const sc = `mms${n}`, S = vdfStores[n] = {
      n, t: [], E: new Float32Array(0), PHI: new Float32Array(0), B: new Float32Array(0), V: new Float32Array(0), Q: new Float32Array(0),
      D: new Uint8Array(0), lo: DIST_LO, hi: DIST_HI, dbcsToGSE: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], spans: [], pending: null, live: true,
      covers(t) { return this.spans.some(([a, b]) => t >= a && t <= b); },
      ensure(t) {
        if (this.covers(t)) return Promise.resolve(true);
        if (this.pending) return this.pending.then(() => this.ensure(t));
        const a = T0 + (t - 1) * 1000, b = T0 + (t + 1) * 1000;
        this.pending = track(`MMS${n} electron distributions ${new Date(T0 + t * 1000).toISOString().slice(11, 19)}`, Promise.all([
          hapiBinary(`MMS${n}_FPI_BRST_L2_DES-DIST`, [`${sc}_des_dist_brst`, `${sc}_des_phi_brst`, `${sc}_des_energy_brst`], a, b, 16384 + 64),
          hapi(`MMS${n}_FPI_BRST_L2_DES-MOMS`, [`${sc}_des_bulkv_dbcs_brst`], a - 100, b + 100, true),
          hapi(`MMS${n}_FGM_BRST_L2@0`, [`${sc}_fgm_b_dmpa_brst_l2`], a - 100, b + 100, true),
          this.spans.length ? null : hapi(`MMS${n}_MEC_SRVY_L2_EPHT89D`, [`${sc}_mec_quat_eci_to_dbcs`, `${sc}_mec_quat_eci_to_gse`], a - 60e3, b + 60e3, true),
        ])).then(([dist, mom, fgm, mecq]) => {
          if (mecq && mecq.n) {                              // DBCS → GSE = (ECI → GSE)(ECI → DBCS)ᵀ, turned the way that puts the Sun on +X
            const i = nearest(mecq.t, t), q = (c) => rot(mecq.cols[c][i], mecq.cols[c + 1][i], mecq.cols[c + 2][i], mecq.cols[c + 3][i]);
            const sun = sunJ2000(T0 + t * 1000).u, G0 = q(4), flip = app(T_(G0), sun)[0] > app(G0, sun)[0];
            const G = flip ? T_(G0) : G0, Dm = flip ? T_(q(0)) : q(0), M = mul(G, T_(Dm));
            this.dbcsToGSE = [M.slice(0, 3), M.slice(3, 6), M.slice(6, 9)];
          }
          this.spans.push([t - 1, t + 1]);
          const have = new Set(this.t.map(x => x.toFixed(4))), add = dist.filter(d => !have.has(d.t.toFixed(4)));
          if (!add.length) return this.covers(t);
          const all = this.t.map((x, i) => ({ t: x, i, old: true })).concat(add.map((d, i) => ({ t: d.t, i, old: false }))).sort((p, q_) => p.t - q_.t);
          const N = all.length, E = new Float32Array(N * 32), PHI = new Float32Array(N * 32), B = new Float32Array(N * 3), V = new Float32Array(N * 3), D = new Uint8Array(N * 16384);
          const span = DIST_HI - DIST_LO;
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
              if (f > 0 && f < 1e-10) D[k * 16384 + j] = Math.max(1, Math.min(255, Math.round(1 + (Math.log10(f) - DIST_LO) / span * 254)));
            }
            PHI.set(d.subarray(16384, 16416), k * 32); E.set(d.subarray(16416, 16448), k * 32);
            const vi = nearest(mom.t, r.t);                   // the moments share the distributions' records
            for (let c = 0; c < 3; c++) V[k * 3 + c] = mom.n && Math.abs(mom.t[vi] - r.t) < 0.016 ? mom.cols[c][vi] : NaN;
            const s3 = [0, 0, 0]; let m = 0;                    // B over the record's 30 ms
            for (let j = 0; j < fgm.n; j++) if (fgm.t[j] >= r.t && fgm.t[j] < r.t + 0.03) { for (let c = 0; c < 3; c++) s3[c] += fgm.cols[c][j]; m++; }
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

  // ───────────────────────── the source hso.js reads ─────────────────────────
  const craftCache = {};
  window.HSO_SOURCE = {
    live: true, at: AT, t0: T0, half: HALF,
    get bytes() { return bytes; },
    load: () => context(),
    craft: (n) => (craftCache[n] = craftCache[n] || mms(n)),
    mission: (key) => (craftCache[key] = craftCache[key] || (/^th/.test(key) ? themis(key) : key === "omni" ? omniWindow() : /^(ace|wind|dscovr)$/.test(key) ? l1Window(key) : cluster(key))),
    scene,
    vdf: (n) => vdfStore(n),
    sky: skyFrame,
    burstHalf: BURST_HALF,
    tasks: () => [...tasks],
  };
})();
