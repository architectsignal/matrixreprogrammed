(() => {
  const $ = id => document.getElementById(id);
  let activeRunId = '';

  const api = async (path, options = {}) => {
    const response = await fetch(path, {
      cache: 'no-store',
      headers: {
        accept: 'application/json',
        ...(options.body ? { 'content-type': 'application/json' } : {})
      },
      ...options,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const text = await response.text();
    let data = {};
    try { data = JSON.parse(text || '{}'); } catch { data = { ok: false, error: text || 'Invalid response' }; }
    if (response.status === 401) {
      location.href = '/member-login.html?return=%2Fadmin-paypal-rehearsal.html';
      throw new Error('Authentication required');
    }
    if (response.status === 403) {
      location.href = '/access-denied.html?required=admin&current=member';
      throw new Error('Administrator access required');
    }
    if (!response.ok || data.ok === false) {
      const error = new Error(data.error || 'Sandbox rehearsal request failed');
      error.data = data;
      throw error;
    }
    return data;
  };

  function status(message, type = '') {
    const node = $('rehearsal-status');
    node.className = `status ${type}`;
    node.textContent = message;
  }

  function renderChecks(container, checks = {}) {
    container.replaceChildren();
    for (const [name, value] of Object.entries(checks)) {
      const row = document.createElement('div');
      row.className = 'check';
      const label = document.createElement('strong');
      label.textContent = name.replace(/([A-Z])/g, ' $1').replace(/^./, value => value.toUpperCase());
      const result = document.createElement('span');
      const numeric = typeof value === 'number';
      const passed = numeric ? value > 0 : Boolean(value);
      result.className = passed ? 'good' : 'danger';
      result.textContent = numeric ? String(value) : passed ? 'PASS' : 'NOT YET';
      row.append(label, result);
      container.append(row);
    }
  }

  function renderReadiness(data) {
    $('rehearsal-environment').textContent = String(data.environment || 'unknown').toUpperCase();
    $('rehearsal-ready').textContent = data.ready ? 'READY' : 'BLOCKED';
    $('rehearsal-ready').className = data.ready ? 'good' : 'danger';
    $('rehearsal-checkout').textContent = data.setting?.checkout_enabled ? 'OPEN' : 'CLOSED';
    $('rehearsal-checkout').className = data.setting?.checkout_enabled ? 'warning' : 'good';
    $('rehearsal-active-run').textContent = data.activeRun?.id || 'None';
    renderChecks($('rehearsal-readiness-checks'), data.checks || {});
    $('rehearsal-start-panel').classList.toggle('hidden', Boolean(data.activeRun));
  }

  function renderActive(data) {
    const run = data.run;
    if (!run || run.status !== 'active') {
      activeRunId = '';
      $('rehearsal-active-panel').classList.add('hidden');
      return;
    }
    activeRunId = run.id;
    $('rehearsal-active-panel').classList.remove('hidden');
    $('run-id').textContent = run.id;
    $('run-target').textContent = run.target_tier;
    $('run-email').textContent = run.test_member_email;
    $('run-expires').textContent = run.expires_at;
    renderChecks($('rehearsal-evidence-checks'), data.checks || {});
    $('rehearsal-evidence-log').textContent = JSON.stringify({
      subscription: data.subscription || null,
      entitlement: data.entitlement || null,
      webhook: data.webhook || null,
      cancellation: data.cancellation || null,
      evidence: data.evidence || []
    }, null, 2);
  }

  function renderHistory(data) {
    const rows = (data.rehearsals || []).map(run => ({
      id: run.id,
      status: run.status,
      tier: run.target_tier,
      email: run.test_member_email,
      startedAt: run.started_at,
      completedAt: run.completed_at,
      entitlementProved: Boolean(run.entitlement_proved),
      webhookProved: Boolean(run.webhook_proved),
      cancellationProved: Boolean(run.cancellation_proved)
    }));
    $('rehearsal-history').textContent = rows.length ? JSON.stringify(rows, null, 2) : 'No rehearsal history yet.';
  }

  async function loadReadiness() {
    const data = await api('/api/paypal/admin/rehearsal/readiness');
    renderReadiness(data);
    if (data.activeRun?.id) await loadStatus(data.activeRun.id);
  }

  async function loadStatus(runId = activeRunId) {
    if (!runId) return;
    const data = await api(`/api/paypal/admin/rehearsal/status?runId=${encodeURIComponent(runId)}`);
    renderActive(data);
  }

  async function loadHistory() {
    renderHistory(await api('/api/paypal/admin/rehearsals'));
  }

  async function load() {
    status('Loading Phase 7 sandbox controls…');
    await Promise.all([loadReadiness(), loadHistory()]);
    status('Sandbox rehearsal controls are current.', 'good');
  }

  $('rehearsal-start-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      status('Opening the timed sandbox rehearsal…', 'warning');
      const result = await api('/api/paypal/admin/rehearsal/start', {
        method: 'POST',
        body: {
          tier: form.get('tier'),
          email: form.get('email'),
          durationMinutes: Number(form.get('durationMinutes')),
          phrase: form.get('phrase')
        }
      });
      activeRunId = result.runId;
      status(`Sandbox checkout opened until ${result.expiresAt}. Live charging remains disabled.`, 'warning');
      await Promise.all([loadReadiness(), loadStatus(result.runId), loadHistory()]);
    } catch (error) {
      status(error.message, 'danger');
      if (error.data?.readiness) renderReadiness(error.data.readiness);
    }
  });

  $('refresh-rehearsal').addEventListener('click', async () => {
    try {
      status('Refreshing verified PayPal, webhook and entitlement evidence…');
      await loadStatus();
      status('Rehearsal evidence refreshed.', 'good');
    } catch (error) {
      status(error.message, 'danger');
    }
  });

  $('complete-rehearsal').addEventListener('click', async () => {
    if (!activeRunId) return;
    try {
      status('Verifying the complete evidence chain and closing checkout…', 'warning');
      const result = await api('/api/paypal/admin/rehearsal/complete', {
        method: 'POST',
        body: {
          runId: activeRunId,
          phrase: 'COMPLETE MATRIX PAYPAL SANDBOX REHEARSAL'
        }
      });
      status(`Rehearsal ${result.status}. Sandbox checkout is closed.`, 'good');
      activeRunId = '';
      await load();
    } catch (error) {
      status(error.message, 'danger');
      if (error.data?.checks) renderChecks($('rehearsal-evidence-checks'), error.data.checks);
    }
  });

  $('abort-rehearsal').addEventListener('click', async () => {
    if (!activeRunId) return;
    const reason = prompt('Why is this rehearsal being aborted?', 'Manual safety closure') || 'Manual safety closure';
    try {
      status('Aborting rehearsal and closing sandbox checkout…', 'warning');
      await api('/api/paypal/admin/rehearsal/abort', {
        method: 'POST',
        body: {
          runId: activeRunId,
          reason,
          phrase: 'ABORT MATRIX PAYPAL SANDBOX REHEARSAL'
        }
      });
      activeRunId = '';
      status('Sandbox rehearsal aborted. Checkout is closed.', 'good');
      await load();
    } catch (error) {
      status(error.message, 'danger');
    }
  });

  load().catch(error => status(error.message, 'danger'));
})();
