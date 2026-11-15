#!/usr/bin/env node
/* The LMN methods (js/lmn.js) on public MMS data, against the frames the papers print — the same events and intervals
 * as the Mac app's opt-in LMNMethodsLiveTests.swift:
 *   - Genestreti et al. (2018, JGR 123, 9130) Table A1: 11 July 2017 22:34 UT, MMS3 for the one-spacecraft methods;
 *   - Denton et al. (2018, JGR 123, 2274) §4.1.1: the MVA-B/MDD hybrid, 16 October 2015 13:05:43.5–48;
 *   - Denton et al. (2024) Table B1: MDD for Chen et al. (2017), 14 December 2015 01:17:39–40.
 * Angles are sign-blind (papers differ in which way an axis points). Data: CDAWeb HAPI only, cached on disk
 * (tools/cdaweb.js). The browser fetches what the web app can (EDP fast survey, not burst E): rows that read E use it.
 * Run: HELIOS_CACHE=/some/tmp node tools/lmn_live.js
 */
"use strict";
const S = require("../js/lmn.js");
const C = require("./cdaweb.js");
const { lineAngle } = S.math;

const T = (s) => C.hapiTime(s);
const iv = (a, b) => ({ a: T(a), b: T(b) });
const doubled = (i) => ({ a: i.a - (i.b - i.a) / 2, b: i.b + (i.b - i.a) / 2 });
const isoS = (x) => new Date(x * 1000).toISOString();
const clock = (t) => isoS(t).slice(11, 23);
const f4 = (v) => `(${v.map(x => (x >= 0 ? "+" : "") + x.toFixed(4)).join(", ")})`;
const results = [];

/** MMS n's B, E (fast), vᵢ, vₑ (DES spin tone removed) and J = 1.602e-4 nₑ(vᵢ − vₑ) [µA/m²] over span, the FPI series
 *  restamped at their accumulation centers (vᵢ read at each electron center), as HSODataClient.lmnSeries does. */
async function single(n, span, want) {
  const a = isoS(span.a), b = isoS(span.b), sc = `mms${n}`, out = { label: `MMS${n}`, clock };
  out.b = (await C.fgm(n, a, b)).b;
  if (want.e) out.e = await C.vectors(`MMS${n}_EDP_FAST_L2_DCE`, `${sc}_edp_dce_gse_fast_l2`, a, b);
  if (want.fpi) {
    const des = await C.series(`MMS${n}_FPI_BRST_L2_DES-MOMS`, [`${sc}_des_numberdensity_brst`, `${sc}_des_bulkv_gse_brst`, `${sc}_des_bulkv_spintone_gse_brst`], a, b);
    const dis = await C.series(`MMS${n}_FPI_BRST_L2_DIS-MOMS`, [`${sc}_dis_bulkv_gse_brst`], a, b);
    const ve = des.t.map((t, i) => ({ t, x: des.cols[1][i] - (des.cols[4][i] || 0), y: des.cols[2][i] - (des.cols[5][i] || 0), z: des.cols[3][i] - (des.cols[6][i] || 0), n: des.cols[0][i] }));
    const vi = S.accumulationCenters(dis.t.map((t, i) => ({ t, x: dis.cols[0][i], y: dis.cols[1][i], z: dis.cols[2][i] })));
    out.ve = S.accumulationCenters(ve);
    out.vi = vi;
    const at = (s, x) => { let k = 0; while (k < s.length - 2 && s[k + 1].t < x) k++; if (s.length < 2 || x < s[0].t || x > s[s.length - 1].t) return null; const f = (x - s[k].t) / (s[k + 1].t - s[k].t); return [s[k].x + (s[k + 1].x - s[k].x) * f, s[k].y + (s[k + 1].y - s[k].y) * f, s[k].z + (s[k + 1].z - s[k].z) * f]; };
    out.j = out.ve.map((p, i) => { const v = at(vi, p.t), ne = ve[i].n; return v ? { t: p.t, x: 1.602e-4 * ne * (v[0] - p.x), y: 1.602e-4 * ne * (v[1] - p.y), z: 1.602e-4 * ne * (v[2] - p.z) } : null; }).filter(Boolean);
  }
  return out;
}
/** All four probes' native B (first probe leading: its samples are the MDD grid) and MEC positions (±90 s). */
async function four(first, span, positions = true) {
  const order = [first].concat([1, 2, 3, 4].filter(k => k !== first));
  const out = [];
  for (const k of order) out.push({ probe: k, b: (await C.fgm(k, isoS(span.a), isoS(span.b))).b, r: positions ? await C.mec(k, isoS(span.a - 90), isoS(span.b + 90)) : [] });
  return out;
}
function report(label, r, pub, tol) {
  if (!r.frame) { console.log(`  ${label}: FAILED — ${r.error}`); results.push({ label, ok: false }); return null; }
  const f = r.frame, d = f.diagnostics;
  console.log(`  ${label}`);
  console.log(`     L ${f4(f.l)}  M ${f4(f.m)}  N ${f4(f.n)}`);
  if (d) {
    let extra = `λ = ${d.eigenvalues.map(x => x.toPrecision(4)).join(", ")} ${d.unit}; ${d.normalRatioLabel || "ratio"} ${d.normalRatio != null ? d.normalRatio.toFixed(2) : "—"}`;
    if (d.tangentRatio != null) extra += `; ${d.tangentRatioLabel} ${d.tangentRatio.toFixed(2)}`;
    if (d.uN != null) extra += `; u_N ${d.uN.toFixed(1)} ± ${(d.uNError ?? NaN).toFixed(1)} km/s`;
    if (d.stability_deg) extra += `; stability L ${d.stability_deg[0].toFixed(1)}° M ${d.stability_deg[1].toFixed(1)}° N ${d.stability_deg[2].toFixed(1)}°`;
    if (d.spread_deg != null) extra += `; spread ${d.spread_deg.toFixed(1)}°`;
    console.log(`     ${extra}`);
    for (const n of d.notes) console.log(`     · ${n}`);
  }
  if (!pub) return null;
  const a = { l: lineAngle(f.l, pub.l), m: lineAngle(f.m, pub.m), n: lineAngle(f.n, pub.n) };
  let verdict = "";
  if (tol) { const pass = Object.entries(tol).every(([k, v]) => a[k] < v); verdict = pass ? "  ✓" : "  ✗"; results.push({ label, ok: pass, a, tol }); }
  console.log(`     vs published: ∠L ${a.l.toFixed(2)}°  ∠M ${a.m.toFixed(2)}°  ∠N ${a.n.toFixed(2)}°${tol ? `   (bound ${Object.entries(tol).map(([k, v]) => `∠${k.toUpperCase()} < ${v}°`).join(", ")})` : ""}${verdict}`);
  return a;
}

(async () => {
  console.log(`cache: ${C.CACHE}`);
  // ── Genestreti et al. (2018) Table A1, 11 July 2017, MMS3 ──
  const P = (l, m, n) => ({ l, m, n });
  const table = {
    4: P([0.9984, -0.0454, 0.0334], [0.0562, 0.8489, -0.5256], [-0.0045, 0.5266, 0.8501]),
    6: P([0.9750, -0.2223, 0.0017], [0.2105, 0.9208, -0.3284], [0.0715, 0.3205, 0.9445]),
    7: P([0.9677, -0.2476, -0.0482], [0.2477, 0.9688, -0.0038], [0.0476, -0.0083, 0.9988]),
    8: P([0.9482, -0.2551, -0.1893], [0.1749, 0.9168, -0.3591], [0.2651, 0.3074, 0.9139]),
    9: P([0.9754, -0.2131, 0.0568], [0.2202, 0.9286, -0.2986], [0.0109, 0.3038, 0.9527]),
    10: P([0.8778, 0.4194, -0.2315], [-0.4697, 0.8485, -0.2438], [0.0942, 0.3227, 0.9418]),
    11: P([0.9451, 0.2673, -0.1866], [-0.3139, 0.9011, -0.2990], [0.0947, 0.3225, 0.9418]),
    12: P([0.9858, 0.0856, -0.1443], [-0.1290, 0.9367, -0.3256], [0.1073, 0.3395, 0.9341]),
    13: P([0.971, 0.216, -0.106], [-0.234, 0.948, -0.215], [0.054, 0.233, 0.971]),
    14: P([0.9482, -0.2551, -0.1893], [0.1818, 0.9245, -0.3350], [0.2604, 0.2832, 0.9230]),
  };
  console.log("\nGenestreti et al. (2018) Table A1, 11 July 2017, MMS3");
  const i8 = iv("2017-07-11T22:34:02.000Z", "2017-07-11T22:34:04.000Z");
  const wide = { a: T("2017-07-11T22:33:56.000Z"), b: T("2017-07-11T22:34:10.000Z") };
  const inp = await single(3, wide, { e: true, fpi: true });
  const r8 = S.solve("mvaVe", inp, i8);
  report("row 8 MVA-vₑ 22:34:02–04 (λL/λM 4.4, λM/λN 14)", r8, table[8], { l: 3, n: 3 });
  const i9 = iv("2017-07-11T22:34:02.000Z", "2017-07-11T22:34:03.500Z");
  report("row 9 MFR, E (EDP fast survey, 32 S/s; the Swift test reads burst E) 22:34:02–03.5 (u_N 86.6 km/s)", S.solve("mfr", inp, i9), table[9], { n: 5 });
  report("row 9 MFR, −vₑ×B", S.solve("mfr", inp, i9, { eField: "electronConvection" }), table[9]);
  const i6 = iv("2017-07-11T22:34:00.700Z", "2017-07-11T22:34:03.900Z");
  report("row 6 MVA-E (EDP fast survey) 22:34:00.7–03.9", S.solve("mvaE", inp, i6), table[6]);
  report("     same interval, MVA-E on −vₑ×B", S.solve("mvaE", inp, i6, { eField: "electronConvection" }), table[6]);
  report("     same interval, joint variance (Mozer & Retinò), E fast", S.solve("mvaEB", inp, i6), table[6]);
  const i4 = iv("2017-07-11T22:30:00.000Z", "2017-07-11T22:40:00.000Z");
  const inB = { b: (await C.vectors("MMS3_FGM_SRVY_L2@0", "mms3_fgm_b_gse_srvy_l2", isoS(i4.a), isoS(i4.b))), clock };
  report("row 4 MVA-B ∼22:30–22:40 (approximate interval; survey FGM)", S.solve("mvaB", inB, i4, {}, false), table[4]);
  const i7 = iv("2017-07-11T22:33:00.000Z", "2017-07-11T22:35:00.000Z");
  const dis7 = await C.series("MMS3_FPI_BRST_L2_DIS-MOMS", ["mms3_dis_bulkv_gse_brst"], isoS(i7.a), isoS(i7.b));
  const inVi = { vi: S.accumulationCenters(dis7.t.map((t, i) => ({ t, x: dis7.cols[0][i], y: dis7.cols[1][i], z: dis7.cols[2][i] }))), clock };
  report("row 7 MVA-vᵢ 22:33–22:35 (interval guessed, as the Swift test)", S.solve("mvaVi", inVi, i7, {}, false), table[7]);

  const mddSpan = doubled(iv("2017-07-11T22:34:01.600Z", "2017-07-11T22:34:04.000Z"));
  const inMDD = { probes: await four(3, mddSpan), j: inp.j, label: "MMS3", clock };
  const i10 = iv("2017-07-11T22:34:02.000Z", "2017-07-11T22:34:03.100Z");
  const r10 = S.solve("mdd", inMDD, i10);
  report("row 10 MDD-B 22:34:02–03.1 (λN/λM 752)", r10, table[10], { n: 3 });
  const rM = S.solve("mdd", inMDD, iv("2017-07-11T22:34:01.600Z", "2017-07-11T22:34:03.100Z"), {}, false);
  const rN = S.solve("mdd", inMDD, iv("2017-07-11T22:34:02.300Z", "2017-07-11T22:34:04.000Z"), {}, false);
  if (rM.frame && rN.frame) report("row 11 MDD two intervals (M kept)", S.combine("m", rM.frame, "n", rN.frame, "keepFirst", clock), table[11], { n: 3 });
  const quiet = iv("2017-07-11T22:49:00.000Z", "2017-07-11T22:51:00.000Z");
  const inQ = Object.assign({}, inMDD, { quietProbes: await four(3, quiet, false) });
  const oq = { quiet };
  const qM = S.solve("mddOffset", inQ, iv("2017-07-11T22:34:01.600Z", "2017-07-11T22:34:03.100Z"), oq, false);
  const qN = S.solve("mddOffset", inQ, iv("2017-07-11T22:34:02.300Z", "2017-07-11T22:34:04.000Z"), oq, false);
  if (qM.frame && qN.frame) report("row 12 MDD-(B − ⟨ΔB⟩₀) two intervals, quiet 22:49–22:51", S.combine("m", qM.frame, "n", qN.frame, "keepFirst", clock), table[12]);
  else report("row 12 offsets", qM, null);
  const i13 = iv("2017-07-11T22:34:01.600Z", "2017-07-11T22:34:02.800Z");
  report("row 13 Torbert: MDD N and the peak FPI current, 22:34:01.6–02.8", S.solve("hybridTorbert", inMDD, i13, {}, false), table[13], { n: 8 });
  report("     same, curlometer current", S.solve("hybridTorbert", inMDD, i13, { currentFromCurlometer: true }, false), table[13]);
  if (r8.frame && r10.frame) report("row 14 MVA-vₑ L + MDD N", S.combine("l", r8.frame, "n", r10.frame, "keepFirst", clock), table[14], { l: 3, n: 3 });
  report("Denton 2024 B1: MDD 22:34:01.6–02.8", S.solve("mdd", inMDD, i13), P([0.876, 0.424, -0.230], [-0.476, 0.835, -0.275], [0.075, 0.351, 0.933]));

  // ── Denton et al. (2018) §4.1.1, 16 October 2015 ──
  console.log("\nDenton et al. (2018) §4.1.1, 16 October 2015 13:05:43.5–13:05:48 (published MVA-B λ 273, 3.75, 0.593 nT²; MDD λ 0.042, 0.0035, 0.0018 (nT/km)²)");
  const iD = iv("2015-10-16T13:05:43.500Z", "2015-10-16T13:05:48.000Z");
  const inD = { probes: await four(1, doubled(iD)), label: "MMS1", clock };
  const pubD = P([0.3894, -0.2938, 0.8730], [-0.0079, -0.9488, -0.3157], [0.9210, 0.1160, -0.3718]);
  report("hybrid MVA-B L + MDD N (Swift: 0.09°/0.15°/0.17°)", S.solve("hybridMVABMDD", inD, iD), pubD, { l: 0.3, m: 0.3, n: 0.3 });
  report("hybrid, B boxcar 0.5 s", S.solve("hybridMVABMDD", inD, iD, { smooth: 0.5 }), pubD);

  // ── Denton et al. (2024) Table B1, Chen et al. (2017) ──
  console.log("\nDenton et al. (2024) Table B1, Chen et al. (2017): 14 December 2015 01:17:39–40, MDD");
  const iC = iv("2015-12-14T01:17:39.000Z", "2015-12-14T01:17:40.000Z");
  const inC = { probes: await four(1, doubled(iC)), label: "MMS1", clock };
  const pubC = P([0.371, -0.230, 0.899], [-0.285, -0.950, -0.125], [0.884, -0.209, -0.418]);
  report("MDD (Swift: 4.98°/5.00°/0.64°)", S.solve("mdd", inC, iC), pubC, { n: 1.5, l: 6, m: 6 });
  report("MDD, B boxcar 0.5 s (Swift: 1.50°/0.69°/1.36°)", S.solve("mdd", inC, iC, { smooth: 0.5 }), pubC, { l: 2.5, m: 2.5, n: 2.5 });

  const bad = results.filter(r => !r.ok);
  console.log(`\n${results.length - bad.length} of ${results.length} bounded comparisons within the Swift tests' bounds`);
  process.exit(bad.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
