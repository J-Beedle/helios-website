/* Five magnetospheres side by side, second generation: each obstacle from its published fit, with the solar wind
 * flowing round it and the wind's field draping over it, and each planet drawn from its own map.
 *
 *   Mercury  magnetopause: Shue's form, R_ss 1.45 R_M, α 0.5, about a dipole 0.196 R_M north of the planet's center;
 *            bow shock: a conic, X₀ 0.5, p 2.90, ε 1.02 (Winslow et al. 2013). Mean Alfvén Mach number 6.6.
 *   Venus    bow shock: a conic, L 1.303 R_V, ε 1.056, x₀ 0.788; ion composition boundary: a circle of 1.109 R_V by
 *            day and ρ = 1.109 − 0.097 x by night (Martinecz et al. 2008, Venus Express at solar minimum).
 *   Earth    Shue et al. (1998) and Jelínek et al. (2012) at 2 nPa and Bz = 0.
 *   Mars     bow shock: x₀ 0.600, ε 1.026, L 2.081 R_M; magnetic pileup boundary: x₀ 0.640, ε 0.770, L 1.080 by day
 *            and x₀ 1.600, ε 1.009, L 0.528 by night (Trotignon et al. 2006, Phobos 2 and Mars Global Surveyor: the
 *            fits Helios's Mars view draws). The night-side piece is a hyperbola, so the tail it bounds keeps
 *            flaring. A single conic with ε < 1 (Vignes et al. 2000's 0.90) is an ellipse: it fits the day side,
 *            but carried down the tail it closes on itself, which no tail does.
 *   Jupiter  magnetopause and bow shock: Joy et al. (2002) in the noon–midnight cut, at a solar-wind pressure of
 *            0.071 nPa (the median at Jupiter: Rutala et al. 2025), which puts their noses 83 and 108 R_J out.
 *
 * The globes: MESSENGER MDIS (Mercury), the Magellan radar mosaic in USGS's synthetic color (Venus), Blue Marble
 * (Earth), Viking MDIM 2.1 (Mars) and Cassini ISS PIA07782 (Jupiter), each half lit from the Sun's side and turning
 * at its own rate against Earth's.
 *
 * The flow and the draped field come from js/gfx/meridian.js: straight to the shock, the Rankine–Hugoniot jump
 * there, then round the obstacle, the field lines being the flow's isochrones. Where a line reaches an obstacle it
 * lies along it and its two ends are carried on down the flanks: at Venus and Mars that hairpin is the induced
 * magnetotail. Mercury's, Earth's and Jupiter's own fields are the same model's closed magnetosphere (a dipole held
 * inside the magnetopause); Jupiter's real field is stretched into a disc by the plasma from Io, which this leaves
 * out. The wind's field is drawn perpendicular to the flow at every planet, for comparison; the Parker
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
  const shuePts = (r0, al, n = 320, thMax = 3.02) => { const out = []; for (let i = 0; i <= n; i++) { const th = thMax * Math.pow(i / n, 1.3), r = M.shueR(th, r0, al); out.push([r * Math.cos(th), r * Math.sin(th)]); } return out; };
  const e2 = M.shue(2, 0), jel = M.jelinek(2);
  const venusICB = (() => { const out = []; for (let i = 0; i <= 60; i++) { const th = Math.PI / 2 * i / 60; out.push([1.109 * Math.cos(th), 1.109 * Math.sin(th)]); } for (let x = -0.1; x >= -60; x -= 0.1) out.push([x, 1.109 - 0.097 * x]); return out; })();
  const marsMPB = M.conic(0.640, 0.770, 1.080).points(-0.001, 200).filter(p => p[0] >= 0).concat(M.conic(1.600, 1.009, 0.528).points(-400, 500).filter(p => p[0] < 0));

  const joyMP = M.joy("mp", 0.071), joyBS = M.joy("bs", 0.071);
  const BODIES = [
    { name: "Mercury", r_km: 2440, color: [176, 168, 160], own: true, dz: -0.196, mach: 5.5, tilt: 0, turn: 1 / 2900, map: "mercury",
      mp: shuePts(1.45, 0.5, 420, 3.1), bs: M.conic(0.5, 1.02, 2.90 * 1.02).points(-400, 500), inner: 1.45, innerLabel: "magnetopause", shock: 0.5 + 2.90 * 1.02 / 2.02,
      grid: { x0: -6, x1: 3.4, zmax: 9, h: 0.07 }, unit: 0.145, xRef: 9, dx: 1.25, rIn: 0.8, rCut: 0.8, thetaD: 25, thetaN: 31, xIn: -1.3, xN: -11,
      sheet: (x) => 0.12 + 0.02 * Math.max(0, -x - 1.5), rest: [-0.9, -0.62, -0.44, -0.3, -0.1, -0.02, 0.06, 0.14, 0.22, 0.31, 0.42, 0.6, 0.9] },
    { name: "Venus", r_km: 6051.8, color: [226, 196, 142], own: false, dz: 0, mach: 6, tilt: 2.6, turn: -1 / 12000, map: "venus",
      mp: venusICB, bs: M.conic(0.788, 1.056, 1.303).points(-400, 500), inner: 1.109, innerLabel: "ion boundary", shock: 0.788 + 1.303 / 2.056,
      grid: { x0: -6.5, x1: 3, zmax: 7, h: 0.06 }, unit: 0.11, xRef: 9, dx: 1.0 },
    { name: "Earth", r_km: 6371.2, color: [93, 160, 255], own: true, dz: 0, mach: 8, wide: true, tilt: 23.4, turn: 1 / 50, map: "earth",
      mp: shuePts(e2.r0, e2.alpha), bsJ: jel, inner: e2.r0, innerLabel: "magnetopause", shock: jel.R,
      grid: { x0: -48, x1: 23, zmax: 32, h: 0.4 }, unit: 1, xRef: 60, dx: 9, rIn: 1, rCut: 2.4, thetaD: 13, thetaN: 19, xIn: -6, xN: -130,
      rest: [-1 / 1.8, -1 / 3.3, -1 / 5, -1 / 7.5, -0.085, -0.03, 0.01, 0.045, 0.08, 0.118, 0.135, 1 / 6.2, 1 / 4.4, 1 / 3.3, 1 / 1.8] },
    { name: "Mars", r_km: 3389.5, color: [214, 116, 76], own: false, dz: 0, mach: 7, tilt: 25.2, turn: 1 / 51.3, map: "mars",
      mp: marsMPB, bs: M.conic(0.600, 1.026, 2.081).points(-400, 500), inner: 0.640 + 1.080 / 1.770, innerLabel: "pileup boundary", shock: 0.600 + 2.081 / 2.026,
      grid: { x0: -7, x1: 3.4, zmax: 7.6, h: 0.07 }, unit: 0.13, xRef: 10, dx: 1.25 },
    // Jupiter, in Jupiter radii: the same model at eight times Earth's lengths
    { name: "Jupiter", r_km: 71492, color: [214, 180, 140], own: true, dz: 0, mach: 10, wide: true, tilt: 3.1, turn: 1 / 20.7, map: "jupiter",
      mp: joyMP.points(-560, 400), bs: joyBS.points(-1500, 500), inner: joyMP.nose, innerLabel: "magnetopause", shock: joyBS.nose,
      grid: { x0: -384, x1: 184, zmax: 256, h: 3.2 }, unit: 8, xRef: 480, dx: 72, rIn: 8, rCut: 19, thetaD: 13, thetaN: 19, xIn: -48, xN: -1040,
      sheet: (x) => 7.2 + 0.045 * Math.max(0, -x - 64), moons: [5.9, 9.4, 15, 26.3],
      rest: [-1 / 1.8, -1 / 3.3, -1 / 5, -1 / 7.5, -0.085, -0.03, 0.01, 0.045, 0.08, 0.118, 0.135, 1 / 6.2, 1 / 4.4, 1 / 3.3, 1 / 1.8] },
  ];
  const V = 0.34;                                               // the wind on screen, in units of each shock's nose distance a second
  const VIEW = { right: [-1, 0, 0], down: [0, 0, -1], toward: [0, 1, 0] };   // the noon–midnight plane from dusk, the Sun to the left
  const NIGHT = 0.3;                                            // how much of the daylight the night side keeps, so the map can be read there

  function start() {
    const canvas = document.getElementById("fig-worlds");
    if (!canvas) return;
    const T = window.FK.text, EARTH = BODIES.findIndex(b => b.name === "Earth");
    let mode = "radii", blend = 0, target = 0, built = 0;
    if (/[?&]scale=km\b/.test(location.search)) {              // worlds.html?scale=km opens at one scale
      mode = "km"; blend = target = 1;
      document.querySelectorAll("#seg-scale button").forEach(x => x.setAttribute("aria-pressed", String(x.dataset.mode === "km")));
    }
    for (const b of BODIES) { b.bsPts = b.bsJ ? null : b.bs; b.E = null; b.streaks = null; b.gcv = document.createElement("canvas"); b.gkey = ""; }
    /** The model for one body, built once the figure is near the screen. */
    function build(b) {
      const bsR = b.bsJ ? null : radial(b.bs);
      const E = HX.Meridian({ mp: b.mp, bs: b.bsJ || { mach: b.mach }, bsR, mach: b.mach, grid: b.grid, unit: b.unit, xRef: b.xRef, q0: 0.22,
                              closed: true, rIn: b.rIn ?? 0.5, rCut: b.rCut ?? 0.5, thetaD: b.thetaD ?? 15, thetaN: b.thetaN ?? 20, dPsi: 0.02, dx: b.dx,
                              xIn: b.xIn ?? -1, xN: b.xN ?? -50, sheet: b.sheet });
      if (b.own) { E.solve(420); b.lines = E.contoursAt(b.rest); }
      const r = rng(0xC0FFEE + b.r_km), n = 150;
      b.streaks = [];
      for (let s = 0; s < (b.wide ? 110 : 60); s++) {
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
    /** The planet from its map: R pixels in radius, turned to time t. A dot too small for a map is a plain ball. */
    function planet(ctx, b, x, y, R, t, dpr) {
      if (!b.tex || R < 3) { HX.ball(ctx, x, y, Math.max(R, 0.8), b.color); return; }
      const size = Math.min(900, Math.max(8, Math.ceil(2 * R * dpr))), e = b.tilt * Math.PI / 180, axis = [0, Math.sin(e), Math.cos(e)];
      const ph = st.reduce ? 0.6 : 0.6 + t * b.turn * TAU, step = Math.round(ph * Math.max(40, size * 0.8));   // redrawn when it has turned about a pixel
      const key = size + ":" + step;
      if (b.gkey !== key) {
        const c = Math.cos(ph), s = Math.sin(ph), east = [-axis[2] * 0 + 0, axis[2], -axis[1]];   // axis × x̂
        HX.globe(b.gcv, b.tex, size, VIEW, axis, [c, s * east[1], s * east[2]], NIGHT);
        b.gkey = key;
      }
      ctx.drawImage(b.gcv, x - R, y - R, 2 * R, 2 * R);
    }
    /** Where each body's panel goes: one row when there is room, two on a phone (the three small ones over the two large). */
    function panels(w, h, narrow) {
      if (!narrow) {
        const sum = BODIES.reduce((a, b) => a + (b.wide ? 2 : 1), 0);
        let x = 0;
        return BODIES.map(b => { const cw = w * (b.wide ? 2 : 1) / sum, r = { x, y: 0, w: cw, h, foot: 76 }; x += cw; return r; });
      }
      const small = BODIES.filter(b => !b.wide), big = BODIES.filter(b => b.wide), hA = Math.round(h * 0.44);
      return BODIES.map(b => b.wide ? { x: big.indexOf(b) * w / big.length, y: hA, w: w / big.length, h: h - hA, foot: 34 }
                                    : { x: small.indexOf(b) * w / small.length, y: 0, w: w / small.length, h: hA, foot: 34 });
    }

    const st = HX.stage(canvas, { stillAt: 7.3, draw(ctx, w, h, t, dt) {
      if (built < BODIES.length && !st.building) { st.building = true; setTimeout(() => { build(BODIES[built++]); st.building = false; st.redraw(); }, 20); }
      if (blend !== target) { blend = clamp(blend + Math.sign(target - blend) * (dt || 0.016) / 0.7, 0, 1); if (Math.abs(blend - target) < 1e-3) blend = target; if (!st.playing) st.redraw(); }
      const u = blend * blend * (3 - 2 * blend), narrow = w < 640, R = panels(w, h, narrow), rE = R[EARTH], bE = BODIES[EARTH];
      ctx.clearRect(0, 0, w, h);
      const kmScale = Math.min(rE.w * 0.3, (rE.h - rE.foot) * 0.3) / (bE.shock * bE.r_km);   // pixels per km, all to Earth's scale
      BODIES.forEach((b, i) => {
        const { x: px0, y: py0, w: cw, h: ch, foot } = R[i], ph = ch - foot;
        const cx = px0 + cw * (b.wide ? 0.4 : 0.46), cy = py0 + ph * 0.5;
        const fit = Math.min(cw * (b.wide ? 0.3 : 0.33), ph * 0.3) / b.shock, true1 = b.r_km * kmScale;
        const k = Math.exp(lerp(Math.log(fit), Math.log(true1), u));             // pixels per planetary radius
        const P = (x, z) => [cx - x * k, cy - z * k];
        ctx.save();
        ctx.beginPath(); ctx.rect(px0 + 1, py0, cw - 2, ph + 6); ctx.clip();
        const mpP = b.mp, bsP = b.bsPts || b.bs;
        const lim = -(px0 + cw - cx) / k - 1;
        const poly = (edge) => { ctx.beginPath(); let m = 0; for (const p of edge) { if (p[0] < lim) break; const q = P(p[0], p[1]); m++ ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); } for (let j = edge.length - 1; j >= 0; j--) { if (edge[j][0] < lim) continue; const q = P(edge[j][0], -edge[j][1]); ctx.lineTo(q[0], q[1]); } ctx.closePath(); };
        if (bsP) { poly(bsP); ctx.fillStyle = "rgba(120,190,255,0.075)"; ctx.fill(); }
        poly(mpP);
        if (b.own) { const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, k * b.shock * 2.4); g.addColorStop(0, "rgba(26,47,98,0.95)"); g.addColorStop(1, "rgba(10,19,45,0.9)"); ctx.fillStyle = g; }
        else ctx.fillStyle = "rgba(88,44,22,0.5)";
        ctx.fill();
        const E = b.E, show = b.wide ? 1 : 1 - u;                // at one scale the small ones are too small for their lines
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
            const arc = (x, z) => { const thk = Math.atan2(Math.abs(z), x), sg = z < 0 ? -1 : 1, out = []; for (let q = 1; q <= 24; q++) { const th = thk * (1 - q / 24), rr = E.rMP(th); out.push(rr * Math.cos(th), sg * rr * Math.sin(th)); } return out; };
            if (l.b === "M") pts = Array.from(pts).concat(arc(p[m - 2], p[m - 1]));
            if (l.a === "M") { const a = arc(p[0], p[1]), r2 = []; for (let q = a.length - 2; q >= 0; q -= 2) r2.push(a[q], a[q + 1]); pts = r2.concat(Array.from(pts)); }
            draw(pts);
          }
          ctx.lineWidth = 1.1; ctx.strokeStyle = rgba(PAL.imf, 0.8 * show); ctx.stroke();
          // the solar wind
          ctx.save(); ctx.globalCompositeOperation = "lighter";
          for (const sk of b.streaks) {
            const tt = (t * vS + sk.phase * sk.span) % sk.span, n = sk.n, kf = tt / sk.span * (n - 1), len = Math.max(1, sk.trail * vS / sk.span * (n - 1));
            if (kf < 0.5) continue;
            HX.trace(ctx, sk.pts, n, kf - len, kf, cx, cy, -k, -k);
            ctx.lineWidth = 0.9; ctx.strokeStyle = `rgba(255,240,205,${sk.alpha * sk.wt[Math.round(kf)] * 0.6 * show})`; ctx.stroke();
          }
          ctx.restore();
        }
        const line = (edge, flip) => { ctx.beginPath(); let m = 0; for (const p of edge) { if (p[0] < lim) break; const q = P(p[0], flip ? -p[1] : p[1]); m++ ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); } };
        for (const flip of [false, true]) {
          if (bsP) { line(bsP, flip); ctx.setLineDash([5, 4]); ctx.lineWidth = 1.2; ctx.strokeStyle = rgba(PAL.shock, 0.8); ctx.stroke(); ctx.setLineDash([]); }
          line(mpP, flip); ctx.lineWidth = 1.6; ctx.strokeStyle = b.own ? "rgba(205,222,255,0.95)" : "rgba(255,170,110,0.95)"; ctx.stroke();
        }
        // Jupiter's four large moons, where their orbits cross this plane: Io, Europa, Ganymede, Callisto
        if (b.moons && k * b.moons[3] > 9 && k < 30) {
          const a = 1 - smooth(0.25, 0.8, u);
          ctx.fillStyle = `rgba(255,214,150,${0.9 * a})`;
          for (const m of b.moons) for (const sd of [-1, 1]) { const q = P(sd * m, 0); ctx.beginPath(); ctx.arc(q[0], q[1], 1.3, 0, TAU); ctx.fill(); }
          if (!narrow && a > 0.05) T(ctx, "Galilean moons", cx, cy - Math.max(11, k * 4), { size: 10, mono: true, color: `rgba(255,214,150,${0.8 * a})`, align: "center" });
        }
        // the planet; Mercury's dipole sits north of its center, so the planet is drawn below the field's origin
        const pc = P(0, b.dz);
        planet(ctx, b, pc[0], pc[1], k, t, st.dpr || 1);
        if (b.name === "Jupiter" && u > 0.5 && !narrow) T(ctx, "At this scale its boundaries are off the picture", px0 + cw / 2, py0 + 22, { size: 10.5, mono: true, color: `rgba(180,188,204,${smooth(0.5, 1, u)})`, align: "center" });
        ctx.restore();
        if (px0 > 1) { ctx.fillStyle = "rgba(255,255,255,0.08)"; ctx.fillRect(px0, py0 + 24, 1, ph - 24); }
        const dist = (v) => { const d = v * b.r_km; return d >= 1e6 ? (d / 1e6).toFixed(2) + " million km" : (Math.round(d / 100) * 100).toLocaleString("en-US") + " km"; }, mid = px0 + cw / 2, yb = py0 + ch;
        T(ctx, b.name, mid, yb - (narrow ? 16 : 58), { size: narrow ? 12 : 15, weight: 600, color: "#f4f5f7", align: "center" });
        if (!narrow) {
          const roomy = cw > 210;
          T(ctx, b.own ? "its own field" : "induced", mid, yb - 41, { size: 11, color: b.own ? "rgba(190,214,255,0.85)" : "rgba(255,186,140,0.85)", align: "center" });
          T(ctx, `${roomy ? b.innerLabel : "obstacle"} ${dist(b.inner)}`, mid, yb - 25, { size: 10.5, mono: true, color: PAL.muted, align: "center" });
          T(ctx, `${roomy ? "bow shock" : "shock"} ${dist(b.shock)}`, mid, yb - 11, { size: 10.5, mono: true, color: PAL.muted, align: "center" });
        }
      });
      T(ctx, "← Sun", 14, 20, { size: 12, color: PAL.sun });
      if (!narrow) T(ctx, u < 0.5 ? "Each scaled to fit its panel" : "All to one scale", 14, 38, { size: 11, mono: true, color: PAL.muted });
    } });
    for (const b of BODIES) window.FK.pixels(`assets/img/${b.map}-equirect.jpg`).then(tex => { b.tex = tex; b.gkey = ""; st.redraw(); }).catch(() => { /* the plain ball stays */ });
    document.querySelectorAll("#seg-scale button").forEach(btn => btn.addEventListener("click", () => {
      document.querySelectorAll("#seg-scale button").forEach(x => x.setAttribute("aria-pressed", String(x === btn)));
      mode = btn.dataset.mode; target = mode === "km" ? 1 : 0; st.redraw();
    }));
  }
  window.FK.fontsReady().then(start);
})();
