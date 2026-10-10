// ZinQuake frontend.
// Uses the local backend (/api/quakes — Python, PHP or Java) when one is running,
// otherwise calls the USGS feed directly (USGS allows CORS), so it also works on GitHub Pages.

const USGS_FEED = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary";
const REFRESH_MS = 60_000;
const ALERT_MAG = 5;

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

// Bounding boxes: [[south, west], [north, east]]. Names come from I18N[lang].regions.
const REGIONS = {
  world: null,
  myanmar: [[9.5, 92.1], [28.6, 101.2]],
  japan: [[24.0, 122.9], [45.6, 146.0]],
  thailand: [[5.6, 97.3], [20.5, 105.7]],
  indonesia: [[-11.0, 95.0], [6.1, 141.0]],
};

const $ = (sel) => document.querySelector(sel);
const form = $("#filters");
let map, layer, userMarker;
let lastData = null;
let userPos = null; // { lat, lon } after "Near me"
let alertsOn = false;
let seenIds = null; // ids already shown, so alerts fire only for new quakes

// ---------- map ----------

function initMap() {
  if (!window.L) return; // Leaflet failed to load (offline) — list still works.
  map = L.map("map", { worldCopyJump: true }).setView([20, 96], 3);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 12,
    attribution: "&copy; OpenStreetMap",
  }).addTo(map);
  layer = L.layerGroup().addTo(map);

  const legend = L.control({ position: "bottomright" });
  legend.onAdd = () => {
    const div = L.DomUtil.create("div", "legend");
    div.id = "legend";
    return div;
  };
  legend.addTo(map);
}

function renderLegend() {
  const box = $("#legend");
  if (!box) return;
  const rows = [["severe", "7+"], ["high", "5.5–7"], ["mid", "4–5.5"], ["low", "< 4"]];
  box.replaceChildren(el("b", { textContent: t("legend") }),
    ...rows.map(([cls, label]) => el("div", {}, el("i", { className: `dot ${cls}` }), label)));
}

function magClass(m) {
  if (m >= 7) return "severe";
  if (m >= 5.5) return "high";
  if (m >= 4) return "mid";
  return "low";
}

const magColor = { low: "#2f9e44", mid: "#f08c00", high: "#e03131", severe: "#862e9c" };

// ---------- data ----------

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
  const level = minmag >= 4.5 ? "4.5" : minmag >= 2.5 ? "2.5" : "all";
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

// Great-circle distance in km (haversine formula).
function distanceKm(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

function inRegion(e, box) {
  if (!box) return true;
  const [[s, w], [n, east]] = box;
  return e.lat >= s && e.lat <= n && e.lon >= w && e.lon <= east;
}

// Region filter, distance and sort are applied in the browser on top of the API result.
function currentView() {
  const f = new FormData(form);
  const box = REGIONS[f.get("region")] ?? null;
  const sort = f.get("sort");
  const qs = lastData.quakes
    .filter((e) => inRegion(e, box))
    .map((e) => ({ ...e, km: userPos ? distanceKm(userPos, e) : null }));
  if (sort === "mag") qs.sort((a, b) => (b.mag ?? 0) - (a.mag ?? 0));
  else if (sort === "near" && userPos) qs.sort((a, b) => a.km - b.km);
  else qs.sort((a, b) => b.time - a.time);
  return qs;
}

// ---------- helpers ----------

function timeAgo(ms) {
  const s = Math.round((Date.now() - ms) / 1000);
  const ago = t("ago");
  if (s < 60) return ago.s(s);
  if (s < 3600) return ago.m(Math.round(s / 60));
  if (s < 86400) return ago.h(Math.round(s / 3600));
  return ago.d(Math.round(s / 86400));
}

const fmtTime = (ms) => new Date(ms).toLocaleString(LOCALES[lang]);
const fmtKm = (km) => Math.round(km).toLocaleString(LOCALES[lang]);

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  Object.assign(node, attrs);
  node.append(...children);
  return node;
}

function svgEl(tag, attrs = {}) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function flyTo(e) {
  if (map) map.flyTo([e.lat, e.lon], 6);
  $("#map").scrollIntoView({ behavior: "smooth", block: "center" });
}

// ---------- render ----------

function render() {
  if (!lastData) return;
  $("#source").textContent = `source: ${lastData.source}`;
  const qs = currentView();
  const strongest = qs.reduce((m, e) => ((e.mag ?? 0) > (m?.mag ?? -1) ? e : m), null);
  const nearest = userPos && qs.length ? qs.reduce((m, e) => (e.km < m.km ? e : m)) : null;

  const stat = (value, label) => el("div", { className: "stat" }, el("b", { textContent: value }), el("span", { textContent: label }));
  $("#stats").replaceChildren(
    stat(qs.length, t("count")),
    stat(strongest ? strongest.mag.toFixed(1) : "–", t("strongest")),
    stat(qs.filter((e) => e.tsunami).length, t("tsunami")),
    ...(nearest ? [stat(`${fmtKm(nearest.km)} km`, t("nearest"))] : []),
  );

  renderHero(strongest);

  $("#status").textContent = qs.length
    ? `${t("updated")} ${new Date(lastData.generated).toLocaleTimeString(LOCALES[lang])}`
    : t("none");

  $("#list").replaceChildren(...qs.slice(0, 200).map((e) => {
    const cls = magClass(e.mag ?? 0);
    const meta = `${fmtTime(e.time)} · ${timeAgo(e.time)} · ${t("depth")} ${e.depth?.toFixed(0)} km`
      + (e.felt ? ` · ${t("felt")(e.felt)}` : "")
      + (e.km != null ? ` · 📍 ${t("away")(fmtKm(e.km))}` : "");
    const place = el("div", { className: "place" }, e.place);
    if (e.tsunami) place.append(el("span", { className: "tag", textContent: "TSUNAMI" }));
    if (e.alert) place.append(el("span", { className: "tag", textContent: `ALERT ${e.alert}` }));
    const item = el("li", { className: "quake", title: t("clickMap") },
      el("div", { className: `mag ${cls}`, textContent: (e.mag ?? 0).toFixed(1) }),
      el("div", { className: "info" }, place,
        el("div", { className: "meta" }, meta, " · ",
          el("a", { href: e.url, target: "_blank", rel: "noopener", textContent: t("details") }))),
    );
    item.addEventListener("click", (ev) => { if (ev.target.tagName !== "A") flyTo(e); });
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

  renderTimeChart(qs);
  renderMagChart(qs);
  renderLegend();
}

function renderHero(e) {
  const hero = $("#hero");
  hero.hidden = !e;
  if (!e) return;
  const tags = el("div", { className: "hero-tags" });
  if (e.tsunami) tags.append(el("span", { className: "tag", textContent: "TSUNAMI" }));
  if (e.alert) tags.append(el("span", { className: "tag", textContent: `ALERT ${e.alert}` }));
  hero.replaceChildren(
    el("div", { className: `mag big ${magClass(e.mag ?? 0)}`, textContent: (e.mag ?? 0).toFixed(1) }),
    el("div", { className: "info" },
      el("div", { className: "hero-label", textContent: t("biggest") }),
      el("div", { className: "place", textContent: e.place }),
      el("div", { className: "meta", textContent: `${fmtTime(e.time)} · ${timeAgo(e.time)} · ${t("depth")} ${e.depth?.toFixed(0)} km` }),
      tags,
      el("button", { type: "button", className: "ghost", textContent: `🗺️ ${t("showOnMap")}`, onclick: () => flyTo(e) })),
  );
}

// ---------- charts (hand-drawn SVG bar charts) ----------

function bucketsForPeriod(period) {
  // [bucket size in ms, number of buckets]
  return { hour: [5 * 60e3, 12], day: [3600e3, 24], week: [86400e3, 7], month: [86400e3, 30] }[period];
}

function renderTimeChart(qs) {
  const period = new FormData(form).get("period");
  const [size, n] = bucketsForPeriod(period);
  const end = Math.ceil(Date.now() / size) * size;
  const start = end - n * size;
  const bins = Array.from({ length: n }, (_, i) => ({ from: start + i * size, count: 0 }));
  for (const e of qs) {
    const i = Math.floor((e.time - start) / size);
    if (i >= 0 && i < n) bins[i].count++;
  }
  const opts = period === "week" || period === "month"
    ? { month: "numeric", day: "numeric" }
    : { hour: "2-digit", minute: "2-digit" };
  const label = (b) => new Date(b.from).toLocaleString(LOCALES[lang], opts);
  barChart($("#chart-time"), bins.map((b) => ({ label: label(b), count: b.count })), Math.ceil(n / 6));
}

function renderMagChart(qs) {
  const edges = [[-Infinity, 3, "< 3"], [3, 4, "3–4"], [4, 5, "4–5"], [5, 6, "5–6"], [6, 7, "6–7"], [7, Infinity, "7+"]];
  const bins = edges.map(([lo, hi, label]) => ({
    label, count: qs.filter((e) => (e.mag ?? 0) >= lo && (e.mag ?? 0) < hi).length,
  }));
  barChart($("#chart-mag"), bins, 1);
}

// One series, one hue: bars with 4px rounded tops, recessive grid, hover tooltip per bar.
function barChart(host, bins, labelEvery) {
  const W = 480, H = 200, pad = { l: 32, r: 8, t: 10, b: 28 };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const max = Math.max(1, ...bins.map((b) => b.count));
  const step = max <= 5 ? 1 : Math.ceil(max / 4);
  const top = Math.ceil(max / step) * step;
  const y = (v) => pad.t + ih - (v / top) * ih;
  const slot = iw / bins.length, gap = Math.min(8, slot * 0.25), bw = slot - gap;

  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": host.previousElementSibling?.textContent ?? "chart" });
  for (let v = 0; v <= top; v += step) {
    svg.append(svgEl("line", { x1: pad.l, x2: W - pad.r, y1: y(v), y2: y(v), class: v === 0 ? "axis" : "grid" }));
    const tick = svgEl("text", { x: pad.l - 6, y: y(v) + 4, "text-anchor": "end", class: "tick" });
    tick.textContent = v;
    svg.append(tick);
  }
  bins.forEach((b, i) => {
    const x = pad.l + i * slot + gap / 2;
    if (b.count > 0) {
      const h = y(0) - y(b.count), r = Math.min(4, h, bw / 2);
      svg.append(svgEl("path", {
        class: "bar",
        d: `M${x} ${y(0)}V${y(0) - h + r}Q${x} ${y(0) - h} ${x + r} ${y(0) - h}H${x + bw - r}Q${x + bw} ${y(0) - h} ${x + bw} ${y(0) - h + r}V${y(0)}Z`,
      }));
    }
    if (i % labelEvery === 0) {
      const lbl = svgEl("text", { x: x + bw / 2, y: H - 8, "text-anchor": "middle", class: "tick" });
      lbl.textContent = b.label;
      svg.append(lbl);
    }
    // Full-height hit target, bigger than the bar.
    const hit = svgEl("rect", { x: pad.l + i * slot, y: pad.t, width: slot, height: ih, class: "hit" });
    hit.addEventListener("mouseenter", (ev) => showTip(ev, `${b.label}: ${t("quakesN")(b.count)}`));
    hit.addEventListener("mousemove", moveTip);
    hit.addEventListener("mouseleave", hideTip);
    svg.append(hit);
  });
  host.replaceChildren(svg);
}

const tip = $("#tooltip");
function showTip(ev, text) { tip.textContent = text; tip.hidden = false; moveTip(ev); }
function moveTip(ev) { tip.style.left = `${ev.clientX + 12}px`; tip.style.top = `${ev.clientY - 36}px`; }
function hideTip() { tip.hidden = true; }

// ---------- near me ----------

function locate() {
  if (!navigator.geolocation) return toast(t("geoError"));
  $("#status").textContent = t("locating");
  navigator.geolocation.getCurrentPosition((pos) => {
    userPos = { lat: pos.coords.latitude, lon: pos.coords.longitude };
    form.elements.sort.querySelector('[value="near"]').disabled = false;
    form.elements.sort.value = "near";
    $("#near-me").setAttribute("aria-pressed", "true");
    if (map) {
      userMarker?.remove();
      userMarker = L.marker([userPos.lat, userPos.lon], { title: "📍" }).addTo(map);
      map.setView([userPos.lat, userPos.lon], 5);
    }
    render();
  }, () => { toast(t("geoError")); render(); }, { timeout: 10_000 });
}

// ---------- alerts for new strong quakes ----------

function checkNewQuakes(quakes) {
  const fresh = seenIds ? quakes.filter((e) => !seenIds.has(e.id)) : [];
  seenIds = new Set(quakes.map((e) => e.id));
  if (!alertsOn) return;
  for (const e of fresh.filter((q) => (q.mag ?? 0) >= ALERT_MAG)) {
    const text = t("newQuake")(e.mag.toFixed(1), e.place);
    toast(text);
    beep();
    if ("Notification" in window && Notification.permission === "granted") new Notification("ZinQuake", { body: text });
  }
}

async function toggleAlerts() {
  alertsOn = !alertsOn;
  if (alertsOn && "Notification" in window && Notification.permission === "default") {
    try { await Notification.requestPermission(); } catch { /* in-page toast still works */ }
  }
  const btn = $("#alerts");
  btn.setAttribute("aria-pressed", String(alertsOn));
  btn.textContent = alertsOn ? t("alertsOn") : t("alerts");
}

function beep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    osc.frequency.value = 880;
    osc.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  } catch { /* audio blocked */ }
}

let toastTimer;
function toast(text) {
  const box = $("#toast");
  box.textContent = text;
  box.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { box.hidden = true; }, 8000);
}

// ---------- CSV export ----------

function downloadCsv() {
  if (!lastData) return;
  const cols = ["time", "mag", "place", "lat", "lon", "depth", "tsunami", "url"];
  const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = currentView().map((e) =>
    cols.map((c) => cell(c === "time" ? new Date(e.time).toISOString() : e[c])).join(","));
  const blob = new Blob(["﻿" + [cols.join(","), ...rows].join("\n")], { type: "text/csv" });
  const a = el("a", { href: URL.createObjectURL(blob), download: `zinquake-${new Date().toISOString().slice(0, 10)}.csv` });
  a.click();
  URL.revokeObjectURL(a.href);
}

// ---------- load + wiring ----------

async function load() {
  const f = new FormData(form);
  const opts = { period: f.get("period"), minmag: Number(f.get("minmag")), q: f.get("q") || "" };
  $("#status").textContent = t("loading");
  try {
    lastData = await fetchQuakes(opts);
    checkNewQuakes(lastData.quakes);
    render();
  } catch (err) {
    $("#status").textContent = `${t("error")}: ${err.message}`;
  }
}

function renderRegionOptions() {
  const select = $("#region");
  const current = select.value || "world";
  const names = t("regions");
  select.replaceChildren(...Object.keys(REGIONS).map((k) => el("option", { value: k, textContent: names[k] })));
  select.value = current;
}

function renderLinks() {
  const notes = t("linkNotes");
  $("#links").replaceChildren(...LINKS.map((l, i) =>
    el("li", {}, el("a", { href: l.url, target: "_blank", rel: "noopener", textContent: l.name }),
      el("small", { textContent: notes[i] }))));
}

function applyLanguage() {
  applyStaticText();
  renderRegionOptions();
  renderLinks();
  $("#alerts").textContent = alertsOn ? t("alertsOn") : t("alerts");
  render();
}

for (const btn of document.querySelectorAll("[data-lang]")) {
  btn.addEventListener("click", () => { setLang(btn.dataset.lang); applyLanguage(); });
}

form.addEventListener("submit", (ev) => { ev.preventDefault(); load(); });
form.addEventListener("change", (ev) => {
  // Region and sort only change the view; the rest need new data.
  if (ev.target.name === "region") {
    const box = REGIONS[ev.target.value];
    if (map) box ? map.fitBounds(box) : map.setView([20, 96], 3);
    render();
  } else if (ev.target.name === "sort") {
    render();
  } else {
    load();
  }
});
$("#near-me").addEventListener("click", locate);
$("#alerts").addEventListener("click", toggleAlerts);
$("#csv").addEventListener("click", downloadCsv);

initMap();
applyLanguage();
load();
setInterval(load, REFRESH_MS);
