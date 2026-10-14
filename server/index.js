require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express = require('express');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// SAP API Configuration
const SAP_HOST = 'https://sandbox.api.sap.com/s4hanacloud';
const SAP_BASE_URL = `${SAP_HOST}/sap/opu/odata4/sap/api_salesorder/srvd_a2x/sap/salesorder/0001`;
const SAP_PRODUCT_BASE_URL = `${SAP_HOST}/sap/opu/odata4/sap/api_product/srvd_a2x/sap/product/0003`;
const SAP_API_KEY = process.env.SAP_API_KEY;

// Helper function to make SAP API requests
async function sapFetchFrom(baseUrl, endpoint) {
  if (!SAP_API_KEY) {
    throw new Error('SAP API key not configured. Please set SAP_API_KEY in server/.env');
  }

  const url = `${baseUrl}${endpoint}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'apikey': SAP_API_KEY,
      'Accept': 'application/json'
    }
  });

  const data = await response.text();

  if (!response.ok) {
    throw new Error(`SAP API error: ${response.status} - ${data}`);
  }

  try {
    return JSON.parse(data);
  } catch (e) {
    return data;
  }
}

async function sapFetch(endpoint) {
  return sapFetchFrom(SAP_BASE_URL, endpoint);
}

function escapeODataKey(value) {
  return String(value).replace(/'/g, "''");
}

// GET /api/products/:product - Read one product description from SAP Product Master
app.get('/api/products/:product', async (req, res) => {
  try {
    const product = escapeODataKey(req.params.product);
    const language = escapeODataKey(req.query.language || 'EN');
    const data = await sapFetchFrom(
      SAP_PRODUCT_BASE_URL,
      `/ProductDescription(Product='${product}',Language='${language}')`
    );
    res.json(data);
  } catch (error) {
    console.error(`Error fetching product ${req.params.product}:`, error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/salesorders/:salesOrder/_Partner - Read partners from the Sales Order OData V4 API
app.get('/api/salesorders/:salesOrder/_Partner', async (req, res) => {
  const salesOrder = escapeODataKey(req.params.salesOrder);
  try {
    const data = await sapFetch(`/SalesOrder('${salesOrder}')/_Partner`);
    res.json(data);
  } catch (error) {
    console.error(`Error fetching partners for sales order ${salesOrder}:`, error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/salesorders - Retrieve sales orders from SAP Sandbox
app.get('/api/salesorders', async (req, res) => {
  try {
    const data = await sapFetch('/SalesOrder');
    res.json(data);
  } catch (error) {
    console.error('Error fetching sales orders:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/salesorders/:salesOrder - Retrieve a specific sales order
app.get('/api/salesorders/:salesOrder', async (req, res) => {
  const { salesOrder } = req.params;
  try {
    const data = await sapFetch(`/SalesOrder('${salesOrder.replace(/'/g, "''")}')`);
    res.json(data);
  } catch (error) {
    console.error(`Error fetching sales order ${salesOrder}:`, error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/salesorders/:salesOrder/_Item - Retrieve items for a specific order
app.get('/api/salesorders/:salesOrder/_Item', async (req, res) => {
  const { salesOrder } = req.params;
  try {
    const data = await sapFetch(`/SalesOrder('${salesOrder.replace(/'/g, "''")}')/_Item`);
    res.json(data);
  } catch (error) {
    console.error(`Error fetching items for order ${salesOrder}:`, error);
    res.status(500).json({ error: error.message });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    sapApiKeyConfigured: !!SAP_API_KEY,
    baseUrl: SAP_BASE_URL
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});