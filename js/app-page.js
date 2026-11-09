/* app.html — Helios Live as an application: the bar's moment picker and loading list, the About panel, the rail, the
 * rule that nothing here scrolls or zooms the page itself, and the hold on small screens and old browsers. Runs before
 * hso-live.js (which fetches the data) and hso.js (which draws the screen). */
(function () {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const q = new URLSearchParams(location.search);
  const solo = q.has("solo");                               // a window in a tab of its own: none of this page's chrome

  // ── held back before anything is fetched: a browser without what the app needs, or a screen too small for it ──
  const missing = !(window.DecompressionStream && window.Worker && window.ReadableStream && typeof BigInt === "function" && window.AbortController);
  let waved = false;
  try { waved = sessionStorage.getItem("helios-live-small") === "1"; } catch (e) { /* asked again next time */ }
  const small = !solo && (window.innerWidth < 900 || window.innerHeight < 540) && !waved;
  if (missing || small) {
    window.HSO_GATED = true;
    const gate = $("#la-gate");
    $("#la-gate-h").textContent = missing ? "This browser cannot run Helios Live" : "Helios Live is built for a larger screen";
    $("#la-gate-p").textContent = missing
      ? "It needs a current version of Chrome, Edge, Firefox or Safari (16.4 or later) to read the archives' files in the page."
      : "The spacecraft view and its data windows need about a laptop's worth of room: at least 900 by 540 points.";
    const go = $("#la-gate-go");
    if (!missing) {
      go.hidden = false;
      go.addEventListener("click", () => { try { sessionStorage.setItem("helios-live-small", "1"); } catch (e) { /* this visit only */ } location.reload(); });
    }
    gate.hidden = false;
    return;
  }

  // ── nothing on this page scrolls or zooms the page: the wheel and a pinch belong to the view and the windows ──
  window.addEventListener("wheel", (e) => { if (e.ctrlKey || e.metaKey) e.preventDefault(); }, { passive: false });   // browser zoom
  for (const ev of ["gesturestart", "gesturechange", "gestureend"]) window.addEventListener(ev, (e) => e.preventDefault(), { passive: false });   // Safari's pinch
  window.addEventListener("scroll", () => { if (window.scrollX || window.scrollY) window.scrollTo(0, 0); });   // a focus that tried to scroll the page
  if (solo) return;

  // ── the moment: ?t=…, or the default named on <body> ──
  const raw = (q.get("t") || document.body.dataset.defaultT || "").trim();
  const at = Date.parse(/Z$|[+-]\d\d:?\d\d$/.test(raw) ? raw : raw + "Z");
  const form = $("#live-pick"), date = $("#live-date"), time = $("#live-time"), pick = $("#live-event"), ref = $("#live-ref");
  const shown = new Date(isFinite(at) ? at : Date.UTC(2015, 9, 16, 13, 7));
  date.max = new Date().toISOString().slice(0, 10);
  date.value = shown.toISOString().slice(0, 10);
  time.value = shown.toISOString().slice(11, 16);
  /** Another moment: the same screen (its view, scale and open windows) at the new time. */
  const go = (t) => { const u = new URL(location.href); u.searchParams.set("t", t); location.assign(u); };
  form.addEventListener("submit", (e) => { e.preventDefault(); if (date.value && time.value) go(`${date.value}T${time.value}Z`); });
  const stamp = `${shown.getUTCDate()} ${M[shown.getUTCMonth()]} ${shown.getUTCFullYear()} ${shown.toISOString().slice(11, 16)} UTC`;
  document.title = `Helios Live · ${stamp}`;
  $("#rail-day").textContent = `${M[shown.getUTCMonth()]} ${shown.getUTCDate()}`;
  $("#rail-year").textContent = shown.getUTCFullYear();
  $("#rail-hm").textContent = shown.toISOString().slice(11, 16);

  // the event menu (assets/data/live/events.json), grouped, with the one on screen selected
  fetch("assets/data/live/events.json").then(r => r.json()).catch(() => []).then((list) => {
    const groups = new Map();
    for (const ev of list) { if (!groups.has(ev.group)) groups.set(ev.group, []); groups.get(ev.group).push(ev); }
    for (const [g, evs] of groups) {
      const og = document.createElement("optgroup");
      og.label = g;
      for (const ev of evs) {
        const d = new Date(ev.t), o = document.createElement("option");
        o.value = ev.t;
        o.textContent = `${ev.short} · ${d.getUTCDate()} ${M[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
        o.title = `${ev.name} (${ev.ref})`;
        og.appendChild(o);
      }
      pick.appendChild(og);
    }
    const cur = list.find(ev => Math.abs(Date.parse(ev.t) - at) < 60e3);
    if (cur) { pick.value = cur.t; ref.hidden = false; ref.textContent = `${cur.name} · ${cur.ref}`; ref.title = ref.textContent; }
  });
  pick.addEventListener("change", () => { if (pick.value) go(pick.value); });

  // ── what is loading: a pill in the bar, its list behind it ──
  const pill = $("#la-status"), pillText = $("span", pill), tasksEl = $("#la-tasks");
  const esc = (x) => String(x).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  const word = { loading: "fetching…", ok: "✓", none: "no data", error: "failed" };
  let failed = null;
  window.addEventListener("hso-live", (e) => {
    const { tasks, bytes, kept } = e.detail, busy = tasks.filter(([, v]) => v === "loading").length, bad = tasks.filter(([, v]) => v === "error").length;
    const mb = ((bytes + (kept || 0)) / 1e6).toFixed(1);
    pill.classList.toggle("busy", busy > 0); pill.classList.toggle("bad", !busy && (bad > 0 || !!failed));
    pillText.textContent = failed ? "Could not load" : busy ? `Loading ${busy}…` : bad ? `${bad} failed · ${mb} MB` : `${mb} MB`;
    pill.title = busy ? "Fetching from the archives: click for the list" : "What was fetched for this moment";
    tasksEl.innerHTML = `<p class="ls-h">${(bytes / 1e6).toFixed(1)} MB from the archives${kept > 0 ? ` · ${(kept / 1e6).toFixed(1)} MB from this browser's copy` : ""}</p>`
      + `<ul>${tasks.map(([k, v]) => `<li class="${esc(v)}"><span>${esc(k)}</span><b>${word[v] || ""}</b></li>`).join("")}</ul>`;
  });
  window.addEventListener("hso-failed", (e) => { failed = e.detail || " "; pill.classList.remove("busy"); pill.classList.add("bad"); pillText.textContent = "Could not load"; });
  const showTasks = (on) => { tasksEl.hidden = !on; pill.setAttribute("aria-expanded", String(on)); };
  pill.addEventListener("click", (e) => { e.stopPropagation(); showTasks(tasksEl.hidden); });
  document.addEventListener("click", (e) => { if (!tasksEl.hidden && !tasksEl.contains(e.target)) showTasks(false); });

  // ── About, and the rail ──
  const about = $("#la-about");
  const openAbout = () => { if (!about.open) about.showModal(); };
  $("#la-about-btn").addEventListener("click", openAbout);
  $("#la-info").addEventListener("click", openAbout);
  about.addEventListener("click", (e) => { if (e.target === about) about.close(); });   // a click on the backdrop
  $("#la-moment").addEventListener("click", () => { date.focus(); if (date.showPicker) try { date.showPicker(); } catch (e) { /* focus is enough */ } });
  $("#la-hso").addEventListener("click", () => {           // the screen as it opens: the top view, at the magnetosphere's scale
    $('#stage [data-rung="mag"]')?.click(); $('#stage [data-preset="top"]')?.click();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") showTasks(false); });
})();
