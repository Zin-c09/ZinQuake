"""ZinQuake — Python backend (standard library only).

Run:  python3 server.py            -> http://localhost:8001
API:  GET /api/quakes?period=day&minmag=2.5&q=myanmar
      GET /api/health
Also serves the web frontend from ../web.
"""

import json
import os
import time
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

USGS_FEED = os.environ.get(
    "USGS_FEED", "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary"
)
PORT = int(os.environ.get("PORT", "8001"))
WEB_DIR = Path(__file__).resolve().parent.parent / "web"
CACHE_SECONDS = 60
PERIODS = {"hour", "day", "week", "month"}

_cache: dict[str, tuple[float, dict]] = {}


def feed_name(period: str, minmag: float) -> str:
    if minmag >= 4.5:
        level = "4.5"
    elif minmag >= 2.5:
        level = "2.5"
    else:
        level = "all"
    return f"{level}_{period}"


def fetch_feed(name: str) -> dict:
    hit = _cache.get(name)
    if hit and time.time() - hit[0] < CACHE_SECONDS:
        return hit[1]
    req = urllib.request.Request(
        f"{USGS_FEED}/{name}.geojson", headers={"User-Agent": "ZinQuake/1.0"}
    )
    with urllib.request.urlopen(req, timeout=15) as res:
        data = json.load(res)
    _cache[name] = (time.time(), data)
    return data


def normalize(feature: dict) -> dict:
    p = feature["properties"]
    lon, lat, depth = feature["geometry"]["coordinates"][:3]
    return {
        "id": feature["id"],
        "mag": p.get("mag"),
        "place": p.get("place") or "Unknown",
        "time": p.get("time"),
        "lat": lat,
        "lon": lon,
        "depth": depth,
        "url": p.get("url"),
        "tsunami": p.get("tsunami") == 1,
        "alert": p.get("alert"),
        "felt": p.get("felt"),
    }


def get_quakes(period: str, minmag: float, q: str) -> dict:
    data = fetch_feed(feed_name(period, minmag))
    needle = q.strip().lower()
    quakes = [
        e
        for e in map(normalize, data.get("features", []))
        if (e["mag"] or 0) >= minmag and (not needle or needle in e["place"].lower())
    ]
    quakes.sort(key=lambda e: e["time"] or 0, reverse=True)
    return {
        "source": "python",
        "generated": int(time.time() * 1000),
        "count": len(quakes),
        "quakes": quakes,
    }


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB_DIR), **kwargs)

    def send_json(self, status: int, body: dict) -> None:
        payload = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        url = urlparse(self.path)
        if url.path == "/api/health":
            return self.send_json(200, {"status": "ok", "source": "python"})
        if url.path == "/api/quakes":
            qs = parse_qs(url.query)
            period = qs.get("period", ["day"])[0]
            if period not in PERIODS:
                return self.send_json(400, {"error": f"period must be one of {sorted(PERIODS)}"})
            try:
                minmag = float(qs.get("minmag", ["0"])[0])
            except ValueError:
                return self.send_json(400, {"error": "minmag must be a number"})
            try:
                return self.send_json(200, get_quakes(period, minmag, qs.get("q", [""])[0]))
            except Exception as exc:  # upstream/network failure
                return self.send_json(502, {"error": f"USGS fetch failed: {exc}"})
        return super().do_GET()


if __name__ == "__main__":
    print(f"ZinQuake (Python) on http://localhost:{PORT}")
    ThreadingHTTPServer(("", PORT), Handler).serve_forever()
