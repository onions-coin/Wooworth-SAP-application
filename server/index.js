require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express = require('express');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// SAP API Configuration
const SAP_BASE_URL = 'https://sandbox.api.sap.com/s4hanacloud/sap/opu/odata4/sap/api_salesorder/srvd_a2x/sap/salesorder/0001';
const SAP_API_KEY = process.env.SAP_API_KEY;

// Helper function to make SAP API requests
async function sapFetch(endpoint) {
  if (!SAP_API_KEY) {
    throw new Error('SAP API key not configured. Please set SAP_API_KEY in server/.env');
  }

  const url = `${SAP_BASE_URL}${endpoint}`;
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