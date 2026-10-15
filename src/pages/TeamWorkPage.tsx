import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { canResolveIssue, isBlockingPriceIssue, isPricingIssue, IssueRecord, loadIssues, PriceResolution, saveIssues, ShelfResolutionOutcome } from '../utils/workflow';

const TeamWorkPage: React.FC = () => {
  const [issues, setIssues] = useState<IssueRecord[]>(loadIssues());
  const [confirmedPrices, setConfirmedPrices] = useState<Record<string, string>>({});
  const [priceResolutions, setPriceResolutions] = useState<Record<string, PriceResolution | ''>>({});
  useEffect(() => saveIssues(issues), [issues]);

  const updateIssue = (issueId: string, updates: Partial<IssueRecord>) => {
    setIssues((current) => current.map((issue) => issue.issueId === issueId ? { ...issue, ...updates } : issue));
  };
  const queue = issues.filter((issue) => issue.status === 'ASSIGNED' || issue.status === 'IN_PROGRESS')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const resolved = issues.filter((issue) => issue.status === 'RESOLVED' || issue.status === 'VERIFIED')
    .sort((a, b) => (b.resolvedAt || '').localeCompare(a.resolvedAt || '')).slice(0, 10);

  return (
    <div className="container mt-4">
      <nav aria-label="breadcrumb"><ol className="breadcrumb"><li className="breadcrumb-item"><Link to="/">Orders</Link></li><li className="breadcrumb-item active">Team · Assigned issues</li></ol></nav>
      <div className="mb-4"><div className="text-primary fw-semibold">Step 3 of 4 · Team</div><h2 className="mb-1">Assigned issue work</h2><p className="text-muted mb-0">Start the task, record what was done, and mark it resolved. Staff verify the result from the order.</p></div>
      <section className="d-flex flex-column gap-3" aria-label="Assigned issue work queue">
        <h4 className="mb-0">Work queue ({queue.length})</h4>
        {queue.length === 0 && <div className="alert alert-info">No assigned issues waiting for work.</div>}
        {queue.map((issue) => {
          const price = confirmedPrices[issue.issueId] ?? (issue.confirmedUnitPrice == null ? '' : String(issue.confirmedUnitPrice));
          const priceResolution = priceResolutions[issue.issueId] ?? issue.priceResolution ?? '';
          const numericPrice = price.trim() === '' ? undefined : Number(price);
          const outcome = issue.resolutionOutcome;
          const resolutionReady = canResolveIssue(issue, {
            resolutionNotes: issue.resolutionNotes,
            resolutionOutcome: outcome,
            confirmedUnitPrice: numericPrice,
            priceResolution: priceResolution || undefined,
          });
          const history = issue.resolutionHistory || [];
          return (
            <article className="card shadow-sm" key={issue.issueId}>
              <div className="card-header d-flex flex-wrap justify-content-between align-items-center gap-2"><div><strong>{issue.issueType}</strong><span className="text-muted ms-2">{issue.issueId}</span></div><span className={`badge ${issue.status === 'ASSIGNED' ? 'bg-info text-dark' : 'bg-warning text-dark'}`}>{issue.status === 'ASSIGNED' ? 'Assigned' : 'In progress'}</span></div>
              <div className="card-body">
                <div className="d-flex flex-wrap justify-content-between gap-2 mb-3"><div><Link to={`/order-details?orderId=${encodeURIComponent(issue.orderId)}`}>Order {issue.orderId}</Link><div className="text-muted">{issue.product}</div></div><div><strong>Assigned to:</strong> {issue.assignedStaff || 'Team'}</div></div>
                {isPricingIssue(issue) && <div className="alert alert-light border py-2"><strong>Price impact:</strong> {issue.priceImpact === 'SHELF_LABEL_ONLY' ? 'Shelf label only — order charge confirmed correct' : 'Order charge affected / not yet confirmed'}{issue.onlinePrice != null && <div className="small">Order price {issue.currency || 'NZD'} {issue.onlinePrice.toFixed(2)} · Shelf price {issue.currency || 'NZD'} {issue.shelfPrice?.toFixed(2) ?? '—'}</div>}</div>}
                {history.filter((entry) => entry.type === 'RETURNED_TO_TEAM').map((entry, index) => <div className="alert alert-warning py-2" key={`${entry.at}-${index}`}><strong>Returned by supervisor:</strong> {entry.reason}<div className="small">Previous resolution: {entry.resolutionNotes || 'No notes recorded.'}</div></div>)}
                {history.filter((entry) => entry.type === 'REASSIGNED').map((entry, index) => <div className="small text-muted mb-2" key={`${entry.at}-${index}`}>Reassigned {new Date(entry.at).toLocaleString()} from {entry.previousAssignee || 'team'} to {entry.newAssignee || 'team'}{entry.resolutionNotes ? ` · Previous work: ${entry.resolutionNotes}` : ''}</div>)}
                {issue.status === 'ASSIGNED' ? <button className="btn btn-primary" onClick={() => updateIssue(issue.issueId, { status: 'IN_PROGRESS', startedAt: new Date().toISOString() })}>Start work</button> : <>
                  {isShelfGapIssue(issue) && <fieldset className="mb-3"><legend className="form-label fs-6">Outcome</legend><div className="d-flex flex-column flex-sm-row gap-3"><label><input className="form-check-input me-2" type="radio" name={`outcome-${issue.issueId}`} checked={outcome === 'REPLENISHED'} onChange={() => updateIssue(issue.issueId, { resolutionOutcome: 'REPLENISHED' as ShelfResolutionOutcome })} />Replenished</label><label><input className="form-check-input me-2" type="radio" name={`outcome-${issue.issueId}`} checked={outcome === 'UNAVAILABLE'} onChange={() => updateIssue(issue.issueId, { resolutionOutcome: 'UNAVAILABLE' as ShelfResolutionOutcome })} />Unavailable</label></div></fieldset>}
                  <label className="form-label" htmlFor={`work-${issue.issueId}`}>What was done?</label>
                  <textarea id={`work-${issue.issueId}`} className="form-control mb-3" rows={3} value={issue.resolutionNotes} onChange={(event) => updateIssue(issue.issueId, { resolutionNotes: event.target.value })} placeholder="Briefly record the action taken or outcome." />
                  {isBlockingPriceIssue(issue) && <div className="row g-3 mb-3"><div className="col-md-6"><label className="form-label" htmlFor={`confirmed-price-${issue.issueId}`}>Confirmed unit price</label><div className="input-group"><span className="input-group-text">{issue.currency || 'NZD'}</span><input id={`confirmed-price-${issue.issueId}`} className="form-control" type="number" min="0" step="0.01" value={price} onChange={(event) => setConfirmedPrices((current) => ({ ...current, [issue.issueId]: event.target.value }))} placeholder="0.00" /></div></div><div className="col-md-6"><label className="form-label" htmlFor={`price-resolution-${issue.issueId}`}>Price outcome</label><select id={`price-resolution-${issue.issueId}`} className="form-select" value={priceResolution} onChange={(event) => setPriceResolutions((current) => ({ ...current, [issue.issueId]: event.target.value as PriceResolution | '' }))}><option value="">Choose outcome</option><option value="ORIGINAL_CONFIRMED">Original order price confirmed</option><option value="ADJUSTED_OUTSIDE_PROTOTYPE">Adjustment completed outside this prototype</option></select></div></div>}
                  <button className="btn btn-success" disabled={!resolutionReady} onClick={() => updateIssue(issue.issueId, { status: 'RESOLVED', resolvedAt: new Date().toISOString(), ...(isBlockingPriceIssue(issue) ? { confirmedUnitPrice: numericPrice, priceResolution: priceResolution as PriceResolution } : {}) })}>Mark resolved</button>
                </>}
              </div>
            </article>
          );
        })}
      </section>
      <section className="mt-5">
        <h4>Recently resolved ({resolved.length})</h4>
        {resolved.length === 0 ? <p className="text-muted">Resolved issues will appear here.</p> : <div className="d-flex flex-column gap-2">{resolved.map((issue) => <article className="card" key={issue.issueId}><div className="card-body d-flex flex-wrap justify-content-between gap-2"><div><strong>{issue.issueType}</strong> · <Link to={`/order-details?orderId=${encodeURIComponent(issue.orderId)}`}>Order {issue.orderId}</Link><div className="text-muted">{issue.product} · {issue.resolutionNotes}</div>{issue.resolutionOutcome && <div>Outcome: {issue.resolutionOutcome === 'REPLENISHED' ? 'Replenished' : 'Unavailable'}</div>}{issue.confirmedUnitPrice != null && <div>Confirmed unit price: {issue.currency || 'NZD'} {issue.confirmedUnitPrice.toFixed(2)}</div>}</div><span className={`badge align-self-start ${issue.status === 'VERIFIED' ? 'bg-primary' : 'bg-success'}`}>{issue.status === 'VERIFIED' ? 'Verified by staff' : 'Awaiting staff verification'}</span></div></article>)}</div>}
      </section>
    </div>
  );
};

function isShelfGapIssue(issue: IssueRecord) {
  const type = issue.issueType.toLowerCase();
  return !type.includes('price') && (type.includes('stock') || type.includes('shelf') || type.includes('replenish'));
}

export default TeamWorkPage;
