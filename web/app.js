// ZinQuake frontend.
// Uses the local backend (/api/quakes — Python, PHP or Java) when one is running,
// otherwise calls the USGS feed directly (USGS allows CORS), so it also works on GitHub Pages.

const USGS_FEED = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary";
const REFRESH_MS = 60_000;

// Descriptions are I18N[lang].linkNotes in i18n.js, in this same order.
const LINKS = [
  { name: "USGS Latest Earthquakes", url: "https://earthquake.usgs.gov/earthquakes/map/" },
  { name: "USGS GeoJSON Feed API", url: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php" },
  { name: "USGS FDSN Event API", url: "https://earthquake.usgs.gov/fdsnws/event/1/" },
  { name: "EMSC Seismic Portal", url: "https://www.seismicportal.eu/" },
  { name: "GDACS", url: "https://www.gdacs.org/" },
  { name: "Myanmar DMH", url: "https://www.moezala.gov.mm/" },
  { name: "Japan JMA", url: "https://www.jma.go.jp/bosai/map.html#contents=earthquake_map" },
  { name: "Thai Meteorological Dept", url: "https://earthquake.tmd.go.th/" },
  { name: "Tsunami.gov", url: "https://www.tsunami.gov/" },
  { name: "ReliefWeb", url: "https://reliefweb.int/disasters" },
];

const $ = (sel) => document.querySelector(sel);
const form = $("#filters");
let map, layer;

function initMap() {
  if (!window.L) return; // Leaflet failed to load (offline) — list still works.
  map = L.map("map", { worldCopyJump: true }).setView([20, 96], 3);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 12,
    attribution: "&copy; OpenStreetMap",
  }).addTo(map);
  layer = L.layerGroup().addTo(map);
}

function magClass(m) {
  if (m >= 7) return "severe";
  if (m >= 5.5) return "high";
  if (m >= 4) return "mid";
  return "low";
}

const magColor = { low: "#2f9e44", mid: "#f08c00", high: "#e03131", severe: "#862e9c" };

// Same shape the Python / PHP / Java backends return.
function normalize(feature) {
  const p = feature.properties;
  const [lon, lat, depth] = feature.geometry.coordinates;
  return {
    id: feature.id, mag: p.mag, place: p.place || "Unknown", time: p.time,
    lat, lon, depth, url: p.url, tsunami: p.tsunami === 1, alert: p.alert, felt: p.felt,
  };
}

function feedName(period, minmag) {
  const level = { 0: "all", 2.5: "2.5", 4.5: "4.5", 6: "4.5" }[minmag] || "all";
  return `${level}_${period}`;
}

async function fetchQuakes({ period, minmag, q }) {
  const params = new URLSearchParams({ period, minmag, q });
  try {
    const res = await fetch(`api/quakes?${params}`);
    if (res.ok && res.headers.get("content-type")?.includes("json")) {
      return await res.json();
    }
  } catch { /* no backend — fall through */ }

  const res = await fetch(`${USGS_FEED}/${feedName(period, minmag)}.geojson`);
  if (!res.ok) throw new Error(`USGS HTTP ${res.status}`);
  const data = await res.json();
  const needle = q.trim().toLowerCase();
  const quakes = data.features
    .map(normalize)
    .filter((e) => (e.mag ?? 0) >= minmag)
    .filter((e) => !needle || e.place.toLowerCase().includes(needle))
    .sort((a, b) => b.time - a.time);
  return { source: "usgs-direct", generated: Date.now(), count: quakes.length, quakes };
}

function timeAgo(ms) {
  const s = Math.round((Date.now() - ms) / 1000);
  const ago = t("ago");
  if (s < 60) return ago.s(s);
  if (s < 3600) return ago.m(Math.round(s / 60));
  if (s < 86400) return ago.h(Math.round(s / 3600));
  return ago.d(Math.round(s / 86400));
}

const fmtTime = (ms) => new Date(ms).toLocaleString(LOCALES[lang]);

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  Object.assign(node, attrs);
  node.append(...children);
  return node;
}

let lastData = null;

function render(data) {
  lastData = data;
  $("#source").textContent = `source: ${data.source}`;
  const qs = data.quakes;
  const strongest = qs.reduce((m, e) => ((e.mag ?? 0) > (m?.mag ?? -1) ? e : m), null);

  $("#stats").replaceChildren(
    el("div", { className: "stat" }, el("b", { textContent: qs.length }), el("span", { textContent: t("count") })),
    el("div", { className: "stat" }, el("b", { textContent: strongest ? strongest.mag.toFixed(1) : "–" }), el("span", { textContent: t("strongest") })),
    el("div", { className: "stat" }, el("b", { textContent: qs.filter((e) => e.tsunami).length }), el("span", { textContent: t("tsunami") })),
  );

  $("#status").textContent = qs.length
    ? `${t("updated")} ${new Date(data.generated).toLocaleTimeString(LOCALES[lang])}`
    : t("none");

  $("#list").replaceChildren(...qs.slice(0, 200).map((e) => {
    const cls = magClass(e.mag ?? 0);
    const meta = `${fmtTime(e.time)} · ${timeAgo(e.time)} · ${t("depth")} ${e.depth?.toFixed(0)} km`
      + (e.felt ? ` · ${t("felt")(e.felt)}` : "");
    const place = el("div", { className: "place" }, e.place);
    if (e.tsunami) place.append(el("span", { className: "tag", textContent: "TSUNAMI" }));
    if (e.alert) place.append(el("span", { className: "tag", textContent: `ALERT ${e.alert}` }));
    const item = el("li", { className: "quake", title: t("clickMap") },
      el("div", { className: `mag ${cls}`, textContent: (e.mag ?? 0).toFixed(1) }),
      el("div", { className: "info" }, place,
        el("div", { className: "meta" }, meta, " · ",
          el("a", { href: e.url, target: "_blank", rel: "noopener", textContent: t("details") }))),
    );
    item.addEventListener("click", (ev) => {
      if (ev.target.tagName !== "A" && map) map.flyTo([e.lat, e.lon], 6);
    });
    return item;
  }));

  if (layer) {
    layer.clearLayers();
    for (const e of qs) {
      const m = e.mag ?? 0;
      L.circleMarker([e.lat, e.lon], {
        radius: Math.max(3, m * 2.2), color: magColor[magClass(m)], weight: 1, fillOpacity: 0.55,
      }).bindPopup(`<b>M${m.toFixed(1)}</b><br>${escapeHtml(e.place)}<br>${fmtTime(e.time)}`)
        .addTo(layer);
    }
  }
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function load() {
  const f = new FormData(form);
  const opts = { period: f.get("period"), minmag: Number(f.get("minmag")), q: f.get("q") || "" };
  $("#status").textContent = t("loading");
  try {
    render(await fetchQuakes(opts));
  } catch (err) {
    $("#status").textContent = `${t("error")}: ${err.message}`;
  }
}

function renderLinks() {
  const notes = t("linkNotes");
  $("#links").replaceChildren(...LINKS.map((l, i) =>
    el("li", {}, el("a", { href: l.url, target: "_blank", rel: "noopener", textContent: l.name }),
      el("small", { textContent: notes[i] }))));
}

for (const btn of document.querySelectorAll("[data-lang]")) {
  btn.addEventListener("click", () => {
    setLang(btn.dataset.lang);
    renderLinks();
    if (lastData) render(lastData);
  });
}

applyStaticText();
renderLinks();

form.addEventListener("submit", (ev) => { ev.preventDefault(); load(); });
form.addEventListener("change", load);
initMap();
load();
setInterval(load, REFRESH_MS);
