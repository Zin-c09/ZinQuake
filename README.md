# 🌏 ZinQuake — ငလျင်သတင်း App

[![CI](https://github.com/Zin-c09/ZinQuake/actions/workflows/ci.yml/badge.svg)](https://github.com/Zin-c09/ZinQuake/actions/workflows/ci.yml)

USGS ရဲ့ free API (key မလို) ကနေ ကမ္ဘာ့ ငလျင်သတင်းကို live ပြတဲ့ web app။
Backend ကို **Python / PHP / Java** ကြိုက်တာ ရွေးသုံးလို့ရပြီး သုံးခုလုံး API တူတူပဲ။

- 📰 နောက်ဆုံး ငလျင်စာရင်း (magnitude, နေရာ, အနက်, ဘယ်နှစ်မိနစ်အရင်, Tsunami / Alert tag)
- 🗺️ Leaflet map ပေါ်မှာ ပြ — စာရင်းကို နှိပ်ရင် အဲ့နေရာကို zoom
- 🔎 ကာလ (၁ နာရီ / ရက် / ပတ် / လ), Magnitude, နေရာ (ဥပမာ `Myanmar`) နဲ့ filter
- 🔄 60 စက္ကန့်တိုင်း auto-refresh
- 📈 Chart ၂ ခု — အချိန်အလိုက် ငလျင်အရေအတွက် နဲ့ Magnitude အလိုက် (mouse တင်ရင် အရေအတွက် ပြ)
- 🏆 အပြင်းဆုံး ငလျင်ကို ထိပ်ဆုံးမှာ highlight
- 🗺️ ဒေသ ရွေး (ကမ္ဘာ / မြန်မာ / ဂျပန် / ထိုင်း / အင်ဒိုနီးရှား) — map က အဲ့ဒေသကို zoom
- 📍 **ကျွန်ုပ်အနီး** — GPS တည်နေရာကနေ ငလျင်တစ်ခုချင်းဆီ အကွာအဝေး (haversine formula) တွက်ပြီး အနီးဆုံးကို စီ
- 🔔 M5+ သတိပေးချက် — ငလျင်အသစ် M5 နဲ့အထက် ဝင်လာရင် browser notification + အသံ
- ⬇ CSV download — လက်ရှိစာရင်းကို Excel မှာ ဖွင့်လို့ရ
- 🧪 Automated test + GitHub Actions CI — Python / PHP / Java ၃ ခုလုံး အဖြေတူမတူ အလိုအလျောက် စစ်
- 🌐 ဘာသာစကား ၃ မျိုး — **မြန်မာ / English / 日本語** (ညာဘက်အပေါ် ခလုတ်နဲ့ ပြောင်း၊ ရွေးထားတာကို မှတ်ထား)
- 🔗 အသုံးဝင် website / API link များ (USGS, EMSC, GDACS, Myanmar DMH, JMA, TMD, Tsunami.gov…)
- 🛟 ငလျင်လှုပ်ရင် လုပ်ရမယ့် အချက်များ

## Run

| Backend | Command | URL |
| --- | --- | --- |
| Python 3.9+ (stdlib only) | `cd python && python3 server.py` | http://localhost:8001 |
| PHP 8+ | `cd php && php -S localhost:8002 index.php` | http://localhost:8002 |
| Java 17+ (JDK only) | `cd java && java EarthquakeServer.java` | http://localhost:8003 |
| Backend မပါ (static) | `cd web && python3 -m http.server` | http://localhost:8000 |

**GitHub Pages:** Settings → Pages → Branch `main` / root ရွေးရင် `https://zin-c09.github.io/ZinQuake/` မှာ သုံးလို့ရ။

Backend မရှိရင် (GitHub Pages ပေါ်တင်ထားရင်လည်း) frontend က USGS API ကို တိုက်ရိုက်ခေါ်ပါတယ်။
`PORT` env var နဲ့ port ပြောင်းလို့ရ။

## API (Python / PHP / Java သုံးခုလုံး တူ)

```
GET /api/quakes?period=day&minmag=2.5&q=myanmar
GET /api/health
```

| Param | Values | Default |
| --- | --- | --- |
| `period` | `hour` `day` `week` `month` | `day` |
| `minmag` | number (e.g. `4.5`) | `0` |
| `q` | နေရာနာမည် ရှာရန် (case-insensitive) | — |

```json
{
  "source": "python",
  "generated": 1791535338586,
  "count": 1,
  "quakes": [
    { "id": "us7000abcd", "mag": 5.6, "place": "40 km NW of Sagaing, Myanmar",
      "time": 1791534127748, "lat": 22.2, "lon": 95.9, "depth": 10,
      "url": "https://earthquake.usgs.gov/earthquakes/eventpage/us7000abcd",
      "tsunami": false, "alert": null, "felt": 12 }
  ]
}
```

USGS response ကို 60 စက္ကန့် cache လုပ်ထားလို့ USGS ကို ခဏခဏ မခေါ်ပါဘူး။

## Data source

- USGS GeoJSON feed: https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php
- `USGS_FEED` env var နဲ့ feed base URL ပြောင်းလို့ရ (testing အတွက်)

## Test

```bash
python3 tests/contract_test.py
```

Sample ငလျင် ၄၄ ခုပါတဲ့ fake USGS server တစ်ခု run ပြီး Python / PHP / Java backend ၃ ခုလုံးကို
URL ၇ မျိုးနဲ့ ခေါ်ကာ အဖြေ (ids, count, field တိုင်း) တူမတူ စစ်တယ်။ မှားတဲ့ input → 400၊
path traversal (`/../python/server.py`) → 404 ဖြစ်မဖြစ်လည်း စစ်တယ်။ GitHub ပေါ် push တိုင်း
[CI](.github/workflows/ci.yml) က အလိုအလျောက် run ပါတယ်။

