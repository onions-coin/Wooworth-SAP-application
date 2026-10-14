import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import OrdersPage from './pages/OrdersPage';
import OrderDetailsPage from './pages/OrderDetailsPage';
import ReportIssuePage from './pages/ReportIssuePage';
import IssueManagementPage from './pages/IssueManagementPage';
import SupervisorDashboard from './pages/SupervisorDashboard';

const App: React.FC = () => {
  return (
    <Router>
      <nav className="navbar navbar-expand-lg navbar-dark bg-dark">
        <div className="container-fluid">
          <Link className="navbar-brand" to="/">
            Woolworths NZ - Order Fulfilment Assistant
          </Link>
          <button className="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbar-nav">
            <span className="navbar-toggler-icon"></span>
          </button>
          <div className="collapse navbar-collapse" id="navbar-nav">
            <ul className="navbar-nav me-auto">
              <li className="nav-item">
                <Link className="nav-link" to="/">1 · Picker: Orders</Link>
              </li>
              <li className="nav-item">
                <Link className="nav-link" to="/issue-management">2 · Supervisor: Issues</Link>
              </li>
              <li className="nav-item">
                <Link className="nav-link" to="/supervisor-dashboard">3 · Supervisor: Dashboard</Link>
              </li>
            </ul>
          </div>
        </div>
      </nav>

      <div className="container-fluid mt-4">
        <Routes>
          <Route path="/" element={<OrdersPage />} />
          <Route path="/order-details" element={<OrderDetailsPage />} />
          <Route path="/report-issue" element={<ReportIssuePage />} />
          <Route path="/issue-management" element={<IssueManagementPage />} />
          <Route path="/supervisor-dashboard" element={<SupervisorDashboard />} />
        </Routes>
      </div>
    </Router>
  );
};

export default App;