/* Helios Live: the SDO window's download, step one. Helioviewer lets no other site read its answers except through a
 * JSONP callback, which runs the script Helioviewer returns. So that script runs here, in a sandboxed frame with no
 * origin of its own, never in the page: this asks takeScreenshot for a render (its parameters checked) and posts only
 * the screenshot's id to the page, which then fetches downloadScreenshot?id=…, served as an attachment. */
(() => {
  const q = new URLSearchParams(location.hash.slice(1));
  const date = q.get("date") || "", scale = +q.get("scale"), src = +q.get("src"), px = +q.get("px");
  const say = (id) => parent.postMessage({ hvShot: id }, "*");    // an id is no secret
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(date) || !(scale > 0 && scale < 20) || !Number.isInteger(src) || src < 0 || src > 99 ||
      ![512, 1024, 2048, 4096].includes(px)) { say(null); return; }
  window.hvDone = (r) => say(r && Number.isInteger(r.id) && r.id > 0 ? r.id : null);
  const s = document.createElement("script");
  s.src = `https://api.helioviewer.org/v2/takeScreenshot/?date=${date}&imageScale=${scale}&layers=%5B${src},1,100%5D` +
          `&x0=0&y0=0&width=${px}&height=${px}&display=false&watermark=false&callback=hvDone`;
  s.onerror = () => say(null);
  document.head.appendChild(s);
})();
