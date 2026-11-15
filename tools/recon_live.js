#!/usr/bin/env node
/* The polynomial reconstruction (js/recon.js) on public MMS data, against the papers and the Mac app's opt-in live
 * tests (Burch2022LiveTests.swift, Turner2021LiveTests.swift, PolynomialReconstructionLiveTests.swift; the numbers in
 * MMSTracker docs/RECONSTRUCTION.md §6.6, §13, §14). Settings as theirs: RQ-3D, calc_f over 4.5 s about the instant,
 * 0.3 s smoothing of B and of every plasma moment, both FPI spin tones removed, FPI read at accumulation centers.
 * Data: CDAWeb HAPI only (burst FGM, burst FPI moments with their spin tones, MEC), cached on disk (tools/cdaweb.js).
 * Run: HELIOS_CACHE=/some/tmp node tools/recon_live.js
 */
"use strict";
const R = require("../js/recon.js");
const L = require("../js/lmn.js");
const C = require("./cdaweb.js");
const { dot, cross, sub, scale, norm } = L.math;

const T = (s) => C.hapiTime(s);
const isoS = (x) => new Date(x * 1000).toISOString();
const results = [];
const check = (cond, what) => { results.push({ ok: !!cond, what }); console.log(`  ${cond ? "✓" : "✗"} ${what}`); };
const v3 = (v, k = 2) => `(${v.map(x => (x >= 0 ? "+" : "") + x.toFixed(k)).join(", ")})`;
const MMS4_DES_END = 1528375380;                     // 2018-06-07 12:43 UT (CMAD §4.1.2): no MMS4 DES moments after

/** The four probes' series over [a, b]: FGM burst, DES nₑ, Vₑ and its spin tone, DIS Vᵢ and its spin tone, MEC. */
async function probes(a, b) {
  const out = [];
  for (const k of [1, 2, 3, 4]) {
    const sc = `mms${k}`, A = isoS(a), B = isoS(b);
    const b_ = await C.vectors(`MMS${k}_FGM_BRST_L2@0`, `${sc}_fgm_b_gse_brst_l2`, A, B);
    const r = await C.mec(k, isoS(a - 90), isoS(b + 90));
    const p = { probe: k, b: b_, r };
    if (!(k === 4 && a >= MMS4_DES_END)) {
      const des = await C.series(`MMS${k}_FPI_BRST_L2_DES-MOMS`, [`${sc}_des_numberdensity_brst`, `${sc}_des_bulkv_gse_brst`, `${sc}_des_bulkv_spintone_gse_brst`], A, B);
      p.ne = des.t.map((t, i) => ({ t, v: des.cols[0][i] }));
      p.ve = des.t.map((t, i) => ({ t, x: des.cols[1][i], y: des.cols[2][i], z: des.cols[3][i] }));
      p.veSpin = des.t.map((t, i) => ({ t, x: des.cols[4][i], y: des.cols[5][i], z: des.cols[6][i] })).filter(q => isFinite(q.x));
    }
    const dis = await C.series(`MMS${k}_FPI_BRST_L2_DIS-MOMS`, [`${sc}_dis_bulkv_gse_brst`, `${sc}_dis_bulkv_spintone_gse_brst`], A, B);
    p.vi = dis.t.map((t, i) => ({ t, x: dis.cols[0][i], y: dis.cols[1][i], z: dis.cols[2][i] }));
    p.viSpin = dis.t.map((t, i) => ({ t, x: dis.cols[3][i], y: dis.cols[4][i], z: dis.cols[5][i] })).filter(q => isFinite(q.x));
    if (!p.ne) delete p.vi;                                        // MMS4 after its DES failure: no current
    console.log(`  MMS${k}: ${p.b.length} B, ${(p.ne || []).length} nₑ, ${(p.vi || []).length} Vᵢ, ${p.r.length} MEC`);
    out.push(p);
  }
  return out;
}
const fAt = (P, t) => { const e = R.currentScale(P, t - 2.25, t + 2.25); return e ? e.mean : 1; };
const solveAt = (P, t, f, model = "rq3d") => R.solveAt(t, P, model, {}, { currentScale: f });
const frameOf = (l, m, n) => R.checkedFrame(l, m, n, 0.01);
/** Radius of curvature [km] and κ̂ from B and its gradient G (κ = (b·∇)b). */
function curvature(B, G) {
  const m = norm(B), b = scale(B, 1 / m), d = [0, 1, 2].map(i => G[i][0] * b[0] + G[i][1] * b[1] + G[i][2] * b[2]);
  const k = scale(sub(d, scale(b, dot(b, d))), 1 / m);
  return { rc: 1 / norm(k), dir: scale(k, 1 / norm(k)) };
}

(async () => {
  console.log(`cache: ${C.CACHE}`);

  // ── Burch et al. (2022), 6 July 2017 08:37:07 ──
  console.log("\nBurch et al. (2022): 6 July 2017, 08:37:07 UT (Swift port: L_sc 17.9 km; dₑ 8.9 km; X at (−0.1, −32.0) km = 3.6 dₑ south; good; outer 35.7 km)");
  {
    const P = await probes(T("2017-07-06T08:36:58Z"), T("2017-07-06T08:37:16Z"));
    const paper = frameOf([0.9933, -0.0195, -0.1139], [-0.0092, 0.9692, -0.2461], [0.1152, 0.2455, 0.9625]);
    const t5 = T("2017-07-06T08:37:07.140Z"), f5 = fAt(P, t5), r5 = solveAt(P, t5, f5);
    if (!r5.solution) { check(false, `Burch 07.14 solve: ${r5.error}`); }
    else {
      const s = r5.solution, a = T("2017-07-06T08:37:06.500Z"), b = T("2017-07-06T08:37:07.500Z");
      const ne = P.map(p => (p.ne || []).filter(q => q.t >= a && q.t <= b && isFinite(q.v)).map(q => q.v)).filter(x => x.length).map(x => x.reduce((s2, y) => s2 + y, 0) / x.length);
      const nBar = ne.reduce((s2, x) => s2 + x, 0) / ne.length, de = 5.314 / Math.sqrt(nBar);
      console.log(`  07.14: L_sc ${s.separation.toFixed(1)} km; ⟨nₑ⟩ ${nBar.toFixed(3)} cm⁻³ → dₑ ${de.toFixed(1)} km (L_sc = ${(s.separation / de).toFixed(2)} dₑ); f ${f5.toFixed(2)}; ${s.trust.level} (core ${s.trust.core_km.toFixed(1)} km, outer ${s.trust.outer_km.toFixed(1)} km); G₁ ${s.diagnostics.noiseGain.toFixed(2)}`);
      for (const r of s.trust.reasons) console.log(`    · ${r}`);
      const cut = R.planeCut(s, paper, { halfWidth: 40, resolution: 81 });
      for (const m of cut.markers) console.log(`    MMS${m.probe} at L ${m.h.toFixed(1)} km, N ${m.v.toFixed(1)} km (M ${m.off.toFixed(1)} km off the plane)   Swift: ${{ 1: "(+9.6, −0.4)", 2: "(−1.7, −4.4)", 3: "(−2.9, +10.1)", 4: "(−5.0, −5.2)" }[m.probe]}`);
      const nulls = cut.nulls(17);
      for (const x of nulls) console.log(`    ${x.kind.toUpperCase()} point at L ${x.h.toFixed(1)} km, N ${x.v.toFixed(1)} km (${(-x.v / de).toFixed(1)} dₑ south of the barycenter)`);
      const x = nulls.find(q => q.kind === "x");
      check(Math.abs(s.separation - 17) < 3, `L_sc ${s.separation.toFixed(1)} km ≈ 17 (paper ~17; Swift 17.9)`);
      check(x && x.v < 0 && -x.v / de < 4.5, "an X line south of the spacecraft within ~4 dₑ (paper's Fig. 5)");
      check(x && Math.abs(x.h - -0.1) < 1.5 && Math.abs(x.v - -32.0) < 1.5, `X at (${x && x.h.toFixed(1)}, ${x && x.v.toFixed(1)}) km within 1.5 km of the Swift port's (−0.1, −32.0)`);
      check(s.trust.level === "good", `verdict ${s.trust.level} (Swift: good)`);
    }
    const track = [];
    let bl0 = NaN, bl1 = NaN;
    for (let k = 0; k <= 25; k++) {
      const t = T("2017-07-06T08:37:07.050Z") + 0.01 * k, r = solveAt(P, t, fAt(P, t));
      if (!r.solution) continue;
      const s = r.solution, B = s.b(s.barycenter), bL = dot(B, paper.l);
      if (k === 0) bl0 = bL; if (k === 25) bl1 = bL;
      const xs = R.planeCut(s, paper, { halfWidth: 40, resolution: 41 }).nulls(17).filter(q => q.kind === "x").sort((p, q) => Math.abs(p.v) - Math.abs(q.v));
      if (xs.length) track.push([0.01 * k, xs[0].h]);
      if (k % 5 === 0) console.log(`    07.${String(50 + 10 * k).padStart(3, "0")}  B (L, M, N) ${v3([bL, dot(B, paper.m), dot(B, paper.n)])} nT · ${s.trust.level}${xs.length ? ` · X at L ${xs[0].h.toFixed(1)} km` : ""}`);
    }
    const n = track.length, mt = track.reduce((s2, p) => s2 + p[0], 0) / n, ml = track.reduce((s2, p) => s2 + p[1], 0) / n;
    const slope = track.reduce((s2, p) => s2 + (p[0] - mt) * (p[1] - ml), 0) / track.reduce((s2, p) => s2 + (p[0] - mt) ** 2, 0);
    console.log(`  X point along L: ${slope.toFixed(0)} km/s over ${n} instants (paper −260 km/s; Swift −46 km/s over the 0.25 s)`);
    check(track.length >= 3 && track[n - 1][1] < track[0][1], "Fig. 6: the X line moves toward −L");
    check(bl1 > bl0, `Fig. 6a: B_L at the barycenter rises, ${bl0.toFixed(2)} → ${bl1.toFixed(2)} nT (Swift 4.15 → 5.73)`);
  }

  // ── Turner et al. (2021), 11 July 2017 22:34:12 ──
  console.log("\nTurner et al. (2021): 11 July 2017, 22:34:04–14 (Swift port: L_sc 18.3; no X/O; B_y +0.21…+1.02; κ̂ (+0.85, +0.40, −0.34); Rc 107 km RQ-3D, 110 four-point; G₁ 2.16; f 0.49)");
  {
    const P = await probes(T("2017-07-11T22:33:58Z"), T("2017-07-11T22:34:20Z"));
    const gse = frameOf([1, 0, 0], [0, 1, 0], [0, 0, 1]);
    let rc12 = null;
    for (let k = 0; k <= 10; k++) {
      const t = T("2017-07-11T22:34:04Z") + k, S = R.samplesAt(t, P);
      const G = S.length === 4 ? L.math.linearGradient(S.map(s => s.r), S.map(s => s.b)) : null;
      if (!G) continue;
      const bBar = scale(S.reduce((a, s) => [a[0] + s.b[0], a[1] + s.b[1], a[2] + s.b[2]], [0, 0, 0]), 0.25), lin = curvature(bBar, G);
      const r = solveAt(P, t, fAt(P, t));
      if (!r.solution) continue;
      const s = r.solution, poly = curvature(s.b(s.barycenter), s.gradient(s.barycenter));
      console.log(`    22:34:${String(4 + k).padStart(2, "0")}  L_sc ${s.separation.toFixed(1)}  ${s.trust.level.padEnd(10)} G₁ ${s.diagnostics.noiseGain.toFixed(2)}  Rc ${lin.rc.toFixed(0)} km (4-pt), ${poly.rc.toFixed(0)} km (RQ-3D)  κ̂ ${v3(poly.dir)}`);
      if (k === 8) rc12 = { lin, poly };
    }
    const t = T("2017-07-11T22:34:12Z"), f = fAt(P, t), s = solveAt(P, t, f).solution;
    const cut = R.planeCut(s, gse, { halfWidth: 3 * s.separation, resolution: 121 }), by = Array.from(cut.bM), nulls = cut.nulls(13);
    console.log(`  22:34:12 X–Z cut ±${(3 * s.separation).toFixed(1)} km: B_y ${Math.min(...by).toFixed(2)}…${Math.max(...by).toFixed(2)} nT; ${nulls.length} X/O points; f ${f.toFixed(2)}; ${s.trust.level} (core ${s.trust.core_Lsc} L_sc, outer ${s.trust.outer_Lsc} L_sc)`);
    for (const r of s.trust.reasons) console.log(`    · ${r}`);
    check(Math.abs(s.separation - 18) < 3, `L_sc ${s.separation.toFixed(1)} km ≈ 18`);
    check(nulls.length === 0, "uniform topology: no X or O point in ±3 L_sc");
    check(rc12 && rc12.poly.dir[0] > 0.5, "field lines concave toward +X GSE");
    check(rc12 && rc12.poly.rc > 75 && rc12.poly.rc < 400 && rc12.lin.rc > 75 && rc12.lin.rc < 400, `radius of curvature ${rc12 && rc12.poly.rc.toFixed(0)} km (RQ-3D), ${rc12 && rc12.lin.rc.toFixed(0)} km (four-point) — paper ~150 km`);
  }

  // ── Denton et al. (2020), 10 August 2017 12:18:31–35.5 ──
  console.log("\nDenton et al. (2020): 10 August 2017, 12:18:31–35.5 (Swift port: L_sc 20.54, TQF 0.728; calc_f 0.829–0.832; RQ-3D good, G₁ 2.3, relB 0.017–0.020, relJ 0.022–0.025; nulls in L_sc at .87 X (+0.04, −0.23), O (+1.03, −0.30); .91 X (−0.21, −0.27), O (+1.48, −0.40); .94 X (−0.50, −0.29), O (+2.06, −0.49))");
  {
    const P = await probes(T("2017-08-10T12:18:27Z"), T("2017-08-10T12:18:39Z"));
    const a = T("2017-08-10T12:18:31Z"), b = T("2017-08-10T12:18:35.5Z");
    const cf = R.currentScale(P, a, b);
    console.log(`  calc_f: per probe ${Object.values(cf.perProbe).map(x => x.toFixed(3)).join(" / ")}, mean ${cf.mean.toFixed(3)}; the paper's f(t) median ${cf.instantMedian.toFixed(3)} (paper 0.793, Swift 0.814), range ${cf.instantRange.map(x => x.toFixed(2)).join("–")}`);
    check(Math.abs(cf.mean - 0.83) < 0.02, `calc_f mean ${cf.mean.toFixed(3)} ≈ 0.83`);
    const h = R.hybridLMN(P, a, b), hw = R.hybridLMN(P, a, b, { priority: "weighted" });
    const cs1 = frameOf([0.98721, -0.13055, -0.09149], [0.15797, 0.8782, 0.45146], [0.02141, -0.46014, 0.88759]);
    console.log(`  hybrid (L kept): L ${v3(h.frame.l, 3)} M ${v3(h.frame.m, 3)} N ${v3(h.frame.n, 3)}; MVA λ₁/λ₂ ${(h.mvaEigenvalues[0] / h.mvaEigenvalues[1]).toFixed(0)}, summed-MDD λ₁/λ₂ ${(h.mddEigenvalues[0] / h.mddEigenvalues[1]).toFixed(0)}   (Swift: L (0.984, −0.178, 0.002) N (−0.082, −0.443, 0.893); 22, 108)`);
    const ang = (f, g) => ["l", "m", "n"].map(k => L.math.lineAngle(f[k], g[k]).toFixed(2)).join("° / ");
    console.log(`  eigenvalue-weighted vs Coordinate System 1: ${ang(hw.frame, cs1)}° (Swift: 0.04°)`);
    check(L.math.lineAngle(hw.frame.n, cs1.n) < 0.5, "the weighted hybrid reproduces the paper's Coordinate System 1 (within 0.5°)");
    const paper = frameOf([0.987, -0.131, -0.091], [0.158, 0.878, 0.451], [0.021, -0.460, 0.888]);
    for (const tt of [".840", ".870", ".910", ".940"]) {
      const t = T(`2017-08-10T12:18:32${tt}Z`), s = solveAt(P, t, cf.mean).solution, d = s.diagnostics;
      const cut = R.planeCut(s, paper, { resolution: 201 }), ns = cut.nulls(13), Lsc = s.separation, bm = Array.from(cut.bM);
      console.log(`    32${tt}: L_sc ${Lsc.toFixed(2)} km, TQF ${d.tetrahedronQuality.toFixed(3)}, ${s.trust.level}, G₁ ${d.noiseGain.toFixed(2)}, relB ${d.relativeBResidual.toFixed(3)}, relJ ${d.relativeJResidual.toFixed(3)}, η ${d.currentNonUniformity == null ? "—" : d.currentNonUniformity.toFixed(2)}; B_M ${Math.min(...bm).toFixed(1)}…${Math.max(...bm).toFixed(1)} nT; ${ns.map(q => `${q.kind.toUpperCase()} (${(q.h / Lsc).toFixed(2)}, ${(q.v / Lsc).toFixed(2)})`).join(" ") || "no nulls"}`);
      if (tt === ".870") {
        check(Math.abs(Lsc - 20.54) < 0.1 && Math.abs(d.tetrahedronQuality - 0.728) < 0.01, `L_sc ${Lsc.toFixed(2)} km, TQF ${d.tetrahedronQuality.toFixed(3)} (20.54, 0.728)`);
        const X = ns.find(q => q.kind === "x"), O = ns.find(q => q.kind === "o");
        check(X && Math.abs(X.h / Lsc - 0.04) < 0.1 && Math.abs(X.v / Lsc - -0.23) < 0.1, "X at (+0.04, −0.23) L_sc within 0.1");
        check(O && Math.abs(O.h / Lsc - 1.03) < 0.1 && Math.abs(O.v / Lsc - -0.30) < 0.1, "O at (+1.03, −0.30) L_sc within 0.1");
        check(s.trust.level === "good" && Math.abs(d.noiseGain - 2.3) < 0.2, `good, G₁ ${d.noiseGain.toFixed(2)} ≈ 2.3`);
      }
    }
  }

  const bad = results.filter(r => !r.ok);
  console.log(`\n${results.length - bad.length} of ${results.length} checks passed`);
  process.exit(bad.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
