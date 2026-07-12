(() => {
  const form = document.querySelector('#market-watch-form');
  const status = document.querySelector('#market-watch-status');
  const list = document.querySelector('#market-watch-list');
  const alertStatus = document.querySelector('#market-alert-status');
  const alertList = document.querySelector('#market-alert-list');
  let authenticated = false;

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const money = value => Number.isFinite(Number(value)) ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(value)) : '—';
  const number = value => Number.isFinite(Number(value)) ? new Intl.NumberFormat('en-US').format(Number(value)) : '—';

  function setStatus(text, error = false) {
    if (!status) return;
    status.textContent = text;
    status.style.borderLeftColor = error ? '#b44' : '#d8b56a';
  }

  function setAlertStatus(text, error = false) {
    if (!alertStatus) return;
    alertStatus.textContent = text;
    alertStatus.style.borderLeftColor = error ? '#b44' : '#d8b56a';
  }

  async function request(path, options = {}) {
    const response = await fetch(path, {
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', ...(options.headers || {}) },
      ...options
    });
    let payload = {};
    try { payload = await response.json(); } catch {}
    if (!response.ok) {
      const error = new Error(payload.error || `HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  function renderWatches(items = []) {
    if (!list) return;
    if (!items.length) {
      list.innerHTML = '<article class="card"><p>No saved market watches yet.</p></article>';
      return;
    }
    list.innerHTML = items.map(item => `<article class="card redline watch-item"><div><span class="label">${escapeHtml(item.targetType)} · ${escapeHtml(item.targetKey)}</span><h3>${escapeHtml(item.targetLabel)}</h3><p>Insider: ${item.alertInsiderTransactions ? 'on' : 'off'} · Institutions: ${item.alertInstitutionChanges ? 'on' : 'off'} · New positions: ${item.alertNewPositions ? 'on' : 'off'} · Exits: ${item.alertExits ? 'on' : 'off'}</p><p>Minimum value: ${item.minimumReportedValue == null ? 'none' : money(item.minimumReportedValue)}</p></div><button class="btn alt" data-delete-watch="${escapeHtml(item.id)}">Remove</button></article>`).join('');
    list.querySelectorAll('[data-delete-watch]').forEach(button => button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        await request(`/api/market/watchlists/${encodeURIComponent(button.dataset.deleteWatch)}`, { method: 'DELETE' });
        await load();
      } catch (error) {
        setStatus(error.message, true);
      } finally {
        button.disabled = false;
      }
    }));
  }

  function renderAlerts(items = []) {
    if (!alertList) return;
    if (!items.length) {
      alertList.innerHTML = '<article class="card"><p>No official filing records currently match your saved watches.</p></article>';
      return;
    }
    alertList.innerHTML = items.map(item => `<article class="card alert-card"><span class="label">GRADE ${escapeHtml(item.evidenceGrade || 'A')} · ${escapeHtml(item.kind)} · ${escapeHtml(item.watchLabel)}</span><h3>${escapeHtml(item.subject || 'Tracked subject')} — ${escapeHtml(String(item.action || 'reported activity').replace(/-/g, ' '))}</h3><p><strong>${escapeHtml(item.issuer || 'Reported security')} ${item.ticker ? `(${escapeHtml(item.ticker)})` : ''}</strong></p><div class="alert-meta"><span>Event: ${escapeHtml(item.eventDate || '—')}</span><span>Filed: ${escapeHtml(item.filingDate || '—')}</span><span>Shares: ${number(item.shares || item.currentShares)}</span><span>Reported value: ${money(item.reportedValue)}</span></div><p><strong>Established:</strong> ${escapeHtml(item.established || 'The official filing reports the stated event.')}</p><p><strong>Not established:</strong> ${escapeHtml(item.notEstablished || 'The filing does not establish motive, current ownership or wrongdoing.')}</p>${item.sourceUrl ? `<a class="btn alt" href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noopener noreferrer">Open Official Filing</a>` : ''}</article>`).join('');
  }

  async function loadAlerts() {
    if (!authenticated) return;
    try {
      const payload = await request('/api/market/alerts');
      setAlertStatus(`${payload.alertCount || 0} matching official filing records across ${payload.watchCount || 0} saved watches.`);
      renderAlerts(payload.alerts || []);
    } catch (error) {
      setAlertStatus(error.message, true);
      renderAlerts([]);
    }
  }

  async function load() {
    try {
      const payload = await request('/api/market/watchlists');
      authenticated = true;
      form?.querySelectorAll('input,select,button').forEach(element => { element.disabled = false; });
      setStatus(`Verified member · ${payload.watchlists?.length || 0} saved watches.`);
      renderWatches(payload.watchlists || []);
      await loadAlerts();
    } catch (error) {
      authenticated = false;
      form?.querySelectorAll('input,select,button').forEach(element => { element.disabled = true; });
      if (error.status === 401) {
        setStatus('Member login required to create or view watchlists.', true);
        setAlertStatus('Member login required to load private alerts.', true);
      } else {
        setStatus(error.message, true);
        setAlertStatus(error.message, true);
      }
    }
  }

  form?.addEventListener('submit', async event => {
    event.preventDefault();
    if (!authenticated) return;
    const data = new FormData(form);
    const body = {
      targetType: String(data.get('targetType') || ''),
      targetKey: String(data.get('targetKey') || '').trim(),
      targetLabel: String(data.get('targetLabel') || '').trim(),
      alertInsiderTransactions: data.get('alertInsiderTransactions') === 'on',
      alertInstitutionChanges: data.get('alertInstitutionChanges') === 'on',
      alertNewPositions: data.get('alertNewPositions') === 'on',
      alertExits: data.get('alertExits') === 'on',
      minimumReportedValue: data.get('minimumReportedValue') ? Number(data.get('minimumReportedValue')) : null
    };
    const submit = form.querySelector('button[type=submit]');
    submit.disabled = true;
    try {
      await request('/api/market/watchlists', { method: 'POST', body: JSON.stringify(body) });
      form.reset();
      form.querySelectorAll('input[type=checkbox]').forEach(element => { element.checked = true; });
      setStatus('Watch saved.');
      await load();
    } catch (error) {
      setStatus(error.message, true);
    } finally {
      submit.disabled = false;
    }
  });

  form?.querySelectorAll('input,select,button').forEach(element => { element.disabled = true; });
  load();
})();
