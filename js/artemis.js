/* Artemis II, flown on the page: Orion's track as Helios has it (JPL Horizons, target −1024, in GSE), the Moon
 * beside it, and Earth's magnetosphere and radiation belts for scale. Seen from above the ecliptic, the Sun to the
 * left. NASA's photographs from the flight appear as Orion reaches each moment.
 */
(function () {
  "use strict";

  const TAU = Math.PI * 2, DEG = Math.PI / 180;
  const $ = (s) => document.querySelector(s);
  const { text, C, rgba, SANS, MONO } = window.FK;
  const RE_KM = 6371.2;
  const ABERR = Math.atan(29.78 / 400);                    // the solar wind's aberration from Earth's orbital motion
  const SHOW = 8;                                          // a photo shows for this many hours either side of its time
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const VIEW = { right: [-1, 0, 0], down: [0, 1, 0], toward: [0, 0, 1] };   // from ecliptic north, in GSE

  const lerp3 = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
  const box = (el) => [el.offsetLeft, el.offsetTop, el.offsetLeft + el.offsetWidth, el.offsetTop + el.offsetHeight];
  const meets = (r, s) => r[0] < s[2] && r[2] > s[0] && r[1] < s[3] && r[3] > s[1];
  const pad = (r, m) => [r[0] - m, r[1] - m, r[2] + m, r[3] + m];

  /** Earth's rotation axis and prime meridian in GSE at time ms: the Sun's ecliptic longitude (a low-precision
   *  formula), the obliquity and Greenwich mean sidereal time. */
  function earthAxes(ms) {
    const d = (ms - Date.UTC(2000, 0, 1, 12)) / 864e5;
    const g = (357.529 + 0.98560028 * d) * DEG, q = 280.459 + 0.98564736 * d;
    const lam = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * DEG, eps = (23.439 - 3.6e-7 * d) * DEG;
    const gmst = ((280.46061837 + 360.98564736629 * d) % 360) * DEG;
    const ecl = ([x, y, z]) => [x, y * Math.cos(eps) + z * Math.sin(eps), -y * Math.sin(eps) + z * Math.cos(eps)];
    const gse = ([x, y, z]) => [x * Math.cos(lam) + y * Math.sin(lam), -x * Math.sin(lam) + y * Math.cos(lam), z];
    return { axis: gse(ecl([0, 0, 1])), prime: gse(ecl([Math.cos(gmst), Math.sin(gmst), 0])) };
  }

  async function start() {
    const canvas = $("#fig-artemis");
    if (!canvas) return;
    const [D, photos, tex] = await Promise.all([
      fetch("assets/data/artemis2.json").then(r => r.json()),
      fetch("assets/data/artemis2-photos.json").then(r => r.json()),
      window.FK.pixels("assets/img/earth-equirect.jpg"),
    ]);
    const t0 = Date.parse(D.start), n = D.t.length, tEnd = D.t[n - 1];
    const events = D.events.map(e => ({ ...e, h: (Date.parse(e.utc) - t0) / 3.6e6 }));
    photos.forEach(p => { p.h = (Date.parse(p.utc) - t0) / 3.6e6; new Image().src = p.img; });
    const scrub = $("#in-time"), playBtn = $("#btn-play"), card = $("#photo-card");
    const copy = canvas.closest("section").querySelector(".copy"), bar = $(".player-bar");
    const [tDay, , tClock] = $("#art-time").children;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let hours = 0, playing = !still, last = performance.now(), shown = null, globeKey = "", globeImg = null;
    let labelKey = "", labels = [];

    const at = (arr, h) => {
      let i = 0;
      while (i < n - 2 && D.t[i + 1] < h) i++;
      const u = Math.max(0, Math.min(1, (h - D.t[i]) / (D.t[i + 1] - D.t[i])));
      return lerp3(arr[i], arr[i + 1], u);
    };

    // the magnetosphere in the ecliptic plane for a typical solar wind (Shue et al. 1998 at 2 nPa, Bz = 0;
    // Jelínek et al. 2012), turned by the aberration
    const r0 = (10.22 + 1.29 * Math.tanh(0.184 * 8.14)) * Math.pow(2, -1 / 6.6), al = 0.58 * (1 + 0.024 * Math.log(2));
    const mpAt = (th) => { const r = r0 * Math.pow(2 / (1 + Math.cos(th)), al); return [r * Math.cos(th), r * Math.sin(th)]; };
    const mp = [], bs = [];
    for (let k = -300; k <= 300; k++) mp.push(mpAt(2.9 * k / 300));
    const R = 15.02 * Math.pow(2, -1 / 6.55), bsAt = (x, s) => [x, s * Math.sqrt(4 * R * (R - x)) / 1.17];
    for (let k = -300; k <= 300; k++) bs.push(bsAt(R - (Math.abs(k) / 300) ** 2 * 150, Math.sign(k) || 1));
    const turn = ([x, y]) => [x * Math.cos(ABERR) + y * Math.sin(ABERR), -x * Math.sin(ABERR) + y * Math.cos(ABERR)];
    const BOX = { x0: 0, x1: 0, y0: 0, y1: 0 };
    for (const p of D.orion.concat(D.moonPos)) {
      BOX.x0 = Math.min(BOX.x0, p[0]); BOX.x1 = Math.max(BOX.x1, p[0]);
      BOX.y0 = Math.min(BOX.y0, p[1]); BOX.y1 = Math.max(BOX.y1, p[1]);
    }

    // The figure's fixed labels. Each is tried at places along its own line and goes where it reads best: clear of
    // Orion's path, the other lines and labels, the words and photo card, and the player.
    function placeLabels(ctx, w, h, P, k, L) {
      const dense = (pts) => {
        const out = [pts[0]];
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1], b = pts[i], m = Math.min(50, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 4));
          for (let j = 1; j <= m; j++) out.push([a[0] + (b[0] - a[0]) * j / m, a[1] + (b[1] - a[1]) * j / m]);
        }
        return out.filter(q => q[0] > -40 && q[0] < w + 40 && q[1] > -40 && q[1] < h + 40);
      };
      const proj = (pts, f) => dense(pts.map(q => { const t = f ? f(q) : q; return P(t[0], t[1]); }));
      const line = { orion: proj(D.orion), moon: proj(D.moonPos), mp: proj(mp, turn), bs: proj(bs, turn) };
      const gap = (r, pts) => {
        let d = 1e9;
        for (const q of pts) {
          const dx = Math.max(r[0] - q[0], 0, q[0] - r[2]), dy = Math.max(r[1] - q[1], 0, q[1] - r[3]);
          if (dx < d && dy < d) d = Math.min(d, Math.hypot(dx, dy));
        }
        return d;
      };
      const taken = [pad(L.words, 12), [0, L.bar[1] - 10, w, h]];         // on a wide screen the card is in the words
      if (!L.wide) taken.push([0, L.card[1] - 4, w, h]);
      const fly = events.find(e => e.id === "flyby");
      if (fly) {
        const q = at(D.orion, fly.h), f = P(q[0], q[1]);
        ctx.font = `500 12px ${SANS}`;
        taken.push([f[0] - 16 - ctx.measureText("Lunar flyby").width, f[1] + 6, f[0] + 4, f[1] + 26]);
      }
      const yMin = L.wide ? 84 : 72, out = [];
      const add = (str, o, cands, own) => {
        ctx.font = `${o.weight || 500} ${o.size}px ${o.mono ? MONO : SANS}`;
        const tw = ctx.measureText(str).width, hh = o.size * 0.62;
        let best = null, bestS = -1;
        for (const [x, y, align] of cands) {
          const x0 = align === "right" ? x - tw : align === "center" ? x - tw / 2 : x;
          const r = [x0 - 2, y - hh, x0 + tw + 2, y + hh];
          if (r[0] < 10 || r[2] > w - 10 || r[1] < yMin || r[3] > h - 10 || taken.some(t => meets(r, t))) continue;
          if (Math.hypot(Math.max(r[0] - L.ex, 0, L.ex - r[2]), Math.max(r[1] - L.ey, 0, L.ey - r[3])) < L.eR + 6) continue;
          let other = 1e9;
          for (const key of ["moon", "mp", "bs"]) if (key !== own) other = Math.min(other, gap(r, line[key]));
          if (other < 5) continue;
          if (own) { const g = gap(r, line[own]); if (g < 2 || g > 16 || g > other) continue; }
          const sc = Math.min(gap(r, line.orion), 24);
          if (sc > bestS) { best = { str, x, y, o: { ...o, align } , r }; bestS = sc; if (sc >= 24) break; }
        }
        if (best) { out.push(best); taken.push(pad(best.r, o.keep || 4)); }
      };
      const ex = L.ex, ey = L.ey, eR = L.eR;
      add("← Sun", { size: 12, color: C.sun, keep: 28 }, [20, L.words[2] + 18].flatMap(x =>
        [0, -24, 24, -48, 48, -72, 72, -96, 96, -120, -144, -168].map(dy => [x, L.cy + dy, "left"])));
      add("Earth", { size: 12, color: C.text }, [[ex - eR - 8, ey + eR + 8, "right"], [ex, ey + eR + 14, "center"],
        [ex - eR - 8, ey - eR - 8, "right"], [ex + eR + 8, ey + eR + 8, "left"]]);
      const rb = Math.max(9 * k, eR + 26);
      add("Van Allen belts", { size: 11, mono: true, color: C.muted }, [55, 125, 90, 20, 160, 200, -20].map(a => {
        const c = Math.cos(a * DEG);
        return [ex + rb * c, ey + rb * Math.sin(a * DEG), c > 0.35 ? "left" : c < -0.35 ? "right" : "center"];
      }));
      const beside = (list, f) => list.flatMap(v => {
        const t = f(v), q = P(t[0], t[1]);
        return [[q[0] - 6, q[1] - 11, "right"], [q[0] + 6, q[1] - 11, "left"], [q[0] + 6, q[1] + 12, "left"], [q[0] - 6, q[1] + 12, "right"]];
      });
      const ths = [];
      for (const sg of [-1, 1]) for (let t = 6; t <= 28; t++) ths.push(sg * t / 10);
      add("Magnetopause", { size: 11, mono: true, color: rgba(C.mp, 0.75) }, beside(ths, (t) => turn(mpAt(t))), "mp");
      const xs = [];
      for (const sg of [-1, 1]) for (let x = 10; x >= -60; x -= 1.5) xs.push([x, sg]);
      add("Bow shock", { size: 11, mono: true, color: rgba(C.shock, 0.75) }, beside(xs, ([x, sg]) => turn(bsAt(x, sg))), "bs");
      const mc = [], nm = D.moonPos.length;
      for (let i = nm - 1; i >= 0; i -= Math.max(1, Math.round(nm / 48))) {
        const q = P(D.moonPos[i][0], D.moonPos[i][1]), d = Math.hypot(q[0] - ex, q[1] - ey) || 1;
        for (const sg of [1, -1]) {
          const ux = sg * (q[0] - ex) / d, uy = sg * (q[1] - ey) / d;
          mc.push([q[0] + 12 * ux, q[1] + 12 * uy + (Math.abs(ux) < 0.35 ? 4 * uy : 0), ux > 0.35 ? "left" : ux < -0.35 ? "right" : "center"]);
        }
      }
      add("Moon's path", { size: 11, mono: true, color: C.muted }, mc, "moon");
      return out;
    }

    function showPhoto(p) {
      if (p === shown) return;
      shown = p;
      if (!p) { card.classList.remove("on"); return; }
      card.querySelector("img").src = p.img;
      card.querySelector("img").alt = p.caption;
      const d = new Date(p.utc);
      card.querySelector(".when").textContent = `${p.title} · ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}, ${d.toISOString().slice(11, 16)} UTC`;
      card.querySelector(".cap").textContent = p.caption;
      const a = card.querySelector(".credit");
      a.textContent = p.credit; a.href = p.source;
      card.classList.add("on");
    }

    function draw() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2), w = canvas.clientWidth, h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
      const ctx = canvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#03050b"; ctx.fillRect(0, 0, w, h);
      const wide = w > 900, words = box(copy), strip = box(card);
      // fit Earth, Orion and the Moon beside the words and photo card (under the words on a phone), above the player
      // bar and, on a phone, the photo strip
      const left = wide ? Math.max(w * 0.44, words[2] + 24) : 24, right = w - (wide ? 48 : 24);
      const top = wide ? 120 : words[3] + 28, bottom = wide ? h - 130 : strip[1] - 32;
      const k = Math.min((right - left) / (BOX.x1 - BOX.x0), (bottom - top) / (BOX.y1 - BOX.y0));
      const cx = left + BOX.x1 * k + ((right - left) - (BOX.x1 - BOX.x0) * k) / 2;
      const cy = top - BOX.y0 * k + ((bottom - top) - (BOX.y1 - BOX.y0) * k) / 2;
      const P = (x, y) => [cx - x * k, cy + y * k];                // the Sun to the left, dusk (+y) down
      const sun = ctx.createRadialGradient(-w * 0.12, cy, 0, -w * 0.12, cy, w * 0.55);
      sun.addColorStop(0, "rgba(255,190,110,0.16)"); sun.addColorStop(1, "rgba(255,190,110,0)");
      ctx.fillStyle = sun; ctx.fillRect(0, 0, w, h);
      // the bow shock and the magnetosphere
      const path = (pts) => { ctx.beginPath(); pts.forEach((q, i) => { const t = turn(q), p = P(t[0], t[1]); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }); };
      path(bs); ctx.fillStyle = rgba(C.shock, 0.035); ctx.fill();
      ctx.setLineDash([5, 4]); ctx.lineWidth = 1; ctx.strokeStyle = rgba(C.shock, 0.4); ctx.stroke(); ctx.setLineDash([]);
      path(mp); ctx.fillStyle = "rgba(27,49,99,0.3)"; ctx.fill();
      ctx.lineWidth = 1.2; ctx.strokeStyle = rgba(C.mp, 0.55); ctx.stroke();
      if (!wide) {                                               // on a phone, fade the boundaries out behind the words
        const veil = ctx.createLinearGradient(0, words[3] - 12, 0, words[3] + 28);
        veil.addColorStop(0, "#03050b"); veil.addColorStop(1, "rgba(3,5,11,0)");
        ctx.fillStyle = "#03050b"; ctx.fillRect(0, 0, w, words[3] - 12);
        ctx.fillStyle = veil; ctx.fillRect(0, words[3] - 12, w, 40);
      }
      window.FK.stars(ctx, w, h, 260, 99);
      // the radiation belts at their equatorial extent: the inner zone (L 1.2–2.5) and the outer zone (L 3–7)
      const [ex, ey] = P(0, 0);
      for (const [a, b, c] of [[1.2, 2.5, "255,150,90"], [3, 7, "190,120,255"]]) {
        const g = ctx.createRadialGradient(ex, ey, a * k, ex, ey, b * k);
        g.addColorStop(0, `rgba(${c},0)`); g.addColorStop(0.5, `rgba(${c},0.26)`); g.addColorStop(1, `rgba(${c},0)`);
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(ex, ey, b * k, 0, TAU); ctx.arc(ex, ey, a * k, 0, TAU, true); ctx.fill();
      }
      // the Moon's path over the flight, and Orion's whole path, faint
      ctx.lineWidth = 1; ctx.strokeStyle = "rgba(255,255,255,0.2)"; ctx.beginPath();
      D.moonPos.forEach((m, i) => { const p = P(m[0], m[1]); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }); ctx.stroke();
      ctx.setLineDash([3, 4]); ctx.strokeStyle = "rgba(255,92,77,0.32)"; ctx.beginPath();
      D.orion.forEach((o, i) => { const p = P(o[0], o[1]); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }); ctx.stroke(); ctx.setLineDash([]);
      // the part flown so far
      ctx.lineWidth = 2; ctx.strokeStyle = "rgba(255,92,77,0.95)"; ctx.beginPath();
      for (let i = 0; i < n && D.t[i] <= hours; i++) { const p = P(D.orion[i][0], D.orion[i][1]); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }
      const o = at(D.orion, Math.max(0, hours)), m = at(D.moonPos, Math.max(0, hours));
      const po = P(o[0], o[1]); ctx.lineTo(po[0], po[1]); ctx.stroke();
      // the flight's events along the path
      for (const e of events) {
        if (e.h < 0 || e.h > tEnd) continue;
        const q = at(D.orion, e.h), p = P(q[0], q[1]), done = hours >= e.h;
        ctx.fillStyle = done ? C.accent : "rgba(247,197,92,0.45)";
        ctx.beginPath(); ctx.arc(p[0], p[1], 3, 0, TAU); ctx.fill();
        if (e.id === "flyby") text(ctx, "Lunar flyby", p[0] - 12, p[1] + 16, { size: 12, align: "right", color: done ? C.text : C.muted });
      }
      // Earth seen from above, turning with the time, and the Moon
      const eR = Math.max(4, k), size = Math.round(2 * eR * dpr);
      const key = `${size}:${Math.round(hours * 4)}`;
      if (key !== globeKey) {
        const ax = earthAxes(t0 + hours * 3.6e6);
        globeImg = window.FK.globe(tex, size, VIEW, ax.axis, ax.prime);
        globeKey = key;
      }
      const glow = ctx.createRadialGradient(ex, ey, eR * 0.9, ex, ey, eR * 1.9);
      glow.addColorStop(0, "rgba(110,170,255,0.35)"); glow.addColorStop(1, "rgba(110,170,255,0)");
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(ex, ey, eR * 1.9, 0, TAU); ctx.fill();
      ctx.drawImage(globeImg, ex - eR, ey - eR, 2 * eR, 2 * eR);
      const pm = P(m[0], m[1]), rm = Math.max(2.5, 0.273 * k);
      ctx.fillStyle = "#34363d"; ctx.beginPath(); ctx.arc(pm[0], pm[1], rm, 0, TAU); ctx.fill();
      ctx.fillStyle = "#cfcdc6"; ctx.beginPath(); ctx.arc(pm[0], pm[1], rm, Math.PI / 2, Math.PI * 1.5); ctx.fill();
      // Orion
      const halo = ctx.createRadialGradient(po[0], po[1], 0, po[0], po[1], 14);
      halo.addColorStop(0, "rgba(255,120,100,0.85)"); halo.addColorStop(1, "rgba(255,120,100,0)");
      ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(po[0], po[1], 14, 0, TAU); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(po[0], po[1], 2.4, 0, TAU); ctx.fill();
      // names: Orion and the Moon move with the time; the rest are placed once for each size
      const lk = `${w}x${h}`;
      if (lk !== labelKey) {
        labels = placeLabels(ctx, w, h, P, k, { ex, ey, eR, cy, wide, words, card: strip, bar: box(bar) });
        labelKey = lk;
      }
      for (const l of labels) text(ctx, l.str, l.x, l.y, l.o);
      text(ctx, "Orion", po[0] + 11, po[1] - 12, { size: 12, weight: 600, color: "rgba(255,196,186,0.95)" });
      text(ctx, "Moon", pm[0] + rm + 7, pm[1] - rm - 7, { size: 12, color: C.text });
      // the read-out, and the photograph for this moment
      const when = new Date(t0 + hours * 3.6e6);
      const dE = Math.hypot(o[0], o[1], o[2]) * RE_KM, dM = Math.hypot(o[0] - m[0], o[1] - m[1], o[2] - m[2]) * RE_KM;
      tDay.textContent = `${when.getUTCDate()} ${MONTHS[when.getUTCMonth()]} ${when.getUTCFullYear()}`;
      tClock.textContent = `${when.toISOString().slice(11, 16)} UTC`;
      $("#art-earth").textContent = Math.round(dE).toLocaleString("en-US") + " km";
      $("#art-moon").textContent = Math.round(dM).toLocaleString("en-US") + " km";
      scrub.value = String(hours / tEnd * 1000);
      let best = null;
      for (const p of photos) {
        const near = p.h < 0 ? hours < p.h + SHOW : p.h > tEnd ? hours > p.h - SHOW : Math.abs(hours - p.h) < SHOW;
        if (near && (!best || Math.abs(hours - p.h) < Math.abs(hours - best.h))) best = p;
      }
      showPhoto(best);
    }

    function tick(now) {
      if (playing && !document.hidden) {
        const dt = Math.min(0.1, (now - last) / 1000);
        hours += dt * (tEnd / 32) * (shown ? 0.3 : 1);       // the whole flight in about half a minute, slower at a photo
        if (hours > tEnd) hours = 0;
        draw();
      }
      last = now;
      requestAnimationFrame(tick);
    }
    const setPlay = (p) => {
      playing = p;
      playBtn.setAttribute("aria-label", p ? "Pause" : "Play");
      playBtn.innerHTML = p ? '<svg viewBox="0 0 14 14"><path d="M3 2h3v10H3zM8 2h3v10H8z" fill="currentColor"/></svg>'
                            : '<svg viewBox="0 0 14 14"><path d="M3 1.5v11l9-5.5z" fill="currentColor"/></svg>';
    };
    playBtn.addEventListener("click", () => setPlay(!playing));
    scrub.addEventListener("input", () => { setPlay(false); hours = +scrub.value / 1000 * tEnd; draw(); });
    new ResizeObserver(draw).observe(canvas);
    setPlay(playing);
    draw();
    requestAnimationFrame(tick);
  }

  window.FK.fontsReady().then(start);
})();
