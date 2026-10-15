export type IssueStatus = 'OPEN' | 'ASSIGNED' | 'IN_PROGRESS' | 'RESOLVED' | 'VERIFIED';
export type PickingStatus = 'Not Started' | 'Picked' | 'Issue Reported' | 'Unavailable — not supplied';
export type ShelfResolutionOutcome = 'REPLENISHED' | 'UNAVAILABLE';
export type PriceImpact = 'SHELF_LABEL_ONLY' | 'ORDER_CHARGE_AFFECTED';
export type PriceResolution = 'ORIGINAL_CONFIRMED' | 'ADJUSTED_OUTSIDE_PROTOTYPE';
export type FulfilmentOutcome = 'COMPLETED' | 'PARTIAL' | 'UNFULFILLED';

export interface IssueHistoryEntry {
  type: 'RETURNED_TO_TEAM' | 'REASSIGNED' | 'RESOLUTION_SAVED';
  at: string;
  reason?: string;
  previousAssignee?: string;
  newAssignee?: string;
  resolutionNotes?: string;
  resolutionOutcome?: ShelfResolutionOutcome;
  confirmedUnitPrice?: number;
  priceResolution?: PriceResolution;
}

export interface IssueRecord {
  issueId: string;
  orderId: string;
  orderItemId?: string;
  product: string;
  issueType: string;
  onlinePrice?: number;
  shelfPrice?: number;
  currency?: string;
  priceImpact?: PriceImpact;
  confirmedUnitPrice?: number;
  priceResolution?: PriceResolution;
  resolutionOutcome?: ShelfResolutionOutcome;
  resolutionHistory?: IssueHistoryEntry[];
  assignedStaff: string;
  resolutionNotes: string;
  status: IssueStatus;
  createdAt: string;
  startedAt?: string;
  resolvedAt?: string;
  verifiedAt?: string;
}

export type PickingProgress = Record<string, Record<string, PickingStatus>>;
export interface OrderOutcome {
  orderId: string;
  completedAt: string;
  promisedAt?: string;
  accurate: boolean;
  perfectFulfilment: boolean;
  fulfilmentOutcome?: FulfilmentOutcome;
}
export interface PriceCheckRecord {
  orderId: string;
  product: string;
  onlinePrice: number;
  shelfPrice: number;
  matches: boolean;
  checkedAt: string;
}

export function loadIssues(): IssueRecord[] {
  try {
    const stored = localStorage.getItem('woolworths_issues');
    const issues = stored ? JSON.parse(stored) : [];
    return Array.isArray(issues) ? issues.map((issue) => ({
      resolutionNotes: '',
      assignedStaff: '',
      ...issue,
      resolutionHistory: Array.isArray(issue.resolutionHistory) ? issue.resolutionHistory : [],
      // Legacy price issues are blocking by default to prevent accidental bypass.
      ...(isPricingIssue(issue) ? { priceImpact: issue.priceImpact || 'ORDER_CHARGE_AFFECTED' } : {}),
    })) : [];
  } catch {
    return [];
  }
}

export function saveIssues(issues: IssueRecord[]) {
  localStorage.setItem('woolworths_issues', JSON.stringify(issues));
}

export function isPricingIssue(issue: Pick<IssueRecord, 'issueType'>) {
  return issue.issueType.toLowerCase().includes('price');
}

export function isBlockingPriceIssue(issue: Pick<IssueRecord, 'issueType' | 'priceImpact'>) {
  return isPricingIssue(issue) && issue.priceImpact !== 'SHELF_LABEL_ONLY';
}

export function blocksOrderCompletion(issue: Pick<IssueRecord, 'issueType' | 'priceImpact'>) {
  return !isPricingIssue(issue) || isBlockingPriceIssue(issue);
}

export function blocksPhysicalPicking(issue: Pick<IssueRecord, 'issueType'>) {
  return !isPricingIssue(issue);
}

export function isShelfGapIssue(issue: Pick<IssueRecord, 'issueType'>) {
  const type = issue.issueType.toLowerCase();
  if (type.includes('price')) return false;
  return type.includes('stock') || type.includes('shelf') || type.includes('replenish');
}

export function canResolveIssue(issue: IssueRecord, values: {
  resolutionNotes: string;
  resolutionOutcome?: ShelfResolutionOutcome;
  confirmedUnitPrice?: number;
  priceResolution?: PriceResolution;
}) {
  if (!values.resolutionNotes.trim()) return false;
  if (isShelfGapIssue(issue) && !values.resolutionOutcome) return false;
  if (isBlockingPriceIssue(issue)) {
    return typeof values.confirmedUnitPrice === 'number' && Number.isFinite(values.confirmedUnitPrice) &&
      values.confirmedUnitPrice >= 0 && Boolean(values.priceResolution);
  }
  return true;
}

export function canCompleteOrder(orderId: string, itemIds: string[], progress: Record<string, PickingStatus>, issues: IssueRecord[], completedIds: string[]) {
  if (!orderId || itemIds.length === 0 || completedIds.includes(String(orderId))) return false;
  const itemsReady = itemIds.every((itemId) => progress[itemId] === 'Picked' || progress[itemId] === 'Unavailable — not supplied');
  const issuesReady = issues.filter((issue) => issue.orderId === String(orderId) && blocksOrderCompletion(issue))
    .every((issue) => issue.status === 'VERIFIED');
  return itemsReady && issuesReady;
}

export function deriveFulfilmentOutcome(itemIds: string[], progress: Record<string, PickingStatus>): FulfilmentOutcome {
  const unavailable = itemIds.filter((itemId) => progress[itemId] === 'Unavailable — not supplied').length;
  if (unavailable === itemIds.length) return 'UNFULFILLED';
  if (unavailable > 0) return 'PARTIAL';
  return 'COMPLETED';
}

function clearActiveResolution(issue: IssueRecord): IssueRecord {
  const { resolutionOutcome: _outcome, confirmedUnitPrice: _price, priceResolution: _priceResolution, ...rest } = issue;
  return { ...rest, resolutionNotes: '', resolvedAt: undefined, verifiedAt: undefined };
}

export function returnIssueToTeam(issue: IssueRecord, reason: string, at = new Date().toISOString()): IssueRecord | null {
  if (issue.status !== 'RESOLVED' || !reason.trim()) return null;
  const previous = {
    type: 'RETURNED_TO_TEAM' as const,
    at,
    reason: reason.trim(),
    resolutionNotes: issue.resolutionNotes,
    resolutionOutcome: issue.resolutionOutcome,
    confirmedUnitPrice: issue.confirmedUnitPrice,
    priceResolution: issue.priceResolution,
  };
  return { ...clearActiveResolution(issue), status: 'IN_PROGRESS', resolutionHistory: [...(issue.resolutionHistory || []), previous] };
}

export function reassignIssue(issue: IssueRecord, newAssignee: string, at = new Date().toISOString()): IssueRecord | null {
  const assignee = newAssignee.trim();
  if (!assignee || !['ASSIGNED', 'IN_PROGRESS'].includes(issue.status)) return null;
  const previous = {
    type: 'REASSIGNED' as const,
    at,
    previousAssignee: issue.assignedStaff,
    newAssignee: assignee,
    resolutionNotes: issue.resolutionNotes || undefined,
  };
  return {
    ...clearActiveResolution(issue),
    assignedStaff: assignee,
    status: 'ASSIGNED',
    startedAt: undefined,
    resolutionHistory: [...(issue.resolutionHistory || []), previous],
  };
}

export function verifyResolvedIssue(issues: IssueRecord[], progress: PickingProgress, issueId: string, at = new Date().toISOString()) {
  const issue = issues.find((item) => item.issueId === issueId && item.status === 'RESOLVED');
  if (!issue) return null;
  const nextIssues = issues.map((item) => item.issueId === issueId ? { ...item, status: 'VERIFIED' as const, verifiedAt: at } : item);
  const nextProgress = { ...progress };
  if (issue.resolutionOutcome === 'UNAVAILABLE' && issue.orderItemId) {
    nextProgress[issue.orderId] = { ...(nextProgress[issue.orderId] || {}), [issue.orderItemId]: 'Unavailable — not supplied' };
  }
  return { issues: nextIssues, progress: nextProgress };
}

export function canPickItem(orderId: string, itemId: string, progress: Record<string, PickingStatus>, issues: IssueRecord[]) {
  if (progress[itemId] === 'Picked' || progress[itemId] === 'Unavailable — not supplied') return false;
  return !issues.some((issue) => issue.orderId === String(orderId) && issue.orderItemId === itemId &&
    blocksPhysicalPicking(issue) && issue.status !== 'VERIFIED');
}

export function fulfilmentOutcomeLabel(outcome?: FulfilmentOutcome) {
  if (outcome === 'PARTIAL') return 'Completed — partial fulfilment';
  if (outcome === 'UNFULFILLED') return 'Closed — unfulfilled';
  return 'Completed';
}

export function loadPickingProgress(): PickingProgress {
  try {
    const stored = localStorage.getItem('woolworths_picking_progress');
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

export function savePickingProgress(progress: PickingProgress) {
  localStorage.setItem('woolworths_picking_progress', JSON.stringify(progress));
}

export function loadCompletedOrderIds(): string[] {
  try {
    const stored = localStorage.getItem('woolworths_completed_orders');
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function markOrderComplete(orderId: string, result: { promisedAt?: string; accurate: boolean; perfectFulfilment: boolean }) {
  const completed = new Set(loadCompletedOrderIds());
  completed.add(String(orderId));
  localStorage.setItem('woolworths_completed_orders', JSON.stringify([...completed]));
  const completedAt = new Date().toISOString();
  const timestamps = loadOrderCompletionTimes();
  timestamps[String(orderId)] = completedAt;
  localStorage.setItem('woolworths_order_completed_at', JSON.stringify(timestamps));
  saveOrderOutcome({ orderId: String(orderId), completedAt, ...result });
}

export function loadOrderFulfilmentOutcomes(): Record<string, FulfilmentOutcome> {
  try {
    return JSON.parse(localStorage.getItem('woolworths_order_fulfilment_outcomes') || '{}');
  } catch {
    return {};
  }
}

export function completeOrderIfEligible(orderId: string, itemIds: string[], result: { promisedAt?: string; accurate: boolean; perfectFulfilment: boolean }) {
  const issues = loadIssues();
  const allProgress = loadPickingProgress();
  const orderProgress = allProgress[String(orderId)] || {};
  const completedIds = loadCompletedOrderIds();
  if (!canCompleteOrder(orderId, itemIds, orderProgress, issues, completedIds)) return false;

  const outcome = deriveFulfilmentOutcome(itemIds, orderProgress);
  const fulfilmentOutcomes = loadOrderFulfilmentOutcomes();
  fulfilmentOutcomes[String(orderId)] = outcome;
  localStorage.setItem('woolworths_order_fulfilment_outcomes', JSON.stringify(fulfilmentOutcomes));
  markOrderComplete(orderId, { ...result, perfectFulfilment: outcome === 'COMPLETED' && result.perfectFulfilment });
  return true;
}

export function loadOrderCompletionTimes(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem('woolworths_order_completed_at') || '{}');
  } catch {
    return {};
  }
}

export function loadOrderPromises(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem('woolworths_order_promises') || '{}');
  } catch {
    return {};
  }
}

export function saveOrderPromise(orderId: string, promisedAt: string) {
  const promises = loadOrderPromises();
  promises[String(orderId)] = promisedAt;
  localStorage.setItem('woolworths_order_promises', JSON.stringify(promises));
}

export function loadOrderOutcomes(): OrderOutcome[] {
  try {
    const outcomes = JSON.parse(localStorage.getItem('woolworths_order_outcomes') || '[]');
    return Array.isArray(outcomes) ? outcomes : [];
  } catch {
    return [];
  }
}

export function saveOrderOutcome(outcome: OrderOutcome) {
  const outcomes = loadOrderOutcomes().filter((item) => item.orderId !== outcome.orderId);
  outcomes.push(outcome);
  localStorage.setItem('woolworths_order_outcomes', JSON.stringify(outcomes));
}

export function loadPriceChecks(): PriceCheckRecord[] {
  try {
    const checks = JSON.parse(localStorage.getItem('woolworths_price_checks') || '[]');
    return Array.isArray(checks) ? checks : [];
  } catch {
    return [];
  }
}

export function recordPriceCheck(check: PriceCheckRecord) {
  localStorage.setItem('woolworths_price_checks', JSON.stringify([...loadPriceChecks(), check]));
}
