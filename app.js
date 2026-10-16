(function () {
  'use strict';
  if (typeof document === 'undefined') { module.exports = require('./workflow.js'); return; }
  // Remove the former frontend credential from this tab after restoring backend access.
  try { sessionStorage.removeItem('ww_sap_session_key'); } catch {}
  const W = window.OrderWorkflow;
  const { STOCK, QUALITY, STATUS: S } = W;
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const page = document.body.dataset.page;
  const query = new URLSearchParams(location.search);
  const orderId = query.get('order');
  const store = W.createStore(localStorage);
  let state = W.freshState();
  let sap = null;
  let order = null;
  let reportingItem = null;
  let focusedIssue = query.get('issue');
  let loading = false;
  let noticeTimer;
  const percent = value => value === null ? '—' : `${value.toFixed(1)}%`;
  const time = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland', dateStyle: 'medium', timeStyle: 'short' }) : 'Not recorded';
  const value = (form, name) => form.querySelector(`[name="${name}"]`)?.value || '';
  const checked = (form, name) => form.querySelector(`[name="${name}"]`)?.checked === true;
  const required = (condition, attribute = 'required') => condition ? attribute : '';
  const orderLink = (id, item = '') => `order-details.html?order=${encodeURIComponent(id)}${item ? `#item-${encodeURIComponent(item)}` : ''}`;

  function notify(message, error = false, href = '') {
    clearTimeout(noticeTimer);
    const node = $('#notification');
    node.innerHTML = `${esc(message)}${href ? ` <a href="${esc(href)}">View Issue →</a>` : ''}`;
    node.className = `notification ${error ? 'error' : 'success'}`;
    node.hidden = false;
    if (!error && !href) noticeTimer = setTimeout(() => { node.hidden = true; }, 6500);
  }
  function badge(status) {
    const style = [S.CLOSED, 'Picked', 'Substitute Picked', 'Removed by Agreement', 'Completed'].includes(status) ? 'closed'
      : [S.HANDLED, 'Ready to Pick', 'Awaiting Removal Confirmation'].includes(status) ? 'resolved'
        : status === S.PROCESSING || status === 'Picking' ? 'progress' : 'neutral';
    return `<span class="badge ${style}"><span class="status-dot" aria-hidden="true"></span>${esc(status)}</span>`;
  }
  function read() {
    try { state = store.read(); return true; } catch (error) { notify(error.message, true); return false; }
  }
  function act(action, message) {
    try { action(); read(); render(); if (message) notify(message); return true; }
    catch (error) { notify(error.message, true); return false; }
  }
  function renderShell() {
    $('#role').value = state.role;
    $('#current-role').textContent = state.role;
    const count = state.issues.filter(issue => W.overallStatus(issue) !== 'Closed').length;
    $('#issue-count').textContent = count; $('#issue-count').hidden = !count;
    const navOrders = $('nav a[href="index.html"]');
    const navDashboard = $('nav a[href="dashboard.html"]');
    navOrders.hidden = false; navDashboard.hidden = state.role !== 'Supervisor';
    $('#issues-nav-label').textContent = state.role === 'Picker' ? 'My Reports' : 'Issues';
    if (state.role === 'Supervisor') navDashboard.parentNode.prepend(navDashboard);
    else navOrders.parentNode.prepend(navOrders);
    const instructions = {
      orders: 'Open an order, pick its items, or report a problem.',
      details: state.role === 'Picker' ? 'Pick each item. Report a stock or quality problem if needed.' : 'Order picking is available in the Picker view.',
      issues: state.role === 'Picker' ? 'Once handled, go to the item and pick it or confirm its removal. The issue closes automatically.' : 'Reports are already In Progress and categorised by team. Record the result in one form.'
    };
    if ($('#role-instruction')) $('#role-instruction').textContent = instructions[page] || '';
    if ($('#issues-title')) $('#issues-title').textContent = state.role === 'Picker' ? 'My Reports' : 'Issues';
  }

  function renderOrders() {
    const filter = $('#order-filter').value;
    const merged = new Map((sap?.orders || []).slice(0, 20).map(item => [item.id, item]));
    // Local history is only added when explicitly viewing completed orders.
    if (filter === 'completed') {
      for (const [id, record] of Object.entries(state.completed)) if (!merged.has(id)) merged.set(id, { id, items: record.items || [], localRecord: true });
    }
    const all = [...merged.values()];
    const search = $('#order-search').value.trim().toLowerCase();
    const shown = all.filter(item => item.id.toLowerCase().includes(search) && (filter === 'all' || Boolean(state.completed[item.id]) === (filter === 'completed')));
    $('#loaded-count').textContent = `${sap?.orders.length || 0} orders · ${Object.keys(state.completed).length} completed`;
    $('#orders-list').innerHTML = shown.length ? shown.map(item => {
      const done = state.completed[item.id];
      const readiness = W.orderReadiness(state, item);
      const picked = readiness.lines.filter(line => ['Picked', 'Substitute Picked'].includes(line.status)).length;
      const status = done ? 'Completed' : readiness.untreated ? 'Awaiting Treatment' : picked ? 'Picking' : 'Not Started';
      return `<article class="order-card"><div class="card-top"><span class="eyebrow">SALES ORDER</span>${badge(status)}</div><h2>#${esc(item.id)}</h2>
        <div class="card-summary"><span>${item.items.length ? `${item.items.length} ${item.localRecord || sap?.complete ? '' : 'loaded '}items` : 'Legacy record'}</span><span>${done ? 'Completed locally' : `${picked} picked`}</span></div>
        ${item.items.length ? `<progress value="${done ? item.items.length : readiness.lines.filter(line => line.ready).length}" max="${item.items.length}" aria-label="Fulfilment progress for order ${esc(item.id)}"></progress>` : '<p class="subtle card-note">Original items will load when opened.</p>'}
        <a class="button secondary full" href="${orderLink(item.id)}">View Details <span aria-hidden="true">→</span></a></article>`;
    }).join('') : `<div class="empty-state"><h2>${loading ? 'Loading orders…' : 'No matching orders'}</h2><p>Try another order ID or switch between All, Pending, and Completed.</p></div>`;
  }

  function renderDecision(result, title = 'Local order handling decision') {
    if (!result) return '';
    return `<div class="local-decision"><strong>${esc(title)}</strong><p>${esc(W.decisionSummary(result))}</p></div>`;
  }
  function receiptPrice(item) {
    const fields = item.sapFields || {};
    const numeric = value => value !== null && value !== undefined && String(value).trim() !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
    const amount = numeric(fields.NetAmount);
    const quantity = numeric(item.quantity);
    const currency = fields.TransactionCurrency;
    const format = value => {
      if (value === null || !currency) return '—';
      try { return new Intl.NumberFormat('en-NZ', { style: 'currency', currency, currencyDisplay: 'narrowSymbol' }).format(value); }
      catch { return '—'; }
    };
    return { amount, currency, unit: format(amount !== null && quantity > 0 ? amount / quantity : null), subtotal: format(amount), format };
  }
  function renderDetails() {
    const panel = $('#order-details');
    panel.hidden = !order;
    if (!order) return;
    const completion = state.completed[order.id];
    const readiness = W.orderReadiness(state, order);
    $('#order-title').textContent = `Order #${order.id}`;
    $('#details-title').textContent = 'Picking list';
    $('#order-issues-link').href = `issues.html?order=${encodeURIComponent(order.id)}`;
    $('#order-issues-link').hidden = !state.issues.some(issue => issue.orderId === order.id);
    $('#details-status').innerHTML = badge(completion ? 'Completed' : readiness.untreated ? 'Awaiting Treatment' : 'Picking');
    $('#details-progress').textContent = `${readiness.remaining} items remaining · ${readiness.untreated} untreated issues`;
    if (!order.itemsComplete) {
      $('#products').innerHTML = `<p class="data-message ${order.loadError ? 'error' : 'loading'}">${esc(order.loadError || 'Loading the complete order item list…')}</p>`;
      $('#complete-order').hidden = true; $('#completion-help').textContent = 'All order items must load before fulfilment can continue.';
      return;
    }
    const savedOutcomes = completion?.outcomes || [];
    const totals = new Map();
    let missingPrices = false;
    for (const item of order.items) {
      const price = receiptPrice(item);
      if (price.amount === null || !price.currency) missingPrices = true;
      else totals.set(price.currency, (totals.get(price.currency) || 0) + price.amount);
    }
    const totalText = [...totals].map(([currency, amount]) => receiptPrice({ sapFields: { NetAmount: amount, TransactionCurrency: currency } }).subtotal).join(' + ');
    $('#products').innerHTML = '<div class="receipt-head" aria-hidden="true"><span>Product</span><span>Quantity</span><span>Unit price</span><span>Subtotal</span><span>Status / Actions</span></div>' + order.items.map(item => {
      const line = W.itemState(state, order.id, item.id);
      const saved = completion ? savedOutcomes.find(outcome => outcome.id === item.id) : null;
      const status = saved?.status || (completion?.legacy ? 'Legacy outcome not recorded' : line.status);
      const quantity = item.quantity === null || item.quantity === undefined ? '—' : `${item.quantity} ${item.unit}`;
      const stockDecision = saved?.decision || line.decision;
      const active = line.issues.find(issue => W.overallStatus(issue) !== 'Closed');
      let actions = '';
      if (!completion && state.role === 'Picker') {
        const sub = stockDecision?.kind === 'SUBSTITUTE';
        const removing = stockDecision?.kind === 'REMOVE';
        if (removing) {
          if (!line.ready) actions += `<button class="button small" data-action="remove-item" data-item="${esc(item.id)}" ${required(Boolean(line.pending?.length), 'disabled')}>Confirm Removal</button>`;
        } else actions += `<label class="pick-checkbox ${line.ready ? 'is-picked' : ''}"><input type="checkbox" data-action="pick" data-item="${esc(item.id)}" data-substitute="${sub}" aria-label="Mark ${esc(item.description || item.productId || 'item')} picked" ${line.ready ? 'checked' : required(Boolean(line.pending?.length), 'disabled')}><span>${line.ready ? `${esc(status)} · click to undo` : sub ? 'Pick substitute' : 'Pick item'}</span></label>`;
        if (!active && !line.ready) actions += `<button class="button secondary small" data-action="report" data-item="${esc(item.id)}">Report Issue</button>`;
      }
      const price = receiptPrice(item);
      return `<article class="product-row receipt-row" id="item-${esc(item.id)}"><div class="product-info"><h3>${esc(item.description || item.productId || '—')}</h3>
        ${renderDecision(stockDecision)}
        ${line.issues.length ? `<a class="issue-link" href="issues.html?issue=${encodeURIComponent((line.pending?.[0] || active || line.issues[0]).id)}">${line.pending?.length ? 'Waiting for treatment' : active ? 'Handled · pick or confirm removal to close' : 'View closed issue'} →</a>` : ''}
        ${completion?.legacy ? '<p class="legacy-notice">Legacy completed order. Historic fulfilment decisions may not be recorded.</p>' : ''}</div>
        <div class="receipt-number"><span class="receipt-mobile-label">Quantity</span><strong>${esc(quantity)}</strong></div>
        <div class="receipt-number"><span class="receipt-mobile-label">Unit price</span>${esc(price.unit)}</div>
        <div class="receipt-number"><span class="receipt-mobile-label">Subtotal</span><strong>${esc(price.subtotal)}</strong></div>
        <div class="receipt-actions"><div class="product-status">${badge(status)}</div><div class="product-actions">${actions}</div></div></article>`;
    }).join('') + `<div class="receipt-total"><span>${missingPrices ? 'Known items total' : 'Order total'}</span><strong>${esc(totalText || '—')}</strong></div>`;
    $('#complete-order').hidden = state.role !== 'Picker';
    $('#complete-order').disabled = Boolean(completion) || !order.items.length;
    $('#complete-order').textContent = completion ? '✓ Order Completed' : 'Complete Order';
    $('#completion-help').textContent = completion ? `Completed ${time(completion.completedAt)}.${completion.legacy ? ' Historic item details are incomplete.' : ''}` : `${readiness.remaining} items remaining · ${readiness.untreated} untreated issues.`;
  }

  function treatmentForm(issue) {
    const result = issue.result || {};
    const type = [STOCK, QUALITY].includes(issue.type) ? issue.type : '';
    const kind = result.kind || (type === QUALITY ? 'SUBSTITUTE' : 'ORIGINAL');
    return `<form class="treatment-form" data-issue="${esc(issue.id)}"><input name="type" type="hidden" value="${esc(type)}"><input name="itemId" type="hidden" value="${esc(issue.itemId)}">
      <div class="stock-treatment"><label>Handling result<select name="kind" required>${(type === QUALITY ? [['SUBSTITUTE','Customer chose a substitute product'],['REMOVE','Customer chose to remove the product']] : [['ORIGINAL','Inventory Team found and replenished the product'],['SUBSTITUTE','Customer chose a substitute product'],['REMOVE','Customer chose to remove the product']]).map(([key,label])=>`<option value="${key}" ${kind===key?'selected':''}>${label}</option>`).join('')}</select></label><div class="substitute-fields" ${kind!=='SUBSTITUTE'?'hidden':''}><label>Substitute product name or ID<input name="substitute" value="${esc(result.substitute)}" ${required(kind==='SUBSTITUTE')}></label></div></div>
<label class="result-notes-label">Handling notes (optional)<textarea name="notes" rows="2" maxlength="1200" placeholder="Optional">${esc(result.notes)}</textarea></label><button class="button small" type="submit">Save as Handled</button></form>`;
  }
  function issueActions(issue) {
    if (state.role === 'Supervisor') {
      if (issue.status === S.PROCESSING) return treatmentForm(issue);
      return `<p class="action-hint">${issue.status === S.HANDLED ? 'Waiting for Picker to complete this item.' : 'This issue is closed.'}</p>`;
    }
    if (issue.status === S.PROCESSING) return `<p class="action-hint">Waiting for a result from ${esc(issue.team)}. Supervisor records the handling on behalf of the team.</p>`;
    return `<p class="action-hint">${issue.status===S.HANDLED ? issue.result?.kind==='REMOVE'?'Ready: confirm removal at the order item to close this issue.':'Ready: pick the original or agreed substitute item to close this issue.' : 'Closed through picking or confirmed removal.'}</p><a class="button small" href="${orderLink(issue.orderId,issue.itemId)}">Go to Order Item →</a>`;
  }
  function renderIssues() {
    const scope = state.issues.filter(issue => !orderId || issue.orderId===orderId);
    const filter = $('#issue-filter').value, search = $('#issue-search').value.trim().toLowerCase();
    const shown = scope.filter(issue => (filter==='all'||filter==='active'&&issue.status!==S.CLOSED||filter==='processing'&&issue.status===S.PROCESSING||filter==='handled'&&issue.status===S.HANDLED||filter==='closed'&&issue.status===S.CLOSED) && [issue.id,issue.orderId,issue.productId,issue.productDescription,issue.type].some(data=>String(data||'').toLowerCase().includes(search)));
    $('#issues-summary').innerHTML = `${orderId?`Order #${esc(orderId)} · <a href="issues.html">All Issues</a> · `:''}${scope.filter(issue=>issue.status!==S.CLOSED).length} pending issues`;
    $('#issues-list').innerHTML = shown.length ? shown.map(issue=>`<article class="issue-card simple-issue ${issue.id===focusedIssue?'highlighted':''}" id="${esc(issue.id)}" tabindex="-1"><div class="card-top"><span class="type-label">${esc(issue.type)}</span>${badge(issue.status)}</div><h2>${esc(issue.productDescription||issue.productId||'Product details unavailable')}</h2><p class="issue-context">Order #${esc(issue.orderId)} · Product ${esc(issue.productId||'not recorded')} · Item ${esc(issue.itemId||'to check')}</p>${issue.description?`<p class="issue-description">${esc(issue.description)}</p>`:''}${renderDecision(issue.result,'Treatment result')}
      <div class="simple-treatment">${issueActions(issue)}</div><div class="issue-footer"><span>Reported by ${esc(issue.reportedBy || issue.events?.find(entry => entry.role === 'Picker' && /report/i.test(entry.action))?.role || 'Not recorded')}</span><a href="${orderLink(issue.orderId,issue.itemId)}">View Order & Item →</a></div></article>`).join('') : '<div class="empty-state"><h2>No matching issues</h2><p>Try another status or search.</p></div>';
  }

  function renderDashboard() {
    const stats = W.dashboardStats(state);
    $('#completed-kpi').textContent = stats.completed;
    $('#pending-kpi').textContent = stats.pending;
    $('#issue-free-rate').textContent = percent(stats.rate);
    const monthLabel = key => new Date(`${key}-15T12:00:00Z`).toLocaleDateString('en-NZ', { timeZone: 'Pacific/Auckland', month: 'long', year: 'numeric' });
    $('#this-month-label').textContent = monthLabel(stats.current.key);
    $('#last-month-label').textContent = monthLabel(stats.previous.key);
    $('#this-month-completed').textContent = stats.current.completed;
    $('#this-month-rate').textContent = percent(stats.current.rate);
    $('#last-month-completed').textContent = stats.previous.completed ? stats.previous.completed : 'No previous-month data';
    $('#last-month-rate').textContent = stats.previous.completed ? percent(stats.previous.rate) : 'No previous-month data';
    const delta = (number, suffix) => number === null ? '' : `${number > 0 ? '↑ +' : number < 0 ? '↓ ' : ''}${suffix === 'pp' ? number.toFixed(1) : number} ${suffix}`;
    $('#completed-change').textContent = delta(stats.countChange, 'orders');
    $('#rate-change').textContent = delta(stats.rateChange, 'pp');
    $('#monthly-limitations').textContent = [stats.missingTimes ? `${stats.missingTimes} legacy completion records have no valid completion time and are excluded from monthly comparisons.` : '', stats.uncertainHistory ? `${stats.uncertainHistory} legacy completions have incomplete issue history; they are not counted as issue-free.` : ''].filter(Boolean).join(' ');
    $('#monthly-comparison').hidden = state.role !== 'Supervisor';
    $('#overview-body').innerHTML = [S.PROCESSING, S.HANDLED, S.CLOSED].map(status => `<div class="overview-row">${badge(status)}<span>${state.issues.filter(issue => W.overallStatus(issue) === status).length}</span></div>`).join('');
  }
  function render() { renderShell(); if (page === 'orders') renderOrders(); if (page === 'details') renderDetails(); if (page === 'issues') renderIssues(); if (page === 'dashboard') renderDashboard(); }

  function refreshButtons(busy) { document.querySelectorAll('[data-action="refresh"]').forEach(button => { button.disabled = busy; button.textContent = busy ? 'Loading…' : '↻ Refresh'; }); }
  async function loadSap(fresh = false) {
    if (loading) return;
    loading = true; refreshButtons(true);
    const message = $('#sap-message'); message.hidden = false; message.className = 'data-message loading'; message.textContent = 'Loading orders…';
    try {
      const response = await fetch(`/api/orders${fresh ? '?refresh=1' : ''}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load orders.');
      sap = data; message.hidden = true;
      if (fresh) notify('Data refreshed.');
    } catch (error) {
      sap = null; message.className = 'data-message error'; message.textContent = error.message || 'Order data could not be loaded. Try Refresh. Local records remain available.';
    } finally { loading = false; refreshButtons(false); render(); }
  }
  async function loadOrder() {
    if (!orderId) { $('#sap-message').hidden = false; $('#sap-message').textContent = 'Choose an order from Orders.'; return; }
    const completion = state.completed[orderId];
    order = { id: orderId, items: [], itemsComplete: false }; refreshButtons(true); renderDetails();
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load order items.');
      if (completion?.items) {
        order = { id: orderId, items: completion.items, itemsComplete: true };
        $('#sap-message').hidden = true;
      } else { order = { ...data.order, itemsComplete: data.complete }; }
      if (!order.itemsComplete) order.loadError = 'Some order items could not be loaded. Try Refresh before continuing.';
    } catch {
      if (completion?.items) {
        order = { id: orderId, items: completion.items, itemsComplete: true };
        $('#sap-message').hidden = true;
      } else order.loadError = completion?.legacy ? 'Legacy completion preserved. Original item details are unavailable; try Refresh later.' : 'Order items could not be loaded. Try Refresh.';
    } finally { refreshButtons(false); renderDetails(); if (location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView({ block: 'center' }); }
  }

  function updateReportType() {
    const type = $('#issue-type').value;
    $('#issue-type-help').textContent = type === QUALITY ? 'For damaged, expired, spoiled or otherwise unsafe products.' : 'For an empty shelf or too few items to complete the order.';
    $('#auto-route-note').textContent = `Automatically categorised for ${W.recommendedTeam(type)} · In Progress.`;
  }
  function openReport(id) {
    reportingItem = order?.items.find(item => item.id === id); if (!reportingItem) return;
    $('#report-form').reset(); $('#report-order').value = order.id; $('#report-order-item').value = reportingItem.id;
    $('#report-product').value = reportingItem.productId || ''; $('#report-description').value = reportingItem.description || '';
    $('#report-error').hidden = true; updateReportType(); $('#report-dialog').showModal();
  }
  function focusIssue(id) {
    focusedIssue = id; $('#issue-filter').value = state.issues.find(issue => issue.id === id)?.status === S.CLOSED ? 'closed' : 'active'; $('#issue-search').value = ''; renderIssues();
    const card = document.getElementById(id); card?.scrollIntoView({ block: 'center', behavior: 'smooth' }); card?.focus({ preventScroll: true });
  }
  function formError(form, message) {
    let node = form.querySelector('.form-error');
    if (!node) { node = document.createElement('p'); node.className = 'form-error'; node.setAttribute('role', 'alert'); form.append(node); }
    node.textContent = message;
  }
  $('#role')?.addEventListener('change', event => {
    const role = event.target.value;
    if (!act(() => store.setRole(role), `Viewing as ${role}.`)) return;
    if (role === 'Supervisor' && page !== 'issues' && page !== 'dashboard') location.assign('dashboard.html');
    else if (role === 'Picker' && page === 'dashboard') location.assign('index.html');
  });
  $('#reset-demo')?.addEventListener('click', () => $('#reset-dialog')?.showModal());
  $('#reset-confirm')?.addEventListener('click', () => { if (act(() => store.reset(), 'Local prototype records reset. SAP data and configuration were not changed.')) $('#reset-dialog').close(); });
  $('#order-search')?.addEventListener('input', renderOrders); $('#order-filter')?.addEventListener('change', renderOrders);
  $('#issue-search')?.addEventListener('input', renderIssues); $('#issue-filter')?.addEventListener('change', renderIssues);
  $('#issue-type')?.addEventListener('change', updateReportType);
  document.addEventListener('change', event => {
    const form = event.target.closest('form'); if (!form) return;
    if (!form.matches('.treatment-form') || event.target.name !== 'kind') return;
    const kind=value(form,'kind');
    form.querySelector('.substitute-fields').hidden=kind!=='SUBSTITUTE';
    form.querySelector('[name="substitute"]').required=kind==='SUBSTITUTE';
  });
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-action]'); if (!button || button.disabled) return;
    const { action, issue, item } = button.dataset;
    if (action === 'refresh') page === 'details' ? loadOrder() : loadSap(true);
    else if (action === 'cancel-dialog') button.closest('dialog').close();
    else if (action === 'report') openReport(item);
    else if (action === 'remove-item') act(() => store.confirmRemoval(order,item), 'Removal confirmed and issue closed. This item was not marked Picked.');
    else if (action === 'complete') {
      if (act(() => store.complete(order))) location.assign(`index.html?completed=${encodeURIComponent(order.id)}`);
    }
  });
  document.addEventListener('change', event => {
    const checkbox = event.target.closest('input[type="checkbox"][data-action="pick"]');
    if (!checkbox) return;
    const item = checkbox.dataset.item;
    if (checkbox.checked) act(() => store.pick(order, item, checkbox.dataset.substitute === 'true'), 'Item picked. Any handled issue for this item is now closed.');
    else act(() => store.unpick(order, item), 'Pick undone. You can pick this item again.');
  });
  $('#report-form')?.addEventListener('submit', event => {
    event.preventDefault();
    try {
      const id = store.report(order, reportingItem.id, $('#issue-type').value, $('#issue-description').value);
      read(); render(); $('#report-dialog').close();
      notify('Issue is In Progress. Supervisor can record the responsible team’s result.', false, `issues.html?issue=${encodeURIComponent(id)}`);
    } catch (error) { $('#report-error').textContent = error.message; $('#report-error').hidden = false; }
  });
  $('#issues-list')?.addEventListener('submit', event => {
    const form = event.target; if (!form.matches('form')) return; event.preventDefault();
    const id = form.dataset.issue;
    try {
      if (form.matches('.treatment-form')) store.saveResult(id,{type:value(form,'type'),itemId:value(form,'itemId'),kind:value(form,'kind'),notes:value(form,'notes'),substitute:value(form,'substitute')});
      else return;
      read(); render(); focusIssue(id); notify('Record saved. The next available action is shown on the issue.');
    } catch (error) { formError(form, error.message); }
  });
  window.addEventListener('storage', event => { if ([W.STORAGE_KEY, ...W.PREVIOUS_KEYS, null].includes(event.key) && read()) render(); });
  window.addEventListener('pageshow', event => { if (event.persisted && read()) render(); });
  if (read()) {
    if (page === 'issues' && focusedIssue) $('#issue-filter').value = state.issues.find(issue => issue.id === focusedIssue)?.status === S.CLOSED ? 'closed' : 'active';
    render();
  }
  if (page === 'orders' || page === 'dashboard') loadSap();
  if (page === 'details') loadOrder();
  if (page === 'issues' && focusedIssue) document.getElementById(focusedIssue)?.scrollIntoView({ block: 'center' });
  if (page === 'orders') {
    if (orderId) location.replace(orderLink(orderId));
    const completed = query.get('completed'); if (completed && state.completed[completed]) notify(`Order #${completed} completed. It remains available in Completed.`);
  }
}());
