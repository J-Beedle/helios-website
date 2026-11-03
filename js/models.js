/* The models page's figures. Each comes from Helios: the boundary formulas and Starkov coefficients are ported
 * from its Swift (MagnetosphereModel.swift, AuroralOval.swift); the
 * field lines and radiation-belt cuts were computed by it (assets/data/t89-kp.json, belts.json). The Sun is to
 * the left, as in Helios's side views.
 */
(function () {
  "use strict";

  const TAU = Math.PI * 2;
  const $ = (s) => document.querySelector(s);
  const { C, rgba, text, scaleBar, earth, stars, figure } = window.FK;

  const path = (ctx, pts, P) => { ctx.beginPath(); pts.forEach((q, i) => { const s = P(q[0], q[1]); i ? ctx.lineTo(s[0], s[1]) : ctx.moveTo(s[0], s[1]); }); };

  // ───────────────── boundaries: Shue et al. (1998) and Jelínek et al. (2012) ─────────────────
  const Boundaries = {
    shue(pd, bz) {
      return { r0: (10.22 + 1.29 * Math.tanh(0.184 * (bz + 8.14))) * Math.pow(pd, -1 / 6.6),
               alpha: Math.max((0.58 - 0.007 * bz) * (1 + 0.024 * Math.log(pd)), 0.05) };
    },
    shuePoints(r0, alpha) {
      const out = [];
      for (let k = 0; k <= 400; k++) {
        const th = 2.95 * k / 400, r = r0 * Math.pow(2 / (1 + Math.cos(th)), alpha);
        out.push([r * Math.cos(th), r * Math.sin(th)]);
      }
      return out;
    },
    /** Jelínek's paraboloid, blended past x = −30 Rₑ into a Mach cone (M = 8), as Helios draws it. */
    bowShock(pd) {
      const R = 15.02 * Math.pow(pd, -1 / 6.55), lam = 1.17, xb = Math.min(-30, R - 1), L = 30, sM = 1 / Math.sqrt(63);
      const par = (x) => Math.sqrt(4 * R * (R - x)) / lam;
      const rhoB = par(xb), sJ = 2 * R / (lam * Math.sqrt(4 * R * (R - xb)));
      const pts = [];
      for (let x = R; x >= -200; x -= (x > R - 2 ? 0.02 : 0.25)) {
        pts.push([x, x >= xb ? par(x) : rhoB + sM * (xb - x) + (sJ - sM) * L * (1 - Math.exp((x - xb) / L))]);
      }
      return { R, pts };
    },
    init() {
      const canvas = $("#fig-boundaries");
      if (!canvas) return;
      const pd = $("#in-pd"), bz = $("#in-bz");
      const both = (pts) => pts.slice().reverse().map(q => [q[0], -q[1]]).concat(pts);
      const ref = this.shue(2, 0), refMP = both(this.shuePoints(ref.r0, ref.alpha)), refBS = both(this.bowShock(2).pts);
      const fig = figure(canvas, (ctx, w, h) => {
        const p = Math.pow(10, +pd.value), b = +bz.value;
        $("#out-pd").textContent = p.toFixed(p < 1 ? 2 : 1) + " nPa";
        $("#out-bz").textContent = (b > 0 ? "+" : b < 0 ? "−" : "") + Math.abs(b).toFixed(1) + " nT";
        const wide = w > 900;
        const k = wide ? Math.min(h / 36, w / 64) : Math.min(h / 70, w / 40);
        const cx = w * (wide ? 0.64 : 0.62), cy = h * (wide ? 0.5 : 0.17);
        const P = (x, z) => [cx - x * k, cy - z * k];
        stars(ctx, w, h, 200, 7);
        const sun = ctx.createRadialGradient(-w * 0.1, cy, 0, -w * 0.1, cy, w * 0.5);
        sun.addColorStop(0, "rgba(255,190,110,0.16)"); sun.addColorStop(1, "rgba(255,190,110,0)");
        ctx.fillStyle = sun; ctx.fillRect(0, 0, w, h);
        const mp = this.shue(p, b), bs = this.bowShock(p);
        const mpAll = both(this.shuePoints(mp.r0, mp.alpha)), bsAll = both(bs.pts);
        // the reference state, faint
        ctx.setLineDash([3, 5]); ctx.lineWidth = 1; ctx.strokeStyle = "rgba(255,255,255,0.2)";
        path(ctx, refMP, P); ctx.stroke(); path(ctx, refBS, P); ctx.stroke(); ctx.setLineDash([]);
        // the sheath and the magnetosphere
        path(ctx, bsAll, P); ctx.fillStyle = rgba(C.shock, 0.05); ctx.fill();
        path(ctx, mpAll, P);
        const fill = ctx.createRadialGradient(cx, cy, 0, cx, cy, k * 30);
        fill.addColorStop(0, "rgba(27,49,99,0.9)"); fill.addColorStop(1, "rgba(11,21,48,0.85)");
        ctx.fillStyle = fill; ctx.fill();
        ctx.lineWidth = 1.6; ctx.strokeStyle = rgba(C.mp, 0.9); path(ctx, mpAll, P); ctx.stroke();
        ctx.setLineDash([6, 4]); ctx.lineWidth = 1.2; ctx.strokeStyle = rgba(C.shock, 0.75); path(ctx, bsAll, P); ctx.stroke(); ctx.setLineDash([]);
        earth(ctx, cx, cy, Math.max(3, k));
        // geosynchronous orbit, 6.6 Rₑ: a strong enough push brings the magnetopause inside it
        const GEO = 6.62, gc = [127, 212, 173];
        ctx.setLineDash([4, 4]); ctx.lineWidth = 1.2; ctx.strokeStyle = rgba(gc, 0.8);
        ctx.beginPath(); ctx.arc(cx, cy, GEO * k, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        if (wide) {
          const g = P(-GEO * Math.SQRT1_2, GEO * Math.SQRT1_2);
          text(ctx, "Geosynchronous orbit 6.6 R_E", g[0] + 6, g[1] - 8, { size: 12, color: rgba(gc, 0.95) });
        } else {
          const g = P(0, GEO);
          text(ctx, "Geosynchronous 6.6 R_E", g[0], g[1] - 9, { size: 11, align: "center", color: rgba(gc, 0.95) });
        }
        // the stand-off distances
        const m0 = P(mp.r0, 0), b0 = P(bs.R, 0);
        ctx.fillStyle = C.accent; [m0, b0].forEach(s => { ctx.beginPath(); ctx.arc(s[0], s[1], 3, 0, TAU); ctx.fill(); });
        if (wide) {
          text(ctx, `Magnetopause ${mp.r0.toFixed(1)} R_E`, m0[0] + 12, m0[1] - 16, { size: 13 });
          text(ctx, `Bow shock ${bs.R.toFixed(1)} R_E`, b0[0] - 12, b0[1] + 18, { size: 13, align: "right", color: C.muted });
          scaleBar(ctx, w - 190, h - 88, k, 10, "10 R_E");   // clear of the caption
        } else {
          text(ctx, `Magnetopause ${mp.r0.toFixed(1)} R_E · bow shock ${bs.R.toFixed(1)} R_E`, 20, cy + 19 * k, { size: 12 });
        }
        text(ctx, "← Sun", 22, h - 26, { size: 12, color: C.sun });
      });
      [pd, bz].forEach(i => i.addEventListener("input", fig.redraw));
    },
  };

  // ───────────────── field lines: IGRF + T89 at each Kp ─────────────────
  const FieldLines = {
    async init() {
      const canvas = $("#fig-t89");
      if (!canvas) return;
      const data = await fetch("assets/data/t89-kp.json").then(r => r.json());
      // At Kp 5+ T89's 76° noon line comes back inside the 73° one with a flat, box-shaped front: the model is outside
      // its range there (the real magnetopause is near 8 R_E at such activity) and field lines cannot cross, so a dayside
      // line whose apex lies inside a lower-latitude line's is left out.
      for (const set of Object.values(data.lines)) {
        let reach = 0;
        const noon = set.filter(l => l.noon && !l.open).sort((p, q) => p.lat - q.lat);
        for (const l of noon) {
          const x = Math.max(...l.p.map(q => q[0]));
          if (x < reach) l.drop = true; else reach = x;
        }
        set.splice(0, set.length, ...set.filter(l => !l.drop));
      }
      let kp = "kp2", from = null, t0 = 0;
      const lines = (ctx, P, set, alpha) => {
        for (const l of data.lines[set]) {
          ctx.lineWidth = 1.2;
          ctx.strokeStyle = rgba(l.open ? C.open : C.closed, (l.open ? 0.72 : 0.85) * alpha);
          path(ctx, l.p, P); ctx.stroke();
          path(ctx, l.p.map(q => [q[0], -q[1]]), P); ctx.stroke();
        }
      };
      const fig = figure(canvas, (ctx, w, h) => {
        const k = Math.min(w / 58, h / 30), cx = w * 0.27, cy = h * 0.5;
        const P = (x, z) => [cx - x * k, cy - z * k];
        stars(ctx, w, h, 120, 3);
        const u = from ? Math.min(1, (performance.now() - t0) / 450) : 1;
        if (from && u < 1) lines(ctx, P, from, 1 - u);
        lines(ctx, P, kp, u);
        earth(ctx, cx, cy, Math.max(3, k));
        text(ctx, "← Sun", 16, 22, { size: 12, color: C.sun });
        scaleBar(ctx, w - 30 - 10 * k, h - 28, k, 10, "10 R_E");
        if (u < 1) requestAnimationFrame(fig.redraw); else from = null;
      });
      document.querySelectorAll("#seg-kp button").forEach(b => b.addEventListener("click", () => {
        if (b.dataset.kp === kp) return;
        document.querySelectorAll("#seg-kp button").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
        from = kp; kp = b.dataset.kp; t0 = performance.now(); fig.redraw();
      }));
    },
  };

  // ───────────────── radiation belts: AE-8 / AP-8 ─────────────────
  const Belts = {
    lut() {
      // dark violet → magenta → orange → pale yellow, by log flux
      const stops = [[0, [12, 8, 40]], [0.35, [104, 34, 136]], [0.6, [208, 72, 92]], [0.82, [246, 158, 60]], [1, [252, 238, 190]]];
      const out = [];
      for (let i = 0; i < 256; i++) {
        const u = i / 255;
        let j = 0; while (j < stops.length - 2 && u > stops[j + 1][0]) j++;
        const [u0, c0] = stops[j], [u1, c1] = stops[j + 1], f = (u - u0) / (u1 - u0);
        out.push(c0.map((c, n) => Math.round(c + (c1[n] - c) * f)));
      }
      return out;
    },
    async init() {
      const canvas = $("#fig-belts");
      if (!canvas) return;
      const scale = await fetch("assets/data/belts.json").then(r => r.json());
      const lut = this.lut(), imgs = {};
      await Promise.all(Object.entries(scale).map(([key, s]) => new Promise(ok => {
        const im = new Image();
        im.onload = () => {
          const c = document.createElement("canvas"); c.width = im.width; c.height = im.height;
          const x = c.getContext("2d"); x.drawImage(im, 0, 0);
          const d = x.getImageData(0, 0, c.width, c.height);
          for (let i = 0; i < d.data.length; i += 4) {
            const v = d.data[i];
            if (v === 0) { d.data[i + 3] = 0; continue; }
            const c3 = lut[v]; d.data[i] = c3[0]; d.data[i + 1] = c3[1]; d.data[i + 2] = c3[2];
            d.data[i + 3] = Math.min(255, 50 + v * 1.4);
          }
          x.putImageData(d, 0, 0); imgs[key] = c; ok();
        };
        im.src = s.img;
      })));
      let species = "electron", solar = "max";
      const fig = figure(canvas, (ctx, w, h) => {
        const key = `${species}-${solar}`, s = scale[key];
        const k = Math.min((w - 70) / (2 * s.halfWidth + 0.4), (h - 40) / (2 * s.halfHeight + 0.6)), cx = (w - 40) / 2, cy = h / 2 + 8;
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(imgs[key], cx - s.halfWidth * k, cy - s.halfHeight * k, 2 * s.halfWidth * k, 2 * s.halfHeight * k);
        // dipole field lines at L = 2, 4, 6
        ctx.lineWidth = 1; ctx.strokeStyle = "rgba(255,255,255,0.22)";
        for (const L of [2, 4, 6]) for (const side of [1, -1]) {
          ctx.beginPath();
          const lf = Math.acos(1 / Math.sqrt(L));
          for (let i = 0; i <= 120; i++) {
            const lat = -lf + 2 * lf * i / 120, r = L * Math.cos(lat) ** 2;
            const X = cx + side * r * Math.cos(lat) * k, Y = cy - r * Math.sin(lat) * k;
            i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
          }
          ctx.stroke();
        }
        for (const L of [2, 4, 6]) text(ctx, `L = ${L}`, cx + L * k + 4, cy + 12, { size: 11, mono: true, color: C.muted });
        earth(ctx, cx, cy, k);
        // the color bar
        const bx = w - 30, by = 44, bh = h - 88;
        for (let i = 0; i < bh; i++) {
          const c3 = lut[Math.round(255 * (1 - i / bh))];
          ctx.fillStyle = `rgb(${c3[0]},${c3[1]},${c3[2]})`; ctx.fillRect(bx, by + i, 8, 1.2);
        }
        text(ctx, `10^${s.hi}`, bx - 6, by + 4, { size: 11, mono: true, color: C.muted, align: "right" });
        text(ctx, `10^${s.lo}`, bx - 6, by + bh - 4, { size: 11, mono: true, color: C.muted, align: "right" });
        $("#belts-readout").innerHTML = `<b>${species === "electron" ? "Electrons" : "Protons"} &gt; ${s.energy_MeV} MeV</b> · ${solar === "max" ? "solar maximum" : "solar minimum"} · cm<sup>−2</sup> s<sup>−1</sup>`;
      });
      document.querySelectorAll("#seg-species button, #seg-solar button").forEach(b => b.addEventListener("click", () => {
        b.parentElement.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
        if (b.dataset.species) species = b.dataset.species; else solar = b.dataset.solar;
        fig.redraw();
      }));
    },
  };

  // ───────────────── the auroral oval: Starkov (1994), with Sigernes et al. (2011)'s coefficients ─────────────────
  const Starkov = {
    b: [
      [[-0.07, -10.06, -4.44, -3.77, -6.61, 6.37, -4.48], [24.54, 19.83, 7.47, 7.90, 10.17, -1.10, 10.16],
       [-12.53, -9.33, -3.01, -4.73, -5.80, 0.34, -5.87], [2.15, 1.24, 0.25, 0.91, 1.19, -0.38, 0.98]],
      [[1.61, -9.59, -12.07, -6.56, -2.22, -23.98, -20.07], [23.21, 17.78, 17.49, 11.44, 1.50, 42.79, 36.67],
       [-10.97, -7.20, -7.96, -6.73, -0.58, -26.96, -24.20], [2.03, 0.96, 1.15, 1.31, 0.08, 5.56, 5.11]],
      [[3.44, -2.41, -0.74, -2.12, -1.68, 8.69, 8.61], [29.77, 7.89, 3.94, 3.24, -2.48, -20.73, -5.34],
       [-16.38, -4.32, -3.09, -1.67, 1.58, 13.03, -1.36], [3.35, 0.87, 0.72, 0.31, -0.28, -2.14, 0.76]],
    ],
    al(kp) { const k = Math.max(0, Math.min(9, kp)); return 18 - 12.3 * k + 27.2 * k * k - 2.0 * k * k * k; },
    colat(m, t, al) {
      const x = Math.log10(Math.max(10, Math.min(780, Math.abs(al)))), p = [1, x, x * x, x * x * x], col = new Array(7).fill(0);
      for (let j = 0; j < 7; j++) for (let i = 0; i < 4; i++) col[j] += this.b[m][i][j] * p[i];
      const d = Math.PI / 180;
      return col[0] + col[1] * Math.cos(15 * (t + col[4]) * d) + col[2] * Math.cos(15 * (2 * t + col[5]) * d) + col[3] * Math.cos(15 * (3 * t + col[6]) * d);
    },
    init() {
      const canvas = $("#fig-oval");
      if (!canvas) return;
      const kpIn = $("#in-kp-oval");
      const fig = figure(canvas, (ctx, w, h) => {
        const kp = +kpIn.value, al = this.al(kp);
        $("#out-kp-oval").textContent = kp.toFixed(1);
        const R = Math.min(w, h) * 0.42, cx = w / 2, cy = h / 2 + 8, per = R / 40;   // 40° of colatitude to the rim
        // looking down on the north pole: noon at the top, dusk on the left
        const P = (colat, mlt) => { const a = (mlt - 12) / 24 * TAU; return [cx - colat * per * Math.sin(a), cy - colat * per * Math.cos(a)]; };
        ctx.lineWidth = 1;
        for (const c of [10, 20, 30, 40]) {
          ctx.strokeStyle = C.grid; ctx.beginPath(); ctx.arc(cx, cy, c * per, 0, TAU); ctx.stroke();
          text(ctx, `${90 - c}°`, cx + 4, cy - c * per + 9, { size: 10.5, mono: true, color: C.faint });
        }
        const edge = (m) => { const out = []; for (let i = 0; i <= 96; i++) out.push(P(this.colat(m, i / 4, al), i / 4)); return out; };
        const pole = edge(0), eq = edge(1), dif = edge(2);
        const band = (outer, inner, fill) => {
          ctx.beginPath(); outer.forEach((s, i) => i ? ctx.lineTo(s[0], s[1]) : ctx.moveTo(s[0], s[1])); ctx.closePath();
          inner.slice().reverse().forEach((s, i) => i ? ctx.lineTo(s[0], s[1]) : ctx.moveTo(s[0], s[1])); ctx.closePath();
          ctx.fillStyle = fill; ctx.fill("evenodd");
        };
        band(dif, eq, "rgba(110,210,160,0.14)");
        band(eq, pole, "rgba(120,240,170,0.42)");
        const line = (pts, color) => { ctx.beginPath(); pts.forEach((s, i) => i ? ctx.lineTo(s[0], s[1]) : ctx.moveTo(s[0], s[1])); ctx.strokeStyle = color; ctx.lineWidth = 1.3; ctx.stroke(); };
        line(pole, "rgba(200,255,220,0.85)"); line(eq, "rgba(150,245,190,0.85)"); line(dif, "rgba(150,220,185,0.4)");
        text(ctx, "12 MLT", cx, cy - 40 * per - 14, { size: 11, mono: true, color: C.sun, align: "center" });
        text(ctx, "00", cx, cy + 40 * per + 14, { size: 11, mono: true, color: C.muted, align: "center" });
        text(ctx, "18", cx - 40 * per - 14, cy, { size: 11, mono: true, color: C.muted, align: "center" });
        text(ctx, "06", cx + 40 * per + 14, cy, { size: 11, mono: true, color: C.muted, align: "center" });
        $("#oval-readout").innerHTML = `Kp <b>${kp.toFixed(1)}</b> → |AL| ≈ <b>${Math.round(Math.max(10, Math.min(780, al)))} nT</b>`;
      });
      kpIn.addEventListener("input", fig.redraw);
    },
  };

  const lazy = (sel, fn) => {
    const el = $(sel);
    if (!el) return;
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); fn(); } }, { rootMargin: "60% 0px" });
    io.observe(el);
  };
  window.FK.fontsReady().then(() => {
    Boundaries.init();
    lazy("#fig-t89", () => FieldLines.init());
    lazy("#fig-belts", () => Belts.init());
    lazy("#fig-oval", () => Starkov.init());
  });
})();
