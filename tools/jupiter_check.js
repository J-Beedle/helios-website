#!/usr/bin/env node
/* Checks js/jupiter.js and assets/data/jupiter.json against values read on 2026-11-19. Run: node tools/jupiter_check.js
   (no network).

   - Positions: JPL Horizons state vectors about Jupiter's center (500@599), ecliptic of J2000, km, TIME_TYPE=UT, geometric,
     at instants that are not in the table.
   - Jupiter's rotation: Horizons' observer table from the geocenter (ObsSub-LON/LAT, SunSub-LON/LAT, IAU_JUPITER, west
     longitude positive, planetodetic latitude) and its Sun and Earth distances.
   - JRM33: the community code's test values (Wilson et al. 2023; rjwilson-LASP/PSH README), degree 13.
   - Con2020: libcon2020's analytic test point (mattkjames7/libcon2020, test/test_data.json.gz). The page leaves out the
     radial-current B_φ, as the app does; the check adds it back to compare.
   - Joy et al. 2002 standoffs: Rutala et al. 2025's (101, 83, 68 and 132, 108, 82 R_J) and Joy's bimodal 63 and 92 R_J.
   - The field at Juno: Juno FGM one-minute vectors across perijove 34 (PDS, served by CDPP/AMDA as juno-fgm-orb60), in
     IAU_JUPITER and in JSO. */
const fs = require("fs"), path = require("path"), root = path.join(__dirname, "..");
(0, eval)(fs.readFileSync(path.join(root, "js/jupiter.js"), "utf8"));
const J = globalThis.Jupiter;
J.use(JSON.parse(fs.readFileSync(path.join(root, "assets/data/jupiter.json"), "utf8")));
const DEG = Math.PI / 180, len = (a) => Math.hypot(...a), sub = (a, b) => a.map((x, i) => x - b[i]), dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
let bad = 0, n = 0;
const ok = (what, got, want, tol, unit = "") => { const pass = Math.abs(got - want) <= tol; n++; if (!pass) bad++; console.log(`${pass ? "ok  " : "FAIL"} ${what}: ${(+got).toFixed(4)}${unit} (reference ${want}, within ${tol})`); };
const wrap = (d) => ((d + 540) % 360) - 180;

// [body, UT ms, x, y, z km] from Horizons
const POS = [["io",1490601600000,161326.12,387489.387,16051.089],["io",1623084960000,369222.312,-201349.218,-1635.288],["io",1703925360000,118847.149,-405362.373,-12499.59],["io",1795091640000,60758.659,417229.637,15979.916],["europa",1490601600000,232815.524,635285.242,31779.204],["europa",1623084960000,674316.648,-55352.529,12881.41],["europa",1703925360000,-646795.995,167051.234,-8785.783],["europa",1795091640000,-550164.685,-376225.622,-22320.391],["ganymede",1490601600000,-1013825.991,348728.144,-199.51],["ganymede",1623084960000,119643.519,-1061637.313,-38768.264],["ganymede",1703925360000,-1029262.028,-301314.263,-25965.695],["ganymede",1795091640000,1051534.972,184153.03,22431.563],["callisto",1490601600000,-1570931.88,1057438.573,12563.574],["callisto",1623084960000,-419730.496,1835855.201,52352.896],["callisto",1703925360000,-1104433.172,1531928.957,33268.612],["callisto",1795091640000,-1705816.62,-825539.522,-48804.95],["juno",1490601600000,-4671.003,-14014.594,138713.57],["juno",1623084960000,122254.17,-1059573.447,-37217.434],["juno",1703925360000,120268.776,-405156.745,-9504.512],["juno",1795091640000,800517.19,22613.641,-4098964.473],["io",1622851200000,-331230.681,262563.881,4433.351],["io",1623200400000,-190118.558,-377465.577,-16566.347],["io",1623549600000,407392.012,-102922.658,2512.005],["europa",1622851200000,119382.29,662939.932,28152.833],["europa",1623200400000,-424761.043,516337.166,10391.564],["europa",1623549600000,-664978.077,2060.023,-14726.941],["ganymede",1622851200000,-829273.415,680792.75,14540.984],["ganymede",1623200400000,1026000.228,-295623.883,2816.776],["ganymede",1623549600000,-1064301.448,-132363.763,-19633.717],["callisto",1622851200000,1342032.219,1303550.006,59215.12],["callisto",1623200400000,-1253832.183,1414421.123,27830.856],["callisto",1623549600000,-1500515.326,-1155419.739,-56663.966],["juno",1622973000000,329382.324,-2184136.178,-501498.055],["juno",1623009000000,270571.207,-1879014.934,-361161.338],["juno",1623045000000,205538.921,-1530214.863,-212607.3],["juno",1623081000000,131299.8,-1112047.612,-55049.531],["juno",1623117000000,34397.809,-551849.052,100878.877],["juno",1623153000000,107427.02,-72741.48,-406664.201],["juno",1623189000000,266479.94,-492874.322,-862773.518],["juno",1623225000000,377597.122,-832927.821,-1159491.753],["juno",1623261000000,468457.289,-1129091.139,-1393679.252],["juno",1521136800000,11240.254,-7181753.181,-1513911.156],["juno",1522432800000,-64371.506,-2062104.104,124287.481],["juno",1523728800000,165750.043,-6297966.04,-2414926.086],["juno",1525024800000,100146.993,-7722466.887,-2146636.061],["juno",1526320800000,-12801.303,-5694124.67,-931589.813],["juno",1527616800000,191317.386,-3835363.583,-1972957.697]];
for (const [b, t, x, y, z] of POS) {
  const s = b === "juno" ? J.juno(t) : J.moon(b, t), tag = `${b} ${new Date(t).toISOString().slice(0, 16)}`;
  if (!s) { bad++; console.log("FAIL " + tag + ": no position"); continue; }
  ok(tag + " distance from Horizons", len(sub(s.r, [x, y, z])), 0, b === "juno" ? 15 : 12, " km");
}
// [UT ms, Sun distance AU, apparent Earth distance AU, sub-Earth lon W, lat (detic), sub-solar lon W, lat (detic), light time min, Sun direction (ecliptic)]
const JUP = [[1490601600000,5.456166,4.47907281576809,200.986466,-3.485517,203.316094,-3.084397,37.2513127,0.95534475,0.29462796,-0.02260047],[1623084960000,5.045534,4.68273026677323,43.498121,0.757308,54.681742,0.199042,38.94508008,-0.7707783,0.63693616,0.0145994],[1703925360000,4.984585,4.45775367418437,180.445717,3.500474,170.328284,3.563008,37.07400681,-0.70259469,-0.71134519,0.01867414],[1795091640000,5.322741,5.21203669612189,265.469849,-0.334736,276.163259,0.134643,43.34718741,0.70787643,-0.70621841,-0.01290418]];
for (const [t, rSun, rEarth, oLon, oLat, sLon, sLat, ltMin, ...sunDir] of JUP) {
  const tag = new Date(t).toISOString().slice(0, 16), lt = ltMin * 60e3, cen = (d) => Math.atan((J.RP / J.RJ) ** 2 * Math.tan(d * DEG)) / DEG, ss = J.subsolar(t - lt);
  ok(tag + " Sun distance", len(J.planet("jupiter", t)), rSun, 0.005, " AU");
  ok(tag + " Earth distance", J.earthDistance(t), rEarth, 0.005, " AU");
  ok(tag + " JSO +X off the Sun line", Math.acos(Math.min(1, dot(J.jso(t).x, sunDir))) / DEG, 0, 0.08, "°");
  ok(tag + " central meridian (λIII west)", wrap(J.cml(t) - oLon), 0, 0.12, "° off");
  ok(tag + " subsolar λIII (west), one light time back", wrap(J.west(ss.lon) - sLon), 0, 0.12, "° off");
  ok(tag + " subsolar latitude (centric)", ss.lat, +cen(sLat).toFixed(3), 0.01, "°");
}
// JRM33, degree 13: (r, colatitude, east longitude) → (B_r, B_θ, B_φ) nT
const sph = (r, th, ph, f) => { const b = f([r * Math.sin(th) * Math.cos(ph), r * Math.sin(th) * Math.sin(ph), r * Math.cos(th)]);
  return [dot(b, [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th)]), dot(b, [Math.cos(th) * Math.cos(ph), Math.cos(th) * Math.sin(ph), -Math.sin(th)]), dot(b, [-Math.sin(ph), Math.cos(ph), 0])]; };
for (const [r, th, ph, ref] of [[10, Math.PI / 2, 38 * DEG, [-79.8398262, 399.48279169, -53.48232536]], [8, Math.PI / 2, 0, [-250.03964154, 779.36280353, -48.0067748]]])
  sph(r, th, ph, J.internalField).forEach((v, i) => ok(`JRM33 at r ${r}, east ${(ph / DEG).toFixed(0)}°: B_${"rθφ"[i]}`, v, ref[i], 1e-4, " nT"));
ok("JRM33 dipole moment", J.DIPOLE.nT / 1e5, 4.177, 5e-4, " G");
ok("JRM33 dipole tilt", J.DIPOLE.tilt, 10.25, 5e-3, "°");
ok("JRM33 dipole longitude (west)", J.DIPOLE.west, 196.38, 5e-3, "°");
// Con2020, analytic, Cartesian System III; with the radial-current term the page leaves out (−2.7975·I_ρ/ρ, I_ρ = 16.7 MA)
{
  const p = [10.596456405024867, 48.746363757137956, 4.910158998452509], ref = [4.956657836434093, 14.372356497938648, -3.7295671567595994];
  const xs = (J.DISC.lon - 180) * DEG, xt = J.DISC.tilt * DEG, rho0 = Math.hypot(p[0], p[1]), ph = Math.atan2(p[1], p[0]), xtmp = rho0 * Math.cos(ph - xs), y1 = rho0 * Math.sin(ph - xs);
  const x1 = xtmp * Math.cos(xt) + p[2] * Math.sin(xt), z1 = p[2] * Math.cos(xt) - xtmp * Math.sin(xt), rho = Math.hypot(x1, y1), B = -2.7975 * 16.7 / rho * (Math.abs(z1) < J.DISC.d ? z1 / J.DISC.d : Math.sign(z1));
  const bx1 = -B * y1 / rho, by1 = B * x1 / rho, bx = bx1 * Math.cos(xt), extra = [bx * Math.cos(xs) - by1 * Math.sin(xs), by1 * Math.cos(xs) + bx * Math.sin(xs), bx1 * Math.sin(xt)];
  J.discField(p).forEach((v, i) => ok(`Con2020 analytic B_${"xyz"[i]} (with B_φ added back)`, v + extra[i], +ref[i].toFixed(6), 1e-4, " nT"));
}
[[0.02, 101, 132], [0.071, 83, 108], [0.22, 68, 82]].forEach(([p, mp, bs]) => { ok(`Joy magnetopause standoff at ${p} nPa`, J.standoff("mp", p), mp, 0.75, " R_J"); ok(`Joy bow shock standoff at ${p} nPa`, J.standoff("bs", p), bs, 0.75, " R_J"); });
ok("Joy magnetopause at 0.306 nPa", J.standoff("mp", 0.306), 63, 0.5, " R_J");
ok("Joy magnetopause at 0.039 nPa", J.standoff("mp", 0.039), 92, 0.5, " R_J");
ok("Ganymede's dipole", len(J.GAN.permanent), 719, 0.5, " nT");
ok("Ganymede's magnetopause standoff", J.Ganymede.standoff, 1.65, 0.01, " R_G");
// Juno FGM, perijove 34: [UT ms, B in JSO (3), B in IAU_JUPITER (3), |B|] nT
const FGM = [[1623121234006,-461.77,703.02,-1001,701.11,539.45,-962.75,1307.5],[1623126883999,-1680.9,1999.5,-2190.1,2636.8,-571.31,-2083.5,3408.8],[1623130244995,-5440.2,5810.2,-3028.5,5983.4,-5412.6,-2725.3,8516.2],[1623132584991,-15216,16182,897.61,9490,-20029,1728.1,22231],[1623135106504,-44738,57445,73418,-4023.2,-69679,76291,103400],[1623136367003,-8599.4,47685,255710,-22758,-26602,257890,260260],[1623137268002,217030,-110460,405410,29630,251390,399480,472930]];
for (const [t, jx, jy, jz, ix, iy, iz, mag] of FGM) {
  const s = J.juno(t), B = J.body(t), p = J.components(B, s.r).map(x => x / J.RJ), b = J.field(p), bJ = J.apply(J.matrix(J.jso(t), B), b), tag = `field at Juno ${new Date(t).toISOString().slice(11, 16)} (r ${len(p).toFixed(2)} R_J)`;
  ok(tag + " |ΔB|/|B| in System III", len(sub(b, [ix, iy, iz])) / mag * 100, 0, 1.5, "%");
  ok(tag + " |ΔB|/|B| in JSO", len(sub(bJ, [jx, jy, jz])) / mag * 100, 0, 1.5, "%");
}
// Juno's Ganymede flyby, 2021-06-07: Horizons puts the closest approach 3,668.3 km from Ganymede's center at 16:56:08 UT
{
  const v = J.visitor("ganymede", Date.UTC(2021, 5, 7, 16, 56));
  ok("Juno's closest approach to Ganymede, from its center", v.closest.alt + J.MOON.ganymede.radius, 3668.3, 2, " km");
  ok("its time, seconds after 16:56:00", (v.closest.t - Date.UTC(2021, 5, 7, 16, 56)) / 1000, 8, 2, " s");
}
// Callisto's field and Alfvén Mach number over two turns of Jupiter (Kivelson et al. 2004, Table 21.2: 4–42 nT; Rabia et al.
// 2025: faster than the Alfvén speed at the plasma sheet's center, slower above and below it)
{
  let lo = Infinity, hi = 0, mLo = Infinity, mHi = 0, sub = 0, cnt = 0;
  for (let k = 0; k <= 120; k++) {
    const c = J.scene(Date.UTC(2021, 5, 7, 6) + k * 600e3, { layers: { sheet: false, torus: false, tubes: false } }).moons.find(m => m.key === "callisto"), b = len(c.bMoon);
    lo = Math.min(lo, b); hi = Math.max(hi, b); mLo = Math.min(mLo, c.machA); mHi = Math.max(mHi, c.machA); cnt++; if (c.machA < 1) sub++;
  }
  ok("weakest field at Callisto", lo, 4, 2, " nT"); ok("strongest field at Callisto", hi, 42, 3, " nT");
  ok("Callisto's Alfvén Mach number at the sheet's center is above 1", mHi > 1 ? 1 : 0, 1, 0); ok("and away from it is below 1", mLo < 1 ? 1 : 0, 1, 0);
  console.log(`     Callisto is slower than the Alfvén speed ${(100 * sub / cnt).toFixed(0)}% of those 20 hours (M_A ${mLo.toFixed(2)} to ${mHi.toFixed(2)})`);
  for (const m of J.scene(Date.UTC(2021, 5, 7, 16, 56)).moons) if (m.key !== "callisto") ok(`${m.info.name}'s Alfvén Mach number is below 1`, m.machA < 1 ? 1 : 0, 1, 0);
}
console.log(bad ? `${bad} of ${n} FAILED` : `all ${n} passed`);
process.exit(bad ? 1 : 0);
