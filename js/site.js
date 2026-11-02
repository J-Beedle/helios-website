/* What every page does: the header, the menu, the notes behind the pictures, the background videos, the player
 * and, on the home page, the hero figure.
 */
(function () {
  "use strict";

  // Where each video lives. The overview plays here; the tutorials open on YouTube once their links are added.
  const VIDEOS = {
    overview: { src: "assets/video/overview.mp4" },
    hso: { youtube: "https://www.youtube.com/watch?v=apheUygRnxA" },
    analysis: { youtube: "https://www.youtube.com/watch?v=Qmy5Z28oQF4" },
    workspace: { youtube: "https://www.youtube.com/watch?v=8HvYe8gg7Pc" },
  };
  const LINKS = {
    beta: "https://testflight.apple.com/join/TV8SAtfk",   // TestFlight's public link for the beta
  };

  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));

  // ── the header hides as you scroll down and comes back as you scroll up ──
  const head = $("#head");
  let lastY = window.scrollY;
  window.addEventListener("scroll", () => {
    const y = window.scrollY;
    head.classList.toggle("solid", y > window.innerHeight * 0.6);
    if (!document.body.classList.contains("menu-open")) head.classList.toggle("hidden", y > lastY && y > 200);
    lastY = y;
  }, { passive: true });

  // ── the menu ──
  const menuBtn = $("#menu-btn");
  function menu(open) {
    document.body.classList.toggle("menu-open", open);
    menuBtn.setAttribute("aria-expanded", String(open));
    head.classList.remove("hidden");
  }
  menuBtn.addEventListener("click", () => menu(!document.body.classList.contains("menu-open")));
  $("#scrim").addEventListener("click", () => menu(false));
  $$("#drawer a").forEach(a => a.addEventListener("click", () => menu(false)));
  document.addEventListener("keydown", e => { if (e.key === "Escape") menu(false); });

  // ── on the home page, the section you're in is underlined in the header ──
  const homeLinks = $$(".nav a").filter(a => (a.getAttribute("href") || "").startsWith("#"));
  const spy = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      homeLinks.forEach(a => {
        if (a.getAttribute("href") === "#" + e.target.id) a.setAttribute("aria-current", "true");
        else a.removeAttribute("aria-current");
      });
    });
  }, { rootMargin: "-45% 0px -50% 0px" });
  homeLinks.forEach(a => { const s = $(a.getAttribute("href")); if (s) spy.observe(s); });

  // ── things fade into place as they come into view ──
  const revealer = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      e.target.classList.add("in");
      revealer.unobserve(e.target);
    });
  }, { rootMargin: "0px 0px -6% 0px" });
  $$(".reveal").forEach(el => revealer.observe(el));

  // ── the notes behind the pictures ──
  $$("[aria-controls^='note-']").forEach(btn => {
    btn.addEventListener("click", () => {
      const open = btn.getAttribute("aria-expanded") !== "true";
      btn.setAttribute("aria-expanded", String(open));
      $("#" + btn.getAttribute("aria-controls")).classList.toggle("open", open);
    });
  });

  // ── background videos: loaded as they come near, playing only while on screen ──
  const loops = $$(".media video[data-src]");
  const loader = new IntersectionObserver(entries => {
    entries.forEach(e => { const v = e.target; if (e.isIntersecting && !v.src) { v.src = v.dataset.src; v.load(); } });
  }, { rootMargin: "100% 0px" });
  const playing = new IntersectionObserver(entries => {
    entries.forEach(e => {
      const v = e.target;
      if (e.isIntersecting && !still) { const p = v.play(); if (p) p.catch(() => {}); } else v.pause();
    });
  }, { threshold: 0.15 });
  loops.forEach(v => { loader.observe(v); playing.observe(v); });

  // ── the overview, in a player over the page ──
  const dialog = $("#player");
  if (dialog) {
    const video = $("video", dialog);
    const stop = () => { video.pause(); if (dialog.open) dialog.close(); };
    $$("[data-play]").forEach(b => b.addEventListener("click", () => {
      const item = VIDEOS[b.dataset.play];
      if (!item || !item.src) return;
      if (!video.src.endsWith(item.src)) video.src = item.src;
      dialog.showModal();
      const p = video.play(); if (p) p.catch(() => {});
    }));
    $("#player-close").addEventListener("click", stop);
    dialog.addEventListener("click", e => { if (e.target === dialog) stop(); });
    dialog.addEventListener("close", () => video.pause());
  }

  // ── the tutorials: on YouTube once there's a link, marked as coming until then ──
  $$("[data-video-card]").forEach(a => {
    const yt = (VIDEOS[a.dataset.videoCard] || {}).youtube;
    if (yt) { a.href = yt; a.target = "_blank"; a.rel = "noopener"; return; }
    a.removeAttribute("href");
    a.setAttribute("aria-disabled", "true");
    a.insertAdjacentHTML("beforeend", '<span class="soon">Link coming soon</span>');
  });
  $$("a[data-video]").forEach(a => {
    const yt = (VIDEOS[a.dataset.video] || {}).youtube;
    if (yt) { a.href = yt; a.target = "_blank"; a.rel = "noopener"; }
  });

  // ── the public beta: TestFlight's link once there is one ──
  $$("a[data-link]").forEach(a => {
    const url = LINKS[a.dataset.link];
    if (url) { a.href = url; a.target = "_blank"; a.rel = "noopener"; return; }
    a.removeAttribute("href");
    a.setAttribute("aria-disabled", "true");
    a.insertAdjacentHTML("afterend", '<span class="soon">Link coming soon</span>');
  });

  // ── the fleet's data panels: a row that scrolls, with arrows while it runs out of room ──
  $$("[data-carousel]").forEach(c => {
    const row = $(".cards", c), [prev, next] = $$("[data-dir]", c);
    const sync = () => {
      c.classList.toggle("scrolls", row.scrollWidth > row.clientWidth + 2);
      prev.disabled = row.scrollLeft < 4;
      next.disabled = row.scrollLeft > row.scrollWidth - row.clientWidth - 4;
    };
    [prev, next].forEach(b => b.addEventListener("click", () =>
      row.scrollBy({ left: +b.dataset.dir * row.clientWidth * 0.8, behavior: still ? "auto" : "smooth" })));
    row.addEventListener("scroll", sync, { passive: true });
    new ResizeObserver(sync).observe(row);
    $$("img", row).forEach(i => i.addEventListener("load", sync));
  });

  // ── how it was built: the milestones and the TestFlight builds on a calendar from May to October ──
  const axis = $(".devline .axis");
  if (axis) {
    const BUILDS = ["2026-09-03", "2026-09-04", "2026-09-04", "2026-09-08", "2026-09-08", "2026-09-09", "2026-09-11",
                    "2026-09-13", "2026-09-17", "2026-09-24", "2026-10-12", "2026-10-18", "2026-10-24", "2026-10-26"];
    const at = (iso) => {                         // a month to each sixth of the axis, as the columns under it
      const [y, m, d] = iso.split("-").map(Number);
      return (m - 5 + (d - 0.5) / new Date(Date.UTC(y, m, 0)).getUTCDate()) / 6;
    };
    const mark = (cls, x, nudge = 0) =>
      axis.insertAdjacentHTML("beforeend", `<i class="${cls}" style="left:calc(${(x * 100).toFixed(2)}% + ${nudge}px)"></i>`);
    for (let k = 1; k < 6; k++) mark("tick", k / 6);
    const seen = {};
    BUILDS.forEach(d => { seen[d] = (seen[d] || 0) + 1; mark("build", at(d), (seen[d] - 1) * 8); });
    $$(".devline [data-date]").forEach(li => mark(li.classList.contains("now") ? "dot now" : "dot", at(li.dataset.date)));
  }

  // ── the hero figure ──
  const canvas = $("#hero");
  if (canvas && window.HeliosHero) {
    const fonts = document.fonts ? Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 1500))]) : Promise.resolve();
    fonts.then(() => window.HeliosHero.start(canvas, "assets/data/hero-geometry.json", "assets/img/earth-equirect.jpg"))
      .catch(err => console.error("Helios hero:", err));
  }
})();
