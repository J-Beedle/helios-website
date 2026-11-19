/* The Interstellar view's numbers, ported from Helios (MMSTrackerCore: OuterCraft, OuterBody, HeliosphereModel,
   InterstellarFlow, LightDay, OuterPlanet). Nothing here draws: hsoview.js does.

   Frame: Sun-centered ecliptic of J2000, AU, the frame JPL Horizons' tables are in. Times are UT milliseconds.

   Positions of the spacecraft and the small bodies are JPL Horizons state vectors (assets/data/heliosphere.json, read
   2026-11-17) at 30- or 60-day steps, joined by a cubic Hermite through the tabulated velocities. The Voyagers' is one
   fixed solution (a 2022 refit of the 1981–1992 tracking, extrapolated). The planets are JPL's "Approximate Positions of
   the Planets" (Standish), Table 1, 1800–2050.

   Checked against fresh Horizons values on 2026-11-19 (tools/heliosphere_check.js holds the numbers). */
(function () {
  "use strict";
  const DEG = Math.PI / 180, TAU = 2 * Math.PI;
  const AU_KM = 149597870.7, C_KM_S = 299792.458;
  /** One light-day: c × 86,400 s = 25,902,068,371.2 km = 173.1446 AU. */
  const LIGHT_DAY_AU = C_KM_S * 86400 / AU_KM;
  const GM_SUN = 2.959122082855911e-4;                    // AU³/day²
  const jdOf = (ms) => ms / 864e5 + 2440587.5, msOf = (jd) => (jd - 2440587.5) * 864e5;
  const utc = (y, mo, d, h = 0, mi = 0, s = 0) => Date.UTC(y, mo - 1, d, h, mi, s);
  const len = (a) => Math.hypot(a[0], a[1], a[2]);
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

  // ── the interstellar wind, and the fixed frame the view is drawn in ──
  /** The direction the interstellar neutral helium flows FROM, ecliptic J2000, and its speed: 255.8° ± 0.5°,
   *  +5.16° ± 0.10°, 25.8 ± 0.4 km/s (IBEX; Bzowski et al. 2015, ApJS 220, 28). */
  const FLOW = { lon: 255.8, lat: 5.16, speed: 25.8 };
  const UPWIND = [Math.cos(FLOW.lat * DEG) * Math.cos(FLOW.lon * DEG), Math.cos(FLOW.lat * DEG) * Math.sin(FLOW.lon * DEG), Math.sin(FLOW.lat * DEG)];
  const cL = Math.cos(FLOW.lon * DEG), sL = Math.sin(FLOW.lon * DEG);
  /** Ecliptic J2000 → the view's frame: turned about the ecliptic pole so +X lies at the upwind longitude. Z stays
   *  ecliptic north. A fixed frame: one that followed Earth would spin the whole picture once a year. */
  const frame = (e) => [e[0] * cL + e[1] * sL, -e[0] * sL + e[1] * cL, e[2]];
  const angleFromUpwind = (p) => Math.acos(Math.max(-1, Math.min(1, dot(p, UPWIND) / len(p)))) / DEG;

  // ── the heliosphere model ──
  /** Heliopause: the Rankine half-body, r(α) = R₀ / cos(α/2), α from the upwind direction: the boundary of a point
   *  source in a uniform flow (Parker 1961). R₀ is set so the surface passes through Voyager 1's crossing (121.60 AU,
   *  29.8° from upwind): 117.5 AU. Voyager 2 crossed at 119.02 AU, 52.6° from upwind, where this surface is at 131.1 AU.
   *  Termination shock: a sphere whose radius is the mean of the two measured crossings (94.02 and 83.66 AU). */
  const MODEL = {
    v1Crossing: { r: 121.60, angle: 29.8 }, v2Crossing: { r: 119.02, angle: 52.6 },
    nose: 121.60 * Math.cos(29.8 * DEG / 2),
    shock: (94.02 + 83.66) / 2,
    limit: 235,                                            // the farthest the open surface is drawn, AU (120° from upwind)
  };
  const heliopauseR = (alpha) => { const c = Math.cos(alpha / 2); return c > 1e-6 ? MODEL.nose / c : null; };
  const maxAngle = (limit = MODEL.limit) => 2 * Math.acos(Math.min(1, MODEL.nose / limit));
  // the upwind axis and two unit vectors across it: e1 toward ecliptic north, e2 = u × e1
  const E1 = (() => { const d = UPWIND[2], v = [-UPWIND[0] * d, -UPWIND[1] * d, 1 - UPWIND[2] * d], m = len(v); return v.map(x => x / m); })();
  const E2 = cross(UPWIND, E1);
  /** A point on the model heliopause (ecliptic J2000, AU) at α from upwind and azimuth φ about the axis; null past the limit. */
  function heliopausePoint(alpha, phi, limit = MODEL.limit) {
    const r = heliopauseR(alpha);
    if (r === null || r > limit * 1.0001) return null;
    const ca = Math.cos(alpha), sa = Math.sin(alpha), cp = Math.cos(phi), sp = Math.sin(phi);
    return [0, 1, 2].map(k => r * (UPWIND[k] * ca + sa * (E1[k] * cp + E2[k] * sp)));
  }

  // ── the planets (JPL's approximate elements, Table 1): a, e, I, L, ϖ, Ω and their rates per century ──
  const ELEM = {
    earth: [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0, 0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0],
    jupiter: [5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909, -0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106],
    saturn: [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448, -0.00125060, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794],
    uranus: [19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.95427630, 74.01692503, -0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589],
    neptune: [30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574, 0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664],
  };
  function elementsAt(name, ms) {
    const E = ELEM[name], T = (ms - Date.UTC(2000, 0, 1, 12)) / 864e5 / 36525, el = E.slice(0, 6).map((v, i) => v + E[i + 6] * T);
    return { a: el[0], e: el[1], I: el[2] * DEG, L: el[3] * DEG, w: el[4] * DEG, O: el[5] * DEG };
  }
  function onOrbit(el, Ea) {
    const om = el.w - el.O, xp = el.a * (Math.cos(Ea) - el.e), yp = el.a * Math.sqrt(1 - el.e * el.e) * Math.sin(Ea);
    const co = Math.cos(om), so = Math.sin(om), cO = Math.cos(el.O), sO = Math.sin(el.O), cI = Math.cos(el.I), sI = Math.sin(el.I);
    return [(co * cO - so * sO * cI) * xp + (-so * cO - co * sO * cI) * yp,
            (co * sO + so * cO * cI) * xp + (-so * sO + co * cO * cI) * yp,
            so * sI * xp + co * sI * yp];
  }
  /** Heliocentric ecliptic J2000 position, AU ("earth" is the Earth–Moon barycenter, within 4,700 km of the Earth). */
  function planet(name, ms) {
    const el = elementsAt(name, ms);
    const M = ((el.L - el.w) % TAU + 3 * Math.PI) % TAU - Math.PI;
    let Ea = M + el.e * Math.sin(M);
    for (let k = 0; k < 12; k++) Ea -= (Ea - el.e * Math.sin(Ea) - M) / (1 - el.e * Math.cos(Ea));
    return onOrbit(el, Ea);
  }
  /** One closed orbit from the elements at that date, sampled in eccentric anomaly. */
  function planetOrbit(name, ms, n = 180) {
    const el = elementsAt(name, ms);
    return Array.from({ length: n + 1 }, (_, k) => onOrbit(el, TAU * k / n));
  }

  // ── the tables ──
  let DATA = null, loading = null;
  /** Fetches the tables once. Resolves true when they are in. */
  function load(url) {
    if (DATA) return Promise.resolve(true);
    if (!loading) {
      loading = fetch(url).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
        .then(d => { DATA = d; return true; })
        .catch(e => { loading = null; throw e; });
    }
    return loading;
  }
  const tableOf = (key) => (DATA ? DATA.craft[key] || DATA.bodies[key] || null : null);
  const count = (t) => t.v.length / 6;
  const coverage = (t) => [msOf(t.jd0), msOf(t.jd0 + (count(t) - 1) * t.step)];
  /** Position (AU) and velocity (AU/day) at ms, or null outside the table: nothing is extrapolated. */
  function state(key, ms) {
    const t = tableOf(key);
    if (!t) return null;
    const n = count(t), u = (jdOf(ms) - t.jd0) / t.step;
    if (n < 2 || !(u >= 0) || u > n - 1) return null;
    const i = Math.min(Math.floor(u), n - 2), s = u - i, h = t.step, a = i * 6, b = a + 6, v = t.v, s2 = s * s, s3 = s2 * s;
    const h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
    const d00 = (6 * s2 - 6 * s) / h, d10 = 3 * s2 - 4 * s + 1, d01 = -d00, d11 = 3 * s2 - 2 * s;
    return {
      p: [0, 1, 2].map(k => h00 * v[a + k] + h10 * h * v[a + 3 + k] + h01 * v[b + k] + h11 * h * v[b + 3 + k]),
      v: [0, 1, 2].map(k => d00 * v[a + k] + d10 * v[a + 3 + k] + d01 * v[b + k] + d11 * v[b + 3 + k]),
    };
  }
  /** The table's own samples between two instants (clipped to the table), with the exact ends added. */
  function path(key, ms0, ms1) {
    const t = tableOf(key);
    if (!t) return [];
    const [c0, c1] = coverage(t), lo = Math.max(ms0, c0), hi = Math.min(ms1, c1);
    if (!(lo < hi)) return [];
    const first = state(key, lo), last = state(key, hi);
    if (!first || !last) return [];
    const u0 = (jdOf(lo) - t.jd0) / t.step, u1 = (jdOf(hi) - t.jd0) / t.step, out = [first.p];
    for (let i = Math.floor(u0) + 1; i < u1; i++) out.push([t.v[i * 6], t.v[i * 6 + 1], t.v[i * 6 + 2]]);
    out.push(last.p);
    return out;
  }
  /** The osculating ellipse through a state, uniform in true anomaly; empty when the orbit is not bound. */
  function ellipse(r, v, n = 240) {
    const rm = len(r), h = cross(r, v), h2 = dot(h, h);
    if (!(rm > 0) || !(h2 > 0)) return [];
    const vxh = cross(v, h), eV = [0, 1, 2].map(k => vxh[k] / GM_SUN - r[k] / rm), e = len(eV);
    if (!(e < 1)) return [];
    const p = h2 / GM_SUN, hm = Math.sqrt(h2), hH = h.map(x => x / hm), pH = e > 1e-8 ? eV.map(x => x / e) : r.map(x => x / rm), qH = cross(hH, pH);
    return Array.from({ length: n + 1 }, (_, i) => {
      const nu = TAU * i / n, rad = p / (1 + e * Math.cos(nu));
      return [0, 1, 2].map(k => rad * (pH[k] * Math.cos(nu) + qH[k] * Math.sin(nu)));
    });
  }

  // ── what is drawn ──
  /** The craft leaving the solar system. Horizons targets −31, −32, −98, −23, −24. The Pioneers no longer answer:
   *  Pioneer 10's last signal was received in January 2003, Pioneer 11's in November 1995 (NASA). */
  const CRAFT = [
    { key: "voyager1", name: "Voyager 1", color: 0xFFD166 },
    { key: "voyager2", name: "Voyager 2", color: 0x7fd6a0 },
    { key: "newHorizons", name: "New Horizons", color: 0x8fb7ff },
    { key: "pioneer10", name: "Pioneer 10", color: 0x8a8f99, silentSince: utc(2003, 1, 23) },
    { key: "pioneer11", name: "Pioneer 11", color: 0x8a8f99, silentSince: utc(1995, 11, 24) },
  ];
  /** The dwarf planets beyond Neptune, Sedna, New Horizons' second target, and the three interstellar objects found so
   *  far. An interstellar object's marker is drawn only from the date it was found. */
  const BODIES = [
    { key: "pluto", name: "Pluto", kind: "dwarf" }, { key: "eris", name: "Eris", kind: "dwarf" },
    { key: "makemake", name: "Makemake", kind: "dwarf" }, { key: "haumea", name: "Haumea", kind: "dwarf" },
    { key: "sedna", name: "Sedna", kind: "tno" }, { key: "arrokoth", name: "Arrokoth", kind: "tno" },
    { key: "oumuamua", name: "1I/ʻOumuamua", kind: "interstellar", found: utc(2017, 10, 19) },
    { key: "borisov", name: "2I/Borisov", kind: "interstellar", found: utc(2019, 8, 30) },
    { key: "atlas3I", name: "3I/ATLAS", kind: "interstellar", found: utc(2025, 7, 1) },
  ];
  /** The four boundary crossings the Voyagers measured (dates from the mission's papers, distances from Horizons on
   *  those dates), and the instants each Voyager's distance from Earth passes one light-day (Horizons). */
  const EVENTS = [
    { craft: "voyager1", kind: "shock", title: "Termination shock", t: utc(2004, 12, 16), au: 94.02 },
    { craft: "voyager1", kind: "heliopause", title: "Heliopause", t: utc(2012, 8, 25), au: 121.60 },
    { craft: "voyager2", kind: "shock", title: "Termination shock", t: utc(2007, 8, 30), au: 83.66 },
    { craft: "voyager2", kind: "heliopause", title: "Heliopause", t: utc(2018, 11, 5), au: 119.02 },
    { craft: "voyager1", kind: "lightDay", t: utc(2026, 11, 18, 10, 16, 7) },
    { craft: "voyager2", kind: "lightDay", t: utc(2035, 11, 1, 7, 6) },
  ];
  const KUIPER = { inner: 30, outer: 50 };

  /** Everything placed for one instant: [{ ...craft, p, sun, earth, light (s), silent, lon, lat }]. */
  function craftAt(ms) {
    const e = planet("earth", ms), out = [];
    for (const c of CRAFT) {
      const s = state(c.key, ms);
      if (!s) continue;
      const sun = len(s.p), d = len([s.p[0] - e[0], s.p[1] - e[1], s.p[2] - e[2]]);
      out.push(Object.assign({}, c, { p: s.p, sun, earth: d, light: d * AU_KM / C_KM_S, silent: c.silentSince != null && c.silentSince <= ms,
        lon: (Math.atan2(s.p[1], s.p[0]) / DEG + 360) % 360, lat: Math.asin(s.p[2] / sun) / DEG, upwind: angleFromUpwind(s.p) }));
    }
    return out;
  }

  const api = {
    AU_KM, C_KM_S, LIGHT_DAY_AU, FLOW, UPWIND, MODEL, KUIPER, CRAFT, BODIES, EVENTS,
    frame, angleFromUpwind, heliopauseR, maxAngle, heliopausePoint,
    planet, planetOrbit, load, get ready() { return !!DATA; }, coverage: (key) => { const t = tableOf(key); return t ? coverage(t) : null; },
    state, path, ellipse, craftAt,
    /** For tests: the tables, handed in. */
    use(d) { DATA = d; },
  };
  (typeof window !== "undefined" ? window : globalThis).Heliosphere = api;
})();
