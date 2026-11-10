/* The reconnection section's figure, second generation: the Dungey cycle with a substorm, drawn live.
 *
 * The same kinematic model as the hero (js/gfx/meridian.js), now changing in time. One number drives it: the open
 * flux F in the polar cap. Dayside reconnection adds to it at Φ_D and tail reconnection takes from it at Φ_N,
 * dF/dt = Φ_D − Φ_N (Siscoe & Huang 1985; Cowley & Lockwood 1992), and the cap's edge moves out and in as F does.
 *
 *   growth     Φ_N = 0. Every line opened at the nose is laid along a lobe. The lobes fill, the plasma sheet thins
 *              and stretches, and the open–closed boundary moves equatorward.
 *   onset      The neutral sheet's field falls to zero about 22 R_E down the tail: a new X-line, first among closed
 *              field lines, which it pinches into a plasmoid (Hones 1979; Baker et al. 1996). Φ_N is still 0:
 *              closed lines are being cut, not open ones.
 *   expansion  The X-line reaches the lobes' open lines and closes them about three times faster than the day side
 *              opens them. It stays where it formed. Each line it cuts leaves as two: a closed one that snaps back
 *              toward Earth and piles up there, and a hairpin carried down the tail behind the plasmoid.
 *   recovery   The X-line retreats down the tail, closed lines fill in behind it, and Φ_N falls away.
 *
 * Each drawn line carries the same flux, so the count of open lines is F. With Earth's field that makes the cap
 * 0.51 GWb at its smallest and 0.85 GWb at its largest (Milan et al. 2007 found 0.2 to 1 GWb), and at a dayside
 * voltage of 50 kV the half-minute loop is about three hours.
 *
 * What is drawn slower than that clock: the solar wind, and the outflow from the tail's X-line (V_OUT). At the
 * loop's own scale the outflow would cross the picture in half a second; it is slowed enough to follow, and kept
 * fast enough that the reconnected field near the X-line stays weaker than the lobe field, as it is in the tail.
 */
(function () {
  "use strict";
  const HX = window.HX, { TAU, DEG, clamp, lerp, smooth, rgba, PAL, M, rng, curve } = HX;
  const SW = { pd: 2, bz: -5, bt: 6, tilt: 0, mach: 8 };
  const T = 30, NLINES = 11, DX = 13, DPSI = 0.0125, V = NLINES * DX / T, PHI_D = NLINES * DPSI / T;
  const PSI_DS = -0.1, PSI_NS = 0.2, X_IN = -4.2, REST = [-1 / 1.6, -1 / 2.3, -1 / 3.3, -1 / 5, PSI_DS, PSI_NS, 1 / 3.3, 1 / 2.3, 1 / 1.6];   // the source and sink shells, and the lines at rest inside them
  const GWB = 3.95;                                             // GWb per unit of Ψ: π R_E² B_eq, the flux of half a cap per sin² of its colatitude
  const KV_D = 50, CLOCK = PHI_D * GWB * 1e9 / (KV_D * 1e3);    // seconds of the magnetosphere to one of the loop
  const T_ON = 13.5, T_EXP = 15.5, T_REC = 22.5, T_END = T - 1.5, T_UP = 0.6;   // T_UP: how long the tail's rate takes to come up
  // dF/dt over Φ_D while the tail unloads, set so that the loop's flux balances
  const G_EXP = -(T_EXP + T_UP / 2 + (T_END - T_REC) / 2 + 1.5) / (T_UP / 2 + (T_REC - T_EXP - T_UP) + (T_END - T_REC) / 2);
  const PSI_XD0 = -(Math.sin(11 * DEG) ** 2), PSI_XN0 = Math.sin(19 * DEG) ** 2, X_NEAR = -22;
  // tailward of the X-line: the outflow's speed (R_E a second of the loop) and the distance over which it gets up to
  // it, and the plasmoid's length; earthward of it, the width of the dip in the sheet's flux
  const V_OUT = 7, S_0 = 4, L_P = 15, W_E = 13;
  const AXIS = [0.002, 0.398, 0.917], PRIME = [0.957, -0.266, 0.114];
  const VIEW_GSE = { right: [-1, 0, 0], down: [0, -0.239, -0.971], toward: [0, 0.971, -0.239] };
  const PHASES = [["Growth phase", "Opened flux piles into the lobes. The plasma sheet thins."],
                  ["Onset", "A new X-line forms in the near tail and pinches off a plasmoid."],
                  ["Expansion phase", "The tail unloads: lobe flux closes, the plasmoid leaves, the aurora brightens."],
                  ["Recovery phase", "The X-line retreats down the tail and the plasma sheet refills."]];

  /** dF/dt over Φ_D at loop time u: the tail closes no open flux until its X-line has cut down to the lobes. */
  const gOf = (u) => u < T_EXP ? 1 : u < T_EXP + T_UP ? lerp(1, G_EXP, smooth(T_EXP, T_EXP + T_UP, u)) : u < T_REC ? G_EXP : u < T_END ? lerp(G_EXP, 1, smooth(T_REC, T_END, u)) : 1;
  const NTAB = 3000, FTAB = new Float64Array(NTAB + 1);
  for (let i = 1; i <= NTAB; i++) FTAB[i] = FTAB[i - 1] + PHI_D * gOf((i - 0.5) * T / NTAB) * T / NTAB;
  for (let i = 0; i <= NTAB; i++) FTAB[i] -= FTAB[NTAB] * i / NTAB;   // close the loop exactly
  const dF = (u) => { const f = clamp(u / T, 0, 1) * NTAB, i = Math.min(NTAB - 1, f | 0); return FTAB[i] + (f - i) * (FTAB[i + 1] - FTAB[i]); };
  const K_FREEZE = PSI_XN0 + dF(T_EXP) / 2;
  /** The flux the tail's X-line has closed since it reached the lobes, by loop time u. */
  const closed = (u) => u <= T_EXP ? 0 : PHI_D * (u - T_EXP) - (dF(u) - dF(T_EXP));
  /** The plasmoid's flux along its length, 0 to 1: nothing at either end, most at its O-point. */
  const bump = (f) => f <= 0 || f >= 1 ? 0 : 16 * f * f * (1 - f) * (1 - f);

  /** Everything the model needs at loop time u (0 ≤ u < T). */
  function stateAt(u) {
    const d = dF(u), target = PSI_XN0 + d / 2, g = gOf(u), rel = Math.max(0, u - T_EXP), vr = V_OUT * rel;
    const grow = smooth(0, T_ON, u), back = smooth(T_EXP, T_EXP + 3.5, u), phiN = PHI_D * (1 - g), away = Math.max(0, u - T_REC);
    const cutv = u < T_EXP ? smooth(T_ON, T_EXP, u) : 1 - smooth(T - 2.2, T - 0.6, u);
    return {
      u, d, g, target, rel, phiN,
      cut: cutv,                                                  // how far the new X-line has cut through the closed lines to the lobes; at the loop's end, how much of it is left
      psiFar: u < T_EXP ? target : lerp(K_FREEZE, target, smooth(T_REC, T - 2, u)),
      // the X-line: where it forms through the expansion, then away down the tail
      xc: X_NEAR - 3 * smooth(T_EXP + 1, T_REC, u) - 4.2 * away * away / (away + 1.2),   // past the picture's edge about 4.5 s into recovery
      sRel: (vr + Math.sqrt(vr * vr + 4 * vr * S_0)) / 2,         // how far behind the X-line the plasmoid's near end is
      nn: closed(u),
      psiXd: PSI_XD0 - d / 2,
      q: 0.95 - 0.45 * grow * (1 - back),                        // how fast the sheet's flux falls with distance: stretching through the growth phase, then dipolarization
      thin: 1 - 0.5 * grow * (1 - back),
      thick: 0.45 * back * (1 - smooth(T_REC + 1.5, T - 0.8, u)),
      act: u < T_ON ? 0 : Math.max(u < T_EXP + T_UP ? 0.5 * smooth(0, 0.3, cutv) : 0, clamp(phiN / PHI_D / 2.6, 0, 1) * cutv),
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
      this.stage = HX.stage(canvas, { stillAt: 16, resize: (st) => this.resize(st), draw: (ctx, w, h, t, dt) => this.frame(ctx, t, dt) });
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

    /** Puts a loop time's state into the model's parameters: the flux along the neutral sheet, and its thickness.
     *
     *  Earthward of the X-line the flux rises from the X-line's value to the dipole's: few lines near the X-line,
     *  where they move fast, and many where they pile up nearer Earth. Tailward of it each line the X-line has cut
     *  loose is carried away at the outflow's speed, so the flux there is the X-line's value at the time that line
     *  was cut; beyond the first of them is the plasmoid, made at onset of the closed lines that crossed the sheet
     *  beyond the X-line. */
    apply(S) {
      const E = this.E, p = E.p, top = E.dipole(X_IN, 0), A = 8;
      const fall = (x, q) => Math.pow(1 + (X_IN - x) / A, -q), fN = fall(-130, S.q), fN0 = fall(-130, 0.5);
      const base = (x) => S.psiFar + (top - S.psiFar) * clamp((fall(Math.min(x, X_IN), S.q) - fN) / (1 - fN), 0, 1);
      const DO = 1.1 * (top - K_FREEZE) * (fall(X_NEAR, 0.5) - fN0) / (1 - fN0);     // the plasmoid's flux
      const rX = S.phase >= 2 ? S.target : S.psiFar;
      p.psiXd = S.psiXd;
      p.ridgeFn = (x) => {
        const b = base(x);
        if (!S.phase) return b;
        const s = S.xc - x;
        if (s <= 0) return lerp(b, rX, S.cut * Math.exp(-((s / W_E) ** 2)) * smooth(X_IN - 0.5, X_IN - 5, x));
        if (S.phase === 1) return lerp(b, rX + DO * bump(s / L_P), S.cut);
        const tau = s * s / (V_OUT * (s + S_0));                 // how long ago the line now here was cut
        return lerp(b, tau < S.rel ? rX + S.nn - closed(S.u - tau) : rX + S.nn + DO * bump((s - S.sRel) / L_P), S.cut);
      };
      // The sheet's half-thickness, as the field is rounded over it: thin where the X-line is and behind the
      // plasmoid, thicker earthward once the field has snapped back. It changes slowly along the tail on purpose:
      // a sharp pinch in it at the X-line would put a low point of its own into the field there.
      const sig0 = (x) => 0.9 + 0.045 * Math.max(0, -x - 8), mX = Math.min(S.thin, 0.62);
      p.sheet = (x) => {
        const s = S.xc - x, m0 = S.thin + (s <= 0 ? S.thick * smooth(0, 9, -s) : 0);
        return Math.max(0.55, sig0(x) * (S.phase ? lerp(m0, s <= 0 ? lerp(mX, m0, smooth(0, 10, -s)) : mX, S.cut) : m0));
      };
      // the plasma sheet as it is drawn: pinched at the X-line, bulging round the plasmoid
      this.glow = (x) => {
        const s = S.xc - x, f = S.phase === 1 ? s / L_P : S.phase === 2 ? (s - S.sRel) / L_P : -1;
        return S.phase ? p.sheet(x) * (1 - 0.5 * S.cut * Math.exp(-((s / 3.5) ** 2))) + 0.75 * sig0(x) * (S.phase === 1 ? S.cut : 1) * bump(f) : p.sheet(x);
      };
    }

    /** The near-Earth X-line as the field has it: going down the tail, the first low point of the neutral sheet's
     *  flux with a rise behind it. Returns [x, Ψ, the rise] or null. */
    nearX() {
      const E = this.E, h = E.grid.h, end = E.grid.x0 + 2;
      let a = E.at(-9, 0), b = E.at(-9 - h, 0), low = null;
      for (let x = -9 - 2 * h; x > end; x -= h) {
        const c = E.at(x, 0);
        if (low) {
          low[2] = Math.max(low[2], c - low[1]);
          if (x < low[0] - 10) { if (low[2] > 0.1 * DPSI) return low; low = null; }
        } else if (b <= a && b < c) {
          const den = a - 2 * b + c, off = den > 1e-12 ? clamp(0.5 * (c - a) / den, -0.5, 0.5) : 0;   // the low point, between nodes
          low = [x + h + off * h, b - 0.25 * (c - a) * off, c - b];
        }
        a = b; b = c;
      }
      return low && low[2] > 0.1 * DPSI ? low : null;
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
        if (this.cost < 13 || (this.tick++ & 1)) { E.relax(this.cost < 13 ? 8 : 12, 1.86); E.compose(); }
        // the near-Earth X-line, where the field has one; the open flux ends there once it has cut down to the lobes
        const nX = this.nearX(), strong = nX ? clamp(nX[2] / (0.5 * DPSI), 0, 1) : 0;
        psiXn = nX && nX[1] < S.psiFar ? nX[1] : S.psiFar; xX = nX ? nX[0] : null;
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
        const gx = [], gh = [];
        for (let x = -6; x >= L.xRight - 2; x -= 0.5) { gx.push(x); gh.push(this.glow(x) * smooth(-6, -11, x)); }
        for (const f of [2.5, 2.05, 1.6, 1.15, 0.7]) {
          ctx.beginPath();
          for (let i = 0; i < gx.length; i++) { const q = P(gx[i], gh[i] * f); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }
          for (let i = gx.length - 1; i >= 0; i--) { const q = P(gx[i], -gh[i] * f); ctx.lineTo(q[0], q[1]); }
          ctx.closePath(); ctx.fillStyle = "rgba(255,140,70,0.046)"; ctx.fill();
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
        // a flash where each line reconnects: at the nose, and at the tail's X-line. A drawn line is Win + m·DPSI, so
        // the count of them under an X-point's value changes as each one reaches it.
        const mD = Math.floor((S.psiXd - Win) / DPSI), mN = nX ? Math.floor((nX[1] - Win) / DPSI) : this.lastN;
        if (mD !== this.lastD) { this.pulseD = t; this.lastD = mD; }
        if (nX && S.act > 0.15 && mN !== this.lastN) this.pulseN = t;
        this.lastN = mN;
        const flash = (q, age, life, big) => {
          if (age < 0 || age > life || still) return;
          const R = L.k * (0.7 + big * age), g = ctx.createRadialGradient(q[0], q[1], 0, q[0], q[1], R);
          g.addColorStop(0, `rgba(255,236,190,${0.8 * (1 - age / life) ** 2})`); g.addColorStop(1, "rgba(255,236,190,0)");
          ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(q[0], q[1], R, 0, TAU); ctx.fill(); ctx.restore();
        };
        flash(P(this.mp[0][0], 0), t - this.pulseD, 0.9, 1.5);
        if (nX) {
          const q = P(xX, 0), act = S.act * strong;
          flash(q, t - this.pulseN, 0.7, 2.0);
          ctx.save(); ctx.globalCompositeOperation = "lighter";
          const g = ctx.createRadialGradient(q[0], q[1], 0, q[0], q[1], L.k * 1.8);
          g.addColorStop(0, `rgba(255,205,140,${(0.1 + 0.4 * act) * smooth(0.15, 1, strong)})`); g.addColorStop(1, "rgba(255,205,140,0)");
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(q[0], q[1], L.k * 1.8, 0, TAU); ctx.fill(); ctx.restore();
          // plasma jets both ways along the sheet from the X-line
          if (!still && dt > 0 && this.jr() < dt * (2 + 20 * act)) this.jets.push({ x: xX, zf: this.jr() - 0.5, dir: this.jr() < 0.5 ? 1 : -1, age: 0, v: V_OUT * (1.1 + 0.5 * this.jr()) });
        }
        ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.lineCap = "round";
        this.jets = this.jets.filter(j => j.age < 3.4 && j.x > L.xRight - 3 && j.x < -7.5);
        for (const j of this.jets) {
          // out of the X-line at about the pace of the lines they carry; earthward they brake where the field turns
          // dipolar, and tailward they end at the plasmoid
          const brake = j.dir > 0 ? smooth(-8.5, -16, j.x) : 1, v = j.v * (0.1 + 0.9 * brake) * Math.min(1, 0.3 + 2.4 * j.age);
          j.age += dt; j.x += j.dir * v * dt;
          const ahead = j.dir < 0 && (S.phase === 1 || S.phase === 2) ? smooth(0, 2.5, S.xc - S.sRel - 3 - j.x) : 0;
          const z = j.zf * 0.5 * this.glow(j.x), len = clamp(v * 0.34, 0.5, 2), q = P(j.x, z), q2 = P(j.x - j.dir * len, z);
          const al = Math.min(1, j.age * 5) * (1 - j.age / 3.4) * (j.dir > 0 ? 0.25 + 0.75 * brake : 1 - ahead) * a;
          if (al < 0.02) continue;
          const g = ctx.createLinearGradient(q2[0], q2[1], q[0], q[1]);
          g.addColorStop(0, "rgba(255,190,120,0)"); g.addColorStop(1, `rgba(255,198,132,${0.8 * al})`);
          ctx.beginPath(); ctx.moveTo(q2[0], q2[1]); ctx.lineTo(q[0], q[1]); ctx.lineWidth = 1.5 * s; ctx.strokeStyle = g; ctx.stroke();
        }
        for (const st of this.streaks) {
          const tt = (t * V + st.phase * st.span) % st.span, n = st.n, kf = tt / st.span * (n - 1), len = Math.max(2, st.trail * V / st.span * (n - 1));
          if (kf < 0.5) continue;
          const [p, q] = HX.trace(ctx, st.pts, n, kf - len, kf), al = st.alpha * st.wt[Math.round(kf)] * a, g = ctx.createLinearGradient(p[0], p[1], q[0], q[1]);
          g.addColorStop(0, `rgba(255,240,205,${0.1 * al})`); g.addColorStop(1, `rgba(255,240,205,${0.78 * al})`);
          ctx.lineWidth = st.width; ctx.strokeStyle = g; ctx.stroke();
        }
        ctx.restore();
        if (nX && L.wide) {
          const lab = { size: 11.5, mono: true, align: "center" };
          if (strong > 0.5) T2(ctx, "X-line", ...P(xX, -2.4), { ...lab, color: rgba(PAL.loose, 0.85 * a * smooth(0.5, 0.9, strong)) });
          // the plasmoid, named while it is in the picture
          const xO = S.xc - S.sRel - L_P / 2, show = S.phase === 1 ? smooth(0.6, 1, S.cut) : S.phase === 2 ? smooth(L.xRight + 1.5, L.xRight + 5, xO) : 0;
          if (show > 0.02) T2(ctx, "Plasmoid", ...P(xO, -4.5), { ...lab, color: rgba(PAL.loose, 0.85 * a * show) });
        }
      }
      this.drawEarth(ctx, t, S, psiXn);
      if (!L.wide) {                                             // on a phone the words lie over the lower figure: it is dimmed under them
        const y0 = Math.min(L.H * 0.5, L.earth[1] + 150), veil = ctx.createLinearGradient(0, y0 - 110, 0, y0 + 60);
        veil.addColorStop(0, "rgba(3,5,11,0)"); veil.addColorStop(1, "rgba(3,5,11,0.62)");
        ctx.fillStyle = veil; ctx.fillRect(0, y0 - 110, L.W, L.H);
      }
      this.drawPanel(ctx, u, S);
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

    /** The phase in words, the loop as a bar and the clock. */
    drawPanel(ctx, u, S) {
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
    }
  }

  function start() {
    const canvas = document.getElementById("fig-dungey");
    if (!canvas) return;
    Promise.all([window.FK.fontsReady(), window.FK.pixels("assets/img/earth-equirect.jpg")]).then(([, tex]) => { window.HeliosDungey = new Dungey(canvas, tex); }).catch(e => console.error("Helios reconnection figure:", e));
  }
  start();
})();
