import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { IssueRecord, loadIssues, loadPickingProgress, saveIssues, savePickingProgress } from '../utils/workflow';

const IssueTypes = ['Shelf Gap', 'Price Discrepancy', 'Wrong Product', 'Damaged Product', 'Other'];
const Severities = ['Low', 'Medium', 'High', 'Critical'];

const ReportIssuePage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const routeState = (location.state || {}) as {
    orderId?: string;
    orderItemId?: string;
    product?: string;
  };
  const [orderId, setOrderId] = useState(routeState.orderId || new URLSearchParams(location.search).get('orderId') || '');
  const [product, setProduct] = useState(routeState.product || '');
  const [issueType, setIssueType] = useState(IssueTypes[0]);
  const [severity, setSeverity] = useState('Medium');
  const [description, setDescription] = useState('');
  const [suggestedHandling, setSuggestedHandling] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    const issue: IssueRecord = {
      issueId: `ISSUE-${Date.now()}`,
      orderId: orderId.trim(),
      orderItemId: routeState.orderItemId,
      product: product.trim(),
      issueType,
      severity,
      notes: description.trim(),
      suggestedHandling: suggestedHandling.trim(),
      assignedStaff: '',
      resolutionNotes: '',
      status: 'OPEN',
      createdAt: new Date().toISOString(),
    };

    const issues = loadIssues();
    saveIssues([...issues, issue]);

    if (issue.orderItemId) {
      const progress = loadPickingProgress();
      progress[issue.orderId] = {
        ...(progress[issue.orderId] || {}),
        [issue.orderItemId]: 'Issue Reported',
      };
      savePickingProgress(progress);
    }

    navigate('/issue-management', { state: { newIssueId: issue.issueId } });
  };

  return (
    <div className="container mt-4" style={{ maxWidth: 900 }}>
      <nav aria-label="breadcrumb">
        <ol className="breadcrumb">
          <li className="breadcrumb-item"><Link to="/">Orders</Link></li>
          {orderId && (
            <li className="breadcrumb-item">
              <Link to={`/order-details?orderId=${encodeURIComponent(orderId)}`}>Order {orderId}</Link>
            </li>
          )}
          <li className="breadcrumb-item active" aria-current="page">Report Issue</li>
        </ol>
      </nav>

      <div className="mb-4">
        <h2>Report an order issue</h2>
        <p className="text-muted mb-0">Describe what happened and what action may resolve it. The issue will be tracked through assignment, resolution, and verification.</p>
      </div>

      <form className="card shadow-sm" onSubmit={handleSubmit}>
        <div className="card-body">
          {error && <div className="alert alert-danger">{error}</div>}
          <div className="row g-3">
            <div className="col-md-6">
              <label htmlFor="issue-order" className="form-label">Order ID</label>
              <input id="issue-order" className="form-control" value={orderId} onChange={(event) => setOrderId(event.target.value)} required />
            </div>
            <div className="col-md-6">
              <label htmlFor="issue-product" className="form-label">Product / item</label>
              <input id="issue-product" className="form-control" value={product} onChange={(event) => setProduct(event.target.value)} required />
            </div>
            <div className="col-md-6">
              <label htmlFor="issue-type" className="form-label">Issue type</label>
              <select id="issue-type" className="form-select" value={issueType} onChange={(event) => setIssueType(event.target.value)}>
                {IssueTypes.map((type) => <option key={type}>{type}</option>)}
              </select>
            </div>
            <div className="col-md-6">
              <label htmlFor="issue-severity" className="form-label">Priority</label>
              <select id="issue-severity" className="form-select" value={severity} onChange={(event) => setSeverity(event.target.value)}>
                {Severities.map((level) => <option key={level}>{level}</option>)}
              </select>
            </div>
            <div className="col-12">
              <label htmlFor="issue-description" className="form-label">What happened?</label>
              <textarea id="issue-description" className="form-control" rows={4} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Include what you observed, when it happened, and any impact on the order." required />
            </div>
            <div className="col-12">
              <label htmlFor="issue-handling" className="form-label">Suggested handling / action needed</label>
              <textarea id="issue-handling" className="form-control" rows={3} value={suggestedHandling} onChange={(event) => setSuggestedHandling(event.target.value)} placeholder="For example: check the back room, confirm the shelf label, or replace the damaged item." required />
            </div>
          </div>
        </div>
        <div className="card-footer d-flex justify-content-between align-items-center">
          <small className="text-muted">This item will remain blocked from picking until its issue is verified.</small>
          <div className="d-flex gap-2">
            <button type="button" className="btn btn-outline-secondary" onClick={() => orderId ? navigate(`/order-details?orderId=${encodeURIComponent(orderId)}`) : navigate('/')}>Cancel</button>
            <button type="submit" className="btn btn-primary">Submit issue</button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default ReportIssuePage;
