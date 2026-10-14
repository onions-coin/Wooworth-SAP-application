import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import OrdersPage from './pages/OrdersPage';
import OrderDetailsPage from './pages/OrderDetailsPage';
import ReportIssuePage from './pages/ReportIssuePage';
import IssueManagementPage from './pages/IssueManagementPage';
import TeamWorkPage from './pages/TeamWorkPage';
import SupervisorDashboard from './pages/SupervisorDashboard';

type Role = 'staff' | 'supervisor';

const AppContent: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [role, setRole] = useState<Role>(() => localStorage.getItem('woolworths_user_role') === 'supervisor' ? 'supervisor' : 'staff');

  const changeRole = (nextRole: Role) => {
    setRole(nextRole);
    localStorage.setItem('woolworths_user_role', nextRole);
    navigate(nextRole === 'staff' ? '/' : '/issue-management');
  };

  return (
    <>
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
              {role === 'staff' ? <>
                <li className="nav-item"><Link className={`nav-link ${location.pathname === '/' || location.pathname === '/order-details' ? 'active' : ''}`} to="/">Orders</Link></li>
                <li className="nav-item"><Link className={`nav-link ${location.pathname === '/team-work' ? 'active' : ''}`} to="/team-work">Team issue work</Link></li>
              </> : <>
                <li className="nav-item"><Link className={`nav-link ${location.pathname === '/issue-management' ? 'active' : ''}`} to="/issue-management">Issue assignment</Link></li>
                <li className="nav-item"><Link className={`nav-link ${location.pathname === '/supervisor-dashboard' ? 'active' : ''}`} to="/supervisor-dashboard">Dashboard</Link></li>
              </>}
            </ul>
            <div className="d-flex align-items-center gap-2 mt-2 mt-lg-0">
              <label className="text-white-50 small mb-0" htmlFor="role-select">View as</label>
              <select id="role-select" className="form-select form-select-sm" value={role} onChange={(event) => changeRole(event.target.value as Role)} aria-label="Choose staff or supervisor view">
                <option value="staff">Staff</option>
                <option value="supervisor">Supervisor</option>
              </select>
            </div>
          </div>
        </div>
      </nav>

      <div className="container-fluid mt-4">
        <Routes>
          <Route path="/" element={<OrdersPage />} />
          <Route path="/order-details" element={<OrderDetailsPage />} />
          <Route path="/report-issue" element={<ReportIssuePage />} />
          <Route path="/issue-management" element={<IssueManagementPage />} />
          <Route path="/team-work" element={<TeamWorkPage />} />
          <Route path="/supervisor-dashboard" element={<SupervisorDashboard />} />
        </Routes>
      </div>
    </>
  );
};

const App: React.FC = () => <Router><AppContent /></Router>;

export default App;
