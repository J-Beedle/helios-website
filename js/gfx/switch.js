/* Which set of figures a page shows: the second generation (js/gfx/*) or the first, kept for comparison.
 * ?gfx=classic or ?gfx=new in the address chooses for that visit and is remembered; the footer's switch does the same.
 * The page's script tag lists both sets: <script src="js/gfx/switch.js" data-new="a.js b.js" data-classic="c.js">.
 * They are written into the page here, in order, before the scripts that follow. */
(function () {
  "use strict";
  const me = document.currentScript, q = new URLSearchParams(location.search);
  let mode = q.get("gfx");
  try {
    if (mode === "classic" || mode === "new") localStorage.setItem("helios-gfx", mode);
    else mode = localStorage.getItem("helios-gfx");
  } catch (e) { /* this visit only */ }
  if (mode !== "classic") mode = "new";
  window.HELIOS_GFX = mode;
  document.documentElement.dataset.gfxMode = mode;
  // each page carries both sets' markup, marked data-gfx="new" or "classic": the set not shown is taken out
  document.querySelectorAll("[data-gfx]").forEach(el => { if (el.dataset.gfx !== mode) el.remove(); });
  const v = (me.src.match(/[?&]v=(\w+)/) || [])[1];
  for (const src of (me.dataset[mode] || "").split(/\s+/).filter(Boolean)) {
    document.write(`<script src="${src}${v ? "?v=" + v : ""}"><\/script>`);
  }
  // the footer's switch, once the page is in
  document.addEventListener("DOMContentLoaded", () => {
    const host = document.querySelector("footer .small, footer") || document.body;
    const a = document.createElement("a");
    const other = mode === "new" ? "classic" : "new";
    const u = new URL(location.href); u.searchParams.set("gfx", other);
    a.href = u.pathname.split("/").pop() + u.search + u.hash;
    a.className = "gfx-switch";
    a.textContent = mode === "new" ? "Show the original figures" : "Show the new figures";
    a.title = "The site's figures were redrawn in November 2026; the originals are kept. compare.html shows both.";
    const wrap = document.createElement("p");
    wrap.className = "gfx-switch-row";
    wrap.appendChild(a);
    wrap.insertAdjacentHTML("beforeend", ' · <a href="compare.html">Compare them side by side</a>');
    (document.querySelector("footer") || host).appendChild(wrap);
  });
})();
