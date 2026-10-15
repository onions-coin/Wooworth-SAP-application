import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { IssueRecord, IssueStatus, loadIssues, saveIssues } from '../utils/workflow';

const statuses: IssueStatus[] = ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'VERIFIED'];
const statusColors: Record<IssueStatus, string> = {
  OPEN: 'danger', ASSIGNED: 'info text-dark', IN_PROGRESS: 'warning text-dark', RESOLVED: 'success', VERIFIED: 'primary',
};
const statusLabels: Record<IssueStatus, string> = {
  OPEN: 'Reported', ASSIGNED: 'Assigned to team', IN_PROGRESS: 'In progress', RESOLVED: 'Awaiting staff verification', VERIFIED: 'Verified',
};

const IssueManagementPage: React.FC = () => {
  const [issues, setIssues] = useState<IssueRecord[]>(loadIssues());
  const [filter, setFilter] = useState<'ALL' | IssueStatus>('ALL');
  useEffect(() => saveIssues(issues), [issues]);

  const updateIssue = (issueId: string, updates: Partial<IssueRecord>) => {
    setIssues((current) => current.map((issue) => issue.issueId === issueId ? { ...issue, ...updates } : issue));
  };
  const visibleIssues = (filter === 'ALL' ? issues : issues.filter((issue) => issue.status === filter))
    .slice().sort((a, b) => statuses.indexOf(a.status) - statuses.indexOf(b.status) || b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="container mt-4">
      <nav aria-label="breadcrumb"><ol className="breadcrumb"><li className="breadcrumb-item"><Link to="/">Orders</Link></li><li className="breadcrumb-item active">Supervisor · Issues</li></ol></nav>
      <div className="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-4">
        <div><div className="text-primary fw-semibold">Step 2 of 4 · Supervisor</div><h2 className="mb-1">Assign store issues</h2><p className="text-muted mb-0">Choose a person or team. The Team resolves it, then staff verify fulfilment issues from the order.</p></div>
        <label className="form-label mb-0">Show issues
          <select className="form-select mt-1" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}>
            <option value="ALL">All ({issues.length})</option>
            {statuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
          </select>
        </label>
      </div>
      <div className="alert alert-light border mb-4"><strong>Supervisor:</strong> assign the report. After the Team marks it resolved, the picker verifies the fix from the order page.</div>
      <section className="d-flex flex-column gap-3" aria-label="Supervisor issue queue">
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
              {issue.onlinePrice != null && <div className="small text-muted mb-3">Online price: ${issue.onlinePrice.toFixed(2)} · Shelf price: ${issue.shelfPrice?.toFixed(2) ?? '—'}</div>}
              <div className="row g-3 align-items-end">
                <div className="col-md-6">
                  <label className="form-label" htmlFor={`assignee-${issue.issueId}`}>Assign to person / team</label>
                  <input id={`assignee-${issue.issueId}`} className="form-control" value={issue.assignedStaff} onChange={(event) => updateIssue(issue.issueId, { assignedStaff: event.target.value })} placeholder="For example, replenishment team" disabled={issue.status !== 'OPEN'} />
                </div>
                <div className="col-md-6">
                  {issue.status === 'OPEN' ? <button className="btn btn-primary" disabled={!issue.assignedStaff.trim()} onClick={() => updateIssue(issue.issueId, { status: 'ASSIGNED' })}>Assign</button> : <div><strong>Assigned to</strong><div>{issue.assignedStaff || 'Team'}</div></div>}
                </div>
              </div>
              {issue.status === 'IN_PROGRESS' && <div className="alert alert-warning mt-3 mb-0">The assigned team has started this issue.</div>}
              {(issue.status === 'RESOLVED' || issue.status === 'VERIFIED') && <div className={`alert ${issue.status === 'VERIFIED' ? 'alert-primary' : 'alert-success'} mt-3 mb-0`}><strong>{issue.status === 'VERIFIED' ? 'Staff verified the fix' : 'Team resolved this issue — awaiting staff verification'}</strong>{issue.resolvedAt && <div className="small">Resolved {new Date(issue.resolvedAt).toLocaleString()}</div>}<div className="mt-2"><strong>What was done:</strong> {issue.resolutionNotes || 'No notes provided.'}</div></div>}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
};

export default IssueManagementPage;
