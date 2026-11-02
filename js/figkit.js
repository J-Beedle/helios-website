/* Shared drawing for the site's figures: one type style, one palette, units with real sub- and superscripts. */
(function () {
  "use strict";

  const SANS = '"Inter", "Helvetica Neue", Arial, sans-serif';
  const MONO = '"IBM Plex Mono", ui-monospace, Menlo, monospace';
  const C = {
    text: "rgba(244,245,247,0.8)", muted: "rgba(244,245,247,0.52)", faint: "rgba(244,245,247,0.32)",
    grid: "rgba(255,255,255,0.1)", sun: "rgba(255,206,140,0.85)", accent: "#f7c55c",
    closed: [150, 200, 255], open: [190, 160, 255], imf: [245, 200, 95], shock: [158, 224, 255],
    mp: [205, 222, 255], plasma: [255, 150, 90],
  };
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

  /** Splits "R_E", "10^7" or "cm^{−2}" into runs of normal, sub- and superscript text. */
  function runs(str) {
    const out = [];
    const re = /([_^])(\{([^}]*)\}|[^\s·,;:)(]+)/g;
    let last = 0, m;
    while ((m = re.exec(str))) {
      if (m.index > last) out.push([str.slice(last, m.index), 0]);
      out.push([m[3] !== undefined ? m[3] : m[2], m[1] === "_" ? 1 : -1]);
      last = re.lastIndex;
    }
    if (last < str.length) out.push([str.slice(last), 0]);
    return out;
  }

  /** Draws text at (x, y), vertically centered, with sub- and superscripts. Options: size, weight, mono, color,
   *  align ("left", "center", "right"). Returns the width drawn. */
  function text(ctx, str, x, y, o = {}) {
    const size = o.size || 12, weight = o.weight || 500, fam = o.mono ? MONO : SANS;
    const parts = runs(String(str));
    const font = (s) => `${weight} ${s}px ${fam}`;
    let w = 0;
    for (const [t, k] of parts) { ctx.font = font(k ? size * 0.72 : size); w += ctx.measureText(t).width; }
    let cx = o.align === "center" ? x - w / 2 : o.align === "right" ? x - w : x;
    ctx.textBaseline = "middle"; ctx.textAlign = "left"; ctx.fillStyle = o.color || C.text;
    for (const [t, k] of parts) {
      ctx.font = font(k ? size * 0.72 : size);
      ctx.fillText(t, cx, y + k * size * 0.32);
      cx += ctx.measureText(t).width;
    }
    return w;
  }

  /** A scale bar: `units` long at `px` pixels per unit, labeled. */
  function scaleBar(ctx, x, y, px, units, label) {
    ctx.strokeStyle = C.muted; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x, y); ctx.lineTo(x + units * px, y); ctx.lineTo(x + units * px, y - 4); ctx.stroke();
    text(ctx, label, x + units * px / 2, y + 11, { size: 11, mono: true, color: C.muted, align: "center" });
  }

  /** Earth, the day side toward the Sun (to the left unless sunRight), with a faint glow. */
  function earth(ctx, cx, cy, r, sunRight = false) {
    const g = ctx.createRadialGradient(cx, cy, r * 0.8, cx, cy, r * 1.7);
    g.addColorStop(0, "rgba(110,170,255,0.3)"); g.addColorStop(1, "rgba(110,170,255,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r * 1.7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#18305f"; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#5c9cf5"; ctx.beginPath();
    ctx.arc(cx, cy, r, sunRight ? -Math.PI / 2 : Math.PI / 2, sunRight ? Math.PI / 2 : Math.PI * 1.5); ctx.fill();
  }

  /** A field of faint stars, the same every time for a given seed. */
  function stars(ctx, w, h, n, seed) {
    let s = seed >>> 0;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.1 + 0.42 * rnd()})`;
      ctx.beginPath(); ctx.arc(rnd() * w, rnd() * h, 0.3 + 0.8 * rnd(), 0, Math.PI * 2); ctx.fill();
    }
  }

  /** A canvas sized to its box at the screen's pixel density, drawn by draw(ctx, w, h) now and on resize. */
  function figure(canvas, draw) {
    const fig = { canvas };
    fig.redraw = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2), w = canvas.clientWidth, h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      }
      const ctx = canvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      draw(ctx, w, h);
    };
    new ResizeObserver(() => fig.redraw()).observe(canvas);
    return fig;
  }

  /** An orthographic globe from an equirectangular texture (ImageData), size pixels across, seen along basis
   *  {right, down, toward} (unit vectors in GSE). axis and prime are Earth's rotation axis and prime meridian in
   *  GSE; the Sun is along +x, so the day side follows it. */
  function globe(tex, size, basis, axis, prime) {
    const cv = document.createElement("canvas");
    cv.width = cv.height = size;
    const ctx = cv.getContext("2d"), img = ctx.createImageData(size, size);
    const east = [axis[1] * prime[2] - axis[2] * prime[1], axis[2] * prime[0] - axis[0] * prime[2], axis[0] * prime[1] - axis[1] * prime[0]];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const tw = tex.width, th = tex.height, td = tex.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = (x + 0.5) / size * 2 - 1, v = (y + 0.5) / size * 2 - 1, rr = u * u + v * v;
        if (rr > 1) continue;
        const w = Math.sqrt(1 - rr);
        const p = [0, 1, 2].map(i => u * basis.right[i] + v * basis.down[i] + w * basis.toward[i]);
        const lat = Math.asin(Math.max(-1, Math.min(1, dot(p, axis)))), lon = Math.atan2(dot(p, east), dot(p, prime));
        const sx = Math.min(tw - 1, Math.floor((lon + Math.PI) / (2 * Math.PI) * tw));
        const sy = Math.min(th - 1, Math.floor((Math.PI / 2 - lat) / Math.PI * th));
        const k = 4 * (sy * tw + sx), o = 4 * (y * size + x);
        const day = Math.max(0, Math.min(1, (p[0] + 0.1) / 0.28)), light = (0.1 + 0.9 * day * day * (3 - 2 * day)) * (0.8 + 0.2 * w);
        img.data[o] = td[k] * light + (1 - light) * 6;
        img.data[o + 1] = td[k + 1] * light + (1 - light) * 10;
        img.data[o + 2] = td[k + 2] * light + (1 - light) * 24;
        img.data[o + 3] = 255 * Math.min(1, (1 - Math.sqrt(rr)) * size * 0.5);
      }
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }

  /** An image's pixels, for textures. */
  function pixels(src) {
    return new Promise((ok, fail) => {
      const im = new Image();
      im.onload = () => { const c = document.createElement("canvas"); c.width = im.width; c.height = im.height; const x = c.getContext("2d"); x.drawImage(im, 0, 0); ok(x.getImageData(0, 0, im.width, im.height)); };
      im.onerror = fail; im.src = src;
    });
  }

  const fontsReady = () => (document.fonts ? Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 1200))]) : Promise.resolve());

  window.FK = { C, rgba, text, scaleBar, earth, stars, figure, globe, pixels, fontsReady, SANS, MONO };
})();
