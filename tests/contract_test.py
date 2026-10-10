"""Contract test: the Python, PHP and Java backends must return the same answers.

It starts a fake USGS feed with sample earthquakes, runs every backend against it,
calls the same API URLs on each and compares the results.

Run:  python3 tests/contract_test.py
Needs python3, php and java on PATH (a missing one is skipped, unless REQUIRE_ALL=1).
"""

import http.client
import json
import os
import random
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NOW_MS = int(time.time() * 1000)


def sample_feed() -> dict:
    """About 40 quakes in the last day, plus a few fixed ones the cases below rely on."""
    rnd = random.Random(42)
    places = ["Sagaing, Myanmar", "Hokkaido, Japan", "Sumatra, Indonesia", "Chiang Rai, Thailand",
              "Alaska Peninsula", "Tonga Islands", "Central California"]
    feats = []
    for i in range(40):
        feats.append(feature(f"s{i}", round(rnd.uniform(1.0, 6.4), 1),
                             f"{rnd.randint(2, 90)} km N of {rnd.choice(places)}",
                             rnd.uniform(-60, 60), rnd.uniform(-180, 180), rnd.uniform(1, 300),
                             minutes_ago=rnd.randint(1, 1400)))
    feats += [
        feature("mm1", 5.6, "40 km NW of Sagaing, Myanmar", 22.2, 95.9, 10, minutes_ago=20, felt=12),
        feature("to1", 7.1, "Tonga Islands", -20.0, -175.0, 100, minutes_ago=50, tsunami=1, alert="yellow"),
        feature("jp1", 3.1, 'Hokkaido, Japan "region"', 43.0, 142.0, 30, minutes_ago=30),
        feature("nm1", None, "Unknown magnitude event", 0.0, 0.0, 5, minutes_ago=5),
    ]
    return {"type": "FeatureCollection", "features": feats}


def feature(fid, mag, place, lat, lon, depth, minutes_ago, tsunami=0, alert=None, felt=None):
    return {
        "type": "Feature", "id": fid,
        "properties": {"mag": mag, "place": place, "time": NOW_MS - minutes_ago * 60_000,
                       "url": f"https://earthquake.usgs.gov/earthquakes/eventpage/{fid}",
                       "tsunami": tsunami, "alert": alert, "felt": felt},
        "geometry": {"type": "Point", "coordinates": [round(lon, 3), round(lat, 3), round(depth, 2)]},
    }


FEED = sample_feed()


class FakeUSGS(BaseHTTPRequestHandler):
    def do_GET(self):
        body = json.dumps(FEED).encode() if self.path.endswith(".geojson") else b"{}"
        self.send_response(200 if self.path.endswith(".geojson") else 404)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


def start_fake_usgs() -> str:
    server = ThreadingHTTPServer(("127.0.0.1", 0), FakeUSGS)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return f"http://127.0.0.1:{server.server_address[1]}/summary"


def free_port() -> int:
    import socket
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def start_backends(feed_url: str) -> dict:
    tmp = tempfile.mkdtemp(prefix="zinquake-test-")  # fresh PHP cache dir
    env = {**os.environ, "USGS_FEED": feed_url, "TMPDIR": tmp}
    specs = {
        "python": ("python3", lambda p: ["python3", "server.py"], ROOT / "python"),
        "php": ("php", lambda p: ["php", "-S", f"127.0.0.1:{p}", "index.php"], ROOT / "php"),
        "java": ("java", lambda p: ["java", "EarthquakeServer.java"], ROOT / "java"),
    }
    running = {}
    for name, (exe, cmd, cwd) in specs.items():
        if not shutil.which(exe):
            if os.environ.get("REQUIRE_ALL") == "1":
                sys.exit(f"FAIL: {exe} not installed")
            print(f"SKIP {name}: {exe} not installed")
            continue
        port = free_port()
        proc = subprocess.Popen(cmd(port), cwd=cwd, env={**env, "PORT": str(port)},
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        running[name] = (f"http://127.0.0.1:{port}", proc)
    for name, (base, proc) in running.items():
        for _ in range(120):  # Java compiles on start, give it up to 30 s
            try:
                urllib.request.urlopen(base + "/api/health", timeout=1)
                break
            except (urllib.error.URLError, ConnectionError, OSError):
                time.sleep(0.25)
        else:
            sys.exit(f"FAIL: {name} backend did not start")
    return running


def get(base: str, path: str):
    try:
        with urllib.request.urlopen(base + path, timeout=10) as res:
            return res.status, json.load(res)
    except urllib.error.HTTPError as err:
        return err.code, json.loads(err.read() or b"{}")


def raw_status(base: str, path: str) -> int:
    """Send the path as-is (no normalising of ../) to test path traversal."""
    host, port = base.removeprefix("http://").split(":")
    conn = http.client.HTTPConnection(host, int(port), timeout=10)
    conn.request("GET", path)
    return conn.getresponse().status


def expected(minmag: float, q: str = "") -> list:
    """What every backend should return, computed independently here."""
    out = [f["id"] for f in FEED["features"]
           if (f["properties"]["mag"] or 0) >= minmag and q.lower() in f["properties"]["place"].lower()]
    times = {f["id"]: f["properties"]["time"] for f in FEED["features"]}
    return sorted(out, key=lambda i: times[i], reverse=True)


CASES = [
    ("/api/quakes", 0, ""),
    ("/api/quakes?period=day&minmag=2.5", 2.5, ""),
    ("/api/quakes?period=week&minmag=4.5", 4.5, ""),
    ("/api/quakes?period=month&minmag=6", 6, ""),
    ("/api/quakes?minmag=0&q=myanmar", 0, "myanmar"),
    ("/api/quakes?q=JAPAN", 0, "japan"),
    ("/api/quakes?q=%E6%97%A5%E6%9C%AC", 0, "日本"),  # unicode search, no matches
]


def main() -> int:
    backends = start_backends(start_fake_usgs())
    failures = []
    check = lambda ok, msg: ok or failures.append(msg)
    try:
        for path, minmag, q in CASES:
            want = expected(minmag, q)
            answers = {}
            for name, (base, _) in backends.items():
                status, body = get(base, path)
                check(status == 200, f"{name} {path}: HTTP {status}")
                got = [e["id"] for e in body.get("quakes", [])]
                check(got == want, f"{name} {path}: ids {got[:5]}… != expected {want[:5]}…")
                check(body.get("count") == len(want), f"{name} {path}: count {body.get('count')} != {len(want)}")
                check(body.get("source") == name, f"{name} {path}: source {body.get('source')!r}")
                answers[name] = body.get("quakes")
            first = next(iter(answers.values()), None)
            for name, quakes in answers.items():
                check(quakes == first, f"{name} {path}: quake fields differ from the other backends")
            print(f"  {'ok ' if not failures else '...'} {path}  -> {len(want)} quakes")

        for name, (base, _) in backends.items():
            check(get(base, "/api/quakes?period=year")[0] == 400, f"{name}: bad period should be 400")
            check(get(base, "/api/quakes?minmag=abc")[0] == 400, f"{name}: bad minmag should be 400")
            check(raw_status(base, "/") == 200, f"{name}: index page should be 200")
            check(raw_status(base, "/../python/server.py") == 404, f"{name}: path traversal should be 404")
            tsunami = [e for e in get(base, "/api/quakes")[1]["quakes"] if e["id"] == "to1"]
            check(tsunami and tsunami[0]["tsunami"] is True, f"{name}: tsunami flag should be true")
    finally:
        for _, proc in backends.values():
            proc.terminate()

    names = ", ".join(backends) or "none"
    if failures:
        print(f"\nFAILED ({len(failures)}) — backends: {names}")
        for f in failures:
            print("  -", f)
        return 1
    print(f"\nPASSED — {len(CASES)} API cases + error/security checks on: {names}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
