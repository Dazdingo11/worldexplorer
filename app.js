//* Netlify *//
const PROXY_BASE = "https://worldexplorer2025.netlify.app/api/news";

//* DOM HOOKS *//
const $ = (sel) => document.querySelector(sel);
const inputEl = $("#country-input");
const searchBtn = $("#search-button");
const suggestionsEl = $("#suggestions-box");
const errorsEl = $("#error-box");
const countryEl = $("#country-panel");
const newsEl = $("#news-panel");


const citiesPanelListEl = $("#cities-panel-list"); 
const nearbyListMountEl = $("#nearby-list");       
//* UTIL *//
const normalize = (s) =>
  (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const levenshtein = (a, b) => {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
};

const safeText = (v) => (v ?? "—");

//* Geo *//
function kmBetween([lat1, lon1] = [], [lat2, lon2] = []) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return Infinity;
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

//* TIME HELPERS  *//
function parseUtcOffset(tzStr) {
  if (!tzStr) return null;
  tzStr = String(tzStr).replace("−", "-").trim();
  if (tzStr === "UTC") return 0;
  const m = /^UTC([+-])(\d{1,2})(?::(\d{2}))?$/.exec(tzStr);
  if (!m) return null;
  const sign = m[1] === "+" ? 1 : -1;
  const hours = parseInt(m[2] || "0", 10);
  const mins  = parseInt(m[3] || "0", 10);
  return sign * (hours * 60 + mins);
}


function formatLocalTimeFromUtcOffset(offsetMinutes) {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const target = new Date(utcMs + offsetMinutes * 60000);
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(target);
}

//* IANA map *//
const IANA_CAPITAL_BY_CCA2 = {
  GB:"Europe/London", IE:"Europe/Dublin", PT:"Europe/Lisbon", ES:"Europe/Madrid", FR:"Europe/Paris",
  BE:"Europe/Brussels", NL:"Europe/Amsterdam", DE:"Europe/Berlin", IT:"Europe/Rome", AT:"Europe/Vienna",
  CH:"Europe/Zurich", DK:"Europe/Copenhagen", NO:"Europe/Oslo", SE:"Europe/Stockholm", FI:"Europe/Helsinki",
  IS:"Atlantic/Reykjavik", PL:"Europe/Warsaw", CZ:"Europe/Prague", SK:"Europe/Bratislava", HU:"Europe/Budapest",
  RO:"Europe/Bucharest", BG:"Europe/Sofia", GR:"Europe/Athens", EE:"Europe/Tallinn", LV:"Europe/Riga",
  LT:"Europe/Vilnius", UA:"Europe/Kyiv", TR:"Europe/Istanbul",
  US:"America/New_York",   
  CA:"America/Toronto",    
  MX:"America/Mexico_City",
  BR:"America/Sao_Paulo",         
  AR:"America/Argentina/Buenos_Aires",
  EG:"Africa/Cairo", ZA:"Africa/Johannesburg",
  IN:"Asia/Kolkata", CN:"Asia/Shanghai", JP:"Asia/Tokyo", PH:"Asia/Manila",
  AU:"Australia/Sydney",          
  NZ:"Pacific/Auckland"
};

function formatLocalTimeIANA(iana) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: iana
    }).format(new Date());
  } catch {
    return "";
  }
}

function pickCapitalIana(country) {
  const code = country?.cca2?.toUpperCase?.();
  return code ? IANA_CAPITAL_BY_CCA2[code] : null;
}

//* REST COUNTRIES *//
const V31_FIELDS =
  "name,cca2,cca3,altSpellings,capital,region,subregion,flags,population,languages,currencies,latlng,area,timezones,borders,idd,capitalInfo,maps,tld,continents,fifa,cioc,coatOfArms,demonyms,gini";
const ALL_COUNTRIES_URL_FIELDS = `https://restcountries.com/v3.1/all?fields=${encodeURIComponent(V31_FIELDS)}`;
const ALL_COUNTRIES_URL_FULL   = `https://restcountries.com/v3.1/all`;
let ALL_COUNTRIES_CACHE = null;

async function fetchJsonAny(url) {
  const res = await fetch(url);
  if (res.status === 404) return { ok: false, code: 404, data: null };
  if (!res.ok) throw new Error(String(res.status));
  const data = await res.json();
  return { ok: true, code: res.status, data };
}

async function tryWithAndWithoutFields(baseUrl, withFields) {
  if (withFields) {
    try {
      const withQuery = baseUrl + (baseUrl.includes("?") ? "&" : "?") + "fields=" + V31_FIELDS;
      const r = await fetchJsonAny(withQuery);
      if (r.ok) return r.data;
      if (r.code === 404) return [];
    } catch {}
  }
  const r2 = await fetchJsonAny(baseUrl);
  if (r2.ok) return r2.data;
  if (r2.code === 404) return [];
  throw new Error("RESTCountriesFetchFailed");
}

async function loadAllCountries() {
  if (ALL_COUNTRIES_CACHE) return ALL_COUNTRIES_CACHE;
  try {
    const r1 = await fetchJsonAny(ALL_COUNTRIES_URL_FIELDS);
    if (r1.ok && Array.isArray(r1.data)) {
      ALL_COUNTRIES_CACHE = r1.data;
      return ALL_COUNTRIES_CACHE;
    }
  } catch {}
  const r2 = await fetchJsonAny(ALL_COUNTRIES_URL_FULL);
  if (r2.ok && Array.isArray(r2.data)) {
    ALL_COUNTRIES_CACHE = r2.data;
    return ALL_COUNTRIES_CACHE;
  }
  ALL_COUNTRIES_CACHE = [];
  return ALL_COUNTRIES_CACHE;
}

function localFuzzySuggestions(all, query, limit = 5) {
  const q = normalize(query);
  if (!q) return [];

  const scoreCountry = (c) => {
    const common = c?.name?.common || c?.name || "";
    const official = c?.name?.official || "";
    const alts = Array.isArray(c?.altSpellings) ? c.altSpellings : [];
    const keys = [common, official, ...alts].map(normalize).filter(Boolean);

    let bestLev = 0;
    for (const k of keys) {
      const d = levenshtein(q, k);
      const maxLen = Math.max(q.length, k.length) || 1;
      const s = 1 - d / maxLen;
      if (s > bestLev) bestLev = s;
    }

    const commonNorm = normalize(common);
    const starts = commonNorm.startsWith(q) ? 0.25 : 0;
    const substr = !starts && commonNorm.includes(q) ? 0.15 : 0;

    let codeBonus = 0;
    if (q.length <= 3) {
      if (normalize(c.cca2) === q) codeBonus = 0.4;
      else if (normalize(c.cca3) === q) codeBonus = 0.35;
    }

    const raw = bestLev + starts + substr + codeBonus;
    const finalScore = Math.max(0, Math.min(1, raw));
    return { display: common || official || c.cca3 || "Unknown", ref: c, score: finalScore };
  };

  const unique = new Map();
  for (const c of all) {
    const s = scoreCountry(c);
    const key = (c?.name?.common || c?.name || c?.cca3 || "").toLowerCase();
    const prev = unique.get(key);
    if (!prev || s.score > prev.score) unique.set(key, s);
  }

  return Array.from(unique.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.ref);
}

function searchByCapitalLocal(all, query, limit = 5) {
  const q = normalize(query);
  const scored = [];
  for (const c of all) {
    const caps = Array.isArray(c.capital) ? c.capital : (c.capital ? [c.capital] : []);
    for (const cap of caps) {
      const capN = normalize(cap);
      const d = levenshtein(q, capN);
      const maxLen = Math.max(q.length, capN.length) || 1;
      const sim = 1 - d / maxLen;
      const starts = capN.startsWith(q) ? 0.2 : 0;
      const substr = !starts && capN.includes(q) ? 0.1 : 0;
      const score = Math.max(0, Math.min(1, sim + starts + substr));
      if (score > 0.5) scored.push({ score, ref: c });
    }
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map(x => x.ref);
}

//* SEARCH with alpha code and capital support *//
async function searchCountries(query) {
  const qRaw = query.trim();
  const q = encodeURIComponent(qRaw);

  //* try 2/3-letter ISO code first *//
  const code = qRaw.replace(/[^A-Za-z]/g, "").toUpperCase();
  if (code.length === 2 || code.length === 3) {
    try {
      const byCode = await tryWithAndWithoutFields(
        `https://restcountries.com/v3.1/alpha/${code}`,
        true
      );
      if (Array.isArray(byCode) && byCode.length) {
        return { exact: byCode, suggestions: [] };
      }
    } catch {}
  }

  try {
    const exact = await tryWithAndWithoutFields(
      `https://restcountries.com/v3.1/name/${q}?fullText=true`,
      true
    );
    if (Array.isArray(exact) && exact.length) return { exact, suggestions: [] };
  } catch {}

  try {
    const partial = await tryWithAndWithoutFields(
      `https://restcountries.com/v3.1/name/${q}`,
      true
    );
    if (Array.isArray(partial) && partial.length) return { exact: [], suggestions: partial };
  } catch {}

  try {
    const byCapital = await tryWithAndWithoutFields(
      `https://restcountries.com/v3.1/capital/${q}`,
      true
    );
    if (Array.isArray(byCapital) && byCapital.length) return { exact: [], suggestions: byCapital };
  } catch {}

  try {
    const all = await loadAllCountries();
    const byCapLocal = searchByCapitalLocal(all, qRaw, 5);
    if (byCapLocal.length) return { exact: [], suggestions: byCapLocal };
    const sugg = localFuzzySuggestions(all, qRaw, 5);
    if (sugg.length) return { exact: [], suggestions: sugg };
  } catch {}

  throw new Error("RESTCountriesSearchFailed");
}

async function fetchNeighborsByCca3(codes) {
  if (!Array.isArray(codes) || codes.length === 0) return [];
  const list = codes.join(",");
  try {
    return await tryWithAndWithoutFields(
      `https://restcountries.com/v3.1/alpha?codes=${list}`,
      true
    );
  } catch (_) {
    return [];
  }
}

//* NEWS *//
const NEWSAPI_SUPPORTED = new Set([
  "ae","ar","at","au","be","bg","br","ca","ch","cn","co","cu","cz","de","eg","fr",
  "gb","gr","hk","hu","id","ie","il","in","it","jp","kr","lt","lv","ma","mx","my",
  "ng","nl","no","nz","ph","pl","pt","ro","rs","ru","sa","se","sg","si","sk","th",
  "tr","tw","ua","us","ve","za"
]);

const get = async (url) => {
  try {
    const res = await fetch(url, { method: "GET" });
    let data = null;
    try { data = await res.json(); } catch {}
    if (!res.ok || (data && data.status && data.status !== "ok")) {
      const msg = data?.message || `NewsAPI error (${res.status})`;
      return { error: msg, status: res.status };
    }
    return data;
  } catch (e) {
 
    return { error: "News service unavailable (CORS or network).", status: 0 };
  }
};

function isoDaysAgo(days) {
  return new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
}
function buildEverythingURL(params) {
  const p = new URLSearchParams(params);
  return `${PROXY_BASE}?path=everything&${p.toString()}`;
}

async function fetchNewsForCountry(country) {
  const cca2 = (country?.cca2 || "").toLowerCase();
  const common = country?.name?.common || "";
  const capital = Array.isArray(country?.capital) ? country.capital[0] : (country?.capital || "");

  
  if (NEWSAPI_SUPPORTED.has(cca2)) {
    const p = new URLSearchParams({ country: cca2, pageSize: "10" });
    const u = `${PROXY_BASE}?path=top-headlines&${p.toString()}`;
    const a = await get(u);
    if (!a.error && Array.isArray(a.articles) && a.articles.length > 0) return a;
  }

  const from = isoDaysAgo(7);
  if (common) {
    const u1 = buildEverythingURL({
      q: `"${common}"`,
      from,
      sortBy: "publishedAt",
      language: "en",
      searchIn: "title,description",
      pageSize: "10"
    });
    const r1 = await get(u1);
    if (!r1.error && Array.isArray(r1.articles) && r1.articles.length > 0) return r1;
  }

  if (capital) {
    const u2 = buildEverythingURL({
      q: `"${capital}"`,
      from,
      sortBy: "publishedAt",
      language: "en",
      searchIn: "title,description",
      pageSize: "10"
    });
    const r2 = await get(u2);
    if (!r2.error && Array.isArray(r2.articles) && r2.articles.length > 0) return r2;
  }

  if (common || capital) {
    const q = [common, capital].filter(Boolean).map(v => `"${v}"`).join(" OR ");
    if (q) {
      const u3 = buildEverythingURL({
        q,
        from,
        sortBy: "publishedAt",
        searchIn: "title,description",
        pageSize: "10"
      });
      const r3 = await get(u3);
      if (!r3.error && Array.isArray(r3.articles) && r3.articles.length > 0) return r3;
    }
  }

  return { status: "ok", articles: [] };
}

//* RENDER: Suggestions *//
function renderSuggestions(listFromApi, originalQuery) {
  suggestionsEl.innerHTML = "";
  if (!Array.isArray(listFromApi) || listFromApi.length === 0) return;

  const q = normalize(originalQuery);
  const unique = new Map();

  const scoreCountry = (c) => {
    const common = c?.name?.common || c?.name || "";
    const official = c?.name?.official || "";
    const alts = Array.isArray(c?.altSpellings) ? c.altSpellings : [];
    const keys = [common, official, ...alts].map(normalize).filter(Boolean);

    let bestLev = 0;
    for (const k of keys) {
      const d = levenshtein(q, k);
      const maxLen = Math.max(q.length, k.length) || 1;
      const s = 1 - d / maxLen;
      if (s > bestLev) bestLev = s;
    }

    const commonNorm = normalize(common);
    const starts = commonNorm.startsWith(q) ? 0.25 : 0;
    const substr = !starts && commonNorm.includes(q) ? 0.15 : 0;

    let codeBonus = 0;
    if (q.length <= 3) {
      if (normalize(c.cca2) === q) codeBonus = 0.4;
      else if (normalize(c.cca3) === q) codeBonus = 0.35;
    }

    const raw = bestLev + starts + substr + codeBonus;
    const finalScore = Math.max(0, Math.min(1, raw));
    return { display: common || official || c.cca3 || "Unknown", ref: c, score: finalScore };
  };

  listFromApi.forEach((c) => {
    const s = scoreCountry(c);
    const key = (c?.name?.common || c?.name || c?.cca3 || "").toLowerCase();
    const prev = unique.get(key);
    if (!prev || s.score > prev.score) unique.set(key, s);
  });

  const picked = Array.from(unique.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  if (!picked.length) return;

  const box = document.createElement("div");
  box.className = "suggestions-list";
  box.innerHTML = `<p>Did you mean:</p>`;
  picked.forEach(({ display }) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "suggestion-button";
    btn.textContent = display;
    btn.addEventListener("click", async () => {
      inputEl.value = display;
      suggestionsEl.innerHTML = "";
      await handleSearch();
    });
    box.appendChild(btn);
  });
  suggestionsEl.appendChild(box);
}

//* RENDER: Country *//
function renderCountry(c) {
  countryEl.innerHTML = "";
  const oldCities = document.getElementById("cities-panel");
  if (oldCities) oldCities.remove();
  if (!c) return;

  const tpl = $("#tpl-country-card");
  const frag = tpl.content.cloneNode(true);

  const setText = (key, val) => {
    const el = frag.querySelector(`[data-field="${key}"]`);
    if (el) el.textContent = safeText(val);
  };
  const setAttr = (key, attr, val) => {
    const el = frag.querySelector(`[data-field="${key}"]`);
    if (el) el.setAttribute(attr, val);
  };

  const name = c.name?.common || c.name;
  const official = c.name?.official || c.name;
  const flag = c.flags?.svg || c.flags?.png || "";
  const capital = Array.isArray(c.capital) ? (c.capital[0] || "—") : (c.capital || "—");
  const area = c.area != null ? c.area.toLocaleString() + " km²" : "—";
  const timezones = Array.isArray(c.timezones) ? c.timezones.join(", ") : (c.timezones || "—");
  const tlds = Array.isArray(c.tld) ? c.tld.join(", ") : (c.tld || "—");
  const calling = c.idd?.root ? `${c.idd.root}${(c.idd.suffixes || []).join(", ")}` :
                    (c.idd?.suffixes || []).join(", ") || "—";
  const languages = c.languages ? Object.values(c.languages).join(", ") : "—";
  const currencies = c.currencies
    ? Object.values(c.currencies).map(cur => `${cur.name} (${cur.symbol || ""})`).join(", ")
    : "—";
  const iso = `${safeText(c.cca2)} / ${safeText(c.cca3)}`;
  const mapHref = c.maps?.googleMaps || c.maps?.openStreetMaps || "";

  setText("name", name);
  if (flag) { setAttr("flag", "src", flag); setAttr("flag", "alt", `Flag of ${name}`); }
  else { const f = frag.querySelector('[data-field="flag"]'); if (f) f.remove(); }

  setText("official", official);
  setText("region", c.region);
  setText("subregion", c.subregion);
  setText("capital", capital);
  setText("population", c.population?.toLocaleString?.());
  setText("area", area);
  setText("languages", languages);
  setText("currencies", currencies);
  setText("timezones", timezones);
  setText("calling", calling);
  setText("tlds", tlds);
  setText("iso", iso);
  if (mapHref) {
    const a = frag.querySelector('[data-field="mapHref"]');
    if (a) a.href = mapHref;
  } else {
    const m = frag.querySelector(".country-card__map");
    if (m) m.remove();
  }

  countryEl.appendChild(frag);
  const borders = Array.isArray(c.borders) ? c.borders : [];
  renderBordersAsync(borders, c).catch(console.error);
}

//* RENDER: Cities *//
async function renderCitiesPanel(country, neighborsFull = []) {

  const old = document.getElementById("cities-panel");
  if (old) old.remove();

 
  const panel = document.createElement("section");
  panel.className = "cities-panel";
  panel.id = "cities-panel";

  const h3 = document.createElement("h3");
  h3.textContent = "Cities";
  panel.appendChild(h3);

  const capName = Array.isArray(country?.capital) ? country.capital[0] : country?.capital;
  const capCoords = country?.capitalInfo?.latlng || country?.latlng;
  const tzRaw = Array.isArray(country?.timezones) ? country.timezones[0] : country?.timezones;
  const iana = pickCapitalIana(country);

  const nowLocal = iana
    ? formatLocalTimeIANA(iana)
    : (() => {
        const mins = parseUtcOffset(tzRaw);
        if (mins == null) return "";
        return formatLocalTimeFromUtcOffset(mins);
      })();

  const capBlock = document.createElement("div");
  capBlock.className = "cities-capital";
  capBlock.innerHTML = `
    <p><strong>Capital:</strong> ${safeText(capName)}</p>
    <p><strong>Coordinates:</strong> ${capCoords ? `${capCoords[0].toFixed(2)}, ${capCoords[1].toFixed(2)}` : "—"}</p>
    <p><strong>Local time:</strong> ${nowLocal || "—"}</p>
  `;
  panel.appendChild(capBlock);

  //* Nearby capitals *//
  if (neighborsFull.length && capCoords && Number.isFinite(capCoords[0]) && Number.isFinite(capCoords[1])) {
    const listWrap = document.createElement("div");
    listWrap.className = "cities-nearby";

    const subtitle = document.createElement("p");
    subtitle.innerHTML = `<strong>Nearby capitals:</strong>`;
    listWrap.appendChild(subtitle);

    const ul = document.createElement("ul");
    ul.className = "cities-nearby-list";

    const nearby = neighborsFull
      .map(n => {
        const nCap = Array.isArray(n?.capital) ? n.capital[0] : n?.capital;
        const nCoords = n?.capitalInfo?.latlng || n?.latlng;
        const d = kmBetween(capCoords, nCoords);
        return { name: n?.name?.common || n?.name || n?.cca3, cap: nCap, dist: d };
      })
      .filter(x => x.cap && Number.isFinite(x.dist))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 8);

    if (nearby.length) {
      nearby.forEach(x => {
        const li = document.createElement("li");
        li.textContent = `${x.cap} (${x.name}) – ${Math.round(x.dist)} km`;
        ul.appendChild(li);
      });
      listWrap.appendChild(ul);

    
      if (nearbyListMountEl) {
       
        nearbyListMountEl.innerHTML = "";
        nearbyListMountEl.appendChild(listWrap);
      } else {
        panel.appendChild(listWrap);
      }
    }
  }

 
  if (citiesPanelListEl) {
    citiesPanelListEl.innerHTML = "";
    citiesPanelListEl.appendChild(panel);
  } else {
    countryEl.appendChild(panel);
  }
}

//* RENDER: News *//
function renderNews(n) {
  newsEl.innerHTML = "";

  const wrapTpl = $("#tpl-news-block");
  const itemTpl = $("#tpl-news-item");
  if (!wrapTpl || !itemTpl) {
   
    const fallback = document.createElement("div");
    fallback.textContent = (!n || n.error) ? (n?.error || "No news available.") : "News loaded.";
    newsEl.appendChild(fallback);
    return;
  }

  const block = wrapTpl.content.cloneNode(true);
  const list = block.querySelector('[data-field="list"]');
  if (!list) {
    const fallback = document.createElement("div");
    fallback.textContent = "No news available.";
    newsEl.appendChild(fallback);
    return;
  }

  const showMsg = (msg) => {
    const li = document.createElement("li");
    li.className = "news-item";
    li.textContent = msg;
    list.appendChild(li);
    newsEl.appendChild(block);
  };

  if (!n || n.error) {
    const msg = n?.status === 429
      ? "Rate limit hit. Try again shortly."
      : (n?.error || "No news available.");
    showMsg(msg);
    return;
  }

  const items = (n.articles || []).slice(0, 10);
  if (items.length === 0) {
    showMsg("No articles found.");
    return;
  }

  items.forEach(a => {
    const row = itemTpl.content.cloneNode(true);
    const link = row.querySelector('[data-field="url"]');
    const title = row.querySelector('[data-field="title"]');
    const source = row.querySelector('[data-field="source"]');
    const date   = row.querySelector('[data-field="date"]');

    if (link) link.href = a.url || "#";
    if (title) title.textContent = safeText(a.title);

    const srcName = a?.source?.name ? a.source.name : "";
    const when = a?.publishedAt ? new Date(a.publishedAt).toLocaleString() : "";
    if (source) source.textContent = srcName ? `(${srcName})` : "";
    if (date)   date.textContent   = when || "";

    list.appendChild(row);
  });

  newsEl.appendChild(block);
}

//* NEIGHBORS RENDER *//
async function renderBordersAsync(borders, currentCountry = null) {
  const mount = document.querySelector('[data-field="bordersMount"]');
  if (!mount) return;
  if (!Array.isArray(borders) || borders.length === 0) {
    mount.textContent = "—";
    if (currentCountry) await renderCitiesPanel(currentCountry, []);
    return;
  }

  mount.textContent = "loading…";
  try {
    const neighbors = await fetchNeighborsByCca3(borders);
    if (!Array.isArray(neighbors) || neighbors.length === 0) {
      mount.textContent = "—";
      if (currentCountry) await renderCitiesPanel(currentCountry, []);
      return;
    }
    mount.textContent = "";
    const btnTpl = $("#tpl-border-button");

    neighbors.forEach(n => {
      const btnFrag = btnTpl.content.cloneNode(true);
      const btn = btnFrag.querySelector(".neighbor-button");
      const name = n?.name?.common || n?.name || n?.cca3 || "Unknown";
      const code = n?.cca3 || "";
      btn.classList.add("btn", "btn-outline-secondary"); 
      btn.textContent = name;
      btn.dataset.cca3 = code;
      btn.addEventListener("click", async () => {
        await handleNeighborClick(code);
      });
      mount.appendChild(btnFrag);
    });

    if (currentCountry) await renderCitiesPanel(currentCountry, neighbors);
  } catch (e) {
    console.error(e);
    mount.textContent = "—";
    if (currentCountry) await renderCitiesPanel(currentCountry, []);
  }
}

//* CONTROLLER *//
const countryCache = new Map();
let didResizeBanner = false;

async function showCountry(country, updateInput = true) {
  if (updateInput) {
    const n = country?.name?.common || country?.name || "";
    if (n) inputEl.value = n;
  }

  renderCountry(country);

  // Only resize banner after we successfully render a country 
  if (!didResizeBanner) {
    resizeBanner();
    didResizeBanner = true;
  }

  try {
    const key = country?.cca3 || country?.cca2 || country?.name?.common || "";
    if (key && countryCache.has(key)) {
      renderNews(countryCache.get(key));
    } else {
      const news = await fetchNewsForCountry(country);
      if (key) countryCache.set(key, news);
      renderNews(news);
    }
  } catch (e) {
    console.error(e);
    renderNews({ error: "Failed to load news." });
  }
}

async function handleNeighborClick(cca3) {
  const prevErr = errorsEl.textContent;
  errorsEl.textContent = "Loading neighbor…";
  try {
    const list = await fetchNeighborsByCca3([cca3]);
    if (Array.isArray(list) && list.length) {
      errorsEl.textContent = "";
      await showCountry(list[0], true);
    } else {
      errorsEl.textContent = "Neighbor lookup failed.";
    }
  } catch (e) {
    console.error(e);
    errorsEl.textContent = "Neighbor lookup failed.";
  } finally {
    if (errorsEl.textContent === "Loading neighbor…") {
      errorsEl.textContent = prevErr || "";
    }
  }
}

//* BANNER RESIZE AFTER FIRST SUCCESSFUL SEARCH *//
function resizeBanner() {
  const banner = document.querySelector(".banner");
  const appTitle = document.querySelector(".app-title");
  const appSubTitle = document.querySelector(".app-subtitle");
  if (!banner || !appTitle || !appSubTitle) return; // guard if elements not present

  appTitle.style.fontSize = "2vw";
  appSubTitle.style.fontSize = "1vw";
  appTitle.style.color = "#ffffff";
  appSubTitle.style.color = "#ffffff";
  banner.style.height = "30vh";
  banner.style.backgroundPosition = "bottom";
}

//* SEARCH FLOW *//
let searchBusy = false;
async function handleSearch() {
  if (searchBusy) return;
  searchBusy = true;

  errorsEl.textContent = "";
  suggestionsEl.innerHTML = "";
  countryEl.innerHTML = "";
  newsEl.innerHTML = "";

  const oldCities = document.getElementById("cities-panel");
  if (oldCities) oldCities.remove();

  //* banner mounts *//
  if (citiesPanelListEl) citiesPanelListEl.innerHTML = "";
  if (nearbyListMountEl) nearbyListMountEl.innerHTML = "";

  const query = inputEl.value.trim();
  if (!query) {
    errorsEl.textContent = "Please type a country name.";
    searchBusy = false;
    return;
  }

  try {
    const { exact, suggestions } = await searchCountries(query);

    if (Array.isArray(exact) && exact.length) {
      await showCountry(exact[0], false);
    } else if (Array.isArray(suggestions) && suggestions.length) {
      renderSuggestions(suggestions, query);
      errorsEl.textContent = "No exact match. Try a suggestion.";
    } else {
      errorsEl.textContent = "No matching country found.";
    }
  } catch (e) {
    console.error(e);
    errorsEl.textContent = "Country lookup failed. Try again.";
  } finally {
    searchBusy = false;
  }
}

//* INIT *//
function init() {
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleSearch();
  });
  searchBtn.addEventListener("click", handleSearch);
}
init();
