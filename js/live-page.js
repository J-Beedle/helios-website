/* live.html: the event menu and moment picker, what is loading, and the screens' labels for the moment
 * (hso-live.js fetches the data). */
(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const q = new URLSearchParams(location.search), raw = (q.get("t") || "").trim();
  const at = raw ? Date.parse(/Z$/.test(raw) ? raw : raw + "Z") : NaN;
  const form = $("#live-pick"), date = $("#live-date"), time = $("#live-time"), pick = $("#live-event"), ref = $("#live-ref");
  date.max = new Date().toISOString().slice(0, 10);
  const shown = isFinite(at) ? new Date(at) : new Date(Date.UTC(2015, 9, 16, 13, 7));
  date.value = shown.toISOString().slice(0, 10);
  time.value = shown.toISOString().slice(11, 16);
  const go = (t) => { location.search = `?t=${t}`; };
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (date.value && time.value) go(`${date.value}T${time.value}Z`);
  });
  // the event menu (assets/data/live/events.json), grouped, with the one on screen selected
  const events = fetch("assets/data/live/events.json").then(r => r.json()).catch(() => []);
  events.then((list) => {
    const groups = new Map();
    for (const ev of list) { if (!groups.has(ev.group)) groups.set(ev.group, []); groups.get(ev.group).push(ev); }
    for (const [g, evs] of groups) {
      const og = document.createElement("optgroup");
      og.label = g;
      for (const ev of evs) {
        const d = new Date(ev.t), o = document.createElement("option");
        o.value = ev.t;
        o.textContent = `${d.getUTCDate()} ${M[d.getUTCMonth()]} ${d.getUTCFullYear()} ${ev.t.slice(11, 16)} · ${ev.name} (${ev.ref.split(" · ")[0]})`;
        og.appendChild(o);
      }
      pick.appendChild(og);
    }
    const cur = isFinite(at) && list.find(ev => Math.abs(Date.parse(ev.t) - at) < 60e3);
    if (cur) {
      pick.value = cur.t;
      ref.hidden = false;
      ref.textContent = `${cur.name} · ${cur.ref}`;
      const title = $(".app-title");
      if (title) title.textContent = cur.short;
      const tag = $(".rail-ev small:last-of-type");
      if (tag) tag.textContent = cur.short;
    }
  });
  pick.addEventListener("change", () => { if (pick.value) go(pick.value); });
  if (!isFinite(at)) {                                       // nothing picked yet: the menu and picker alone
    document.querySelectorAll("#stage, #workspace, .demo").forEach(el => el.remove());
    return;
  }
  // the rail's event card and the workspace's header
  const d = new Date(at);
  $("#rail-day").textContent = `${M[d.getUTCMonth()]} ${d.getUTCDate()}`;
  $("#rail-year").textContent = d.getUTCFullYear();
  $("#rail-hm").textContent = d.toISOString().slice(11, 16);
  $("#app-epoch").textContent = `${M[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()} · ${d.toISOString().slice(11, 16)} UTC`;
  // what is loading
  const box = $("#live-status");
  window.addEventListener("hso-live", (e) => {
    const { tasks, bytes } = e.detail, word = { loading: "fetching…", ok: "✓", none: "no data", error: "failed" };
    box.hidden = false;
    box.innerHTML = `<p class="ls-h">${(bytes / 1e6).toFixed(1)} MB fetched</p><ul>${tasks.map(([k, v]) => `<li class="${v}"><span>${k}</span><b>${word[v]}</b></li>`).join("")}</ul>`;
  });
})();
