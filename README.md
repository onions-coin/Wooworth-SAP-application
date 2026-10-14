# Woolworths NZ – Online Order Fulfilment Exception Assistant

A university assignment prototype designed to help Woolworths NZ employees identify, report, manage, and resolve issues during online order picking.

## Tech Stack

- **React** with TypeScript
- **Vite** for dev server and build
- **Express** backend as SAP API proxy
- **CSS** (Bootstrap) for styling
- **localStorage** for prototype data persistence

## Prerequisites

- Node.js (v18+)
- npm or yarn

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure SAP API Key

Copy the `.env.example` file and set your SAP API key:

```bash
cp server/.env.example server/.env
```

Edit `server/.env` and set your SAP API key:

```
SAP_API_KEY=your_sap_api_key_here
```

**Important:** Never expose the API key in frontend code. The key is stored securely in the server `.env` file and used as the `x-api-key` header in SAP API requests.

### 3. Start the Development Server

Start both the frontend (Vite) and backend (Express) with a single command:

```bash
npm run dev
```

This will start:
- **Vite dev server** on `http://localhost:3000`
- **Express backend** on `http://localhost:4000`

The Vite dev server proxies `/api/*` requests to the Express backend.

### 4. Access the Application

Open your browser and navigate to `http://localhost:3000`

## SAP API Integration

The application uses the SAP Sandbox OData V4 API:

- **Base URL:** `https://sandbox.api.sap.com/s4hanacloud/sap/opu/odata4/sap/api_salesorder/srvd_a2x/sap/salesorder/0001`

### API Endpoints (proxied through Express backend)

- **GET `/api/salesorders`** - Retrieve sales orders from SAP Sandbox
  - Maps to: `GET /SalesOrder`
  
- **GET `/api/salesorders/:salesOrder/_Item`** - Retrieve items for a specific order
  - Maps to: `GET /SalesOrder({salesOrder})/_Item`

### API Key Header

The Express backend sends the SAP API key via the `x-api-key` header:
```
x-api-key: your_sap_api_key_here
```

## Application Features

### Page 1: Orders (OrdersPage)

- Display orders retrieved from SAP Sandbox
- Each order card shows: Sales Order ID, Customer ID, Order Date, Total Amount, Currency, Local Picking Status
- Search orders by ID or Customer ID
- View order details by clicking on an order card
- Refresh orders
- Loading and error states handled

### Page 2: Order Details (OrderDetailsPage)

- Fetch order items from SAP API when an order is selected
- Display: Product name, Product code, Requested quantity, Net amount, Currency, Picking status
- Mark an item as picked
- Report an issue for an item
- Complete the order (only when all items are picked and all issues resolved/verified)

### Page 3: Report Issue (ReportIssuePage)

- Simple issue reporting form
- Fields: Order ID (auto-filled), Product (auto-selected), Issue Type, Notes
- Issue types: Shelf Gap, Price Discrepancy, Wrong Product, Damaged Product, Other
- Generates unique issue ID, sets status to OPEN, saves to localStorage
- Links issue to selected order and item

### Page 4: Issue Management (IssueManagementPage)

- Display reported issues with full details
- Issue workflow: OPEN → IN_PROGRESS → RESOLVED → VERIFIED
- Assign issues to staff members
- Update issue status with valid transition prevention
- All changes saved in localStorage
- Delete issues if needed

### Page 5: Supervisor Dashboard (SupervisorDashboard)

- KPI cards calculated from actual application state:
  - Total Orders
  - Open Issues
  - In Progress Issues
  - Resolved Issues
  - Verified Issues
  - Completed Orders
- Recent issues table
- Issue status breakdown with progress bars
- All values dynamically calculated from localStorage

## Data Management

### localStorage Keys

The application uses the following localStorage keys for data persistence:

- `woolworths_orders` - SAP sales orders retrieved from API
- `woolworths_issues` - Reported issues with status, assignments, and notes

### Data Flow

1. Orders are fetched from SAP API and stored in localStorage
2. Order items and picking progress are managed in memory and localStorage
3. Reported issues are saved to localStorage with unique IDs
4. Issue status transitions (OPEN → IN_PROGRESS → RESOLVED → VERIFIED) are tracked
5. Supervisor dashboard KPI values are calculated from the actual localStorage state

### SAP Integration Note

- The SAP Sandbox is read-only for this prototype
- SAP API is used only to retrieve Sales Orders and Sales Order Items
- SAP orders are never modified; only local picking status is tracked
- If the SAP API cannot be reached, clear error messages are displayed

## Demonstration Workflow

The following complete workflow must work:

1. Open Orders page
2. Retrieve orders from SAP Sandbox
3. Select an order
4. Retrieve its items from SAP
5. Select a product
6. Report a Shelf Gap
7. Assign the issue
8. Mark it as In Progress
9. Resolve the issue
10. Verify the resolution
11. Mark the item as picked
12. Complete the order
13. Open Supervisor Dashboard
14. Confirm KPI values have updated

## Project Structure

```
wooworth-sap-application/
├── node_modules/         # Dependencies
├── src/
│   ├── App.tsx           # Main React component with routing
│   ├── main.tsx          # Entry point for Vite build
│   ├── pages/            # Page components
│   │   ├── OrdersPage.tsx      # Page 1: Orders
│   │   ├── OrderDetailsPage.tsx  # Page 2: Order Details
│   │   ├── ReportIssuePage.tsx # Page 3: Report Issue
│   │   ├── IssueManagementPage.tsx  # Page 4: Issue Management
│   │   └── SupervisorDashboard.tsx  # Page 5: Supervisor Dashboard
│   └── utils/            # Utility modules
├── server/
│   ├── index.js          # Express backend SAP API proxy
│   ├── .env              # SAP API key (create from .env.example)
│   └── .env.example      # Example environment variables
├── package.json          # Project configuration
├── tsconfig.json         # TypeScript configuration
├── vite.config.ts        # Vite configuration
└── README.md             # This file
```

## Available Scripts

- `npm run dev` - Start both frontend (Vite) and backend (Express) with concurrently
- `npm run server` - Start only the Express backend on port 4000
- `npm run client` - Start only the Vite dev server on port 3000
- `npm run build` - Build the frontend for production
- `npm run check` - Run TypeScript type checking
- `npm run preview` - Preview the production build locally

## Troubleshooting

- **SAP API 401 errors:** Ensure the `SAP_API_KEY` is set in `server/.env`
- **CORS issues:** The Express backend proxies API requests with proper headers
- **TypeScript errors:** Run `npm run check` to verify type correctness
- **Application not loading:** Ensure both servers are running via `npm run dev`