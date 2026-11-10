/* The models page's figures, second generation. The models are the same ones (Shue et al. 1998, Jelínek et al. 2012,
 * IGRF + T89 as traced by Helios, AE-8/AP-8 as computed by Helios, Starkov's oval); what is new is what moves.
 *
 * - Boundaries: the solar wind flows through the figure and answers the sliders: straight to the shock, the
 *   Rankine–Hugoniot jump there, round the magnetopause (js/gfx/meridian.js), with its field draped over the nose
 *   and pointing the way the Bz slider says.
 * - Field lines: choosing a Kp moves each line to its new shape, beside the dipole line from the same footpoint.
 * - Radiation belts: the orbits that cross them, to scale, and trapped particles bouncing between their mirror
 *   points on dipole field lines (slowed down: a 1 MeV electron at L = 4 bounces about three times a second).
 * - The oval: Starkov's boundaries on the turning Earth, seen from above the geomagnetic pole, with places that
 *   light up while they are under it.
 */
(function () {
  "use strict";
  const HX = window.HX, { TAU, DEG, clamp, lerp, smooth, rgba, PAL, M, rng, curve } = HX;
  const $ = (s) => document.querySelector(s);
  const T = (...a) => window.FK.text(...a);
  const path = (ctx, pts, P) => { ctx.beginPath(); pts.forEach((q, i) => { const s = P(q[0], q[1]); i ? ctx.lineTo(s[0], s[1]) : ctx.moveTo(s[0], s[1]); }); };
  const lazy = (sel, fn) => { const el = $(sel); if (!el) return; const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); fn(el); } }, { rootMargin: "60% 0px" }); io.observe(el); };

  // ───────────────── boundaries: Shue et al. (1998) and Jelínek et al. (2012), with the flow ─────────────────
  function boundaries(canvas) {
    const pd = $("#in-pd"), bz = $("#in-bz"), GEO = 6.62, gc = [127, 212, 173];
    const shuePts = (r0, al, n = 400) => { const out = []; for (let k = 0; k <= n; k++) { const th = 2.98 * k / n, r = M.shueR(th, r0, al); out.push([r * Math.cos(th), r * Math.sin(th)]); } return out; };
    const bsPts = (B) => { const out = []; for (let i = 0; i <= 500; i++) { const th = Math.PI * 0.985 * i / 500, r = M.bsRadius(th, B); out.push([r * Math.cos(th), r * Math.sin(th)]); if (r * Math.cos(th) < -220) break; } return out; };
    const both = (pts) => pts.slice().reverse().map(q => [q[0], -q[1]]).concat(pts);
    const ref = M.shue(2, 0), refMP = both(shuePts(ref.r0, ref.alpha)), refBS = both(bsPts(M.jelinek(2)));
    let flow = null, flowKey = "", pending = 0, st;
    /** The flow for the sliders' solar wind: rebuilt a moment after they stop moving. */
    function build(p, b, zTop, xLeft, xRight) {
      const mp = M.shue(p, b), grid = { x0: Math.max(-70, Math.floor(xRight) - 2), x1: Math.min(Math.ceil(xLeft) + 1, 26), zmax: Math.min(40, Math.ceil(zTop) + 1), h: 0.32 };
      const E = HX.Meridian({ mp: shuePts(mp.r0, mp.alpha), bs: M.jelinek(p), grid, closed: true, q0: 0.22, rIn: 0.5, rCut: 0.5, thetaD: 13, thetaN: 19, dPsi: 0.02, dx: 9 });
      const r = rng(0xB0B0), n = 220, streaks = [];
      for (let s = 0; s < 200; s++) {
        const rho0 = 0.15 + (zTop + 2) * r(), sg = r() < 0.5 ? -1 : 1, pth = E.streamline(rho0, xLeft + 2, xRight - 2);
        const tA = pth[0][2], tB = pth[pth.length - 1][2], pts = new Float32Array(n * 2), wt = new Float32Array(n);
        let j = 0;
        for (let i = 0; i < n; i++) {
          const tt = tA + (tB - tA) * i / (n - 1);
          while (j < pth.length - 2 && pth[j + 1][2] < tt) j++;
          const f = clamp((tt - pth[j][2]) / Math.max(pth[j + 1][2] - pth[j][2], 1e-9), 0, 1);
          pts[2 * i] = pth[j][0] + (pth[j + 1][0] - pth[j][0]) * f; pts[2 * i + 1] = sg * (pth[j][1] + (pth[j + 1][1] - pth[j][1]) * f);
          wt[i] = Math.min(1, (rho0 + 0.6) / (Math.abs(pts[2 * i + 1]) + 0.6));
        }
        streaks.push({ pts, wt, span: tB - tA, phase: r(), alpha: 0.25 + 0.55 * r(), trail: 0.3 + 0.2 * r(), n });
      }
      return { E, streaks, grid };
    }
    st = HX.stage(canvas, { stillAt: 6.2, draw(ctx, w, h, t) {
      const p = Math.pow(10, +pd.value), b = +bz.value;
      $("#out-pd").textContent = p.toFixed(p < 1 ? 2 : 1) + " nPa";
      $("#out-bz").textContent = (b > 0 ? "+" : b < 0 ? "−" : "") + Math.abs(b).toFixed(1) + " nT";
      const wide = w > 900, k = wide ? Math.min(h / 36, w / 64) : Math.min(h / 70, w / 40);
      const cx = w * (wide ? 0.64 : 0.62), cy = h * (wide ? 0.5 : 0.17), P = (x, z) => [cx - x * k, cy - z * k];
      const zTop = Math.max(cy, h - cy) / k, xLeft = cx / k, xRight = -(w - cx) / k;
      ctx.clearRect(0, 0, w, h);
      window.FK.stars(ctx, w, h, 200, 7);
      const sun = ctx.createRadialGradient(-w * 0.1, cy, 0, -w * 0.1, cy, w * 0.5);
      sun.addColorStop(0, "rgba(255,190,110,0.16)"); sun.addColorStop(1, "rgba(255,190,110,0)");
      ctx.fillStyle = sun; ctx.fillRect(0, 0, w, h);
      const mp = M.shue(p, b), B = M.jelinek(p), mpAll = both(shuePts(mp.r0, mp.alpha)), bsAll = both(bsPts(B));
      const key = [p.toFixed(3), b.toFixed(1), Math.round(zTop), Math.round(xLeft)].join();
      if (key !== flowKey) { flowKey = key; clearTimeout(pending); pending = setTimeout(() => { flow = build(p, b, zTop, xLeft, xRight); flow.key = key; st.redraw(); }, flow ? 90 : 10); }
      ctx.setLineDash([3, 5]); ctx.lineWidth = 1; ctx.strokeStyle = "rgba(255,255,255,0.2)";
      path(ctx, refMP, P); ctx.stroke(); path(ctx, refBS, P); ctx.stroke(); ctx.setLineDash([]);
      path(ctx, bsAll, P); ctx.fillStyle = rgba(PAL.shock, 0.07); ctx.fill();
      path(ctx, mpAll, P);
      const fill = ctx.createRadialGradient(cx, cy, 0, cx, cy, k * 30);
      fill.addColorStop(0, "rgba(27,49,99,0.92)"); fill.addColorStop(1, "rgba(11,21,48,0.88)");
      ctx.fillStyle = fill; ctx.fill();
      if (flow) {
        const live = flow.key === key ? 1 : 0.35, V = 5;         // while the sliders move, the last flow is shown faintly
        // the wind's field, draped: where the parcels that left together are now
        const dx = 9, E = flow.E, c = ((t * V) % dx + dx) % dx;
        ctx.save(); ctx.lineJoin = "round";
        const draw = (pts) => { const n = pts.length >> 1, f = new Float32Array(pts.length); for (let q = 0; q < n; q++) { f[2 * q] = cx - pts[2 * q] * k; f[2 * q + 1] = cy - pts[2 * q + 1] * k; } curve(ctx, f, true); };
        const arc = (x, z) => { const thk = Math.atan2(Math.abs(z), x), sg = z < 0 ? -1 : 1, out = []; for (let q = 1; q <= 24; q++) { const th = thk * (1 - q / 24), rr = E.rMP(th); out.push(rr * Math.cos(th), sg * rr * Math.sin(th)); } return out; };
        const strength = clamp(0.35 + Math.abs(b) / 6, 0.35, 1), heads = [];
        ctx.beginPath();
        for (const l of E.isochrones(c - E.tauX, dx, -E.tauX, 60 - flow.grid.x0 + 40 * dx - E.tauX)) {
          const q = l.pts, m = q.length;
          let pts = q;
          if (l.b === "M") pts = Array.from(pts).concat(arc(q[m - 2], q[m - 1]));
          if (l.a === "M") { const a = arc(q[0], q[1]), r2 = []; for (let i = a.length - 2; i >= 0; i -= 2) r2.push(a[i], a[i + 1]); pts = r2.concat(Array.from(pts)); }
          draw(pts);
        }
        for (let n = -8; n <= 8; n++) {                           // upstream of the grid the lines are straight
          const x = 60 - (c + n * dx);
          if (x > flow.grid.x1 && x < xLeft + 1) { const q = P(x, 0); ctx.moveTo(q[0], 0); ctx.lineTo(q[0], h); }
          if (x > B.R + 1.5 && x < xLeft + 1) heads.push(x);
        }
        ctx.lineWidth = 1.1; ctx.strokeStyle = rgba(PAL.imf, 0.78 * live * strength); ctx.stroke();
        if (Math.abs(b) > 0.25) for (const x of heads) for (const z of [zTop * 0.6, -zTop * 0.62]) HX.arrow(ctx, P(x, z), 0, b < 0 ? 1 : -1, 4.2, rgba(PAL.imf, 0.9 * live));
        ctx.globalCompositeOperation = "lighter"; ctx.lineCap = "round";
        for (const sk of flow.streaks) {
          const tt = (t * V + sk.phase * sk.span) % sk.span, n = sk.n, kf = tt / sk.span * (n - 1), len = Math.max(2, sk.trail * V / sk.span * (n - 1));
          if (kf < 0.5) continue;
          HX.trace(ctx, sk.pts, n, kf - len, kf, cx, cy, -k, -k);
          ctx.lineWidth = 1; ctx.strokeStyle = `rgba(255,240,205,${sk.alpha * sk.wt[Math.round(kf)] * 0.7 * live})`; ctx.stroke();
        }
        ctx.restore();
      }
      ctx.lineWidth = 1.6; ctx.strokeStyle = rgba(PAL.mp, 0.9); path(ctx, mpAll, P); ctx.stroke();
      ctx.setLineDash([6, 4]); ctx.lineWidth = 1.2; ctx.strokeStyle = rgba(PAL.shock, 0.75); path(ctx, bsAll, P); ctx.stroke(); ctx.setLineDash([]);
      // the dipole's inner field lines, for scale
      ctx.lineWidth = 1; ctx.strokeStyle = rgba(PAL.closed, 0.3);
      for (const Ls of [2, 4]) for (const sd of [1, -1]) { ctx.beginPath(); const lf = Math.acos(Math.sqrt(1 / Ls)); for (let i = 0; i <= 60; i++) { const la = -lf + 2 * lf * i / 60, r = Ls * Math.cos(la) ** 2, q = P(sd * r * Math.cos(la), r * Math.sin(la)); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); } ctx.stroke(); }
      window.FK.earth(ctx, cx, cy, Math.max(3, k));
      // geosynchronous orbit, 6.6 Rₑ: a strong enough push brings the magnetopause inside it
      const out = mp.r0 < GEO, col = out ? [255, 176, 96] : gc;
      ctx.setLineDash([4, 4]); ctx.lineWidth = 1.2; ctx.strokeStyle = rgba(col, 0.85);
      ctx.beginPath(); ctx.arc(cx, cy, GEO * k, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      const gl = out ? "Geosynchronous orbit: its day side is outside the magnetopause" : "Geosynchronous orbit 6.6 R_E";
      if (wide) { const g = P(-GEO * Math.SQRT1_2, GEO * Math.SQRT1_2); T(ctx, gl, g[0] + 6, g[1] - 8, { size: 12, color: rgba(col, 0.95) }); }
      else { const g = P(0, GEO); T(ctx, out ? "Geosynchronous: outside by day" : "Geosynchronous 6.6 R_E", g[0], g[1] - 9, { size: 11, align: "center", color: rgba(col, 0.95) }); }
      const m0 = P(mp.r0, 0), b0 = P(B.R, 0);
      ctx.fillStyle = rgba(PAL.accent); [m0, b0].forEach(s => { ctx.beginPath(); ctx.arc(s[0], s[1], 3, 0, TAU); ctx.fill(); });
      if (wide) {
        T(ctx, `Magnetopause ${mp.r0.toFixed(1)} R_E`, m0[0] + 12, m0[1] - 16, { size: 13 });
        T(ctx, `Bow shock ${B.R.toFixed(1)} R_E`, b0[0] - 12, b0[1] + 18, { size: 13, align: "right", color: PAL.muted });
        const tm = 1.2, rm = (M.shueR(tm, mp.r0, mp.alpha) + M.bsRadius(tm, B)) / 2, sh = P(rm * Math.cos(tm), -rm * Math.sin(tm));
        T(ctx, "Magnetosheath", sh[0], sh[1], { size: 11.5, align: "center", color: rgba(PAL.shock, 0.8) });
        window.FK.scaleBar(ctx, w - 190, h - 88, k, 10, "10 R_E");
      } else T(ctx, `Magnetopause ${mp.r0.toFixed(1)} R_E · bow shock ${B.R.toFixed(1)} R_E`, 20, cy + GEO * k + 30, { size: 12 });
      T(ctx, "← Sun", 22, h - 26, { size: 12, color: PAL.sun });
    } });
    [pd, bz].forEach(i => i.addEventListener("input", st.redraw));
  }

  // ───────────────── field lines: IGRF + T89 at each Kp, moving from one to the next ─────────────────
  async function fieldLines(canvas) {
    const data = await fetch("assets/data/t89-kp.json").then(r => r.json()), N = 90, KEYS = ["kp0", "kp1", "kp2", "kp3", "kp4", "kp5"];
    /** A line as N points evenly along its length, from its northern foot. */
    const even = (pts) => {
      const p = pts[pts.length - 1][1] > pts[0][1] ? pts.slice().reverse() : pts, d = [0];
      for (let i = 1; i < p.length; i++) d.push(d[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
      const out = new Float32Array(2 * N); let j = 0;
      for (let i = 0; i < N; i++) { const s = d[d.length - 1] * i / (N - 1); while (j < d.length - 2 && d[j + 1] < s) j++; const f = (s - d[j]) / Math.max(d[j + 1] - d[j], 1e-9); out[2 * i] = p[j][0] + (p[j + 1][0] - p[j][0]) * f; out[2 * i + 1] = p[j][1] + (p[j + 1][1] - p[j][1]) * f; }
      return out;
    };
    const sets = {};
    for (const key of KEYS) {
      // (At Kp 5+ T89's 76° noon line comes back inside the 73° one: outside its range there, and left out.)
      let reach = 0;
      sets[key] = data.lines[key].map(l => ({ lat: l.lat, noon: l.noon, open: l.open, e: even(l.p), drop: false }));
      for (const l of sets[key].filter(q => q.noon && !q.open).sort((a, b) => a.lat - b.lat)) { let x = -1e9; for (let i = 0; i < N; i++) x = Math.max(x, l.e[2 * i]); if (x < reach) l.drop = true; else reach = x; }
    }
    let kp = "kp2", from = "kp2", t0 = -9, intro = true, st;
    const dip = (lat, noon) => { const L = 1 / Math.cos(lat * DEG) ** 2, out = [], sd = noon ? 1 : -1; for (let i = 0; i <= 80; i++) { const la = lat * DEG * (1 - 2 * i / 80), r = L * Math.cos(la) ** 2; if (r > 60) continue; out.push([sd * r * Math.cos(la), r * Math.sin(la)]); } return out; };
    const go = (k) => { if (k === kp) return; from = kp; kp = k; t0 = performance.now(); document.querySelectorAll("#seg-kp button").forEach(x => x.setAttribute("aria-pressed", String(x.dataset.kp === k))); st.redraw(); };
    st = HX.stage(canvas, { animate: false, draw(ctx, w, h) {
      const k = Math.min(w / 58, h / 30), cx = w * 0.27, cy = h * 0.5, P = (x, z) => [cx - x * k, cy - z * k];
      ctx.clearRect(0, 0, w, h);
      window.FK.stars(ctx, w, h, 120, 3);
      const u0 = clamp((performance.now() - t0) / 700, 0, 1), u = u0 * u0 * (3 - 2 * u0), A = sets[from], Bq = sets[kp];
      // the dipole's line from each footpoint, for comparison
      ctx.setLineDash([2, 4]); ctx.lineWidth = 1; ctx.strokeStyle = "rgba(255,255,255,0.16)";
      for (const l of Bq) { if (l.lat > 76) continue; const d = dip(l.lat, l.noon); if (d.length > 2) { path(ctx, d, P); ctx.stroke(); } }
      ctx.setLineDash([]);
      ctx.lineJoin = "round";
      let far = null;
      for (let i = 0; i < Bq.length; i++) {
        const a = A[i], b = Bq[i], same = a.open === b.open && a.drop === b.drop;
        const one = (e, alpha, open) => {
          if (alpha <= 0.01) return;
          for (const flip of [1, -1]) { ctx.beginPath(); const f = new Float32Array(2 * N); for (let q = 0; q < N; q++) { f[2 * q] = cx - e[2 * q] * k; f[2 * q + 1] = cy - flip * e[2 * q + 1] * k; } curve(ctx, f, true); ctx.lineWidth = 1.25; ctx.strokeStyle = rgba(open ? PAL.open : PAL.closed, (open ? 0.72 : 0.88) * alpha); ctx.stroke(); if (open || !flip) continue; break; }
        };
        if (same) {                                              // the same kind of line at both: it moves
          if (b.drop) continue;
          const e = new Float32Array(2 * N); for (let q = 0; q < 2 * N; q++) e[q] = a.e[q] + (b.e[q] - a.e[q]) * u;
          one(e, 1, b.open);
          if (!b.open && !b.noon) { let x = 0; for (let q = 0; q < N; q++) x = Math.min(x, e[2 * q]); if (!far || x < far.x) far = { x, lat: b.lat }; }
        } else { if (!a.drop) one(a.e, 1 - u, a.open); if (!b.drop) one(b.e, u, b.open); if (!b.open && !b.noon && !b.drop && u > 0.5) { let x = 0; for (let q = 0; q < N; q++) x = Math.min(x, b.e[2 * q]); if (!far || x < far.x) far = { x, lat: b.lat }; } }
      }
      window.FK.earth(ctx, cx, cy, Math.max(3, k));
      if (far) {                                                 // how far the last closed line drawn reaches
        const q = P(far.x, 0);
        ctx.fillStyle = rgba(PAL.accent); ctx.beginPath(); ctx.arc(q[0], q[1], 3, 0, TAU); ctx.fill();
        T(ctx, `${far.lat}° reaches ${(-far.x).toFixed(1)} R_E`, Math.min(q[0], w - 150), q[1] + 16, { size: 11.5, mono: true, color: rgba(PAL.accent, 0.95), align: "center" });
      }
      T(ctx, "← Sun", 16, 22, { size: 12, color: PAL.sun });
      window.FK.scaleBar(ctx, w - 30 - 10 * k, h - 28, k, 10, "10 R_E");
      if (u0 < 1) requestAnimationFrame(st.redraw);
    } });
    document.querySelectorAll("#seg-kp button").forEach(b => b.addEventListener("click", () => { intro = false; go(b.dataset.kp); }));
    // once, on arrival: quiet to disturbed and back to Kp 2
    if (!st.reduce) [["kp0", 500], ["kp5", 1500], ["kp2", 3300]].forEach(([k, ms]) => setTimeout(() => { if (intro) go(k); }, ms));
  }

  // ───────────────── radiation belts: AE-8 / AP-8, the orbits through them and the particles in them ─────────────────
  async function belts(canvas) {
    const scale = await fetch("assets/data/belts.json").then(r => r.json()), imgs = {}, raw = {};
    const stops = [[0, [12, 8, 40]], [0.35, [104, 34, 136]], [0.6, [208, 72, 92]], [0.82, [246, 158, 60]], [1, [252, 238, 190]]], lut = [];
    for (let i = 0; i < 256; i++) { const u = i / 255; let j = 0; while (j < stops.length - 2 && u > stops[j + 1][0]) j++; const [u0, c0] = stops[j], [u1, c1] = stops[j + 1], f = (u - u0) / (u1 - u0); lut.push(c0.map((c, n) => Math.round(c + (c1[n] - c) * f))); }
    await Promise.all(Object.entries(scale).map(([key, s]) => new Promise(ok => {
      const im = new Image();
      im.onload = () => {
        const c = document.createElement("canvas"); c.width = im.width; c.height = im.height;
        const x = c.getContext("2d"); x.drawImage(im, 0, 0);
        const d = x.getImageData(0, 0, c.width, c.height);
        raw[key] = { w: c.width, h: c.height, v: Uint8Array.from({ length: c.width * c.height }, (_, i) => d.data[4 * i]) };
        for (let i = 0; i < d.data.length; i += 4) { const v = d.data[i]; if (v === 0) { d.data[i + 3] = 0; continue; } const c3 = lut[v]; d.data[i] = c3[0]; d.data[i + 1] = c3[1]; d.data[i + 2] = c3[2]; d.data[i + 3] = Math.min(255, 50 + v * 1.4); }
        x.putImageData(d, 0, 0); imgs[key] = c; ok();
      };
      im.src = s.img;
    })));
    let species = "electron", solar = "max", parts = null, partsKey = "";
    /** Trapped particles for this map: more of them where the flux is higher, each with its own mirror latitude. */
    function seed(key, s) {
      const R = raw[key], r = rng(0xBE17 + key.length * 77 + (key.includes("min") ? 5 : 0)), out = [], row = Math.floor(R.h / 2);
      const fluxAt = (L) => { const x = Math.round((0.5 + L / (2 * s.halfWidth)) * (R.w - 1)); return x >= 0 && x < R.w ? R.v[row * R.w + x] / 255 : 0; };
      let guard = 0;
      while (out.length < 46 && guard++ < 6000) {
        const L = 1.15 + 6.6 * r(), f = fluxAt(L);
        if (r() > f * f) continue;
        const lamMax = Math.acos(Math.sqrt(1 / L)) - 0.06, lm = Math.min(lamMax, (8 + 34 * r()) * DEG);   // the mirror latitude, above the atmosphere
        out.push({ L, lm, side: r() < 0.5 ? 1 : -1, ph: r() * TAU, w: (species === "electron" ? 1.9 : 0.8) * 4 / L });
      }
      return out;
    }
    HX.stage(canvas, { stillAt: 3.1, draw(ctx, w, h, t) {
      const key = `${species}-${solar}`, s = scale[key];
      const k = Math.min((w - 70) / (2 * s.halfWidth + 0.4), (h - 56) / (2 * s.halfHeight + 0.6)), cx = (w - 40) / 2, cy = h / 2 + 2;
      ctx.clearRect(0, 0, w, h);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(imgs[key], cx - s.halfWidth * k, cy - s.halfHeight * k, 2 * s.halfWidth * k, 2 * s.halfHeight * k);
      ctx.lineWidth = 1; ctx.strokeStyle = "rgba(255,255,255,0.2)";
      for (const L of [2, 4, 6]) for (const side of [1, -1]) {
        ctx.beginPath(); const lf = Math.acos(1 / Math.sqrt(L));
        for (let i = 0; i <= 120; i++) { const lat = -lf + 2 * lf * i / 120, r = L * Math.cos(lat) ** 2, X = cx + side * r * Math.cos(lat) * k, Y = cy - r * Math.sin(lat) * k; i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }
        ctx.stroke();
      }
      for (const L of [2, 4, 6]) T(ctx, `L = ${L}`, cx - L * k - 4, cy + 12, { size: 10.5, mono: true, color: PAL.faint, align: "right" });
      // trapped particles, each bouncing along its field line between its mirror points
      if (partsKey !== key) { parts = seed(key, s); partsKey = key; }
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      const pc = species === "electron" ? [210, 225, 255] : [255, 214, 170];
      for (const p of parts) {
        for (let q = 0; q < 6; q++) {
          const la = p.lm * Math.sin(p.ph + p.w * (t - q * 0.035)), r = p.L * Math.cos(la) ** 2;
          ctx.fillStyle = rgba(pc, 0.9 * (1 - q / 6) ** 1.5); ctx.beginPath(); ctx.arc(cx + p.side * r * Math.cos(la) * k, cy - r * Math.sin(la) * k, q ? 1 : 1.5, 0, TAU); ctx.fill();
        }
      }
      ctx.restore();
      window.FK.earth(ctx, cx, cy, k);
      // the orbits that cross the belts, to scale, on the day side's equator
      const orbits = [[1.066, "ISS", 22], [4.16, "GPS", 34], [6.62, "Geosynchronous", 22]];
      for (const [r, name, drop] of orbits) {
        const X = cx + r * k;
        ctx.strokeStyle = "rgba(255,255,255,0.75)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(X, cy); ctx.lineTo(X, cy + drop - 7); ctx.stroke();
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(X, cy, 2.4, 0, TAU); ctx.fill();
        T(ctx, name, X, cy + drop, { size: 10.5, mono: true, color: "rgba(244,245,247,0.85)", align: name === "ISS" ? "left" : "center" });
      }
      const lab = (txt, L, up) => T(ctx, txt, cx + L * k * 0.83, cy - up, { size: 11, color: "rgba(244,245,247,0.8)", align: "center" });
      if (species === "electron") { lab("inner belt", 1.75, 0.92 * k); lab("outer belt", 5.5, 2.2 * k); T(ctx, "slot", cx + 2.75 * k, cy - 0.5 * k, { size: 10.5, color: "rgba(244,245,247,0.6)", align: "center" }); }
      else lab("the proton belt", 2.2, 1.15 * k);
      // the color bar
      const bx = w - 30, by = 44, bh = h - 88;
      for (let i = 0; i < bh; i++) { const c3 = lut[Math.round(255 * (1 - i / bh))]; ctx.fillStyle = `rgb(${c3[0]},${c3[1]},${c3[2]})`; ctx.fillRect(bx, by + i, 8, 1.2); }
      for (let e = s.lo; e <= s.hi; e++) { const y = by + bh * (1 - (e - s.lo) / (s.hi - s.lo)); T(ctx, `10^${e}`, bx - 6, clamp(y, by + 4, by + bh - 4), { size: 10.5, mono: true, color: PAL.muted, align: "right" }); }
      $("#belts-readout").innerHTML = `<b>${species === "electron" ? "Electrons" : "Protons"} &gt; ${s.energy_MeV} MeV</b> · ${solar === "max" ? "solar maximum" : "solar minimum"} · cm<sup>−2</sup> s<sup>−1</sup>`;
    } });
    document.querySelectorAll("#seg-species button, #seg-solar button").forEach(b => b.addEventListener("click", () => {
      b.parentElement.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
      if (b.dataset.species) species = b.dataset.species; else solar = b.dataset.solar;
    }));
  }

  // ───────────────── the auroral oval on the turning Earth: Starkov (1994), Sigernes et al. (2011) ─────────────────
  async function oval(canvas) {
    const tex = await window.FK.pixels("assets/img/earth-equirect.jpg"), kpIn = $("#in-kp-oval"), globeCv = document.createElement("canvas");
    const POLE = [80.8, -72.7];                                 // the geomagnetic (dipole) north pole, IGRF-14 at 2025
    const PLACES = [["Fairbanks", 64.84, -147.72], ["Yellowknife", 62.45, -114.37], ["Churchill", 58.77, -94.17], ["Reykjavík", 64.15, -21.94], ["Tromsø", 69.65, 18.96],
                    ["Edinburgh", 55.95, -3.19], ["Oslo", 59.91, 10.75], ["Minneapolis", 44.98, -93.27], ["Seattle", 47.61, -122.33], ["Yakutsk", 62.03, 129.73], ["Norilsk", 69.35, 88.2], ["Moscow", 55.76, 37.62]];
    const DAY0 = Date.UTC(2026, 2, 20, 0);                      // an equinox, so the terminator runs through the pole
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const unit = (a) => { const n = Math.hypot(...a); return a.map(v => v / n); };
    /** Earth's axis and prime meridian in GSE at time ms (the Sun's longitude, the obliquity, sidereal time). */
    function axes(ms) {
      const d = (ms - Date.UTC(2000, 0, 1, 12)) / 864e5, g = (357.529 + 0.98560028 * d) * DEG, q = 280.459 + 0.98564736 * d;
      const lam = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * DEG, eps = (23.439 - 3.6e-7 * d) * DEG, gmst = ((280.46061837 + 360.98564736629 * d) % 360) * DEG;
      const ecl = ([x, y, z]) => [x, y * Math.cos(eps) + z * Math.sin(eps), -y * Math.sin(eps) + z * Math.cos(eps)], gse = ([x, y, z]) => [x * Math.cos(lam) + y * Math.sin(lam), -x * Math.sin(lam) + y * Math.cos(lam), z];
      return { axis: gse(ecl([0, 0, 1])), prime: gse(ecl([Math.cos(gmst), Math.sin(gmst), 0])) };
    }
    let gKey = "";
    const st = HX.stage(canvas, { stillAt: 12, draw(ctx, w, h, t) {
      const kp = +kpIn.value, al = M.starkovAL(kp);
      $("#out-kp-oval").textContent = kp.toFixed(1);
      const ut = (t * 0.6) % 24, ms = DAY0 + Math.round(ut * 12) / 12 * 3.6e6, A = axes(ms), east = cross(A.axis, A.prime);
      const geo = (lat, lon) => { const la = lat * DEG, lo = lon * DEG; return [0, 1, 2].map(i => Math.cos(la) * (Math.cos(lo) * A.prime[i] + Math.sin(lo) * east[i]) + Math.sin(la) * A.axis[i]); };
      const m = geo(POLE[0], POLE[1]), noon = unit([1 - m[0] * m[0], -m[0] * m[1], -m[0] * m[2]]), dusk = cross(m, noon), right = cross(noon, m);
      const view = { right, down: noon.map(v => -v), toward: m };
      const half = Math.min(w, h) / 2 - 6, cx = w / 2, cy = h / 2, R = half / Math.sin(54 * DEG);          // the frame reaches 54° of magnetic colatitude
      ctx.clearRect(0, 0, w, h);
      const size = Math.min(900, Math.round(2 * R * Math.min(st.dpr, 1.25))), key = size + ":" + ms;
      if (key !== gKey) { HX.globe(globeCv, tex, size, view, A.axis, A.prime, 0.22); gKey = key; }
      ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, half, 0, TAU); ctx.clip();
      ctx.drawImage(globeCv, cx - R, cy - R, 2 * R, 2 * R);
      ctx.fillStyle = "rgba(3,6,14,0.3)"; ctx.fillRect(0, 0, w, h);
      // magnetic colatitude circles
      ctx.lineWidth = 1;
      for (const c of [10, 20, 30, 40, 50]) { ctx.strokeStyle = "rgba(255,255,255,0.13)"; ctx.beginPath(); ctx.arc(cx, cy, R * Math.sin(c * DEG), 0, TAU); ctx.stroke(); if (c < 50) T(ctx, `${90 - c}°`, cx + 4, cy - R * Math.sin(c * DEG) + 9, { size: 10, mono: true, color: "rgba(255,255,255,0.4)" }); }
      const P = (colat, mlt) => { const a = (mlt - 12) / 24 * TAU, r = R * Math.sin(colat * DEG); return [cx - r * Math.sin(a), cy - r * Math.cos(a)]; };
      const edge = (mm) => { const out = []; for (let i = 0; i <= 96; i++) out.push(P(M.starkov(mm, i / 4, al), i / 4)); return out; };
      const pole = edge(0), eq = edge(1), dif = edge(2);
      const band = (outer, inner, fill) => { ctx.beginPath(); outer.forEach((s, i) => i ? ctx.lineTo(s[0], s[1]) : ctx.moveTo(s[0], s[1])); ctx.closePath(); inner.slice().reverse().forEach((s, i) => i ? ctx.lineTo(s[0], s[1]) : ctx.moveTo(s[0], s[1])); ctx.closePath(); ctx.fillStyle = fill; ctx.fill("evenodd"); };
      ctx.globalCompositeOperation = "lighter";
      band(dif, eq, "rgba(70,200,130,0.16)");
      band(eq, pole, "rgba(80,255,150,0.34)");
      // the oval's shimmer: brightest toward midnight
      for (let i = 0; i < 96; i += 1) { const mlt = i / 4, night = 0.5 + 0.5 * Math.cos(mlt * Math.PI / 12), a = st.reduce ? 0.5 : 0.5 + 0.5 * Math.sin(mlt * 2.3 + t * 2.1) * Math.sin(t * 0.9 + i * 0.41); const c0 = M.starkov(0, mlt, al), c1 = M.starkov(1, mlt, al), q = P(c0 + (c1 - c0) * (0.3 + 0.4 * a), mlt); ctx.fillStyle = rgba(PAL.aurora, 0.11 * (0.25 + 0.75 * night) * a); ctx.beginPath(); ctx.arc(q[0], q[1], R * 0.045, 0, TAU); ctx.fill(); }
      ctx.globalCompositeOperation = "source-over";
      const ln = (pts, color) => { ctx.beginPath(); pts.forEach((s, i) => i ? ctx.lineTo(s[0], s[1]) : ctx.moveTo(s[0], s[1])); ctx.strokeStyle = color; ctx.lineWidth = 1.2; ctx.stroke(); };
      ln(pole, "rgba(200,255,220,0.8)"); ln(eq, "rgba(150,245,190,0.8)"); ln(dif, "rgba(150,220,185,0.35)");
      // places, lit while they are under the oval
      for (const [name, lat, lon] of PLACES) {
        const p = geo(lat, lon), u = dot(p, right), v = -dot(p, noon), zz = dot(p, m);
        if (zz <= 0.1) continue;
        const X = cx + R * u, Y = cy + R * v;
        if (Math.hypot(X - cx, Y - cy) > half - 8) continue;
        const colat = Math.acos(clamp(zz, -1, 1)) / DEG, mlt = ((Math.atan2(dot(p, dusk), dot(p, noon)) / TAU * 24 + 12) % 24 + 24) % 24;
        const under = colat >= M.starkov(0, mlt, al) && colat <= M.starkov(1, mlt, al), nearby = !under && colat <= M.starkov(2, mlt, al) && colat > M.starkov(1, mlt, al);
        ctx.fillStyle = under ? "#eafff2" : "rgba(244,245,247,0.75)"; ctx.beginPath(); ctx.arc(X, Y, under ? 3 : 2, 0, TAU); ctx.fill();
        if (under) { ctx.strokeStyle = rgba(PAL.aurora, 0.9); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(X, Y, 6, 0, TAU); ctx.stroke(); }
        T(ctx, name, X + 8, Y, { size: 10.5, weight: under ? 600 : 500, color: under ? "#eafff2" : nearby ? "rgba(200,240,215,0.85)" : "rgba(244,245,247,0.6)" });
      }
      ctx.restore();
      ctx.strokeStyle = "rgba(255,255,255,0.18)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, half, 0, TAU); ctx.stroke();
      T(ctx, "12 MLT · the Sun", cx, cy - half + 36, { size: 10.5, mono: true, color: PAL.sun, align: "center" });   // under the read-out
      T(ctx, "00", cx, cy + half - 10, { size: 10.5, mono: true, color: PAL.muted, align: "center" });
      T(ctx, "18", cx - half + 12, cy, { size: 10.5, mono: true, color: PAL.muted, align: "center" });
      T(ctx, "06", cx + half - 12, cy, { size: 10.5, mono: true, color: PAL.muted, align: "center" });
      const hh = Math.floor(ut), mm = Math.floor((ut - hh) * 12) * 5;
      $("#oval-readout").innerHTML = `Kp <b>${kp.toFixed(1)}</b> → |AL| ≈ <b>${Math.round(clamp(al, 10, 780))} nT</b> · <b>${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")} UT</b>`;
    } });
    kpIn.addEventListener("input", st.redraw);
  }

  window.FK.fontsReady().then(() => {
    const b = $("#fig-boundaries2"); if (b) boundaries(b);
    lazy("#fig-t89b", (el) => fieldLines(el).catch(console.error));
    lazy("#fig-belts2", (el) => belts(el).catch(console.error));
    lazy("#fig-oval2", (el) => oval(el).catch(console.error));
  });
})();
