/* Helios Live: the polynomial reconstruction of B and J about the MMS formation — Denton et al. (2020), as Helios
 * ports it (PolynomialReconstruction.swift, …Math, …Trust, …+PlaneCut, …+Series, …+LMN in MMSTrackerCore), which in
 * turn is an adaptation of Hosner & Denton's Python (Zenodo 10.5281/zenodo.8217728, CC BY 4.0). Arithmetic only: the
 * Formation view (formation.js) gathers the data and draws; tools/recon_check.js and tools/recon_live.js run the Swift
 * tests' numbers in Node.
 *
 * Method (PolynomialReconstruction.swift): about the barycenter, each component of B is a truncated Taylor polynomial
 * in local coordinates (l, m, n) — n the maximum-gradient direction of the four-point MDD (Shi et al. 2005), l the
 * intermediate, m the minimum — fitted in least squares at every spacecraft to the measured B and to μ₀J = ∇×B (the
 * current rows weighted by L_sc so both are in nT), subject to ∇·B = 0 exactly (null space + SVD, not the Python's
 * SLSQP). J anywhere is the analytic curl. Models (Table 1): LB-3D and LBJ-3D (12, linear; not in the Python), RQ-3D
 * (17, the default and the paper's), QLm-3D (21), Q-3D (27).
 *
 * Credit: Denton, R. E., et al. (2020), JGR Space Physics 125, e2019JA027481; Hosner, M., & Denton, R. E. (2023),
 * Polynomial Reconstruction of the Magnetic Field and Current Density – Python Implementation (v1.0), Zenodo, CC BY 4.0.
 * Trust thresholds are Helios's own (PolynomialReconstructionTrust.swift), calibrated on its synthetic validation.
 *
 * Vectors are [x, y, z] (GSE, km, nT, µA/m²); times are seconds (any epoch, one for every series of a solve).
 */
(function (root) {
  "use strict";
  const LM = typeof module !== "undefined" && module.exports ? require("./lmn.js") : root.HeliosLMN;
  const { dot, cross, add, sub, scale, norm, matmul, matvec, symmetricEigen, svd, nullSpace, linearGradient } = LM.math;
  const MU0 = 4 * Math.PI * 1e-7 * 1e6;            // μ₀J in nT/km for J in µA/m² (1.2566)

  // ───────────────────────── models (Denton et al. 2020, Table 1) ─────────────────────────
  const MODELS = {
    lb3d: { name: "LB-3D", long: "LB-3D (linear, B only, 12)", terms: [[0, 1, 2, 3], [0, 1, 2, 3], [0, 1, 2, 3]], linear: true, current: false },
    lbj3d: { name: "LBJ-3D", long: "LBJ-3D (linear, B and J, 12)", terms: [[0, 1, 2, 3], [0, 1, 2, 3], [0, 1, 2, 3]], linear: true, current: true },
    rq3d: { name: "RQ-3D", long: "RQ-3D (reduced quadratic, 17)", terms: [[0, 1, 2, 3, 4], [0, 1, 2, 3, 4, 5, 6], [0, 1, 2, 3, 6]], current: true },
    qlm3d: { name: "QLm-3D", long: "QLm-3D (quadratic, linear in m, 21)", terms: [[0, 1, 2, 3, 4, 5, 6], [0, 1, 2, 3, 4, 5, 6], [0, 1, 2, 3, 4, 5, 6]], current: true },
    q3d: { name: "Q-3D", long: "Q-3D (quadratic, 27)", terms: [[0, 1, 2, 3, 4, 5, 6, 7, 8], [0, 1, 2, 3, 4, 5, 6, 7, 8], [0, 1, 2, 3, 4, 5, 6, 7, 8]], current: true },
  };
  /** Table-1 slots k in local (l, m, n): exponents, Taylor factor, degree — 0 B₀, 1 n, 2 l, 3 m, 4 n²/2, 5 nl, 6 l²/2,
   *  7 nm, 8 lm. */
  const SLOTS = [
    { e: [0, 0, 0], f: 1, d: 0 }, { e: [0, 0, 1], f: 1, d: 1 }, { e: [1, 0, 0], f: 1, d: 1 }, { e: [0, 1, 0], f: 1, d: 1 },
    { e: [0, 0, 2], f: 0.5, d: 2 }, { e: [1, 0, 1], f: 1, d: 2 }, { e: [2, 0, 0], f: 0.5, d: 2 }, { e: [0, 1, 1], f: 1, d: 2 }, { e: [1, 1, 0], f: 1, d: 2 },
  ];
  function basis(k, p) {
    const s = SLOTS[k];
    let v = s.f;
    for (let d = 0; d < 3; d++) if (s.e[d] > 0) v *= s.e[d] === 1 ? p[d] : p[d] * p[d];
    return v;
  }
  function basisDerivative(k, d, p) {
    const s = SLOTS[k];
    if (!(s.e[d] > 0)) return 0;
    let v = s.f * s.e[d];
    for (let j = 0; j < 3; j++) { const e = s.e[j] - (j === d ? 1 : 0); if (e === 1) v *= p[j]; else if (e === 2) v *= p[j] * p[j]; }
    return v;
  }
  /** The ∇·B = 0 rows of a model: one per monomial of the divergence (constant, l, m, n). */
  function divergenceConstraints(terms) {
    const keys = ["0,0,0", "1,0,0", "0,1,0", "0,0,1"], rows = keys.map(() => new Array(terms.length).fill(0));
    terms.forEach((t, j) => {
      const s = SLOTS[t.k];
      if (!(s.e[t.c] > 0)) return;
      const e = s.e.slice(); e[t.c]--;
      const r = keys.indexOf(e.join(","));
      if (r >= 0) rows[r][j] += s.f * s.e[t.c];
    });
    return rows.filter(r => r.some(x => x !== 0));
  }
  /** Row of (∇×B)_i at local p over terms: (∇×B)_l = ∂_m B_n − ∂_n B_m, … */
  function curlRow(i, terms, p) {
    const [j1, c1, j2, c2] = [[1, 2, 2, 1], [2, 0, 0, 2], [0, 1, 1, 0]][i];
    return terms.map(t => (t.c === c1 ? basisDerivative(t.k, j1, p) : 0) - (t.c === c2 ? basisDerivative(t.k, j2, p) : 0));
  }

  // ───────────────────────── geometry ─────────────────────────
  /** L_sc: the mean of the pairwise separations (Prec.data_prep). */
  function meanSeparation(r) {
    let s = 0, n = 0;
    for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) { s += norm(sub(r[i], r[j])); n++; }
    return n ? s / n : 0;
  }
  /** TetrahedronQuality.compute: the volume over a regular tetrahedron's with the same mean edge, in [0, 1]. */
  function tqf(r) {
    if (r.length !== 4) return null;
    const v = Math.abs(dot(sub(r[1], r[0]), cross(sub(r[2], r[0]), sub(r[3], r[0])))) / 6, e = meanSeparation(r);
    return e > 0 ? Math.min(1, Math.max(0, v / (e ** 3 / (6 * Math.SQRT2)))) : 0;
  }
  const frame = (l, m, n) => ({ l, m, n });
  const toLocal = (f, v) => [dot(v, f.l), dot(v, f.m), dot(v, f.n)];
  const toGSE = (f, c) => add(add(scale(f.l, c[0]), scale(f.m, c[1])), scale(f.n, c[2]));
  const rowsOf = (f) => [f.l, f.m, f.n];
  /** LocalFrame(l:m:n:tolerance:): axes orthonormal and right-handed within tol, re-orthonormalized N → L → M = N × L. */
  function checkedFrame(l, m, n, tol = 0.01) {
    const u = (v) => { const s = norm(v); return s > 0 && isFinite(s) ? scale(v, 1 / s) : null; };
    const nn = u(n), l0 = u(l), m0 = u(m);
    if (!nn || !l0 || !m0) return null;
    if (Math.abs(norm(l) - 1) >= tol || Math.abs(norm(m) - 1) >= tol || Math.abs(norm(n) - 1) >= tol) return null;
    if (Math.abs(dot(l0, m0)) >= tol || Math.abs(dot(l0, nn)) >= tol || Math.abs(dot(m0, nn)) >= tol || !(dot(cross(l0, m0), nn) > 1 - tol)) return null;
    const ll = u(sub(l0, scale(nn, dot(l0, nn))));
    return ll ? frame(ll, cross(nn, ll), nn) : null;
  }
  /** The local MDD frame of a linear gradient G (Shi et al. 2005): eigenvectors of GᵀG, n = max, l = mid, m = min —
   *  prec_utilities.MDD(mode='each') + get_lmn's reordering, signs by MDD's right-handedness fix and rotate(). */
  function mddFrame(G) {
    const Lm = [0, 1, 2].map(i => [0, 1, 2].map(j => G[0][i] * G[0][j] + G[1][i] * G[1][j] + G[2][i] * G[2][j]));
    const { values, vectors } = symmetricEigen(Lm);
    const e = [0, 1, 2].map(k => [vectors[0][k], vectors[1][k], vectors[2][k]]);
    if (dot(cross(e[0], e[1]), e[2]) < 0) e[2] = scale(e[2], -1);
    const largestNegative = (v) => { let i = 0; for (let k = 1; k < 3; k++) if (Math.abs(v[k]) > Math.abs(v[i])) i = k; return v[i] < 0; };
    if (largestNegative(e[0])) {
      e[0] = scale(e[0], -1);
      if (largestNegative(e[1])) e[1] = scale(e[1], -1); else e[2] = scale(e[2], -1);
    } else if (largestNegative(e[1])) { e[1] = scale(e[1], -1); e[2] = scale(e[2], -1); }
    return { frame: frame(e[1], e[2], e[0]), eigenvalues: values.map(x => Math.max(0, x)) };
  }
  function fibonacciSphere(n) {
    const g = Math.PI * (3 - Math.sqrt(5));
    return Array.from({ length: n }, (_, i) => { const y = 1 - 2 * (i + 0.5) / n, r = Math.sqrt(1 - y * y), th = g * i; return [Math.cos(th) * r, y, Math.sin(th) * r]; });
  }

  // ───────────────────────── trust (PolynomialReconstructionTrust.swift) ─────────────────────────
  const RULES = { tqfNote: 0.7, tqfOuterCap: 0.5, noiseGainCaution: 5, noiseGainUnreliable: 15, minRedundantEquations: 2,
                  jResidualCaution: 0.3, jResidualUnreliable: 0.6, bResidualCaution: 0.05, bResidualUnreliable: 0.15,
                  etaModerate: 0.2, etaHigh: 0.35, currentSignificance: 0.05, coreRadius: 1, outerRadius: 2,
                  invariantDirectionRatio: 2, orderingRelevance: 0.02, orderingNote: 2 };
  function radii(eta, structureMissed, q) {
    let r = { core: RULES.coreRadius, outer: RULES.outerRadius };
    if (eta != null) { if (eta >= RULES.etaHigh) r = { core: 0.5, outer: 1 }; else if (eta >= RULES.etaModerate) r = { core: 1, outer: 1.5 }; }
    if (structureMissed) r = { core: Math.min(r.core, 0.5), outer: Math.min(r.outer, 1) };
    if (q != null && q < RULES.tqfOuterCap) r.outer = Math.min(r.outer, 1.5);
    return r;
  }
  /** η = rms|Jᵢ − J̄|/rms|Jᵢ| over the spacecraft with a current; null with fewer than two or a current too weak to shape
   *  the field at this scale (μ₀ rms|J| L_sc < 0.05 rms|B|). */
  function currentNonUniformity(samples, f, lsc) {
    const js = samples.map(s => s.j).filter(j => j && j.every(isFinite)).map(j => scale(j, f));
    if (js.length < 2) return null;
    const mean = scale(js.reduce(add, [0, 0, 0]), 1 / js.length);
    const dev = js.reduce((s, j) => s + dot(sub(j, mean), sub(j, mean)), 0) / js.length, tot = js.reduce((s, j) => s + dot(j, j), 0) / js.length;
    const b2 = samples.reduce((s, x) => s + dot(x.b, x.b), 0) / Math.max(1, samples.length);
    if (!(tot > 0) || !(MU0 * Math.sqrt(tot) * lsc >= RULES.currentSignificance * Math.sqrt(b2))) return null;
    return Math.sqrt(dev / tot);
  }
  /** Denton et al. (2020) §5's ∇·J check on the measured (scaled) currents. */
  function currentDivergence(samples, f) {
    const w = samples.filter(s => s.j && s.j.every(isFinite));
    if (w.length < 4) return null;
    const r = w.map(s => s.r), j = w.map(s => scale(s.j, f)), gj = linearGradient(r, j);
    if (!gj) return null;
    const div = gj[0][0] + gj[1][1] + gj[2][2], lsc = meanSeparation(r), mean = scale(j.reduce(add, [0, 0, 0]), 1 / j.length);
    const gb = linearGradient(r, w.map(s => s.b));
    const curl = gb ? norm([gb[2][1] - gb[1][2], gb[0][2] - gb[2][0], gb[1][0] - gb[0][1]]) : NaN;
    return { divJ: div, relativeToCurl: curl > 0 ? lsc * MU0 * Math.abs(div) / curl : NaN, relativeToMean: norm(mean) > 0 ? lsc * Math.abs(div) / norm(mean) : NaN };
  }
  function assessTrust(model, d, lsc, mddChoice) {
    const LEVELS = ["good", "caution", "unreliable"];
    let level = 0;
    const reasons = [], flagged = [];
    const flag = (l, text) => { level = Math.max(level, l); reasons.push(text); flagged.push([l, text]); };
    const M = MODELS[model];
    if (isFinite(d.noiseGain)) {
      if (d.noiseGain > RULES.noiseGainUnreliable) flag(2, `This formation and model amplify measurement noise ${d.noiseGain.toFixed(0)}× at one separation from the barycenter: the field there is set by noise.`);
      else if (d.noiseGain > RULES.noiseGainCaution) flag(1, `This formation and model amplify measurement noise ${d.noiseGain.toFixed(1)}× at one separation (RQ-3D on a regular tetrahedron: ≈2).`);
    }
    if (d.degreesOfFreedom < RULES.minRedundantEquations) flag(1, `${M.long} has ${d.degreesOfFreedom} redundant equation${d.degreesOfFreedom === 1 ? "" : "s"}: it reproduces measurement noise, and its near-zero residuals are no check on the fit.`);
    if (d.tetrahedronQuality != null && d.tetrahedronQuality < RULES.tqfNote)
      reasons.push(`Tetrahedron quality ${d.tetrahedronQuality.toFixed(2)} (the curlometer warns below ${RULES.tqfNote.toFixed(1)}; here the noise gain is the test${d.tetrahedronQuality < RULES.tqfOuterCap ? ", and the outer radius is capped at 1.5 L_sc" : ""}).`);
    if (d.relativeJResidual != null) {
      if (d.relativeJResidual > RULES.jResidualUnreliable) flag(2, `The model misses the measured currents by ${(d.relativeJResidual * 100).toFixed(0)}% (rms): they are not one smooth current across the ${lsc.toFixed(1)} km formation.`);
      else if (d.relativeJResidual > RULES.jResidualCaution) flag(1, `The model misses the measured currents by ${(d.relativeJResidual * 100).toFixed(0)}% (rms).`);
    }
    let missed = false;
    if (d.relativeBResidual >= RULES.bResidualUnreliable) { missed = true; flag(2, `The model misses the measured field by ${(d.relativeBResidual * 100).toFixed(0)}% of its variation across the formation: the field has structure this polynomial cannot hold.`); }
    else if (d.relativeBResidual >= RULES.bResidualCaution) { missed = true; flag(1, `The model misses the measured field by ${(d.relativeBResidual * 100).toFixed(0)}% of its variation across the formation.`); }
    if (!M.linear && d.mddEigenvalues.length === 3) {
      const [ln, ll, lm] = d.mddEigenvalues;
      if (ln > 0 && ll >= RULES.orderingRelevance * ln && ll < RULES.invariantDirectionRatio * lm) reasons.push(`No clear invariant direction (MDD λl/λm = ${(ll / lm).toFixed(1)}): the model drops ∂²/∂m², so curvature along m would be missed.`);
      else if (mddChoice && ll > 0 && ln < RULES.orderingNote * ll) reasons.push(`MDD λn/λl = ${(ln / ll).toFixed(1)}: the maximum and intermediate gradient directions are not separated (a flux-rope-like cross-section).`);
    }
    const r = radii(d.currentNonUniformity, missed, d.tetrahedronQuality);
    if (d.currentNonUniformity != null && d.currentNonUniformity >= RULES.etaHigh) flag(1, `The measured current changes by ${(d.currentNonUniformity * 100).toFixed(0)}% across the formation (structure thinner than the ${lsc.toFixed(1)} km separation, or noisy currents).`);
    if (r.outer < RULES.outerRadius) reasons.push(`Trusted within ${r.core.toFixed(1)} L_sc (${(r.core * lsc).toFixed(0)} km); extrapolation beyond ${r.outer.toFixed(1)} L_sc (${(r.outer * lsc).toFixed(0)} km).`);
    if (d.currentCount < d.spacecraftCount && !M.linear) reasons.push(`Plasma current at ${d.currentCount} of ${d.spacecraftCount} spacecraft (${d.degreesOfFreedom} redundant equations).`);
    const cause = level ? (flagged.find(([l]) => l === level) || [])[1] || null : null;
    return { level: LEVELS[level], rank: level, reasons, core_km: r.core * lsc, outer_km: r.outer * lsc, core_Lsc: r.core, outer_Lsc: r.outer, cause };
  }

  // ───────────────────────── the solve ─────────────────────────
  /** Fit `model` to the spacecraft at one instant. samples: [{probe, r, b, j?}]; options: { frame: null (MDD) or
   *  {l, m, n}, currentScale f, currentWeight, useCurrent }. Returns { solution } or { error } — the port refuses rather
   *  than guess; every softer problem is in solution.trust. */
  function solve(input, model = "rq3d", opt = {}) {
    const o = Object.assign({ frame: null, currentScale: 1, currentWeight: 1, useCurrent: true }, opt), M = MODELS[model];
    const fin = (v) => v && v.every(isFinite);
    const sc = input.filter(s => fin(s.r) && fin(s.b));
    if (sc.length < 4) return { error: `Reconstruction needs B and position at four spacecraft; ${sc.length} usable.` };
    const pos = sc.map(s => s.r), fields = sc.map(s => s.b);
    const bary = scale(pos.reduce(add, [0, 0, 0]), 1 / sc.length), lsc = meanSeparation(pos), G = linearGradient(pos, fields);
    if (!(lsc > 0) || !G) return { error: "The spacecraft are coplanar or collapsed — no three-dimensional gradient." };
    const mdd = mddFrame(G);
    let F = mdd.frame;
    if (o.frame) { F = checkedFrame(o.frame.l, o.frame.m, o.frame.n, 1e-6) ? o.frame : null; if (!F) return { error: "The fixed frame is not a right-handed orthonormal triad." }; }
    const xi = pos.map(r => scale(toLocal(F, sub(r, bary)), 1 / lsc)), bLoc = fields.map(b => toLocal(F, b));
    const fitJ = o.useCurrent && M.current;
    const jLoc = sc.map(s => (fitJ && fin(s.j) ? scale(toLocal(F, s.j), o.currentScale) : null));
    const terms = [];
    for (let c = 0; c < 3; c++) for (const k of M.terms[c]) terms.push({ c, k });
    const { basis: Z, rank: rankC } = nullSpace(divergenceConstraints(terms), terms.length);
    const nFree = terms.length - rankC, w = o.currentWeight, A = [], rhs = [];
    xi.forEach((p, i) => {
      for (let c = 0; c < 3; c++) { A.push(terms.map(t => (t.c === c ? basis(t.k, p) : 0))); rhs.push(bLoc[i][c]); }
      if (jLoc[i]) for (let c = 0; c < 3; c++) { A.push(curlRow(c, terms, p).map(x => x * w)); rhs.push(w * lsc * MU0 * jLoc[i][c]); }
    });
    const nJ = jLoc.filter(Boolean).length;
    if (A.length < nFree) return { error: `${M.long} has ${nFree} free coefficients but only ${A.length} equations — it needs the plasma current at more spacecraft.` };
    const Am = matmul(A, Z), { u: U, s: Sv, v: V } = svd(Am), smax = Sv[0] || 0, rank = Sv.filter(x => x > 1e-11 * smax).length;
    if (!(smax > 0) || rank !== nFree) return { error: `${M.long}: the equations constrain only ${rank} of ${nFree} free coefficients at this geometry.` };
    const y = new Array(nFree).fill(0);
    for (let k = 0; k < nFree; k++) {
      let ub = 0;
      for (let i = 0; i < A.length; i++) ub += U[i][k] * rhs[i];
      const f = ub / Sv[k];
      for (let r = 0; r < nFree; r++) y[r] += V[r][k] * f;
    }
    const a = matvec(Z, y);
    const coeffs = [0, 1, 2].map(() => new Array(9).fill(0));
    terms.forEach((t, j) => { coeffs[t.c][t.k] = a[j] / lsc ** SLOTS[t.k].d; });
    let cost = 0;
    A.forEach((row, i) => { let f = 0; for (let j = 0; j < row.length; j++) f += row[j] * a[j]; cost += (f - rhs[i]) ** 2; });
    // coefficient covariance for unit noise per equation: W Wᵀ, W = Z V Σ⁻¹
    const Wm = terms.map(() => new Array(nFree).fill(0));
    for (let k = 0; k < nFree; k++) for (let r = 0; r < nFree; r++) { const v = V[r][k] / Sv[k]; if (v) for (let i = 0; i < terms.length; i++) Wm[i][k] += Z[i][r] * v; }
    const cov = terms.map((_, i) => terms.map((_, j) => { let s = 0; for (let k = 0; k < nFree; k++) s += Wm[i][k] * Wm[j][k]; return s; }));
    const sol = makeSolution(model, sc, F, !o.frame, bary, lsc, coeffs, cov, terms.map(t => 9 * t.c + t.k));
    const gain = Math.sqrt(fibonacciSphere(64).reduce((s, u) => { const g = sol.noiseGain(add(bary, toGSE(F, scale(u, lsc)))); return s + g * g; }, 0) / 64);
    let sB = 0, sJ = 0, sJm = 0;
    const residuals = sc.map((s, i) => {
      const dB = sub(sol.b(s.r), s.b);
      sB += dot(dB, dB);
      let dJ = null;
      if (jLoc[i] && s.j) { const jm = scale(s.j, o.currentScale); dJ = sub(sol.j(s.r), jm); sJ += dot(dJ, dJ); sJm += dot(jm, jm); }
      return { probe: s.probe, dB, dJ };
    });
    const rmsB = Math.sqrt(sB / sc.length), rmsJ = nJ ? Math.sqrt(sJ / nJ) : null;
    let spread = 0;
    for (let i = 0; i < fields.length; i++) for (let j = i + 1; j < fields.length; j++) spread = Math.max(spread, norm(sub(fields[i], fields[j])));
    const diag = {
      spacecraftCount: sc.length, currentCount: nJ, equations: A.length, parameters: terms.length, constraints: rankC, freeParameters: nFree,
      degreesOfFreedom: A.length - nFree, conditionNumber: Sv[nFree - 1] > 0 ? smax / Sv[nFree - 1] : Infinity,
      tetrahedronQuality: sc.length === 4 ? tqf(pos) : null, mddEigenvalues: mdd.eigenvalues, mddFrame: mdd.frame, residuals, rmsB, rmsJ,
      relativeBResidual: rmsB / Math.max(spread, 1), relativeJResidual: nJ && sJm > 0 ? Math.sqrt(sJ / sJm) : null,
      currentNonUniformity: currentNonUniformity(o.useCurrent ? sc : sc.map(s => ({ b: s.b })), o.currentScale, lsc),
      noiseGain: gain, cost, currentScale: o.currentScale, currentDivergence: o.useCurrent ? currentDivergence(sc, o.currentScale) : null,
    };
    sol.diagnostics = diag;
    sol.trust = assessTrust(model, diag, lsc, !o.frame);
    return { solution: sol };
  }
  function makeSolution(model, samples, F, isMDD, bary, lsc, coeffs, cov, codes) {
    const R = rowsOf(F), Rt = [0, 1, 2].map(i => [0, 1, 2].map(j => R[j][i]));
    const local = (r) => toLocal(F, sub(r, bary));
    const sol = {
      model, samples, frame: F, frameIsMDD: isMDD, barycenter: bary, separation: lsc, coefficients: coeffs,
      /** B [nT] at an absolute position [km], GSE. */
      b(r) {
        const p = local(r), b = [0, 0, 0];
        for (let c = 0; c < 3; c++) for (let k = 0; k < 9; k++) if (coeffs[c][k]) b[c] += coeffs[c][k] * basis(k, p);
        return toGSE(F, b);
      },
      /** ∂Bᵢ/∂xⱼ [nT/km] at a point, GSE. */
      gradient(r) {
        const p = local(r), g = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
        for (let c = 0; c < 3; c++) for (let k = 0; k < 9; k++) if (coeffs[c][k]) for (let d = 0; d < 3; d++) g[c][d] += coeffs[c][k] * basisDerivative(k, d, p);
        return matmul(matmul(Rt, g), R);
      },
      /** J = (∇×B)/μ₀ [µA/m²] at a point, GSE — the analytic curl. */
      j(r) { const g = this.gradient(r); return scale([g[2][1] - g[1][2], g[0][2] - g[2][0], g[1][0] - g[0][1]], 1 / MU0); },
      /** The rms error of B [nT] at a point per 1 nT of independent noise in every fitted equation. */
      noiseGain(r) {
        const x = scale(local(r), 1 / lsc);
        let total = 0;
        for (let c = 0; c < 3; c++) {
          const phi = codes.map(code => (Math.floor(code / 9) === c ? basis(code % 9, x) : 0));
          for (let i = 0; i < phi.length; i++) if (phi[i]) for (let j = 0; j < phi.length; j++) if (phi[j]) total += phi[i] * cov[i][j] * phi[j];
        }
        return Math.sqrt(Math.max(0, total));
      },
      distance(r) { return norm(sub(r, bary)); },
      /** "core", "outer" or "beyond" the trusted radii. */
      zone(r) { const d = norm(sub(r, bary)); return d <= this.trust.core_km ? "core" : d <= this.trust.outer_km ? "outer" : "beyond"; },
    };
    return sol;
  }

  // ───────────────────────── a plane through the reconstruction (…+PlaneCut.swift) ─────────────────────────
  const AXES = { l: 0, m: 1, n: 2 };
  /** An orientation: horizontal and vertical display axes ("l", "m", "n"), each optionally reversed; the third is the
   *  normal. "LN" is the paper's (L across, N up, M out of the plane). */
  function orientation(spec = "LN") {
    const s = String(spec).toUpperCase().replace(/\s/g, ""), ax = [];
    let rev = false;
    for (const ch of s) { if (ch === "-") rev = true; else { ax.push([ch.toLowerCase(), rev]); rev = false; } }
    const [h, v] = ax.length === 2 && ax[0][0] !== ax[1][0] ? ax : [["l", false], ["n", false]];
    const nrm = ["l", "m", "n"].find(k => k !== h[0] && k !== v[0]);
    return { h: h[0], v: v[0], n: nrm, hs: h[1] ? -1 : 1, vs: v[1] ? -1 : 1, hi: AXES[h[0]], vi: AXES[v[0]], ni: AXES[nrm], name: s };
  }
  /** The paper-view cut (show_list): a res × res grid over center ± halfWidth [km from the barycenter, along the cut's
   *  horizontal and vertical axes] in the DISPLAY frame `display` ({l, m, n} GSE), the plane `offset` km along its
   *  normal; B always, J when wantJ. Grids are row-major [iV * res + iH]; components are the display L, M, N. */
  function planeCut(sol, display, o = {}) {
    const or = orientation(o.orientation || "LN"), hw = o.halfWidth ?? 3 * sol.separation, res = Math.max(2, o.resolution || 201);
    const offset = o.offset || 0, center = o.center || [0, 0];
    const U = { h: scale(display[or.h], or.hs), v: scale(display[or.v], or.vs), n: display[or.n] };
    const F = sol.frame, origin = toLocal(F, scale(U.n, offset)), aH = toLocal(F, U.h), aV = toLocal(F, U.v);
    const D = rowsOf(display), Rr = rowsOf(F);
    const back = D.map(dr => Rr.map(rr => dot(dr, rr)));          // reconstruction-frame components → display
    const P = sol.coefficients;
    const axis = Array.from({ length: res }, (_, i) => -hw + 2 * hw * i / (res - 1));
    const loc = (u, w) => [origin[0] + u * aH[0] + w * aV[0], origin[1] + u * aH[1] + w * aV[1], origin[2] + u * aH[2] + w * aV[2]];
    const compOf = (q, x, y, z) => q[0] + q[1] * z + q[2] * x + q[3] * y + 0.5 * q[4] * z * z + q[5] * z * x + 0.5 * q[6] * x * x + q[7] * z * y + q[8] * x * y;
    /** Display-frame B at the plane point (u, w). */
    function evalB(u, w) {
      const [x, y, z] = loc(u, w), b0 = compOf(P[0], x, y, z), b1 = compOf(P[1], x, y, z), b2 = compOf(P[2], x, y, z);
      return [back[0][0] * b0 + back[0][1] * b1 + back[0][2] * b2, back[1][0] * b0 + back[1][1] * b1 + back[1][2] * b2, back[2][0] * b0 + back[2][1] * b1 + back[2][2] * b2];
    }
    const localGradient = (x, y, z) => P.map(q => [q[2] + q[5] * z + q[6] * x + q[8] * y, q[3] + q[7] * z + q[8] * x, q[1] + q[4] * z + q[5] * x + q[7] * y]);
    function curlDisplay(u, w) {
      const g = localGradient(...loc(u, w)), cl = g[2][1] - g[1][2], cm = g[0][2] - g[2][0], cn = g[1][0] - g[0][1];
      return back.map(r => r[0] * cl + r[1] * cm + r[2] * cn);
    }
    /** The in-plane Jacobian (∂B_h/∂h, ∂B_h/∂v, ∂B_v/∂h, ∂B_v/∂v). */
    function jacobian(u, w) {
      const G = localGradient(...loc(u, w)), QG = matmul(back, G);
      const gd = (i, j) => QG[i][0] * back[j][0] + QG[i][1] * back[j][1] + QG[i][2] * back[j][2];
      return { hh: gd(or.hi, or.hi), hv: or.hs * or.vs * gd(or.hi, or.vi), vh: or.vs * or.hs * gd(or.vi, or.hi), vv: gd(or.vi, or.vi) };
    }
    const inPlane = (b) => [or.hs * b[or.hi], or.vs * b[or.vi]];
    const n2 = res * res, bL = new Float64Array(n2), bM = new Float64Array(n2), bN = new Float64Array(n2);
    const jL = o.wantJ ? new Float64Array(n2) : null, jM = o.wantJ ? new Float64Array(n2) : null, jN = o.wantJ ? new Float64Array(n2) : null;
    for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) {
      const u = center[0] + axis[i], w = center[1] + axis[j], b = evalB(u, w), k = j * res + i;
      bL[k] = b[0]; bM[k] = b[1]; bN[k] = b[2];
      if (o.wantJ) { const c = curlDisplay(u, w); jL[k] = c[0] / MU0; jM[k] = c[1] / MU0; jN[k] = c[2] / MU0; }
    }
    const markers = sol.samples.map(s => { const d = sub(s.r, sol.barycenter); return { probe: s.probe, h: dot(d, U.h), v: dot(d, U.v), off: dot(d, U.n) - offset }; });
    const contains = (p) => Math.abs(p[0] - center[0]) <= hw && Math.abs(p[1] - center[1]) <= hw;
    const comp = { l: [bL, jL], m: [bM, jM], n: [bN, jN] };
    const cut = {
      orientation: or, display, offset, halfWidth: hw, center, resolution: res, axis, bL, bM, bN, jL, jM, jN, markers, solution: sol, units: U,
      evalB, curlDisplay, contains,
      /** The grid of one display component of B (or J when evaluated): "l", "m" or "n". */
      grid(axisKey, current = false) { return comp[axisKey][current ? 1 : 0]; },
      /** A plane point's absolute GSE position [km]. */
      position(p) { return add(add(add(sol.barycenter, scale(U.h, p[0])), scale(U.n, offset)), scale(U.v, p[1])); },
      /** Streamlines of the in-plane field (streamline2d_symmetric with RK4; seeds on a grid, a seed skipped when an
       *  earlier line crossed its cell), each ordered along +B, points [h, v] km from the barycenter. */
      streamlines(opts = {}) {
        const step = opts.step || hw / 150, grid = Math.max(1, opts.seedGrid || 20), maxSteps = opts.maxSteps || 4000;
        const cell = 2 * hw / grid, h0 = center[0] - hw, v0 = center[1] - hw;
        const gh = comp[or.h][0], gv = comp[or.v][0];
        let maxIn = 0;
        for (let k = 0; k < gh.length; k++) maxIn = Math.max(maxIn, Math.hypot(gh[k], gv[k]));
        const minField = Math.max(1e-12, 1e-6 * maxIn), covered = new Uint8Array(grid * grid), lines = [];
        const cellIndex = (p) => { const i = Math.floor((p[0] - h0) / cell), j = Math.floor((p[1] - v0) / cell); return i >= 0 && i < grid && j >= 0 && j < grid ? j * grid + i : -1; };
        for (let j = 0; j < grid; j++) for (let i = 0; i < grid; i++) {
          const seed = [h0 + (i + 0.5) * cell, v0 + (j + 0.5) * cell], c0 = cellIndex(seed);
          if (c0 >= 0 && covered[c0]) continue;
          const line = trace(seed, step, maxSteps, minField);
          if (line.length < 2) continue;
          for (const p of line) { const c = cellIndex(p); if (c >= 0) covered[c] = 1; }
          lines.push(line);
        }
        return lines;
      },
      /** Nulls of the in-plane field in the window: Newton from a grid of starts, X where the in-plane Jacobian's
       *  determinant is negative, O where positive. */
      nulls(starts = 13) {
        const found = [], s = hw, ch = center[0], cv = center[1];
        for (let j = 0; j < starts; j++) for (let i = 0; i < starts; i++) {
          let l = ch - s + 2 * s * (i + 0.5) / starts, n = cv - s + 2 * s * (j + 0.5) / starts, ok = false, det = 0;
          for (let it = 0; it < 50; it++) {
            const [bh, bv] = inPlane(evalB(l, n)), J = jacobian(l, n);
            det = J.hh * J.vv - J.hv * J.vh;
            if (!(Math.abs(det) > 1e-14)) break;
            const dl = (J.vv * bh - J.hv * bv) / det, dn = (-J.vh * bh + J.hh * bv) / det;
            l -= dl; n -= dn;
            if (Math.abs(l - ch) > 2 * s || Math.abs(n - cv) > 2 * s) break;
            if (Math.abs(dl) + Math.abs(dn) < 1e-9 * Math.max(1, s)) { ok = true; break; }
          }
          if (!ok || Math.abs(l - ch) > s || Math.abs(n - cv) > s) continue;
          if (!found.some(f => Math.abs(f.h - l) + Math.abs(f.v - n) < 1e-6 * Math.max(1, s))) found.push({ kind: det < 0 ? "x" : "o", h: l, v: n });
        }
        return found;
      },
    };
    /** One symmetric line, grown forward and backward a step at a time: it ends at the box (clipped to its edge), after
     *  maxSteps points, or when its newest point comes within 0.9 step of an earlier one. */
    function trace(seed, h, maxSteps, minField) {
      const fwd = [seed], bwd = [seed], buckets = new Map();
      let endF = false, endB = false;
      const key = (p) => [Math.floor(p[0] / h), Math.floor(p[1] / h)];
      const insert = (p, branch, index) => { const [a, b] = key(p), k = a * 1000003 + b; if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push([branch, index, p]); };
      const touches = (p, branch, index) => {
        const [a, b] = key(p);
        for (let da = -1; da <= 1; da++) for (let db = -1; db <= 1; db++) {
          const list = buckets.get((a + da) * 1000003 + (b + db));
          if (!list) continue;
          for (const [br, ix, q] of list) {
            if (br === branch && ix >= index - 3) continue;
            if (ix === 0 && index <= 3) continue;
            if (Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.9 * h) return true;
          }
        }
        return false;
      };
      insert(seed, 0, 0);
      const dir = (q, sgn) => { const b = evalB(q[0], q[1]), bh = or.hs * b[or.hi], bv = or.vs * b[or.vi], m = Math.hypot(bh, bv); return isFinite(m) && m > minField ? [sgn * bh / m, sgn * bv / m] : null; };
      const stepFrom = (p, sgn) => {
        const k1 = dir(p, sgn); if (!k1) return null;
        const k2 = dir([p[0] + 0.5 * h * k1[0], p[1] + 0.5 * h * k1[1]], sgn); if (!k2) return null;
        const k3 = dir([p[0] + 0.5 * h * k2[0], p[1] + 0.5 * h * k2[1]], sgn); if (!k3) return null;
        const k4 = dir([p[0] + h * k3[0], p[1] + h * k3[1]], sgn); if (!k4) return null;
        return [p[0] + h / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]), p[1] + h / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1])];
      };
      const clip = (a, b) => {
        let t = 1;
        for (const [pa, pb, c] of [[a[0], b[0], center[0]], [a[1], b[1], center[1]]]) {
          const d = pb - pa;
          if (d > 0 && pb > c + hw) t = Math.min(t, (c + hw - pa) / d);
          if (d < 0 && pb < c - hw) t = Math.min(t, (c - hw - pa) / d);
        }
        return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      };
      while (!(endF && endB)) {
        let touched = false;
        for (const [branch, sgn] of [[1, 1], [2, -1]]) {
          if (branch === 1 ? endF : endB) continue;
          const arr = branch === 1 ? fwd : bwd, last = arr[arr.length - 1], next = stepFrom(last, sgn);
          if (!next) { if (branch === 1) endF = true; else endB = true; continue; }
          if (!contains(next)) { arr.push(clip(last, next)); if (branch === 1) endF = true; else endB = true; continue; }
          const index = arr.length;
          if (touches(next, branch, index)) touched = true;
          arr.push(next); insert(next, branch, index);
        }
        if (touched || fwd.length + bwd.length - 1 >= maxSteps) break;
      }
      return bwd.slice().reverse().concat(fwd.slice(1));
    }
    return cut;
  }

  // ───────────────────────── from time series to an instant (…+Series.swift) ─────────────────────────
  /** Largest index with t[i] ≤ x (0 when x precedes). */
  function lowerIndex(n, time, x) {
    let lo = 0, hi = n - 1;
    if (hi <= 0 || !(time(0) <= x)) return 0;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (time(mid) <= x) lo = mid; else hi = mid - 1; }
    return lo;
  }
  /** The shared sampler (smoothedSample): the centered running mean (half-width window/2, in time) at the two samples
   *  bracketing t, interpolated linearly; with `center`, a start-stamped series is read at t − Δ/2. null outside or
   *  across a gap of more than maxGap local cadences. */
  function smoothedSample(n, time, value, t, window, center, maxGap) {
    if (n < 2) return null;
    const i0 = lowerIndex(n, time, t), lo = Math.max(0, i0 - 10), hi = Math.min(n - 1, i0 + 10), gaps = [];
    for (let i = lo; i < hi; i++) gaps.push(time(i + 1) - time(i));
    if (!gaps.length) return null;
    gaps.sort((p, q) => p - q);
    const cad = gaps[gaps.length >> 1], ts = t - (center ? cad / 2 : 0);
    if (!(ts >= time(0) && ts <= time(n - 1))) return null;
    let i = lowerIndex(n, time, ts);
    if (i >= n - 1) i = n - 2;
    const ta = time(i), tb = time(i + 1);
    if (!(tb > ta) || tb - ta > maxGap * cad) return null;
    const smoothed = (j) => {
      if (!(window > 0)) return value(j);
      const tj = time(j), half = window / 2, s = [0, 0, 0];
      let c = 0;
      for (let k = j; k >= 0 && tj - time(k) <= half + 1e-6; k--) { const v = value(k); if (v) { s[0] += v[0]; s[1] += v[1]; s[2] += v[2]; c++; } }
      for (let k = j + 1; k < n && time(k) - tj <= half + 1e-6; k++) { const v = value(k); if (v) { s[0] += v[0]; s[1] += v[1]; s[2] += v[2]; c++; } }
      return c ? scale(s, 1 / c) : null;
    };
    const a = smoothed(i), b = smoothed(i + 1);
    if (!a || !b) return null;
    const f = (ts - ta) / (tb - ta);
    return add(a, scale(sub(b, a), f));
  }
  const vecVal = (s) => (i) => { const p = s[i]; return isFinite(p.x) && isFinite(p.y) && isFinite(p.z) ? [p.x, p.y, p.z] : null; };
  const value = (s, t, w, c, g) => (s && s.length >= 2 ? smoothedSample(s.length, (i) => s[i].t, vecVal(s), t, w, c, g) : null);
  const scalar = (s, t, w, c, g) => { const v = s && s.length >= 2 ? smoothedSample(s.length, (i) => s[i].t, (i) => (isFinite(s[i].v) ? [s[i].v, 0, 0] : null), t, w, c, g) : null; return v ? v[0] : null; };
  /** Plain linear interpolation between bracketing samples; null outside. */
  function linear(s, t) {
    const n = s.length;
    if (n < 2 || t < s[0].t || t > s[n - 1].t) return null;
    let i = lowerIndex(n, (k) => s[k].t, t);
    if (i >= n - 1) i = n - 2;
    const a = s[i], b = s[i + 1];
    if (!(b.t > a.t)) return [a.x, a.y, a.z];
    const f = (t - a.t) / (b.t - a.t), v = [a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, a.z + (b.z - a.z) * f];
    return v.every(isFinite) ? v : null;
  }
  /** A velocity with its spin tone subtracted sample by sample (left in place where the tone has no coverage), then
   *  smoothed and sampled. */
  function velocity(v, spin, t, w, c, g) {
    if (!v || v.length < 2) return null;
    return smoothedSample(v.length, (i) => v[i].t, (i) => {
      const p = v[i];
      if (!(isFinite(p.x) && isFinite(p.y) && isFinite(p.z))) return null;
      const raw = [p.x, p.y, p.z];
      const s = spin && spin.length ? linear(spin, p.t) : null;
      return s ? sub(raw, s) : raw;
    }, t, w, c, g);
  }
  /** Position at t: linear between the bracketing MEC samples, or extrapolated up to 60 s past either end. */
  function position(s, t) {
    const pts = (s || []).filter(p => isFinite(p.x) && isFinite(p.y) && isFinite(p.z));
    if (pts.length < 2 || t < pts[0].t - 60 || t > pts[pts.length - 1].t + 60) return null;
    let i = lowerIndex(pts.length, (k) => pts[k].t, t);
    i = Math.min(Math.max(i, 0), pts.length - 2);
    const a = pts[i], b = pts[i + 1];
    if (!(b.t > a.t)) return null;
    const f = (t - a.t) / (b.t - a.t);
    return [a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, a.z + (b.z - a.z) * f];
  }
  /** how_to_run_it.py's preparation: 0.3 s running means of B and of each plasma moment, FPI read at accumulation
   *  centers (the one deliberate departure from the reference — CMAD §4.3.1.1), both spin tones subtracted. */
  const PREP = { bWindow: 0.3, jWindow: 0.3, center: true, maxGap: 5, ionSpin: true, electronSpin: true, niDensity: false };
  const prep = (p) => Object.assign({}, PREP, p);
  /** One probe's plasma current at t [µA/m²] from its moments (each smoothed on its own cadence, spin tones removed,
   *  combined at t — running_avg + resample): e·nₑ(Vᵢ − Vₑ). null after `jEnd` (MMS4's DES failure). Probe series:
   *  { probe, b, r, ne, ni, vi, ve, viSpin, veSpin, jEnd }. */
  function current(s, t, p) {
    if (s.jEnd != null && t >= s.jEnd) return null;
    if (!s.ne || !s.vi || !s.ve) return null;
    const k = 1.602e-4, w = p.jWindow, c = p.center, g = p.maxGap;
    const ne = scalar(s.ne, t, w, c, g), vi = velocity(s.vi, p.ionSpin ? s.viSpin : null, t, w, c, g), ve = velocity(s.ve, p.electronSpin ? s.veSpin : null, t, w, c, g);
    if (ne == null || !vi || !ve) return null;
    if (p.niDensity) { const ni = scalar(s.ni, t, w, c, g); return ni == null ? null : scale(sub(scale(vi, ni), scale(ve, ne)), k); }
    return scale(sub(vi, ve), k * ne);
  }
  /** The spacecraft samples at t (a probe left out when its B or position cannot be sampled there). */
  function samplesAt(t, probes, p0) {
    const p = prep(p0), out = [];
    for (const s of probes) {
      const b = value(s.b, t, p.bWindow, false, p.maxGap), r = position(s.r, t);
      if (!b || !r) continue;
      out.push({ probe: s.probe, r, b, j: current(s, t, p) });
    }
    return out;
  }
  /** Sample the series at t and fit. */
  function solveAt(t, probes, model = "rq3d", p0 = {}, opt = {}) { return solve(samplesAt(t, probes, p0), model, opt); }
  /** Prec.calc_f: on a uniform grid over [a, b], the curlometer current from the RAW B of the four probes projected on
   *  each probe's prepared plasma current; per probe the median of (Jᵢ·J_curl)/|Jᵢ|², and f their mean. Also the
   *  paper's per-instant f(t) = ΣJᵢ·J_curl/Σ|Jᵢ|², its median and range. */
  function currentScale(probes, a, b, step = 0.005, p0 = {}) {
    const p = prep(p0), ratios = {}, perInstant = [];
    let used = 0;
    if (!(step > 0) || !(b > a)) return null;
    for (let t = a; t <= b + 1e-9; t += step) {
      const rs = [], bs = [];
      for (const s of probes) { const bb = value(s.b, t, null, false, p.maxGap), r = position(s.r, t); if (bb && r) { rs.push(r); bs.push(bb); } }
      if (rs.length < 4) continue;
      const G = linearGradient(rs, bs);
      if (!G) continue;
      const jc = scale([G[2][1] - G[1][2], G[0][2] - G[2][0], G[1][0] - G[0][1]], 1 / MU0);
      let any = false, num = 0, den = 0;
      for (const s of probes) {
        const j = current(s, t, p);
        if (!j) continue;
        const jj = dot(j, j);
        if (!(jj > 0)) continue;
        (ratios[s.probe] = ratios[s.probe] || []).push(dot(j, jc) / jj);
        num += dot(j, jc); den += jj; any = true;
      }
      if (any) { used++; perInstant.push(num / den); }
    }
    const per = {};
    for (const [k, r] of Object.entries(ratios)) if (r.length) per[k] = LM.math.median(r);
    const vals = Object.values(per);
    if (!vals.length || !perInstant.length) return null;
    return { perProbe: per, mean: vals.reduce((s, x) => s + x, 0) / vals.length, samples: used, instantMedian: LM.math.median(perInstant),
             instantRange: [Math.min(...perInstant), Math.max(...perInstant)] };
  }
  /** Prec.define_LMN without an external frame (…+LMN.swift): L the maximum-variance direction of every probe's B
   *  concatenated over [a, b]; N the summed MDD's maximum, made ⊥ L — priority "lFirst" (the Python: L kept),
   *  "nFirst", or "weighted" (Denton et al. 2018 App. A). B smoothed by the preparation's window unless raw. */
  function hybridLMN(probes, a, b, o = {}) {
    const p = prep(o.preparation), step = o.step || 0.005, priority = o.priority || "lFirst";
    const sum = [0, 0, 0], crs = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], mdd = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    let count = 0, instants = 0;
    for (let t = a; t <= b + 1e-9; t += step) {
      const rs = [], bs = [];
      for (const s of probes) { const bb = value(s.b, t, o.raw ? null : p.bWindow, false, p.maxGap), r = position(s.r, t); if (bb && r) { rs.push(r); bs.push(bb); } }
      if (rs.length < 4) continue;
      const G = linearGradient(rs, bs);
      if (!G) continue;
      instants++;
      for (const v of bs) { for (let i = 0; i < 3; i++) { sum[i] += v[i]; for (let j = 0; j < 3; j++) crs[i][j] += v[i] * v[j]; } count++; }
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) mdd[i][j] += G[k][i] * G[k][j];
    }
    if (!instants || count < 2) return null;
    const cov = [0, 1, 2].map(i => [0, 1, 2].map(j => crs[i][j] / count - sum[i] / count * sum[j] / count));
    const mva = symmetricEigen(cov), ev = symmetricEigen(mdd);
    const col = (m, k) => [m[0][k], m[1][k], m[2][k]];
    const largestPositive = (v) => { let i = 0; for (let k = 1; k < 3; k++) if (Math.abs(v[k]) > Math.abs(v[i])) i = k; return v[i] < 0 ? scale(v, -1) : v; };
    const lMVA = largestPositive(col(mva.vectors, 0)), nMDD = largestPositive(col(ev.vectors, 0)), along = dot(lMVA, nMDD);
    const nPerp = sub(nMDD, scale(lMVA, along)), lPerp = sub(lMVA, scale(nMDD, along));
    if (!(norm(nPerp) > 1e-9) || !(norm(lPerp) > 1e-9)) return null;
    const lMoved = scale(lPerp, 1 / norm(lPerp)), rL = mva.values[0] / Math.max(1e-300, mva.values[1]), rN = ev.values[0] / Math.max(1e-300, ev.values[1]);
    const share = priority === "lFirst" ? 0 : priority === "nFirst" ? 1 : isFinite(rN) && isFinite(rL) ? rN / (rN + rL) : isFinite(rN) ? 0 : 1;
    const M = cross(scale(nPerp, 1 / norm(nPerp)), lMVA), theta = Math.acos(Math.max(-1, Math.min(1, dot(lMVA, lMoved))));
    const L = theta > 1e-12 ? add(scale(lMVA, Math.sin((1 - share) * theta) / Math.sin(theta)), scale(lMoved, Math.sin(share * theta) / Math.sin(theta))) : lMVA;
    const N = cross(L, M), f = checkedFrame(L, M, N, 1e-6);
    if (!f) return null;
    return { frame: f, mvaEigenvalues: mva.values.map(x => Math.max(0, x)), mddEigenvalues: ev.values.map(x => Math.max(0, x)), instants,
             normalProjection_deg: Math.asin(Math.min(1, Math.abs(along))) * 180 / Math.PI, priority, lShare: share };
  }
  /** The mean DIS velocity of the probes that have one (spin tone removed), at accumulation centers — for display. */
  function meanIonVelocity(t, probes, p0 = { bWindow: null, jWindow: null }) {
    const p = prep(p0), vs = probes.map(s => (s.vi ? velocity(s.vi, p.ionSpin ? s.viSpin : null, t, p.jWindow, p.center, p.maxGap) : null)).filter(Boolean);
    return vs.length ? { v: scale(vs.reduce(add, [0, 0, 0]), 1 / vs.length), probes: vs.length } : null;
  }
  /** FormationModel.aligned: f with n and l flipped, where needed, to point along ref's N and L (m = n × l). */
  function aligned(f, ref) {
    const n = dot(f.n, ref.n) < 0 ? scale(f.n, -1) : f.n, l = dot(f.l, ref.l) < 0 ? scale(f.l, -1) : f.l;
    return frame(l, cross(n, l), n);
  }

  const api = { MU0, MODELS, SLOTS, basis, basisDerivative, divergenceConstraints, curlRow, meanSeparation, tqf, mddFrame, checkedFrame,
                toLocal, toGSE, solve, solveAt, samplesAt, planeCut, orientation, currentScale, hybridLMN, meanIonVelocity, aligned,
                value, scalar, velocity, position, linear, current, RULES, radii, PREP, fibonacciSphere };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.HeliosRecon = api;
})(typeof window !== "undefined" ? window : globalThis);
