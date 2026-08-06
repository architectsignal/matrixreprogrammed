(() => {
  'use strict';

  const API = '/api/bespoke';
  const state = { authenticated: false, services: [], cases: [], paymentsEnabled: false };
  const $ = selector => document.querySelector(selector);
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
  const formatDate = value => {
    if (!value) return 'Not set';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? escapeHtml(value) : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  };
  const formatStatus = value => String(value || 'unknown').replace(/_/g, ' ');
  const setStatus = (element, message, tone = '') => {
    if (!element) return;
    element.textContent = message || '';
    element.className = `bespoke-status${tone ? ` ${tone}` : ''}`;
  };
  const setBusy = (button, busy, label = 'Working…') => {
    if (!button) return;
    if (busy) {
      button.dataset.originalLabel = button.textContent;
      button.textContent = label;
      button.disabled = true;
    } else {
      button.textContent = button.dataset.originalLabel || button.textContent;
      button.disabled = false;
    }
  };
  async function request(path, options = {}) {
    const response = await fetch(`${API}${path}`, {
      credentials: 'same-origin',
      cache: 'no-store',
      ...options,
      headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) }
    });
    let payload = {};
    try { payload = await response.json(); } catch {}
    if (!response.ok) {
      const error = new Error(payload.error || `Request failed with HTTP ${response.status}`);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  function renderServices() {
    const grid = $('#service-grid');
    const select = $('#service-key');
    if (!grid || !select) return;
    if (!state.services.length) {
      grid.innerHTML = '<article class="service-card"><h3>Service configuration unavailable</h3><p>The commissioning system is currently closed. No payment can be created.</p></article>';
      return;
    }
    select.innerHTML = '<option value="">Choose a level</option>' + state.services.map(service => `<option value="${escapeHtml(service.key)}">${escapeHtml(service.name)} — from €${escapeHtml(service.startingAmount)}</option>`).join('');
    grid.innerHTML = state.services.map((service, index) => `
      <article class="service-card${index === 1 ? ' featured' : ''}" data-service="${escapeHtml(service.key)}">
        <span class="service-code">FILE DEPTH ${String(index + 1).padStart(2, '0')}</span>
        <h3>${escapeHtml(service.name)}</h3>
        <p class="service-strapline">${escapeHtml(service.strapline)}</p>
        <p class="service-price">€${escapeHtml(service.startingAmount)} <small>starting quote</small></p>
        <div class="service-meta"><span>${escapeHtml(service.turnaround)}</span><span>${escapeHtml(service.sourceDepth)}</span></div>
        <ul>${(service.deliverables || []).map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
        <button class="btn alt" type="button" data-select-service="${escapeHtml(service.key)}">Select ${escapeHtml(service.name)}</button>
      </article>
    `).join('');
    grid.querySelectorAll('[data-select-service]').forEach(button => button.addEventListener('click', () => {
      select.value = button.dataset.selectService || '';
      $('#scope-request')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      select.focus({ preventScroll: true });
    }));
  }

  async function loadConfig() {
    try {
      const payload = await request('/config');
      state.services = Array.isArray(payload.services) ? payload.services : [];
      state.paymentsEnabled = payload.payments?.paymentEnabled === true;
      renderServices();
    } catch (error) {
      renderServices();
      setStatus($('#intake-status'), error.message, 'danger');
    }
  }

  async function loadAuth() {
    const authState = $('#auth-state');
    try {
      const response = await fetch('/api/member/me', { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.authenticated) throw new Error('not-authenticated');
      state.authenticated = true;
      setStatus(authState, `Secure session active for ${payload.member?.displayName || payload.member?.email || 'member'}.`, 'good');
      return true;
    } catch {
      state.authenticated = false;
      if (authState) authState.innerHTML = 'A verified Free Member account is required. <a href="member-login.html?return=%2Fbespoke-investigations.html">Log in or create an account</a>.';
      authState?.classList.add('warning');
      return false;
    }
  }

  function declarationPayload(form) {
    return {
      lawfulPurpose: form.elements.lawfulPurposeDeclaration?.checked === true,
      publicRecordsOnly: form.elements.publicRecordsOnly?.checked === true,
      noHarassment: form.elements.noHarassment?.checked === true,
      noUnlawfulAccess: form.elements.noUnlawfulAccess?.checked === true,
      noGuaranteedConclusion: form.elements.noGuaranteedConclusion?.checked === true,
      accurateInformation: form.elements.accurateInformation?.checked === true,
      termsAccepted: form.elements.termsAccepted?.checked === true
    };
  }

  async function submitIntake(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = $('#submit-scope');
    const status = $('#intake-status');
    if (!state.authenticated) {
      setStatus(status, 'Log in to a verified member account before submitting a scope request.', 'warning');
      return;
    }
    if (!form.reportValidity()) return;
    const payload = {
      serviceKey: form.elements.serviceKey.value,
      subjectType: form.elements.subjectType.value,
      subjectLabel: form.elements.subjectLabel.value,
      objective: form.elements.objective.value,
      lawfulPurpose: form.elements.lawfulPurpose.value,
      jurisdiction: form.elements.jurisdiction.value,
      deadlineAt: form.elements.deadlineAt.value,
      declarations: declarationPayload(form)
    };
    setBusy(button, true, 'Submitting securely…');
    setStatus(status, 'Recording the request for screening…');
    try {
      const result = await request('/intake', { method: 'POST', body: JSON.stringify(payload) });
      setStatus(status, `${result.message} Case reference: ${result.caseId}`, 'good');
      form.reset();
      await loadCases();
      $('#case-workspace')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      const flags = Array.isArray(error.payload?.prohibitedFlags) ? ` (${error.payload.prohibitedFlags.join(', ')})` : '';
      setStatus(status, `${error.message}${flags}`, 'danger');
    } finally {
      setBusy(button, false);
    }
  }

  function caseAction(caseItem) {
    if (caseItem.status === 'approved_for_payment' || caseItem.status === 'payment_pending') {
      const paymentLabel = caseItem.quotedAmount ? `Pay verified quote · €${escapeHtml(caseItem.quotedAmount)}` : 'Open payment';
      return `<button class="btn" type="button" data-pay-case="${escapeHtml(caseItem.id)}">${paymentLabel}</button>`;
    }
    if (caseItem.status === 'needs_information') return '<a class="btn alt" href="contact-the-machine.html">Send requested information</a>';
    if (caseItem.status === 'delivered') return '<a class="btn alt" href="member-dashboard.html#downloads">Open delivery workspace</a>';
    return '';
  }

  function renderCases() {
    const container = $('#case-list');
    if (!container) return;
    if (!state.authenticated) {
      container.innerHTML = '<article class="case-empty"><p>Log in to view submitted scope requests, approved quotes and delivery status.</p></article>';
      return;
    }
    if (!state.cases.length) {
      container.innerHTML = '<article class="case-empty"><p>No commissions have been submitted from this account.</p><a class="btn alt" href="#scope-request">Open your first scope request</a></article>';
      return;
    }
    container.innerHTML = state.cases.map(caseItem => `
      <article class="case-card" data-case-id="${escapeHtml(caseItem.id)}">
        <div class="case-top"><span class="service-code">${escapeHtml(caseItem.serviceName)}</span><span class="case-status-pill">${escapeHtml(formatStatus(caseItem.status))}</span></div>
        <h3>${escapeHtml(caseItem.subjectLabel)}</h3>
        <p>${caseItem.scopeSummary ? escapeHtml(caseItem.scopeSummary) : 'Scope screening is in progress. No payment has been requested.'}</p>
        <div class="case-meta">
          <div><span>Case reference</span><strong>${escapeHtml(caseItem.id)}</strong></div>
          <div><span>Quote</span><strong>${caseItem.quotedAmount ? `€${escapeHtml(caseItem.quotedAmount)}` : 'Pending scope'}</strong></div>
          <div><span>Submitted</span><strong>${formatDate(caseItem.createdAt)}</strong></div>
          <div><span>Delivery target</span><strong>${formatDate(caseItem.deliveryDueAt)}</strong></div>
        </div>
        <div class="case-actions">${caseAction(caseItem)}<button class="btn alt" type="button" data-read-case="${escapeHtml(caseItem.id)}">View audit trail</button></div>
        <div class="case-detail" data-case-detail hidden></div>
      </article>
    `).join('');
    container.querySelectorAll('[data-pay-case]').forEach(button => button.addEventListener('click', () => startPayment(button.dataset.payCase, button)));
    container.querySelectorAll('[data-read-case]').forEach(button => button.addEventListener('click', () => showCase(button.dataset.readCase, button)));
  }

  async function loadCases() {
    if (!state.authenticated) { state.cases = []; renderCases(); return; }
    try {
      const payload = await request('/cases');
      state.cases = Array.isArray(payload.cases) ? payload.cases : [];
      renderCases();
    } catch (error) {
      if (error.status === 401) state.authenticated = false;
      state.cases = [];
      renderCases();
      setStatus($('#payment-return-status'), error.message, 'danger');
    }
  }

  async function showCase(caseId, button) {
    const card = button.closest('.case-card');
    const detail = card?.querySelector('[data-case-detail]');
    if (!detail) return;
    if (!detail.hidden) { detail.hidden = true; button.textContent = 'View audit trail'; return; }
    setBusy(button, true, 'Loading…');
    try {
      const payload = await request(`/case/${encodeURIComponent(caseId)}`);
      const history = Array.isArray(payload.history) ? payload.history : [];
      const deliverables = Array.isArray(payload.case?.deliverables) ? payload.case.deliverables : [];
      detail.innerHTML = `
        <div class="case-meta"><div><span>Screening</span><strong>${escapeHtml(formatStatus(payload.case?.screeningStatus))}</strong></div><div><span>Paid</span><strong>${payload.case?.paidAt ? formatDate(payload.case.paidAt) : 'No'}</strong></div></div>
        ${deliverables.length ? `<p><strong>Agreed deliverables</strong></p><ul>${deliverables.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}
        <p><strong>Status history</strong></p>
        <ol>${history.map(item => `<li><strong>${escapeHtml(formatStatus(item.to_status))}</strong> · ${formatDate(item.created_at)}${item.note ? ` — ${escapeHtml(item.note)}` : ''}</li>`).join('') || '<li>No history available.</li>'}</ol>
      `;
      detail.hidden = false;
      button.textContent = 'Hide audit trail';
    } catch (error) {
      setStatus($('#payment-return-status'), error.message, 'danger');
    } finally {
      setBusy(button, false);
    }
  }

  async function startPayment(caseId, button) {
    if (!state.paymentsEnabled) {
      setStatus($('#payment-return-status'), 'PayPal checkout is deliberately disabled until its activation and rehearsal gates pass.', 'warning');
      return;
    }
    setBusy(button, true, 'Opening PayPal…');
    try {
      const result = await request(`/case/${encodeURIComponent(caseId)}/order`, { method: 'POST', body: '{}' });
      sessionStorage.setItem('matrix-bespoke-order', JSON.stringify({ caseId, orderId: result.orderId, createdAt: new Date().toISOString() }));
      window.location.assign(result.approveUrl);
    } catch (error) {
      setStatus($('#payment-return-status'), error.message, 'danger');
      setBusy(button, false);
    }
  }

  async function captureReturnPayment() {
    const parameters = new URLSearchParams(window.location.search);
    if (parameters.get('payment') !== 'approved') {
      if (parameters.get('payment') === 'cancelled') setStatus($('#payment-return-status'), 'Payment was cancelled. The approved quote remains unpaid.', 'warning');
      return;
    }
    const caseId = parameters.get('case') || '';
    const orderId = parameters.get('token') || '';
    if (!caseId || !orderId) {
      setStatus($('#payment-return-status'), 'PayPal returned without a complete case and order reference. No payment status was changed.', 'danger');
      return;
    }
    setStatus($('#payment-return-status'), 'Verifying the PayPal capture against the approved case quote…', 'warning');
    try {
      const result = await request(`/case/${encodeURIComponent(caseId)}/capture`, { method: 'POST', body: JSON.stringify({ orderId }) });
      setStatus($('#payment-return-status'), `Payment verified. Case ${result.caseId} is now marked paid.`, 'good');
      sessionStorage.removeItem('matrix-bespoke-order');
      const cleanUrl = new URL(window.location.href);
      cleanUrl.search = '';
      history.replaceState({}, '', cleanUrl.toString());
      await loadCases();
    } catch (error) {
      setStatus($('#payment-return-status'), error.message, 'danger');
    }
  }

  async function initialise() {
    $('#bespoke-intake-form')?.addEventListener('submit', submitIntake);
    $('#refresh-cases')?.addEventListener('click', async event => {
      setBusy(event.currentTarget, true, 'Refreshing…');
      await loadCases();
      setBusy(event.currentTarget, false);
    });
    await Promise.all([loadConfig(), loadAuth()]);
    await captureReturnPayment();
    await loadCases();
  }

  initialise();
})();
