/* Helios Live: the Formation & topology view beside an MMS data window (Helios's FormationPanel, MMSTrackerMac/
 * Formation/*.swift; docs/MMS-FORMATION.md) — the four spacecraft and the Denton et al. (2020) polynomial
 * reconstruction at one instant (js/recon.js, Helios's port of Hosner & Denton's Python, CC BY 4.0): the 2-D cut
 * through the barycenter (L–N by default, B_M colored on matplotlib's bwr scale, black in-plane field lines, X points
 * as an orange ×, O points as a red ◆, the spacecraft, the trusted radius and the limit), the fit's verdict in words,
 * a time strip colored by the verdict every 0.25 s over the fetched window (drag it to move the instant), and the R
 * line on the data window, dragged like a VDF cut.
 *
 * Data, as FormationReconstructionModel.fetch takes them: ±30 s about the instant (Helios: ±45 s), burst FGM and FPI
 * moments with both published spin tones for the four probes — the window's own probe's B and electrons from what the
 * page already holds — and MEC positions as the page holds them. MMS4 has no DES moments after 2018-06-07 (CMAD
 * §4.1.2): its current is left out of the fit then. Fit as how_to_run_it.py: RQ-3D, 0.3 s smoothing, calc_f over the
 * 4.5 s about the instant applied; display frame the hybrid MVA/MDD L–N over the same 4.5 s (define_LMN), or MDD, the
 * window's applied LMN frame, or GSE.
 *
 * hso.js makes one per data window: HeliosFormation(ctx) → { sideHTML, on, width, mark, drag, update }.
 */
(function () {
  "use strict";
  const R = window.HeliosRecon, LM = window.HeliosLMN;
  if (!R || !LM) return;
  const { dot, sub, norm } = LM.math;
  const HALF = 30, EDGE = 2.5, FSPAN = 4.5, STRIP_STEP = 0.25;
  const MMS4_DES_END = Date.UTC(2018, 5, 7, 12, 43);              // CMAD §4.1.2: no MMS4 DES moments after
  const INK = { 1: "#000000", 2: "#d90d0d", 3: "#008000", 4: "#001af2" };   // MMS1–4 on the white figure
  const XC = "#f08000", OC = "#d91c3d", CORE = "#2e9e57", OUTER = "#c99a00";
  const VERDICT = { good: ["Good fit", "#34d27b"], caution: ["Use with care", "#ffc44d"], unreliable: ["Unreliable here", "#ff6b5e"] };
  const MODEL_OPTS = [["rq3d", "RQ-3D (17)"], ["lbj3d", "LBJ-3D (linear, 12)"], ["qlm3d", "QLm-3D (21)"], ["q3d", "Q-3D (27)"], ["lb3d", "LB-3D (B only)"]];

  window.HeliosFormation = function (ctx) {
    const { W, tk, esc } = ctx;
    const F = { on: false, t: null, probes: null, win: null, loading: null, error: null, frame: "hybrid", plane: "LN", color: "b", off: 0,
                model: "rq3d", applyF: true, smooth: 0.3, fade: true, step: 0.03, strip: null, stripGen: 0, gen: 0, hover: null, adv: false };
    const memo = { f: new Map(), h: new Map(), sol: null, cut: null };
    let el = null, cv = null, sv = null;
    const clockMs = (t) => ctx.clock(t, true);
    const isMMS = () => ctx.craft().mission === "mms";
    const prepNow = () => ({ bWindow: F.smooth || null, jWindow: F.smooth || null });

    // ───────────────────────── the panel element ─────────────────────────
    function mount() {
      if (el) return;
      el = document.createElement("section");
      el.className = "fw-form tk"; el.setAttribute("aria-label", "Formation and topology");
      el.hidden = true;
      const after = W.el.querySelector(".fw-lmn");
      after.parentNode.insertBefore(el, after.nextSibling);
      el.addEventListener("click", onClick);
      el.addEventListener("change", onChange);
      el.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.matches("input")) e.target.blur(); });
      el.addEventListener("input", (e) => { if (e.target.dataset.fx === "off") { F.off = +e.target.value; const o = el.querySelector(".fx-offv"); if (o) o.textContent = sgn(F.off, 2); scheduleCut(); } });
    }
    const sgn = (x, k) => `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(k)}`;

    // ───────────────────────── data: the four probes about the instant ─────────────────────────
    const ms = (t) => ctx.T0 + t * 1000;
    const rows3 = (r, c0) => { const out = []; for (let i = 0; i < (r.n || 0); i++) { const x = r.cols[c0][i], y = r.cols[c0 + 1][i], z = r.cols[c0 + 2][i]; if (isFinite(x) && isFinite(y) && isFinite(z)) out.push({ t: r.t[i], x, y, z }); } return out; };
    /** One FPI or FGM product: burst over [a, b], else its survey/fast product. */
    async function product(k, a, b, kind) {
      const sc = `mms${k}`, H = (id, p, label) => ctx.SRC.hapi(id, p, ms(a), ms(b), label).catch(() => ({ n: 0 }));
      if (kind === "fgm") {
        let r = await H(`MMS${k}_FGM_BRST_L2@0`, [`${sc}_fgm_b_gse_brst_l2`], `MMS${k} burst FGM (formation)`), burst = true;
        if (!r.n || r.n < 8) { r = await H(`MMS${k}_FGM_SRVY_L2@0`, [`${sc}_fgm_b_gse_srvy_l2`], `MMS${k} FGM (formation)`); burst = false; }
        return { b: rows3(r, 0), burst };
      }
      const sp = kind, P = (m) => [`${sc}_${sp}_numberdensity_${m}`, `${sc}_${sp}_bulkv_gse_${m}`, `${sc}_${sp}_bulkv_spintone_gse_${m}`];
      let r = await H(`MMS${k}_FPI_BRST_L2_${sp.toUpperCase()}-MOMS`, P("brst"), `MMS${k} burst FPI ${sp === "des" ? "electrons" : "ions"} (formation)`), burst = true;
      if (!r.n || r.n < 4) { r = await H(`MMS${k}_FPI_FAST_L2_${sp.toUpperCase()}-MOMS`, P("fast"), `MMS${k} FPI ${sp === "des" ? "electrons" : "ions"} (formation)`); burst = false; }
      const n = []; for (let i = 0; i < (r.n || 0); i++) if (isFinite(r.cols[0][i])) n.push({ t: r.t[i], v: r.cols[0][i] });
      return { n, v: rows3(r, 1), spin: rows3(r, 4), burst };
    }
    /** The window's own probe's B and electrons, from what the page holds (burst where loaded). */
    function own(a, b) {
      const r = ctx.bIn(a, b), B = r.pts.map((p, i) => ({ t: r.ts[i], x: p[0], y: p[1], z: p[2] }));
      const n = [], v = [], spin = [];
      for (const [S, i0, i1] of ctx.runs("des", a, b)) for (let i = Math.max(0, i0); i < Math.min(S.t.length, i1); i++) {
        const t = S.t[i];
        if (t < a || t > b) continue;
        if (isFinite(S.n[i])) n.push({ t, v: S.n[i] });
        v.push({ t, x: S.v[i * 3], y: S.v[i * 3 + 1], z: S.v[i * 3 + 2] });
        if (S.vst) spin.push({ t, x: S.vst[i * 3], y: S.vst[i * 3 + 1], z: S.vst[i * 3 + 2] });
      }
      const burstB = r.native && B.length > 2 && (B[B.length - 1].t - B[0].t) / B.length < 0.03;
      return { b: B, burstB, des: { n, v: v.filter(p => isFinite(p.x)), spin, burst: !!(W.view.bu && W.view.bu.des) } };
    }
    async function load(t) {
      const a = t - HALF, b = t + HALF, gen = ++F.gen;
      F.pending = false;
      F.loading = `Fetching MMS1–4 burst FGM and FPI moments (both spin tones) ±${HALF} s about ${clockMs(t)}…`;
      F.error = null; F.probes = null; F.strip = null; F.stripGen++; memo.f.clear(); memo.h.clear(); memo.sol = memo.cut = null;
      render();
      try {
        const P = await ctx.SRC.positions(), noDES4 = ms(a) >= MMS4_DES_END, out = [], notes = [];
        await Promise.all([1, 2, 3, 4].map(async (k) => {
          const mine = k === W.n ? own(a, b) : null;
          const [fg, des, dis] = await Promise.all([
            mine && mine.b.length > 8 ? { b: mine.b, burst: mine.burstB } : product(k, a, b, "fgm"),
            k === 4 && noDES4 ? null : mine && mine.des.n.length > 8 && mine.des.spin.length ? mine.des : product(k, a, b, "des"),
            product(k, a, b, "dis"),
          ]);
          const pos = P[k] ? P[k].r.map((r, i) => ({ t: P[k].t[i], x: r[0], y: r[1], z: r[2] })).filter(p => p.t >= a - 600 && p.t <= b + 600) : [];
          const s = { probe: k, b: fg.b, r: pos, burstB: fg.burst, burstJ: !!(des && des.burst), reused: !!mine };
          if (des && des.n.length > 2 && dis.v.length > 2) Object.assign(s, { ne: des.n, ve: des.v, veSpin: des.spin, vi: dis.v, viSpin: dis.spin });
          else if (dis.v.length > 2) s.ions = { vi: dis.v, viSpin: dis.spin };
          if (k === 4 && noDES4) notes.push("MMS4 has no DES moments after 2018-06-07: its current is left out");
          out[k - 1] = s;
        }));
        if (gen !== F.gen) return;
        const missing = out.filter(s => !s || s.b.length < 2 || s.r.length < 2).map(s => s ? `MMS${s.probe}` : "?");
        F.probes = out; F.win = [a, b]; F.loading = null; F.notes = notes;
        if (missing.length) F.error = `No FGM or positions for ${missing.join(", ")} about ${clockMs(t)}.`;
        F.cadence = describeCadence(out);
      } catch (e) {
        if (gen !== F.gen) return;
        F.loading = null; F.error = `CDAWeb did not answer: ${e.message || e}`;
      }
      render(); scheduleCut(); buildStrip();
    }
    function describeCadence(P) {
      const nb = P.filter(s => s && s.burstB).length, nj = P.filter(s => s && s.ne && s.burstJ).length, withJ = P.filter(s => s && s.ne).length;
      return `B ${nb === 4 ? "burst 128 Hz" : nb ? `burst on ${nb}/4, else survey` : "survey"} · J ${withJ === 0 ? "none" : nj === withJ ? "burst 30 ms" : nj ? `burst on ${nj}/${withJ}, else fast 4.5 s` : "fast 4.5 s"} on ${withJ}/4`
        + (P.some(s => s && s.reused) ? ` · MMS${W.n}'s B and electrons from this window` : "");
    }
    const covers = (t) => F.win && t >= F.win[0] + EDGE && t <= F.win[1] - EDGE;

    // ───────────────────────── the fit at an instant ─────────────────────────
    function calcF(t) {
      const key = Math.round(t * 10);
      if (!memo.f.has(key)) { const e = R.currentScale(F.probes, t - FSPAN / 2, t + FSPAN / 2, 0.005, prepNow()); memo.f.set(key, e ? e.mean : null); if (memo.f.size > 300) memo.f.clear(); }
      return memo.f.get(key);
    }
    function hybrid(t) {
      const key = Math.round(t * 10);
      if (!memo.h.has(key)) { memo.h.set(key, R.hybridLMN(F.probes, t - FSPAN / 2, t + FSPAN / 2, { preparation: prepNow() })); if (memo.h.size > 200) memo.h.clear(); }
      return memo.h.get(key);
    }
    function fit(t, f) {
      const cf = f === undefined ? calcF(t) : f, fa = F.applyF && cf != null ? cf : 1;
      const r = R.solveAt(t, F.probes, F.model, prepNow(), { currentScale: fa });
      return Object.assign(r, { f: fa, calcF: cf });
    }
    /** The display frame and its name (FormationReconstructionModel.displayFrame). */
    function displayFrame(t, sol) {
      const h = hybrid(t), lmn = W.lmn && W.lmn.frame;
      if (F.frame === "panel" && lmn) return { f: { l: lmn.l, m: lmn.m, n: lmn.n }, name: `this window's LMN (${lmn.method}, ${ctx.hmsShort(lmn.a)}–${ctx.hmsShort(lmn.b)})` };
      if (F.frame === "gse") return { f: { l: [1, 0, 0], m: [0, 1, 0], n: [0, 0, 1] }, name: "GSE (L = X, M = Y, N = Z)" };
      if (F.frame === "mdd") return { f: h ? R.aligned(sol.frame, h.frame) : sol.frame, name: "MDD at the instant (the fit's own frame)" };
      if (h) return { f: h.frame, name: `hybrid MVA + MDD over ${FSPAN} s${F.frame === "panel" ? " (this window has no LMN frame yet)" : ""}`, h };
      return { f: sol.frame, name: "MDD (the hybrid needs four probes over 4.5 s)" };
    }
    let cutTimer = null;
    function scheduleCut() { clearTimeout(cutTimer); cutTimer = setTimeout(computeCut, 16); }
    function computeCut() {
      if (!F.on || !F.probes || F.t == null) return;
      if (!covers(F.t)) { clearTimeout(loadTimer); loadTimer = setTimeout(() => { if (!covers(F.t)) load(F.t); }, 600); return; }
      const r = fit(F.t);
      memo.sol = r;
      if (!r.solution) { memo.cut = null; draw(); renderReadouts(); return; }
      const s = r.solution, D = displayFrame(F.t, s), Lsc = s.separation;
      const cut = R.planeCut(s, D.f, { orientation: F.plane, offset: F.off * Lsc, halfWidth: 3 * Lsc, resolution: 161, wantJ: F.color === "j" });
      memo.cut = { cut, D, lines: cut.streamlines({ seedGrid: 22 }), nulls: F.plane === "LN" ? cut.nulls(13) : [], t: F.t, current: F.color === "j" };
      draw(); renderReadouts();
    }

    // ───────────────────────── the time strip (FormationTimeStrip) ─────────────────────────
    function buildStrip() {
      if (!F.probes || !F.win) return;
      const gen = ++F.stripGen, a = F.win[0] + EDGE, b = F.win[1] - EDGE, n = Math.floor((b - a) / STRIP_STEP) + 1;
      F.strip = { a, b, v: new Array(n).fill(null) };
      const fSec = new Map();
      let i = 0;
      const chunk = () => {
        if (gen !== F.stripGen || !F.on || !F.probes) return;
        const until = performance.now() + 12;
        while (i < n && performance.now() < until) {
          const t = a + i * STRIP_STEP, sec = Math.round(t);
          if (!fSec.has(sec)) fSec.set(sec, calcF(sec));                  // calc_f once a second here, exact at the instant
          const r = fit(t, fSec.get(sec));
          F.strip.v[i] = r.solution ? r.solution.trust.level : "none";
          i++;
        }
        drawStrip();
        if (i < n) setTimeout(chunk, 0);
      };
      chunk();
    }
    function drawStrip() {
      if (!sv || !F.strip) return;
      const dpr = window.devicePixelRatio || 1, w = sv.clientWidth, h = sv.clientHeight;
      if (!w) return;
      sv.width = Math.round(w * dpr); sv.height = Math.round(h * dpr);
      const g = sv.getContext("2d");
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const S = F.strip, n = S.v.length, cw = w / n, col = { good: "#34d27b", caution: "#ffc44d", unreliable: "#ff6b5e", none: "#4a4a52" };
      S.v.forEach((v, k) => { g.fillStyle = v ? col[v] : "rgba(255,255,255,0.08)"; g.fillRect(k * cw, 3, Math.ceil(cw), h - 6); });
      if (F.t != null) {
        const x = (F.t - S.a) / (S.b - S.a) * w;
        g.fillStyle = "#fff"; g.fillRect(Math.round(x) - 1, 0, 2, h);
        g.fillStyle = "#7c5ce0"; g.fillRect(Math.round(x) - 1, 0, 2, 3); g.fillRect(Math.round(x) - 1, h - 3, 2, 3);
      }
    }

    // ───────────────────────── the 2-D cut, drawn as show_list draws it ─────────────────────────
    const bwr = (x) => { x = Math.min(Math.max(x, 0), 1); return x < 0.5 ? [2 * x, 2 * x, 1] : [1, 2 * (1 - x), 2 * (1 - x)]; };
    function niceLimit(v) { if (!(v > 0)) return 1; const e = 10 ** Math.floor(Math.log10(v)), m = v / e; return Math.ceil(m * 10) / 10 * e; }
    function draw() {
      if (!cv) return;
      const dpr = window.devicePixelRatio || 1, W_ = cv.clientWidth, H_ = cv.clientHeight;
      if (!W_) return;
      cv.width = Math.round(W_ * dpr); cv.height = Math.round(H_ * dpr);
      const g = cv.getContext("2d");
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = "#fff"; g.fillRect(0, 0, W_, H_);
      const M = memo.cut;
      g.font = '11px -apple-system, "Helvetica Neue", Arial, sans-serif'; g.fillStyle = "#555"; g.textAlign = "center";
      if (!M) { g.fillText(F.loading ? "Fetching…" : memo.sol && memo.sol.error ? memo.sol.error : "No reconstruction", W_ / 2, H_ / 2, W_ - 20); return; }
      const { cut, lines, nulls } = M, s = cut.solution, Lsc = s.separation, or = cut.orientation, hw = cut.halfWidth;
      const pad = { l: 40, r: 50, t: 22, b: 34 }, side = Math.min(W_ - pad.l - pad.r, H_ - pad.t - pad.b), x0 = pad.l, y0 = pad.t;
      const X = (h) => x0 + (h - (cut.center[0] - hw)) / (2 * hw) * side, Y = (v) => y0 + side - (v - (cut.center[1] - hw)) / (2 * hw) * side;
      // color: the component normal to the cut (B_M on L–N), ± the 99th percentile in the window
      const comp = cut.grid(or.n, M.current), res = cut.resolution, vals = Array.from(comp).map(Math.abs).sort((p, q) => p - q);
      const lim = niceLimit(vals[Math.floor(0.99 * (vals.length - 1))]), outer = s.trust.outer_km, core = s.trust.core_km, off = cut.offset;
      const img = g.createImageData(res, res);
      for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) {
        const v = comp[j * res + i], [r, gg, b] = bwr((v + lim) / (2 * lim)), k = ((res - 1 - j) * res + i) * 4;
        let mix = 0;
        if (F.fade) { const d = Math.hypot(cut.center[0] + cut.axis[i], cut.center[1] + cut.axis[j], off); if (d > outer) mix = 0.72; }
        img.data[k] = 255 * (r * (1 - mix) + 0.8 * mix); img.data[k + 1] = 255 * (gg * (1 - mix) + 0.8 * mix); img.data[k + 2] = 255 * (b * (1 - mix) + 0.8 * mix); img.data[k + 3] = 255;
      }
      const tmp = document.createElement("canvas"); tmp.width = res; tmp.height = res; tmp.getContext("2d").putImageData(img, 0, 0);
      g.imageSmoothingEnabled = true; g.drawImage(tmp, x0, y0, side, side);
      g.save(); g.beginPath(); g.rect(x0, y0, side, side); g.clip();
      // in-plane field lines: black, thinner beyond the trusted radius
      for (const ln of lines) {
        g.beginPath();
        let prevFar = null;
        for (let k = 0; k < ln.length; k++) {
          const p = ln[k], far = F.fade && Math.hypot(p[0], p[1], off) > core;
          if (k === 0) g.moveTo(X(p[0]), Y(p[1]));
          else if (far !== prevFar && prevFar !== null) { g.lineTo(X(p[0]), Y(p[1])); g.strokeStyle = prevFar ? "rgba(0,0,0,0.45)" : "rgba(0,0,0,0.85)"; g.lineWidth = prevFar ? 0.6 : 0.9; g.stroke(); g.beginPath(); g.moveTo(X(p[0]), Y(p[1])); }
          else g.lineTo(X(p[0]), Y(p[1]));
          prevFar = far;
        }
        g.strokeStyle = prevFar ? "rgba(0,0,0,0.45)" : "rgba(0,0,0,0.85)"; g.lineWidth = prevFar ? 0.6 : 0.9; g.stroke();
      }
      // the trusted radius and the limit, where the plane cuts them
      for (const [R_, c, name] of [[core, CORE, "trusted"], [outer, OUTER, "limit"]]) {
        if (R_ <= Math.abs(off)) continue;
        const rr = Math.sqrt(R_ * R_ - off * off) / (2 * hw) * side;
        g.save(); g.setLineDash([5, 4]); g.strokeStyle = c; g.lineWidth = 1.3; g.beginPath(); g.arc(X(0), Y(0), rr, 0, 2 * Math.PI); g.stroke(); g.restore();
        g.font = '600 9.5px -apple-system, "Helvetica Neue", Arial, sans-serif'; g.fillStyle = c; g.textAlign = "left";
        g.fillText(name, X(0) + rr * 0.72 + 3, Y(0) - rr * 0.72 - 3);
      }
      // nulls: X an orange ×, O a red ◆ (show_current_sheet)
      for (const q of nulls) {
        const x = X(q.h), y = Y(q.v);
        g.lineWidth = 2.6;
        if (q.kind === "x") { g.strokeStyle = "#fff"; g.lineWidth = 4.2; g.beginPath(); g.moveTo(x - 6, y - 6); g.lineTo(x + 6, y + 6); g.moveTo(x + 6, y - 6); g.lineTo(x - 6, y + 6); g.stroke(); g.strokeStyle = XC; g.lineWidth = 2.4; g.stroke(); }
        else { g.beginPath(); g.moveTo(x, y - 7); g.lineTo(x + 6, y); g.lineTo(x, y + 7); g.lineTo(x - 6, y); g.closePath(); g.fillStyle = OC; g.fill(); g.strokeStyle = "#fff"; g.lineWidth = 1.2; g.stroke(); }
      }
      // the spacecraft, projected, solid as Helios draws them (FormationCutView: a black ring, a white one, the probe's
      // color); their distances from the plane are in the Formation card. (Drawn hollow beyond 0.3 L_sc off the plane
      // until 2026-11-14 — a convention of this port with no key, which read as a fault: user report.)
      for (const m of cut.markers) {
        const x = X(m.h), y = Y(m.v);
        g.beginPath(); g.arc(x, y, 7, 0, 2 * Math.PI); g.fillStyle = "#000"; g.fill();
        g.beginPath(); g.arc(x, y, 6, 0, 2 * Math.PI); g.fillStyle = "#fff"; g.fill();
        g.beginPath(); g.arc(x, y, 5, 0, 2 * Math.PI); g.fillStyle = INK[m.probe]; g.fill();
        g.font = '700 9.5px ui-monospace, "SF Mono", Menlo, monospace'; g.fillStyle = "#000"; g.textAlign = "left";
        g.fillText(String(m.probe), x + 7, y - 5);
      }
      g.restore();
      // frame, ticks in L_sc (the paper's units), labels
      g.strokeStyle = "#000"; g.lineWidth = 1; g.strokeRect(x0 + 0.5, y0 + 0.5, side - 1, side - 1);
      g.font = '10px -apple-system, "Helvetica Neue", Arial, sans-serif'; g.fillStyle = "#000";
      const tick = (lo, hi) => { const a = Math.ceil(lo / Lsc), b = Math.floor(hi / Lsc), out = []; for (let k = a; k <= b; k++) out.push(k); return out; };
      g.textAlign = "center";
      for (const k of tick(cut.center[0] - hw, cut.center[0] + hw)) { const x = X(k * Lsc); g.fillRect(Math.round(x), y0 + side, 1, 4); g.fillText(String(k), x, y0 + side + 14); }
      g.textAlign = "right";
      for (const k of tick(cut.center[1] - hw, cut.center[1] + hw)) { const y = Y(k * Lsc); g.fillRect(x0 - 4, Math.round(y), 4, 1); g.fillText(String(k), x0 - 6, y + 3.5); }
      const ax = (a, sgn_) => `${sgn_ < 0 ? "−" : ""}${a.toUpperCase()}`;
      g.textAlign = "center"; g.font = '600 11px -apple-system, "Helvetica Neue", Arial, sans-serif';
      g.fillText(`${ax(or.h, or.hs)} (L_sc = ${Lsc.toFixed(1)} km)`, x0 + side / 2, y0 + side + 28);
      g.save(); g.translate(13, y0 + side / 2); g.rotate(-Math.PI / 2); g.fillText(`${ax(or.v, or.vs)} (L_sc)`, 0, 0); g.restore();
      g.textAlign = "left"; g.font = '600 11px -apple-system, "Helvetica Neue", Arial, sans-serif';
      g.fillText(`${or.h.toUpperCase()}–${or.v.toUpperCase()} cut at ${or.n.toUpperCase()} = ${sgn(F.off, 2)} L_sc · ${clockMs(M.t)} UT`, x0, 14);
      // color bar
      const cbx = x0 + side + 12, cbw = 10;
      for (let k = 0; k < side; k++) { const [r, gg, b] = bwr(1 - k / side); g.fillStyle = `rgb(${255 * r | 0},${255 * gg | 0},${255 * b | 0})`; g.fillRect(cbx, y0 + k, cbw, 1.5); }
      g.strokeStyle = "#000"; g.strokeRect(cbx + 0.5, y0 + 0.5, cbw - 1, side - 1);
      g.font = '9.5px -apple-system, "Helvetica Neue", Arial, sans-serif'; g.textAlign = "left"; g.fillStyle = "#000";
      g.fillText(`+${lim}`, cbx + cbw + 3, y0 + 8); g.fillText("0", cbx + cbw + 3, y0 + side / 2 + 3); g.fillText(`−${lim}`, cbx + cbw + 3, y0 + side - 2);
      g.save(); g.translate(cbx + cbw + 30, y0 + side / 2); g.rotate(-Math.PI / 2); g.textAlign = "center";
      g.fillText(`${M.current ? "J" : "B"}_${or.n.toUpperCase()} (${M.current ? "µA/m²" : "nT"})`, 0, 0); g.restore();
      // the hover readout
      if (F.hover) {
        const p = F.hover, B = cut.evalB(p[0], p[1]), pos = cut.position(p), d = s.distance(pos), z = s.zone(pos);
        const txt = [`${or.h.toUpperCase()} ${sgn(p[0] / Lsc, 2)}  ${or.v.toUpperCase()} ${sgn(p[1] / Lsc, 2)} L_sc · ${d.toFixed(1)} km from the barycenter`,
                     `B (L, M, N) ${B.map(x => sgn(x, 2)).join(", ")} nT · ${z === "core" ? "inside the trusted radius" : z === "outer" ? "past the trusted radius" : "extrapolation"}`];
        g.font = '10px ui-monospace, "SF Mono", Menlo, monospace';
        const wbox = Math.max(...txt.map(t => g.measureText(t).width)) + 10;
        g.fillStyle = "rgba(255,255,255,0.92)"; g.fillRect(x0 + 4, y0 + side - 34, wbox, 30); g.strokeStyle = "rgba(0,0,0,0.3)"; g.strokeRect(x0 + 4.5, y0 + side - 33.5, wbox - 1, 29);
        g.fillStyle = "#000"; txt.forEach((t, i) => g.fillText(t, x0 + 9, y0 + side - 21 + 13 * i));
      }
      M.px = { X, Y, x0, y0, side, hw };
    }

    // ───────────────────────── words ─────────────────────────
    function readoutsHTML() {
      const r = memo.sol, M = memo.cut;
      if (!r) return "";
      if (!r.solution) return `<p class="tk-err">⚠ ${esc(r.error)}</p>`;
      const s = r.solution, d = s.diagnostics, T = s.trust, Lsc = s.separation, [word, col] = VERDICT[T.level];
      // the physical scale: nₑ the four probes' mean DES density at the instant (nearest within 5 s)
      const ns = F.probes.map(p => { if (!p.ne) return null; let best = null; for (const q of p.ne) if (Math.abs(q.t - F.t) <= 5 && q.v > 0 && (!best || Math.abs(q.t - F.t) < Math.abs(best.t - F.t))) best = q; return best && best.v; }).filter(Boolean);
      const ne = ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : null, de = ne ? 5.314 / Math.sqrt(ne) : null, di = ne ? 227.7 / Math.sqrt(ne) : null;
      let h = `<div class="fx-verdict" style="--c:${col}"><b>${word}</b><span>trusted within ${T.core_km.toFixed(0)} km, limit ${T.outer_km.toFixed(0)} km${T.cause ? ` — ${esc(T.cause)}` : ""}</span>`
        + `<span class="tk-sup">1 L_sc = ${Lsc.toFixed(1)} km${de ? ` = ${(Lsc / de).toFixed(1)} dₑ = ${(Lsc / di).toFixed(2)} dᵢ (nₑ ${ne.toFixed(2)} cm⁻³)` : ""}</span></div>`;
      if (M) {
        const nl = M.nulls.map(q => `${q.kind === "x" ? `<b style="color:${XC}">× X</b>` : `<b style="color:${OC}">◆ O</b>`} at ${M.cut.orientation.h.toUpperCase()} ${sgn(q.h / Lsc, 2)}, ${M.cut.orientation.v.toUpperCase()} ${sgn(q.v / Lsc, 2)} L_sc (${q.h.toFixed(1)}, ${q.v.toFixed(1)} km)${de ? ` · ${(Math.hypot(q.h, q.v) / de).toFixed(1)} dₑ from the barycenter` : ""}`);
        h += `<div class="tk-col"><p class="lx-q">Frame: ${esc(M.D.name)}</p>`
          + (M.cut.orientation.name === "LN" ? `<p class="lx-q">${nl.length ? nl.join("<br>") : "No X or O point in the ±3 L_sc window."}</p>` : `<p class="lx-q tk-sup">X and O points are marked on L–N cuts, where the reconnection plane is read.</p>`)
          + (M.D.h ? `<p class="tk-cite">Hybrid over ${FSPAN} s: MVA λ₁/λ₂ ${(M.D.h.mvaEigenvalues[0] / M.D.h.mvaEigenvalues[1]).toFixed(1)} (sets L), summed-MDD λ₁/λ₂ ${(M.D.h.mddEigenvalues[0] / M.D.h.mddEigenvalues[1]).toFixed(0)} (sets N); N turned ${M.D.h.normalProjection_deg.toFixed(0)}° to be ⊥ L.</p>` : "")
          + `</div>`;
      }
      const pct = (x) => (x == null ? "—" : `${(100 * x).toFixed(1)} %`);
      h += tk.dis("fx-recon", "Reconstruction", W.open.has("fx-recon"),
        `<p class="lx-q">${esc(R.MODELS[s.model].long)} · ${d.equations} equations, ${d.freeParameters} free coefficients</p>`
        + `<p class="lx-q">Noise gain G₁ ${d.noiseGain.toFixed(2)} · ΔB ${pct(d.relativeBResidual)} · ΔJ ${pct(d.relativeJResidual)} · η ${d.currentNonUniformity == null ? "—" : d.currentNonUniformity.toFixed(2)}</p>`
        + `<p class="lx-q">f ${r.f.toFixed(3)}${F.applyF ? " applied" : " (off: the measured current as it is)"}${r.calcF != null ? ` · calc_f over ${FSPAN} s ${r.calcF.toFixed(3)}` : ""}</p>`
        + `<p class="lx-q">Current at ${d.currentCount} of ${d.spacecraftCount} spacecraft${d.currentDivergence ? ` · L_sc|∇·J|/|J̄| ${d.currentDivergence.relativeToMean.toFixed(2)}` : ""}</p>`
        + `<p class="tk-cite">${esc(F.cadence || "")}${F.smooth ? ` · ${F.smooth} s running means of B and of each moment` : " · unsmoothed"} · J = e nₑ(Vᵢ − Vₑ), both spin tones removed, FPI at accumulation centers${F.notes && F.notes.length ? ` · ${esc(F.notes.join(" · "))}` : ""}</p>`
        + `<div class="lx-notes">${T.reasons.map(x => `<p>· ${esc(x)}</p>`).join("")}</div>`
        + `<p class="tk-cite">Denton et al. (2020), JGR 125, e2019JA027481; Python by Hosner & Denton (2023), Zenodo 10.5281/zenodo.8217728, CC BY 4.0 — Helios's port. Thresholds are Helios's own.</p>`);
      const pos = s.samples.map(x => x.r), bary = s.barycenter, base = [];
      for (let i = 0; i < pos.length; i++) for (let j = i + 1; j < pos.length; j++) base.push(`${s.samples[i].probe}–${s.samples[j].probe} ${norm(sub(pos[i], pos[j])).toFixed(1)}`);
      h += tk.dis("fx-form", "Formation", W.open.has("fx-form"),
        `<p class="lx-q">Mean separation ${Lsc.toFixed(1)} km · TQF ${d.tetrahedronQuality == null ? "—" : d.tetrahedronQuality.toFixed(3)}${d.tetrahedronQuality != null && d.tetrahedronQuality < 0.7 ? " (the curlometer warns below 0.7)" : ""}</p>`
        + `<p class="lx-q">Barycenter (${bary.map(x => (x / 6371.2).toFixed(2)).join(", ")}) R_E GSE</p>`
        + `<p class="tk-cite">Baselines (km): ${base.join(" · ")}</p>`
        + (M ? `<p class="tk-cite">Off the plane: ${M.cut.markers.map(m => `MMS${m.probe} ${sgn(m.off / Lsc, 2)}`).join(", ")} L_sc</p>` : ""));
      return h;
    }
    function renderReadouts() { const o = el && el.querySelector(".fx-read"); if (o) o.innerHTML = readoutsHTML(); }

    // ───────────────────────── the panel ─────────────────────────
    function render() {
      if (!el) return;
      el.hidden = !F.on;
      if (!F.on) return;
      const top = el.scrollTop, lmn = W.lmn && W.lmn.frame;
      let h = `<div class="tk-ph"><b>Formation & topology · ${esc(ctx.craft().name)}</b><span class="fx-beta" title="Reproduces Denton et al. (2020)'s event and the Burch et al. (2022) and Turner et al. (2021) reconstructions; limited checking beyond them. Read the verdict first.">BETA</span><button class="tk-x" data-fx="close" aria-label="Close the formation view" title="Close the formation view">×</button></div><div class="tk-pb fx-pb">`;
      h += `<div class="fx-instant"><button class="tk-btn" data-fx="prev" title="Back one step">◀</button><input class="tk-time" data-fx="t" value="${F.t != null ? clockMs(F.t) : ""}" spellcheck="false" title="The instant — UTC, HH:mm:ss.sss; Return applies. Also: drag the violet R line on the figure, or the strip below."><button class="tk-btn" data-fx="next" title="Forward one step">▶</button>`
        + tk.sel('data-fx="step" title="Step"', [[0.03, "30 ms"], [0.15, "150 ms"], [1, "1 s"]], F.step)
        + `<button class="tk-btn${F.playing ? " on" : ""}" data-fx="play" title="Play: step the instant through the fetched window, five fits a second (Helios's movie, without the recording)"${F.strip ? "" : " disabled"}>${F.playing ? "❚❚" : "⏵"}</button></div>`;
      h += `<div class="fx-strip"><canvas class="fx-sv" aria-label="The fit's verdict every 0.25 s over the fetched window — drag to move the instant"></canvas>${F.strip ? `<div class="fx-sl"><span>${ctx.hmsShort(F.strip.a)}</span><span>good · care · unreliable, every 0.25 s</span><span>${ctx.hmsShort(F.strip.b)}</span></div>` : ""}</div>`;
      if (F.loading) h += `<p class="tk-note lx-busy"><i class="lx-spin"></i>${esc(F.loading)}</p>`;
      else if (F.pending) h += tk.note(`The instant is outside the fetched ±${HALF} s: the four probes' data about it are fetched when it rests.`);
      if (F.error) h += `<p class="tk-err">⚠ ${esc(F.error)}</p>`;
      h += `<div class="fx-ctl">`
        + tk.seg("data-fx-plane", [["LN", "L–N"], ["LM", "L–M"], ["MN", "M–N"]], F.plane)
        + tk.seg("data-fx-color", [["b", "Color B"], ["j", "Color J"]], F.color)
        + `</div>`;
      h += `<div class="fx-cut"><canvas class="fx-cv" aria-label="The reconstruction's cut through the barycenter"></canvas></div>`;
      h += `<div class="fx-off"><span class="tk-l2">${F.plane === "LN" ? "M" : F.plane === "LM" ? "N" : "L"}₀</span><input type="range" data-fx="off" min="-3" max="3" step="0.05" value="${F.off}" title="Where the cut sits along its normal, in L_sc from the barycenter"><b class="mono fx-offv">${sgn(F.off, 2)}</b><span class="tk-sup">L_sc</span>${F.off ? `<button class="tk-link" data-fx="center" title="Back through the barycenter, where the fit is best">Center</button>` : ""}</div>`;
      h += `<div class="fx-read">${readoutsHTML()}</div>`;
      h += tk.dis("fx-adv", "Advanced", W.open.has("fx-adv"),
        tk.opt("Frame", tk.sel('data-fx="frame"', [["hybrid", "Hybrid MVA + MDD (4.5 s)"], ["mdd", "MDD at the instant"], ["panel", lmn ? `This window's LMN (${lmn.method})` : "This window's LMN (none yet)", !lmn], ["gse", "GSE"]], F.frame), "auto")
        + tk.note("Hybrid: L from the minimum variance of all four probes' B (its largest-variance direction), N from the summed strongest gradient (MDD), over the 4.5 s about the instant — Denton et al.'s define_LMN. The fit itself is always solved in its own MDD frame.")
        + tk.opt("Model", tk.sel('data-fx="model"', MODEL_OPTS, F.model), "auto")
        + tk.opt("Smoothing", tk.sel('data-fx="smooth"', [[0, "none"], [0.15, "0.15 s"], [0.3, "0.3 s (the worked example)"], [0.6, "0.6 s"], [1, "1 s"]], F.smooth), "auto")
        + tk.ck('data-fx="applyF"', "Scale the plasma current by calc_f", F.applyF, "Denton et al. (2020) Prec.calc_f over 4.5 s: brings the plasma current to the curlometer's, on average")
        + tk.ck('data-fx="fade"', "Fade beyond the trusted region", F.fade, "Gray beyond the limit radius; thinner field lines past the trusted radius")
        + `<div class="tk-links">${tk.link("fx-save", "Save the cut as a PNG", "The 2-D cut as drawn, with its time and frame")}${tk.link("fx-move-c", "↔ Instant to the window's center", "Move the instant to the middle of the figure's range")}${W.lmn && W.lmn.frame ? tk.link("fx-move-l", "↔ To the LMN interval's center", "Move the instant to the middle of the applied LMN frame's interval") : ""}${tk.link("fx-reload", "Fetch again", "Fetch the four probes' data again about the instant")}</div>`);
      el.innerHTML = h + `</div>`;
      el.scrollTop = top;
      cv = el.querySelector(".fx-cv"); sv = el.querySelector(".fx-sv");
      wireCanvas();
      draw(); drawStrip();
    }
    function wireCanvas() {
      cv.addEventListener("pointermove", (e) => {
        const M = memo.cut;
        if (!M || !M.px) return;
        const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, P = M.px;
        if (x < P.x0 || x > P.x0 + P.side || y < P.y0 || y > P.y0 + P.side) { if (F.hover) { F.hover = null; draw(); } return; }
        F.hover = [M.cut.center[0] - P.hw + (x - P.x0) / P.side * 2 * P.hw, M.cut.center[1] + P.hw - (y - P.y0) / P.side * 2 * P.hw];
        draw();
      });
      cv.addEventListener("pointerleave", () => { F.hover = null; draw(); });
      const stripAt = (e) => { const r = sv.getBoundingClientRect(); return F.strip ? F.strip.a + Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * (F.strip.b - F.strip.a) : null; };
      sv.addEventListener("pointerdown", (e) => {
        if (!F.strip) return;
        sv.setPointerCapture(e.pointerId);
        const mv = (ev) => { const t = stripAt(ev); if (t != null) setTime(Math.round(t / 0.03) * 0.03, true); };
        mv(e);
        const up = () => { sv.removeEventListener("pointermove", mv); sv.removeEventListener("pointerup", up); };
        sv.addEventListener("pointermove", mv); sv.addEventListener("pointerup", up);
      });
    }
    let loadTimer = null, playTimer = null;
    /** Play: the instant steps through the fetched window, five fits a second, looping (Helios's movie, unrecorded). */
    function play(on) {
      clearInterval(playTimer); playTimer = null; F.playing = !!on;
      if (on) playTimer = setInterval(() => {
        if (!F.on || !F.strip || F.loading) return play(false);
        let t = F.t + F.step;
        if (t > F.strip.b) t = F.strip.a;
        setTime(t, true);
      }, 200);
      if (el) { const b = el.querySelector('[data-fx="play"]'); if (b) { b.textContent = F.playing ? "❚❚" : "⏵"; b.classList.toggle("on", F.playing); } }
    }
    /** Move the instant; refetch when it leaves the fetched window. */
    function setTime(t, quiet) {
      F.t = t;
      const inp = el && el.querySelector('[data-fx="t"]');
      if (inp && document.activeElement !== inp) inp.value = clockMs(t);
      ctx.redraw();
      clearTimeout(loadTimer);
      if (!covers(t)) {                                    // outside the fetched window: fetch once the instant rests
        loadTimer = setTimeout(() => { if (!covers(F.t)) load(F.t); }, 600);
        if (!F.pending) { F.pending = true; render(); }
        return;
      }
      if (F.pending) { F.pending = false; render(); }
      drawStrip();
      scheduleCut();
      if (!quiet) renderReadouts();
    }
    function onClick(e) {
      const b = e.target.closest("button");
      if (!b || b.disabled) return;
      const d = b.dataset;
      if (d.fxPlane) { F.plane = d.fxPlane; F.off = 0; render(); scheduleCut(); return; }
      if (d.fxColor) { F.color = d.fxColor; render(); scheduleCut(); return; }
      if (d.act === "toggle") { const k = d.key; if (W.open.has(k)) W.open.delete(k); else W.open.add(k); render(); return; }
      switch (d.fx || d.act) {
        case "close": play(false); toggle(false); ctx.renderSide(); return;
        case "prev": play(false); setTime(F.t - F.step); return;
        case "next": play(false); setTime(F.t + F.step); return;
        case "play": play(!F.playing); return;
        case "fx-save": save(); return;
        case "center": F.off = 0; render(); scheduleCut(); return;
        case "fx-move-c": setTime((W.app.a + W.app.b) / 2); return;
        case "fx-move-l": setTime((W.lmn.frame.a + W.lmn.frame.b) / 2); return;
        case "fx-reload": load(F.t); return;
      }
    }
    function onChange(e) {
      const x = e.target, d = x.dataset.fx;
      if (d === "t") { play(false); const t = ctx.parseClock(x.value); if (t != null) setTime(t); else x.value = clockMs(F.t); return; }
      if (d === "step") { F.step = +x.value; return; }
      if (d === "frame") F.frame = x.value;
      else if (d === "model") F.model = x.value;
      else if (d === "smooth") { F.smooth = +x.value; memo.f.clear(); memo.h.clear(); }
      else if (d === "applyF") F.applyF = x.checked;
      else if (d === "fade") { F.fade = x.checked; draw(); return; }
      else return;
      render(); scheduleCut();
      if (d !== "frame") buildStrip();
    }

    /** The cut as drawn, with the verdict and the frame stamped under it, as a PNG download. */
    function save() {
      const M = memo.cut, r = memo.sol;
      if (!cv || !M || !r || !r.solution) return;
      const dpr = window.devicePixelRatio || 1, out = document.createElement("canvas"), foot = 34 * dpr;
      out.width = cv.width; out.height = cv.height + foot;
      const g = out.getContext("2d");
      g.fillStyle = "#fff"; g.fillRect(0, 0, out.width, out.height); g.drawImage(cv, 0, 0);
      g.scale(dpr, dpr); g.fillStyle = "#000"; g.font = '10px -apple-system, "Helvetica Neue", Arial, sans-serif';
      const T = r.solution.trust, d = new Date(ctx.T0 + M.t * 1000).toISOString();
      g.fillText(`${d.slice(0, 10)} ${clockMs(M.t)} UT · MMS ${R.MODELS[r.solution.model].name} reconstruction (Denton et al. 2020) · ${VERDICT[T.level][0]}, trusted ${T.core_km.toFixed(0)} km, limit ${T.outer_km.toFixed(0)} km`, 8, cv.height / dpr + 14);
      g.fillText(`Frame: ${M.D.name} · Helios Live`, 8, cv.height / dpr + 27);
      out.toBlob((blob) => { if (!blob) return; const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `formation-${d.slice(0, 19).replace(/[-:]/g, "")}.png`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }, "image/png");
    }

    // ───────────────────────── the window's side: switch, R line ─────────────────────────
    /** The instant a new view opens on (Helios: the first VDF cut, else the pin, else the window's center). */
    function seed() {
      const cuts = W.vdf && W.vdf.on ? W.vdf.cuts : [], m = ctx.moment(), A = W.app;
      if (cuts.length) return cuts[0].t;
      if (m != null && m >= A.a && m <= A.b) return m;
      return (A.a + A.b) / 2;
    }
    function toggle(on) {
      mount();
      if (on && !(ctx.LIVE && isMMS())) return;
      F.on = on;
      if (on) { if (F.t == null || !F.probes) { F.t = seed(); load(F.t); } else { render(); scheduleCut(); } }
      else { el.hidden = true; F.gen++; F.stripGen++; }
      ctx.relayout(); ctx.redraw();
    }
    ctx.side.addEventListener("change", (e) => { if (e.target.dataset.an === "formation") { e.stopPropagation(); toggle(e.target.checked); ctx.renderSide(); } }, true);
    return {
      get on() { return F.on; },
      width: 470,
      /** The sidebar's switch (Analysis ▸ Analysis panels). */
      sideHTML() {
        if (F.on && !isMMS()) toggle(false);
        if (!isMMS()) return "";
        const ok = ctx.LIVE;
        return tk.sw('data-an="formation"', "Formation & topology · beta", F.on, "The four spacecraft and the Denton et al. (2020) polynomial reconstruction at an instant: the L–N cut, X and O points, the trusted radius, the verdict", !ok)
          + (F.on ? tk.note(`The violet R line on the figure is the instant (${clockMs(F.t)}): drag it, or the strip beside the cut.`) : "");
      },
      /** The R line on the figure, as Helios draws the formation instant. */
      mark() { return F.on && F.t != null ? { t: F.t, color: "#7c5ce0", label: "R" } : null; },
      drag(t) { if (F.on) { play(false); setTime(t, true); } },
      update() { if (F.on) { render(); scheduleCut(); } },
    };
  };
})();
