import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.URLDecoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;

/**
 * ZinQuake — Java backend (JDK 17+ only, no dependencies).
 *
 * Run:  java EarthquakeServer.java        -> http://localhost:8003
 * API:  GET /api/quakes?period=day&minmag=2.5&q=myanmar
 *       GET /api/health
 * Also serves the web frontend from ../web.
 */
public class EarthquakeServer {

    static final String USGS_FEED = Optional.ofNullable(System.getenv("USGS_FEED"))
            .orElse("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary");
    static final int PORT = Integer.parseInt(Optional.ofNullable(System.getenv("PORT")).orElse("8003"));
    static final long CACHE_MS = 60_000;
    static final Set<String> PERIODS = Set.of("hour", "day", "week", "month");
    static final Path WEB_DIR = Path.of(System.getProperty("web.dir", "../web")).toAbsolutePath().normalize();

    static final HttpClient HTTP = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(15)).build();
    static final Map<String, Map.Entry<Long, Map<String, Object>>> CACHE = new ConcurrentHashMap<>();

    public static void main(String[] args) throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress(PORT), 0);
        server.createContext("/api/health", ex -> sendJson(ex, 200, Map.of("status", "ok", "source", "java")));
        server.createContext("/api/quakes", EarthquakeServer::handleQuakes);
        server.createContext("/", EarthquakeServer::handleStatic);
        server.setExecutor(Executors.newFixedThreadPool(8));
        server.start();
        System.out.println("ZinQuake (Java) on http://localhost:" + PORT);
    }

    static void handleQuakes(HttpExchange ex) throws IOException {
        Map<String, String> qs = parseQuery(ex.getRequestURI().getRawQuery());
        String period = qs.getOrDefault("period", "day");
        if (!PERIODS.contains(period)) {
            sendJson(ex, 400, Map.of("error", "period must be one of " + new TreeSet<>(PERIODS)));
            return;
        }
        double minmag;
        try {
            minmag = Double.parseDouble(qs.getOrDefault("minmag", "0"));
        } catch (NumberFormatException e) {
            sendJson(ex, 400, Map.of("error", "minmag must be a number"));
            return;
        }
        String needle = qs.getOrDefault("q", "").trim().toLowerCase(Locale.ROOT);

        Map<String, Object> data;
        try {
            data = fetchFeed(feedName(period, minmag));
        } catch (Exception e) {
            sendJson(ex, 502, Map.of("error", "USGS fetch failed: " + e.getMessage()));
            return;
        }

        List<Map<String, Object>> quakes = new ArrayList<>();
        for (Object f : (List<?>) data.getOrDefault("features", List.of())) {
            Map<String, Object> e = normalize(asMap(f));
            double mag = e.get("mag") instanceof Number n ? n.doubleValue() : 0;
            String place = ((String) e.get("place")).toLowerCase(Locale.ROOT);
            if (mag >= minmag && (needle.isEmpty() || place.contains(needle))) quakes.add(e);
        }
        quakes.sort(Comparator.comparingLong((Map<String, Object> e) -> toLong(e.get("time"))).reversed());

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("source", "java");
        body.put("generated", System.currentTimeMillis());
        body.put("count", quakes.size());
        body.put("quakes", quakes);
        sendJson(ex, 200, body);
    }

    static String feedName(String period, double minmag) {
        String level = minmag >= 4.5 ? "4.5" : minmag >= 2.5 ? "2.5" : "all";
        return level + "_" + period;
    }

    static Map<String, Object> fetchFeed(String name) throws IOException, InterruptedException {
        var hit = CACHE.get(name);
        if (hit != null && System.currentTimeMillis() - hit.getKey() < CACHE_MS) return hit.getValue();
        HttpRequest req = HttpRequest.newBuilder(URI.create(USGS_FEED + "/" + name + ".geojson"))
                .timeout(Duration.ofSeconds(15)).header("User-Agent", "ZinQuake/1.0").build();
        HttpResponse<String> res = HTTP.send(req, HttpResponse.BodyHandlers.ofString());
        if (res.statusCode() != 200) throw new IOException("HTTP " + res.statusCode());
        Map<String, Object> data = asMap(new Json(res.body()).parse());
        CACHE.put(name, Map.entry(System.currentTimeMillis(), data));
        return data;
    }

    static Map<String, Object> normalize(Map<String, Object> f) {
        Map<String, Object> p = asMap(f.get("properties"));
        List<?> c = (List<?>) asMap(f.get("geometry")).get("coordinates");
        Map<String, Object> e = new LinkedHashMap<>();
        e.put("id", f.get("id"));
        e.put("mag", p.get("mag"));
        e.put("place", p.get("place") == null ? "Unknown" : p.get("place"));
        e.put("time", p.get("time"));
        e.put("lat", c.get(1));
        e.put("lon", c.get(0));
        e.put("depth", c.get(2));
        e.put("url", p.get("url"));
        e.put("tsunami", p.get("tsunami") instanceof Number n && n.intValue() == 1);
        e.put("alert", p.get("alert"));
        e.put("felt", p.get("felt"));
        return e;
    }

    static void handleStatic(HttpExchange ex) throws IOException {
        String path = ex.getRequestURI().getPath();
        Path file = WEB_DIR.resolve(path.equals("/") ? "index.html" : path.substring(1)).normalize();
        if (!file.startsWith(WEB_DIR) || !Files.isRegularFile(file)) {
            send(ex, 404, "text/plain", "Not found".getBytes(StandardCharsets.UTF_8));
            return;
        }
        String name = file.getFileName().toString();
        String type = name.endsWith(".html") ? "text/html; charset=utf-8"
                : name.endsWith(".css") ? "text/css"
                : name.endsWith(".js") ? "application/javascript"
                : "application/octet-stream";
        send(ex, 200, type, Files.readAllBytes(file));
    }

    // ---- helpers ----

    static void sendJson(HttpExchange ex, int status, Object body) throws IOException {
        ex.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        send(ex, status, "application/json; charset=utf-8", Json.write(body).getBytes(StandardCharsets.UTF_8));
    }

    static void send(HttpExchange ex, int status, String type, byte[] bytes) throws IOException {
        ex.getResponseHeaders().set("Content-Type", type);
        ex.sendResponseHeaders(status, bytes.length);
        try (OutputStream os = ex.getResponseBody()) {
            os.write(bytes);
        }
    }

    static Map<String, String> parseQuery(String raw) {
        Map<String, String> out = new HashMap<>();
        if (raw == null) return out;
        for (String pair : raw.split("&")) {
            int i = pair.indexOf('=');
            String k = URLDecoder.decode(i < 0 ? pair : pair.substring(0, i), StandardCharsets.UTF_8);
            String v = i < 0 ? "" : URLDecoder.decode(pair.substring(i + 1), StandardCharsets.UTF_8);
            out.putIfAbsent(k, v);
        }
        return out;
    }

    @SuppressWarnings("unchecked")
    static Map<String, Object> asMap(Object o) {
        return o instanceof Map ? (Map<String, Object>) o : Map.of();
    }

    static long toLong(Object o) {
        return o instanceof Number n ? n.longValue() : 0L;
    }

    /** Minimal JSON reader/writer so the server needs nothing beyond the JDK. */
    static final class Json {
        private final String s;
        private int i;

        Json(String s) { this.s = s; }

        Object parse() {
            ws();
            char c = s.charAt(i);
            switch (c) {
                case '{': {
                    i++;
                    Map<String, Object> m = new LinkedHashMap<>();
                    ws();
                    if (s.charAt(i) == '}') { i++; return m; }
                    while (true) {
                        ws();
                        String k = str();
                        ws(); expect(':');
                        m.put(k, parse());
                        ws();
                        if (s.charAt(i++) == '}') return m;
                    }
                }
                case '[': {
                    i++;
                    List<Object> l = new ArrayList<>();
                    ws();
                    if (s.charAt(i) == ']') { i++; return l; }
                    while (true) {
                        l.add(parse());
                        ws();
                        if (s.charAt(i++) == ']') return l;
                    }
                }
                case '"': return str();
                case 't': i += 4; return true;
                case 'f': i += 5; return false;
                case 'n': i += 4; return null;
                default: return num();
            }
        }

        private void ws() { while (i < s.length() && Character.isWhitespace(s.charAt(i))) i++; }

        private void expect(char c) {
            if (s.charAt(i++) != c) throw new IllegalArgumentException("Expected '" + c + "' at " + (i - 1));
        }

        private String str() {
            expect('"');
            StringBuilder b = new StringBuilder();
            while (true) {
                char c = s.charAt(i++);
                if (c == '"') return b.toString();
                if (c != '\\') { b.append(c); continue; }
                char e = s.charAt(i++);
                switch (e) {
                    case 'n' -> b.append('\n');
                    case 't' -> b.append('\t');
                    case 'r' -> b.append('\r');
                    case 'b' -> b.append('\b');
                    case 'f' -> b.append('\f');
                    case 'u' -> { b.append((char) Integer.parseInt(s.substring(i, i + 4), 16)); i += 4; }
                    default -> b.append(e);
                }
            }
        }

        private Number num() {
            int start = i;
            while (i < s.length() && "+-0123456789.eE".indexOf(s.charAt(i)) >= 0) i++;
            String n = s.substring(start, i);
            if (n.contains(".") || n.contains("e") || n.contains("E")) return Double.parseDouble(n);
            return Long.parseLong(n);
        }

        static String write(Object o) {
            if (o == null) return "null";
            if (o instanceof String str) return quote(str);
            if (o instanceof Number || o instanceof Boolean) return o.toString();
            StringJoiner j;
            if (o instanceof Map<?, ?> m) {
                j = new StringJoiner(",", "{", "}");
                m.forEach((k, v) -> j.add(quote(k.toString()) + ":" + write(v)));
            } else {
                j = new StringJoiner(",", "[", "]");
                for (Object v : (Collection<?>) o) j.add(write(v));
            }
            return j.toString();
        }

        private static String quote(String str) {
            StringBuilder b = new StringBuilder("\"");
            for (char c : str.toCharArray()) {
                switch (c) {
                    case '"' -> b.append("\\\"");
                    case '\\' -> b.append("\\\\");
                    case '\n' -> b.append("\\n");
                    case '\r' -> b.append("\\r");
                    case '\t' -> b.append("\\t");
                    default -> b.append(c < 0x20 ? String.format("\\u%04x", (int) c) : String.valueOf(c));
                }
            }
            return b.append('"').toString();
        }
    }
}
