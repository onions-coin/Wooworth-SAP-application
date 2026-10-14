import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { IssueRecord, IssueStatus, loadIssues, saveIssues } from '../utils/workflow';

const statuses: IssueStatus[] = ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'VERIFIED'];
const statusColors: Record<IssueStatus, string> = {
  OPEN: 'danger',
  ASSIGNED: 'info text-dark',
  IN_PROGRESS: 'warning text-dark',
  RESOLVED: 'success',
  VERIFIED: 'primary',
};
const statusLabels: Record<IssueStatus, string> = {
  OPEN: 'Reported',
  ASSIGNED: 'Assigned',
  IN_PROGRESS: 'In progress',
  RESOLVED: 'Resolved',
  VERIFIED: 'Verified',
};

const IssueManagementPage: React.FC = () => {
  const [issues, setIssues] = useState<IssueRecord[]>(loadIssues());
  const [filter, setFilter] = useState<'ALL' | IssueStatus>('ALL');

  useEffect(() => saveIssues(issues), [issues]);

  const updateIssue = (issueId: string, updates: Partial<IssueRecord>) => {
    setIssues((current) => current.map((issue) => issue.issueId === issueId ? { ...issue, ...updates } : issue));
  };
  const visibleIssues = (filter === 'ALL' ? issues : issues.filter((issue) => issue.status === filter)).slice().sort((a, b) => statuses.indexOf(a.status) - statuses.indexOf(b.status) || b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="container mt-4">
      <nav aria-label="breadcrumb"><ol className="breadcrumb"><li className="breadcrumb-item"><Link to="/">Orders</Link></li><li className="breadcrumb-item active">Product / Shelf Issues</li></ol></nav>
      <div className="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-4">
        <div><div className="text-primary fw-semibold">Supervisor · Step 3 of 4</div><h2 className="mb-1">Product / Shelf Issues</h2><p className="text-muted mb-0">Assign each report, record the fix, verify it, then send the picker back to the order.</p></div>
        <label className="form-label mb-0">Filter issues
          <select className="form-select mt-1" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}>
            <option value="ALL">All ({issues.length})</option>
            {statuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
          </select>
        </label>
      </div>

      <div className="alert alert-light border mb-4">
        <strong>Supervisor steps:</strong> 1. Assign a person or team → 2. Start work → 3. Record what was done → 4. Verify the result.
      </div>

      <section className="d-flex flex-column gap-3" aria-label="Issue queue">
        {visibleIssues.length === 0 && <div className="alert alert-info">No issues in this view.</div>}
        {visibleIssues.map((issue) => (
          <article className="card shadow-sm" key={issue.issueId}>
            <div className="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
              <div><strong>{issue.issueType}</strong><span className="text-muted ms-2">{issue.issueId}</span></div>
              <span className={`badge bg-${statusColors[issue.status]}`}>{statusLabels[issue.status]}</span>
            </div>
            <div className="card-body">
              <div className="d-flex flex-wrap justify-content-between gap-2 mb-3">
                <div><Link to={`/order-details?orderId=${encodeURIComponent(issue.orderId)}`}>Order {issue.orderId}</Link><div className="text-muted">{issue.product}</div></div>
                <small className="text-muted">Reported {new Date(issue.createdAt).toLocaleString()}</small>
              </div>

              <div className="row g-3">
                <div className="col-md-5">
                  <label className="form-label" htmlFor={`assignee-${issue.issueId}`}>Assigned person / team</label>
                  <input id={`assignee-${issue.issueId}`} className="form-control" value={issue.assignedStaff} onChange={(event) => updateIssue(issue.issueId, { assignedStaff: event.target.value })} placeholder="For example, replenishment team" disabled={issue.status === 'VERIFIED'} />
                </div>
                <div className="col-md-7">
                  {issue.status === 'IN_PROGRESS' ? <>
                    <label className="form-label" htmlFor={`resolution-${issue.issueId}`}>What was done?</label>
                    <textarea id={`resolution-${issue.issueId}`} className="form-control" rows={2} value={issue.resolutionNotes} onChange={(event) => updateIssue(issue.issueId, { resolutionNotes: event.target.value })} placeholder="Record the actual fix or outcome." />
                  </> : <div><strong>Handling result</strong><div className="text-muted mt-1">{issue.resolutionNotes || 'Not recorded yet.'}</div></div>}
                </div>
              </div>

              <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mt-3 pt-3 border-top">
                <small className="text-muted">{issue.resolvedAt ? `Resolved ${new Date(issue.resolvedAt).toLocaleString()}` : ''}{issue.verifiedAt ? ` · Verified ${new Date(issue.verifiedAt).toLocaleString()}` : ''}</small>
                <div className="d-flex gap-2">
                  {issue.status === 'OPEN' && <button className="btn btn-outline-primary btn-sm" disabled={!issue.assignedStaff.trim()} onClick={() => updateIssue(issue.issueId, { status: 'ASSIGNED' })}>Assign issue</button>}
                  {issue.status === 'ASSIGNED' && <button className="btn btn-outline-primary btn-sm" onClick={() => updateIssue(issue.issueId, { status: 'IN_PROGRESS' })}>Start work</button>}
                  {issue.status === 'IN_PROGRESS' && <button className="btn btn-success btn-sm" disabled={!issue.resolutionNotes.trim()} onClick={() => updateIssue(issue.issueId, { status: 'RESOLVED', resolvedAt: new Date().toISOString() })}>Mark resolved</button>}
                  {issue.status === 'RESOLVED' && <button className="btn btn-primary btn-sm" onClick={() => updateIssue(issue.issueId, { status: 'VERIFIED', verifiedAt: new Date().toISOString() })}>Verify</button>}
                  {issue.status === 'VERIFIED' && <Link className="btn btn-outline-secondary btn-sm" to={`/order-details?orderId=${encodeURIComponent(issue.orderId)}`}>Return picker to order</Link>}
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
