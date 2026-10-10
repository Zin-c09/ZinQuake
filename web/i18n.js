// UI text for Myanmar / English / Japanese.
// Static HTML text uses data-i18n="key"; app.js uses t("key").

const I18N = {
  my: {
    title: "ZinQuake — ငလျင်သတင်း",
    subtitle: "ငလျင်သတင်း",
    period: "ကာလ",
    hour: "၁ နာရီ",
    day: "၁ ရက်",
    week: "၁ ပတ်",
    month: "၁ လ",
    minmag: "Magnitude ≥",
    all: "အားလုံး",
    search: "နေရာ ရှာ",
    searchPh: "Myanmar, Japan, Thailand…",
    refresh: "ပြန်ရှာ",
    news: "📰 နောက်ဆုံး ငလျင်သတင်း",
    links: "🔗 အသုံးဝင် Website / API",
    safety: "🛟 ငလျင်လှုပ်ရင်",
    tip1: "<b>ဝပ်</b> — ကြမ်းပြင်ပေါ် ဒူးထောက်ဝပ်",
    tip2: "<b>ကာ</b> — စားပွဲအောက်ဝင်၊ ခေါင်း/လည်ပင်း ကာ",
    tip3: "<b>ကိုင်</b> — လှုပ်တာ မရပ်မချင်း ကိုင်ထား",
    tip4: "ပင်လယ်ကမ်းနားဆိုရင် မြင့်တဲ့နေရာ ချက်ချင်းပြေး (Tsunami)",
    footer: "auto-refresh 60 စက္ကန့်",
    loading: "Loading…",
    count: "ငလျင် အရေအတွက်",
    strongest: "အပြင်းဆုံး",
    tsunami: "Tsunami flag",
    updated: "Update လုပ်ချိန်",
    none: "ဒီ filter နဲ့ ငလျင် မတွေ့ပါ။",
    error: "Data ယူလို့ မရပါ",
    depth: "အနက်",
    felt: (n) => `${n} ယောက် ခံစားရ`,
    details: "USGS အသေးစိတ်",
    clickMap: "Map မှာကြည့်ရန် နှိပ်ပါ",
    ago: { s: (n) => `${n} စက္ကန့်အရင်`, m: (n) => `${n} မိနစ်အရင်`, h: (n) => `${n} နာရီအရင်`, d: (n) => `${n} ရက်အရင်` },
    region: "ဒေသ",
    regions: { world: "🌏 ကမ္ဘာ", myanmar: "🇲🇲 မြန်မာ", japan: "🇯🇵 ဂျပန်", thailand: "🇹🇭 ထိုင်း", indonesia: "🇮🇩 အင်ဒိုနီးရှား" },
    sort: "စီရန်",
    sortNew: "အသစ်ဆုံး",
    sortMag: "အပြင်းဆုံး",
    sortNear: "အနီးဆုံး",
    nearMe: "📍 ကျွန်ုပ်အနီး",
    locating: "တည်နေရာ ရှာနေတယ်…",
    geoError: "တည်နေရာ မရပါ — browser မှာ location ခွင့်ပြုပါ",
    away: (km) => `ကျွန်ုပ်နဲ့ ${km} km`,
    nearest: "အနီးဆုံး",
    alerts: "🔔 M5+ သတိပေး",
    alertsOn: "🔔 သတိပေးချက် ဖွင့်ထား",
    newQuake: (m, place) => `⚠️ ငလျင်အသစ် M${m} — ${place}`,
    biggest: "🏆 အပြင်းဆုံး ငလျင်",
    showOnMap: "Map မှာ ကြည့်",
    chartTime: "📈 အချိန်အလိုက် ငလျင်အရေအတွက်",
    chartMag: "📊 Magnitude အလိုက်",
    quakesN: (n) => `ငလျင် ${n} ခု`,
    csv: "⬇ CSV",
    legend: "Magnitude",
    linkNotes: [
      "ကမ္ဘာ့ ငလျင် live map",
      "ဒီ app သုံးတဲ့ free API (key မလို)",
      "ရက်/နေရာ/magnitude နဲ့ query",
      "ဥရောပ ငလျင်စင်တာ + realtime WebSocket API",
      "UN ဘေးအန္တရာယ် သတိပေးချက် (ငလျင်/ဆူနာမီ)",
      "မိုးလေဝသနှင့် ဇလဗေဒ ဦးစီးဌာန",
      "ဂျပန် ငလျင် / 震度 သတင်း",
      "ထိုင်း ငလျင် သတင်း",
      "ဆူနာမီ သတိပေးချက်",
      "ဘေးအန္တရာယ် သတင်း / အစီရင်ခံစာ",
    ],
  },

  en: {
    title: "ZinQuake — Earthquake News",
    subtitle: "Earthquake News",
    period: "Period",
    hour: "Past hour",
    day: "Past day",
    week: "Past week",
    month: "Past month",
    minmag: "Magnitude ≥",
    all: "All",
    search: "Search place",
    searchPh: "Myanmar, Japan, Thailand…",
    refresh: "Search",
    news: "📰 Latest earthquakes",
    links: "🔗 Useful websites / APIs",
    safety: "🛟 During an earthquake",
    tip1: "<b>Drop</b> — get down on your hands and knees",
    tip2: "<b>Cover</b> — get under a table, protect your head and neck",
    tip3: "<b>Hold on</b> — hold on until the shaking stops",
    tip4: "Near the coast? Move to high ground immediately (tsunami)",
    footer: "auto-refresh 60s",
    loading: "Loading…",
    count: "Earthquakes",
    strongest: "Strongest",
    tsunami: "Tsunami flag",
    updated: "Updated",
    none: "No earthquakes match this filter.",
    error: "Could not load data",
    depth: "depth",
    felt: (n) => `felt by ${n}`,
    details: "USGS details",
    clickMap: "Click to show on map",
    ago: { s: (n) => `${n}s ago`, m: (n) => `${n} min ago`, h: (n) => `${n} h ago`, d: (n) => `${n} days ago` },
    region: "Region",
    regions: { world: "🌏 World", myanmar: "🇲🇲 Myanmar", japan: "🇯🇵 Japan", thailand: "🇹🇭 Thailand", indonesia: "🇮🇩 Indonesia" },
    sort: "Sort",
    sortNew: "Newest",
    sortMag: "Strongest",
    sortNear: "Nearest",
    nearMe: "📍 Near me",
    locating: "Finding your location…",
    geoError: "Location unavailable — allow location in your browser",
    away: (km) => `${km} km from you`,
    nearest: "Nearest",
    alerts: "🔔 M5+ alerts",
    alertsOn: "🔔 Alerts on",
    newQuake: (m, place) => `⚠️ New earthquake M${m} — ${place}`,
    biggest: "🏆 Strongest earthquake",
    showOnMap: "Show on map",
    chartTime: "📈 Earthquakes over time",
    chartMag: "📊 By magnitude",
    quakesN: (n) => `${n} earthquake${n === 1 ? "" : "s"}`,
    csv: "⬇ CSV",
    legend: "Magnitude",
    linkNotes: [
      "Live world earthquake map",
      "Free API used by this app (no key)",
      "Query by date / place / magnitude",
      "European centre + realtime WebSocket API",
      "UN disaster alerts (earthquake / tsunami)",
      "Myanmar Dept. of Meteorology and Hydrology",
      "Japan earthquake / seismic intensity info",
      "Thailand earthquake info",
      "Tsunami warnings",
      "Disaster news and reports",
    ],
  },

  ja: {
    title: "ZinQuake — 地震ニュース",
    subtitle: "地震ニュース",
    period: "期間",
    hour: "1時間",
    day: "1日",
    week: "1週間",
    month: "1か月",
    minmag: "マグニチュード ≥",
    all: "すべて",
    search: "場所を検索",
    searchPh: "Myanmar, Japan, Thailand…",
    refresh: "検索",
    news: "📰 最新の地震情報",
    links: "🔗 便利なサイト / API",
    safety: "🛟 地震が起きたら",
    tip1: "<b>まず低く</b> — 床に手と膝をつく",
    tip2: "<b>頭を守り</b> — 机の下に入り、頭と首を守る",
    tip3: "<b>動かない</b> — 揺れが収まるまでじっとする",
    tip4: "海の近くなら、すぐに高い所へ避難（津波）",
    footer: "60秒ごとに自動更新",
    loading: "読み込み中…",
    count: "地震の数",
    strongest: "最大",
    tsunami: "津波フラグ",
    updated: "更新",
    none: "この条件に合う地震はありません。",
    error: "データを取得できません",
    depth: "深さ",
    felt: (n) => `${n}人が有感`,
    details: "USGS 詳細",
    clickMap: "クリックで地図に表示",
    ago: { s: (n) => `${n}秒前`, m: (n) => `${n}分前`, h: (n) => `${n}時間前`, d: (n) => `${n}日前` },
    region: "地域",
    regions: { world: "🌏 世界", myanmar: "🇲🇲 ミャンマー", japan: "🇯🇵 日本", thailand: "🇹🇭 タイ", indonesia: "🇮🇩 インドネシア" },
    sort: "並び替え",
    sortNew: "新しい順",
    sortMag: "強い順",
    sortNear: "近い順",
    nearMe: "📍 現在地",
    locating: "現在地を取得中…",
    geoError: "現在地を取得できません — ブラウザで位置情報を許可してください",
    away: (km) => `現在地から ${km} km`,
    nearest: "最寄り",
    alerts: "🔔 M5以上を通知",
    alertsOn: "🔔 通知オン",
    newQuake: (m, place) => `⚠️ 新しい地震 M${m} — ${place}`,
    biggest: "🏆 最大の地震",
    showOnMap: "地図で見る",
    chartTime: "📈 時間ごとの地震数",
    chartMag: "📊 マグニチュード別",
    quakesN: (n) => `${n}件`,
    csv: "⬇ CSV",
    legend: "マグニチュード",
    linkNotes: [
      "世界の地震ライブマップ",
      "このアプリが使う無料API（キー不要）",
      "日付・場所・規模で検索",
      "欧州地震センター + リアルタイム WebSocket API",
      "国連の災害アラート（地震・津波）",
      "ミャンマー気象水文局",
      "日本の地震・震度情報",
      "タイの地震情報",
      "津波警報",
      "災害ニュース・レポート",
    ],
  },
};

const LOCALES = { my: "my-MM", en: "en-US", ja: "ja-JP" };

let lang = (() => {
  try {
    const saved = localStorage.getItem("zinquake.lang");
    if (saved in I18N) return saved;
  } catch { /* storage blocked */ }
  const nav = (navigator.language || "").slice(0, 2);
  return nav in I18N ? nav : "my";
})();

function t(key) {
  return I18N[lang][key] ?? I18N.en[key] ?? key;
}

function applyStaticText() {
  document.documentElement.lang = lang;
  document.title = t("title");
  for (const node of document.querySelectorAll("[data-i18n]")) {
    node.innerHTML = t(node.dataset.i18n); // trusted strings from I18N only
  }
  for (const node of document.querySelectorAll("[data-i18n-ph]")) {
    node.placeholder = t(node.dataset.i18nPh);
  }
  for (const btn of document.querySelectorAll("[data-lang]")) {
    btn.setAttribute("aria-pressed", btn.dataset.lang === lang);
  }
}

function setLang(next) {
  if (!(next in I18N)) return;
  lang = next;
  try { localStorage.setItem("zinquake.lang", next); } catch { /* ignore */ }
  applyStaticText();
}
