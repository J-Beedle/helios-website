/* The demo's HSO view, drawn the way Helios draws its Magnetosphere rung (MMSTrackerMac/Hero/SITLOrbitView.swift,
 * HeroOrbitCanvas, and MMSTrackerCore's MagnetosphereModel): the same projection and framing, the Lin et al. (2010)
 * magnetopause with the Petrinec & Russell (1996) tail and the Jelínek et al. (2012) bow shock from OMNI at each
 * minute, the fleet from Helios's own ephemeris cache for the event, the star sky, and the app's markers, captions,
 * rulers and insets. The field topology is the demo's own, until the app has it.
 */
(function () {
  "use strict";

  const TAU = 2 * Math.PI, DEG = Math.PI / 180;
  const MONO = 'ui-monospace, "SF Mono", Menlo, "IBM Plex Mono", monospace';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rgba = (c, a = 1) => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
  const mul = (m, v) => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];

  // the app's palette (DesignSystem.swift, FleetObject.swift)
  const DS = { well: 0x050506, screenAlt: 0x0B0B0E, elevated: 0x16161A, gold: 0xFFC44D, green: 0x34D27B, textBright: 0xE3E3EB,
               textSecondary: 0xAEAEB6, textSecondary2: 0x919199, textMuted: 0x6C6C74, accentLight: 0xB4B4C4, hairline: 0xF0F0FA };
  const CAT = { moon: 0xB8B8B8, artemis: 0xC59CFF, l1: 0xFFC44D, goes: 0x34D27B, arase: 0xFF9E3D, cluster: 0x7FE3A1,
                tracers: 0x4FD8E8, sdo: 0xFFE27A, rbsp: 0xFF7FA8, geotail: 0x9FB3C8 };
  const THEMIS = { A: 0xFF74C4, D: 0xC59CFF, E: 0x6FE0FF };
  const PROBE = { 1: 0xEBEBEB, 2: 0xED7821, 3: 0x128C66, 4: 0x4FA8ED };
  const PLANET = { Mercury: [0x9AA6B8, "☿"], Venus: [0xE8C97A, "♀"], Mars: [0xE07A55, "♂"], Jupiter: [0xD9A066, "♃"] };
  const HELIO = { Juno: 0xF2C572, MAVEN: 0xFF9C7A };
  const NET = { themis: 0x6CF0A8, rego: 0xFF6E6E, trexRGB: 0x7CC8FF, smile: 0xC8A2FF };
  const NET_NAME = { themis: "THEMIS", rego: "REGO", trexRGB: "TREx", smile: "SMILE" };
  const CRAFT_RISE = 15, GROUP_RISE = 34;

  // ───────────────────────── the boundaries (MagnetosphereModel.swift) ─────────────────────────
  const pressure = (p) => (isFinite(p) && p > 0 ? Math.max(p, 0.01) : 2.0);
  const aberration = (v) => Math.atan(29.78 / (isFinite(v) ? clamp(v, 200, 1200) : 400));
  const aberrate = (p, d) => { const c = Math.cos(d), s = Math.sin(d); return [p[0] * c + p[1] * s, -p[0] * s + p[1] * c, p[2] || 0]; };
  const deaberrate = (p, d) => { const c = Math.cos(d), s = Math.sin(d); return [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]]; };
  const shueR = (th, r0, al) => r0 * Math.pow(2 / Math.max(1 + Math.cos(th), 1e-9), al);

  function mach(v, n, b, T) {
    if (!(v > 0 && n > 0 && b > 0)) return 8;
    const vA = 21.8 * b / Math.sqrt(n), t = (isFinite(T) ? Math.max(T, 1e3) : 1e5) + 1.2e5;
    const cs = Math.sqrt(5 / 3 * 8254 * t) / 1000, m = v / Math.sqrt(vA * vA + cs * cs);
    return isFinite(m) ? clamp(m, 2, 30) : 8;
  }

  // Jelínek et al. (2012), an open paraboloid blended into the Mach cone past x = −30
  const paraRho = (x, R, lam) => Math.sqrt(4 * R * (R - x)) / lam;
  function bsRho(x, B) {
    const R = B.bsR0, lam = B.lam;
    if (x > R) return null;
    const xb = Math.min(-30, R - 1);
    if (!(x < xb)) return paraRho(x, R, lam);
    const m = Math.max(B.mach, 1.5), sM = 1 / Math.sqrt(m * m - 1);
    const rhoB = paraRho(xb, R, lam), sJ = 2 * R / (lam * Math.sqrt(4 * R * (R - xb))), L = 30;
    return rhoB + sM * (xb - x) + (sJ - sM) * L * (1 - Math.exp((x - xb) / L));
  }
  function bsRadius(th, B) {
    const R = B.bsR0, c = Math.cos(th), s = Math.sin(th);
    const d = c + Math.sqrt(c * c + B.lam * B.lam * s * s), rPar = d > 1e-9 ? 2 * R / d : Infinity;
    if (!isFinite(rPar) || !(rPar * c < Math.min(-30, R - 1))) return rPar;
    const f = (r) => r * s - (bsRho(r * c, B) ?? 0);
    let lo = 0, hi = 4000;
    if (!(f(hi) > 0)) return Infinity;
    for (let i = 0; i < 60; i++) { const mid = 0.5 * (lo + hi); if (f(mid) < 0) lo = mid; else hi = mid; }
    return 0.5 * (lo + hi);
  }
  function bsOutline(B, tail = 260, nF = 240, nT = 200) {
    const up = [];
    for (let i = 0; i <= nF; i++) { const th = Math.PI / 2 * i / nF, r = bsRadius(th, B); up.push([r * Math.cos(th), r * Math.sin(th)]); }
    const dxDay = (2 * B.bsR0 / B.lam) * (Math.PI / 2) / nF;
    const pw = clamp(Math.log(tail / Math.max(dxDay, 1e-6)) / Math.log(nT), 1, 3);
    for (let i = 1; i <= nT; i++) {
      const x = -tail * Math.pow(i / nT, pw), rho = bsRho(x, B);
      if (rho !== null) up.push([x, rho]);
    }
    return up.slice().reverse().map(([x, y]) => [x, -y]).concat(up);
  }

  // Petrinec & Russell (1996): the tail's flaring and its asymptotic radius
  const PR = {
    rT: (p) => 14.63 * Math.pow(p.pd / 2.1, -1 / 6),
    sin2(x, p) {
      const coef = p.bz >= 0 ? 0.00137 : 0.006644, amp = Math.min(2.98 * Math.pow(p.pd, -0.524) * (0.152 - coef * p.bz), 0.25);
      return clamp(amp * Math.exp(0.085 * x), 0, 1);
    },
    flare: (x, p) => (2 / 0.085) * (Math.asin(Math.sqrt(PR.sin2(0, p))) - Math.asin(Math.sqrt(PR.sin2(Math.min(0, x), p)))),
    asym(p) { const r = PR.rT(p) + (2 / 0.085) * Math.asin(Math.sqrt(PR.sin2(0, p))); return isFinite(r) ? clamp(r, 16, 44) : 28; },
  };
  function seam(x, rhoT, alpha, slope) {
    if (!(x < 0) || !isFinite(x) || !isFinite(slope)) return 0;
    const dm = -alpha - slope;
    return Math.abs(dm) > 1e-9 ? dm * x * Math.exp(x / clamp(rhoT, 6, 20)) : 0;
  }
  function tailRho(x, rhoT, rhoInf, alpha, pr) {
    let base, slope;
    if (pr) {
      base = Math.min(rhoT + PR.flare(x, pr), Math.max(PR.asym(pr), rhoT));
      slope = PR.flare(-1e-4, pr) / -1e-4;
    } else {
      base = rhoInf - (rhoInf - rhoT) / Math.pow(1 + Math.max(0, -x) / 45, 1.3);
      slope = -(rhoInf - rhoT) * 1.3 / 45;
    }
    return Math.max(base + seam(x, rhoT, alpha, slope), rhoT);
  }

  // Lin et al. (2010): the 3-D magnetopause, its dawn–dusk and north–south asymmetry and the cusps
  const LA = [12.544, -0.194, 0.305, 0.0573, 2.178, 0.0571, -0.999, 16.473, 0.00152, 0.382, 0.0431, -0.00763, -0.210, 0.0405,
              -4.430, -0.636, -2.600, 0.832, -5.328, 1.103, -0.907, 1.450];
  const Lin = {
    pm: (bt) => { const b = isFinite(bt) ? bt : 5; return 3.979e-4 * b * b; },
    ptot: (p) => pressure(p.pd + p.pm),
    r0: (p) => LA[0] * Math.pow(Lin.ptot(p), LA[1]) * (1 + LA[2] * (Math.exp(LA[3] * p.bz) - 1) / (Math.exp(LA[4] * p.bz) + 1)),
    radius(th, phi, p) {
      const a = LA, b0 = a[6] + a[7] * (Math.exp(a[8] * p.bz) - 1) / (Math.exp(a[9] * p.bz) + 1);
      const beta = b0 + a[10] * Math.cos(phi) + (a[11] + a[12] * p.tilt) * Math.sin(phi) + a[13] * Math.sin(phi) ** 2;
      const f = Math.pow(Math.max(Math.cos(th / 2) + a[5] * Math.sin(2 * th) * (1 - Math.exp(-th)), 1e-6), beta);
      const cncs = a[14] * Math.pow(Lin.ptot(p), a[15]);
      const dn = a[16] + a[17] * p.tilt + a[18] * p.tilt * p.tilt, ds = a[16] - a[17] * p.tilt + a[18] * p.tilt * p.tilt;
      const thN = a[19] + a[20] * p.tilt, thS = a[19] - a[20] * p.tilt;
      const xiN = Math.acos(clamp(Math.cos(th) * Math.cos(thN) + Math.sin(th) * Math.sin(thN) * Math.cos(phi - Math.PI / 2), -1, 1));
      const xiS = Math.acos(clamp(Math.cos(th) * Math.cos(thS) + Math.sin(th) * Math.sin(thS) * Math.cos(phi - 3 * Math.PI / 2), -1, 1));
      return Lin.r0(p) * f + cncs * Math.exp(dn * Math.pow(xiN, a[21])) + cncs * Math.exp(ds * Math.pow(xiS, a[21]));
    },
  };
  /** One edge of Lin's surface at azimuth phi, nose to terminator, then the tail (P&R) to 260 R_E. */
  function linEdge(phi, sign, B, tail = 260) {
    const prof = [], nF = 240, nT = 200;
    for (let i = 0; i <= nF; i++) { const th = Math.PI / 2 * i / nF, r = Lin.radius(th, phi, B.lin); prof.push([r * Math.cos(th), sign * r * Math.sin(th)]); }
    const last = prof[nF], prev = prof[nF - 1], rhoT = Math.abs(last[1]), dx = last[0] - prev[0];
    const alphaEff = Math.abs(dx) > 1e-9 ? -(Math.abs(last[1]) - Math.abs(prev[1])) / dx : 0;
    const pw = clamp(Math.log(tail / Math.max(rhoT * (Math.PI / 2) / nF, 1e-6)) / Math.log(nT), 1, 3);
    for (let i = 1; i <= nT; i++) { const x = -tail * Math.pow(i / nT, pw); prof.push([x, sign * tailRho(x, rhoT, B.rhoInf, alphaEff, B.pr)]); }
    return prof;
  }
  const linOutline = (phiA, phiB, B) => linEdge(phiA, 1, B).concat(linEdge(phiB, -1, B).reverse());

  /** Shue's and Jelínek's parameters, Lin's drivers and the P&R tail for one minute of OMNI. */
  function boundary(w, tilt) {
    const Dp = w.n > 0 && w.v > 0 ? 2e-6 * w.n * w.v * w.v : NaN;
    const dp = pressure(isFinite(Dp) ? Dp : 2.0), bz = isFinite(w.bz) ? w.bz : 0;
    const B = {
      dp, bz, south: bz < 0, lam: 1.17, ab: aberration(w.v), mach: mach(w.v, w.n, w.bt, NaN),
      mpR0: (10.22 + 1.29 * Math.tanh(0.184 * (bz + 8.14))) * Math.pow(dp, -1 / 6.6),
      mpAlpha: Math.max((0.58 - 0.007 * bz) * (1 + 0.024 * Math.log(dp)), 0.05),
      bsR0: 15.02 * Math.pow(dp, -1 / 6.55),
      lin: { pd: dp, pm: Lin.pm(w.bt), bz, tilt },
      pr: { pd: Math.max(dp, 0.1), bz },
    };
    B.rhoInf = PR.asym(B.pr);
    B.key = [B.dp, B.bz, B.ab, B.mach, B.lin.pm, tilt].map(v => v.toFixed(4)).join("|");
    return B;
  }
  /** Where a GSE position sits against the boundaries (RegionLocator.swift). */
  function region(p, B) {
    const m = deaberrate(p, B.ab), r = len3(m);
    if (r <= 0.5) return ["—", DS.textSecondary];
    const th = Math.acos(clamp(m[0] / r, -1, 1)), rmp = shueR(th, B.mpR0, B.mpAlpha), rbs = bsRadius(th, B);
    if (r > rbs + 1) return ["Solar wind", 0x9FB0D0];
    if (r > rbs - 1) return ["Bow shock", 0x34D27B];
    if (r > rmp + 1) return ["Magnetosheath", 0x5B8CFF];
    if (r > rmp - 1) return ["Magnetopause", 0xFFC44D];
    const deg = th * 180 / Math.PI;
    if (r < 4.5) return ["Inner magnetosphere", 0x9FC0FF];
    if (deg < 60) return ["Dayside magnetosphere", 0x9FC0FF];
    if (deg > 120) return [Math.abs(m[2]) > 4 ? "Magnetotail lobe" : "Plasma sheet", 0xFF8C4D];
    return ["Magnetosphere", 0x9FC0FF];
  }

  // ───────────────────────── OMNI, a minute at a time (OmniClient.minuteSamples) ─────────────────────────
  function Winds(om) {
    const n = om.t.length, t = Array.from(om.t);
    // each quantity from the nearest minute that has it, up to 30 minutes away
    const fill = (src) => {
      const out = new Float64Array(n).fill(NaN);
      let prev = -1;
      const before = new Int32Array(n);
      for (let i = 0; i < n; i++) { if (isFinite(src[i])) prev = i; before[i] = prev; }
      let next = -1;
      for (let i = n - 1; i >= 0; i--) {
        if (isFinite(src[i])) next = i;
        let best = -1;
        for (const j of [before[i], next]) if (j >= 0 && Math.abs(t[j] - t[i]) <= 1800 && (best < 0 || Math.abs(t[j] - t[i]) < Math.abs(t[best] - t[i]))) best = j;
        if (best >= 0) out[i] = src[best];
      }
      return out;
    };
    const q = { v: fill(om.v), n: fill(om.n), bz: fill(om.bz), by: fill(om.by), bt: fill(om.b) };
    const idx = [];
    for (let i = 0; i < n; i++) if (isFinite(q.v[i]) || isFinite(q.bz[i])) idx.push(i);
    const ts = idx.map(i => t[i] + 30);                     // the sample is the minute's middle
    return {
      at(tt) {
        if (!idx.length) return { v: NaN, n: NaN, bz: NaN, by: NaN, bt: NaN, t: tt };
        let lo = 0, hi = ts.length - 1;
        while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ts[m] <= tt) lo = m; else hi = m; }
        const k = Math.abs(ts[hi] - tt) < Math.abs(ts[lo] - tt) ? hi : lo, i = idx[k];
        return { v: q.v[i], n: q.n[i], bz: q.bz[i], by: q.by[i], bt: q.bt[i], t: ts[k], gap: Math.abs(ts[k] - tt) };
      },
    };
  }

  function lerpTrack(ts, ps, t) {
    const n = ts.length;
    if (!n) return null;
    if (t <= ts[0]) return ps[0];
    if (t >= ts[n - 1]) return ps[n - 1];
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ts[m] <= t) lo = m; else hi = m; }
    const f = (t - ts[lo]) / (ts[hi] - ts[lo]);
    return [0, 1, 2].map(i => ps[lo][i] + (ps[hi][i] - ps[lo][i]) * f);
  }

  // ───────────────────────── the view ─────────────────────────
  /**
   * o: { root (the view's box), S (scene.json), stars (ArrayBuffer), orbit ({t, r} MMS1, MEC), omni,
   *      clock(t) → "HH:MM:SS", stamp(t) → the hover card's time, onMMS(n, t) (open probe n's data at the view's time),
   *      onOther(name, t) → true where the host opened that spacecraft's data, onRung(key) }
   */
  window.HSOView = function HSOView(o) {
    const root = o.root, cv = root.querySelector("canvas"), S = o.S;
    const card = root.querySelector(".hso-card"), toast = root.querySelector(".hso-toast"), swBox = root.querySelector(".hso-sw");
    const winds = Winds(o.omni);
    const show = { topo: false, mp: true, bs: true };
    const view = { az: 0, tilt: 0 };
    let time = S.epoch, hover = null, rings = [], formDots = [], P = null, anim = null;

    // the stars, already in GSE: unit vector (int16 × 3), V as (V + 2) × 25, color
    const nStars = o.stars.byteLength / 10, sv = new DataView(o.stars);
    const stars = new Float32Array(nStars * 7);
    for (let i = 0; i < nStars; i++) {
      const b = i * 10;
      stars.set([sv.getInt16(b, true) / 32767, sv.getInt16(b + 2, true) / 32767, sv.getInt16(b + 4, true) / 32767,
                 sv.getUint8(b + 6) / 25 - 2, sv.getUint8(b + 7) / 255, sv.getUint8(b + 8) / 255, sv.getUint8(b + 9) / 255], i * 7);
    }

    // MMS: the full ±43 h track frames the view; one period of it is drawn
    const trackT = S.mms.t, trackP = S.mms.p, loopPts = trackP.slice(S.mms.loop[0], S.mms.loop[1] + 1);
    const box = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
    for (const p of trackP) { box.minX = Math.min(box.minX, p[0]); box.maxX = Math.max(box.maxX, p[0]); box.minY = Math.min(box.minY, p[1]); box.maxY = Math.max(box.maxY, p[1]); }
    const O = o.orbit, orbitAt = (t) => {
      const n = O.t.length;
      let i = 1;
      while (i < n - 1 && O.t[i] < t) i++;
      const f = clamp((t - O.t[i - 1]) / (O.t[i] - O.t[i - 1]), 0, 1);
      return [0, 1, 2].map(k => O.r[(i - 1) * 3 + k] + (O.r[i * 3 + k] - O.r[(i - 1) * 3 + k]) * f);
    };
    // the Earth's drawn radius: just inside the lowest perigee on the figure (drawEarth)
    let perigee = Math.min(...trackP.map(len3));
    for (const f of S.fleet) {
      if (f.cat === "moon" || f.cat === "l1") continue;
      const m = Math.min(...f.orbit.map(len3));
      if (m > 0.2) perigee = Math.min(perigee, m);
      if (len3(f.pos) > 0.2) perigee = Math.min(perigee, len3(f.pos));
    }
    const earthRE = clamp(perigee - 0.30, 0.55, 1.0);

    // the frames from MEC: GEO and SM in GSE every 5 minutes
    const frameAt = (name, t) => {
      const F = S.frames, n = F.t.length;
      let i = 1;
      while (i < n - 1 && F.t[i] < t) i++;
      const f = clamp((t - F.t[i - 1]) / (F.t[i] - F.t[i - 1]), 0, 1), a = F[name][i - 1], b = F[name][i];
      return a.map((v, k) => v + (b[k] - v) * f);
    };
    const tiltAt = (t) => Math.asin(clamp(frameAt("sm", t)[2], -1, 1));

    // ── the boundaries for the minute on screen, kept until the wind changes ──
    let G = null;
    function geometry(t) {
      const w = winds.at(t), B = boundary(w, tiltAt(w.t));
      if (G && G.B.key === B.key) return G;
      const bs = bsOutline(B).map(p => aberrate(p, B.ab)), mp = linOutline(0, Math.PI, B).map(p => aberrate(p, B.ab));
      G = { B, w, bs, mp, wire: null, ghosts: [] };
      for (const [dt, a] of [[-3600, 0.55], [-7200, 0.30]]) {
        const gw = winds.at(t + dt);
        if (!(gw.gap < 5400)) continue;
        const gb = boundary(gw, tiltAt(gw.t));
        G.ghosts.push({ alpha: a, pts: linOutline(0, Math.PI, gb).map(p => aberrate(p, gb.ab)) });
      }
      clipTopology();
      return G;
    }
    function wireframe() {
      if (G.wire) return G.wire;
      const B = G.B, psis = [1, 2, 3, 4, 5].map(k => k * Math.PI / 6), xs = [-20, -70, -130];
      const ring = (x, rho) => Array.from({ length: 49 }, (_, i) => aberrate([x, rho * Math.cos(TAU * i / 48), rho * Math.sin(TAU * i / 48)], B.ab));
      const rhoT = shueR(Math.PI / 2, B.mpR0, B.mpAlpha);
      const bso = bsOutline(B);
      G.wire = {
        mp: psis.map(psi => linOutline(psi, psi + Math.PI, B).map(([x, r]) => aberrate([x, r * Math.cos(psi), r * Math.sin(psi)], B.ab))),
        mpRings: xs.map(x => [x, ring(x, tailRho(x, rhoT, B.rhoInf, B.mpAlpha, B.pr))]),
        bs: psis.map(psi => bso.map(([x, r]) => aberrate([x, r * Math.cos(psi), r * Math.sin(psi)], B.ab))),
        bsRings: xs.map(x => [x, bsRho(x, B)]).filter(([, r]) => r !== null).map(([x, r]) => [x, ring(x, r)]),
      };
      return G.wire;
    }

    // ── the field topology (the demo's own): traced lines, cut where they leave the drawn magnetopause ──
    let topo = null, topoSegs = null;
    function insideMP(p, B, tails) {
      const m = deaberrate(p, B.ab), r = len3(m);
      if (r < 1e-6) return true;
      const th = Math.acos(clamp(m[0] / r, -1, 1)), phi = Math.atan2(m[2], m[1]);
      if (th <= Math.PI / 2) return r < Lin.radius(th, phi, B.lin);
      const k = Math.round(((phi + TAU) % TAU) / TAU * 72) % 72, e = tails[k];
      return Math.hypot(m[1], m[2]) < tailRho(m[0], e.rhoT, B.rhoInf, e.alpha, B.pr);
    }
    function clipTopology() {
      topoSegs = null;
      if (!topo || !G) return;
      const B = G.B, tails = [];
      for (let k = 0; k < 72; k++) {                      // each azimuth's terminator and slope, as linEdge finds them
        const phi = k / 72 * TAU, n = 240, r1 = Lin.radius(Math.PI / 2, phi, B.lin), th0 = Math.PI / 2 * (n - 1) / n, r0 = Lin.radius(th0, phi, B.lin);
        const dx = 0 - r0 * Math.cos(th0);
        tails.push({ rhoT: r1, alpha: Math.abs(dx) > 1e-9 ? -(r1 - r0 * Math.sin(th0)) / dx : 0 });
      }
      topoSegs = { closed: [], open: [] };
      for (const l of topo.lines) {
        const out = l.topology === "closed" ? topoSegs.closed : topoSegs.open, p = l.p;
        let run = [];
        for (let i = 0; i + 2 < p.length; i += 3) {
          const q = [p[i], p[i + 1], p[i + 2]];
          if (insideMP(q, B, tails)) run.push(q);
          else { if (run.length > 1) out.push(run); run = []; }
        }
        if (run.length > 1) out.push(run);
      }
    }

    // ── the zoom rungs (HeroZoom): the Magnetosphere fits MMS's track and the magnetosphere; Moon, L1 and Sun are boxes
    //    about their centers with a 4 % margin; LEO looks at the Earth through an Earth-fixed, north-up camera ──
    const AU = S.solar ? S.solar.au_RE : 23455;
    const RUNGS = {
      leo: { center: [0, 0, 0], extent: [1.30, 1.30] },
      mag: null,
      moon: { center: [0, 0, 0], extent: [68, 66] },
      l1: { center: [90, 0, 0], extent: [236, 95] },
      sun: { center: [AU, 0, 0], extent: [1.78 * AU, 1.78 * AU] },
    };
    let rung = "mag", zoomFrom = null;
    const leoCam = { lat: 57, lon: -102 };                // LEOCamera.earthHome
    function leoBasis() {
      const M = frameAt("geo", time), la = leoCam.lat * DEG, lo = leoCam.lon * DEG;
      const n = mul(M, [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)]);
      const east = mul(M, [-Math.sin(lo), Math.cos(lo), 0]);
      const north = mul(M, [-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la)]);
      return { right: east, down: north.map(x => -x), toward: n };
    }
    function framing(W, fh) {
      const R = RUNGS[rung];
      if (R) return { scale: Math.min(W * 0.92 / (2 * R.extent[0]), fh * 0.92 / (2 * R.extent[1])), c: R.center };
      const m = 0.14;
      const minX = Math.min(16, 0, -2, box.minX), maxX = Math.max(16, 0, -2, box.maxX);
      const minY = Math.min(-15, box.minY), maxY = Math.max(15, box.maxY);
      const cy = (minY + maxY) / 2, maxAbsX = Math.max(Math.abs(minX), Math.abs(maxX), 1), spanY = Math.max(maxY - minY, 1);
      return { scale: Math.min(W * (1 - 2 * m) / (2 * maxAbsX), fh * (1 - 2 * m) / spanY), c: [0, cy, 0] };
    }
    function project(W, H, top) {
      const fh = Math.max(100, H - top);
      let { scale, c } = framing(W, fh);
      if (zoomFrom) {                                       // a change of rung, eased over 0.45 s
        const u = clamp((performance.now() - zoomFrom.t0) / 450, 0, 1), e = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
        scale = Math.exp(Math.log(zoomFrom.scale) + (Math.log(scale) - Math.log(zoomFrom.scale)) * e);
        c = c.map((v, i) => zoomFrom.c[i] + (v - zoomFrom.c[i]) * e);
        if (u >= 1) zoomFrom = null; else request();
      }
      const ox = W / 2, oy = fh / 2 + top;
      let scr, basis;
      if (rung === "leo") {
        basis = leoBasis();
        scr = (p) => [dot(p, basis.right), dot(p, basis.down), dot(p, basis.toward)];
      } else {
        const ca = Math.cos(view.az), sa = Math.sin(view.az), ct = Math.cos(view.tilt), st = Math.sin(view.tilt);
        scr = (p) => {
          const qx = p[0] - c[0], qy = p[1] - c[1], qz = (p[2] || 0) - c[2], x1 = qx * ca - qy * sa, y1 = qx * sa + qy * ca;
          return [-x1, y1 * ct - qz * st, y1 * st + qz * ct];
        };
        basis = { right: [-ca, sa, 0], down: [sa * ct, ca * ct, -st], toward: [sa * st, ca * st, ct] };
      }
      const pt = (p) => { const q = scr(p); return [ox + q[0] * scale, oy + q[1] * scale]; };
      const earth = pt([0, 0, 0]), skyC = rung === "sun" ? [ox, oy] : earth;
      return {
        W, H, scale, c, pt, basis, earth, az: view.az, tilt: view.tilt,
        depth: (p) => scr(p)[2],
        onEarthDisc: (q) => (q[0] - earth[0]) ** 2 + (q[1] - earth[1]) ** 2 < scale * scale,
        hidden(p) { return scr(p)[2] < scr([0, 0, 0])[2] && this.onEarthDisc(pt(p)); },
        focal: H / 2 / Math.tan(55 * Math.PI / 360), skyC,
        sky(d) {                                            // a direction at infinity, through the star sky's pinhole camera
          const z = -dot(d, basis.toward);
          return z > 1e-6 ? [skyC[0] + this.focal * dot(d, basis.right) / z, skyC[1] + this.focal * dot(d, basis.down) / z] : null;
        },
      };
    }

    // ── drawing helpers ──
    function path(ctx, pts, flat) {
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const q = P.pt(flat ? [pts[i][0], pts[i][1], 0] : pts[i]);
        if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]);
      }
    }
    /** The down-tail fade every boundary layer takes: opaque sunward of x = −70, gone by −200. */
    function tailShade(ctx, color, a) {
      const p0 = P.pt([-70, 0, 0]), p1 = P.pt([-200, 0, 0]);
      if (Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) < 1) return rgba(color, a);
      const g = ctx.createLinearGradient(p0[0], p0[1], p1[0], p1[1]);
      g.addColorStop(0, rgba(color, a)); g.addColorStop(1, rgba(color, 0));
      return g;
    }
    const tailAlpha = (x) => clamp(1 - (x - -70) / (-200 - -70), 0, 1);
    function stroke(ctx, style, width, dash, cap) {
      ctx.strokeStyle = style; ctx.lineWidth = width; ctx.setLineDash(dash || []);
      ctx.lineCap = cap || "butt"; ctx.lineJoin = cap === "round" ? "round" : "miter";
      ctx.stroke();
    }
    function text(ctx, s, x, y, font, color, align = "center") {
      ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = "middle";
      ctx.fillText(s, x, y);
    }
    function circle(ctx, x, y, r, fill) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = fill; ctx.fill(); }

    // ── the star sky (StarSkyLayer: a 55° pinhole camera along the view; each star a Gaussian, added like light) ──
    let skyCache = null;
    const sprites = new Map();
    function sprite(c) {                                   // a Gaussian to 2.6 σ in the star's color, cached by color
      const key = c.map(v => Math.min(15, Math.floor(v * 16))).join(",");
      let s = sprites.get(key);
      if (s) return s;
      s = document.createElement("canvas"); s.width = s.height = 32;
      const g = s.getContext("2d"), img = g.createImageData(32, 32), sig = 16 / 2.6;
      const rgb = key.split(",").map(v => +v * 16 + 8);
      for (let j = 0; j < 32; j++) for (let i = 0; i < 32; i++) {
        const dx = (i + 0.5 - 16) / sig, dy = (j + 0.5 - 16) / sig, q = dx * dx + dy * dy, k = 4 * (j * 32 + i);
        img.data[k] = rgb[0]; img.data[k + 1] = rgb[1]; img.data[k + 2] = rgb[2];
        img.data[k + 3] = q > 6.76 ? 0 : 255 * Math.exp(-0.5 * q);
      }
      g.putImageData(img, 0, 0);
      sprites.set(key, s);
      return s;
    }
    function drawStars(ctx, dpr) {
      const key = [P.W, P.H, dpr, P.basis.toward.map(v => v.toFixed(4)).join(), P.basis.right.map(v => v.toFixed(4)).join(), P.skyC[0].toFixed(1), P.skyC[1].toFixed(1)].join("|");
      if (!skyCache || skyCache.key !== key) {
        const w = Math.round(P.W * dpr), h = Math.round(P.H * dpr);
        const c = skyCache && skyCache.cv.width === w && skyCache.cv.height === h ? skyCache.cv : document.createElement("canvas");
        c.width = w; c.height = h;
        const g = c.getContext("2d");
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.fillStyle = rgba(DS.well); g.fillRect(0, 0, P.W, P.H);
        g.globalCompositeOperation = "lighter";
        const b = P.basis, fwd = [-b.toward[0], -b.toward[1], -b.toward[2]];
        for (let i = 0; i < nStars; i++) {
          const k = i * 7, d = [stars[k], stars[k + 1], stars[k + 2]], z = dot(d, fwd), mag = stars[k + 3];
          if (z < 0.05 || mag > 7.5) continue;
          const x = P.skyC[0] + P.focal * dot(d, b.right) / z, y = P.skyC[1] + P.focal * dot(d, b.down) / z;
          if (x < -8 || y < -8 || x > P.W + 8 || y > P.H + 8) continue;
          const rel = Math.pow(10, -0.4 * (mag - 7.5)), sz = 2 * 2.6 * 0.55 * (0.75 + 0.42 * Math.log10(Math.max(rel, 1)));
          g.globalAlpha = clamp(0.07 * Math.sqrt(rel), 0, 1);
          g.drawImage(sprite([stars[k + 4], stars[k + 5], stars[k + 6]]), x - sz / 2, y - sz / 2, sz, sz);
        }
        skyCache = { key, cv: c };
      }
      ctx.drawImage(skyCache.cv, 0, 0, P.W, P.H);
    }
    function skySun() {
      const q = P.sky([1, 0, 0]);
      if (!q) return null;
      const r = Math.max(2.5, P.focal * Math.tan(0.004652)), m = r * 8;
      return q[0] > -m && q[0] < P.W + m && q[1] > -m && q[1] < P.H + m && !P.onEarthDisc(q) ? { q, r } : null;
    }
    function drawSkySun(ctx, s) {
      const [x, y] = s.q, glow = s.r * 8, g = ctx.createRadialGradient(x, y, s.r, x, y, glow);
      g.addColorStop(0, "rgba(255,241,234,0.6)"); g.addColorStop(0.3, "rgba(255,224,138,0.2)"); g.addColorStop(1, "rgba(255,224,138,0)");
      circle(ctx, x, y, glow, g); circle(ctx, x, y, s.r, "#fff");
    }
    function drawSkyPlanets(ctx) {
      for (const sp of S.planets) {
        const q = P.sky(sp.dir);
        if (!q || P.onEarthDisc(q) || q[0] < -40 || q[0] > P.W + 40 || q[1] < -40 || q[1] > P.H + 40) continue;
        const c = parseInt(sp.tint.slice(1), 16);
        circle(ctx, q[0], q[1], 6, rgba(c, 0.16)); circle(ctx, q[0], q[1], 2.2, rgba(c));
        text(ctx, `${sp.glyph} ${sp.name}`, q[0] + 8, q[1] - 5, `600 9.5px ${MONO}`, rgba(c), "left");
        text(ctx, `${sp.au.toFixed(2)} AU`, q[0] + 8, q[1] + 6, `8.5px ${MONO}`, rgba(c, 0.6), "left");
      }
    }

    // ── the Earth: a lit globe turned for the instant, a glow and two rims (drawEarth, Globe3D) ──
    let tex = null;
    { const im = new Image(); im.onload = () => {
        const c = document.createElement("canvas"); c.width = im.width; c.height = im.height;
        const g = c.getContext("2d"); g.drawImage(im, 0, 0);
        tex = { w: im.width, h: im.height, d: g.getImageData(0, 0, im.width, im.height).data };
        request();
      }; im.src = "assets/img/earth-equirect.jpg"; }
    let moonTex = null;
    { const im = new Image(); im.onload = () => {
        const c = document.createElement("canvas"); c.width = im.width; c.height = im.height;
        const g = c.getContext("2d"); g.drawImage(im, 0, 0);
        moonTex = { w: im.width, h: im.height, d: g.getImageData(0, 0, im.width, im.height).data };
        request();
      }; im.src = "assets/img/moon-equirect.jpg"; }
    // The Sun as Helios builds it (SunModel.swift): a map of the whole surface at 13:07 from seven SDO/AIA 193 Å images,
    // the near side from the image of the moment and the far side from those of the rotation before, carried forward by
    // differential rotation (prepare_hso_sun.py); here it is turned to the view and drawn as a sphere.
    let sunMap = null;
    fetch("assets/data/hso/sun.json").then(r => r.json()).then(m => {
      const im = new Image();
      im.onload = () => {
        const c = document.createElement("canvas"); c.width = m.width; c.height = m.height;
        const g = c.getContext("2d"); g.drawImage(im, 0, 0);
        sunMap = Object.assign({ d: g.getImageData(0, 0, m.width, m.height).data }, m);
        request();
      };
      im.src = m.map;
    }).catch(() => {});
    /** The sphere's picture for one view (SunSphereCache + SunSurface.render): each pixel's surface normal turned into the
     *  Sun-fixed frame, the map sampled bilinearly, the limb law the newest image shows drawn back on, half again as bright
     *  as the images (SunDrawing.brightness); kept until the view or the size changes. */
    const sunCv = document.createElement("canvas");
    let sunKey = "";
    function sunSphere(size, b) {
      const key = [size, b.right.map(v => v.toFixed(4)).join(), b.down.map(v => v.toFixed(4)).join()].join("|");
      if (key === sunKey) return sunCv;
      sunKey = key;
      const M = sunMap, A = M.axes, W = M.width, H = M.height, law = M.law, k = M.brightness, half = size / 2;
      const rx = dot(b.right, A.meridian), ry = dot(b.right, A.west), rz = dot(b.right, A.pole);
      const dx_ = dot(b.down, A.meridian), dy_ = dot(b.down, A.west), dz_ = dot(b.down, A.pole);
      const tx_ = dot(b.toward, A.meridian), ty_ = dot(b.toward, A.west), tz_ = dot(b.toward, A.pole);
      sunCv.width = sunCv.height = size;
      const gc = sunCv.getContext("2d"), img = gc.createImageData(size, size), d = img.data, m = M.d;
      for (let py = 0; py < size; py++) {
        const dy = (py + 0.5 - half) / half;
        for (let px = 0; px < size; px++) {
          const dx = (px + 0.5 - half) / half, rr = dx * dx + dy * dy;
          const edge = clamp((1 - Math.sqrt(rr)) * half + 0.5, 0, 1);
          if (edge <= 0) continue;
          const mu = Math.sqrt(Math.max(0, 1 - rr));
          const nx = rx * dx + dx_ * dy + tx_ * mu, ny = ry * dx + dy_ * dy + ty_ * mu, nz = rz * dx + dz_ * dy + tz_ * mu;
          const fx = (Math.atan2(ny, nx) / TAU + 0.5) * W - 0.5, fy = (0.5 - Math.asin(clamp(nz, -1, 1)) / Math.PI) * H - 0.5;
          const x0 = Math.floor(fx), y0 = clamp(Math.floor(fy), 0, H - 2), a0 = ((x0 % W) + W) % W, a1 = (a0 + 1) % W;
          const tx = fx - x0, ty = clamp(fy - y0, 0, 1);
          const k00 = 4 * (y0 * W + a0), k10 = 4 * (y0 * W + a1), k01 = k00 + 4 * W, k11 = k10 + 4 * W;
          const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
          let lv = 0, p = 1;
          for (const c of law) { lv += c * p; p *= mu; }
          const o = 4 * (py * size + px), gain = k * lv;
          for (let ch = 0; ch < 3; ch++) d[o + ch] = (w00 * m[k00 + ch] + w10 * m[k10 + ch] + w01 * m[k01 + ch] + w11 * m[k11 + ch]) * gain;
          d[o + 3] = edge * 255;
        }
      }
      gc.putImageData(img, 0, 0);
      return sunCv;
    }
    /** A textured sphere seen along `b`, lit from GSE +X (Globe3D.image): Lambertian with a soft terminator, a night side
     *  that keeps a little of the albedo, and a thin lit limb. */
    function globeImage(cvs, size, b, axis, prime, east, T, night) {
      cvs.width = cvs.height = size;
      const gc = cvs.getContext("2d"), img = gc.createImageData(size, size), d = img.data;
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const u = (x + 0.5) / size * 2 - 1, v = (y + 0.5) / size * 2 - 1, rr = u * u + v * v;
        if (rr > 1) continue;
        const w = Math.sqrt(1 - rr);
        const n0 = u * b.right[0] + v * b.down[0] + w * b.toward[0], n1 = u * b.right[1] + v * b.down[1] + w * b.toward[1], n2 = u * b.right[2] + v * b.down[2] + w * b.toward[2];
        const lat = Math.asin(clamp(n0 * axis[0] + n1 * axis[1] + n2 * axis[2], -1, 1));
        const lon = Math.atan2(n0 * east[0] + n1 * east[1] + n2 * east[2], n0 * prime[0] + n1 * prime[1] + n2 * prime[2]);
        const sx = Math.min(T.w - 1, Math.floor((lon + Math.PI) / TAU * T.w)), sy = Math.min(T.h - 1, Math.floor((Math.PI / 2 - lat) / Math.PI * T.h));
        const k = 4 * (sy * T.w + sx), lit = clamp((n0 + 0.10) / 0.35, 0, 1), shade = night + (1 - night) * lit;
        let cr = T.d[k] / 255 * shade, cg = T.d[k + 1] / 255 * shade, cb = T.d[k + 2] / 255 * shade;
        if (lit > 0.05) { const air = 0.35 * (1 - w) * (1 - w) * lit; cr += air * 0.35; cg += air * 0.55; cb += air; }
        const o2 = 4 * (y * size + x);
        d[o2] = cr * 255; d[o2 + 1] = cg * 255; d[o2 + 2] = cb * 255;
        d[o2 + 3] = 255 * clamp((1 - Math.sqrt(rr)) * size / 2 + 0.5, 0, 1);
      }
      gc.putImageData(img, 0, 0);
      return cvs;
    }
    const earthCv = document.createElement("canvas"), moonCv = document.createElement("canvas");
    function earthFrame() { const M = frameAt("geo", time); return { axis: [M[2], M[5], M[8]], prime: [M[0], M[3], M[6]], east: [M[1], M[4], M[7]] }; }
    function drawEarth(ctx, dpr) {
      const e = P.earth, r = P.scale * earthRE, glowR = r * 1.7;
      const g = ctx.createRadialGradient(e[0], e[1], r * 0.7, e[0], e[1], glowR);
      g.addColorStop(0, rgba(0x3a7bd5, 0.32)); g.addColorStop(1, rgba(0x3a7bd5, 0));
      circle(ctx, e[0], e[1], glowR, g);
      if (tex && r > 0.6) {
        const F = earthFrame();
        ctx.drawImage(globeImage(earthCv, Math.max(2, Math.ceil(2 * r * dpr)), P.basis, F.axis, F.prime, F.east, tex, 0.16), e[0] - r, e[1] - r, 2 * r, 2 * r);
      } else circle(ctx, e[0], e[1], Math.max(r, 0.8), "#1d3b66");
      ctx.beginPath(); ctx.arc(e[0], e[1], r * 1.07, 0, TAU); stroke(ctx, rgba(0x6fc0ff, 0.28), 1.4);
      ctx.beginPath(); ctx.arc(e[0], e[1], r, 0, TAU); stroke(ctx, rgba(0x9fd0ff, 0.45), 0.7);
    }

    // ── MMS, THEMIS and the fleet ──
    const posAt = (o2, t) => (o2.timeline && o2.timeline.t.length ? lerpTrack(o2.timeline.t, o2.timeline.p, t) : o2.pos);
    function frameReach() {
      const R = RUNGS[rung];
      return (R ? len3(R.center) + Math.max(...R.extent) : Math.max(P.W, P.H) / 2 / Math.max(P.scale, 1e-6)) * 1.10;
    }
    // the Magnetosphere rung keeps the Moon and ARTEMIS wherever they project, and it and the Moon rung keep the L1 monitors
    const lunar = (f) => rung === "mag" && (f.cat === "moon" || f.cat === "artemis");
    const sunward = (f) => (rung === "mag" || rung === "moon") && f.cat === "l1";
    const kept = (f, p, reach) => len3(p) <= reach || lunar(f) || sunward(f);
    function onCanvas(q) { return q[0] > -20 && q[0] < P.W + 20 && q[1] > -20 && q[1] < P.H + 20; }
    function fleetNow() {
      const reach = frameReach();
      return S.fleet.map(f => ({ f, p: posAt(f, time) })).filter(({ f, p }) => kept(f, p, reach) && !((lunar(f) || sunward(f)) && P.hidden(p)))
        .map(x => Object.assign(x, { q: P.pt(x.p) })).filter(x => onCanvas(x.q));
    }
    function occluded(ctx, pts) {
      ctx.beginPath();
      let pen = false;
      for (const p of pts) {
        if (P.hidden(p)) { pen = false; continue; }
        const q = P.pt(p);
        if (pen) ctx.lineTo(q[0], q[1]); else { ctx.moveTo(q[0], q[1]); pen = true; }
      }
    }

    function drawMMS(ctx, avoid) {
      const q = P.pt(orbitAt(time));
      circle(ctx, q[0], q[1], 4.5, rgba(DS.screenAlt));
      circle(ctx, q[0], q[1], 3, "#F0F3FA");
      text(ctx, "MMS", q[0] + 9, q[1] - 7, `700 10px ${MONO}`, "#E8ECF3", "left");
      rings.push({ q, color: 0xF0F3FA, name: "MMS", kind: "mms" });
      return [q, [q[0] + 20, q[1] - 7]];
    }
    function drawThemis(ctx, markers) {
      const th = S.themis.map(x => ({ id: x.id, q: P.pt(posAt(x, time)) }));
      if (!th.length) return [];
      const occ = [];
      for (const x of th) { circle(ctx, x.q[0], x.q[1], 3.5, rgba(DS.screenAlt)); circle(ctx, x.q[0], x.q[1], 2.3, rgba(THEMIS[x.id] ?? 0x888888)); occ.push(x.q); }
      for (const x of th) {
        text(ctx, x.id, x.q[0], x.q[1] - CRAFT_RISE, `600 8px ${MONO}`, rgba(THEMIS[x.id] ?? 0x888888, 0.95));
        occ.push([x.q[0], x.q[1] - CRAFT_RISE]);
        rings.push({ q: x.q, color: THEMIS[x.id] ?? 0x888888, name: `THEMIS-${x.id}`, kind: "other" });
      }
      const xs = th.map(x => x.q[0]), ys = th.map(x => x.q[1]), n = th.length;
      const cx = xs.reduce((a, b) => a + b, 0) / n, cy = ys.reduce((a, b) => a + b, 0) / n, halfW = 6 * 2.8 + 3;
      const clear = (p) => !markers.some(m => Math.abs(m[0] - p[0]) < halfW + 5 && Math.abs(m[1] - p[1]) < 8)
        && !occ.some(m => Math.abs(m[0] - p[0]) < 34 && Math.abs(m[1] - p[1]) < 10);
      const cands = [[cx, Math.min(...ys) - GROUP_RISE], [cx, Math.max(...ys) + GROUP_RISE], [Math.max(...xs) + 12 + halfW, cy], [Math.min(...xs) - 12 - halfW, cy]];
      const at = cands.find(clear) || cands[0];
      text(ctx, "THEMIS", at[0], at[1], `600 9px ${MONO}`, "rgba(255,255,255,0.7)");
      occ.push(at);
      return occ;
    }
    function drawFleet(ctx, list, avoid) {
      const reach = frameReach();
      const moon = S.fleet.find(f => f.cat === "moon");
      if (moon && moon.orbit.length > 1 && kept(moon, posAt(moon, time), reach)) {
        if (lunar(moon)) occluded(ctx, moon.orbit); else path(ctx, moon.orbit);
        stroke(ctx, "rgba(255,255,255,0.16)", 0.8, [4, 4]);
      }
      for (const f of S.fleet) {
        if (f.orbit.length < 2 || f.cat === "moon" || !kept(f, posAt(f, time), reach)) continue;
        if (lunar(f)) occluded(ctx, f.orbit); else path(ctx, f.orbit);
        stroke(ctx, f.cat === "cluster" ? "rgba(158,158,158,0.38)" : rgba(CAT[f.cat], 0.45), 0.9, [3, 3]);
      }
      const l1s = S.fleet.filter(f => f.cat === "l1" && len3(posAt(f, time)) <= reach);
      if (l1s.length) {                                     // the L1 monitors' schematic halo
        const cx = l1s.reduce((acc, f) => acc + posAt(f, time)[0], 0) / l1s.length;
        path(ctx, Array.from({ length: 97 }, (_, i) => [cx, 38 * Math.cos(TAU * i / 96), 24 * Math.sin(TAU * i / 96)]));
        stroke(ctx, "rgba(255,255,255,0.15)", 0.8, [4, 4]);
      }
      const placed = avoid.slice(), marks = list.map(x => x.q), px = P.scale;
      for (const { f, p, q } of list) {
        const c = CAT[f.cat];
        if (f.cat === "moon") {
          if (moonTex) {                                    // lit from the Sun, its near side turned to the Earth
            const toE = p.map(x => -x / len3(p)), ax = [0, 0, 1], east = [ax[1] * toE[2] - ax[2] * toE[1], ax[2] * toE[0] - ax[0] * toE[2], ax[0] * toE[1] - ax[1] * toE[0]];
            ctx.drawImage(globeImage(moonCv, 20, P.basis, ax, toE, east, moonTex, 0.10), q[0] - 5, q[1] - 5, 10, 10);
          } else circle(ctx, q[0], q[1], 5, rgba(c));
          ctx.beginPath(); ctx.arc(q[0], q[1], 7, 0, TAU); stroke(ctx, rgba(c, 0.35), 1);
        } else {
          circle(ctx, q[0], q[1], 4, rgba(DS.screenAlt)); circle(ctx, q[0], q[1], 2.5, rgba(c));
          rings.push({ q, color: c, name: f.id, kind: "other" });
        }
        let cap = f.id;
        if (f.cat === "cluster") cap = f.id.slice(-1);
        else if (f.cat === "goes" || f.cat === "arase" || f.cat === "sdo") cap = px >= 8 ? f.id : null;
        else if (f.cat === "artemis") cap = px < 6 ? null : (px < 14 || lunar(f) ? f.id.slice(-2) : f.id);
        else if (f.cat === "moon") cap = lunar(f) ? `Moon · ${len3(p).toFixed(0)} Rₑ` : "Moon";
        else if (f.cat === "l1") cap = sunward(f) ? `${f.id} · ${len3(p).toFixed(0)} Rₑ` : f.id;
        if (!cap) continue;
        const halfW = cap.length * 2.5 + 3;
        const taken = (a) => placed.some(m => Math.abs(m[0] - a[0]) < 34 && Math.abs(m[1] - a[1]) < 10)
          || marks.some(m => (Math.abs(m[0] - q[0]) > 0.5 || Math.abs(m[1] - q[1]) > 0.5) && Math.abs(m[0] - a[0]) < halfW + 5 && Math.abs(m[1] - a[1]) < 7);
        const fits = (a) => a[0] - halfW >= 2 && a[0] + halfW <= P.W - 2 && a[1] >= 6 && a[1] <= P.H - 6;
        const cands = [[q[0], q[1] - CRAFT_RISE], [q[0], q[1] + CRAFT_RISE], [q[0] + 9 + halfW, q[1]], [q[0] - 9 - halfW, q[1]]];
        const at = cands.find(a => !taken(a) && fits(a)) || cands.find(a => !taken(a));
        if (!at) continue;
        placed.push(at);
        text(ctx, cap, at[0], at[1], `600 8px ${MONO}`, rgba(c, 0.95));
      }
      const cl = list.filter(x => x.f.cat === "cluster").map(x => x.q);
      if (cl.length > 1) text(ctx, "CLUSTER", cl.reduce((a, q) => a + q[0], 0) / cl.length, Math.min(...cl.map(q => q[1])) - GROUP_RISE, `600 9px ${MONO}`, rgba(CAT.cluster, 0.95));
    }

    /** From each L1 monitor in the frame to the bow shock's nose, with the solar wind's travel time (drawL1Propagation). */
    function drawL1Lags(ctx) {
      const v = G.w.v;
      if (!(v > 100)) return;
      const nose = aberrate([G.B.bsR0, 0, 0], G.B.ab), qn = P.pt(nose), reach = frameReach();
      for (const f of S.fleet) {
        if (f.cat !== "l1") continue;
        const p = posAt(f, time);
        if (len3(p) > reach) continue;
        const q0 = P.pt(p);
        if (!onCanvas(q0)) continue;
        ctx.beginPath(); ctx.moveTo(...q0); ctx.lineTo(...qn); stroke(ctx, rgba(DS.gold, 0.26), 0.8, [2, 4]);
        const lag = (p[0] - nose[0]) * 6371.2 / v / 60;
        if (lag > 0) text(ctx, `→ ≈${Math.round(lag)} min`, (q0[0] + qn[0]) / 2, (q0[1] + qn[1]) / 2 - 7, `8px ${MONO}`, rgba(DS.gold, 0.75));
      }
    }

    // ── the Sun rung: the inner solar system about the Sun, its planets, the Sun as SDO saw it ×15, and the Earth ──
    function drawHelio(ctx, dpr) {
      const world = (r) => [AU + r[0], r[1], r[2]], sunQ = P.pt([AU, 0, 0]);
      path(ctx, Array.from({ length: 241 }, (_, i) => [AU + AU * Math.cos(TAU * i / 240), AU * Math.sin(TAU * i / 240), 0]));
      stroke(ctx, "rgba(255,255,255,0.16)", 0.8, [5, 5]);
      const r = Math.max(15 * (695700 / 6371.2) * P.scale, 3);
      const caption = (str, q, color, size = 9, below = false) => {
        const dx = q[0] - sunQ[0], dy = q[1] - sunQ[1], d = Math.hypot(dx, dy) || 1, ex = Math.max(42, r * 1.25 + 10);
        let at = [q[0] + dx / d * 14, q[1] + dy / d * 14 + (below ? 10 : -10)];
        if (d < ex) at = [sunQ[0] + dx / d * (ex + 30), sunQ[1] + dy / d * (ex + 8)];
        text(ctx, str, at[0], at[1], `600 ${size}px ${MONO}`, color);
      };
      for (const pl of S.solar.planets) {
        if (!PLANET[pl.name]) continue;
        const [tint, glyph] = PLANET[pl.name];
        path(ctx, pl.orbit.map(world)); ctx.closePath(); stroke(ctx, rgba(tint, 0.30), 0.8, [3, 3]);
        const q = P.pt(world(pl.pos));
        if (q[0] < -26 || q[0] > P.W + 26 || q[1] < -26 || q[1] > P.H + 26) continue;
        const g = ctx.createRadialGradient(q[0], q[1], 1, q[0], q[1], 6);
        g.addColorStop(0, rgba(tint, 0.55)); g.addColorStop(1, rgba(tint, 0));
        circle(ctx, q[0], q[1], 6, g); circle(ctx, q[0], q[1], 2.5, rgba(tint));
        caption(`${glyph} ${pl.name}`, q, rgba(tint));
      }
      // the Sun: the corona as the newest image shows it off the limb, out to 1.25 radii, its brightness as opacity
      // (SunDrawing.drawHalo), then the sphere; the plain disk in the band's color until the map arrives
      const g = ctx.createRadialGradient(sunQ[0], sunQ[1], r, sunQ[0], sunQ[1], r * 1.25);
      if (sunMap) for (const [rr, c] of sunMap.halo) {
        const m = Math.max(c[0], c[1], c[2], 1);
        g.addColorStop(clamp((rr - 1) / 0.25, 0, 1), `rgba(${Math.round(255 * c[0] / m)},${Math.round(255 * c[1] / m)},${Math.round(255 * c[2] / m)},${Math.min(1, 1.5 * m / 255)})`);
      } else { g.addColorStop(0, "rgba(201,166,72,0.68)"); g.addColorStop(0.4, "rgba(201,166,72,0.18)"); }
      g.addColorStop(1, "rgba(201,166,72,0)");
      circle(ctx, sunQ[0], sunQ[1], r * 1.25, g);
      if (sunMap) ctx.drawImage(sunSphere(Math.min(1024, Math.ceil(2 * r * Math.max(dpr, 2))), P.basis), sunQ[0] - r, sunQ[1] - r, 2 * r, 2 * r);
      else circle(ctx, sunQ[0], sunQ[1], r, "rgb(255,249,108)");
      text(ctx, "☀ Sun ×15", sunQ[0], sunQ[1] + r * 1.25 + 11, `600 10px ${MONO}`, "#FFE08A");
      // Helios's heliocentric fleet on the day
      for (const h of S.solar.fleet) {
        const c = HELIO[h.name] ?? 0xC9B8FF, q = P.pt(world(h.pos));
        if (h.loop.length > 1) { path(ctx, h.loop.map(world)); stroke(ctx, rgba(c, 0.6), 0.8, [3, 2]); }
        if (q[0] < -20 || q[0] > P.W + 20 || q[1] < -20 || q[1] > P.H + 20) continue;
        circle(ctx, q[0], q[1], 4, rgba(DS.screenAlt)); circle(ctx, q[0], q[1], 2.5, rgba(c));
        ctx.beginPath(); ctx.arc(q[0], q[1], 6.85, 0, TAU); stroke(ctx, rgba(c, 0.85), 1.3);
        text(ctx, h.name, q[0], q[1] + 15, `600 8px ${MONO}`, rgba(c, 0.95));
        text(ctx, `${h.au.toFixed(2)} AU`, q[0], q[1] + 25, `8px ${MONO}`, rgba(c, 0.6));
      }
      // the Earth
      const e = P.earth, ge = ctx.createRadialGradient(e[0], e[1], 1, e[0], e[1], 8);
      ge.addColorStop(0, rgba(0x8fd0ff)); ge.addColorStop(1, rgba(0x8fd0ff, 0));
      circle(ctx, e[0], e[1], 4.5, ge); circle(ctx, e[0], e[1], 2.5, rgba(0x5b9cff));
      text(ctx, "Earth", e[0], e[1] - 11, `600 9px ${MONO}`, rgba(0x8fd0ff));
    }

    // ── the LEO rung: the Earth at true size, Earth-fixed and north up, the all-sky imagers on it and the oval ──
    const STARKOV = [
      [[-0.07, -10.06, -4.44, -3.77, -6.61, 6.37, -4.48], [24.54, 19.83, 7.47, 7.90, 10.17, -1.10, 10.16],
       [-12.53, -9.33, -3.01, -4.73, -5.80, 0.34, -5.87], [2.15, 1.24, 0.25, 0.91, 1.19, -0.38, 0.98]],
      [[1.61, -9.59, -12.07, -6.56, -2.22, -23.98, -20.07], [23.21, 17.78, 17.49, 11.44, 1.50, 42.79, 36.67],
       [-10.97, -7.20, -7.96, -6.73, -0.58, -26.96, -24.20], [2.03, 0.96, 1.15, 1.31, 0.08, 5.56, 5.11]],
    ];
    function starkovColat(m, t, kp) {                       // Starkov (1994), Sigernes et al. (2011)'s coefficients
      const k = clamp(kp, 0, 9), al = 18 - 12.3 * k + 27.2 * k * k - 2.0 * k * k * k;
      const x = Math.log10(clamp(Math.abs(al), 10, 780)), p = [1, x, x * x, x * x * x], c = new Array(7).fill(0);
      for (let j = 0; j < 7; j++) for (let i = 0; i < 4; i++) c[j] += STARKOV[m][i][j] * p[i];
      return c[0] + c[1] * Math.cos(15 * (t + c[4]) * DEG) + c[2] * Math.cos(15 * (2 * t + c[5]) * DEG) + c[3] * Math.cos(15 * (3 * t + c[6]) * DEG);
    }
    const leoCv = document.createElement("canvas");
    let leoCache = null, stationMarks = [], dragging = false;
    function drawLEO(ctx, dpr) {
      const e = P.earth, r = P.scale, lift = 1 + 110 / 6371.2;
      const glow = ctx.createRadialGradient(e[0], e[1], r * 0.98, e[0], e[1], r * 1.12);
      glow.addColorStop(0, "rgba(111,192,255,0.30)"); glow.addColorStop(1, "rgba(111,192,255,0)");
      circle(ctx, e[0], e[1], r * 1.12, glow);
      if (tex) {
        const res = Math.min(dragging ? 1 : dpr, 2), size = Math.min(1400, Math.ceil(2 * r * res));
        const key = [size, P.basis.toward.map(v => v.toFixed(5)).join(), P.basis.right.map(v => v.toFixed(5)).join()].join("|");
        if (!leoCache || leoCache.key !== key) {
          const F = earthFrame();
          globeImage(leoCv, size, P.basis, F.axis, F.prime, F.east, tex, 0.16);
          leoCache = { key };
        }
        ctx.drawImage(leoCv, e[0] - r, e[1] - r, 2 * r, 2 * r);
      } else circle(ctx, e[0], e[1], r, "#1d3b66");
      ctx.beginPath(); ctx.arc(e[0], e[1], r, 0, TAU); stroke(ctx, rgba(0x9fd0ff, 0.45), 0.8);
      // the auroral oval at the scene's Kp, both hemispheres, in the dipole's own frame
      const SM = frameAt("sm", time), kp = S.kp ?? 2;
      for (const sg of [1, -1]) {
        const edge = (m) => Array.from({ length: 97 }, (_, i) => {
          const t = i / 4, c = starkovColat(m, t, kp) * DEG, ph = (t - 12) * 15 * DEG;
          return mul(SM, [Math.sin(c) * Math.cos(ph), Math.sin(c) * Math.sin(ph), sg * Math.cos(c)]).map(v => v * lift);
        });
        const pole = edge(0), eq = edge(1);
        ctx.beginPath();
        for (let i = 0; i < 96; i++) {
          const quad = [pole[i], pole[i + 1], eq[i + 1], eq[i]];
          if (quad.some(v => P.depth(v) < 0.02)) continue;
          const q = quad.map(P.pt);
          ctx.moveTo(...q[0]); ctx.lineTo(...q[1]); ctx.lineTo(...q[2]); ctx.lineTo(...q[3]); ctx.closePath();
        }
        ctx.fillStyle = "rgba(108,240,168,0.26)"; ctx.fill();
        for (const ed of [pole, eq]) {
          ctx.beginPath();
          let pen = false;
          for (const v of ed) { if (P.depth(v) < 0.02) { pen = false; continue; } const q = P.pt(v); if (pen) ctx.lineTo(...q); else { ctx.moveTo(...q); pen = true; } }
          stroke(ctx, "rgba(150,245,190,0.55)", 0.9);
        }
      }
      // the all-sky imagers running that day: filled where the sky is dark enough to image (Sun below −10°)
      const M = frameAt("geo", time), taken = [];
      stationMarks = [];
      for (const s of S.asi) {
        const la = s.lat * DEG, lo = s.lon * DEG, n = mul(M, [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)]);
        if (dot(n, P.basis.toward) <= 0.02) continue;
        const q = P.pt(n.map(v => v * lift)), elev = Math.asin(clamp(n[0], -1, 1)) / DEG, imaging = elev < -10;
        stationMarks.push({ s, q, elev, imaging, color: NET[s.nets[0]] ?? NET.themis });
      }
      for (const m of stationMarks) {
        const rr = hover && hover.station === m.s.code ? 6 : 4.2;
        ctx.beginPath(); ctx.arc(m.q[0], m.q[1], rr, 0, TAU);
        if (m.imaging) { ctx.fillStyle = rgba(m.color); ctx.fill(); stroke(ctx, "rgba(255,255,255,0.85)", 0.8); }
        else { ctx.fillStyle = "rgba(0,0,0,0.45)"; ctx.fill(); stroke(ctx, rgba(m.color, 0.45), 1.2); }
        taken.push([m.q[0] - 5, m.q[1] - 5, 10, 10]);
      }
      ctx.font = `600 8.5px ${MONO}`;
      const order = stationMarks.slice().sort((a, b) => (a.imaging ? 0 : 2) + (a.s.nets[0] === "themis" ? 0 : 1) - ((b.imaging ? 0 : 2) + (b.s.nets[0] === "themis" ? 0 : 1)));
      for (const m of order) {
        const code = m.s.code.toUpperCase(), w = ctx.measureText(code).width, h = 9, p = m.q;
        for (const rc of [[p[0] + 7, p[1] - h / 2], [p[0] - 7 - w, p[1] - h / 2], [p[0] - w / 2, p[1] - 7 - h], [p[0] - w / 2, p[1] + 7]]) {
          if (rc[0] < 4 || rc[1] < 4 || rc[0] + w > P.W - 4 || rc[1] + h > P.H - 4) continue;
          if (taken.some(t => rc[0] < t[0] + t[2] && rc[0] + w > t[0] && rc[1] < t[1] + t[3] && rc[1] + h > t[1])) continue;
          ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.95)"; ctx.shadowBlur = 3;
          text(ctx, code, rc[0], rc[1] + h / 2, `600 8.5px ${MONO}`, m.imaging ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.55)", "left");
          ctx.restore();
          taken.push([rc[0] - 1.5, rc[1] - 1, w + 3, h + 2]);
          break;
        }
      }
      // the way to the Sun, at the limb
      const sq = P.pt([1, 0, 0]), dx = sq[0] - e[0], dy = sq[1] - e[1], ln = Math.hypot(dx, dy);
      if (ln > r * 0.6) {
        const ux = dx / ln, uy = dy / ln, tip = r * 1.16, shaft = Math.min(r * 0.11, 14), b2 = [e[0] + ux * tip, e[1] + uy * tip];
        ctx.beginPath(); ctx.moveTo(e[0] + ux * (tip - shaft), e[1] + uy * (tip - shaft)); ctx.lineTo(...b2);
        ctx.moveTo(...b2); ctx.lineTo(b2[0] - ux * 5 - uy * 3, b2[1] - uy * 5 + ux * 3);
        ctx.moveTo(...b2); ctx.lineTo(b2[0] - ux * 5 + uy * 3, b2[1] - uy * 5 - ux * 3);
        stroke(ctx, rgba(DS.gold, 0.7), 1.1);
        text(ctx, "Sun", b2[0] + ux * 14, b2[1] + uy * 14, `600 9px ${MONO}`, rgba(DS.gold, 0.85));
      }
      // the legend
      if (P.W >= 420) {
        const lines = ["ALL-SKY IMAGERS", "imaging now   daylight", `${stationMarks.length} in view · ${S.asi.length} that day`, "Drag to turn the globe"];
        const x = 12, y = P.H - 112, w = 200, h = 74;
        roundRect(ctx, x, y, w, h, 8); ctx.fillStyle = "rgba(11,11,14,0.86)"; ctx.fill(); stroke(ctx, rgba(DS.hairline, 0.12), 1);
        text(ctx, lines[0], x + 10, y + 13, `700 9.5px ${MONO}`, rgba(DS.textSecondary), "left");
        circle(ctx, x + 14, y + 30, 4, rgba(NET.themis)); ctx.beginPath(); ctx.arc(x + 14, y + 30, 4, 0, TAU); stroke(ctx, "rgba(255,255,255,0.85)", 0.8);
        text(ctx, "imaging now", x + 23, y + 30, `9.5px ${MONO}`, rgba(DS.textBright), "left");
        ctx.beginPath(); ctx.arc(x + 112, y + 30, 4, 0, TAU); ctx.fillStyle = "rgba(0,0,0,0.45)"; ctx.fill(); stroke(ctx, rgba(NET.themis, 0.45), 1.2);
        text(ctx, "daylight", x + 121, y + 30, `9.5px ${MONO}`, rgba(DS.textBright), "left");
        let lx = x + 10;
        for (const k of ["themis", "rego"]) { circle(ctx, lx + 4, y + 46, 3.5, rgba(NET[k])); text(ctx, NET_NAME[k], lx + 11, y + 46, `9px ${MONO}`, rgba(DS.textSecondary), "left"); lx += 70; }
        text(ctx, `Kp ${(S.kp ?? 2).toFixed(1)} oval (Starkov 1994) · drag to turn`, x + 10, y + 62, `8.5px ${MONO}`, rgba(DS.textMuted), "left");
      }
    }

    // ── the boundary captions, laid along the curves (labelAlong) ──
    function labelAlong(ctx, pts, s, color, frac, away) {
      const n = pts.length;
      if (n <= 8) return;
      const want = clamp(Math.floor(frac * (n - 1)), 0, n - 1), inset = 28;
      const vis = (k) => { const q = P.pt([pts[k][0], pts[k][1], 0]); return q[0] > inset && q[0] < P.W - inset && q[1] > inset + 40 && q[1] < P.H - inset; };
      let i = want;
      if (!vis(i)) {
        let found = -1;
        for (let d = 1; d < n; d++) {
          if (want + d < n && vis(want + d)) { found = want + d; break; }
          if (want - d >= 0 && vis(want - d)) { found = want - d; break; }
        }
        if (found < 0) return;
        i = found;
      }
      const a = P.pt([pts[i][0], pts[i][1], 0]), j = Math.min(n - 1, i + 6), b = P.pt([pts[j][0], pts[j][1], 0]);
      let ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      if (ang > Math.PI / 2) ang -= Math.PI;
      if (ang < -Math.PI / 2) ang += Math.PI;
      let dy = -5;
      if (away) { const e = P.earth, out = -Math.sin(ang) * (a[0] - e[0]) + Math.cos(ang) * (a[1] - e[1]); dy = out >= 0 ? away : -away; }
      ctx.save(); ctx.translate(a[0], a[1]); ctx.rotate(ang);
      text(ctx, s, 0, dy, `9px ${MONO}`, color);
      ctx.restore();
    }

    // ── the axes gizmo and the GSE rulers ──
    function axisDir(v) { return [dot(v, P.basis.right), dot(v, P.basis.down), dot(v, P.basis.toward)]; }
    const AXES = [[[1, 0, 0], "+X☉", 0xff7b72], [[0, 1, 0], "+Y", 0x7fd6a0], [[0, 0, 1], "+Z", 0x8fb7ff]];
    function drawAxes(ctx) {
      const ox = 46, L = 16, reach = L + 7, oy = P.H - (reach + 11), f = 0.58;
      const planes = [[0, 1], [0, 2], [1, 2]].sort((p, q) =>
        (axisDir(AXES[p[0]][0])[2] + axisDir(AXES[p[1]][0])[2]) - (axisDir(AXES[q[0]][0])[2] + axisDir(AXES[q[1]][0])[2]));
      for (const [i, j] of planes) {
        const da = axisDir(AXES[i][0]), db = axisDir(AXES[j][0]);
        const pa = [ox + da[0] * L * f, oy + da[1] * L * f], pb = [ox + db[0] * L * f, oy + db[1] * L * f];
        const pc = [ox + (da[0] + db[0]) * L * f, oy + (da[1] + db[1]) * L * f];
        if (Math.abs((pa[0] - ox) * (pb[1] - oy) - (pb[0] - ox) * (pa[1] - oy)) <= 12) continue;
        ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(...pa); ctx.lineTo(...pc); ctx.lineTo(...pb); ctx.closePath();
        ctx.fillStyle = rgba(AXES[i][2], 0.16); ctx.fill();
        stroke(ctx, rgba(AXES[j][2], 0.22), 0.6);
      }
      for (const [v, lab, col] of AXES.slice().sort((p, q) => axisDir(p[0])[2] - axisDir(q[0])[2])) {
        const d = axisDir(v), l = Math.max(Math.hypot(d[0], d[1]), 1e-4), inPlane = Math.min(1, l), a = 0.30 + 0.55 * inPlane;
        const tip = [ox + d[0] * L, oy + d[1] * L], ux = d[0] / l, uy = d[1] / l;
        ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(...tip);
        ctx.moveTo(...tip); ctx.lineTo(tip[0] - ux * 5 - uy * 3, tip[1] - uy * 5 + ux * 3);
        ctx.moveTo(...tip); ctx.lineTo(tip[0] - ux * 5 + uy * 3, tip[1] - uy * 5 - ux * 3);
        stroke(ctx, rgba(col, a), 1.3);
        if (inPlane > 0.18) text(ctx, lab, ox + d[0] * (L + 7), oy + d[1] * (L + 7), `600 8px ${MONO}`, rgba(col, Math.min(1, a + 0.15)));
      }
      text(ctx, "GSE", ox, oy - (reach + 10), `8px ${MONO}`, "rgba(255,255,255,0.40)");
    }
    function niceStep(raw) {
      if (!(raw > 0) || !isFinite(raw)) return 1;
      const e = Math.floor(Math.log10(raw)), f = raw / 10 ** e;
      return (f <= 1 ? 1 : f <= 5 ? 5 : 10) * 10 ** e;
    }
    const fmtRE = (v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : Math.abs(v - Math.round(v)) > 1e-9 ? v.toFixed(1) : v.toFixed(0));
    function drawRulers(ctx) {
      const W = P.W, H = P.H, c = P.earth, leftSkipX = 46 + 42, bottomSkipY = 76, font = `500 8.5px ${MONO}`;
      const px = (v, horiz) => { const p = P.pt(v); return Math.abs(horiz ? p[0] - c[0] : p[1] - c[1]); };
      const step = (per, minPx) => { if (!(per > 0.02)) return null; const s = niceStep(minPx / per); return isFinite(s) && s > 0 && s * per <= 4000 ? s : null; };
      const axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map((v, i) => ({ v, col: AXES[i][2] }));
      let hIdx = 0;
      for (let i = 1; i < 3; i++) if (px(axes[i].v, true) > px(axes[hIdx].v, true)) hIdx = i;
      const hA = axes[hIdx], perX = px(hA.v, true), stepX = step(perX, 54);
      if (stepX) {
        const yB = H - 8, minorPx = stepX * perX / 2;
        for (let k = 1; k <= 400; k++) {
          const pts = [[P.pt(hA.v.map(x => x * k * stepX)), "+"], [P.pt(hA.v.map(x => -x * k * stepX)), "−"]];
          if (pts.every(([p]) => p[0] <= 20 || p[0] >= W - 20)) break;
          for (const [p, s] of pts) {
            if (!(p[0] > 20 && p[0] < W - 20)) continue;
            ctx.beginPath(); ctx.moveTo(p[0], yB); ctx.lineTo(p[0], yB - 5); stroke(ctx, rgba(hA.col, 0.6), 1);
            if (minorPx >= 13) {
              const hx = p[0] - (p[0] - c[0]) / (2 * k);
              if (hx > 20 && hx < W - 20) { ctx.beginPath(); ctx.moveTo(hx, yB); ctx.lineTo(hx, yB - 3); stroke(ctx, rgba(hA.col, 0.32), 1); }
            }
            if (p[0] > leftSkipX && p[0] < W - 152) text(ctx, `${s}${fmtRE(k * stepX)}`, p[0], yB - 12, font, rgba(hA.col, 0.85));
          }
        }
        if (c[0] > leftSkipX && c[0] < W - 152) {
          ctx.beginPath(); ctx.moveTo(c[0], yB); ctx.lineTo(c[0], yB - 6); stroke(ctx, rgba(hA.col, 0.75), 1);
          text(ctx, "0", c[0], yB - 12, font, rgba(hA.col, 0.85));
        }
      }
      let vIdx = -1;
      for (let i = 0; i < 3; i++) if (i !== hIdx && (vIdx < 0 || px(axes[i].v, false) > px(axes[vIdx].v, false))) vIdx = i;
      const vA = axes[vIdx], perV = px(vA.v, false), stepV = step(perV, 44);
      if (stepV) {
        const xL = 9, minorPx = stepV * perV / 2;
        for (let k = 1; k <= 400; k++) {
          const pts = [[P.pt(vA.v.map(x => x * k * stepV)), "+"], [P.pt(vA.v.map(x => -x * k * stepV)), "−"]];
          if (pts.every(([p]) => p[1] <= 20 || p[1] >= H - 20)) break;
          for (const [p, s] of pts) {
            if (!(p[1] > 20 && p[1] < H - 20)) continue;
            ctx.beginPath(); ctx.moveTo(xL, p[1]); ctx.lineTo(xL + 5, p[1]); stroke(ctx, rgba(vA.col, 0.6), 1);
            if (minorPx >= 13) {
              const hy = p[1] - (p[1] - c[1]) / (2 * k);
              if (hy > 20 && hy < H - 20) { ctx.beginPath(); ctx.moveTo(xL, hy); ctx.lineTo(xL + 3, hy); stroke(ctx, rgba(vA.col, 0.32), 1); }
            }
            if (p[1] > 100 && p[1] < H - bottomSkipY) text(ctx, `${s}${fmtRE(k * stepV)}`, xL + 9, p[1], font, rgba(vA.col, 0.85), "left");
          }
        }
        if (c[1] > 100 && c[1] < H - bottomSkipY) {
          ctx.beginPath(); ctx.moveTo(xL, c[1]); ctx.lineTo(xL + 6, c[1]); stroke(ctx, rgba(vA.col, 0.75), 1);
          text(ctx, "0", xL + 9, c[1], font, rgba(vA.col, 0.85), "left");
        }
      }
    }

    // ── the insets: the IMF clock dial, the formation and its TQF ──
    function roundRect(ctx, x, y, w, h, r) {
      ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    }
    function formationAt(t) {
      const F = S.mms.formation, rel = { 1: [0, 0, 0] };
      for (const n of [2, 3, 4]) rel[n] = lerpTrack(F.t, F.rel[n], t);
      const cen = [0, 1, 2].map(i => (rel[1][i] + rel[2][i] + rel[3][i] + rel[4][i]) / 4);
      const v = [1, 2, 3, 4].map(n => [n, [0, 1, 2].map(i => rel[n][i] - cen[i])]);
      const a = [0, 1, 2].map(i => rel[2][i] - rel[1][i]), b = [0, 1, 2].map(i => rel[3][i] - rel[1][i]), c = [0, 1, 2].map(i => rel[4][i] - rel[1][i]);
      const vol = Math.abs(a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
      const e = [];
      for (let i = 1; i <= 4; i++) for (let j = i + 1; j <= 4; j++) e.push(len3([0, 1, 2].map(k => rel[i][k] - rel[j][k])));
      const mean = e.reduce((p, q) => p + q, 0) / 6;
      return { v, maxR: Math.max(...v.map(x => len3(x[1])), 1e-4), tqf: mean > 0 ? clamp(vol / (mean ** 3 / (6 * Math.SQRT2)), 0, 1) : 0, sep: mean };
    }
    function drawInsets(ctx, w) {
      const W = P.W, H = P.H, F = formationAt(time);
      // the TQF and the mean separation, bottom right
      text(ctx, `${F.sep.toFixed(0)} km sep`, W - 12, H - 18, `11px ${MONO}`, rgba(DS.textSecondary2), "right");
      text(ctx, `TQF ${F.tqf.toFixed(2)}`, W - 12, H - 34, `600 13px ${MONO}`, rgba(DS.green), "right");
      formDots = [];
      if (W < 520 || H < 420) return;
      // the formation, magnified, in the figure's own orientation
      const label = `Formation · ${F.maxR.toFixed(0)} km`;
      ctx.font = `8px ${MONO}`;
      const bw = Math.max(56, ctx.measureText(label).width) + 10, bh = 56 + 2 + 10 + 10, bx = W - 12 - bw, by = H - 46 - bh;
      roundRect(ctx, bx, by, bw, bh, 7); ctx.fillStyle = rgba(DS.screenAlt, 0.6); ctx.fill(); stroke(ctx, rgba(DS.hairline, 0.10), 1);
      const s = (56 / 2 - 7) / F.maxR, ca = Math.cos(P.az), sa = Math.sin(P.az), ct = Math.cos(P.tilt), st = Math.sin(P.tilt);
      const icx = bx + bw / 2, icy = by + 5 + 28;
      const ipt = (v) => { const x1 = v[0] * ca - v[1] * sa, y1 = v[0] * sa + v[1] * ca; return [icx - x1 * s, icy + (y1 * ct - v[2] * st) * s]; };
      ctx.beginPath();
      for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) { const p = ipt(F.v[i][1]), q = ipt(F.v[j][1]); ctx.moveTo(...p); ctx.lineTo(...q); }
      stroke(ctx, "rgba(255,255,255,0.25)", 0.7);
      for (const [n, v] of F.v) { const q = ipt(v); circle(ctx, q[0], q[1], 2.5, rgba(PROBE[n])); formDots.push({ n, q }); }
      text(ctx, label, icx, by + bh - 9, `8px ${MONO}`, rgba(DS.textMuted));
      // the IMF clock angle, from the Sun: 0° north, 180° south
      if (isFinite(w.by) && isFinite(w.bz)) {
        const dw = 44, dh = 34 + 2 + 10 + 10, dx = bx - 8 - dw, dy = by + bh - dh, col = w.bz < 0 ? DS.gold : DS.accentLight;
        roundRect(ctx, dx, dy, dw, dh, 7); ctx.fillStyle = rgba(DS.screenAlt, 0.6); ctx.fill(); stroke(ctx, rgba(DS.hairline, 0.10), 1);
        const cx = dx + dw / 2, cy = dy + 5 + 17, theta = Math.atan2(w.by, w.bz);
        ctx.beginPath(); ctx.arc(cx, cy, 16.5, 0, TAU); stroke(ctx, rgba(DS.hairline, 0.18), 1);
        text(ctx, "N", cx, cy - 13, `700 6px ${MONO}`, rgba(DS.textMuted)); text(ctx, "S", cx, cy + 13, `700 6px ${MONO}`, rgba(DS.textMuted));
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(theta);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -12); stroke(ctx, rgba(col), 2, null, "round");
        ctx.restore();
        circle(ctx, cx, cy, 1.75, rgba(col));
        const bt = Math.hypot(w.by, w.bz), ang = bt > 0 ? Math.acos(clamp(w.bz / bt, -1, 1)) * 180 / Math.PI : 0;
        text(ctx, `θc ${ang.toFixed(0)}°`, cx, dy + dh - 9, `600 8px ${MONO}`, rgba(col));
      }
    }

    // ── one frame ──
    let pending = false;
    function request() { if (!pending) { pending = true; requestAnimationFrame(() => { pending = false; draw(); }); } }
    function draw() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2), W = cv.clientWidth, H = cv.clientHeight;
      if (!W || !H) return;
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
      const ctx = cv.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const top = root.querySelector(".hso-head") ? Math.min(92, root.querySelector(".hso-head").offsetHeight + 14) : 0;
      P = project(W, H, top);
      geometry(time);
      const B = G.B;
      rings = [];

      drawStars(ctx, dpr);
      root.classList.toggle("far", rung === "sun" || rung === "leo");
      if (rung === "sun") { drawHelio(ctx, dpr); drawAxes(ctx); updateSW(); return; }
      const sun = skySun();
      if (sun) drawSkySun(ctx, sun);
      drawSkyPlanets(ctx);
      if (rung === "leo") {
        drawLEO(ctx, dpr);
        if (sun) text(ctx, "☀ Sun", sun.q[0], sun.q[1] + Math.max(12, 3 * sun.r) + 6, `600 10px ${MONO}`, "#FFE08A");
        drawAxes(ctx); updateSW();
        return;
      }

      // the magnetosheath between the shock and the magnetopause, the magnetosphere's body, the shock and the
      // magnetopause's soft three-stroke rim, gold under a southward IMF
      const rim = B.south ? DS.gold : 0x9fd6ff;
      if (show.bs && show.mp) {
        path(ctx, G.bs, true);
        const q = G.mp;
        for (let i = 0; i < q.length; i++) { const p = P.pt([q[i][0], q[i][1], 0]); if (i) ctx.lineTo(...p); else ctx.moveTo(...p); }
        ctx.fillStyle = tailShade(ctx, 0x2a4a6e, 0.20); ctx.fill("evenodd");
      }
      if (show.mp) { path(ctx, G.mp, true); ctx.fillStyle = tailShade(ctx, 0x14365f, 0.20); ctx.fill(); }
      if (show.bs) { path(ctx, G.bs, true); stroke(ctx, tailShade(ctx, 0x6fb0e0, 0.5), 1, [5, 4]); }
      if (show.mp) {
        path(ctx, G.mp, true);
        stroke(ctx, tailShade(ctx, rim, 0.10), 6); stroke(ctx, tailShade(ctx, rim, 0.22), 3); stroke(ctx, tailShade(ctx, rim, 0.85), 1.2);
        for (const g of G.ghosts) { path(ctx, g.pts, true); stroke(ctx, tailShade(ctx, rim, 0.26 * g.alpha), 1, [2, 3]); }
      }
      // the 3-D shells and the plasma sheet, fading in as the view tilts
      const vis = Math.sin(P.tilt);
      if (vis > 0.02) {
        const Wf = wireframe(), mpC = B.south ? DS.gold : 0x8fd0ff;
        const sets = [];
        if (show.bs) sets.push([Wf.bs, Wf.bsRings, 0x6fb0e0, 0.24 * vis, [4, 4]]);
        if (show.mp) sets.push([Wf.mp, Wf.mpRings, mpC, 0.30 * vis, []]);
        for (const [mer, rngs, col, a, dash] of sets) {
          for (const m of mer) { path(ctx, m); stroke(ctx, tailShade(ctx, col, a), 0.7, dash); }
          for (const [x, r] of rngs) { const ta = tailAlpha(x); if (ta <= 0.02) continue; path(ctx, r); stroke(ctx, rgba(col, a * 0.7 * ta), 0.7, dash); }
        }
      }
      if (vis > 0.05) {
        const psi = clamp(B.lin.tilt, -0.6, 0.6), zNS = (x) => Math.tan(psi) * Math.min(-x, 12);
        const xs = Array.from({ length: 26 }, (_, i) => -10 - 50 * i / 25);
        path(ctx, xs.map(x => [x, 0, zNS(x) + 2.5]).concat(xs.slice().reverse().map(x => [x, 0, zNS(x) - 2.5])));
        ctx.closePath(); ctx.fillStyle = tailShade(ctx, 0xffa050, 0.10 * vis); ctx.fill();
        path(ctx, xs.map(x => [x, 0, zNS(x)])); stroke(ctx, tailShade(ctx, 0xff8c4d, 0.5 * vis), 0.9, [5, 4]);
        if (vis > 0.3) { const q = P.pt([-30, 0, zNS(-30) + 4.5]); text(ctx, "plasma sheet", q[0], q[1], `8px ${MONO}`, rgba(0xffa050, 0.6 * vis)); }
      }
      // the dipole's L = 4, 6.5 and 9 shells where they cross its equator, and the noon–midnight lines when tilted
      const SM = frameAt("sm", time), dip = (x, y, z) => mul(SM, [x, y, z]);
      [4, 6.5, 9].forEach((L, i) => {
        const a = 0.30 - i * 0.07;
        path(ctx, Array.from({ length: 73 }, (_, k) => dip(L * Math.cos(TAU * k / 72), L * Math.sin(TAU * k / 72), 0)));
        stroke(ctx, tailShade(ctx, 0x5b8cff, a), 0.8);
        if (vis <= 0.05) return;
        const lamMax = Math.acos(Math.sqrt(1 / L));
        for (const sg of [1, -1]) {
          path(ctx, Array.from({ length: 41 }, (_, k) => { const lam = -lamMax + 2 * lamMax * k / 40, r = L * Math.cos(lam) ** 2; return dip(sg * r * Math.cos(lam), 0, r * Math.sin(lam)); }));
          stroke(ctx, rgba(0x5b8cff, a * vis), 0.8);
        }
      });
      // the Earth's umbra
      {
        path(ctx, [[0, 1, 0], [-45, 0.82, 0], [-45, -0.82, 0], [0, -1, 0]]); ctx.closePath();
        const p0 = P.earth, p1 = P.pt([-45, 0, 0]);
        if (Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) >= 1) {
          const g = ctx.createLinearGradient(p0[0], p0[1], p1[0], p1[1]);
          g.addColorStop(0, "rgba(0,0,0,0.34)"); g.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = g; ctx.fill();
        }
      }
      // the field topology (the demo's own)
      if (show.topo && topoSegs) {
        for (const [k, col, a] of [["closed", "150,200,255", 0.38], ["open", "190,160,255", 0.34]]) {
          ctx.beginPath();
          for (const run of topoSegs[k]) for (let i = 0; i < run.length; i++) { const q = P.pt(run[i]); if (i) ctx.lineTo(...q); else ctx.moveTo(...q); }
          stroke(ctx, `rgba(${col},${a})`, 0.8);
        }
      }
      // MMS's orbit: one period, dashed, with the direction of travel a quarter of the way round
      path(ctx, loopPts); stroke(ctx, "rgba(255,255,255,0.85)", 0.9, [7, 5], "round");
      if (P.scale > 2.5 && loopPts.length > 8) {
        const k = loopPts.length >> 2, a = P.pt(loopPts[k]), b = P.pt(loopPts[k + 1]);
        const l = Math.max(Math.hypot(b[0] - a[0], b[1] - a[1]), 0.001), ux = (b[0] - a[0]) / l, uy = (b[1] - a[1]) / l;
        ctx.beginPath();
        ctx.moveTo(...b); ctx.lineTo(b[0] - ux * 7 - uy * 4, b[1] - uy * 7 + ux * 4);
        ctx.moveTo(...b); ctx.lineTo(b[0] - ux * 7 + uy * 4, b[1] - uy * 7 - ux * 4);
        stroke(ctx, "rgba(255,255,255,0.6)", 1.4);
      }
      for (const th of S.themis) { path(ctx, th.track); stroke(ctx, "rgba(255,255,255,0.22)", 0.9, [3, 3]); }
      drawEarth(ctx, dpr);

      const fl = fleetNow(), thNow = S.themis.map(x => P.pt(posAt(x, time)));
      const mmsMarks = drawMMS(ctx, fl.map(x => x.q).concat(thNow));
      const thMarks = drawThemis(ctx, fl.map(x => x.q).concat(mmsMarks));
      drawFleet(ctx, fl, thMarks.concat(mmsMarks));
      drawL1Lags(ctx);
      if (sun) text(ctx, "☀ Sun", sun.q[0], sun.q[1] + Math.max(12, 3 * sun.r) + 6, `600 10px ${MONO}`, "#FFE08A");
      if (show.mp) labelAlong(ctx, G.mp, "MAGNETOPAUSE", B.south ? rgba(DS.gold, 0.9) : rgba(0x8fd0ff, 0.9), 0.30);
      if (show.bs) labelAlong(ctx, G.bs, "BOW SHOCK", rgba(0x34d27b, 0.85), 0.265);
      if (show.mp) labelAlong(ctx, G.mp, "magnetosheath", rgba(0x5b8cff, 0.6), 0.165, 11);
      { const q = P.pt([-18, 0, 0]); text(ctx, "magnetotail", q[0], q[1], `9px ${MONO}`, "rgba(255,255,255,0.32)"); }
      drawAxes(ctx);
      drawRulers(ctx);
      // the clickable rings over each spacecraft
      for (const r of rings) {
        ctx.beginPath(); ctx.arc(r.q[0], r.q[1], 7.5 - 0.65, 0, TAU);
        stroke(ctx, rgba(r.color, hover && hover.ring === r ? 1 : 0.85), 1.3);
      }
      drawInsets(ctx, G.w);
      updateSW();
    }

    // ── the solar-wind card (SolarWindCallout) ──
    function updateSW() {
      if (!swBox) return;
      const w = G.w, Dp = w.n > 0 && w.v > 0 ? 2e-6 * w.n * w.v * w.v : NaN, south = isFinite(w.bz) && w.bz < 0;
      const f = (v, d, u) => (isFinite(v) ? `${v.toFixed(d)} ${u}` : "—");
      const html = `<p class="sw-h"><b>SOLAR WIND</b><span>OMNI</span></p>` +
        `<p><span>Speed</span><b>${f(w.v, 0, "km/s")}</b></p><p><span>Density</span><b>${f(w.n, 1, "cm⁻³")}</b></p>` +
        `<p><span>IMF Bz</span><b>${isFinite(w.bz) ? (w.bz >= 0 ? "+" : "") + w.bz.toFixed(1) + " nT" : "—"}</b></p>` +
        `<p><span>Dyn. press</span><b>${f(Dp, 1, "nPa")}</b></p>` +
        (south ? `<p class="sw-s">southward · geoeffective</p>` : "") +
        `<p class="sw-t">Oct 16 · ${o.clock(w.t - 30).slice(0, 5)} UTC</p>`;
      if (swBox.dataset.html !== html) { swBox.innerHTML = html; swBox.dataset.html = html; swBox.classList.toggle("south", south); }
    }

    // ── pointing: drag to turn the view (azimuth, tilt), click a spacecraft, hover the orbit ──
    const hit = (x, y) => {
      if (rung === "leo") {
        for (const m of stationMarks) if (Math.hypot(m.q[0] - x, m.q[1] - y) < 8) return { ring: { kind: "station", name: m.s.name, code: m.s.code, m } };
        return null;
      }
      if (rung === "sun") return null;
      for (const d of formDots) if (Math.hypot(d.q[0] - x, d.q[1] - y) < 6.5) return { dot: d };
      let best = null;
      for (const r of rings) { const d = Math.hypot(r.q[0] - x, r.q[1] - y); if (d < 14 && (!best || d < best.d)) best = { ring: r, d }; }
      return best;
    };
    function nearestOrbit(x, y) {
      let best = null;
      for (let i = 0; i < trackP.length; i++) {
        const q = P.pt(trackP[i]), d = Math.hypot(q[0] - x, q[1] - y);
        if (!best || d < best.d) best = { d, i, q };
      }
      return best && best.d < 26 ? best : null;
    }
    function showCard(h) {
      if (!h) { card.hidden = true; return; }
      const p = trackP[h.i], [name, col] = region(p, G.B), w = 158, hh = 58;
      card.innerHTML = `<p class="hc-r" style="--c:${rgba(col)}"><i></i>${name}</p>` +
        `<p class="hc-p">GSE  ${p.map(v => (v >= 0 ? "+" : "") + v.toFixed(1)).join("  ")}</p>` +
        `<p class="hc-t">|r| ${len3(p).toFixed(1)} Rₑ · ${o.stamp(trackT[h.i])}</p>`;
      card.style.borderColor = rgba(col, 0.45);
      let x = h.q[0] + 16;
      if (x + w > P.W - 6) x = h.q[0] - 16 - w;
      card.style.left = `${clamp(x, 6, P.W - w - 6)}px`;
      card.style.top = `${clamp(h.q[1] - 8, hh / 2 + 6, P.H - hh / 2 - 6) - hh / 2}px`;
      card.hidden = false;
    }
    let drag = null, toastTimer = 0;
    function say(msg) {
      toast.textContent = msg; toast.hidden = false;
      clearTimeout(toastTimer); toastTimer = setTimeout(() => { toast.hidden = true; }, 2600);
    }
    cv.addEventListener("pointerdown", (e) => {
      const r = cv.getBoundingClientRect();
      drag = { x: e.clientX, y: e.clientY, az: view.az, tilt: view.tilt, lat: leoCam.lat, lon: leoCam.lon, moved: false, px: e.clientX - r.left, py: e.clientY - r.top };
      cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener("pointermove", (e) => {
      const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (!drag.moved && Math.hypot(dx, dy) < 4) return;
        drag.moved = true; anim = null;
        cv.classList.add("grabbing"); card.hidden = true;
        if (rung === "leo") {                               // grab the globe: the ground follows the pointer
          const k = 1 / Math.max(P.scale, 1) / DEG;
          leoCam.lat = clamp(drag.lat + dy * k, -85, 85);
          leoCam.lon = ((drag.lon - dx * k / Math.max(Math.cos(leoCam.lat * DEG), 0.2)) + 540) % 360 - 180;
          dragging = true;
        } else {
          view.az = drag.az + dx * 0.008;
          view.tilt = clamp(drag.tilt + dy * 0.008, 0, Math.PI / 2);
          presetSync();
        }
        request();
        return;
      }
      if (!P || e.pointerType === "touch") return;
      const h = hit(x, y);
      cv.style.cursor = h ? "pointer" : "";
      cv.title = h ? (h.dot ? `Open MMS${h.dot.n} data window` : h.ring.kind === "station"
        ? `${h.ring.name} · ${h.ring.m.s.nets.map(k => NET_NAME[k]).join(" + ")} · Sun ${h.ring.m.elev.toFixed(0)}° · ${h.ring.m.imaging ? "imaging" : "daylight"}`
        : `Open ${h.ring.name} data window`) : "";
      const prev = hover;
      hover = h && h.ring ? { ring: h.ring, station: h.ring.code } : null;
      showCard(h || rung === "leo" || rung === "sun" ? null : nearestOrbit(x, y));
      if ((prev && prev.ring) !== (hover && hover.ring)) request();
    });
    const end = (e) => {
      if (!drag) return;
      const was = drag;
      drag = null; cv.classList.remove("grabbing");
      if (dragging) { dragging = false; request(); }
      if (was.moved || e.type === "pointercancel") return;
      const h = hit(was.px, was.py);
      if (!h) return;
      if (h.dot) o.onMMS(h.dot.n, time);
      else if (h.ring.kind === "mms") o.onMMS(1, time);
      else if (h.ring.kind === "station") say(`In Helios, this opens ${h.ring.name}'s keogram for the day.`);
      else if (!(o.onOther && o.onOther(h.ring.name, time))) say(`In Helios, this opens ${h.ring.name}'s data. The demo carries MMS1–4, THEMIS-A and Cluster 4.`);
    };
    cv.addEventListener("pointerup", end);
    cv.addEventListener("pointercancel", end);
    cv.addEventListener("pointerleave", () => { if (!drag) { card.hidden = true; if (hover) { hover = null; request(); } } });

    // ── the view presets (Top · XY, Side · XZ, Front · YZ, 3D), eased like the app's ──
    const PRESETS = { top: [0, 0], side: [0, Math.PI / 2], front: [Math.PI / 2, Math.PI / 2], "3d": [-0.5, 0.95] };
    const presetBtns = Array.from(root.querySelectorAll("[data-preset]"));
    function presetSync() {
      for (const b of presetBtns) {
        const [az, tl] = PRESETS[b.dataset.preset], d = Math.atan2(Math.sin(view.az - az), Math.cos(view.az - az));
        b.setAttribute("aria-pressed", String(Math.abs(d) < 1e-3 && Math.abs(view.tilt - tl) < 1e-3));
      }
    }
    function goTo(key) {
      const [az1, tl1] = PRESETS[key], az0 = view.az, tl0 = view.tilt;
      const daz = Math.atan2(Math.sin(az1 - az0), Math.cos(az1 - az0)), t0 = performance.now(), me = {};
      anim = me;
      const step = (now) => {
        if (anim !== me) return;
        const u = clamp((now - t0) / 450, 0, 1), e = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
        view.az = az0 + daz * e; view.tilt = tl0 + (tl1 - tl0) * e;
        if (u >= 1) { view.az = az1; view.tilt = tl1; anim = null; }
        presetSync(); draw();
        if (u < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
    for (const b of presetBtns) b.addEventListener("click", () => goTo(b.dataset.preset));
    const rungBtns = Array.from(root.querySelectorAll("[data-rung]"));
    function setRung(key) {
      if (key === rung) return;
      const near = (k) => k === "mag" || k === "moon" || k === "l1";
      if (P && near(key) && near(rung)) zoomFrom = { scale: P.scale, c: P.c, t0: performance.now() };
      rung = key;
      for (const b of rungBtns) { const on = b.dataset.rung === key; b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); }
      card.hidden = true; hover = null;
      if (o.onRung) o.onRung(key);
      request();
    }
    for (const b of rungBtns) b.addEventListener("click", () => setRung(b.dataset.rung));
    const linked = /view=(top|side|front|3d)/.exec(location.hash);       // hso.html#view=side opens on that view
    if (linked) [view.az, view.tilt] = PRESETS[linked[1]];
    presetSync();

    new ResizeObserver(() => { skyCache = null; request(); }).observe(root);
    return {
      get time() { return time; },
      setTime(t) { time = t; request(); },
      setView(key, on) { show[key] = on; request(); },
      setTopology(d) { topo = d; clipTopology(); request(); },
      setRung,
      say,
      redraw: request,
    };
  };
})();
