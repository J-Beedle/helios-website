/* Helios in the browser: MMS1 at the electron diffusion region of 16 October 2015 (Burch et al. 2016), in a
 * workspace like the app's. An overview strip with its orange focus window, MMS1's data panel (FGM, and FPI moments
 * and spectra, survey and burst) and the HSO view (hsoview.js, drawn as Helios draws it) all run on one clock.
 * The data are MMS Level 2, cut down by helios_website_tools/prepare_hso_demo.py into assets/data/hso/.
 */
(function () {
  "use strict";

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const SYS = '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif';
  const MONO = 'ui-monospace, "SF Mono", Menlo, "IBM Plex Mono", monospace';
  const COL = { x: "#001af2", y: "#008000", z: "#d90d0d", mag: "#000000", ni: "#001af2", ne: "#ff9900", perp: "#d90d0d", par: "#001af2" };   // Helios's PlotColor
  const PAPER = "#f6f4fb", INK = "#1d1d22", INK2 = "rgba(29,29,34,0.6)", RULE = "rgba(29,29,34,0.16)", ORANGE = "#f39a1e";
  // live.html sets HSO_SOURCE (hso-live.js): the same screens on data fetched from the archives for any moment
  const SRC = window.HSO_SOURCE || null, LIVE = !!SRC;
  // live: a window opened in a tab of its own (?solo=mms1 …, the green button), or the HSO screen alone (?solo=hso)
  const SOLO = LIVE ? new URLSearchParams(location.search).get("solo") : null;
  /** This page at the same moment, showing one window: its craft, subplots, time range and pin. */
  function soloURL(W) {
    const u = new URL(location.href), C = W.cfg, A = W.app;
    for (const k of ["solo", "stack", "a", "b", "pin", "nc"]) u.searchParams.delete(k);
    u.searchParams.set("solo", String(W.n));
    if (C.stack) u.searchParams.set("stack", C.stack.join(","));
    u.searchParams.set("a", A.a.toFixed(3)); u.searchParams.set("b", A.b.toFixed(3));
    if (W.host && W.host.pinned != null) u.searchParams.set("pin", W.host.pinned.toFixed(3));
    u.hash = "";
    return u.toString();
  }
  const openSolo = (W) => window.open(soloURL(W), "_blank", "noopener");
  let T0 = SRC ? SRC.t0 : Date.UTC(2015, 9, 16, 11, 0, 0);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // a jet-like scale for the spectrograms, as Helios and SPEDAS draw them; the live page uses Helios's own
  // (MMSStackPlot.jetColor, MATLAB's jet: dark blue, blue, cyan, yellow, red, dark red)
  const LUT = (window.HSO_SOURCE) ? (() => {
    const out = new Uint8ClampedArray(256 * 3), c = (x) => Math.min(Math.max(x, 0), 1);
    for (let i = 0; i < 256; i++) {
      const t = i / 255;
      out[i * 3] = 255 * c(Math.min(4 * t - 1.5, -4 * t + 4.5)); out[i * 3 + 1] = 255 * c(Math.min(4 * t - 0.5, -4 * t + 3.5)); out[i * 3 + 2] = 255 * c(Math.min(4 * t + 0.5, -4 * t + 2.5));
    }
    return out;
  })() : (() => {
    const stops = [[0, [0, 0, 131]], [0.12, [0, 30, 255]], [0.32, [0, 200, 255]], [0.5, [70, 255, 160]],
                   [0.66, [235, 255, 20]], [0.82, [255, 140, 0]], [1, [178, 0, 0]]];
    const out = new Uint8ClampedArray(256 * 3);
    for (let i = 0; i < 256; i++) {
      const u = i / 255;
      let k = 0;
      while (k < stops.length - 2 && u > stops[k + 1][0]) k++;
      const [u0, c0] = stops[k], [u1, c1] = stops[k + 1], f = (u - u0) / (u1 - u0);
      for (let j = 0; j < 3; j++) out[i * 3 + j] = c0[j] + (c1[j] - c0[j]) * f;
    }
    return out;
  })();

  // ───────────────────────── small helpers ─────────────────────────
  const pad2 = (n) => String(n).padStart(2, "0");
  function clock(t, ms) {
    const d = new Date(T0 + t * 1000);
    const s = `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;
    return ms ? `${s}.${String(d.getUTCMilliseconds()).padStart(3, "0")}` : s;
  }
  /** Values as Helios's tracker writes them. */
  function fmtVal(v) {
    const a = Math.abs(v);
    if (a >= 1e4) { const e = Math.floor(Math.log10(a)); return `${(v / 10 ** e).toFixed(1)}e${e}`; }
    return a >= 100 ? v.toFixed(0) : a >= 10 ? v.toFixed(1) : a >= 1 ? v.toFixed(2) : v.toFixed(3);
  }
  function span(s) {
    if (s < 90) return `${Math.round(s)} s`;
    if (s < 5400) return `${Math.round(s / 60)} min`;
    const h = Math.floor(s / 3600), m = Math.round((s - h * 3600) / 60);
    return m ? `${h} h ${m} min` : `${h} h`;
  }
  function lower(a, x) {
    let lo = 0, hi = a.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < x) lo = m + 1; else hi = m; }
    return lo;
  }
  function nice(lo, hi, n) {
    const raw = (hi - lo) / Math.max(1, n), p = 10 ** Math.floor(Math.log10(raw)), f = raw / p;
    const step = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p, out = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-6; v += step) out.push(Math.abs(v) < step * 1e-6 ? 0 : v);
    return out;
  }
  const STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 10800, 21600, 43200, 86400];
  function timeTicks(a, b, px) {
    const step = STEPS.find(s => (b - a) / s <= px / 78) || 86400, out = [], z = T0 / 1000;
    for (let v = Math.ceil((a + z) / step) * step - z; v <= b; v += step) out.push(v);   // on whole UTC multiples
    return { ticks: out, secs: step < 60 };
  }
  /** Text with _{sub} and ^{sup} runs, in the app's system font. */
  function rich(ctx, str, x, y, o = {}) {
    const size = o.size || 11, w8 = o.weight || 400, parts = [], re = /([_^])\{([^}]*)\}/g;
    let last = 0, m;
    while ((m = re.exec(str))) { if (m.index > last) parts.push([str.slice(last, m.index), 0]); parts.push([m[2], m[1] === "_" ? 1 : -1]); last = re.lastIndex; }
    if (last < str.length) parts.push([str.slice(last), 0]);
    const font = (k) => `${w8} ${k ? size * 0.74 : size}px ${o.mono ? MONO : SYS}`;
    let w = 0;
    for (const [t, k] of parts) { ctx.font = font(k); w += ctx.measureText(t).width; }
    if (o.measure) return w;
    let cx = o.align === "right" ? x - w : o.align === "center" ? x - w / 2 : x;
    ctx.textBaseline = "middle"; ctx.textAlign = "left"; ctx.fillStyle = o.color || INK;
    for (const [t, k] of parts) { ctx.font = font(k); ctx.fillText(t, cx, y + k * size * 0.3); cx += ctx.measureText(t).width; }
    return w;
  }
  function sizeCanvas(cv) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2), w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h, dpr };
  }

  // ───────────────────────── the data ─────────────────────────
  const BASE = "assets/data/hso/";
  const unpack = (buf, index) => {
    const out = {};
    for (const [key, a] of Object.entries(index)) {
      const [g, name] = key.split(".");
      const arr = a.dtype === "f4" ? new Float32Array(buf, a.offset, a.count) : new Uint8Array(buf, a.offset, a.count);
      (out[g] = out[g] || { cols: {} })[name] = arr;
      out[g].cols[name] = a.cols;
    }
    return out;
  };
  const fetchBuf = (f) => fetch(BASE + f).then(r => { if (!r.ok) throw new Error(f); return r.arrayBuffer(); });

  /** The manifest and the context (MMS1's orbit, OMNI); each probe's data loads when it is first needed. */
  async function load() {
    if (LIVE) { const r = await SRC.load(); return { m: r.m, ctx: r.ctx, craft: {}, get bytes() { return SRC.bytes; }, set bytes(v) {} }; }
    const m = await fetch(BASE + "manifest.json").then(r => r.json());
    const ctx = await fetchBuf(m.context.file);
    return { m, ctx: unpack(ctx, m.context.arrays), craft: {}, bytes: ctx.byteLength };
  }
  /** Each record set's cadence; a gap is a bit over three steps. */
  function cadence(S) {
    const t = S.t, st = [];
    for (let i = 1; i < t.length; i += Math.max(1, Math.floor(t.length / 500))) st.push(t[i] - t[i - 1]);
    st.sort((p, q) => p - q);
    S.dt = st[st.length >> 1] || 1;          // 1 s for a record set with nothing in the window
    S.gap = 3.2 * S.dt;
  }
  /** Energy-bin edges (log10 eV) for each energy table of the given record sets, and the axis they span. */
  function edges(list) {
    let lo = 9, hi = -9;
    for (const S of list) {
      const n2 = S.cols.etab, k = S.etab.length / n2;
      S.edges = [];
      for (let j = 0; j < k; j++) {
        const le = Array.from(S.etab.subarray(j * n2, j * n2 + n2), Math.log10), ed = [le[0] - (le[1] - le[0]) / 2];
        for (let i = 0; i < n2 - 1; i++) ed.push((le[i] + le[i + 1]) / 2);
        ed.push(le[n2 - 1] + (le[n2 - 1] - le[n2 - 2]) / 2);
        S.edges.push(ed);
        const nr = S.etabN ? S.etabN[j] : n2;               // the table's real channels (THEMIS pads its short sweeps)
        lo = Math.min(lo, le[0]); hi = Math.max(hi, le[nr - 1]);
      }
    }
    return [lo, hi];
  }
  async function loadCraft(D, n) {
    if (D.craft[n]) return D.craft[n];
    if (LIVE) {                                             // survey, and burst within SRC.burstHalf of the moment
      const C = Object.assign({ segs: { fgm: [], dis: [], des: [] }, erange: {} }, await SRC.craft(n));
      for (const ds of Object.keys(C.sv)) cadence(C.sv[ds]);
      C.erange.dis = edges([C.sv.dis]); C.erange.des = edges([C.sv.des]);
      if (C.burst) C.burst.then((bu) => {                      // the burst data, when they arrive: segments, ranges, a redraw
        if (!bu) return;
        C.bu = Object.assign(bu, C.extraBu || {});
        for (const ds of ["fgm", "dis", "des"]) {
          const B = bu[ds], t = B.t, out = [];
          cadence(B);
          if (t.length) {
            let st = t[0];
            for (let i = 1; i < t.length; i++) if (t[i] - t[i - 1] > Math.max(1, B.gap)) { out.push([st, t[i - 1] + B.dt]); st = t[i]; }
            out.push([st, t[t.length - 1] + B.dt]);
          }
          C.segs[ds] = out;
        }
        for (const [k, sg] of Object.entries(C.burstSegs || {})) C.segs[k] = sg;   // on-demand burst sets (EDP) fetched earlier
        C.erange.dis = edges([C.sv.dis, bu.dis]); C.erange.des = edges([C.sv.des, bu.des]);
        if (D.n === n) D.bu = bu;
        window.dispatchEvent(new CustomEvent("hso-burst", { detail: n }));
      }, () => {});
      return (D.craft[n] = C);
    }
    const e = D.m.craft[n], bufs = await Promise.all([e.survey.file, e.burst.file].map(fetchBuf));
    const C = { sv: unpack(bufs[0], e.survey.arrays), bu: unpack(bufs[1], e.burst.arrays), kind: "mms" };
    D.bytes += bufs[0].byteLength + bufs[1].byteLength;
    for (const L of [C.sv, C.bu]) for (const ds of ["fgm", "dis", "des"]) cadence(L[ds]);
    // where each instrument has burst data
    C.segs = {};
    for (const ds of ["fgm", "dis", "des"]) {
      const B = C.bu[ds], t = B.t, out = [];
      let s = t[0];
      for (let i = 1; i < t.length; i++) if (t[i] - t[i - 1] > Math.max(1, B.gap)) { out.push([s, t[i - 1] + B.dt]); s = t[i]; }
      out.push([s, t[t.length - 1] + B.dt]);
      C.segs[ds] = out;
    }
    C.erange = { dis: edges([C.sv.dis, C.bu.dis]), des: edges([C.sv.des, C.bu.des]) };
    D.craft[n] = C;
    return C;
  }
  /** THEMIS-A or Cluster 4 (prepare_hso_missions.py): survey data only, in the shape loadCraft gives MMS. */
  let missionsIndex = null;
  async function loadMission(D, key) {
    if (D.craft[key]) return D.craft[key];
    if (LIVE) {
      const C = Object.assign({ segs: {}, erange: {} }, await SRC.mission(key));
      const settle = (ds) => { cadence(C.sv[ds]); C.segs[ds] = []; if (C.sv[ds].etab) C.erange[ds] = edges([C.sv[ds]]); };
      for (const ds of Object.keys(C.sv)) settle(ds);
      // record sets from a slow archive join the craft when they land; its open windows take their rows back
      if (C.later) C.later.then((sets) => {
        const ks = Object.keys(sets || {});
        for (const ds of ks) { C.sv[ds] = sets[ds]; settle(ds); }
        if (ks.length) window.dispatchEvent(new CustomEvent("hso-late", { detail: key }));
      }).catch(() => {});
      return (D.craft[key] = C);
    }
    missionsIndex = missionsIndex || await fetch(BASE + "missions.json").then(r => r.json());
    const e = missionsIndex[key], buf = await fetchBuf(e.survey.file);
    const C = { sv: unpack(buf, e.survey.arrays), bu: null, segs: {}, erange: {}, kind: key, label: e.label, notes: e.notes };
    D.bytes += buf.byteLength;
    for (const ds of Object.keys(C.sv)) { cadence(C.sv[ds]); C.segs[ds] = []; if (C.sv[ds].etab) C.erange[ds] = edges([C.sv[ds]]); }
    D.craft[key] = C;
    return C;
  }
  /** Point the drawing at one probe's data. */
  function useCraft(D, n) {
    const C = D.craft[n];
    Object.assign(D, { n, sv: C.sv, bu: C.bu, segs: C.segs, erange: C.erange });
  }
  /** A view of D with one craft's data, for a window of its own. */
  function viewOf(D, C, n) { return Object.assign(Object.create(D), { n, sv: C.sv, bu: C.bu, segs: C.segs, erange: C.erange, kind: C.kind }); }

  // the electron distributions (prepare_hso_vdf.py): MMS2 and MMS3, 13:07:01.0–03.5 UT
  let vdfIndex = null;
  const vdfCache = {};
  async function loadVDF(n) {
    vdfIndex = vdfIndex || await fetch(BASE + "vdf.json").then(r => r.json());
    const P = vdfIndex.probes[n];
    if (!P) return null;
    if (vdfCache[n]) return vdfCache[n];
    const buf = await fetchBuf(P.file), N = P.n;
    let o = 0;
    const take = (cnt, T) => { const a = new T(buf, o, cnt); o += a.byteLength; return a; };
    vdfCache[n] = { n, t: P.t, E: take(N * 32, Float32Array), PHI: take(N * 32, Float32Array), B: take(N * 3, Float32Array),
                    V: take(N * 3, Float32Array), Q: take(N, Float32Array), D: take(N * 16384, Uint8Array),
                    lo: P.log10[0], hi: P.log10[1], crescent: P.crescent, dbcsToGSE: P.dbcs_to_gse };
    return vdfCache[n];
  }

  /** The records of one instrument in [a, b]: survey between the burst segments, burst inside them. */
  function runs(D, ds, a, b, burst) {
    const S = D.sv[ds], B = D.bu && D.bu[ds], out = [];
    if (!S) return out;
    let cur = a;
    if (burst && B) for (const [s, e] of D.segs[ds] || []) {
      if (e <= a || s >= b) continue;
      if (s > cur) out.push([S, lower(S.t, cur === a ? a - S.dt : cur), lower(S.t, s)]);
      out.push([B, lower(B.t, Math.max(s, a) - B.dt), lower(B.t, Math.min(e, b) + B.dt)]);
      cur = e;
    }
    if (cur < b) out.push([S, lower(S.t, cur === a ? a - S.dt : cur), lower(S.t, b + S.dt)]);
    return out;
  }
  /** The record of one instrument at t (burst where there is some), or null in a gap. */
  function recordAt(D, ds, t, burst = true) {
    const inB = burst && D.bu && (D.segs[ds] || []).some(([s, e]) => t >= s && t <= e), L = inB ? D.bu : D.sv, S = L[ds];
    if (!S) return null;
    let i = lower(S.t, t);
    if (i >= S.t.length) i = S.t.length - 1;
    else if (i > 0 && t - S.t[i - 1] < S.t[i] - t) i--;
    return Math.abs(S.t[i] - t) <= Math.max(S.dt * 1.5, 0.5) ? [S, i] : null;
  }

  // ───────────────────────── drawing a series ─────────────────────────
  /** An accessor over one record set: col(name, c)(L) → (i) → the value, or null where the set lacks it. */
  const col = (name, c) => (L) => { const v = L[name]; if (!v) return null; const st = L.cols[name]; return (i) => v[i * st + c]; };
  function extent(rr, acc, lo, hi, a = -Infinity, b = Infinity) {
    for (const [L, i0, i1] of rr) {
      const f = acc(L);
      if (!f) continue;
      for (let i = Math.max(0, i0); i < Math.min(L.t.length, i1); i++) {
        if (L.t[i] < a || L.t[i] > b) continue;
        const y = f(i);
        if (y < lo) lo = y; if (y > hi) hi = y;
      }
    }
    return [lo, hi];
  }
  /** A value-colored line (MMSStackPlot's banded lines): a polyline whose segments take the band of their higher
   *  end, bridged over gaps as Helios draws them, 1.7 px wide. */
  function strokeBands(ctx, R, a, b, rr, acc, yOf, bands) {
    const kx = R.w / (b - a), col = (v) => { let c = bands[0][1]; for (const [m, h] of bands) if (v >= m) c = h; return c; };
    ctx.save(); ctx.beginPath(); ctx.rect(R.x, R.y, R.w, R.h); ctx.clip();
    ctx.lineWidth = 1.7; ctx.lineCap = "round"; ctx.lineJoin = "round";
    let px = null, cur = null;
    for (const [L, i0, i1] of rr) {
      const f = acc(L);
      if (!f) continue;
      for (let i = Math.max(0, i0 - 1); i < Math.min(L.t.length, i1 + 1); i++) {
        const v = f(i), Y = yOf(v);
        if (!isFinite(Y)) continue;
        const X = R.x + (L.t[i] - a) * kx;
        if (px) {
          const c = col(Math.max(px[2], v));
          if (c !== cur) { if (cur) ctx.stroke(); ctx.strokeStyle = cur = c; ctx.beginPath(); ctx.moveTo(px[0], px[1]); }
          ctx.lineTo(X, Y);
        }
        px = [X, Y, v];
      }
    }
    if (cur) ctx.stroke();
    ctx.restore();
  }
  function stroke(ctx, R, a, b, rr, acc, yOf, color, width, shift) {
    const kx = R.w / (b - a);
    ctx.save(); ctx.beginPath(); ctx.rect(R.x, R.y, R.w, R.h); ctx.clip();
    ctx.strokeStyle = color; ctx.lineWidth = width || 1.1; ctx.lineJoin = "round"; ctx.beginPath();
    // Helios (MMSStackPlot.drawLine): a break only where the spacing exceeds max(3 × the median of the last five
    // spacings, 60 s); a non-finite sample (fill, a despiked point) is skipped and the line bridged over it
    // (the same rule without an allocation per sample: no spacing under 60 s is a gap, so the median of the last five is
    // only worked out for the rare longer one)
    let pen = false, prev = -Infinity, nd = 0;
    const d5 = new Float64Array(5), s5 = new Float64Array(5);
    const isGap = (t) => {
      if (prev === -Infinity) return true;
      const dt = t - prev;
      if (!(dt > 60)) return false;
      const m = Math.min(nd, 5);
      if (!m) return false;                                  // no spacing yet: the median is this one, and dt > 3 dt never holds
      for (let i = 0; i < m; i++) { const v = d5[i]; let j = i - 1; while (j >= 0 && s5[j] > v) { s5[j + 1] = s5[j]; j--; } s5[j + 1] = v; }
      return dt > 3 * s5[m >> 1];
    };
    const note = (t) => { if (prev > -Infinity) { d5[nd % 5] = t - prev; nd++; } prev = t; };
    for (const [L, i0, i1] of rr) {
      const f = acc(L);
      if (!f) continue;
      const t0 = L.t, sh = shift ? shift(L) : 0, t = sh ? { length: t0.length } : t0, j0 = Math.max(0, i0), j1 = Math.min(t0.length, i1);
      if (sh) for (let i = j0; i < j1; i++) t[i] = t0[i] + sh;
      if (j1 - j0 < R.w * 3) {
        for (let i = j0; i < j1; i++) {
          const y0 = f(i);
          if (!isFinite(yOf(y0))) continue;                 // not placeable (fill, ≤ 0 on a log row): bridged
          if (isGap(t[i])) pen = false;
          note(t[i]);
          const X = R.x + (t[i] - a) * kx, Y = yOf(y0);
          if (pen) ctx.lineTo(X, Y); else { ctx.moveTo(X, Y); pen = true; }
        }
      } else {                                              // more samples than pixels: each column's first, min, max, last
        let c = null, fy = 0, mn = 0, mx = 0, ly = 0;
        const flush = () => {
          if (c === null) return;
          const X = R.x + c + 0.5;
          if (pen) ctx.lineTo(X, yOf(fy)); else { ctx.moveTo(X, yOf(fy)); pen = true; }
          ctx.lineTo(X, yOf(mn)); ctx.lineTo(X, yOf(mx)); ctx.lineTo(X, yOf(ly));
          c = null;
        };
        for (let i = j0; i < j1; i++) {
          const y = f(i), ti = t[i];
          if (!isFinite(yOf(y))) continue;
          if (isGap(ti)) { flush(); pen = false; }
          note(ti);
          const cc = Math.floor((ti - a) * kx);
          if (cc !== c) { flush(); c = cc; fy = mn = mx = ly = y; }
          else { if (y < mn) mn = y; if (y > mx) mx = y; ly = y; }
        }
        flush();
      }
    }
    ctx.stroke(); ctx.restore();
  }
  const scratch = document.createElement("canvas");
  /** Where a set's samples run, broken at spacings over 15 s (Helios's Fast bar). */
  function fastSegs(S) {
    if (!S || !S.t.length) return [];
    if (S._fast) return S._fast;
    const t = S.t, out = [];
    let st = t[0];
    for (let i = 1; i < t.length; i++) if (t[i] - t[i - 1] > 15) { out.push([st, t[i - 1]]); st = t[i]; }
    out.push([st, t[t.length - 1]]);
    return (S._fast = out);
  }
  /** Live: the spectrogram's color range as Helios sets it (MMSStackPlot.specRange): the 2–99.5th percentile of the
   *  flux in the window (≤ 600 columns sampled), out to whole decades, at least 3 and at most 7 of them; a fixed
   *  fallback (10³–10⁷ ions, 10⁴–10⁹ electrons) when fewer than 30 values. The demo keeps its fixed ranges. */
  function specRange(D, ds, rangeKey, a, b, burst) {
    const store = (D.sv[ds] && D.sv[ds].store) || (D.m.spectra[rangeKey] || D.m.spectra.dis).log10;
    if (!LIVE) return store;
    // the records in the window, survey and burst merged in time order, then ONE stride over them all (≤ 600 columns)
    const recs = [];
    for (const [S, i0, i1] of runs(D, ds, a, b, burst)) for (let i = Math.max(0, i0); i < Math.min(S.t.length, i1); i++) if (S.t[i] >= a && S.t[i] <= b) recs.push([S, i]);
    const q = [], step = Math.max(1, Math.floor(recs.length / 600));
    for (let k = 0; k < recs.length; k += step) {
      const [S, i] = recs[k], nc = S.cols.spec;
      for (let j = 0; j < nc; j++) {
        if (S.specLog) { const l = S.specLog[i * nc + j]; if (isFinite(l)) q.push(l); }   // full precision where kept
        else { const v = S.spec[i * nc + j]; if (v > 1) q.push(store[0] + (v - 1) / 254 * (store[1] - store[0])); }
      }
    }
    if (q.length <= 30) return ({ dis: [3, 7], hpH: [3, 7], hpHepp: [2, 6], hpHep: [1, 5], hpO: [1, 5], epsd: [-16, -8] })[rangeKey] || [4, 9];
    q.sort((x, y) => x - y);
    const lg = (l) => l;
    const hi = Math.ceil(lg(q[Math.floor(q.length * 0.995)]) - 1e-9);
    let lo = Math.floor(lg(q[Math.floor(q.length * 0.02)]) + 1e-9);
    if (hi - lo < 3) lo = hi - 3;
    if (hi - lo > 7) lo = hi - 7;
    return [lo, hi];
  }
  function spectrogram(ctx, R, a, b, D, ds, burst, dpr, win) {
    const W = Math.max(1, Math.round(R.w * dpr)), H = Math.max(1, Math.round(R.h * dpr));
    // live: each 8-bit flux re-read on the window's own color range (specRange)
    const store = win ? (D.sv[ds] && D.sv[ds].store) || D.m.spectra[ds === "des" || ds === "esp" ? "des" : "dis"].log10 : null;
    const cmap = win ? Uint16Array.from({ length: 256 }, (_, v) => v === 0 ? 0 : Math.round(clamp(((store[0] + (v - 1) / 254 * (store[1] - store[0])) - win[0]) / (win[1] - win[0]), 0, 1) * 255) * 3) : null;
    const img = new ImageData(W, H), px = new Uint32Array(img.data.buffer), [elo, ehi] = D.erange[ds], maps = new Map();
    const col32 = new Uint32Array(256).fill(0xffffffff);     // code → ABGR (little-endian RGBA); 0, no data, white
    for (let v = 1; v < 256; v++) { const c = cmap ? cmap[v] : Math.round((v - 1) * 255 / 254) * 3; col32[v] = (0xff000000 | (LUT[c + 2] << 16) | (LUT[c + 1] << 8) | LUT[c]) >>> 0; }
    const rows = (L, k) => {
      const key = (L === D.bu ? "b" : "s") + k;
      let m = maps.get(key);
      if (m) return m;
      const ed = L[ds].edges[k], n = ed.length - 1;
      m = new Int16Array(H);
      for (let y = 0; y < H; y++) {
        const le = ehi - (y + 0.5) / H * (ehi - elo);
        let j = 0;
        while (j < n - 1 && le >= ed[j + 1]) j++;
        m[y] = le < ed[0] || le > ed[n] ? -1 : j;          // outside this record's own table: blank (Helios ownEdges)
      }
      maps.set(key, m);
      return m;
    };
    const segs = burst && D.bu ? D.segs[ds] || [] : [];
    let si = 0;
    const colMax = new Uint8Array(H), chan = [], seen = [], used = [];
    for (let x = 0; x < W; x++) {
      const t = a + (x + 0.5) / W * (b - a);
      while (si < segs.length && segs[si][1] < t) si++;
      const L = si < segs.length && segs[si][0] <= t ? D.bu : D.sv, S = L[ds], tt = S.t, nc = S.cols.spec;
      const i = lower(tt, t + 1e-6) - 1;                     // the record whose accumulation covers t
      const cap = Math.max(3 * (i > 0 ? tt[i] - tt[i - 1] : S.dt), 8), ok = i >= 0 && t - tt[i] <= cap;
      const rm = ok ? rows(L, S.eidx[i]) : null, base = i * nc;
      // live, as Helios (MMSStackPlot.drawSpectrogram): where more records than pixels, each channel's MAX over the
      // records in the pixel column, so a narrow high-flux structure survives being zoomed out
      let many = false;
      if (win) {
        const ta = a + x / W * (b - a), tb = a + (x + 1) / W * (b - a), k0 = lower(tt, ta), k1 = lower(tt, tb);
        if (k1 - k0 >= 2) {
          // the maximum per channel for each energy table in the column first (records × channels), then onto the rows:
          // the same picture as going record by record down every row, at a fraction of the work in burst
          many = true; colMax.fill(0); used.length = 0;
          const sp = S.spec, ei = S.eidx;
          for (let k = k0; k < k1; k++) {
            const e = ei[k];
            let cm = chan[e];
            if (!cm || cm.length < nc) cm = chan[e] = new Uint8Array(nc);
            if (seen[e] !== x + 1) { seen[e] = x + 1; cm.fill(0); used.push(e); }
            const bk = k * nc;
            for (let c = 0; c < nc; c++) { const v = sp[bk + c]; if (v > cm[c]) cm[c] = v; }
          }
          for (const e of used) {
            const rk = rows(L, e), cm = chan[e];
            for (let y = 0; y < H; y++) { const j = rk[y]; if (j >= 0 && cm[j] > colMax[y]) colMax[y] = cm[j]; }
          }
        }
      }
      const fill = S.fillGaps && i > 0 && i + 1 < tt.length, spc = S.spec;
      for (let y = 0, o = x; y < H; y++, o += W) {            // one 32-bit write a pixel, its color looked up once per code
        const j = ok ? rm[y] : -1;
        let q = many ? colMax[y] : j < 0 ? 0 : spc[base + j];
        if (!q && fill && j >= 0 && spc[(i + 1) * nc + j]) q = spc[(i - 1) * nc + j];   // an isolated empty cell
        px[o] = col32[q];
      }
    }
    scratch.width = W; scratch.height = H;
    scratch.getContext("2d").putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(scratch, R.x, R.y, R.w, R.h);
    ctx.imageSmoothingEnabled = true;
  }
  function colorbar(ctx, x, y, w, h, range, unit) {
    for (let i = 0; i < h; i++) {
      const c = Math.round((1 - i / h) * 255) * 3;
      ctx.fillStyle = `rgb(${LUT[c]},${LUT[c + 1]},${LUT[c + 2]})`;
      ctx.fillRect(x, y + i, w, 1.2);
    }
    ctx.strokeStyle = RULE; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    const [lo, hi] = range, every = hi - lo > 3 ? 2 : 1;
    for (let e = Math.ceil(lo); e <= Math.floor(hi); e++) {
      if ((e - Math.ceil(lo)) % every) continue;
      const yy = y + h - (e - lo) / (hi - lo) * h;
      if (yy < y + 4 || yy > y + h - 4) continue;
      rich(ctx, `10^{${e}}`, x + w + 3, yy, { size: 9.5, color: INK2 });
    }
    if (unit) { ctx.save(); ctx.translate(x + w + 30, y + h / 2); ctx.rotate(-Math.PI / 2); rich(ctx, unit, 0, 0, { size: 8, align: "center", color: INK2 }); ctx.restore(); }
  }
  function energyAxis(ctx, R, range) {
    const [lo, hi] = range;
    for (let e = Math.ceil(lo); e <= Math.floor(hi); e++) {
      const y = R.y + R.h - (e - lo) / (hi - lo) * R.h;
      if (y < R.y + 5 || y > R.y + R.h - 3) continue;
      ctx.fillStyle = INK; ctx.fillRect(R.x - 4, Math.round(y), 4, 1);
      rich(ctx, String(10 ** e), R.x - 6, y, { size: 10, align: "right", color: INK2 });
    }
  }

  // ───────────────────────── the data panel ─────────────────────────
  // The subplots, as Helios names and orders them (MMSPanels.swift). A line is a vector component (vec, which MVAB turns
  // into L, M, N), a scalar, or derived from its record set; `avail: false` lists a subplot the demo has no data for.
  const Vc = (ds, name, c, color, label) => ({ ds, name, c, color, label, vec: true });
  const Sc = (ds, name, c, color, label) => ({ ds, name, c, color, label });
  /** A line colored by its value (Helios's ExtraChart.ColorBand): each segment the band of its higher end. */
  const banded = (line, bands) => Object.assign(line, { bands });
  const KP_BANDS = [[0, "#2e9e4f"], [4, "#d9a400"], [5, "#e8720c"], [7, "#d11a1a"]];
  const MACH_BANDS = [[0, "#1f4fd8"], [2, "#3e8fe0"], [4, "#6fb6c8"], [6, "#d9a400"], [9, "#e8720c"], [14, "#d11a1a"]];
  const XYZ = (ds, name) => [Vc(ds, name, 0, COL.x, "X"), Vc(ds, name, 1, COL.y, "Y"), Vc(ds, name, 2, COL.z, "Z")];
  const QE = 1.602176634e-4;                              // e × (cm⁻³ → m⁻³) × (km/s → m/s) × (A → µA) over m² … per n·v
  const derive = (ds, color, label, fn) => ({ ds, color, label, derive: fn });
  /** Pressure in nPa: n kT for a species (T as (T∥ + 2T⊥)/3), B²/2μ₀ for the field. */
  const pSpecies = (L) => (L.n && L.tpar ? (i) => QE * L.n[i] * (L.tpar[i] + 2 * L.tperp[i]) / 3 : null);
  const pField = (L) => { const b = L.b, st = L.cols.b; return b ? (i) => 3.979e-4 * b[i * st + 3] ** 2 : null; };
  /** J along and across B (Helios getJparallel): c = 0–2 the J∥ or J⊥ vector's component, c = 3 the signed J·B̂;
   *  B the mean over each DES record's accumulation. */
  const jAlong = (perp, c) => (L, P) => {
    const F = P.fgmFor(L), J = P.jFor(L), dt = L.dt || 0.03;
    if (!F || !J) return null;
    return (i) => {
      const b = meanIn(F, "b", L.t[i], L.t[i] + dt, 2);
      if (!b) return NaN;
      const m = Math.hypot(b[0], b[1], b[2]);
      if (!(m > 0)) return NaN;
      const j = [J(i, 0), J(i, 1), J(i, 2)], par = (j[0] * b[0] + j[1] * b[1] + j[2] * b[2]) / m;
      if (c === 3) return par;
      return perp ? j[c] - par * b[c] / m : par * b[c] / m;
    };
  };
  /** Pᵢ + Pₑ (+ P_B) on the ion grid (Helios summedOverAccumulation): each DIS record plus the mean Pₑ (DES by its
   *  accumulation's middle) and P_B over that record's own accumulation; no point where either is missing. */
  const pSum = (withB) => (L, P) => {
    const pi = pSpecies(L), E = P.set(L, "des"), F = P.fgmFor(L) || P.set(L, "fgm"), pe = E && pSpecies(E), pb = F && pField(F);
    if (!pi || !pe || (withB && !pb)) return null;
    const step = L.dt || 4.5, hE = (E.dt || 0) / 2;
    const meanOver = (O, f, t0, t1, sh) => { let s = 0, m = 0; for (let k = lower(O.t, t0 - sh); k < O.t.length && O.t[k] + sh < t1; k++) { const v = f(k); if (isFinite(v)) { s += v; m++; } } return m ? s / m : NaN; };
    return (i) => {
      const t0 = L.t[i], nx = i + 1 < L.t.length ? L.t[i + 1] - t0 : step, t1 = t0 + (nx > 0 ? Math.min(nx, 1.5 * step) : step);
      let v = pi(i) + meanOver(E, pe, t0, t1, hE);
      if (withB) v += meanOver(F, pb, t0, t1, 0);
      return v;
    };
  };
  // E′, J·E′ and the frozen-in comparisons (Helios's DerivedVariables): each computed at the velocity's records, with E
  // and B from the same tier (survey or burst) at the nearest sample. (V×B in mV/m = V [km/s] × B [nT] × 10⁻³.)
  const nearestK = (O, t, tol) => {
    if (!O || !O.t.length) return -1;
    let k = lower(O.t, t);
    if (k >= O.t.length) k = O.t.length - 1;
    if (k > 0 && t - O.t[k - 1] < O.t[k] - t) k--;
    return Math.abs(O.t[k] - t) <= tol ? k : -1;
  };
  const v3 = (O, name, k) => { const a = O[name], st = O.cols[name]; return [a[k * st], a[k * st + 1], a[k * st + 2]]; };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  /** The mean of a vector set over [t0, t1], or the nearest sample within tol where none falls inside. */
  const meanIn = (O, name, t0, t1, tol) => {
    let k = lower(O.t, t0), s0 = 0, s1 = 0, s2 = 0, m = 0;
    const a = O[name], st = O.cols[name];
    for (; k < O.t.length && O.t[k] <= t1; k++) { const x = a[k * st], y = a[k * st + 1], z = a[k * st + 2]; if (isFinite(x) && isFinite(y) && isFinite(z)) { s0 += x; s1 += y; s2 += z; m++; } }
    if (m) return [s0 / m, s1 / m, s2 / m];
    const j = nearestK(O, (t0 + t1) / 2, tol);
    return j < 0 ? null : v3(O, name, j);
  };
  /** At each velocity record: { e, b, v } (GSE), E and B averaged over the record's own accumulation (Helios: a
   *  point sample aliased the upper-hybrid waves into J·E′). e is null where there is no E. */
  const fieldsAt = (L, P, needE = true) => {
    const E = P.set(L, "efiN") || P.set(L, "efi"), F = P.set(L, "fgm"), V = P.vel(L), dt = L.dt || 4.5;
    if ((needE && !E) || !F || !V) return null;
    return (i) => {
      const t = L.t[i], b = meanIn(F, "b", t, t + dt, 2), e = E ? meanIn(E, "e", t, t + dt, 2) : null;
      return !b || (needE && !e) ? null : { e, b, v: [V(i, 0), V(i, 1), V(i, 2)] };
    };
  };
  /** E′ = E + V×B, component c, in mV/m. */
  const ePrime = (c) => (L, P) => { const f = fieldsAt(L, P); return f && ((i) => { const q = f(i); return q ? q.e[c] + 1e-3 * cross(q.v, q.b)[c] : NaN; }); };
  /** −V×B, component c, in mV/m. */
  const minusVxB = (c) => (L, P) => { const f = fieldsAt(L, P, false); return f && ((i) => { const q = f(i); return q ? -1e-3 * cross(q.v, q.b)[c] : NaN; }); };   // needs no E
  /** J·E′ (E′ in the electron frame), nW/m³: J [µA/m²] × E [mV/m]. */
  const jDotEp = (L, P) => {
    const f = fieldsAt(L, P), J = P.jFor(L);
    return f && J && ((i) => { const q = f(i); if (!q) return NaN; const vb = cross(q.v, q.b); return [0, 1, 2].reduce((s, c) => s + J(i, c) * (q.e[c] + 1e-3 * vb[c]), 0); });
  };
  /** The E×B drift, component c, km/s (E mV/m, B nT): 10³ E×B / B², B interpolated linearly to E's times (Helios). */
  const exb = (c) => (L, P) => {
    const F = P.set(L, "fgm");
    if (!F) return null;
    return (i) => {
      const t = L.t[i];
      let k = lower(F.t, t);
      if (k <= 0 || k >= F.t.length || F.t[k] - F.t[k - 1] > 4) return NaN;
      const f = (t - F.t[k - 1]) / (F.t[k] - F.t[k - 1]), b0 = v3(F, "b", k - 1), b1 = v3(F, "b", k), b = [0, 1, 2].map(j => b0[j] + (b1[j] - b0[j]) * f);
      const e = v3(L, "e", i), b2 = b[0] ** 2 + b[1] ** 2 + b[2] ** 2;
      return b2 > 0 ? 1e3 * cross(e, b)[c] / b2 : NaN;
    };
  };
  /** V⊥, component c, with B averaged over the record's accumulation. */
  const vPerp = (c) => (L, P) => {
    const f = fieldsAt(L, P, false);
    return f && ((i) => { const q = f(i); if (!q) return NaN; const b = q.b, m = Math.hypot(...b) || 1, v = q.v, par = (v[0] * b[0] + v[1] * b[1] + v[2] * b[2]) / m; return v[c] - par * b[c] / m; });
  };
  const midStamp = (L) => (L.dt || 0) / 2;                  // drawn at the middle of each accumulation (Helios FrozenIn)
  const HP_COL = { H: "#000000", Hep: "#008000", Hepp: "#d90d0d", O: "#001af2" }, HP_LAB = { H: "H^{+}", Hepp: "He^{++}", Hep: "He^{+}", O: "O^{+}" };
  const hpSpec = (k, name) => ({ title: `Spectrogram  ${name}`, label: `HPCA ${HP_LAB[k]}`, short: HP_LAB[k], unit: "(eV)", w: 1, spec: `hp${k}`, range: `hp${k}`, lazy: `hp${k}` });
  const hpVel = (k, name) => ({ title: `Velocity  V(${name})`, label: `V ${HP_LAB[k]}`, unit: "(km/s)", w: 0.9, zero: true, lazy: "hpcaMom", lines: XYZ("hpm", `v${k}`) });
  // in Helios's order, H⁺ He⁺ He⁺⁺ O⁺ (the moments set keeps H⁺ He⁺⁺ He⁺ O⁺ columns)
  const four = (name, f) => [["H", 0], ["Hep", 2], ["Hepp", 1], ["O", 3]].map(([k, j]) => f(k, j));
  /** A derived vector component that turns with the LMN frame: mk(cc) makes component cc's line; under LMN the
   *  three are combined along the frame's row c, as the stored vectors are. */
  const rotd = (line, c, mk, lmnLabel = null) => Object.assign(line, { c, rot: mk, lmnLabel });
  const fz = (sp, c) => ({ title: `E vs −V${sp === "des" ? "ₑ" : "ᵢ"}×B  · ${"xyz"[c]}`, label: `E_{${"xyz"[c]}}`, unit: "(mV/m)", w: 0.8, zero: true, lazy: "edp",
                          comp: c, lines: [Object.assign(Vc("efi", "e", c, COL.mag, `E_{${"xyz"[c]}}`), { lmnLabel: (k) => `E_{${k}}` }),
                                           Object.assign(rotd(derive(sp, COL.z, `−V_{${sp === "des" ? "e" : "i"}}×B`, minusVxB(c)), c, minusVxB, () => `−V_{${sp === "des" ? "e" : "i"}}×B`), { shift: midStamp })] });
  const KINDS = {
    b: { title: "B — magnetic field", label: "B", unit: "(nT)", w: 1.25, zero: true, lines: [Sc("fgm", "b", 3, COL.mag, "|B|"), ...XYZ("fgm", "b")] },
    ionSpec: { title: "Ion spectrogram", label: "Ions", unit: "(eV)", w: 1, spec: "dis", range: "dis" },
    elecSpec: { title: "Electron spectrogram", label: "Electrons", short: "Elec.", unit: "(eV)", w: 1, spec: "des", range: "des" },
    n: { title: "Density  Nᵢ / Nₑ", label: "N", unit: "(cm⁻³)", w: 0.9, floor: 0, lines: [Sc("dis", "n", 0, COL.ni, "N_{i}"), Sc("des", "n", 0, COL.ne, "N_{e}")] },
    ti: { title: "Ion temperature", label: "T_{i}", unit: "(eV)", w: 0.9, floor: 0, lines: [Sc("dis", "tperp", 0, COL.perp, "T_{i⊥}"), Sc("dis", "tpar", 0, COL.par, "T_{i∥}")] },
    te: { title: "Electron temperature", label: "T_{e}", unit: "(eV)", w: 0.9, floor: 0, lines: [Sc("des", "tperp", 0, COL.perp, "T_{e⊥}"), Sc("des", "tpar", 0, COL.par, "T_{e∥}")] },
    tanis: { title: "T anisotropy  T∥/T⊥ − 1", label: "T_{∥}/T_{⊥} − 1", unit: "", w: 0.8, zero: true,
             lines: [derive("dis", COL.ni, "A_{i}", (L) => (L.tpar ? (i) => L.tpar[i] / L.tperp[i] - 1 : null)),
                     derive("des", COL.ne, "A_{e}", (L) => (L.tpar ? (i) => L.tpar[i] / L.tperp[i] - 1 : null))] },
    p: { title: "Pressure  Pᵢ / Pₑ / Pᵢ+Pₑ / P_B / P_tot", label: "P", unit: "(nPa)", w: 0.9,
         lines: [derive("dis", COL.ni, "P_{i}", pSpecies), derive("des", COL.ne, "P_{e}", pSpecies), derive("dis", COL.y, "P_{i}+P_{e}", pSum(false)),
                 derive("fgm", COL.mag, "P_{B}", pField), derive("dis", COL.z, "P_{tot}", pSum(true))] },
    vi: { title: "Ion velocity  Vᵢ", label: "V_{i}", unit: "(km/s)", w: 1, zero: true, lines: XYZ("dis", "v") },
    ve: { title: "Electron velocity  Vₑ", label: "V_{e}", unit: "(km/s)", w: 1, zero: true, lines: XYZ("des", "v") },
    jfpi: { title: "Current  J (FPI)", label: "J_{FPI}", unit: "(µA/m²)", w: 1, zero: true, lines: XYZ("des", "j") },
    jpar: { title: "J∥  (parallel current)", label: "J_{∥}", unit: "(µA/m²)", w: 0.8, zero: true,
            lines: [...[0, 1, 2].map(c => rotd(derive("des", [COL.x, COL.y, COL.z][c], "XYZ"[c], jAlong(false, c)), c, (cc) => jAlong(false, cc))), derive("des", COL.mag, "J_{∥}·B̂", jAlong(false, 3))] },
    jperp: { title: "J⊥  (perpendicular current)", label: "J_{⊥}", unit: "(µA/m²)", w: 0.8, zero: true,
             lines: [0, 1, 2].map(c => rotd(derive("des", [COL.x, COL.y, COL.z][c], "XYZ"[c], jAlong(true, c)), c, (cc) => jAlong(true, cc))) },
    e: { title: "E — electric field", label: "E", unit: "(mV/m)", w: 1, zero: true, lazy: "edp", lines: XYZ("efi", "e") },
    pot: { title: "Spacecraft potential", label: "V_{sc}", unit: "(V)", w: 0.7, lazy: "edp", lines: [Sc("pot", "v", 0, COL.x, "V_{sc}")] },
    epsd: { title: "E-field spectrogram (DSP, omni)", label: "DSP E", unit: "(Hz)", w: 1, spec: "epsd", range: "epsd", lazy: "dsp", cbar: "(V/m)²/Hz" },
    epE: { title: "E′ = E + Vₑ×B  (electron frame)", label: "E′_{e}", unit: "(mV/m)", w: 0.9, zero: true, lazy: "edp",
           lines: [0, 1, 2].map(c => rotd(derive("des", [COL.x, COL.y, COL.z][c], "XYZ"[c], ePrime(c)), c, ePrime)) },
    epI: { title: "E′ = E + Vᵢ×B  (ion frame)", label: "E′_{i}", unit: "(mV/m)", w: 0.9, zero: true, lazy: "edp",
           lines: [0, 1, 2].map(c => rotd(derive("dis", [COL.x, COL.y, COL.z][c], "XYZ"[c], ePrime(c)), c, ePrime)) },
    jdotE: { title: "J·E′ — dissipation", label: "J·E′", unit: "(nW/m³)", w: 0.8, zero: true, lazy: "edp", lines: [derive("des", COL.mag, "J·E′", jDotEp)] },
    fzEx: fz("des", 0), fzEy: fz("des", 1), fzEz: fz("des", 2), fzIx: fz("dis", 0), fzIy: fz("dis", 1), fzIz: fz("dis", 2),
    exbX: null, exbY: null, exbZ: null,
    hpH: hpSpec("H", "H⁺"), hpHepp: hpSpec("Hepp", "He⁺⁺"), hpHep: hpSpec("Hep", "He⁺"), hpO: hpSpec("O", "O⁺"),
    hpN: { title: "Densities  H⁺ He⁺ He⁺⁺ O⁺", label: "N HPCA", unit: "(cm⁻³)", w: 0.9, log: true, lazy: "hpcaMom", lines: four("n", (k, j) => Sc("hpm", "n", j, HP_COL[k], HP_LAB[k])) },
    hpVH: hpVel("H", "H⁺"), hpVHepp: hpVel("Hepp", "He⁺⁺"), hpVHep: hpVel("Hep", "He⁺"), hpVO: hpVel("O", "O⁺"),
    hpV: { title: "Bulk speeds  |V| by species", label: "|V| HPCA", unit: "(km/s)", w: 0.9, lazy: "hpcaMom", lines: four("V", (k, j) => Sc("hpm", "speed", j, HP_COL[k], HP_LAB[k])) },
    hpT: { title: "Temperatures by species", label: "T HPCA", unit: "(eV)", w: 0.9, log: true, lazy: "hpcaMom", lines: four("T", (k, j) => Sc("hpm", "T", j, HP_COL[k], HP_LAB[k])) },
    hpP: { title: "Pressures by species", label: "P HPCA", unit: "(nPa)", w: 0.9, log: true, lazy: "hpcaMom",
           lines: four("P", (k, j) => derive("hpm", HP_COL[k], HP_LAB[k], (L) => (L.n && L.T ? (i) => QE * L.n[i * 4 + j] * L.T[i * 4 + j] : null))) },
    // the OMNI window (Helios's OmniPanel.rows) and the L1 monitors' plasma
    omBt: { title: "IMF |B|", label: "|B|", unit: "(nT)", w: 0.8, floor: 0, lines: [Sc("omni", "bt", 0, COL.mag, "|B|")] },
    omBz: { title: "IMF Bz (GSM)", label: "B_{z}", unit: "(nT)", w: 0.8, zero: true, lines: [Sc("omni", "bz", 0, COL.mag, "B_{z} GSM")] },
    omBy: { title: "IMF By (GSM)", label: "B_{y}", unit: "(nT)", w: 0.8, zero: true, lines: [Sc("omni", "by", 0, COL.mag, "B_{y} GSM")] },
    omBx: { title: "IMF Bx (GSE)", label: "B_{x}", unit: "(nT)", w: 0.8, zero: true, lines: [Sc("omni", "bx", 0, COL.mag, "B_{x} GSE")] },
    omV: { title: "Flow speed", label: "V", unit: "(km/s)", w: 0.8, lines: [Sc("omni", "v", 0, COL.mag, "V")] },
    omNp: { title: "Proton density", label: "N_{p}", unit: "(cm⁻³)", w: 0.8, lines: [Sc("omni", "np", 0, COL.mag, "N_{p}")] },
    omT: { title: "Proton temperature", label: "T_{p}", unit: "(K)", w: 0.8, log: true, lines: [Sc("omni", "tp", 0, COL.mag, "T_{p}")] },
    omP: { title: "Dynamic pressure", label: "P_{dyn}", unit: "(nPa)", w: 0.8, floor: 0, lines: [Sc("omni", "pdyn", 0, COL.mag, "P_{dyn}")] },
    omEy: { title: "Ey = −V Bz", label: "E_{y}", unit: "(mV/m)", w: 0.8, zero: true, lines: [Sc("omni", "ey", 0, COL.mag, "E_{y}")] },
    omBeta: { title: "Plasma β", label: "β", unit: "", w: 0.8, log: true, lines: [Sc("omni", "beta", 0, COL.mag, "β")] },
    omMa: { title: "Alfvén Mach number", label: "M_{A}", unit: "", w: 0.8, floor: 0, lines: [Sc("omni", "ma", 0, COL.mag, "M_{A}")] },
    omMms: { title: "Magnetosonic Mach number", label: "M_{ms}", unit: "", w: 0.8, floor: 0, lines: [Sc("omni", "mms", 0, COL.mag, "M_{ms}")] },
    omR0: { title: "Magnetopause R₀ (Shue 1998)", label: "R_{0}", unit: "(R_E)", w: 0.8, lines: [Sc("omni", "r0", 0, COL.mag, "R_{0}")] },
    omSymh: { title: "SYM-H", label: "SYM-H", unit: "(nT)", w: 0.8, zero: true, lines: [Sc("omni", "symh", 0, COL.mag, "SYM-H")] },
    omAe: { title: "AE", label: "AE", unit: "(nT)", w: 0.8, floor: 0, lines: [Sc("omni", "ae", 0, COL.mag, "AE")] },
    omPcn: { title: "PC index (north)", label: "PCN", unit: "", w: 0.8, zero: true, lines: [Sc("omni", "pcn", 0, COL.mag, "PCN")] },
    // the Earth click's Geomagnetic indices window (GeoIndicesPanelView.indicesSeries): Mach and Kp value-colored as
    // Helios bands them, the Mach axis on the 1st–99th percentile in view (M = 1 kept), AE blue and AL red
    giMach: { title: "Mach  ·  M_A", label: "Mach", unit: "M_{A}", w: 0.8, pct: true, guides: [[1, "#1f4fd8", "sub-Alfvénic (M = 1)"]],
              lines: [banded(Sc("giMa", "v", 0, INK, "M_{A}"), MACH_BANDS)] },
    giMach2: { title: "Mach  ·  M_A / M_ms", label: "Mach", unit: "M_{A} / M_{ms}", w: 0.8, pct: true, guides: [[1, "#1f4fd8", "sub-Alfvénic (M = 1)"]],
               lines: [banded(Sc("giMa", "v", 0, INK, "M_{A}"), MACH_BANDS), banded(Sc("giMms", "v", 0, INK, "M_{ms}"), MACH_BANDS)] },
    giKp: { title: "Kp", label: "Kp", unit: "", w: 0.8, lines: [banded(Sc("giKp", "v", 0, INK, "Kp"), KP_BANDS)] },
    giAeal: { title: "AE / AL  ·  nT", label: "AE / AL", unit: "(nT)", w: 0.8, lines: [Sc("giAe", "v", 0, COL.x, "AE"), Sc("giAl", "v", 0, COL.z, "AL")] },
    giAu: { title: "AU  ·  nT", label: "AU", unit: "(nT)", w: 0.8, lines: [Sc("giAu", "v", 0, COL.x, "AU")] },
    giSymh: { title: "SYM-H  ·  nT", label: "SYM-H", unit: "(nT)", w: 0.8, lines: [Sc("giSymh", "v", 0, COL.x, "SYM-H")] },
    giDst: { title: "Dst  ·  nT", label: "Dst", unit: "(nT)", w: 0.8, lines: [Sc("giDst", "v", 0, COL.x, "Dst")] },
    swSpeed: { title: "Flow speed", label: "Flow speed", unit: "(km/s)", w: 0.9, lines: [Sc("dis", "speed", 0, COL.x, "V")] },
    swT: { title: "Proton T", label: "Proton T", unit: "(eV)", w: 0.9, log: true, lines: [Sc("dis", "tp", 0, COL.x, "T")] },
    // GOES (Helios's GOES window): integral particle fluxes and the X-ray flux, each line set by the source (relabel)
    gP: { title: "Protons > E", label: "p^{+} > E", unit: "(cm⁻²s⁻¹sr⁻¹)", w: 1, log: true, lines: [] },
    gE: { title: "Electrons > E", label: "e^{−} > E", unit: "(cm⁻²s⁻¹sr⁻¹)", w: 0.9, log: true, lines: [] },
    gX: { title: "X-rays (XRS)", label: "X-rays (XRS)", unit: "(W/m²)", w: 0.9, log: true, yRange: [-9, -3],
          guides: [[-6, "#008000", "C"], [-5, "#ff9900", "M"], [-4, "#d90d0d", "X"]],
          lines: [Sc("gxrs", "f", 0, COL.x, "1–8 Å"), Sc("gxrs", "f", 1, COL.z, "0.5–4 Å")] },
    comp: { title: "CIS composition  O⁺ / He⁺ / He⁺⁺", label: "CIS comp.", unit: "(cm⁻³)", w: 0.9, log: true,
            lines: [Sc("cmpO", "v", 0, COL.x, "O^{+}"), Sc("cmpHe1", "v", 0, COL.z, "He^{+}"), Sc("cmpHe2", "v", 0, COL.y, "He^{++}")] },
  };
  for (const [k, c] of [["exbX", 0], ["exbY", 1], ["exbZ", 2]])
    KINDS[k] = { title: `E×B/B² vs V⊥  · ${"xyz"[c]}`, label: `V⊥_{${"xyz"[c]}}`, unit: "(km/s)", w: 0.8, zero: true, lazy: "edp", comp: c,
                 lines: [rotd(derive("efi", COL.mag, "E×B/B²", exb(c)), c, exb, () => "E×B/B²"),
                         Object.assign(rotd(derive("des", COL.z, "V_{e⊥}", vPerp(c)), c, vPerp, () => "V_{e⊥}"), { shift: midStamp }),
                         Object.assign(rotd(derive("dis", COL.x, "V_{i⊥}", vPerp(c)), c, vPerp, () => "V_{i⊥}"), { shift: midStamp })] };
  const NA = (title) => ({ title, avail: false });
  /** A subplot whose data are on their way: a bar to the bytes CDAWeb said it would send (the CDF subsets), or a
   *  moving segment with the megabytes so far where it did not say (HAPI). */
  const GROUP_NAME = { hpH: "HPCA H⁺", hpHepp: "HPCA He⁺⁺", hpHep: "HPCA He⁺", hpO: "HPCA O⁺", hpcaMom: "HPCA moments", edp: "EDP electric field", dsp: "DSP spectra" };
  function fetchingBar(ctx, R, g, n) {
    const P = SRC && SRC.progress ? SRC.progress(n, g) : null, w = Math.min(260, R.w * 0.5), x = R.x + (R.w - w) / 2, y = R.y + R.h / 2 + 2;
    const mb = (b) => (b / 1e6).toFixed(b < 1e7 ? 1 : 0);
    ctx.fillStyle = "rgba(29,29,34,0.10)"; ctx.fillRect(x, y, w, 4);
    ctx.fillStyle = ORANGE;
    let label = `fetching ${GROUP_NAME[g] || ""}…`;
    if (P && P.total > 0) {
      const f = clamp(P.loaded / P.total, 0, 1);
      ctx.fillRect(x, y, w * f, 4);
      label = `fetching ${GROUP_NAME[g] || ""} · ${mb(P.loaded)} of ${mb(P.total)} MB`;
    } else {
      const u = (performance.now() / 1400) % 1, seg = w * 0.28, a = x + (w + seg) * u - seg;
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, 4); ctx.clip(); ctx.fillRect(a, y, seg, 4); ctx.restore();
      if (P && P.loaded > 0) label = `fetching ${GROUP_NAME[g] || ""} · ${mb(P.loaded)} MB`;
    }
    rich(ctx, label, R.x + R.w / 2, y - 10, { size: 10.5, align: "center", color: INK2 });
  }
  const OVER_COL = ["#8e44ad", "#0e9aa7", "#c2185b", "#8d6e63", "#ee8a1c", "#1f6fd8"];
  /** "key#i": line i of subplot key, as the mission draws it. */
  function lineById(mission, id, relabel) {
    const [k, i] = id.split("#"), kind = KINDS[k] && Object.assign({}, kindOf(mission, k), relabel && relabel[k]);
    const line = kind && kind.lines && kind.lines[+i];
    return line ? { kind, line } : null;
  }
  // The sidebar's Plot selection, per mission: Helios's groups of subplots in its order (MMSPanels.swift), the stack a
  // window opens with, and the preset figures. A subplot whose data this demo does not carry is listed, greyed, as the app
  // lists it; a preset is offered when most of its subplots are here.
  const MISSIONS = {
    mms: {
      sections: [
        ["FPI", ["ionSpec", "elecSpec", "n", "ti", "te", "tanis", "p", "vi", "ve", NA("V⊥  (ion / electron)"), NA("e⁻ PAD  0–200 eV"), NA("e⁻ PAD  200 eV–2 keV"), NA("e⁻ PAD  2–30 keV")]],
        ["Fields", ["b", LIVE ? "e" : NA("E — electric field")]],
        ["Currents", ["jfpi", "jpar", "jperp", NA("Current  J (curlometer, 4 s/c)")]],
        ["Reconnection", [NA("Agyrotropy  √Q  (Swisdak 2016)"), NA("Nongyrotropy  D_ng  (Aunai 2013)"), LIVE ? "jdotE" : NA("J·E′ — dissipation"), NA("J∥·E∥ — parallel dissipation"), NA("D_e — dissipation (electron frame)"), NA("Pressure–strain  e⁻  (4 s/c)"), NA("Pressure–strain  ions  (4 s/c)"), LIVE ? "epE" : NA("E′ = E + Vₑ×B  (electron frame)"), LIVE ? "epI" : NA("E′ = E + Vᵢ×B  (ion frame)"), NA("E′ = E + V(H⁺)×B"), NA("E′ = E + V(He⁺)×B"), NA("E′ = E + V(O⁺)×B")]],
        ["Frozen-in", LIVE ? ["fzEx", "fzEy", "fzEz", "fzIx", "fzIy", "fzIz", "exbX", "exbY", "exbZ"]
          : [NA("E vs −Vₑ×B  · x"), NA("E vs −Vₑ×B  · y"), NA("E vs −Vₑ×B  · z"), NA("E vs −Vᵢ×B  · x"), NA("E vs −Vᵢ×B  · y"), NA("E vs −Vᵢ×B  · z"), NA("E×B/B² vs V⊥  · x"), NA("E×B/B² vs V⊥  · y"), NA("E×B/B² vs V⊥  · z")]],
        ["HPCA · composition", LIVE ? ["hpH", "hpHepp", "hpHep", "hpO", "hpN", "hpV", "hpVH", "hpVHep", "hpVHepp", "hpVO", "hpT", "hpP"]
          : [NA("Spectrogram  H⁺"), NA("Spectrogram  He⁺⁺"), NA("Spectrogram  He⁺"), NA("Spectrogram  O⁺"), NA("Densities  H⁺ He⁺ He⁺⁺ O⁺")]],
        ["HPCA · pitch angles", [NA("H⁺ PAD  1–300 eV"), NA("H⁺ PAD  300 eV–3 keV"), NA("H⁺ PAD  3–40 keV"), NA("He⁺ PAD  1–400 eV"), NA("He⁺ PAD  400 eV–4 keV"), NA("He⁺ PAD  4–40 keV"), NA("O⁺ PAD  1 eV–1 keV"), NA("O⁺ PAD  1–10 keV"), NA("O⁺ PAD  10–40 keV")]],
        ["Waves & potential", [LIVE ? "epsd" : NA("E-field spectrogram"), NA("B-field spectrogram"), LIVE ? "pot" : NA("Spacecraft potential")]],
        ["EIS · ExTOF omni flux", [NA("Protons"), NA("Helium"), NA("Oxygen")]],
        ["FEEPS · energetic particles", [NA("Electrons  omni"), NA("Ions  omni")]],
      ],
      stack: ["b", "ionSpec", "elecSpec", "n", "ti", "te", "vi", "ve", "jfpi"],
      presets: [
        ["Default", ["b", "ionSpec", "elecSpec", "n", "ti", "te", "vi", "ve", "jfpi"]],
        ["FPI overview", ["b", "ionSpec", "elecSpec", "n", "ti", "te", "p", "vi", "ve", "jfpi", "e", "jdotE"]],
        ["Frozen-in · Phan 2016", ["b", "n", "vi", "ve", "fzIx", "fzIy", "fzIz", "fzEx", "fzEy", "fzEz", "exbZ"]],
        ["HPCA composition", ["b", "hpH", "hpHepp", "hpHep", "hpO", "hpN", "hpVH", "hpVHepp", "hpVHep", "hpVO", "hpT", "hpP"]],
        ["HPCA pitch angles", ["b", "hpH", "pH40", "pH3", "pH03", "hpVH", "hpHep", "pHe40", "pHe4", "pHe04", "hpVHep", "hpO", "pO40", "pO10", "pO1", "hpVO"]],
        ["FEEPS summary", ["b", "feE", "feE1", "feE2", "feI"]],
      ],
    },
    tha: {
      sections: [["ESA", ["ionSpec", "elecSpec", "n", "ti", "te", "tanis", "vi", "ve"]], ["Fields", ["b", "e"]], ["SST · high energy", [NA("SST ion + e⁻ spectra")]]],
      relabel: { e: { title: "E — electric field (spin-fit · E·B = 0)", lazy: null } },
      stack: LIVE ? ["b", "ionSpec", "elecSpec", "n", "ti", "te", "tanis", "vi", "ve", "e"] : ["b", "ionSpec", "elecSpec", "n", "ti", "te", "vi", "ve", "e"],   // live: Helios's THEMIS default
    },
    c4: {
      sections: LIVE
        ? [["CIS", ["ionSpec", "n", "ti", "tanis", "vi", "comp"]], ["PEACE", ["elecSpec", "te", "ve"]], ["Fields", ["b"]],
           ["CIS · CODIF composition", [NA("CIS O⁺ spectrogram"), NA("CIS He⁺ spectrogram")]], ["WHISPER", [NA("Electron density")]]]
        : [["CIS · CODIF", ["ionSpec", "n", "ti", "vi"]], ["PEACE", ["elecSpec", "te", "ve", "jfpi"]], ["Fields", ["b"]],
           ["CIS · CODIF composition", [NA("CIS O⁺ spectrogram"), NA("CIS He⁺ spectrogram")]], ["WHISPER", [NA("Electron density (no data this day)")]]],
      // live: Helios's Cluster default (its CIS composition chart included); panels with no data that day drop out
      stack: LIVE ? ["b", "ionSpec", "elecSpec", "n", "ti", "te", "tanis", "vi", "ve", "comp"] : ["b", "ionSpec", "elecSpec", "n", "ti", "te", "vi", "ve"],
      relabel: { ionSpec: { spec: "isp", label: "H^{+}", title: "CODIF H⁺ spectrogram" }, elecSpec: { spec: "esp", ...(LIVE ? { label: "PEACE e^{−}" } : {}), title: "PEACE electron spectrogram" },
                 n: { lines: [Sc("dis", "n", 0, COL.ni, LIVE ? "N_{i}" : "N_{H⁺}"), Sc("des", "n", 0, COL.ne, "N_{e}")] } },
    },
  };
  Object.assign(MISSIONS, {
    omni: {
      sections: [["IMF", ["omBt", "omBz", "omBy", "omBx"]], ["Plasma", ["omV", "omNp", "omT", "omP", "omBeta"]],
                 ["Coupling", ["omEy", "omMa", "omMms", "omR0"]], ["Indices", ["omSymh", "omAe", "omPcn"]]],
      stack: ["omBt", "omBz", "omBy", "omV", "omNp", "omP", "omMa", "omR0"],
    },
    l1: {
      sections: [["MAG", ["b"]], ["Plasma", ["n", "vi", "swSpeed", "swT"]]],
      stack: ["b", "n", "vi", "swSpeed", "swT"],
      relabel: { n: { title: "Proton density", lines: [Sc("dis", "n", 0, COL.ni, "N_{i}"), Sc("des", "n", 0, COL.ne, "N_{e}")] }, vi: { title: "Proton velocity  V (GSE)" } },
    },
  });
  MISSIONS.goes = { sections: [["MAG", ["b"]], ["X-rays", ["gX"]], ["Particles", ["gP", "gE"]]], stack: ["b", "gX", "gP", "gE"],
                    relabel: { b: { title: "B — magnetic field (GSE)" } } };
  MISSIONS.idx = { sections: [["Upstream", ["giMach", "giMach2"]], ["Ground", ["giKp", "giAeal", "giAu", "giSymh", "giDst"]]],
                   stack: ["giMach", "giKp", "giAeal", "giAu", "giSymh"] };          // Dst off: SYM-H is its 1-min counterpart
  for (const k of ["tha", "c4", "omni", "l1", "goes", "idx"]) MISSIONS[k].presets = [["Default", MISSIONS[k].stack]];
  /** The subplot `key` as the given mission draws it. */
  function kindOf(mission, key) {
    const k = KINDS[key], r = MISSIONS[mission].relabel && MISSIONS[mission].relabel[key];
    return r ? Object.assign({}, k, r) : k;
  }
  /** Whether a window's data carry subplot `key`. */
  function has(D, mission, key) {
    const k = KINDS[key] && Object.assign({}, kindOf(mission, key), D.relabel && D.relabel[key]);
    if (!k) return false;
    const ok = (S) => !!S && (!LIVE || S.t.length > 0);       // live: a record set with nothing that day does not count
    if (LIVE && k.lazy && mission === "mms" && !(D.lazyDone && D.lazyDone[k.lazy])) return true;   // fetched when first drawn
    return k.spec ? ok(D.sv[k.spec]) : k.lines.some(l => ok(D.sv[l.ds]));
  }

  // ───────────────────────── the corrections, as Helios applies them ─────────────────────────
  /** Despike.outlierIndices: a sample more than 10 MAD-σ from the median of the 12 on each side is flagged, and a run
   *  of more than 3 flagged samples is kept — a jet, not a spike. Returns the flags, 1 = drop. */
  function outliers(vals) {
    const n = vals.length, flag = new Uint8Array(n);
    if (n < 25) return flag;
    const w = [];
    for (let i = 0; i < n; i++) {
      const v = vals[i];
      if (!isFinite(v)) { flag[i] = 1; continue; }
      w.length = 0;
      for (let j = Math.max(0, i - 12); j <= Math.min(n - 1, i + 12); j++) if (j !== i && isFinite(vals[j])) w.push(vals[j]);
      if (w.length < 12) continue;
      w.sort((p, q) => p - q);
      const med = w[w.length >> 1];
      for (let k = 0; k < w.length; k++) w[k] = Math.abs(w[k] - med);
      w.sort((p, q) => p - q);
      const mad = w[w.length >> 1] * 1.4826;
      if (mad > 0 && isFinite(mad) && Math.abs(v - med) > 10 * mad) flag[i] = 1;
    }
    for (let i = 0; i < n;) {
      if (!flag[i]) { i++; continue; }
      let j = i;
      while (j < n && flag[j]) j++;
      if (j - i > 3) for (let k = i; k < j; k++) flag[k] = 0;
      i = j;
    }
    return flag;
  }
  /** Boxcar mean over w samples, centered; the edges keep their raw values (Helios's Smooth traces). */
  function boxcar(vals, w) {
    const n = vals.length, out = Float64Array.from(vals), h0 = Math.ceil((w - 1) / 2), h1 = w - 1 - h0;
    let s = 0, c = 0;
    const add = (v, k) => { if (isFinite(v)) { s += k * v; c += k; } };
    for (let j = 0; j < Math.min(n, w); j++) add(vals[j], 1);
    for (let i = h0; i < n - h1; i++) {
      if (i > h0) { add(vals[i - h0 - 1], -1); add(vals[i + h1], 1); }
      if (c) out[i] = s / c;
    }
    return out;
  }
  /** What "Despike" filters (SpacecraftSeries.despiked): the moments, temperatures, velocities and V⊥, the currents,
   *  E, E′ and J·E′. Never B, the spectrograms, the pressures, HPCA, the potential or the OMNI, GOES and index rows;
   *  in the frozen-in and drift rows only E and V⊥, not the −V×B and E×B drawn beside them. */
  const DESPIKED = /^(n|ti|te|tanis|vi|ve|jfpi|jpar|jperp|e|epE|epI|jdotE|exb[XYZ]|fz[EI][xyz])$/;
  const spikes = (line, key) => line.ds !== "fgm" && DESPIKED.test(key || "") && !/×B/.test(line.label || "");
  const memo = (S, key, make) => { const m = S.__memo || (S.__memo = new Map()); if (!m.has(key)) m.set(key, make()); return m.get(key); };

  // ───────────────────────── MVA-B, as Helios solves it ─────────────────────────
  const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const unit3 = (a) => { const m = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / m, a[1] / m, a[2] / m]; };
  const mul3 = (A, B) => A.map(r => [0, 1, 2].map(c => r[0] * B[0][c] + r[1] * B[1][c] + r[2] * B[2][c]));
  const apply3 = (R, v) => [dot3(R[0], v), dot3(R[1], v), dot3(R[2], v)];
  /** A symmetric 3 × 3 matrix's eigenvalues, largest first, and their unit vectors (cyclic Jacobi). */
  function eig3(M0) {
    const M = M0.map(r => r.slice()), V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    for (let sweep = 0; sweep < 50; sweep++) {
      let off = 0;
      for (let p = 0; p < 2; p++) for (let q = p + 1; q < 3; q++) {
        off += M[p][q] ** 2;
        if (Math.abs(M[p][q]) < 1e-14) continue;
        const th = 0.5 * Math.atan2(2 * M[p][q], M[q][q] - M[p][p]), c = Math.cos(th), s = Math.sin(th);
        for (let k = 0; k < 3; k++) { const a1 = M[k][p], a2 = M[k][q]; M[k][p] = c * a1 - s * a2; M[k][q] = s * a1 + c * a2; }
        for (let k = 0; k < 3; k++) { const a1 = M[p][k], a2 = M[q][k]; M[p][k] = c * a1 - s * a2; M[q][k] = s * a1 + c * a2; }
        for (let k = 0; k < 3; k++) { const a1 = V[k][p], a2 = V[k][q]; V[k][p] = c * a1 - s * a2; V[k][q] = s * a1 + c * a2; }
      }
      if (off < 1e-24) break;
    }
    const e = [0, 1, 2].map(i => ({ l: M[i][i], v: [V[0][i], V[1][i], V[2][i]] })).sort((p, q) => q.l - p.l);
    return { values: e.map(x => x.l), vectors: e.map(x => x.v) };
  }
  /** The B vectors in [a, b] — burst where the window has it — and whether every one is native-cadence burst FGM. */
  function bIn(D, a, b) {
    const pts = [], ts = [];
    let native = true;
    for (const [L, i0, i1] of runs(D, "fgm", a, b, true)) {
      const v = L.b, st = L.cols.b, burst = !!(D.bu && L === D.bu.fgm);
      for (let i = Math.max(0, i0); i < Math.min(L.t.length, i1); i++) {
        const t = L.t[i], x = v[i * st], y = v[i * st + 1], z = v[i * st + 2];
        if (t < a || t > b || !isFinite(x) || !isFinite(y) || !isFinite(z)) continue;
        pts.push([x, y, z]); ts.push(t);
        if (!burst) native = false;
      }
    }
    return { pts, ts, native };
  }
  /** MVAB.compute: the variance matrix of B, L its maximum-variance direction and N the minimum, signed N_x ≥ 0 and
   *  L_z ≥ 0, and M = N × L. */
  function mvaBAxes(pts) {
    const n = pts.length, m = [0, 0, 0], M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (const p of pts) { m[0] += p[0] / n; m[1] += p[1] / n; m[2] += p[2] / n; }
    for (const p of pts) for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) M[r][c] += (p[r] - m[r]) * (p[c] - m[c]) / n;
    const { values, vectors } = eig3(M);
    let L = vectors[0], N = vectors[2];
    if (N[0] < 0) N = N.map(x => -x);
    if (L[2] < 0) L = L.map(x => -x);
    return { l: L, m: cross3(N, L), n: N, lambda: values };
  }
  /** LMNSolver.solve(.mvaB): the frame, the eigenvalue ratios, the normal's error cone (Sonnerup & Scheible 1998
   *  eq. 8.23) and its stability over seven intervals 0.5–2× this one about its center (Denton et al. 2018, Table 3). */
  function solveMVAB(D, a, b) {
    const { pts, ts, native } = bIn(D, a, b);
    if (pts.length < 8) return { error: `MVA-B needs at least 8 B vectors in the interval (found ${pts.length}).` };
    const f = mvaBAxes(pts), [l1, l2, l3] = f.lambda, K = pts.length;
    const cone = (lj) => { const d = l3 - lj, v = l3 / (K - 1) * lj / (d * d); return v >= 0 && isFinite(v) ? Math.sqrt(v) * 180 / Math.PI : NaN; };
    const c = (a + b) / 2, frames = [f];
    for (const k of [-3, -2, -1, 1, 2, 3]) {
      const h = (b - a) * 2 ** (k / 3) / 2, q = bIn(D, c - h, c + h);
      if (q.pts.length >= 8) frames.push(mvaBAxes(q.pts));
    }
    const stability = frames.length >= 4 ? ["l", "m", "n"].map(ax => {
      const al = frames.map(g => (dot3(g[ax], f[ax]) < 0 ? g[ax].map(x => -x) : g[ax]));
      const avg = unit3(al.reduce((s, v) => [s[0] + v[0], s[1] + v[1], s[2] + v[2]], [0, 0, 0]));
      return al.reduce((s, v) => s + Math.acos(clamp(dot3(v, avg), -1, 1)), 0) / al.length * 180 / Math.PI;
    }) : null;
    const dt = [];
    for (let i = 1; i < ts.length; i++) if (ts[i] > ts[i - 1]) dt.push(ts[i] - ts[i - 1]);
    dt.sort((p, q) => p - q);
    const md = dt[dt.length >> 1] || 0;
    const cadence = md < 0.02 ? `${Math.round(1 / md)} Hz` : md < 1 ? `${Math.round(md * 1000)} ms` : `${md.toFixed(1)} s`;
    return { frame: Object.assign(f, { method: "MVA-B", a, b, ratio: l2 / l3, tangent: l1 / l2, cones: [cone(l1), cone(l2)], stability, samples: K, cadence, native }) };
  }

  // the boundary layers Helios paints (BoundaryKind)
  const REGIONS = [
    { key: "llbl", name: "LLBL", short: "LLBL", color: "#3B82F6" }, { key: "msbl", name: "MSBL", short: "MSBL", color: "#8B5CF6" },
    { key: "sphere", name: "Magnetosphere inflow", short: "Msph", color: "#22C55E" }, { key: "sheath", name: "Magnetosheath inflow", short: "Msh", color: "#F59E0B" },
    { key: "mpBL", name: "Magnetopause BL", short: "MP BL", color: "#EF4444" },
  ];
  const REGION = Object.fromEntries(REGIONS.map(r => [r.key, r]));
  const hexA = (hex, a) => `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`;

  /**
   * A craft's stack plot in a pair of canvases: the plot, and the overlay over it (tracker, cut lines, the LMN interval's
   * handles, painted regions). D is the craft's data (useCraft or viewOf); cfg is live — the window's sidebar writes it:
   * { mission, stack, coverage, tracker, spintone, outliers, smooth, smoothW, lmn: {R} | null, marks: [{t, color}],
   *   onMark(k, t), interval: {a, b, live, label} | null, onInterval(a, b), bands: [{kind, a, b}], paint, onPaint(kind, a, b) }.
   */
  // ── Helios's resolution tiers (HSODataClient.dataTier), by the window's ±range: ≤ 20 min the data as they are;
  //    ≤ 2 h burst kept, B box-averaged to 0.15 s and the burst electron moments onto the ion records; wider, burst
  //    dropped and B box-averaged to 4.5 s. Spectrograms and the ions are untouched (reduceElectronsToIonGrid). ──
  const NOT_AVG = new Set(["t", "spec", "eidx", "specLog", "store", "edges"]);
  /** Every per-record field of S averaged over boxes [lo_k, hi_k) (NaN skipped; empty boxes NaN), stamped at grid. */
  function boxSet(S, grid, lo, hi) {
    const n = S.t.length, m = grid.length, out = { t: Float64Array.from(grid), cols: {} };
    const keys = Object.keys(S.cols || {}).filter(k => !NOT_AVG.has(k) && S[k] && S[k].length === n * S.cols[k] && !(S[k] instanceof Uint8Array));
    for (const k of keys) { out[k] = new Float32Array(m * S.cols[k]).fill(NaN); out.cols[k] = S.cols[k]; }
    let j0 = 0;
    for (let g = 0; g < m; g++) {
      while (j0 < n && S.t[j0] < lo[g]) j0++;
      let j1 = j0; while (j1 < n && S.t[j1] < hi[g]) j1++;
      if (j1 > j0) for (const k of keys) {
        const st = S.cols[k], src = S[k], dst = out[k];
        for (let c = 0; c < st; c++) { let sum = 0, cnt = 0; for (let j = j0; j < j1; j++) { const v = src[j * st + c]; if (isFinite(v)) { sum += v; cnt++; } } if (cnt) dst[g * st + c] = sum / cnt; }
      }
    }
    cadence(out);
    return out;
  }
  /** boxAverageRegular: a regular grid over the set's own span at `step` s, each box centered on its stamp. */
  function regularSet(S, step) {
    if (!S || S.t.length < 2 || S.dt >= step) return S;      // already as coarse as the tier asks
    const t0 = S.t[0], m = Math.floor((S.t[S.t.length - 1] - t0) / step) + 1;
    if (m < 2) return S;
    const grid = Float64Array.from({ length: m }, (_, k) => t0 + k * step);
    return boxSet(S, grid, grid.map(t => t - step / 2), grid.map(t => t + step / 2));
  }
  /** onIonGrid: the electron records inside each ion record's accumulation [tᵢ, tᵢ₊₁), on the ion stamps. */
  function onIonGrid(E, I) {
    if (!E || !I || I.t.length < 2) return E;
    // Helios's desRecords: the electron records whose MIDDLE falls in the ion record's accumulation (stamps are starts)
    const g = I.t, h = (E.dt || 0) / 2, lo = Float64Array.from(g, t => t - h);
    const hi = Float64Array.from(g, (t, k) => (k + 1 < g.length ? Math.min(g[k + 1], t + 3 * I.dt) : t + I.dt) - h);
    return boxSet(E, g, lo, hi);
  }
  function tierOf(span) { return span <= 1200 ? "native" : span <= 7200 ? "reduced" : "survey"; }
  function tierView(D0, tier) {
    if (tier === "native") return D0;
    const key = `tier|${tier}|${Object.keys(D0.sv).length}|${D0.bu ? Object.keys(D0.bu).length : 0}`;
    return memo(D0.sv, key, () => {
      const V = Object.create(D0), step = tier === "reduced" ? 0.15 : 4.5;
      V.sv = Object.assign({}, D0.sv, { fgm: regularSet(D0.sv.fgm, step) });
      if (tier === "survey") V.bu = null;
      else if (D0.bu) V.bu = Object.assign({}, D0.bu, { fgm: regularSet(D0.bu.fgm, step), des: onIonGrid(D0.bu.des, D0.bu.dis) });
      V.tier = tier;
      return V;
    });
  }
  function Panel(D, app, cv, over, cfg = {}) {
    const D0 = D;                                          // the window's own view; D is its resolution tier's while drawing
    cfg = Object.assign({ mission: "mms", coverage: true, tracker: true, spintone: true, smooth: false, smoothW: 10, outliers: false,
                          lmn: null, marks: [], interval: null, bands: [], paint: null }, cfg);
    let L = null;                                          // the layout last drawn
    const tiers = () => (D.bu ? [D.sv, D.bu] : [D.sv]);
    const P = {                                             // what derived lines need: the FGM and J beside a record set
      fgmFor: (S) => tiers().find(T => T.des === S || T.dis === S)?.fgm,
      jFor: (S) => (S.j ? (i, c) => S.j[i * 3 + c] + (cfg.spintone && S.vst ? QE * S.n[i] * S.vst[i * 3 + c] : 0) : null),
      /** Another instrument's record set beside S: the same tier's (burst beside burst) where it has one, else survey. */
      set: (S, ds) => { const T = tiers().find(T => Object.values(T).includes(S)); const O = (T && T[ds] && T[ds].t.length ? T[ds] : D.sv[ds]); return O && O.t.length ? O : null; },
      /** A velocity set's bulk velocity, the electrons' with the spin-tone removed where that correction is on. */
      vel: (S) => (S.v && S.cols.v === 3 ? (i, c) => S.v[i * 3 + c] - (cfg.spintone && S.vst ? S.vst[i * 3 + c] : 0) : null),
    };
    /** One stored component, with the spin-tone correction where it applies. */
    function component(line, S, c) {
      const v = S[line.name], st = S.cols[line.name];
      if (cfg.spintone && line.ds === "des" && S.vst && line.name === "v") return (i) => v[i * st + c] - S.vst[i * 3 + c];
      if (cfg.spintone && line.ds === "des" && S.vst && line.name === "j") return (i) => v[i * st + c] + QE * S.n[i] * S.vst[i * 3 + c];
      return (i) => v[i * st + c];
    }
    /** One line's values over a record set, with the corrections and the LMN frame applied. A vector sample is dropped
     *  when any of its components is an outlier, as Helios drops the whole measurement. */
    function accessor(line, R, rowKey) {
      return (S) => {
        let f;
        if (line.derive && line.rot && R) {                // a derived vector, turned into LMN
          const g = [0, 1, 2].map(cc => line.rot(cc)(S, P)), r = R[line.c];
          f = g.every(Boolean) ? (i) => r[0] * g[0](i) + r[1] * g[1](i) + r[2] * g[2](i) : null;
        } else if (line.derive) f = line.derive(S, P);
        else {
          if (!S[line.name]) return null;
          if (line.vec && R) { const g = [0, 1, 2].map(c => component(line, S, c)), r = R[line.c]; f = (i) => r[0] * g[0](i) + r[1] * g[1](i) + r[2] * g[2](i); }
          else f = component(line, S, line.c);
        }
        if (!f) return null;
        const n = S.t.length, id = `${line.ds}.${line.name || line.label}.${line.c ?? ""}|${cfg.spintone}${line.rot && R ? `|${R.flat().map(x => x.toFixed(5)).join()}` : ""}`;
        if (cfg.outliers && spikes(line, rowKey)) {
          const bad = memo(S, `bad|${line.vec ? `${line.name}|${cfg.spintone}` : id}`, () => {
            if (!line.vec) return outliers(Float64Array.from({ length: n }, (_, i) => f(i)));
            const out = new Uint8Array(n);
            for (let c = 0; c < 3; c++) { const g = component(line, S, c), fl = outliers(Float64Array.from({ length: n }, (_, i) => g(i))); for (let i = 0; i < n; i++) out[i] |= fl[i]; }
            return out;
          });
          const g = f;
          f = (i) => (bad[i] ? NaN : g(i));
        }
        if (cfg.smooth) {
          const g = f, arr = memo(S, `sm|${id}|${R ? R.flat().map(x => x.toFixed(5)).join() : ""}|${cfg.outliers}|${cfg.smoothW}`,
                                  () => boxcar(Float64Array.from({ length: n }, (_, i) => g(i)), cfg.smoothW));
          f = (i) => arr[i];
        }
        return f;
      };
    }
    const LMN = ["L", "M", "N"];
    /** A line's legend: under LMN a turned vector names its axis (E_L, or the line's own name where the row says it). */
    const legendOf = (line, R) => (R && (line.vec || line.rot) ? (line.lmnLabel ? line.lmnLabel(LMN[line.c]) : LMN[line.c]) : line.label);
    function layout(w, h, rows) {
      const narrow = w < 500, left = narrow ? 62 : 100, right = narrow ? 44 : 64, top = cfg.coverage && D.bu ? 24 : 12, bottom = 40;
      const H = h - top - bottom;
      let y = top;
      const rr = rows.map((r, k) => { const hh = H / rows.length, R = { x: left, y, w: w - left - right, h: hh, row: r, k }; y += hh; return R; });
      return { w, h, narrow, plot: { x: left, y: top, w: w - left - right, h: H }, rows: rr };
    }

    function draw() {
      if (!cv.clientWidth) return;
      const { ctx, w, h, dpr } = sizeCanvas(cv), a = app.a, b = app.b;
      sizeCanvas(over);
      const mission = cfg.mission, keys = cfg.stack || MISSIONS[mission].stack;
      D = LIVE && mission === "mms" && app.home ? tierView(D0, tierOf(app.home[1] - app.home[0])) : D0;
      if (D.sv.efiN && mission === "mms") D.sv.efi = D0.sv.efi = b - a <= 240 ? D.sv.efiN : b - a <= 7200 ? D.sv.efi15 : D.sv.efi45;
      let rows = keys.map(k => Object.assign({ key: k }, kindOf(mission, k), D.relabel && D.relabel[k])).filter(r => r.title && r.avail !== false);
      // live, other missions: as Helios, which fetches only the window, a subplot with nothing in the window is left out
      if (LIVE && mission !== "mms") {
        const inWin = (ds, acc) => runs(D, ds, a, b, true).some(([S, i0, i1]) => {
          const f = acc ? acc(S) : null;
          if (acc && !f) return false;
          for (let i = Math.max(0, i0); i < Math.min(S.t.length, i1); i++) if (S.t[i] >= a && S.t[i] <= b && (!f || isFinite(f(i)))) return true;
          return false;
        });
        const kept = rows.filter(r => (r.spec ? inWin(r.spec, null) : r.lines.some(line => inWin(line.ds, accessor(line, null)))));
        if (kept.length) rows = kept;
      }
      // the subplot editor's changes (right-click a subplot): its own lines hidden, other quantities overplotted (another
      // unit against a right-hand axis), log y, axis and color limits
      const edits = cfg.edits || {};
      rows = rows.map((r) => {
        const E = edits[r.key];
        if (!E) return r;
        const out = Object.assign({}, r, { edit: E });
        if (r.spec) return out;
        const own = r.lines.map((ln, i) => Object.assign({}, ln, { id: `${r.key}#${i}` })).filter(ln => !(E.hide || []).includes(ln.id));
        const over = (E.over || []).map((id, j) => {
          const ln = lineById(mission, id, D.relabel);
          return ln && Object.assign({}, ln.line, { id, over: true, color: OVER_COL[j % OVER_COL.length], label: ln.line.label, unit: ln.kind.unit, logSrc: !!ln.kind.log, axis2: ln.kind.unit !== r.unit });
        }).filter(Boolean);
        out.lines = own.concat(over);
        if (E.logY != null) out.log = E.logY;
        return out;
      });
      const R = cfg.lmn ? cfg.lmn.R : null;
      L = layout(w, h, rows);
      L.yOf = []; L.acc = []; L.yOf2 = [];
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
      const Pl = L.plot, xOf = (t) => Pl.x + (t - a) / (b - a) * Pl.w;
      if (cfg.coverage && D.bu) {                          // the data-rate bars across the top: fast survey throughout, burst where taken
        ctx.fillStyle = "#d90d0d";
        for (const [s0, e0] of fastSegs(D.sv.des)) if (e0 > a && s0 < b) ctx.fillRect(Math.max(Pl.x, xOf(s0)), 7, Math.min(Pl.x + Pl.w, xOf(e0)) - Math.max(Pl.x, xOf(s0)), 2);
        ctx.fillStyle = "#008000";
        for (const [s, e] of D.segs.des) if (e > a && s < b) ctx.fillRect(Math.max(Pl.x, xOf(s)), 13, Math.min(Pl.x + Pl.w, xOf(e)) - Math.max(Pl.x, xOf(s)), 4);
        rich(ctx, "Fast", Pl.x + Pl.w + 6, 8, { size: 9, color: "#d90d0d" });
        rich(ctx, "Burst", Pl.x + Pl.w + 6, 16, { size: 9, color: "#008000" });
      }
      for (const Rw of L.rows) {
        const r = Rw.row;
        if (r.spec && !(D.sv[r.spec] && D.erange[r.spec])) {      // an on-demand spectrogram still on its way
          ctx.fillStyle = PAPER; ctx.fillRect(Rw.x, Rw.y, Rw.w, Rw.h);
          if (r.lazy && mission === "mms" && !(D.lazyDone && D.lazyDone[r.lazy])) fetchingBar(ctx, Rw, r.lazy, D.n);
          else rich(ctx, "no data", Rw.x + Rw.w / 2, Rw.y + Rw.h / 2, { size: 11, align: "center", color: INK2 });
          L.yOf.push(null); L.acc.push(null); L.yOf2.push(null);
        } else if (r.spec) {
          const win = specRange(D, r.spec, r.range, a, b, true), E = r.edit;
          if (E && E.zLo != null) win[0] = E.zLo;
          if (E && E.zHi != null) win[1] = E.zHi;
          if (win[1] <= win[0]) win[1] = win[0] + 1;
          spectrogram(ctx, Rw, a, b, D.tier === "survey" ? D : D0, r.spec, true, dpr, LIVE ? win : null);   // the electrons' spectra keep their cadence
          energyAxis(ctx, Rw, D.erange[r.spec]);
          colorbar(ctx, Rw.x + Rw.w + 6, Rw.y + 4, 9, Rw.h - 8, win, L.narrow ? null : r.cbar || (r.spec === "esp" && mission === "c4" ? "keV/cm²-s-sr-keV" : "eV/cm²-sr-eV-s"));
          L.yOf.push(null); L.acc.push(null); L.yOf2.push(null);
        } else {
          ctx.fillStyle = PAPER; ctx.fillRect(Rw.x, Rw.y, Rw.w, Rw.h);
          if (r.lazy && LIVE && mission === "mms" && !(D.lazyDone && D.lazyDone[r.lazy])) fetchingBar(ctx, Rw, r.lazy, D.n);
          let lo = Infinity, hi = -Infinity;
          const accs = r.lines.map(line => accessor(line, R, r.key)), rrs = r.lines.map(line => runs(D, line.ds, a, b, true));
          const lg = (acc) => (S) => { const f = acc(S); return f && ((i) => { const v = f(i); return v > 0 ? Math.log10(v) : NaN; }); };
          accs.forEach((acc, i) => { if (!r.lines[i].axis2) [lo, hi] = extent(rrs[i], r.log ? lg(acc) : acc, lo, hi, a, b); });
          if (!isFinite(lo)) { lo = -1; hi = 1; }
          if (r.log) { lo = Math.floor(lo + 1e-9); hi = Math.ceil(hi - 1e-9); if (hi - lo < 1) hi = lo + 1; }   // log rows: whole decades
          if (r.yRange) [lo, hi] = r.yRange;
          if (r.zero && !r.log) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
          const padY = r.log ? 0 : (hi - lo) * 0.08 || 1;
          lo -= padY; hi += padY;
          if (r.pct) {                                       // GeoIndicesPanelView.machRange: p1 (≤ 1) … p99 in view, padded 8 %, ≥ 0
            const v = [];
            accs.forEach((acc, i) => { for (const [S, i0, i1] of rrs[i]) { const f = acc(S); if (f) for (let j = Math.max(0, i0); j < Math.min(S.t.length, i1); j++) { const x = f(j); if (isFinite(x) && x > 0 && S.t[j] >= a && S.t[j] <= b) v.push(x); } } });
            v.sort((p, q) => p - q);
            if (v.length > 4) {
              const p1 = Math.min(v[Math.floor(v.length * 0.01)], 1), p99 = v[Math.min(Math.floor(v.length * 0.99), v.length - 1)];
              if (p99 > p1) { const pd = (p99 - p1) * 0.08; lo = Math.max(0, p1 - pd); hi = p99 + pd; }
            }
          }
          const E = r.edit;                                 // limits set in the editor (absolute values, also on a log axis)
          if (E && E.yLo != null && (!r.log || E.yLo > 0)) lo = r.log ? Math.log10(E.yLo) : E.yLo;
          if (E && E.yHi != null && (!r.log || E.yHi > 0)) hi = r.log ? Math.log10(E.yHi) : E.yHi;
          if (!(hi > lo)) hi = lo + 1;
          const yLin = (v) => Rw.y + Rw.h - (v - lo) / (hi - lo) * Rw.h;
          const yOf = r.log ? (v) => (v > 0 ? yLin(Math.log10(v)) : NaN) : yLin;
          L.yOf.push(yOf); L.acc.push(accs);
          // the overplots in another unit: their own range on a right-hand axis, labeled inside the frame
          let yOf2 = null;
          const ax2 = r.lines.map((ln, i) => (ln.axis2 ? i : -1)).filter(i => i >= 0);
          if (ax2.length) {
            const log2 = ax2.every(i => r.lines[i].logSrc);
            let l2 = Infinity, h2 = -Infinity;
            for (const i of ax2) [l2, h2] = extent(rrs[i], log2 ? lg(accs[i]) : accs[i], l2, h2, a, b);
            if (!isFinite(l2)) { l2 = -1; h2 = 1; }
            if (log2) { l2 = Math.floor(l2 + 1e-9); h2 = Math.ceil(h2 - 1e-9); if (h2 - l2 < 1) h2 = l2 + 1; }
            else { const p2 = (h2 - l2) * 0.08 || 1; l2 -= p2; h2 += p2; }
            const y2 = (v) => Rw.y + Rw.h - (v - l2) / (h2 - l2) * Rw.h;
            yOf2 = log2 ? (v) => (v > 0 ? y2(Math.log10(v)) : NaN) : y2;
            const col2 = r.lines[ax2[0]].color;
            for (const v of log2 ? Array.from({ length: h2 - l2 + 1 }, (_, k) => l2 + k) : nice(l2, h2, Rw.h > 70 ? 4 : 3)) {
              const y = y2(v);
              if (y < Rw.y + 6 || y > Rw.y + Rw.h - 4) continue;
              ctx.fillStyle = col2; ctx.fillRect(Rw.x + Rw.w - 4, Math.round(y), 4, 1);
              rich(ctx, log2 ? `10^{${v}}` : String(+v.toPrecision(4)), Rw.x + Rw.w - 6, y, { size: 9, align: "right", color: col2 });
            }
            rich(ctx, r.lines[ax2[0]].unit || "", Rw.x + Rw.w - 6, Rw.y + Rw.h - 8, { size: 9, align: "right", color: col2 });
          }
          L.yOf2.push(yOf2);
          const ticks = r.log ? Array.from({ length: hi - lo + 1 }, (_, k) => lo + k) : nice(lo, hi, Rw.h > 70 ? 4 : 3);
          ctx.fillStyle = INK;
          for (const v of ticks) {
            const y = yLin(v);
            if (y < Rw.y + (r.log ? -0.5 : 6) || y > Rw.y + Rw.h - (r.log ? -0.5 : 4)) continue;
            ctx.fillRect(Rw.x - 4, Math.round(y), 4, 1);
            rich(ctx, r.log ? `10^{${v}}` : String(+v.toPrecision(4)), Rw.x - 6, y, { size: r.log ? 9.5 : 10, align: "right", color: INK2 });
          }
          if (r.zero && lo < 0 && hi > 0) {
            ctx.save(); ctx.setLineDash([3, 3]); ctx.strokeStyle = "rgba(29,29,34,0.35)"; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(Rw.x, Math.round(yOf(0)) + 0.5); ctx.lineTo(Rw.x + Rw.w, Math.round(yOf(0)) + 0.5); ctx.stroke(); ctx.restore();
          }
          const bandsOf = r.lines[0] && r.lines[0].bands;
          for (const [v, color] of bandsOf || []) {          // faint band thresholds, so the colors read as tiers
            if (!(v > 0)) continue;
            const y = yLin(v);
            if (y < Rw.y || y > Rw.y + Rw.h) continue;
            ctx.save(); ctx.globalAlpha = 0.3; ctx.setLineDash([3, 3]); ctx.strokeStyle = color; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(Rw.x, y); ctx.lineTo(Rw.x + Rw.w, y); ctx.stroke(); ctx.restore();
          }
          for (const [v, color, label] of r.guides || []) {     // fixed guide levels (GOES flare classes), dashed
            const y = yLin(v);
            if (y < Rw.y || y > Rw.y + Rw.h) continue;
            ctx.save(); ctx.setLineDash([4, 3]); ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(Rw.x, y); ctx.lineTo(Rw.x + Rw.w, y); ctx.stroke(); ctx.restore();
            rich(ctx, label, Rw.x + 4, y - 7, { size: 10, weight: 600, color });
          }
          r.lines.forEach((line, i) => line.bands ? strokeBands(ctx, Rw, a, b, rrs[i], accs[i], yOf, line.bands)
                                                  : stroke(ctx, Rw, a, b, rrs[i], accs[i], line.axis2 ? yOf2 : yOf, line.color, line.ds === "fgm" ? 1 : 1.1, line.shift));
          const n = r.lines.length;                       // the legend, top to bottom, at the right
          r.lines.forEach((line, i) =>
            rich(ctx, legendOf(line, R), Rw.x + Rw.w + 6, Rw.y + Rw.h / 2 + (i - (n - 1) / 2) * Math.min(13, (Rw.h - 6) / n), { size: 10.5, weight: 600, color: line.color }));
        }
        // the row's frame, name and letter
        ctx.strokeStyle = "rgba(29,29,34,0.45)"; ctx.lineWidth = 1;
        ctx.strokeRect(Math.round(Rw.x) + 0.5, Math.round(Rw.y) + 0.5, Math.round(Rw.w) - 1, Math.round(Rw.h));
        const cy = Rw.y + Rw.h / 2, rowLabel = R && r.comp != null ? r.label.replace(/\{[xyz]\}/, `{${LMN[r.comp]}}`) : r.label;
        if (L.narrow) {
          rich(ctx, r.short || rowLabel, 6, cy - 6, { size: 10.5, weight: 600 });
          rich(ctx, r.unit, 6, cy + 7, { size: 9, color: INK2 });
        } else {
          rich(ctx, rowLabel, Rw.x - 66, cy - 7, { size: 11.5, weight: 600, align: "center" });
          rich(ctx, r.unit, Rw.x - 66, cy + 7, { size: 10, align: "center", color: INK2 });
        }
        rich(ctx, `(${"abcdefghijklmnopqrst"[Rw.k]})`, Rw.x + Rw.w - 6, Rw.y + 9, { size: 10, align: "right", color: INK2 });
      }
      // the time axis
      const { ticks, secs } = timeTicks(a, b, Pl.w);
      const yb = Pl.y + Pl.h;
      ctx.fillStyle = INK;
      for (const t of ticks) {
        const x = xOf(t);
        ctx.fillRect(Math.round(x), yb, 1, 4);
        const hm = clock(t).slice(0, 5), d = new Date(T0 + t * 1000);   // a multi-day axis names its midnights
        rich(ctx, secs ? clock(t) : b - a > 86400 && hm === "00:00" ? `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}` : hm, x, yb + 12, { size: 10.5, align: "center" });
      }
      const ymd = (t) => new Date(T0 + t * 1000).toISOString().slice(0, 10);
      rich(ctx, `Time: ${b - a > 86400 ? `${ymd(a)} – ${ymd(b)}` : ymd((a + b) / 2)}${cfg.lmn ? ` · ${cfg.lmn.label}` : ""}`, Pl.x + Pl.w / 2, h - 10, { size: 10.5, align: "center", color: INK2 });
      overlay();
    }

    /** The rows that read B, where the LMN interval's handles go ("Mark interval on B"). */
    const bRows = () => (L ? L.rows.filter(R => R.row.key === "b") : []);
    function overlay() {
      if (!L || !over.clientWidth) return;
      const { ctx, w, h } = sizeCanvas(over), Pl = L.plot, a = app.a, b = app.b;
      ctx.clearRect(0, 0, w, h);
      const xOf = (t) => Pl.x + (t - a) / (b - a) * Pl.w, clip = (x) => clamp(x, Pl.x, Pl.x + Pl.w);
      // the painted boundary layers: a band down the stack, named at its top
      for (const band of cfg.bands) {
        if (band.b < a || band.a > b) continue;
        const rg = REGION[band.kind], x0 = clip(xOf(band.a)), x1 = clip(xOf(band.b));
        ctx.fillStyle = hexA(rg.color, 0.13); ctx.fillRect(x0, Pl.y, x1 - x0, Pl.h);
        ctx.fillStyle = hexA(rg.color, 0.8); ctx.fillRect(x0, Pl.y, x1 - x0, 3);
        if (x1 - x0 > 26) rich(ctx, rg.short, (x0 + x1) / 2, Pl.y + 10, { size: 9, weight: 700, align: "center", color: rg.color });
      }
      // the LMN calculation interval on B: shaded, with black handles to drag; an applied one as dashed edges
      const iv = cfg.interval;
      if (iv && iv.b > a && iv.a < b) for (const R of bRows()) {
        const x0 = xOf(iv.a), x1 = xOf(iv.b);
        if (iv.live) {
          ctx.fillStyle = "rgba(0,0,0,0.07)"; ctx.fillRect(clip(x0), R.y, clip(x1) - clip(x0), R.h);
          for (const x of [x0, x1]) {
            if (x < Pl.x - 1 || x > Pl.x + Pl.w + 1) continue;
            ctx.fillStyle = "#000"; ctx.fillRect(Math.round(x) - 1, R.y, 2, R.h);
            ctx.fillRect(Math.round(x) - 4, R.y + R.h / 2 - 9, 8, 18);
            ctx.fillStyle = "#fff"; ctx.fillRect(Math.round(x) - 1, R.y + R.h / 2 - 5, 2, 10);
          }
        } else {
          ctx.save(); ctx.setLineDash([4, 3]); ctx.strokeStyle = "rgba(0,0,0,0.75)"; ctx.lineWidth = 1.2;
          ctx.beginPath();
          for (const x of [x0, x1]) if (x >= Pl.x && x <= Pl.x + Pl.w) { ctx.moveTo(Math.round(x) + 0.5, R.y); ctx.lineTo(Math.round(x) + 0.5, R.y + R.h); }
          ctx.stroke(); ctx.restore();
        }
      }
      // the edge trim handles (StackEdgeTrimLayer): a grey dashed line and an inward chevron just inside each side;
      // while one is dragged, the part being trimmed away is shaded and the new bound's time shown
      const top = L.rows[0].y, bot = L.rows[L.rows.length - 1].y + L.rows[L.rows.length - 1].h;
      const dashed = (x, color, lw) => { ctx.save(); ctx.setLineDash([4, 3]); ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bot); ctx.stroke(); ctx.restore(); };
      dashed(Pl.x + 2.5, "rgba(128,128,128,0.5)", 1); dashed(Pl.x + Pl.w - 2.5, "rgba(128,128,128,0.5)", 1);
      rich(ctx, "▸", Pl.x + 6, top + 7, { size: 7, color: "rgba(128,128,128,0.8)", align: "center" });
      rich(ctx, "◂", Pl.x + Pl.w - 6, top + 7, { size: 7, color: "rgba(128,128,128,0.8)", align: "center" });
      if (trim) {
        const x = trim.x;
        ctx.fillStyle = "rgba(128,128,128,0.13)";
        if (trim.left) ctx.fillRect(Pl.x, top, x - Pl.x, bot - top); else ctx.fillRect(x, top, Pl.x + Pl.w - x, bot - top);
        dashed(x, "rgba(128,128,128,0.95)", 1.3);
        const t = a + (x - Pl.x) / Pl.w * (b - a), chip = b - a < 60 ? clock(t, true) : clock(t);
        const cw = rich(ctx, chip, 0, 0, { size: 9, weight: 600, measure: true }) + 8, cx = clamp(x, Pl.x + cw / 2, Pl.x + Pl.w - cw / 2);
        ctx.beginPath(); ctx.roundRect ? ctx.roundRect(cx - cw / 2, top + 14, cw, 14, 3) : ctx.rect(cx - cw / 2, top + 14, cw, 14);
        ctx.fillStyle = "rgba(255,255,255,0.95)"; ctx.fill(); ctx.lineWidth = 0.6; ctx.strokeStyle = "rgba(128,128,128,0.7)"; ctx.stroke();
        rich(ctx, chip, cx, top + 21, { size: 9, weight: 600, align: "center", color: "#000" });
      }
      // the VDF cuts' times, numbered, as Helios marks them on the figure
      for (const [k, m] of cfg.marks.entries()) {
        if (m.t < a || m.t > b) continue;
        const x = Math.round(xOf(m.t)) + 0.5;
        ctx.save(); ctx.setLineDash([4, 3]); ctx.strokeStyle = m.color; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(x, Pl.y); ctx.lineTo(x, Pl.y + Pl.h); ctx.stroke(); ctx.restore();
        ctx.beginPath(); ctx.arc(x, Pl.y - 1, 7, 0, Math.PI * 2); ctx.fillStyle = m.color; ctx.fill();
        rich(ctx, String(k + 1), x, Pl.y - 1, { size: 9.5, weight: 700, align: "center", color: "#fff" });
      }
      if (app.sel) {
        const [s, e] = app.sel, x0 = Math.min(xOf(s), xOf(e)), x1 = Math.max(xOf(s), xOf(e)), c = cfg.paint ? REGION[cfg.paint].color : ORANGE;
        ctx.fillStyle = hexA(c, 0.16); ctx.fillRect(x0, Pl.y, x1 - x0, Pl.h);
        ctx.strokeStyle = c; ctx.lineWidth = 1; ctx.strokeRect(x0 + 0.5, Pl.y + 0.5, x1 - x0 - 1, Pl.h - 1);
      }
      if (trim || !cfg.tracker || cfg.marks.length || app.hover === null || app.hover < a || app.hover > b) return;
      // Helios's tracker: a dashed line down the stack, a dot on each trace, each line panel's values in a chip at its
      // top beside the line (the spectrograms get none), and the time in a chip under the axis
      const t = app.hover, x = Math.round(xOf(t)) + 0.5, first = L.rows[0], last = L.rows[L.rows.length - 1];
      ctx.save(); ctx.setLineDash([3, 3]); ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(x, first.y); ctx.lineTo(x, last.y + last.h); ctx.stroke(); ctx.restore();
      const fs = 9.5, rowH = 11.5, padX = 4.5, padY = 3, gap = 6;
      L.rows.forEach((R, k) => {
        const yOf = L.yOf[k];
        if (!yOf) return;
        const chip = [];
        R.row.lines.forEach((line, li) => {
          const rec = recordAt(D, line.ds, t);
          if (!rec) return;
          const f = L.acc[k][li](rec[0]), v = f ? f(rec[1]) : NaN;
          if (!isFinite(v)) return;
          const y = (line.axis2 && L.yOf2[k] ? L.yOf2[k] : yOf)(v);
          if (y >= R.y && y <= R.y + R.h) {
            ctx.beginPath(); ctx.arc(x, y, 2.4, 0, Math.PI * 2); ctx.fillStyle = line.color; ctx.fill();
            ctx.lineWidth = 0.6; ctx.strokeStyle = "#fff"; ctx.stroke();
          }
          chip.push([`${legendOf(line, cfg.lmn)} ${fmtVal(v)}`, line.color]);
        });
        if (!chip.length) return;
        const bw = Math.max(...chip.map(([str]) => rich(ctx, str, 0, 0, { size: fs, weight: 600, measure: true }))) + 2 * padX;
        const bh = chip.length * rowH + 2 * padY;
        const bx = x + gap + bw <= R.x + R.w - 2 ? x + gap : x - bw - gap, by = R.y + 2;
        ctx.beginPath(); ctx.roundRect ? ctx.roundRect(bx, by, bw, bh, 2.5) : ctx.rect(bx, by, bw, bh);
        ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.fill();
        ctx.lineWidth = 0.5; ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.stroke();
        chip.forEach(([str, color], i) => rich(ctx, str, bx + padX, by + padY + rowH * (i + 0.5), { size: fs, weight: 600, color }));
      });
      const stampTxt = b - a < 60 ? clock(t, true) : clock(t), cy = last.y + last.h + 13;
      const cw = rich(ctx, stampTxt, 0, 0, { size: 10, weight: 600, measure: true }) + 9;
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - cw / 2, cy - 7.5, cw, 15, 3) : ctx.rect(x - cw / 2, cy - 7.5, cw, 15);
      ctx.fillStyle = "rgba(255,255,255,0.94)"; ctx.fill();
      ctx.lineWidth = 0.6; ctx.strokeStyle = "rgba(0,0,0,0.3)"; ctx.stroke();
      rich(ctx, stampTxt, x, cy, { size: 10, weight: 600, align: "center", color: "#000" });
    }

    // hover; drag a side's trim handle (or across the figure) to zoom, or across it to paint a region while one is picked;
    // double-click to go back. A cut's numbered line and the LMN interval's handles drag along the figure.
    let drag = null, grab = null, trim = null;
    const tAt = (e) => {
      const r = over.getBoundingClientRect(), x = e.clientX - r.left, Pl = L.plot;
      return { x, y: e.clientY - r.top, t: app.a + (x - Pl.x) / Pl.w * (app.b - app.a), inside: x >= Pl.x && x <= Pl.x + Pl.w };
    };
    const xAt = (t) => L.plot.x + (t - app.a) / (app.b - app.a) * L.plot.w;
    const markNear = (p) => cfg.marks.findIndex(m => Math.abs(xAt(m.t) - p.x) < 6);
    const handleNear = (p) => {
      const iv = cfg.interval;
      if (!iv || !iv.live || !bRows().some(R => p.y >= R.y && p.y <= R.y + R.h)) return null;
      return Math.abs(xAt(iv.a) - p.x) < 7 ? "a" : Math.abs(xAt(iv.b) - p.x) < 7 ? "b" : null;
    };
    /** Over a trim strip, 12 pt wide inside each side of the stack: "left", "right" or null. */
    const stripNear = (p) => {
      const Pl = L.plot, top = L.rows[0].y, bot = L.rows[L.rows.length - 1].y + L.rows[L.rows.length - 1].h;
      if (p.y < top || p.y > bot) return null;
      return p.x >= Pl.x && p.x <= Pl.x + 12 ? "left" : p.x >= Pl.x + Pl.w - 12 && p.x <= Pl.x + Pl.w ? "right" : null;
    };
    const trimX = (x, left) => { const Pl = L.plot; return left ? clamp(x, Pl.x, Pl.x + Pl.w - 30) : clamp(x, Pl.x + 30, Pl.x + Pl.w); };
    over.addEventListener("pointermove", (e) => {
      if (!L) return;
      const p = tAt(e), t = clamp(p.t, app.a, app.b);
      if (grab) {
        if (grab.mark !== undefined) cfg.onMark && cfg.onMark(grab.mark, t);
        else if (grab.edge === "a") cfg.onInterval(Math.min(t, cfg.interval.b - 0.01), cfg.interval.b);
        else cfg.onInterval(cfg.interval.a, Math.max(t, cfg.interval.a + 0.01));
        return;
      }
      if (trim) { trim.x = trimX(p.x, trim.left); overlay(); return; }
      over.style.cursor = drag === null && (markNear(p) >= 0 || handleNear(p) || stripNear(p)) ? "ew-resize" : cfg.paint ? "copy" : "";
      if (drag !== null) app.sel = [drag, t];
      app.setHover(p.inside ? p.t : null, p.y);
    });
    over.addEventListener("pointerleave", () => { if (drag === null && !grab) app.setHover(null, null); });
    over.addEventListener("pointerdown", (e) => {
      if (!L || e.button !== 0) return;
      const p = tAt(e);
      if (!p.inside) return;
      over.setPointerCapture(e.pointerId);
      const edge = handleNear(p);
      if (edge) { grab = { edge }; return; }
      const k = markNear(p);
      if (k >= 0) { grab = { mark: k }; return; }
      const side = !cfg.paint && stripNear(p);
      if (side) { trim = { left: side === "left", x: trimX(p.x, side === "left") }; app.setHover(null, null); overlay(); return; }
      drag = p.t; app.sel = null;
    });
    const end = (e) => {
      if (grab) { grab = null; return; }
      if (trim) {                                         // the window up to where the edge was dropped, 50 ms at least
        const t = app.a + (trim.x - L.plot.x) / L.plot.w * (app.b - app.a), left = trim.left;
        trim = null;
        if (left) app.setFocus(Math.min(t, app.b - 0.05), app.b); else app.setFocus(app.a, Math.max(t, app.a + 0.05));
        return;
      }
      if (drag === null) return;
      const p = tAt(e), s = Math.min(drag, clamp(p.t, app.a, app.b)), en = Math.max(drag, clamp(p.t, app.a, app.b)), wide = (en - s) / (app.b - app.a) * L.plot.w >= 6;
      drag = null; app.sel = null;
      if (wide && cfg.paint) cfg.onPaint(cfg.paint, s, en);
      else if (wide) app.setFocus(s, en);
      else overlay();
    };
    over.addEventListener("pointerup", end);
    over.addEventListener("pointercancel", () => { drag = null; grab = null; trim = null; app.sel = null; overlay(); });
    over.addEventListener("dblclick", () => app.setFocus(...app.home));
    /** The subplot under a y on the figure (for the editor), with its letter. */
    const rowAt = (y) => { const R = L && L.rows.find(R => y >= R.y && y <= R.y + R.h); return R ? Object.assign({ letter: "abcdefghijklmnopqrst"[R.k] }, R.row) : null; };
    return { draw, overlay, cfg, rowAt };
  }

  // ───────────────────────── the VDF cuts, as Helios draws them ─────────────────────────
  // FPICutPipeline for electrons, the app default: a geometric cut (spd_slice2d's geometric mode — every bin painted over
  // its own φ/θ/energy footprint, no interpolation) on a 100 × 100 grid over ±25×10³ km/s, the plane through the
  // spacecraft-frame origin and the axes relabeled by the records' own bulk velocity (pyspedas subtract_bulk), colored
  // 10⁻³¹–10⁻²⁵ s³/cm⁶ on the jet scale with eight log contours; three planes per cut.
  const C_KMS = 299792.458, ME_EV = 510998.95, MP_EV = 938272088.16;
  const speedE = (E, m = ME_EV) => { const r = E / m + 1, b2 = 1 - 1 / (r * r); return C_KMS * (b2 > 0 ? Math.sqrt(b2) : 0); };
  const recDt = (V) => V.dt || 0.03;                          // a record's accumulation: 30 ms DES, 150 ms DIS
  const wrap180 = (d) => { let x = d % 360; if (x > 180) x -= 360; else if (x <= -180) x += 360; return x; };
  /** A record's bins as velocity footprints (GeometricFootprints): energy edges at the midpoints, as speeds; each azimuth
   *  turned 180° from the look direction to the particles' own. */
  function footprints(V, i) {
    const E = V.E.subarray(i * 32, i * 32 + 32), ed = new Float64Array(33);
    for (let k = 1; k < 32; k++) ed[k] = (E[k - 1] + E[k]) / 2;
    ed[0] = Math.max(E[0] - (ed[1] - E[0]), E[0] / 2); ed[32] = E[31] + (E[31] - ed[31]);
    const m = V.sp === "dis" ? MP_EV : ME_EV;
    return { vEdge: Array.from(ed, (x) => speedE(x, m)), phiVel: Array.from(V.PHI.subarray(i * 32, i * 32 + 32), p => (isFinite(p) ? (p + 180) % 360 : NaN)), base: i * 16384 };
  }
  /** The packed index of the bin whose footprint holds the velocity (instrument frame, km/s), or −1. */
  function binOf(F, vx, vy, vz) {
    const sp = Math.sqrt(vx * vx + vy * vy + vz * vz), ve = F.vEdge;
    if (!(sp > 0) || sp < ve[0] || sp >= ve[32]) return -1;
    let lo = 0, hi = 32;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (ve[mid] <= sp) lo = mid; else hi = mid; }
    const it = clamp(Math.ceil((Math.asin(clamp(vz / sp, -1, 1)) * 180 / Math.PI + 90) / 11.25) - 1, 0, 15);
    const az = Math.atan2(vy, vx) * 180 / Math.PI, pv = F.phiVel;
    let ip = -1;
    if (isFinite(pv[0])) {
      const k = Math.floor(((wrap180(az - pv[0]) + 360 + 5.625) % 360) / 11.25) % 32;
      if (isFinite(pv[k]) && Math.abs(wrap180(az - pv[k])) <= 5.625 + 1e-9) ip = k;
    }
    if (ip < 0) { let bd = 5.625 + 1e-9; for (let k = 0; k < 32; k++) { if (!isFinite(pv[k])) continue; const d = Math.abs(wrap180(az - pv[k])); if (d <= bd) { bd = d; ip = k; } } }
    return ip < 0 ? -1 : F.base + (ip * 16 + it) * 32 + lo;
  }
  /** A bin's f from its 8-bit code: the live stores keep 0 for fill, 1 for a measured zero; the demo's 0 is both. */
  const fOf = (V, q, span) => (V.enc2 ? (q === 0 ? NaN : q === 1 ? 0 : 10 ** (V.lo + (q - 2) / 253 * span)) : (q ? 10 ** (V.lo + (q - 1) / 254 * span) : 0));
  /** One record's cut: f on an n × n grid (row = the second axis, from −vMax up); a measured zero is 0, a velocity
   *  outside the energy table NaN. `rot` (rows) takes the instrument frame to the cut's; `shift` relabels the axes. */
  function cutRecord(V, i, plane, rot, shift, vMax, n) {
    const F = footprints(V, i), out = new Float64Array(n * n).fill(NaN), span = V.hi - V.lo;
    for (let ib = 0; ib < n; ib++) {
      const bb = -vMax + (ib + 0.5) * 2 * vMax / n;
      for (let ia = 0; ia < n; ia++) {
        const aa = -vMax + (ia + 0.5) * 2 * vMax / n;
        const r = plane === 0 ? [aa + shift[0], bb + shift[1], 0] : plane === 1 ? [aa + shift[0], 0, bb + shift[2]] : [0, aa + shift[1], bb + shift[2]];
        const v = rot ? [rot[0][0] * r[0] + rot[1][0] * r[1] + rot[2][0] * r[2], rot[0][1] * r[0] + rot[1][1] * r[1] + rot[2][1] * r[2], rot[0][2] * r[0] + rot[1][2] * r[1] + rot[2][2] * r[2]] : r;
        const k = binOf(F, v[0], v[1], v[2]);
        if (k < 0) continue;
        out[ib * n + ia] = fOf(V, V.D[k], span);
      }
    }
    return out;
  }
  /** ParticleDistribution.gaussianBlur: σ in grid cells, two passes, empty cells left empty. */
  function gaussianBlur(src, n, sigma) {
    const half = Math.max(1, Math.floor(sigma * 3)), ker = [];
    for (let i = -half; i <= half; i++) ker.push(Math.exp(-i * i / (2 * sigma * sigma)));
    const pass = (inp, horiz) => {
      const out = new Float64Array(n * n).fill(NaN);
      for (let ib = 0; ib < n; ib++) for (let ia = 0; ia < n; ia++) {
        if (!isFinite(inp[ib * n + ia])) continue;
        let w = 0, s = 0;
        for (let o = -half; o <= half; o++) {
          const ja = horiz ? ia + o : ia, jb = horiz ? ib : ib + o;
          if (ja < 0 || ja >= n || jb < 0 || jb >= n) continue;
          const v = inp[jb * n + ja];
          if (!isFinite(v)) continue;
          w += ker[o + half]; s += ker[o + half] * v;
        }
        if (w > 0) out[ib * n + ia] = s / w;
      }
      return out;
    };
    return pass(pass(src, true), false);
  }
  /** The records a cut at t draws: the one whose 30 ms accumulation holds t, or the N whose centers are nearest. */
  function recordsAt(V, t, N) {
    const dt = recDt(V);
    if (!V.t.length) return [];
    if (N === 1) {                                          // the record holding t, else the nearest within 0.35 s (Helios)
      const i = lower(V.t, t + 1e-6) - 1;
      if (i >= 0 && t - V.t[i] < dt + 0.0005) return [i];
      const j = V.t.reduce((b, x, k) => (Math.abs(x + dt / 2 - t) < Math.abs(V.t[b] + dt / 2 - t) ? k : b), 0);
      return Math.abs(V.t[j] + dt / 2 - t) <= 0.35 ? [j] : [];
    }
    const lim = (N / 2 + 1) * dt;                            // records farther than that are not this cut's
    return V.t.map((x, i) => [Math.abs(x + dt / 2 - t), i]).filter(p => p[0] <= lim).sort((p, q) => p[0] - q[0]).slice(0, N).map(p => p[1]).sort((p, q) => p - q);
  }
  const mean3 = (arr, recs) => [0, 1, 2].map(c => recs.reduce((s, i) => s + arr[i * 3 + c], 0) / recs.length);
  const LABELS = { dbcs: ["Vx", "Vy", "Vz"], lmn: ["VL", "VM", "VN"], fac: ["V∥", "V⊥1", "V⊥2"] };   // SliceRotation.labels
  /**
   * One electron cut, through FPICutPipeline's steps: the frame (the instrument's DBCS — LMN while the window's LMN frame
   * is on — GSE, GSM, or B-aligned from B and the bulk velocity at the records), the bulk relabeling or the spacecraft
   * frame with the bulk dotted, the geometric cut of each record and their mean, then the Gaussian smoothing.
   * o: { frame, lmn (rows L, M, N in GSE, or null), gsm (GSE → GSM rows), records, subtract, vmax, sigma }.
   */
  function cutFPI(V, t, o) {
    const recs = recordsAt(V, t, o.records);
    if (!recs.length) return null;
    const G = V.dbcsToGSE, noMEC = V.live && !V.mecOK;
    let bulk = mean3(V.V, recs);
    const noV = !bulk.every(isFinite);
    if (noV) bulk = [0, 0, 0];                              // no moment: the spacecraft frame (Helios)
    o = Object.assign({}, o, { subtract: o.subtract && !noV });
    let rot = null, labels = LABELS.dbcs, tag = "DBCS";
    if (noMEC && (o.frame === "gse" || o.frame === "gsm" || (o.frame === "instrument" && o.lmn))) tag = "DBCS (no MEC attitude)";
    else if (o.frame === "instrument" && o.lmn) { rot = mul3(o.lmn, G); labels = LABELS.lmn; tag = "LMN"; }
    else if (o.frame === "gse" || (o.frame === "gsm" && !o.gsm)) { rot = G; tag = "GSE"; }
    else if (o.frame === "gsm") { rot = mul3(o.gsm, G); tag = "GSM"; }
    else if (o.frame === "fac") {
      const b = unit3(mean3(V.B, recs)), c = noV ? [0, 0, 0] : cross3(b, unit3(bulk)), m = Math.hypot(...c);
      if (m > 1e-9) { const cc = c.map(x => x / m); rot = [b, cross3(cc, b), cc]; labels = LABELS.fac; tag = "B-aligned"; }
      else tag = "DBCS (no B or V for B-aligned)";
    }
    const bulkRot = rot ? apply3(rot, bulk) : bulk, n = 100, planes = [[0, 1], [0, 2], [1, 2]];
    if (V.sp === "dis" && o.interp !== "geometric") return cutFPI2D(V, recs, o, rot, labels, tag, bulk, noV);
    const slices = planes.map(([ax, ay], plane) => {
      const per = recs.map(i => cutRecord(V, i, plane, rot, o.subtract ? bulkRot : [0, 0, 0], o.vmax, n));
      let f = per[0];
      if (per.length > 1) {                                 // the records' mean, cell by cell, over those that cover it
        f = new Float64Array(n * n);
        for (let k = 0; k < n * n; k++) { let s = 0, c = 0; for (const g of per) if (isFinite(g[k])) { s += g[k]; c++; } f[k] = c ? s / c : NaN; }
      }
      if (o.sigma > 0) f = gaussianBlur(f, n, o.sigma);
      return { f, n, vMax: o.vmax, labels: [labels[ax], labels[ay]], mark: o.subtract ? null : [bulkRot[ax], bulkRot[ay]] };
    });
    const k = recs.length, ms = Math.round(k * recDt(V) * 1000), note = [tag, o.subtract ? `axes −V(${V.sp === "dis" ? "DIS" : "DES"}), s/c-origin plane` : noV ? "s/c frame (no bulk V)" : "s/c frame", "geometric",
      k === o.records ? (k > 1 ? `${k} rec · ${ms} ms` : null) : `${k}/${o.records} rec · ${ms} ms`].filter(Boolean).join(" · ");
    return { slices, tag, note, start: V.t[recs[0]], end: V.t[recs[k - 1]] + recDt(V) };
  }

  /** pyspedas slice2d_2di + slice2d_smooth: points (a, b, f) → Delaunay-linear on linspace(−max|v|, max|v|, 150)
   *  (cell centers of a grid n/(n−1) wider), smoothed in ITS cells, then sampled onto the display's ±vDisp. */
  function grid2D(xs, ys, fs, smooth, vDisp) {
    const n = 150;
    let ext = 1; for (let j = 0; j < xs.length; j++) ext = Math.max(ext, Math.abs(xs[j]), Math.abs(ys[j]));
    const vg = ext * n / (n - 1), g = slice2dSmooth(interpGrid(xs, ys, fs, n, vg), n, smooth);
    const f = new Float64Array(n * n).fill(NaN), cell = 2 * vg / n;
    for (let ib = 0; ib < n; ib++) for (let ia = 0; ia < n; ia++) {
      const X = -vDisp + (ia + 0.5) * 2 * vDisp / n, Y = -vDisp + (ib + 0.5) * 2 * vDisp / n;
      const ja = Math.floor((X + vg) / cell), jb = Math.floor((Y + vg) / cell);
      if (ja >= 0 && ja < n && jb >= 0 && jb < n) f[ib * n + ia] = g[jb * n + ja];
    }
    return { f, n };
  }
  /** Helios's sliceFPI2D, the ion default (pyspedas interpolation='2d', subtract_bulk=True): every bin of every record
   *  a point at its radial bin center (the mean of its edge speeds) — measured zeros included, fill not; v − V first,
   *  then the frame; kept within ±20° of the plane; the records' points pooled; grid2D with smooth 7. */
  function cutFPI2D(V, recs, o, rot, labels, tag, bulk, noV) {
    const sub = o.subtract ? bulk : [0, 0, 0], slab = Math.sin(20 * Math.PI / 180), span = V.hi - V.lo, P = [[], [], []];
    const lat = Array.from({ length: 16 }, (_, it) => (-84.375 + 11.25 * it) * Math.PI / 180);
    for (const i of recs) {
      const F = footprints(V, i), sp = Array.from({ length: 32 }, (_, e) => (F.vEdge[e] + F.vEdge[e + 1]) / 2);
      for (let ip = 0; ip < 32; ip++) {
        const pv = F.phiVel[ip];
        if (!isFinite(pv)) continue;
        const cp = Math.cos(pv * Math.PI / 180), sn = Math.sin(pv * Math.PI / 180);
        for (let it = 0; it < 16; it++) {
          const cl = Math.cos(lat[it]), sl = Math.sin(lat[it]);
          for (let e = 0; e < 32; e++) {
            const f = fOf(V, V.D[F.base + (ip * 16 + it) * 32 + e], span), v = sp[e];
            if (!isFinite(f) || !isFinite(v)) continue;
            let w = [v * cl * cp - sub[0], v * cl * sn - sub[1], v * sl - sub[2]];
            if (rot) w = apply3(rot, w);
            const mag = Math.hypot(w[0], w[1], w[2]);
            if (!(mag > 0)) continue;
            if (Math.abs(w[2]) <= slab * mag) P[0].push(w[0], w[1], f);
            if (Math.abs(w[1]) <= slab * mag) P[1].push(w[0], w[2], f);
            if (Math.abs(w[0]) <= slab * mag) P[2].push(w[1], w[2], f);
          }
        }
      }
    }
    const vD = o.vmax, sm = o.smooth ?? 7;
    const slices = P.map((pts, pl) => {
      const xs = [], ys = [], fs = [];
      for (let j = 0; j < pts.length; j += 3) { xs.push(pts[j]); ys.push(pts[j + 1]); fs.push(pts[j + 2]); }
      const g = grid2D(xs, ys, fs, sm, vD), [ax, ay] = [[0, 1], [0, 2], [1, 2]][pl];
      const bR = rot ? apply3(rot, bulk) : bulk;
      return { f: g.f, n: g.n, vMax: vD, labels: [labels[ax], labels[ay]], mark: o.subtract || noV ? null : [bR[ax], bR[ay]] };
    });
    const k = recs.length, ms = Math.round(k * recDt(V) * 1000);
    const note = [tag, o.subtract ? "axes −V(DIS)" : noV ? "s/c frame (no bulk V)" : "s/c frame", `±20° slab · 2-D interpolation · smooth ${sm}`,
      k === o.records ? (k > 1 ? `${k} rec pooled · ${ms} ms` : null) : `${k}/${o.records} rec · ${ms} ms`].filter(Boolean).join(" · ");
    return { slices, tag, note, start: V.t[recs[0]], end: V.t[recs[k - 1]] + recDt(V), zLo: -27, zHi: -20 };
  }

  // ───────────────────────── HPCA cuts (Helios's sliceHPCA: pyspedas mms_part_slice2d, interpolation='2d') ─────────────────────────
  // Every bin of the half-spin as a velocity point (zeros included — slice2d_2di triangulates them), kept when within the
  // species' slab half-angle of the plane, the bulk velocity subtracted; a Delaunay triangulation, linear interpolation
  // onto a 150² grid over the points' own extent, then slice2d_smooth (σ = ln w − 0.25 cells, NaN propagates).
  const DEG = Math.PI / 180;
  const HPCA_RECIPE = { H: { theta: 20, smooth: 5, vMax: 1500, zLo: -28, zHi: -19, m: 1.04535e-2, name: "H⁺" },
                        He: { theta: 20, smooth: 15, vMax: 1500, zLo: -30, zHi: -20, m: 4.18138e-2, name: "He⁺" },
                        O: { theta: 45, smooth: 25, vMax: 750, zLo: -27, zHi: -21, m: 0.167255, name: "O⁺" } };
  const speedHPCA = (E, m) => { const c = 2.99792458e8, r = E / (m * c * c / 1e6) + 1, b2 = 1 - 1 / (r * r); return c * (b2 > 0 ? Math.sqrt(b2) : 0) / 1000; };
  /** Bowyer–Watson with the sweep refinement (a triangle whose circumcircle lies wholly left of the sweep is final). */
  function delaunay(x, y) {
    const n = x.length;
    if (n < 3) return [];
    let mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity;
    for (let i = 0; i < n; i++) { mnx = Math.min(mnx, x[i]); mxx = Math.max(mxx, x[i]); mny = Math.min(mny, y[i]); mxy = Math.max(mxy, y[i]); }
    const px = Array.from(x), py = Array.from(y), mx = (mnx + mxx) / 2, my = (mny + mxy) / 2, span = Math.max(mxx - mnx, mxy - mny, 1e-9);
    px.push(mx - 20 * span, mx, mx + 20 * span); py.push(my - span, my + 20 * span, my - span);
    const circ = (a, b, c) => {
      const ax = px[a], ay = py[a], bx = px[b], by = py[b], cx = px[c], cy = py[c], d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
      if (Math.abs(d) < 1e-18) return null;
      const a2 = ax * ax + ay * ay, b2 = bx * bx + by * by, c2 = cx * cx + cy * cy;
      const ux = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d, uy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d;
      return [ux, uy, (ax - ux) ** 2 + (ay - uy) ** 2];
    };
    const T = [], c0 = circ(n, n + 1, n + 2);
    if (!c0) return [];
    T.push({ a: n, b: n + 1, c: n + 2, cx: c0[0], cy: c0[1], r2: c0[2], alive: true });
    let active = [0];
    const order = Array.from({ length: n }, (_, i) => i).sort((p, q) => px[p] - px[q]);
    const edges = new Map();
    for (const i of order) {
      const X = px[i], Y = py[i], next = [];
      edges.clear();
      for (const ti of active) {
        const t = T[ti], dx = X - t.cx, dy = Y - t.cy, d2 = dx * dx + dy * dy;
        if (d2 <= t.r2 * (1 + 1e-12)) {
          t.alive = false;
          for (const [u, v] of [[t.a, t.b], [t.b, t.c], [t.c, t.a]]) { const k = Math.min(u, v) * 1048576 + Math.max(u, v); edges.set(k, (edges.get(k) || 0) + 1); }
        } else if (dx > 0 && dx * dx > t.r2) continue;
        else next.push(ti);
      }
      for (const [k, cnt] of edges) {
        if (cnt !== 1) continue;
        const u = Math.floor(k / 1048576), v = k % 1048576, c = circ(u, v, i);
        if (!c) continue;
        T.push({ a: u, b: v, c: i, cx: c[0], cy: c[1], r2: c[2], alive: true });
        next.push(T.length - 1);
      }
      active = next;
    }
    return T.filter(t => t.alive && t.a < n && t.b < n && t.c < n);
  }
  /** LinearNDInterpolator onto n² cell centers over ±vMax; NaN outside the hull. Near-duplicates averaged first. */
  function interpGrid(x, y, v, n, vMax) {
    const grid = new Float64Array(n * n).fill(NaN), q = 2 * vMax / n / 64, acc = new Map();
    for (let i = 0; i < x.length; i++) {
      const k = Math.round(x[i] / q) * 4194304 + Math.round(y[i] / q), e = acc.get(k);
      if (e) { e[0] += x[i]; e[1] += y[i]; e[2] += v[i]; e[3]++; } else acc.set(k, [x[i], y[i], v[i], 1]);
    }
    const pts = [...acc.values()].map(e => [e[0] / e[3], e[1] / e[3], e[2] / e[3]]);
    if (pts.length < 3) return grid;
    const ux = pts.map(p => p[0]), uy = pts.map(p => p[1]), uv = pts.map(p => p[2]), cell = 2 * vMax / n, idx = (c) => (c + vMax) / cell - 0.5;
    for (const t of delaunay(ux, uy)) {
      const x0 = ux[t.a], y0 = uy[t.a], x1 = ux[t.b], y1 = uy[t.b], x2 = ux[t.c], y2 = uy[t.c], den = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
      if (Math.abs(den) < 1e-18) continue;
      const a0 = Math.max(0, Math.floor(idx(Math.min(x0, x1, x2)))), a1 = Math.min(n - 1, Math.ceil(idx(Math.max(x0, x1, x2))));
      const b0 = Math.max(0, Math.floor(idx(Math.min(y0, y1, y2)))), b1 = Math.min(n - 1, Math.ceil(idx(Math.max(y0, y1, y2))));
      for (let ib = b0; ib <= b1; ib++) {
        const Y = -vMax + (ib + 0.5) * cell;
        for (let ia = a0; ia <= a1; ia++) {
          const X = -vMax + (ia + 0.5) * cell, l0 = ((y1 - y2) * (X - x2) + (x2 - x1) * (Y - y2)) / den, l1 = ((y2 - y0) * (X - x2) + (x0 - x2) * (Y - y2)) / den, l2 = 1 - l0 - l1;
          if (l0 >= -1e-9 && l1 >= -1e-9 && l2 >= -1e-9) grid[ib * n + ia] = l0 * uv[t.a] + l1 * uv[t.b] + l2 * uv[t.c];
        }
      }
    }
    return grid;
  }
  /** slice2d_smooth(width): a Gaussian kernel, c = ln(w) − 0.25 cells, zero padding past the grid, NaN propagating. */
  function slice2dSmooth(src, n, width) {
    let w = Math.max(2, width); if (w % 2 === 0) w--;
    if (w < 3) return src;
    const half = w >> 1, c = Math.log(w) - 0.25, ker = [];
    for (let i = -half; i <= half; i++) ker.push(Math.exp(-0.5 * (i / c) ** 2));
    const ks = ker.reduce((p, q) => p + q, 0);
    const pass = (inp, horiz) => {
      const out = new Float64Array(n * n).fill(NaN);
      for (let ib = 0; ib < n; ib++) for (let ia = 0; ia < n; ia++) {
        let s = 0, bad = false;
        for (let o = -half; o <= half; o++) {
          const ja = horiz ? ia + o : ia, jb = horiz ? ib : ib + o;
          if (ja < 0 || ja >= n || jb < 0 || jb >= n) continue;
          const v = inp[jb * n + ja];
          if (!isFinite(v)) { bad = true; break; }
          s += ker[o + half] / ks * v;
        }
        if (!bad) out[ib * n + ia] = s;
      }
      return out;
    };
    return pass(pass(src, true), false);
  }
  /** Three plane cuts of one HPCA half-spin. o: { frame, lmn, gsm, subtract } as the FPI cuts take them. The look
   *  directions are in the despun spin-plane frame (x toward the Sun, z the spin axis: within a few degrees of GSE). */
  function cutHPCA(A, o) {
    const R = HPCA_RECIPE[A.sp], slab = Math.sin(R.theta * DEG), bulk = o.subtract ? A.bulk : [0, 0, 0];
    const Ax = A.axes, toGSE = Ax && [[Ax[0][0], Ax[1][0], Ax[2][0]], [Ax[0][1], Ax[1][1], Ax[2][1]], [Ax[0][2], Ax[1][2], Ax[2][2]]];
    let rot = null, labels = LABELS.dbcs, tag = "DBCS (despun)";
    const wantsGSE = o.frame === "gse" || o.frame === "gsm" || (o.frame === "instrument" && o.lmn);
    if (wantsGSE && !toGSE) tag = "DBCS (no MEC attitude)";
    else if (o.frame === "instrument" && o.lmn) { rot = mul3(o.lmn, toGSE); labels = LABELS.lmn; tag = "LMN"; }
    else if (o.frame === "gse" || (o.frame === "gsm" && !o.gsm)) { rot = toGSE; tag = "GSE"; }
    else if (o.frame === "gsm") { rot = mul3(o.gsm, toGSE); tag = "GSM"; }
    else if (o.frame === "fac") {
      const bd = A.b && Ax ? apply3(Ax, A.b) : null;        // B (GSE) in the despun frame
      if (bd && A.bulk.some(x => x)) {
        const b = unit3(bd), c = cross3(b, unit3(A.bulk)), m = Math.hypot(...c);
        if (m > 1e-9) { const cc = c.map(x => x / m); rot = [b, cross3(cc, b), cc]; labels = LABELS.fac; tag = "B-aligned"; }
      } else tag = !bd ? "DBCS (no B for B-aligned)" : "DBCS (no V for B-aligned)";
    }
    const P = [[], [], []];                                 // per plane: a, b, f
    for (let a = 0; a < 16; a++) for (let k = 0; k < 16; k++) {
      const lat = (90 - A.colat[k]) * DEG, cl = Math.cos(lat), sl = Math.sin(lat);
      for (let e = 0; e < 63; e++) {
        const i = (a * 16 + k) * 63 + e, f = A.psd[i], ph = A.phi[i] * DEG;
        if (!(isFinite(f) && f >= 0)) continue;
        const v = speedHPCA(A.energy[e], R.m);
        let w = [v * cl * Math.cos(ph) - bulk[0], v * cl * Math.sin(ph) - bulk[1], v * sl - bulk[2]];
        if (rot) w = apply3(rot, w);
        const mag = Math.hypot(...w);
        if (!(mag > 0)) continue;
        [[0, 1, 2], [0, 2, 1], [1, 2, 0]].forEach(([ax, ay, off], pl) => { if (Math.abs(w[off]) / mag <= slab) { P[pl].push(w[ax], w[ay], f); } });
      }
    }
    const slices = P.map((pts, pl) => {
      const xs = [], ys = [], fs = [];
      for (let j = 0; j < pts.length; j += 3) { xs.push(pts[j]); ys.push(pts[j + 1]); fs.push(pts[j + 2]); }
      const g = grid2D(xs, ys, fs, R.smooth, R.vMax), [ax, ay] = [[0, 1], [0, 2], [1, 2]][pl];
      return { f: g.f, n: g.n, vMax: R.vMax, labels: [labels[ax], labels[ay]], mark: null, points: xs.length };
    });
    const note = [tag, o.subtract ? `axes −V(HPCA ${R.name})` : "s/c frame", `±${R.theta}° slab · 2-D interpolation · smooth ${R.smooth}`, "survey half-spin · azimuths from MEC"].join(" · ");
    return { slices, tag, note, start: A.t0, end: A.t0 + 10, zLo: R.zLo, zHi: R.zHi };
  }

  const SUP = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "-": "⁻" };
  const sup = (n) => String(n).split("").map(ch => SUP[ch]).join("");
  const jet = (t) => { const x = clamp(t, 0, 1), c = (m) => clamp(1.5 - Math.abs(4 * (x - m)), 0, 1); return [c(0.75), c(0.5), c(0.25)]; };
  /** ContourLines.segments: marching squares on the grid at one level, in grid units (x along a, y along b). */
  function contourSegments(g, n, level, out) {
    const cr = (p, q) => { const d = q - p; return Math.abs(d) < 1e-300 ? 0.5 : (level - p) / d; };
    for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
      const v0 = g[j * n + i], v1 = g[j * n + i + 1], v2 = g[(j + 1) * n + i + 1], v3 = g[(j + 1) * n + i];
      if (!(isFinite(v0) && isFinite(v1) && isFinite(v2) && isFinite(v3))) continue;
      const code = (v0 >= level ? 1 : 0) | (v1 >= level ? 2 : 0) | (v2 >= level ? 4 : 0) | (v3 >= level ? 8 : 0);
      if (code === 0 || code === 15) continue;
      const pb = [i + cr(v0, v1), j], pr = [i + 1, j + cr(v1, v2)], pt = [i + cr(v3, v2), j + 1], pl = [i, j + cr(v0, v3)];
      const add = (p, q) => out.push(p[0], p[1], q[0], q[1]);
      switch (code) {
        case 1: case 14: add(pl, pb); break;
        case 2: case 13: add(pb, pr); break;
        case 3: case 12: add(pl, pr); break;
        case 4: case 11: add(pr, pt); break;
        case 6: case 9: add(pb, pt); break;
        case 7: case 8: add(pl, pt); break;
        case 5: { const c = (v0 + v1 + v2 + v3) / 4; if (c >= level) { add(pl, pt); add(pb, pr); } else { add(pl, pb); add(pr, pt); } break; }
        case 10: { const c = (v0 + v1 + v2 + v3) / 4; if (c >= level) { add(pl, pb); add(pr, pt); } else { add(pl, pt); add(pb, pr); } break; }
      }
    }
  }
  const sliceCv = document.createElement("canvas");
  /** VDFSliceRender: one publication-style panel in a w × h cell — white, the jet raster with decade contours, a boxed
   *  axis in 10³ km/s with a dashed zero cross, the bulk dotted on a spacecraft-frame cut, and the decade color bar. */
  function drawSlice(ctx, x0, y0, w, h, s, cLo, cHi, levels) {
    const mL = 48, mR = 52, mT = 8, mB = 36, side = Math.min(w - mL - mR, h - mT - mB);
    if (side <= 30) return;
    const ox = x0 + mL, oy = y0 + mT, n = s.n, vMax = s.vMax, scale = side / (2 * vMax), step = 2 * vMax / n, first = -vMax + step / 2;
    const img = new ImageData(n, n), logf = new Float64Array(n * n).fill(NaN);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const f = s.f[j * n + i];
      if (!(isFinite(f) && f > 0)) continue;
      const lf = Math.log10(f), [r, g, b] = jet((lf - cLo) / (cHi - cLo)), o = ((n - 1 - j) * n + i) * 4;
      logf[j * n + i] = lf;
      img.data[o] = r * 255 + 0.5; img.data[o + 1] = g * 255 + 0.5; img.data[o + 2] = b * 255 + 0.5; img.data[o + 3] = 255;
    }
    sliceCv.width = sliceCv.height = n;
    sliceCv.getContext("2d").putImageData(img, 0, 0);
    ctx.save(); ctx.beginPath(); ctx.rect(ox, oy, side, side); ctx.clip();
    ctx.imageSmoothingEnabled = false; ctx.drawImage(sliceCv, ox, oy, side, side); ctx.imageSmoothingEnabled = true;
    if (levels > 0) {                                       // pyspedas's olines: levels across the color range, on log10 f
      const seg = [];
      for (let k = 0; k < levels; k++) contourSegments(logf, n, cLo + k / levels * (cHi - cLo), seg);
      const X = (gi) => ox + (first + gi * step + vMax) * scale, Y = (gj) => oy + side - (first + gj * step + vMax) * scale;
      ctx.beginPath();
      for (let k = 0; k < seg.length; k += 4) { ctx.moveTo(X(seg[k]), Y(seg[k + 1])); ctx.lineTo(X(seg[k + 2]), Y(seg[k + 3])); }
      ctx.strokeStyle = "#000"; ctx.lineWidth = 0.4; ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = "#000"; ctx.lineWidth = 0.8; ctx.strokeRect(ox, oy, side, side);
    const cx = ox + side / 2, cy = oy + side / 2;
    ctx.save(); ctx.setLineDash([3, 3]); ctx.strokeStyle = "rgba(0,0,0,0.3)"; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(ox, cy); ctx.lineTo(ox + side, cy); ctx.moveTo(cx, oy); ctx.lineTo(cx, oy + side); ctx.stroke(); ctx.restore();
    if (s.mark) {                                           // the bulk velocity on a spacecraft-frame cut (Torbert et al. 2018)
      ctx.save(); ctx.setLineDash([1.2, 2.4]); ctx.strokeStyle = "rgba(0,0,0,0.85)"; ctx.lineWidth = 0.9; ctx.beginPath();
      if (Math.abs(s.mark[0]) < vMax && Math.abs(s.mark[0]) > step / 2) { const x = ox + (s.mark[0] + vMax) / (2 * vMax) * side; ctx.moveTo(x, oy); ctx.lineTo(x, oy + side); }
      if (Math.abs(s.mark[1]) < vMax && Math.abs(s.mark[1]) > step / 2) { const y = oy + side - (s.mark[1] + vMax) / (2 * vMax) * side; ctx.moveTo(ox, y); ctx.lineTo(ox + side, y); }
      ctx.stroke(); ctx.restore();
    }
    const vk = vMax / 1000, stepV = [0.2, 0.25, 0.5, 1, 2, 5, 10, 20, 50].find(v => vk / v <= 3.2) || 100;
    const ticks = [0];
    for (let t = stepV; t < vk; t += stepV) ticks.push(t, -t);
    ctx.fillStyle = "#000"; ctx.strokeStyle = "#000"; ctx.lineWidth = 0.6;
    for (const v of ticks) {
      const px = ox + (v * 1000 + vMax) / (2 * vMax) * side, py = oy + side - (v * 1000 + vMax) / (2 * vMax) * side;
      ctx.beginPath(); ctx.moveTo(px, oy + side); ctx.lineTo(px, oy + side - 3); ctx.moveTo(ox, py); ctx.lineTo(ox + 3, py); ctx.stroke();
      const lbl = stepV < 1 ? v.toFixed(1) : v.toFixed(0);
      rich(ctx, lbl, px, oy + side + 8, { size: 8.5, align: "center", color: "#000", mono: true });
      rich(ctx, lbl, ox - 4, py, { size: 8.5, align: "right", color: "#000", mono: true });
    }
    rich(ctx, `${s.labels[0]} (10³ km/s)`, ox + side / 2, oy + side + 24, { size: 9.5, weight: 600, align: "center", color: "#000" });
    ctx.save(); ctx.translate(ox - 36, cy); ctx.rotate(-Math.PI / 2);
    rich(ctx, `${s.labels[1]} (10³ km/s)`, 0, 0, { size: 9.5, weight: 600, align: "center", color: "#000" }); ctx.restore();
    const cbX = ox + side + 8, cbW = 9;
    for (let i = 0; i < 40; i++) {
      const [r, g, b] = jet(i / 40);
      ctx.fillStyle = `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
      ctx.fillRect(cbX, oy + side - (i / 40 + 1 / 40) * side, cbW, side / 40 + 0.6);
    }
    ctx.strokeStyle = "#000"; ctx.lineWidth = 0.5; ctx.strokeRect(cbX, oy, cbW, side);
    const dLo = Math.ceil(cLo), dHi = Math.floor(cHi), sd = Math.max(1, Math.floor((dHi - dLo) / 3));
    for (let d = dLo; d <= dHi; d += sd) rich(ctx, `10${sup(d)}`, cbX + cbW + 3, oy + side - (d - cLo) / (cHi - cLo) * side, { size: 6.5, color: "#000" });
    rich(ctx, "s³/cm⁶", cbX + cbW / 2 + 4, oy + side + 8, { size: 6.5, align: "center", color: "rgba(0,0,0,0.7)" });
  }

  // ───────────────────────── the overview strip ─────────────────────────
  function Strip(D, app) {
    const cv = $("#strip"), [S0, S1] = D.m.event.span;
    let base = null, G = null;
    function layout(w, h) {
      const narrow = w < 560, left = narrow ? 62 : 100, right = narrow ? 44 : 64, top = 18, bottom = 20, H = h - top - bottom;
      return { w, h, narrow, P: { x: left, y: top, w: w - left - right, h: H }, B: { x: left, y: top, w: w - left - right, h: H / 2 }, I: { x: left, y: top + H / 2, w: w - left - right, h: H / 2 } };
    }
    function drawBase() {
      const { ctx, w, h, dpr } = sizeCanvas(cv);
      G = layout(w, h);
      // the plot is drawn once per size into an offscreen canvas; the window and cursor go on top
      base = document.createElement("canvas"); base.width = cv.width; base.height = cv.height;
      const c = base.getContext("2d");
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.fillStyle = "#fff"; c.fillRect(0, 0, w, h);
      const { B, I, P } = G;
      c.fillStyle = "#eceaf2"; c.fillRect(B.x, B.y, B.w, B.h);
      const rows = [["b", 3, COL.mag], ["b", 0, COL.x], ["b", 1, COL.y], ["b", 2, COL.z]];
      const rr = runs(D, "fgm", S0, S1, false);
      let lo = Infinity, hi = -Infinity;
      for (const [name, c] of rows) [lo, hi] = extent(rr, col(name, c), lo, hi);
      const pad = (hi - lo) * 0.08, yOf = (v) => B.y + B.h - (v - lo + pad) / (hi - lo + 2 * pad) * B.h;
      for (const [name, k, color] of rows) stroke(c, B, S0, S1, rr, col(name, k), yOf, color, 1);
      for (const v of nice(lo, hi, 2)) {
        const y = yOf(v);
        if (y < B.y + 5 || y > B.y + B.h - 4) continue;
        c.fillStyle = INK; c.fillRect(B.x - 4, Math.round(y), 4, 1);
        rich(c, String(v), B.x - 6, y, { size: 9.5, align: "right", color: INK2 });
      }
      const win = specRange(D, "dis", "dis", S0, S1, false);
      spectrogram(c, I, S0, S1, D, "dis", false, dpr, LIVE ? win : null);
      energyAxis(c, I, D.erange.dis);
      colorbar(c, I.x + I.w + 6, I.y + 2, 8, I.h - 4, win);
      [["|B|", COL.mag], ["X", COL.x], ["Y", COL.y], ["Z", COL.z]].forEach(([s, color], i) =>
        rich(c, s, B.x + B.w + 6, B.y + 6 + i * (B.h - 10) / 3, { size: 9, weight: 600, color }));
      for (const R of [B, I]) { c.strokeStyle = "rgba(29,29,34,0.45)"; c.lineWidth = 1; c.strokeRect(Math.round(R.x) + 0.5, Math.round(R.y) + 0.5, Math.round(R.w) - 1, Math.round(R.h)); }
      if (G.narrow) {
        rich(c, "B", 6, B.y + B.h / 2, { size: 10, weight: 600 }); rich(c, "Ions", 6, I.y + I.h / 2, { size: 10, weight: 600 });
      } else {
        rich(c, "B", B.x - 66, B.y + B.h / 2 - 6, { size: 11, weight: 600, align: "center" }); rich(c, "(nT)", B.x - 66, B.y + B.h / 2 + 7, { size: 9.5, align: "center", color: INK2 });
        rich(c, "Ions", I.x - 66, I.y + I.h / 2 - 6, { size: 11, weight: 600, align: "center" }); rich(c, "(eV)", I.x - 66, I.y + I.h / 2 + 7, { size: 9.5, align: "center", color: INK2 });
      }
      const { ticks } = timeTicks(S0, S1, P.w * 0.9);
      for (const t of ticks) {
        const x = P.x + (t - S0) / (S1 - S0) * P.w;
        c.fillStyle = INK; c.fillRect(Math.round(x), P.y + P.h, 1, 3);
        rich(c, clock(t).slice(0, 5), x, P.y + P.h + 10, { size: 9.5, align: "center" });
      }
    }
    function draw() {
      if (!base || cv.width !== Math.round(cv.clientWidth * Math.min(window.devicePixelRatio || 1, 2))) drawBase();
      const { ctx, w, h } = sizeCanvas(cv), { P } = G;
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(base, 0, 0);
      ctx.setTransform(cv.width / w, 0, 0, cv.height / h, 0, 0);
      const xOf = (t) => P.x + (t - S0) / (S1 - S0) * P.w, x0 = xOf(app.a), x1 = Math.max(xOf(app.b), x0 + 2);
      ctx.fillStyle = "rgba(243,154,30,0.2)"; ctx.fillRect(x0, P.y, x1 - x0, P.h);
      ctx.strokeStyle = ORANGE; ctx.lineWidth = 1.5; ctx.strokeRect(x0, P.y + 0.75, x1 - x0, P.h - 1.5);
      const tag = span(app.b - app.a);
      ctx.font = `600 10px ${SYS}`;
      const tw = ctx.measureText(tag).width + 12, tx = clamp((x0 + x1) / 2 - tw / 2, P.x, P.x + P.w - tw);
      ctx.fillStyle = ORANGE; ctx.fillRect(tx, 2, tw, 14);
      rich(ctx, tag, tx + tw / 2, 9, { size: 10, weight: 600, align: "center", color: "#fff" });
      if (app.hover !== null) {
        const x = Math.round(xOf(app.hover)) + 0.5;
        ctx.strokeStyle = "rgba(20,20,26,0.6)"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, P.y); ctx.lineTo(x, P.y + P.h); ctx.stroke();
      }
    }
    // drag the window, or its edges; press elsewhere to move it there
    let mode = null, grab = 0, start = null;
    const tAt = (e) => { const r = cv.getBoundingClientRect(); return S0 + (e.clientX - r.left - G.P.x) / G.P.w * (S1 - S0); };
    const pxPerS = () => G.P.w / (S1 - S0);
    cv.addEventListener("pointerdown", (e) => {
      if (!G || e.button !== 0) return;
      const t = tAt(e), edge = 6 / pxPerS();
      if (Math.abs(t - app.a) < edge) mode = "a";
      else if (Math.abs(t - app.b) < edge) mode = "b";
      else if (t > app.a && t < app.b) { mode = "move"; grab = t - app.a; }
      else { const half = (app.b - app.a) / 2; app.setFocus(t - half, t + half); mode = "move"; grab = half; }
      start = [app.a, app.b];
      cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener("pointermove", (e) => {
      if (!G) return;
      const t = clamp(tAt(e), S0, S1), edge = 6 / pxPerS();
      cv.style.cursor = mode === "a" || mode === "b" || Math.abs(t - app.a) < edge || Math.abs(t - app.b) < edge ? "ew-resize" : t > app.a && t < app.b ? "grab" : "crosshair";
      if (mode === "move") { const s = app.b - app.a; app.setFocus(t - grab, t - grab + s); }
      else if (mode === "a") app.setFocus(Math.min(t, app.b - 2), app.b);
      else if (mode === "b") app.setFocus(app.a, Math.max(t, app.a + 2));
      else app.setHover(t, null);
    });
    const end = () => { mode = null; };
    cv.addEventListener("pointerup", end);
    cv.addEventListener("pointercancel", () => { if (start) app.setFocus(...start); mode = null; });
    cv.addEventListener("pointerleave", () => { if (!mode) app.setHover(null, null); });
    cv.addEventListener("dblclick", () => app.setFocus(...app.home));
    return { draw, rebuild: () => { base = null; draw(); } };
  }

  // ───────────────────────── the data window ─────────────────────────
  const PROBE_COL = { 1: "#ebebeb", 2: "#ed7821", 3: "#128c66", 4: "#4fa8ed" };
  const MMS_FAM = [1, 2, 3, 4], THM_FAM = LIVE ? ["tha", "thd", "the", "thb", "thc"] : ["tha", "THEMIS-D", "THEMIS-E"];
  const CL_FAM = LIVE ? ["c1", "c2", "c3", "c4"] : ["Cluster-1", "Cluster-2", "Cluster-3", "c4"];
  const CRAFT = {
    1: { name: "MMS1", col: PROBE_COL[1], mission: "mms", family: MMS_FAM }, 2: { name: "MMS2", col: PROBE_COL[2], mission: "mms", family: MMS_FAM },
    3: { name: "MMS3", col: PROBE_COL[3], mission: "mms", family: MMS_FAM }, 4: { name: "MMS4", col: PROBE_COL[4], mission: "mms", family: MMS_FAM },
    tha: { name: "THEMIS-A", col: "#ff74c4", mission: "tha", family: THM_FAM },
    c4: { name: "Cluster-4", col: "#7fe3a1", mission: "c4", family: CL_FAM },
  };
  if (LIVE) Object.assign(CRAFT, {
    thd: { name: "THEMIS-D", col: "#ff9a52", mission: "tha", family: THM_FAM }, the: { name: "THEMIS-E", col: "#c18cff", mission: "tha", family: THM_FAM },
    thb: { name: "ARTEMIS-P1", col: "#f2d36b", mission: "tha", family: THM_FAM }, thc: { name: "ARTEMIS-P2", col: "#e8b04a", mission: "tha", family: THM_FAM },
    c1: { name: "Cluster-1", col: "#a8f0c0", mission: "c4", family: CL_FAM }, c2: { name: "Cluster-2", col: "#62d9a0", mission: "c4", family: CL_FAM },
    c3: { name: "Cluster-3", col: "#3fbf86", mission: "c4", family: CL_FAM },
    omni: { name: "OMNI", col: "#f7c55c", mission: "omni", family: ["omni", "idx"] },
    idx: { name: "Geomagnetic indices", col: "#8fb4ff", mission: "idx", family: ["omni", "idx"] },
    ace: { name: "ACE", col: "#e07b00", mission: "l1", family: ["ace", "wind", "dscovr"] },
    wind: { name: "Wind", col: "#008c8c", mission: "l1", family: ["ace", "wind", "dscovr"] },
    dscovr: { name: "DSCOVR", col: "#7f33b3", mission: "l1", family: ["ace", "wind", "dscovr"] },
    g16: { name: "GOES-16", col: "#34d27b", mission: "goes", family: ["g16", "g17", "g18", "g19"] }, g17: { name: "GOES-17", col: "#2bb86a", mission: "goes", family: ["g16", "g17", "g18", "g19"] },
    g18: { name: "GOES-18", col: "#5fe39a", mission: "goes", family: ["g16", "g17", "g18", "g19"] }, g19: { name: "GOES-19", col: "#1f9d57", mission: "goes", family: ["g16", "g17", "g18", "g19"] },
  });
  /** The craft a click on the view opens: the demo carries one probe of each other mission, and stands it in for the rest. */
  const representative = (name) => {
    if (LIVE) {
      const art = { "ARTEMIS-P1": "thb", "ARTEMIS-P2": "thc", ACE: "ace", Wind: "wind", DSCOVR: "dscovr" }[name];
      if (art) return art;
      const g = /^GOES-(1[6-9])$/.exec(name);
      if (g) return `g${g[1]}`;
      const m = /^THEMIS-([ADE])$/.exec(name) || /^Cluster-([1-4])$/.exec(name);
      return m ? (/\d/.test(m[1]) ? `c${m[1]}` : `th${m[1].toLowerCase()}`) : null;
    }
    return /^THEMIS/.test(name) ? "tha" : /^Cluster/.test(name) ? "c4" : null;
  };
  const WINDOW_CHOICES = [5, 10, 30, 90, 180];             // ±minutes, as HSOScreen.windowChoices
  const IDX_CHOICES = [720, 1440, 2880, 4320];             // the indices window: ±12 h … ±3 d (GeoIndicesPanelView.halfWidths)
  const rangeLabel = (m) => (m >= 1440 && m % 1440 === 0 ? `±${m / 1440}d` : m >= 60 && m % 60 === 0 ? `±${m / 60}h` : `±${m}m`);
  // VDFPresets: a preset sets every electron option it covers. "App default" is Helios's own; the crescent preset is this
  // demo's recipe for the perpendicular crescent of Burch et al. (2016), which Helios's list does not carry.
  const VDF_PRESETS = [
    { id: "default", name: "App default", v: { frame: "instrument", vmax: 25000, contours: 8, sigma: 0, records: 1, subtract: true, zlo: -31, zhi: -25 } },
    { id: "burch", name: "Burch et al. 2016 crescent (electrons)", v: { frame: "fac", vmax: 15000, contours: 8, sigma: 0, records: 1, subtract: true, zlo: -30, zhi: -25 } },
  ];
  const VDF_OPTS = [["frame", "frame"], ["vmax", "electron axes"], ["contours", "electron contours"], ["sigma", "electron smoothing"],
                    ["records", "electron slice time"], ["subtract", "electron subtract"], ["zlo", "electron colors"], ["zhi", "electron colors"]];
  const CRESCENT_T = { 2: (Date.UTC(2015, 9, 16, 13, 7, 2, 195) - T0) / 1000, 3: (Date.UTC(2015, 9, 16, 13, 7, 2, 212) - T0) / 1000 };
  const HAS_CRESCENT = !LIVE || Math.abs(CRESCENT_T[2] - (SRC.at - SRC.t0) / 1000) < SRC.burstHalf;         // 13:07:02.195 on MMS2; MMS3's crescent record starts at 02.212
  const CRESCENT_HELP = "Burch et al. (2016)'s perpendicular crescent: a cut at 13:07:02.195 on MMS2 (02.212 on MMS3), B-aligned, axes ±15×10³ km/s, colors 10⁻³⁰–10⁻²⁵ s³/cm⁶, and the figure ±5 s around it";
  const CUT_COLORS = ["#1F6FD8", "#E8760C", "#2AA24A", "#8E44AD", "#D8322B", "#0E9AA7", "#C2185B", "#8D6E63"];   // VDFCutPalette
  const CHEV = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5 5 6.5 8 3.5" stroke="currentColor" stroke-width="1.4" fill="none"/></svg>';
  // SF Symbols' arrow.left.and.right.circle.fill, gold, as Helios draws its reset
  const RESET = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="currentColor"/><path d="M4 8h8M6 5.6L3.8 8 6 10.4M10 5.6L12.2 8 10 10.4" fill="none" stroke="#14161b" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const HAM = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 4h11M2.5 8h11M2.5 12h11"/></svg>';
  const CANON = ["b", "ionSpec", "elecSpec", "n", "ti", "te", "tanis", "p", "vi", "ve", "jfpi", "jpar", "jperp", "e"];
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  const DAY = (() => { const d = new Date(T0 + 7200e3); return `${d.getUTCDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()]} ${d.getUTCFullYear()}`; })();
  const hmsShort = (t) => { const s = clock(t, true); return s.endsWith(".000") ? s.slice(0, 8) : s; };
  const durText = (s) => (s < 10 ? `${s.toFixed(2)} s` : s < 100 ? `${s.toFixed(1)} s` : `${Math.round(s)} s`);
  /** "13:07:02.175", "13:07:02" or "13:07" on the event's day → seconds from 11:00 UT; null when it does not parse. */
  function parseClock(str) {
    const p = String(str).trim().split(":");
    if (p.length < 2 || p.length > 3) return null;
    const h = +p[0], m = +p[1], s = p.length === 3 ? +p[2] : 0;
    if (![h, m, s].every(isFinite) || h < 0 || h > 23 || m < 0 || m > 59 || s < 0 || s >= 61) return null;
    const d = new Date(T0);                                 // seconds from T0, on T0's day
    return h * 3600 + m * 60 + s - (d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds());
  }
  /** The tools sidebar's controls (ToolsKit): headings, disclosures, checkboxes, switches, notes and option rows. */
  const tk = {
    h: (title, trailing) => `<div class="tk-h"><b>${title}</b>${trailing ? `<span>${trailing}</span>` : ""}</div>`,
    dis: (key, title, open, body, trailing) => `<div class="tk-dis${open ? " open" : ""}"><button class="tk-dh" data-act="toggle" data-key="${esc(key)}" aria-expanded="${open}"><i></i><span>${title}</span>${trailing ? `<em>${trailing}</em>` : ""}</button>${open ? `<div class="tk-db">${body}</div>` : ""}</div>`,
    ck: (attr, label, on, help, off) => `<label class="tk-ck${off ? " na" : ""}" title="${esc(help || label)}"><input type="checkbox" ${attr}${on ? " checked" : ""}${off ? " disabled" : ""}><span>${label}</span></label>`,
    sw: (attr, label, on, help, off) => `<label class="tk-sw${off ? " na" : ""}" title="${esc(help || label)}"><span>${label}</span><input type="checkbox" role="switch" ${attr}${on ? " checked" : ""}${off ? " disabled" : ""}></label>`,
    note: (text, caution) => `<p class="tk-note${caution ? " caution" : ""}">${text}</p>`,
    opt: (label, control, cls = "") => `<div class="tk-opt ${cls}"><span class="tk-l">${label}</span>${control}</div>`,
    sel: (attr, options, value) => `<select ${attr}>${options.map(([v, t, off]) => `<option value="${esc(v)}"${String(v) === String(value) ? " selected" : ""}${off ? " disabled" : ""}>${t}</option>`).join("")}</select>`,
    seg: (attr, options, value) => `<div class="tk-seg">${options.map(([v, t, off]) => `<button ${attr}="${v}" aria-pressed="${v === value}"${off ? ` disabled title="${esc(off)}"` : ""}>${t}</button>`).join("")}</div>`,
    link: (act, title, help, off) => `<button class="tk-link" data-act="${act}" title="${esc(help || title)}"${off ? " disabled" : ""}>${title}</button>`,
  };

  /**
   * A data window, as Helios's SpacecraftDataPanel: the bar (the craft menu, the tools button, the VDF cuts with + Add, the
   * range), the tools sidebar with its Figure and Analysis tabs, the figure, and the side panels beside it — the LMN
   * frame workbench and the VDF cuts, one column each. The HSO screen floats these over its view; the workspace docks one.
   * host: { el, S, app (the workspace's clock; none for a window of its own), pinned, span(), moment(), widen(W, dw),
   *         setRange(W, minutes), onCraft(W) }.
   */
  function DataWindow(D, n0, host) {
    const el = host.el;
    el.classList.add("fw");
    el.innerHTML = `<div class="fw-bar">
        <span class="tl"><button class="tl-c" aria-label="Close"></button><button class="tl-m" aria-label="Minimize"></button><button class="tl-z" aria-label="Fill the screen"></button></span>
        <div class="fw-pick"><button class="pick fw-pb" aria-haspopup="listbox" aria-expanded="false"><i class="sw"></i><span></span>${CHEV}</button><div class="pick-menu" role="listbox" aria-label="Spacecraft" hidden></div></div>
        <button class="fw-ic fw-sb" aria-label="Show the figure and analysis tools" aria-pressed="false" title="Figure and analysis tools">${HAM}</button>
        ${host.pinned != null ? `<span class="fw-pin" title="Pinned: opened while the time machine was at this moment">${clock(host.pinned)} UTC</span>` : ""}
        <div class="fw-cuts" hidden><span class="fc-l">VDF cuts</span><span class="fc-chips"></span>${HAS_CRESCENT ? `<button class="fc-cres" title="${esc(CRESCENT_HELP)}">Crescent</button>` : ""}<div class="fw-add"><button class="pick fc-add" aria-haspopup="menu" aria-expanded="false" title="Add a VDF cut: a species at the current time. Then drag its numbered line, or type its time in its column."><b>+</b>Add</button><div class="pick-menu fc-menu" role="menu" hidden></div></div></div>
        <div class="fw-range"><button class="fw-reset" hidden aria-label="Reset the time range" title="Reset the trimmed time range to the full ±window (or double-click the figure)">${RESET}</button><button class="pick fw-rb" aria-haspopup="listbox" aria-expanded="false"><span></span>${CHEV}</button><div class="pick-menu" role="listbox" aria-label="Time range" hidden>${WINDOW_CHOICES.map(m => `<button role="option" data-m="${m}">${rangeLabel(m)}</button>`).join("")}</div></div>
      </div>
      <p class="fw-banner" hidden></p>
      <div class="fw-main">
        <aside class="fw-side tk" aria-label="Figure and analysis tools" hidden></aside>
        <div class="fw-body"><canvas class="fw-plot" aria-label="The window's data: magnetic field, spectrograms, moments and currents"></canvas><canvas class="fw-over" aria-hidden="true"></canvas><p class="panel-loading" hidden></p></div>
        <section class="fw-lmn tk" aria-label="LMN frame" hidden></section>
        <section class="fw-vdf" aria-label="Velocity distribution cuts" hidden><div class="vd-cols"></div><p class="vd-empty">Press + above to add a cut — a species at an instant. Each cut is a numbered, colored line on the figure and a column of its three plane cuts here.</p></div>
      </div>
      <span class="fw-grip" aria-hidden="true"></span>`;
    const W = {
      n: 0, el, host, view: Object.create(D), tab: "figure", sideOpen: false, open: new Set(), extra: 0,
      lmn: { panel: false, frame: null, on: true, draft: false, range: null, mark: true, error: null, copied: false },
      vdf: Object.assign({ on: false, cuts: [], data: null, id: 0, preset: "default" }, VDF_PRESETS[0].v),
      bands: [], paint: null,
    };
    const A = host.app || { hover: null, hoverY: null, sel: null };
    if (!host.app) {
      A.setFocus = (a, b) => {
        const [S0, S1] = W.view.span || D.m.event.span, s = clamp(b - a, 2, S1 - S0);   // a window with its own span (indices)
        A.a = clamp(a, S0, S1 - s); A.b = A.a + s;
        W.redraw(); W.rangeText();
      };
      A.setHover = (t) => { A.hover = t; W.panel && W.panel.overlay(); };
      [A.a, A.b] = host.span(); A.home = [A.a, A.b];
    }
    W.app = A;
    if (LIVE) window.addEventListener("hso-progress", (e) => { if (e.detail.n === W.n) W.redraw(); });
    if (LIVE) setInterval(() => {                            // the indeterminate bars move between the progress events
      const Cd = D.craft[W.n];
      if (!Cd || !Cd.lazyBusy || el.hidden) return;
      if (Object.keys(Cd.lazyBusy).some(g => Cd.lazyBusy[g] && !(Cd.lazyDone && Cd.lazyDone[g]))) W.redraw();
    }, 120);
    if (LIVE) window.addEventListener("hso-burst", (e) => {     // live: the burst data arrived after the window drew
      if (W.n !== e.detail) return;
      const d = D.craft[W.n];
      Object.assign(W.view, { bu: d.bu, segs: d.segs, erange: d.erange });
      W.redraw(); redrawCuts();
    });
    W.panel = Panel(W.view, A, $(".fw-plot", el), $(".fw-over", el), {
      mission: CRAFT[n0].mission, stack: MISSIONS[CRAFT[n0].mission].stack.slice(),
      onMark: (k, t) => moveCut(W.vdf.cuts[k], t),
      onInterval: (a, b) => { W.lmn.range = [a, b]; W.redraw(); lmnTimes(); },
      onPaint: (kind, a, b) => { W.bands.push({ kind, a, b }); W.bands.sort((p, q) => p.a - q.a); renderSide(); renderLMN(); W.redraw(); },
    });
    const C = W.cfg = W.panel.cfg;
    const side = $(".fw-side", el), lmnEl = $(".fw-lmn", el), vdfEl = $(".fw-vdf", el), cols = $(".vd-cols", el);

    // ── the subplot editor (Helios's overplot editor): right-click a subplot to hide its lines, overplot others, switch
    //    log y, or set its axis (a line subplot) or color (a spectrogram) limits; a movable card that closes with × or Esc ──
    const plain = (str) => String(str || "").replace(/[_^]\{([^}]*)\}/g, "$1");
    let ed = null;
    $(".fw-over", el).addEventListener("contextmenu", (e) => {
      if (!LIVE) return;
      const r = e.currentTarget.getBoundingClientRect(), row = W.panel.rowAt(e.clientY - r.top);
      if (!row) return;
      e.preventDefault();
      openEditor(row.key, row.letter, e.clientX, e.clientY);
    });
    function closeEditor() { if (ed) { ed.el.remove(); document.removeEventListener("keydown", ed.esc); ed = null; } }
    W.closeEditor = closeEditor;
    function openEditor(key, letter, x, y) {
      closeEditor();
      const box = document.createElement("div");
      box.className = "sp-ed"; box.setAttribute("role", "dialog");
      document.body.appendChild(box);
      ed = { el: box, key, letter, q: "", esc: (e) => { if (e.key === "Escape") closeEditor(); } };
      document.addEventListener("keydown", ed.esc);
      renderEditor();
      const bw = box.offsetWidth, bh = box.offsetHeight;
      box.style.left = `${clamp(x + 8, 8, innerWidth - bw - 8)}px`; box.style.top = `${clamp(y - 20, 8, innerHeight - bh - 8)}px`;
      box.addEventListener("pointerdown", (e) => {                 // drag by the header
        const h = e.target.closest(".sp-h");
        if (!h || e.target.closest("button")) return;
        const s0 = { x: e.clientX, y: e.clientY, l: box.offsetLeft, t: box.offsetTop };
        h.setPointerCapture(e.pointerId);
        const mv = (e2) => { box.style.left = `${clamp(s0.l + e2.clientX - s0.x, 0, innerWidth - 60)}px`; box.style.top = `${clamp(s0.t + e2.clientY - s0.y, 0, innerHeight - 30)}px`; };
        const up = () => { h.removeEventListener("pointermove", mv); h.removeEventListener("pointerup", up); };
        h.addEventListener("pointermove", mv); h.addEventListener("pointerup", up);
      });
      box.addEventListener("click", onEditorClick);
      box.addEventListener("change", onEditorChange);
      box.addEventListener("input", (e) => { if (e.target.matches(".sp-q")) { ed.q = e.target.value; renderEditor(true); } });
    }
    const editOf = (key) => (C.edits = C.edits || {}, C.edits[key] = C.edits[key] || {});
    function tidy(key) {
      const E = C.edits && C.edits[key];
      if (!E) return;
      for (const k of Object.keys(E)) if (E[k] == null || (Array.isArray(E[k]) && !E[k].length)) delete E[k];
      if (!Object.keys(E).length) delete C.edits[key];
    }
    function renderEditor(keepFocus) {
      if (!ed) return;
      const key = ed.key, mission = C.mission, kind = Object.assign({}, kindOf(mission, key), W.view.relabel && W.view.relabel[key]), E = (C.edits && C.edits[key]) || {};
      let h = `<div class="sp-h"><b>(${ed.letter}) ${esc(plain(kind.title))}</b><button class="sp-x" aria-label="Close">×</button></div><div class="sp-b">`;
      if (kind.spec) {
        h += `<p class="sp-t">Colors <span>log₁₀ ${esc(kind.cbar || "flux")}</span></p><div class="sp-row">10^<input class="sp-n" data-z="zLo" type="number" step="1" value="${E.zLo ?? ""}" placeholder="auto">to 10^<input class="sp-n" data-z="zHi" type="number" step="1" value="${E.zHi ?? ""}" placeholder="auto"><button data-act="zauto">Auto</button></div>`;
      } else {
        h += `<label class="sp-c"><input type="checkbox" data-act="log" ${(E.logY ?? !!kind.log) ? "checked" : ""}> log y</label>`;
        h += `<p class="sp-t">Lines</p>` + kind.lines.map((ln, i) => {
          const id = `${key}#${i}`;
          return `<label class="sp-c"><input type="checkbox" data-hide="${id}" ${(E.hide || []).includes(id) ? "" : "checked"}><i style="background:${ln.color}"></i>${esc(plain(ln.label))}</label>`;
        }).join("");
        const mine = new Set(E.over || []), q = ed.q.trim().toLowerCase();
        const cands = [];
        for (const [, keys] of MISSIONS[mission].sections) for (const k of keys) {
          if (typeof k !== "string" || k === key || !KINDS[k] || !has(W.view, mission, k)) continue;
          const kk = Object.assign({}, kindOf(mission, k), W.view.relabel && W.view.relabel[k]);
          if (kk.spec || !kk.lines) continue;
          kk.lines.forEach((ln, i) => {
            const id = `${k}#${i}`, label = `${plain(ln.label)} · ${plain(kk.title)}`;
            if (mine.has(id) || !q || label.toLowerCase().includes(q) || (kk.unit || "").toLowerCase().includes(q)) cands.push({ id, label, unit: kk.unit, on: mine.has(id) });
          });
        }
        cands.sort((p, r) => r.on - p.on);
        h += `<p class="sp-t">Overplot</p><input class="sp-q" type="search" placeholder="Search: density, V_i, E′, nPa…" value="${esc(ed.q)}" aria-label="Search quantities to overplot">`;
        h += `<div class="sp-list">${cands.slice(0, 80).map(c => `<label class="sp-c"><input type="checkbox" data-over="${c.id}" ${c.on ? "checked" : ""}>${esc(c.label)} <em>${esc(c.unit || "")}</em></label>`).join("") || `<p class="sp-note">Nothing in this window matches.</p>`}</div>`;
        h += `<p class="sp-note">A quantity in another unit is drawn against a right-hand axis.</p>`;
        h += `<p class="sp-t">Y range</p><div class="sp-row"><input class="sp-n" data-y="yLo" type="number" value="${E.yLo ?? ""}" placeholder="auto">to<input class="sp-n" data-y="yHi" type="number" value="${E.yHi ?? ""}" placeholder="auto"><button data-act="yauto">Auto</button></div>`;
      }
      h += `<button class="sp-reset" data-act="reset">Reset subplot</button></div>`;
      const pos = ed.el.querySelector(".sp-q") ? ed.el.querySelector(".sp-q").selectionStart : null;
      ed.el.innerHTML = h;
      if (keepFocus) { const qi = ed.el.querySelector(".sp-q"); qi.focus(); if (pos != null) qi.setSelectionRange(pos, pos); }
    }
    function onEditorClick(e) {
      const b = e.target.closest("button");
      if (!b || !ed) return;
      if (b.classList.contains("sp-x")) return closeEditor();
      const E = editOf(ed.key), act = b.dataset.act;
      if (act === "zauto") { E.zLo = E.zHi = null; }
      else if (act === "yauto") { E.yLo = E.yHi = null; }
      else if (act === "reset") { delete C.edits[ed.key]; }
      else return;
      tidy(ed.key); renderEditor(); W.redraw();
    }
    function onEditorChange(e) {
      const x = e.target, d = x.dataset;
      if (!ed || x.matches(".sp-q")) return;
      const E = editOf(ed.key);
      if (d.act === "log") E.logY = x.checked;
      else if (d.hide) { const set_ = new Set(E.hide || []); if (x.checked) set_.delete(d.hide); else set_.add(d.hide); E.hide = [...set_]; }
      else if (d.over) { const set_ = new Set(E.over || []); if (x.checked) set_.add(d.over); else set_.delete(d.over); E.over = [...set_]; }
      else if (d.y || d.z) { const v = x.value.trim() === "" ? null : +x.value; E[d.y || d.z] = isFinite(v) ? v : null; }
      tidy(ed.key);
      if (d.over || d.act === "log") renderEditor();
      W.redraw();
    }

    /** The figure's settings from the window's state, then a redraw on the next frame. */
    function sync() {
      const L = W.lmn, V = W.vdf, f = L.frame;
      C.lmn = f && L.on ? { R: [f.l, f.m, f.n], label: `LMN (${f.method}, λ₂/λ₃ = ${f.ratio.toFixed(1)})` } : null;
      C.marks = V.on ? V.cuts.map(c => ({ t: c.t, color: c.color })) : [];
      C.interval = L.panel && (!f || L.draft) && L.range ? (L.mark ? { a: L.range[0], b: L.range[1], live: true } : null)
        : f && L.mark ? { a: f.a, b: f.b, live: false } : null;
      C.bands = W.bands; C.paint = W.paint;
    }
    let queued = false;
    W.redraw = () => {
      if (queued || !W.n) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; W.drawNow(); });
    };
    W.drawNow = () => { if (W.n && !el.hidden) { ensureLazy(); sync(); W.panel.draw(); } };
    /** Live MMS: the HPCA, EDP and DSP groups are fetched when a row first needs them, merged into the probe's data. */
    function ensureLazy() {
      if (!LIVE || CRAFT[W.n].mission !== "mms") return;
      const n = W.n, Cd = D.craft[n];
      if (!Cd) return;
      Cd.lazyDone = Cd.lazyDone || {}; Cd.lazyBusy = Cd.lazyBusy || {};
      const groups = new Set((C.stack || []).map(k => KINDS[k] && KINDS[k].lazy).filter(Boolean));
      for (const g of groups) {
        if (Cd.lazyDone[g] || Cd.lazyBusy[g]) continue;
        Cd.lazyBusy[g] = true;
        SRC.lazy(n, g).then((r) => {
          Object.assign(Cd.sv, r.sets);
          for (const [k, S] of Object.entries(r.sets)) { cadence(S); if (S.etab) Cd.erange[k] = edges([S]); }
          if (r.burst) {
            Cd.extraBu = Object.assign(Cd.extraBu || {}, r.burst);
            if (Cd.bu) Object.assign(Cd.bu, r.burst);
            for (const [k, B] of Object.entries(r.burst)) {
              cadence(B);
              const t = B.t, out = [];
              if (t.length) { let st = t[0]; for (let i = 1; i < t.length; i++) if (t[i] - t[i - 1] > Math.max(1, B.gap)) { out.push([st, t[i - 1] + B.dt]); st = t[i]; } out.push([st, t[t.length - 1] + B.dt]); }
              Cd.segs[k] = Cd.bu ? out : [];
              Cd.burstSegs = Object.assign(Cd.burstSegs || {}, { [k]: out });
            }
          }
          Cd.lazyDone[g] = true;
          if (W.n === n) { Object.assign(W.view, { sv: Cd.sv, bu: Cd.bu, segs: Cd.segs, erange: Cd.erange, lazyDone: Cd.lazyDone }); renderSide(); W.redraw(); }
        });
      }
    }
    // a late record set (loadMission): the default rows it carries come back to the figure, in their default places
    window.addEventListener("hso-late", (e) => {
      if (e.detail !== W.n || !W.dropped) return;
      const back = [...W.dropped].filter(q => has(W.view, C.mission, q));
      if (back.length) {
        const def = MISSIONS[C.mission].stack;
        C.stack = def.filter(q => C.stack.includes(q) || back.includes(q)).concat(C.stack.filter(q => !def.includes(q)));
        back.forEach(q => W.dropped.delete(q));
      }
      renderSide(); W.redraw();
    });
    W.rangeText = () => {
      const ch = W.view.span ? IDX_CHOICES : WINDOW_CHOICES, menu = $(".fw-range .pick-menu", el);
      if (menu.dataset.set !== String(ch)) { menu.innerHTML = ch.map(m => `<button role="option" data-m="${m}">${rangeLabel(m)}</button>`).join(""); menu.dataset.set = String(ch); }
      const s = (A.b - A.a) / 2, m = ch.find(x => Math.abs(x * 60 - s) < 1);
      $(".fw-rb span", el).textContent = m ? rangeLabel(m) : `±${span(s)}`;
      $$("[data-m]", el).forEach(o => o.setAttribute("aria-selected", String(+o.dataset.m === m)));
      // Helios's reset: shown only while the window is trimmed inside its ±window
      const h = A.home;
      $(".fw-reset", el).hidden = !h || (Math.abs(A.a - h[0]) < 0.01 && Math.abs(A.b - h[1]) < 0.01);
    };
    /** Show and hide the side panels; a floating window grows or shrinks by what they take. */
    function relayout() {
      const ncol = Math.max(1, Math.min(3, W.vdf.cuts.length));
      side.hidden = !W.sideOpen; lmnEl.hidden = !W.lmn.panel; vdfEl.hidden = !W.vdf.on;
      vdfEl.style.setProperty("--cols", ncol);
      $(".fw-cuts", el).hidden = !W.vdf.on;
      $(".fw-sb", el).setAttribute("aria-pressed", String(W.sideOpen));
      const extra = (W.sideOpen ? 220 : 0) + (W.lmn.panel ? 320 : 0) + (W.vdf.on ? 250 * ncol : 0), dw = extra - W.extra;
      W.extra = extra;
      if (dw) host.widen(W, dw);
      W.redraw();
    }

    // ── the craft ──
    function pickerMenu() {
      const fam = CRAFT[W.n || n0].family;
      $(".fw-pick .pick-menu", el).innerHTML = fam.map(k => CRAFT[k]
        ? `<button role="option" data-n="${k}" style="--c:${CRAFT[k].col}" aria-selected="${String(k) === String(W.n)}"><i class="sw"></i>${CRAFT[k].name}</button>`
        : `<button role="option" disabled title="In the app; the demo carries ${CRAFT[fam.find(x => CRAFT[x])].name}" style="--c:#555"><i class="sw"></i>${k}</button>`).join("");
    }
    W.setCraft = async (k) => {
      if (k === W.n) return;
      const Cr = CRAFT[k], busy = $(".panel-loading", el);
      if (!D.craft[k]) { busy.textContent = `Loading ${Cr.name}…`; busy.hidden = false; }
      try { if (Cr.mission === "mms") await loadCraft(D, k); else await loadMission(D, k); }
      catch (e) { busy.textContent = `${Cr.name}'s data could not be loaded.`; busy.hidden = false; return; }
      busy.hidden = true;
      const data = D.craft[k], newMission = !W.n || CRAFT[W.n].mission !== Cr.mission;
      Object.assign(W.view, { n: k, sv: data.sv, bu: data.bu, segs: data.segs, erange: data.erange, kind: data.kind, relabel: data.relabel || null, lazyDone: data.lazyDone || null, span: host.app ? null : data.span || null });
      W.n = k;
      if (newMission || LIVE) {                              // live: only the subplots that probe has data for that day
        C.mission = Cr.mission; C.stack = MISSIONS[Cr.mission].stack.slice();
        if (LIVE) { const all = C.stack, kept = all.filter(q => has(W.view, Cr.mission, q)); if (kept.length) C.stack = kept; W.dropped = new Set(all.filter(q => !C.stack.includes(q))); }
        if (Cr.mission !== "mms") W.vdf.on = false;
      }
      // a frame belongs to the craft it was solved on (Helios keys it by craft): a new craft starts in GSE
      Object.assign(W.lmn, { frame: null, draft: false, error: null });
      if (W.lmn.range) W.lmn.range = null;
      el.setAttribute("aria-label", `${Cr.name} data`);
      const ban = $(".fw-banner", el);                       // a craft-level note, as Helios's (Cluster-2's dead CIS)
      ban.hidden = !data.banner; ban.textContent = data.banner || "";
      const pb = $(".fw-pb", el);
      pb.style.setProperty("--c", Cr.col); $("span", pb).textContent = Cr.name;
      pickerMenu();
      if (W.lmn.panel) defaultInterval();
      if (!host.app && (data.span || W.spanned) && newMission) {   // into or out of a window with its own span: its default range
        const c = host.moment(), [a2, b2] = data.span ? [c - data.wm * 60, c + data.wm * 60] : host.span();
        W.spanned = !!data.span; A.home = [a2, b2]; A.setFocus(a2, b2); A.home = [A.a, A.b];
      }
      renderSide(); renderLMN(); relayout();
      await loadCuts();
      host.onCraft && host.onCraft(W);
    };

    // ── the tools sidebar: Figure | Analysis (HSOScreen.modularitySidebar) ──
    const avail = (k) => has(W.view, C.mission, k);
    const usable = (keys) => keys.filter(avail).length >= 0.75 * keys.length;
    const sameKeys = (p, q) => p.length === q.length && p.every((x, i) => x === q[i]);
    function smoothNote() {
      const t = [];
      for (const [S, i0, i1] of runs(W.view, "dis", A.a, A.b, true)) for (let i = Math.max(1, i0); i < Math.min(S.t.length, i1); i++) t.push(S.t[i] - S.t[i - 1]);
      t.sort((p, q) => p - q);
      if (t.length < 4) return `Boxcar mean over ${C.smoothW} samples; spectrograms unaffected.`;
      const s = t[t.length >> 1] * C.smoothW;
      return `Boxcar mean over ${C.smoothW} samples ≈ ${s < 1 ? `${Math.round(s * 1000)} ms` : `${s.toFixed(1)} s`}. Edges keep raw values; spectrograms unaffected.`;
    }
    function lmnStatus() {
      const f = W.lmn.frame;
      return `${f.method}${f.ratio >= 10 ? " · normal well determined" : " · normal poorly determined"}${f.native ? "" : " · from the displayed B"}${W.lmn.on ? " · in use on the figure" : " · kept, figure in GSE"}`;
    }
    function vdfOptionsHTML() {
      const V = W.vdf, lmnOn = !!(W.lmn.frame && W.lmn.on);
      const match = VDF_PRESETS.find(p => VDF_OPTS.every(([k]) => p.v[k] === V[k]));
      const last = VDF_PRESETS.find(p => p.id === V.preset) || VDF_PRESETS[0];
      const changed = match ? [] : [...new Set(VDF_OPTS.filter(([k]) => last.v[k] !== V[k]).map(([, label]) => label))];
      let h = `<p class="tk-h3">VDF options</p>`;
      if (HAS_CRESCENT) h += `<button class="tk-btn tk-cres" data-act="crescent" title="${esc(CRESCENT_HELP)}">Show the Burch crescent<small>13:07:02.195 · B-aligned · ±15×10³ km/s</small></button>`;
      h += tk.opt("Preset", tk.sel('data-vdf="preset"', [...VDF_PRESETS.map(p => [p.id, p.name]), ["torbert", "Torbert et al. 2018 (electrons) · in the app", true],
        ["wang", "Wang et al. 2019 (ions) · in the app", true], ...(match ? [] : [["custom", `${last.name} · modified`]])], match ? match.id : "custom"), "auto");
      if (!match) h += tk.note(`Modified from ${last.name}: ${changed.join(", ")}.`, true);
      else if (match.id === "burch") h += tk.note("The demo's crescent recipe: B-aligned, axes ±15×10³ km/s, colors 10⁻³⁰–10⁻²⁵ s³/cm⁶; the rest as App default.");
      h += tk.opt("frame", tk.sel('data-vdf="frame"', [["instrument", lmnOn ? "LMN" : "DBCS"], ["gse", "GSE"], ["gsm", "GSM"], ["fac", "B-aligned"]], V.frame), "v");
      if (V.frame === "instrument") h += tk.note(lmnOn ? "LMN is the window's own frame (the LMN toggle)." : "DBCS — the instrument's own frame, a few degrees from GSE (not GSE).");
      else if (V.frame === "fac") h += tk.note("V∥, V⊥1, V⊥2 from B and the bulk velocity at the record.");
      else h += tk.note(`${V.frame === "gse" ? "Rotated from DBCS" : "DBCS → GSE, then GSE → GSM about X"}; Helios uses the MEC attitude, this demo the rotation FGM's DMPA and GSE data give (3.9° on MMS2).`);
      h += `<p class="tk-h4">Electrons</p>`;
      h += tk.opt("contours", tk.sel('data-vdf="contours"', [[0, "none"], [4, "4"], [8, "8"], [12, "12"], [16, "16"]], V.contours), "v");
      h += tk.opt("slice time", tk.sel('data-vdf="records"', [1, 2, 4, 8].map(k => [k, k > 1 ? `${k * 30} ms (${k} rec)` : "30 ms"]), V.records), "v");
      h += tk.opt("smoothing", `<input type="range" min="0" max="3" step="0.5" value="${V.sigma}" data-vdf="sigma" class="tk-range" aria-label="Electron smoothing σ"><span class="tk-unit mono">${V.sigma > 0 ? `σ ${V.sigma.toFixed(1)}` : "off"}</span>`, "v");
      const adv = [V.vmax !== 25000, !V.subtract, V.zlo !== -31 || V.zhi !== -25].filter(Boolean).length, open = W.open.has("vdfadv");
      h += `<button class="tk-adv${open ? " open" : ""}" data-act="toggle" data-key="vdfadv" aria-expanded="${open}" title="Axes, what is subtracted, product and colors"><i></i>Advanced${adv ? `<em>· ${adv} changed</em>` : ""}</button>`;
      if (open) {
        const kms = (v) => `${v / 1000} ×10³ km/s`;
        h += `<p class="tk-h4">Electrons</p>`
          + tk.opt("axes ±v", tk.sel('data-vdf="vmax"', [[25000, `default · ${kms(25000)}`], ...[2000, 3000, 5000, 8000, 10000, 15000, 20000, 40000, 60000].map(v => [v, kms(v)])], V.vmax), "v")
          + tk.opt("subtract", tk.sel('data-vdf="subtract"', [["1", "electron bulk V"], ["0", "none · s/c frame"]], V.subtract ? "1" : "0"), "v")
          + tk.opt("colors", tk.sel('data-vdf="colors"', [["-31,-25", "default · 10⁻³¹–10⁻²⁵"], ["-30,-25", "10⁻³⁰–10⁻²⁵"], ["-29,-25", "10⁻²⁹–10⁻²⁵"], ["-28,-25", "10⁻²⁸–10⁻²⁵"]], `${V.zlo},${V.zhi}`), "v")
          + tk.opt("product", tk.sel("disabled", [["cut", "cut"]], "cut"), "v") + tk.note("The reduced ∫f dv₃ product is in the app.");
      }
      return h;
    }
    function sideHTML() {
      const mission = C.mission, mms = mission === "mms", M = MISSIONS[mission];
      let h = tk.seg("data-tab", [["figure", "Figure"], ["analysis", "Analysis"]], W.tab);
      if (W.tab === "figure") {
        h += `<section class="tk-sec">${tk.h("Display")}`
          + (mms ? tk.ck('data-fig="coverage"', "Fast/Burst coverage bar", C.coverage, "The fast and burst data coverage, drawn above the stack") : "")
          + tk.ck('data-fig="tracker"', "Value tracker", C.tracker, "The grey hover line that reads every subplot's value at the cursor")
          + (C.tracker && W.vdf.on ? tk.note("Hidden while VDF cuts are up, so it does not fight their lines.") : "") + `</section>`;
        const cur = M.presets.findIndex(([, keys]) => sameKeys(keys.filter(avail), C.stack));
        h += `<section class="tk-sec">${tk.h("Plot selection", `${C.stack.length} selected`)}`
          + tk.opt("Preset", tk.sel('data-fig="preset"', [...M.presets.map(([name, keys], i) => [i, usable(keys) ? name : `${name} · in the app`, !usable(keys)]), ...(cur < 0 ? [["custom", "Custom"]] : [])], cur < 0 ? "custom" : cur), "auto");
        for (const [title, keys] of M.sections) {
          const body = keys.map(k => (typeof k === "string" && avail(k)
            ? tk.ck(`data-kind="${k}"`, kindOf(mission, k).title, C.stack.includes(k))
            : tk.ck("", typeof k === "string" ? kindOf(mission, k).title : k.title, false, "In the app — this demo does not carry its data", true))).join("");
          h += tk.dis(`g:${title}`, title, W.open.has(`g:${title}`), body);
        }
        h += `</section>`;
        const active = [mms && C.spintone, C.outliers, mms && C.smooth].filter(Boolean).length;
        h += `<section class="tk-sec">${tk.h("Corrections", `${active} active`)}`;
        if (mms) h += tk.ck('data-fig="spintone"', "Spin-tone correct Vₑ", C.spintone, "Subtract the FPI spin-tone estimate from Vₑ; J, J·E′ and V⊥ follow")
          + (C.spintone ? tk.note("Vₑ − FPI spin-tone estimate; J, J·E′, V⊥ follow.") : "");
        h += tk.ck('data-fig="outliers"', "Remove outliers", C.outliers, "Drop instrumental spikes from the line quantities")
          + (C.outliers ? tk.note("Drops samples >10σ from a rolling median (σ from the median absolute deviation). Runs longer than 3 samples are kept, so jets survive. B and spectrograms untouched.") : "");
        if (mms) {
          h += tk.ck('data-fig="smooth"', "Smooth traces", C.smooth, "Boxcar-smooth the line quantities on the figure; spectrograms are unaffected");
          if (C.smooth) h += tk.opt("Width", tk.sel('data-fig="smoothW"', [3, 5, 10, 20, 30, 50, 100].map(w => [w, String(w)]), C.smoothW) + `<span class="tk-unit">samples</span>`) + tk.note(smoothNote());
          h += tk.ck("", "Partial e⁻ moments", false, "In the app: electron moments integrated from a DES energy channel upward", true);
        }
        h += `</section>`;
      } else {
        h += `<section class="tk-sec">${tk.h("Analysis panels")}`
          + tk.sw('data-an="lmn"', "LMN frame", W.lmn.panel, "The LMN frame workbench beside the figure: calculate a frame, apply a saved one, or enter axes");
        if (!W.lmn.panel) h += W.lmn.error ? tk.note(esc(W.lmn.error), true) : W.lmn.frame ? tk.note(lmnStatus()) : "";
        if (mms) {
          h += tk.sw('data-an="vdf"', "VDF cuts", W.vdf.on, "Velocity-distribution cuts beside the figure, one column per cut");
          if (!W.vdf.on && HAS_CRESCENT) h += tk.link("crescent", "Show the Burch crescent · 13:07:02.195", CRESCENT_HELP);
          if (W.vdf.on) h += `<div class="tk-ind">${tk.note("Cuts attach to the right, one column each. Add a species with + Add above them; drag a cut's numbered line on the figure, or type its time in its column. FPI cuts need burst; HPCA uses survey.")}${vdfOptionsHTML()}</div>`;
          h += tk.sw("", "HPCA TOF", false, "In the app: the TOF workbench beside the figure", true)
            + tk.sw("", "Modified Alfvén", false, "In the app: V_out from the painted inflow regions, HPCA mass densities and B_L (Cassak & Shay 2007)", true);
        } else if (mission === "c4") h += tk.sw("", "VDF cuts", false, "In the app: Cluster CIS 3-D distributions (CODIF H⁺, He⁺, O⁺; HIA)", true);
        h += `</section>`;
        h += `<section class="tk-sec">${tk.h("Boundary layers", W.bands.length ? `${W.bands.length} painted` : "")}<p class="tk-sub">Region to paint</p><div class="tk-regions">`
          + REGIONS.map(r => `<button class="tk-region${W.paint === r.key ? " on" : ""}${r.key === "llbl" || r.key === "msbl" ? " half" : ""}" data-act="paint" data-kind="${r.key}" style="--c:${r.color}" title="${W.paint === r.key ? `Painting ${r.name} — click again to stop` : `Paint ${r.name}: pick it, then drag across the figure`}"><i></i><span>${r.name}</span>${W.paint === r.key ? "<b>✓</b>" : ""}</button>`).join("")
          + `</div>` + tk.note(W.paint ? `${REGION[W.paint].name} selected · drag across the figure to paint. Click it again to stop.` : "Pick a region, then drag across the figure to paint it.");
        if (W.bands.length) h += W.bands.map((b, i) => `<div class="tk-band"><i style="background:${REGION[b.kind].color}"></i><span><b>${REGION[b.kind].name}</b><em>${hmsShort(b.a)}–${hmsShort(b.b)} UTC</em></span><button data-act="band-x" data-i="${i}" aria-label="Remove this ${REGION[b.kind].name} region" title="Remove this region">×</button></div>`).join("")
          + tk.link("bands-clear", "Clear all", "Remove every painted region from this window");
        h += `</section>`;
      }
      h += tk.dis("data", "Data · in this page", W.open.has("data"),
        tk.note(LIVE ? `Fetched live from CDAWeb (HAPI) and SSCWeb for this moment: ${(D.bytes / 1e6).toFixed(1)} MB so far. Survey data for four hours, burst data within ${SRC.burstHalf / 60} minutes of the moment, electron, ion and HPCA distributions around each VDF cut, and HPCA, EDP and DSP data when a subplot first needs them.`
          : `Cut down from public Level 2 data for this demo and loaded with the page: ${(D.bytes / 1e6).toFixed(1)} MB so far. Helios fetches any window live and keeps saved events and pinned windows on disk.`));
      return h;
    }
    function renderSide() { if (!W.sideOpen) return; const top = side.scrollTop; side.innerHTML = sideHTML(); side.scrollTop = top; }

    // ── the LMN frame workbench (MVABSidePanel), with Helios's one-spacecraft method MVA-B ──
    function defaultInterval() {
      const mp = W.bands.find(b => b.kind === "mpBL" && b.a >= A.a && b.b <= A.b);
      W.lmn.range = mp ? [mp.a, mp.b] : [A.a + (A.b - A.a) / 3, A.a + 2 * (A.b - A.a) / 3];
    }
    function entryHTML() {
      const L = W.lmn, r = L.range, mp = W.bands.find(b => b.kind === "mpBL");
      let h = tk.seg("data-entry", [["calculate", "Calculate"], ["saved", "Saved frame", "In the app: frames saved for this craft and those from other panels"], ["manual", "Enter axes", "In the app: type L, M and N in GSE"]], "calculate");
      h += `<div class="tk-col"><p class="tk-l2">Method</p><select data-lmn="method" title="How Apply LMN solves the axes"><optgroup label="One spacecraft"><option selected>MVA-B</option></optgroup></select>`
        + `<p class="tk-note">The other methods — MVA-B with ⟨B⟩·N = 0, MVA-E, MFR, the velocity and current variances and the four-spacecraft MDD family — are in the app.</p></div>`;
      h += `<div class="tk-col"><div class="tk-row"><b class="tk-h2">Calculation interval</b>${r ? `<span class="tk-sup">${DAY} · UTC</span>` : ""}</div>`;
      if (r) h += `<div class="tk-times"><label><span class="tk-l2">Start</span><input class="tk-time" data-lmn="start" value="${clock(r[0], true)}" spellcheck="false" title="UTC — HH:mm:ss, or HH:mm:ss.sss. Press Return to apply."></label>`
        + `<label><span class="tk-l2">End</span><input class="tk-time" data-lmn="end" value="${clock(r[1], true)}" spellcheck="false" title="UTC — HH:mm:ss, or HH:mm:ss.sss. Press Return to apply."></label></div>`
        + `<p class="tk-sup tk-dur">${durText(r[1] - r[0])} selected</p>`
        + (mp && !(Math.abs(mp.a - r[0]) < 1e-3 && Math.abs(mp.b - r[1]) < 1e-3) ? tk.link("lmn-painted", "↔ Use the painted magnetopause", "Set the interval to the Magnetopause BL region painted on the figure") : "");
      else h += tk.link("lmn-place", "⊕ Place the interval on the figure", "Put the black handles on B");
      h += tk.ck('data-lmn="mark"', "Mark interval on B", L.mark, "Show the calculation interval's handles on B — what the method reads — and the applied interval after")
        + tk.note("Reads magnetic field (FGM).") + `</div>`;
      h += `<div class="tk-col"><button class="tk-primary" data-act="lmn-apply"${r ? "" : " disabled"} title="${r ? "Solve MVA-B over the calculation interval and apply it" : "Place the calculation interval first"}">Apply LMN</button>`
        + (L.error ? `<p class="tk-err">⚠ ${esc(L.error)}</p>` : "")
        + tk.note(L.frame ? "Apply replaces the active frame once the calculation succeeds." : "The figure stays in GSE until the calculation succeeds.") + `</div>`;
      h += tk.dis("lmnhelp", "Method & interval help", W.open.has("lmnhelp"),
        tk.note("Variance of B: L the maximum, N the minimum.") + tk.note("Sonnerup & Cahill 1967; Sonnerup & Scheible 1998")
        + tk.note("Drag the black handles on B — what this method reads — or type the times. Apply LMN solves the frame and rotates the figure into it.")
        + tk.note("Signs follow N_x ≥ 0, L_z ≥ 0 — natural on the dayside, arbitrary in the tail. Flip L or Flip N after applying to match a paper."));
      return h;
    }
    function appliedHTML(f) {
      const L = W.lmn, good = f.ratio >= 10, sep = f.tangent >= 3;
      let h = `<div class="tk-col"><div class="tk-row"><span class="tk-l2">Active frame</span><b class="${L.on ? "gold" : "tk-sup"}">${L.on ? "In use on the figure" : "Kept · figure in GSE"}</b></div>`
        + `<p class="tk-big">${f.method}</p><p class="tk-sup">${DAY} · UTC</p><p class="tk-val">${hmsShort(f.a)}–${hmsShort(f.b)} · ${durText(f.b - f.a)}</p>`
        + tk.ck('data-lmn="mark"', "Show the interval on the figure", L.mark, "The dashed edges of the interval this frame was calculated over, on B. Off hides them; the frame stays applied.") + `</div>`;
      const cautions = [];
      if (!good) cautions.push(["Normal poorly determined", `λ₂/λ₃ = ${f.ratio.toFixed(1)}`]);
      if (!sep) cautions.push(["L and M mix", `λ₁/λ₂ = ${f.tangent.toFixed(1)}`]);
      if (f.stability && f.stability[2] > 5) cautions.push(["Interval sensitive", `N moves ±${f.stability[2].toFixed(1)}° over 0.5–2× the interval`]);
      if (!f.native) cautions.push(["From the displayed B", "native-cadence FGM was unavailable"]);
      h += `<div class="tk-col">` + (cautions.length
        ? `<div class="tk-caution">${cautions.map(([t, d]) => `<p><b>${t}</b><span>${d}</span></p>`).join("")}</div>`
        : `<p class="tk-good"><i>✓</i>Normal well determined · λ₂/λ₃ = ${f.ratio.toFixed(1)}${sep ? " · L and M separated" : ""}</p>`);
      if (f.stability) h += `<div title="Mean angle from the average direction over seven intervals 0.5–2× this one, same center (Denton et al. 2018, Table 3)"><p class="tk-l2">Stability over 0.5–2× the interval</p><div class="tk-stab">${["L", "M", "N"].map((ax, i) => `<span><em>${ax}</em><b class="mono${ax === "N" && f.stability[i] > 5 ? " gold" : ""}">±${f.stability[i].toFixed(1)}°</b></span>`).join("")}</div></div>`;
      h += `</div><div class="tk-col"><b class="tk-h2">Axes in GSE</b><table class="tk-axes"><tr><th>Axis</th><th>x</th><th>y</th><th>z</th></tr>${[["L", f.l], ["M", f.m], ["N", f.n]].map(([ax, v]) => `<tr><td>${ax}</td>${v.map(x => `<td>${(x >= 0 ? "+" : "−") + Math.abs(x).toFixed(4)}</td>`).join("")}</tr>`).join("")}</table></div>`;
      h += `<div class="tk-col"><button class="tk-btn" data-act="lmn-adjust" title="Open a draft below — the figure keeps this frame until the new one applies">Adjust method or interval…</button>`
        + `<div class="tk-links">${tk.link("lmn-copy", W.lmn.copied ? "✓ Copied" : "Copy axes", "Copy L/M/N in GSE")}${tk.link("lmn-flipL", "⇆ Flip L", "Reverse L (and M), keeping the frame right-handed")}${tk.link("lmn-flipN", "⇅ Flip N", "Reverse N (and M), keeping the frame right-handed")}</div>`
        + tk.link("", "Save frame…", "In the app: keep this frame for this craft, offered again in any window over its interval", true) + `</div>`;
      const cone = f.cones.every(isFinite) ? tk.note(`N error cone: ±${f.cones[0].toFixed(2)}° toward L, ±${f.cones[1].toFixed(2)}° toward M — noise only, not structure (Khrabrov & Sonnerup 1998)`) : "";
      h += tk.dis("lmndiag", "Diagnostics & source", W.open.has("lmndiag"),
        tk.note(`λ₂/λ₃ = ${f.ratio.toFixed(1)} — ${good ? "normal well determined" : "normal poorly determined"} (≥ 10 is the rule of thumb, Sonnerup & Scheible 1998)`)
        + tk.note(`λ₁/λ₂ = ${f.tangent.toFixed(1)} — ${sep ? "L and M separated" : "L and M mix"}`)
        + tk.note(`λ_L ${f.lambda[0].toPrecision(3)}, λ_M ${f.lambda[1].toPrecision(3)}, λ_N ${f.lambda[2].toPrecision(3)} nT²`) + cone
        + tk.note(f.native ? "From native-cadence FGM." : "From the displayed B — native FGM was unavailable.", !f.native)
        + tk.note(`· ${f.samples} B vectors at ${f.cadence}`)
        + tk.note(`Interval ${clock(f.a, true)}–${clock(f.b, true)} UTC (${durText(f.b - f.a)})`)
        + tk.note("Signs follow N_x ≥ 0, L_z ≥ 0 — natural on the dayside, arbitrary in the tail."));
      return h;
    }
    function renderLMN() {
      if (!W.lmn.panel) return;
      const L = W.lmn, f = L.frame, top = lmnEl.scrollTop;
      let h = `<div class="tk-ph"><b>LMN frame · ${CRAFT[W.n || n0].name}</b>`
        + (f ? `<button class="tk-pill${L.on ? " on" : ""}" data-act="lmn-onoff" title="${L.on ? "The figure is drawn in this LMN frame — click to draw it in GSE, keeping the frame" : "The frame is kept but the figure is in GSE — click to draw it in LMN"}">${L.on ? "LMN ON" : "LMN OFF"}</button>` : "")
        + `<button class="tk-x" data-act="lmn-close" aria-label="Close the LMN frame panel" title="Close the LMN frame panel — an applied frame stays on the figure">×</button></div><div class="tk-pb">`
        + `<div class="tk-row tk-coord"><span class="tk-l2">Figure coordinates</span><b class="mono">${f && L.on ? "LMN" : "GSE"}</b></div>`;
      if (f) {
        h += appliedHTML(f);
        if (L.draft) h += `<p class="tk-note">Draft below · the figure still uses the active frame.</p><div class="tk-card"><div class="tk-row"><b class="tk-h2">Draft</b><span class="tk-sup">· not applied</span>${tk.link("lmn-cancel", "Cancel", "Close the draft; the active frame is unchanged")}</div>${entryHTML()}</div>`;
      } else h += `<div class="tk-col"><p class="tk-title">Create LMN frame</p>${tk.note("No frame applied. Calculate a frame, use a saved one, or enter your axes.")}</div>` + entryHTML();
      lmnEl.innerHTML = h + `</div>`;
      lmnEl.scrollTop = top;
    }
    /** The interval's fields follow its handles without a rebuild of the panel. */
    function lmnTimes() {
      const r = W.lmn.range, s = $('[data-lmn="start"]', lmnEl), e = $('[data-lmn="end"]', lmnEl), d = $(".tk-dur", lmnEl);
      if (!r || !s) return;
      if (document.activeElement !== s) s.value = clock(r[0], true);
      if (document.activeElement !== e) e.value = clock(r[1], true);
      if (d) d.textContent = `${durText(r[1] - r[0])} selected`;
    }
    function applyLMN() {
      const r = W.lmn.range;
      if (!r) return;
      const out = solveMVAB(W.view, r[0], r[1]);
      if (out.error) { W.lmn.error = out.error; renderLMN(); renderSide(); return; }
      Object.assign(W.lmn, { frame: out.frame, on: true, draft: false, error: null, copied: false });
      renderLMN(); renderSide(); redrawCuts(); W.redraw();
    }
    function flip(lAxis) {
      const f = W.lmn.frame, neg = (v) => v.map(x => -x);
      W.lmn.frame = Object.assign({}, f, lAxis ? { l: neg(f.l), m: neg(f.m) } : { n: neg(f.n), m: neg(f.m) });
      renderLMN(); redrawCuts(); W.redraw();
    }

    // ── the tools' actions ──
    function act(name, b) {
      const L = W.lmn;
      switch (name) {
        case "toggle": { const k = b.dataset.key; if (W.open.has(k)) W.open.delete(k); else W.open.add(k); renderSide(); renderLMN(); return; }
        case "paint": W.paint = W.paint === b.dataset.kind ? null : b.dataset.kind; renderSide(); W.redraw(); return;
        case "band-x": W.bands.splice(+b.dataset.i, 1); renderSide(); renderLMN(); W.redraw(); return;
        case "bands-clear": W.bands = []; W.paint = null; renderSide(); renderLMN(); W.redraw(); return;
        case "lmn-close": L.panel = false; L.draft = false; renderSide(); relayout(); return;
        case "lmn-onoff": L.on = !L.on; renderLMN(); renderSide(); redrawCuts(); W.redraw(); return;
        case "lmn-apply": applyLMN(); return;
        case "crescent": W.crescent(); return;
        case "lmn-place": defaultInterval(); renderLMN(); W.redraw(); return;
        case "lmn-painted": { const mp = W.bands.find(x => x.kind === "mpBL"); if (mp) { L.range = [mp.a, mp.b]; renderLMN(); W.redraw(); } return; }
        case "lmn-adjust": L.draft = true; L.range = [L.frame.a, L.frame.b]; renderLMN(); W.redraw(); return;
        case "lmn-cancel": L.draft = false; L.error = null; renderLMN(); W.redraw(); return;
        case "lmn-flipL": flip(true); return;
        case "lmn-flipN": flip(false); return;
        case "lmn-copy": {
          const f = L.frame, txt = [["L", f.l], ["M", f.m], ["N", f.n]].map(([k, v]) => `${k} ${v.map(x => x.toFixed(4)).join(" ")}`).join("\n");
          if (navigator.clipboard) navigator.clipboard.writeText(txt).catch(() => {});
          L.copied = true; renderLMN();
          setTimeout(() => { L.copied = false; renderLMN(); }, 1500);
          return;
        }
      }
    }
    function onTools(e) {
      const b = e.target.closest("[data-tab], [data-act]");
      if (!b || b.disabled) return;
      if (b.dataset.tab) { W.tab = b.dataset.tab; renderSide(); return; }
      if (b.dataset.act) act(b.dataset.act, b);
    }
    side.addEventListener("click", onTools);
    lmnEl.addEventListener("click", onTools);
    function onChange(e) {
      const x = e.target, d = x.dataset, M = MISSIONS[C.mission];
      if (d.fig) {
        if (d.fig === "preset") { if (x.value !== "custom") C.stack = M.presets[+x.value][1].filter(avail); }
        else if (d.fig === "smoothW") C.smoothW = +x.value;
        else C[d.fig] = x.checked;
      } else if (d.kind) {                                 // a subplot back at its canonical place, or off
        const k = d.kind, rank = (q) => { const i = CANON.indexOf(q); return i < 0 ? 99 : i; };
        if (!x.checked) C.stack = C.stack.filter(q => q !== k);
        else if (!C.stack.includes(k)) { const i = C.stack.findIndex(q => rank(q) > rank(k)); C.stack.splice(i < 0 ? C.stack.length : i, 0, k); }
      } else if (d.an === "lmn") {
        W.lmn.panel = x.checked;
        if (x.checked && !W.lmn.range && !W.lmn.frame) defaultInterval();
        if (!x.checked) W.lmn.draft = false;
        renderLMN(); relayout();
      } else if (d.an === "vdf") { W.setVDF(x.checked); return; }
      else if (d.vdf) {
        const V = W.vdf;
        const p = d.vdf === "preset" && VDF_PRESETS.find(q => q.id === x.value);
        if (p) { Object.assign(V, p.v); V.preset = p.id; }
        else if (d.vdf === "preset") return;
        else if (d.vdf === "colors") [V.zlo, V.zhi] = x.value.split(",").map(Number);
        else if (d.vdf === "frame") V.frame = x.value;
        else if (d.vdf === "subtract") V.subtract = x.value === "1";
        else V[d.vdf] = +x.value;
        redrawCuts();
      } else if (d.lmn === "mark") W.lmn.mark = x.checked;
      else if (d.lmn === "start" || d.lmn === "end") {
        const t = parseClock(x.value), r = W.lmn.range;
        if (t === null || !r) { lmnTimes(); return; }
        W.lmn.range = d.lmn === "start" ? [Math.min(t, r[1] - 0.01), r[1]] : [r[0], Math.max(t, r[0] + 0.01)];
        renderLMN();
      }
      renderSide(); renderLMN(); W.redraw();
    }
    side.addEventListener("change", onChange);
    lmnEl.addEventListener("change", onChange);
    side.addEventListener("input", (e) => { if (e.target.dataset.vdf === "sigma") { const u = e.target.nextElementSibling; if (u) u.textContent = +e.target.value > 0 ? `σ ${(+e.target.value).toFixed(1)}` : "off"; } });
    lmnEl.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.matches(".tk-time")) e.target.blur(); });

    // ── the VDF cuts: + Add in the bar, a column per cut (VDFSidePanel) ──
    W.setVDF = async (on) => {
      W.vdf.on = on;
      renderSide(); relayout();
      if (on) await loadCuts(); else renderCuts();
    };
    async function loadCuts() {
      const V = W.vdf;
      V.data = null;
      if (V.on && LIVE && CRAFT[W.n].mission === "mms") V.data = { e: SRC.vdf(W.n, "des"), i: SRC.vdf(W.n, "dis") };
      else if (V.on && (W.n === 2 || W.n === 3)) { const e = await loadVDF(W.n).catch(() => null); V.data = e ? { e } : null; }
      renderCuts();
    }
    /** Where + Add puts a cut (effectiveVdfTime): the last cut's time, else the window's moment while it is on screen,
     *  else the middle of what is. */
    function addTime() {
      const last = W.vdf.cuts[W.vdf.cuts.length - 1], m = host.moment();
      return last ? last.t : m >= A.a && m <= A.b ? m : (A.a + A.b) / 2;
    }
    /** The crescent, set up in one go: MMS2 if the window shows a probe without distributions here, the crescent preset,
     *  cut 1 at the crescent (added if there is none) and the figure ±5 s around it. */
    W.crescent = async () => {
      if (W.n !== 2 && W.n !== 3) await W.setCraft(2);
      if (W.n !== 2 && W.n !== 3) return;
      Object.assign(W.vdf, VDF_PRESETS[1].v, { preset: "burch" });
      if (!W.vdf.on) await W.setVDF(true);
      else if (!W.vdf.data) await loadCuts();
      const t = CRESCENT_T[W.n];
      if (W.vdf.cuts.length) { W.vdf.cuts[0].t = t; renderCuts(); } else W.addCut(t);
      renderSide();
      A.setFocus(t + 0.015 - 5, t + 0.015 + 5);
    };
    W.addCut = (t, sp = "e") => {
      const V = W.vdf, c = { id: ++V.id, t, sp, color: CUT_COLORS[V.cuts.length % CUT_COLORS.length] };
      V.cuts.push(c);
      renderCuts(); relayout();
      return c;
    };
    function moveCut(c, t) {
      if (!c || Math.abs(c.t - t) < 1e-6) return;
      c.t = t;
      drawCut(c); W.redraw();
    }
    function addMenu() {
      const t = addTime(), last = W.vdf.cuts[W.vdf.cuts.length - 1], off = 'disabled title="In the app"';
      return `<p class="pm-h">Add a cut at ${clock(t, true)}</p><button role="menuitem" ${LIVE ? 'data-add="i"' : off}>Ions</button><button role="menuitem" data-add="e">Electrons</button>`
        + [["H", "H⁺"], ["Hepp", "He⁺⁺"], ["He", "He⁺"], ["O", "O⁺"]].map(([k, s]) => `<button role="menuitem" ${!LIVE ? off : k === "Hepp" ? 'disabled title="Helios cuts H⁺, He⁺ and O⁺"' : `data-add="${k}"`}>HPCA ${s}</button>`).join("")
        + `<p class="pm-h">Four-spacecraft ∇fₑ — Vlasov terms (Shuster et al.)</p><button role="menuitem" ${off}>The ∇fₑ terms · in the app</button>`
        + (last ? `<hr><button role="menuitem" data-add="next">Another fₑ electrons cut, 1 s later</button>` : "")
        + (HAS_CRESCENT ? `<hr><button role="menuitem" data-add="crescent" title="${esc(CRESCENT_HELP)}">The Burch et al. 2016 crescent, ${clock(CRESCENT_T[W.n] ?? CRESCENT_T[2], true)}</button>` : "")
        + (W.vdf.cuts.length ? `<hr><button role="menuitem" class="pm-danger" data-add="clear">Remove all cuts</button>` : "");
    }
    if (HAS_CRESCENT) $(".fc-cres", el).addEventListener("click", () => W.crescent());
    $(".fc-menu", el).addEventListener("click", (e) => {
      const b = e.target.closest("[data-add]");
      if (!b) return;
      shut();
      const V = W.vdf, k = b.dataset.add;
      if (k === "e" || k === "i" || HPCA_RECIPE[k]) W.addCut(addTime(), k);
      else if (k === "next") W.addCut(V.cuts[V.cuts.length - 1].t + 1);
      else if (k === "crescent") W.crescent();
      else if (k === "clear") { V.cuts = []; renderCuts(); relayout(); }
    });
    const vdfOpts = () => {
      const V = W.vdf, L = W.lmn, f = L.frame;
      let gsm = null;
      if (V.frame === "gsm" && host.S) {                    // GSE → GSM from the dipole axis at the event (MEC's SM frame)
        const tc = D.m.event.crossing, F = host.S.frames, i = F.t.reduce((b, t, k) => (Math.abs(t - tc) < Math.abs(F.t[b] - tc) ? k : b), 0), m = F.sm[i];
        const y = unit3(cross3([m[2], m[5], m[8]], [1, 0, 0]));
        gsm = [[1, 0, 0], y, cross3([1, 0, 0], y)];
      }
      return { frame: V.frame, lmn: f && L.on ? [f.l, f.m, f.n] : null, gsm, records: V.records, subtract: V.subtract, vmax: V.vmax, sigma: V.sigma };
    };
    const SPN = (c) => (HPCA_RECIPE[c.sp] ? `f ${HPCA_RECIPE[c.sp].name} · HPCA` : c.sp === "i" ? "fᵢ ions" : "fₑ electrons");
    function renderCuts() {
      const V = W.vdf;
      $(".vd-empty", el).hidden = V.cuts.length > 0;
      $(".fc-chips", el).innerHTML = V.cuts.map((c, i) => `<span class="fc-chip" title="${SPN(c)} at ${clock(c.t, true)} — edit in its column, drag its line, or × there to remove"><i style="background:${c.color}">${i + 1}</i>${HPCA_RECIPE[c.sp] ? HPCA_RECIPE[c.sp].name : c.sp === "i" ? "i⁺" : "e⁻"}</span>`).join("");
      cols.innerHTML = V.cuts.map((c, i) => `<div class="vd-col" data-id="${c.id}">
          <div class="vd-head"><span class="vd-n" style="background:${c.color}" title="Cut ${i + 1}: its line on the figure is this color">${i + 1}</span><b class="vd-title">${SPN(c)}</b>
            <input class="vd-time" value="${clock(c.t, true)}" spellcheck="false" aria-label="Cut ${i + 1}'s time" title="This cut's time — click, type HH:mm:ss.fff and press Return" style="--c:${c.color}">
            <button class="vd-step" data-step="-1" aria-label="One record earlier" title="One record earlier">‹</button><button class="vd-step" data-step="1" aria-label="One record later" title="One record later">›</button><button class="vd-x" aria-label="Remove this cut" title="Remove this cut">×</button></div>
          <p class="vd-rec">—</p><p class="vd-note"></p><canvas class="vd-cv" aria-label="Cut ${i + 1}: three plane cuts of the electron distribution"></canvas><p class="vd-msg" hidden></p></div>`).join("");
      V.cuts.forEach(drawCut);
      W.redraw();
    }
    function redrawCuts() { if (W.vdf.on) W.vdf.cuts.forEach(drawCut); }
    function drawCut(c) {
      const box = $(`.vd-col[data-id="${c.id}"]`, cols);
      if (!box) return;
      if (HPCA_RECIPE[c.sp]) return drawHPCACut(c, box);
      const V = W.vdf.data && W.vdf.data[c.sp || "e"], cv = $(".vd-cv", box), msg = $(".vd-msg", box), timeIn = $(".vd-time", box), ion = c.sp === "i";
      if (document.activeElement !== timeIn) timeIn.value = clock(c.t, true);
      const o = vdfOpts(), out = V ? cutFPI(V, c.t, ion ? Object.assign({}, o, { vmax: W.vdf.vmaxI || 1500, sigma: 0 }) : o) : null;
      cv.hidden = !out; msg.hidden = !!out;
      $(".vd-title", box).textContent = out ? `${SPN(c)} · ${out.tag}` : SPN(c);
      $(".vd-rec", box).textContent = out ? `record ${new Date(T0 + out.start * 1000).toISOString().slice(0, 10)}  ${clock(out.start, true)}–${clock(out.end, true).slice(6)} UT` : "—";
      $(".vd-note", box).textContent = out ? out.note : "";
      if (!out && LIVE && V) {                              // live: fetch the distributions around the cut, then draw
        if (!V.covers(c.t)) {
          msg.textContent = `fetching ${ion ? "ion" : "electron"} distributions from CDAWeb…`;
          V.ensure(c.t).then(() => drawCut(c), () => { msg.textContent = "The distributions could not be fetched."; });
        } else msg.textContent = `No FPI-${ion ? "DIS" : "DES"} burst distribution at this time.` + " Burst data come in segments: drag the cut's line into one (the green bar above the figure), or type a time in it.";
        return;
      }
      if (!out) {
        msg.textContent = W.n !== 2 && W.n !== 3
          ? "This demo carries FPI-DES burst distributions for MMS2 and MMS3, 13:07:01.0–03.5 UT: pick one from this window's menu. Helios loads any burst interval, for any probe."
          : V ? "No burst distribution here in this demo: its FPI-DES distributions run 13:07:01.0–03.5 UT. Type a time in that span, or drag the cut's line." : "loading electron distribution…";
        return;
      }
      const dpr = Math.min(window.devicePixelRatio || 1, 2), w = 250, h = 3 * 216;
      cv.width = w * dpr; cv.height = h * dpr; cv.style.width = `${w}px`; cv.style.height = `${h}px`;
      const ctx = cv.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
      let zlo = W.vdf.zlo, zhi = W.vdf.zhi;
      if (ion) { zlo = out.zLo ?? -27; zhi = out.zHi ?? -20; }
      out.slices.forEach((s, k) => drawSlice(ctx, 0, k * 216, w, 216, s, zlo, zhi, W.vdf.contours));
    }
    /** An HPCA cut: the survey half-spin nearest the cut's time, fetched once per time, cut with the species' recipe. */
    function drawHPCACut(c, box) {
      const cv = $(".vd-cv", box), msg = $(".vd-msg", box), timeIn = $(".vd-time", box), R = HPCA_RECIPE[c.sp];
      if (document.activeElement !== timeIn) timeIn.value = clock(c.t, true);
      $(".vd-title", box).textContent = SPN(c);
      const show = (text) => { cv.hidden = true; msg.hidden = false; msg.textContent = text; $(".vd-rec", box).textContent = "—"; $(".vd-note", box).textContent = ""; };
      if (!LIVE || CRAFT[W.n].mission !== "mms") return show("HPCA distributions are fetched live for MMS.");
      // the same half-spin (pyspedas picks the one whose center, sector 0 + 9.375 s, is nearest) needs no new request
      const same = c.hp && c.hp.n === W.n && c.hp.A && !c.hp.A.error && Math.abs(c.t - (c.hp.A.t0 + 9.375)) <= 5;
      if (same) c.hp.t = c.t;
      if (!c.hp || c.hp.t !== c.t || c.hp.n !== W.n) {
        const want = { t: c.t, n: W.n, A: null };
        c.hp = want;
        show(`fetching the HPCA ${R.name} survey half-spin from CDAWeb…`);
        clearTimeout(c.hpTimer);                             // a dragged line asks once it settles
        c.hpTimer = setTimeout(() => SRC.hpcaDist(W.n, c.sp, c.t).then((A) => { if (c.hp === want) { want.A = A; drawCut(c); } }), 300);
        return;
      }
      if (!c.hp.A) return show(`fetching the HPCA ${R.name} survey half-spin from CDAWeb…`);
      if (c.hp.A.error) return show(c.hp.A.error);
      const o = vdfOpts(), key = JSON.stringify([o.frame, o.subtract, o.lmn, o.gsm]);
      if (c.hp.key !== key) { c.hp.out = cutHPCA(c.hp.A, o); c.hp.key = key; }
      const out = c.hp.out;
      cv.hidden = false; msg.hidden = true;
      $(".vd-title", box).textContent = `${SPN(c)} · ${out.tag}`;
      $(".vd-rec", box).textContent = `half-spin ${new Date(T0 + out.start * 1000).toISOString().slice(0, 10)}  ${clock(out.start)}–${clock(out.end).slice(3)} UT`;
      $(".vd-note", box).textContent = out.note;
      const dpr = Math.min(window.devicePixelRatio || 1, 2), w = 250, h = 3 * 216;
      cv.width = w * dpr; cv.height = h * dpr; cv.style.width = `${w}px`; cv.style.height = `${h}px`;
      const ctx = cv.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
      out.slices.forEach((sl, k) => drawSlice(ctx, 0, k * 216, w, 216, sl, out.zLo, out.zHi, 8));
    }
    cols.addEventListener("click", (e) => {
      const b = e.target.closest(".vd-step, .vd-x"), col = e.target.closest(".vd-col");
      if (!b || !col) return;
      const c = W.vdf.cuts.find(x => x.id === +col.dataset.id);
      if (!c) return;
      if (b.classList.contains("vd-x")) { W.vdf.cuts.splice(W.vdf.cuts.indexOf(c), 1); renderCuts(); relayout(); return; }
      moveCut(c, c.t + (HPCA_RECIPE[c.sp] ? 10 : c.sp === "i" ? 0.15 : 0.03) * +b.dataset.step);
    });
    cols.addEventListener("change", (e) => {
      if (!e.target.matches(".vd-time")) return;
      const c = W.vdf.cuts.find(x => x.id === +e.target.closest(".vd-col").dataset.id), t = parseClock(e.target.value);
      if (!c) return;
      if (t === null) { e.target.value = clock(c.t, true); return; }
      moveCut(c, t);
    });
    cols.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.matches(".vd-time")) e.target.blur(); if (e.key === "Escape" && e.target.matches(".vd-time")) e.target.blur(); });

    // ── the bar: the craft and range menus, + Add, the tools button ──
    const menus = $$(".pick-menu", el);
    function shut() { menus.forEach(m => { m.hidden = true; m.previousElementSibling.setAttribute("aria-expanded", "false"); }); }
    for (const m of menus) {
      const btn = m.previousElementSibling;
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const was = m.hidden;
        shut();
        if (was && m.classList.contains("fc-menu")) m.innerHTML = addMenu();
        m.hidden = !was; btn.setAttribute("aria-expanded", String(was));
      });
    }
    document.addEventListener("click", (e) => { if (!el.contains(e.target) || !e.target.closest(".pick-menu, .pick")) shut(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") shut(); });
    $(".fw-pick .pick-menu", el).addEventListener("click", (e) => {
      const o = e.target.closest("[data-n]");
      if (!o) return;
      shut();
      W.setCraft(isNaN(+o.dataset.n) ? o.dataset.n : +o.dataset.n);
    });
    $(".fw-range .pick-menu", el).addEventListener("click", (e) => {
      const o = e.target.closest("[data-m]");
      if (!o) return;
      shut();
      host.setRange(W, +o.dataset.m);
      W.rangeText();
    });
    $(".fw-reset", el).addEventListener("click", () => { if (A.home) { A.setFocus(...A.home); W.rangeText(); } });
    $(".fw-sb", el).addEventListener("click", () => { W.sideOpen = !W.sideOpen; renderSide(); relayout(); });
    W.openTools = (tab) => { W.sideOpen = true; if (tab) W.tab = tab; renderSide(); relayout(); };
    new ResizeObserver(() => W.redraw()).observe($(".fw-main", el));
    W.rangeText();
    W.ready = W.setCraft(n0);
    return W;
  }

  // ───────────────────────── the full-screen HSO screen ─────────────────────────
  /**
   * Helios's HSO screen at full size: the view and its time machine, with data windows that open over it as the app's
   * do (HSOScreen: FloatingPanel + SpacecraftDataPanel). A window opens 540 × 752 pt, cascading 44 pt from the last, on
   * ±30 min around the event; one opened while the time machine is away from the event is pinned to that time.
   */
  function Stage(D, S, stars) {
    const root = $("#stage");
    if (!root) return;
    const ev = D.m.event, body = $("#stage-body"), layer = $("#stage-wins"), dock = $("#stage-dock");
    const wins = [];
    let z = 10, scrubbed = false;

    // the view, and its time bar
    const scene = window.HSOView({
      root: body, S, stars, orbit: D.ctx.orbit, omni: D.ctx.omni, clock, stamp: (t) => `${clock(t).slice(0, 5)} UTC`, ...viewOpts(),
      ...liveClicks((k) => open(k, scrubbed ? scene.time : null), body, () => scene),
      onMMS: (n, t) => open(n, scrubbed ? t : null),
      onOther: (name, t) => {
        const key = representative(name);
        if (!key) return false;
        open(key, scrubbed ? t : null);
        if (name !== CRAFT[key].name) scene.say(`${name}'s data are in Helios; the demo opens ${CRAFT[key].name}, its ${key === "tha" ? "THEMIS" : "Cluster"} example.`);
        return true;
      },
    });
    const tb = $(".hso-time", root), slider = $(".ht-slider", tb), stampEl = $(".ht-stamp", tb), playBtn = $(".ht-play", tb), speedBtn = $(".ht-speed", tb);
    slider.min = ev.span[0]; slider.max = ev.span[1];
    const setTime = (t, scrub) => {
      scrubbed = scrub;
      scene.setTime(t);
      slider.value = t;
      const st = stamp(t), cut = st.lastIndexOf(" · ");
      stampEl.innerHTML = `<span class="d">${st.slice(0, cut + 3)}</span>${st.slice(cut + 3)}`;
    };
    let speed = 600, playing = null;
    const stop = () => { playing = null; playBtn.classList.remove("on"); playBtn.setAttribute("aria-label", "Play"); };
    slider.addEventListener("input", () => { stop(); setTime(+slider.value, true); });
    playBtn.addEventListener("click", () => {
      if (playing) return stop();
      let t = scene.time >= ev.span[1] - 1 ? ev.span[0] : scene.time, last = performance.now();
      const me = {};
      playing = me; playBtn.classList.add("on"); playBtn.setAttribute("aria-label", "Pause");
      const step = (now) => {
        if (playing !== me) return;
        t = Math.min(ev.span[1], t + speed * (now - last) / 1000); last = now;
        setTime(t, true);
        if (t >= ev.span[1]) return stop();
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    speedBtn.addEventListener("click", () => { speed = [10, 60, 600][([10, 60, 600].indexOf(speed) + 1) % 3]; speedBtn.textContent = `${speed}×`; });
    $(".ht-event", tb).addEventListener("click", () => { stop(); setTime(ev.crossing, false); });
    setTime(ev.crossing, false);

    // ── the data windows ──
    const bounds = () => [layer.clientWidth, layer.clientHeight];
    function front(W) { W.el.style.zIndex = ++z; }
    function place(W, r) {
      Object.assign(W.r, r);
      const st = W.el.style;
      st.left = `${W.r.l}px`; st.top = `${W.r.t}px`; st.width = `${W.r.w}px`; st.height = `${W.r.h}px`;
    }
    /** Grow or shrink a window by dw for a side panel, keeping it on the screen. */
    function widen(W, dw) {
      const [bw] = bounds(), w = clamp(W.r.w + dw, 360, bw - 16);
      place(W, { w, l: clamp(W.r.l, 8, Math.max(8, bw - w - 8)) });
      W.redraw();
    }
    function spanOf(pinned, wm, S = ev.span) {              // a window's span: ±wm around its moment, inside the data
      const c = pinned ?? ev.crossing, [S0, S1] = S || ev.span, h = Math.min(wm * 60, (S1 - S0) / 2);
      const a = clamp(c - h, S0, S1 - 2 * h);
      return [a, a + 2 * h];
    }
    function close(W) {
      W.el.remove(); W.pill?.remove();
      wins.splice(wins.indexOf(W), 1);
      if (LIVE) splitHandle();
    }
    const nameOf = (k) => CRAFT[k].name;
    function minimize(W) {
      W.el.hidden = true;
      const p = document.createElement("button");
      p.className = "dock-pill"; p.style.setProperty("--c", CRAFT[W.n || W.want].col);
      p.innerHTML = `<i class="sw"></i>${nameOf(W.n || W.want)}${W.pinned != null ? ` · ${clock(W.pinned).slice(0, 5)}` : ""}`;
      p.setAttribute("aria-label", `Restore the ${nameOf(W.n || W.want)} window`);
      p.addEventListener("click", () => restore(W));
      dock.appendChild(p); W.pill = p;
    }
    function restore(W) {
      if (!W.el.hidden) return;
      W.el.hidden = false; W.pill?.remove(); W.pill = null;
      front(W); W.redraw();
    }
    // ── edge snapping (live; Helios's FloatingPanel.snaps, as macOS tiles windows): drag a window by its bar to the top
    //    edge to fill the screen, to a side for that half, into a corner for that quarter; the tile is outlined while
    //    dragging; dragging it out gives back the size it had; a handle in the seam of two halves moves both ──
    const SNAP_E = 14, SNAP_CORNER = 90, GAP = 8;
    const snapEl = LIVE ? Object.assign(document.createElement("div"), { className: "snap-preview", hidden: true }) : null;
    const splitEl = LIVE ? Object.assign(document.createElement("div"), { className: "snap-split", hidden: true, title: "Drag to share the width between the two windows" }) : null;
    if (LIVE) { layer.appendChild(snapEl); layer.appendChild(splitEl); }
    function snapZone(px, py) {
      const [bw, bh] = bounds(), top = py <= SNAP_E, left = px <= SNAP_E, right = px >= bw - SNAP_E;
      if (left || right) {
        if (py <= SNAP_CORNER) return left ? "topLeft" : "topRight";
        if (py >= bh - SNAP_CORNER) return left ? "bottomLeft" : "bottomRight";
        return left ? "left" : "right";
      }
      return top ? "full" : null;
    }
    function snapRect(z, self) {
      const [bw, bh] = bounds(), W2 = (bw - 3 * GAP) / 2, H2 = (bh - 3 * GAP) / 2;
      if (z === "left" || z === "right") {                 // a half beside a window tiled on the other side takes the room it leaves
        const o = wins.find(w => w !== self && !w.el.hidden && w.snap === (z === "left" ? "right" : "left"));
        if (o) return z === "left" ? { l: GAP, t: GAP, w: Math.max(360, o.r.l - 2 * GAP), h: bh - 2 * GAP }
                                   : { l: o.r.l + o.r.w + GAP, t: GAP, w: Math.max(360, bw - o.r.l - o.r.w - 2 * GAP), h: bh - 2 * GAP };
      }
      return { full: { l: GAP, t: GAP, w: bw - 2 * GAP, h: bh - 2 * GAP }, left: { l: GAP, t: GAP, w: W2, h: bh - 2 * GAP }, right: { l: 2 * GAP + W2, t: GAP, w: W2, h: bh - 2 * GAP },
               topLeft: { l: GAP, t: GAP, w: W2, h: H2 }, topRight: { l: 2 * GAP + W2, t: GAP, w: W2, h: H2 },
               bottomLeft: { l: GAP, t: 2 * GAP + H2, w: W2, h: H2 }, bottomRight: { l: 2 * GAP + W2, t: 2 * GAP + H2, w: W2, h: H2 } }[z];
    }
    function preview(z, self) {
      if (!snapEl) return;
      snapEl.hidden = !z;
      if (!z) return;
      const r = snapRect(z, self);
      Object.assign(snapEl.style, { left: `${r.l}px`, top: `${r.t}px`, width: `${r.w}px`, height: `${r.h}px` });
    }
    /** The handle between a window tiled left and one tiled right. */
    function splitHandle() {
      if (!splitEl) return;
      const L = wins.find(w => !w.el.hidden && w.snap === "left"), R = wins.find(w => !w.el.hidden && w.snap === "right");
      splitEl.hidden = !(L && R);
      if (!L || !R) return;
      const x = (L.r.l + L.r.w + R.r.l) / 2;
      Object.assign(splitEl.style, { left: `${x - 4}px`, top: `${Math.max(L.r.t, R.r.t)}px`, height: `${Math.min(L.r.h, R.r.h)}px`, zIndex: String(z + 1) });
    }
    if (splitEl) splitEl.addEventListener("pointerdown", (e) => {
      const L = wins.find(w => !w.el.hidden && w.snap === "left"), R = wins.find(w => !w.el.hidden && w.snap === "right");
      if (!L || !R) return;
      e.preventDefault(); splitEl.setPointerCapture(e.pointerId); splitEl.classList.add("on");
      const x0 = layer.getBoundingClientRect().left;
      const move = (e2) => {
        const [bw] = bounds(), x = clamp(e2.clientX - x0, GAP + 360 + GAP / 2, bw - GAP - 360 - GAP / 2);
        place(L, { w: x - GAP / 2 - L.r.l }); place(R, { l: x + GAP / 2, w: bw - GAP - (x + GAP / 2) });
        splitHandle();
      };
      const up = () => { splitEl.classList.remove("on"); L.redraw(); R.redraw(); splitEl.removeEventListener("pointermove", move); splitEl.removeEventListener("pointerup", up); splitEl.removeEventListener("pointercancel", up); };
      splitEl.addEventListener("pointermove", move); splitEl.addEventListener("pointerup", up); splitEl.addEventListener("pointercancel", up);
    });
    function open(n, pinned = null, rect = null) {
      const same = wins.find(w => (w.n || w.want) === n && w.pinned === pinned);
      if (same) { restore(same); front(same); if (rect) { place(same, rect); same.redraw(); } return same; }
      const el = document.createElement("div");
      el.setAttribute("role", "dialog");
      layer.appendChild(el);
      const st = { wm: 30 };
      const W = DataWindow(D, n, {
        el, S, pinned, span: () => spanOf(pinned, st.wm), moment: () => pinned ?? ev.crossing, widen: (w, dw) => widen(w, dw),
        setRange: (w, m) => { if (!w.view.span) st.wm = m; const [a, b] = spanOf(pinned, m, w.view.span); w.app.home = [a, b]; w.app.setFocus(a, b); },
      });
      Object.assign(W, { want: n, pinned, r: {}, max: null, pill: null });
      wins.push(W);
      // where it opens: the app's cascade, inside the screen
      const [bw, bh] = bounds(), k = (wins.length - 1) % 6;
      const w = Math.min(540, bw - 16), h = Math.min(752, bh - 16);
      place(W, rect || { l: clamp(55 + 44 * k, 8, bw - w - 8), t: clamp(Math.max(430 + 44 * k - h / 2 - 36, 8), 8, bh - h - 8), w, h });
      front(W);
      // drag the bar to move, the corner to resize; the traffic lights
      const bar = $(".fw-bar", el);
      el.addEventListener("pointerdown", () => front(W));
      bar.addEventListener("pointerdown", (e) => {
        if (e.button !== 0 || e.target.closest("button, input, .pick-menu")) return;
        const s = { x: e.clientX, y: e.clientY, l: W.r.l, t: W.r.t };
        bar.setPointerCapture(e.pointerId); bar.classList.add("dragging");
        let zone = null, out = false;
        const move = (e2) => {
          const [bw2, bh2] = bounds(), R = layer.getBoundingClientRect();
          if (LIVE && W.snap && !out && Math.hypot(e2.clientX - s.x, e2.clientY - s.y) > 4) {
            // out of the tile: the size it had before, the point under the cursor kept under it
            out = true;
            const fx = (s.x - R.left - W.r.l) / W.r.w, pre = W.preSnap || { w: W.r.w, h: W.r.h };
            s.l = s.x - R.left - fx * pre.w;
            place(W, { w: pre.w, h: pre.h }); W.snap = null; W.preSnap = null; W.redraw(); splitHandle();
          }
          place(W, { l: clamp(s.l + e2.clientX - s.x, 90 - W.r.w, bw2 - 90), t: clamp(s.t + e2.clientY - s.y, 0, bh2 - 34) });
          W.max = null;
          if (LIVE) { const z = snapZone(e2.clientX - R.left, e2.clientY - R.top); if (z !== zone) { zone = z; preview(z, W); } }
        };
        const up = () => {
          bar.classList.remove("dragging"); bar.removeEventListener("pointermove", move); bar.removeEventListener("pointerup", up); bar.removeEventListener("pointercancel", up);
          if (!LIVE) return;
          preview(null);
          if (zone) { if (!W.snap) W.preSnap = { w: W.r.w, h: W.r.h }; W.snap = zone; place(W, snapRect(zone, W)); W.redraw(); }
          splitHandle();
        };
        bar.addEventListener("pointermove", move); bar.addEventListener("pointerup", up); bar.addEventListener("pointercancel", up);
      });
      const grip = $(".fw-grip", el);
      grip.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        const s = { x: e.clientX, y: e.clientY, w: W.r.w, h: W.r.h };
        grip.setPointerCapture(e.pointerId);
        const move = (e2) => {
          const [bw2, bh2] = bounds();
          place(W, { w: clamp(s.w + e2.clientX - s.x, 360, bw2 - W.r.l), h: clamp(s.h + e2.clientY - s.y, 300, bh2 - W.r.t) });
          W.max = null; W.snap = null; W.preSnap = null; W.redraw(); splitHandle();
        };
        const up = () => { grip.removeEventListener("pointermove", move); grip.removeEventListener("pointerup", up); grip.removeEventListener("pointercancel", up); };
        grip.addEventListener("pointermove", move); grip.addEventListener("pointerup", up); grip.addEventListener("pointercancel", up);
      });
      $(".tl-c", el).addEventListener("click", () => close(W));
      $(".tl-m", el).addEventListener("click", () => minimize(W));
      if (LIVE) { const z_ = $(".tl-z", el); z_.setAttribute("aria-label", "Open in a new tab"); z_.title = "Open this window in a tab of its own (drag the bar to the top edge to fill the screen)"; }
      $(".tl-z", el).addEventListener("click", () => {
        if (LIVE) return openSolo(W);
        const [bw2, bh2] = bounds();
        if (W.max) { place(W, W.max); W.max = null; } else { W.max = { ...W.r }; place(W, { l: 8, t: 8, w: bw2 - 16, h: bh2 - 16 }); }
        W.redraw();
      });
      return W;
    }

    // ── Compare: +1 opens the next probe beside the open windows, 1–4 opens all four side by side ──
    $(".cmp-plus", root).addEventListener("click", () => {
      const open_ = wins.filter(w => w.pinned === null);
      const n = [1, 2, 3, 4].find(k => !open_.some(w => (w.n || w.want) === k));
      if (!n) return;
      const last = open_[open_.length - 1], [bw] = bounds();
      if (last && last.r.l + 2 * last.r.w + 8 <= bw - 8) open(n, null, { l: last.r.l + last.r.w + 8, t: last.r.t, w: last.r.w, h: last.r.h });
      else open(n);
    });
    $(".cmp-all", root).addEventListener("click", () => {
      const [bw, bh] = bounds(), cols = bw >= 1000 ? 4 : 2, rows = 4 / cols;
      const w = (bw - 16 - (cols - 1) * 8) / cols, h = Math.min(752, (bh - 16 - (rows - 1) * 8) / rows), t0 = cols === 4 ? Math.max(8, (bh - h) / 2) : 8;
      [1, 2, 3, 4].forEach((n, i) => open(n, null, { l: 8 + (i % cols) * (w + 8), t: t0 + Math.floor(i / cols) * (h + 8), w, h }));
    });

    // keep the windows on the screen when it changes size, and the full-screen switch
    new ResizeObserver(() => {
      const [bw, bh] = bounds();
      for (const W of wins) {
        if (W.max) { place(W, { l: 8, t: 8, w: bw - 16, h: bh - 16 }); W.redraw(); continue; }
        if (W.snap) { place(W, snapRect(W.snap, W)); W.redraw(); continue; }
        place(W, { l: clamp(W.r.l, 90 - W.r.w, Math.max(8, bw - 90)), t: clamp(W.r.t, 0, Math.max(0, bh - 34)) });
      }
    }).observe(layer);
    // hso.html#crescent=mms2 (or mms3) opens that probe's window set up at Burch et al.'s crescent (W.crescent)
    function fromHash() {
      const link = /crescent=mms([23])/.exec(location.hash);
      if (!link) return;
      const W = open(+link[1]);
      W.ready.then(() => W.crescent()).then(() => { if (/tools/.test(location.hash)) W.openTools("analysis"); });   // #crescent=mms2&tools also opens the tools
      setTimeout(() => { root.scrollIntoView({ block: "start" }); $("#head")?.classList.add("hidden"); }, 300);   // the header would cover the windows' bars
    }
    fromHash();
    window.addEventListener("hashchange", fromHash);
    const fs = $(".stage-fs", root);
    if (!document.fullscreenEnabled) fs.hidden = true;
    fs.addEventListener("click", () => { if (document.fullscreenElement) document.exitFullscreen(); else root.requestFullscreen().catch(() => {}); });
    document.addEventListener("fullscreenchange", () => {
      const on = document.fullscreenElement === root;
      fs.classList.toggle("on", on); fs.setAttribute("aria-label", on ? "Leave full screen" : "Full screen");
    });
    root.classList.add("ready");
  }

  // ───────────────────────── the workspace ─────────────────────────
  /** What the HSO view needs beyond the scene: the live page has no SDO map yet, and its own day. */
  function viewOpts() {
    const d = new Date(T0 + 7200e3);
    return LIVE ? { sun: null, day: `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`, sky: SRC.sky, leoZoom: true,
                   feet: { epoch: (t) => T0 + t * 1000, worker: "js/fieldlines.js?v=39" } } : {};
  }
  /** Live: a station's daily keogram (UCalgary's summary JPEG, 00–24 UT) over the HSO view, Helios's KeogramPanel in
   *  brief, with a cursor at the view's time; a tab for each network that published one that day. */
  const NET_LABEL = { themis: "THEMIS", rego: "REGO", trexRGB: "TREx RGB", smile: "SMILE" };
  function keogramPanel(host, scene, site) {
    const old = host.querySelector(".kg");
    if (old) old.remove();
    const nets = Object.keys(site.keo || {});
    const el = document.createElement("div");
    el.className = "kg";
    const day = new Date(SRC.at).toISOString().slice(0, 10), dayStart = Date.parse(day + "T00:00:00Z");
    if (!nets.length) {
      el.innerHTML = `<div class="kg-h"><b>${site.code.toUpperCase()}</b><span>${esc(site.name)}</span><button class="kg-x" aria-label="Close">×</button></div><p class="kg-c">No keogram published for ${day}: the camera did not image that night, or UCalgary did not answer.</p>`;
    } else {
      el.innerHTML = `<div class="kg-h"><b>${site.code.toUpperCase()}</b><span>${esc(site.name)} · ${day} · 00–24 UT</span><button class="kg-x" aria-label="Close">×</button></div>
        ${nets.length > 1 ? `<div class="kg-tabs">${nets.map((n, i) => `<button data-net="${esc(n)}" class="${i ? "" : "on"}">${esc(NET_LABEL[n] || n)}</button>`).join("")}</div>` : ""}
        <div class="kg-img"><img alt="${esc(site.name)} keogram" src="${esc(site.keo[nets[0]])}"><i class="kg-cur"></i></div>
        <div class="kg-ax">${[0, 3, 6, 9, 12, 15, 18, 21, 24].map(h => `<span style="left:${h / 24 * 100}%">${String(h).padStart(2, "0")}</span>`).join("")}</div>
        <p class="kg-c">${esc(NET_LABEL[nets[0]] || nets[0])} daily keogram · University of Calgary · the line is the view's time</p>`;
      el.querySelectorAll("[data-net]").forEach(b => b.addEventListener("click", () => {
        el.querySelectorAll("[data-net]").forEach(x => x.classList.toggle("on", x === b));
        el.querySelector("img").src = site.keo[b.dataset.net];
        el.querySelector(".kg-c").textContent = `${NET_LABEL[b.dataset.net] || b.dataset.net} daily keogram · University of Calgary · the line is the view's time`;
      }));
    }
    el.querySelector(".kg-x").addEventListener("click", () => el.remove());
    host.appendChild(el);
    const cur = el.querySelector(".kg-cur");
    const tick = () => {
      if (!el.isConnected) return;
      if (cur) {
        const f = (T0 + scene.time * 1000 - dayStart) / 864e5;
        cur.hidden = f < 0 || f > 1;
        cur.style.left = `${clamp(f, 0, 1) * 100}%`;
      }
      requestAnimationFrame(tick);
    };
    tick();
  }
  /** The live view's extra handlers: Earth opens OMNI, an imager its keogram. */
  function liveClicks(openKey, host, getScene) {
    return LIVE ? { onEarth: () => openKey("idx"), onStation: (site) => keogramPanel(host, getScene(), site) } : {};
  }
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const stamp = (t) => { const d = new Date(T0 + t * 1000); return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()} · ${clock(t).slice(0, 5)} UTC`; };

  /** A window alone in its tab: the data window (?solo=<craft>) filling the page, or the HSO screen (?solo=hso). */
  async function solo(D) {
    const q = new URLSearchParams(location.search), key = /^\d$/.test(SOLO) ? +SOLO : SOLO;
    document.body.classList.add("solo");
    if (SOLO === "hso") { document.body.classList.add("solo-hso"); return false; }
    if (!Object.hasOwn(CRAFT, key)) return false;            // a key from the URL: only the table's own
    document.body.classList.add("solo-win");
    const el = document.createElement("div");
    el.setAttribute("role", "region");
    el.id = "solo-win";
    document.body.appendChild(el);
    const ev = D.m.event, pin = q.has("pin") ? +q.get("pin") : null;
    const span = () => { const a = +q.get("a"), b = +q.get("b"); return isFinite(a) && isFinite(b) && b > a ? [a, b] : [ev.crossing - 1800, ev.crossing + 1800]; };
    const W = DataWindow(D, key, {
      el, S: null, pinned: pin, span, moment: () => pin ?? ev.crossing, widen: (w) => w.redraw(),
      setRange: (w, m) => { const c = (w.app.a + w.app.b) / 2; w.app.home = [c - m * 60, c + m * 60]; w.app.setFocus(c - m * 60, c + m * 60); },
    });
    Object.assign(W, { want: key, pinned: pin, r: {} });
    $(".tl", el).style.display = "none";
    document.title = `${CRAFT[key].name} · ${new Date(SRC.at).toISOString().slice(0, 16).replace("T", " ")} UTC · Helios live`;
    await W.setCraft(key);
    const stack = (q.get("stack") || "").split(",").filter(k => Object.hasOwn(KINDS, k));
    if (stack.length) { W.cfg.stack = stack; }
    const [a, b] = span();
    if (!W.spanned || (q.has("a") && q.has("b"))) { W.app.home = [a, b]; W.app.setFocus(a, b); }
    window.addEventListener("resize", () => W.redraw());
    return true;
  }

  /** The reason for a failed load where it is one of ours to tell (no MMS positions at all for the moment). */
  const why = (e) => (/^No MMS positions/.test(e && e.message) ? ` ${e.message}` : "");
  async function start() {
    const root = $("#app");
    if (!root) return;
    if (SOLO && SOLO !== "hso") {                          // a data window alone: no scene, no workspace
      let D;
      try { D = await load(); } catch (e) {                  // say why when the reason is known (no MMS ephemeris yet for a recent moment)
        const p = Object.assign(document.createElement("p"), { className: "solo-fail" });
        p.textContent = `The data could not be loaded.${why(e)}`;
        document.body.appendChild(p);
        return;
      }
      if (await solo(D)) return;
    }
    if (SOLO === "hso") document.body.classList.add("solo", "solo-hso");
    // the HSO view's scene (Helios's ephemeris cache for the event) and its stars, fetched alongside MMS1's data
    const sceneData = LIVE ? SRC.scene() : Promise.all([fetch(BASE + "scene.json").then(r => r.json()), fetchBuf("stars.bin")]);
    let D, S = null, stars = null;
    try { D = await load(); } catch (e) {
      $("#app-loading").textContent = $("#stage-loading").textContent = LIVE ? `The data could not be loaded.${why(e)}` : "The demo's data could not be loaded.";
      return;
    }
    try { [S, stars] = await sceneData; Stage(D, S, stars); } catch (e) { $("#stage-loading").textContent = "The HSO screen could not load."; }
    try { await loadCraft(D, 1); useCraft(D, 1); } catch (e) { $("#app-loading").textContent = "The demo's data could not be loaded."; return; }
    const ev = D.m.event;
    const app = { a: ev.focus[0], b: ev.focus[1], home: ev.focus.slice(), hover: null, hoverY: null, sel: null };
    let win = null, strip = null, scene = null, todo = new Set();
    const flush = () => {
      if (todo.has("panel")) win.drawNow(); else if (todo.has("over")) win.panel.overlay();
      if (todo.has("strip")) strip.draw();
      todo.clear();
    };
    const schedule = (...k) => { if (!todo.size) requestAnimationFrame(flush); k.forEach(x => todo.add(x)); };
    // the HSO view's time bar: it shows the instant the view draws, and moving it moves the focus window
    const slider = $("#ht-slider"), stampEl = $("#ht-stamp");
    slider.min = ev.span[0]; slider.max = ev.span[1];
    const sceneTime = (t) => {
      if (scene) scene.setTime(t);
      slider.value = t;
      const st = stamp(t), cut = st.lastIndexOf(" · ");
      stampEl.innerHTML = `<span class="d">${st.slice(0, cut + 3)}</span>${st.slice(cut + 3)}`;
      $("#scene-time").textContent = `${clock(t)} UTC`;
    };
    app.setFocus = (a, b) => {
      const [S0, S1] = ev.span, s = clamp(b - a, 2, S1 - S0);
      a = clamp(a, S0, S1 - s); b = a + s;
      app.a = a; app.b = b;
      if (win) win.rangeText();
      schedule("panel", "strip");
      if (app.hover === null) sceneTime((a + b) / 2);
    };
    app.setHover = (t, y) => {
      app.hover = t; app.hoverY = y;
      schedule("over", "strip");
      sceneTime(t === null ? (app.a + app.b) / 2 : t);
    };
    strip = Strip(D, app);
    // the data window: the same window the HSO screen floats, docked beside the view on the workspace's clock
    const winEl = $("#win-panel"), wins = winEl.parentElement;
    win = DataWindow(D, 1, {
      el: winEl, S, app, moment: () => ev.crossing,
      widen: (W) => { wins.classList.toggle("wide", W.extra > 0 || winEl.classList.contains("zoomed")); },
      setRange: (W, m) => { const c = (app.a + app.b) / 2; app.setFocus(c - m * 60, c + m * 60); app.home = [app.a, app.b]; },
      onCraft: (W) => {
        const name = CRAFT[W.n].name;
        $("#tab-craft").textContent = name;
        if (CRAFT[W.n].mission === "mms" && D.n !== W.n) { useCraft(D, W.n); strip.rebuild(); }
        schedule("strip");
      },
    });
    const openPanel = () => {
      winEl.hidden = false; wins.classList.remove("single"); $("#scene-hint").hidden = true;
      winEl.classList.remove("flash"); void winEl.offsetWidth; winEl.classList.add("flash");
      win.redraw();
    };
    const hidePanel = () => { winEl.hidden = true; wins.classList.add("single"); $("#scene-hint").hidden = false; };
    $(".tl-c", winEl).addEventListener("click", hidePanel);
    $(".tl-m", winEl).addEventListener("click", hidePanel);
    if (LIVE) { const z_ = $(".tl-z", winEl); z_.setAttribute("aria-label", "Open in a new tab"); z_.title = "Open this window in a tab of its own"; }
    $(".tl-z", winEl).addEventListener("click", () => {
      if (LIVE) return openSolo(win);
      winEl.classList.toggle("zoomed"); wins.classList.toggle("wide", win.extra > 0 || winEl.classList.contains("zoomed")); win.redraw();
    });
    // live: the HSO view's green light opens the HSO screen alone in a tab
    const hsoZ = LIVE && $("#win-hso .dots i:nth-child(3)");
    if (hsoZ) {
      hsoZ.classList.add("dot-z"); hsoZ.title = "Open the HSO screen in a tab of its own";
      hsoZ.addEventListener("click", () => { const u = new URL(location.href); u.searchParams.set("solo", "hso"); window.open(u.toString(), "_blank", "noopener"); });
    }
    // the HSO view: Helios's Magnetosphere rung, drawn by hsoview.js
    try {
      if (!S) throw new Error("no scene");
      scene = window.HSOView({
        root: $("#scene-body"), S, stars, orbit: D.ctx.orbit, omni: D.ctx.omni, clock, stamp: (t) => `${clock(t).slice(0, 5)} UTC`, ...viewOpts(),
        ...liveClicks((k) => { openPanel(); win.setCraft(k); }, $("#scene-body"), () => scene),
        onMMS: (n) => { openPanel(); win.setCraft(n); },
        onOther: (name) => {
          const key = representative(name);
          if (!key) return false;
          openPanel(); win.setCraft(key);
          if (name !== CRAFT[key].name) scene.say(`${name}'s data are in Helios; the demo opens ${CRAFT[key].name}, its ${key === "tha" ? "THEMIS" : "Cluster"} example.`);
          return true;
        },
        onRung: (k) => { $("#win-hso .win-title").textContent = `HSO view · ${{ leo: "LEO", mag: "Magnetosphere", moon: "Moon", l1: "L1", sun: "Sun" }[k]}`; },
      });
    } catch (e) {
      $("#scene-body").insertAdjacentHTML("beforeend", '<p class="scene-fail">The HSO view could not load.</p>');
    }
    if (!LIVE) fetch(BASE + "topology.json").then(r => r.json()).then(d => scene && scene.setTopology(d)).catch(() => {});
    // the View menu: field topology and the boundaries
    const viewBtn = $("#view-btn"), viewMenu = $("#view-menu");
    const shutView = () => { viewMenu.hidden = true; viewBtn.setAttribute("aria-expanded", "false"); };
    viewBtn.addEventListener("click", (e) => { e.stopPropagation(); viewMenu.hidden = !viewMenu.hidden; viewBtn.setAttribute("aria-expanded", String(!viewMenu.hidden)); });
    document.addEventListener("click", (e) => { if (!e.target.closest(".viewmenu")) shutView(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") shutView(); });
    $$("#view-menu input[data-view]").forEach(box => box.addEventListener("change", () => {
      if (scene) scene.setView(box.dataset.view, box.checked);
      if (box.dataset.view === "topo") $("#scene-key").hidden = !box.checked;
    }));
    // the time bar: drag to move through the day, or play it at 10, 60 or 600 times real time
    const playBtn = $("#ht-play"), speedBtn = $("#ht-speed"), SPEEDS = [10, 60, 600];
    let speed = 600, playing = null;
    const half = () => (app.b - app.a) / 2;
    const moveTo = (t) => { const h = half(); app.setFocus(t - h, t + h); };
    const stop = () => { playing = null; playBtn.classList.remove("on"); playBtn.setAttribute("aria-label", "Play"); };
    slider.addEventListener("input", () => { stop(); moveTo(+slider.value); });
    playBtn.addEventListener("click", () => {
      if (playing) return stop();
      if ((app.a + app.b) / 2 >= ev.span[1] - half() - 1) moveTo(ev.span[0] + half());
      const me = {};
      playing = me; playBtn.classList.add("on"); playBtn.setAttribute("aria-label", "Pause");
      let last = performance.now();
      const step = (now) => {
        if (playing !== me) return;
        const c = (app.a + app.b) / 2 + speed * (now - last) / 1000;
        last = now;
        moveTo(c);
        if (c >= ev.span[1] - half()) return stop();
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    speedBtn.addEventListener("click", () => { speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]; speedBtn.textContent = `${speed}×`; });
    $("#ht-event").addEventListener("click", () => { stop(); moveTo(ev.crossing); });
    new ResizeObserver(() => { strip.rebuild(); schedule("panel"); }).observe($(".app-main"));
    await win.ready;
    root.classList.add("ready");
    app.setFocus(app.a, app.b);
    sceneTime(ev.crossing);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
