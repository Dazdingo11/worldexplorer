# WorldExplorer

A responsive web application for exploring countries around the world. Built with Bootstrap, semantic HTML, and modern JavaScript, it allows users to view, search, and filter country data fetched from a public API.

![Site preview](assets/images/screenshot.webp)

## Site preview

[![Live demo](https://img.shields.io/badge/Live%20Demo-View-brightgreen?style=for-the-badge)](https://dazdingo11.github.io/worldexplorer/)

## Overview

- Single HTML entry: `index.html`
- Country data is fetched from a public API and rendered dynamically by `assets/scripts/script.js`.
- Built with Bootstrap 5 and small, focused custom CSS in `assets/css/style.css`

## Features

- Responsive layout using Bootstrap's grid system
- Accessible, semantic markup
- Dynamically generated country cards
- Search and filter functionality
- Modern image assets in WebP format for good performance

## Tech stack

- HTML5
- CSS3 (Bootstrap 5 + custom styles)
- JavaScript (ES modules)
- License: MIT

## Quick start

Clone the repository:
```bash
git clone https://github.com/Dazdingo11/worldexplorer.git
cd worldexplorer
```

Since this project uses ES module imports and may fetch data from APIs, you'll need to run it from a local web server to avoid CORS and module loading issues.

If you have Python 3 installed:
```bash
python3 -m http.server 8000
```

Or, if you have Node.js and http-server installed:
```bash
npx http-server -p 8000
```

Open your browser and navigate to `http://localhost:8000`.

## Project Structure

```
index.html — main page
assets/
  css/       — style.css (and other CSS assets)
  images/    — webp images used by the site
  scripts/   — script.js (and any other JS files)
LICENSE       — project license (MIT)
```

## Cloudflare Protection & APIs Used

We use **Cloudflare** to protect and accelerate our API traffic (WAF, DDoS mitigation, caching) and to proxy selected upstream APIs. This avoids CORS issues, keeps credentials out of the browser, enables basic validation, and allows edge caching.

- **Cloudflare Worker / Proxy Base**  
  `https://worldexplorer.arkadain1994.workers.dev`  
  Client code calls this base via query params to reach upstream news endpoints through a secured proxy.

### APIs powering the app

1. **REST Countries API (v3.1)** — primary source of country data  
   - Base: `https://restcountries.com/v3.1/`  
   - Used endpoints & patterns:
     - `GET /all?fields=...` for the full country list with selected fields  
     - `GET /name/{query}?fullText=true&fields=...` for exact matches  
     - `GET /name/{query}?fields=...` for partial matches  
     - `GET /alpha?codes={CCA3,CCA3,...}&fields=...` for neighbors  

2. **Wikipedia REST API (Page Summary)** — country summary content  
   - Base: `https://en.wikipedia.org/api/rest_v1/`  
   - Used endpoint:
     - `GET /page/summary/{CountryName}` to render the descriptive summary section.

3. **News API (proxied via Cloudflare Worker)** — country-related news  
   - Public calls **do not hit the upstream directly**; they go through the Worker at:  
     - `GET ${PROXY_BASE}?path=top-headlines&country={cca2}&pageSize=10`  
     - `GET ${PROXY_BASE}?path=everything&q="..."&from=...&sortBy=publishedAt&language=en&pageSize=10`  
   - The Worker forwards these requests to the upstream news provider, injecting the API key from **Cloudflare environment variables**, and can add caching and basic rate limiting.  
   - Benefits: hides API keys, avoids browser-side CORS pain, and enables security controls.

4. **IANA Time Zone Mapping (for accurate local times)** — local time display for each country’s capital  
   - Implemented internally using a predefined IANA mapping table in `app.js`.  
   - Each country’s ISO code (e.g., `GB`, `JP`, `IN`) maps to its corresponding IANA time zone identifier such as `Europe/London`, `Asia/Tokyo`, or `Asia/Kolkata`.  
   - Used APIs and browser features:
     - **Intl.DateTimeFormat** — for local time formatting based on IANA zone names.  
     - **Built-in Date API** — for calculating current time with region-accurate offsets.  
   - Purpose:
     - Ensures that capital cities display the correct **local time**, even when daylight saving or regional variations apply.  
     - Provides accurate and human-readable time formatting in the “Cities” panel without external API dependencies.


## Contributing

Contributions are welcome! Please open an issue to discuss what you would like to change or submit a pull request.

## Contributors

A big thank you to all our contributors for their hard work and dedication!  

<a href="https://github.com/leightongrant" title="leightongrant">
  <img src="https://github.com/leightongrant.png?size=60" alt="leightongrant" width="60" height="60" style="border-radius: 50%;">
</a>
<a href="https://github.com/Dazdingo11" title="Dazdingo11">
  <img src="https://github.com/Dazdingo11.png?size=60" alt="Dazdingo11" width="60" height="60" style="border-radius: 50%;">
</a>
<a href="https://github.com/mamtadhone" title="mamtadhone">
  <img src="https://github.com/mamtadhone.png?size=60" alt="mamtadhone" width="60" height="60" style="border-radius: 50%;">
</a>

## License

This project is licensed under the MIT License — see the `LICENSE` file for details.

## Contact

For questions or feedback you can reach the author via the email in the site footer or by opening an issue in this repository.
