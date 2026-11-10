/* compare.html: pick a figure; the two frames show its page with the first set of figures and with the second.
 * A frame's ?gfx= is for that frame only (see js/gfx/switch.js: ?gfx=…&keep=0 does not remember the choice). */
(function () {
  "use strict";
  const FIGURES = [
    ["Hero", "index.html", "top", "The same conditions and boundaries. New: the solar wind takes the Rankine–Hugoniot jump at the shock, its field (gold) rides with it and drapes over the nose, and every field line is a contour of one flux function, moving with the flow and reconnecting at the nose."],
    ["Reconnection", "index.html", "reconnection", "Was an 18 s video. Now drawn live from the same model as the hero, driven by the open flux in the polar cap: growth, onset, a plasmoid, expansion and recovery, with the polar cap seen from above and the flux through it."],
    ["Four magnetospheres", "worlds.html", "scale", "Was four schematic outlines. Now each boundary is its published fit (Venus's bow shock nose is 1.42 R_V in Martinecz et al.'s fit; the first figure had 1.32), with the flow round each obstacle and the solar wind's field draped over it."],
    ["Boundaries", "models.html", "top", "The same two models and sliders. New: the solar wind flows through the figure and its field drapes over the nose, both answering the sliders."],
    ["Field lines", "models.html", "field-lines", "The same lines traced by Helios. New: each line moves to its new shape when Kp changes, beside the dipole's line from the same footpoint."],
    ["Radiation belts", "models.html", "belts", "The same AE-8/AP-8 cuts. New: the orbits that cross them, to scale, and trapped particles bouncing between their mirror points."],
    ["Auroral oval", "models.html", "aurora", "The same model. New: the oval lies on the turning Earth, seen from above the geomagnetic pole, and places light up while they are under it."],
    ["Artemis II", "artemis.html", "top", "The same trajectory, photographs and player."],
  ];
  const pick = document.getElementById("cmp-pick"), oldF = document.getElementById("cmp-old"), newF = document.getElementById("cmp-new"), note = document.getElementById("cmp-note");
  function show(i) {
    const [, page, anchor, text] = FIGURES[i];
    oldF.src = `${page}?gfx=classic&keep=0#${anchor}`;
    newF.src = `${page}?gfx=new&keep=0#${anchor}`;
    note.textContent = text;
    pick.querySelectorAll("button").forEach((b, k) => b.setAttribute("aria-pressed", String(k === i)));
    history.replaceState(null, "", "#" + anchor + "@" + page.replace(".html", ""));
  }
  FIGURES.forEach(([name], i) => { const b = document.createElement("button"); b.textContent = name; b.addEventListener("click", () => show(i)); pick.appendChild(b); });
  const want = location.hash.slice(1), at = FIGURES.findIndex(f => f[2] + "@" + f[1].replace(".html", "") === want);
  show(at >= 0 ? at : 0);
})();
