/* Four magnetospheres side by side, second generation: each obstacle from its published fit, with the solar wind
 * flowing round it and the wind's field draping over it.
 *
 *   Mercury  magnetopause: Shue's form, R_ss 1.45 R_M, α 0.5, about a dipole 0.196 R_M north of the planet's center;
 *            bow shock: a conic, X₀ 0.5, p 2.90, ε 1.02 (Winslow et al. 2013). Mean Alfvén Mach number 6.6.
 *   Venus    bow shock: a conic, L 1.303 R_V, ε 1.056, x₀ 0.788; ion composition boundary: a circle of 1.109 R_V by
 *            day and ρ = 1.109 − 0.097 x by night (Martinecz et al. 2008, Venus Express at solar minimum).
 *   Earth    Shue et al. (1998) and Jelínek et al. (2012) at 2 nPa and Bz = 0.
 *   Mars     bow shock: x₀ 0.64, ε 1.03, L 2.04 R_M; magnetic pileup boundary: x₀ 0.78, ε 0.90, L 0.96
 *            (Vignes et al. 2000, Mars Global Surveyor).
 *
 * The flow and the draped field come from js/gfx/meridian.js: straight to the shock, the Rankine–Hugoniot jump
 * there, then round the obstacle, the field lines being the flow's isochrones. Where a line reaches an obstacle it
 * lies along it and its two ends are carried on down the flanks: at Venus and Mars that hairpin is the induced
 * magnetotail. Mercury's and Earth's own fields are the same model's closed magnetosphere (a dipole held inside the
 * magnetopause). The wind's field is drawn perpendicular to the flow at every planet, for comparison; the Parker
 * spiral makes it more nearly radial at Mercury.
 */
(function () {
  "use strict";
  const HX = window.HX, { TAU, clamp, lerp, smooth, rgba, PAL, M, rng, curve } = HX;

  /** r(θ) about the origin for a boundary listed [[x, ρ], …] from its nose tailward. */
  function radial(pts) {
    const th = pts.map(p => Math.atan2(p[1], p[0])), r = pts.map(p => Math.hypot(p[0], p[1]));
    return (t) => {
      if (t <= th[0]) return r[0];
      if (t >= th[th.length - 1]) return 1e6;
      let lo = 0, hi = th.length - 1;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (th[mid] <= t) lo = mid; else hi = mid; }
      return r[lo] + (r[hi] - r[lo]) * (t - th[lo]) / Math.max(th[hi] - th[lo], 1e-12);
    };
  }
  const shuePts = (r0, al, n = 320) => { const out = []; for (let i = 0; i <= n; i++) { const th = 3.02 * i / n, r = M.shueR(th, r0, al); out.push([r * Math.cos(th), r * Math.sin(th)]); } return out; };
  const e2 = M.shue(2, 0), jel = M.jelinek(2);
  const venusICB = (() => { const out = []; for (let i = 0; i <= 60; i++) { const th = Math.PI / 2 * i / 60; out.push([1.109 * Math.cos(th), 1.109 * Math.sin(th)]); } for (let x = -0.1; x >= -60; x -= 0.1) out.push([x, 1.109 - 0.097 * x]); return out; })();
  const marsMPB = (() => { const out = M.conic(0.78, 0.90, 0.96).points(-6.5, 300), rho = out[out.length - 1][1]; for (let x = -6.6; x >= -60; x -= 0.2) out.push([x, rho]); return out; })();

  const BODIES = [
    { name: "Mercury", r_km: 2440, color: [176, 168, 160], own: true, dz: -0.196, mach: 5.5,
      mp: shuePts(1.45, 0.5), bs: M.conic(0.5, 1.02, 2.90 * 1.02).points(-400, 500), inner: 1.45, innerLabel: "magnetopause", shock: 0.5 + 2.90 * 1.02 / 2.02,
      grid: { x0: -6, x1: 3.4, zmax: 9, h: 0.07 }, unit: 0.145, xRef: 9, dx: 1.25, rIn: 0.8, rCut: 0.8, thetaD: 25, thetaN: 31, xIn: -1.3, xN: -11,
      sheet: (x) => 0.12 + 0.02 * Math.max(0, -x - 1.5), rest: [-0.9, -0.62, -0.44, -0.3, -0.1, -0.02, 0.06, 0.14, 0.22, 0.31, 0.42, 0.6, 0.9] },
    { name: "Venus", r_km: 6051.8, color: [226, 196, 142], own: false, dz: 0, mach: 6,
      mp: venusICB, bs: M.conic(0.788, 1.056, 1.303).points(-400, 500), inner: 1.109, innerLabel: "ion boundary", shock: 0.788 + 1.303 / 2.056,
      grid: { x0: -6.5, x1: 3, zmax: 7, h: 0.06 }, unit: 0.11, xRef: 9, dx: 1.0 },
    { name: "Earth", r_km: 6371.2, color: [93, 160, 255], own: true, dz: 0, mach: 8,
      mp: shuePts(e2.r0, e2.alpha), bsJ: jel, inner: e2.r0, innerLabel: "magnetopause", shock: jel.R,
      grid: { x0: -48, x1: 23, zmax: 32, h: 0.4 }, unit: 1, xRef: 60, dx: 9, rIn: 1, rCut: 2.4, thetaD: 13, thetaN: 19, xIn: -6, xN: -130,
      rest: [-1 / 1.8, -1 / 3.3, -1 / 5, -1 / 7.5, -0.085, -0.03, 0.01, 0.045, 0.08, 0.118, 0.135, 1 / 6.2, 1 / 4.4, 1 / 3.3, 1 / 1.8] },
    { name: "Mars", r_km: 3389.5, color: [214, 116, 76], own: false, dz: 0, mach: 7,
      mp: marsMPB, bs: M.conic(0.64, 1.03, 2.04).points(-400, 500), inner: 0.78 + 0.96 / 1.90, innerLabel: "pileup boundary", shock: 0.64 + 2.04 / 2.03,
      grid: { x0: -7, x1: 3.4, zmax: 7.6, h: 0.07 }, unit: 0.13, xRef: 10, dx: 1.25 },
  ];
  const V = 0.34;                                               // the wind on screen, in units of each shock's nose distance a second

  function start() {
    const canvas = document.getElementById("fig-worlds");
    if (!canvas) return;
    const T = window.FK.text;
    let mode = "radii", blend = 0, target = 0, built = 0;
    for (const b of BODIES) { b.bsPts = b.bsJ ? null : b.bs; b.E = null; b.streaks = null; }
    /** The model for one body, built once the figure is near the screen. */
    function build(b) {
      const bsR = b.bsJ ? null : radial(b.bs);
      const E = HX.Meridian({ mp: b.mp, bs: b.bsJ || { mach: b.mach }, bsR, mach: b.mach, grid: b.grid, unit: b.unit, xRef: b.xRef, q0: 0.22,
                              closed: true, rIn: b.rIn ?? 0.5, rCut: b.rCut ?? 0.5, thetaD: b.thetaD ?? 15, thetaN: b.thetaN ?? 20, dPsi: 0.02, dx: b.dx,
                              xIn: b.xIn ?? -1, xN: b.xN ?? -50, sheet: b.sheet });
      if (b.own) { E.solve(420); b.lines = E.contoursAt(b.rest); }
      const r = rng(0xC0FFEE + b.r_km), n = 150;
      b.streaks = [];
      for (let s = 0; s < (b.name === "Earth" ? 110 : 60); s++) {
        const rho0 = 0.02 * b.shock + b.grid.zmax * 1.02 * r(), sg = r() < 0.5 ? -1 : 1, path = E.streamline(rho0, b.grid.x1 + 0.6 * b.shock, b.grid.x0);
        const tA = path[0][2], tB = path[path.length - 1][2], pts = new Float32Array(n * 2), wt = new Float32Array(n);
        let j = 0;
        for (let i = 0; i < n; i++) {
          const tt = tA + (tB - tA) * i / (n - 1);
          while (j < path.length - 2 && path[j + 1][2] < tt) j++;
          const f = clamp((tt - path[j][2]) / Math.max(path[j + 1][2] - path[j][2], 1e-9), 0, 1);
          pts[2 * i] = path[j][0] + (path[j + 1][0] - path[j][0]) * f; pts[2 * i + 1] = sg * (path[j][1] + (path[j + 1][1] - path[j][1]) * f);
          wt[i] = Math.min(1, (rho0 + 0.05 * b.shock) / (Math.abs(pts[2 * i + 1]) + 0.05 * b.shock));
        }
        b.streaks.push({ pts, wt, span: tB - tA, phase: r(), alpha: 0.25 + 0.5 * r(), trail: 0.12 + 0.1 * r(), n });
      }
      if (!b.bsPts) { b.bsPts = []; for (let i = 0; i <= 400; i++) { const th = Math.PI * 0.97 * i / 400, rr = E.rBS(th); b.bsPts.push([rr * Math.cos(th), rr * Math.sin(th)]); } }
      b.E = E;
    }

    const st = HX.stage(canvas, { stillAt: 7.3, draw(ctx, w, h, t, dt) {
      if (built < BODIES.length && !st.building) { st.building = true; setTimeout(() => { build(BODIES[built++]); st.building = false; st.redraw(); }, 20); }
      if (blend !== target) { blend = clamp(blend + Math.sign(target - blend) * (dt || 0.016) / 0.7, 0, 1); if (Math.abs(blend - target) < 1e-3) blend = target; if (!st.playing) st.redraw(); }
      const u = blend * blend * (3 - 2 * blend), narrow = w < 640;
      ctx.clearRect(0, 0, w, h);
      const weights = [1, 1, 2.3, 1], sum = weights.reduce((a, b) => a + b), foot = narrow ? 30 : 76;
      let x0 = 0;
      const earthW = w * weights[2] / sum, kmScale = Math.min(earthW * 0.3, (h - foot) * 0.3) / (BODIES[2].shock * BODIES[2].r_km);   // pixels per km, all to Earth's scale
      BODIES.forEach((b, i) => {
        const cw = w * weights[i] / sum, px0 = x0; x0 += cw;
        const cx = px0 + cw * (i === 2 ? 0.4 : 0.46), cy = (h - foot) * 0.5;
        const fit = Math.min(cw * (i === 2 ? 0.3 : 0.33), (h - foot) * 0.3) / b.shock, true1 = b.r_km * kmScale;
        const k = Math.exp(lerp(Math.log(fit), Math.log(true1), u));             // pixels per planetary radius
        const P = (x, z) => [cx - x * k, cy - z * k];
        ctx.save();
        ctx.beginPath(); ctx.rect(px0 + 1, 0, cw - 2, h - foot + 6); ctx.clip();
        const mpP = b.mp, bsP = b.bsPts || b.bs, s = 1;
        const poly = (edge, lim) => { ctx.beginPath(); let m = 0; for (const p of edge) { if (p[0] < lim) break; const q = P(p[0], p[1]); m++ ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); } for (let j = edge.length - 1; j >= 0; j--) { if (edge[j][0] < lim) continue; const q = P(edge[j][0], -edge[j][1]); ctx.lineTo(q[0], q[1]); } ctx.closePath(); };
        const lim = -(px0 + cw - cx) / k - 1;
        if (bsP) { poly(bsP, lim); ctx.fillStyle = "rgba(120,190,255,0.075)"; ctx.fill(); }
        poly(mpP, lim);
        if (b.own) { const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, k * b.shock * 2.4); g.addColorStop(0, "rgba(26,47,98,0.95)"); g.addColorStop(1, "rgba(10,19,45,0.9)"); ctx.fillStyle = g; }
        else ctx.fillStyle = "rgba(88,44,22,0.5)";
        ctx.fill();
        const E = b.E, show = i === 2 ? 1 : 1 - u;               // at one scale the small ones are too small for their lines
        if (E && show > 0.02) {
          ctx.lineJoin = "round"; ctx.lineCap = "round";
          const draw = (pts) => { const n = pts.length >> 1, f = new Float32Array(pts.length); for (let q = 0; q < n; q++) { f[2 * q] = cx - pts[2 * q] * k; f[2 * q + 1] = cy - pts[2 * q + 1] * k; } curve(ctx, f, true); };
          if (b.lines) { ctx.beginPath(); for (const l of b.lines) draw(l.pts); ctx.lineWidth = 1; ctx.strokeStyle = rgba(PAL.closed, 0.62 * show); ctx.stroke(); }
          // the wind's field: the flow's isochrones, each lying along the obstacle between the points it has reached
          const vS = V * b.shock, c = ((t * vS) % b.dx + b.dx) % b.dx, lines = E.isochrones(c - E.tauX, b.dx, -E.tauX, b.xRef - b.grid.x0 + 40 * b.dx - E.tauX);
          ctx.beginPath();
          for (const l of lines) {
            const p = l.pts, m = p.length;
            let pts = p;
            const arc = (x, z, head) => { const thk = Math.atan2(Math.abs(z), x), sg = z < 0 ? -1 : 1, out = []; for (let q = 1; q <= 24; q++) { const th = thk * (1 - q / 24), rr = E.rMP(th); out.push(rr * Math.cos(th), sg * rr * Math.sin(th)); } return head ? out : out; };
            if (l.b === "M") pts = Array.from(pts).concat(arc(p[m - 2], p[m - 1]));
            if (l.a === "M") { const a = arc(p[0], p[1]), r2 = []; for (let q = a.length - 2; q >= 0; q -= 2) r2.push(a[q], a[q + 1]); pts = r2.concat(Array.from(pts)); }
            draw(pts);
          }
          ctx.lineWidth = 1.1; ctx.strokeStyle = rgba(PAL.imf, 0.8 * show); ctx.stroke();
          // the solar wind
          ctx.save(); ctx.globalCompositeOperation = "lighter";
          for (const sk of b.streaks) {
            const tt = (t * vS + sk.phase * sk.span) % sk.span, n = sk.n, kk = Math.floor(tt / sk.span * (n - 1)), len = Math.max(1, Math.round(sk.trail * vS / sk.span * (n - 1)));
            if (kk <= len) continue;
            ctx.beginPath(); ctx.moveTo(cx - sk.pts[2 * (kk - len)] * k, cy - sk.pts[2 * (kk - len) + 1] * k);
            for (let q = kk - len + 1; q <= kk; q++) ctx.lineTo(cx - sk.pts[2 * q] * k, cy - sk.pts[2 * q + 1] * k);
            ctx.lineWidth = 0.9; ctx.strokeStyle = `rgba(255,240,205,${sk.alpha * sk.wt[kk] * 0.6 * show})`; ctx.stroke();
          }
          ctx.restore();
        }
        const line = (edge, flip) => { ctx.beginPath(); let m = 0; for (const p of edge) { if (p[0] < lim) break; const q = P(p[0], flip ? -p[1] : p[1]); m++ ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); } };
        for (const flip of [false, true]) {
          if (bsP) { line(bsP, flip); ctx.setLineDash([5, 4]); ctx.lineWidth = 1.2; ctx.strokeStyle = rgba(PAL.shock, 0.8); ctx.stroke(); ctx.setLineDash([]); }
          line(mpP, flip); ctx.lineWidth = 1.6; ctx.strokeStyle = b.own ? "rgba(205,222,255,0.95)" : "rgba(255,170,110,0.95)"; ctx.stroke();
        }
        // the planet; Mercury's dipole sits north of its center, so the planet is drawn below the field's origin
        const pc = P(0, b.dz);
        HX.ball(ctx, pc[0], pc[1], Math.max(k, 0.8), b.color);
        ctx.restore();
        void s;
        if (i) { ctx.fillStyle = "rgba(255,255,255,0.08)"; ctx.fillRect(px0, 24, 1, h - foot - 30); }
        const km = (v) => (Math.round(v * b.r_km / 100) * 100).toLocaleString("en-US"), mid = px0 + cw / 2;
        T(ctx, b.name, mid, h - (narrow ? 16 : 58), { size: narrow ? 12 : 15, weight: 600, color: "#f4f5f7", align: "center" });
        if (!narrow) {
          const roomy = cw > 210;
          T(ctx, b.own ? "its own field" : "induced", mid, h - 41, { size: 11, color: b.own ? "rgba(190,214,255,0.85)" : "rgba(255,186,140,0.85)", align: "center" });
          T(ctx, `${roomy ? b.innerLabel : "obstacle"} ${km(b.inner)} km`, mid, h - 25, { size: 10.5, mono: true, color: PAL.muted, align: "center" });
          T(ctx, `${roomy ? "bow shock" : "shock"} ${km(b.shock)} km`, mid, h - 11, { size: 10.5, mono: true, color: PAL.muted, align: "center" });
        }
      });
      T(ctx, "← Sun", 14, 20, { size: 12, color: PAL.sun });
      if (!narrow) T(ctx, u < 0.5 ? "Each scaled to fit its panel" : "All to one scale", 14, 38, { size: 11, mono: true, color: PAL.muted });
    } });
    document.querySelectorAll("#seg-scale button").forEach(btn => btn.addEventListener("click", () => {
      document.querySelectorAll("#seg-scale button").forEach(x => x.setAttribute("aria-pressed", String(x === btn)));
      mode = btn.dataset.mode; target = mode === "km" ? 1 : 0; st.redraw();
    }));
  }
  window.FK.fontsReady().then(start);
})();
