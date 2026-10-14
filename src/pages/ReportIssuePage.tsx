import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { IssueRecord, loadIssues, loadPickingProgress, saveIssues, savePickingProgress } from '../utils/workflow';

const IssueTypes = [
  'Online vs shelf price mismatch',
  'Out of stock / low shelf stock',
  'Sub-shelf display or replenishment shortage',
  'Product quality issue',
];

const ReportIssuePage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const routeState = (location.state || {}) as { orderId?: string; orderItemId?: string; product?: string };
  const orderId = routeState.orderId || new URLSearchParams(location.search).get('orderId') || '';
  const [issueType, setIssueType] = useState('');

  if (!orderId) {
    return <div className="container mt-4"><div className="alert alert-warning">Open an order and choose an item before reporting an issue.</div><Link className="btn btn-primary" to="/">Go to orders</Link></div>;
  }

  const submitIssue = () => {
    if (!issueType) return;
    const issue: IssueRecord = {
      issueId: `ISSUE-${Date.now()}`,
      orderId,
      orderItemId: routeState.orderItemId,
      product: routeState.product || 'Item not specified',
      issueType,
      assignedStaff: '',
      resolutionNotes: '',
      status: 'OPEN',
      createdAt: new Date().toISOString(),
    };
    saveIssues([...loadIssues(), issue]);

    if (issue.orderItemId) {
      const progress = loadPickingProgress();
      progress[orderId] = { ...(progress[orderId] || {}), [issue.orderItemId]: 'Issue Reported' };
      savePickingProgress(progress);
    }
    navigate('/issue-management', { state: { newIssueId: issue.issueId } });
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

      <div className="text-primary fw-semibold">Picker · Step 2 of 4</div><h2>Report a product / shelf issue</h2>
      <p className="text-muted">Report a shelf issue. The order and item are already attached.</p>
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
        </div>
        <div className="card-footer d-flex justify-content-between align-items-center">
          <button type="button" className="btn btn-link" onClick={() => navigate(`/order-details?orderId=${encodeURIComponent(orderId)}`)}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={!issueType} onClick={submitIssue}>Submit issue</button>
        </div>
      </div>
    </div>
  );
};

export default ReportIssuePage;
