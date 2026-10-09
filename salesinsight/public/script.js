/* SalesInsight frontend. Sections: 1 helpers, 2 sample data, 3 CSV (ETL), 4 API, 5 filters,
   6 analytics, 7 rendering, 8 compare, 9 events/init. */
'use strict';

// ---------- 1. HELPERS & STATE ----------
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
const num = n => new Intl.NumberFormat('en-US').format(n);
const monthLabel = k => new Date(k + '-01T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
const round2 = n => Math.round(n * 100) / 100;
const FIELDS = ['date', 'product', 'category', 'region', 'quantity', 'unitPrice', 'revenue'];

const state = {
  active: 'sample',
  data: { api: null, csv: null, sample: [] },
  meta: { api: null, csv: null },
  filters: { from: '', to: '', search: '', category: '', region: '' },
  charts: {}
};

function has(records, f) { return records.some(r => r[f] !== null && r[f] !== undefined && r[f] !== ''); }
// Percent change from `from` to `to`; null when the base is zero (avoids Infinity/NaN)
function pctChange(from, to) { return from === 0 ? null : ((to - from) / Math.abs(from)) * 100; }
function pctText(p) { return p === null ? 'n/a (base is 0)' : (p >= 0 ? '+' : '') + p.toFixed(1) + '%'; }
function groupSum(records, keyFn, valFn) {
  const m = new Map();
  for (const r of records) { const k = keyFn(r); if (k === null || k === undefined || k === '') continue; m.set(k, (m.get(k) || 0) + valFn(r)); }
  return m;
}
function topKeys(map) { // returns {keys (ties included), value}
  let best = -Infinity, keys = [];
  for (const [k, v] of map) { if (v > best + 1e-9) { best = v; keys = [k]; } else if (Math.abs(v - best) <= 1e-9) keys.push(k); }
  return { keys, value: best };
}
const monthOf = r => (r.date ? r.date.slice(0, 7) : null);

function message(text, type = 'info', buttons = []) {
  const d = document.createElement('div');
  d.className = 'msg ' + type;
  const s = document.createElement('span'); s.textContent = text; d.appendChild(s);
  const box = document.createElement('span');
  buttons.forEach(([label, fn]) => { const b = document.createElement('button'); b.className = 'btn'; b.textContent = label; b.onclick = () => { d.remove(); fn(); }; box.appendChild(b); });
  const x = document.createElement('button'); x.className = 'btn'; x.textContent = 'Dismiss'; x.onclick = () => d.remove(); box.appendChild(x);
  d.appendChild(box); $('messages').prepend(d);
  if (type === 'ok') setTimeout(() => d.remove(), 6000);
}
function setLoading(on, text) { $('loading').classList.toggle('hidden', !on); if (text) $('loadingText').textContent = text; }

// ---------- 2. SAMPLE DATA (synthetic, generated with a fixed seed so it is identical every time) ----------
function buildSample() {
  let seed = 20250101;
  const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const catalog = [
    ['Wireless Mouse', 'Electronics', 24.99], ['Bluetooth Speaker', 'Electronics', 59.5], ['USB-C Hub', 'Electronics', 39.0], ['Noise-Cancelling Headphones', 'Electronics', 129.0],
    ['Cotton T-Shirt', 'Clothing', 14.99], ['Denim Jacket', 'Clothing', 69.0], ['Running Shoes', 'Clothing', 85.0],
    ['Ceramic Mug Set', 'Home', 22.0], ['LED Desk Lamp', 'Home', 31.5], ['Memory Foam Pillow', 'Home', 45.0],
    ['Notebook Pack', 'Stationery', 8.5], ['Gel Pen Box', 'Stationery', 6.25], ['Yoga Mat', 'Sports', 28.0], ['Water Bottle', 'Sports', 17.99]
  ];
  const regions = ['North', 'South', 'East', 'West'];
  const out = [];
  for (let i = 1; i <= 140; i++) {
    const day = Math.floor(rnd() * 365);
    const dt = new Date(Date.UTC(2025, 0, 1 + day));
    const [name, category, price] = catalog[Math.floor(rnd() * catalog.length)];
    const quantity = 1 + Math.floor(rnd() * 6);
    out.push({ orderId: 'S' + String(i).padStart(4, '0'), date: dt.toISOString().slice(0, 10), product: name, category,
      region: regions[Math.floor(rnd() * 4)], quantity, unitPrice: price, revenue: round2(quantity * price) });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// ---------- 3. CSV UPLOAD (Extract + Transform) ----------
function parseCSV(text) {
  const rows = []; let row = [], cur = '', q = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(v => v.trim() !== ''));
}
const ALIASES = {
  date: ['date', 'orderdate', 'saledate', 'transactiondate', 'invoicedate'],
  product: ['product', 'productname', 'item', 'itemname', 'title'],
  category: ['category', 'productcategory', 'producttype'],
  region: ['region', 'area', 'state', 'country'],
  quantity: ['quantity', 'qty', 'units', 'unitssold'],
  unitPrice: ['unitprice', 'price', 'priceperunit', 'sellingprice'],
  revenue: ['revenue', 'sales', 'total', 'totalsales', 'totalprice', 'amount', 'totalamount'],
  orderId: ['orderid', 'order', 'orderno', 'invoice', 'invoiceno', 'transactionid']
};
const toNum = v => { if (v === undefined || v === null) return null; const s = String(v).replace(/[^0-9.\-]/g, ''); if (s === '' || s === '-' || s === '.') return null; const n = Number(s); return isFinite(n) ? n : null; };
function toDate(v) {
  if (!v || !String(v).trim()) return null;
  let s = String(v).trim();
  const dmy = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/); // day-first only when unambiguous (day > 12)
  if (dmy && Number(dmy[1]) > 12) s = `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? s + 'T00:00:00Z' : s);
  if (isNaN(d)) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function normalizeCSV(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) throw new Error('The file is empty or has no data rows (needs a header row plus at least one record).');
  const header = rows[0].map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const col = {};
  for (const [field, names] of Object.entries(ALIASES)) { const i = header.findIndex(h => names.includes(h)); if (i >= 0) col[field] = i; }
  if (col.revenue === undefined && !(col.quantity !== undefined && col.unitPrice !== undefined))
    throw new Error('Missing required columns. Provide a revenue/sales/total column, OR both quantity and unit price columns. Columns found: ' + rows[0].join(', '));
  const records = []; let skipped = 0;
  rows.slice(1).forEach((r, idx) => {
    const g = f => (col[f] !== undefined ? (r[col[f]] || '').trim() : '');
    const qty = toNum(g('quantity')), price = toNum(g('unitPrice')); let rev = toNum(g('revenue'));
    if (rev === null && qty !== null && price !== null) rev = round2(qty * price); // only when both are really present
    if (rev === null) { skipped++; return; }
    records.push({ orderId: g('orderId') || 'R' + (idx + 1), date: toDate(g('date')), product: g('product') || null, category: g('category') || null,
      region: g('region') || null, quantity: qty, unitPrice: price, revenue: rev });
  });
  if (!records.length) throw new Error('No valid records found: every row was missing a usable revenue value.');
  return { records, skipped };
}

// ---------- 4. LIVE API (frontend only calls OUR backend) ----------
async function fetchApi(isRefresh) {
  setApiStatus('wait', isRefresh ? 'Refreshing...' : 'Connecting...');
  setLoading(true, 'Fetching data from the API via the backend...');
  $('connectBtn').disabled = $('refreshBtn').disabled = true;
  try {
    const res = await fetch('/api/live-sales', { cache: 'no-store' });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `Backend returned HTTP ${res.status}`);
    if (!Array.isArray(body.records) || !body.records.length) throw new Error('Backend returned no records.');
    state.data.api = body.records; state.meta.api = body;
    setApiStatus('ok', 'Connected');
    $('lastFetch').textContent = new Date(body.fetchedAt).toLocaleString();
    message(`Fetched ${body.counts.records} records from ${body.counts.carts} carts (${body.counts.skipped} skipped).`, 'ok');
    switchSource('api');
  } catch (e) {
    setApiStatus('err', 'Failed');
    message('API request failed: ' + e.message, 'err', [['Retry', () => fetchApi(isRefresh)], ['Use sample data', () => switchSource('sample')]]);
  } finally {
    setLoading(false); $('connectBtn').disabled = false; $('refreshBtn').disabled = !state.data.api; updateSourceButtons();
  }
}
function setApiStatus(cls, text) { const e = $('apiStatus'); e.className = 's-' + cls; e.textContent = text; }

// ---------- 5. FILTERS ----------
function applyFilters(records) {
  const f = state.filters, q = f.search.trim().toLowerCase();
  return records.filter(r => {
    if ((f.from || f.to) && !r.date) return false;
    if (f.from && r.date < f.from) return false;
    if (f.to && r.date > f.to) return false;
    if (q && !(r.product || '').toLowerCase().includes(q)) return false;
    if (f.category && r.category !== f.category) return false;
    if (f.region && r.region !== f.region) return false;
    return true;
  });
}
function fillSelect(sel, values, label, current) {
  sel.innerHTML = '';
  const add = (v, t) => { const o = document.createElement('option'); o.value = v; o.textContent = t; sel.appendChild(o); };
  add('', label); values.forEach(v => add(v, v));
  sel.value = values.includes(current) ? current : ''; sel.disabled = !values.length;
}
function syncFilterControls() {
  const recs = state.data[state.active] || [];
  const uniq = f => [...new Set(recs.map(r => r[f]).filter(Boolean))].sort();
  fillSelect($('fCategory'), uniq('category'), has(recs, 'category') ? 'All categories' : 'No category data', state.filters.category);
  fillSelect($('fRegion'), uniq('region'), has(recs, 'region') ? 'All regions' : 'No region data', state.filters.region);
  const dates = recs.map(r => r.date).filter(Boolean).sort();
  $('fFrom').min = $('fTo').min = dates[0] || ''; $('fFrom').max = $('fTo').max = dates[dates.length - 1] || '';
  $('fFrom').disabled = $('fTo').disabled = !dates.length; $('fSearch').disabled = !has(recs, 'product');
  state.filters.category = $('fCategory').value; state.filters.region = $('fRegion').value;
}
function clearFilters() {
  state.filters = { from: '', to: '', search: '', category: '', region: '' };
  $('fFrom').value = $('fTo').value = $('fSearch').value = '';
  syncFilterControls(); render();
}

// ---------- 6. SOURCE SWITCHING ----------
function switchSource(src) {
  if (!state.data[src] || !state.data[src].length) return;
  state.active = src;
  state.filters = { from: '', to: '', search: '', category: '', region: '' };
  $('fFrom').value = $('fTo').value = $('fSearch').value = '';
  syncFilterControls(); updateSourceButtons(); render();
}
function updateSourceButtons() {
  document.querySelectorAll('#sourceSwitch button').forEach(b => {
    b.disabled = !(state.data[b.dataset.src] && state.data[b.dataset.src].length);
    b.classList.toggle('on', b.dataset.src === state.active);
  });
  const badge = $('sourceBadge');
  const names = { api: 'Live API (mock e-commerce data)', csv: 'Uploaded CSV' + (state.meta.csv ? ': ' + state.meta.csv.name : ''), sample: 'Sample data (synthetic)' };
  badge.textContent = names[state.active]; badge.className = 'badge ' + state.active;
  $('sourceNote').textContent = state.active === 'api'
    ? 'Fake Store API: static demo data from 2020. Refresh re-fetches it but it will not change. Not real-time, not real sales.'
    : state.active === 'sample' ? 'Synthetic demonstration data (140 generated records). Not live.' : 'Data from your uploaded file.';
}

// ---------- 7. ANALYTICS + RENDERING ----------
function kpisOf(recs) {
  const hasRev = has(recs, 'revenue'), hasQty = has(recs, 'quantity');
  const revenue = recs.reduce((s, r) => s + (r.revenue || 0), 0);
  const orders = new Set(recs.map(r => r.orderId)).size;
  const units = recs.reduce((s, r) => s + (r.quantity || 0), 0);
  return { hasRev, hasQty, revenue, orders, units, aov: orders ? revenue / orders : 0 };
}
function themeColors() {
  const cs = getComputedStyle(document.documentElement);
  return { text: cs.getPropertyValue('--muted').trim(), grid: cs.getPropertyValue('--border').trim() };
}
const PALETTE = ['#3b82f6', '#8b5cf6', '#06b6d4', '#f59e0b', '#ec4899', '#10b981', '#6366f1', '#ef4444'];

function render() {
  const all = state.data[state.active] || [];
  const recs = applyFilters(all);
  const info = all.length ? `${num(recs.length)} of ${num(all.length)} records shown` : '';
  $('datasetInfo').textContent = info;
  const empty = $('empty'), content = $('content');
  if (!all.length) { content.classList.add('hidden'); empty.classList.remove('hidden'); empty.textContent = 'No data loaded. Choose a data source.'; return; }
  if (!recs.length) { content.classList.add('hidden'); empty.classList.remove('hidden'); empty.textContent = 'No records match the current filters. Try clearing them.'; return; }
  empty.classList.add('hidden'); content.classList.remove('hidden');
  renderKpis(recs); renderCharts(recs); renderInsights(recs); renderCompare(recs, all);
}

function renderKpis(recs) {
  const k = kpisOf(recs);
  const defs = [
    ['Total Revenue', k.hasRev, money(k.revenue), 'No revenue values in this dataset.'],
    ['Total Orders', true, num(k.orders), ''],
    ['Total Units Sold', k.hasQty, num(k.units), 'No quantity column - units cannot be calculated.'],
    ['Average Order Value', k.hasRev && k.orders > 0, money(k.aov), 'Needs revenue values to calculate.']
  ];
  $('kpis').innerHTML = defs.map(([l, ok, v, why]) => `<div class="card kpi ${ok ? '' : 'na'}"><div class="lbl">${l}</div><div class="val">${ok ? v : esc(why)}</div></div>`).join('');
}

function drawChart(id, config, ok, reason) {
  const canvas = $(id), note = canvas.closest('.chart-card').querySelector('.na');
  if (state.charts[id]) { state.charts[id].destroy(); delete state.charts[id]; }
  canvas.parentElement.classList.toggle('hidden', !ok); note.classList.toggle('hidden', ok); note.textContent = reason || '';
  if (ok) state.charts[id] = new Chart(canvas, config);
}
function axisOpts(xt, yt, c) {
  return { responsive: true, maintainAspectRatio: false,
    scales: { x: { title: { display: true, text: xt, color: c.text }, ticks: { color: c.text }, grid: { color: c.grid } },
              y: { beginAtZero: true, title: { display: true, text: yt, color: c.text }, ticks: { color: c.text, callback: v => '$' + num(v) }, grid: { color: c.grid } } },
    plugins: { legend: { labels: { color: c.text } }, tooltip: { callbacks: { label: ctx => ' ' + money(ctx.parsed.y ?? ctx.parsed) } } } };
}
function renderCharts(recs) {
  const c = themeColors();
  const rev = r => r.revenue || 0;
  const months = [...groupSum(recs, monthOf, rev)].sort((a, b) => a[0].localeCompare(b[0]));
  drawChart('trendChart', { type: 'line', data: { labels: months.map(m => monthLabel(m[0])), datasets: [{ label: 'Revenue', data: months.map(m => round2(m[1])), borderColor: '#3b82f6', backgroundColor: 'rgba(139,92,246,.18)', fill: true, tension: .3, pointRadius: 4 }] },
    options: axisOpts('Month', 'Revenue (USD)', c) }, months.length > 0, 'No usable dates, so a monthly trend cannot be drawn.');
  const cats = [...groupSum(recs, r => r.category, rev)].sort((a, b) => b[1] - a[1]);
  drawChart('categoryChart', { type: 'bar', data: { labels: cats.map(x => x[0]), datasets: [{ label: 'Revenue', data: cats.map(x => round2(x[1])), backgroundColor: cats.map((_, i) => PALETTE[i % PALETTE.length]), borderRadius: 6 }] },
    options: axisOpts('Category', 'Revenue (USD)', c) }, cats.length > 0, 'This dataset has no category column.');
  const regs = [...groupSum(recs, r => r.region, rev)].sort((a, b) => b[1] - a[1]);
  drawChart('regionChart', { type: 'doughnut', data: { labels: regs.map(x => x[0]), datasets: [{ data: regs.map(x => round2(x[1])), backgroundColor: regs.map((_, i) => PALETTE[i % PALETTE.length]), borderColor: 'transparent' }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: c.text } }, tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${money(ctx.parsed)}` } } } } }, regs.length > 0, 'This dataset has no region information.');
}

function renderInsights(recs) {
  const items = []; const add = (t, cls = '') => items.push(`<li class="${cls}">${t}</li>`);
  const k = kpisOf(recs), rev = r => r.revenue || 0;
  if (k.hasRev) add(`Total revenue is <b>${money(k.revenue)}</b>${k.hasQty ? ` from <b>${num(k.units)}</b> units sold` : ''}.`);
  const list = ks => ks.map(esc).join(' and ');
  if (has(recs, 'product') && k.hasQty) { const t = topKeys(groupSum(recs, r => r.product, r => r.quantity || 0)); add(`Best-selling product by units: <b>${list(t.keys)}</b> (${num(t.value)} units${t.keys.length > 1 ? ' each, tied' : ''}).`); }
  else add('Best-selling product cannot be found: product or quantity data is missing.', 'warn');
  const cat = groupSum(recs, r => r.category, rev); if (cat.size) { const t = topKeys(cat); add(`Highest-revenue category: <b>${list(t.keys)}</b> (${money(t.value)}${t.keys.length > 1 ? ' each, tied' : ''}).`); }
  const reg = groupSum(recs, r => r.region, rev); if (reg.size) { const t = topKeys(reg); add(`Best-performing region: <b>${list(t.keys)}</b> (${money(t.value)}${t.keys.length > 1 ? ' each, tied' : ''}).`); }
  const mon = groupSum(recs, monthOf, rev);
  if (mon.size) { const t = topKeys(mon); add(`Month with the highest revenue: <b>${t.keys.map(monthLabel).join(' and ')}</b> (${money(t.value)}).`); }
  const sorted = [...mon].sort((a, b) => a[0].localeCompare(b[0]));
  if (sorted.length >= 2) {
    let up = null, down = null;
    for (let i = 1; i < sorted.length; i++) { const d = sorted[i][1] - sorted[i - 1][1], pair = [sorted[i - 1], sorted[i], d]; if (d > 0 && (!up || d > up[2])) up = pair; if (d < 0 && (!down || d < down[2])) down = pair; }
    const desc = p => `${monthLabel(p[0][0])} to ${monthLabel(p[1][0])}: ${money(Math.abs(p[2]))} (${pctText(pctChange(p[0][1], p[1][1]))})`;
    if (up) add('Biggest month-to-month increase: ' + desc(up), 'up');
    if (down) add('Biggest month-to-month decrease: ' + desc(down), 'down');
    if (!up && !down) add('Revenue was flat across all months.');
  } else add('Not enough monthly data (need 2+ months) to detect increases or decreases.', 'warn');
  $('insightList').innerHTML = items.join('');
}

// ---------- 8. COMPARISON ----------
function cmpCard(label, from, to, fmt) {
  const d = to - from, p = pctChange(from, to), cls = d > 0 ? 'up' : d < 0 ? 'down' : '';
  return `<div class="cmp"><div class="muted small">${esc(label)}</div><div>${fmt(from)} &rarr; ${fmt(to)}</div><b class="${cls}">${d >= 0 ? '+' : '-'}${fmt(Math.abs(d))}</b> <span class="${cls}">(${pctText(p)})</span></div>`;
}
function renderCompare(recs) {
  // Previous vs current period = latest month vs the month before it in the filtered data
  const byMonth = [...new Set(recs.map(monthOf).filter(Boolean))].sort();
  const box = $('periodCompare');
  if (byMonth.length >= 2) {
    const cur = byMonth[byMonth.length - 1], prev = byMonth[byMonth.length - 2];
    const kp = kpisOf(recs.filter(r => monthOf(r) === prev)), kc = kpisOf(recs.filter(r => monthOf(r) === cur));
    box.innerHTML = `<div class="muted small" style="grid-column:1/-1">Previous period (${monthLabel(prev)}) vs current period (${monthLabel(cur)})</div>` +
      cmpCard('Revenue', kp.revenue, kc.revenue, money) + cmpCard('Orders', kp.orders, kc.orders, num) + (kp.hasQty ? cmpCard('Units', kp.units, kc.units, num) : '');
  } else box.innerHTML = '<div class="muted small">Period comparison needs data from at least two different months.</div>';
  fillCompareOptions(recs);
}
function dimGroups(recs, dim) {
  const key = dim === 'month' ? monthOf : r => r[dim];
  const m = groupSum(recs, key, r => r.revenue || 0);
  return [...m].sort((a, b) => dim === 'month' ? a[0].localeCompare(b[0]) : b[1] - a[1]);
}
function fillCompareOptions(recs) {
  const dim = $('cmpDim').value, groups = dimGroups(recs, dim);
  const keep = [$('cmpA').value, $('cmpB').value];
  [$('cmpA'), $('cmpB')].forEach(sel => { sel.innerHTML = groups.map(([k]) => `<option value="${esc(k)}">${esc(dim === 'month' ? monthLabel(k) : k)}</option>`).join(''); sel.disabled = groups.length < 2; });
  const keys = groups.map(g => g[0]);
  $('cmpA').value = keys.includes(keep[0]) ? keep[0] : (keys[0] || '');
  $('cmpB').value = keys.includes(keep[1]) && keep[1] !== $('cmpA').value ? keep[1] : (keys[1] || keys[0] || '');
  renderCompareResult(groups, dim);
}
function renderCompareResult(groups, dim) {
  const res = $('cmpResult');
  if (state.charts.cmpChart) { state.charts.cmpChart.destroy(); delete state.charts.cmpChart; }
  if (groups.length < 2) { res.innerHTML = `<div class="muted small">Need at least two ${dim === 'month' ? 'months' : dim + ' values'} to compare (this dataset/filter has ${groups.length}).</div>`; return; }
  const lab = k => dim === 'month' ? monthLabel(k) : k, map = new Map(groups);
  const a = $('cmpA').value, b = $('cmpB').value;
  res.innerHTML = cmpCard(`Revenue: ${lab(a)} to ${lab(b)}`, map.get(a) || 0, map.get(b) || 0, money);
  const c = themeColors();
  state.charts.cmpChart = new Chart($('cmpChart'), { type: 'bar', data: { labels: [lab(a), lab(b)], datasets: [{ label: 'Revenue', data: [round2(map.get(a) || 0), round2(map.get(b) || 0)], backgroundColor: ['#3b82f6', '#8b5cf6'], borderRadius: 8 }] },
    options: { ...axisOpts(dim === 'month' ? 'Month' : dim, 'Revenue (USD)', c), plugins: { legend: { display: false }, tooltip: { callbacks: { label: x => ' ' + money(x.parsed.y) } } } } });
}

// ---------- 9. EXPORT, THEME, EVENTS ----------
function exportCSV() {
  const recs = applyFilters(state.data[state.active] || []);
  if (!recs.length) return message('Nothing to export: no records match the current filters.', 'err');
  const cell = v => { if (v === null || v === undefined) return ''; let s = String(v); if (typeof v === 'string' && /^[=+\-@]/.test(s)) s = "'" + s; return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const head = ['Date', 'Order ID', 'Product', 'Category', 'Region', 'Quantity', 'Unit Price', 'Revenue'];
  const lines = [head.join(',')].concat(recs.map(r => [r.date, r.orderId, r.product, r.category, r.region, r.quantity, r.unitPrice, r.revenue].map(cell).join(',')));
  const url = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `salesinsight_${state.active}_export.csv` });
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  message(`Exported ${recs.length} records.`, 'ok');
}
function setTheme(t, save) {
  document.documentElement.dataset.theme = t;
  $('themeBtn').innerHTML = t === 'dark' ? '&#9728; Light' : '&#9790; Dark';
  if (save) { try { localStorage.setItem('salesinsight-theme', t); } catch (e) { /* storage blocked: ignore */ } }
  if (state.data[state.active]) render();
}
async function handleCSV(file) {
  if (!file) return;
  try {
    if (!/\.csv$/i.test(file.name)) throw new Error('Invalid file type. Please upload a .csv file.');
    if (file.size > 5 * 1024 * 1024) throw new Error('File is larger than 5 MB.');
    if (file.size === 0) throw new Error('The file is empty.');
    const { records, skipped } = normalizeCSV(await file.text());
    state.data.csv = records; state.meta.csv = { name: file.name };
    message(`Loaded ${records.length} records from ${file.name}` + (skipped ? ` (${skipped} rows skipped: no usable revenue).` : '.'), 'ok');
    switchSource('csv');
  } catch (e) { message('CSV upload failed: ' + e.message, 'err'); }
  finally { $('csvInput').value = ''; }
}

function init() {
  let saved = null; try { saved = localStorage.getItem('salesinsight-theme'); } catch (e) {}
  document.documentElement.dataset.theme = saved === 'dark' ? 'dark' : 'light';
  $('themeBtn').innerHTML = saved === 'dark' ? '&#9728; Light' : '&#9790; Dark';
  state.data.sample = buildSample();
  $('connectBtn').onclick = () => fetchApi(false);
  $('refreshBtn').onclick = () => fetchApi(true);
  $('themeBtn').onclick = () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark', true);
  $('restoreBtn').onclick = () => { switchSource('sample'); message('Sample data restored.', 'ok'); };
  $('exportBtn').onclick = exportCSV;
  $('clearBtn').onclick = clearFilters;
  $('csvInput').onchange = e => handleCSV(e.target.files[0]);
  document.querySelectorAll('#sourceSwitch button').forEach(b => b.onclick = () => switchSource(b.dataset.src));
  const on = (id, key, ev = 'input') => $(id).addEventListener(ev, e => { state.filters[key] = e.target.value; render(); });
  on('fFrom', 'from'); on('fTo', 'to'); on('fSearch', 'search'); on('fCategory', 'category', 'change'); on('fRegion', 'region', 'change');
  $('cmpDim').onchange = () => render();
  $('cmpA').onchange = $('cmpB').onchange = () => { const r = applyFilters(state.data[state.active]); renderCompareResult(dimGroups(r, $('cmpDim').value), $('cmpDim').value); };
  $('menuBtn').onclick = () => $('sidebar').classList.toggle('open');
  document.querySelectorAll('nav a').forEach(a => a.onclick = () => { document.querySelectorAll('nav a').forEach(x => x.classList.remove('active')); a.classList.add('active'); $('sidebar').classList.remove('open'); });
  switchSource('sample');
}
document.addEventListener('DOMContentLoaded', init);
