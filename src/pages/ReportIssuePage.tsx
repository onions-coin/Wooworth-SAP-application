import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { IssueRecord, loadIssues, loadPickingProgress, PriceImpact, recordPriceCheck, saveIssues, savePickingProgress } from '../utils/workflow';

const IssueTypes = [
  'Online vs shelf price mismatch',
  'Out of stock / low shelf stock',
  'Sub-shelf display or replenishment shortage',
  'Product quality issue',
];

const ReportIssuePage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const routeState = (location.state || {}) as { orderId?: string; orderItemId?: string; product?: string; onlinePrice?: number; currency?: string };
  const orderId = routeState.orderId || new URLSearchParams(location.search).get('orderId') || '';
  const [issueType, setIssueType] = useState('');
  const [shelfPrice, setShelfPrice] = useState('');
  const [priceImpact, setPriceImpact] = useState<PriceImpact | ''>('');
  const isPriceIssue = issueType.toLowerCase().includes('price');
  const priceMatches = routeState.onlinePrice != null && shelfPrice !== '' && Math.round(routeState.onlinePrice * 100) === Math.round(Number(shelfPrice) * 100);

  if (!orderId) {
    return <div className="container mt-4"><div className="alert alert-warning">Open an order and choose an item before reporting an issue.</div><Link className="btn btn-primary" to="/">Go to orders</Link></div>;
  }

  const submitIssue = () => {
    if (!issueType) return;
    if (isPriceIssue && routeState.onlinePrice != null) {
      const shelfPriceValue = Number(shelfPrice);
      const matches = Math.round(routeState.onlinePrice * 100) === Math.round(shelfPriceValue * 100);
      recordPriceCheck({
        orderId,
        product: routeState.product || 'Item not specified',
        onlinePrice: routeState.onlinePrice,
        shelfPrice: shelfPriceValue,
        matches,
        checkedAt: new Date().toISOString(),
      });
      if (matches) {
        navigate('/order-details', { state: { orderId, priceChecked: true } });
        return;
      }
      if (!priceImpact) return;
    }
    const issue: IssueRecord = {
      issueId: `ISSUE-${Date.now()}`,
      orderId,
      orderItemId: routeState.orderItemId,
      product: routeState.product || 'Item not specified',
      issueType,
      ...(isPriceIssue ? { onlinePrice: routeState.onlinePrice, shelfPrice: Number(shelfPrice), currency: routeState.currency || 'NZD', priceImpact: priceImpact || 'ORDER_CHARGE_AFFECTED' } : {}),
      assignedStaff: '',
      resolutionNotes: '',
      status: 'OPEN',
      createdAt: new Date().toISOString(),
    };
    saveIssues([...loadIssues(), issue]);

    if (issue.orderItemId && !issueType.toLowerCase().includes('price')) {
      const progress = loadPickingProgress();
      progress[orderId] = { ...(progress[orderId] || {}), [issue.orderItemId]: 'Issue Reported' };
      savePickingProgress(progress);
    }
    navigate('/order-details', { state: { orderId, issueReported: true } });
  };

  return (
    <div className="container mt-4" style={{ maxWidth: 900 }}>
      <nav aria-label="breadcrumb">
        <ol className="breadcrumb">
          <li className="breadcrumb-item"><Link to="/">Orders</Link></li>
          <li className="breadcrumb-item"><Link to={`/order-details?orderId=${encodeURIComponent(orderId)}`}>Order {orderId}</Link></li>
          <li className="breadcrumb-item active" aria-current="page">Report shelf issue</li>
        </ol>
      </nav>

      <div className="text-primary fw-semibold">Staff · Step 1 of 4</div><h2>Report a store issue</h2>
      <p className="text-muted">Choose a shelf gap, price check, or product quality issue. If the online and shelf prices match, the check is recorded without creating an issue.</p>
      <div className="card shadow-sm">
        <div className="card-body">
          <div className="row g-3 mb-4">
            <div className="col-md-6"><div className="rounded border p-3"><small className="text-muted d-block">Order</small><strong>{orderId}</strong></div></div>
            <div className="col-md-6"><div className="rounded border p-3"><small className="text-muted d-block">Item</small><strong>{routeState.product || 'Item not specified'}</strong></div></div>
          </div>

          <fieldset>
            <legend className="fs-6 fw-semibold mb-3">Choose an issue type</legend>
            <div className="row row-cols-1 row-cols-sm-2 g-2">
              {IssueTypes.map((type) => (
                <div className="col" key={type}>
                  <button type="button" className={`btn w-100 text-start ${issueType === type ? 'btn-primary' : 'btn-outline-secondary'}`} aria-pressed={issueType === type} onClick={() => setIssueType(type)}>{type}</button>
                </div>
              ))}
            </div>
          </fieldset>
          {issueType.toLowerCase().includes('price') && <div className="row g-3 mt-2">
            <div className="col-md-6"><label className="form-label">Online order price</label><div className="form-control-plaintext fw-semibold">{routeState.onlinePrice == null ? 'Not available' : `${routeState.currency || 'NZD'} ${routeState.onlinePrice.toFixed(2)}`}</div></div>
            <div className="col-md-6"><label className="form-label" htmlFor="shelf-price">Shelf price</label><div className="input-group"><span className="input-group-text">{routeState.currency || 'NZD'}</span><input id="shelf-price" className="form-control" type="number" min="0" step="0.01" value={shelfPrice} onChange={(event) => setShelfPrice(event.target.value)} placeholder="Enter shelf price" /></div></div>
          </div>}
          {isPriceIssue && shelfPrice !== '' && !priceMatches && <fieldset className="mt-3"><legend className="form-label fs-6">What is the price impact?</legend><div className="d-flex flex-column gap-2"><label><input className="form-check-input me-2" type="radio" name="price-impact" checked={priceImpact === 'SHELF_LABEL_ONLY'} onChange={() => setPriceImpact('SHELF_LABEL_ONLY')} />Shelf label only — order charge confirmed correct</label><label><input className="form-check-input me-2" type="radio" name="price-impact" checked={priceImpact === 'ORDER_CHARGE_AFFECTED'} onChange={() => setPriceImpact('ORDER_CHARGE_AFFECTED')} />Order charge affected / not yet confirmed</label></div></fieldset>}
        </div>
        <div className="card-footer d-flex justify-content-between align-items-center">
          <button type="button" className="btn btn-link" onClick={() => navigate(`/order-details?orderId=${encodeURIComponent(orderId)}`)}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={!issueType || (isPriceIssue && (shelfPrice === '' || (!priceMatches && !priceImpact)))} onClick={submitIssue}>Submit issue</button>
        </div>
      </div>
    </div>
  );
};

export default ReportIssuePage;
