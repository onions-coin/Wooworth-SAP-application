export type IssueStatus = 'OPEN' | 'ASSIGNED' | 'IN_PROGRESS' | 'RESOLVED';
export type PickingStatus = 'Not Started' | 'Picked' | 'Issue Reported';

export interface IssueRecord {
  issueId: string;
  orderId: string;
  orderItemId?: string;
  product: string;
  issueType: string;
  assignedStaff: string;
  resolutionNotes: string;
  status: IssueStatus;
  createdAt: string;
  resolvedAt?: string;
}

export type PickingProgress = Record<string, Record<string, PickingStatus>>;

export function loadIssues(): IssueRecord[] {
  try {
    const stored = localStorage.getItem('woolworths_issues');
    const issues = stored ? JSON.parse(stored) : [];
    return Array.isArray(issues) ? issues.map((issue) => ({
      resolutionNotes: '',
      assignedStaff: '',
      ...issue,
      // Older versions required a separate verification step. In the new flow,
      // resolved means the team has finished and the supervisor can see the result.
      status: issue.status === 'VERIFIED' ? 'RESOLVED' : issue.status,
    })) : [];
  } catch {
    return [];
  }
}

export function saveIssues(issues: IssueRecord[]) {
  localStorage.setItem('woolworths_issues', JSON.stringify(issues));
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

export function markOrderComplete(orderId: string) {
  const completed = new Set(loadCompletedOrderIds());
  completed.add(String(orderId));
  localStorage.setItem('woolworths_completed_orders', JSON.stringify([...completed]));
}
