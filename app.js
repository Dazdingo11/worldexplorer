// Netlify site URL:
const NETLIFY_SITE = "https://worldexplorer2025.netlify.app";

const PROXY_BASE = (
  location.hostname.endsWith(".netlify.app") ||
  (location.hostname === "localhost" && location.port === "8888")
) ? "/api/news" : `${NETLIFY_SITE}/api/news`;


/* DOM HOOKS */
const $ = (sel) => document.querySelector(sel);
const inputEl = $("#countryInput");
const searchBtn = $("#searchBtn");
const suggestionsEl = $("#suggestions");
const errorsEl = $("#errors");
const countryEl = $("#country");
const newsEl = $("#news");

/* UTIL */
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

/* DATA: REST COUNTRIES */
const V31_FIELDS =
  "name,cca2,cca3,altSpellings,capital,region,subregion,flags,population,languages,currencies,latlng,area,timezones,borders,idd,capitalInfo,maps,tld,continents,fifa,cioc,coatOfArms,demonyms,gini";

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

async function tryWithAndWithoutFields(baseUrl, fields) {
  if (fields) {
    try {
      const withFields = baseUrl + (baseUrl.includes("?") ? "&" : "?") + "fields=" + V31_FIELDS;
      return await fetchJson(withFields);
    } catch (_) {}
  }
  return await fetchJson(baseUrl);
}

async function searchCountries(query) {
  const q = encodeURIComponent(query.trim());
  try {
    const exact = await tryWithAndWithoutFields(
      `https://restcountries.com/v3.1/name/${q}?fullText=true`,
      true
    );
    return { exact, suggestions: [] };
  } catch (_) {}
  try {
    const partial = await tryWithAndWithoutFields(
      `https://restcountries.com/v3.1/name/${q}`,
      true
    );
    return { exact: [], suggestions: partial };
  } catch (_) {
    throw new Error("RESTCountriesSearchFailed");
  }
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

/* DATA: NEWSAPI  via Netlify proxy*/
const NEWSAPI_SUPPORTED = new Set([
  "ae","ar","at","au","be","bg","br","ca","ch","cn","co","cu","cz","de","eg","fr",
  "gb","gr","hk","hu","id","ie","il","in","it","jp","kr","lt","lv","ma","mx","my",
  "ng","nl","no","nz","ph","pl","pt","ro","rs","ru","sa","se","sg","si","sk","th",
  "tr","tw","ua","us","ve","za"
]);

async function fetchNewsForCountry(country) {
  const cca2 = (country?.cca2 || "").toLowerCase();
  const common = country?.name?.common || "";
  const capital = Array.isArray(country?.capital) ? country.capital[0] : (country?.capital || "");

  const get = async (url) => {
    const res = await fetch(url);
    if (!res.ok) return { error: `NewsAPI error (${res.status})` };
    const data = await res.json();
    if (data.status !== "ok") return { error: data.message || "NewsAPI returned an error." };
    return data;
  };

  if (NEWSAPI_SUPPORTED.has(cca2)) {
    const pA = new URLSearchParams({ country: cca2, pageSize: "10" });
    const uA = `${PROXY_BASE}?path=top-headlines&${pA.toString()}`;
    const a = await get(uA);
    if (!a.error && Array.isArray(a.articles) && a.articles.length > 0) return a;
  }

  if (common) {
    const pB = new URLSearchParams({
      q: common,
      sortBy: "publishedAt",
      language: "en",
      pageSize: "10"
    });
    const uB = `${PROXY_BASE}?path=everything&${pB.toString()}`;
    const b = await get(uB);
    if (!b.error && Array.isArray(b.articles) && b.articles.length > 0) return b;

    const pB2 = new URLSearchParams({
      q: common,
      sortBy: "publishedAt",
      pageSize: "10"
    });
    const uB2 = `${PROXY_BASE}?path=everything&${pB2.toString()}`;
    const b2 = await get(uB2);
    if (!b2.error && Array.isArray(b2.articles) && b2.articles.length > 0) return b2;
  }

  if (capital) {
    const pC = new URLSearchParams({
      q: capital,
      sortBy: "publishedAt",
      language: "en",
      pageSize: "10"
    });
    const uC = `${PROXY_BASE}?path=everything&${pC.toString()}`;
    const c = await get(uC);
    if (!c.error && Array.isArray(c.articles) && c.articles.length > 0) return c;

    const pC2 = new URLSearchParams({
      q: capital,
      sortBy: "publishedAt",
      pageSize: "10"
    });
    const uC2 = `${PROXY_BASE}?path=everything&${pC2.toString()}`;
    const c2 = await get(uC2);
    if (!c2.error && Array.isArray(c2.articles) && c2.articles.length > 0) return c2;
  }

  return { status: "ok", articles: [] };
}

/* RENDER */
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
  box.innerHTML = `<p>Did you mean:</p>`;
  picked.forEach(({ display }) => {
    const btn = document.createElement("button");
    btn.type = "button";
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

function renderCountry(c) {
  if (!c) { countryEl.innerHTML = ""; return; }

  const languages = c.languages ? Object.values(c.languages).join(", ") : "—";
  const currencies = c.currencies
    ? Object.values(c.currencies).map(cur => `${cur.name} (${cur.symbol || ""})`).join(", ")
    : "—";
  const capital = Array.isArray(c.capital) ? (c.capital[0] || "—") : (c.capital || "—");
  const flag = c.flags?.svg || c.flags?.png || "";

  const area = c.area != null ? c.area.toLocaleString() + " km²" : "—";
  const timezones = Array.isArray(c.timezones) ? c.timezones.join(", ") : (c.timezones || "—");
  const tlds = Array.isArray(c.tld) ? c.tld.join(", ") : (c.tld || "—");
  const calling = c.idd?.root ? `${c.idd.root}${(c.idd.suffixes || []).join(", ")}`
                               : (c.idd?.suffixes || []).join(", ") || "—";
  const maps = c.maps?.googleMaps || c.maps?.openStreetMaps || "";
  const borders = Array.isArray(c.borders) ? c.borders : [];

  countryEl.innerHTML = `
    <article>
      <h2>${safeText(c.name?.common || c.name)}</h2>
      ${flag ? `<img src="${flag}" alt="Flag of ${safeText(c.name?.common || c.name)}" style="height:40px">` : ""}
      <p><strong>Official:</strong> ${safeText(c.name?.official || c.name)}</p>
      <p><strong>Region:</strong> ${safeText(c.region)} / ${safeText(c.subregion)}</p>
      <p><strong>Capital:</strong> ${safeText(capital)}</p>
      <p><strong>Population:</strong> ${c.population?.toLocaleString?.() ?? "—"}</p>
      <p><strong>Area:</strong> ${area}</p>
      <p><strong>Languages:</strong> ${languages}</p>
      <p><strong>Currencies:</strong> ${currencies}</p>
      <p><strong>Timezones:</strong> ${timezones}</p>
      <p><strong>Calling Code:</strong> ${calling}</p>
      <p><strong>Top-level Domains:</strong> ${tlds}</p>
      <p><strong>ISO:</strong> ${safeText(c.cca2)} / ${safeText(c.cca3)}</p>
      ${maps ? `<p><a href="${maps}" target="_blank" rel="noopener noreferrer">View on map</a></p>` : ""}
      <div id="bordersBlock"></div>
    </article>
  `;

  renderBordersAsync(borders);
}

function renderNews(n) {
  if (!n || n.error) {
    newsEl.innerHTML = `
      <article>
        <h3>Top News</h3>
        <p>${n?.error ? safeText(n.error) : "No news available."}</p>
      </article>
    `;
    return;
  }
  const items = (n.articles || []).slice(0, 10);
  if (items.length === 0) {
    newsEl.innerHTML = `
      <article>
        <h3>Top News</h3>
        <p>No articles found.</p>
      </article>
    `;
    return;
  }
  newsEl.innerHTML = `
    <article>
      <h3>Top News</h3>
      <ul>
        ${items.map(a => `
          <li>
            <a href="${a.url}" target="_blank" rel="noopener noreferrer">${safeText(a.title)}</a>
            ${a.source?.name ? ` <small>(${safeText(a.source.name)})</small>` : ""}
          </li>
        `).join("")}
      </ul>
    </article>
  `;
}

/* NEIGHBOR RENDERING */
async function renderBordersAsync(borders) {
  const mount = $("#bordersBlock");
  if (!mount) return;
  if (!Array.isArray(borders) || borders.length === 0) {
    mount.innerHTML = `<p><strong>Borders:</strong> —</p>`;
    return;
  }

  mount.innerHTML = `<p><strong>Borders:</strong> loading…</p>`;
  try {
    const neighbors = await fetchNeighborsByCca3(borders);
    if (!Array.isArray(neighbors) || neighbors.length === 0) {
      mount.innerHTML = `<p><strong>Borders:</strong> —</p>`;
      return;
    }
    const buttons = neighbors
      .map(n => {
        const name = n?.name?.common || n?.name || n?.cca3 || "Unknown";
        const code = n?.cca3 || "";
        return `<button type="button" class="neighbor-btn" data-cca3="${code}">${name}</button>`;
      })
      .join(" ");

    mount.innerHTML = `
      <div>
        <p><strong>Borders:</strong></p>
        <div>${buttons}</div>
      </div>
    `;

    mount.querySelectorAll(".neighbor-btn").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        const code = e.currentTarget.getAttribute("data-cca3");
        if (!code) return;
        await handleNeighborClick(code);
      });
    });
  } catch (e) {
    mount.innerHTML = `<p><strong>Borders:</strong> —</p>`;
    console.error(e);
  }
}

/* CONTROLLER */
async function showCountry(country, updateInput = true) {
  if (updateInput) {
    const n = country?.name?.common || country?.name || "";
    if (n) inputEl.value = n;
  }

  renderCountry(country);

  try {
    const news = await fetchNewsForCountry(country);
    renderNews(news);
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

async function handleSearch() {
  errorsEl.textContent = "";
  suggestionsEl.innerHTML = "";
  countryEl.innerHTML = "";
  newsEl.innerHTML = "";

  const query = inputEl.value.trim();
  if (!query) {
    errorsEl.textContent = "Please type a country name.";
    return;
  }

  let country = null;

  try {
    const { exact, suggestions } = await searchCountries(query);

    if (Array.isArray(exact) && exact.length) {
      country = exact[0];
    } else if (Array.isArray(suggestions) && suggestions.length) {
      renderSuggestions(suggestions, query);
      errorsEl.textContent = "No exact match. Try a suggestion.";
      return;
    } else {
      errorsEl.textContent = "No matching country found.";
      return;
    }
  } catch (e) {
    errorsEl.textContent = "Country lookup failed. Try again.";
    console.error(e);
    return;
  }

  await showCountry(country, false);
}

/* INIT */
function init() {
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleSearch();
  });
  searchBtn.addEventListener("click", handleSearch);
}

init();
