import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  IssueRecord,
  blocksOrderCompletion,
  canCompleteOrder,
  canPickItem,
  completeOrderIfEligible,
  fulfilmentOutcomeLabel,
  isPricingIssue,
  PickingProgress,
  PickingStatus,
  loadCompletedOrderIds,
  loadIssues,
  loadPickingProgress,
  loadOrderOutcomes,
  loadOrderPromises,
  loadOrderFulfilmentOutcomes,
  returnIssueToTeam,
  saveOrderPromise,
  saveIssues,
  savePickingProgress,
  verifyResolvedIssue,
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
  const [fulfilmentOutcome, setFulfilmentOutcome] = useState(loadOrderFulfilmentOutcomes()[orderId]);
  const [returnReasons, setReturnReasons] = useState<Record<string, string>>({});
  const [returningIssueId, setReturningIssueId] = useState<string | null>(null);
  const [completionError, setCompletionError] = useState('');
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
      setFulfilmentOutcome(loadOrderFulfilmentOutcomes()[orderId]);
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
    const verified = verifyResolvedIssue(issues, { [orderId]: pickingProgress }, issueId);
    if (!verified) return;
    setIssues(verified.issues);
    saveIssues(verified.issues);
    const nextProgress = verified.progress[orderId] || pickingProgress;
    setPickingProgress(nextProgress);
    const allProgress = loadPickingProgress();
    allProgress[orderId] = nextProgress;
    savePickingProgress(allProgress);
  };

  const fulfilmentIssues = orderIssues.filter(blocksOrderCompletion);
  const itemIds = order?.Items.map((item) => item.SalesOrderItem) || [];
  const canComplete = Boolean(order && !completed && canCompleteOrder(orderId, itemIds, pickingProgress, issues, loadCompletedOrderIds()));
  const waitingOnIssue = fulfilmentIssues.some((issue) => issue.status !== 'VERIFIED');

  const sendBackToTeam = (issue: IssueRecord) => {
    const updated = returnIssueToTeam(issue, returnReasons[issue.issueId] || '');
    if (!updated) return;
    const next = issues.map((item) => item.issueId === issue.issueId ? updated : item);
    setIssues(next);
    saveIssues(next);
    setReturningIssueId(null);
    setReturnReasons((current) => ({ ...current, [issue.issueId]: '' }));
  };

  const completeOrder = () => {
    if (accuracyCheck === null || perfectCheck === null) return;
    const didComplete = completeOrderIfEligible(orderId, itemIds, { promisedAt: promisedAt || undefined, accurate: accuracyCheck, perfectFulfilment: perfectCheck });
    if (!didComplete) {
      setCompletionError('The order changed while you were completing it. Review item and issue statuses before trying again.');
      setIssues(loadIssues());
      setPickingProgress(loadPickingProgress()[orderId] || {});
      return;
    }
    setFulfilmentOutcome(loadOrderFulfilmentOutcomes()[orderId]);
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
          <div className="text-primary fw-semibold">{completed ? fulfilmentOutcomeLabel(fulfilmentOutcome) : canComplete ? 'Picker · Ready to complete' : waitingOnIssue ? 'Issue handling · Steps 2–3 of 4' : 'Picker · Step 1 of 4'}</div>
          <h2>Order {order.SalesOrderID}</h2>
          <p className="text-muted mb-0">{completed ? fulfilmentOutcomeLabel(fulfilmentOutcome) : waitingOnIssue ? 'The Team must resolve the issue, then staff verify the fix before picking continues.' : canComplete ? 'Every item is picked or verified as unavailable, and blocking issues are verified. You can close this order.' : 'Pick each item. Report any shelf issue from its row.'}</p>
        </div>
        <span className={`badge fs-6 ${completed ? (fulfilmentOutcome === 'UNFULFILLED' ? 'bg-secondary' : 'bg-success') : 'bg-secondary'}`}>{completed ? fulfilmentOutcomeLabel(fulfilmentOutcome) : 'In progress'}</span>
      </div>
      {routeState.issueReported && <div className="alert alert-success">Issue reported. It has been added to the Supervisor assignment queue.</div>}
      {routeState.priceChecked && <div className="alert alert-success">Price check recorded. The online and shelf prices match.</div>}

      <section className="card shadow-sm mb-4">
        <div className="card-body row g-3">
          <div className="col-md-3"><strong>Customer</strong><div>{order.CustomerName || order.CustomerID || 'N/A'}</div>{order.CustomerName && <small className="text-muted">{order.CustomerID}</small>}</div>
          <div className="col-md-3"><strong>Order date</strong><div>{order.OrderDate || 'N/A'}</div></div>
          <div className="col-md-3"><strong>Total</strong><div>{order.TotalAmount} {order.Currency}</div></div>
          <div className="col-md-3"><strong>Items picked</strong><div>{order.Items.filter((item) => pickingProgress[item.SalesOrderItem] === 'Picked').length} / {order.Items.length}</div><small className="text-muted">Unavailable items are not counted as picked</small></div>
        </div>
      </section>

      <section className="card shadow-sm mb-4">
        <div className="card-header"><h5 className="mb-0">Pick items</h5></div>
        <div className="table-responsive"><table className="table table-hover align-middle mb-0">
          <thead><tr><th>Product</th><th>Code</th><th>Qty requested</th><th>Qty supplied</th><th>Amount</th><th>Status</th><th>Next step</th></tr></thead>
          <tbody>{order.Items.map((item) => {
            const status = pickingProgress[item.SalesOrderItem] || 'Not Started';
            const itemIssues = orderIssues.filter((issue) => issue.orderItemId === item.SalesOrderItem && !isPricingIssue(issue));
            const itemIssue = itemIssues.find((issue) => issue.status !== 'VERIFIED');
            const unavailable = status === 'Unavailable — not supplied';
            const displayStatus = itemIssue ? `Issue ${itemIssue.status.replace('_', ' ')}` : unavailable ? 'Unavailable — not supplied' : status === 'Issue Reported' ? 'Ready to pick' : status;
            const canPick = canPickItem(orderId, item.SalesOrderItem, pickingProgress, orderIssues);
            return <tr key={item.SalesOrderItem}>
              <td>{item.ProductName}</td><td>{item.ProductCode}</td><td>{item.RequestedQuantity}</td><td>{status === 'Picked' ? item.RequestedQuantity : unavailable ? 0 : '—'}</td><td>{item.NetAmount} {item.Currency}</td>
              <td><span className={`badge ${itemIssue ? 'bg-warning text-dark' : status === 'Picked' ? 'bg-success' : unavailable ? 'bg-secondary' : 'bg-secondary'}`}>{displayStatus}</span>{unavailable && <div className="small text-muted">Not supplied</div>}</td>
              <td><div className="d-flex flex-wrap gap-2">
                {!completed && canPick && <button className="btn btn-sm btn-success" onClick={() => updatePicking(item.SalesOrderItem, 'Picked')}>Mark picked</button>}
                {!completed && !unavailable && <button className="btn btn-sm btn-outline-danger" onClick={() => navigate('/report-issue', { state: { orderId, orderItemId: item.SalesOrderItem, product: `${item.ProductName} (${item.ProductCode})`, onlinePrice: item.RequestedQuantity ? item.NetAmount / item.RequestedQuantity : item.NetAmount, currency: item.Currency } })}>Report issue</button>}
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
          <div className="flex-grow-1"><strong>{issue.product}</strong><div className="text-muted">{issue.issueType}</div>{issue.resolutionNotes && <div><strong>Handling result:</strong> {issue.resolutionNotes}</div>}{issue.resolutionOutcome && <div><strong>Shelf outcome:</strong> {issue.resolutionOutcome === 'REPLENISHED' ? 'Replenished' : 'Unavailable'}</div>}{isPricingIssue(issue) && <div><strong>Price impact:</strong> {issue.priceImpact === 'SHELF_LABEL_ONLY' ? 'Shelf label only — order charge confirmed correct' : 'Order charge affected / not yet confirmed'}</div>}{issue.onlinePrice != null && <small className="text-muted d-block">Order {issue.currency || 'NZD'} {issue.onlinePrice.toFixed(2)} · Shelf {issue.currency || 'NZD'} {issue.shelfPrice?.toFixed(2) ?? '—'}</small>}{issue.confirmedUnitPrice != null && <small className="text-muted d-block">Confirmed price {issue.currency || 'NZD'} {issue.confirmedUnitPrice.toFixed(2)} · {issue.priceResolution === 'ORIGINAL_CONFIRMED' ? 'Original price confirmed' : 'Adjustment completed outside this prototype'}</small>}{(issue.resolutionHistory || []).map((entry, index) => entry.type === 'RETURNED_TO_TEAM' && <div className="small text-warning-emphasis" key={`${entry.at}-${index}`}>Returned to team: {entry.reason}</div>)}</div>
          <div className="d-flex flex-column align-items-end gap-2"><span className={`badge ${issue.status === 'VERIFIED' ? 'bg-primary' : issue.status === 'RESOLVED' ? 'bg-success' : 'bg-warning text-dark'}`}>{issue.status.replace('_', ' ')}</span>{issue.status === 'RESOLVED' && (!completed || isPricingIssue(issue)) && <><button className="btn btn-sm btn-primary" onClick={() => verifyIssue(issue.issueId)}>Verify fix</button><button className="btn btn-sm btn-outline-danger" onClick={() => setReturningIssueId(returningIssueId === issue.issueId ? null : issue.issueId)}>Return to team</button>{returningIssueId === issue.issueId && <div className="mt-1"><label className="form-label small" htmlFor={`return-reason-${issue.issueId}`}>Reason for return</label><textarea id={`return-reason-${issue.issueId}`} className="form-control form-control-sm mb-2" rows={2} value={returnReasons[issue.issueId] || ''} onChange={(event) => setReturnReasons((current) => ({ ...current, [issue.issueId]: event.target.value }))} placeholder="What needs to be checked or redone?" /><button className="btn btn-sm btn-danger" disabled={!(returnReasons[issue.issueId] || '').trim()} onClick={() => sendBackToTeam(issue)}>Send back</button></div>}</>}</div>
        </li>)}</ul>
      </section>}

      {!completed && <div className="card border-primary mb-4"><div className="card-body">
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-3">
          <div><h5 className="mb-1">Complete this order</h5><p className="mb-0 text-muted">Each item must be picked or verified unavailable. Blocking issues must be verified; shelf-label-only price issues do not block completion.</p></div>
          <button className="btn btn-primary" disabled={!canComplete || accuracyCheck === null || perfectCheck === null} onClick={completeOrder}>Complete order</button>
        </div>
        {completionError && <div className="alert alert-warning">{completionError}</div>}
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
