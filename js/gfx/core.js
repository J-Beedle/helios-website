/* The site's second-generation figures (js/gfx/*) share this: the palette, a canvas that draws only while it is on
 * screen, and the published models the figures are computed from — Shue et al. (1998), Lin et al. (2010) with the
 * Petrinec & Russell (1996) tail, Jelínek et al. (2012), the Rankine–Hugoniot jump at the bow shock, the conic fits
 * used at Mercury, Venus and Mars, Joy et al. (2002) at Jupiter and Starkov's auroral oval. The boundary code is the
 * same as js/hsoview.js, which was ported from Helios's MagnetosphereModel.swift.
 *
 * The first-generation figures (js/hero.js, js/models.js, js/worlds.js, js/artemis.js and the videos) are kept as
 * they were: js/gfx/switch.js chooses which set a page shows, and compare.html puts them side by side. */
(function () {
  "use strict";
  const TAU = Math.PI * 2, DEG = Math.PI / 180;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, u) => a + (b - a) * u;
  const smooth = (a, b, x) => { const u = clamp((x - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); };
  const rgba = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const mixc = (a, b, u) => [0, 1, 2].map(i => Math.round(a[i] + (b[i] - a[i]) * u));

  /** One palette for every figure: gold is the Sun's field, pale blue closed field, violet open field, orange
   *  plasma, cyan the bow shock, green the aurora. */
  const PAL = {
    imf: [245, 200, 95], closed: [150, 200, 255], open: [190, 160, 255], loose: [255, 176, 120],
    shock: [158, 224, 255], mp: [205, 222, 255], plasma: [255, 150, 90], aurora: [90, 255, 165], wind: [255, 240, 205],
    text: "rgba(244,245,247,0.82)", muted: "rgba(244,245,247,0.55)", faint: "rgba(244,245,247,0.32)", sun: "rgba(255,206,140,0.9)",
    accent: [247, 197, 92], bg: "#03050b",
  };

  /** A seeded generator (mulberry32), so a figure's stars and streaks are the same on every visit. */
  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ───────────────────────── the models ─────────────────────────
  const M = {};
  /** Shue et al. (1998): the stand-off distance and flaring for a dynamic pressure [nPa] and IMF Bz [nT]. */
  M.shue = (pd, bz) => ({ r0: (10.22 + 1.29 * Math.tanh(0.184 * (bz + 8.14))) * Math.pow(pd, -1 / 6.6),
                          alpha: Math.max((0.58 - 0.007 * bz) * (1 + 0.024 * Math.log(pd)), 0.05) });
  M.shueR = (th, r0, al) => r0 * Math.pow(2 / Math.max(1 + Math.cos(th), 1e-9), al);

  /** Jelínek et al. (2012): a paraboloid ρ² = 4R(R − x)/λ², blended past x = −30 into the Mach cone, as Helios draws it. */
  M.jelinek = (pd, mach = 8) => ({ R: 15.02 * Math.pow(pd, -1 / 6.55), lam: 1.17, mach });
  const paraRho = (x, R, lam) => Math.sqrt(4 * R * (R - x)) / lam;
  M.bsRho = (x, B) => {
    const R = B.R, lam = B.lam;
    if (x > R) return null;
    const xb = Math.min(-30, R - 1);
    if (!(x < xb)) return paraRho(x, R, lam);
    const m = Math.max(B.mach, 1.5), sM = 1 / Math.sqrt(m * m - 1);
    const rhoB = paraRho(xb, R, lam), sJ = 2 * R / (lam * Math.sqrt(4 * R * (R - xb))), L = 30;
    return rhoB + sM * (xb - x) + (sJ - sM) * L * (1 - Math.exp((x - xb) / L));
  };
  M.bsRadius = (th, B) => {
    const R = B.R, c = Math.cos(th), s = Math.sin(th);
    const d = c + Math.sqrt(c * c + B.lam * B.lam * s * s), rPar = d > 1e-9 ? 2 * R / d : Infinity;
    if (!isFinite(rPar) || !(rPar * c < Math.min(-30, R - 1))) return rPar;
    const f = (r) => r * s - (M.bsRho(r * c, B) ?? 0);
    let lo = 0, hi = 4000;
    if (!(f(hi) > 0)) return Infinity;
    for (let i = 0; i < 60; i++) { const mid = 0.5 * (lo + hi); if (f(mid) < 0) lo = mid; else hi = mid; }
    return 0.5 * (lo + hi);
  };

  /** Petrinec & Russell (1996): the tail's flaring and its asymptotic radius. */
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
  function tailRho(x, rhoT, alpha, pr) {
    const base = Math.min(rhoT + PR.flare(x, pr), Math.max(PR.asym(pr), rhoT)), slope = PR.flare(-1e-4, pr) / -1e-4;
    return Math.max(base + seam(x, rhoT, alpha, slope), rhoT);
  }

  /** Lin et al. (2010): the three-dimensional magnetopause, with its cusp indentations and the dipole tilt. */
  const LA = [12.544, -0.194, 0.305, 0.0573, 2.178, 0.0571, -0.999, 16.473, 0.00152, 0.382, 0.0431, -0.00763, -0.210, 0.0405,
              -4.430, -0.636, -2.600, 0.832, -5.328, 1.103, -0.907, 1.450];
  const Lin = {
    pm: (bt) => 3.979e-4 * bt * bt,
    ptot: (p) => Math.max(p.pd + p.pm, 0.01),
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
  /** Lin's surface in the noon–midnight plane, north (sign +1) or south (−1): nose to terminator, then the P&R tail.
   *  p = { pd [nPa], bz [nT], bt [nT], tilt [rad] }. Returns [[x, z], …] in Earth radii. */
  M.linMeridian = (p, sign = 1, tail = 260) => {
    const q = { pd: p.pd, pm: Lin.pm(p.bt ?? Math.abs(p.bz)), bz: p.bz, tilt: p.tilt || 0 }, pr = { pd: Math.max(p.pd, 0.1), bz: p.bz };
    const phi = sign > 0 ? Math.PI / 2 : 3 * Math.PI / 2, prof = [], nF = 240, nT = 200;
    for (let i = 0; i <= nF; i++) { const th = Math.PI / 2 * i / nF, r = Lin.radius(th, phi, q); prof.push([r * Math.cos(th), sign * r * Math.sin(th)]); }
    const last = prof[nF], prev = prof[nF - 1], rhoT = Math.abs(last[1]), dx = last[0] - prev[0];
    const alphaEff = Math.abs(dx) > 1e-9 ? -(Math.abs(last[1]) - Math.abs(prev[1])) / dx : 0;
    const pw = clamp(Math.log(tail / Math.max(rhoT * (Math.PI / 2) / nF, 1e-6)) / Math.log(nT), 1, 3);
    for (let i = 1; i <= nT; i++) { const x = -tail * Math.pow(i / nT, pw); prof.push([x, sign * tailRho(x, rhoT, alphaEff, pr)]); }
    return prof;
  };
  M.Lin = Lin;

  /** The density jump across a shock of normal Mach number mn (Rankine–Hugoniot, γ = 5/3 unless given). */
  M.rh = (mn, g = 5 / 3) => (mn > 1 ? (g + 1) * mn * mn / ((g - 1) * mn * mn + 2) : 1);

  /** A conic of revolution about the planet–Sun line, r = L / (1 + ε cos θ) from a focus at x0 (Slavin's form). */
  M.conic = (x0, eps, L) => ({ x0, eps, L, nose: x0 + L / (1 + eps),
    /** [[x, ρ], …] from the nose to x = tail. */
    points(tail, n = 240) {
      const out = [];
      for (let i = 0; i <= n; i++) {
        const th = Math.PI * 0.999 * Math.pow(i / n, 1.15), d = 1 + eps * Math.cos(th);
        if (d <= 1e-3) break;
        const r = L / d, x = x0 + r * Math.cos(th);
        if (x < tail) { const p = out[out.length - 1], f = (tail - p[0]) / (x - p[0]); out.push([tail, p[1] + (r * Math.sin(th) - p[1]) * f]); break; }
        out.push([x, r * Math.sin(th)]);
      }
      return out;
    } });

  /** Joy et al. (2002) at Jupiter: z² = A + Bx + Cx² in the noon–midnight cut (x, z in units of 120 R_J; here R_J). */
  M.joy = (kind, p) => {
    const c = kind === "mp" ? [-0.134, 0.488, -0.581, -0.225, -0.186, -0.016] : [-1.107, 1.591, -0.566, -0.812, 0.048, -0.059];
    const q = Math.pow(clamp(p, 0.02, 0.6), -0.25), A = c[0] + c[1] * q, B = c[2] + c[3] * q, C = c[4] + c[5] * q;
    const nose = 120 * (-B - Math.sqrt(B * B - 4 * A * C)) / (2 * C);
    return { nose, points(tail, n = 240) {
      const out = [];
      for (let i = 0; i <= n; i++) { const x = nose + (tail - nose) * Math.pow(i / n, 1.6), xs = x / 120, z2 = A + B * xs + C * xs * xs; if (z2 < 0) continue; out.push([x, 120 * Math.sqrt(z2)]); }
      return out;
    } };
  };

  /** Starkov (1994) with Sigernes et al. (2011)'s coefficients: the oval's poleward (m = 0) and equatorward (1) edges
   *  and the diffuse aurora's (2), as corrected-geomagnetic colatitude [deg] at magnetic local time t [h]. */
  const SB = [
    [[-0.07, -10.06, -4.44, -3.77, -6.61, 6.37, -4.48], [24.54, 19.83, 7.47, 7.90, 10.17, -1.10, 10.16],
     [-12.53, -9.33, -3.01, -4.73, -5.80, 0.34, -5.87], [2.15, 1.24, 0.25, 0.91, 1.19, -0.38, 0.98]],
    [[1.61, -9.59, -12.07, -6.56, -2.22, -23.98, -20.07], [23.21, 17.78, 17.49, 11.44, 1.50, 42.79, 36.67],
     [-10.97, -7.20, -7.96, -6.73, -0.58, -26.96, -24.20], [2.03, 0.96, 1.15, 1.31, 0.08, 5.56, 5.11]],
    [[3.44, -2.41, -0.74, -2.12, -1.68, 8.69, 8.61], [29.77, 7.89, 3.94, 3.24, -2.48, -20.73, -5.34],
     [-16.38, -4.32, -3.09, -1.67, 1.58, 13.03, -1.36], [3.35, 0.87, 0.72, 0.31, -0.28, -2.14, 0.76]],
  ];
  M.starkovAL = (kp) => { const k = clamp(kp, 0, 9); return 18 - 12.3 * k + 27.2 * k * k - 2.0 * k * k * k; };
  M.starkov = (m, t, al) => {
    const x = Math.log10(clamp(Math.abs(al), 10, 780)), p = [1, x, x * x, x * x * x], c = new Array(7).fill(0);
    for (let j = 0; j < 7; j++) for (let i = 0; i < 4; i++) c[j] += SB[m][i][j] * p[i];
    return c[0] + c[1] * Math.cos(15 * (t + c[4]) * DEG) + c[2] * Math.cos(15 * (2 * t + c[5]) * DEG) + c[3] * Math.cos(15 * (3 * t + c[6]) * DEG);
  };

  // ───────────────────────── a canvas that draws while it is on screen ─────────────────────────
  /** o.draw(ctx, w, h, t, dt, st) draws one frame in CSS pixels; o.resize(st) hears of a new size. The clock t runs
   *  only while the canvas is on screen and the tab is in front; reduced motion holds it at o.stillAt. Returns
   *  { redraw(), playing, t }. With o.animate false the figure draws only on redraw(). */
  function stage(canvas, o) {
    const reduce = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const st = { canvas, t: reduce ? (o.stillAt || 0) : 0, w: 0, h: 0, dpr: 1, playing: o.animate !== false && !reduce, visible: true, reduce };
    let dirty = true, last = 0, queued = false;
    const size = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, o.maxDpr || 2), w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return false;
      const W = Math.round(w * dpr), H = Math.round(h * dpr);
      if (canvas.width !== W || canvas.height !== H || st.w !== w || st.h !== h) {
        canvas.width = W; canvas.height = H; st.w = w; st.h = h; st.dpr = dpr;
        if (o.resize) o.resize(st);
      }
      return true;
    };
    const frame = (now) => {
      queued = false;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      const live = st.playing && st.visible && !document.hidden;
      if (live) st.t += dt * (st.rate ?? 1);
      if ((live || dirty) && size()) {
        dirty = false;
        const ctx = canvas.getContext("2d");
        ctx.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
        try { o.draw(ctx, st.w, st.h, st.t, live ? dt : 0, st); } catch (e) { console.error(e); }   // one bad frame must not stop the loop
      }
      if (live) queue(); else last = 0;
    };
    const queue = () => { if (!queued) { queued = true; requestAnimationFrame(frame); } };
    st.redraw = () => { dirty = true; queue(); };
    st.play = (on) => { st.playing = on && !reduce; queue(); };
    new ResizeObserver(() => st.redraw()).observe(canvas);
    if ("IntersectionObserver" in window) new IntersectionObserver(es => { st.visible = es.some(e => e.isIntersecting); queue(); }, { rootMargin: "10% 0px" }).observe(canvas);
    document.addEventListener("visibilitychange", queue);
    queue();
    return st;
  }

  /** A sphere of radius R at (cx, cy), lit from the Sun's side (left unless sunRight), in a planet's color. */
  function ball(ctx, cx, cy, R, color, sunRight = false, glow = null) {
    if (glow) {
      const g = ctx.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.9);
      g.addColorStop(0, rgba(glow, 0.32)); g.addColorStop(1, rgba(glow, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * 1.9, 0, TAU); ctx.fill();
    }
    const s = sunRight ? 1 : -1, g = ctx.createRadialGradient(cx + s * R * 0.55, cy - R * 0.1, R * 0.05, cx + s * R * 0.1, cy, R * 1.25);
    g.addColorStop(0, rgba(mixc(color, [255, 255, 255], 0.28))); g.addColorStop(0.55, rgba(color)); g.addColorStop(0.86, rgba(mixc(color, [4, 6, 14], 0.86))); g.addColorStop(1, "rgb(4,6,14)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
  }

  /** An arrowhead at p pointing along (dx, dy). */
  function arrow(ctx, p, dx, dy, size, color) {
    const n = Math.hypot(dx, dy) || 1, ux = dx / n, uy = dy / n;
    ctx.fillStyle = color; ctx.beginPath();
    ctx.moveTo(p[0] + ux * size, p[1] + uy * size);
    ctx.lineTo(p[0] - ux * size * 0.7 - uy * size * 0.62, p[1] - uy * size * 0.7 + ux * size * 0.62);
    ctx.lineTo(p[0] - ux * size * 0.7 + uy * size * 0.62, p[1] - uy * size * 0.7 - ux * size * 0.62);
    ctx.closePath(); ctx.fill();
  }

  /** A polyline through pts ([x, y] or a flat Float32Array), rounded with quadratic joins. */
  function curve(ctx, pts, flat = false) {
    const n = flat ? pts.length >> 1 : pts.length;
    if (n < 2) return;
    const X = (i) => (flat ? pts[2 * i] : pts[i][0]), Y = (i) => (flat ? pts[2 * i + 1] : pts[i][1]);
    ctx.moveTo(X(0), Y(0));
    if (n === 2) { ctx.lineTo(X(1), Y(1)); return; }
    for (let i = 1; i < n - 1; i++) ctx.quadraticCurveTo(X(i), Y(i), (X(i) + X(i + 1)) / 2, (Y(i) + Y(i + 1)) / 2);
    ctx.lineTo(X(n - 1), Y(n - 1));
  }

  /** An orthographic globe drawn into cv (reused from call to call) from an equirectangular texture (ImageData):
   *  size pixels across, seen along view { right, down, toward } (unit vectors in the frame the Sun is +x of), the
   *  body's spin axis and prime meridian in that frame. The day side follows the Sun; night keeps `night` of the light. */
  function globe(cv, tex, size, view, axis, prime, night = 0.1) {
    if (cv.width !== size) cv.width = cv.height = size;
    const ctx = cv.getContext("2d"), img = ctx.createImageData(size, size), tw = tex.width, th = tex.height, td = tex.data;
    const east = [axis[1] * prime[2] - axis[2] * prime[1], axis[2] * prime[0] - axis[0] * prime[2], axis[0] * prime[1] - axis[1] * prime[0]];
    const R = view.right, D = view.down, Tw = view.toward;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size * 2 - 1, v = (y + 0.5) / size * 2 - 1, rr = u * u + v * v;
      if (rr > 1) continue;
      const w = Math.sqrt(1 - rr), px = u * R[0] + v * D[0] + w * Tw[0], py = u * R[1] + v * D[1] + w * Tw[1], pz = u * R[2] + v * D[2] + w * Tw[2];
      const lat = Math.asin(clamp(px * axis[0] + py * axis[1] + pz * axis[2], -1, 1));
      const lon = Math.atan2(px * east[0] + py * east[1] + pz * east[2], px * prime[0] + py * prime[1] + pz * prime[2]);
      const sx = Math.min(tw - 1, Math.floor((lon + Math.PI) / TAU * tw)), sy = Math.min(th - 1, Math.floor((Math.PI / 2 - lat) / Math.PI * th));
      const k = 4 * (sy * tw + sx), light = Math.max(night, smooth(-0.1, 0.2, px)) * (0.8 + 0.2 * w), o = 4 * (y * size + x);
      img.data[o] = td[k] * light + (1 - light) * 5; img.data[o + 1] = td[k + 1] * light + (1 - light) * 9; img.data[o + 2] = td[k + 2] * light + (1 - light) * 24;
      img.data[o + 3] = 255 * smooth(1.0, 0.985, Math.sqrt(rr));
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }

  window.HX = { TAU, DEG, clamp, lerp, smooth, rgba, mixc, PAL, rng, M, stage, ball, arrow, curve, globe };
})();
