// SalesInsight backend: serves the website and exposes /api/live-sales.
// ETL (Extract + Transform) for the external API happens here; the browser does the Load/render.
require('dotenv').config();
const express = require('express');
const path = require('path');

const PORT = process.env.PORT || 3000;
const BASE = (process.env.API_BASE_URL || 'https://fakestoreapi.com').replace(/\/$/, '');
const TIMEOUT = Number(process.env.API_TIMEOUT_MS) || 10000;

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
// Serve Chart.js from node_modules so no CDN is needed
app.use('/vendor', express.static(path.join(__dirname, 'node_modules', 'chart.js', 'dist')));

// ---------- EXTRACT ----------
async function getJson(endpoint) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(BASE + endpoint, {
      signal: ctrl.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'SalesInsight-college-project' }
      // If an API key were required: add it here from process.env.API_KEY (never in frontend code)
    });
    if (res.status === 429) throw new Error('Rate limit reached (HTTP 429). Wait a minute and retry.');
    if (!res.ok) throw new Error(`${endpoint} returned HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    if (e.name === 'AbortError') throw new Error(`${endpoint} timed out after ${TIMEOUT / 1000}s`);
    throw new Error(`Could not reach ${BASE}${endpoint} (${e.cause?.code || e.message}). Check your internet connection or API_BASE_URL.`);
  } finally { clearTimeout(timer); }
}

const titleCase = s => String(s || '').trim().replace(/(^|\s)\w/g, c => c.toUpperCase());

// ---------- TRANSFORM ----------
function transform(carts, products, users) {
  const prodMap = new Map(products.map(p => [p.id, p]));
  const userMap = new Map(users.map(u => [u.id, u]));
  const records = [];
  let skipped = 0;
  for (const cart of carts) {
    const date = new Date(cart.date);
    if (isNaN(date) || !Array.isArray(cart.products)) { skipped++; continue; }
    const city = userMap.get(cart.userId)?.address?.city;
    for (const line of cart.products) {
      const p = prodMap.get(line.productId);
      const qty = Number(line.quantity), price = Number(p?.price);
      if (!p || !(qty > 0) || !isFinite(price)) { skipped++; continue; }
      records.push({
        orderId: 'C' + cart.id,
        date: date.toISOString().slice(0, 10),
        product: p.title,
        category: titleCase(p.category),
        region: city ? titleCase(city) : null, // null = not supplied; never invented
        quantity: qty,
        unitPrice: price,
        revenue: Math.round(qty * price * 100) / 100 // API gives no line total, so qty x price
      });
    }
  }
  return { records, skipped };
}

// ---------- API endpoint for the frontend ----------
app.get('/api/live-sales', async (req, res) => {
  try {
    const [carts, products, users] = await Promise.all([getJson('/carts'), getJson('/products'), getJson('/users')]);
    if (![carts, products, users].every(Array.isArray)) throw new Error('Unexpected response format from the API (expected JSON arrays).');
    const { records, skipped } = transform(carts, products, users);
    if (!records.length) throw new Error('API responded but contained no usable records.');
    res.json({
      fetchedAt: new Date().toISOString(),
      source: `Fake Store API (${BASE})`,
      nature: 'Mock/demo e-commerce carts, treated as orders. Static historical data - NOT real-time and NOT real customer sales.',
      counts: { carts: carts.length, products: products.length, users: users.length, records: records.length, skipped },
      records
    });
  } catch (e) {
    console.error('Live API error:', e.message);
    res.status(502).json({ error: e.message });
  }
});

app.listen(PORT, () => console.log(`SalesInsight running at http://localhost:${PORT}`));
