#!/usr/bin/env node
/* The polynomial reconstruction (js/recon.js) against the Mac app's unit tests (PolynomialReconstructionTests.swift,
 * PolynomialReconstructionPaperViewTests.swift, docs/RECONSTRUCTION.md §6 in MMSTracker): the ∇·B rows against the
 * Python's, exactness on fields a model can hold, ∇·B = 0 everywhere, J = ∇×B/μ₀, the MDD frame of an X line, the
 * failure modes, the noise gain on a regular tetrahedron, and the 2-D cut (grid = the solution; X point where the
 * field puts it). Synthetic fields only — no data. Run: node tools/recon_check.js
 */
"use strict";
const R = require("../js/recon.js");
const L = require("../js/lmn.js");
const { dot, cross, add, sub, scale, norm, matmul } = L.math;

let fails = 0, passes = 0;
const ok = (c, what) => { if (c) passes++; else { fails++; console.log(`  FAIL ${what}`); } };
const near = (v, ref, tol, what) => ok(Math.abs(v - ref) <= tol, `${what}: ${v} vs ${ref} ±${tol}`);

// ── fixtures (ReconstructionFixtures.swift) ──
const rad = Math.PI / 180;
const rz = (t) => [[Math.cos(t * rad), -Math.sin(t * rad), 0], [Math.sin(t * rad), Math.cos(t * rad), 0], [0, 0, 1]];
const ry = (t) => [[Math.cos(t * rad), 0, Math.sin(t * rad)], [0, 1, 0], [-Math.sin(t * rad), 0, Math.cos(t * rad)]];
const rotation = (a, b, c) => matmul(matmul(rz(a), ry(b)), rz(c));
const apply = (m, v) => [dot(m[0], v), dot(m[1], v), dot(m[2], v)];
const T = (m) => [0, 1, 2].map(i => m.map(r => r[i]));
const center = [-127500, 31000, 12400];
function tetrahedron(edge = 15, squash = 1, axis = [0, 0, 1], rot = rotation(17, 33, 71), c = center) {
  const s = edge / (2 * Math.SQRT2), u = scale(axis, 1 / norm(axis));
  return [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]].map(p => apply(rot, scale(p, s))).map(p => { const al = scale(u, dot(p, u)); return add(c, add(sub(p, al), scale(al, squash))); });
}
/** A 2-D Harris sheet with guide and normal fields, an X line along M through x0; axes' columns are L, M, N. */
function harris({ B0 = 20, guide = 5, Bn = 2, lambda, lambdaL, x0, axes }) {
  const lamL = lambdaL || lambda, qt = T(axes), loc = (r) => apply(qt, sub(r, x0));
  return {
    b: (r) => { const p = loc(r); return apply(axes, [B0 * Math.tanh(p[2] / lambda), guide, Bn * p[0] / lamL]); },
    j: (r) => { const p = loc(r), sech = 1 / Math.cosh(p[2] / lambda); return apply(axes, [0, (B0 / lambda * sech * sech - Bn / lamL) / R.MU0, 0]); },
  };
}
/** A linear, divergence-free field B = B₀ + G(r − c) (trace G = 0) and its uniform current. */
function linearField(seed) {
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647 - 0.5; };
  const G = [0, 1, 2].map(() => [0, 1, 2].map(() => rnd() * 0.4));
  G[2][2] = -(G[0][0] + G[1][1]);
  const B0 = [rnd() * 40, rnd() * 40, rnd() * 40];
  return { b: (r) => add(B0, apply(G, sub(r, center))), j: () => scale([G[2][1] - G[1][2], G[0][2] - G[2][0], G[1][0] - G[0][1]], 1 / R.MU0) };
}
const samples = (field, pos, withJ = [true, true, true, true]) => pos.map((r, i) => ({ probe: i + 1, r, b: field.b(r), j: withJ[i] ? field.j(r) : null }));
const sphere = (n, radius, c = center) => R.fibonacciSphere(n).map(u => add(c, scale(u, radius)));

console.log("The ∇·B rows against reconst.py's divB closures");
{
  const rows = (m) => { const terms = []; for (let c = 0; c < 3; c++) for (const k of R.MODELS[m].terms[c]) terms.push({ c, k }); return R.divergenceConstraints(terms).map(r => r.map((v, j) => (v ? `${terms[j].c},${terms[j].k}` : null)).filter(Boolean).sort().join(" ")); };
  ok(JSON.stringify(rows("q3d")) === JSON.stringify(["0,2 1,3 2,1", "0,6 1,8 2,5", "0,8 2,7", "0,5 1,7 2,4"]), `Q-3D rows ${JSON.stringify(rows("q3d"))}`);
  ok(JSON.stringify(rows("qlm3d")) === JSON.stringify(["0,2 1,3 2,1", "0,6 2,5", "0,5 2,4"]), "QLm-3D rows");
  ok(JSON.stringify(rows("rq3d")) === JSON.stringify(["0,2 1,3 2,1"]), "RQ-3D rows");
  ok(Object.values(R.MODELS).map(m => m.terms.flat().length).join() === "12,12,17,21,27", "parameter counts 12, 12, 17, 21, 27");
}

console.log("A linear field: exact for every model, everywhere");
{
  const field = linearField(3), pos = tetrahedron(12, 0.6);
  for (const m of Object.keys(R.MODELS)) {
    const { solution: s, error } = R.solve(samples(field, pos), m);
    if (!s) { ok(false, `${m}: ${error}`); continue; }
    let wb = 0, wj = 0;
    for (const p of sphere(50, 40)) { wb = Math.max(wb, norm(sub(s.b(p), field.b(p)))); wj = Math.max(wj, norm(sub(s.j(p), field.j(p)))); }
    ok(wb < 1e-8 && wj < 1e-8, `${m} exact (|ΔB| ${wb.toExponential(1)}, |ΔJ| ${wj.toExponential(1)})`);
    if (m === "q3d" || m === "lb3d") ok(s.trust.level === "caution" && s.trust.reasons.some(r => r.includes("1 redundant equation")) && s.trust.reasons.includes(s.trust.cause), `${m}: one redundant equation → caution`);
    else ok(s.trust.level === "good" && s.trust.cause === null, `${m}: good (${s.trust.reasons.join(" | ")})`);
  }
}

console.log("A Harris X line (λ 10–20 km), 15 km tetrahedron");
{
  const axes = rotation(10, 70, 30), field = harris({ lambda: 10, x0: add(center, [2, 3, -1]), axes });
  let rng = 7;
  const g = () => { rng = (rng * 16807) % 2147483647; const u1 = rng / 2147483647; rng = (rng * 16807) % 2147483647; const u2 = rng / 2147483647; return Math.sqrt(-2 * Math.log(u1 + 1e-12)) * Math.cos(2 * Math.PI * u2); };
  const noisy = samples(field, tetrahedron(15)).map(s => Object.assign(s, { b: add(s.b, [g() * 0.2, g() * 0.2, g() * 0.2]), j: add(s.j, [g() * 0.05, g() * 0.05, g() * 0.05]) }));
  for (const m of Object.keys(R.MODELS)) {
    const s = R.solve(noisy, m).solution;
    let worst = 0;
    for (const p of sphere(40, 35)) { const G = s.gradient(p), scl = Math.max(1, ...G.flat().map(Math.abs)); worst = Math.max(worst, Math.abs(G[0][0] + G[1][1] + G[2][2]) / scl); }
    ok(worst < 1e-12, `${m}: ∇·B = 0 everywhere (${worst.toExponential(1)})`);
  }
  const f2 = harris({ lambda: 12, x0: center, axes: rotation(5, 40, 80) });
  for (const m of Object.keys(R.MODELS)) {
    const s = R.solve(samples(f2, tetrahedron(15)), m).solution, h = 1e-3;
    let worst = 0;
    for (const p of sphere(30, 20)) {
      const d = (ax) => scale(sub(s.b(add(p, scale(ax, h))), s.b(sub(p, scale(ax, h)))), 1 / (2 * h));
      const dx = d([1, 0, 0]), dy = d([0, 1, 0]), dz = d([0, 0, 1]), curl = [dy[2] - dz[1], dz[0] - dx[2], dx[1] - dy[0]];
      const j = scale(s.j(p), R.MU0);
      worst = Math.max(worst, norm(sub(curl, j)) / Math.max(1, norm(j)));
    }
    ok(worst < 1e-5, `${m}: J is the curl of B/μ₀ (${worst.toExponential(1)})`);
  }
  const ax3 = rotation(30, 60, 90), Lv = [ax3[0][0], ax3[1][0], ax3[2][0]], Mv = [ax3[0][1], ax3[1][1], ax3[2][1]], Nv = [ax3[0][2], ax3[1][2], ax3[2][2]];
  const s3 = R.solve(samples(harris({ lambda: 20, x0: center, axes: ax3 }), tetrahedron()), "rq3d").solution, F = s3.frame;
  ok(Math.abs(dot(F.n, Nv)) > 0.999 && Math.abs(dot(F.l, Lv)) > 0.999 && Math.abs(dot(F.m, Mv)) > 0.999, "MDD frame: n ∥ N, l ∥ L, m ∥ M");
  near(dot(cross(F.l, F.m), F.n), 1, 1e-12, "MDD frame right-handed");
  const ev = s3.diagnostics.mddEigenvalues;
  ok(ev[0] > 10 * ev[1] && ev[2] < 1e-12 * ev[0], "MDD eigenvalues ordered, m invariant");
}

console.log("Failure modes: MMS4 without its current; no current at all");
{
  const field = harris({ lambda: 15, x0: center, axes: rotation(0, 45, 0) });
  const rq = R.solve(samples(field, tetrahedron(), [true, true, true, false]), "rq3d").solution;
  ok(rq && rq.diagnostics.currentCount === 3 && rq.diagnostics.equations === 21 && rq.diagnostics.freeParameters === 16, "RQ-3D with three currents: 21 equations, 16 free");
  ok(!!R.solve(samples(field, tetrahedron(), [true, true, true, false]), "qlm3d").solution, "QLm-3D solves with three currents");
  const q = R.solve(samples(field, tetrahedron(), [true, true, true, false]), "q3d");
  ok(q.error && /23 free coefficients but only 21 equations/.test(q.error), `Q-3D underdetermined: ${q.error}`);
  const none = samples(field, tetrahedron(), [false, false, false, false]);
  ok(!!R.solve(none, "lb3d").solution && !!R.solve(none, "lbj3d").solution && !!R.solve(none, "rq3d").error, "B only: the linear models solve, RQ-3D refuses");
}

console.log("Noise gain G₁ on a regular tetrahedron (RECONSTRUCTION.md: LBJ ≈2.0, RQ ≈2.1, QLm ≈3.2, Q ≈7)");
{
  const field = harris({ lambda: 30, x0: center, axes: rotation(10, 20, 30) });
  const g = {};
  for (const m of ["lbj3d", "rq3d", "qlm3d", "q3d"]) g[m] = R.solve(samples(field, tetrahedron(15)), m).solution.diagnostics.noiseGain;
  console.log(`  G₁: LBJ-3D ${g.lbj3d.toFixed(2)}, RQ-3D ${g.rq3d.toFixed(2)}, QLm-3D ${g.qlm3d.toFixed(2)}, Q-3D ${g.q3d.toFixed(2)}`);
  near(g.lbj3d, 2.0, 0.25, "G₁ LBJ-3D"); near(g.rq3d, 2.1, 0.25, "G₁ RQ-3D"); near(g.qlm3d, 3.2, 0.4, "G₁ QLm-3D"); near(g.q3d, 7, 1.5, "G₁ Q-3D");
}

console.log("The 2-D cut (planeCut): the grid is the solution's B; an X line where the field puts it");
{
  const axes = rotation(25, 60, 15), x0 = add(center, apply(axes, [3, 0, -2])), field = harris({ lambda: 30, Bn: 2, x0, axes });
  const sol = R.solve(samples(field, tetrahedron(15)), "rq3d").solution;
  const display = { l: [axes[0][0], axes[1][0], axes[2][0]], m: [axes[0][1], axes[1][1], axes[2][1]], n: [axes[0][2], axes[1][2], axes[2][2]] };
  for (const spec of ["LN", "LM", "MN", "-LN", "NL"]) {
    const cut = R.planeCut(sol, display, { orientation: spec, offset: 4, halfWidth: 30, resolution: 21, center: [2, -1] });
    let worst = 0;
    for (const [i, j] of [[0, 0], [20, 0], [7, 13], [20, 20], [10, 10]]) {
      const pt = [cut.center[0] + cut.axis[i], cut.center[1] + cut.axis[j]], gse = sol.b(cut.position(pt)), k = j * 21 + i;
      worst = Math.max(worst, Math.abs(cut.bL[k] - dot(gse, display.l)), Math.abs(cut.bM[k] - dot(gse, display.m)), Math.abs(cut.bN[k] - dot(gse, display.n)));
    }
    ok(worst < 1e-9, `${spec}: grid = solution (${worst.toExponential(1)})`);
  }
  const cut = R.planeCut(sol, display, { orientation: "LN", halfWidth: 3 * sol.separation, resolution: 81 });
  const nulls = cut.nulls(17), d = sub(x0, sol.barycenter), want = [dot(d, display.l), dot(d, display.n)];
  const x = nulls.find(n => n.kind === "x");
  ok(!!x && Math.hypot(x.h - want[0], x.v - want[1]) < 1.0, `X point (RQ-3D of a tanh sheet: within 1 km) at (${x && x.h.toFixed(2)}, ${x && x.v.toFixed(2)}) km, the field's (${want[0].toFixed(2)}, ${want[1].toFixed(2)}) − M offset`);
  const lines = cut.streamlines({ seedGrid: 20 });
  ok(lines.length > 10, `${lines.length} streamlines`);
  const m = cut.markers.map(k => [k.probe, k.h.toFixed(1), k.v.toFixed(1), k.off.toFixed(1)]);
  ok(m.length === 4, `markers ${JSON.stringify(m)}`);
}

console.log(`\n${passes} checks passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
