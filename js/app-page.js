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

  /** A menu whose list always opens below it, over a hidden <select> that stays the value and fires "change" (user
   *  request, 2026-11-12: the Mac's own menu opens around the chosen line, so December's ran up off the bar). Its button
   *  takes the focus: typing picks by the start of a name, and Enter, Space, Alt+↓ or a click opens the list, where
   *  ↑/↓, Home/End, typing, Enter and Escape work as in a menu. Greyed (disabled) options cannot be picked.
   *  → { btn, sync() (call after setting the select's value), close() } */
  function dropdown(sel) {
    const wrap = document.createElement("span"), btn = document.createElement("button"), list = document.createElement("ul");
    wrap.className = "dd";
    btn.type = "button"; btn.className = "dd-btn"; btn.title = sel.title;
    btn.setAttribute("aria-haspopup", "listbox"); btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-label", sel.getAttribute("aria-label") || "");
    list.className = "dd-list"; list.tabIndex = -1; list.hidden = true;
    list.setAttribute("role", "listbox"); list.setAttribute("aria-label", sel.getAttribute("aria-label") || "");
    sel.before(wrap); wrap.append(sel, btn, list);
    sel.hidden = true; sel.tabIndex = -1; sel.setAttribute("aria-hidden", "true");
    let active = -1, typed = "", typedAt = 0;
    const opts = () => [...sel.options];
    const sync = () => { const o = sel.options[sel.selectedIndex]; btn.textContent = o ? o.text : ""; };
    const choose = (i) => {
      const o = sel.options[i];
      if (!o || o.disabled || i === sel.selectedIndex) return;
      sel.selectedIndex = i; sync();
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    };
    const paint = () => {
      list.textContent = "";
      opts().forEach((o, i) => {
        const li = document.createElement("li");
        li.id = `${sel.id}-o${i}`; li.dataset.i = i; li.textContent = o.text; li.setAttribute("role", "option");
        li.setAttribute("aria-selected", String(i === sel.selectedIndex));
        if (o.disabled) li.setAttribute("aria-disabled", "true");
        list.append(li);
      });
    };
    const mark = (i) => {
      active = i;
      for (const li of list.children) li.classList.toggle("on", +li.dataset.i === i);
      const li = list.children[i];
      if (li) { list.setAttribute("aria-activedescendant", li.id); li.scrollIntoView({ block: "nearest" }); }
    };
    const open = () => {
      if (!list.hidden) return;
      paint(); list.hidden = false; btn.setAttribute("aria-expanded", "true");
      list.children[sel.selectedIndex]?.scrollIntoView({ block: "center" });
      mark(sel.selectedIndex); list.focus({ preventScroll: true });
    };
    const close = (refocus) => {
      if (list.hidden) return;
      list.hidden = true; btn.setAttribute("aria-expanded", "false");
      if (refocus) btn.focus({ preventScroll: true });
    };
    /** The first option from i, stepping by step, that can be picked; −1 if none. */
    const enabledFrom = (i, step) => { const o = opts(); for (let k = i; k >= 0 && k < o.length; k += step) if (!o[k].disabled) return k; return -1; };
    const typeAhead = (ch) => {
      const t = performance.now();
      typed = (t - typedAt < 1000 ? typed : "") + ch.toLowerCase(); typedAt = t;
      return opts().findIndex(o => !o.disabled && o.text.toLowerCase().startsWith(typed));
    };
    const plainKey = (e) => e.key.length === 1 && e.key !== " " && !e.metaKey && !e.ctrlKey && !e.altKey;
    // What is typed on the closed button is picked when the typing pauses, or the focus or another key moves on: a year
    // typed as 2026 would otherwise stop at 2015 and 2020 on the way, and 2015 can move the month and day to fit it.
    let pending = -1, pendingTimer = 0;
    const flush = () => { clearTimeout(pendingTimer); if (pending >= 0) { const i = pending; pending = -1; choose(i); sync(); } };
    btn.addEventListener("click", () => { flush(); if (list.hidden) open(); else close(true); });
    btn.addEventListener("blur", flush);
    btn.addEventListener("keydown", (e) => {
      if (plainKey(e)) {
        const i = typeAhead(e.key);
        if (i >= 0) { e.preventDefault(); pending = i; btn.textContent = sel.options[i].text; clearTimeout(pendingTimer); pendingTimer = setTimeout(flush, 700); }
        return;
      }
      flush();                                                // before the arrows step from it
      if (e.key === "Enter" || e.key === " " || (e.key === "ArrowDown" && e.altKey)) { e.preventDefault(); open(); }
    });
    list.addEventListener("keydown", (e) => {
      const down = e.key === "ArrowDown";
      if (down || e.key === "ArrowUp") { e.preventDefault(); const k = enabledFrom(active + (down ? 1 : -1), down ? 1 : -1); if (k >= 0) mark(k); }
      else if (e.key === "Home" || e.key === "End") { e.preventDefault(); const k = e.key === "Home" ? enabledFrom(0, 1) : enabledFrom(sel.options.length - 1, -1); if (k >= 0) mark(k); }
      else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(active); close(true); }
      else if (e.key === "Escape") { e.preventDefault(); close(true); }
      else if (e.key === "Tab") close(false);
      else if (plainKey(e)) { const i = typeAhead(e.key); if (i >= 0) mark(i); }
    });
    list.addEventListener("click", (e) => {
      const li = e.target.closest("li");
      if (!li || li.getAttribute("aria-disabled")) return;
      choose(+li.dataset.i); close(true);
    });
    list.addEventListener("pointermove", (e) => { const li = e.target.closest("li"); if (li && !li.getAttribute("aria-disabled")) mark(+li.dataset.i); });
    list.addEventListener("focusout", (e) => { if (!wrap.contains(e.relatedTarget)) close(false); });
    window.addEventListener("pointerdown", (e) => { if (!wrap.contains(e.target)) close(false); }, true);
    window.addEventListener("wheel", (e) => { if (!list.contains(e.target)) close(false); }, { capture: true, passive: true });
    sync();
    return { btn, sync, close };
  }

  // ── the moment: ?t=…, or the default named on <body> ──
  const raw = (q.get("t") || document.body.dataset.defaultT || "").trim();
  const at = Date.parse(/Z$|[+-]\d\d:?\d\d$/.test(raw) ? raw : raw + "Z");
  const form = $("#live-pick"), date = $("#live-date"), time = $("#live-time"), pick = $("#live-event"), ref = $("#live-ref");
  const yearSel = $("#live-year"), monSel = $("#live-month"), day = $("#live-day"), cal = $("#live-cal");
  const shown = new Date(isFinite(at) ? at : Date.UTC(2015, 9, 16, 13, 7));
  /** Another moment: the same screen (its view, scale and open windows) at the new time. */
  const go = (t) => { const u = new URL(location.href); u.searchParams.set("t", t); location.assign(u); };

  // The date is three fields, year, month and day, so one can change without the others (the same day in another year
  // is one change), and nothing is typed into the browser's date field, which follows the visitor's locale (mm/dd/yyyy
  // here, dd/mm/yyyy there) and reads 0002, 0020 and 0201, all invalid dates, on the way to a typed 2017. Its calendar
  // stays one button away (an unseen copy of that field) where the browser can open it.
  const DAY = 86400e3, ymd = (ms) => new Date(ms).toISOString().slice(0, 10);
  const now = new Date(), FIRST = Date.parse(date.min + "T00:00:00Z"), LAST = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const dim = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();          // days in month m (0-based) of year y
  date.max = ymd(LAST);
  for (let y = new Date(FIRST).getUTCFullYear(); y <= now.getUTCFullYear(); y++) yearSel.add(new Option(String(y), String(y)));
  M.forEach((m, i) => monSel.add(new Option(m, String(i))));
  const yearDD = dropdown(yearSel), monDD = dropdown(monSel);
  /** Show a day (UTC midnight, held to the archives' span) in the three fields and the calendar's copy. */
  const setDay = (ms) => {
    const d = new Date(Math.min(LAST, Math.max(FIRST, ms))), y = d.getUTCFullYear();
    yearSel.value = String(y); monSel.value = String(d.getUTCMonth()); day.value = String(d.getUTCDate()).padStart(2, "0");
    date.value = ymd(d.getTime());
    day.setCustomValidity("");
    for (const o of monSel.options) {                         // months with no day in the span, greyed for this year
      const m = +o.value; o.disabled = Date.UTC(y, m, dim(y, m)) < FIRST || Date.UTC(y, m, 1) > LAST;
    }
    yearDD.sync(); monDD.sync();
  };
  /** The day the fields describe, or null while the day field is not a day of that month. */
  const chosen = () => {
    const y = +yearSel.value, m = +monSel.value, s = day.value.trim();
    return /^\d{1,2}$/.test(s) && +s >= 1 && +s <= dim(y, m) ? Date.UTC(y, m, +s) : null;
  };
  /** The year or month changed: keep the day of the month, or the month's last day if it is shorter. */
  const keepDay = () => {
    const y = +yearSel.value, m = +monSel.value, d = +day.value.trim() || +date.value.slice(8, 10) || 1;
    setDay(Date.UTC(y, m, Math.min(Math.max(d, 1), dim(y, m))));
  };
  yearSel.addEventListener("change", keepDay);
  monSel.addEventListener("change", keepDay);
  // The arrow keys on a closed menu step the year and the month as they step the day and the time (up is later).
  // Enter, Space or Alt+↓ opens the list.
  const stepMonths = (n) => {
    const m = +monSel.value + n, y = +yearSel.value + Math.floor(m / 12), mm = ((m % 12) + 12) % 12;
    const d = +day.value.trim() || +date.value.slice(8, 10) || 1;
    setDay(Date.UTC(y, mm, Math.min(Math.max(d, 1), dim(y, mm))));
  };
  for (const [dd, n] of [[yearDD, 12], [monDD, 1]]) {
    dd.btn.addEventListener("keydown", (e) => {
      if ((e.key !== "ArrowUp" && e.key !== "ArrowDown") || e.altKey || e.metaKey || e.ctrlKey) return;
      e.preventDefault();
      stepMonths(e.key === "ArrowUp" ? n : -n);
    });
  }
  day.addEventListener("input", () => {
    day.setCustomValidity("");
    const v = day.value.replace(/[^0-9]/g, "").slice(0, 2);
    if (v !== day.value) day.value = v;
  });
  day.addEventListener("focus", () => day.select());
  day.addEventListener("blur", () => {                        // 0 → 1 and 31 in November → 30; empty → as it was
    const y = +yearSel.value, m = +monSel.value, s = day.value.trim();
    if (!s) { setDay(Date.parse(date.value + "T00:00:00Z")); return; }
    setDay(Date.UTC(y, m, Math.min(Math.max(+s, 1), dim(y, m))));
  });
  day.addEventListener("keydown", (e) => {                    // a day, or a week with Shift, across months and years
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    const d = chosen() ?? Date.parse(date.value + "T00:00:00Z");
    e.preventDefault();
    setDay(d + (e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? 7 : 1) * DAY);
    day.select();
  });
  // The calendar belongs to the unseen field. A browser closes a field's calendar when the field loses the focus, and
  // this field never has it, so a press elsewhere left the calendar open (user report, 2026-11-12). The page closes it
  // instead: a press anywhere but the calendar's two buttons, Escape, the wheel, or either button again. No browser has
  // a call that closes a picker, but each closes it with its field, so the field leaves the page for a frame.
  // A pick does not end it: some browsers keep the calendar open after a day is picked, and that open calendar then
  // wrote its day back over the year or month chosen next (user report, 2026-11-12). So the page goes on closing it
  // after a pick, and the field's day is taken only while the calendar is open.
  const canCalendar = typeof date.showPicker === "function";
  const moment = $("#la-moment");
  let calOpen = false;
  /** Whether the browser says its calendar is open (`:open`), or null where it cannot say. */
  const browserSaysOpen = () => { try { return date.matches(":open"); } catch (e) { return null; } };
  const closeCalendar = () => {
    if (!calOpen) return;
    calOpen = false;
    date.blur();
    date.style.display = "none";
    requestAnimationFrame(() => { date.style.display = ""; });
  };
  const openCalendar = () => { try { date.showPicker(); calOpen = true; } catch (e) { yearDD.btn.focus(); } };
  // The button again: closed if it is open (where the browser can say, it decides: a calendar that closed itself on a
  // pick opens again at once).
  const toggleCalendar = () => {
    if (calOpen && browserSaysOpen() !== false) { closeCalendar(); return; }
    calOpen = false;                                          // it closed itself after a pick
    openCalendar();
  };
  const inCalendarButtons = (t) => cal.contains(t) || moment.contains(t);
  cal.hidden = !canCalendar;
  cal.addEventListener("click", toggleCalendar);
  window.addEventListener("pointerdown", (e) => { if (calOpen && !inCalendarButtons(e.target)) closeCalendar(); }, true);
  window.addEventListener("focusin", (e) => { if (calOpen && e.target !== date && !inCalendarButtons(e.target)) closeCalendar(); }, true);
  window.addEventListener("keydown", (e) => { if (e.key === "Escape") closeCalendar(); }, true);
  window.addEventListener("wheel", closeCalendar, { capture: true, passive: true });
  const fromCalendar = () => { if (calOpen && date.value) setDay(Date.parse(date.value + "T00:00:00Z")); };
  date.addEventListener("input", fromCalendar);
  date.addEventListener("change", fromCalendar);
  setDay(Date.UTC(shown.getUTCFullYear(), shown.getUTCMonth(), shown.getUTCDate()));
  time.value = shown.toISOString().slice(11, 16);
  // The time is typed on the 24-hour clock. (A type="time" field follows the visitor's locale, and in a 12-hour one
  // shows "02:41 PM" for 14:41 UTC.) 1441, 14:41 and 9:05 are all taken; the arrow keys step it by a minute.
  const hhmm = (s) => { const m = /^\s*(\d{1,2})(?::?(\d{2}))?\s*$/.exec(s); if (!m) return null; const h = +m[1], mi = +(m[2] || 0); return h < 24 && mi < 60 ? `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}` : null; };
  time.addEventListener("input", () => { time.setCustomValidity(""); const d = time.value.replace(/[^0-9]/g, "").slice(0, 4); if (!time.value.includes(":") && d.length === 4) time.value = `${d.slice(0, 2)}:${d.slice(2)}`; });
  time.addEventListener("blur", () => { const v = hhmm(time.value); if (v) time.value = v; });
  time.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    const v = hhmm(time.value); if (!v) return;
    e.preventDefault();
    const t = ((+v.slice(0, 2) * 60 + +v.slice(3) + (e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? 10 : 1)) % 1440 + 1440) % 1440;
    time.value = `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const d = chosen();
    if (d === null) {
      day.setCustomValidity(`A day of ${M[+monSel.value]} ${yearSel.value}: 1 to ${dim(+yearSel.value, +monSel.value)}`);
      day.reportValidity(); return;
    }
    if (d < FIRST || d > LAST) {
      const f = new Date(FIRST);
      day.setCustomValidity(`Helios Live opens moments from ${f.getUTCDate()} ${M[f.getUTCMonth()]} ${f.getUTCFullYear()} to today`);
      day.reportValidity(); return;
    }
    const v = hhmm(time.value);
    if (!v) { time.setCustomValidity("A time in UTC on the 24-hour clock, such as 14:41"); time.reportValidity(); return; }
    time.value = v;
    go(`${ymd(d)}T${v}Z`);
  });
  // A date pasted anywhere in the bar (2017-07-11, 2017-07-11 22:34, 2017-07-11T22:34:00Z) fills the date and the time.
  form.addEventListener("paste", (e) => {
    const m = /^\s*(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2}))?/.exec(e.clipboardData?.getData("text") || "");
    if (!m || +m[2] < 1 || +m[2] > 12 || +m[3] < 1 || +m[3] > dim(+m[1], +m[2] - 1)) return;   // an ordinary paste
    e.preventDefault();
    setDay(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    const t = m[4] ? hhmm(`${m[4]}:${m[5]}`) : null;
    if (t) { time.value = t; time.setCustomValidity(""); }
  });
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
  moment.addEventListener("click", () => { if (canCalendar) toggleCalendar(); else yearDD.btn.focus(); });
  $("#la-hso").addEventListener("click", () => {           // the screen as it opens: the top view, at the magnetosphere's scale
    $('#stage [data-rung="mag"]')?.click(); $('#stage [data-preset="top"]')?.click();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") showTasks(false); });
})();
