import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { IssueRecord, IssueStatus, loadIssues, saveIssues } from '../utils/workflow';

const statuses: IssueStatus[] = ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED'];
const statusColors: Record<IssueStatus, string> = {
  OPEN: 'danger', ASSIGNED: 'info text-dark', IN_PROGRESS: 'warning text-dark', RESOLVED: 'success',
};
const statusLabels: Record<IssueStatus, string> = {
  OPEN: 'Reported', ASSIGNED: 'Assigned to team', IN_PROGRESS: 'In progress', RESOLVED: 'Resolved',
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
        <div><div className="text-primary fw-semibold">Step 2 of 4 · Supervisor</div><h2 className="mb-1">Assign product / shelf issues</h2><p className="text-muted mb-0">Choose a person or team and assign the report. The Team page handles the work and resolution.</p></div>
        <label className="form-label mb-0">Show issues
          <select className="form-select mt-1" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}>
            <option value="ALL">All ({issues.length})</option>
            {statuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
          </select>
        </label>
      </div>
      <div className="alert alert-light border mb-4"><strong>Supervisor:</strong> assign the reported issue, then the Team takes over. Resolved issues and the team’s notes remain visible here.</div>
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
              {issue.status === 'RESOLVED' && <div className="alert alert-success mt-3 mb-0"><strong>Team resolved this issue</strong>{issue.resolvedAt && <div className="small">{new Date(issue.resolvedAt).toLocaleString()}</div>}<div className="mt-2"><strong>What was done:</strong> {issue.resolutionNotes || 'No notes provided.'}</div></div>}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
};

export default IssueManagementPage;
