/* The home page's hero, second generation: the noon–midnight plane seen from dusk, alive.
 *
 * The same conditions as the first (2 nPa, IMF Bz −3 nT, zero dipole tilt, Kp 3) and the same boundaries (Lin et al.
 * 2010 with the Petrinec & Russell 1996 tail; Jelínek et al. 2012), but the field and the flow now come from one
 * kinematic model (js/gfx/meridian.js). The solar wind's field lines ride in with the streaks, bend at the bow
 * shock, drape over the nose and reconnect there; the opened lines are carried over the poles into the lobes and
 * sink toward the plasma sheet, and closed lines return to the day side. Nothing crosses and nothing fades: each
 * line is a contour of one flux function. The oval is Starkov's, and its poleward edge at noon and midnight is
 * where the model's open field meets its closed field.
 */
(function () {
  "use strict";
  const HX = window.HX, { TAU, DEG, clamp, smooth, rgba, PAL, M, rng, curve } = HX;
  const SW = { pd: 2, bz: -3, bt: 5, tilt: 0, kp: 3, mach: 8 };
  // Earth's rotation axis and prime meridian in GSE at 11:00 UT on 20 March 2016, when the dipole tilt is zero, and
  // the view from dusk with GSM north up (from Helios's export of the Helio Wiki's hero figure)
  const AXIS = [0.002, 0.398, 0.917], PRIME = [0.957, -0.266, 0.114];
  const VIEW_GSE = { right: [-1, 0, 0], down: [0, -0.239, -0.971], toward: [0, 0.971, -0.239] };
  const VIEW_GSM = { right: [-1, 0, 0], down: [0, 0, -1], toward: [0, 1, 0] };
  const V = 4.2, DX = 13, DPSI = 0.0125;                        // the wind on screen [R_E/s]; R_E between its drawn lines; flux between lines
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

  /** A point at magnetic latitude lat, local time mlt and radius r (SM ≈ GSM at zero tilt). */
  const sm = (lat, mlt, r, north) => { const la = (north ? lat : -lat) * DEG, ph = (mlt - 12) * Math.PI / 12; return [r * Math.cos(la) * Math.cos(ph), r * Math.cos(la) * Math.sin(ph), r * Math.sin(la)]; };
  const onDisk = (p, c, R) => { const u = dot(p, VIEW_GSM.right), v = dot(p, VIEW_GSM.down), w = dot(p, VIEW_GSM.toward); return w < 0 && u * u + v * v < 1 ? null : [c[0] + R * u, c[1] + R * v]; };

  class Hero {
    constructor(canvas, tex) {
      this.canvas = canvas; this.tex = tex;
      const al = M.starkovAL(SW.kp);
      this.oval = [];
      for (let i = 0; i < 96; i++) { const t = i / 4; this.oval.push([t, 90 - M.starkov(1, t, al), 90 - M.starkov(0, t, al)]); }
      this.thetaD = M.starkov(0, 12, al); this.thetaN = M.starkov(0, 0, al);
      this.mp = M.linMeridian(SW); this.bs = M.jelinek(SW.pd, SW.mach);
      this.E = null; this.fade = 0; this.pulse = -9; this.lastPhase = 0; this.cost = 4;
      this.belts = null;
      const im = new Image();
      im.onload = () => { this.belts = this.tintBelts(im); if (this.L) { this.drawStatic(); this.stage.redraw(); } };
      im.src = "assets/img/belts-electron-max.png";
      this.stage = HX.stage(canvas, { stillAt: 21.3, resize: (st) => this.resize(st), draw: (ctx, w, h, t, dt) => this.frame(ctx, t, dt) });
    }

    /** AE-8's > 1 MeV electrons in a magnetic meridian (Helios's cut, 8-bit log flux), as a faint violet glow. */
    tintBelts(im) {
      const c = document.createElement("canvas"); c.width = im.width; c.height = im.height;
      const x = c.getContext("2d"); x.drawImage(im, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height);
      for (let i = 0; i < d.data.length; i += 4) {
        const v = d.data[i] / 255;
        d.data[i] = 150 + 90 * v; d.data[i + 1] = 110 + 60 * v; d.data[i + 2] = 255; d.data[i + 3] = v > 0 ? 255 * Math.pow(v, 2.2) * 0.5 : 0;
      }
      x.putImageData(d, 0, 0);
      return c;
    }

    layout(W, H) {
      const k = Math.min(H / 44, W / 34), earth = [W * 0.58, H * 0.5];
      return { W, H, k, earth, wide: W >= 1100, narrow: W < 700, P: (x, z) => [earth[0] - x * k, earth[1] - z * k],
               xLeft: earth[0] / k, xRight: -(W - earth[0]) / k, zTop: earth[1] / k };
    }

    resize(st) {
      const L = this.L = this.layout(st.w, st.h);
      this.dpr = st.dpr;
      this.stat = document.createElement("canvas");
      this.stat.width = Math.round(st.w * st.dpr); this.stat.height = Math.round(st.h * st.dpr);
      this.drawStatic();
      // the model's grid covers what this canvas shows; it is rebuilt only when that changes
      const grid = { x0: Math.max(-70, Math.floor(L.xRight) - 3), x1: 22, zmax: Math.min(36, Math.ceil(L.zTop) + 1), h: L.k < 13 ? 0.4 : 0.25 };
      const key = [grid.x0, grid.zmax, grid.h].join();
      if (key === this.gridKey) { this.streaks = this.makeStreaks(); return; }
      this.gridKey = key;
      clearTimeout(this.building);
      this.building = setTimeout(() => {                         // after the first picture is on screen
        const E = HX.Meridian({ mp: this.mp, bs: this.bs, grid, thetaD: this.thetaD, thetaN: this.thetaN, dPsi: DPSI, dx: DX });
        E.solve(520);
        // the shells that take no part: lines inside them are drawn at rest, and the moving lines join and leave them there
        E.psiDS = E.p.psiXd - 2 * DPSI; E.psiNS = Math.min(E.dipole(-6.6, 0), E.at(-7, 0));
        E.rest = E.contoursAt([-1 / 1.6, -1 / 2.3, -1 / 3.3, -1 / 4.6, E.psiDS, E.psiNS, 1 / 4.6, 1 / 3.3, 1 / 2.3, 1 / 1.6]);
        this.E = E; this.t0 = null;
        this.streaks = this.makeStreaks();
        this.stage.redraw();
      }, 30);
    }

    /** The solar wind as streaks: each is one parcel's path through the model's flow, sampled evenly in time. */
    makeStreaks() {
      const E = this.E, L = this.L, out = [];
      if (!E) return out;
      const r = rng(0x5EED2026), n = 300, xs = L.xLeft + 3, xe = L.xRight - 2, count = L.wide ? 320 : L.narrow ? 130 : 210;
      for (let s = 0; s < count; s++) {
        const rho0 = 0.15 + (L.zTop + 4) * r(), sg = r() < 0.5 ? -1 : 1, path = E.streamline(rho0, xs, Math.max(xe, E.grid.x0));
        const tA = path[0][2], tB = path[path.length - 1][2], pts = new Float32Array(n * 2), wt = new Float32Array(n);
        let j = 0;
        for (let i = 0; i < n; i++) {
          const tt = tA + (tB - tA) * i / (n - 1);
          while (j < path.length - 2 && path[j + 1][2] < tt) j++;
          const f = clamp((tt - path[j][2]) / Math.max(path[j + 1][2] - path[j][2], 1e-9), 0, 1);
          const x = path[j][0] + (path[j + 1][0] - path[j][0]) * f, z = path[j][1] + (path[j + 1][1] - path[j][1]) * f, q = L.P(x, sg * z);
          pts[2 * i] = q[0]; pts[2 * i + 1] = q[1];
          wt[i] = Math.min(1, (rho0 + 0.6) / (z + 0.6));         // in three dimensions the flow also spreads round the axis
        }
        out.push({ pts, wt, span: tB - tA, phase: r(), alpha: 0.22 + 0.6 * r(), width: 0.7 + 0.9 * r(), trail: 0.26 + 0.22 * r(), head: r() < 0.3, n });
      }
      return out;
    }

    globe(R, phi) {
      const size = Math.max(2, Math.ceil(2 * R * this.dpr));
      const cv = this.globeCv && this.globeCv.width === size ? this.globeCv : document.createElement("canvas");
      cv.width = cv.height = size; this.globeCv = cv;
      const ctx = cv.getContext("2d"), img = ctx.createImageData(size, size), T = this.tex, tw = T.width, th = T.height, td = T.data;
      const e0 = cross(AXIS, PRIME), prime = [0, 1, 2].map(i => PRIME[i] * Math.cos(phi) + e0[i] * Math.sin(phi)), east = cross(AXIS, prime), B = VIEW_GSE;
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const u = (x + 0.5) / size * 2 - 1, v = (y + 0.5) / size * 2 - 1, rr = u * u + v * v;
        if (rr > 1) continue;
        const w = Math.sqrt(1 - rr), p = [0, 1, 2].map(i => u * B.right[i] + v * B.down[i] + w * B.toward[i]);
        const lat = Math.asin(clamp(dot(p, AXIS), -1, 1)), lon = Math.atan2(dot(p, east), dot(p, prime));
        const sx = Math.min(tw - 1, Math.floor((lon + Math.PI) / TAU * tw)), sy = Math.min(th - 1, Math.floor((Math.PI / 2 - lat) / Math.PI * th));
        const k = 4 * (sy * tw + sx), light = Math.max(0.1, smooth(-0.1, 0.2, p[0])) * (0.8 + 0.2 * w), o = 4 * (y * size + x);
        img.data[o] = td[k] * light + (1 - light) * 5; img.data[o + 1] = td[k + 1] * light + (1 - light) * 9; img.data[o + 2] = td[k + 2] * light + (1 - light) * 24;
        img.data[o + 3] = 255 * smooth(1.0, 0.985, Math.sqrt(rr));
      }
      ctx.putImageData(img, 0, 0);
      return cv;
    }

    drawStatic() {
      const L = this.L, P = L.P, s = L.k / 17, ctx = this.stat.getContext("2d");
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      const bg = ctx.createLinearGradient(0, L.H * 0.4, L.W, L.H * 0.6);
      bg.addColorStop(0, "#101a33"); bg.addColorStop(0.5, "#060a15"); bg.addColorStop(1, "#03050b");
      ctx.fillStyle = bg; ctx.fillRect(0, 0, L.W, L.H);
      const r = rng(0xA57E0042);
      for (let i = 0; i < (L.wide ? 260 : 150); i++) {
        ctx.fillStyle = `rgba(255,255,255,${0.12 + 0.55 * r()})`; ctx.beginPath(); ctx.arc(r() * L.W, r() * L.H, 0.35 + 0.9 * r(), 0, TAU); ctx.fill();
      }
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      const sun = ctx.createRadialGradient(-L.W * 0.08, L.H / 2, 0, -L.W * 0.08, L.H / 2, L.W * 0.44);
      sun.addColorStop(0, "rgba(255,199,115,0.2)"); sun.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = sun; ctx.fillRect(0, 0, L.W, L.H); ctx.restore();

      const mpPts = this.mp.filter(p => p[0] > L.xRight - 12), bsPts = [];
      for (let i = 0; i <= 500; i++) { const th = Math.PI * 0.985 * i / 500, rr = M.bsRadius(th, this.bs), x = rr * Math.cos(th); if (x < L.xRight - 12) break; bsPts.push([x, rr * Math.sin(th)]); }
      const poly = (edge) => { ctx.beginPath(); edge.forEach((p, i) => { const q = P(p[0], p[1]); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); edge.slice().reverse().forEach(p => { const q = P(p[0], -p[1]); ctx.lineTo(q[0], q[1]); }); ctx.closePath(); };
      const line = (pts, flip) => { ctx.beginPath(); pts.forEach((p, i) => { const q = P(p[0], flip ? -p[1] : p[1]); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); };
      // the shocked wind: denser and hotter than the wind upstream
      poly(bsPts);
      const sh = ctx.createRadialGradient(...P(6, 0), L.k * 6, ...P(6, 0), L.k * 34);
      sh.addColorStop(0, "rgba(120,190,255,0.13)"); sh.addColorStop(1, "rgba(120,190,255,0.045)");
      ctx.fillStyle = sh; ctx.fill();
      // the magnetosphere's interior
      poly(mpPts);
      const inner = ctx.createRadialGradient(L.earth[0], L.earth[1], 0, L.earth[0], L.earth[1], L.k * 30);
      inner.addColorStop(0, "rgba(26,47,98,0.94)"); inner.addColorStop(1, "rgba(10,19,45,0.9)");
      ctx.fillStyle = inner; ctx.fill();
      // the plasma sheet, warm, thickening down the tail
      ctx.save(); poly(mpPts); ctx.clip(); ctx.globalCompositeOperation = "lighter";
      const half = (x) => (1.0 + 0.06 * Math.max(0, -x - 8)) * smooth(-5.5, -10, x);
      const xs = []; for (let x = -5.5; x >= L.xRight - 2; x -= 0.5) xs.push(x);
      for (const f of [2.6, 1.9, 1.3, 0.8, 0.4]) {
        ctx.beginPath();
        xs.forEach((x, i) => { const q = P(x, half(x) * f); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); });
        xs.slice().reverse().forEach(x => { const q = P(x, -half(x) * f); ctx.lineTo(q[0], q[1]); });
        ctx.closePath();
        const a = P(-6, 0), b = P(Math.min(-30, L.xRight), 0), gr = ctx.createLinearGradient(a[0], 0, b[0], 0);
        gr.addColorStop(0, "rgba(255,150,80,0)"); gr.addColorStop(0.18, "rgba(255,150,80,0.07)"); gr.addColorStop(1, "rgba(255,130,60,0.035)");
        ctx.fillStyle = gr; ctx.fill();
      }
      // the outer radiation belt, from AE-8
      if (this.belts) { const a = P(8, 4); ctx.globalAlpha = 0.5; ctx.drawImage(this.belts, a[0], a[1], 16 * L.k, 8 * L.k); ctx.globalAlpha = 1; }
      ctx.restore();
      // the boundaries, limb-brightened
      for (const flip of [false, true]) {
        ctx.save(); ctx.globalCompositeOperation = "lighter";
        line(bsPts, flip); ctx.lineWidth = 8 * s; ctx.strokeStyle = rgba(PAL.shock, 0.06); ctx.stroke();
        line(mpPts, flip); ctx.lineWidth = 9 * s; ctx.strokeStyle = "rgba(140,184,255,0.1)"; ctx.stroke();
        ctx.restore();
        line(bsPts, flip); ctx.setLineDash([5 * s, 4 * s]); ctx.lineWidth = 1.1 * s; ctx.strokeStyle = rgba(PAL.shock, 0.55); ctx.stroke(); ctx.setLineDash([]);
        line(mpPts, flip); ctx.lineWidth = 1.6 * s; ctx.strokeStyle = "rgba(205,222,255,0.85)"; ctx.stroke();
      }
      this.bsPts = bsPts;
    }

    /** Names and spacecraft, over everything that moves. */
    drawLabels(ctx) {
      const L = this.L, P = L.P, s = L.k / 17, T = window.FK.text, fs = 12 * clamp(s, 0.8, 1.25);
      const at = (edge, th) => { let b = edge[0]; for (const p of edge) { if (Math.atan2(p[1], p[0]) > th) break; b = p; } return b; };
      const craft = (p, c, r = 1.6 * s, glow = 4 * s) => {
        ctx.save(); ctx.globalCompositeOperation = "lighter";
        const gr = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], glow);
        gr.addColorStop(0, rgba(c, 0.8)); gr.addColorStop(1, rgba(c, 0));
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(p[0], p[1], glow, 0, TAU); ctx.fill(); ctx.restore();
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, TAU); ctx.fill();
      };
      const links = (pts, color) => { ctx.beginPath(); for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) { ctx.moveTo(...pts[i]); ctx.lineTo(...pts[j]); } ctx.lineWidth = 0.7 * s; ctx.strokeStyle = color; ctx.stroke(); };
      // MMS at the dayside magnetopause, where the lines reconnect
      const mm = at(this.mp, 9 * DEG), m = P(mm[0], mm[1]), mms = [153, 242, 255];
      const tet = [[-5, -4], [5, -3], [-2, 5], [6, 5]].map(([dx, dy]) => [m[0] + dx * s, m[1] + dy * s]);
      links(tet, rgba(mms, 0.55)); tet.forEach(p => craft(p, mms, 1.6 * s, 3.5 * s));
      const themis = [140, 255, 191], cluster = [255, 209, 115], l1 = [255, 230, 140];
      const tp = [[-9.6, 0.5], [-10.8, 0.75], [-11.9, 0.35]].map(([x, z]) => P(x, z));
      tp.forEach(p => craft(p, themis));
      const cc = P(3.0, 10.4), ct = [[-9, -6], [9, -4], [-3, 9], [8, 8]].map(([dx, dy]) => [cc[0] + dx * s, cc[1] + dy * s]);
      links(ct, rgba(cluster, 0.5)); ct.forEach(p => craft(p, cluster, 1.35 * s, 3.5 * s));
      T(ctx, "MMS", m[0] - 12 * s, m[1] - 12 * s, { size: fs, align: "right", color: rgba(mms, 0.95) });
      T(ctx, "THEMIS", Math.min(tp[2][0] - 8 * s, L.W - 34), tp[2][1] + 16 * s, { size: fs, align: "center", color: rgba(themis, 0.9) });
      T(ctx, "Cluster", cc[0] + 14 * s, cc[1] - 2 * s, { size: fs, color: rgba(cluster, 0.9) });
      const bsN = at(this.bsPts, 1.05), mpN = at(this.mp, 1.62);
      T(ctx, "Bow shock", ...P(bsN[0] + 0.6, bsN[1]), { size: fs, align: "right", color: rgba(PAL.shock, 0.78) });
      T(ctx, "Magnetopause", ...P(mpN[0] * 0.97 - 1.1, mpN[1] * 0.97 + 0.55), { size: fs, color: "rgba(205,222,255,0.88)" });
      if (!L.narrow) T(ctx, "Plasma sheet", ...P(Math.max(-16, L.xRight + 3.6), -2.9), { size: fs, align: "center", color: "rgba(255,184,128,0.75)" });
      T(ctx, "Earth", L.earth[0], L.earth[1] - 1.6 * L.k, { size: fs, align: "center", color: "rgba(255,255,255,0.88)" });
      if (!L.narrow) {
        T(ctx, "Solar wind", ...P(Math.min(L.xLeft - 3, 27), Math.min(L.zTop - 5.2, 15.5)), { size: fs, color: rgba(PAL.wind, 0.7) });
      }
      const y1 = L.narrow ? L.H * 0.17 : L.H * 0.3, x1 = L.narrow ? 14 : 26;
      craft([x1, y1], l1, 1.7 * s, 4.4 * s);
      T(ctx, L.narrow ? "L1" : "to L1", x1 + 9 * s, y1, { size: fs * 0.92, color: rgba(l1, 0.85) });
    }

    frame(ctx, t, dt) {
      const L = this.L, E = this.E, P = L.P, s = L.k / 17, t0 = performance.now();
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(this.stat, 0, 0); ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      if (E) {
        this.fade = Math.min(1, this.fade + (dt || 1) * 1.6);
        const a = this.fade, W = E.p.e0 * V * t, phase = ((W / DPSI) % 1 + 1) % 1;
        if (phase < this.lastPhase) this.pulse = t;               // a line has just reconnected at the nose
        this.lastPhase = phase;
        const lines = E.contours(E.p.psiXd + phase * DPSI, DPSI, E.psiDS, E.psiNS, true);
        const stroke = (list, color, width, alpha, glow) => {
          if (!list.length) return;
          ctx.beginPath();
          for (const l of list) {
            const n = l.pts.length >> 1, f = l.scr || (l.scr = new Float32Array(l.pts.length));
            for (let i = 0; i < n; i++) { f[2 * i] = L.earth[0] - l.pts[2 * i] * L.k; f[2 * i + 1] = L.earth[1] - l.pts[2 * i + 1] * L.k; }
            curve(ctx, f, true);
          }
          if (glow) { ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.lineWidth = width * 4.5; ctx.strokeStyle = rgba(color, alpha * glow); ctx.stroke(); ctx.restore(); }
          ctx.lineWidth = width; ctx.strokeStyle = rgba(color, alpha); ctx.stroke();
        };
        ctx.save(); ctx.lineJoin = "round"; ctx.lineCap = "round";
        stroke(E.rest, PAL.closed, 0.95 * s, 0.36 * a, 0);
        stroke(lines.filter(l => l.type === "closed"), PAL.closed, 1.1 * s, 0.72 * a, 0.1);
        stroke(lines.filter(l => l.type === "open"), PAL.open, 1.05 * s, 0.66 * a, 0.1);
        const imf = lines.filter(l => l.type === "imf");
        stroke(imf, PAL.imf, 1.15 * s, 0.78 * a, 0.12);
        // upstream of the grid the wind is undisturbed and its lines are straight
        const tauPhase = (E.p.psiXd + phase * DPSI - E.p.psiXd) / E.p.e0;
        ctx.beginPath();
        const ups = [];
        for (let n = -12; n <= 0; n++) { const x = 60 - (E.tauX + tauPhase + n * DX); if (x > E.grid.x1 && x < L.xLeft + 1) { const q = P(x, 0); ctx.moveTo(q[0], 0); ctx.lineTo(q[0], L.H); ups.push(x); } }
        // (fainter where the page's words sit)
        const fall = ctx.createLinearGradient(0, 0, 0, L.H);
        fall.addColorStop(0, rgba(PAL.imf, 0.78 * a)); fall.addColorStop(0.42, rgba(PAL.imf, 0.78 * a)); fall.addColorStop(0.6, rgba(PAL.imf, 0.3 * a)); fall.addColorStop(1, rgba(PAL.imf, 0.3 * a));
        ctx.lineWidth = 1.15 * s; ctx.strokeStyle = fall; ctx.stroke();
        // the field's direction: southward upstream
        const heads = (x) => { for (const z of [L.zTop * 0.52, -L.zTop * 0.3]) { const q = P(x, z); HX.arrow(ctx, q, 0, 1, 4.6 * s, rgba(PAL.imf, 0.9 * a)); } };
        ups.forEach(heads);
        for (const l of imf) { const x = l.pts[0]; if (x > 14.5 && Math.abs(l.pts[0] - l.pts[l.pts.length - 2]) < 0.05) heads(x); }
        ctx.restore();
        // where the lines reconnect, a flash as each one does
        const age = t - this.pulse;
        if (age >= 0 && age < 0.9 && !this.stage.reduce) {
          const q = P(this.mp[0][0], 0), R = L.k * (0.7 + 1.5 * age), g = ctx.createRadialGradient(q[0], q[1], 0, q[0], q[1], R);
          g.addColorStop(0, `rgba(255,236,190,${0.75 * (1 - age / 0.9) ** 2})`); g.addColorStop(1, "rgba(255,236,190,0)");
          ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(q[0], q[1], R, 0, TAU); ctx.fill(); ctx.restore();
        }
        // the solar wind
        ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.lineCap = "round";
        for (const st of this.streaks) {
          // the head's place along the path is a fraction of a sample, so it glides (HX.trace); the tail fades behind it
          const tt = (t * V + st.phase * st.span) % st.span, n = st.n, kf = tt / st.span * (n - 1), len = Math.max(2, st.trail * V / st.span * (n - 1));
          if (kf < 0.5) continue;
          const [p, q] = HX.trace(ctx, st.pts, n, kf - len, kf), al = st.alpha * st.wt[Math.round(kf)] * a, g = ctx.createLinearGradient(p[0], p[1], q[0], q[1]);
          g.addColorStop(0, `rgba(255,240,205,${0.08 * al})`); g.addColorStop(1, `rgba(255,240,205,${0.8 * al})`);
          ctx.lineWidth = st.width; ctx.strokeStyle = g; ctx.stroke();
          if (st.head) { ctx.fillStyle = `rgba(255,255,255,${al})`; ctx.beginPath(); ctx.arc(q[0], q[1], 1.1, 0, TAU); ctx.fill(); }
        }
        ctx.restore();
      }
      this.drawEarth(ctx, t);
      this.drawLabels(ctx);
      this.cost += 0.05 * (performance.now() - t0 - this.cost);
    }

    drawEarth(ctx, t) {
      const L = this.L, c = L.earth, R = L.k;
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      const glow = ctx.createRadialGradient(c[0], c[1], 0, c[0], c[1], R * 1.25);
      glow.addColorStop(0.7, "rgba(0,0,0,0)"); glow.addColorStop(0.8, "rgba(115,184,255,0.35)"); glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(c[0], c[1], R * 1.25, 0, TAU); ctx.fill(); ctx.restore();
      // at this figure's pace (a minute of solar wind each second or so) the Earth turns a quarter of a degree a second
      ctx.drawImage(this.globe(R, this.stage.reduce ? 0 : t * 0.25 * DEG * 4), c[0] - R, c[1] - R, 2 * R, 2 * R);
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      const since = clamp(1 - (t - this.pulse) / 1.6, 0, 1);
      for (const north of [true, false]) this.oval.forEach((o, i) => {
        if (i % 2) return;
        const night = 0.5 + 0.5 * Math.cos(o[0] * Math.PI / 12), noon = Math.exp(-(((o[0] - 12) / 1.6) ** 2));
        const ripple = this.stage.reduce ? 0.7 : 0.6 + 0.4 * Math.sin(o[0] * 1.9 + t * 1.6) * Math.sin(t * 0.7 + i * 0.37);
        const a = (0.3 + 0.7 * night) * ripple + 0.9 * noon * since;        // the cusp brightens as each line opens
        for (const f of [0.1, 0.5, 0.9]) {
          const q = onDisk(sm(o[1] + (o[2] - o[1]) * f, o[0], 1.03, north), c, R);
          if (!q) continue;
          ctx.fillStyle = rgba(PAL.aurora, 0.16 * a); ctx.beginPath(); ctx.arc(q[0], q[1], Math.max(0.8, R * 0.055), 0, TAU); ctx.fill();
        }
      });
      ctx.restore();
    }
  }

  window.HeliosHero = {
    /** The same call as the first hero's; the geometry file is not needed now. */
    async start(canvas, _geometryURL, textureURL) {
      const tex = await window.FK.pixels(textureURL);
      return new Hero(canvas, tex);
    },
  };
})();
