/* Four magnetospheres side by side: Mercury's own small one, Venus's and Mars's induced ones, and Earth's. The
 * subsolar distances are the ones Helios's research build draws (Winslow et al. 2013; Martinecz et al. 2008;
 * Shue et al. 1998 and Jelínek et al. 2012 at 2 nPa; Vignes et al. 2000); the shapes are schematic.
 */
(function () {
  "use strict";

  const TAU = Math.PI * 2;
  const { text, C } = window.FK;
  const BODIES = [
    { name: "Mercury", sym: "☿", r_km: 2440, inner: 1.45, innerLabel: "magnetopause", shock: 1.96, color: "#b5aca3", own: true },
    { name: "Venus", sym: "♀", r_km: 6052, inner: null, innerLabel: "", shock: 1.32, color: "#e3c58f", own: false },
    { name: "Earth", sym: "⊕", r_km: 6371, inner: 10.25, innerLabel: "magnetopause", shock: 13.5, color: "#5da0ff", own: true },
    { name: "Mars", sym: "♂", r_km: 3390, inner: 1.29, innerLabel: "pileup boundary", shock: 1.64, color: "#d9774e", own: false },
  ];

  function start() {
    const canvas = document.getElementById("fig-scale");
    if (!canvas) return;
    let mode = "radii";
    const draw = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2), w = canvas.clientWidth, h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      const ctx = canvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const narrow = w < 640;
      // columns: Earth's gets the most room
      const weights = [1, 1, 2.4, 1], sum = weights.reduce((a, b) => a + b);
      let x0 = 0;
      const cols = BODIES.map((b, i) => { const cw = w * weights[i] / sum, c = { b, x: x0, w: cw }; x0 += cw; return c; });
      // pixels per km: the same for all in "true size"; the same planet size in "radii"
      const kmScale = Math.min(w * weights[2] / sum * 0.5 / (13.5 * 6371), h * 0.2 / (13.5 * 6371));
      for (const c of cols) {
        const b = c.b, cx = c.x + c.w * 0.64, cy = h * 0.45;
        // pixels per planetary radius: each magnetosphere filling its own panel, or all to one scale
        const pr = mode === "radii" ? Math.min(c.w * 0.36 / b.shock, h * 0.2 / b.shock) : Math.max(0.8, b.r_km * kmScale);
        const pxPerR = pr;
        ctx.save();
        ctx.beginPath(); ctx.rect(c.x + 2, 0, c.w - 4, h - 70); ctx.clip();
        // the bow shock: a paraboloid with Jelínek's flaring, scaled to the stand-off distance
        const R = b.shock * pxPerR, lam = 1.17;
        ctx.beginPath();
        for (let k = -60; k <= 60; k++) {
          const y = (k / 60) * h * 0.55, x = R - (lam * y) ** 2 / (4 * R);
          k === -60 ? ctx.moveTo(cx - x, cy + y) : ctx.lineTo(cx - x, cy + y);
        }
        ctx.setLineDash([5, 4]); ctx.lineWidth = 1.3; ctx.strokeStyle = "rgba(158,224,255,0.8)"; ctx.stroke(); ctx.setLineDash([]);
        // the obstacle: a magnetopause (Mercury, Earth), the pileup boundary (Mars), the ionosphere (Venus)
        if (b.inner) {
          const r0 = b.inner * pxPerR;
          ctx.beginPath();
          for (let k = -100; k <= 100; k++) {
            const th = 2.6 * k / 100, r = r0 * Math.pow(2 / (1 + Math.cos(th)), b.own ? 0.55 : 0.75);
            const X = cx - r * Math.cos(th), Y = cy + r * Math.sin(th);
            k === -100 ? ctx.moveTo(X, Y) : ctx.lineTo(X, Y);
          }
          ctx.fillStyle = b.own ? "rgba(27,49,99,0.75)" : "rgba(120,60,30,0.35)"; ctx.fill();
          ctx.lineWidth = 1.6; ctx.strokeStyle = b.own ? "rgba(200,220,255,0.95)" : "rgba(255,170,110,0.95)"; ctx.stroke();
        }
        // the planet, day side to the left
        ctx.fillStyle = "#22262f"; ctx.beginPath(); ctx.arc(cx, cy, pr, 0, TAU); ctx.fill();
        ctx.fillStyle = b.color; ctx.beginPath(); ctx.arc(cx, cy, pr, Math.PI / 2, Math.PI * 1.5); ctx.fill();
        ctx.restore();
        if (c !== cols[0]) { ctx.fillStyle = "rgba(255,255,255,0.08)"; ctx.fillRect(c.x, 24, 1, h - 100); }
        // names and numbers
        const km = (v) => (Math.round(v * b.r_km / 100) * 100).toLocaleString("en-US");
        text(ctx, b.name, c.x + c.w / 2, h - (narrow ? 18 : 50), { size: narrow ? 12 : 15, weight: 600, color: "#f4f5f7", align: "center" });
        if (!narrow) {                                       // on a phone the caption carries the numbers
          text(ctx, b.inner ? `${b.innerLabel} ${km(b.inner)} km` : "no magnetopause", c.x + c.w / 2, h - 31, { size: 11, mono: true, color: C.muted, align: "center" });
          text(ctx, `bow shock ${km(b.shock)} km`, c.x + c.w / 2, h - 15, { size: 11, mono: true, color: C.muted, align: "center" });
        }
      }
      text(ctx, "← Sun", 16, 22, { size: 12, color: C.sun });
      if (!narrow) text(ctx, mode === "radii" ? "Each scaled to fill its panel" : "All to one scale", 16, 40, { size: 11, mono: true, color: C.muted });
    };
    document.querySelectorAll("#seg-scale button").forEach(b => b.addEventListener("click", () => {
      document.querySelectorAll("#seg-scale button").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
      mode = b.dataset.mode; draw();
    }));
    new ResizeObserver(draw).observe(canvas);
  }
  window.FK.fontsReady().then(start);
})();
