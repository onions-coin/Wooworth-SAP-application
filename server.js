const express = require('express');
const path = require('node:path');
const fs = require('node:fs');

// Keep existing server/.env installations working. Root .env takes precedence.
for (const file of ['.env', 'server/.env']) {
  const filename = path.join(__dirname, file);
  if (!fs.existsSync(filename)) continue;
  // These settings are simple single-line keys/URLs; no dotenv dependency needed.
  for (const line of fs.readFileSync(filename, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, '').trim();
    process.env[match[1]] = value;
  }
}

const DEFAULT_BASE = 'https://sandbox.api.sap.com/s4hanacloud/sap/opu/odata4/sap/api_salesorder/srvd_a2x/sap/salesorder/0001';
class SapError extends Error {
  constructor(message, status = 502, connectionStatus = 'Connection Error') {
    super(message);
    this.status = status;
    this.connectionStatus = connectionStatus;
  }
}

function groupItems(rows) {
  const orders = new Map();
  for (const row of rows) {
    if (row.SalesOrder == null || row.SalesOrderItem == null || !String(row.SalesOrder) || !String(row.SalesOrderItem)) {
      throw new SapError('SAP returned items without SalesOrder or SalesOrderItem IDs. Check SAP_ITEMS_URL.');
    }
    const id = String(row.SalesOrder);
    const itemId = String(row.SalesOrderItem);
    if (!orders.has(id)) orders.set(id, { id, items: [] });
    const items = orders.get(id).items;
    if (items.some(item => item.id === itemId)) continue;
    items.push({
      id: itemId,
      productId: row.Product == null ? '' : String(row.Product),
      description: String(row.SalesOrderItemText || row.ProductDescription || row.ProductName || ''),
      quantity: row.RequestedQuantity ?? row.OrderQuantity ?? null,
      unit: String(row.RequestedQuantityISOUnit || row.RequestedQuantityUnit || row.OrderQuantityUnit || ''),
      sapFields: Object.fromEntries(['SalesOrder', 'SalesOrderItem', 'Product', 'SalesOrderItemText', 'RequestedQuantity', 'RequestedQuantityISOUnit', 'RequestedQuantityUnit', 'OrderQuantity', 'OrderQuantityUnit', 'NetAmount', 'TransactionCurrency', 'NetPriceAmount', 'NetPriceQuantity', 'NetPriceQuantityUnit'].filter(field => row[field] !== undefined && row[field] !== null).map(field => [field, row[field]]))
    });
  }
  return [...orders.values()];
}

function createApp(options = {}) {
  const env = options.env || process.env;
  const request = options.fetch || fetch;
  const app = express();
  app.disable('x-powered-by');
  let cached = null;
  let pending = null;

  async function retrieveOrders(orderId = null) {
    const key = env.SAP_API_KEY?.trim();
    if (!key || /^your_|^replace_/i.test(key)) {
      throw new SapError('SAP is not configured. Set SAP_API_KEY in .env, then restart the app.', 503, 'Not Configured');
    }
    let first;
    try {
      const base = (env.SAP_BASE_URL || DEFAULT_BASE).replace(/\/$/, '');
      first = new URL(env.SAP_ITEMS_URL || `${base}/SalesOrderItem`);
      if (!['http:', 'https:'].includes(first.protocol) || first.username || first.password) throw new Error();
      if (orderId !== null) {
        first.searchParams.set('$filter', `SalesOrder eq '${orderId.replace(/'/g, "''")}'`);
        for (const parameter of ['$top', '$skip', '$skiptoken']) first.searchParams.delete(parameter);
      }
    } catch {
      throw new SapError('SAP endpoint is not configured correctly. Check SAP_BASE_URL or SAP_ITEMS_URL in .env.', 503, 'Not Configured');
    }
    const maxPages = orderId === null ? Math.min(100, Math.max(1, Number(env.SAP_MAX_PAGES) || 1)) : 100;
    const signal = AbortSignal.timeout(30000);
    let next = first;
    const rows = [];
    const visited = new Set();
    let pages = 0;
    while (next && pages < maxPages) {
      // Never forward the API key to a different host or follow redirects.
      if (next.origin !== first.origin || next.username || next.password || visited.has(next.href)) {
        throw new SapError('SAP returned an invalid pagination link. No credentials were forwarded.');
      }
      visited.add(next.href);
      const response = await request(next.href, {
        method: 'GET', headers: { apikey: key, Accept: 'application/json' }, redirect: 'error', signal
      });
      if (!response.ok) {
        const advice = [401, 403].includes(response.status)
          ? 'Check your API key and Sales Order API access.'
          : response.status === 404 ? 'Check SAP_ITEMS_URL; it must point to the SalesOrderItem collection.'
            : response.status === 429 ? 'SAP is rate limiting requests. Please try again shortly.' : 'Please try again or check the SAP service.';
        throw new SapError(`SAP returned HTTP ${response.status}. ${advice}`);
      }
      let data;
      try { data = await response.json(); } catch { throw new SapError('SAP returned an unreadable response. Expected OData JSON.'); }
      if (!Array.isArray(data.value)) throw new SapError('SAP returned an unexpected response. SAP_ITEMS_URL must return an OData value array of sales order items.');
      rows.push(...data.value);
      pages++;
      const link = data['@odata.nextLink'];
      // OData links may be absolute, query-relative, or relative to the service root.
      next = link ? new URL(link, next) : null;
      if (orderId === null && new Set(rows.map(row => String(row.SalesOrder))).size >= 20) break;
    }
    const grouped = groupItems(rows);
    const orders = orderId === null ? grouped.slice(0, 20) : grouped;
    if (orderId !== null && orders.some(order => order.id !== orderId)) {
      throw new SapError('SAP did not apply the order filter. The complete item list could not be confirmed. Check SAP_ITEMS_URL.');
    }
    return {
      orders,
      kpi: { label: 'Loaded SAP Sales Orders', value: orders.length },
      connectionStatus: 'Connected',
      source: 'SAP',
      fetchedAt: new Date().toISOString(),
      // An item count is never used as an authoritative sales order total.
      complete: !next,
      message: next ? (orderId === null
        ? 'Showing loaded orders from a partial SAP dataset. Open an order to load its complete item list.'
        : 'This order’s item list is incomplete. Order completion is disabled. Please check the SAP endpoint.') : ''
    };
  }

  app.get('/api/orders/:orderId', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const data = await retrieveOrders(req.params.orderId);
      res.json({ order: data.orders[0] || { id: req.params.orderId, items: [] }, complete: data.complete, connectionStatus: data.connectionStatus, message: data.message });
    } catch (error) {
      res.status(error.status || 502).json({ connectionStatus: error.connectionStatus || 'Connection Error', error: error instanceof SapError ? error.message : 'Could not load the complete SAP item list. Please try again.' });
    }
  });

  async function getData(fresh) {
    if (pending) return pending;
    if (!fresh && cached && Date.now() - cached.time < 30000) return cached.data;
    pending = retrieveOrders().then(data => {
      cached = { time: Date.now(), data };
      return data;
    }).catch(error => {
      cached = null;
      if (error instanceof SapError) throw error;
      throw new SapError(error.name === 'TimeoutError' || error.name === 'AbortError'
        ? 'SAP took too long to respond. Please try again.'
        : 'Could not connect to SAP. Check the endpoint, network connection, and API configuration.');
    }).finally(() => { pending = null; });
    return pending;
  }

  for (const route of ['/api/orders', '/api/sap-kpi']) {
    app.get(route, async (req, res) => {
      res.set('Cache-Control', 'no-store');
      try {
        const data = await getData(req.query.refresh === '1');
        if (route === '/api/orders') return res.json(data);
        const { orders, ...kpi } = data;
        res.json(kpi);
      } catch (error) {
        res.status(error.status || 502).json({ connectionStatus: error.connectionStatus || 'Connection Error', error: error.message });
      }
    });
  }

  // Explicit public-file list prevents .env, source, and node_modules exposure.
  const publicFiles = ['index.html', 'order-details.html', 'issues.html', 'dashboard.html', 'style.css', 'workflow.js', 'app.js'];
  app.get('/', (req, res) => res.redirect('/index.html'));
  for (const file of publicFiles) app.get(`/${file}`, (req, res) => res.sendFile(path.join(__dirname, file)));
  app.use((req, res) => res.status(404).type('text').send('Page not found.'));
  return app;
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  createApp().listen(port, '127.0.0.1', () => console.log(`Woolworths Order Assistant: http://localhost:${port}`));
}
module.exports = { createApp, groupItems };
