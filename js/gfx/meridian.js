/* The noon–midnight plane as one kinematic model, for the hero and the reconnection figure.
 *
 * Field lines are the contours of a single flux function Ψ(x, z), so no two can cross, and a line keeps its value
 * of Ψ − W(t) as it moves: lines travel with the plasma (the E×B drift) and change partners only where the field
 * vanishes, at the X-points. The pieces:
 *
 * - Outside the magnetopause Ψ is the solar wind's travel time τ from upstream: a field line frozen into the flow is
 *   the set of parcels that left together, so the draped lines are the flow's isochrones and move exactly with the
 *   streaks. The flow is straight to the bow shock (Jelínek et al. 2012), takes the Rankine–Hugoniot jump there for
 *   the local shock normal, and passes through the sheath on streamlines that share the mass flux evenly, speeding
 *   up again round the flanks (after Spreiter et al. 1966). At the magnetopause the speed is the reconnection
 *   outflow's, so a line reaches the nose in a finite time and its kink then runs tailward along the boundary.
 * - Inside, Ψ = Ψ₀ + φ. Ψ₀ = −x|x|/r³ has the dipole's field lines r = L cos²λ as its contours, and its value at a
 *   footpoint is ∓sin²(colatitude): equal steps of Ψ are equal steps of magnetic flux through the polar cap. φ is
 *   harmonic (the fields of currents elsewhere are curl-free here) and takes Ψ to the boundary values: the
 *   travel-time values along the magnetopause (Lin et al. 2010), and a prescribed profile R(x) along the tail's
 *   neutral sheet, which sets where the tail's X-point is and how much flux is closed. It is found by relaxation.
 * - The dayside and tail X-points are saddles of Ψ. Their values are the open–closed boundary's footpoints, so the
 *   open flux, the polar cap and the two reconnection rates obey dF/dt = Φ_D − Φ_N (Siscoe & Huang 1985;
 *   Cowley & Lockwood 1992).
 *
 * In this plane a closed line can only shrink toward Earth on the night side and grow from it on the day side; in
 * three dimensions that flux goes round the flanks. Lines inside the sink and source shells are drawn at rest.
 */
(function () {
  "use strict";
  const { clamp, lerp, smooth, M } = window.HX;
  const GAMMA = 5 / 3;

  /** cfg: mp [[x, z ≥ 0], …] the magnetopause from the nose tailward; bs { R, lam, mach }; grid { x0, x1, zmax, h };
   *  thetaD, thetaN the open–closed boundary's colatitudes at noon and midnight [deg]; dPsi the flux between drawn
   *  lines; dx the solar wind's line spacing [R_E]; v0 the outflow speed at the nose (fraction of the wind's). */
  function Meridian(cfg) {
    const E = { cfg };
    const X_REF = cfg.xRef ?? 60;                               // where τ = 0 upstream
    const U = cfg.unit ?? 1;                                    // the body's size against Earth's magnetosphere, for lengths given in R_E
    const R_IN = cfg.rIn ?? 1;                                  // where field lines end: the body's surface
    // ── the boundaries by polar angle from the Sun–Earth line ──
    const NT = 1800, TH = (i) => Math.PI * i / NT;
    const rmp = new Float64Array(NT + 1).fill(Infinity), rbs = new Float64Array(NT + 1);
    {
      const mp = cfg.mp;
      let j = 0;
      for (let i = 0; i <= NT; i++) {
        const th = TH(i);
        while (j < mp.length - 2 && Math.atan2(mp[j + 1][1], mp[j + 1][0]) < th) j++;
        const a = Math.atan2(mp[j][1], mp[j][0]), b = Math.atan2(mp[j + 1][1], mp[j + 1][0]);
        if (th > b) break;                                      // past the listed tail: no boundary on this ray
        const f = clamp((th - a) / Math.max(b - a, 1e-12), 0, 1);
        rmp[i] = Math.hypot(lerp(mp[j][0], mp[j + 1][0], f), lerp(mp[j][1], mp[j + 1][1], f));
      }
      for (let i = 0; i <= NT; i++) rbs[i] = cfg.bsR ? cfg.bsR(TH(i)) : M.bsRadius(TH(i), cfg.bs);
    }
    const tab = (arr, th) => { const f = clamp(th / Math.PI * NT, 0, NT - 1e-9), i = f | 0; return arr[i] + (f - i) * (arr[i + 1] - arr[i]); };
    const rMP = (th) => { const f = clamp(th / Math.PI * NT, 0, NT - 1e-9), i = f | 0; return isFinite(rmp[i + 1]) ? rmp[i] + (f - i) * (rmp[i + 1] - rmp[i]) : rmp[i]; };
    const rBS = (th) => tab(rbs, th);
    E.rMP = rMP; E.rBS = rBS;
    E.inside = (x, z) => { const r = Math.hypot(x, z); return r < rMP(Math.atan2(Math.abs(z), x)); };

    // ── the flow's speed, as a fraction of the solar wind's ──
    const q0 = cfg.q0 ?? 0.5, qFlank = 0.9;                       // the flow along the magnetopause, as a share of the flow behind the shock there
    const vbs = new Float64Array(NT + 1), vmp = new Float64Array(NT + 1), rhoBS = new Float64Array(NT + 1);
    for (let i = 0; i <= NT; i++) {
      const th = TH(i), a = Math.max(0, i - 1), b = Math.min(NT, i + 1);
      const tx = rbs[b] * Math.cos(TH(b)) - rbs[a] * Math.cos(TH(a)), tz = rbs[b] * Math.sin(TH(b)) - rbs[a] * Math.sin(TH(a));
      const cn = isFinite(tx) && isFinite(tz) ? Math.abs(tz) / Math.hypot(tx, tz) : 0;   // the shock normal's sunward part
      const X = M.rh((cfg.mach ?? cfg.bs.mach) * cn, GAMMA);
      vbs[i] = Math.sqrt((1 - cn * cn) + cn * cn / (X * X));
      vmp[i] = vbs[i] * (q0 + (qFlank - q0) * (1 - Math.exp(-Math.pow(th / 1.0, 1.5))));   // never faster than the flow outside it
      rhoBS[i] = rbs[i] * Math.sin(th);
    }
    const speed = (th, m) => { const a = tab(vmp, th); return a + (tab(vbs, th) - a) * Math.pow(clamp(m, 0, 1), 0.7); };
    E.speed = speed;
    /** The polar angle at which the bow shock is ρ from the axis. */
    const thetaOfRho = (rho) => {
      let lo = 0, hi = NT;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (rhoBS[mid] < rho) lo = mid; else hi = mid; }
      const f = (rho - rhoBS[lo]) / Math.max(rhoBS[hi] - rhoBS[lo], 1e-12);
      return TH(lo + clamp(f, 0, 1));
    };

    // ── the travel time in the sheath, on (polar angle, share of the mass flux m) ──
    // m = 0 on the magnetopause and 1 at the shock; a streamline that was ρ₀ from the axis upstream holds
    // m = (ρ₀ / ρ_shock(θ))². τ is marched tailward from the axis, where it is the time to cross the gap at the nose.
    const NTH = 720, NM = 64, thMax = (() => { let i = NT; while (i > 0 && !isFinite(rmp[i])) i--; return TH(i) - 1e-3; })();
    const mOf = (j) => Math.pow(j / (NM - 1), 2), jOf = (m) => Math.sqrt(clamp(m, 0, 1)) * (NM - 1);
    const tau = new Float32Array((NTH + 1) * NM);
    // Beside the magnetopause the plasma is thinned (the depletion layer, Zwan & Wolf 1976), so the streamlines there
    // sit wider than an even share of the mass flux would put them: the share m lies at m^G of the way out in area.
    const G = cfg.depletion ?? 0.55;
    const rAt = (th, m) => { const a = rMP(th), b = rBS(th); return Math.sqrt(a * a + Math.pow(m, G) * (b * b - a * a)); };
    {
      const r0 = rMP(0), r1 = rBS(0), n = 400, axis = new Float64Array(n + 1);   // τ along the axis by m, from the shock in
      axis[n] = X_REF - r1;
      for (let k = n - 1; k >= 0; k--) {
        const ma = k / n, mb = (k + 1) / n, ra = rAt(0, ma), rb = rAt(0, mb);
        axis[k] = axis[k + 1] + (rb - ra) / speed(0, (ma + mb) / 2);
      }
      for (let j = 0; j < NM; j++) { const f = mOf(j) * n, k = Math.min(n - 1, f | 0); tau[j] = axis[k] + (f - k) * (axis[k + 1] - axis[k]); }
      E.tauX = axis[0];
      for (let i = 1; i <= NTH; i++) {
        const th = thMax * i / NTH, thp = thMax * (i - 1) / NTH, rb = tab(rhoBS, th), rbp = tab(rhoBS, thp);
        for (let j = 0; j < NM; j++) {
          const m = mOf(j), mDep = i === 1 ? Infinity : m * (rb / rbp) * (rb / rbp);
          const r = rAt(th, m), x = r * Math.cos(th), z = r * Math.sin(th);
          if (mDep <= 1) {
            const fj = jOf(mDep), j0 = Math.min(NM - 2, fj | 0), tp = tau[(i - 1) * NM + j0] + (fj - j0) * (tau[(i - 1) * NM + j0 + 1] - tau[(i - 1) * NM + j0]);
            const rp = rAt(thp, mDep), ds = Math.hypot(x - rp * Math.cos(thp), z - rp * Math.sin(thp));
            tau[i * NM + j] = tp + ds / speed((th + thp) / 2, (m + mDep) / 2);
          } else {                                              // it came through the shock since the last ray
            const rho0 = Math.sqrt(m) * rb, ts = thetaOfRho(rho0), rs = rBS(ts), xs = rs * Math.cos(ts), zs = rs * Math.sin(ts);
            let tt = X_REF - xs, px = xs, pz = zs, pm = 1, pth = ts;   // along the streamline from the shock, in short steps
            for (let q = 1; q <= 16 && i > 1; q++) {
              const u = q / 16, mq = Math.pow(1 + (Math.pow(m, 0.5) - 1) * u, 2), tq = mq < 1 ? thetaOfRho(rho0 / Math.sqrt(mq)) : ts;
              const rq = rAt(Math.min(tq, th), mq), qx = rq * Math.cos(Math.min(tq, th)), qz = rq * Math.sin(Math.min(tq, th));
              tt += Math.hypot(qx - px, qz - pz) / speed((pth + tq) / 2, (pm + mq) / 2);
              px = qx; pz = qz; pm = mq; pth = tq;
            }
            tau[i * NM + j] = i === 1 ? tau[j] : tt;
          }
        }
      }
    }
    /** τ at a point outside the magnetopause (R_E of solar-wind travel from x = X_REF). */
    const tauAt = (x, z) => {
      const az = Math.abs(z), r = Math.hypot(x, az), th = Math.atan2(az, x), b = rBS(th);
      if (r >= b || th >= thMax) return X_REF - x;
      const a = rMP(th), m = Math.pow(clamp((r * r - a * a) / (b * b - a * a), 0, 1), 1 / G);
      const fi = th / thMax * NTH, i = Math.min(NTH - 1, fi | 0), fj = jOf(m), j = Math.min(NM - 2, fj | 0), u = fi - i, w = fj - j;
      const k = i * NM + j;
      return (tau[k] * (1 - w) + tau[k + 1] * w) * (1 - u) + (tau[k + NM] * (1 - w) + tau[k + NM + 1] * w) * u;
    };
    E.tauAt = tauAt;
    /** τ along the magnetopause at polar angle th: when the kink of a line that reconnected at the nose gets there. */
    E.tauMP = (th) => { const fi = clamp(th / thMax, 0, 1) * NTH, i = Math.min(NTH - 1, fi | 0); return tau[i * NM] + (fi - i) * (tau[(i + 1) * NM] - tau[i * NM]); };

    /** One parcel's path: [x, z, τ] samples for a parcel ρ₀ from the axis upstream (z ≥ 0), from x = xStart to the
     *  tail end of the grid. The same τ the field uses, so a streak and the field line through it stay together. */
    E.streamline = (rho0, xStart, xEnd) => {
      const out = [[xStart, rho0, X_REF - xStart]];
      const ts = thetaOfRho(rho0), rs = rBS(ts), xs = rs * Math.cos(ts);
      if (!(rho0 < rhoBS[NT - 1]) || ts >= thMax) { out.push([xEnd, rho0, X_REF - xEnd]); return out; }
      if (xs < xStart) out.push([xs, rho0, X_REF - xs]);
      let rb = rho0;
      for (let k = 0; k < 4000; k++) {
        rb *= 1.012; rb += 0.004;
        const th = thetaOfRho(rb);
        if (th >= thMax) break;
        const m = (rho0 / rb) * (rho0 / rb), r = rAt(th, m), x = r * Math.cos(th), z = r * Math.sin(th);
        out.push([x, z, tauAt(x, z)]);
        if (x < xEnd) break;
      }
      return out;
    };

    // ── the grid ──
    const g = cfg.grid, h = g.h, nx = Math.round((g.x1 - g.x0) / h) + 1, nzh = Math.round(g.zmax / h), nz = 2 * nzh + 1, N = nx * nz;
    const xOf = (i) => g.x0 + i * h, zOf = (j) => (j - nzh) * h;
    // kind: 0 free, 1 outside the magnetopause, 2 the neutral sheet, 3 beside the magnetopause, 4 Earth
    const psi0 = new Float32Array(N), phi = new Float32Array(N), psi = new Float32Array(N), ext = new Float32Array(N), kind = new Uint8Array(N);
    const s2 = (deg) => Math.sin(deg * Math.PI / 180) ** 2;
    const P = E.p = { psiXd: -s2(cfg.thetaD), dPsi: cfg.dPsi, e0: cfg.dPsi / cfg.dx,
                      xIn: cfg.xIn ?? -6, xN: cfg.xN ?? -130, psiXn: s2(cfg.thetaN), ridgeP: cfg.ridgeP ?? 4,
                      sheet: cfg.sheet ?? ((x) => 0.9 + 0.045 * Math.max(0, -x - 8)),
                      dip: 0, dipX: -22, dipW: 5, bump: 0, bumpX: -34, bumpW: 9 };
    /** The dipole's flux label: −x|x|/r³ near Earth, where its contours are r = L cos²λ; further out the corner on
     *  the polar axis is rounded, so lines that cross over the poles do it smoothly. */
    const dip0 = (x, z) => {
      const r2 = x * x + z * z, r = Math.sqrt(r2);
      if (r < 1e-6) return 0;
      const e = 0.3 * r * smooth(2.5 * U, 7 * U, r);
      return -x * Math.sqrt(x * x + e * e) / (r2 * r);
    };
    E.dipole = dip0;
    Object.assign(E, { nx, nz, nzh, h, xOf, zOf, psi, N, grid: g });
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i, x = xOf(i), z = zOf(j), r = Math.hypot(x, z);
      psi0[k] = dip0(x, z);
      ext[k] = tauAt(x, z) - E.tauX;                             // inside, the magnetopause's value along the ray
      if (r <= R_IN) { kind[k] = 4; psi0[k] = dip0(x * R_IN / Math.max(r, 0.2), z * R_IN / Math.max(r, 0.2)); }
      else if (!E.inside(x, z)) kind[k] = 1;
      else if (j === nzh && x <= P.xIn) kind[k] = 2;
    }
    // Nodes with a neighbour across the magnetopause take its value where the arm meets it (Shortley & Weller 1938),
    // so the boundary is the curve itself and not the grid's staircase.
    const irr = [];                                              // [k, aE, aW, aN, aS, tE, tW, tN, tS, pE, pW, pN, pS]
    // (a closed magnetosphere's boundary is one field line: the same value all along it)
    const mpValue = (x, z) => (cfg.closed ? 0 : E.tauMP(Math.atan2(Math.abs(z), x)) - E.tauX);
    for (let j = 1; j < nz - 1; j++) for (let i = 1; i < nx - 1; i++) {
      const k = j * nx + i;
      if (kind[k] !== 0 && kind[k] !== 2) continue;
      const nb = [k + 1, k - 1, k + nx, k - nx];
      if (!nb.some(q => kind[q] === 1)) continue;
      const x = xOf(i), z = zOf(j), rec = [k, 1, 1, 1, 1, NaN, NaN, NaN, NaN, 0, 0, 0, 0], dir = [[h, 0], [-h, 0], [0, h], [0, -h]];
      for (let d = 0; d < 4; d++) {
        if (kind[nb[d]] !== 1) continue;
        let lo = 0, hi = 1;
        for (let it = 0; it < 22; it++) { const mid = (lo + hi) / 2; if (E.inside(x + dir[d][0] * mid, z + dir[d][1] * mid)) lo = mid; else hi = mid; }
        const a = Math.max(0.5 * (lo + hi), 0.12), xc = x + dir[d][0] * a, zc = z + dir[d][1] * a;
        rec[1 + d] = a; rec[5 + d] = mpValue(xc, zc); rec[9 + d] = dip0(xc, zc);
      }
      irr.push(rec);
      if (kind[k] === 0) kind[k] = 3;
    }
    /** The neutral sheet's flux profile: the dipole's value at xIn, falling to the X-point's at xN, with the
     *  substorm's dip (a near-Earth X-point once it is deep enough) and the plasmoid's bump tailward of it. */
    E.ridge = (x) => {
      if (P.ridgeFn) return P.ridgeFn(x);
      const s = clamp((x - P.xN) / (P.xIn - P.xN), 0, 1), top = dip0(P.xIn, 0);
      let R = P.psiXn + (top - P.psiXn) * Math.pow(s, P.ridgeP);
      if (P.dip) R -= P.dip * Math.exp(-(((x - P.dipX) / (x < P.dipX ? P.dipWt ?? P.dipW : P.dipW)) ** 2));
      if (P.bump) R += P.bump * Math.exp(-(((x - P.bumpX) / P.bumpW) ** 2));
      return R;
    };
    /** n sweeps of successive over-relaxation on φ; the sheet's nodes are drawn to the profile over a ramp. */
    E.relax = (n, omega = 1.9) => {
      const A = P.psiXd, e0 = P.e0;
      for (let k = 0; k < N; k++) if (kind[k] === 1) phi[k] = A + (cfg.closed ? 0 : e0 * ext[k]) - psi0[k]; else if (kind[k] === 4) phi[k] = 0;
      for (let s = 0; s < n; s++) {
        for (let j = 1; j < nz - 1; j++) {
          const base = j * nx;
          for (let i = 1; i < nx - 1; i++) {
            const k = base + i, kd = kind[k];
            if (kd === 0) { phi[k] += omega * (0.25 * (phi[k - 1] + phi[k + 1] + phi[k - nx] + phi[k + nx]) - phi[k]); continue; }
            if (kd !== 2) continue;
            const x = xOf(i), w = smooth(P.xIn, P.xIn - 3 * U, x), v = 0.25 * (phi[k - 1] + phi[k + 1] + phi[k - nx] + phi[k + nx]);
            phi[k] = (1 - w) * (phi[k] + omega * (v - phi[k])) + w * (E.ridge(x) - psi0[k]);
          }
          if (kind[base] !== 1) phi[base] = phi[base + 1];                                  // the tail end: lines leave level
          if (kind[base + nx - 1] !== 1) phi[base + nx - 1] = phi[base + nx - 2];
        }
        for (const r of irr) {
          const k = r[0], aE = r[1], aW = r[2], aN = r[3], aS = r[4];
          const uE = r[5] === r[5] ? A + e0 * r[5] - r[9] : phi[k + 1], uW = r[6] === r[6] ? A + e0 * r[6] - r[10] : phi[k - 1];
          const uN = r[7] === r[7] ? A + e0 * r[7] - r[11] : phi[k + nx], uS = r[8] === r[8] ? A + e0 * r[8] - r[12] : phi[k - nx];
          const v = (uE / (aE * (aE + aW)) + uW / (aW * (aE + aW)) + uN / (aN * (aN + aS)) + uS / (aS * (aN + aS))) / (1 / (aE * aW) + 1 / (aN * aS));
          phi[k] += Math.min(omega, 1.5) * (v - phi[k]);
        }
        for (let i = 0; i < nx; i++) {                                                       // top and bottom, where the tail is wider than the grid
          if (kind[i] !== 1) phi[i] = phi[i + nx];
          const k = (nz - 1) * nx + i; if (kind[k] !== 1) phi[k] = phi[k - nx];
        }
      }
    };
    // Outside nodes next to the magnetosphere carry its field on, straight through the boundary's value, so that a
    // contour in a cell the magnetopause cuts ends on the magnetopause.
    const ghosts = [];
    {
      const mp = cfg.mp;
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        if (kind[k] !== 1) continue;
        let nearIn = false;
        for (let dj = -1; dj <= 1 && !nearIn; dj++) for (let di = -1; di <= 1; di++) {
          const ii = i + di, jj = j + dj;
          if (ii >= 0 && ii < nx && jj >= 0 && jj < nz && kind[jj * nx + ii] !== 1) { nearIn = true; break; }
        }
        if (!nearIn) continue;
        const x = xOf(i), z = Math.abs(zOf(j)), sg = zOf(j) < 0 ? -1 : 1;
        let best = Infinity, bx = 0, bz = 0;
        for (let q = 0; q < mp.length - 1; q++) {
          const ax = mp[q][0], az = mp[q][1], dx = mp[q + 1][0] - ax, dz = mp[q + 1][1] - az;
          const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1), px = ax + dx * t, pz = az + dz * t, d = (x - px) ** 2 + (z - pz) ** 2;
          if (d < best) { best = d; bx = px; bz = pz; }
        }
        const d = Math.sqrt(best), nxn = d > 1e-6 ? (x - bx) / d : 1, nzn = d > 1e-6 ? (z - bz) / d : 0, back = 1.6 * h;
        ghosts.push([k, mpValue(bx, bz), dip0(bx, sg * bz), bx - nxn * back, sg * (bz - nzn * back), d / back]);
      }
    }
    const cTmp = new Float32Array(nz), cW = new Float32Array(42);
    /** Ψ = Ψ₀ + φ, with the neutral sheet's corner rounded over its half-thickness (a Harris-like sheet). */
    E.compose = () => {
      for (let k = 0; k < N; k++) psi[k] = psi0[k] + phi[k];
      const tmp = cTmp, wts = cW;
      for (let i = 0; i < nx; i++) {
        const x = xOf(i);
        if (x > P.xIn - 0.5 * U) continue;
        const sg = P.sheet(x) / h * smooth(P.xIn - 0.5 * U, P.xIn - 4 * U, x), reach = Math.min(nzh - 2, Math.ceil(3 * sg), 40);
        if (sg < 0.35) continue;
        const span = Math.min(nzh - reach - 1, Math.ceil(4 * sg) + reach);
        for (let d = 0; d <= reach; d++) wts[d] = Math.exp(-0.5 * (d / sg) * (d / sg));
        for (let j = nzh - span; j <= nzh + span; j++) {
          const k0 = j * nx + i;
          if (kind[k0] === 1) { tmp[j] = psi[k0]; continue; }
          let sum = 0, wsum = 0;
          for (let d = -reach; d <= reach; d++) {
            const kk = k0 + d * nx;
            if (kind[kk] === 1) continue;
            const w = wts[d < 0 ? -d : d];
            sum += w * psi[kk]; wsum += w;
          }
          const fade = smooth(span, span - reach, Math.abs(j - nzh));
          tmp[j] = wsum > 0 ? fade * sum / wsum + (1 - fade) * psi[k0] : psi[k0];
        }
        for (let j = nzh - span; j <= nzh + span; j++) psi[j * nx + i] = tmp[j];
      }
      for (const q of ghosts) { const gB = P.psiXd + P.e0 * q[1]; psi[q[0]] = gB + (gB - E.at(q[3], q[4])) * q[5]; }
    };
    E.solve = (sweeps = 500) => { E.relax(sweeps, 2 / (1 + Math.sin(Math.PI / Math.max(nx, nz)))); E.compose(); };

    /** Ψ at a point, bilinear on the grid. */
    E.at = (x, z) => {
      const fi = clamp((x - g.x0) / h, 0, nx - 1.001), fj = clamp(z / h + nzh, 0, nz - 1.001), i = fi | 0, j = fj | 0, u = fi - i, w = fj - j, k = j * nx + i;
      return (psi[k] * (1 - u) + psi[k + 1] * u) * (1 - w) + (psi[k + nx] * (1 - u) + psi[k + nx + 1] * u) * w;
    };
    /** The tail X-point: the lowest point of the neutral sheet's ridge between xa and xb. Returns [x, Ψ]. */
    E.tailX = (xa = g.x0 + 1, xb = P.xIn - 2) => {
      let best = [xb, Infinity];
      for (let i = 0; i < nx; i++) { const x = xOf(i); if (x < xa || x > xb) continue; const v = psi[nzh * nx + i]; if (v < best[1]) best = [x, v]; }
      return best;
    };

    // ── contours ──
    const R_CUT = cfg.rCut ?? 2.4;                              // inside this the lines are the dipole's own, drawn exactly
    const cellIn = new Uint8Array(N), cellOut = new Uint8Array(N);
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const k = j * nx + i, ks = [k, k + 1, k + nx, k + nx + 1];
      const rr = ks.map(q => Math.hypot(xOf(q % nx), zOf((q / nx) | 0)));
      const anyIn = ks.some(q => kind[q] !== 1), anyOut = ks.some(q => kind[q] === 1);
      cellIn[k] = anyIn && !rr.every(r => r < R_CUT) && !ks.some(q => kind[q] === 4) ? 1 : 0;
      cellOut[k] = anyOut ? 1 : 0;
    }
    /** Marching squares on F over the cells `ok` marks: the lines F = c0 + n·step with lo ≤ value ≤ hi, each a list
     *  [x, z, …] with its n. */
    function march(F, ok, c0, step, lo, hi, list) {
      const segs = [], key = new Map();
      const add = (lvl, ea, ax, az, eb, bx, bz) => {
        const id = segs.length; segs.push([ax, az, bx, bz, lvl, ea, eb, 0]);
        for (const e of [ea, eb]) { const kk = e * 64 + (lvl & 63), a = key.get(kk); if (a === undefined) key.set(kk, [id]); else a.push(id); }
      };
      for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
        const k = j * nx + i;
        if (!ok[k]) continue;
        const a = F[k], b = F[k + 1], c = F[k + nx + 1], d = F[k + nx];
        const mn = Math.min(a, b, c, d), mx = Math.max(a, b, c, d);
        let n0, n1;
        if (list) { n0 = 0; while (n0 < list.length && list[n0] < mn) n0++; n1 = n0 - 1; while (n1 + 1 < list.length && list[n1 + 1] <= mx) n1++; }
        else { n0 = Math.max(Math.ceil((mn - c0) / step), Math.ceil((lo - c0) / step - 1e-9)); n1 = Math.min(Math.floor((mx - c0) / step), Math.floor((hi - c0) / step + 1e-9)); }
        if (n1 < n0) continue;
        const x = xOf(i), z = zOf(j);
        for (let n = n0; n <= n1; n++) {
          const L = list ? list[n] : c0 + n * step;
          const code = (a > L ? 1 : 0) | (b > L ? 2 : 0) | (c > L ? 4 : 0) | (d > L ? 8 : 0);
          if (code === 0 || code === 15) continue;
          const eid = [k * 2, (k + 1) * 2 + 1, (k + nx) * 2, k * 2 + 1];   // bottom, right, top, left: one id to a grid edge
          const pt = (e) => e === 0 ? [x + h * (L - a) / (b - a), z] : e === 1 ? [x + h, z + h * (L - b) / (c - b)] : e === 2 ? [x + h * (L - d) / (c - d), z + h] : [x, z + h * (L - a) / (d - a)];
          const link = (e1, e2) => { const p = pt(e1), q = pt(e2); add(n, eid[e1], p[0], p[1], eid[e2], q[0], q[1]); };
          switch (code) {
            case 1: case 14: link(3, 0); break;
            case 2: case 13: link(0, 1); break;
            case 4: case 11: link(1, 2); break;
            case 8: case 7: link(2, 3); break;
            case 3: case 12: link(3, 1); break;
            case 6: case 9: link(0, 2); break;
            default: {
              const mid = (a + b + c + d) / 4 > L;
              if ((code === 5) === mid) { link(3, 2); link(0, 1); } else { link(3, 0); link(1, 2); }
            }
          }
        }
      }
      const lines = [];
      const walk = (start, edge, lvl, out) => {
        let cur = start, e = edge;
        for (;;) {
          const list = key.get(e * 64 + (lvl & 63));
          let nxt = -1;
          if (list) for (const id of list) if (id !== cur && !segs[id][7] && segs[id][4] === lvl) { nxt = id; break; }
          if (nxt < 0) return;
          const q = segs[nxt]; q[7] = 1;
          if (q[5] === e) { out.push(q[2], q[3]); e = q[6]; } else { out.push(q[0], q[1]); e = q[5]; }
          cur = nxt;
        }
      };
      for (let s = 0; s < segs.length; s++) {
        const q = segs[s];
        if (q[7]) continue;
        q[7] = 1;
        const fwd = [], bwd = [];
        walk(s, q[6], q[4], fwd); walk(s, q[5], q[4], bwd);
        const pts = [];
        for (let k = bwd.length - 2; k >= 0; k -= 2) pts.push(bwd[k], bwd[k + 1]);
        pts.push(q[0], q[1], q[2], q[3]);
        for (let k = 0; k < fwd.length; k++) pts.push(fwd[k]);
        lines.push({ pts, n: q[4] });
      }
      return lines;
    }
    /** The pieces of a line on one side of the magnetopause; an end made by the cut is marked "M". */
    function clip(line, wantIn) {
      const p = line.pts, n = p.length / 2, out = [];
      let cur = null, was = false;
      for (let i = 0; i < n; i++) {
        const x = p[2 * i], z = p[2 * i + 1], is = E.inside(x, z) === wantIn;
        if (i > 0 && is !== was) {
          let ax = p[2 * i - 2], az = p[2 * i - 1], bx = x, bz = z;   // a on the side `was` says
          for (let it = 0; it < 14; it++) { const mx = (ax + bx) / 2, mz = (az + bz) / 2; if ((E.inside(mx, mz) === wantIn) === was) { ax = mx; az = mz; } else { bx = mx; bz = mz; } }
          const cx = (ax + bx) / 2, cz = (az + bz) / 2;
          if (was) { cur.pts.push(cx, cz); cur.b = "M"; out.push(cur); cur = null; } else cur = { pts: [cx, cz], a: "M", b: "", n: line.n };
        }
        if (is) { if (!cur) cur = { pts: [], a: "", b: "", n: line.n }; cur.pts.push(x, z); }
        was = is;
      }
      if (cur) out.push(cur);
      return out.filter(q => q.pts.length >= 4);
    }
    /** Carries an end at the inner cut down the dipole's field line to the ground. */
    function foot(x, z) {
      const r = Math.hypot(x, z), lam = Math.atan2(z, Math.abs(x)), c = Math.cos(lam), L = r / Math.max(c * c, 1e-6), sx = Math.sign(x) || 1;
      const lf = Math.sign(lam || 1) * Math.acos(Math.sqrt(Math.min(1, R_IN / L))), out = [];
      for (let k = 1; k <= 14; k++) { const la = lam + (lf - lam) * k / 14, rr = L * Math.cos(la) ** 2; out.push(sx * rr * Math.cos(la), rr * Math.sin(la)); }
      return out;
    }
    const rev = (a) => { const o = new Array(a.length); for (let i = 0, n = a.length / 2; i < n; i++) { o[2 * i] = a[2 * (n - 1 - i)]; o[2 * i + 1] = a[2 * (n - 1 - i) + 1]; } return o; };
    /** The field lines at Ψ = c0 + n·step: inside the magnetosphere those with lo ≤ Ψ ≤ hi, outside all of them
     *  (when `outside`). Each is { pts: Float32Array [x, z, …] in R_E, type: "closed" | "open" | "imf" | "loose",
     *  level, kinks: indices where it crosses the magnetopause }. A line cut loose from both the Sun's field and
     *  Earth's (a plasmoid's loop, or a line that has reconnected in the tail) is "loose". */
    /** The dipole's own line of equatorial distance L on the day (side +1) or night (−1) side: for the lines too close
     *  to Earth for the grid. */
    const dipoleLine = (L, side) => {
      const lf = Math.acos(Math.sqrt(1 / L)), n = 48, pts = new Float32Array(2 * (n + 1));
      for (let i = 0; i <= n; i++) { const la = -lf + 2 * lf * i / n, r = L * Math.cos(la) ** 2; pts[2 * i] = side * r * Math.cos(la); pts[2 * i + 1] = r * Math.sin(la); }
      return { pts, type: "closed", loop: false, level: -side / L, kinks: [], north: true };
    };
    /** The lines at the listed values of Ψ, inside the magnetosphere only: closed lines at rest. Those whose dipole
     *  distance 1/|Ψ| is inside the inner cut are the dipole's own. */
    E.contoursAt = (list) => {
      const far = list.filter(v => 1 / Math.abs(v) > R_CUT + 0.7).sort((p, q) => p - q);
      return E.contours(0, 1, 0, 0, false, far).concat(list.filter(v => 1 / Math.abs(v) <= R_CUT + 0.7).map(v => dipoleLine(1 / Math.abs(v), v < 0 ? 1 : -1)));
    };
    /** The solar wind's field lines alone: the flow's isochrones τ − τ_X = c + n·step between lo and hi, outside
     *  the obstacle. For a body the field does not connect to: a closed magnetosphere, or an induced one. */
    E.isochrones = (c, step, lo, hi) => {
      const out = [];
      for (const l of march(ext, cellOut, c, step, lo, hi)) for (const q of clip(l, false)) out.push({ pts: q.pts, a: q.a, b: q.b, type: "imf", level: c + l.n * step });
      return out;
    };
    E.contours = (c0, step, lo, hi, outside = true, list = null) => {
      const inner = [];
      for (const l of march(psi, cellIn, c0, step, lo, hi, list)) for (const q of clip(l, true)) inner.push(q);
      for (const q of inner) {
        const n = q.pts.length;
        if (q.a === "" && Math.hypot(q.pts[0], q.pts[1]) < R_CUT + 1.5 * h) { q.pts = rev(foot(q.pts[0], q.pts[1])).concat(q.pts); q.a = "E"; }
        const m = q.pts.length;
        if (q.b === "" && Math.hypot(q.pts[m - 2], q.pts[m - 1]) < R_CUT + 1.5 * h) { q.pts = q.pts.concat(foot(q.pts[m - 2], q.pts[m - 1])); q.b = "E"; }
        void n;
      }
      const outer = [];
      if (outside) {
        const s = step / P.e0, c = (c0 - P.psiXd) / P.e0;
        for (const l of march(ext, cellOut, c, s, -1e9, 1e9)) for (const q of clip(l, false)) outer.push(q);
      }
      // join the two sides where they meet on the magnetopause
      const pieces = inner.map(q => ({ ...q, side: 1 })).concat(outer.map(q => ({ ...q, side: 0 })));
      const used = new Uint8Array(pieces.length), lines = [];
      const endOf = (q, tail) => { const m = q.pts.length; return tail ? [q.pts[m - 2], q.pts[m - 1]] : [q.pts[0], q.pts[1]]; };
      for (let s = 0; s < pieces.length; s++) {
        if (used[s]) continue;
        used[s] = 1;
        let pts = pieces[s].pts.slice(), a = pieces[s].a, b = pieces[s].b, hasIn = pieces[s].side === 1, hasOut = !hasIn;
        const kinks = [];
        for (let pass = 0; pass < 2; pass++) {                  // grow from the tail end, then turn round and grow again
          for (;;) {
            if (b !== "M") break;
            const e = [pts[pts.length - 2], pts[pts.length - 1]];
            let best = -1, bd = 3 * h, bt = false;
            for (let q = 0; q < pieces.length; q++) {
              if (used[q] || pieces[q].n !== pieces[s].n) continue;
              for (const tail of [false, true]) {
                if ((tail ? pieces[q].b : pieces[q].a) !== "M") continue;
                const p = endOf(pieces[q], tail), d = Math.hypot(p[0] - e[0], p[1] - e[1]);
                if (d < bd) { bd = d; best = q; bt = tail; }
              }
            }
            if (best < 0) break;
            used[best] = 1;
            const add = bt ? rev(pieces[best].pts) : pieces[best].pts;
            kinks.push(pts.length / 2 - 1);
            pts.length -= 2; pts = pts.concat(add);
            b = bt ? pieces[best].a : pieces[best].b;
            if (pieces[best].side) hasIn = true; else hasOut = true;
          }
          pts = rev(pts); [a, b] = [b, a];
          for (let q = 0; q < kinks.length; q++) kinks[q] = pts.length / 2 - 1 - kinks[q];
        }
        const m = pts.length, loop = m > 12 && Math.hypot(pts[0] - pts[m - 2], pts[1] - pts[m - 1]) < 1.5 * h && a === "" && b === "";
        const earths = (a === "E" ? 1 : 0) + (b === "E" ? 1 : 0);
        const type = earths === 2 ? "closed" : earths === 1 || (!hasIn && (a === "M" || b === "M")) ? "open" : hasIn ? "loose" : "imf";
        lines.push({ pts: Float32Array.from(pts), type, loop, level: list ? list[pieces[s].n] : c0 + pieces[s].n * step, kinks, north: pts[1] + pts[m - 1] > 0 });
      }
      return lines;
    };
    return E;
  }

  window.HX.Meridian = Meridian;
})();
