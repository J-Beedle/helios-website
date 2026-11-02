/* The Helio Wiki's hero figure, drawn for the web.
 *
 * A port of Helios's ThothHeroScene (MMSTrackerMac/Thoth, 2026-10-29): the noon–midnight meridian at
 * 2 nPa, IMF Bz −3 nT and zero dipole tilt, seen from dusk with the Sun to the left. The geometry in
 * assets/data/hero-geometry.json comes from the app's own models (Lin et al. 2010 magnetopause with the
 * Petrinec & Russell 1996 tail, the Jelínek et al. 2012 bow shock, IGRF + T89 field lines, the Starkov
 * oval), exported once by a small tool that reads Helios's core package. The solar wind is the app's
 * streak model: parcels follow streamlines round the magnetopause pushed 1.2 Rₑ out, slowed in the sheath,
 * drawn additively. Reduced motion freezes it.
 */
(function () {
  "use strict";

  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = (a, b, x) => { const u = clamp((x - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); };
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const rgba = (r, g, b, a) => `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${a})`;

  /** A seeded generator, so the stars and streaks are the same on every visit. */
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** The point at polar angle th (from the sunward axis) along a boundary listed by angle. */
  function at(edge, th) {
    let prev = edge[0], pa = Math.atan2(prev[1], prev[0]);
    for (let i = 1; i < edge.length; i++) {
      const q = edge[i], qa = Math.atan2(q[1], q[0]);
      if ((pa - th) * (qa - th) <= 0 && pa !== qa) {
        const f = (th - pa) / (qa - pa);
        return [prev[0] + (q[0] - prev[0]) * f, prev[1] + (q[1] - prev[1]) * f];
      }
      prev = q; pa = qa;
    }
    return prev;
  }
  const rAt = (edge, th) => { const p = at(edge, th); return Math.hypot(p[0], p[1]); };

  /** The solar wind's streamlines: SolarWindBand from the app. A parcel that starts ρ0 from the axis
   *  keeps ρ² − ρ_b(θ)² = ρ0², where ρ_b is the magnetopause's equatorial loop pushed 1.2 Rₑ out. */
  function makeBand(loop) {
    const flank = (upper) => loop.filter(p => upper ? p[1] >= 0 : p[1] <= 0)
      .map(p => [Math.atan2(Math.abs(p[1]), p[0]), Math.hypot(p[0], p[1]) + 1.2])
      .filter(q => q[1] > 1.7).sort((a, b) => a[0] - b[0]);
    const flanks = [flank(true), flank(false)].filter(f => f.length > 1);
    function bandRho(t) {
      let sum = 0;
      for (const f of flanks) {
        const last = f[f.length - 1];
        if (t >= last[0]) { sum += last[1] * Math.sin(last[0]); continue; }
        if (t <= f[0][0]) { sum += f[0][1] * Math.sin(t); continue; }
        let lo = 0, hi = f.length - 1;
        while (hi - lo > 1) { const m = (lo + hi) >> 1; if (f[m][0] <= t) lo = m; else hi = m; }
        const u = (t - f[lo][0]) / Math.max(1e-9, f[hi][0] - f[lo][0]);
        sum += (f[lo][1] + u * (f[hi][1] - f[lo][1])) * Math.sin(t);
      }
      return sum / flanks.length;
    }
    const nt = 2048, table = new Float64Array(nt + 1);
    for (let i = 0; i <= nt; i++) table[i] = bandRho(i / nt * Math.PI);
    const rb = (t) => { const f = clamp(t / Math.PI * nt, 0, nt - 1e-9), i = f | 0; return table[i] + (f - i) * (table[i + 1] - table[i]); };
    return function z(x, z0) {
      const r0 = Math.abs(z0);
      let a = r0, b = r0 + 50;
      for (let k = 0; k < 18; k++) {
        const m = (a + b) / 2, h = rb(Math.atan2(m, x));
        if (m * m - r0 * r0 - h * h > 0) b = m; else a = m;
      }
      return Math.sign(z0) * (a + b) / 2;
    };
  }

  class Hero {
    constructor(canvas, geo, texture) {
      this.canvas = canvas;
      this.g = geo;
      this.tex = texture;
      this.band = makeBand(geo.loopXY);
      this.bsR = new Float32Array(513);
      for (let i = 0; i <= 512; i++) this.bsR[i] = rAt(geo.bs, i / 512 * Math.PI);
      this.still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      this.t0 = performance.now();
      this.resize();
      window.addEventListener("resize", () => this.resize());
      this.frame(performance.now());                         // a first picture at once, even in a background tab
      if (!this.still) requestAnimationFrame((t) => this.loop(t));
    }

    /** Where Earth sits and how many pixels make an Earth radius, for this canvas. */
    layout() {
      const W = this.canvas.clientWidth, H = this.canvas.clientHeight;
      const k = Math.min(H / 44, W / 34);
      const earth = [W * 0.58, H * 0.5];
      return { W, H, k, earth, wide: W >= 1100, P: (x, z) => [earth[0] - x * k, earth[1] - z * k], xRight: -(W - earth[0]) / k };
    }

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const c = this.canvas;
      c.width = Math.round(c.clientWidth * dpr);
      c.height = Math.round(c.clientHeight * dpr);
      this.dpr = dpr;
      this.L = this.layout();
      this.streaks = this.makeStreaks(this.L);
      this.stat = document.createElement("canvas");
      this.stat.width = c.width; this.stat.height = c.height;
      const ctx = this.stat.getContext("2d");
      ctx.scale(dpr, dpr);
      this.drawStatic(ctx, this.L);
      if (this.still) this.frame(performance.now());
    }

    /** Where the bow shock stands at height h above the Sun–Earth line (null if it never gets that wide). */
    shockX(h) {
      const bs = this.g.bs;
      for (let i = 1; i < bs.length; i++) {
        if (bs[i][1] >= h) {
          const [x0, z0] = bs[i - 1], [x1, z1] = bs[i];
          return x0 + (h - z0) / Math.max(1e-9, z1 - z0) * (x1 - x0);
        }
      }
      return null;
    }

    makeStreaks(L) {
      const g = this.g, rng = mulberry32(0x5EED2026), out = [];
      const zMax = L.H / 2 / L.k + 3, n = 360;
      for (let s = 0; s < (L.wide ? 230 : 150); s++) {
        const z0 = (rng() < 0.5 ? -1 : 1) * (1.2 + (zMax - 1.2) * rng());
        // Upstream of the bow shock the wind runs straight and at full speed; it first feels Earth at the shock, where
        // it slows and turns onto the streamline (round the magnetopause) that passes through its crossing point.
        const a = Math.abs(z0), sg = Math.sign(z0), xs = this.shockX(a);
        let r1 = a;
        if (xs !== null) {
          let lo = 0, hi = a;
          for (let it = 0; it < 30; it++) { const mid = (lo + hi) / 2; if (this.band(xs, mid) > a) hi = mid; else lo = mid; }
          r1 = (lo + hi) / 2;
        }
        const raw = [], times = [];
        let tAcc = 0, prev = null;
        for (let x = 31; x >= L.xRight - 6; x -= 0.3) {
          const inside = xs !== null && x < xs;
          const p = inside ? [x, sg * this.band(x, r1)] : [x, z0];
          if (prev) {
            const ds = Math.hypot(p[0] - prev[0], p[1] - prev[1]);
            const th = Math.atan2(Math.abs(p[1]), p[0]);
            tAcc += ds / (inside ? 0.36 + 0.64 * Math.min(1, th / (0.78 * Math.PI)) : 1);
          }
          if (xs !== null && prev && prev[0] >= xs && x < xs) { raw.push([xs, z0]); times.push(times[times.length - 1] + (prev[0] - xs)); }
          raw.push(p); times.push(tAcc); prev = p;
        }
        if (tAcc <= 0 || raw.length < 3) continue;
        const pts = new Float32Array(n * 2);
        let j = 0;
        for (let i = 0; i < n; i++) {
          const tt = tAcc * i / (n - 1);
          while (j < times.length - 2 && times[j + 1] < tt) j++;
          const f = (tt - times[j]) / Math.max(times[j + 1] - times[j], 1e-9);
          const q = L.P(raw[j][0] + (raw[j + 1][0] - raw[j][0]) * f, raw[j][1] + (raw[j + 1][1] - raw[j][1]) * f);
          pts[2 * i] = q[0]; pts[2 * i + 1] = q[1];
        }
        out.push({ pts, phase: rng(), rate: 0.075 + 0.035 * rng(), alpha: 0.25 + 0.6 * rng(),
                   width: 0.7 + 0.9 * rng(), len: 7 + Math.floor(8 * rng()), head: rng() < 0.3 });
      }
      return out;
    }

    /** A point at magnetic latitude lat, MLT mlt and radius r (SM ≈ GSM at zero tilt). */
    static sm(lat, mlt, r, north) {
      const la = (north ? lat : -lat) * Math.PI / 180, ph = (mlt - 12) * Math.PI / 12;
      return [r * Math.cos(la) * Math.cos(ph), r * Math.cos(la) * Math.sin(ph), r * Math.sin(la)];
    }
    /** Onto a disk of radius R at c along the axes; null when the Earth hides it. */
    static onDisk(p, ax, c, R) {
      const u = dot(p, ax.right), v = dot(p, ax.down), w = dot(p, ax.toward);
      if (w < 0 && u * u + v * v < 1) return null;
      return [c[0] + R * u, c[1] + R * v];
    }

    /** The textured globe, lit by the Sun (+x GSE), seen along the given GSE axes, turned phi east of the
     *  geometry's moment. The canvas is reused from frame to frame. */
    globe(R, basis, phi = 0) {
      const size = Math.max(2, Math.ceil(2 * R * this.dpr));
      const cv = this.globeCv && this.globeCv.width === size ? this.globeCv : document.createElement("canvas");
      cv.width = cv.height = size;
      this.globeCv = cv;
      const ctx = cv.getContext("2d");
      const img = ctx.createImageData(size, size);
      const T = this.tex, tw = T.width, th = T.height, td = T.data;
      const axis = this.g.earthAxisGSE, p0 = this.g.earthPrimeGSE, e0 = cross(axis, p0);
      const prime = [0, 1, 2].map(i => p0[i] * Math.cos(phi) + e0[i] * Math.sin(phi)), east = cross(axis, prime);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const u = (x + 0.5) / size * 2 - 1, v = (y + 0.5) / size * 2 - 1, rr = u * u + v * v;
          if (rr > 1) continue;
          const w = Math.sqrt(1 - rr);
          const p = [0, 1, 2].map(i => u * basis.right[i] + v * basis.down[i] + w * basis.toward[i]);
          const lat = Math.asin(clamp(dot(p, axis), -1, 1)), lon = Math.atan2(dot(p, east), dot(p, prime));
          const sx = Math.min(tw - 1, Math.floor((lon + Math.PI) / TAU * tw)), sy = Math.min(th - 1, Math.floor((Math.PI / 2 - lat) / Math.PI * th));
          const k = 4 * (sy * tw + sx);
          const sun = p[0];
          const light = Math.max(0.12, smooth(-0.1, 0.18, sun)) * (0.82 + 0.18 * w);
          const o = 4 * (y * size + x);
          img.data[o] = td[k] * light + (1 - light) * 6;
          img.data[o + 1] = td[k + 1] * light + (1 - light) * 10;
          img.data[o + 2] = td[k + 2] * light + (1 - light) * 26;
          img.data[o + 3] = 255 * smooth(1.0, 0.985, Math.sqrt(rr));
        }
      }
      ctx.putImageData(img, 0, 0);
      return cv;
    }

    drawEarth(ctx, c, R, axesGSM, basisGSE, phi = 0) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const glow = ctx.createRadialGradient(c[0], c[1], 0, c[0], c[1], R * 1.25);
      glow.addColorStop(0.70, "rgba(0,0,0,0)");
      glow.addColorStop(0.80, rgba(0.45, 0.72, 1, 0.35));
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(c[0], c[1], R * 1.25, 0, TAU); ctx.fill();
      ctx.restore();
      ctx.drawImage(this.globe(R, basisGSE, phi), c[0] - R, c[1] - R, 2 * R, 2 * R);
      // the auroral oval, both hemispheres (the live layer adds the shimmer)
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = rgba(0.3, 1, 0.55, 0.22);
      for (const north of [true, false]) {
        const eq = this.g.oval.map(o => Hero.onDisk(Hero.sm(o[1], o[0], 1.025, north), axesGSM, c, R));
        const po = this.g.oval.map(o => Hero.onDisk(Hero.sm(o[2], o[0], 1.025, north), axesGSM, c, R));
        if (eq.some(q => !q) || po.some(q => !q)) {
          // partly hidden: dots along the band where they show
          for (const o of this.g.oval) for (const f of [0, 0.34, 0.68, 1]) {
            const q = Hero.onDisk(Hero.sm(o[1] + (o[2] - o[1]) * f, o[0], 1.025, north), axesGSM, c, R);
            if (q) { ctx.beginPath(); ctx.arc(q[0], q[1], Math.max(R * 0.018, 0.5), 0, TAU); ctx.fill(); }
          }
          continue;
        }
        ctx.beginPath();
        eq.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.closePath();
        po.slice().reverse().forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.closePath();
        ctx.fill("evenodd");
      }
      ctx.restore();
    }

    drawStatic(ctx, L) {
      const g = this.g, P = L.P, s = L.k / 17;
      // deep space, warmer toward the Sun
      const bg = ctx.createLinearGradient(0, L.H * 0.4, L.W, L.H * 0.6);
      bg.addColorStop(0, "#111C36"); bg.addColorStop(0.5, "#070B16"); bg.addColorStop(1, "#03050B");
      ctx.fillStyle = bg; ctx.fillRect(0, 0, L.W, L.H);
      const rng = mulberry32(0xA57E0042);
      for (let i = 0; i < (L.wide ? 260 : 150); i++) {
        const x = rng() * L.W, y = rng() * L.H, r = 0.35 + 0.9 * rng(), a = 0.15 + 0.6 * rng();
        ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      }
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const sun = ctx.createRadialGradient(-L.W * 0.08, L.H / 2, 0, -L.W * 0.08, L.H / 2, L.W * 0.42);
      sun.addColorStop(0, rgba(1, 0.78, 0.45, 0.22)); sun.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = sun; ctx.fillRect(0, 0, L.W, L.H);
      ctx.restore();

      const poly = (edge) => {
        const north = edge.filter(p => p[0] > L.xRight - 10);
        ctx.beginPath();
        north.forEach((p, i) => { const q = P(p[0], p[1]); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); });
        north.slice().reverse().forEach(p => { const q = P(p[0], -p[1]); ctx.lineTo(q[0], q[1]); });
        ctx.closePath();
      };
      const line = (pts, flip) => {
        ctx.beginPath();
        pts.forEach((p, i) => { const q = P(p[0], flip ? -p[1] : p[1]); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); });
      };

      // the shocked wind, then the magnetosphere's interior
      poly(g.bs); ctx.fillStyle = rgba(0.45, 0.75, 1, 0.075); ctx.fill();
      poly(g.mp);
      const inner = ctx.createRadialGradient(L.earth[0], L.earth[1], 0, L.earth[0], L.earth[1], L.k * 30);
      inner.addColorStop(0, "rgba(27,49,99,0.92)"); inner.addColorStop(1, "rgba(11,21,48,0.86)");
      ctx.fillStyle = inner; ctx.fill();

      // the plasma sheet, warm, thickening down the tail
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const sheetH = (x) => (0.4 + 4.2 * Math.min(1, (-x - 5) / 42)) * Math.min(1, (-x - 5) / 4 + 0.15);
      const xs = []; for (let x = -5; x >= L.xRight - 2; x -= 0.5) xs.push(x);
      for (const f of [1, 0.72, 0.46, 0.22]) {
        ctx.beginPath();
        xs.forEach((x, i) => { const q = P(x, sheetH(x) * f); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); });
        xs.slice().reverse().forEach(x => { const q = P(x, -sheetH(x) * f); ctx.lineTo(q[0], q[1]); });
        ctx.closePath();
        const a = P(-8, 0), b = P(L.xRight, 0);
        const gr = ctx.createLinearGradient(a[0], a[1], b[0], b[1]);
        gr.addColorStop(0, rgba(1, 0.58, 0.28, 0.075)); gr.addColorStop(1, rgba(1, 0.5, 0.2, 0.02));
        ctx.fillStyle = gr; ctx.fill();
      }
      ctx.restore();

      // field lines, closed blue-white and open violet, inside the magnetopause
      ctx.save();
      poly(g.mp); ctx.clip();
      ctx.lineWidth = 1.0 * s; ctx.strokeStyle = rgba(0.62, 0.78, 1, 0.5);
      for (const l of g.closed) { line(l, false); ctx.stroke(); }
      ctx.lineWidth = 0.9 * s; ctx.strokeStyle = rgba(0.74, 0.6, 1, 0.38);
      for (const l of g.lobes) { line(l, false); ctx.stroke(); line(l, true); ctx.stroke(); }
      ctx.restore();

      // the boundaries, limb-brightened
      for (const flip of [false, true]) {
        ctx.save(); ctx.globalCompositeOperation = "lighter";
        line(g.bs, flip); ctx.lineWidth = 7 * s; ctx.strokeStyle = rgba(0.55, 0.85, 1, 0.07); ctx.stroke();
        line(g.mp, flip); ctx.lineWidth = 9 * s; ctx.strokeStyle = rgba(0.55, 0.72, 1, 0.10); ctx.stroke();
        ctx.restore();
        line(g.bs, flip); ctx.setLineDash([5 * s, 4 * s]); ctx.lineWidth = 1.1 * s; ctx.strokeStyle = rgba(0.62, 0.88, 1, 0.55); ctx.stroke();
        ctx.setLineDash([]);
        line(g.mp, flip); ctx.lineWidth = 1.7 * s; ctx.strokeStyle = rgba(0.78, 0.86, 1, 0.9); ctx.stroke();
      }

      // MMS, crossing the dayside magnetopause 25° north of the nose
      const mp25 = at(g.mp, 25 * Math.PI / 180), m = P(mp25[0], mp25[1]);
      const tet = [[-5, -4], [5, -3], [-2, 5], [6, 5]].map(([dx, dy]) => [m[0] + dx * s, m[1] + dy * s]);
      this.links(ctx, tet, rgba(0.6, 0.9, 1, 0.55), 0.7 * s);
      for (const p of tet) this.craft(ctx, p, [0.6, 0.95, 1], 1.6 * s, 3.5 * s);


      // the fleet
      const fs = 12 * Math.max(0.8, Math.min(1.25, s));
      const themis = [0.55, 1, 0.75], cluster = [1, 0.82, 0.45], solar = [1, 0.9, 0.55];
      const tp = [[-9.6, 0.55], [-10.8, 0.8], [-11.9, 0.4]].map(([x, z]) => P(x, z));
      tp.forEach(p => this.craft(ctx, p, themis, 1.6 * s, 4 * s));
      this.tag(ctx, "THEMIS", [Math.min(tp[2][0] - 8 * s, L.W - 34), tp[2][1] + 16 * s], themis, 0.9, fs, "center");
      const cc = P(3.0, 10.4);
      const ct = [[-9, -6], [9, -4], [-3, 9], [8, 8]].map(([dx, dy]) => [cc[0] + dx * s, cc[1] + dy * s]);
      this.links(ctx, ct, rgba(...cluster, 0.5), 0.7 * s);
      ct.forEach(p => this.craft(ctx, p, cluster, 1.35 * s, 3.5 * s));
      this.tag(ctx, "Cluster", [cc[0] + 14 * s, cc[1] - 2 * s], cluster, 0.9, fs, "left");
      const narrow = L.W < 700;
      const s1 = narrow ? [18, L.H * 0.17] : [30, L.H * 0.3];
      this.craft(ctx, s1, solar, 1.7 * s, 4.4 * s);
      this.tag(ctx, "SOLAR-1", [s1[0] + 8 * s, s1[1]], solar, 0.9, fs, "left");

      // names, quietly, on the north side (the page's words sit over the south)
      const bsN = at(g.bs, 1.05), mpN = at(g.mp, 1.62);
      this.tag(ctx, "Bow shock", P(bsN[0] + 0.6, bsN[1]), [0.62, 0.88, 1], 0.75, fs, "right", 500);
      this.tag(ctx, "Magnetopause", P(mpN[0] * 1.08, mpN[1] * 1.08 + 0.4), [0.78, 0.86, 1], 0.85, fs, "left", 500);
      if (!narrow) this.tag(ctx, "Plasma sheet", P(Math.max(-31, L.xRight + 7), -4.6), [1, 0.72, 0.5], 0.6, fs, "center", 500);
      this.tag(ctx, "MMS", [m[0] + 10 * s, m[1] - 9 * s], [0.7, 0.95, 1], 0.9, fs, "left");
    }

    links(ctx, pts, color, width) {
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) { ctx.moveTo(...pts[i]); ctx.lineTo(...pts[j]); }
      ctx.lineWidth = width; ctx.strokeStyle = color; ctx.stroke();
    }
    craft(ctx, p, c, r, glowR) {
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      const gr = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], glowR);
      gr.addColorStop(0, rgba(...c, 0.8)); gr.addColorStop(1, rgba(...c, 0));
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(p[0], p[1], glowR, 0, TAU); ctx.fill(); ctx.restore();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, TAU); ctx.fill();
    }
    tag(ctx, text, p, c, a, size, align, weight = 500) {
      window.FK.text(ctx, text.replace(/Rₑ/g, "R_E"), p[0], p[1], { size, weight, align, color: rgba(...c, a) });
    }

    drawLive(ctx, L, t) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      for (const st of this.streaks) {
        const head = (t * st.rate + st.phase) % 1, k = Math.floor(head * 359);
        if (k <= st.len) continue;
        const lo0 = k - st.len, third = Math.max(1, Math.floor((st.len + 1) / 3));
        for (let part = 0; part < 3; part++) {
          const lo = lo0 + part * third, hi = part === 2 ? k : Math.min(k, lo0 + (part + 1) * third);
          if (hi <= lo) continue;
          ctx.beginPath(); ctx.moveTo(st.pts[2 * lo], st.pts[2 * lo + 1]);
          for (let i = lo + 1; i <= hi; i++) ctx.lineTo(st.pts[2 * i], st.pts[2 * i + 1]);
          ctx.lineWidth = st.width; ctx.strokeStyle = rgba(1, 0.94, 0.8, st.alpha * [0.18, 0.4, 0.75][part]); ctx.stroke();
        }
        if (st.head) {
          ctx.fillStyle = `rgba(255,255,255,${st.alpha})`;
          ctx.beginPath(); ctx.arc(st.pts[2 * k], st.pts[2 * k + 1], 1.1, 0, TAU); ctx.fill();
        }
      }
      ctx.restore();
      // the Earth, turning once a minute under an oval that stays put in local time
      const side = { right: [-1, 0, 0], down: [0, 0, -1], toward: [0, 1, 0] };
      this.drawEarth(ctx, L.earth, L.k, side, this.g.sideGSE, this.still ? 0 : t * TAU / 60);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      // the aurora's shimmer: brightest near midnight, rippling in MLT
      const shimmer = (c, R, axes, dotR) => {
        for (const north of [true, false]) {
          this.g.oval.forEach((o, i) => {
            if (i % 2) return;
            const night = 0.5 + 0.5 * Math.cos(o[0] * Math.PI / 12);
            const ripple = 0.55 + 0.45 * Math.sin(o[0] * 1.9 + t * 1.6) * Math.sin(t * 0.7 + i * 0.37);
            const a = (0.12 + 0.88 * night) * ripple;
            if (a <= 0.05) return;
            for (const f of [0.2, 0.55, 0.85]) {
              const q = Hero.onDisk(Hero.sm(o[1] + (o[2] - o[1]) * f, o[0], 1.03, north), axes, c, R);
              if (!q) continue;
              ctx.fillStyle = rgba(0.35, 1, 0.6, 0.35 * a);
              ctx.beginPath(); ctx.arc(q[0], q[1], dotR, 0, TAU); ctx.fill();
            }
          });
        }
      };
      shimmer(L.earth, L.k, side, Math.max(0.8, L.k * 0.05));
      ctx.restore();
    }

    frame(now) {
      const ctx = this.canvas.getContext("2d");
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(this.stat, 0, 0);
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.drawLive(ctx, this.L, this.still ? 12 : (now - this.t0) / 1000);
    }

    loop(now) {
      if (!document.hidden && this.visible !== false) this.frame(now);
      requestAnimationFrame((t) => this.loop(t));
    }
  }

  /** Start the figure on a canvas once its geometry and the Earth's texture have loaded. */
  window.HeliosHero = {
    async start(canvas, geometryURL, textureURL) {
      const [geo, img] = await Promise.all([
        fetch(geometryURL).then(r => r.json()),
        new Promise((ok, fail) => { const im = new Image(); im.onload = () => ok(im); im.onerror = fail; im.src = textureURL; }),
      ]);
      const c = document.createElement("canvas");
      c.width = img.width; c.height = img.height;
      const x = c.getContext("2d");
      x.drawImage(img, 0, 0);
      const hero = new Hero(canvas, geo, x.getImageData(0, 0, img.width, img.height));
      if ("IntersectionObserver" in window) {
        new IntersectionObserver(es => es.forEach(e => { hero.visible = e.isIntersecting; })).observe(canvas);
      }
      return hero;
    },
  };
})();
