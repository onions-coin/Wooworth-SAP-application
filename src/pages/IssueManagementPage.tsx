import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { IssueRecord, IssueStatus, loadIssues, saveIssues } from '../utils/workflow';

const issueTypes = ['Shelf Gap', 'Price Discrepancy', 'Wrong Product', 'Damaged Product', 'Other'];
const priorities = ['Low', 'Medium', 'High', 'Critical'];
const statusColors: Record<IssueStatus, string> = {
  OPEN: 'danger',
  IN_PROGRESS: 'warning text-dark',
  RESOLVED: 'success',
  VERIFIED: 'primary',
};

const IssueManagementPage: React.FC = () => {
  const [issues, setIssues] = useState<IssueRecord[]>(loadIssues());
  const [filter, setFilter] = useState<'ALL' | IssueStatus>('ALL');
  const [draft, setDraft] = useState({ orderId: '', product: '', issueType: issueTypes[0], severity: 'Medium', notes: '', suggestedHandling: '' });

  useEffect(() => saveIssues(issues), [issues]);

  const updateIssue = (issueId: string, updates: Partial<IssueRecord>) => {
    setIssues((current) => current.map((issue) => issue.issueId === issueId ? { ...issue, ...updates } : issue));
  };

  const createIssue = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const issue: IssueRecord = {
      issueId: `ISSUE-${Date.now()}`,
      ...draft,
      orderId: draft.orderId.trim(),
      product: draft.product.trim(),
      notes: draft.notes.trim(),
      suggestedHandling: draft.suggestedHandling.trim(),
      assignedStaff: '',
      resolutionNotes: '',
      status: 'OPEN',
      createdAt: new Date().toISOString(),
    };
    setIssues((current) => [...current, issue]);
    setDraft({ orderId: '', product: '', issueType: issueTypes[0], severity: 'Medium', notes: '', suggestedHandling: '' });
  };

  const visibleIssues = filter === 'ALL' ? issues : issues.filter((issue) => issue.status === filter);

  return (
    <div className="container mt-4">
      <nav aria-label="breadcrumb">
        <ol className="breadcrumb">
          <li className="breadcrumb-item"><Link to="/">Orders</Link></li>
          <li className="breadcrumb-item active" aria-current="page">Issue Management</li>
        </ol>
      </nav>

      <div className="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-4">
        <div>
          <h2 className="mb-1">Issue Management</h2>
          <p className="text-muted mb-0">Assign each issue, record the fix, then verify it before the item can be picked.</p>
        </div>
        <label className="form-label mb-0">Show
          <select className="form-select mt-1" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}>
            <option value="ALL">All issues ({issues.length})</option>
            <option value="OPEN">Open</option>
            <option value="IN_PROGRESS">In progress</option>
            <option value="RESOLVED">Resolved</option>
            <option value="VERIFIED">Verified</option>
          </select>
        </label>
      </div>

      <section className="card shadow-sm mb-4">
        <div className="card-header"><h5 className="mb-0">Create an issue</h5></div>
        <form onSubmit={createIssue}>
          <div className="card-body">
            <div className="row g-3">
              <div className="col-md-3"><label className="form-label" htmlFor="new-order">Order ID</label><input id="new-order" className="form-control" value={draft.orderId} onChange={(event) => setDraft({ ...draft, orderId: event.target.value })} required /></div>
              <div className="col-md-3"><label className="form-label" htmlFor="new-product">Product / item</label><input id="new-product" className="form-control" value={draft.product} onChange={(event) => setDraft({ ...draft, product: event.target.value })} required /></div>
              <div className="col-md-3"><label className="form-label" htmlFor="new-type">Issue type</label><select id="new-type" className="form-select" value={draft.issueType} onChange={(event) => setDraft({ ...draft, issueType: event.target.value })}>{issueTypes.map((type) => <option key={type}>{type}</option>)}</select></div>
              <div className="col-md-3"><label className="form-label" htmlFor="new-severity">Priority</label><select id="new-severity" className="form-select" value={draft.severity} onChange={(event) => setDraft({ ...draft, severity: event.target.value })}>{priorities.map((level) => <option key={level}>{level}</option>)}</select></div>
              <div className="col-md-6"><label className="form-label" htmlFor="new-notes">What happened?</label><textarea id="new-notes" className="form-control" rows={2} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} required /></div>
              <div className="col-md-6"><label className="form-label" htmlFor="new-action">Suggested handling</label><textarea id="new-action" className="form-control" rows={2} value={draft.suggestedHandling} onChange={(event) => setDraft({ ...draft, suggestedHandling: event.target.value })} required /></div>
            </div>
          </div>
          <div className="card-footer text-end"><button className="btn btn-primary" type="submit">Create issue</button></div>
        </form>
      </section>

      <section aria-label="Issues" className="d-flex flex-column gap-3">
        {visibleIssues.length === 0 && <div className="alert alert-info">No issues in this view.</div>}
        {visibleIssues.map((issue) => (
          <article className="card shadow-sm" key={issue.issueId}>
            <div className="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
              <div><strong>{issue.issueId}</strong><span className="text-muted ms-2">Order {issue.orderId} · {issue.product}</span></div>
              <div className="d-flex gap-2 align-items-center">
                <span className={`badge bg-${statusColors[issue.status]}`}>{issue.status.replace('_', ' ')}</span>
                <span className={`badge ${issue.severity === 'Critical' || issue.severity === 'High' ? 'bg-danger' : issue.severity === 'Low' ? 'bg-secondary' : 'bg-warning text-dark'}`}>{issue.severity} priority</span>
              </div>
            </div>
            <div className="card-body">
              <div className="row g-3">
                <div className="col-lg-6">
                  <p className="mb-1"><strong>Issue:</strong> {issue.issueType}</p>
                  <p className="mb-3"><strong>Description:</strong> {issue.notes || 'No description provided.'}</p>
                  <p className="mb-0"><strong>Suggested handling:</strong> {issue.suggestedHandling || 'No handling suggestion provided.'}</p>
                </div>
                <div className="col-lg-6">
                  <label className="form-label" htmlFor={`assignee-${issue.issueId}`}>Assigned staff</label>
                  <input id={`assignee-${issue.issueId}`} className="form-control mb-3" value={issue.assignedStaff} onChange={(event) => updateIssue(issue.issueId, { assignedStaff: event.target.value })} placeholder="Enter staff member" />
                  <label className="form-label" htmlFor={`resolution-${issue.issueId}`}>Actual handling / resolution notes</label>
                  <textarea id={`resolution-${issue.issueId}`} className="form-control" rows={3} value={issue.resolutionNotes} onChange={(event) => updateIssue(issue.issueId, { resolutionNotes: event.target.value })} placeholder="Record what was done and the outcome." />
                </div>
              </div>
              <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mt-3 pt-3 border-top">
                <small className="text-muted">Reported {new Date(issue.createdAt).toLocaleString()}{issue.resolvedAt ? ` · Resolved ${new Date(issue.resolvedAt).toLocaleString()}` : ''}{issue.verifiedAt ? ` · Verified ${new Date(issue.verifiedAt).toLocaleString()}` : ''}</small>
                <div className="d-flex gap-2">
                  {issue.status === 'OPEN' && <button className="btn btn-outline-primary btn-sm" onClick={() => updateIssue(issue.issueId, { status: 'IN_PROGRESS' })}>Start work</button>}
                  {issue.status === 'IN_PROGRESS' && <button className="btn btn-success btn-sm" disabled={!issue.resolutionNotes.trim()} onClick={() => updateIssue(issue.issueId, { status: 'RESOLVED', resolvedAt: new Date().toISOString() })}>Mark resolved</button>}
                  {issue.status === 'RESOLVED' && <button className="btn btn-primary btn-sm" onClick={() => updateIssue(issue.issueId, { status: 'VERIFIED', verifiedAt: new Date().toISOString() })}>Verify resolution</button>}
                  {issue.status === 'VERIFIED' && <Link className="btn btn-outline-secondary btn-sm" to={`/order-details?orderId=${encodeURIComponent(issue.orderId)}`}>Return to order</Link>}
                  <button className="btn btn-outline-danger btn-sm" onClick={() => setIssues((current) => current.filter((item) => item.issueId !== issue.issueId))}>Delete</button>
                </div>
              </div>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
};

export default IssueManagementPage;
