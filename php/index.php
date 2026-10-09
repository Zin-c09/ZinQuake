<?php
// ZinQuake — PHP backend (no extensions beyond the defaults).
//
// Run:  php -S localhost:8002 index.php      -> http://localhost:8002
// API:  GET /api/quakes?period=day&minmag=2.5&q=myanmar
//       GET /api/health
// Also serves the web frontend from ../web.

declare(strict_types=1);

const CACHE_SECONDS = 60;
const PERIODS = ['hour', 'day', 'week', 'month'];
$usgsFeed = getenv('USGS_FEED') ?: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary';
$webDir = realpath(__DIR__ . '/../web');

function send_json(int $status, array $body): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Access-Control-Allow-Origin: *');
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

function feed_name(string $period, float $minmag): string
{
    $level = $minmag >= 4.5 ? '4.5' : ($minmag >= 2.5 ? '2.5' : 'all');
    return "{$level}_{$period}";
}

function fetch_feed(string $base, string $name): array
{
    $cacheFile = sys_get_temp_dir() . "/zinquake_{$name}.json";
    if (is_file($cacheFile) && time() - filemtime($cacheFile) < CACHE_SECONDS) {
        return json_decode((string) file_get_contents($cacheFile), true);
    }
    $ctx = stream_context_create(['http' => ['timeout' => 15, 'header' => "User-Agent: ZinQuake/1.0\r\n"]]);
    $raw = @file_get_contents("{$base}/{$name}.geojson", false, $ctx);
    if ($raw === false) {
        throw new RuntimeException(error_get_last()['message'] ?? 'request failed');
    }
    $data = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
    file_put_contents($cacheFile, $raw);
    return $data;
}

function normalize(array $f): array
{
    $p = $f['properties'];
    [$lon, $lat, $depth] = $f['geometry']['coordinates'];
    return [
        'id' => $f['id'],
        'mag' => $p['mag'] ?? null,
        'place' => $p['place'] ?? 'Unknown',
        'time' => $p['time'] ?? null,
        'lat' => $lat,
        'lon' => $lon,
        'depth' => $depth,
        'url' => $p['url'] ?? null,
        'tsunami' => ($p['tsunami'] ?? 0) === 1,
        'alert' => $p['alert'] ?? null,
        'felt' => $p['felt'] ?? null,
    ];
}

$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: '/';

if ($path === '/api/health') {
    send_json(200, ['status' => 'ok', 'source' => 'php']);
    return;
}

if ($path === '/api/quakes') {
    $period = $_GET['period'] ?? 'day';
    if (!in_array($period, PERIODS, true)) {
        send_json(400, ['error' => 'period must be one of ' . implode(', ', PERIODS)]);
        return;
    }
    $minmagRaw = $_GET['minmag'] ?? '0';
    if (!is_numeric($minmagRaw)) {
        send_json(400, ['error' => 'minmag must be a number']);
        return;
    }
    $minmag = (float) $minmagRaw;
    $needle = mb_strtolower(trim((string) ($_GET['q'] ?? '')));

    try {
        $data = fetch_feed($usgsFeed, feed_name($period, $minmag));
    } catch (Throwable $e) {
        send_json(502, ['error' => 'USGS fetch failed: ' . $e->getMessage()]);
        return;
    }

    $quakes = array_values(array_filter(
        array_map('normalize', $data['features'] ?? []),
        fn(array $e) => ($e['mag'] ?? 0) >= $minmag
            && ($needle === '' || str_contains(mb_strtolower($e['place']), $needle))
    ));
    usort($quakes, fn($a, $b) => ($b['time'] ?? 0) <=> ($a['time'] ?? 0));

    send_json(200, [
        'source' => 'php',
        'generated' => (int) (microtime(true) * 1000),
        'count' => count($quakes),
        'quakes' => $quakes,
    ]);
    return;
}

// Static frontend files.
$file = realpath($webDir . ($path === '/' ? '/index.html' : $path));
if ($file === false || !str_starts_with($file, $webDir . DIRECTORY_SEPARATOR) || !is_file($file)) {
    http_response_code(404);
    echo 'Not found';
    return;
}
$types = ['html' => 'text/html', 'css' => 'text/css', 'js' => 'application/javascript', 'svg' => 'image/svg+xml'];
header('Content-Type: ' . ($types[pathinfo($file, PATHINFO_EXTENSION)] ?? 'application/octet-stream'));
readfile($file);
