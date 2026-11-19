#!/usr/bin/env node
/* Checks js/heliosphere.js and assets/data/heliosphere.json against JPL Horizons values read on 2026-11-19
   (EPHEM_TYPE=VECTORS, CENTER=500@10, REF_PLANE=ECLIPTIC, TIME_TYPE=UT, geometric; Voyager 1's Earth range from 500@399).
   Run: node tools/heliosphere_check.js   (no network). */
const fs = require("fs"), path = require("path"), root = path.join(__dirname, "..");
(0, eval)(fs.readFileSync(path.join(root, "js/heliosphere.js"), "utf8"));
const H = globalThis.Heliosphere;
H.use(JSON.parse(fs.readFileSync(path.join(root, "assets/data/heliosphere.json"), "utf8")));
const DEG = Math.PI / 180, len = (a) => Math.hypot(...a);
let bad = 0;
const ok = (what, got, want, tol) => { const pass = Math.abs(got - want) <= tol; if (!pass) bad++; console.log(`${pass ? "ok  " : "FAIL"} ${what}: ${got.toFixed(5)} (Horizons ${want}, within ${tol})`); };
// [table, UT instant, distance from the Sun (AU), ecliptic longitude, latitude (deg)] from Horizons
const A = Date.UTC(2015, 9, 16, 13, 7, 2), B = Date.UTC(2021, 2, 20, 6, 30), C = Date.UTC(2026, 10, 19);
const REF = [
  ["voyager1", A, 132.8421, 255.421, 35.010], ["voyager1", B, 152.2122, 256.180, 35.093], ["voyager1", C, 172.3948, 256.784, 35.159],
  ["voyager2", A, 109.3335, 289.764, -35.480], ["voyager2", B, 126.5396, 290.296, -37.183], ["voyager2", C, 144.5114, 290.727, -38.532],
  ["newHorizons", A, 33.6882, 284.277, 1.917], ["newHorizons", B, 49.7746, 287.061, 1.970], ["newHorizons", C, 66.0955, 288.534, 1.998],
  ["pioneer10", C, 142.2633, 80.231, 2.985], ["pioneer11", C, 118.2646, 284.732, 13.844],
  ["pluto", C, 35.6443, 304.428, -4.304], ["eris", C, 95.4458, 25.041, -10.380], ["makemake", C, 52.7369, 191.975, 27.114],
  ["haumea", C, 49.7414, 213.459, 28.198], ["sedna", C, 82.8031, 61.559, -11.838], ["arrokoth", C, 43.0464, 296.307, 1.663],
  ["oumuamua", C, 55.4246, 9.026, 22.701], ["borisov", C, 49.5582, 270.821, -30.381], ["atlas3I", C, 13.4896, 101.649, -3.150],
  // the four measured crossings: the distances the view labels
  ["voyager1", Date.UTC(2004, 11, 16), 94.0229, 252.996, 34.710], ["voyager1", Date.UTC(2012, 7, 25), 121.6025, 254.878, 34.948],
  ["voyager2", Date.UTC(2007, 7, 30), 83.6597, 288.648, -31.607], ["voyager2", Date.UTC(2018, 10, 5), 119.0174, 290.077, -36.499],
];
for (const [key, t, r, lon, lat] of REF) {
  const p = H.state(key, t).p, tag = `${key} ${new Date(t).toISOString().slice(0, 10)}`;
  ok(`${tag} r`, len(p), r, 2e-4);
  ok(`${tag} lon`, (Math.atan2(p[1], p[0]) / DEG + 360) % 360, lon, 2e-3);
  ok(`${tag} lat`, Math.asin(p[2] / len(p)) / DEG, lat, 2e-3);
}
// the planets (approximate elements): Horizons barycenters on 2026-11-19, to plotting accuracy
for (const [name, r, lon] of [["earth", 0.9884, 56.290], ["jupiter", 5.3226, 135.026], ["saturn", 9.4198, 12.480], ["uranus", 19.4324, 63.214], ["neptune", 29.8769, 2.945]]) {
  const p = H.planet(name, C);
  ok(`${name} r`, len(p), r, 0.02); ok(`${name} lon`, (Math.atan2(p[1], p[0]) / DEG + 360) % 360, lon, 0.1);
}
// one light-day, and Voyager 1's range from Earth across the crossing (Horizons: 173.1446315 AU at 2026-11-18 10:16 UT)
ok("one light-day (AU)", H.LIGHT_DAY_AU, 173.144633, 1e-6);
ok("Voyager 1 Earth range 2026-11-18 10:16 UT", H.craftAt(Date.UTC(2026, 10, 18, 10, 16)).find(c => c.key === "voyager1").earth, 173.1446315, 1e-4);
// the model against the crossings: through Voyager 1's, 12 AU outside Voyager 2's
const hp = (key, t) => { const p = H.state(key, t).p; return H.heliopauseR(H.angleFromUpwind(p) * DEG) - len(p); };
ok("model heliopause − Voyager 1's crossing (AU)", hp("voyager1", Date.UTC(2012, 7, 25)), 0, 0.05);
ok("model heliopause − Voyager 2's crossing (AU)", hp("voyager2", Date.UTC(2018, 10, 5)), 12.03, 0.05);
ok("model nose (AU)", H.MODEL.nose, 117.51, 0.01);
ok("model flank, 90° from upwind (AU)", H.heliopauseR(Math.PI / 2), 117.51 * Math.SQRT2, 0.02);
ok("model shock (AU)", H.MODEL.shock, 88.84, 0.001);
console.log(bad ? `${bad} FAILED` : "all passed");
process.exit(bad ? 1 : 0);
