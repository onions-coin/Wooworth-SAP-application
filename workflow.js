(function (root) {
  'use strict';
  const STORAGE_KEY = 'ww_order_assistant_v4';
  const PREVIOUS_KEYS = ['ww_order_assistant_v3', 'ww_order_assistant_v2', 'ww_order_assistant_v1'];
  const STOCK = 'Stock Availability Mismatch', QUALITY = 'Product Quality Issue', PRICE = 'Price Discrepancy';
  const STATUS = { PROCESSING: 'In Progress', HANDLED: 'Handled', CLOSED: 'Closed' };
  const LEGACY_KEYS = [...PREVIOUS_KEYS, 'woolworths_issues', 'woolworths_picking_progress', 'woolworths_completed_orders', 'woolworths_order_completed_at', 'woolworths_order_outcomes', 'woolworths_order_fulfilment_outcomes', 'woolworths_user_role', 'woolworths_order_promises', 'woolworths_price_checks', 'woolworths_orders'];
  const text = value => String(value ?? '').trim();
  const clone = value => JSON.parse(JSON.stringify(value));
  const validTime = value => typeof value === 'string' && value.trim() !== '' && Number.isFinite(Date.parse(value));
  const itemKey = (orderId, itemId) => JSON.stringify([String(orderId), String(itemId)]);
  const normalizeType = value => {
    const raw = text(value);
    if (raw === STOCK || raw === QUALITY || raw === PRICE) return raw;
    const label = raw.toLowerCase();
    if (/price|pricing/.test(label)) return PRICE;
    if (/quality|damaged|damage|expired|spoiled|defective|broken|contaminat/.test(label)) return QUALITY;
    if (/stock|shelf gap|inventory|shortage|out of stock/.test(label)) return STOCK;
    return raw;
  };
  const recommendedTeam = type => type === PRICE ? 'IT Team' : 'Inventory Team';
  const freshState = role => ({ schemaVersion: 4, role: role === 'Supervisor' ? 'Supervisor' : 'Picker', issues: [], retiredIssues: [], picking: {}, completed: {}, migration: null });
  const overallStatus = issue => issue.status;
  const orderIssues = (state, orderId) => state.issues.filter(issue => issue.orderId === orderId);
  const itemIssues = (state, orderId, itemId) => orderIssues(state, orderId).filter(issue => issue.itemId === itemId);

  function validResult(type, result) {
    if (!result) return false;
    if (type === STOCK && result.kind === 'ORIGINAL') return true;
    if (![STOCK, QUALITY].includes(type)) return false;
    if (result.kind === 'SUBSTITUTE') return Boolean(text(result.substitute));
    return result.kind === 'REMOVE';
  }
  function decisionSummary(result) {
    if (!result) return '';
    if (result.kind === 'SUBSTITUTE') return `Customer chose substitute: ${result.substitute}.${result.quantity ? ` ${result.quantity} ${result.unit || ''}.` : ''}${result.notes ? ` ${result.notes}` : ''}`;
    if (result.kind === 'REMOVE') return `Customer chose to remove this product.${result.notes ? ` ${result.notes}` : ''}`;
    if (result.kind === 'ORIGINAL') return `Inventory Team found and replenished the product.${result.notes ? ` ${result.notes}` : ''}`;
    return '';
  }
  function itemState(state, orderId, itemId) {
    const issues = itemIssues(state, orderId, itemId);
    const pending = issues.filter(issue => issue.needsReview || issue.status === STATUS.PROCESSING || !validResult(issue.type, issue.result));
    if (pending.length) return { status: 'Awaiting Treatment', ready: false, pending, issues };
    const handledIssue = issues.find(issue => [STOCK, QUALITY].includes(issue.type) && issue.result);
    const decision = handledIssue?.result;
    const expected = decision?.kind === 'REMOVE' ? 'Removed by Agreement' : decision?.kind === 'SUBSTITUTE' ? 'Substitute Picked' : 'Picked';
    const allClosed = issues.every(issue => issue.status === STATUS.CLOSED);
    const ready = state.picking[itemKey(orderId, itemId)] === expected && allClosed;
    return { status: ready ? expected : expected === 'Removed by Agreement' ? 'Awaiting Removal Confirmation' : issues.length ? 'Ready to Pick' : 'Not Started', ready, decision, issues };
  }
  function orderReadiness(state, order) {
    const lines = order.items.map(item => ({ id: item.id, ...itemState(state, order.id, item.id) }));
    const untreated = orderIssues(state, order.id).filter(issue => issue.needsReview || issue.status === STATUS.PROCESSING).length;
    const open = orderIssues(state, order.id).filter(issue => issue.status !== STATUS.CLOSED).length;
    return { lines, remaining: lines.filter(line => !line.ready).length, untreated, open, ready: lines.length > 0 && lines.every(line => line.ready) && open === 0 };
  }

  function migrate(old, at) {
    const state = freshState(old.role === 'Supervisor' || old.role === 'Team' || old.role === 'supervisor' ? 'Supervisor' : 'Picker');
    state.picking = clone(old.picking || {});
    state.completed = Array.isArray(old.completed) ? Object.fromEntries(old.completed.map(id => [String(id), { completedAt: null, legacy: true, issueHistoryComplete: false }])) : clone(old.completed || {});
    for (const [id, value] of Object.entries(state.completed)) {
      if (!value || typeof value !== 'object') state.completed[id] = { completedAt: null, legacy: true, issueHistoryComplete: false, original: value };
      const record = state.completed[id];
      if (!validTime(record.completedAt)) record.completedAt = null;
      if (record.issueHistoryComplete !== true) record.legacy = true;
    }
    state.issues = (old.issues || []).map(source => {
      const originalType = text(source.type || source.issueType);
      const type = normalizeType(originalType);
      const modern = Boolean(source.orderHandling);
      const previous = source.orderHandling?.result;
      const candidate = previous ? { ...clone(previous), notes: previous.notes || previous.basis || '' } : null;
      const acknowledged = modern && ['Awaiting Picker Confirmation', 'Confirmed'].includes(source.orderHandling.status) && !source.needsReview && validResult(type, candidate);
      const orderId = String(source.orderId ?? ''), itemId = String(source.itemId ?? source.orderItemId ?? '');
      const completion = state.completed[orderId];
      const saved = completion?.outcomes?.find(line => line.id === itemId);
      const expected = candidate?.kind === 'REMOVE' ? 'Removed by Agreement' : candidate?.kind === 'SUBSTITUTE' ? 'Substitute Picked' : 'Picked';
      const fulfilled = saved?.status === expected || (expected !== 'Removed by Agreement' && state.picking[itemKey(orderId, itemId)] === expected);
      const status = acknowledged ? fulfilled ? STATUS.CLOSED : STATUS.HANDLED : STATUS.PROCESSING;
      const issue = {
        id: String(source.id || source.issueId || `LEG-${crypto.randomUUID()}`), orderId, itemId,
        productId: String(source.productId ?? source.product ?? ''), productDescription: source.productDescription || source.sapItem?.description || '',
        sapItem: source.sapItem ? clone(source.sapItem) : null, type, description: String(source.description ?? source.notes ?? ''), observations: clone(source.observations || {}),
        team: recommendedTeam(type), status, result: acknowledged ? candidate : null,
        createdAt: source.createdAt || null, handledAt: acknowledged ? source.orderHandling.submittedAt || null : null,
        closedAt: status === STATUS.CLOSED ? source.closedAt || completion?.completedAt || null : null,
        needsReview: Boolean(source.needsReview) || !modern || ![STOCK, QUALITY, PRICE].includes(type) || !itemId,
        legacy: clone(source), events: Array.isArray(source.events) ? clone(source.events) : []
      };
      if (!acknowledged && state.picking[itemKey(orderId, itemId)] !== undefined) {
        issue.legacyPickingStatus = state.picking[itemKey(orderId, itemId)]; delete state.picking[itemKey(orderId, itemId)];
      }
      issue.events.push({ at, role: 'System', action: 'Simplified workflow migration', detail: `Previous status and workflow retained in history. New responsible team: ${issue.team}. No customer agreement inferred.` });
      return issue;
    });
    state.migration = { at, from: old.schemaVersion || 1, note: 'Original records retained. Known valid results reused; incomplete legacy records require Supervisor review.' };
    return state;
  }

  function createStore(storage, now = () => new Date().toISOString()) {
    function parse(key) { const raw = storage.getItem(key); if (raw === null) return null; try { return JSON.parse(raw); } catch { throw new Error('Local data could not be read. Original records have not been overwritten.'); } }
    function write(state) { try { storage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { throw new Error('Your browser could not save this change. Check local storage and free space.'); } }
    function clearCompletedOnce(state) {
      if (state.completedCleanup === '2026-10-16') return state;
      const completedIds = new Set(Object.keys(state.completed));
      state.completed = {};
      state.issues = state.issues.filter(issue => issue.status !== STATUS.CLOSED && !completedIds.has(String(issue.orderId)));
      for (const key of Object.keys(state.picking)) {
        let orderId;
        try { [orderId] = JSON.parse(key); } catch { continue; }
        if (completedIds.has(String(orderId))) delete state.picking[key];
      }
      state.completedCleanup = '2026-10-16';
      write(state);
      return state;
    }
    function clearProcessedOnce(state) {
      if (state.processedDataCleanup === 'retained-active-stock-v1') return false;
      const completedIds = new Set(Object.keys(state.completed || {}));
      state.completed = {};
      state.issues = (state.issues || []).filter(issue => issue.status === STATUS.PROCESSING && !completedIds.has(String(issue.orderId)));
      state.retiredIssues = [];
      for (const key of Object.keys(state.picking || {})) {
        let orderId;
        try { [orderId] = JSON.parse(key); } catch { continue; }
        if (completedIds.has(String(orderId))) delete state.picking[key];
      }
      state.processedDataCleanup = 'retained-active-stock-v1';
      return true;
    }
    function archivePriceIssues(state) {
      if (!Array.isArray(state.retiredIssues)) state.retiredIssues = [];
      const retained = [];
      for (const issue of state.issues) {
        issue.type = normalizeType(issue.type || issue.issueType);
        if (issue.type === PRICE) state.retiredIssues.push({ ...issue, retiredAt: now(), retirementReason: 'Price differences can reflect promotions; this issue type is no longer supported.' });
        else retained.push(issue);
      }
      if (retained.length !== state.issues.length) { state.issues = retained; return true; }
      return false;
    }
    function read() {
      const current = parse(STORAGE_KEY);
      if (current !== null) {
        if (current.schemaVersion !== 4 || !Array.isArray(current.issues) || !current.picking || !current.completed) throw new Error('Unsupported local data format. Records have not been changed.');
        let normalized = false;
        for (const issue of current.issues) {
          const type = normalizeType(issue.type || issue.issueType);
          if (type !== issue.type) { issue.type = type; normalized = true; }
          if (issue.followUp) { delete issue.followUp; normalized = true; }
          const team = recommendedTeam(type);
          if (issue.status !== STATUS.CLOSED && issue.team !== team) { issue.team = team; normalized = true; }
        }
        if (archivePriceIssues(current)) normalized = true;
        if (clearProcessedOnce(current)) normalized = true;
        if (normalized) write(current);
        return clearCompletedOnce(current);
      }
      let old = null;
      for (const key of PREVIOUS_KEYS) { old = parse(key); if (old !== null) break; }
      if (old === null && (storage.getItem('woolworths_issues') !== null || storage.getItem('woolworths_completed_orders') !== null)) {
        const picking = {}, nested = parse('woolworths_picking_progress') || {}, times = parse('woolworths_order_completed_at') || {};
        for (const [orderId, items] of Object.entries(nested)) for (const [id, status] of Object.entries(items)) picking[itemKey(orderId, id)] = status;
        old = { issues: parse('woolworths_issues') || [], picking, completed: Object.fromEntries((parse('woolworths_completed_orders') || []).map(id => [String(id), { completedAt: times[id] || null, legacy: true }])) };
      }
      if (old !== null) {
        if (!Array.isArray(old.issues) || !old.picking || !old.completed) throw new Error('Previous records cannot be migrated safely. They have been retained.');
        const state = migrate(old, now()); archivePriceIssues(state); clearProcessedOnce(state); write(state); return clearCompletedOnce(state);
      }
      const state = freshState(); archivePriceIssues(state); clearProcessedOnce(state); write(state); return clearCompletedOnce(state);
    }
    function change(update) { const state = read(); update(state); write(state); return state; }
    function requireRole(state, role) { if (state.role !== role) throw new Error(`Switch to ${role} to perform this action.`); }
    function issueById(state, id) { const issue = state.issues.find(issue => issue.id === id); if (!issue) throw new Error('This issue is no longer available.'); return issue; }
    function record(state, issue, action, detail) { issue.events.push({ at: now(), role: state.role, action, detail }); }
    function itemRequired(order, id) { if (!order?.items?.some(item => item.id === id) || order.itemsComplete !== true) throw new Error('Load the complete SAP item list before continuing.'); }
    function pendingOrder(state, id) { if (state.completed[id]) throw new Error('This order is already completed.'); }
    function required(value, label) { const result = text(value); if (!result) throw new Error(`${label} is required.`); if (result.length > 1200) throw new Error(`${label} must be 1,200 characters or fewer.`); return result; }
    function closeLine(state, orderId, itemId, outcome) {
      for (const issue of itemIssues(state, orderId, itemId)) if (issue.status === STATUS.HANDLED) { issue.status = STATUS.CLOSED; issue.closedAt = now(); record(state, issue, 'Issue closed by fulfilment', outcome); }
    }
    return {
      read,
      setRole(role) { if (!['Picker', 'Supervisor'].includes(role)) throw new Error('Choose Picker or Supervisor.'); return change(state => { state.role = role; }); },
      report(order, itemId, type, description = '', observations = {}) {
        itemRequired(order, itemId); let id;
        change(state => {
          requireRole(state, 'Picker'); pendingOrder(state, order.id);
          if (![STOCK, QUALITY].includes(type)) throw new Error('Choose stock availability or product quality.');
          if (itemIssues(state, order.id, itemId).some(issue => issue.status !== STATUS.CLOSED)) throw new Error('This order item already has an active issue.');
          if (text(description).length > 1200) throw new Error('Keep the description to 1,200 characters or fewer.');
          const item = order.items.find(item => item.id === itemId); id = `ISS-${crypto.randomUUID()}`;
          const issue = { id, orderId: order.id, itemId, productId: item.productId, productDescription: item.description || '', sapItem: clone(item), type, description: text(description), team: recommendedTeam(type), status: STATUS.PROCESSING, result: null, needsReview: false, reportedBy: 'Picker', createdAt: now(), events: [] };
          record(state, issue, 'Reported and automatically categorised', `${issue.team} · In Progress. Supervisor records the team's result.`);
          state.issues.unshift(issue); delete state.picking[itemKey(order.id, itemId)];
        }); return id;
      },
      saveResult(id, values) {
        return change(state => {
          requireRole(state, 'Supervisor'); const issue = issueById(state, id);
          if (issue.status !== STATUS.PROCESSING) throw new Error('Only an issue In Progress can receive a treatment result.');
          if (issue.needsReview) {
            if (![STOCK, QUALITY].includes(values.type)) throw new Error('Choose a supported issue type.');
            issue.type = values.type; issue.itemId = required(values.itemId || issue.itemId, 'Sales Order Item ID'); issue.team = recommendedTeam(issue.type);
            if (!issue.orderId) throw new Error('The legacy record has no order ID and requires manual recovery.');
          }
          const notes = text(values.notes); if (notes.length > 1200) throw new Error('Keep treatment notes to 1,200 characters or fewer.');
          let result;
          if (![STOCK, QUALITY].includes(issue.type)) throw new Error('This issue type is no longer supported.');
          const allowed = issue.type === STOCK ? ['ORIGINAL', 'SUBSTITUTE', 'REMOVE'] : ['SUBSTITUTE', 'REMOVE'];
          if (!allowed.includes(values.kind)) throw new Error('Choose a valid handling result for this issue.');
          result = { kind: values.kind, notes };
          if (values.kind === 'SUBSTITUTE') result.substitute = required(values.substitute, 'Substitute product');
          issue.result = result; issue.status = STATUS.HANDLED; issue.handledAt = now(); issue.needsReview = false;
          record(state, issue, 'Treatment saved', decisionSummary(result));
        });
      },
      pick(order, itemId, substitute = false) {
        itemRequired(order, itemId);
        return change(state => {
          requireRole(state, 'Picker'); pendingOrder(state, order.id);
          const line = itemState(state, order.id, itemId);
          if (line.pending?.length) throw new Error('This item still has an untreated issue.');
          if (line.decision?.kind === 'REMOVE') throw new Error('Use Confirm Removal; this item must not be marked Picked.');
          if (line.ready) throw new Error('This item already has a final fulfilment outcome.');
          if ((line.decision?.kind === 'SUBSTITUTE') !== substitute) throw new Error('Pick the agreed original or substitute product.');
          const outcome = substitute ? 'Substitute Picked' : 'Picked';
          state.picking[itemKey(order.id, itemId)] = outcome; closeLine(state, order.id, itemId, outcome);
        });
      },
      unpick(order, itemId) {
        itemRequired(order, itemId);
        return change(state => {
          requireRole(state, 'Picker'); pendingOrder(state, order.id);
          const key = itemKey(order.id, itemId);
          const outcome = state.picking[key];
          if (!['Picked', 'Substitute Picked'].includes(outcome)) throw new Error('This item is not currently picked.');
          delete state.picking[key];
          for (const issue of itemIssues(state, order.id, itemId)) {
            if (issue.status === STATUS.CLOSED && issue.result && issue.events?.some(event => event.action === 'Issue closed by fulfilment')) {
              issue.status = STATUS.HANDLED;
              issue.closedAt = null;
              record(state, issue, 'Picking undone', 'Item unchecked. Pick it again to close this issue.');
            }
          }
        });
      },
      confirmRemoval(order, itemId) {
        itemRequired(order, itemId);
        return change(state => {
          requireRole(state, 'Picker'); pendingOrder(state, order.id);
          const line = itemState(state, order.id, itemId);
          if (line.pending?.length || line.decision?.kind !== 'REMOVE') throw new Error('A valid customer-agreed removal must be recorded first.');
          if (line.ready) throw new Error('Removal is already confirmed.');
          state.picking[itemKey(order.id, itemId)] = 'Removed by Agreement'; closeLine(state, order.id, itemId, 'Removed by Agreement');
        });
      },
      complete(order) {
        return change(state => {
          requireRole(state, 'Picker'); pendingOrder(state, order.id);
          if (order.itemsComplete !== true) throw new Error('Load the complete SAP item list before completing this order.');
          const readiness = orderReadiness(state, order);
          if (!readiness.ready) throw new Error(`${readiness.remaining} items remaining · ${readiness.untreated} untreated issues. Pick or confirm removal for every item.`);
          const affected = orderIssues(state, order.id).length > 0;
          state.completed[order.id] = { completedAt: now(), issueHistoryComplete: true, issueFree: !affected, hadIssue: affected, items: clone(order.items), outcomes: readiness.lines.map(line => ({ id: line.id, status: line.status, decision: line.decision || null })) };
        });
      },
      reset() {
        let role = 'Picker'; try { role = read().role; } catch { /* Explicit reset can recover corrupt app-owned data. */ }
        write(freshState(role)); for (const key of LEGACY_KEYS) storage.removeItem(key);
      }
    };
  }
  function dashboardStats(state, at = new Date()) {
    const completed = Object.entries(state.completed);
    const issueFree = ([id, record]) => record.issueHistoryComplete === true && record.issueFree === true && !state.issues.some(issue => issue.orderId === id);
    const freeCount = completed.filter(issueFree).length;
    const unconfirmedOrders = new Set(state.issues.filter(issue => issue.status === STATUS.PROCESSING).map(issue => issue.orderId).filter(Boolean));
    const repeated = new Map();
    for (const issue of state.issues) {
      if (!issue.productId) continue;
      const key = JSON.stringify([issue.productId, issue.type]);
      if (!repeated.has(key)) repeated.set(key, { productId: issue.productId, type: issue.type, total: 0, active: 0 });
      const entry = repeated.get(key); entry.total++; if (overallStatus(issue) !== 'Closed') entry.active++;
    }
    const monthFormat = new Intl.DateTimeFormat('en-NZ', { timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit' });
    function monthKey(date) { const parts = monthFormat.formatToParts(date); return `${parts.find(p => p.type === 'year').value}-${parts.find(p => p.type === 'month').value}`; }
    const currentKey = monthKey(at); const [year, month] = currentKey.split('-').map(Number);
    const previousKey = monthKey(new Date(Date.UTC(year, month - 2, 15)));
    function monthStats(key) {
      const records = completed.filter(([, record]) => validTime(record.completedAt) && monthKey(new Date(record.completedAt)) === key);
      const count = records.filter(issueFree).length;
      return { key, completed: records.length, free: count, rate: records.length ? count / records.length * 100 : null };
    }
    const current = monthStats(currentKey), previous = monthStats(previousKey);
    return { completed: completed.length, pending: state.issues.filter(issue => issue.status !== STATUS.CLOSED).length, processing: state.issues.filter(issue => issue.status === STATUS.PROCESSING).length, awaitingHandling: unconfirmedOrders.size, issueFree: freeCount, rate: completed.length ? freeCount / completed.length * 100 : null, repeated: [...repeated.values()].filter(entry => entry.total > 1).sort((a, b) => b.total - a.total), current, previous, countChange: previous.completed ? current.completed - previous.completed : null, rateChange: previous.rate !== null && current.rate !== null ? current.rate - previous.rate : null, missingTimes: completed.filter(([, record]) => !validTime(record.completedAt)).length, uncertainHistory: completed.filter(([, record]) => record.issueHistoryComplete !== true).length };
  }

  const api = { STORAGE_KEY, PREVIOUS_KEYS, STOCK, QUALITY, STATUS, recommendedTeam, itemKey, freshState, overallStatus, itemState, orderReadiness, createStore, dashboardStats, migrate, decisionSummary };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrderWorkflow = api;
}(typeof window !== 'undefined' ? window : globalThis));
