#!/usr/bin/env node
/* The LMN methods (js/lmn.js) against the numbers of the Mac app's own tests — LMNMethodsTests.swift and
 * CustomLMNTests.swift in MMSTrackerCore — which check them against published values:
 *   - the 16-sample AMPTE/IRM magnetopause crossing of 19 October 1984, printed for this purpose in Sonnerup & Scheible
 *     (1998), ISSI SR-001 ch. 8, Table 8.4 (MVA-B, Fig. 8.2; ⟨B⟩·n = 0, Table 8.1; MVA-E on −v×B, Table 8.3; the
 *     Terasawa normal, §8.4.2, for MFR; the error cones of §8.3.1);
 *   - Sonnerup et al. (2007)'s corrected eq. 26 on a hand-made pair;
 *   - Genestreti et al. (2018) Table A1 row 14 from rows 8 and 10; Denton et al. (2018) Appendix A; Mozer & Retinò
 *     (2007) Appendix A;
 *   - four probes on a synthetic X line (MDD, the offsets and their two cures, the two hybrids).
 * Run: node tools/lmn_check.js      (exit status 1 on any failure)
 */
"use strict";
const S = require("../js/lmn.js");
const { dot, cross, add, scale, unit, lineAngle } = S.math;

let fails = 0, passes = 0;
function ok(cond, what) { if (cond) passes++; else { fails++; console.log(`  FAIL ${what}`); } }
function near(v, ref, tol, what) { ok(Math.abs(v - ref) <= tol, `${what}: ${v} vs ${ref} (±${tol})`); }
function nearV(v, ref, tol, what) { for (let k = 0; k < 3; k++) near(v[k], ref[k], tol, `${what}[${k}]`); }
const frame = (r, what) => { if (!r.frame) { fails++; console.log(`  FAIL ${what}: ${r.error}`); return null; } return r.frame; };
const f4 = (v) => `(${v.map(x => (x >= 0 ? "+" : "") + x.toFixed(4)).join(", ")})`;

// ── AMPTE/IRM, 1984-10-19 05:18:20.49 + T s: B [nT], v [km/s] (Table 8.4) ──
const ampte = [
  [0.00, [-13.6, -24.7, 54.6], [-111.0, -211.0, 57.0]], [4.38, [-14.8, -24.9, 58.7], [-102.0, -213.0, 41.0]],
  [8.75, [-13.4, -17.2, 62.4], [-111.0, -196.0, 34.0]], [13.12, [-14.0, -25.0, 43.8], [-135.0, -229.0, 54.0]],
  [17.49, [-7.1, -4.5, 33.5], [-128.0, -252.0, 54.0]], [21.87, [-0.9, -5.0, 44.4], [-82.0, -237.0, 51.0]],
  [26.24, [-10.0, -0.4, 44.6], [-139.0, -228.0, 77.0]], [30.61, [-6.1, -4.8, 21.1], [-143.0, -241.0, 57.0]],
  [34.98, [1.2, 1.6, 21.0], [-132.0, -226.0, 80.0]], [39.36, [-3.4, -3.9, 4.1], [-117.0, -217.0, 79.0]],
  [43.73, [-0.9, 1.2, 5.0], [-112.0, -210.0, 93.0]], [48.10, [-1.0, -1.5, 12.3], [-98.0, -212.0, 92.0]],
  [52.47, [11.0, 13.2, 29.7], [-90.0, -186.0, 104.0]], [56.85, [19.1, 34.4, 20.1], [-83.0, -168.0, 121.0]],
  [61.22, [24.9, 50.1, 1.9], [-82.0, -129.0, 88.0]], [65.59, [29.2, 47.1, -10.6], [-93.0, -123.0, 53.0]],
];
const P = (t, v) => ({ t, x: v[0], y: v[1], z: v[2] });
const inputs = { b: ampte.map(r => P(r[0], r[1])), vi: ampte.map(r => P(r[0], r[2])), label: "AMPTE/IRM" };
const span = { a: -1, b: 67 };
const meanB = ampte.reduce((s, r) => add(s, r[1]), [0, 0, 0]).map(x => x / 16);

console.log("AMPTE/IRM (ISSI SR-001 ch. 8)");
{ // Figure 8.2 and §8.3.1
  const f = frame(S.solve("mvaB", inputs, span, {}, false), "MVA-B");
  const d = f.diagnostics;
  near(d.eigenvalues[0], 1012.86, 0.15, "MVA-B λ1"); near(d.eigenvalues[1], 138.01, 0.15, "MVA-B λ2"); near(d.eigenvalues[2], 7.08, 0.01, "MVA-B λ3");
  nearV(f.n, [0.8671, -0.4978, 0.0187], 1e-4, "MVA-B x3"); nearV(f.l, [-0.4061, -0.6845, 0.6055], 1e-4, "MVA-B x1");
  near(S.frameRatio(f), d.eigenvalues[1] / d.eigenvalues[2], 1e-12, "MVA-B ratio"); ok(S.ratioLabel(f) === "λ₂/λ₃", "MVA-B ratio label");
  near(d.normalCone_deg[0] * Math.PI / 180, 0.022, 0.0005, "Δφ31"); near(d.normalCone_deg[1] * Math.PI / 180, 0.062, 0.0005, "Δφ32");
  near(dot(meanB, f.n), -0.58, 0.01, "⟨B⟩·x3");
  console.log(`  MVA-B   N ${f4(f.n)}  λ = ${d.eigenvalues.map(x => x.toFixed(2)).join(", ")}  cone ${d.normalCone_deg.map(x => (x * Math.PI / 180).toFixed(4)).join("/")} rad  (paper: N (0.8671, −0.4978, 0.0187); λ 1012.86, 138.01, 7.08; 0.022/0.062)`);
}
{ // Table 8.1 (ii)
  const f = frame(S.solve("mvaBC", inputs, span, {}, false), "MVA-B C");
  nearV(f.n, [0.8728, -0.4865, 0.0386], 2e-4, "⟨B⟩·n=0 n"); near(dot(meanB, f.n), 0, 1e-9, "⟨B⟩·N"); near(dot(f.l, f.n), 0, 1e-12, "L·N");
  console.log(`  ⟨B⟩·N=0 N ${f4(f.n)}  (paper: (0.8728, −0.4865, 0.0386))`);
}
{ // Table 8.3 / Figure 8.10
  const f0 = frame(S.solve("mvaE", inputs, span, { eField: "ionConvection" }, false), "MVA-E u=0");
  nearV(f0.n, [0.8911, -0.4533, 0.0197], 2e-4, "MVA-E x1 u=0");
  near(f0.diagnostics.normalCone_deg[0] * Math.PI / 180, 0.0451, 0.0006, "MVA-E Δφ21*"); near(f0.diagnostics.normalCone_deg[1] * Math.PI / 180, 0.0289, 0.0004, "MVA-E Δφ31");
  ok(S.ratioLabel(f0) === "λ₁/λ₂", "MVA-E ratio label");
  const f5 = frame(S.solve("mvaE", inputs, span, { eField: "ionConvection", frameSpeed: -5 }, false), "MVA-E u=-5");
  const d5 = f5.diagnostics;
  nearV(f5.n, [0.9017, -0.4309, 0.0361], 2e-4, "MVA-E x1 u=-5");
  near(d5.eigenvalues[0], 17.05, 0.01, "MVA-E λ1"); near(d5.eigenvalues[1], 0.50, 0.01, "MVA-E λ2"); near(d5.eigenvalues[2], 0.21, 0.01, "MVA-E λ3");
  near(f5.lambda[2], d5.eigenvalues[0], 1e-12, "λ by axis"); near(S.frameRatio(f5), d5.eigenvalues[0] / d5.eigenvalues[1], 1e-9, "MVA-E ratio");
  console.log(`  MVA-E   N ${f4(f0.n)} (u=0), ${f4(f5.n)} (u=−5), λ ${d5.eigenvalues.map(x => x.toFixed(2)).join(", ")}  (paper: (0.8911, −0.4533, 0.0197); (0.9017, −0.4309, 0.0361); 17.05, 0.50, 0.21)`);
}
{ // §8.4.2: the Terasawa normal and u_n
  const f = frame(S.solve("mfr", inputs, span, { eField: "ionConvection" }, false), "MFR");
  const d = f.diagnostics, ang = lineAngle(f.n, [0.8945, -0.4465, 0.0247]);
  ok(ang < 0.2, `MFR within 0.2° of Terasawa (${ang.toFixed(3)}°)`); near(d.uN, -1.5, 0.5, "MFR u_N"); ok(d.uNError != null, "MFR u_N error");
  console.log(`  MFR     N ${f4(f.n)}, u_N = ${d.uN.toFixed(2)} ± ${d.uNError.toFixed(2)} km/s, ${ang.toFixed(3)}° from Terasawa's (0.8945, −0.4465, 0.0247), u_n −1.5`);
}
{ // the corrected eq. 26
  const e = [[1, 0, 0], [-1, 0, 0], [0, 2, 0], [0, -2, 0]], b = [[0, 0, 3], [0, 0, -3], [1, 0, 0], [-1, 0, 0]];
  const r = S.mfrMatrix(e, b), Pv = [0, -1.5, -1], b2 = 5, ee = [[0.5, 0, 0], [0, 2, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) near(r.q[i][j], -ee[i][j] + (i === j ? 2.5 : 0) - Pv[i] * Pv[j] / b2, 1e-12, `Q[${i}][${j}]`);
  for (let k = 0; k < 3; k++) near(r.uStar[k], 1000 * Pv[k] / b2, 1e-9, `U*[${k}]`);
  console.log("  MFR matrix: the 2007-corrected eq. 26 term by term ✓");
}
{ // velocity variance
  const ve = Array.from({ length: 200 }, (_, i) => { const s = i / 199 * 2 - 1; return P(i * 0.03, [1000 * s, 100 * Math.sin(7 * s), 5 * Math.cos(13 * s)]); });
  const f = frame(S.solve("mvaVe", { ve }, { a: 0, b: 6 }, {}, false), "MVA-ve");
  ok(lineAngle(f.l, [1, 0, 0]) < 2, "MVA-ve L along x"); ok(lineAngle(f.n, [0, 0, 1]) < 1e-6, "MVA-ve N exactly z"); ok(f.diagnostics.unit === "(km/s)²", "unit");
}

console.log("Combining (Genestreti et al. 2018 Table A1; Denton et al. 2018 App. A; Mozer & Retinò 2007)");
{
  const row8 = { l: [0.9482, -0.2551, -0.1893], m: [0.1749, 0.9168, -0.3591], n: [0.2651, 0.3074, 0.9139], lambda: [4.4 * 14, 14, 1], a: 0, b: 2, source: null, diagnostics: null };
  const row10 = { l: [0.8778, 0.4194, -0.2315], m: [-0.4697, 0.8485, -0.2438], n: [0.0942, 0.3227, 0.9418], lambda: [0, 0, 0], a: 0, b: 1.1, source: "MDD row 10", diagnostics: null };
  const f = frame(S.combine("l", row8, "n", row10, "keepFirst"), "row 14");
  nearV(f.l, [0.9482, -0.2551, -0.1893], 1e-4, "row 14 L"); nearV(f.m, [0.1818, 0.9245, -0.3350], 3e-4, "row 14 M"); nearV(f.n, [0.2604, 0.2832, 0.9230], 3e-4, "row 14 N");
  ok(S.methodOf(f) === "combined", "combined method"); nearV(cross(f.l, f.m), f.n, 1e-9, "L × M = N");
  console.log(`  row 14  L ${f4(f.l)} M ${f4(f.m)} N ${f4(f.n)}  (paper: M (0.1818, 0.9245, −0.3350), N (0.2604, 0.2832, 0.9230))`);
}
{
  const Lp = unit([0.40, -0.30, 0.86]), Np = unit([0.90, 0.15, -0.30]), rL = 73, rN = 12;
  const fa = { l: Lp, m: [0, 1, 0], n: [1, 0, 0], lambda: [0, 0, 0], a: 0, b: 0, source: null, diagnostics: { method: "mvaB", axisRatios: [rL, null, null], notes: [] } };
  const fb = { l: [0, 0, 1], m: [0, 1, 0], n: Np, lambda: [0, 0, 0], a: 0, b: 0, source: null, diagnostics: { method: "mdd", axisRatios: [null, null, rN], notes: [] } };
  const f = frame(S.combine("n", fb, "l", fa, "weighted"), "weighted");
  const eM = unit(cross(Np, Lp)), eL2 = cross(eM, Np), dTheta = Math.acos(dot(Np, Lp)) - Math.PI / 2, dN = dTheta * rL / (rL + rN);
  const eN = add(scale(Np, Math.cos(dN)), scale(eL2, Math.sin(dN))), eL = cross(eM, eN);
  nearV(f.n, eN, 1e-12, "weighted N"); nearV(f.l, eL, 1e-12, "weighted L"); nearV(f.m, eM, 1e-12, "weighted M");
  console.log("  Denton et al. (2018) Appendix A weighting, followed literally ✓");
}
{
  const pr = S.perpendicular([0.90114, 0.43337, 0.01184], [-0.12045, 0.29473, 0.94796], 0);
  nearV(pr.first, unit([0.90114, 0.43337, 0.01184]), 1e-12, "N kept");
  nearV(pr.second, [-0.14792, 0.28168, 0.94804], 1e-5, "joint Z (L)"); nearV(cross(pr.second, pr.first), [-0.40752, 0.85607, -0.31794], 1e-5, "joint Y");
  console.log(`  Mozer & Retinò joint L ${f4(pr.second)}  (paper: (−0.14792, 0.28168, 0.94804))`);
}
{
  const typed = S.custom(null, null, [1, 0, 0], "typed", { a: 0, b: 0 }), other = S.custom([0, 0.1, 1], null, null, "typed L", { a: 0, b: 0 });
  ok(!!S.combine("n", typed, "l", other, "weighted").error, "weighting two typed axes refuses");
  ok(!!S.combine("n", typed, "l", other, "keepFirst").frame, "keep-first combines typed axes");
}

console.log("Typed bases (CustomLMNTests)");
{
  const ortho = (f) => { for (const v of [f.l, f.m, f.n]) near(Math.hypot(...v), 1, 1e-9, "unit"); near(dot(f.l, f.m), 0, 1e-9, "L·M"); near(dot(f.l, f.n), 0, 1e-9, "L·N"); near(dot(f.m, f.n), 0, 1e-9, "M·N"); nearV(f.m, cross(f.n, f.l), 1e-9, "M = N × L"); };
  const f1 = S.custom([0.1, 0, 3], null, [2, 0, 0], "pair", { a: 0, b: 60 }); ortho(f1); nearV(f1.n, [1, 0, 0], 0, "N kept"); near(f1.l[2], 1, 1e-9, "L on +z");
  const f2 = S.custom(null, null, [0.6, 0.8, 0], "N only", { a: 0, b: 60 }); ortho(f2); near(f2.n[0], 0.6, 1e-9, "N only x");
  ortho(S.custom(null, null, [0, 0, 1], "z", { a: 0, b: 60 }));
  const f4b = S.custom([1, 0, 0], [0, 1, 0], null, "lm", { a: 0, b: 60 }); ortho(f4b); near(f4b.n[2], 1, 1e-9, "N = L × M");
  ok(S.custom([1, 0, 0], null, [1, 0, 0], "parallel", { a: 0, b: 1 }) === null, "parallel refused");
  ok(S.custom(null, null, [0, 0, 0], "zero", { a: 0, b: 1 }) === null, "zero refused");
  ok(S.custom(null, null, null, "empty", { a: 0, b: 1 }) === null, "empty refused");
  ok(S.orthogonalityError([1, 0, 0], null, null) === null, "one axis: no error");
  near(S.orthogonalityError([1, 0, 0], null, [0, 0, 1]), 0, 1e-9, "square"); near(S.orthogonalityError([1, 0, 0], null, [0.1, 0, 1]), 5.71, 0.01, "skew 5.71°");
}
{ // flips stay right-handed and carry u_N
  const f = S.solve("mfr", inputs, span, { eField: "ionConvection" }, false).frame;
  for (const [fl, fn] of [[true, false], [false, true], [true, true]]) {
    const g = S.flipped(f, fl, fn);
    nearV(cross(g.l, g.m), g.n, 1e-12, "flip L × M"); near(dot(g.l, f.l), fl ? -1 : 1, 1e-12, "flip L"); near(dot(g.n, f.n), fn ? -1 : 1, 1e-12, "flip N");
    near(g.diagnostics.uN, (fn ? -1 : 1) * f.diagnostics.uN, 1e-12, "flip u_N");
  }
}
{ // accumulation centers
  const burst = [0, 1, 2, 3].map(i => P(i * 0.03, [0, 0, 0])), fast = [1, 2].map(i => P(10 + i * 4.5, [0, 0, 0]));
  const c = S.accumulationCenters(burst.concat(fast));
  near(c[0].t - burst[0].t, 0.015, 1e-9, "center 0"); near(c[3].t - burst[3].t, 0.015, 1e-9, "center 3"); near(c[5].t - fast[1].t, 2.25, 1e-9, "center fast");
}

console.log("Four probes on a synthetic X line (B_x = 20 tanh(z/40), B_y = 3, B_z = 0.05 x)");
const xLine = (r) => [20 * Math.tanh(r[2] / 40), 3, 0.05 * r[0]];
/** A regular tetrahedron, 10 km on a side, moving along z at 100 km/s (LMNMethodsTests.fourProbes). */
function fourProbes(field, offsets, t0, duration, dt = 0.01) {
  const a = 10, corners = [[0, 0, a * 0.6124], [a * 0.5774, 0, -a * 0.2041], [-a * 0.2887, a * 0.5, -a * 0.2041], [-a * 0.2887, -a * 0.5, -a * 0.2041]];
  return [1, 2, 3, 4].map(p => {
    const c = corners[p - 1], pos = (s) => [30 + c[0], c[1], -100 + 100 * s + c[2]];
    const n = Math.floor(duration / dt + 1e-9), b = [];
    for (let i = 0; i <= n; i++) { const s = i * dt; let v = field(pos(s)); if (offsets && offsets[p]) v = add(v, offsets[p]); b.push(P(t0 + s, v)); }
    const r = [];
    for (let s = -1; s <= duration + 1 + 1e-9; s += 0.5) r.push(P(t0 + s, pos(s)));
    return { probe: p, b, r };
  });
}
{
  const t0 = 1000, inp = { probes: fourProbes(xLine, null, t0, 2) }, iv = { a: t0 + 0.6, b: t0 + 1.4 };
  const f = frame(S.solve("mdd", inp, iv, {}, false), "MDD");
  ok(lineAngle(f.n, [0, 0, 1]) < 0.01, "MDD N z"); ok(lineAngle(f.l, [1, 0, 0]) < 0.01, "MDD L x"); ok(lineAngle(f.m, [0, 1, 0]) < 0.01, "MDD M y");
  const d = f.diagnostics;
  ok(d.unit === "(nT/km)²", "MDD unit"); ok(S.ratioLabel(f) === "λ₁/λ₂", "MDD ratio label");
  near(d.calibrationFloor, (0.1 / 10) ** 2, 1e-6, "λ₀ for d = 10 km"); ok(d.spread_deg < 0.01, "MDD spread"); near(d.eigenvalues[2], 0, 1e-12, "∂/∂y ≡ 0");
  console.log(`  MDD     L ${f4(f.l)} M ${f4(f.m)} N ${f4(f.n)}, λ ${d.eigenvalues.map(x => x.toExponential(3)).join(", ")}`);
}
{
  const t0 = 1000, offs = { 2: [0.4, 0, 0], 3: [0, 0.5, 0], 4: [0, 0, -0.3] }, tq = t0 + 600;
  const inp = { probes: fourProbes(xLine, offs, t0, 2), quietProbes: fourProbes(() => [20, 3, 1], offs, tq, 60, 0.5) };
  const iv = { a: t0 + 0.6, b: t0 + 1.4 };
  const raw = frame(S.solve("mdd", inp, iv, {}, false), "raw MDD");
  ok(lineAngle(raw.m, [0, 1, 0]) > 5, "offsets spoil M");
  const fixed = frame(S.solve("mddOffset", inp, iv, { quiet: { a: tq, b: tq + 60 } }, false), "MDD offset");
  ok(lineAngle(fixed.m, [0, 1, 0]) < 1e-6, "offsets removed: M"); ok(lineAngle(fixed.n, [0, 0, 1]) < 1e-6, "offsets removed: N");
  const pert = frame(S.solve("mddPerturbed", inp, iv, {}, false), "δ∇B");
  ok(lineAngle(pert.n, [0, 0, 1]) < 0.01, "δ∇B N");
  console.log(`  offsets: raw M ${lineAngle(raw.m, [0, 1, 0]).toFixed(1)}° off y; after ⟨ΔB⟩₀ ${lineAngle(fixed.m, [0, 1, 0]).toExponential(1)}°; δ∇B N ${lineAngle(pert.n, [0, 0, 1]).toExponential(1)}° off z`);
}
{
  const t0 = 1000, inp = { probes: fourProbes(xLine, null, t0, 2) }, iv = { a: t0 + 0.6, b: t0 + 1.4 };
  const f = frame(S.solve("hybridTorbert", inp, iv, { currentFromCurlometer: true }, false), "Torbert peak");
  const g = frame(S.solve("hybridTorbert", inp, iv, { currentFromCurlometer: true, currentPeak: false }, false), "Torbert mean");
  ok(g.m[1] > 0.9999, "Torbert mean M = +y"); ok(lineAngle(f.n, [0, 0, 1]) < 0.01, "Torbert N"); ok(f.m[1] > 0.9999, "Torbert M = +y");
  near(dot(cross(f.l, f.m), f.n), 1, 1e-12, "Torbert right-handed");
  const iv2 = { a: t0 + 0.2, b: t0 + 1.8 };
  const h = frame(S.solve("hybridMVABMDD", inp, iv2, {}, true), "Denton hybrid");
  ok(lineAngle(h.n, [0, 0, 1]) < 0.5, "hybrid N"); ok(lineAngle(h.l, [1, 0, 0]) < 0.5, "hybrid L"); ok(!!h.diagnostics.stability_deg, "hybrid stability");
  console.log(`  Torbert M ${f4(f.m)}; Denton hybrid L ${f4(h.l)} N ${f4(h.n)}, stability ${h.diagnostics.stability_deg.map(x => x.toFixed(2)).join("/")}°`);
}
{ // compare: each method on its own
  const c = S.compare(["mvaB", "mvaVi", "mvaJ", "mdd", "mddOffset"], inputs, span);
  ok(c.map(x => x.method).join() === "mvaB,mvaVi,mvaJ,mdd,mddOffset", "compare order");
  ok(!!c[0].frame && !!c[1].frame, "compare solves what it can");
  for (let k = 2; k < 5; k++) ok(!c[k].frame && !!c[k].error, `compare says why (${c[k].method}): ${c[k].error}`);
  ok(S.needs("hybridTorbert", {}).join() === "fourB,ions,electrons", "Torbert needs FPI");
  ok(S.inputPanels("mfr", {}).join() === "e,b" && S.inputPanels("mvaE", { frameSpeed: 20 }).join() === "e,b" && S.inputPanels("mvaEB", { eField: "ionConvection" }).join() === "vi,b", "input panels");
}

console.log(`\n${passes} checks passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
