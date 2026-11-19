/* The Jupiter view's numbers, ported from Helios (MMSTrackerCore/Analysis/Jupiter: JupiterFrame, JupiterField,
   JRM33Coefficients, JupiterMagnetosphere; MMSTrackerMac/Hero/JupiterRung.swift's JupiterScene). Nothing here draws:
   hsoview.js does.

   Frames. JSO: +X from Jupiter to the Sun, +Z north of Jupiter's orbit, +Y = Z × X (dusk). JSS: +Z the spin axis, +X the
   Sun's direction square to it. System III (1965), IAU 2015: right-handed, east longitude positive; the literature's
   λ_III is west, 360° − east. Lengths are R_J = 71,492 km. Times are UT milliseconds.

   Models. Magnetopause and bow shock: Joy et al. 2002. Current sheet: Khurana & Schwarzl 2005. Io plasma torus: Phipps &
   Bagenal 2021 (where) and Phipps & Withers 2017 (how dense). Field: JRM33 to degree 13 (Connerney et al. 2022) with the
   Con2020 magnetodisc (Connerney et al. 2020) in Edwards et al. 2001's analytic form, as libcon2020 (MIT, © 2022 Matt
   James; used under the MIT license, whose notice travels with Helios's credits) carries it. Footprint lead angles: Hue et al. 2023. Moon plasma: Kivelson et al. 2004. Ganymede: Kivelson et al.
   2002, Kaweeyanun et al. 2020.

   Positions. The app asks JPL Horizons for each moment; a page cannot (Horizons sends no cross-origin header). So
   assets/data/jupiter.json holds Horizons states of the four moons every 32 days and of Juno at about 17 instants an
   orbit, and the page flies them between: the moons together under Jupiter's mass, J2 and J4, each other and the Sun;
   Juno under those and J6. tools/jupiter_check.js holds the comparison with fresh Horizons values. */
(function () {
  "use strict";
  const DEG = Math.PI / 180, TAU = 2 * Math.PI;
  const RJ = 71492, RP = 66854, MU = 126686531.9;        // km (IAU 2015 1-bar radii), km³/s² (Jupiter alone, JUP365)
  const AU_KM = 149597870.7, C_KM_S = 299792.458;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const len = (a) => Math.hypot(a[0], a[1], a[2]);
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const scl = (a, s) => [a[0] * s, a[1] * s, a[2] * s], unit = (a) => scl(a, 1 / len(a));
  const apply = (m, v) => [dot(m[0], v), dot(m[1], v), dot(m[2], v)];
  const transpose = (m) => [0, 1, 2].map(i => [0, 1, 2].map(j => m[j][i]));
  const rotZ = (p, a) => [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a), p[2]];
  const east360 = (p) => (Math.atan2(p[1], p[0]) / DEG + 360) % 360;
  const west = (east) => ((360 - east) % 360 + 360) % 360;

  // ───────────────────────── frames ─────────────────────────
  // JPL's approximate elements (Standish, Table 1): a, e, I, L, ϖ, Ω and their rates per century
  const ELEM = {
    earth: [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0, 0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0],
    jupiter: [5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909, -0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106],
  };
  const J2000 = Date.UTC(2000, 0, 1, 12);
  function elementsAt(name, ms) {
    const E = ELEM[name], T = (ms - J2000) / 864e5 / 36525, el = E.slice(0, 6).map((v, i) => v + E[i + 6] * T);
    return { a: el[0], e: el[1], I: el[2] * DEG, L: el[3] * DEG, w: el[4] * DEG, O: el[5] * DEG };
  }
  /** Heliocentric ecliptic J2000 position, AU. */
  function planet(name, ms) {
    const el = elementsAt(name, ms), M = ((el.L - el.w) % TAU + 3 * Math.PI) % TAU - Math.PI;
    let Ea = M + el.e * Math.sin(M);
    for (let k = 0; k < 12; k++) Ea -= (Ea - el.e * Math.sin(Ea) - M) / (1 - el.e * Math.cos(Ea));
    const om = el.w - el.O, xp = el.a * (Math.cos(Ea) - el.e), yp = el.a * Math.sqrt(1 - el.e * el.e) * Math.sin(Ea);
    const co = Math.cos(om), so = Math.sin(om), cO = Math.cos(el.O), sO = Math.sin(el.O), cI = Math.cos(el.I), sI = Math.sin(el.I);
    return [(co * cO - so * sO * cI) * xp + (-so * cO - co * sO * cI) * yp, (co * sO + so * cO * cI) * xp + (-so * sO + co * cO * cI) * yp, so * sI * xp + co * sI * yp];
  }
  const OBLIQUITY = 23.4392911 * DEG;                     // J2000 (IAU 1976)
  const eclFromEq = (v) => [v[0], Math.cos(OBLIQUITY) * v[1] + Math.sin(OBLIQUITY) * v[2], -Math.sin(OBLIQUITY) * v[1] + Math.cos(OBLIQUITY) * v[2]];
  /** TT − UTC, s: 32.184 plus the leap seconds (36 from July 2015, 37 from January 2017; 35 before). */
  const ttMinusUtc = (ms) => (ms < Date.UTC(2015, 6, 1) ? 67.184 : ms < Date.UTC(2017, 0, 1) ? 68.184 : 69.184);
  /** The IAU 2015 pole and prime meridian of Jupiter, degrees (Archinal et al. 2018; NAIF pck00011). W turns with
   *  System III (1965): 870.536° a day, 9 h 55 m 29.71 s a turn. */
  function iau(ms) {
    const d = (ms - J2000 + ttMinusUtc(ms) * 1000) / 864e5, T = d / 36525, a = (p, q) => (p + q * T) * DEG;
    const ja = a(99.360714, 4850.4046), jb = a(175.895369, 1191.9605), jc = a(300.323162, 262.5475), jd = a(114.012305, 6070.2476), je = a(49.511251, 64.3000);
    return {
      ra: 268.056595 - 0.006499 * T + 0.000117 * Math.sin(ja) + 0.000938 * Math.sin(jb) + 0.001432 * Math.sin(jc) + 0.000030 * Math.sin(jd) + 0.002150 * Math.sin(je),
      dec: 64.495303 + 0.002413 * T + 0.000050 * Math.cos(ja) + 0.000404 * Math.cos(jb) + 0.000617 * Math.cos(jc) - 0.000013 * Math.cos(jd) + 0.000926 * Math.cos(je),
      w: ((284.95 + 870.536 * d) % 360 + 360) % 360,
    };
  }
  /** System III's axes in ecliptic J2000: W is measured from the node of Jupiter's equator on the ICRF equator. */
  function body(ms) {
    const A = iau(ms), ra = A.ra * DEG, dec = A.dec * DEG, w = A.w * DEG;
    const p = [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
    const n = unit(cross([0, 0, 1], p)), q = cross(p, n), xb = add(scl(n, Math.cos(w)), scl(q, Math.sin(w)));
    return { x: eclFromEq(xb), y: eclFromEq(cross(p, xb)), z: eclFromEq(p) };
  }
  function jso(ms) {
    const r = planet("jupiter", ms), el = elementsAt("jupiter", ms);
    const h = [Math.sin(el.I) * Math.sin(el.O), -Math.sin(el.I) * Math.cos(el.O), Math.cos(el.I)];
    const x = scl(r, -1 / len(r)), z = unit(sub(h, scl(x, dot(h, x))));
    return { x, y: cross(z, x), z };
  }
  /** The frame of Joy et al. 2002: the spin axis, and the Sun's direction square to it. */
  function jss(ms) {
    const z = body(ms).z, s = jso(ms).x, x = unit(sub(s, scl(z, dot(z, s))));
    return { x, y: cross(z, x), z };
  }
  const components = (B, v) => [dot(B.x, v), dot(B.y, v), dot(B.z, v)];
  const vectorOf = (B, c) => [0, 1, 2].map(k => B.x[k] * c[0] + B.y[k] * c[1] + B.z[k] * c[2]);
  /** Row-major: element [i][j] = aᵢ · bⱼ, taking b's components to a's. */
  const matrix = (a, b) => [a.x, a.y, a.z].map(r => [b.x, b.y, b.z].map(c => dot(r, c)));
  /** The Sun's latitude above Jupiter's equator, radians (±3.1° over the orbit). */
  const solarLatitude = (ms) => Math.asin(clamp(dot(body(ms).z, jso(ms).x), -1, 1));
  /** The subsolar point: planetocentric latitude and EAST longitude, degrees. */
  function subsolar(ms) { const s = components(body(ms), jso(ms).x); return { lat: Math.asin(clamp(s[2], -1, 1)) / DEG, lon: east360(s) }; }
  const earthDistance = (ms) => len(sub(planet("earth", ms), planet("jupiter", ms)));
  /** The central meridian Earth sees at ms (west longitude): the sub-Earth point one light time earlier. */
  function cml(ms) {
    const au = earthDistance(ms), emitted = ms - au * 499.004784 * 1000;
    return west(east360(components(body(emitted), sub(planet("earth", ms), planet("jupiter", emitted)))));
  }

  // ───────────────────────── the magnetopause and bow shock (Joy et al. 2002) ─────────────────────────
  // z² = A + Bx + Cx² + Dy + Ey² + Fxy in JSS, lengths in units of 120 R_J; A, B, C linear in P^(−1/4) and D, E, F linear
  // in P, the solar wind's dynamic pressure in nPa. Each row: [constant, slope] for A … F.
  const JOY = {
    mp: [[-0.134, 0.488], [-0.581, -0.225], [-0.186, -0.016], [-0.014, 0.096], [-0.814, -0.811], [-0.050, 0.168]],
    bs: [[-1.107, 1.591], [-0.566, -0.812], [0.048, -0.059], [0.077, -0.038], [-0.874, -0.299], [-0.055, 0.124]],
  };
  const PRESSURE = { min: 0.02, max: 0.6, typical: 0.071 };   // the fit's range; the median wind (Rutala et al. 2025)
  const TAIL_LIMIT = -300;
  const clampP = (p) => clamp(p, PRESSURE.min, PRESSURE.max);
  function joyAt(kind, p) {
    const q = Math.pow(p, -0.25), K = JOY[kind];
    return [K[0][0] + K[0][1] * q, K[1][0] + K[1][1] * q, K[2][0] + K[2][1] * q, K[3][0] + K[3][1] * p, K[4][0] + K[4][1] * p, K[5][0] + K[5][1] * p];
  }
  /** The surface's distance, R_J, along the JSS direction θ from +X and φ from +Z toward dawn (−Y); null where there is none. */
  function joyRadius(kind, p, theta, phi) {
    const [A, B, C, D, E, F] = joyAt(kind, clampP(p)), st = Math.sin(theta), ct = Math.cos(theta), sf = Math.sin(phi), cf = Math.cos(phi);
    const a2 = C * ct * ct + E * st * st * sf * sf - F * st * ct * sf - st * st * cf * cf, b2 = B * ct - D * st * sf, disc = b2 * b2 - 4 * a2 * A;
    if (!(disc >= 0) || Math.abs(a2) <= 1e-12) return null;
    const r = (-b2 - Math.sqrt(disc)) / (2 * a2);
    return r > 0 ? r * 120 : null;
  }
  const standoff = (kind, p) => joyRadius(kind, p, 0, 0);
  function joyPoint(kind, p, theta, phi) {
    const r = joyRadius(kind, p, theta, phi);
    return r === null ? null : [r * Math.cos(theta), -r * Math.sin(theta) * Math.sin(phi), r * Math.sin(theta) * Math.cos(phi)];
  }
  /** The cross-section at JSS x (R_J), round the axis from +Y toward +Z; null past the tail's closure. */
  function joyRing(kind, p, x, n = 96) {
    const [A, B, C, D, E, F] = joyAt(kind, clampP(p)), xs = x / 120, rhs = A + B * xs + C * xs * xs;
    if (!(rhs > 0)) return null;
    return Array.from({ length: n + 1 }, (_, i) => {
      const psi = TAU * i / n, cp = Math.cos(psi), sp = Math.sin(psi), a = sp * sp - E * cp * cp, bq = cp * (D + F * xs);
      const rho = (bq + Math.sqrt(bq * bq + 4 * a * rhs)) / (2 * a);
      return [x, 120 * rho * cp, 120 * rho * sp];
    });
  }
  function joyCut(kind, p, phi, n = 160) {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const q = joyPoint(kind, p, i / n * 0.97 * Math.PI, phi);
      if (!q) break;
      out.push(q);
      if (q[0] < TAIL_LIMIT) break;
    }
    return out;
  }
  /** One surface's lines in JSO: its cut by JSO's equator (the bold outline), five meridians and rings down the tail. */
  function wire(kind, p, jssToJso) {
    const toJss = transpose(jssToJso), loop = [];
    for (let i = 0; i <= 320; i++) {
      const a = Math.PI * 0.97 * (1 - 2 * i / 320), d = [Math.cos(a), Math.sin(a), 0], j = apply(toJss, d);
      const r = joyRadius(kind, p, Math.acos(clamp(j[0], -1, 1)), Math.atan2(-j[1], j[2]));
      if (r !== null && d[0] * r >= TAIL_LIMIT) loop.push(scl(d, r));
    }
    const through = (phi) => joyCut(kind, p, phi + Math.PI).map(q => apply(jssToJso, q)).reverse().concat(joyCut(kind, p, phi).map(q => apply(jssToJso, q)).slice(1));
    const rings = [];
    for (const x of [0, -50, -100, -150, -200, -250]) { const r = joyRing(kind, p, x); if (r) rings.push({ x, pts: r.map(q => apply(jssToJso, q)) }); }
    return { loop, meridians: [30, 60, 90, 120, 150].map(d => through(d * DEG - Math.PI / 2)), rings };
  }

  // ───────────────────────── the current sheet (Khurana & Schwarzl 2005) ─────────────────────────
  const SHEET = { hinge: 47, tilt: 9.52 * DEG, northEast: 339.23 * DEG, b0: 0.0379406, c1: 1.340456, rho2: 83.36 };
  /** The sheet's height above the rotational equator, R_J, at JSS (x, y) whose System III east longitude is `east`
   *  (radians), with the Sun `sunLat` (radians) above the equator. */
  function sheetZ(x, y, east, sunLat) {
    const rho = Math.hypot(x, y), rho1 = Math.hypot(SHEET.hinge * Math.tanh(Math.abs(x) / SHEET.hinge), y);
    const delay = SHEET.b0 - SHEET.c1 * Math.log(Math.cosh(rho / SHEET.rho2));
    const hinge = Math.abs(x) > 1e-6 ? x * (1 - Math.tanh(Math.abs(SHEET.hinge / x))) * Math.tan(sunLat) : 0;
    return rho1 * Math.tan(SHEET.tilt) * Math.cos(east - (SHEET.northEast + delay)) + hinge;
  }

  // ───────────────────────── the Io plasma torus ─────────────────────────
  /** The centrifugal equator's latitude, degrees, at r (R_J) and System III EAST longitude (degrees): Phipps & Bagenal
   *  2021, eq. 2. */
  const centrifugalLatitude = (r, east) => (1.66 * Math.tanh(0.131 * r - 1.62) + 7.76) * Math.sin((east - 249) * DEG);
  // Phipps & Withers 2017, Table 2: peak density cm⁻³, scale height, center and width (R_J)
  const TORUS = { cold: [1710, 0.1, 5.23, 0.20], ribbon: [2180, 0.6, 5.60, 0.08], warm: [2160, 1.0, 5.89, 0.32], extended: [1601, 1.0, 5.53, 1.88] };
  /** Electron density, cm⁻³, at R (R_J) in the centrifugal equator and z off it. */
  function torusDensity(R, z) {
    const g = (k, h) => k[0] * Math.exp(-(((R - k[2]) / k[3]) ** 2)) * Math.exp(-((z / h) ** 2));
    return R < 6.1 ? g(TORUS.cold, 0.1) + g(TORUS.ribbon, 0.6) + g(TORUS.warm, 1.0) : g(TORUS.extended, 1.0);
  }

  // ───────────────────────── the field: JRM33 and Con2020 ─────────────────────────
  // JRM33 (Connerney et al. 2022), Schmidt semi-normalized Gauss coefficients in nT at R_J = 71,492 km, degrees 1–13,
  // from the PDS release JNO-J-3-FGM-CAL-V1.0 (JRM33.MOD), indexed n(n+1)/2 − 1 + m.
  const G = [410993.4, -71305.9, 11796.7, -56972.4, 48250.2, 2799.3, -37488.4, 15396.8, -1489.8, -34402.0, -8080.8, -2440.5, -10848.3, -17919.1, -18265.7, 4221.8,
    16599.5, -17345.8, -2544.5, -4987.7, -20968.0, 9887.6, 12192.4, -12548.7, 2742.2, 1557.6, 8018.2, 59.9, 5366.1, -7099.5, -1533.4, -7055.7,
    3060.6, -2488.3, 3700.8, 10849.5, 1323.8, -6952.2, -95.0, -4746.6, -1301.7, -4284.6, -1436.7, -3024.6, 8914.4, -3506.7, 288.1, 773.6,
    3592.7, -3170.8, 1406.3, -1526.6, 1313.3, -2314.6, -2516.5, 1883.2, 2836.1, 4259.4, 3776.7, 764.4, 2112.3, 724.8, 2496.3, 840.1,
    1179.4, 1311.6, 3056.9, -2060.6, 3550.1, 589.7, 194.8, -1073.3, -521.7, 685.3, 350.2, -326.6, 1088.8, 2300.5, 1688.4, -291.7,
    483.2, -581.9, -818.4, -1095.6, -1987.8, 484.5, -1473.1, -666.5, -755.4, -220.8, 751.5, -456.4, 1160.4, -2307.8, -77.1, -16.9,
    594.8, -950.7, 1042.3, -641.8, 41.6, -229.1, -40.3, -287.8];
  const Hc = [0.0, 20958.4, 0.0, -42549.0, 20221.5, 0.0, -32890.6, 42518.4, -27397.7, 0.0, 32452.4, 27438.6, -501.4, -1325.1, 0.0, 45363.1,
    -826.2, 6000.6, 10568.8, 10091.5, 0.0, 14016.9, -10119.1, -294.9, 13948.3, -3686.9, 4783.1, 0.0, -7654.8, -11398.6, 2171.0, 5301.6,
    -6618.1, -1933.8, -5802.9, 0.0, -2297.4, -12833.5, 10019.6, -1725.6, 2387.1, -3237.1, 906.1, -3178.3, 0.0, -7899.6, -1328.3, 6566.5,
    -1275.3, 3617.1, -194.8, 1960.3, 956.9, 1831.7, 0.0, -5689.8, 5570.3, -2541.6, -1795.2, -217.8, -628.3, -1619.6, 454.6, -840.0,
    1581.4, 0.0, 549.1, 4527.6, -4223.0, -2761.9, -476.0, -2714.4, -1349.2, -1649.0, -1471.5, -583.0, -499.8, 0.0, 4204.2, 2228.0,
    -1901.1, -1271.2, 1073.4, -1111.9, 872.9, -837.9, -462.8, -22.0, 110.3, -712.7, 0.0, 4125.6, -44.0, -455.4, 2160.6, 255.4,
    1105.1, 1214.2, 196.1, -207.7, 1195.7, 472.4, 721.6, 51.3];
  const NMAX = 13, idx = (n, m) => n * (n + 1) / 2 - 1 + m;
  const REC = new Float64Array(2 * (idx(NMAX, NMAX) + 1)), DIAG = new Float64Array(NMAX + 1);
  for (let n = 1; n <= NMAX; n++) for (let m = 0; m < n; m++) {
    const k = idx(n, m), root = Math.sqrt(n * n - m * m);
    REC[2 * k] = (2 * n - 1) / root; REC[2 * k + 1] = Math.sqrt(Math.max(0, (n - 1) * (n - 1) - m * m)) / root;
  }
  for (let m = 2; m <= NMAX; m++) DIAG[m] = Math.sqrt((2 * m - 1) / (2 * m));
  /** JRM33, nT, at r (System III, R_J), to degree N: the Schmidt series summed on Q = P/sin θ so the pole is regular. */
  function internalField(r, N = NMAX) {
    const rho2 = r[0] * r[0] + r[1] * r[1], rho = Math.sqrt(rho2), rr = Math.sqrt(rho2 + r[2] * r[2]);
    if (!(rr > 0)) return [0, 0, 0];
    const x = r[2] / rr, s = rho / rr, cp = rho > 0 ? r[0] / rho : 1, sp = rho > 0 ? r[1] / rho : 0, ar = 1 / rr;
    let br = 0, bt = 0, bp = 0, p2 = 0, p1 = 1, d2 = 0, d1 = 0, arn = ar * ar;
    for (let n = 1; n <= N; n++) {
      const k = idx(n, 0), c1 = REC[2 * k], c2 = REC[2 * k + 1], p = c1 * x * p1 - c2 * p2, d = c1 * (x * d1 - s * p1) - c2 * d2;
      arn *= ar; br += (n + 1) * arn * G[k] * p; bt -= arn * G[k] * d;
      p2 = p1; p1 = p; d2 = d1; d1 = d;
    }
    let qd = 1, dqd = 0, cm = cp, sm = sp, arDiag = ar * ar * ar;
    for (let m = 1; m <= N; m++) {
      if (m > 1) {
        const f = DIAG[m], q = f * s * qd;
        dqd = f * (x * qd + s * dqd); qd = q;
        const c = cm * cp - sm * sp; sm = sm * cp + cm * sp; cm = c;
        arDiag *= ar;
      }
      let q2 = 0, q1 = qd, e2 = 0, e1 = dqd, an = arDiag;
      for (let n = m; ; ) {
        const k = idx(n, m), a = G[k] * cm + Hc[k] * sm, b = G[k] * sm - Hc[k] * cm;
        br += (n + 1) * an * a * s * q1; bt -= an * a * (x * q1 + s * e1); bp += an * m * b * q1;
        if (++n > N) break;
        const kn = idx(n, m), c1 = REC[2 * kn], c2 = REC[2 * kn + 1], q = c1 * x * q1 - c2 * q2, e = c1 * (x * e1 - s * q1) - c2 * e2;
        q2 = q1; q1 = q; e2 = e1; e1 = e; an *= ar;
      }
    }
    const hz = br * s + bt * x;
    return [hz * cp - bp * sp, hz * sp + bp * cp, br * x - bt * s];
  }
  const DIPOLE = (() => { const m = [G[1], Hc[1], G[0]], B = len(m); return { nT: B, axis: scl(m, 1 / B), tilt: Math.acos(m[2] / B) / DEG, west: west(east360(m)) }; })();

  // Con2020 (Connerney et al. 2020, Table 1): a washer of azimuthal current from R0 to R1, half-thickness D, μ0I/2 in
  // nT, its normal tilted from the spin axis toward a right-handed System III longitude.
  const DISC = { mui: 139.6, r0: 7.8, r1: 51.4, d: 3.6, tilt: 9.3, lon: 155.8 };
  /** Edwards, Bunce & Cowley 2001: (B_ρ, B_z) of a semi-infinite disc from radius a (eqs. 9 inside a, 13 outside). */
  function edwards(rho, z, a) {
    const d = DISC.d, a2 = a * a, zmd = z - d, zpd = z + d;
    if (rho >= a) {
      const f1 = Math.hypot(zmd, rho), f2 = Math.hypot(zpd, rho), f13 = f1 * f1 * f1, f23 = f2 * f2 * f2;
      return [DISC.mui * ((f1 - f2) / rho + (rho * a2 / 4) * (1 / f23 - 1 / f13) + (2 / rho) * clamp(z, -d, d)),
              DISC.mui * (Math.log((zpd + f2) / (zmd + f1)) + (a2 / 4) * (zpd / f23 - zmd / f13))];
    }
    const f1 = Math.hypot(zmd, a), f2 = Math.hypot(zpd, a), f13 = f1 * f1 * f1, f23 = f2 * f2 * f2;
    const f3 = (a2 - 2 * zmd * zmd) / (f1 ** 5), f4 = (a2 - 2 * zpd * zpd) / (f2 ** 5), h = rho / 2;
    return [DISC.mui * (h * (1 / f1 - 1 / f2) + h * h * h / 2 * (f3 - f4)),
            DISC.mui * (Math.log((zpd + f2) / (zmd + f1)) + h * h * (zpd / f23 - zmd / f13))];
  }
  /** The disc's field, nT, at r (System III, R_J). The azimuthal (radial-current) term is left out, as in the app. */
  function discField(r) {
    const xs = (DISC.lon - 180) * DEG, xt = DISC.tilt * DEG, cxp = Math.cos(xs), sxp = Math.sin(xs), cxt = Math.cos(xt), sxt = Math.sin(xt);
    const rho0 = Math.hypot(r[0], r[1]), cp = rho0 > 0 ? r[0] / rho0 : 0, sp = rho0 > 0 ? r[1] / rho0 : 0;
    const xtmp = rho0 * (cp * cxp + sp * sxp), y1 = rho0 * (sp * cxp - cp * sxp), x1 = xtmp * cxt + r[2] * sxt, z1 = r[2] * cxt - xtmp * sxt;
    const rho = Math.hypot(x1, y1), inner = edwards(rho, z1, DISC.r0), outer = edwards(rho, z1, DISC.r1);
    const brho = inner[0] - outer[0], bz1 = inner[1] - outer[1], cp1 = rho > 0 ? x1 / rho : 0, sp1 = rho > 0 ? y1 / rho : 0;
    const bx1 = brho * cp1, by1 = brho * sp1, bx = bx1 * cxt - bz1 * sxt;
    return [bx * cxp - by1 * sxp, by1 * cxp + bx * sxp, bx1 * sxt + bz1 * cxt];
  }
  const field = (r) => add(internalField(r), discField(r));

  // ───────────────────────── field lines: Dormand–Prince 5(4), both ways from a seed ─────────────────────────
  const DP = { a21: 1 / 5, a31: 3 / 40, a32: 9 / 40, a41: 44 / 45, a42: -56 / 15, a43: 32 / 9, a51: 19372 / 6561, a52: -25360 / 2187, a53: 64448 / 6561, a54: -212 / 729,
    a61: 9017 / 3168, a62: -355 / 33, a63: 46732 / 5247, a64: 49 / 176, a65: -5103 / 18656, b1: 35 / 384, b3: 500 / 1113, b4: 125 / 192, b5: -2187 / 6784, b6: 11 / 84,
    e1: 71 / 57600, e3: -71 / 16695, e4: 71 / 1920, e5: -17253 / 339200, e6: 22 / 525, e7: -1 / 40 };
  function dpStep(y, h, k1, f) {
    const at = (c) => { const o = [y[0], y[1], y[2]]; for (const [k, w] of c) { o[0] += h * w * k[0]; o[1] += h * w * k[1]; o[2] += h * w * k[2]; } return o; };
    const k2 = f(at([[k1, DP.a21]])); if (!k2) return null;
    const k3 = f(at([[k1, DP.a31], [k2, DP.a32]])); if (!k3) return null;
    const k4 = f(at([[k1, DP.a41], [k2, DP.a42], [k3, DP.a43]])); if (!k4) return null;
    const k5 = f(at([[k1, DP.a51], [k2, DP.a52], [k3, DP.a53], [k4, DP.a54]])); if (!k5) return null;
    const k6 = f(at([[k1, DP.a61], [k2, DP.a62], [k3, DP.a63], [k4, DP.a64], [k5, DP.a65]])); if (!k6) return null;
    const y5 = at([[k1, DP.b1], [k3, DP.b3], [k4, DP.b4], [k5, DP.b5], [k6, DP.b6]]), k7 = f(y5); if (!k7) return null;
    const err = [0, 1, 2].map(i => h * (DP.e1 * k1[i] + DP.e3 * k3[i] + DP.e4 * k4[i] + DP.e5 * k5[i] + DP.e6 * k6[i] + DP.e7 * k7[i]));
    return { y: y5, err, k7 };
  }
  const TRACE = { rtol: 1e-7, atol: 1e-8, initialStep: 0.01, minStep: 1e-11, maxStep: 0.5, maxStepFraction: 0.08, maxSteps: 20000, maxLength: 800, minField: 1e-6 };
  /** One direction from the seed: points after the seed and why it stopped ("inner", "outer" or a limit). `inner` and
   *  `outer` are signed distances, negative inside the traced region. */
  function march(seed, sign, fieldAt, inner, outer, o) {
    const dir = (r) => { const b = fieldAt(r), m = len(b); return isFinite(m) && m >= o.minField ? scl(b, sign / m) : null; };
    if (inner(seed) > 0) return { points: [seed], stop: "inner" };
    if (outer(seed) > 0) return { points: [seed], stop: "outer" };
    let y = seed, k1 = dir(y), length = 0, accepted = 0, rejected = false;
    const points = [];
    if (!k1) return { points, stop: "null" };
    let h = Math.min(o.initialStep, o.maxStep, Math.max(o.maxStepFraction * len(y), o.minStep));
    for (;;) {
      if (accepted >= o.maxSteps) return { points, stop: "maxSteps" };
      const remaining = o.maxLength - length;
      if (remaining <= 0) return { points, stop: "maxLength" };
      h = Math.min(h, o.maxStep, Math.max(o.maxStepFraction * len(y), o.minStep), remaining);
      const s = dpStep(y, h, k1, dir);
      if (!s) { if (h * 0.25 < o.minStep) return { points, stop: "null" }; h *= 0.25; rejected = true; continue; }
      let q = 0;
      for (let i = 0; i < 3; i++) { const e = s.err[i] / (o.atol + o.rtol * Math.max(Math.abs(y[i]), Math.abs(s.y[i]))); q += e * e; }
      const err = Math.sqrt(q / 3);
      if (!isFinite(err)) return { points, stop: "nonFinite" };
      if (err > 1) { h *= Math.max(0.2, 0.9 * Math.pow(err, -0.2)); rejected = true; if (h < o.minStep) return { points, stop: "underflow" }; continue; }
      const gIn = inner(s.y), gOut = outer(s.y);
      if (gIn >= 0 || gOut >= 0) {                           // the step left the region: re-take it, shorter, onto the surface
        const g = gIn >= 0 ? inner : outer, tol = 1e-12 * (1 + len(y));
        let a = 0, ga = g(y), b = h, gb = g(s.y), best = s.y, bestG = Math.abs(gb), side = 0;
        if (ga < 0 && gb !== 0) for (let it = 0; it < 60; it++) {
          const tau = (a * gb - b * ga) / (gb - ga), t = tau > a && tau < b ? tau : 0.5 * (a + b), st = dpStep(y, t, k1, dir);
          if (!st) break;
          const gt = g(st.y);
          if (Math.abs(gt) < bestG) { best = st.y; bestG = Math.abs(gt); }
          if (Math.abs(gt) <= tol || b - a <= 1e-15 * (1 + h)) { best = st.y; break; }
          if (gt < 0) { a = t; ga = gt; if (side === -1) gb *= 0.5; side = -1; } else { b = t; gb = gt; if (side === 1) ga *= 0.5; side = 1; }
        } else if (ga >= 0) best = y;
        points.push(best);
        return { points, stop: gIn >= 0 ? "inner" : "outer" };
      }
      length += h; y = s.y; k1 = s.k7; points.push(y); accepted++;
      const grow = rejected ? 1 : 5;
      h *= Math.min(grow, Math.max(0.2, err > 0 ? 0.9 * Math.pow(err, -0.2) : grow));
      rejected = false;
    }
  }
  function trace(seed, fieldAt, inner, outer, opt) {
    const o = Object.assign({}, TRACE, opt), f = march(seed, 1, fieldAt, inner, outer, o), b = march(seed, -1, fieldAt, inner, outer, o);
    return { points: b.points.slice().reverse().concat([seed], f.points), forward: f, backward: b };
  }
  /** The 1-bar spheroid raised by `alt` km: positive below it. */
  function spheroid(alt) {
    const a = 1 + alt / RJ, k = a / ((RP + alt) / RJ);
    return (p) => a - Math.hypot(p[0], p[1], p[2] * k);
  }
  /** The JRM33 + Con2020 line through r (System III, R_J), south end to north end, and where each end lands on the
   *  spheroid raised by `alt` km (null when it leaves through `outer` R_J instead). */
  function line(r, alt = 0, outer = 120) {
    const l = trace(r, field, spheroid(alt), (p) => len(p) - outer);
    const landed = (leg) => (leg.stop === "inner" ? leg.points[leg.points.length - 1] : null);
    let pts = l.points, n = landed(l.forward), s = landed(l.backward);
    if (pts[pts.length - 1][2] < pts[0][2]) { pts = pts.slice().reverse(); [n, s] = [s, n]; }
    if (n && n[2] < 0) [n, s] = [s, n];
    return { points: pts, north: n, south: s };
  }
  /** Planetocentric latitude and System III WEST longitude, degrees. */
  const latWest = (p) => ({ lat: Math.atan2(p[2], Math.hypot(p[0], p[1])) / DEG, west: west(east360(p)) });

  // ───────────────────────── the moons' plasma ─────────────────────────
  const MOONS = ["io", "europa", "ganymede", "callisto"];
  // Kivelson et al. 2004, Tables 21.1–21.2: mass density amu cm⁻³, flow past the moon km/s, their θ_A; the moon's radius
  // km; mean orbital radius R_J; the app's colors
  const MOON = {
    io: { name: "Io", rho: 42300, flow: 57, thetaA: 17, radius: 1821.6, orbit: 5.89, color: 0xF5D547, gm: 5959.9155 },
    europa: { name: "Europa", rho: 2500, flow: 76, thetaA: 25, radius: 1560.8, orbit: 9.38, color: 0xC9E4F5, gm: 3202.7121 },
    ganymede: { name: "Ganymede", rho: 54, flow: 139, thetaA: 36, radius: 2631.2, orbit: 14.97, color: 0xA9D39A, gm: 9887.8328 },
    callisto: { name: "Callisto", rho: 1.6, flow: 192, thetaA: 70, radius: 2410.3, orbit: 26.33, color: 0xC9A57E, gm: 7179.2834 },
  };
  /** The Alfvén speed, km/s, for a field in nT and a mass density in amu cm⁻³. */
  function alfvenSpeed(b, rho) {
    const r = rho * 1e6 * 1.66053906660e-27;
    return r > 0 ? b * 1e-9 / Math.sqrt(4e-7 * Math.PI * r) / 1000 : Infinity;
  }
  /** The wings' directions u ∓ v_A·B̂ (Neubauer 1980) for a unit flow and a field in nT, the Mach number and θ_A. */
  function wings(flow, b, env) {
    const bm = len(b), va = alfvenSpeed(bm, env.rho), bh = scl(b, 1 / bm), u = scl(flow, env.flow);
    let n = sub(u, scl(bh, va)), s = add(u, scl(bh, va));
    if (n[2] < s[2]) [n, s] = [s, n];
    const ma = env.flow / va;
    return { north: unit(n), south: unit(s), machA: ma, thetaA: Math.atan(ma) / DEG, vA: va };
  }
  /** Hue et al. 2023, Table 1: the main Alfvén wing footprint's equatorial lead angle, degrees, from the moon's System
   *  III WEST longitude. null for Callisto: no fit. */
  function leadAngle(moon, westLon, north) {
    const l = westLon * DEG, c = Math.cos, s = Math.sin;
    if (moon === "io") return north ? 4.26 + 2.64 * c(l) + 0.50 * s(l) + 0.20 * c(2 * l) + 0.126 * s(2 * l) : 4.14 - 1.89 * c(l) - 0.70 * s(l) + 0.22 * c(2 * l) - 0.12 * s(2 * l);
    if (moon === "europa") return north ? 5.78 + 3.29 * c(0.99 * l) + 1.41 * s(0.99 * l) : 7.06 - 3.37 * c(l) + 0.15 * s(l);
    if (moon === "ganymede") return north ? 12.45 + 6.16 * c(0.98 * l) + 3.64 * s(0.98 * l) : 12.97 - 5.39 * c(0.99 * l) - 4.50 * s(0.99 * l);
    return null;
  }
  // Ganymede in GPhiO (X along the flow, Y toward Jupiter, Z along the spin axis), R_G = 2634 km: Kivelson et al. 2002's
  // dipole with induction; Kaweeyanun et al. 2020's ambient field and magnetopause.
  const GAN = { radius: 2634, permanent: [-22.2, 49.3, -716.8], induction: 0.84, a: 2.2, b: 2.90, x00: 0.544, y0max: 0.914, theta: 0.298, lambda: 0.5 };
  const Ganymede = {
    ambient(east) { const p = east * DEG; return [0, 84 * Math.sin(p - 248 * DEG), 3 * Math.cos(p) - 79]; },
    dipole(b0) { return [GAN.permanent[0], GAN.permanent[1] - GAN.induction / 2 * b0[1], GAN.permanent[2]]; },
    field(r, m, b0) { const rr = len(r); if (!(rr > 1e-6)) return b0; const rh = scl(r, 1 / rr); return add(scl(sub(scl(rh, 3 * dot(m, rh)), m), 1 / (rr * rr * rr)), b0); },
    rotation(b0) { return -Math.atan2(b0[1], -b0[2]); },
    axis(b0) { const t = Ganymede.rotation(b0); return [0, Math.sin(t), Math.cos(t)]; },
    centers(east, z) { return [GAN.x00 + Math.abs(z) * Math.tan(GAN.theta), 2 / Math.PI * GAN.y0max * Math.sin((east - 248) * DEG) * Math.atan(z / GAN.lambda)]; },
    magnetopause(east, z) { const c = Ganymede.centers(east, z), q = 1 - (c[1] / GAN.b) ** 2; if (!(q > 0)) return null; const w = GAN.a * Math.sqrt(q); return { up: c[0] - w, down: c[0] + w }; },
    /** < 1 inside the magnetopause. */
    surface(p, east, b0) {
      const t = Ganymede.rotation(b0), yp = p[1] * Math.cos(t) - p[2] * Math.sin(t), zp = p[1] * Math.sin(t) + p[2] * Math.cos(t), c = Ganymede.centers(east, zp);
      return (p[0] - c[0]) ** 2 / (GAN.a * GAN.a) + (yp - c[1]) ** 2 / (GAN.b * GAN.b);
    },
    ring(east, z, n = 72) {
      const t = Ganymede.rotation(Ganymede.ambient(east)), yp = [0, Math.cos(t), -Math.sin(t)], zp = [0, Math.sin(t), Math.cos(t)], c = Ganymede.centers(east, z);
      return Array.from({ length: n + 1 }, (_, i) => { const u = TAU * i / n; return add(add([c[0] + GAN.a * Math.cos(u), 0, 0], scl(yp, c[1] + GAN.b * Math.sin(u))), scl(zp, z)); });
    },
    get standoff() { return -Ganymede.magnetopause(248, 0).up; },
    /** Field lines of the dipole in the Jovian field (a vacuum superposition), leaned by the magnetopause's tan 0.298. */
    lines(east) {
      const b0 = Ganymede.ambient(east), m = Ganymede.dipole(b0), up = Ganymede.axis(b0), lean = Math.tan(GAN.theta), closed = [], open = [];
      const o = { rtol: 1e-6, atol: 1e-7, initialStep: 0.01, maxStep: 0.08, maxStepFraction: 0.1, maxSteps: 6000, maxLength: 40 };
      const shear = (p) => add(p, [Math.max(0, Math.abs(dot(p, up)) - 1) * lean, 0, 0]);
      const go = (seed) => {
        const l = trace(seed, (r) => Ganymede.field(r, m, b0), (p) => 1 - len(p), (p) => len(p) - 5, o);
        (l.forward.stop === "inner" && l.backward.stop === "inner" ? closed : open).push(l.points.filter((_, i) => i % 2 === 0).map(shear));
      };
      for (let lat = 15; lat <= 85; lat += 7.5) for (const side of [-1, 1]) for (const hemi of [-1, 1]) go(add([side * Math.cos(lat * DEG), 0, 0], scl(up, hemi * Math.sin(lat * DEG))));
      const across = cross(up, [1, 0, 0]);
      for (const lat of [30, 45, 60]) for (const side of [-1, 1]) for (const hemi of [-1, 1]) go(add(scl(across, side * Math.cos(lat * DEG)), scl(up, hemi * Math.sin(lat * DEG))));
      for (const x of [-4.4, -3.2, 3.4, 4.8]) go([x, 0, 0]);
      return { closed, open };
    },
  };

  // ───────────────────────── positions: Horizons states, flown between ─────────────────────────
  let DATA = null, loading = null;
  function load(url) {
    if (DATA) return Promise.resolve(true);
    if (!loading) loading = fetch(url).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }).then(d => { DATA = d; return true; }).catch(e => { loading = null; throw e; });
    return loading;
  }
  const GM_SUN = 1.32712440018e11;
  // Jupiter's zonal harmonics at R_J = 71,492 km (Iess et al. 2018, Juno)
  const ZONAL = [[2, 14696.572e-6], [4, -586.609e-6], [6, 34.198e-6]];
  const LEG = {                                             // Pₙ(s) and its derivative
    2: (s) => [(3 * s * s - 1) / 2, 3 * s],
    4: (s) => [(35 * s ** 4 - 30 * s * s + 3) / 8, (140 * s ** 3 - 60 * s) / 8],
    6: (s) => [(231 * s ** 6 - 315 * s ** 4 + 105 * s * s - 5) / 16, (1386 * s ** 5 - 1260 * s ** 3 + 210 * s) / 16],
  };
  /** The acceleration, km/s², of a body at (x, y, z) km from Jupiter's center (ecliptic J2000): Jupiter's point mass
   *  (plus the body's own, `gm`) and its zonal harmonics up to degree `nz` about the pole P. Adds into out[o…o+2]. */
  function central(x, y, z, gm, P, nz, out, o) {
    const r2 = x * x + y * y + z * z, r = Math.sqrt(r2), g = MU / r2, s = (x * P[0] + y * P[1] + z * P[2]) / r, q2 = RJ * RJ / r2;
    let fr = -(MU + gm) / MU, fp = 0, qn = 1;
    for (const [n, J] of ZONAL) {
      if (n > nz) break;
      qn = Math.pow(q2, n / 2);
      const [p, dp] = LEG[n](s);
      fr += J * qn * (s * dp + (n + 1) * p); fp -= J * qn * dp;
    }
    out[o] += g * (fr * x / r + fp * P[0]); out[o + 1] += g * (fr * y / r + fp * P[1]); out[o + 2] += g * (fr * z / r + fp * P[2]);
  }
  /** A third body's pull as felt about Jupiter: its direct pull less its pull on Jupiter. */
  function third(x, y, z, bx, by, bz, gm, out, o) {
    const dx = bx - x, dy = by - y, dz = bz - z, d3 = Math.hypot(dx, dy, dz) ** 3, b3 = Math.hypot(bx, by, bz) ** 3;
    out[o] += gm * (dx / d3 - bx / b3); out[o + 1] += gm * (dy / d3 - by / b3); out[o + 2] += gm * (dz / d3 - bz / b3);
  }
  const sunFromJupiter = (ms) => scl(planet("jupiter", ms), -AU_KM);
  /** d/dt of the four moons' 24 numbers (r km, v km/s each). */
  function moonsRate(y, ms, P) {
    const d = new Float64Array(24), sun = sunFromJupiter(ms);
    for (let i = 0; i < 4; i++) {
      const o = 6 * i, x = y[o], yy = y[o + 1], z = y[o + 2];
      d[o] = y[o + 3]; d[o + 1] = y[o + 4]; d[o + 2] = y[o + 5];
      central(x, yy, z, MOON[MOONS[i]].gm, P, 4, d, o + 3);
      for (let j = 0; j < 4; j++) if (j !== i) third(x, yy, z, y[6 * j], y[6 * j + 1], y[6 * j + 2], MOON[MOONS[j]].gm, d, o + 3);
      third(x, yy, z, sun[0], sun[1], sun[2], GM_SUN, d, o + 3);
    }
    return d;
  }
  function rk4(y, ms, h, rate) {                            // h in seconds, either sign
    const n = y.length, mix = (k, s) => { const o = new Float64Array(n); for (let i = 0; i < n; i++) o[i] = y[i] + s * k[i]; return o; };
    const k1 = rate(y, ms), k2 = rate(mix(k1, h / 2), ms + h * 500), k3 = rate(mix(k2, h / 2), ms + h * 500), k4 = rate(mix(k3, h), ms + h * 1000), o = new Float64Array(n);
    for (let i = 0; i < n; i++) o[i] = y[i] + h / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
    return o;
  }
  const hermite = (p0, v0, p1, v1, dt, u) => {             // position and velocity between two states dt seconds apart
    const u2 = u * u, u3 = u2 * u, h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
    const g00 = (6 * u2 - 6 * u) / dt, g10 = 3 * u2 - 4 * u + 1, g01 = -g00, g11 = 3 * u2 - 2 * u;
    return { r: [0, 1, 2].map(k => h00 * p0[k] + h10 * dt * v0[k] + h01 * p1[k] + h11 * dt * v1[k]), v: [0, 1, 2].map(k => g00 * p0[k] + g10 * v0[k] + g01 * p1[k] + g11 * v1[k]) };
  };
  const STEP = 600, SPAN = 6 * 86400;                      // the moons' track: every 10 min, six days either side
  const JUNO_SPAN = 44 * 3600;                              // Juno's: the app's ±44 h
  let LOCAL = null;
  const jdMs = (jd) => Math.round((jd - 2440587.5) * 86400) * 1000;
  /** The tables' reach, ms: { moons: [first, last], juno: [first, last] }. */
  function coverage() {
    if (!DATA) return null;
    const M = DATA.moons, n = M.io.length / 6;
    return { moons: [jdMs(M.jd0), jdMs(M.jd0 + (n - 1) * M.step)], juno: [DATA.juno.t[0] * 1000, DATA.juno.t[DATA.juno.t.length - 1] * 1000] };
  }
  /** The moons' and Juno's tracks about `ms`, built once and kept while `ms` stays within a day of their center. */
  function local(ms) {
    if (!DATA) return null;
    if (LOCAL && Math.abs(ms - LOCAL.center) <= 86400e3) return LOCAL;
    const center = Math.round(ms / 3600e3) * 3600e3, cov = coverage(), P = body(center).z, M = DATA.moons, n = M.io.length / 6;
    const L = { center, P, t0: center - SPAN * 1000, moons: null, juno: null };
    if (center >= cov.moons[0] - 16 * 864e5 && center <= cov.moons[1] + 16 * 864e5) {
      const k = clamp(Math.round(((center / 864e5 + 2440587.5) - M.jd0) / M.step), 0, n - 1), rate = (y, t) => moonsRate(y, t, P);
      let y = new Float64Array(24), t = jdMs(M.jd0 + k * M.step);
      MOONS.forEach((m, i) => { for (let c = 0; c < 6; c++) y[6 * i + c] = M[m][6 * k + c]; });
      const to = (target) => {                              // fly to a moment in whole steps, then the remainder
        const dir = Math.sign(target - t);
        while (dir && (target - t) * dir > 0) { const h = dir * Math.min(STEP, Math.abs(target - t) / 1000); y = rk4(y, t, h, rate); t += h * 1000; }
      };
      to(L.t0);
      const count = Math.round(2 * SPAN / STEP) + 1;
      L.moons = new Float64Array(count * 24);
      for (let i = 0; i < count; i++) { L.moons.set(y, 24 * i); if (i < count - 1) { y = rk4(y, t, STEP, rate); t += STEP * 1000; } }
    }
    LOCAL = L;
    if (L.moons && center + JUNO_SPAN * 1000 >= cov.juno[0] && center - JUNO_SPAN * 1000 <= cov.juno[1]) L.juno = junoTrack(L, cov);
    return L;
  }
  function moonFrom(L, i, ms) {
    if (!L || !L.moons) return null;
    const f = (ms - L.t0) / (STEP * 1000), k = Math.floor(f), count = L.moons.length / 24;
    if (k < 0 || k >= count - 1) return null;
    const a = 24 * k + 6 * i, b = a + 24, S = L.moons;
    return hermite([S[a], S[a + 1], S[a + 2]], [S[a + 3], S[a + 4], S[a + 5]], [S[b], S[b + 1], S[b + 2]], [S[b + 3], S[b + 4], S[b + 5]], STEP, f - k);
  }
  /** A moon's position (km) and velocity (km/s) about Jupiter's center, ecliptic J2000; null outside the tables. */
  function moon(name, ms) { return moonFrom(local(ms), MOONS.indexOf(name), ms); }
  /** Juno's rate of change: Jupiter with J2, J4 and J6, the four moons and the Sun. */
  function junoRate(L) {
    return (y, ms) => {
      const d = new Float64Array(6), sun = sunFromJupiter(ms);
      d[0] = y[3]; d[1] = y[4]; d[2] = y[5];
      central(y[0], y[1], y[2], 0, L.P, 6, d, 3);
      for (let i = 0; i < 4; i++) { const m = moonFrom(L, i, ms); if (m) third(y[0], y[1], y[2], m.r[0], m.r[1], m.r[2], MOON[MOONS[i]].gm, d, 3); }
      third(y[0], y[1], y[2], sun[0], sun[1], sun[2], GM_SUN, d, 3);
      return d;
    };
  }
  /** Juno across the window: from each tabulated state, flown to the midpoints toward its neighbors, the step a fiftieth
   *  of the local orbital time (about Jupiter, or about a moon it is passing). Returns states in time order. */
  function junoTrack(L, cov) {
    const T = DATA.juno.t, S = DATA.juno.s, rate = junoRate(L), lo = Math.max(cov.juno[0], L.center - JUNO_SPAN * 1000), hi = Math.min(cov.juno[1], L.center + JUNO_SPAN * 1000);
    const stepFor = (y, ms) => {
      let tau = Math.sqrt(Math.hypot(y[0], y[1], y[2]) ** 3 / MU);
      for (let i = 0; i < 4; i++) { const m = moonFrom(L, i, ms); if (m) tau = Math.min(tau, Math.sqrt(Math.hypot(y[0] - m.r[0], y[1] - m.r[1], y[2] - m.r[2]) ** 3 / MOON[MOONS[i]].gm)); }
      return clamp(0.02 * tau, 2, 900);
    };
    const fly = (k, to, out) => {                     // from the k-th tabulated state toward `to`, keeping what falls in [lo, hi]
      let y = Float64Array.from(S.slice(6 * k, 6 * k + 6)), t = T[k] * 1000;
      const dir = Math.sign(to - t), keep = () => { if (t >= lo && t <= hi) out.push({ t, r: [y[0], y[1], y[2]], v: [y[3], y[4], y[5]] }); };
      keep();
      while (dir && (to - t) * dir > 0) {
        const h = dir * Math.min(stepFor(y, t), Math.abs(to - t) / 1000);
        y = rk4(y, t, h, rate); t += h * 1000;
        if (dir > 0 ? t > hi : t < lo) break;
        keep();
      }
    };
    let i0 = 0;
    while (i0 + 1 < T.length && T[i0 + 1] * 1000 <= lo) i0++;
    const track = [];
    for (let k = i0; k < T.length; k++) {                  // through the first state past the window: its flight back fills the end
      const back = [], fwd = [];
      if (k > 0) fly(k, (T[k - 1] + T[k]) * 500, back);
      if (k + 1 < T.length) fly(k, (T[k] + T[k + 1]) * 500, fwd);
      back.reverse();
      for (const s of back.concat(fwd)) if (!track.length || s.t > track[track.length - 1].t) track.push(s);
      if (T[k] * 1000 >= hi) break;
    }
    return track;
  }
  /** Juno's position (km) and velocity (km/s) about Jupiter's center, ecliptic J2000; null outside its window or table. */
  function juno(ms) {
    const L = local(ms), K = L && L.juno;
    if (!K || K.length < 2 || ms < K[0].t || ms > K[K.length - 1].t) return null;
    let a = 0, b = K.length - 1;
    while (b - a > 1) { const m = (a + b) >> 1; if (K[m].t <= ms) a = m; else b = m; }
    const dt = (K[b].t - K[a].t) / 1000;
    return hermite(K[a].r, K[a].v, K[b].r, K[b].v, dt, (ms - K[a].t) / 1000 / dt);
  }
  /** The osculating ellipse through a state about Jupiter, km; [] when the state is not bound. */
  function ellipse(r, v, n = 360) {
    const rm = len(r), energy = dot(v, v) / 2 - MU / rm;
    if (!(energy < 0)) return [];
    const a = -MU / (2 * energy), h = cross(r, v), ev = sub(scl(cross(v, h), 1 / MU), scl(r, 1 / rm)), e = len(ev);
    const p = e > 1e-10 ? scl(ev, 1 / e) : scl(r, 1 / rm), q = cross(unit(h), p), b = a * Math.sqrt(Math.max(0, 1 - e * e));
    return Array.from({ length: n + 1 }, (_, k) => { const E = TAU * k / n; return add(scl(p, a * (Math.cos(E) - e)), scl(q, b * Math.sin(E))); });
  }
  const isBound = (s) => dot(s.v, s.v) / 2 - MU / len(s.r) < 0;

  // ───────────────────────── the solar wind at Jupiter (Tao et al. 2005, served by CDPP/AMDA) ─────────────────────────
  const AMDA = "https://amda.irap.omp.eu/service/hapi/data";
  const WIND = { key: null, samples: [], source: null, state: "idle", ends: null };
  const AMDA_INFO = "https://amda.irap.omp.eu/service/hapi/info", RUNS = [["tao-jup-sw", "Tao 2005 model, OMNI"], ["tao-jup-swrt", "Tao 2005 model, ACE real time"]], spans = {};
  /** A run's first and last hour, asked once: a request past either end is answered with an error, so none is made. */
  const spanOf = (id) => spans[id] || (spans[id] = fetch(`${AMDA_INFO}?id=${id}`).then(r => r.json()).then(j => [Date.parse(j.startDate), Date.parse(j.stopDate)]).catch(() => { spans[id] = null; return null; }));
  /** The model's hourly dynamic pressure about `ms`: the OMNI-driven run, else the ACE real-time one. Calls `done` when
   *  the answer is in. */
  function loadWind(ms, done) {
    const key = Math.round(ms / 3600e3);
    if (WIND.key === key || typeof fetch !== "function") return;
    WIND.key = key; WIND.samples = []; WIND.source = null; WIND.state = "loading"; WIND.ends = null;
    const iso = (t) => new Date(t).toISOString().slice(0, 19) + "Z";
    // Every column is asked for (time, n, v, two of T, P_dyn, B, Bx, the Earth–Sun–Jupiter angle): naming two parameters
    // puts a comma in AMDA's Content-Disposition file name, and Chromium then refuses the whole reply.
    const ask = (id, a, b) => fetch(`${AMDA}?id=${id}&time.min=${iso(a)}&time.max=${iso(b)}`).then(r => (r.ok ? r.text() : "")).then(text => {
      const out = [];
      for (const ln of text.split("\n")) {
        const f = ln.split(","), t = Date.parse(f[0]), p = +f[5], da = +f[f.length - 1];   // T takes two columns
        if (f.length === 9 && isFinite(t) && isFinite(p) && p > 0 && p < 1e30) out.push({ t, pdyn: p, separation: isFinite(da) && Math.abs(da) < 1e4 ? da : null });
      }
      return out;
    });
    (async () => {
      let last = null;
      for (const [id, name] of RUNS) {
        const sp = await spanOf(id);
        if (!sp) continue;
        last = Math.max(last || 0, sp[1]);
        const a = Math.max(ms - 12 * 3600e3, sp[0]), b = Math.min(ms + 12 * 3600e3, sp[1]);
        if (!(b - a >= 3600e3)) continue;
        const s = await ask(id, a, b);
        if (s.length) return [s, name, last];
      }
      return [[], null, last];
    })().then(([s, src, last]) => { if (WIND.key !== key) return; WIND.samples = s; WIND.source = src; WIND.ends = last; WIND.state = s.length ? "ready" : "none"; if (done) done(); })
      .catch(() => { if (WIND.key === key) { WIND.state = "failed"; if (done) done(); } });
  }
  /** The sample nearest ms, within 3 h. */
  function windAt(ms) {
    let best = null;
    for (const s of WIND.samples) if (!best || Math.abs(s.t - ms) < Math.abs(best.t - ms)) best = s;
    return best && Math.abs(best.t - ms) <= 3 * 3600e3 ? best : null;
  }

  // ───────────────────────── one instant of the scene, in JSO R_J ─────────────────────────
  const CACHE = { wireKey: "", mp: null, bs: null, tubes: {}, shells: new Map(), visitors: new Map(), statics: null, staticsJob: null, ganymede: { key: -1, lines: null } };
  /** A moon's flux tube and its main Alfvén wings (System III): the tube turned downstream about the spin axis by the
   *  lead angle times the share of the Alfvén travel time spent so far (ρ ∝ exp(−(h/H)²), H = 1 R_J at Io, 3.6 beyond). */
  function tube(m, p, westLon) {
    const rho = Math.hypot(p[0], p[1]), key = `${(Math.round(east360(p) * 2) / 2).toFixed(1)}|${rho.toFixed(2)}|${p[2].toFixed(2)}`;
    if (CACHE.tubes[m] && CACHE.tubes[m].key === key) return CACHE.tubes[m];
    const l = line(p, m === "io" || m === "europa" ? 900 : 400, 150), pts = l.points;
    let e = { key, tube: pts, north: [], south: [], fN: null, fS: null };
    if (pts.length > 4) {
      let seed = 0;
      for (let i = 1; i < pts.length; i++) if (len(sub(pts[i], p)) < len(sub(pts[seed], p))) seed = i;
      const H = m === "io" ? 1.0 : 3.6;
      const bent = (ids, lead) => {
        if (lead === null || ids.length < 2) return [];
        const w = [0];
        for (let k = 1; k < ids.length; k++) {
          const a = pts[ids[k - 1]], b = pts[ids[k]], mid = scl(add(a, b), 0.5), dz = (mid[2] - p[2]) / H;
          w.push(w[k - 1] + len(sub(b, a)) * Math.sqrt(Math.exp(-dz * dz)) / Math.max(1, len(field(mid))));
        }
        const total = Math.max(1e-12, w[w.length - 1]);
        return ids.map((id, k) => rotZ(pts[id], lead * DEG * w[k] / total));
      };
      const up = [], down = [];
      for (let i = seed; i < pts.length; i++) up.push(i);
      for (let i = seed; i >= 0; i--) down.push(i);
      const north = bent(up, leadAngle(m, westLon, true)), south = bent(down, leadAngle(m, westLon, false));
      e = { key, tube: pts, north, south, fN: l.north ? north[north.length - 1] || l.north : null, fS: l.south ? south[south.length - 1] || l.south : null };
    }
    CACHE.tubes[m] = e;
    return e;
  }
  /** A craft's magnetic shell: the farthest point of its field line, and the feet. null when the line does not close. */
  function shell(p) {
    const r = len(p);
    if (!(r > 1.15 && r < 60)) return null;
    const key = p.map(v => v.toFixed(2)).join("|");
    if (CACHE.shells.has(key)) return CACHE.shells.get(key);
    const l = line(p, 0, 90), c = l.north && l.south ? { apex: Math.max(...l.points.map(len)), n: l.north, s: l.south } : null;
    if (CACHE.shells.size > 64) CACHE.shells.clear();
    CACHE.shells.set(key, c);
    return c;
  }
  /** The lines fixed in System III: each moon's footprint ovals (its orbit mapped every 10° of longitude) and the
   *  magnetodisc's lines from 8, 15 and 25 R_J. 168 lines; `budget` ms of work a call, so a page stays live. Returns
   *  the finished set, or null while there is more to do. */
  function statics(budget = 12) {
    if (CACHE.statics) return CACHE.statics;
    const J = CACHE.staticsJob || (CACHE.staticsJob = { i: 0, ovals: Object.fromEntries(MOONS.map(m => [m, { north: [], south: [] }])), disc: [] });
    const now = typeof performance !== "undefined" ? () => performance.now() : () => Date.now(), t0 = now();
    while (J.i < 168) {
      if (J.i < 144) {
        const m = MOONS[Math.floor(J.i / 36)], e = (J.i % 36) * 10 * DEG, r = MOON[m].orbit;
        const l = line([r * Math.cos(e), r * Math.sin(e), 0], m === "io" || m === "europa" ? 900 : 400, 70);
        if (l.north) J.ovals[m].north.push(l.north);
        if (l.south) J.ovals[m].south.push(l.south);
      } else {
        const k = J.i - 144, r = [8, 15, 25][Math.floor(k / 8)], e = ((k % 8) * 45 + 22.5) * DEG;
        const l = line([r * Math.cos(e), r * Math.sin(e), -r * Math.tan(DISC.tilt * DEG) * Math.cos(e - DISC.lon * DEG)], 0, 90);
        if (l.north && l.south) J.disc.push(l.points);
      }
      J.i++;
      if (budget !== Infinity && now() - t0 > budget) return null;
    }
    for (const m of MOONS) for (const leg of [J.ovals[m].north, J.ovals[m].south]) if (leg.length) leg.push(leg[0]);
    CACHE.statics = { ovals: J.ovals, discLines: J.disc };
    return CACHE.statics;
  }
  /** The moon's frame in JSO: X along the corotating flow, Y toward Jupiter, Z along Jupiter's spin axis. */
  function moonAxes(pos, pole) {
    const r = unit(sub(pos, scl(pole, dot(pos, pole))));
    return { x: cross(pole, r), y: scl(r, -1), z: pole };
  }
  /** Juno's pass by a moon, ±1 h every 20 s, in the moon's frame and radii; null unless it is within 60 radii now. */
  function visitor(m, ms) {
    const rM = MOON[m].radius, c0 = juno(ms), m0 = moon(m, ms);
    if (!c0 || !m0 || len(sub(c0.r, m0.r)) >= 60 * rM) return null;
    const key = `${m}|${Math.floor(ms / 20000)}`;
    if (CACHE.visitors.has(key)) return CACHE.visitors.get(key);
    const z = body(ms).z, track = [], crossings = [];
    let now = null, best = null, last = null;
    for (let i = -180; i <= 180; i++) {
      const t = ms + i * 20000, c = juno(t), mo = moon(m, t);
      if (!c || !mo) continue;
      const rhat = unit(sub(mo.r, scl(z, dot(mo.r, z)))), x = cross(z, rhat), rel = sub(c.r, mo.r);
      const p = scl([dot(rel, x), -dot(rel, rhat), dot(rel, z)], 1 / rM), alt = len(rel) - rM;
      track.push(p);
      if (i === 0) now = p;
      if (!best || alt < best.alt) best = { t, t0: t, alt };
      if (m === "ganymede") {
        const east = east360(components(body(t), mo.r)), f = Ganymede.surface(p, east, Ganymede.ambient(east));
        if (last && (last.f - 1) * (f - 1) < 0) crossings.push({ t: last.t + (last.f - 1) / (last.f - f) * 20000, inbound: f < 1 });
        last = { t, f };
      }
    }
    if (best) for (let k = -20; k <= 20; k++) {              // the closest approach to the second (the app keeps the 20-s sample)
      const t = best.t0 + k * 1000, c = juno(t), mo = moon(m, t);
      if (c && mo) { const alt = len(sub(c.r, mo.r)) - rM; if (alt < best.alt) { best.alt = alt; best.t = t; } }
    }
    const v = { name: "Juno", track, now, closest: best, crossings };
    if (CACHE.visitors.size > 48) CACHE.visitors.clear();
    CACHE.visitors.set(key, v);
    return v;
  }
  /** Everything for one instant. `o.layers`: { sheet, torus, tubes }; `o.pressure`: a chosen pressure in nPa, or null for
   *  the model's wind at the instant (else the median). */
  function scene(ms, o = {}) {
    const layers = Object.assign({ sheet: true, torus: true, tubes: true }, o.layers);
    const Jso = jso(ms), Body = body(ms), Jss = jss(ms), b2j = matrix(Jso, Body), jss2j = matrix(Jso, Jss), jss2b = matrix(Body, Jss);
    const pole = components(Jso, Body.z), sunLat = solarLatitude(ms);
    let p = PRESSURE.typical, note = "median (Rutala et al. 2025)";
    const w = windAt(ms);
    if (o.pressure != null) { p = o.pressure; note = "set"; }
    else if (w) { p = w.pdyn; note = WIND.source; if (w.separation !== null && Math.abs(w.separation) > 90) note += `. Earth is ${Math.abs(w.separation).toFixed(0)}° from Jupiter: low skill`; }
    else if (WIND.state === "loading") note = "median, while the model's wind loads";
    else if (WIND.state === "none" && WIND.ends && ms > WIND.ends) note = `median: the Tao 2005 model's runs end on ${new Date(WIND.ends).toISOString().slice(0, 10)}`;
    else if (WIND.state === "none" || WIND.state === "failed") note = "median: no model hour near this moment";
    const pc = clampP(p);
    if (Math.abs(pc - p) > 1e-9) note += `. Model ${p.toFixed(3)} nPa, drawn at the fit's ${pc.toFixed(2)} limit`;
    const wk = `${pc.toFixed(4)}|${Math.floor(ms / 864e5)}`;
    if (CACHE.wireKey !== wk) { CACHE.mp = wire("mp", pc, jss2j); CACHE.bs = wire("bs", pc, jss2j); CACHE.wireKey = wk; }

    const sheetRings = [], sheetSpokes = [];
    if (layers.sheet) {
      const reachAt = (a) => joyRadius("mp", pc, Math.abs(a), a > 0 ? -Math.PI / 2 : Math.PI / 2) ?? 400;
      const at = (rho, a) => {
        const x = rho * Math.cos(a), y = rho * Math.sin(a), s3 = apply(jss2b, [x, y, 0]);
        return apply(jss2j, [x, y, sheetZ(x, y, Math.atan2(s3[1], s3[0]), sunLat)]);
      };
      const angles = Array.from({ length: 121 }, (_, i) => -Math.PI + TAU * i / 120), reach = angles.map(reachAt);
      for (const rho of [10, 20, 30, 45, 60, 80, 100]) {
        let run = [];
        angles.forEach((a, i) => { if (rho < reach[i]) run.push(at(rho, a)); else { if (run.length > 1) sheetRings.push(run); run = []; } });
        if (run.length > 1) sheetRings.push(run);
      }
      for (let s = 0; s < 24; s++) {
        const a = -Math.PI + TAU * s / 24, top = Math.min(110, reachAt(a)), pts = [];
        for (let r = 6; r <= top; r += 2) pts.push(at(r, a));
        if (pts.length > 1) sheetSpokes.push(pts);
      }
    }
    // The torus on the centrifugal equator: Phipps & Withers' components as Gaussian blobs every 4° of longitude
    // (radius, radial and vertical 1/e half-widths, opacity), each a center and three semi-axes
    const torus = [], torusLabel = [];
    if (layers.torus) {
      const comps = [[5.23, 0.20, 0.12, 0.05], [5.60, 0.10, 0.60, 0.06], [5.89, 0.32, 1.00, 0.045], [5.89, 0.18, 0.55, 0.05], [6.90, 1.00, 1.00, 0.022]];
      for (let i = 0; i < 90; i++) {
        const e = i * 4, er = e * DEG, rh = [Math.cos(er), Math.sin(er), 0], ph = [-Math.sin(er), Math.cos(er), 0];
        for (const [r, wd, h, alpha] of comps) {
          const lat = centrifugalLatitude(r, e) * DEG, radial = [rh[0] * Math.cos(lat), rh[1] * Math.cos(lat), Math.sin(lat)], normal = [-rh[0] * Math.sin(lat), -rh[1] * Math.sin(lat), Math.cos(lat)];
          torus.push({ c: apply(b2j, [rh[0] * r, rh[1] * r, r * Math.tan(lat)]), a: apply(b2j, scl(radial, wd)), b: apply(b2j, scl(ph, r * 4 * DEG * 0.8)), n: apply(b2j, scl(normal, h)), alpha });
        }
      }
      for (let i = 0; i <= 90; i++) { const e = i * 4, er = e * DEG; torusLabel.push(apply(b2j, [7 * Math.cos(er), 7 * Math.sin(er), 7 * Math.tan(centrifugalLatitude(7, e) * DEG)])); }
    }
    const toJso = (v) => scl(components(Jso, v), 1 / RJ), s3 = (v) => scl(components(Body, v), 1 / RJ);
    const moons = [];
    for (const m of MOONS) {
      const st = moon(m, ms);
      if (!st) continue;
      const q = s3(st.r), east = east360(q), westLon = west(east), jssPos = scl(components(Jss, st.r), 1 / RJ), rho = Math.hypot(q[0], q[1]);
      const bS3 = field(q), bMoon = [dot(bS3, [-q[1] / rho, q[0] / rho, 0]), dot(bS3, [-q[0] / rho, -q[1] / rho, 0]), bS3[2]];
      const e = layers.tubes ? tube(m, q, westLon) : null, J = (pts) => pts.map(x => apply(b2j, x));
      moons.push({
        key: m, info: MOON[m], pos: toJso(st.r), s3: q, orbit: ellipse(st.r, st.v).map(toJso), west: westLon,
        aboveSheet: jssPos[2] - sheetZ(jssPos[0], jssPos[1], east * DEG, sunLat), bMoon,
        // the flow's Alfvén Mach number: below 1 the moon has Alfvén wings (Ganymede's from Kaweeyanun's ambient field, as its inset)
        machA: MOON[m].flow / alfvenSpeed(len(m === "ganymede" ? Ganymede.ambient(360 - westLon) : bMoon), MOON[m].rho),
        tube: e ? J(e.tube) : [], wingN: e ? J(e.north) : [], wingS: e ? J(e.south) : [], footN: e && e.fN ? apply(b2j, e.fN) : null, footS: e && e.fS ? apply(b2j, e.fS) : null,
        leadN: leadAngle(m, westLon, true), leadS: leadAngle(m, westLon, false), visitor: visitor(m, ms),
      });
    }
    let junoNow = null;
    const js = juno(ms), L = LOCAL;
    if (js) {
      const q = s3(js.r), sh = layers.tubes ? shell(q) : null;
      junoNow = { pos: toJso(js.r), orbit: isBound(js) ? ellipse(js.r, js.v).map(toJso) : [], track: L.juno.map(s => toJso(s.r)), r: len(js.r) / RJ,
                  mShell: sh ? sh.apex : null, footN: sh ? apply(b2j, sh.n) : null, footS: sh ? apply(b2j, sh.s) : null, west: west(east360(q)) };
    }
    const earth = sub(planet("earth", ms), planet("jupiter", ms)), au = len(earth);
    return {
      ms, layers, jso: Jso, bodyToJso: b2j, pole, pressure: pc, pressureNote: note, mp: CACHE.mp, bs: CACHE.bs,
      standoff: { mp: standoff("mp", pc), bs: standoff("bs", pc) }, sheetRings, sheetSpokes, torus, torusLabel, moons, juno: junoNow,
      subsolarWest: west(subsolar(ms).lon), cmlWest: cml(ms), sunDistance: len(planet("jupiter", ms)), earthDistance: au, earthDir: scl(components(Jso, earth), 1 / au),
      solarLatitude: sunLat / DEG,
    };
  }

  const api = {
    RJ, RP, MU, AU_KM, C_KM_S, MOONS, MOON, PRESSURE, TAIL_LIMIT, SHEET, DISC, DIPOLE, TORUS, GAN, JUNO_COLOR: 0xF2C572,
    planet, iau, body, jso, jss, matrix, apply, transpose, components, vectorOf, solarLatitude, subsolar, cml, earthDistance, west, east360,
    joyRadius, joyPoint, joyRing, standoff, clampP, wire, sheetZ, centrifugalLatitude, torusDensity,
    internalField, discField, field, line, trace, latWest, alfvenSpeed, wings, leadAngle, Ganymede, moonAxes,
    load, get ready() { return !!DATA; }, coverage, moon, juno, ellipse, isBound, local,
    loadWind, windAt, wind: WIND, statics, scene, shell, tube, visitor,
    ganymedeLines(east) { const k = Math.round(east); if (CACHE.ganymede.key !== k) CACHE.ganymede = { key: k, lines: Ganymede.lines(east) }; return CACHE.ganymede.lines; },
    /** For tests: the tables, handed in. */
    use(d) { DATA = d; LOCAL = null; },
  };
  (typeof window !== "undefined" ? window : globalThis).Jupiter = api;
})();
