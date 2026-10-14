import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { IssueRecord, IssueStatus, loadCompletedOrderIds, loadIssues, saveIssues } from '../utils/workflow';

interface OrderSummary {
  SalesOrderID: string;
  CustomerID?: string;
}

const statusColors: Record<IssueStatus, string> = {
  OPEN: 'danger',
  ASSIGNED: 'info text-dark',
  IN_PROGRESS: 'warning text-dark',
  RESOLVED: 'success',
};

const kpis = [
  { title: 'Perfect Online Order Fulfilment Rate', value: '20%', detail: 'Fewer failed orders within 12 months', role: 'Main KPI' },
  { title: 'Online Order Accuracy Rate', value: '↑', detail: 'Increase against baseline', role: 'Sub-KPI' },
  { title: 'On-Time Fulfilment Rate', value: '↑', detail: 'Increase against baseline', role: 'Sub-KPI' },
];

const SupervisorDashboard: React.FC = () => {
  const [issues, setIssues] = useState<IssueRecord[]>(loadIssues());
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [completedIds, setCompletedIds] = useState<string[]>(loadCompletedOrderIds());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    saveIssues(issues);
  }, [issues]);

  useEffect(() => {
    let active = true;
    const fetchOrders = async () => {
      try {
        const { data } = await axios.get<{ value: any[] }>('/api/salesorders');
        const normalized = (data?.value || []).map((order: any) => ({
          ...order,
          SalesOrderID: String(order.SalesOrderID ?? order.SalesOrder),
          CustomerID: order.CustomerID ?? order.SoldToParty,
        }));
        if (!active) return;
        setOrders(normalized);
        localStorage.setItem('woolworths_orders', JSON.stringify(normalized));
        setCompletedIds(loadCompletedOrderIds());
      } catch (err: any) {
        if (active) setError(err.response?.data?.error || err.message || 'Could not load orders');
      } finally {
        if (active) setLoading(false);
      }
    };
    void fetchOrders();
    return () => { active = false; };
  }, []);

  const counts = useMemo(() => ({
    OPEN: issues.filter((issue) => issue.status === 'OPEN').length,
    ASSIGNED: issues.filter((issue) => issue.status === 'ASSIGNED').length,
    IN_PROGRESS: issues.filter((issue) => issue.status === 'IN_PROGRESS').length,
    RESOLVED: issues.filter((issue) => issue.status === 'RESOLVED').length,
  }), [issues]);
  const completedOrders = orders.filter((order) => completedIds.includes(order.SalesOrderID)).length;
  const recentIssues = [...issues].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
  const totalIssues = issues.length;

  return (
    <div className="container mt-4">
      <nav aria-label="breadcrumb"><ol className="breadcrumb"><li className="breadcrumb-item"><Link to="/">Orders</Link></li><li className="breadcrumb-item active">Supervisor Dashboard</li></ol></nav>
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-4">
        <div><div className="text-primary fw-semibold">Step 4 of 4 · Supervisor</div><h2>Supervisor Dashboard</h2><p className="text-muted">Live summary of order completion and issue handling.</p></div>
        <Link className="btn btn-outline-primary" to="/issue-management">View product / shelf issues</Link>
      </div>
      {error && <div className="alert alert-warning">Order totals could not be refreshed: {error}</div>}

      <section className="mb-4" aria-labelledby="kpi-heading">
        <h3 id="kpi-heading" className="mb-3">Effectiveness KPIs</h3>
        <div className="row g-3">
          {kpis.map((kpi, index) => <div className="col-md-4" key={kpi.title}>
            <article className={`card h-100 shadow-sm ${index === 0 ? 'border-primary' : ''}`}>
              <div className="card-body">
                <div className="d-flex justify-content-between align-items-start gap-2">
                  <h5 className="mb-2">{kpi.title}</h5>
                  <span className={`badge ${index === 0 ? 'bg-primary' : 'bg-secondary'}`}>{kpi.role}</span>
                </div>
                <div className={`display-5 fw-semibold ${index === 0 ? 'text-primary' : 'text-success'}`}>{kpi.value}</div>
                <div className="text-muted">{kpi.detail}</div>
              </div>
            </article>
          </div>)}
        </div>
      </section>

      <div className="row g-3 mb-4">
        <div className="col-sm-6 col-xl-3"><div className="card h-100"><div className="card-body"><div className="text-muted">Total orders</div><div className="display-6">{loading ? '…' : orders.length}</div></div></div></div>
        <div className="col-sm-6 col-xl-3"><div className="card h-100 border-success"><div className="card-body"><div className="text-muted">Completed orders</div><div className="display-6 text-success">{loading ? '…' : completedOrders}</div></div></div></div>
        <div className="col-sm-6 col-xl-3"><div className="card h-100 border-danger"><div className="card-body"><div className="text-muted">Open issues</div><div className="display-6 text-danger">{counts.OPEN}</div></div></div></div>
        <div className="col-sm-6 col-xl-3"><div className="card h-100 border-info"><div className="card-body"><div className="text-muted">Assigned</div><div className="display-6">{counts.ASSIGNED}</div></div></div></div>
        <div className="col-sm-6 col-xl-3"><div className="card h-100 border-warning"><div className="card-body"><div className="text-muted">In progress</div><div className="display-6">{counts.IN_PROGRESS}</div></div></div></div>
      </div>

      <div className="row g-3 mb-4">
        {(['RESOLVED'] as IssueStatus[]).map((status) => <div className="col-sm-6" key={status}>
          <div className="card"><div className="card-body d-flex justify-content-between align-items-center"><span>Resolved issues</span><span className={`badge bg-${statusColors[status]} fs-6`}>{counts[status]}</span></div></div>
        </div>)}
      </div>

      <section className="card shadow-sm mb-4">
        <div className="card-header d-flex justify-content-between align-items-center"><h5 className="mb-0">Recent issues</h5><Link to="/issue-management">View all</Link></div>
        <div className="card-body p-0">
          {recentIssues.length === 0 ? <p className="text-muted p-3 mb-0">No issues have been reported.</p> : <div className="table-responsive"><table className="table table-hover align-middle mb-0">
            <thead><tr><th>Issue</th><th>Order / product</th><th>Status</th><th>Handling</th></tr></thead>
            <tbody>{recentIssues.map((issue) => <tr key={issue.issueId}>
              <td>{issue.issueType}<div className="small text-muted">{issue.issueId}</div></td>
              <td><Link to={`/order-details?orderId=${encodeURIComponent(issue.orderId)}`}>Order {issue.orderId}</Link><div className="small text-muted">{issue.product}</div></td>
              <td><span className={`badge bg-${statusColors[issue.status]}`}>{issue.status === 'OPEN' ? 'Reported' : issue.status.replace('_', ' ')}</span></td>
              <td>{issue.resolutionNotes || 'Not recorded'}</td>
            </tr>)}</tbody>
          </table></div>}
        </div>
      </section>

      <section className="card shadow-sm">
        <div className="card-header"><h5 className="mb-0">Issue status breakdown</h5></div>
        <div className="card-body">
          {totalIssues === 0 ? <p className="text-muted mb-0">Status breakdown will appear when issues are reported.</p> : (['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED'] as IssueStatus[]).map((status) => <div className="mb-3" key={status}>
            <div className="d-flex justify-content-between mb-1"><span>{status.replace('_', ' ')}</span><span>{counts[status]} / {totalIssues}</span></div>
            <div className="progress" role="progressbar" aria-valuenow={counts[status]} aria-valuemin={0} aria-valuemax={totalIssues}>
              <div className={`progress-bar bg-${statusColors[status]}`} style={{ width: `${(counts[status] / totalIssues) * 100}%` }} />
            </div>
          </div>)}
        </div>
      </section>
    </div>
  );
};

export default SupervisorDashboard;
