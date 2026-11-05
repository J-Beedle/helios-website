/* live.html: the moment picker, what is loading, and the screens' labels for the moment (hso-live.js fetches the data). */
(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const q = new URLSearchParams(location.search), raw = (q.get("t") || "").trim();
  const at = raw ? Date.parse(/Z$/.test(raw) ? raw : raw + "Z") : NaN;
  const form = $("#live-pick"), date = $("#live-date"), time = $("#live-time");
  date.max = new Date().toISOString().slice(0, 10);
  const shown = isFinite(at) ? new Date(at) : new Date(Date.UTC(2015, 9, 16, 13, 7));
  date.value = shown.toISOString().slice(0, 10);
  time.value = shown.toISOString().slice(11, 16);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!date.value || !time.value) return;
    location.search = `?t=${date.value}T${time.value}Z`;
  });
  if (!isFinite(at)) {                                       // nothing picked yet: the picker alone
    document.querySelectorAll("#stage, #workspace, .demo").forEach(el => el.remove());
    return;
  }
  // the rail's event card
  const M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], d = new Date(at);
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
