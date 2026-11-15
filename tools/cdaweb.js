/* A small CDAWeb HAPI reader for the Node checks (tools/*_live.js): public MMS Level 2 data as CSV, parsed to numbers
 * only, one request at a time, kept on disk so a re-run asks nothing. The cache folder is $HELIOS_CACHE, else a
 * folder under the system's temporary directory — never inside the repository.
 *
 *   const { series, vectors } = require("./cdaweb");
 *   const b = await vectors("MMS1_FGM_BRST_L2@0", "mms1_fgm_b_gse_brst_l2", "2017-07-06T08:37:00Z", "2017-07-06T08:37:10Z");
 *
 * Times come back as seconds after 1970 (float), so a burst stamp keeps its microseconds.
 */
"use strict";
const fs = require("fs"), path = require("path"), os = require("os"), crypto = require("crypto");

const HAPI = "https://cdaweb.gsfc.nasa.gov/hapi";
const CACHE = process.env.HELIOS_CACHE || path.join(os.tmpdir(), "helios_live_checks");
fs.mkdirSync(CACHE, { recursive: true });

/** "2015-10-16T11:00:00.024201612Z" → seconds after 1970 (HAPI carries up to nine decimals). */
function hapiTime(s) {
  const ms = Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10), +s.slice(11, 13) || 0, +s.slice(14, 16) || 0);
  const r = s.length > 17 ? parseFloat(s.slice(17).replace("Z", "")) : 0;
  return ms / 1000 + (isFinite(r) ? r : 0);
}
const iso = (x) => (typeof x === "string" ? x : new Date(x * 1000).toISOString());
let last = 0;
/** The rows of one HAPI request: { t: [s], cols: [[...], ...] }; fill values (|x| ≥ 1e30) become NaN. */
async function series(id, params, a, b) {
  const url = `${HAPI}/data?id=${encodeURIComponent(id)}&parameters=${[].concat(params).join(",")}&time.min=${iso(a)}&time.max=${iso(b)}`;
  const file = path.join(CACHE, crypto.createHash("sha1").update(url).digest("hex") + ".csv");
  let text;
  if (fs.existsSync(file)) text = fs.readFileSync(file, "utf8");
  else {
    const wait = 400 - (Date.now() - last);                 // gentle: one request at a time, a breath between them
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    let r = null;
    for (let k = 0; k < 3; k++) {
      try { r = await fetch(url, { signal: AbortSignal.timeout(90000) }); } catch (e) { r = null; }
      if (r && (r.ok || r.status === 404)) break;
      await new Promise(res => setTimeout(res, 1500 * 2 ** k));
    }
    last = Date.now();
    if (!r) throw new Error(`${id}: no answer`);
    text = r.status === 404 ? "" : await r.text();
    if (!r.ok && r.status !== 404) throw new Error(`${id}: HTTP ${r.status}`);
    fs.writeFileSync(file, text);
  }
  const ta = typeof a === "string" ? hapiTime(a) : a, tb = typeof b === "string" ? hapiTime(b) : b;
  if (/^\s*[{,]/.test(text)) {                            // a HAPI status in place of data
    if (/1201|no data/i.test(text.slice(0, 600))) return { t: [], cols: [] };
    throw new Error(`${id}: ${text.slice(0, 200)}`);
  }
  const t = [], rows = [];
  for (const ln of text.split("\n")) {
    if (!ln || ln[0] === "#") continue;
    const f = ln.split(","), s = hapiTime(f[0]);
    if (!(s >= ta && s <= tb)) continue;
    t.push(s); rows.push(f.slice(1).map(x => { const v = parseFloat(x); return Math.abs(v) >= 1e30 || !isFinite(v) ? NaN : v; }));
  }
  const nc = rows.length ? rows[0].length : 0;
  return { t, cols: Array.from({ length: nc }, (_, c) => rows.map(r => r[c])) };
}
/** One vector parameter as [{t, x, y, z}] (its first three columns). */
async function vectors(id, param, a, b) {
  const r = await series(id, [param], a, b);
  return r.t.map((t, i) => ({ t, x: r.cols[0][i], y: r.cols[1][i], z: r.cols[2][i] })).filter(p => isFinite(p.x) && isFinite(p.y) && isFinite(p.z));
}
/** One scalar parameter as [{t, v}]. */
async function scalars(id, param, a, b) {
  const r = await series(id, [param], a, b);
  return r.t.map((t, i) => ({ t, v: r.cols[0][i] })).filter(p => isFinite(p.v));
}
/** FGM: burst where it covers [a, b], else survey (Helios's nativeFGM). */
async function fgm(n, a, b) {
  const bu = await vectors(`MMS${n}_FGM_BRST_L2@0`, `mms${n}_fgm_b_gse_brst_l2`, a, b);
  if (bu.length > 10) return { b: bu, burst: true };
  return { b: await vectors(`MMS${n}_FGM_SRVY_L2@0`, `mms${n}_fgm_b_gse_srvy_l2`, a, b), burst: false };
}
/** MEC positions [km, GSE], 30 s. */
const mec = (n, a, b) => vectors(`MMS${n}_MEC_SRVY_L2_EPHT89D`, `mms${n}_mec_r_gse`, a, b);
const shift = (x, s) => iso(hapiTime(iso(x)) + s);

module.exports = { series, vectors, scalars, fgm, mec, hapiTime, iso, shift, CACHE };
