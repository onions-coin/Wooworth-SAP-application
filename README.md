# Woolworths Order Assistant

A small INFOSYS 704 prototype for picking online orders and handling stock or product quality issues.

## Run

Requires Node.js 18.18 or newer.

```sh
npm install
npm start
```

Open http://localhost:3000. Add your SAP API key to `.env` to load real orders:

```dotenv
SAP_API_KEY=your_key
SAP_BASE_URL=https://sandbox.api.sap.com/s4hanacloud/sap/opu/odata4/sap/api_salesorder/srvd_a2x/sap/salesorder/0001
```

The app reads orders from SAP Sales Order OData V4. The API key stays on the server. The order list shows up to 20 orders.

## How it works

- **Picker:** opens an order, picks items, and reports stock or quality problems.
- **Supervisor:** records how the issue was handled.
- Picking the handled item closes its issue. An item can be unchecked if picked by mistake.
- Orders cannot be completed until every item has a final outcome.
- Dashboard shows order and issue summaries. “Online Orders Today” is a demo assumption of 20 orders.

Issues and completed-order records are stored in this browser only. This prototype does not change SAP inventory or contact customers.
