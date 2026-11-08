/* Field lines and footpoints for live.html's LEO and Magnetosphere views, as Helios's HSO draws them (FieldLineOverlay, FieldLineMapping):
 * IGRF-14 plus T89 (Tsyganenko 1989, the paper's six Kp intervals), each line traced with an adaptive Dormand–Prince
 * 5(4) step from the craft both ways to 110 km over WGS84 (or out to 60 Rₑ), feet read in geodetic latitude.
 * A Web Worker: the page posts the seeds (GSE, Rₑ) with the GEO frame at their time; this answers with the feet.
 *
 * Sources: IGRF-14 (IAGA V-MOD, Alken et al. 2021); Tsyganenko (1989), Planet. Space Sci. 37, 5–20, eqs (11)–(20) and
 * Table 1, with Helios's reading of the print (table c₅ is the ring current, c₃/c₄ the closure terms, h₁'s sign as the
 * text and the paper's own numbers require, eq 17 without its stray x·z_r); Dormand & Prince (1980). */
"use strict";
(function () {
  const G = typeof self !== "undefined" ? self : window;
  const RE_KM = 6371.2, ALT_KM = 110, OUTER = 60, MAX_LEN = 400;

  // ───────────────────────── IGRF-14 ─────────────────────────
  const NMAX = 13, NPAIR = 104, idx = (n, m) => n * (n + 1) / 2 - 1 + m;
  const REC = new Float64Array(2 * NPAIR), DIAG = new Float64Array(NMAX + 1);
  for (let n = 1; n <= NMAX; n++) for (let m = 0; m < n; m++) {
    const k = idx(n, m), root = Math.sqrt(n * n - m * m);
    REC[2 * k] = (2 * n - 1) / root; REC[2 * k + 1] = Math.sqrt(Math.max(0, (n - 1) * (n - 1) - m * m)) / root;
  }
  for (let m = 2; m <= NMAX; m++) DIAG[m] = Math.sqrt((2 * m - 1) / (2 * m));
  function decimalYear(ms) {
    const y = new Date(ms).getUTCFullYear(), a = Date.UTC(y, 0, 1), b = Date.UTC(y + 1, 0, 1);
    return y + (ms - a) / (b - a);
  }
  /** The coefficients at a decimal year: linear between the five-year models, the secular variation past the last. */
  function igrfAt(t) {
    const T = G.IGRF14, last = T.epochs.length - 1, g = new Float64Array(NPAIR), h = new Float64Array(NPAIR);
    if (t >= T.epochs[last]) { const dt = t - T.epochs[last]; for (let k = 0; k < NPAIR; k++) { g[k] = T.g[last][k] + T.gSV[k] * dt; h[k] = T.h[last][k] + T.hSV[k] * dt; } }
    else if (t <= T.epochs[0]) { g.set(T.g[0]); h.set(T.h[0]); }
    else {
      const i = Math.min(Math.floor((t - T.epochs[0]) / 5), last - 1), f = (t - T.epochs[i]) / (T.epochs[i + 1] - T.epochs[i]);
      for (let k = 0; k < NPAIR; k++) { g[k] = T.g[i][k] + (T.g[i + 1][k] - T.g[i][k]) * f; h[k] = T.h[i][k] + (T.h[i + 1][k] - T.h[i][k]) * f; }
    }
    return { g, h };
  }
  /** B [nT] in GEO at r [Rₑ, GEO]: the Schmidt-normalized synthesis by the three-term recursions. */
  function igrfGEO(C, x0, y0, z0, out) {
    const g = C.g, h = C.h, rho = Math.hypot(x0, y0), rr = Math.hypot(rho, z0);
    const x = z0 / rr, s = rho / rr, cp = rho > 0 ? x0 / rho : 1, sp = rho > 0 ? y0 / rho : 0, ar = 1 / rr;
    let br = 0, bt = 0, bp = 0;
    let p2 = 0, p1 = 1, d2 = 0, d1 = 0, arn = ar * ar;
    for (let n = 1; n <= NMAX; n++) {
      const k = idx(n, 0), c1 = REC[2 * k], c2 = REC[2 * k + 1];
      const p = c1 * x * p1 - c2 * p2, d = c1 * (x * d1 - s * p1) - c2 * d2;
      arn *= ar;
      br += (n + 1) * arn * g[k] * p; bt -= arn * g[k] * d;
      p2 = p1; p1 = p; d2 = d1; d1 = d;
    }
    let qd = 1, dqd = 0, cm = cp, sm = sp, arD = ar * ar * ar;
    for (let m = 1; m <= NMAX; m++) {
      if (m > 1) {
        const f = DIAG[m], q = f * s * qd;
        dqd = f * (x * qd + s * dqd); qd = q;
        const c = cm * cp - sm * sp; sm = sm * cp + cm * sp; cm = c;
        arD *= ar;
      }
      let q2 = 0, q1 = qd, e2 = 0, e1 = dqd, an = arD;
      for (let n = m; ; ) {
        const k = idx(n, m), gk = g[k], hk = h[k], a = gk * cm + hk * sm, b = gk * sm - hk * cm;
        br += (n + 1) * an * a * s * q1; bt -= an * a * (x * q1 + s * e1); bp += an * m * b * q1;
        if (++n > NMAX) break;
        const kn = idx(n, m), c1 = REC[2 * kn], c2 = REC[2 * kn + 1];
        const q = c1 * x * q1 - c2 * q2, e = c1 * (x * e1 - s * q1) - c2 * e2;
        q2 = q1; q1 = q; e2 = e1; e1 = e; an *= ar;
      }
    }
    const hz = br * s + bt * x;
    out[0] = hz * cp - bp * sp; out[1] = hz * sp + bp * cp; out[2] = br * x - bt * s;
    return out;
  }

  // ───────────────────────── T89 (Tsyganenko 1989), GSM ─────────────────────────
  const T1 = {   // Table 1, columns Kp 0,0+ | 1−,1,1+ | 2−,2,2+ | 3−,3,3+ | 4−,4,4+ | ≥ 5−
    c1: [-98.72, -35.64, -77.45, -70.12, -162.5, -128.4], c2: [-10014, -12800, -14588, -16125, -15806, -16184],
    c3: [15.03, 14.37, 64.85, 90.71, 160.6, 149.1], c4: [76.62, 124.5, 123.9, 38.08, 5.888, 215.5],
    c5: [-10237, -13543, -16229, -19630, -27534, -36435], c6: [1.813, 2.316, 2.641, 3.181, 3.607, 4.090],
    c7: [31.10, 35.64, 42.46, 47.50, 51.10, 49.09], c8: [-0.07464, -0.0741, -0.07611, -0.1327, -0.1006, -0.0231],
    c9: [-0.07764, -0.1081, -0.1579, -0.1864, -0.1927, -0.1359], c10: [0.003303, 0.003924, 0.004078, 0.01382, 0.03353, 0.01989],
    c11: [-1.129, -1.451, -1.391, -1.488, -1.392, -2.298], c12: [0.001663, 0.00202, 0.00153, 0.002962, 0.001594, 0.004911],
    c13: [0.000988, 0.00111, 0.000727, 0.000897, 0.002439, 0.003421], c14: [18.21, 21.37, 21.86, 22.74, 22.41, 21.79],
    c15: [-0.03018, -0.04567, -0.04199, -0.04095, -0.04925, -0.05447], c16: [-0.03829, -0.05382, -0.06523, -0.09223, -0.1153, -0.1149],
    c17: [-0.1283, -0.1457, -0.6412, -1.059, -1.399, -0.2214], c18: [-0.001973, -0.002742, -0.000948, -0.001766, 0.000716, -0.01355],
    c19: [0.000717, 0.001244, 0.002276, 0.003034, 0.002696, 0.001185], dX: [24.74, 22.33, 20.90, 18.64, 18.31, 19.48],
    aRC: [8.161, 8.119, 6.283, 6.266, 6.196, 5.831], d0: [2.08, 1.664, 1.541, 0.9351, 0.7677, 0.3325],
    gRC: [-0.8799, 0.9324, 4.183, 5.389, 5.072, 6.472], rc: [9.084, 9.238, 9.609, 8.573, 10.06, 10.47],
    g: [3.838, 2.426, 6.591, 5.935, 6.668, 9.081], aT: [13.55, 13.81, 15.08, 15.63, 16.11, 15.85],
    dy: [26.94, 28.83, 30.57, 31.47, 30.04, 25.27], x0: [5.745, 6.052, 7.435, 8.103, 8.260, 7.976],
  };
  const LY = 10, DX = 13, LRC = 5, LT = 6.3, GT = 4, DELTA = 0.01, G1 = 1, RT = 30, X0C = 4, LXC2 = 50, DYC = 20;
  /** The interval holding Kp (decimal thirds): 0,0+ below 0.5, …, ≥ 5− from 4.5. */
  const kpLevel = (kp) => (isFinite(kp) && kp >= 0 ? Math.min(5, Math.floor(kp + 0.5)) : -1);
  function t89(L, x0, y0, z0, s, c, out) {
    const P = (k) => T1[k][L];
    const c1 = P("c1"), c2 = P("c2"), cRC = P("c5"), cs = P("c3"), ca = P("c4") * s;
    // the tail and ring currents, in SM
    const x = x0 * c - z0 * s, y = y0, z = x0 * s + z0 * c, y2 = y * y, tn = s / c;
    const xr = x + P("rc"), q = Math.sqrt(xr * xr + 16), ly4 = LY ** 4, y4 = y2 * y2, bd = y4 + ly4;
    const zs = 0.5 * tn * (xr - q) - P("g") * s * y4 / bd, dzx = 0.5 * tn * (1 - xr / q), dzy = -4 * P("g") * s * y2 * y * ly4 / (bd * bd), zr = z - zs;
    const rT = Math.sqrt(x * x + LT * LT), rR = Math.sqrt(x * x + LRC * LRC);
    const hT = 0.5 * (1 + x / rT), dhT = 0.5 * LT * LT / (rT * rT * rT), hR = 0.5 * (1 + x / rR), dhR = 0.5 * LRC * LRC / (rR * rR * rR);
    const x16 = x + 16, r16 = Math.sqrt(x16 * x16 + 36), h1 = 0.5 * (1 - x16 / r16), dh1 = -0.5 * 36 / (r16 * r16 * r16);
    const dT = P("d0") + DELTA * y2 + GT * hT + G1 * h1, dTx = GT * dhT + G1 * dh1, dTy = 2 * DELTA * y;
    const dR = P("d0") + P("gRC") * hR + G1 * h1, dRx = P("gRC") * dhR + G1 * dh1;
    const dy2 = P("dy") ** 2, xw = x - P("x0"), rw = Math.sqrt(xw * xw + DX * DX), fy = 1 / (1 + y2 / dy2);
    const w = 0.5 * (1 - xw / rw) * fy, dwx = -0.5 * DX * DX / (rw * rw * rw) * fy, dwy = -2 * y / dy2 * w * fy, rho2 = x * x + y2;
    const xiT = Math.sqrt(zr * zr + dT * dT), aT = P("aT") + xiT, sT = Math.sqrt(rho2 + aT * aT), uT = sT + aT, sT2 = sT * sT;
    const qT = w / (xiT * sT) * (c1 / uT + c2 / sT2);
    let bx = qT * x * zr, by = qT * y * zr;
    let bz = w / sT * (c1 + c2 * aT / sT2) + (x * dwx + y * dwy) / uT * (c1 + c2 / sT) + bx * dzx + by * dzy - qT * dT * (x * dTx + y * dTy);
    const xiR = Math.sqrt(zr * zr + dR * dR), aR = P("aRC") + xiR, sR = Math.sqrt(rho2 + aR * aR), sR2 = sR * sR, sR5 = sR2 * sR2 * sR;
    const qR = 3 * cRC * aR / (xiR * sR5), bxR = qR * x * zr, byR = qR * y * zr;
    const bzR = cRC * (2 * aR * aR - rho2) / sR5 + bxR * dzx + byR * dzy - qR * dR * x * dRx;
    bx += bxR; by += byR; bz += bzR;
    // SM → GSM
    let ox = bx * c + bz * s, oy = by, oz = -bx * s + bz * c;
    // the closure currents (eqs 18–19)
    const xc = x0 - X0C, rcl = Math.sqrt(xc * xc + LXC2), fyc = 1 / (1 + y0 * y0 / (DYC * DYC));
    const wc = 0.5 * (1 - xc / rcl) * fyc, dwcx = -0.5 * LXC2 / (rcl * rcl * rcl) * fyc, dwcy = -2 * y0 / (DYC * DYC) * wc * fyc;
    const gw = x0 * dwcx + y0 * dwcy, r2 = x0 * x0 + y0 * y0, tp = z0 + RT, tm = RT - z0;
    const sp = Math.sqrt(tp * tp + r2), sm = Math.sqrt(tm * tm + r2);
    const up = tp >= 0 ? sp + tp : r2 / (sp - tp), um = tm >= 0 ? sm + tm : r2 / (sm - tm);
    const ap = wc / (sp * up), am = wc / (sm * um);
    const fxp = ap * x0, fyp = ap * y0, fzp = wc / sp + gw / up, fxm = -am * x0, fym = -am * y0, fzm = wc / sm + gw / um;
    ox += cs * (fxp + fxm) + ca * (fxp - fxm); oy += cs * (fyp + fym) + ca * (fyp - fym); oz += cs * (fzp + fzm) + ca * (fzp - fzm);
    // the magnetopause and other sources (eq 20)
    const e = Math.exp(x0 / P("dX")), yy = y0 * y0, zz = z0 * z0;
    ox += e * (P("c6") * z0 * c + (P("c7") + P("c8") * yy + P("c9") * zz) * s);
    oy += e * (P("c10") * y0 * z0 * c + (P("c11") + P("c12") * yy + P("c13") * zz) * y0 * s);
    oz += e * ((P("c14") + P("c15") * yy + P("c16") * zz) * c + (P("c17") + P("c18") * yy + P("c19") * zz) * z0 * s);
    out[0] = ox; out[1] = oy; out[2] = oz;
    return out;
  }

  // ───────────────────────── WGS84 ─────────────────────────
  const WA = 6378.137, WB = 6378.137 * (1 - 1 / 298.257223563), E2 = 1 - WB * WB / (WA * WA), EP2 = WA * WA / (WB * WB) - 1;
  /** Geodetic latitude [deg] and altitude [km] of a GEO point [Rₑ] (Bowring, three iterations). */
  function geodetic(x, y, z) {
    const p = Math.hypot(x, y) * RE_KM, zk = z * RE_KM;
    let beta = Math.atan2(WA * zk, WB * p), phi = beta;
    for (let i = 0; i < 3; i++) {
      const sb = Math.sin(beta), cb = Math.cos(beta);
      phi = Math.atan2(zk + EP2 * WB * sb * sb * sb, p - E2 * WA * cb * cb * cb);
      beta = Math.atan2(WB * Math.sin(phi), WA * Math.cos(phi));
    }
    const sp = Math.sin(phi);
    return [phi * 180 / Math.PI, p * Math.cos(phi) + zk * sp - WA * Math.sqrt(1 - E2 * sp * sp)];
  }

  // ───────────────────────── the field at one time ─────────────────────────
  /** geo: the 3 × 3 GEO → GSE rotation (row-major, from MEC's frames); kp: the moment's Kp. Traces run in GSM. */
  function makeField(ms, geo, kp, altKm = ALT_KM) {
    const C = igrfAt(decimalYear(ms)), L = kpLevel(kp);
    // the dipole axis (IGRF degree 1, toward the northern geomagnetic pole) in GEO, then GSE
    const b0 = Math.hypot(C.g[0], C.g[1], C.h[1]), dg = [-C.g[1] / b0, -C.h[1] / b0, -C.g[0] / b0];
    const d = [geo[0] * dg[0] + geo[1] * dg[1] + geo[2] * dg[2], geo[3] * dg[0] + geo[4] * dg[1] + geo[5] * dg[2], geo[6] * dg[0] + geo[7] * dg[1] + geo[8] * dg[2]];
    // GSM in GSE: X the Sun, Y ⊥ the dipole, Z completes
    let Y = [d[1] * 0 - d[2] * 0, d[2] * 1 - d[0] * 0, d[0] * 0 - d[1] * 1];      // d × X̂
    const ny = Math.hypot(...Y); Y = Y.map(v => v / ny);
    const Z = [0, -Y[2], Y[1]];                                                     // X̂ × Y
    const s = d[0], c = Math.sqrt(1 - s * s);                                       // tilt ψ: sin ψ = d · X̂
    // GSM → GEO: GSE = [X Y Z]·gsm, GEO = geoᵀ·GSE
    const M = new Float64Array(9);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      const col = [[1, 0, 0], Y, Z][j];
      M[i * 3 + j] = geo[0 * 3 + i] * col[0] + geo[1 * 3 + i] * col[1] + geo[2 * 3 + i] * col[2];
    }
    const toGEO = (v) => [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]];
    const gseToGSM = (v) => [v[0], Y[0] * v[0] + Y[1] * v[1] + Y[2] * v[2], Z[0] * v[0] + Z[1] * v[1] + Z[2] * v[2]];
    const gsmToGSE = (v) => [v[0] + Y[0] * v[1] + Z[0] * v[2], Y[1] * v[1] + Z[1] * v[2], Y[2] * v[1] + Z[2] * v[2]];
    const smToGSM = (v) => [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
    const bi = new Float64Array(3), be = new Float64Array(3);
    /** The unit field direction (sign ±1) at a GSM point, or null where it is null or non-finite. */
    const dir = (r, sign) => {
      const gx = M[0] * r[0] + M[1] * r[1] + M[2] * r[2], gy = M[3] * r[0] + M[4] * r[1] + M[5] * r[2], gz = M[6] * r[0] + M[7] * r[1] + M[8] * r[2];
      igrfGEO(C, gx, gy, gz, bi);
      // GEO → GSM: Mᵀ
      let bx = M[0] * bi[0] + M[3] * bi[1] + M[6] * bi[2], by = M[1] * bi[0] + M[4] * bi[1] + M[7] * bi[2], bz = M[2] * bi[0] + M[5] * bi[1] + M[8] * bi[2];
      if (L >= 0) { t89(L, r[0], r[1], r[2], s, c, be); bx += be[0]; by += be[1]; bz += be[2]; }
      const m = Math.hypot(bx, by, bz);
      if (!isFinite(m) || m < 1e-9) return null;
      const k = sign / m;
      return [bx * k, by * k, bz * k];
    };
    const inner = (r) => { const g = toGEO(r); return (altKm - geodetic(g[0], g[1], g[2])[1]) / RE_KM; };
    const outer = (r) => Math.hypot(r[0], r[1], r[2]) - OUTER;
    return { dir, inner, outer, toGEO, gseToGSM, gsmToGSE, smToGSM, tiltDeg: Math.asin(s) * 180 / Math.PI, model: L >= 0 ? `IGRF-14 + T89, Kp level ${L}` : "IGRF-14" };
  }

  // ───────────────────────── Dormand–Prince 5(4) ─────────────────────────
  const A = [[], [1 / 5], [3 / 40, 9 / 40], [44 / 45, -56 / 15, 32 / 9], [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729],
             [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656]];
  const B5 = [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84], EE = [71 / 57600, 0, -71 / 16695, 71 / 1920, -17253 / 339200, 22 / 525, -1 / 40];
  function dpStep(y, h, k1, f) {
    const k = [k1];
    for (let st = 1; st < 6; st++) {
      const p = [y[0], y[1], y[2]];
      for (let j = 0; j < st; j++) { const a = A[st][j] * h; p[0] += a * k[j][0]; p[1] += a * k[j][1]; p[2] += a * k[j][2]; }
      const v = f(p); if (!v) return null; k.push(v);
    }
    const y5 = [y[0], y[1], y[2]];
    for (let j = 0; j < 6; j++) { const b = B5[j] * h; y5[0] += b * k[j][0]; y5[1] += b * k[j][1]; y5[2] += b * k[j][2]; }
    const k7 = f(y5); if (!k7) return null; k.push(k7);
    const err = [0, 0, 0];
    for (let j = 0; j < 7; j++) { const e = EE[j] * h; err[0] += e * k[j][0]; err[1] += e * k[j][1]; err[2] += e * k[j][2]; }
    return { y: y5, err, k7 };
  }
  const RTOL = 1e-9, ATOL = 1e-10;
  const errNorm = (e, a, b) => { let q = 0; for (let i = 0; i < 3; i++) { const sc = ATOL + RTOL * Math.max(Math.abs(a[i]), Math.abs(b[i])); q += (e[i] / sc) ** 2; } return Math.sqrt(q / 3); };
  /** One direction from the seed: to the inner surface (a foot), the outer sphere, or a limit. */
  function march(F, seed, sign) {
    if (F.inner(seed) > 0) return { stop: "inner", end: seed, pts: [] };
    if (F.outer(seed) > 0) return { stop: "outer", end: seed, pts: [] };
    const f = (r) => F.dir(r, sign);
    let y = seed, k1 = f(y), len = 0, steps = 0, rejected = false;
    if (!k1) return { stop: "null", pts: [] };
    let h = Math.min(0.01, 1, Math.max(0.1 * Math.hypot(...y), 1e-11));
    const pts = [];
    while (steps < 20000) {
      const rem = MAX_LEN - len;
      if (rem <= 0) return { stop: "maxLength", pts };
      h = Math.min(h, 1, Math.max(0.1 * Math.hypot(...y), 1e-11), rem);
      const s = dpStep(y, h, k1, f);
      if (!s) { if (h * 0.25 < 1e-11) return { stop: "null", pts }; h *= 0.25; rejected = true; continue; }
      const e = errNorm(s.err, y, s.y);
      if (!isFinite(e)) return { stop: "nonFinite", pts };
      if (e > 1) { h *= Math.max(0.2, 0.9 * Math.pow(e, -0.2)); rejected = true; if (h < 1e-11) return { stop: "underflow", pts }; continue; }
      const gi = F.inner(s.y), go = F.outer(s.y);
      if (gi >= 0 || go >= 0) {
        const g = gi >= 0 ? F.inner : F.outer, end = crossing(y, k1, h, g(y), g(s.y), s.y, g, f);
        pts.push(end);
        return { stop: gi >= 0 ? "inner" : "outer", end, pts };
      }
      len += h; y = s.y; k1 = s.k7; steps++; pts.push(y);
      const grow = rejected ? 1 : 5;
      h *= Math.min(grow, Math.max(0.2, e > 0 ? 0.9 * Math.pow(e, -0.2) : grow));
      rejected = false;
    }
    return { stop: "maxSteps", pts };
  }
  /** Where the step from y meets g = 0 (Illinois regula falsi on the step length). */
  function crossing(y, k1, h, g0, g1, end, g, f) {
    if (g0 >= 0) return y;
    if (g1 === 0) return end;
    let a = 0, ga = g0, b = h, gb = g1, best = end, bg = Math.abs(g1), side = 0;
    const tol = 1e-12 * (1 + Math.hypot(...y));
    for (let i = 0; i < 60; i++) {
      const tau = (a * gb - b * ga) / (gb - ga), t = tau > a && tau < b ? tau : 0.5 * (a + b);
      const s = dpStep(y, t, k1, f);
      if (!s) break;
      const gt = g(s.y);
      if (Math.abs(gt) < bg) { best = s.y; bg = Math.abs(gt); }
      if (Math.abs(gt) <= tol || b - a <= 1e-15 * (1 + h)) return s.y;
      if (gt < 0) { a = t; ga = gt; if (side === -1) gb *= 0.5; side = -1; } else { b = t; gb = gt; if (side === 1) ga *= 0.5; side = 1; }
    }
    return best;
  }
  // ───────────────────────── the line itself (FieldLineOverlay: thinned, loops, aroundSeed) ─────────────────────────
  const WINDING = 3;
  /** The local maxima of r along a polyline, a dip of at least h Rₑ between two of them. */
  function loops(pts, h = 0.3) {
    let n = 0, rising = true, ext = pts.length ? Math.hypot(...pts[0]) : 0;
    for (let i = 1; i < pts.length; i++) {
      const r = Math.hypot(...pts[i]);
      if (rising) { if (r > ext) ext = r; else if (r < ext - h) { n++; rising = false; ext = r; } }
      else { if (r < ext) ext = r; else if (r > ext + h) { rising = true; ext = r; } }
    }
    return n;
  }
  /** One loop either side of the seed: what the HSO draws of a winding line. */
  function aroundSeed(pts, seed, h = 0.3) {
    const end = (from, to, by) => {
      let rising = true, ext = Math.hypot(...pts[seed]), last = seed;
      for (let i = from; i !== to; i += by) {
        const r = Math.hypot(...pts[i]);
        last = i;
        if (rising) { if (r > ext) ext = r; else if (r < ext - h) { rising = false; ext = r; } }
        else { if (r < ext) ext = r; else if (r > ext + h) return i; }
      }
      return last;
    };
    return pts.slice(Math.min(end(seed - 1, -1, -1), seed), Math.max(end(seed + 1, pts.length, 1), seed) + 1);
  }
  function thinned(pts, keep, n = 240) {
    if (pts.length <= n) return pts;
    const step = Math.ceil((pts.length - 1) / (n - 1));
    return pts.filter((p, i) => i % step === 0 || i === pts.length - 1 || i === keep);
  }
  /** Both legs as one GSE polyline, south foot to north (the seed kept), winding lines cut to one loop each side. */
  function polyline(F, seed, fwd, bwd) {
    const pts = bwd.pts.slice().reverse().concat([seed], fwd.pts), k = bwd.pts.length, n = loops(pts);
    const kept = n >= WINDING ? aroundSeed(pts, k) : pts;
    return { line: thinned(kept, n >= WINDING ? null : k).map(p => F.gsmToGSE(p).map(v => +v.toFixed(4))), winds: n >= WINDING };
  }

  /** A craft's line: both feet (geodetic latitude, longitude, the GEO unit vector), the topology and, with withLine,
   *  the line in GSE. */
  function trace(F, gse, withLine) {
    const seed = F.gseToGSM(gse);
    if (F.inner(seed) > 1e-12) return { topology: "incomplete", north: null, south: null };
    const fwd = march(F, seed, 1), bwd = march(F, seed, -1);
    const foot = (leg) => {
      if (leg.stop !== "inner" || !leg.end) return null;
      const g = F.toGEO(leg.end), [lat] = geodetic(g[0], g[1], g[2]), r = Math.hypot(...g);
      return { lat, lon: Math.atan2(g[1], g[0]) * 180 / Math.PI, geo: g.map(v => v / r) };
    };
    const winds = loops(bwd.pts.slice().reverse().concat([seed], fwd.pts)) >= WINDING;
    const north = winds ? null : foot(fwd), south = winds ? null : foot(bwd);
    const topology = winds ? (fwd.stop === "inner" && bwd.stop === "inner" ? "closed" : "incomplete") : north && south ? "closed" : north && bwd.stop === "outer" ? "openNorth" : south && fwd.stop === "outer" ? "openSouth"
      : fwd.stop === "outer" && bwd.stop === "outer" ? "unknownOuter" : "incomplete";
    const out = { topology, north, south };
    if (withLine) Object.assign(out, polyline(F, seed, fwd, bwd));
    return out;
  }

  /** The noon–midnight reference family (FieldLineOverlay.referenceFamily): seeds at SM latitudes 62–82° on the
   *  110 km sphere, noon and midnight, north and south; a southern seed kept only when open (a closed one is the
   *  same loop as a northern seed's). */
  const REF_LATS = [62, 66, 70, 74, 78, 82];
  function referenceFamily(F) {
    const r0 = (1 + ALT_KM / RE_KM) * (1 + 1e-7), rIon = 1 + ALT_KM / RE_KM;
    const Fs = Object.assign({}, F, { inner: (r) => rIon - Math.hypot(r[0], r[1], r[2]) });
    const out = [];
    for (const side of ["noon", "midnight"]) for (const lat of REF_LATS) for (const hemi of ["north", "south"]) {
      const sx = side === "noon" ? 1 : -1, lam = lat * Math.PI / 180 * (hemi === "north" ? 1 : -1);
      const seed = F.smToGSM([sx * r0 * Math.cos(lam), 0, r0 * Math.sin(lam)]);
      const fwd = march(Fs, seed, 1), bwd = march(Fs, seed, -1);
      const nIn = fwd.stop === "inner", sIn = bwd.stop === "inner";
      const topology = nIn && sIn ? "closed" : nIn && bwd.stop === "outer" ? "openNorth" : sIn && fwd.stop === "outer" ? "openSouth"
        : fwd.stop === "outer" && bwd.stop === "outer" ? "unknownOuter" : "incomplete";
      if (hemi === "south" && topology === "closed") continue;
      out.push(Object.assign({ side, lat, hemi, topology }, polyline(F, seed, fwd, bwd)));
    }
    return out;
  }

  const api = { makeField, trace, referenceFamily, geodetic, igrfAt, igrfGEO, t89, kpLevel };
  G.FieldLines = api;

  // the worker: { id, jobs: [{ key, ms, geo, kp, seeds: [{ id, gse }] } | { key, ms, geo, kp, ref: true }] }
  //   → { id, results: { key: { lines: { craftId: line }, model, tiltDeg } | { ref: [line], model, tiltDeg } } }
  if (typeof importScripts === "function" && typeof window === "undefined") {
    importScripts("igrf14.js");
    self.onmessage = (ev) => {
      const { id, jobs } = ev.data, results = {};
      for (const j of jobs) {
        const F = makeField(j.ms, j.geo, j.kp);
        if (j.ref) { results[j.key] = { ref: referenceFamily(F), model: F.model, tiltDeg: F.tiltDeg }; continue; }
        const out = {};
        for (const s of j.seeds) out[s.id] = trace(F, s.gse);
        results[j.key] = { lines: out, model: F.model, tiltDeg: F.tiltDeg };
      }
      self.postMessage({ id, results });
    };
  }
})();
