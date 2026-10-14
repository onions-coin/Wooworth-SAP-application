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
  IN_PROGRESS: 'warning text-dark',
  RESOLVED: 'success',
  VERIFIED: 'primary',
};

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
        <div><h2>Supervisor Dashboard</h2><p className="text-muted">Live summary of order completion and issue handling.</p></div>
        <Link className="btn btn-outline-primary" to="/issue-management">Open issue management</Link>
      </div>
      {error && <div className="alert alert-warning">Order totals could not be refreshed: {error}</div>}

      <div className="row g-3 mb-4">
        <div className="col-sm-6 col-xl-3"><div className="card h-100"><div className="card-body"><div className="text-muted">Total orders</div><div className="display-6">{loading ? '…' : orders.length}</div></div></div></div>
        <div className="col-sm-6 col-xl-3"><div className="card h-100 border-success"><div className="card-body"><div className="text-muted">Completed orders</div><div className="display-6 text-success">{loading ? '…' : completedOrders}</div></div></div></div>
        <div className="col-sm-6 col-xl-3"><div className="card h-100 border-danger"><div className="card-body"><div className="text-muted">Open issues</div><div className="display-6 text-danger">{counts.OPEN}</div></div></div></div>
        <div className="col-sm-6 col-xl-3"><div className="card h-100 border-warning"><div className="card-body"><div className="text-muted">In progress</div><div className="display-6">{counts.IN_PROGRESS}</div></div></div></div>
      </div>

      <div className="row g-3 mb-4">
        {(['RESOLVED', 'VERIFIED'] as IssueStatus[]).map((status) => <div className="col-sm-6" key={status}>
          <div className="card"><div className="card-body d-flex justify-content-between align-items-center"><span>{status === 'RESOLVED' ? 'Resolved issues' : 'Verified issues'}</span><span className={`badge bg-${statusColors[status]} fs-6`}>{counts[status]}</span></div></div>
        </div>)}
      </div>

      <section className="card shadow-sm mb-4">
        <div className="card-header d-flex justify-content-between align-items-center"><h5 className="mb-0">Recent issues</h5><Link to="/issue-management">View all</Link></div>
        <div className="card-body p-0">
          {recentIssues.length === 0 ? <p className="text-muted p-3 mb-0">No issues have been reported.</p> : <div className="table-responsive"><table className="table table-hover align-middle mb-0">
            <thead><tr><th>Issue</th><th>Order / product</th><th>Priority</th><th>Status</th><th>Handling</th></tr></thead>
            <tbody>{recentIssues.map((issue) => <tr key={issue.issueId}>
              <td>{issue.issueType}<div className="small text-muted">{issue.issueId}</div></td>
              <td><Link to={`/order-details?orderId=${encodeURIComponent(issue.orderId)}`}>Order {issue.orderId}</Link><div className="small text-muted">{issue.product}</div></td>
              <td>{issue.severity}</td>
              <td><span className={`badge bg-${statusColors[issue.status]}`}>{issue.status.replace('_', ' ')}</span></td>
              <td>{issue.resolutionNotes || issue.suggestedHandling || 'Not recorded'}</td>
            </tr>)}</tbody>
          </table></div>}
        </div>
      </section>

      <section className="card shadow-sm">
        <div className="card-header"><h5 className="mb-0">Issue status breakdown</h5></div>
        <div className="card-body">
          {totalIssues === 0 ? <p className="text-muted mb-0">Status breakdown will appear when issues are reported.</p> : (['OPEN', 'IN_PROGRESS', 'RESOLVED', 'VERIFIED'] as IssueStatus[]).map((status) => <div className="mb-3" key={status}>
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
