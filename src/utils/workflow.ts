export type IssueStatus = 'OPEN' | 'ASSIGNED' | 'IN_PROGRESS' | 'RESOLVED' | 'VERIFIED';
export type PickingStatus = 'Not Started' | 'Picked' | 'Issue Reported';

export interface IssueRecord {
  issueId: string;
  orderId: string;
  orderItemId?: string;
  product: string;
  issueType: string;
  onlinePrice?: number;
  shelfPrice?: number;
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
      status: issue.status,
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

export function isShelfGapIssue(issue: Pick<IssueRecord, 'issueType'>) {
  const type = issue.issueType.toLowerCase();
  if (type.includes('price')) return false;
  return type.includes('stock') || type.includes('shelf') || type.includes('replenish');
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
