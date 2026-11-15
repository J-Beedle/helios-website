/* Helios Live: the LMN frame workbench beside an MMS data window (Helios's MVABSidePanel, HSOScreen.swift; the design
 * handoff's §4.4, docs/MMS-PANEL-DESIGN-HANDOFF.md) with every method LMNSolver has: MVA-B, ⟨B⟩·N = 0, MVA-E, MFR (the
 * 2007-corrected eq. 26), the Mozer & Retinò joint variance, MVA-vᵢ / vₑ / J, and on MMS the four-spacecraft MDD family
 * and the Denton and Torbert hybrids; frames combined two at a time, and typed axes. The arithmetic is js/lmn.js; this
 * file gathers its inputs from the window's data (and, for the four-probe methods, the other probes' FGM from CDAWeb
 * HAPI and the MEC positions the page already holds) and draws the panel.
 *
 * hso.js makes one per data window: HeliosLMNPanel(ctx) → { render, status }, and hands it the panel element, the
 * window's state (W.lmn) and its helpers (ctx below). The panel owns its element's events.
 */
(function () {
  "use strict";
  const S = window.HeliosLMN;
  if (!S) return;
  const QE = 1.602176634e-4;                       // e · cm⁻³ · km/s → µA/m², per n·v (hso.js QE)
  const FOUR_MAX_S = 120;                          // the four-probe methods fetch three probes' FGM: intervals up to this
  const fgmMemo = new Map();                       // "k|a|b" → the probe's B over [a, b] (s after T0)

  window.HeliosLMNPanel = function (ctx) {
    const { W, el, tk, esc } = ctx;
    const L = W.lmn;
    Object.assign(L, { method: "mvaB", opts: S.defaultOptions(), entry: "calculate", busy: null, hist: {},
                       custom: { l: "", m: "", n: "", name: "" }, cmb: { a: "l", fa: 0, b: "n", fb: 1, rule: "keepFirst" } }, Object.assign({}, L));
    const hms = (t) => ctx.hmsShort(t);
    const isMMS = () => ctx.craft().mission === "mms";
    const history = () => (L.hist[W.n] = L.hist[W.n] || []);
    const fmtSig = (x, k = 3) => (x == null || !isFinite(x) ? "—" : Math.abs(x) >= 1e4 || (Math.abs(x) < 1e-3 && x !== 0) ? x.toExponential(k - 1) : x.toPrecision(k));
    const comp = (x) => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(4);

    // ───────────────────────── frames as the window draws them ─────────────────────────
    /** A solved, combined or typed frame, with what hso.js's figure and sidebar read: the method's name, its normal
     *  ratio (NaN when it has none) and the figure's caption. */
    function decorate(f, extra = {}) {
      const title = f.source ? `Entered · ${f.source}` : S.methodTitle(f), r = S.frameRatio(f);
      return Object.assign(f, {
        method: title, ratio: r == null ? NaN : r, native: f.native !== false,
        label: `LMN (${f.source ? f.source : S.methodTitle(f)}${r != null ? `, ${S.ratioLabel(f)} = ${r.toFixed(1)}` : ""})`,
      }, extra);
    }
    function apply(f, remember = true) {
      decorate(f);
      Object.assign(L, { frame: f, on: true, draft: false, error: null, copied: false });
      if (remember) { const h = history(); h.unshift(f); if (h.length > 12) h.pop(); }
      render(); ctx.applied();
    }

    // ───────────────────────── the inputs, from the window's data ─────────────────────────
    /** A vector quantity of one FPI instrument over [a, b], burst where the window has it, as {t, x, y, z}. */
    function series(ds, name, a, b, fix) {
      const out = [];
      for (const [Sset, i0, i1] of ctx.runs(ds, a, b)) {
        const v = Sset[name], st = Sset.cols[name];
        if (!v) continue;
        for (let i = Math.max(0, i0); i < Math.min(Sset.t.length, i1); i++) {
          const t = Sset.t[i];
          if (t < a || t > b) continue;
          let p = [v[i * st], v[i * st + 1], v[i * st + 2]];
          if (fix) p = fix(Sset, i, p);
          if (p.every(isFinite)) out.push({ t, x: p[0], y: p[1], z: p[2] });
        }
      }
      return out;
    }
    const bSeries = (a, b) => { const r = ctx.bIn(a, b); return { pts: r.pts.map((p, i) => ({ t: r.ts[i], x: p[0], y: p[1], z: p[2] })), native: r.native }; };
    /** The other probes' FGM (burst where it exists, else survey) over [a, b] s after T0 — one HAPI request each,
     *  through the page's queue and cache; the window's own probe from the window. */
    async function probeB(k, a, b) {
      if (k === W.n) return bSeries(a, b).pts;
      const key = `${k}|${a.toFixed(3)}|${b.toFixed(3)}`;
      if (fgmMemo.has(key)) return fgmMemo.get(key);
      const ms = (t) => ctx.T0 + t * 1000, sc = `mms${k}`;
      const p = (async () => {
        let r = await ctx.SRC.hapi(`MMS${k}_FGM_BRST_L2@0`, [`${sc}_fgm_b_gse_brst_l2`], ms(a), ms(b), `MMS${k} burst FGM (LMN)`).catch(() => ({ n: 0 }));
        if (!r.n || r.n < 8) r = await ctx.SRC.hapi(`MMS${k}_FGM_SRVY_L2@0`, [`${sc}_fgm_b_gse_srvy_l2`], ms(a), ms(b), `MMS${k} FGM (LMN)`).catch(() => ({ n: 0 }));
        const out = [];
        for (let i = 0; i < (r.n || 0); i++) { const x = r.cols[0][i], y = r.cols[1][i], z = r.cols[2][i]; if (isFinite(x) && isFinite(y) && isFinite(z)) out.push({ t: r.t[i], x, y, z }); }
        return out;
      })();
      fgmMemo.set(key, p);
      if (fgmMemo.size > 40) fgmMemo.delete(fgmMemo.keys().next().value);
      return p;
    }
    async function positions() {
      const P = await ctx.SRC.positions();
      const out = {};
      for (const k of [1, 2, 3, 4]) out[k] = P[k] ? P[k].r.map((r, i) => ({ t: P[k].t[i], x: r[0], y: r[1], z: r[2] })) : [];
      return out;
    }
    /** What `method` reads over `span` (twice the interval, for the stability check): B, E, vᵢ, vₑ, J — the FPI series
     *  at their accumulation centers, vₑ less the DES spin tone and J re-derived from it, as HSODataClient.lmnSeries
     *  forms them — and for the four-probe methods every probe's B and MEC position. */
    async function gather(method, o, span) { return gatherNeeds(new Set(S.needs(method, o)), o, span); }
    /** The same, for a set of needs (Compare methods: everything its methods read, in one go). */
    async function gatherNeeds(need, o, span) {
      const inp = { label: ctx.craft().name, clock: (t) => hms(t) };
      if (need.has("b")) { const r = bSeries(span.a, span.b); inp.b = r.pts; inp.nativeB = r.native; }
      if (need.has("ions")) inp.vi = S.accumulationCenters(series("dis", "v", span.a, span.b));
      if (need.has("electrons")) {
        const st = (Sset, i, p) => (Sset.vst ? [p[0] - Sset.vst[i * 3], p[1] - Sset.vst[i * 3 + 1], p[2] - Sset.vst[i * 3 + 2]] : p);
        inp.ve = S.accumulationCenters(series("des", "v", span.a, span.b, st));
        if (need.has("ions")) inp.j = S.accumulationCenters(series("des", "j", span.a, span.b, (Sset, i, p) => (Sset.vst ? p.map((x, c) => x + QE * Sset.n[i] * Sset.vst[i * 3 + c]) : p)));
      }
      if (need.has("e")) {
        let E = W.view.sv && W.view.sv.efiN;
        if (!E && ctx.LIVE && isMMS()) { const r = await ctx.SRC.lazy(W.n, "edp"); E = r && r.sets && r.sets.efiN; }
        inp.e = [];
        if (E) for (let i = 0; i < E.t.length; i++) { const t = E.t[i]; if (t < span.a || t > span.b) continue; const x = E.e[i * 3], y = E.e[i * 3 + 1], z = E.e[i * 3 + 2]; if (isFinite(x) && isFinite(y) && isFinite(z)) inp.e.push({ t, x, y, z }); }
      }
      if (need.has("fourB")) {
        const order = [W.n].concat([1, 2, 3, 4].filter(k => k !== W.n));
        const [bs, P] = await Promise.all([Promise.all(order.map(k => probeB(k, span.a, span.b))), positions()]);
        inp.probes = order.map((k, i) => ({ probe: k, b: bs[i], r: P[k] }));
        if (need.has("quietB") && o.quiet) {
          const qb = await Promise.all(order.map(k => probeB(k, o.quiet.a, o.quiet.b)));
          inp.quietProbes = order.map((k, i) => ({ probe: k, b: qb[i], r: [] }));
        }
        if (o.gradientReference) {
          const gr = o.gradientReference, rb = await Promise.all(order.map(k => probeB(k, gr.a, gr.b)));
          inp.probes.forEach((p, i) => { p.b = p.b.concat(rb[i]).sort((x, y) => x.t - y.t); });
        }
      }
      return inp;
    }
    const BUSY = { b: "native-cadence B", e: "the EDP electric field (fast survey, 32 S/s)", ions: "DIS moments", electrons: "DES moments", fourB: "four-probe FGM and MEC", quietB: "the quiet interval's FGM" };
    async function solveAndApply() {
      const r = L.range;
      if (!r || L.busy) return;
      const m = L.method, o = Object.assign({}, L.opts), meta = S.METHODS[m];
      if (meta.four && r[1] - r[0] > FOUR_MAX_S) {
        L.error = `The four-spacecraft methods fetch the other three probes' FGM from CDAWeb: pick an interval of ${FOUR_MAX_S} s or less (this one is ${ctx.durText(r[1] - r[0])}).`;
        return render();
      }
      if (m === "mddOffset" && !o.quiet) { L.error = "Set a quiet interval — minutes where the four probes should read the same B."; return render(); }
      // A method picked from Compare methods applies as it solved there, while method, interval and options match.
      const R = L.reuse;
      if (R && R.method === m && R.a === r[0] && R.b === r[1] && JSON.stringify(R.opts) === JSON.stringify(o)) { L.reuse = null; apply(R.frame); return; }
      const iv = { a: r[0], b: r[1] }, d = r[1] - r[0], span = { a: r[0] - d / 2, b: r[1] + d / 2 }, craft = W.n;
      L.busy = `Fetching ${S.needs(m, o).map(k => BUSY[k]).join(", ")}…`;
      L.error = null; render();
      let out;
      try {
        const inp = await gather(m, o, span);
        out = S.solve(m, inp, iv, o, true);
        if (out.frame && m === "mvaB" && !inp.nativeB) out.frame.native = false;
      } catch (e) { out = { error: `The data could not be fetched: ${e.message || e}` }; }
      L.busy = null;
      if (W.n !== craft) return render();                  // the window changed craft while this was fetched
      if (out.error) { L.error = out.error; render(); ctx.renderSide(); return; }
      apply(out.frame);
    }

    // ───────────────────────── Compare methods (Helios's LMNComparison, MVABSidePanel.comparisonBlock) ─────────────────────────
    /** The one-spacecraft methods over the calculation interval with the draft's options, each on its own — results only,
     *  no ranking and no recommended method (Helios's design decision, 2026-10-18). The four-spacecraft methods are not
     *  run with them: the other three probes' FGM is the slow part, so the formation's TQF is shown first and they are
     *  added on request (Helios, 2026-10-19). An answer for an earlier request is dropped. */
    const singleHere = () => (isMMS() ? S.SINGLE.slice() : ["mvaB", "mvaBC"]);
    const fourHere = () => ctx.LIVE && isMMS();
    let cmpTicket = 0;
    const tick = () => new Promise(res => setTimeout(res, 0));
    async function runCompare(thenAdd = []) {
      const r = L.range;
      if (!r) return;
      const o = JSON.parse(JSON.stringify(L.opts)), methods = singleHere(), ticket = ++cmpTicket;
      const iv = { a: r[0], b: r[1] }, d = r[1] - r[0], span = { a: r[0] - d / 2, b: r[1] + d / 2 }, craft = W.n;
      const need = new Set(methods.flatMap(m => S.needs(m, o)));
      L.cmp = { a: r[0], b: r[1], opts: o, methods, cands: [], running: `Solving ${methods.length} methods — fetching ${[...need].map(k => BUSY[k]).join(", ")}…`,
                native: true, adding: null, formation: null, inp: null };
      L.comparing = true; L.cmpChoice = null; render();
      if (fourHere()) formationAt((r[0] + r[1]) / 2, ticket);
      let inp;
      try { inp = await gatherNeeds(need, o, span); } catch (e) { inp = null; L.cmp.running = null; L.cmp.error = `The data could not be fetched: ${e.message || e}`; }
      if (ticket !== cmpTicket || W.n !== craft || !inp) return render();
      L.cmp.native = inp.nativeB !== false; L.cmp.inp = inp; L.cmp.need = need;
      for (const m of methods) {
        await tick();
        if (ticket !== cmpTicket) return;
        const out = S.solve(m, inp, iv, o, true);
        if (out.frame && m === "mvaB" && !inp.nativeB) out.frame.native = false;
        L.cmp.cands.push({ method: m, frame: out.frame || null, error: out.error || null });
      }
      L.cmp.running = null; render();
      if (thenAdd.length) addFour(thenAdd);
    }
    /** The formation the four-probe methods would read, at the interval's center: TQF and mean separation (MEC). */
    async function formationAt(t, ticket) {
      try {
        const P = await positions(), at = (pts) => { let best = null; for (const p of pts) if (!best || Math.abs(p.t - t) < Math.abs(best.t - t)) best = p; return best && Math.abs(best.t - t) < 120 ? [best.x, best.y, best.z] : null; };
        const r = [1, 2, 3, 4].map(k => at(P[k] || []));
        if (ticket !== cmpTicket || !L.cmp) return;
        if (r.some(x => !x)) { L.cmp.formation = { t, tqf: null }; return render(); }
        const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
        const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], nrm = (a) => Math.sqrt(dot(a, a));
        let e = 0, n = 0;
        for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) { e += nrm(sub(r[i], r[j])); n++; }
        e /= n;
        const v = Math.abs(dot(sub(r[1], r[0]), cross(sub(r[2], r[0]), sub(r[3], r[0])))) / 6;
        L.cmp.formation = { t, tqf: e > 0 ? Math.min(1, v / (e ** 3 / (6 * Math.SQRT2))) : 0, sep: e };
      } catch (_) { if (L.cmp) L.cmp.formation = { t, tqf: null }; }
      render();
    }
    /** Four-spacecraft methods added to the comparison showing, over ITS interval and options: only what its inputs
     *  lack is fetched (all four probes' FGM and positions, the quiet interval's B), then they join the results. */
    async function addFour(chosen) {
      const c = L.cmp;
      if (!c || c.running || c.adding || !c.inp) return;
      const methods = S.FOUR.filter(m => chosen.includes(m) && !c.cands.some(x => x.method === m));
      if (!methods.length) return;
      if (c.b - c.a > FOUR_MAX_S) { c.addError = `The four-spacecraft methods take intervals of ${FOUR_MAX_S} s or less (this one is ${ctx.durText(c.b - c.a)}).`; return render(); }
      const ticket = cmpTicket, iv = { a: c.a, b: c.b }, d = c.b - c.a, span = { a: c.a - d / 2, b: c.b + d / 2 }, o = c.opts;
      const need = new Set(methods.flatMap(m => S.needs(m, o)).filter(k => !c.need.has(k)));
      c.adding = methods; c.addError = null;
      c.addLabel = need.size ? `fetching ${[...need].map(k => BUSY[k]).join(", ")}` : "";
      render();
      try {
        if (need.size) { const more = await gatherNeeds(need, o, span); Object.assign(c.inp, more, { label: c.inp.label, clock: c.inp.clock }); need.forEach(k => c.need.add(k)); }
      } catch (e) { c.adding = null; c.addError = `The data could not be fetched: ${e.message || e}`; return render(); }
      for (const m of methods) {
        await tick();
        if (ticket !== cmpTicket || L.cmp !== c) return;
        if (m === "mddOffset" && !o.quiet) { c.cands.push({ method: m, frame: null, error: "Needs a quiet interval — set one under MDD-(B − ⟨ΔB⟩₀) in the setup." }); continue; }
        const out = S.solve(m, c.inp, iv, o, true);
        c.cands.push({ method: m, frame: out.frame || null, error: out.error || null });
      }
      c.adding = null; L.cmpFour = new Set(); render();
    }
    /** Helios's MVABSidePanel.cautions: what to read a result against. */
    function cautions(f, native) {
      const d = f.diagnostics || {}, r = S.frameRatio(f), out = [];
      if (r != null && r < 10) out.push("normal poorly determined");
      if (d.tangentRatio != null && d.tangentRatio < 3) out.push("L and M mix");
      if (d.stability_deg && d.stability_deg[2] > 5) out.push(`N moves ${d.stability_deg[2].toFixed(1)}° over 0.5–2×`);
      if (f.native === false || (!native && ["mvaB", "mvaBC", "mvaE", "mfr", "mvaEB"].includes(d.method))) out.push("from the displayed B");
      return out;
    }
    function compareHTML() {
      const c = L.cmp, stale = !L.range || c.a !== L.range[0] || c.b !== L.range[1] || JSON.stringify(c.opts) !== JSON.stringify(L.opts);
      let h = `<div class="tk-col"><div class="tk-row"><b class="tk-h2">Compare methods</b>${tk.link("lx-cmp-back", "‹ Back to setup", "Return to the method and interval; the results stay until the interval or options change")}</div>`
        + tk.note(`${c.methods.length} methods, each over ${ctx.DAY} · ${hms(c.a)}–${hms(c.b)} UTC with the same options. Results only: no method is ranked or recommended — read each against what it assumes.`)
        + (stale ? tk.note("The interval or options have changed since these ran.", true) + tk.link("lx-cmp-again", "↻ Run again", "Solve the same methods again over the calculation interval with the current options") : "")
        + `</div>`;
      if (c.error) return h + `<p class="tk-err">⚠ ${esc(c.error)}</p>`;
      if (c.running) return h + `<div class="tk-col"><p class="tk-note lx-busy"><i class="lx-spin"></i>${esc(c.running)}</p>${tk.link("lx-cmp-cancel", "Cancel", "Stop the comparison")}</div>`;
      const chosen = L.cmpChoice || L.method, sel = c.cands.find(x => x.method === chosen && x.frame);
      const card = (x) => {
        const f = x.frame, on = sel && sel.method === x.method, title = S.METHODS[x.method].title;
        if (!f) return `<div class="lx-cand off"><b>${esc(title)}</b><p class="tk-sup">${esc(x.error || "No result.")}</p></div>`;
        const d = f.diagnostics || {}, r = S.frameRatio(f), cs = cautions(f, c.native);
        const rows = [];
        if (r != null) rows.push(["Ratios", `${S.ratioLabel(f)} ${r.toFixed(1)}${d.tangentRatio != null ? ` · ${d.tangentRatioLabel} ${d.tangentRatio.toFixed(1)}` : ""}`]);
        if (d.stability_deg) rows.push(["Stability", ["L", "M", "N"].map((k, i) => `${k} ±${d.stability_deg[i].toFixed(1)}°`).join(" ")]);
        rows.push(["N (GSE)", f.n.map(comp).join(" ")]);
        if (d.samples) rows.push(["Samples", `${d.samples}`]);
        return `<button class="lx-cand${on ? " on" : ""}" data-act="lx-cmp-pick" data-m="${x.method}" title="Select ${esc(title)}"><span class="lx-radio">${on ? "◉" : "○"}</span><span><b>${esc(title)}</b>`
          + `<span class="lx-cgrid">${rows.map(([k, v]) => `<span class="tk-l2">${k}</span><span class="mono">${esc(v)}</span>`).join("")}</span>`
          + (sel && !on && sel.frame ? `<em class="tk-sup">N is ${S.math.lineAngle(f.n, sel.frame.n).toFixed(1)}° from ${esc(S.METHODS[sel.method].title)}'s</em>` : "")
          + `<em class="${cs.length ? "gold" : "tk-sup"}">${cs.length ? esc(cs.join(" · ")) : "No cautions"}</em></span></button>`;
      };
      const single = c.cands.filter(x => !S.METHODS[x.method].four), four = S.FOUR.map(m => c.cands.find(x => x.method === m)).filter(Boolean);
      h += `<div class="tk-col">${fourHere() ? `<p class="tk-l2">One spacecraft</p>` : ""}${single.map(card).join("")}`;
      if (fourHere()) {
        h += `<p class="tk-l2 lx-four">Four spacecraft</p>`;
        const F = c.formation;
        if (!F) h += `<p class="tk-sup">Reading the formation's TQF…</p>`;
        else if (F.tqf == null) h += tk.note("No positions for all four probes at this time: TQF unknown.", true);
        else {
          h += `<p class="tk-sup${F.tqf < 0.7 ? " gold" : ""}" title="Tetrahedron quality factor at the interval's center from the four MEC positions: the volume over a regular tetrahedron's with the mean separation as edge (Fuselier et al. 2016). Four-probe gradients want 0.7 or more.">TQF ${F.tqf.toFixed(2)} · mean separation ${F.sep.toFixed(0)} km at ${hms(F.t)}</p>`;
          if (F.tqf < 0.5) h += tk.note("Too flat or elongated a formation for four-probe gradients: these methods' results are unreliable here.", true);
          else if (F.tqf < 0.7) h += tk.note("A flattened or elongated formation: the four-probe gradient these methods read is poorly resolved across its short dimension.", true);
        }
        h += four.map(card).join("");
        const left = S.FOUR.filter(m => !c.cands.some(x => x.method === m));
        if (c.adding) h += `<p class="tk-note lx-busy"><i class="lx-spin"></i>Solving ${c.adding.map(m => S.METHODS[m].title).join(", ")}${c.addLabel ? ` — ${esc(c.addLabel)}` : ""}…</p>`;
        else if (left.length) {
          const T = L.cmpFour || (L.cmpFour = new Set());
          h += left.map(m => tk.ck(`data-lx="cmp4" value="${m}"`, S.METHODS[m].title, T.has(m), S.METHODS[m].summary)).join("")
            + tk.link("lx-cmp-add", T.size ? `Add ${T.size} to the comparison` : "Add to the comparison", "Solve the ticked methods over this comparison's interval and options; the results above stay", !T.size);
        }
        if (c.addError) h += `<p class="tk-err">⚠ ${esc(c.addError)}</p>`;
      }
      h += `</div><div class="tk-col"><button class="tk-primary" data-act="lx-cmp-use"${sel ? "" : " disabled"}>Use selected method</button>`
        + tk.note(sel ? `Loads ${esc(S.METHODS[sel.method].title)} into the draft${stale ? " with the interval and options it ran with" : ""}. Apply LMN then applies this result — the figure changes only then.` : "Pick a method that solved to load it into the draft.")
        + `</div>`;
      return h;
    }

    // ───────────────────────── the panel ─────────────────────────
    const methodOptions = (m) => {
      const o = L.opts, mms = isMMS(), four = ctx.LIVE && mms;
      const single = S.SINGLE.map(k => [k, S.METHODS[k].title, !mms && !["mvaB", "mvaBC"].includes(k)]);
      return `<select data-lx="method" title="How Apply LMN solves the axes"><optgroup label="One spacecraft">${single.map(([k, t, off]) => `<option value="${k}"${k === m ? " selected" : ""}${off ? " disabled" : ""}>${t}</option>`).join("")}</optgroup>`
        + `<optgroup label="Four spacecraft${four ? "" : " · MMS, live"}">${S.FOUR.map(k => `<option value="${k}"${k === m ? " selected" : ""}${four ? "" : " disabled"}>${S.METHODS[k].title}</option>`).join("")}</optgroup></select>`;
    };
    function timePair(key, iv, help) {
      return `<div class="tk-times"><label><span class="tk-l2">From</span><input class="tk-time" data-lx="${key}a" value="${iv ? ctx.clock(iv.a, true) : ""}" placeholder="HH:mm:ss" spellcheck="false" title="${esc(help)} — UTC, HH:mm:ss or HH:mm:ss.sss; Return applies"></label>`
        + `<label><span class="tk-l2">To</span><input class="tk-time" data-lx="${key}b" value="${iv ? ctx.clock(iv.b, true) : ""}" placeholder="HH:mm:ss" spellcheck="false" title="${esc(help)} — UTC; Return applies"></label></div>`;
    }
    function optionsHTML(m) {
      const o = L.opts;
      let h = "";
      if (["mvaE", "mfr", "mvaEB"].includes(m)) {
        h += `<p class="tk-l2">E from</p>` + tk.seg("data-lx-ef", Object.entries(S.E_FIELD).map(([k, t]) => [k, t]), o.eField);
        if (o.eField === "measured") h += tk.note("EDP's fast-survey field (32 S/s; burst E is in the app), averaged with B onto the sparser of the two.");
        if (m !== "mfr") {
          h += tk.opt("Frame u along N", `<input class="tk-num" data-lx="u" type="number" step="1" value="${o.frameSpeed}"><span class="tk-unit">km/s</span>`);
          const f = L.frame, uN = f && f.diagnostics && f.diagnostics.method === "mfr" ? f.diagnostics.uN : null;
          if (uN != null) h += tk.link("lx-useun", `Use MFR's u_N (${uN >= 0 ? "+" : "−"}${Math.abs(uN).toFixed(1)} km/s)`, "The applied MFR frame's layer speed as this frame's u");
        }
      }
      if (S.METHODS[m].four) {
        h += tk.opt("Smooth B", `<input class="tk-num" data-lx="smooth" type="number" min="0" step="0.05" value="${o.smooth}"><span class="tk-unit">s boxcar · 0 = native</span>`);
        if (m === "mdd") h += tk.ck('data-lx="avgG"', "Average ∇B before forming ∇B(∇B)ᵀ", o.averageGradient, "Denton et al. (2024)'s second way: the mean gradient, then its matrix");
      }
      if (m === "mddOffset") {
        h += `<p class="tk-l2">Quiet interval <span class="tk-sup">· where the four probes should read the same B</span></p>` + timePair("q", o.quiet, "The quiet interval")
          + `<div class="tk-links">${tk.link("lx-q-sel", "Use the calculation interval", "Take the quiet interval from the handles")}${o.quiet ? tk.link("lx-q-clear", "Clear", "No quiet interval") : ""}</div>`;
      }
      if (m === "mddPerturbed") {
        h += `<p class="tk-l2">⟨∇B⟩₀ over <span class="tk-sup">· empty = the calculation interval</span></p>` + timePair("g", o.gradientReference, "Where the mean gradient is taken")
          + (o.gradientReference ? `<div class="tk-links">${tk.link("lx-g-clear", "Clear", "Use the calculation interval")}</div>` : "");
      }
      if (m === "hybridTorbert") {
        h += `<p class="tk-l2">J from</p>` + tk.seg("data-lx-jfrom", [["fpi", "FPI"], ["curl", "Curlometer"]], o.currentFromCurlometer ? "curl" : "fpi")
          + `<p class="tk-l2">M along</p>` + tk.seg("data-lx-mal", [["peak", "Peak J"], ["mean", "Mean J"]], o.currentPeak ? "peak" : "mean");
      }
      return h;
    }
    function readsNote(m) {
      const o = L.opts, need = S.needs(m, o), words = [];
      if (need.includes("b")) words.push("B (FGM, burst where loaded)");
      if (need.includes("e")) words.push("E (EDP fast survey)");
      if (need.includes("ions")) words.push("vᵢ (DIS)");
      if (need.includes("electrons")) words.push(need.includes("ions") ? "vₑ and J = nₑe(vᵢ − vₑ) (DES, spin tone removed)" : "vₑ (DES, spin tone removed)");
      if (need.includes("fourB")) words.push("all four probes' FGM (burst where it exists) and MEC positions — the other three fetched from CDAWeb");
      return `Reads ${words.join("; ")}. FPI at accumulation centers.`;
    }
    function entryHTML() {
      const r = L.range, mp = W.bands.find(b => b.kind === "mpBL"), m = L.method, meta = S.METHODS[m];
      let h = tk.seg("data-lx-entry", [["calculate", "Calculate"], ["saved", "Earlier frames", history().length ? null : "Frames applied in this window show up here"], ["manual", "Enter axes"]], L.entry);
      if (L.entry === "saved") return h + savedHTML();
      if (L.entry === "manual") return h + customHTML();
      if (L.comparing && L.cmp) return h + compareHTML();
      h += `<div class="tk-col"><p class="tk-l2">Method</p>${methodOptions(m)}<p class="tk-note">${meta.summary}</p><p class="tk-cite">${meta.citation}</p>${optionsHTML(m)}</div>`;
      h += `<div class="tk-col"><div class="tk-row"><b class="tk-h2">Calculation interval</b>${r ? `<span class="tk-sup">${ctx.DAY} · UTC</span>` : ""}</div>`;
      if (r) h += `<div class="tk-times"><label><span class="tk-l2">Start</span><input class="tk-time" data-lmn="start" value="${ctx.clock(r[0], true)}" spellcheck="false" title="UTC — HH:mm:ss, or HH:mm:ss.sss. Press Return to apply."></label>`
        + `<label><span class="tk-l2">End</span><input class="tk-time" data-lmn="end" value="${ctx.clock(r[1], true)}" spellcheck="false" title="UTC — HH:mm:ss, or HH:mm:ss.sss. Press Return to apply."></label></div>`
        + `<p class="tk-sup tk-dur">${ctx.durText(r[1] - r[0])} selected</p>`
        + (mp && !(Math.abs(mp.a - r[0]) < 1e-3 && Math.abs(mp.b - r[1]) < 1e-3) ? tk.link("lx-painted", "↔ Use the painted magnetopause", "Set the interval to the Magnetopause BL region painted on the figure") : "")
        + (meta.four && r[1] - r[0] > FOUR_MAX_S ? tk.link("lx-short", "Use 4 s about its center", `The four-probe methods take intervals of ${FOUR_MAX_S} s or less`) : "");
      else h += tk.link("lx-place", "⊕ Place the interval on the figure", "Put the black handles on the figure");
      const rows = S.inputPanels(m, L.opts).map(k => ({ b: "B", e: "E", vi: "Vᵢ", ve: "Vₑ", jfpi: "J", jcurl: "B" }[k])).filter((x, i, a) => a.indexOf(x) === i);
      h += tk.ck('data-lmn="mark"', `Mark interval on ${rows.join(" and ")}`, L.mark, "Show the calculation interval's handles on what the method reads — and the applied interval after")
        + tk.note(readsNote(m)) + `</div>`;
      h += `<div class="tk-col"><button class="tk-primary" data-act="lx-apply"${r && !L.busy ? "" : " disabled"} title="${r ? `Solve ${meta.title} over the calculation interval and apply it` : "Place the calculation interval first"}">${L.busy ? "Solving…" : "Apply LMN"}</button>`
        + (L.busy ? `<p class="tk-note lx-busy"><i class="lx-spin"></i>${esc(L.busy)}</p>` : "")
        + (L.error ? `<p class="tk-err">⚠ ${esc(L.error)}</p>` : "")
        + tk.note(L.frame ? "Apply replaces the active frame once the calculation succeeds." : "The figure stays in GSE until the calculation succeeds.")
        + (r && !L.busy ? tk.link("lx-compare", L.cmp ? "▤ Compare methods for this interval… (results kept)" : "▤ Compare methods for this interval…",
            fourHere() ? "Solve the one-spacecraft methods over the calculation interval with these options and show the results side by side; the four-spacecraft methods can then be added. No method is recommended"
                       : "Solve every method over the calculation interval with these options and show the results side by side — no method is recommended") : "")
        + `</div>`;
      h += tk.dis("lmnhelp", "Method & interval help", W.open.has("lmnhelp"),
        tk.note(meta.summary) + tk.note(meta.citation)
        + tk.note("Drag the black handles — on what this method reads — or type the times. Apply LMN solves the frame over that interval and rotates the figure into it; the stability check re-solves over 0.5–2× the interval.")
        + tk.note("Signs follow N_x ≥ 0, L_z ≥ 0 — natural on the dayside, arbitrary in the tail. Flip L or Flip N after applying to match a paper."));
      return h;
    }
    /** Earlier frames, and Combine two frames (Helios's combineBlock). */
    function savedHTML() {
      const H = history();
      if (!H.length) return tk.note("Frames applied in this window are kept here while the page is open — apply one again, or combine two.");
      const name = (f) => `${f.source || S.methodTitle(f)} · ${hms(f.a)}–${hms(f.b)}`;
      let h = `<div class="tk-col">` + H.map((f, i) => {
        const on = L.frame === f, r = S.frameRatio(f), vs = L.frame && !on ? ` · vs applied: L ${S.math.lineAngle(f.l, L.frame.l).toFixed(1)}°, N ${S.math.lineAngle(f.n, L.frame.n).toFixed(1)}°` : "";
        return `<div class="lx-saved${on ? " on" : ""}"><span><b class="mono">${hms(f.a)}–${hms(f.b)}</b><em>${esc(f.source || S.methodTitle(f))}${r != null ? ` · ${S.ratioLabel(f)} ${r.toFixed(1)}` : ""}${vs}</em></span>${on ? `<b class="lx-tag">APPLIED</b>` : tk.link("lx-reapply", "Apply", "Apply this frame again").replace("<button", `<button data-i="${i}"`)}</div>`;
      }).join("") + `</div>`;
      if (H.length >= 2) {
        const C = L.cmb, opt = (sel) => H.map((f, i) => `<option value="${i}"${i === sel ? " selected" : ""}>${esc(name(f))}</option>`).join("");
        const axis = (attr, v) => tk.seg(attr, [["l", "L"], ["m", "M"], ["n", "N"]], v);
        h += `<div class="tk-card"><b class="tk-h2">Combine two frames</b>`
          + tk.note("Take one axis from each frame and make them perpendicular; the third axis completes L × M = N. Genestreti et al. (2018) row 14, for instance, is MVA-vₑ's L with MDD's N.")
          + `<div class="lx-cmb"><span class="tk-l2">First</span>${axis("data-lx-ca", C.a)}<select data-lx="cfa">${opt(Math.min(C.fa, H.length - 1))}</select></div>`
          + `<div class="lx-cmb"><span class="tk-l2">Second</span>${axis("data-lx-cb", C.b)}<select data-lx="cfb">${opt(Math.min(C.fb, H.length - 1))}</select></div>`
          + tk.opt("Rule", tk.sel('data-lx="crule"', [["keepFirst", "Keep the first exactly"], ["keepSecond", "Keep the second exactly"], ["weighted", "Weight by eigenvalue ratios"]], C.rule), "auto")
          + (L.cmbError ? `<p class="tk-err">⚠ ${esc(L.cmbError)}</p>` : "")
          + tk.link("lx-combine", "⤳ Combine and apply", "Make the two axes perpendicular and apply the frame") + `</div>`;
      }
      return h;
    }
    const parseVec = (s) => { const v = String(s || "").replace(/[()[\]]/g, " ").split(/[\s,;]+/).filter(Boolean).map(Number); return v.length === 3 && v.every(isFinite) ? v : null; };
    function customHTML() {
      const C = L.custom, row = (k) => {
        const v = C[k].trim(), p = parseVec(v), bad = v && !p;
        return `<label class="lx-axis"><b class="gold mono">${k.toUpperCase()}</b><input class="tk-time" data-lx="c${k}" value="${esc(C[k])}" placeholder="x y z (GSE)" spellcheck="false"><i class="${bad ? "gold" : p ? "ok" : ""}" title="${bad ? "Three numbers, e.g. 0.987 −0.131 −0.091" : p ? "Parsed" : "Optional"}">${bad ? "!" : p ? "✓" : "○"}</i></label>`;
      };
      const l = parseVec(C.l), m = parseVec(C.m), n = parseVec(C.n), skew = S.orthogonalityError(l, m, n);
      let h = `<div class="tk-col">${tk.note("Someone else's frame: any of the three axes in GSE. N is kept exactly; L is squared up to it and M = N × L. Typed axes carry no eigenvalues.")}`
        + ["l", "m", "n"].map(row).join("")
        + `<input class="tk-time" data-lx="cname" value="${esc(C.name)}" placeholder="Name (e.g. Jim's normal)" spellcheck="false">`
        + (skew != null && skew > 0.05 ? tk.note(`The axes are ${skew.toFixed(2)}° from perpendicular; they will be squared up (N kept).`, skew > 2) : "")
        + (L.customError ? `<p class="tk-err">⚠ ${esc(L.customError)}</p>` : "")
        + `<div class="tk-links">${tk.link("lx-custom", "Apply", "Apply the typed axes", !(l || m || n))}${tk.link("lx-cclear", "Clear", "Empty the fields")}${L.frame ? tk.link("lx-cfill", "Fill from the applied frame", "Copy the applied frame's axes into the fields") : ""}</div></div>`;
      return h;
    }
    /** The applied frame (Helios's resultBlock and quality rows). */
    function appliedHTML(f) {
      const d = f.diagnostics, r = S.frameRatio(f), good = r != null && r >= 10, lam = !f.source && d && f.lambda && f.lambda.some(x => x !== 0);
      let h = `<div class="tk-col"><div class="tk-row"><span class="tk-l2">Active frame</span><b class="${L.on ? "gold" : "tk-sup"}">${L.on ? "In use on the figure" : "Kept · figure in GSE"}</b></div>`
        + `<p class="tk-big">${f.source ? `<span class="gold">${esc(f.source)}</span>` : esc(S.methodTitle(f))}</p>${f.source ? `<p class="tk-sup">Entered axes</p>` : ""}<p class="tk-sup">${ctx.DAY} · UTC</p><p class="tk-val">${hms(f.a)}–${hms(f.b)} · ${ctx.durText(f.b - f.a)}</p>`
        + tk.ck('data-lmn="mark"', "Show the interval on the figure", L.mark, "The dashed edges of the interval this frame was calculated over. Off hides them; the frame stays applied.") + `</div>`;
      h += `<div class="tk-col"><b class="tk-h2">Axes in GSE</b><table class="tk-axes"><tr><th>Axis</th><th>x</th><th>y</th><th>z</th>${lam ? "<th>λ</th>" : ""}</tr>`
        + [["L", f.l, 0], ["M", f.m, 1], ["N", f.n, 2]].map(([ax, v, i]) => `<tr><td class="gold">${ax}</td>${v.map(x => `<td>${comp(x)}</td>`).join("")}${lam ? `<td class="lx-lam">${fmtSig(f.lambda[i])}</td>` : ""}</tr>`).join("")
        + `</table>${lam ? `<p class="tk-sup">λ in ${esc(d.unit || "nT²")}</p>` : ""}</div>`;
      const q = [];
      if (r != null) q.push(`<p class="lx-q"><b class="mono ${good ? "lx-good" : "gold"}">${S.ratioLabel(f)} ${r.toFixed(1)}</b> ${good ? "normal well determined" : "normal poorly determined"}</p>`);
      else if (!f.source) q.push(`<p class="lx-q">No eigenvalue ratio for N — it did not come from a solved frame.</p>`);
      else q.push(`<p class="lx-q">Entered axes — no eigenvalues; the frame is as typed, squared up with N kept.</p>`);
      if (d && d.tangentRatio != null) q.push(`<p class="lx-q${d.tangentRatio < 3 ? " gold" : ""}">${d.tangentRatioLabel} ${d.tangentRatio.toFixed(1)} — L and M ${d.tangentRatio >= 3 ? "separated" : "mix"}</p>`);
      if (d && d.normalCone_deg) q.push(`<p class="lx-q">N ±${d.normalCone_deg[0].toFixed(2)}° toward L, ±${d.normalCone_deg[1].toFixed(2)}° toward M <span class="tk-sup">(noise only)</span></p>`);
      if (d && d.uN != null) q.push(`<p class="lx-q lx-strong">u_N = ${d.uN >= 0 ? "+" : "−"}${Math.abs(d.uN).toFixed(1)}${d.uNError != null ? ` ± ${d.uNError.toFixed(1)}` : ""} km/s along N</p>`);
      if (d && d.stability_deg) q.push(`<p class="lx-q${d.stability_deg[2] > 5 ? " gold" : ""}" title="Mean angle from the average direction over seven intervals 0.5–2× this one, same center (Denton et al. 2018, Table 3)">Over 0.5–2× the interval: L ±${d.stability_deg[0].toFixed(1)}°, M ±${d.stability_deg[1].toFixed(1)}°, N ±${d.stability_deg[2].toFixed(1)}°</p>`);
      if (d && d.spread_deg != null) q.push(`<p class="lx-q">The instantaneous maximum-gradient direction lies ${d.spread_deg.toFixed(1)}° from N on average</p>`);
      if (d && d.calibrationFloor) {
        const fl = d.calibrationFloor, ev = d.eigenvalues.map(x => x / fl), low = ev[1] < 10;
        q.push(`<p class="lx-q${low ? " gold" : ""}">λ = ${ev.map(x => fmtSig(x, 3)).join(", ")} λ₀ — ${low ? "λ₂ under 10 λ₀, so L and M are limited by FGM calibration" : "every eigenvalue well above the calibration floor"}</p>`);
      }
      if (f.native === false) q.push(`<p class="lx-q gold">From the displayed B — native FGM was unavailable</p>`);
      h += `<div class="tk-col">${q.join("")}${d && d.notes && d.notes.length ? `<div class="lx-notes">${d.notes.map(n => `<p>· ${esc(n)}</p>`).join("")}</div>` : ""}</div>`;
      h += `<div class="tk-col">${f.source || (d && d.method === "combined") ? "" : `<button class="tk-btn" data-act="lx-adjust" title="Open a draft below — the figure keeps this frame until the new one applies">Adjust method or interval…</button>`}`
        + `<div class="tk-links">${tk.link("lx-copy", L.copied ? "✓ Copied" : "Copy axes", "Copy L/M/N in GSE")}${tk.link("lx-flipL", "⇆ Flip L", "Reverse L (and M), keeping the frame right-handed")}${tk.link("lx-flipN", "⇅ Flip N", "Reverse N (and M), keeping the frame right-handed")}</div>`
        + (f.source ? "" : tk.note("Signs follow N_x ≥ 0, L_z ≥ 0 — natural on the dayside, arbitrary in the tail.")) + `</div>`;
      return h;
    }
    function render() {
      if (!L.panel) return;
      const f = L.frame, top = el.scrollTop;
      let h = `<div class="tk-ph"><b>LMN frame · ${esc(ctx.craft().name)}</b>`
        + (f ? `<button class="tk-pill${L.on ? " on" : ""}" data-act="lx-onoff" title="${L.on ? "The figure is drawn in this LMN frame — click to draw it in GSE, keeping the frame" : "The frame is kept but the figure is in GSE — click to draw it in LMN"}">${L.on ? "LMN ON" : "LMN OFF"}</button>` : "")
        + `<button class="tk-x" data-act="lx-close" aria-label="Close the LMN frame panel" title="Close the LMN frame panel — an applied frame stays on the figure">×</button></div><div class="tk-pb">`
        + `<div class="tk-row tk-coord"><span class="tk-l2">Figure coordinates</span><b class="mono">${f && L.on ? "LMN" : "GSE"}</b></div>`;
      if (f) {
        h += appliedHTML(f);
        if (L.draft) h += `<p class="tk-note">Draft below · the figure still uses the active frame.</p><div class="tk-card"><div class="tk-row"><b class="tk-h2">Draft</b><span class="tk-sup">· not applied</span>${tk.link("lx-cancel", "Cancel", "Close the draft; the active frame is unchanged")}</div>${entryHTML()}</div>`;
        else h += `<div class="tk-col">${tk.link("lx-new", "＋ New frame, earlier frames or typed axes…", "Open the method picker, the frames applied earlier here, and typed axes")}</div>`;
      } else h += `<div class="tk-col"><p class="tk-title">Create LMN frame</p>${tk.note("No frame applied. Calculate one with any method, use an earlier one, or enter your axes.")}</div>` + entryHTML();
      el.innerHTML = h + `</div>`;
      el.scrollTop = top;
    }
    /** The sidebar's one-line state of the applied frame. */
    function status() {
      const f = L.frame, r = S.frameRatio(f);
      return `${f.source ? `Entered · ${f.source}` : S.methodTitle(f)}${r != null ? (r >= 10 ? " · normal well determined" : " · normal poorly determined") : ""}${f.native === false ? " · from the displayed B" : ""}${L.on ? " · in use on the figure" : " · kept, figure in GSE"}`;
    }

    // ───────────────────────── events: the panel owns them (captured before hso.js's own) ─────────────────────────
    const parseRange = (pa, pb) => { const a = ctx.parseClock(pa), b = ctx.parseClock(pb); return a != null && b != null && b > a ? { a, b } : null; };
    function act(name, b) {
      const f = L.frame;
      switch (name) {
        case "toggle": { const k = b.dataset.key; if (W.open.has(k)) W.open.delete(k); else W.open.add(k); render(); return; }
        case "lx-close": L.panel = false; L.draft = false; ctx.renderSide(); ctx.relayout(); return;
        case "lx-onoff": L.on = !L.on; render(); ctx.applied(); return;
        case "lx-apply": solveAndApply(); return;
        case "lx-compare": {
          const c = L.cmp, same = c && L.range && c.a === L.range[0] && c.b === L.range[1] && JSON.stringify(c.opts) === JSON.stringify(L.opts);
          if (same) { L.comparing = true; render(); } else runCompare();
          return;
        }
        case "lx-cmp-back": L.comparing = false; render(); return;
        case "lx-cmp-again": runCompare(L.cmp ? L.cmp.cands.filter(x => S.METHODS[x.method].four).map(x => x.method) : []); return;
        case "lx-cmp-cancel": cmpTicket++; L.cmp = null; L.comparing = false; render(); return;
        case "lx-cmp-pick": L.cmpChoice = b.dataset.m; render(); return;
        case "lx-cmp-add": addFour([...(L.cmpFour || [])]); return;
        case "lx-cmp-use": {
          const c = L.cmp, x = c && c.cands.find(k => k.method === (L.cmpChoice || L.method) && k.frame);
          if (!x) return;
          L.method = x.method; L.range = [c.a, c.b]; L.opts = JSON.parse(JSON.stringify(c.opts));
          L.reuse = { method: x.method, a: c.a, b: c.b, opts: JSON.parse(JSON.stringify(c.opts)), frame: x.frame };
          L.comparing = false; L.error = null; render(); ctx.redraw(); return;
        }
        case "lx-place": ctx.defaultInterval(); render(); ctx.redraw(); return;
        case "lx-painted": { const mp = W.bands.find(x => x.kind === "mpBL"); if (mp) { L.range = [mp.a, mp.b]; render(); ctx.redraw(); } return; }
        case "lx-short": { const c = (L.range[0] + L.range[1]) / 2; L.range = [c - 2, c + 2]; L.error = null; render(); ctx.redraw(); return; }
        case "lx-adjust": L.draft = true; L.entry = "calculate"; L.range = [f.a, f.b]; if (f.diagnostics && S.METHODS[f.diagnostics.method] && f.diagnostics.method !== "combined") L.method = f.diagnostics.method; render(); ctx.redraw(); return;
        case "lx-new": L.draft = true; L.entry = "calculate"; if (!L.range) ctx.defaultInterval(); render(); ctx.redraw(); return;
        case "lx-cancel": L.draft = false; L.error = null; render(); ctx.redraw(); return;
        case "lx-flipL": case "lx-flipN": { const g = S.flipped(f, name === "lx-flipL", name === "lx-flipN"); g.native = f.native; apply(g, false); return; }
        case "lx-copy": {
          const txt = [["L", f.l], ["M", f.m], ["N", f.n]].map(([k, v]) => `${k} ${v.map(x => x.toFixed(4)).join(" ")}`).join("\n");
          if (navigator.clipboard) navigator.clipboard.writeText(txt).catch(() => {});
          L.copied = true; render(); setTimeout(() => { L.copied = false; render(); }, 1500); return;
        }
        case "lx-useun": { const uN = f.diagnostics.uN; L.opts.frameSpeed = +uN.toFixed(1); render(); return; }
        case "lx-q-sel": if (L.range) L.opts.quiet = { a: L.range[0], b: L.range[1] }; render(); return;
        case "lx-q-clear": L.opts.quiet = null; render(); return;
        case "lx-g-clear": L.opts.gradientReference = null; render(); return;
        case "lx-reapply": { const g = history()[+b.dataset.i]; if (g) apply(g, false); return; }
        case "lx-combine": {
          const H = history(), C = L.cmb, fa = H[C.fa], fb = H[C.fb];
          if (!fa || !fb) return;
          const out = S.combine(C.a, fa, C.b, fb, C.rule, (t) => hms(t));
          if (out.error) { L.cmbError = out.error; render(); return; }
          L.cmbError = null; apply(out.frame); return;
        }
        case "lx-custom": {
          const C = L.custom, label = C.name.trim() || "Entered axes", lo = W.app ? W.app.a : 0, hi = W.app ? W.app.b : 0;
          const g = S.custom(parseVec(C.l), parseVec(C.m), parseVec(C.n), label, { a: lo, b: hi });
          if (!g) { L.customError = "Those axes cannot make a frame: a zero vector, or two given axes within 1° of parallel."; render(); return; }
          L.customError = null; apply(g); return;
        }
        case "lx-cclear": L.custom = { l: "", m: "", n: "", name: "" }; L.customError = null; render(); return;
        case "lx-cfill": L.custom = { l: f.l.map(x => x.toFixed(4)).join(" "), m: f.m.map(x => x.toFixed(4)).join(" "), n: f.n.map(x => x.toFixed(4)).join(" "), name: L.custom.name }; render(); return;
      }
    }
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      const b = e.target.closest("button");
      if (!b || b.disabled) return;
      const d = b.dataset;
      if (d.lxEntry) { L.entry = d.lxEntry; render(); return; }
      if (d.lxEf) { L.opts.eField = d.lxEf; render(); ctx.redraw(); return; }
      if (d.lxJfrom) { L.opts.currentFromCurlometer = d.lxJfrom === "curl"; render(); ctx.redraw(); return; }
      if (d.lxMal) { L.opts.currentPeak = d.lxMal === "peak"; render(); return; }
      if (d.lxCa) { L.cmb.a = d.lxCa; render(); return; }
      if (d.lxCb) { L.cmb.b = d.lxCb; render(); return; }
      if (d.act) act(d.act, b);
    }, true);
    el.addEventListener("change", (e) => {
      e.stopPropagation();
      const x = e.target, d = x.dataset;
      if (d.lmn === "mark") { L.mark = x.checked; render(); ctx.redraw(); return; }
      if (d.lmn === "start" || d.lmn === "end") {
        const t = ctx.parseClock(x.value), r = L.range;
        if (t === null || !r) { ctx.lmnTimes(); return; }
        L.range = d.lmn === "start" ? [Math.min(t, r[1] - 0.01), r[1]] : [r[0], Math.max(t, r[0] + 0.01)];
        render(); ctx.redraw(); return;
      }
      switch (d.lx) {
        case "method": L.method = x.value; L.error = null; render(); ctx.redraw(); return;
        case "u": L.opts.frameSpeed = isFinite(+x.value) ? +x.value : 0; return;
        case "smooth": L.opts.smooth = Math.max(0, isFinite(+x.value) ? +x.value : 0); return;
        case "avgG": L.opts.averageGradient = x.checked; return;
        case "qa": case "qb": { const p = parseRange($v("qa"), $v("qb")); L.opts.quiet = p; render(); return; }
        case "ga": case "gb": { const p = parseRange($v("ga"), $v("gb")); L.opts.gradientReference = p; render(); return; }
        case "cfa": L.cmb.fa = +x.value; return;
        case "cfb": L.cmb.fb = +x.value; return;
        case "crule": L.cmb.rule = x.value; return;
        case "cmp4": { const T = L.cmpFour || (L.cmpFour = new Set()); if (x.checked) T.add(x.value); else T.delete(x.value); render(); return; }
        case "cl": case "cm": case "cn": case "cname": L.custom[d.lx === "cname" ? "name" : d.lx[1]] = x.value; render(); return;
      }
    }, true);
    const $v = (k) => { const i = el.querySelector(`[data-lx="${k}"]`); return i ? i.value : ""; };
    el.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.matches("input")) { e.stopPropagation(); e.target.blur(); } }, true);
    el.addEventListener("input", (e) => e.stopPropagation(), true);

    /** The subplots the method reads, where the interval's handles go (LMNMethod.inputPanels): the draft's method while
     *  one is being chosen, the applied frame's after. */
    function rows() {
      const f = L.frame, m = f && !L.draft && f.diagnostics && S.METHODS[f.diagnostics.method] ? f.diagnostics.method : L.method;
      return m === "combined" || (f && f.source && !L.draft) ? ["b"] : S.inputPanels(m, L.opts);
    }

    return { render, status, decorate, rows };
  };
})();
