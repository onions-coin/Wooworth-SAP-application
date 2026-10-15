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
  VERIFIED: 'primary',
};

const kpis = [
  { title: 'Perfect Online Order Fulfilment Rate', baseline: 85, current: 88, delta: '+3 pp', note: 'Failed orders −20%', role: 'Main KPI' },
  { title: 'Online Order Accuracy Rate', baseline: 91, current: 96, delta: '+5 pp', role: 'Sub-KPI' },
  { title: 'On-Time Fulfilment Rate', baseline: 87, current: 94, delta: '+7 pp', role: 'Sub-KPI' },
  { title: 'Priority Gap Recovery Rate', baseline: 62, current: 90, delta: '+28 pp', role: 'Process KPI' },
  { title: 'In-store Pricing Integrity Rate', baseline: 92, current: 98, delta: '+6 pp', role: 'Store KPI' },
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
    VERIFIED: issues.filter((issue) => issue.status === 'VERIFIED').length,
  }), [issues]);
  const completedOrders = orders.filter((order) => completedIds.includes(order.SalesOrderID)).length;
  const recentIssues = [...issues].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
  const totalIssues = issues.length;

  return (
    <div className="container mt-4">
      <nav aria-label="breadcrumb"><ol className="breadcrumb"><li className="breadcrumb-item"><Link to="/">Orders</Link></li><li className="breadcrumb-item active">Supervisor Dashboard</li></ol></nav>
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-4">
        <div><div className="text-primary fw-semibold">Step 4 of 4 · Supervisor</div><h2>Supervisor Dashboard</h2><p className="text-muted">Live summary of order completion and issue handling.</p></div>
        <Link className="btn btn-outline-primary" to="/issue-management">View store issues</Link>
      </div>
      {error && <div className="alert alert-warning">Order totals could not be refreshed: {error}</div>}

      <section className="mb-4" aria-labelledby="kpi-heading">
        <div className="d-flex flex-wrap justify-content-between align-items-end mb-3">
          <h3 id="kpi-heading" className="mb-0">Effectiveness KPIs</h3>
          <span className="small text-muted">Last Week → This Week</span>
        </div>
        <div className="row g-3 mb-3">
          <div className="col-12">
            <article className="card shadow-sm border-primary border-2">
              <div className="card-body p-3 p-lg-4">
                <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-3">
                  <div><span className="badge bg-primary mb-2">Main KPI</span><h4 className="mb-0">{kpis[0].title}</h4></div>
                  <div className="text-end"><div className="small text-muted">Weekly Change</div><div className="fs-4 fw-bold text-success">↑ {kpis[0].delta}</div></div>
                </div>
                <div className="row align-items-end g-4">
                  <div className="col-sm-4"><div className="small text-muted text-uppercase">This Week</div><div className="display-3 fw-semibold text-primary lh-1">{kpis[0].current}%</div></div>
                  <div className="col-sm-4"><div className="small text-muted text-uppercase">Last Week</div><div className="display-6 fw-medium text-secondary">{kpis[0].baseline}%</div></div>
                  <div className="col-sm-4"><div className="rounded-3 bg-light px-3 py-2"><div className="small text-muted">Failed Order Rate</div><div className="fs-4 fw-semibold text-success">{100 - kpis[0].baseline}% <span className="text-muted fw-normal">→</span> {100 - kpis[0].current}%</div><div className="small text-success">{kpis[0].note}</div></div></div>
                </div>
              </div>
            </article>
          </div>
        </div>
        <div className="row row-cols-1 row-cols-md-2 g-3">
          {kpis.slice(1).map((kpi) => {
            const change = Number.parseFloat(kpi.delta);
            const improved = change >= 0;
            return <div className="col" key={kpi.title}>
              <article className="card h-100 shadow-sm">
                <div className="card-body p-3">
                  <h5 className="mb-3">{kpi.title}</h5>
                  <div className="d-flex flex-wrap justify-content-between align-items-end gap-3">
                    <div><div className="small text-muted text-uppercase">This Week</div><div className="display-5 fw-semibold">{kpi.current}%</div></div>
                    <div className={`fs-5 fw-bold ${improved ? 'text-success' : 'text-danger'}`}>{improved ? '↑' : '↓'} {kpi.delta}</div>
                  </div>
                  <div className="mt-3 pt-3 border-top small text-muted">Last Week <strong className="text-body ms-1">{kpi.baseline}%</strong></div>
                </div>
              </article>
            </div>;
          })}
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
        {(['RESOLVED', 'VERIFIED'] as IssueStatus[]).map((status) => <div className="col-sm-6" key={status}>
          <div className="card"><div className="card-body d-flex justify-content-between align-items-center"><span>{status === 'RESOLVED' ? 'Awaiting staff verification' : 'Verified issues'}</span><span className={`badge bg-${statusColors[status]} fs-6`}>{counts[status]}</span></div></div>
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
          {totalIssues === 0 ? <p className="text-muted mb-0">Status breakdown will appear when issues are reported.</p> : (['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'VERIFIED'] as IssueStatus[]).map((status) => <div className="mb-3" key={status}>
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
