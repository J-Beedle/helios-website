/* The reconnection section's figure, second generation: the Dungey cycle with a substorm, drawn live.
 *
 * The same kinematic model as the hero (js/gfx/meridian.js), now changing in time. One number drives it: the open
 * flux F in the polar cap. Dayside reconnection adds to it at Φ_D and tail reconnection takes from it at Φ_N,
 * dF/dt = Φ_D − Φ_N (Siscoe & Huang 1985; Cowley & Lockwood 1992), and the cap's edge moves out and in as F does.
 *
 *   growth     Φ_N = 0. Every line opened at the nose is laid along a lobe. The lobes fill, the plasma sheet thins
 *              and stretches, and the open–closed boundary moves equatorward.
 *   onset      The neutral sheet's field falls to zero about 22 R_E down the tail: a new X-line, first among closed
 *              field lines, which it pinches into a plasmoid (Hones 1979; Baker et al. 1996).
 *   expansion  The X-line reaches the lobes' open lines and closes them nearly three times faster than the day side
 *              opens them. The plasmoid leaves down the tail, the closed lines snap back toward Earth, and plasma
 *              jets both ways from the X-line.
 *   recovery   The X-line retreats down the tail and Φ_N falls away.
 *
 * Each drawn line carries the same flux, so the count of open lines is F. With Earth's field that makes the cap
 * 0.56 GWb at its smallest and 0.82 GWb at onset (Milan et al. 2007 found 0.2 to 1 GWb), and at a dayside
 * voltage of 50 kV the half-minute loop is about three hours.
 */
(function () {
  "use strict";
  const HX = window.HX, { TAU, DEG, clamp, lerp, smooth, rgba, PAL, M, rng, curve } = HX;
  const SW = { pd: 2, bz: -5, bt: 6, tilt: 0, mach: 8 };
  const T = 30, NLINES = 11, DX = 13, DPSI = 0.0125, V = NLINES * DX / T, PHI_D = NLINES * DPSI / T;
  const PSI_DS = -0.1, PSI_NS = 0.2, X_IN = -4.2, REST = [-1 / 1.6, -1 / 2.3, -1 / 3.3, -1 / 5, PSI_DS, PSI_NS, 1 / 3.3, 1 / 2.3, 1 / 1.6];   // the source and sink shells, and the lines at rest inside them
  const GWB = 3.95;                                             // GWb per unit of Ψ: π R_E² B_eq, the flux of half a cap per sin² of its colatitude
  const KV_D = 50, CLOCK = PHI_D * GWB * 1e9 / (KV_D * 1e3);    // seconds of the magnetosphere to one of the loop
  const T_ON = 13.5, T_EXP = 15.5, T_REC = 22.5, G_EXP = -19 / 11;   // dF/dt in units of Φ_D through the expansion: the loop's flux balances
  const PSI_XD0 = -(Math.sin(11 * DEG) ** 2), PSI_XN0 = Math.sin(19 * DEG) ** 2, X_NEAR = -22;
  const AXIS = [0.002, 0.398, 0.917], PRIME = [0.957, -0.266, 0.114];
  const VIEW_GSE = { right: [-1, 0, 0], down: [0, -0.239, -0.971], toward: [0, 0.971, -0.239] };
  const PHASES = [["Growth phase", "Opened flux piles into the lobes. The plasma sheet thins."],
                  ["Onset", "A new X-line forms in the near tail."],
                  ["Expansion phase", "The tail unloads: flux closes, a plasmoid leaves, the aurora brightens."],
                  ["Recovery phase", "The X-line retreats down the tail."]];

  /** dF/dt over Φ_D at loop time u. */
  const gOf = (u) => u < T_ON ? 1 : u < T_EXP ? lerp(1, G_EXP, smooth(T_ON, T_EXP, u)) : u < T_REC ? G_EXP : u < T - 1.5 ? lerp(G_EXP, 1, smooth(T_REC, T - 1.5, u)) : 1;
  const NTAB = 3000, FTAB = new Float64Array(NTAB + 1);
  for (let i = 1; i <= NTAB; i++) FTAB[i] = FTAB[i - 1] + PHI_D * gOf((i - 0.5) * T / NTAB) * T / NTAB;
  for (let i = 0; i <= NTAB; i++) FTAB[i] -= FTAB[NTAB] * i / NTAB;   // close the loop exactly
  const dF = (u) => { const f = clamp(u / T, 0, 1) * NTAB, i = Math.min(NTAB - 1, f | 0); return FTAB[i] + (f - i) * (FTAB[i + 1] - FTAB[i]); };
  const K_FREEZE = PSI_XN0 + dF(T_EXP) / 2;

  /** Everything the model needs at loop time u (0 ≤ u < T). */
  function stateAt(u) {
    const d = dF(u), target = PSI_XN0 + d / 2, g = gOf(u);
    const psiFar = u < T_EXP ? target : lerp(K_FREEZE, target, smooth(T_REC, T - 2, u));
    const xc = X_NEAR - 62 * Math.pow(smooth(T_REC - 1, T - 1.5, u), 1.3);
    const grow = smooth(0, T_ON, u), back = smooth(T_EXP, T_EXP + 3.5, u);
    return {
      d, g, target, psiFar, xc,
      psiXd: PSI_XD0 - d / 2, phiN: PHI_D * (1 - g),
      q: 0.95 - 0.45 * grow * (1 - back),                        // how fast the sheet's flux falls with distance: stretching through the growth phase, then dipolarization
      thin: 1 - 0.55 * grow * (1 - back) + 0.45 * back * (1 - smooth(T_REC, T - 1, u)),
      well: u < T_ON ? 0 : u < T_EXP ? smooth(T_ON, T_EXP, u) : 1 - smooth(T - 2.6, T - 1.1, u),
      wt: 6 + 64 * smooth(T_EXP - 0.3, T_EXP + 5.5, u) * (1 - smooth(T - 1.2, T - 0.2, u)),
      phase: u < T_ON ? 0 : u < T_EXP ? 1 : u < T_REC ? 2 : 3,
    };
  }

  class Dungey {
    constructor(canvas, tex) {
      this.canvas = canvas; this.tex = tex;
      this.mp = M.linMeridian(SW); this.bs = M.jelinek(SW.pd, SW.mach);
      this.E = null; this.fade = 0; this.pulseD = -9; this.pulseN = -9; this.lastD = 0; this.lastN = 0; this.cost = 8; this.tick = 0;
      this.jets = []; this.jr = rng(77);
      this.globeCv = document.createElement("canvas");
      this.stage = HX.stage(canvas, { stillAt: 18.2, resize: (st) => this.resize(st), draw: (ctx, w, h, t, dt) => this.frame(ctx, t, dt) });
    }

    layout(W, H) {
      const wide = W >= 900, k = wide ? Math.min(W / 90, H / 46) : Math.min(W / 52, H / 62);
      const earth = wide ? [W * 0.56, H * 0.5] : [W * 0.46, Math.min(H * 0.24, 250)];
      return { W, H, k, earth, wide, P: (x, z) => [earth[0] - x * k, earth[1] - z * k], xLeft: earth[0] / k, xRight: -(W - earth[0]) / k, zTop: earth[1] / k, zBot: (H - earth[1]) / k };
    }

    resize(st) {
      const L = this.L = this.layout(st.w, st.h);
      this.dpr = st.dpr;
      this.stat = document.createElement("canvas");
      this.stat.width = Math.round(st.w * st.dpr); this.stat.height = Math.round(st.h * st.dpr);
      this.drawStatic();
      const grid = { x0: -66, x1: 22, zmax: Math.min(30, Math.ceil(Math.max(L.zTop, L.zBot)) + 1), h: clamp(Math.round(5 / L.k * 16) / 16, 0.25, 0.5) };
      const key = [grid.zmax, grid.h].join();
      if (key === this.gridKey) { this.streaks = this.makeStreaks(); return; }
      this.gridKey = key;
      clearTimeout(this.building);
      this.building = setTimeout(() => {
        const E = HX.Meridian({ mp: this.mp, bs: this.bs, grid, thetaD: 11, thetaN: 19, dPsi: DPSI, dx: DX, xIn: X_IN });
        this.E = E; this.apply(stateAt(((this.stage.t % T) + T) % T));
        E.solve(560);
        this.streaks = this.makeStreaks();
        this.stage.redraw();
      }, 30);
    }

    /** Puts a loop time's state into the model's parameters. */
    apply(S) {
      const E = this.E, p = E.p, top = E.dipole(X_IN, 0), A = 8, fall = (x) => Math.pow(1 + (X_IN - x) / A, -S.q), fN = fall(-130);
      const base = (x) => S.psiFar + (top - S.psiFar) * clamp((fall(Math.min(x, X_IN)) - fN) / (1 - fN), 0, 1);
      const depth = S.phase === 1 ? S.well * Math.max(0, base(S.xc) - S.psiFar) : S.phase >= 2 ? S.well * Math.max(0, base(S.xc) - S.target) : 0;
      p.psiXd = S.psiXd;
      // the neutral sheet's flux: falling slowly down the tail to the far X-line's value, less the near X-line's well
      p.ridgeFn = (x) => base(x) - (depth ? depth * Math.exp(-(((x - S.xc) / (x < S.xc ? S.wt : 4.5)) ** 2)) : 0);
      p.sheet = (x) => (0.9 + 0.045 * Math.max(0, -x - 8)) * lerp(1, S.thin, smooth(S.xc - 9, S.xc - 2, x));
    }

    makeStreaks() {
      const E = this.E, L = this.L, out = [];
      if (!E) return out;
      const r = rng(0x5EED2027), n = 260, xs = L.xLeft + 3, xe = Math.max(L.xRight - 2, E.grid.x0), count = L.wide ? 210 : 100;
      for (let s = 0; s < count; s++) {
        const rho0 = 0.15 + (Math.max(L.zTop, L.zBot) + 3) * r(), sg = r() < 0.5 ? -1 : 1, path = E.streamline(rho0, xs, xe);
        const tA = path[0][2], tB = path[path.length - 1][2], pts = new Float32Array(n * 2), wt = new Float32Array(n);
        let j = 0;
        for (let i = 0; i < n; i++) {
          const tt = tA + (tB - tA) * i / (n - 1);
          while (j < path.length - 2 && path[j + 1][2] < tt) j++;
          const f = clamp((tt - path[j][2]) / Math.max(path[j + 1][2] - path[j][2], 1e-9), 0, 1);
          const x = path[j][0] + (path[j + 1][0] - path[j][0]) * f, z = path[j][1] + (path[j + 1][1] - path[j][1]) * f, q = L.P(x, sg * z);
          pts[2 * i] = q[0]; pts[2 * i + 1] = q[1]; wt[i] = Math.min(1, (rho0 + 0.6) / (z + 0.6));
        }
        out.push({ pts, wt, span: tB - tA, phase: r(), alpha: 0.2 + 0.5 * r(), width: 0.6 + 0.8 * r(), trail: 0.3 + 0.25 * r(), n });
      }
      return out;
    }

    drawStatic() {
      const L = this.L, P = L.P, s = L.k / 16, ctx = this.stat.getContext("2d");
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      const bg = ctx.createLinearGradient(0, L.H * 0.4, L.W, L.H * 0.6);
      bg.addColorStop(0, "#0d162c"); bg.addColorStop(0.5, "#060a15"); bg.addColorStop(1, "#03050b");
      ctx.fillStyle = bg; ctx.fillRect(0, 0, L.W, L.H);
      const r = rng(0xD0D0);
      for (let i = 0; i < 200; i++) { ctx.fillStyle = `rgba(255,255,255,${0.1 + 0.5 * r()})`; ctx.beginPath(); ctx.arc(r() * L.W, r() * L.H, 0.35 + 0.8 * r(), 0, TAU); ctx.fill(); }
      const mpPts = this.mp.filter(p => p[0] > L.xRight - 12), bsPts = [];
      for (let i = 0; i <= 500; i++) { const th = Math.PI * 0.985 * i / 500, rr = M.bsRadius(th, this.bs), x = rr * Math.cos(th); if (x < L.xRight - 12) break; bsPts.push([x, rr * Math.sin(th)]); }
      const poly = (edge) => { ctx.beginPath(); edge.forEach((p, i) => { const q = P(p[0], p[1]); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); edge.slice().reverse().forEach(p => { const q = P(p[0], -p[1]); ctx.lineTo(q[0], q[1]); }); ctx.closePath(); };
      const line = (pts, flip) => { ctx.beginPath(); pts.forEach((p, i) => { const q = P(p[0], flip ? -p[1] : p[1]); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); };
      poly(bsPts); ctx.fillStyle = "rgba(120,190,255,0.07)"; ctx.fill();
      poly(mpPts);
      const inner = ctx.createRadialGradient(L.earth[0], L.earth[1], 0, L.earth[0], L.earth[1], L.k * 34);
      inner.addColorStop(0, "rgba(24,43,92,0.95)"); inner.addColorStop(1, "rgba(10,18,43,0.92)");
      ctx.fillStyle = inner; ctx.fill();
      for (const flip of [false, true]) {
        ctx.save(); ctx.globalCompositeOperation = "lighter";
        line(bsPts, flip); ctx.lineWidth = 7 * s; ctx.strokeStyle = rgba(PAL.shock, 0.05); ctx.stroke();
        line(mpPts, flip); ctx.lineWidth = 8 * s; ctx.strokeStyle = "rgba(140,184,255,0.09)"; ctx.stroke(); ctx.restore();
        line(bsPts, flip); ctx.setLineDash([5 * s, 4 * s]); ctx.lineWidth = 1 * s; ctx.strokeStyle = rgba(PAL.shock, 0.5); ctx.stroke(); ctx.setLineDash([]);
        line(mpPts, flip); ctx.lineWidth = 1.4 * s; ctx.strokeStyle = "rgba(205,222,255,0.75)"; ctx.stroke();
      }
      this.mpPts = mpPts;
    }

    frame(ctx, t, dt) {
      const L = this.L, E = this.E, P = L.P, s = Math.max(0.8, L.k / 16), t0 = performance.now(), T2 = window.FK.text;
      const u = ((t % T) + T) % T, S = stateAt(u), still = this.stage.reduce;
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(this.stat, 0, 0); ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      let psiXn = S.target, xX = null;
      if (E) {
        this.fade = Math.min(1, this.fade + (dt || 1) * 1.6);
        const a = this.fade;
        this.apply(S);
        // the field follows the changing boundary values by a few sweeps a frame (every other frame when frames run long)
        if (this.cost < 13 || (this.tick++ & 1)) { E.relax(this.cost < 13 ? 6 : 11, 1.86); E.compose(); }
        // the tail's X-point as drawn: the far one, off the picture, until the near one is lower
        const tx = E.tailX(E.grid.x0 + 2, -9);
        const near = tx[0] > E.grid.x0 + 3 && tx[1] < S.psiFar - 1e-4;
        psiXn = near ? tx[1] : S.psiFar; xX = near ? tx[0] : null;
        const Win = PHI_D * t - S.d / 2, c0 = ((Win / DPSI) % 1 + 1) % 1 * DPSI;   // the lattice of drawn values, riding up at the cap's convection rate
        const lines = E.contours(c0, DPSI, PSI_DS, PSI_NS, true), rest = E.contoursAt(REST);
        const stroke = (list, color, width, alpha, glow) => {
          if (!list.length) return;
          ctx.beginPath();
          for (const l of list) {
            const n = l.pts.length >> 1, f = new Float32Array(l.pts.length);
            for (let i = 0; i < n; i++) { f[2 * i] = L.earth[0] - l.pts[2 * i] * L.k; f[2 * i + 1] = L.earth[1] - l.pts[2 * i + 1] * L.k; }
            curve(ctx, f, true);
          }
          if (glow) { ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.lineWidth = width * 4.5; ctx.strokeStyle = rgba(color, alpha * glow); ctx.stroke(); ctx.restore(); }
          ctx.lineWidth = width; ctx.strokeStyle = rgba(color, alpha); ctx.stroke();
        };
        // the plasma sheet's glow, as thick as the model's sheet
        ctx.save(); ctx.globalCompositeOperation = "lighter";
        for (const f of [2.4, 1.6, 0.9]) {
          ctx.beginPath();
          const xs = []; for (let x = -6; x >= L.xRight - 2; x -= 1) xs.push(x);
          const hh = (x) => E.p.sheet(x) * smooth(-6, -10, x) * f * (xX !== null ? 0.35 + 0.65 * smooth(1.5, 7, Math.abs(x - xX)) : 1);
          xs.forEach((x, i) => { const q = P(x, hh(x)); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); });
          xs.slice().reverse().forEach(x => { const q = P(x, -hh(x)); ctx.lineTo(q[0], q[1]); });
          ctx.closePath(); ctx.fillStyle = "rgba(255,140,70,0.075)"; ctx.fill();
        }
        ctx.restore();
        ctx.save(); ctx.lineJoin = "round"; ctx.lineCap = "round";
        stroke(rest, PAL.closed, 0.9 * s, 0.34 * a, 0);
        stroke(lines.filter(l => l.type === "closed"), PAL.closed, 1.1 * s, 0.75 * a, 0.1);
        stroke(lines.filter(l => l.type === "open"), PAL.open, 1.05 * s, 0.7 * a, 0);
        stroke(lines.filter(l => l.type === "loose"), PAL.loose, 1.1 * s, 0.8 * a, 0.14);
        const imf = lines.filter(l => l.type === "imf");
        stroke(imf, PAL.imf, 1.15 * s, 0.8 * a, 0.12);
        // upstream of the grid the lines are straight
        const tauPhase = (c0 - S.psiXd) / E.p.e0, ups = [];
        ctx.beginPath();
        for (let n = -14; n <= 6; n++) { const x = 60 - (E.tauX + tauPhase + n * DX); if (x > E.grid.x1 && x < L.xLeft + 1) { const q = P(x, 0); ctx.moveTo(q[0], 0); ctx.lineTo(q[0], L.H); ups.push(x); } }
        const fall = ctx.createLinearGradient(0, 0, 0, L.H), lo = L.wide ? 0.32 : 0.8;
        fall.addColorStop(0, rgba(PAL.imf, 0.8 * a)); fall.addColorStop(0.14, rgba(PAL.imf, 0.8 * a)); fall.addColorStop(0.26, rgba(PAL.imf, lo * a)); fall.addColorStop(1, rgba(PAL.imf, lo * a));
        ctx.lineWidth = 1.15 * s; ctx.strokeStyle = fall; ctx.stroke();
        const heads = (x) => { const q = P(x, L.zTop * 0.72); HX.arrow(ctx, q, 0, 1, 4.4 * s, rgba(PAL.imf, 0.9 * a)); };
        ups.forEach(heads);
        for (const l of imf) { const x = l.pts[0]; if (x > 14.5 && Math.abs(l.pts[0] - l.pts[l.pts.length - 2]) < 0.05) heads(x); }
        ctx.restore();
        // a flash where each line reconnects: at the nose, and at the tail's X-line while it is closing open flux
        const kD = Math.floor((S.psiXd - c0) / DPSI), kN = Math.floor((psiXn - c0) / DPSI) + Math.floor(Win / DPSI);
        if (kD !== this.lastD) { this.pulseD = t; this.lastD = kD; }
        if (xX !== null && S.phiN > 0.2 * PHI_D && kN !== this.lastN) this.pulseN = t;
        this.lastN = kN;
        const flash = (q, age, life, big) => {
          if (age < 0 || age > life || still) return;
          const R = L.k * (0.7 + big * age), g = ctx.createRadialGradient(q[0], q[1], 0, q[0], q[1], R);
          g.addColorStop(0, `rgba(255,236,190,${0.8 * (1 - age / life) ** 2})`); g.addColorStop(1, "rgba(255,236,190,0)");
          ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(q[0], q[1], R, 0, TAU); ctx.fill(); ctx.restore();
        };
        flash(P(this.mp[0][0], 0), t - this.pulseD, 0.9, 1.5);
        if (xX !== null) {
          const q = P(xX, 0), act = clamp(S.phiN / PHI_D / 2.5, 0, 1) * S.well;
          flash(q, t - this.pulseN, 0.7, 2.2);
          ctx.save(); ctx.globalCompositeOperation = "lighter";
          const g = ctx.createRadialGradient(q[0], q[1], 0, q[0], q[1], L.k * 1.8);
          g.addColorStop(0, `rgba(255,205,140,${0.12 + 0.4 * act})`); g.addColorStop(1, "rgba(255,205,140,0)");
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(q[0], q[1], L.k * 1.8, 0, TAU); ctx.fill(); ctx.restore();
          // plasma jets both ways along the sheet from the X-line
          if (!still && dt > 0 && this.jr() < dt * (4 + 46 * act)) this.jets.push({ x: xX, z: (this.jr() - 0.5) * 0.5, dir: this.jr() < 0.5 ? 1 : -1, age: 0, v: 9 + 6 * this.jr() });
        }
        ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.lineCap = "round";
        this.jets = this.jets.filter(j => j.age < 2.6 && j.x > L.xRight - 3 && j.x < -7.5);
        for (const j of this.jets) {
          const brake = j.dir > 0 ? smooth(-8, -15, j.x) : 1, v = j.v * (0.12 + 0.88 * brake);
          j.age += dt; j.x += j.dir * v * dt;
          const q = P(j.x, j.z), q2 = P(j.x - j.dir * v * 0.09, j.z), al = Math.min(1, j.age * 5) * (1 - j.age / 2.6) * (j.dir > 0 ? 0.25 + 0.75 * brake : 1);
          ctx.beginPath(); ctx.moveTo(q2[0], q2[1]); ctx.lineTo(q[0], q[1]); ctx.lineWidth = 1.6 * s; ctx.strokeStyle = `rgba(255,190,120,${0.85 * al * a})`; ctx.stroke();
        }
        for (const st of this.streaks) {
          const tt = (t * V + st.phase * st.span) % st.span, n = st.n, kf = tt / st.span * (n - 1), len = Math.max(2, st.trail * V / st.span * (n - 1));
          if (kf < 0.5) continue;
          const [p, q] = HX.trace(ctx, st.pts, n, kf - len, kf), al = st.alpha * st.wt[Math.round(kf)] * a, g = ctx.createLinearGradient(p[0], p[1], q[0], q[1]);
          g.addColorStop(0, `rgba(255,240,205,${0.1 * al})`); g.addColorStop(1, `rgba(255,240,205,${0.78 * al})`);
          ctx.lineWidth = st.width; ctx.strokeStyle = g; ctx.stroke();
        }
        ctx.restore();
        if (xX !== null && S.well > 0.5 && L.wide) T2(ctx, "X-line", ...P(xX, -2.4), { size: 11.5, mono: true, align: "center", color: rgba(PAL.loose, 0.85 * a) });
        this.lines = lines; this.c0 = c0;
      }
      this.drawEarth(ctx, t, S, psiXn);
      if (!L.wide) {                                             // on a phone the words lie over the lower figure: it is dimmed under them
        const y0 = Math.min(L.H * 0.5, L.earth[1] + 150), veil = ctx.createLinearGradient(0, y0 - 110, 0, y0 + 60);
        veil.addColorStop(0, "rgba(3,5,11,0)"); veil.addColorStop(1, "rgba(3,5,11,0.62)");
        ctx.fillStyle = veil; ctx.fillRect(0, y0 - 110, L.W, L.H);
      }
      this.drawPanel(ctx, t, u, S, psiXn);
      this.cost += 0.06 * (performance.now() - t0 - this.cost);
    }

    drawEarth(ctx, t, S, psiXn) {
      const L = this.L, c = L.earth, R = Math.max(L.k, 5);
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      const glow = ctx.createRadialGradient(c[0], c[1], 0, c[0], c[1], R * 1.25);
      glow.addColorStop(0.7, "rgba(0,0,0,0)"); glow.addColorStop(0.8, "rgba(115,184,255,0.35)"); glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(c[0], c[1], R * 1.25, 0, TAU); ctx.fill(); ctx.restore();
      const ph = this.stage.reduce ? 0 : t * (CLOCK / 86164) * TAU, e0 = [AXIS[1] * PRIME[2] - AXIS[2] * PRIME[1], AXIS[2] * PRIME[0] - AXIS[0] * PRIME[2], AXIS[0] * PRIME[1] - AXIS[1] * PRIME[0]];
      const prime = [0, 1, 2].map(i => PRIME[i] * Math.cos(ph) + e0[i] * Math.sin(ph));   // the Earth turns at the loop's own pace: about 45° in its three hours
      const size = Math.max(2, Math.ceil(2 * R * this.dpr));
      if (this.globeKey !== size + ":" + Math.round(ph * 400)) { HX.globe(this.globeCv, this.tex, size, VIEW_GSE, AXIS, prime); this.globeKey = size + ":" + Math.round(ph * 400); }
      ctx.drawImage(this.globeCv, c[0] - R, c[1] - R, 2 * R, 2 * R);
      // the aurora at the open field's edge: the cusp by day, brightest at night while the tail reconnects
      const td = Math.asin(Math.sqrt(-S.psiXd)), tn = Math.asin(Math.sqrt(Math.max(psiXn, 0.01)));
      const night = 0.35 + 1.6 * clamp(S.phiN / PHI_D / 2.7, 0, 1), day = 0.5 + 0.9 * clamp(1 - (t - this.pulseD) / 1.4, 0, 1);
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      for (const sg of [1, -1]) for (const [col, br, sx] of [[td, day, 1], [tn, night, -1]]) for (const w of [0, 0.03, 0.06]) {
        const th = col + w, x = c[0] - sx * Math.sin(th) * R * 1.03, y = c[1] - sg * Math.cos(th) * R * 1.03;
        ctx.fillStyle = rgba(PAL.aurora, Math.min(0.7, 0.2 * br)); ctx.beginPath(); ctx.arc(x, y, Math.max(1.2, R * (0.07 + 0.03 * br)), 0, TAU); ctx.fill();
      }
      ctx.restore();
    }

    /** The phase, the clock, the polar cap seen from above and the flux through it. */
    drawPanel(ctx, t, u, S, psiXn) {
      const L = this.L, T2 = window.FK.text, a = this.E ? this.fade : 0;
      if (!a) return;
      const ph = PHASES[S.phase], x1 = L.W - (L.wide ? 40 : 16), y0 = L.wide ? 104 : 74;
      if (L.wide) {
        const g = ctx.createRadialGradient(x1 - 150, y0 + 22, 20, x1 - 150, y0 + 22, 330);
        g.addColorStop(0, `rgba(5,9,20,${0.62 * a})`); g.addColorStop(1, "rgba(5,9,20,0)");
        ctx.fillStyle = g; ctx.fillRect(x1 - 520, y0 - 70, 560, 190);
      }
      T2(ctx, ph[0].toUpperCase(), x1, y0, { size: L.wide ? 13 : 11.5, mono: true, weight: 600, align: "right", color: rgba(PAL.accent, 0.95 * a) });
      if (L.wide) T2(ctx, ph[1], x1, y0 + 21, { size: 13, align: "right", color: `rgba(244,245,247,${0.8 * a})` });
      // the loop as a bar: the four phases, and where it is
      const bw = L.wide ? 250 : 130, bx = x1 - bw, by = y0 + (L.wide ? 42 : 16);
      const marks = [0, T_ON, T_EXP, T_REC, T];
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = i === S.phase ? rgba(PAL.accent, 0.75 * a) : `rgba(244,245,247,${0.2 * a})`;
        ctx.fillRect(bx + bw * marks[i] / T + 1, by, bw * (marks[i + 1] - marks[i]) / T - 2, 3);
      }
      ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.beginPath(); ctx.arc(bx + bw * u / T, by + 1.5, 3.2, 0, TAU); ctx.fill();
      const mins = Math.round(u * CLOCK / 60), hh = Math.floor(mins / 60), mm = String(mins % 60).padStart(2, "0");
      if (L.wide) T2(ctx, `${hh} h ${mm} min`, x1, by + 17, { size: 11, mono: true, align: "right", color: `rgba(244,245,247,${0.5 * a})` });

      // the northern polar cap from above, the Sun to the left as in the picture
      const R = L.wide ? Math.min(92, L.H * 0.12) : 34, cx = L.wide ? L.W - 40 - R : 16 + R, cy = L.wide ? L.H - 64 - R : 24 + R, per = R / 34;   // 34° of colatitude to the rim
      const td = Math.asin(Math.sqrt(-S.psiXd)) / DEG, tn = Math.asin(Math.sqrt(Math.max(psiXn, 1e-4))) / DEG, rc = (td + tn) / 2, off = (tn - td) / 2;
      ctx.save();
      ctx.fillStyle = `rgba(6,10,22,${0.78 * a})`; ctx.beginPath(); ctx.arc(cx, cy, R + 7, 0, TAU); ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = `rgba(255,255,255,${0.1 * a})`;
      for (const c of [10, 20, 30]) { ctx.beginPath(); ctx.arc(cx, cy, c * per, 0, TAU); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.stroke();
      const ox = cx + off * per, night = clamp(S.phiN / PHI_D / 2.7, 0, 1);
      // the oval: a band outside the open–closed boundary, brighter by night as the tail unloads
      for (let i = 0; i < 72; i++) {
        const a0 = i / 72 * TAU, a1 = (i + 1.08) / 72 * TAU, nearNight = 0.5 + 0.5 * Math.cos(a0 + 0.02), w = (3.5 + 3.5 * nearNight + 3 * night * nearNight) * per;
        ctx.beginPath(); ctx.arc(ox, cy, rc * per + w, a0, a1); ctx.arc(ox, cy, rc * per, a1, a0, true); ctx.closePath();
        ctx.fillStyle = rgba(PAL.aurora, a * (0.16 + 0.2 * nearNight + 0.5 * night * nearNight ** 2)); ctx.fill();
      }
      ctx.beginPath(); ctx.arc(ox, cy, rc * per, 0, TAU); ctx.fillStyle = `rgba(88,60,150,${0.5 * a})`; ctx.fill();
      ctx.lineWidth = 1.2; ctx.strokeStyle = rgba(PAL.open, 0.9 * a); ctx.stroke();
      // the gaps where flux crosses the boundary: the day side's (gold), and the night side's while the tail reconnects
      ctx.lineWidth = 3; ctx.lineCap = "round";
      ctx.beginPath(); ctx.arc(ox, cy, rc * per, Math.PI - 0.5, Math.PI + 0.5); ctx.strokeStyle = rgba(PAL.imf, 0.95 * a); ctx.stroke();
      if (S.phiN > 0.05 * PHI_D) { ctx.beginPath(); ctx.arc(ox, cy, rc * per, -0.6, 0.6); ctx.strokeStyle = rgba(PAL.loose, clamp(0.3 + S.phiN / PHI_D / 2, 0, 1) * a); ctx.stroke(); }
      // the feet of the picture's own field lines, moving from noon to midnight
      if (this.lines) for (let n = -24; n <= 24; n++) {
        const v = this.c0 + n * DPSI;
        if (v < PSI_DS || v > PSI_NS) continue;
        const col = Math.asin(Math.sqrt(Math.abs(v))) / DEG, x = cx + (v < 0 ? -col : col) * per, open = v > S.psiXd && v < psiXn;
        ctx.fillStyle = rgba(open ? PAL.open : PAL.closed, a); ctx.beginPath(); ctx.arc(x, cy, 1.7, 0, TAU); ctx.fill();
      }
      ctx.restore();
      if (L.wide) {
        T2(ctx, "noon", cx - R - 12, cy, { size: 10.5, mono: true, align: "right", color: `rgba(255,206,140,${0.8 * a})` });
        T2(ctx, "The polar cap from above", cx, cy - R - 20, { size: 11.5, align: "center", color: `rgba(244,245,247,${0.72 * a})` });
        // the flux through it and the two rates
        const F = (psiXn - S.psiXd) * GWB, gx = cx - R - 64, kvN = Math.round(S.phiN / PHI_D * KV_D / 5) * 5;
        T2(ctx, "OPEN FLUX", gx, cy + R - 62, { size: 10.5, mono: true, align: "right", color: `rgba(244,245,247,${0.5 * a})` });
        T2(ctx, F.toFixed(2) + " GWb", gx, cy + R - 42, { size: 21, weight: 600, align: "right", color: rgba(PAL.open, a) });
        T2(ctx, `day side opens  ${KV_D} kV`, gx, cy + R - 18, { size: 11, mono: true, align: "right", color: rgba(PAL.imf, 0.9 * a) });
        T2(ctx, `tail closes  ${String(kvN).padStart(3, " ")} kV`, gx, cy + R - 2, { size: 11, mono: true, align: "right", color: rgba(PAL.loose, (kvN ? 0.95 : 0.45) * a) });
      }
    }
  }

  function start() {
    const canvas = document.getElementById("fig-dungey");
    if (!canvas) return;
    Promise.all([window.FK.fontsReady(), window.FK.pixels("assets/img/earth-equirect.jpg")]).then(([, tex]) => { window.HeliosDungey = new Dungey(canvas, tex); }).catch(e => console.error("Helios reconnection figure:", e));
  }
  start();
})();
