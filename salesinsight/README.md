# SalesInsight - Live Sales Analytics Dashboard

Data Mining & Warehousing mini-project. Node.js + Express backend, plain HTML/CSS/JS frontend, Chart.js charts.

## The API used (read this honestly)
**Fake Store API** - `https://fakestoreapi.com` - free, **no API key**, no signup.
Endpoints used: `/carts`, `/products`, `/users`.

| Data | Supplied by API? |
|---|---|
| Date | Yes (`carts[].date`) |
| Product name, unit price, category | Yes (`/products`) |
| Quantity | Yes (`carts[].products[].quantity`) |
| Region | Only the user's **city** (`/users[].address.city`), shown as "Region" |
| Revenue / line total | **No** - derived as quantity x unit price (both genuinely supplied) |

**Limitations:** it is a *mock* shop. Carts are treated as orders, but they are **not real sales**. The data is **static, historical (2020) and small** (about 7 carts), so Refresh returns the same data and the trend has only a few months. It is not real-time. No free public API offers real sales transactions, so this is the closest legitimate source. Sample data (140 synthetic records) is used for richer demos and is always labelled synthetic.
The upstream URL is configurable via `API_BASE_URL` in `.env`, so you can point to another Fake Store API-compatible host if the default is down.

## ETL pipeline
- **Extract:** `server.js` fetches carts, products and users in parallel (10s timeout); CSV is read in the browser.
- **Transform:** validate, join carts with products and users, parse dates, convert numbers, normalise CSV column names (e.g. `Product_Name` -> product), skip invalid rows, never invent missing values (missing region stays empty).
- **Load:** records are kept in memory (`state.data`), then `render()` rebuilds KPIs, charts, insights and comparisons from the filtered records. Every chart is rebuilt from data on each filter/source change; nothing is hardcoded.

## Run on Windows (VS Code)
1. Install **Node.js LTS (18+)** from nodejs.org and **VS Code**. Check: `node -v`, `npm -v`.
2. VS Code -> File -> Open Folder -> select `salesinsight`. Open a terminal (Ctrl + `).
3. `npm install`
4. `copy .env.example .env` (no key is needed; defaults work)
5. `npm start`
6. Open **http://localhost:3000**

## Testing checklist
- [ ] Page loads with *Sample data (synthetic)* badge, 4 KPI cards, 3 charts, insights.
- [ ] **Connect API** -> spinner, status "Connected", last-fetch time, badge "Live API". **Refresh Data** makes a new request and updates the time.
- [ ] Stop internet / set `API_BASE_URL=http://localhost:9` -> red error with **Retry** and **Use sample data**; data is never silently replaced.
- [ ] Filters: dates, product search, category, region; KPIs/charts/insights/comparisons update; **Clear Filters** resets.
- [ ] Upload a CSV (columns like `Date,Product,Category,Region,Quantity,Unit Price`). Try an empty file and a wrong-columns file to see errors.
- [ ] **Export CSV** downloads only filtered rows. **Restore Sample Data** reloads sample.
- [ ] Comparison: pick months/categories/regions A and B; check the difference and % (a zero base shows "n/a").
- [ ] Dark mode toggle, then reload: the choice persists (LocalStorage).
- [ ] Resize to phone width: sidebar collapses behind the menu button.

Example CSV:
```
Date,Product,Category,Region,Quantity,Unit Price
2025-01-05,Pen,Stationery,North,10,1.5
2025-02-11,Lamp,Home,South,2,30
```
Dates: use `YYYY-MM-DD`. Slash dates are read day-first only when the first number is above 12, otherwise month-first.

## Troubleshooting
- `npm` / `node` not recognised: reinstall Node and restart VS Code.
- `Cannot find module 'express'`: run `npm install` in the project folder.
- `EADDRINUSE`: port busy; change `PORT` in `.env`.
- Charts blank / `Chart is not defined`: `npm install` was skipped (Chart.js is served from `node_modules`).
- "API request failed... timed out / Could not reach": network or firewall issue; retry or raise `API_TIMEOUT_MS`. HTTP 429 means rate limited; wait.
- "Invalid API key" / 401: this API needs no key. For another API, put the key in `.env` and add it in `getJson()` in `server.js` (server-side only).
- CORS errors: the browser only calls your own `/api/live-sales`, so CORS should not occur. Open the site via `http://localhost:3000`, not by double-clicking `index.html`.

## Deploy (Render.com example)
Frontend and backend deploy together because Express serves `public/`.
1. Push to GitHub (`.env` and `node_modules` are git-ignored).
2. Render -> New -> **Web Service** -> connect the repo.
3. Build command `npm install`, start command `npm start`, runtime Node.
4. Add environment variables from `.env.example` if you changed any (Render sets `PORT` itself).
5. Open the generated `https://...onrender.com` URL. Railway and Cyclic work the same way.
