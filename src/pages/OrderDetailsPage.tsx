import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  IssueRecord,
  isPricingIssue,
  PickingProgress,
  PickingStatus,
  loadCompletedOrderIds,
  loadIssues,
  loadPickingProgress,
  loadOrderOutcomes,
  loadOrderPromises,
  markOrderComplete,
  saveOrderPromise,
  saveIssues,
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
  CustomerName: string;
  OrderDate: string;
  TotalAmount: number;
  Currency: string;
  Items: OrderItem[];
}

const OrderDetailsPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const routeState = (location.state || {}) as { orderId?: string; issueReported?: boolean; priceChecked?: boolean };
  const orderId =
    routeState.orderId ||
    new URLSearchParams(location.search).get('orderId') || '';
  const [order, setOrder] = useState<OrderDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pickingProgress, setPickingProgress] = useState<Record<string, PickingStatus>>({});
  const [issues, setIssues] = useState<IssueRecord[]>(loadIssues());
  const [completed, setCompleted] = useState(loadCompletedOrderIds().includes(orderId));
  const [promisedAt, setPromisedAt] = useState(() => loadOrderPromises()[orderId] || '');
  const existingOutcome = loadOrderOutcomes().find((outcome) => outcome.orderId === orderId);
  const [accuracyCheck, setAccuracyCheck] = useState<boolean | null>(existingOutcome?.accurate ?? null);
  const [perfectCheck, setPerfectCheck] = useState<boolean | null>(existingOutcome?.perfectFulfilment ?? null);

  const loadOrder = useCallback(async () => {
    if (!orderId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [itemsResponse, headerResponse, partnersResponse] = await Promise.all([
        axios.get<{ value: any[] }>(`/api/salesorders/${encodeURIComponent(orderId)}/_Item`),
        axios.get(`/api/salesorders/${encodeURIComponent(orderId)}`),
        axios.get<{ value: any[] }>(`/api/salesorders/${encodeURIComponent(orderId)}/_Partner`),
      ]);
      const rawItems: any[] = itemsResponse.data?.value || [];
      const header = headerResponse.data as any;

      // Master data enriches each order line; if one lookup fails, keep its order text and code.
      const enrichedItems = await Promise.all(rawItems.map(async (item) => {
        const productCode = String(item.ProductCode || item.ProductID || item.Product || '');
        if (!productCode) return item;
        try {
          const response = await axios.get<any>(`/api/products/${encodeURIComponent(productCode)}`, { params: { language: 'EN' } });
          return { ...item, ProductMasterDescription: response.data?.ProductDescription };
        } catch {
          return item;
        }
      }));
      const items: OrderItem[] = enrichedItems.map((item: any) => ({
        ProductName: item.ProductMasterDescription || item.ProductName || item.SalesOrderItemText || item.Product || 'Unknown Product',
        ProductCode: item.ProductCode || item.ProductID || item.Product || '',
        RequestedQuantity: item.RequestedQuantity ?? 1,
        NetAmount: item.NetAmount ?? 0,
        Currency: item.Currency || item.TransactionCurrency || 'NZD',
        SalesOrderItem: String(item.SalesOrderItem ?? item.ItemNumber ?? item.Product),
      }));
      const customerId = String(header.CustomerID || header.SoldToParty || '');
      const soldToPartner = (partnersResponse.data?.value || []).find((partner: any) =>
        partner.PartnerFunction === 'AG' ||
        String(partner.Customer || partner.ReferenceBusinessPartner || '') === customerId
      );
      const customerName = soldToPartner
        ? [soldToPartner.BusinessPartnerName1, soldToPartner.BusinessPartnerName2, soldToPartner.BusinessPartnerName3, soldToPartner.BusinessPartnerName4]
            .filter(Boolean).join(' ')
        : '';
      setOrder({
        SalesOrderID: orderId,
        CustomerID: customerId,
        CustomerName: customerName,
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

  const verifyIssue = (issueId: string) => {
    const next = issues.map((issue) => issue.issueId === issueId
      ? { ...issue, status: 'VERIFIED' as const, verifiedAt: new Date().toISOString() }
      : issue);
    setIssues(next);
    saveIssues(next);
  };

  const fulfilmentIssues = orderIssues.filter((issue) => !isPricingIssue(issue));
  const canComplete = Boolean(order && !completed && order.Items.length > 0 &&
    order.Items.every((item) => pickingProgress[item.SalesOrderItem] === 'Picked') &&
    fulfilmentIssues.every((issue) => issue.status === 'VERIFIED'));
  const waitingOnIssue = fulfilmentIssues.some((issue) => issue.status !== 'VERIFIED');

  const completeOrder = () => {
    if (accuracyCheck === null || perfectCheck === null) return;
    markOrderComplete(orderId, { promisedAt: promisedAt || undefined, accurate: accuracyCheck, perfectFulfilment: perfectCheck });
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
        <div>
          <div className="text-primary fw-semibold">{completed ? 'Complete' : canComplete ? 'Picker · Ready to complete' : waitingOnIssue ? 'Issue handling · Steps 2–3 of 4' : 'Picker · Step 1 of 4'}</div>
          <h2>Order {order.SalesOrderID}</h2>
          <p className="text-muted mb-0">{completed ? 'This order is complete.' : waitingOnIssue ? 'The Team must resolve the issue, then staff verify the fix before picking continues.' : canComplete ? 'All items are picked and fulfilment issues are verified. You can complete this order.' : 'Pick each item. Report any shelf issue from its row.'}</p>
        </div>
        <span className={`badge fs-6 ${completed ? 'bg-success' : 'bg-secondary'}`}>{completed ? 'Completed' : 'In progress'}</span>
      </div>
      {routeState.issueReported && <div className="alert alert-success">Issue reported. It has been added to the Supervisor assignment queue.</div>}
      {routeState.priceChecked && <div className="alert alert-success">Price check recorded. The online and shelf prices match.</div>}

      <section className="card shadow-sm mb-4">
        <div className="card-body row g-3">
          <div className="col-md-3"><strong>Customer</strong><div>{order.CustomerName || order.CustomerID || 'N/A'}</div>{order.CustomerName && <small className="text-muted">{order.CustomerID}</small>}</div>
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
            const itemIssue = orderIssues.find((issue) => issue.orderItemId === item.SalesOrderItem && !isPricingIssue(issue) && issue.status !== 'VERIFIED');
            const displayStatus = itemIssue ? `Issue ${itemIssue.status.replace('_', ' ')}` : status === 'Issue Reported' ? 'Ready to pick' : status;
            return <tr key={item.SalesOrderItem}>
              <td>{item.ProductName}</td><td>{item.ProductCode}</td><td>{item.RequestedQuantity}</td><td>{item.NetAmount} {item.Currency}</td>
              <td><span className={`badge ${itemIssue ? 'bg-warning text-dark' : status === 'Picked' ? 'bg-success' : 'bg-secondary'}`}>{displayStatus}</span></td>
              <td><div className="d-flex flex-wrap gap-2">
                {!completed && !itemIssue && status !== 'Picked' && <button className="btn btn-sm btn-success" onClick={() => updatePicking(item.SalesOrderItem, 'Picked')}>Mark picked</button>}
                {!completed && <button className="btn btn-sm btn-outline-danger" onClick={() => navigate('/report-issue', { state: { orderId, orderItemId: item.SalesOrderItem, product: `${item.ProductName} (${item.ProductCode})`, onlinePrice: item.RequestedQuantity ? item.NetAmount / item.RequestedQuantity : item.NetAmount } })}>Report issue</button>}
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
          <div><strong>{issue.product}</strong><div className="text-muted">{issue.issueType}</div>{issue.resolutionNotes && <div><strong>Handling result:</strong> {issue.resolutionNotes}</div>}</div>
          <div className="d-flex flex-column align-items-end gap-2"><span className={`badge ${issue.status === 'VERIFIED' ? 'bg-primary' : issue.status === 'RESOLVED' ? 'bg-success' : 'bg-warning text-dark'}`}>{issue.status.replace('_', ' ')}</span>{issue.onlinePrice != null && <small className="text-muted">Online ${issue.onlinePrice.toFixed(2)} · Shelf ${issue.shelfPrice?.toFixed(2) ?? '—'}</small>}{issue.status === 'RESOLVED' && (!completed || isPricingIssue(issue)) && <button className="btn btn-sm btn-primary" onClick={() => verifyIssue(issue.issueId)}>Verify fix</button>}</div>
        </li>)}</ul>
      </section>}

      {!completed && <div className="card border-primary mb-4"><div className="card-body">
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-3">
          <div><h5 className="mb-1">Complete this order</h5><p className="mb-0 text-muted">All items must be picked and fulfilment issues verified. Price issues remain separate.</p></div>
          <button className="btn btn-primary" disabled={!canComplete || accuracyCheck === null || perfectCheck === null} onClick={completeOrder}>Complete order</button>
        </div>
        {canComplete && <div className="row g-3 border-top pt-3">
          <div className="col-md-4"><label className="form-label" htmlFor="promised-at">Promised fulfilment time <span className="text-muted">(for on-time KPI)</span></label><input id="promised-at" className="form-control" type="datetime-local" value={promisedAt} onChange={(event) => { setPromisedAt(event.target.value); saveOrderPromise(orderId, event.target.value); }} /></div>
          <div className="col-md-4"><label className="form-label">Were the product and quantities accurate?</label><div className="btn-group w-100" role="group"><button type="button" className={`btn ${accuracyCheck === true ? 'btn-success' : 'btn-outline-success'}`} onClick={() => setAccuracyCheck(true)}>Yes</button><button type="button" className={`btn ${accuracyCheck === false ? 'btn-danger' : 'btn-outline-danger'}`} onClick={() => setAccuracyCheck(false)}>No</button></div></div>
          <div className="col-md-4"><label className="form-label">Did it meet the A2 perfect fulfilment standard?</label><div className="btn-group w-100" role="group"><button type="button" className={`btn ${perfectCheck === true ? 'btn-success' : 'btn-outline-success'}`} onClick={() => setPerfectCheck(true)}>Yes</button><button type="button" className={`btn ${perfectCheck === false ? 'btn-danger' : 'btn-outline-danger'}`} onClick={() => setPerfectCheck(false)}>No</button></div></div>
        </div>}
      </div></div>}
    </div>
  );
};

export default OrderDetailsPage;
