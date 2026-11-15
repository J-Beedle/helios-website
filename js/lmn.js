/* Helios Live: the LMN methods, as Helios solves them (LMNSolver.swift, LMNSolver+Four.swift, LMNMethods.swift,
 * MVAB.swift, ReconstructionMath.swift in MMSTrackerCore). Arithmetic only — no page, no fetching: the workbench
 * (lmn-panel.js) gathers the inputs and draws the results; tools/lmn_check.js runs the Swift tests' numbers in Node.
 *
 * Sign convention throughout, the one MVABFrame.compute has always used (the user's CoordinateTransform.py):
 * N_x ≥ 0, L_z ≥ 0, M = N × L — except where a method fixes a sign physically (the Torbert hybrid's M along ⟨J⟩) or a
 * combination keeps its inputs' signs.
 *
 * Sources, as LMNMethods.swift lists them (Genestreti et al. 2018, JGR 123, 9130, §3.1 and Table A1, is the map):
 * Sonnerup & Scheible (1998, ISSI SR-001 ch. 8) — MVA, ⟨B⟩·n = 0 (§8.2.6), MVA-E (§8.4.2), error cones (eq. 8.23);
 * Khrabrov & Sonnerup (1998); Sonnerup et al. (2006) with its 2007 correction — the minimum Faraday residue, eq. 26 AS
 * CORRECTED, eq. 28, A1/A3; Mozer & Retinò (2007, Appendix A); Shi et al. (2005) — MDD; Denton et al. (2010, 2012) —
 * summed MDD and δ∇B; Denton et al. (2018, Appendix A) — the MVA-B/MDD hybrid; Torbert et al. (2018, supplement);
 * Denton et al. (2024, eq. 1) — the calibration floor λ₀ = (0.1 nT / d)².
 *
 * Series are arrays of {t, x, y, z}, t in seconds (any epoch, the same for every series of one solve). Vectors GSE.
 * FPI moments (vi, ve, j) must already be stamped at their accumulation CENTERS (FPI tags the start, CMAD §4.3.1.1):
 * accumulationCenters() does that.
 */
(function (root) {
  "use strict";

  // ───────────────────────── small vector algebra ─────────────────────────
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const neg = (a) => [-a[0], -a[1], -a[2]];
  const norm = (a) => Math.sqrt(dot(a, a));
  const unit = (a) => { const n = norm(a); return n > 1e-12 && isFinite(n) ? scale(a, 1 / n) : null; };
  const angleRad = (a, b) => { const na = norm(a), nb = norm(b); return na > 0 && nb > 0 ? Math.acos(Math.max(-1, Math.min(1, dot(a, b) / (na * nb)))) : NaN; };
  /** The angle between two LINES [deg] — sign-blind, for comparing axes. */
  const lineAngle = (a, b) => { const r = angleRad(a, b) * 180 / Math.PI; return Math.min(r, 180 - r); };
  const finite3 = (p) => isFinite(p.x) && isFinite(p.y) && isFinite(p.z);
  const vec = (p) => [p.x, p.y, p.z];

  // ───────────────────────── ReconstructionMath ─────────────────────────
  const identity = (n) => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  const frob2 = (a) => a.reduce((s, r) => s + r.reduce((q, x) => q + x * x, 0), 0);
  function matmul(a, b) {
    const n = b[0] ? b[0].length : 0, k = b.length;
    return a.map(row => { const out = new Array(n).fill(0); for (let j = 0; j < n; j++) { let s = 0; for (let q = 0; q < k; q++) s += row[q] * b[q][j]; out[j] = s; } return out; });
  }
  const matvec = (a, x) => a.map(row => { let s = 0; for (let i = 0; i < row.length; i++) s += row[i] * x[i]; return s; });
  /** ReconstructionMath.symmetricEigen: cyclic Jacobi; eigenvalues DESCENDING, eigenvectors as COLUMNS (vectors[i][k]
   *  is component i of eigenvector k). */
  function symmetricEigen(input) {
    const n = input.length, a = input.map(r => r.slice()), v = identity(n);
    for (let sweep = 0; sweep < 100; sweep++) {
      let off = 0;
      for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p][q] * a[p][q];
      if (off < 1e-30 * Math.max(1e-300, frob2(a))) break;
      for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
        const apq = a[p][q];
        if (!(Math.abs(apq) > 1e-300)) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * apq);
        const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k++) { const akp = a[k][p], akq = a[k][q]; a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq; }
        for (let k = 0; k < n; k++) { const apk = a[p][k], aqk = a[q][k]; a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk; }
        for (let k = 0; k < n; k++) { const vkp = v[k][p], vkq = v[k][q]; v[k][p] = c * vkp - s * vkq; v[k][q] = s * vkp + c * vkq; }
      }
    }
    const order = Array.from({ length: n }, (_, i) => i).sort((i, j) => a[j][j] - a[i][i]);
    return { values: order.map(i => a[i][i]), vectors: Array.from({ length: n }, (_, i) => order.map(k => v[i][k])) };
  }
  /** LMNSolver.eigen: a 3 × 3's eigenvalues, largest first, and its eigenvectors as a list (vectors[k] the k-th). */
  function eigen(m) {
    const r = symmetricEigen(m);
    return { values: r.values, vectors: [0, 1, 2].map(k => [0, 1, 2].map(i => r.vectors[i][k])) };
  }
  /** ReconstructionMath.svd: thin SVD by one-sided (Hestenes) Jacobi; s descending, u m × n, v n × n. */
  function svd(input) {
    const m = input.length, n = m ? input[0].length : 0;
    if (!m || !n) return { u: [], s: [], v: [] };
    const cols = Array.from({ length: n }, (_, j) => Float64Array.from({ length: m }, (_, i) => input[i][j]));
    const vcols = Array.from({ length: n }, (_, j) => Float64Array.from({ length: n }, (_, i) => (i === j ? 1 : 0)));
    for (let sweep = 0; sweep < 80; sweep++) {
      let rotated = false;
      for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
        const cp = cols[p], cq = cols[q];
        let alpha = 0, beta = 0, gamma = 0;
        for (let i = 0; i < m; i++) { alpha += cp[i] * cp[i]; beta += cq[i] * cq[i]; gamma += cp[i] * cq[i]; }
        if (!(Math.abs(gamma) > 1e-15 * Math.sqrt(alpha * beta)) || !(Math.abs(gamma) > 1e-300)) continue;
        rotated = true;
        const zeta = (beta - alpha) / (2 * gamma);
        const t = (zeta >= 0 ? 1 : -1) / (Math.abs(zeta) + Math.sqrt(1 + zeta * zeta));
        const c = 1 / Math.sqrt(1 + t * t), s = c * t;
        for (let i = 0; i < m; i++) { const xp = cp[i], xq = cq[i]; cp[i] = c * xp - s * xq; cq[i] = s * xp + c * xq; }
        const vp = vcols[p], vq = vcols[q];
        for (let i = 0; i < n; i++) { const xp = vp[i], xq = vq[i]; vp[i] = c * xp - s * xq; vq[i] = s * xp + c * xq; }
      }
      if (!rotated) break;
    }
    const norms = cols.map(c => Math.sqrt(c.reduce((s, x) => s + x * x, 0)));
    const order = Array.from({ length: n }, (_, j) => j).sort((i, j) => norms[j] - norms[i]);
    return {
      s: order.map(j => norms[j]),
      u: Array.from({ length: m }, (_, i) => order.map(j => (norms[j] > 0 ? cols[j][i] / norms[j] : 0))),
      v: Array.from({ length: n }, (_, i) => order.map(j => vcols[j][i])),
    };
  }
  /** ReconstructionMath.nullSpace: an orthonormal basis (COLUMNS, p × (p − rank)) of the null space of the k × p
   *  matrix c, and its rank. */
  function nullSpace(c, p) {
    const span = [];
    const nrm = (x) => Math.sqrt(x.reduce((s, y) => s + y * y, 0));
    const orth = (x) => { const y = x.slice(); for (let pass = 0; pass < 2; pass++) for (const q of span) { let d = 0; for (let i = 0; i < p; i++) d += y[i] * q[i]; for (let i = 0; i < p; i++) y[i] -= d * q[i]; } return y; };
    let rank = 0;
    for (const row of c) {
      const s = nrm(row);
      if (!(s > 0)) continue;
      const y = orth(row.map(x => x / s)), ny = nrm(y);
      if (ny > 1e-10) { span.push(y.map(x => x / ny)); rank++; }
    }
    const basis = [];
    for (let k = 0; k < p && span.length < p; k++) {
      const e = new Array(p).fill(0); e[k] = 1;
      const y = orth(e), ny = nrm(y);
      if (ny > 1e-6) { const q = y.map(x => x / ny); span.push(q); basis.push(q); }
    }
    return { basis: Array.from({ length: p }, (_, i) => basis.map(b => b[i])), rank };
  }
  /** ReconstructionMath.invert3: nil when singular (|det| relative to the matrix scale below 1e-12). */
  function invert3(m) {
    const det = m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    const sc = Math.max(...m.flat().map(Math.abs));
    if (!isFinite(det) || !(sc > 0) || !(Math.abs(det) > 1e-12 * sc * sc * sc)) return null;
    return [
      [(m[1][1] * m[2][2] - m[1][2] * m[2][1]) / det, (m[0][2] * m[2][1] - m[0][1] * m[2][2]) / det, (m[0][1] * m[1][2] - m[0][2] * m[1][1]) / det],
      [(m[1][2] * m[2][0] - m[1][0] * m[2][2]) / det, (m[0][0] * m[2][2] - m[0][2] * m[2][0]) / det, (m[0][2] * m[1][0] - m[0][0] * m[1][2]) / det],
      [(m[1][0] * m[2][1] - m[1][1] * m[2][0]) / det, (m[0][1] * m[2][0] - m[0][0] * m[2][1]) / det, (m[0][0] * m[1][1] - m[0][1] * m[1][0]) / det],
    ];
  }
  /** PolynomialReconstruction.linearGradient: ∂Bᵢ/∂xⱼ [nT/km] fitted through the spacecraft about their barycenter,
   *  G = Σ ΔB (R⁻¹Δr)ᵀ with R = Σ Δr Δrᵀ — the curlometer's estimate; null for a degenerate formation. r, b: [x,y,z]. */
  function linearGradient(r, b) {
    if (r.length < 4 || r.length !== b.length) return null;
    const n = r.length, rc = [0, 0, 0], bc = [0, 0, 0];
    for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) { rc[c] += r[i][c] / n; bc[c] += b[i][c] / n; }
    const R = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (const p of r) { const d = sub(p, rc); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) R[i][j] += d[i] * d[j]; }
    const Ri = invert3(R);
    if (!Ri) return null;
    const G = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (let k = 0; k < n; k++) {
      const w = matvec(Ri, sub(r[k], rc)), db = sub(b[k], bc);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) G[i][j] += db[i] * w[j];
    }
    return G;
  }

  // ───────────────────────── series helpers ─────────────────────────
  const inside = (s, iv) => (s || []).filter(p => p.t >= iv.a && p.t <= iv.b && finite3(p));
  /** ⟨vvᵀ⟩ − ⟨v⟩⟨v⟩ᵀ and ⟨v⟩. */
  function covariance(vs) {
    const n = Math.max(1, vs.length), mean = [0, 0, 0];
    for (const v of vs) { mean[0] += v[0] / n; mean[1] += v[1] / n; mean[2] += v[2] / n; }
    const m = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (const v of vs) { const d = sub(v, mean); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) m[i][j] += d[i] * d[j] / n; }
    return { m, mean };
  }
  const median = (a) => { if (!a.length) return NaN; const s = a.slice().sort((p, q) => p - q), n = s.length; return n % 2 ? s[n >> 1] : 0.5 * (s[n / 2 - 1] + s[n / 2]); };
  /** "128 Hz", "30 ms", "4.5 s" — the median spacing (LMNSolver.cadenceText). */
  function cadenceText(ts) {
    if (ts.length < 2) return "one sample";
    const d = [];
    for (let i = 1; i < ts.length; i++) if (ts[i] - ts[i - 1] > 0) d.push(ts[i] - ts[i - 1]);
    if (!d.length) return "one instant";
    d.sort((p, q) => p - q);
    const m = d[d.length >> 1];
    return m < 0.02 ? `${Math.round(1 / m)} Hz` : m < 1 ? `${Math.round(m * 1000)} ms` : `${m.toFixed(1)} s`;
  }
  /** HSODataClient.accumulationCenters: FPI moments restamped from accumulation START (CMAD §4.3.1.1) to center —
   *  each sample moves by half its local spacing, the smaller of the gaps either side, so a burst run inside fast
   *  survey keeps its 30/150 ms. */
  function accumulationCenters(v) {
    if (!v || v.length < 2) return v || [];
    return v.map((p, i) => {
      const prev = i > 0 ? p.t - v[i - 1].t : Infinity, next = i + 1 < v.length ? v[i + 1].t - p.t : Infinity, d = Math.min(prev, next);
      return { t: p.t + (isFinite(d) && d > 0 ? d / 2 : 0), x: p.x, y: p.y, z: p.z };
    });
  }
  /** HSODataClient.boxAverage: the fast series averaged over a box about each target time, the box's half-width the
   *  target's own half neighbor spacing (so burst stretches average over their own cadence). Non-finite samples skipped. */
  function boxAverage(src, target) {
    if (target.length < 2 || !src.length) return [];
    const xs = src.map(p => p.t), out = [];
    let lo = 0;
    for (let k = 0; k < target.length; k++) {
      const t = target[k], prev = k > 0 ? t - target[k - 1] : Infinity, next = k + 1 < target.length ? target[k + 1] - t : Infinity;
      const d = Math.min(prev, next), half = isFinite(d) ? d / 2 : 0.5;
      while (lo > 0 && xs[lo - 1] >= t - half) lo--;
      while (lo < xs.length && xs[lo] < t - half) lo++;
      let hi = lo, sx = 0, sy = 0, sz = 0, cnt = 0;
      while (hi < xs.length && xs[hi] <= t + half) { const p = src[hi]; if (finite3(p)) { sx += p.x; sy += p.y; sz += p.z; cnt++; } hi++; }
      out.push(cnt ? { t, x: sx / cnt, y: sy / cnt, z: sz / cnt } : { t, x: NaN, y: NaN, z: NaN });
    }
    return out;
  }

  // ───────────────────────── the methods (LMNMethods.swift) ─────────────────────────
  const METHODS = {
    mvaB: { title: "MVA-B", summary: "Variance of B: L the maximum, N the minimum.", citation: "Sonnerup & Cahill 1967; Sonnerup & Scheible 1998" },
    mvaBC: { title: "MVA-B, ⟨B⟩·N = 0", summary: "Variance of B with ⟨B⟩·N = 0 imposed: N the constrained minimum, L from MVA-B.", citation: "Sonnerup & Scheible 1998, §8.2.6" },
    mvaE: { title: "MVA-E", summary: "Variance of E in the layer's frame: N the maximum, M the minimum.", citation: "Paschmann et al. 1986; Sonnerup et al. 1987; ISSI SR-001 §8.4.2" },
    mfr: { title: "MFR (Faraday residue)", summary: "Minimizes the residue of Faraday's law for a moving 1-D layer: N and its speed u_N.", citation: "Khrabrov & Sonnerup 1998; Sonnerup et al. 2006 (corrected 2007)" },
    mvaEB: { title: "MVA-E N + MVA-B L", summary: "Joint variance: N from MVA-E, then L is MVA-B's maximum-variance direction rotated about N into place.", citation: "Mozer & Retinò 2007, Appendix A" },
    mvaVi: { title: "MVA-vᵢ", summary: "Variance of the ion velocity: L the maximum (the jet), N the minimum.", citation: "Genestreti et al. 2018, §3.1.2" },
    mvaVe: { title: "MVA-vₑ", summary: "Variance of the electron velocity: L the maximum (the jet), N the minimum.", citation: "Genestreti et al. 2018, §3.1.2" },
    mvaJ: { title: "MVA-J (FPI)", summary: "Variance of the FPI current: L the maximum, N the minimum.", citation: "Genestreti et al. 2018, §3.1.2" },
    mdd: { title: "MDD-B", summary: "Four-probe gradient of B: N the maximum, M the minimum (invariant) direction.", citation: "Shi et al. 2005; Denton et al. 2010", four: true },
    mddOffset: { title: "MDD-(B − ⟨ΔB⟩₀)", summary: "MDD after removing each probe's offset, measured over a quiet interval.", citation: "Genestreti et al. 2018, §3.1.4", four: true },
    mddPerturbed: { title: "MDD-δ∇B", summary: "MDD of ∇B − ⟨∇B⟩₀, which cancels constant calibration offsets.", citation: "Denton et al. 2010, 2012", four: true },
    hybridMVABMDD: { title: "MVA-B L + MDD N", summary: "L from MVA-B, N from MDD, each moved toward square by the other's eigenvalue ratio.", citation: "Denton et al. 2018, Appendix A", four: true },
    hybridTorbert: { title: "MDD N + J M", summary: "N from MDD; M the direction perpendicular to N in which the current is largest; L completes the triad.", citation: "Torbert et al. 2018, supplementary text", four: true },
    combined: { title: "Combined", summary: "Axes taken from two frames and made perpendicular.", citation: "Denton et al. 2018, Appendix A" },
  };
  const SINGLE = ["mvaB", "mvaBC", "mvaE", "mfr", "mvaEB", "mvaVi", "mvaVe", "mvaJ"];
  const FOUR = ["mdd", "mddOffset", "mddPerturbed", "hybridMVABMDD", "hybridTorbert"];
  const E_FIELD = { measured: "E (EDP)", electronConvection: "−vₑ×B", ionConvection: "−vᵢ×B" };
  const defaultOptions = () => ({ eField: "measured", frameSpeed: 0, quiet: null, gradientReference: null, averageGradient: false,
                                  currentFromCurlometer: false, currentPeak: true, smooth: 0 });
  /** LMNMethod.needs: what a solve reads — "b", "e", "ions", "electrons", "fourB", "quietB". */
  function needs(method, o) {
    o = Object.assign(defaultOptions(), o);
    const field = { measured: ["b", "e"], electronConvection: ["b", "electrons"], ionConvection: ["b", "ions"] }[o.eField];
    switch (method) {
      case "mvaB": case "mvaBC": return ["b"];
      case "mvaE": case "mfr": case "mvaEB": return field;
      case "mvaVi": return ["ions"];
      case "mvaVe": return ["electrons"];
      case "mvaJ": return ["ions", "electrons"];
      case "mdd": case "mddPerturbed": case "hybridMVABMDD": return ["fourB"];
      case "mddOffset": return o.quiet ? ["fourB", "quietB"] : ["fourB"];
      case "hybridTorbert": return o.currentFromCurlometer ? ["fourB"] : ["fourB", "ions", "electrons"];
      default: return [];
    }
  }
  /** LMNMethod.inputPanels: the figure's subplots a method reads (where its interval's handles belong). */
  function inputPanels(method, o) {
    o = Object.assign(defaultOptions(), o);
    const field = { measured: ["e"], electronConvection: ["ve", "b"], ionConvection: ["vi", "b"] }[o.eField];
    switch (method) {
      case "mvaE": return field.includes("b") || o.frameSpeed === 0 ? field : field.concat("b");
      case "mfr": case "mvaEB": return field.includes("b") ? field : field.concat("b");
      case "mvaVi": return ["vi"];
      case "mvaVe": return ["ve"];
      case "mvaJ": return ["jfpi"];
      case "hybridTorbert": return ["b", o.currentFromCurlometer ? "jcurl" : "jfpi"];
      default: return ["b"];
    }
  }

  // ───────────────────────── diagnostics bookkeeping ─────────────────────────
  const ratio = (a, b) => (b > 0 && isFinite(a) && isFinite(b) && isFinite(a / b) ? a / b : null);
  const SUBD = ["₀", "₁", "₂", "₃"];
  /** LMNSolver.axisRatios: each axis's separation from its neighbors, for the axis that took sorted eigenvalue
   *  roles[k]: the largest λ₁/λ₂, the smallest λ₂/λ₃, the middle the worse of the two. */
  function axisRatiosOf(lam, roles) {
    if (!lam || lam.length !== 3) return [null, null, null];
    const sep = (k) => {
      if (k === 0) return ratio(lam[0], lam[1]);
      if (k === 2) return ratio(lam[1], lam[2]);
      const a = ratio(lam[0], lam[1]), c = ratio(lam[1], lam[2]);
      return a != null && c != null ? Math.min(a, c) : a ?? c;
    };
    return roles.map(sep);
  }
  function diag(method, eigenvalues = [], unit = "", samples = 0) {
    return { method, eigenvalues, unit, samples, normalRatio: null, normalRatioLabel: null, tangentRatio: null, tangentRatioLabel: null,
             axisRatios: null, normalCone_deg: null, uN: null, uNError: null, stability_deg: null, spread_deg: null, calibrationFloor: null, notes: [] };
  }
  function fillRatios(d, lam, roles) {
    const r = axisRatiosOf(lam, roles);
    d.axisRatios = r; d.normalRatio = r[2];
    d.normalRatioLabel = roles[2] === 0 ? "λ₁/λ₂" : "λ₂/λ₃";
    const lo = Math.min(roles[0], roles[1]), hi = Math.max(roles[0], roles[1]);
    d.tangentRatio = ratio(lam[lo], lam[hi]);
    d.tangentRatioLabel = `λ${SUBD[lo + 1]}/λ${SUBD[hi + 1]}`;
  }
  /** eq. 8.23 of Sonnerup & Scheible 1998: |Δφᵢⱼ| = √( noise/(M−1) · (λᵢ + λⱼ − noise)/(λᵢ − λⱼ)² ) [rad]. */
  function coneRad(lam, i, j, m, noise) {
    const d = lam[i] - lam[j];
    if (!(m > 1) || d === 0 || !(noise >= 0)) return null;
    const v = noise / (m - 1) * (lam[i] + lam[j] - noise) / (d * d);
    return v >= 0 && isFinite(v) ? Math.sqrt(v) : null;
  }
  /** The normal's error-cone semi-axes [deg], toward L and toward M; a maximum-variance normal (MVA-E) uses λ₂ for the
   *  noise when tilting toward the intermediate eigenvector (§8.3.1). */
  function cones(lam, roles, samples) {
    const k = roles[2];
    const toward = (j) => { const noise = (k === 0 && j === 1) || (k === 1 && j === 0) ? lam[1] : lam[2]; const c = coneRad(lam, k, j, samples, noise); return c == null ? null : c * 180 / Math.PI; };
    const a = toward(roles[0]), b = toward(roles[1]);
    return a == null || b == null ? null : [a, b];
  }
  /** A frame object: axes in GSE, λ by axis, the interval, its source (a typed basis's label) and diagnostics. */
  function makeFrame(l, m, n, lambda, iv, d, source = null) {
    return { l, m, n, lambda, a: iv.a, b: iv.b, source, diagnostics: d };
  }
  /** LMNSolver.frame: the frame whose axes are eigenvectors `roles` = [L, M, N] index into (0 the largest), signed by
   *  the app's convention. */
  function frameOf(e, roles, iv, d) {
    let N = e.vectors[roles[2]], L = e.vectors[roles[0]];
    if (N[0] < 0) N = neg(N);
    if (L[2] < 0) L = neg(L);
    return makeFrame(L, cross(N, L), N, roles.map(k => e.values[k]), iv, d);
  }
  const fail = (reason) => ({ error: reason });

  // ───────────────────────── single spacecraft ─────────────────────────
  /** MVABFrame.compute: the variance matrix of B, L its maximum-variance direction and N the minimum, N_x ≥ 0, L_z ≥ 0,
   *  M = N × L. λ by axis (max, mid, min). */
  function mvabCompute(pts, iv) {
    if (pts.length < 8) return null;
    const e = eigen(covariance(pts.map(vec)).m);
    let L = e.vectors[0], N = e.vectors[2];
    if (N[0] < 0) N = neg(N);
    if (L[2] < 0) L = neg(L);
    return makeFrame(L, cross(N, L), N, e.values.slice(), iv, null);
  }
  function solveMVAB(inp, iv, clk) {
    const pts = inside(inp.b, iv);
    const f = mvabCompute(pts, iv);
    if (!f) return fail(`MVA-B needs at least 8 B vectors in the interval (found ${pts.length}).`);
    const d = diag("mvaB", f.lambda, "nT²", pts.length);
    fillRatios(d, f.lambda, [0, 1, 2]);
    d.normalCone_deg = cones(f.lambda, [0, 1, 2], pts.length);
    d.notes = [`${pts.length} B vectors at ${cadenceText(pts.map(p => p.t))}`];
    f.diagnostics = d;
    return { frame: f };
  }
  /** N: the variance of B minimized in the plane ⊥ ⟨B⟩ — the intermediate eigenvector of P·M·P, P = I − b̂b̂ᵀ (b̂ takes
   *  the zero eigenvalue). L: MVA-B's maximum-variance direction made perpendicular to that N. */
  function solveMVABC(inp, iv) {
    const pts = inside(inp.b, iv);
    if (pts.length < 8) return fail(`Needs at least 8 B vectors in the interval (found ${pts.length}).`);
    const { m, mean } = covariance(pts.map(vec)), bhat = unit(mean);
    if (!bhat) return fail("⟨B⟩ is zero, so ⟨B⟩·N = 0 does not define a plane.");
    const P = [0, 1, 2].map(i => [0, 1, 2].map(j => (i === j ? 1 : 0) - bhat[i] * bhat[j]));
    const c = eigen(matmul(matmul(P, m), P));
    let along = 0;
    for (let k = 1; k < 3; k++) if (Math.abs(dot(c.vectors[k], bhat)) > Math.abs(dot(c.vectors[along], bhat))) along = k;
    const rest = [0, 1, 2].filter(k => k !== along).sort((p, q) => c.values[q] - c.values[p]);
    let N = c.vectors[rest[1]];
    if (N[0] < 0) N = neg(N);
    const u = eigen(m);
    let L = unit(sub(u.vectors[0], scale(N, dot(u.vectors[0], N))));
    if (!L) return fail("MVA-B's maximum-variance direction lies along the constrained normal.");
    if (L[2] < 0) L = neg(L);
    const lmax = c.values[rest[0]], lmin = c.values[rest[1]];
    const d = diag("mvaBC", [lmax, lmin, 0], "nT²", pts.length);
    d.normalRatio = ratio(lmax, lmin); d.normalRatioLabel = "λ′max/λ′min";
    d.tangentRatio = ratio(u.values[0], u.values[1]); d.tangentRatioLabel = "λ₁/λ₂ (MVA-B)";
    d.axisRatios = [ratio(u.values[0], u.values[1]), null, d.normalRatio];
    d.notes = [`${pts.length} B vectors at ${cadenceText(pts.map(p => p.t))}`, `constraint ⟨B⟩·N = 0, |⟨B⟩| = ${norm(mean).toFixed(1)} nT; ⟨B⟩·N is zero by construction`];
    return { frame: makeFrame(L, cross(N, L), N, [u.values[0], lmax, lmin], iv, d) };
  }
  /** Variance of a velocity or current: L the maximum (the jet), N the minimum (Genestreti et al. 2018 §3.1.2). */
  function solveVariance(series, iv, method, unitText, what) {
    const pts = inside(series, iv);
    if (pts.length < 8) return fail(`${METHODS[method].title} needs at least 8 ${what} samples in the interval (found ${pts.length}) — burst FPI is 30 ms (DES) and 150 ms (DIS).`);
    const e = eigen(covariance(pts.map(vec)).m);
    const d = diag(method, e.values, unitText, pts.length);
    fillRatios(d, e.values, [0, 1, 2]);
    d.normalCone_deg = cones(e.values, [0, 1, 2], pts.length);
    d.notes = [`${pts.length} ${what} samples at ${cadenceText(pts.map(p => p.t))}, accumulation centers`];
    return { frame: frameOf(e, [0, 1, 2], iv, d) };
  }
  /** E and B on one grid, the coarser of the two: the denser series box-averaged onto the sparser one's samples. */
  function pairedEB(e, b, iv) {
    const ein = inside(e, iv), bin = inside(b, iv);
    if (ein.length < 3 || bin.length < 3) return null;
    const es = [], bs = [];
    let note;
    if (ein.length >= bin.length) {
      const avg = boxAverage(e, bin.map(p => p.t));
      avg.forEach((q, i) => { if (finite3(q)) { es.push(vec(q)); bs.push(vec(bin[i])); } });
      note = `E (EDP, ${cadenceText(ein.map(p => p.t))}) averaged onto ${es.length} FGM samples at ${cadenceText(bin.map(p => p.t))}`;
    } else {
      const avg = boxAverage(b, ein.map(p => p.t));
      avg.forEach((q, i) => { if (finite3(q)) { es.push(vec(ein[i])); bs.push(vec(q)); } });
      note = `B averaged onto ${es.length} EDP samples at ${cadenceText(ein.map(p => p.t))}`;
    }
    return es.length >= 3 ? { e: es, b: bs, note } : null;
  }
  /** E (or −v × B) and B on one grid over iv, with the words for how. */
  function electricField(inp, iv, o) {
    if (o.eField === "measured") return pairedEB(inp.e, inp.b, iv);
    const v = o.eField === "electronConvection" ? inp.ve : inp.vi, vin = inside(v, iv);
    if (vin.length < 8 || !inp.b || inp.b.length < 2) return null;
    const bAvg = boxAverage(inp.b, vin.map(p => p.t)), es = [], bs = [];
    vin.forEach((vv, i) => {
      const bb = bAvg[i];
      if (!finite3(bb)) return;
      es.push(scale(cross(vec(vv), vec(bb)), -0.001));     // km/s · nT = 10⁻³ mV/m
      bs.push(vec(bb));
    });
    if (es.length < 8) return null;
    const who = o.eField === "electronConvection" ? "−vₑ×B on the DES grid" : "−vᵢ×B on the DIS grid";
    return { e: es, b: bs, note: `${who} (${es.length} samples at ${cadenceText(vin.map(p => p.t))}, B averaged over each accumulation)` };
  }
  function missingE(inp, iv, o) {
    if (o.eField === "measured") { const n = inside(inp.e, iv).length; return n === 0 ? "No EDP electric field in the interval." : `Too few E and B samples to pair (${n} E).`; }
    return o.eField === "electronConvection" ? "Too few DES velocities in the interval for −vₑ×B." : "Too few DIS velocities in the interval for −vᵢ×B.";
  }
  /** MVA-E (ISSI SR-001 §8.4.2): the maximum-variance eigenvector of E′ = E + u n̂ × B is N. With u ≠ 0, n̂ is in E′
   *  itself, so the solve iterates to a fixed point, each n̂ kept on the side of the first. */
  function mvaECore(e, b, u) {
    if (e.length < 3) return null;
    let n = null, last = null, it = 0;
    while (it < 80) {
      it++;
      const ep = n && u !== 0 ? e.map((E, i) => add(E, scale(cross(n, b[i]), 0.001 * u))) : e;
      const eg = eigen(covariance(ep).m);
      last = eg;
      let nn = eg.vectors[0];
      if (n) { if (dot(nn, n) < 0) nn = neg(nn); } else if (nn[0] < 0) nn = neg(nn);
      const done = n ? angleRad(n, nn) < 1e-10 : u === 0;
      n = nn;
      if (done) break;
    }
    return n && last ? { eig: last, n, iterations: it } : null;
  }
  function solveMVAE(inp, iv, o) {
    const f = electricField(inp, iv, o);
    if (!f) return fail(missingE(inp, iv, o));
    const r = mvaECore(f.e, f.b, o.frameSpeed);
    if (!r) return fail("MVA-E needs at least 3 E vectors in the interval.");
    // N the maximum (index 0), L the intermediate (1), M the minimum (2).
    const d = diag("mvaE", r.eig.values, "(mV/m)²", f.e.length);
    fillRatios(d, r.eig.values, [1, 2, 0]);
    d.normalCone_deg = cones(r.eig.values, [1, 2, 0], f.e.length);
    d.notes = [f.note, o.frameSpeed === 0 ? "spacecraft frame (u = 0)" : `frame moving at u = ${sgn(o.frameSpeed, 1)} km/s along N (E′ = E + u N×B), ${r.iterations} iterations`];
    const eg = { values: r.eig.values, vectors: [r.n, r.eig.vectors[1], r.eig.vectors[2]] };
    return { frame: frameOf(eg, [1, 2, 0], iv, d) };
  }
  /** The Faraday residue matrix (Sonnerup et al. 2006, eq. 26 AS CORRECTED in 2007, and eq. 28):
   *  Q = −⟨δE δEᵀ⟩ + I ⟨|δE|²⟩ − P Pᵀ / ⟨|δB|²⟩, P = ⟨δE × δB⟩, U* = P / ⟨|δB|²⟩ — E [mV/m] and B [nT] make U* in
   *  (mV/m)/nT = 10³ km/s. The 2006 print divided every term by ⟨|δB|²⟩. */
  function mfrMatrix(e, b) {
    const n = e.length;
    let me = [0, 0, 0], mb = [0, 0, 0];
    for (let i = 0; i < n; i++) { me = add(me, e[i]); mb = add(mb, b[i]); }
    me = scale(me, 1 / n); mb = scale(mb, 1 / n);
    const ee = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    let p = [0, 0, 0], e2 = 0, b2 = 0;
    for (let i = 0; i < n; i++) {
      const dE = sub(e[i], me), dB = sub(b[i], mb);
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) ee[r][c] += dE[r] * dE[c];
      p = add(p, cross(dE, dB)); e2 += dot(dE, dE); b2 += dot(dB, dB);
    }
    p = scale(p, 1 / n); e2 /= n; b2 /= n;
    const q = [0, 1, 2].map(r => [0, 1, 2].map(c => -ee[r][c] / n + (r === c ? e2 : 0) - (b2 > 0 ? p[r] * p[c] / b2 : 0)));
    return { q, uStar: b2 > 0 ? scale(p, 1000 / b2) : [0, 0, 0] };
  }
  /** The minimum Faraday residue: N the minimum eigenvector; L the maximum and M the intermediate, as Genestreti et al.
   *  (2018, §3.1.3) assign them; u_N = U*·N with its error from the cone (Sonnerup et al. 2006 eq. A1, A3). */
  function solveMFR(inp, iv, o) {
    const f = electricField(inp, iv, o);
    if (!f) return fail(missingE(inp, iv, o));
    if (f.e.length < 8) return fail("MFR needs at least 8 paired E and B samples.");
    const q = mfrMatrix(f.e, f.b), eg = eigen(q.q);
    const d = diag("mfr", eg.values, "(mV/m)²", f.e.length);
    fillRatios(d, eg.values, [0, 1, 2]);
    const fr = frameOf(eg, [0, 1, 2], iv, d);
    d.uN = dot(q.uStar, fr.n);
    const c13 = coneRad(eg.values, 2, 0, f.e.length, eg.values[2]), c23 = coneRad(eg.values, 2, 1, f.e.length, eg.values[2]);
    if (c13 != null && c23 != null) {
      d.normalCone_deg = [c13 * 180 / Math.PI, c23 * 180 / Math.PI];
      const a = c13 * dot(eg.vectors[0], q.uStar), bb = c23 * dot(eg.vectors[1], q.uStar);
      d.uNError = Math.hypot(a, bb);
    }
    d.notes = [f.note, `U* = (${q.uStar.map(x => sgn(x, 1)).join(", ")}) km/s`];
    return { frame: fr };
  }
  /** Mozer & Retinò (2007, Appendix A)'s joint variance: N the MVA-E normal, then rotated about N until L is closest to
   *  MVA-B's maximum-variance direction — projecting MVA-B's L onto the plane ⊥ N. */
  function solveMVAEB(inp, iv, o) {
    const f = electricField(inp, iv, o);
    if (!f) return fail(missingE(inp, iv, o));
    const r = mvaECore(f.e, f.b, o.frameSpeed);
    if (!r) return fail("MVA-E needs at least 3 E vectors in the interval.");
    const pts = inside(inp.b, iv);
    if (pts.length < 8) return fail(`Needs at least 8 B vectors in the interval (found ${pts.length}).`);
    const N = r.n, mb = eigen(covariance(pts.map(vec)).m);
    let Lb = mb.vectors[0];
    if (Lb[2] < 0) Lb = neg(Lb);
    const pr = perpendicular(N, Lb, 0);
    if (!pr) return fail("MVA-B's L lies within 1° of the MVA-E normal.");
    let L = pr.second;
    if (L[2] < 0) L = neg(L);
    const d = diag("mvaEB", r.eig.values, "(mV/m)²", f.e.length);
    d.normalRatio = ratio(r.eig.values[0], r.eig.values[1]); d.normalRatioLabel = "λ₁/λ₂ (MVA-E)";
    d.tangentRatio = ratio(mb.values[0], mb.values[1]); d.tangentRatioLabel = "λ₁/λ₂ (MVA-B)";
    d.axisRatios = [d.tangentRatio, null, d.normalRatio];
    d.normalCone_deg = cones(r.eig.values, [1, 2, 0], f.e.length);
    d.notes = [f.note, `L: MVA-B's maximum-variance direction (${pts.length} B vectors), rotated ${pr.movedSecond.toFixed(2)}° about N`,
               o.frameSpeed === 0 ? "spacecraft frame (u = 0)" : `frame u = ${sgn(o.frameSpeed, 1)} km/s along N`];
    return { frame: makeFrame(L, cross(N, L), N, [0, 0, 0], iv, d) };
  }

  // ───────────────────────── combining two frames ─────────────────────────
  /** Rotate u and w toward (or away from) each other in their common plane until they are perpendicular; u takes
   *  `shareFirst` of the turn. null within 1° of parallel. */
  function perpendicular(u, w, s) {
    const c = Math.max(-1, Math.min(1, dot(u, w))), theta = Math.acos(c);
    const uP = unit(sub(w, scale(u, c))), wP = unit(sub(u, scale(w, c)));
    if (!(Math.sin(theta) > Math.sin(Math.PI / 180)) || !uP || !wP) return null;
    const dTheta = theta - Math.PI / 2, a = s * dTheta, b = (1 - s) * dTheta;
    const u2 = add(scale(u, Math.cos(a)), scale(uP, Math.sin(a)));
    let w2 = add(scale(w, Math.cos(b)), scale(wP, Math.sin(b)));
    w2 = unit(sub(w2, scale(u2, dot(w2, u2)))) || w2;
    return { first: unit(u2) || u2, second: w2, movedFirst: Math.abs(a) * 180 / Math.PI, movedSecond: Math.abs(b) * 180 / Math.PI, angle: theta * 180 / Math.PI };
  }
  const AX = { l: 0, m: 1, n: 2 };
  /** A frame's [L, M, N] separation ratios; for a frame without diagnostics, the MVA-B reading of λ. */
  function frameAxisRatios(f) {
    const r = f.diagnostics && f.diagnostics.axisRatios;
    if (r && r.length === 3) return r;
    if (f.source || !f.lambda || f.lambda.length !== 3) return [null, null, null];
    return axisRatiosOf(f.lambda, [0, 1, 2]);
  }
  /** LMNSolver.combine: axis `a` of fa and axis `b` of fb, made perpendicular, the third by the right-hand rule
   *  (L × M = N). rule "keepFirst" | "keepSecond" | "weighted" — each axis rotating by the OTHER's share of the two
   *  separation ratios (Denton et al. 2018, Appendix A). Signs are the inputs' own. */
  function combine(a, fa, b, fb, rule, clk = defaultClock) {
    if (a === b) return fail(`Pick two different axes — ${a.toUpperCase()} from both says nothing about the third.`);
    const u = fa[a], w = fb[b], ru = frameAxisRatios(fa)[AX[a]], rw = frameAxisRatios(fb)[AX[b]];
    let share;
    if (rule === "keepFirst") share = 0;
    else if (rule === "keepSecond") share = 1;
    else {
      if (!(ru > 0) || !(rw > 0)) return fail("Weighting needs both axes' eigenvalue ratios — a typed or combined axis has none. Keep one exactly instead.");
      share = rw / (ru + rw);
    }
    const pr = perpendicular(u, w, share);
    if (!pr) return fail("Those two axes are within 1° of parallel, so they cannot both be axes of one frame.");
    const ax = { l: null, m: null, n: null };
    ax[a] = pr.first; ax[b] = pr.second;
    const set = [a, b].sort().join("");
    if (set === "ln") ax.m = cross(ax.n, ax.l);
    else if (set === "mn") ax.l = cross(ax.m, ax.n);
    else ax.n = cross(ax.l, ax.m);
    const d = diag("combined");
    const ratios = [null, null, null];
    ratios[AX[a]] = ru; ratios[AX[b]] = rw;
    d.axisRatios = ratios;
    if (a === "n") { d.normalRatio = ru; d.normalRatioLabel = ratioLabel(fa); }
    if (b === "n") { d.normalRatio = rw; d.normalRatioLabel = ratioLabel(fb); }
    const describe = (x, f, moved) => `${x.toUpperCase()} from ${f.source || methodTitle(f)} ${clk(f.a)}–${clk(f.b)}, moved ${moved.toFixed(2)}°`;
    const RULE = { keepFirst: "keep the first exactly", keepSecond: "keep the second exactly", weighted: "weight by eigenvalue ratios" };
    d.notes = [describe(a, fa, pr.movedFirst), describe(b, fb, pr.movedSecond), `their angle was ${pr.angle.toFixed(2)}°; ${RULE[rule] || rule}`];
    return { frame: makeFrame(ax.l, ax.m, ax.n, [0, 0, 0], { a: Math.min(fa.a, fb.a), b: Math.max(fa.b, fb.b) }, d) };
  }

  // ───────────────────────── stability over nested intervals ─────────────────────────
  /** Mean angle of each axis from its average over the seven intervals 2^(k/3) × iv (k = −3…3) about iv's center —
   *  Denton et al. (2018) Table 3's "mean deviation from the average direction". [L, M, N] in degrees. */
  function nestStability(iv, main, solveSub) {
    const c = (iv.a + iv.b) / 2, dur = iv.b - iv.a, frames = [main];
    for (const k of [-3, -2, -1, 1, 2, 3]) {
      const half = dur * 2 ** (k / 3) / 2, f = solveSub({ a: c - half, b: c + half });
      if (f) frames.push(f);
    }
    if (frames.length < 4) return null;
    return ["l", "m", "n"].map(kp => {
      const ref = main[kp], al = frames.map(f => (dot(f[kp], ref) < 0 ? neg(f[kp]) : f[kp]));
      const avg = unit(al.reduce(add, [0, 0, 0])) || ref;
      return al.reduce((s, v) => s + angleRad(v, avg) * 180 / Math.PI, 0) / al.length;
    });
  }

  // ───────────────────────── four spacecraft (LMNSolver+Four.swift) ─────────────────────────
  /** A sorted series for interpolation by time (LMNSolver.Track): linear between samples, none across a gap of more
   *  than maxGap (default three median spacings). */
  function Track(pts, maxGap) {
    const s = (pts || []).filter(finite3).slice().sort((p, q) => p.t - q.t);
    const t = Float64Array.from(s, p => p.t), v = s.map(vec);
    if (maxGap == null) { const d = []; for (let i = 1; i < t.length; i++) if (t[i] > t[i - 1]) d.push(t[i] - t[i - 1]); d.sort((p, q) => p - q); maxGap = d.length ? 3 * d[d.length >> 1] : 0; }
    return {
      t, v, maxGap,
      at(x) {
        if (t.length < 2 || x < t[0] || x > t[t.length - 1]) return null;
        let lo = 0, hi = t.length - 1;
        while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (t[mid] <= x) lo = mid; else hi = mid; }
        const dt = t[hi] - t[lo];
        if (dt > maxGap) return null;
        const f = dt > 0 ? (x - t[lo]) / dt : 0;
        return [0, 1, 2].map(c => v[lo][c] + (v[hi][c] - v[lo][c]) * f);
      },
      mean(x, half) {
        let lo = 0, hi = t.length;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (t[mid] < x - half) lo = mid + 1; else hi = mid; }
        const s2 = [0, 0, 0];
        let n = 0;
        for (let i = lo; i < t.length && t[i] <= x + half; i++) { s2[0] += v[i][0]; s2[1] += v[i][1]; s2[2] += v[i][2]; n++; }
        return n ? scale(s2, 1 / n) : null;
      },
    };
  }
  /** The four probes' B on the first probe's samples inside iv — interpolated, or box-averaged over smooth s — less
   *  offsets, MEC positions interpolated (gaps up to 120 s), and the gradient at each instant. */
  function gradients(probes, iv, smooth = 0, offsets = {}) {
    if (!probes || probes.length < 4) return [];
    const bt = probes.map(p => Track(p.b)), rt = probes.map(p => Track(p.r, 120));
    const grid = inside(probes[0].b, iv).map(p => p.t), out = [];
    for (const x of grid) {
      const rs = [], bs = [];
      for (let i = 0; i < probes.length; i++) {
        let b = smooth > 0 ? bt[i].mean(x, smooth / 2) : bt[i].at(x);
        const r = rt[i].at(x);
        if (!b || !r) break;
        const o = offsets[probes[i].probe];
        if (o) b = sub(b, o);
        rs.push(r); bs.push(b);
      }
      if (rs.length !== probes.length) continue;
      const g = linearGradient(rs, bs);
      if (!g) continue;
      let dsum = 0, pairs = 0;
      for (let a = 0; a < rs.length; a++) for (let b = a + 1; b < rs.length; b++) { dsum += norm(sub(rs[a], rs[b])); pairs++; }
      out.push({ t: x, g, sep: dsum / Math.max(1, pairs) });
    }
    return out;
  }
  /** Each probe's mean offset from the four-probe mean B over q (Genestreti et al. 2018: ⟨ΔB⟩₀). */
  function quietOffsets(probes, q) {
    if (!probes || probes.length < 4) return null;
    const bt = probes.map(p => Track(p.b)), sums = probes.map(() => [0, 0, 0]);
    let n = 0;
    for (const p of inside(probes[0].b, q)) {
      const bs = bt.map(T => T.at(p.t)).filter(Boolean);
      if (bs.length !== probes.length) continue;
      const mean = scale(bs.reduce(add, [0, 0, 0]), 1 / bs.length);
      bs.forEach((b, i) => { sums[i] = add(sums[i], sub(b, mean)); });
      n++;
    }
    if (n < 3) return null;
    const out = {};
    probes.forEach((p, i) => { out[p.probe] = scale(sums[i], 1 / n); });
    return { offsets: out, instants: n };
  }
  /** Shi's matrix GᵀG: [i][j] = Σ_c ∂B_c/∂x_i ∂B_c/∂x_j. */
  const shi = (g) => [0, 1, 2].map(i => [0, 1, 2].map(j => g[0][i] * g[0][j] + g[1][i] * g[1][j] + g[2][i] * g[2][j]));
  function meanMatrix(ms) {
    const s = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], n = Math.max(1, ms.length);
    for (const m of ms) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) s[i][j] += m[i][j] / n;
    return s;
  }
  function solveFour(method, inp, iv, o, clk) {
    const have = new Set((inp.probes || []).filter(p => p.b && p.b.length >= 2 && p.r && p.r.length >= 2).map(p => p.probe));
    if (have.size !== 4) {
      const missing = [1, 2, 3, 4].filter(k => !have.has(k)).map(k => `MMS${k}`).join(", ");
      return fail(`${METHODS[method].title} needs all four probes' B and MEC positions — missing ${missing}.`);
    }
    let offsets = {};
    const notes = [];
    if (method === "mddOffset") {
      const q = o.quiet;
      if (!q) return fail("Set a quiet interval — minutes where the four probes should read the same B.");
      const off = quietOffsets(inp.quietProbes && inp.quietProbes.length ? inp.quietProbes : inp.probes, q);
      if (!off) return fail(`The quiet interval ${clk(q.a)}–${clk(q.b)} has no instant with all four probes' B.`);
      offsets = off.offsets;
      const worst = Math.max(0, ...Object.values(off.offsets).map(norm));
      notes.push(`offsets from the four-probe mean over ${clk(q.a)}–${clk(q.b)} (${off.instants} instants), largest |ΔB₀| = ${worst.toFixed(3)} nT, removed`);
    }
    const gs = gradients(inp.probes, iv, o.smooth, offsets);
    if (gs.length < 3) return fail(`Only ${gs.length} instants in the interval with all four probes' B and positions.`);
    const sep = gs.reduce((s, g) => s + g.sep, 0) / gs.length;
    notes.unshift(`${gs.length} four-probe instants at ${cadenceText(gs.map(g => g.t))}, mean separation ${sep.toFixed(1)} km` + (o.smooth > 0 ? `, B boxcar ${o.smooth.toFixed(2)} s` : ""));
    if (method === "hybridMVABMDD") return hybridDenton(gs, inp, iv, notes);
    if (method === "hybridTorbert") return hybridTorbert(gs, inp, iv, o, notes, clk);
    return mddFrame(method, gs, inp, iv, o, notes, offsets, clk);
  }
  function mddFrame(method, gs, inp, iv, o, notes, offsets, clk) {
    let mats, matrix;
    if (method === "mddPerturbed") {
      // δG = G − ⟨G⟩₀ (Denton et al. 2010 §3.2): a constant calibration offset is a constant gradient, and it cancels.
      const ref = o.gradientReference || iv, same = ref.a === iv.a && ref.b === iv.b;
      const refSamples = same ? gs : gradients(inp.probes, ref, o.smooth, offsets);
      if (refSamples.length < 3) return fail(`The ⟨∇B⟩₀ interval ${clk(ref.a)}–${clk(ref.b)} has no four-probe instants.`);
      const g0 = meanMatrix(refSamples.map(s => s.g));
      mats = gs.map(s => shi(s.g.map((row, c) => row.map((x, k) => x - g0[c][k]))));
      matrix = meanMatrix(mats);
      notes.push(same ? "⟨∇B⟩₀ over the same interval" : `⟨∇B⟩₀ over ${clk(ref.a)}–${clk(ref.b)} (${refSamples.length} instants)`);
    } else {
      mats = gs.map(s => shi(s.g));
      if (o.averageGradient) { matrix = shi(meanMatrix(gs.map(s => s.g))); notes.push("gradient averaged before forming ∇B(∇B)ᵀ"); }
      else matrix = meanMatrix(mats);
    }
    const e = eigen(matrix), d = diag(method, e.values, "(nT/km)²", gs.length);
    fillRatios(d, e.values, [1, 2, 0]);
    const f = frameOf(e, [1, 2, 0], iv, d);
    // how far the instantaneous maximum-gradient direction wanders from N
    d.spread_deg = mats.reduce((s, m) => s + lineAngle(eigen(m).vectors[0], f.n), 0) / mats.length;
    const sep = gs.reduce((s, g) => s + g.sep, 0) / gs.length;
    d.calibrationFloor = (0.1 / sep) ** 2;
    notes.push(`λ₀ = (0.1 nT/d)² = ${d.calibrationFloor.toPrecision(2)} (nT/km)²`);
    d.notes = notes;
    return { frame: f };
  }
  /** Denton et al. (2018) Appendix A: L′ the maximum-variance direction of the four probes' B concatenated, N′ the
   *  MDD maximum; N′ rotates toward L″ = M × N′ by dθ·r_L/(r_L + r_N), dθ = ∠(N′, L′) − 90°, r the λ₁/λ₂ of each. */
  function hybridDenton(gs, inp, iv, notes) {
    const all = inp.probes.flatMap(p => inside(p.b, iv)).map(vec);
    if (all.length < 8) return fail("Too few B vectors in the interval for MVA-B.");
    const mv = eigen(covariance(all).m), md = eigen(meanMatrix(gs.map(s => shi(s.g))));
    let Lp = mv.vectors[0], Np = md.vectors[0];
    if (Lp[2] < 0) Lp = neg(Lp);
    if (Np[0] < 0) Np = neg(Np);
    const rL = ratio(mv.values[0], mv.values[1]), rN = ratio(md.values[0], md.values[1]);
    if (rL == null || rN == null) return fail("An eigenvalue is zero, so the weights are undefined.");
    const pr = perpendicular(Np, Lp, rL / (rL + rN));
    if (!pr) return fail("MVA-B's L and MDD's N are within 1° of parallel.");
    const N = pr.first, L = pr.second, M = cross(N, L);
    const d = diag("hybridMVABMDD", md.values, "(nT/km)²", gs.length);
    d.normalRatio = rN; d.normalRatioLabel = "λ₁/λ₂ (MDD)";
    d.tangentRatio = rL; d.tangentRatioLabel = "λ₁/λ₂ (MVA-B)";
    d.axisRatios = [rL, null, rN];
    const g3 = (x) => x.toPrecision(3);
    d.notes = notes.concat([
      `L′: MVA-B of ${all.length} B vectors from the four probes, λ = ${mv.values.map(g3).join(", ")} nT²`,
      `N′: MDD, λ = ${md.values.map(g3).join(", ")} (nT/km)²`,
      `∠(N′, L′) = ${pr.angle.toFixed(2)}°; N′ moved ${pr.movedFirst.toFixed(2)}°, L′ ${pr.movedSecond.toFixed(2)}°`,
    ]);
    return { frame: makeFrame(L, M, N, [0, 0, 0], iv, d) };
  }
  /** Torbert et al. (2018, supplementary text): N the maximum directional derivative of B; M ⊥ N "which maximizes the
   *  magnitude of the reconnecting current" — with currentPeak, along the sample whose current ⊥ N is largest, else
   *  the interval's mean current; L = M × N. */
  function hybridTorbert(gs, inp, iv, o, notes, clk) {
    const md = eigen(meanMatrix(gs.map(s => shi(s.g))));
    let N = md.vectors[0];
    if (N[0] < 0) N = neg(N);
    const kJ = 1e-12 / (4 * Math.PI * 1e-7) * 1e6;           // nT/km → µA/m²
    let series, how;
    if (o.currentFromCurlometer) {
      series = gs.map(s => ({ t: s.t, j: scale([s.g[2][1] - s.g[1][2], s.g[0][2] - s.g[2][0], s.g[1][0] - s.g[0][1]], kJ) }));
      how = "the curlometer";
    } else {
      series = inside(inp.j, iv).map(p => ({ t: p.t, j: vec(p) }));
      how = `FPI ${inp.label || ""}`.trim();
    }
    if (series.length < (o.currentPeak ? 1 : 3)) return fail(`Too few current samples in the interval from ${how}.`);
    const perp = (j) => sub(j, scale(N, dot(j, N)));
    let J, which;
    if (o.currentPeak) {
      const pk = series.reduce((m, s) => (norm(perp(s.j)) > norm(perp(m.j)) ? s : m), series[0]);
      J = pk.j; which = `the largest current ⊥ N, ${norm(perp(pk.j)).toFixed(3)} µA/m² at ${clk(pk.t)},`;
    } else {
      J = scale(series.reduce((s, x) => add(s, x.j), [0, 0, 0]), 1 / series.length);
      which = "the mean current over the interval,";
    }
    const M = unit(perp(J));
    if (!M) return fail("The current lies along N, so it gives no M.");
    const L = cross(M, N);
    const d = diag("hybridTorbert", md.values, "(nT/km)²", gs.length);
    d.normalRatio = ratio(md.values[0], md.values[1]); d.normalRatioLabel = "λ₁/λ₂ (MDD)";
    d.axisRatios = [null, null, d.normalRatio];
    d.notes = notes.concat([`M along ${which} J = (${J.map(x => sgn(x, 3)).join(", ")}) µA/m² from ${how}`]);
    return { frame: makeFrame(L, M, N, [0, 0, 0], iv, d) };
  }

  // ───────────────────────── entry point ─────────────────────────
  const sgn = (x, k) => `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(k)}`;
  const defaultClock = (t) => `${t.toFixed(3)} s`;
  /** LMNSolver.solve: `method` over iv = {a, b}. With stability, the method is re-run over seven intervals from 0.5× to
   *  2× iv about its center (Denton et al. 2018, Table 3) — the inputs should cover 2× iv for that.
   *  inp: { b, e, vi, ve, j, probes: [{probe, b, r}], quietProbes, label, clock(t) → "HH:MM:SS.sss" }.
   *  Returns { frame } or { error }. */
  function solve(method, inp, iv, opts = {}, stability = true) {
    const o = Object.assign(defaultOptions(), opts), clk = inp.clock || defaultClock;
    let r;
    switch (method) {
      case "mvaB": r = solveMVAB(inp, iv, clk); break;
      case "mvaBC": r = solveMVABC(inp, iv); break;
      case "mvaE": r = solveMVAE(inp, iv, o); break;
      case "mfr": r = solveMFR(inp, iv, o); break;
      case "mvaEB": r = solveMVAEB(inp, iv, o); break;
      case "mvaVi": r = solveVariance(inp.vi, iv, "mvaVi", "(km/s)²", "vᵢ (DIS)"); break;
      case "mvaVe": r = solveVariance(inp.ve, iv, "mvaVe", "(km/s)²", "vₑ (DES)"); break;
      case "mvaJ": r = solveVariance(inp.j, iv, "mvaJ", "(µA/m²)²", "J = nₑe(vᵢ − vₑ)"); break;
      case "mdd": case "mddOffset": case "mddPerturbed": case "hybridMVABMDD": case "hybridTorbert": r = solveFour(method, inp, iv, o, clk); break;
      case "combined": return fail("A combined frame is made from two frames, not solved.");
      default: return fail(`Unknown method ${method}.`);
    }
    if (!stability || !r.frame) return r;
    const st = nestStability(iv, r.frame, (s) => { const g = solve(method, inp, s, o, false); return g.frame || null; });
    r.frame.diagnostics.stability_deg = st;
    return r;
  }
  /** LMNSolver.compare: every method over the same interval and inputs, each on its own — results only, no ranking. */
  const compare = (methods, inp, iv, opts) => methods.map(m => Object.assign({ method: m }, solve(m, inp, iv, opts)));

  // ───────────────────────── frames: names, flips, typed bases ─────────────────────────
  const methodOf = (f) => (f.source ? null : (f.diagnostics && f.diagnostics.method) || "mvaB");
  const methodTitle = (f) => { const m = methodOf(f); return m ? METHODS[m].title : "entered"; };
  const ratioLabel = (f) => (f.diagnostics && f.diagnostics.normalRatioLabel) || "λ₂/λ₃";
  /** MVABFrame.ratio: the eigenvalue ratio that says how well N is determined. */
  const frameRatio = (f) => { const r = f.diagnostics && f.diagnostics.normalRatio; if (r != null) return r; return f.lambda && f.lambda[2] > 0 ? f.lambda[1] / f.lambda[2] : null; };
  /** MVABFrame.flipped: L and/or N reversed — and M with whichever one alone, so L × M = N still holds. Quantities
   *  along N follow (MFR's u_N). */
  function flipped(f, flipL, flipN) {
    const d = f.diagnostics ? JSON.parse(JSON.stringify(f.diagnostics)) : null;
    if (d && flipN && d.uN != null) d.uN = -d.uN;
    if (d && (flipL || flipN)) d.notes.push([flipL ? "L" : null, flipN ? "N" : null].filter(Boolean).join(" and ") + " reversed from the solver's signs");
    return Object.assign({}, f, { l: flipL ? neg(f.l) : f.l, n: flipN ? neg(f.n) : f.n, m: flipL !== flipN ? neg(f.m) : f.m, diagnostics: d });
  }
  /** A unit axis to build a triad against: whichever of GSE Z, Y, X is least parallel to v. */
  const leastAligned = (v) => [[0, 0, 1], [0, 1, 0], [1, 0, 0]].reduce((best, c) => (Math.abs(dot(c, v)) < Math.abs(dot(best, v)) ? c : best));
  /** MVABFrame.custom: a hand-entered basis — any subset of the three axes, orthonormalized N → L → M = N × L (N kept
   *  exactly). null when the axes cannot span a basis (a zero vector, or two given axes within 1° of parallel). */
  function custom(l, m, n, label, iv) {
    const nz = (v) => (v && v.length === 3 && v.every(isFinite) && norm(v) > 1e-12 ? scale(v, 1 / norm(v)) : null);
    const reject = (v, axis) => nz(sub(v, scale(axis, dot(v, axis))));
    let N = nz(n);
    const L = nz(l), M = nz(m);
    if (!N && !L && !M) return null;
    if (!N) N = L && M ? nz(cross(L, M)) : nz(cross(L || M, leastAligned(L || M)));
    if (!N) return null;
    const LL = L ? reject(L, N) : M ? reject(cross(M, N), N) : reject(leastAligned(N), N);
    if (!LL) return null;
    if (L && Math.abs(dot(L, N)) > Math.cos(Math.PI / 180)) return null;
    return makeFrame(LL, cross(N, LL), N, [0, 0, 0], iv, null, label);
  }
  /** How far a typed basis was from orthonormal before it was repaired [deg]; null with fewer than two axes. */
  function orthogonalityError(l, m, n) {
    const nz = (v) => (v && v.length === 3 && v.every(isFinite) && norm(v) > 1e-12 ? scale(v, 1 / norm(v)) : null);
    const axes = [nz(l), nz(m), nz(n)].filter(Boolean);
    if (axes.length < 2) return null;
    let worst = 0;
    for (let i = 0; i < axes.length; i++) for (let j = i + 1; j < axes.length; j++) worst = Math.max(worst, Math.abs(90 - Math.acos(Math.max(-1, Math.min(1, dot(axes[i], axes[j])))) * 180 / Math.PI));
    return worst;
  }

  const api = {
    METHODS, SINGLE, FOUR, E_FIELD, defaultOptions, needs, inputPanels,
    solve, compare, combine, perpendicular, flipped, custom, orthogonalityError,
    methodOf, methodTitle, ratioLabel, frameRatio, frameAxisRatios, axisRatiosOf, mfrMatrix, mvabCompute,
    accumulationCenters, boxAverage, cadenceText, gradients, quietOffsets,
    math: { dot, cross, add, sub, scale, neg, norm, unit, angleRad, lineAngle, matmul, matvec, symmetricEigen, eigen, svd, nullSpace, invert3, identity, linearGradient, covariance, median },
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.HeliosLMN = api;
})(typeof window !== "undefined" ? window : globalThis);
