import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { IssueRecord, loadIssues, saveIssues } from '../utils/workflow';

const TeamWorkPage: React.FC = () => {
  const [issues, setIssues] = useState<IssueRecord[]>(loadIssues());
  useEffect(() => saveIssues(issues), [issues]);

  const updateIssue = (issueId: string, updates: Partial<IssueRecord>) => {
    setIssues((current) => current.map((issue) => issue.issueId === issueId ? { ...issue, ...updates } : issue));
  };
  const queue = issues.filter((issue) => issue.status === 'ASSIGNED' || issue.status === 'IN_PROGRESS')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const resolved = issues.filter((issue) => issue.status === 'RESOLVED')
    .sort((a, b) => (b.resolvedAt || '').localeCompare(a.resolvedAt || '')).slice(0, 10);

  return (
    <div className="container mt-4">
      <nav aria-label="breadcrumb"><ol className="breadcrumb"><li className="breadcrumb-item"><Link to="/">Orders</Link></li><li className="breadcrumb-item active">Team · Assigned issues</li></ol></nav>
      <div className="mb-4"><div className="text-primary fw-semibold">Step 3 of 4 · Team</div><h2 className="mb-1">Assigned issue work</h2><p className="text-muted mb-0">Start an assigned issue, record what was done, then mark it resolved. The result will appear on the Supervisor Issues page.</p></div>
      <section className="d-flex flex-column gap-3" aria-label="Assigned issue work queue">
        <h4 className="mb-0">Work queue ({queue.length})</h4>
        {queue.length === 0 && <div className="alert alert-info">No assigned issues waiting for work.</div>}
        {queue.map((issue) => (
          <article className="card shadow-sm" key={issue.issueId}>
            <div className="card-header d-flex flex-wrap justify-content-between align-items-center gap-2"><div><strong>{issue.issueType}</strong><span className="text-muted ms-2">{issue.issueId}</span></div><span className={`badge ${issue.status === 'ASSIGNED' ? 'bg-info text-dark' : 'bg-warning text-dark'}`}>{issue.status === 'ASSIGNED' ? 'Assigned' : 'In progress'}</span></div>
            <div className="card-body">
              <div className="d-flex flex-wrap justify-content-between gap-2 mb-3"><div><Link to={`/order-details?orderId=${encodeURIComponent(issue.orderId)}`}>Order {issue.orderId}</Link><div className="text-muted">{issue.product}</div></div><div><strong>Assigned to:</strong> {issue.assignedStaff || 'Team'}</div></div>
              {issue.status === 'ASSIGNED' ? <button className="btn btn-primary" onClick={() => updateIssue(issue.issueId, { status: 'IN_PROGRESS' })}>Start work</button> : <>
                <label className="form-label" htmlFor={`work-${issue.issueId}`}>What was done?</label>
                <textarea id={`work-${issue.issueId}`} className="form-control mb-3" rows={3} value={issue.resolutionNotes} onChange={(event) => updateIssue(issue.issueId, { resolutionNotes: event.target.value })} placeholder="Briefly record the action taken or outcome." />
                <button className="btn btn-success" disabled={!issue.resolutionNotes.trim()} onClick={() => updateIssue(issue.issueId, { status: 'RESOLVED', resolvedAt: new Date().toISOString() })}>Mark resolved</button>
              </>}
            </div>
          </article>
        ))}
      </section>
      <section className="mt-5">
        <h4>Recently resolved ({resolved.length})</h4>
        {resolved.length === 0 ? <p className="text-muted">Resolved issues will appear here.</p> : <div className="d-flex flex-column gap-2">{resolved.map((issue) => <article className="card" key={issue.issueId}><div className="card-body d-flex flex-wrap justify-content-between gap-2"><div><strong>{issue.issueType}</strong> · <Link to={`/order-details?orderId=${encodeURIComponent(issue.orderId)}`}>Order {issue.orderId}</Link><div className="text-muted">{issue.product} · {issue.resolutionNotes}</div></div><span className="badge bg-success align-self-start">Resolved</span></div></article>)}</div>}
      </section>
    </div>
  );
};

export default TeamWorkPage;
