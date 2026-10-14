import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  IssueRecord,
  PickingProgress,
  PickingStatus,
  loadCompletedOrderIds,
  loadIssues,
  loadPickingProgress,
  markOrderComplete,
  savePickingProgress,
} from '../utils/workflow';

interface OrderItem {
  ProductName: string;
  ProductCode: string;
  RequestedQuantity: number;
  NetAmount: number;
  Currency: string;
  SalesOrderItem: string;
}

interface OrderDetails {
  SalesOrderID: string;
  CustomerID: string;
  OrderDate: string;
  TotalAmount: number;
  Currency: string;
  Items: OrderItem[];
}

const OrderDetailsPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const orderId =
    (location.state as { orderId?: string } | null)?.orderId ||
    new URLSearchParams(location.search).get('orderId') || '';
  const [order, setOrder] = useState<OrderDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pickingProgress, setPickingProgress] = useState<Record<string, PickingStatus>>({});
  const [issues, setIssues] = useState<IssueRecord[]>(loadIssues());
  const [completed, setCompleted] = useState(loadCompletedOrderIds().includes(orderId));

  const loadOrder = useCallback(async () => {
    if (!orderId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [itemsResponse, headerResponse] = await Promise.all([
        axios.get<{ value: any[] }>(`/api/salesorders/${encodeURIComponent(orderId)}/_Item`),
        axios.get(`/api/salesorders/${encodeURIComponent(orderId)}`),
      ]);
      const items: OrderItem[] = (itemsResponse.data?.value || []).map((item: any) => ({
        ProductName: item.ProductName || item.SalesOrderItemText || item.Product || 'Unknown Product',
        ProductCode: item.ProductCode || item.ProductID || item.Product || '',
        RequestedQuantity: item.RequestedQuantity ?? 1,
        NetAmount: item.NetAmount ?? 0,
        Currency: item.Currency || item.TransactionCurrency || 'NZD',
        SalesOrderItem: String(item.SalesOrderItem ?? item.ItemNumber ?? item.Product),
      }));
      const header = headerResponse.data as any;
      setOrder({
        SalesOrderID: orderId,
        CustomerID: header.CustomerID || header.SoldToParty || '',
        OrderDate: header.OrderDate || header.SalesOrderDate || '',
        TotalAmount: header.TotalAmount ?? header.TotalNetAmount ?? 0,
        Currency: header.Currency || header.TransactionCurrency || 'NZD',
        Items: items,
      });

      const storedProgress = loadPickingProgress();
      const prior = storedProgress[orderId] || {};
      const nextProgress: Record<string, PickingStatus> = {};
      items.forEach((item) => {
        nextProgress[item.SalesOrderItem] = prior[item.SalesOrderItem] || 'Not Started';
      });
      setPickingProgress(nextProgress);
      setIssues(loadIssues());
      setCompleted(loadCompletedOrderIds().includes(orderId));
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || `Failed to load order ${orderId}`);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => { void loadOrder(); }, [loadOrder]);

  const orderIssues = useMemo(() => issues.filter((issue) => issue.orderId === orderId), [issues, orderId]);
  const updatePicking = (itemId: string, status: PickingStatus) => {
    const next = { ...pickingProgress, [itemId]: status };
    setPickingProgress(next);
    const allProgress: PickingProgress = loadPickingProgress();
    allProgress[orderId] = next;
    savePickingProgress(allProgress);
  };

  const canComplete = Boolean(order && !completed && order.Items.length > 0 &&
    order.Items.every((item) => pickingProgress[item.SalesOrderItem] === 'Picked') &&
    orderIssues.every((issue) => issue.status === 'VERIFIED'));

  const completeOrder = () => {
    markOrderComplete(orderId);
    setCompleted(true);
    navigate('/');
  };

  if (loading) return <div className="container mt-4"><div className="alert alert-info">Loading order and items…</div></div>;
  if (!orderId) return <div className="container mt-4"><div className="alert alert-warning">Select an order from the order list first. <Link to="/">Return to orders</Link></div></div>;
  if (error) return <div className="container mt-4"><div className="alert alert-danger">{error}</div><Link to="/">Return to orders</Link></div>;
  if (!order) return null;

  return (
    <div className="container mt-4">
      <nav aria-label="breadcrumb"><ol className="breadcrumb"><li className="breadcrumb-item"><Link to="/">Orders</Link></li><li className="breadcrumb-item active">Order {order.SalesOrderID}</li></ol></nav>
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-4">
        <div><h2>Order {order.SalesOrderID}</h2><p className="text-muted mb-0">Pick each item. If there is a problem, report it here and resolve it before completing the order.</p></div>
        <span className={`badge fs-6 ${completed ? 'bg-success' : 'bg-secondary'}`}>{completed ? 'Completed' : 'In progress'}</span>
      </div>

      <section className="card shadow-sm mb-4">
        <div className="card-body row g-3">
          <div className="col-md-3"><strong>Customer</strong><div>{order.CustomerID || 'N/A'}</div></div>
          <div className="col-md-3"><strong>Order date</strong><div>{order.OrderDate || 'N/A'}</div></div>
          <div className="col-md-3"><strong>Total</strong><div>{order.TotalAmount} {order.Currency}</div></div>
          <div className="col-md-3"><strong>Items picked</strong><div>{order.Items.filter((item) => pickingProgress[item.SalesOrderItem] === 'Picked').length} / {order.Items.length}</div></div>
        </div>
      </section>

      <section className="card shadow-sm mb-4">
        <div className="card-header"><h5 className="mb-0">Pick items</h5></div>
        <div className="table-responsive"><table className="table table-hover align-middle mb-0">
          <thead><tr><th>Product</th><th>Code</th><th>Qty</th><th>Amount</th><th>Status</th><th>Next step</th></tr></thead>
          <tbody>{order.Items.map((item) => {
            const status = pickingProgress[item.SalesOrderItem] || 'Not Started';
            const itemIssue = orderIssues.find((issue) => issue.orderItemId === item.SalesOrderItem && issue.status !== 'VERIFIED');
            const displayStatus = itemIssue ? `Issue ${itemIssue.status.replace('_', ' ')}` : status === 'Issue Reported' ? 'Ready to pick' : status;
            return <tr key={item.SalesOrderItem}>
              <td>{item.ProductName}</td><td>{item.ProductCode}</td><td>{item.RequestedQuantity}</td><td>{item.NetAmount} {item.Currency}</td>
              <td><span className={`badge ${itemIssue ? 'bg-warning text-dark' : status === 'Picked' ? 'bg-success' : 'bg-secondary'}`}>{displayStatus}</span></td>
              <td><div className="d-flex flex-wrap gap-2">
                {!completed && !itemIssue && status !== 'Picked' && <button className="btn btn-sm btn-success" onClick={() => updatePicking(item.SalesOrderItem, 'Picked')}>Mark picked</button>}
                {!completed && <button className="btn btn-sm btn-outline-danger" onClick={() => navigate('/report-issue', { state: { orderId, orderItemId: item.SalesOrderItem, product: `${item.ProductName} (${item.ProductCode})` } })}>Report issue</button>}
                {itemIssue && <Link className="btn btn-sm btn-outline-primary" to="/issue-management">View issue</Link>}
                {completed && <span className="text-success">Order completed</span>}
              </div></td>
            </tr>;
          })}</tbody>
        </table></div>
      </section>

      {orderIssues.length > 0 && <section className="card shadow-sm mb-4">
        <div className="card-header"><h5 className="mb-0">Issues for this order</h5></div>
        <ul className="list-group list-group-flush">{orderIssues.map((issue) => <li className="list-group-item d-flex flex-wrap justify-content-between gap-2" key={issue.issueId}>
          <div><strong>{issue.product}</strong><div className="text-muted">{issue.issueType} · {issue.severity} · {issue.notes}</div>{issue.resolutionNotes && <div><strong>Handling:</strong> {issue.resolutionNotes}</div>}</div>
          <span className={`badge align-self-start ${issue.status === 'VERIFIED' ? 'bg-success' : 'bg-warning text-dark'}`}>{issue.status.replace('_', ' ')}</span>
        </li>)}</ul>
      </section>}

      {!completed && <div className="card border-primary mb-4"><div className="card-body d-flex flex-wrap justify-content-between align-items-center gap-3">
        <div><h5 className="mb-1">Complete this order</h5><p className="mb-0 text-muted">All items must be picked and every reported issue verified.</p></div>
        <button className="btn btn-primary" disabled={!canComplete} onClick={completeOrder}>Complete order</button>
      </div></div>}
    </div>
  );
};

export default OrderDetailsPage;
