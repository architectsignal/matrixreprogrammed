(() => {
  const authState = document.querySelector('[data-auth-state]');
  const runnerState = document.querySelector('[data-runner-state]');
  const adminCard = document.querySelector('[data-admin-tool]');
  const jobsBody = document.querySelector('[data-jobs-body]');
  const forms = [...document.querySelectorAll('[data-tool-form]')];
  const activePolls = new Map();
  let config = null;

  const style = document.createElement('style');
  style.textContent = `
    .email-intel-report{display:grid;gap:1rem;color:#f3e6bd}.email-intel-head{display:flex;gap:1rem;justify-content:space-between;align-items:flex-start;flex-wrap:wrap}.email-intel-head h3{margin:.1rem 0}.email-intel-badge{display:inline-flex;align-items:center;border:1px solid rgba(216,181,106,.45);border-radius:999px;padding:.35rem .7rem;font-size:.78rem;font-weight:800;text-transform:uppercase;letter-spacing:.05em}.email-intel-badge[data-risk=low]{border-color:#4f9f70;color:#a8e7bd}.email-intel-badge[data-risk=moderate]{border-color:#d2a74e;color:#f1d28d}.email-intel-badge[data-risk=high],.email-intel-badge[data-risk=critical]{border-color:#c75d55;color:#ffafa7}.email-intel-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:.7rem}.email-intel-stat{padding:.85rem;border:1px solid rgba(216,181,106,.22);border-radius:12px;background:rgba(216,181,106,.055)}.email-intel-stat strong{display:block;font-size:1.5rem;color:#d8b56a}.email-intel-stat span{font-size:.8rem;color:#c8bb95}.email-intel-section{border-top:1px solid rgba(216,181,106,.18);padding-top:.85rem}.email-intel-section h4{margin:0 0 .55rem}.email-intel-list{display:grid;gap:.5rem;margin:0;padding:0;list-style:none}.email-intel-item{display:grid;grid-template-columns:minmax(105px,180px) 1fr;gap:.7rem;padding:.65rem .75rem;border:1px solid rgba(216,181,106,.16);border-radius:10px;background:rgba(0,0,0,.24)}.email-intel-item strong{overflow-wrap:anywhere}.email-intel-item span{color:#c8bb95}.email-intel-actions{margin:.3rem 0 0;padding-left:1.15rem}.email-intel-actions li{margin:.35rem 0}.email-intel-note{padding:.75rem;border-left:3px solid #d8b56a;background:rgba(216,181,106,.07);color:#d8cfb1}.email-intel-details{border:1px solid rgba(216,181,106,.18);border-radius:10px;padding:.7rem}.email-intel-details summary{cursor:pointer;font-weight:800}.email-intel-details pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:420px;overflow:auto;font-size:.76rem}.email-intel-empty{color:#c8bb95;font-style:italic}@media(max-width:560px){.email-intel-item{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);

  function setText(node, text, state = '') {
    if (!node) return;
    node.textContent = text;
    if (state) node.dataset.state = state;
  }

  function setFormEnabled(form, enabled) {
    [...form.elements].forEach((element) => { element.disabled = !enabled; });
  }

  function outputFor(tool) { return document.querySelector(`[data-tool-output="${tool}"]`); }
  function formatDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toLocaleString() : String(value);
  }
  function array(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
  function object(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
  function titleCase(value) { return String(value || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); }
  function node(tag, text = '', className = '') {
    const el = document.createElement(tag);
    if (text !== '') el.textContent = String(text);
    if (className) el.className = className;
    return el;
  }
  function append(parent, ...children) { children.filter(Boolean).forEach(child => parent.appendChild(child)); return parent; }
  function stat(label, value) {
    const box = node('div', '', 'email-intel-stat');
    append(box, node('strong', value), node('span', label));
    return box;
  }
  function section(title, content) {
    const wrap = node('section', '', 'email-intel-section');
    append(wrap, node('h4', title), content);
    return wrap;
  }
  function itemList(items, explanation) {
    const list = node('ul', '', 'email-intel-list');
    if (!items.length) {
      list.appendChild(node('li', 'None reported.', 'email-intel-empty'));
      return list;
    }
    items.forEach((item) => {
      const name = typeof item === 'string' ? item : item.service || item.name || item.label || 'Signal';
      const detail = typeof item === 'string' ? explanation : item.explanation || item.detail || explanation;
      const row = node('li', '', 'email-intel-item');
      append(row, node('strong', name), node('span', detail));
      list.appendChild(row);
    });
    return list;
  }
  function actionList(actions) {
    const list = node('ol', '', 'email-intel-actions');
    (actions.length ? actions : ['Verify important signals directly with the provider before drawing a conclusion.']).forEach(action => list.appendChild(node('li', action)));
    return list;
  }
  function technicalDetails(result) {
    const details = node('details', '', 'email-intel-details');
    append(details, node('summary', 'Sanitised technical data'), node('pre', JSON.stringify(result || {}, null, 2)));
    return details;
  }
  function reportShell(job, title, riskLevel, riskText) {
    const report = node('div', '', 'email-intel-report');
    const head = node('div', '', 'email-intel-head');
    const heading = node('div');
    append(heading, node('div', `Completed · ${formatDate(job.completedAt || job.createdAt)}`, 'eyebrow'), node('h3', title), node('p', riskText || job.summary || 'Sanitised report completed.'));
    const badge = node('span', `${riskLevel || 'informational'} risk`, 'email-intel-badge');
    badge.dataset.risk = String(riskLevel || 'informational').toLowerCase();
    append(head, heading, badge);
    report.appendChild(head);
    return report;
  }

  function renderHolehe(job) {
    const result = object(job.result);
    const possible = array(result.possibleAccounts || result.registrationSignals).filter(value => String(value).toLowerCase() !== 'email');
    const absent = array(result.noAccountSignals);
    const inconclusive = array(result.inconclusiveServices || result.unavailableOrRateLimited);
    const anomalies = array(result.parserAnomalies);
    const checked = Number(result.servicesChecked || result.counts?.checked || possible.length + absent.length + inconclusive.length);
    const risk = object(result.riskAssessment);
    const level = risk.level || (possible.length >= 8 ? 'moderate' : 'low');
    const report = reportShell(job, 'Email account-signal report', level, risk.summary || `${possible.length} possible account signal${possible.length === 1 ? '' : 's'} found across ${checked} checked services.`);
    const stats = node('div', '', 'email-intel-grid');
    append(stats, stat('Services checked', checked), stat('Possible accounts', possible.length), stat('No-account signals', absent.length), stat('Inconclusive', inconclusive.length));
    report.appendChild(stats);
    report.appendChild(section('Possible account associations', itemList(possible, 'The provider response was consistent with an existing account. This is a lead, not proof of ownership or current use.')));
    if (absent.length) report.appendChild(section('No account signal returned', itemList(absent, 'The provider response was consistent with no account, but providers can change behaviour.')));
    report.appendChild(section('Providers that gave no reliable answer', itemList(inconclusive, 'The check was blocked, rate-limited, changed, unavailable, or returned an unrecognised response. No account conclusion can be drawn.')));
    if (anomalies.length) report.appendChild(section('Parser anomalies', itemList(anomalies, 'The runner could not classify this line confidently; ignore it until independently verified.')));
    report.appendChild(section('Recommended actions', actionList(array(risk.actions || result.recommendedActions))));
    report.appendChild(node('p', 'Account-registration signals may be stale, shared, incorrect, or caused by provider behaviour. Verify each important result directly.', 'email-intel-note'));
    report.appendChild(technicalDetails(result));
    return report;
  }

  function renderSpiderFoot(job) {
    const result = object(job.result);
    const counts = object(result.eventCounts);
    const domains = array(result.publicDomainsObserved);
    const modules = array(result.modulesReporting);
    const totalEvents = Object.values(counts).reduce((sum, value) => sum + (Number(value) || 0), 0);
    const report = reportShell(job, 'Passive digital-footprint report', result.riskAssessment?.level || 'informational', result.riskAssessment?.summary || `${totalEvents} sanitised public-data events were grouped into ${Object.keys(counts).length} event types.`);
    const stats = node('div', '', 'email-intel-grid');
    append(stats, stat('Sanitised events', totalEvents), stat('Event types', Object.keys(counts).length), stat('Public domains', domains.length), stat('Modules reporting', modules.length));
    report.appendChild(stats);
    const eventItems = Object.entries(counts).sort((a, b) => Number(b[1]) - Number(a[1])).map(([name, count]) => ({ name: titleCase(name), detail: `${count} event${Number(count) === 1 ? '' : 's'}` }));
    report.appendChild(section('Evidence categories observed', itemList(eventItems, 'Sanitised passive event category.')));
    report.appendChild(section('Public domains observed', itemList(domains, 'A public domain appeared in passive scan output; this does not prove control, ownership, or wrongdoing.')));
    report.appendChild(section('Collection modules', itemList(modules, 'Passive SpiderFoot module that contributed a sanitised event.')));
    report.appendChild(section('Recommended actions', actionList(array(result.recommendedActions || result.riskAssessment?.actions))));
    report.appendChild(node('p', 'Only passive modules were requested. External modules may be unavailable, rate-limited, or require separate API keys.', 'email-intel-note'));
    report.appendChild(technicalDetails(result));
    return report;
  }

  function renderH8mail(job) {
    const result = object(job.result);
    const indicators = object(result.exposureIndicators || result.exposureCategories);
    const breaches = array(result.breachOrDatasetNames);
    const sources = array(result.servicesReporting);
    const classes = array(result.dataClasses || result.exposureClasses);
    const dates = object(result.exposureDates);
    const positiveIndicators = Object.entries(indicators).filter(([, value]) => value === true || Number(value) > 0);
    const risk = object(result.riskAssessment);
    const level = risk.level || (indicators.authenticationMaterial || indicators.digestMaterial ? 'high' : breaches.length ? 'moderate' : 'low');
    const report = reportShell(job, 'Breach exposure report', level, risk.summary || `${breaches.length} sanitised breach or dataset reference${breaches.length === 1 ? '' : 's'} reported.`);
    const stats = node('div', '', 'email-intel-grid');
    append(stats, stat('Breach references', breaches.length), stat('Exposure classes', classes.length || positiveIndicators.length), stat('Source records', Number(result.sourceRecordCount || indicators.sourceRowsObserved || 0)), stat('Reporting services', sources.length));
    report.appendChild(stats);
    const indicatorItems = positiveIndicators.map(([key, value]) => ({ name: titleCase(key), detail: typeof value === 'boolean' ? 'Detected in source data; underlying sensitive value was discarded.' : `${value} sanitised occurrence${Number(value) === 1 ? '' : 's'} observed.` }));
    report.appendChild(section('Sensitive-data categories detected', itemList(indicatorItems, 'Category detected; underlying value was not retained.')));
    report.appendChild(section('Exposure classes', itemList(classes, 'Type of information reported by a breach source; no secret value is displayed or stored.')));
    report.appendChild(section('Breach or dataset references', itemList(breaches, 'Sanitised source name. A reference does not prove current compromise or ownership.')));
    if (dates.earliest || dates.latest) report.appendChild(section('Exposure date range', itemList([{ name: 'Earliest reported', detail: dates.earliest || 'Unknown' }, { name: 'Latest reported', detail: dates.latest || 'Unknown' }], 'Reported date.')));
    report.appendChild(section('Recommended actions', actionList(array(result.recommendedActions || risk.actions))));
    report.appendChild(node('p', 'Passwords, digests, recovery values, telephone numbers, network addresses, and raw breach rows are never returned. The report records only whether those categories were detected.', 'email-intel-note'));
    report.appendChild(technicalDetails(result));
    return report;
  }

  function renderResult(tool, job) {
    const output = outputFor(tool);
    if (!output || !job) return;
    output.textContent = '';
    if (job.status !== 'completed') {
      const lines = [`Status: ${job.status}`, `Job: ${job.id}`, `Target reference: ${job.targetReference || '—'}`, `Created: ${formatDate(job.createdAt)}`];
      if (job.summary) lines.push(`Summary: ${job.summary}`);
      if (job.error) lines.push(`Error: ${job.error}`);
      setText(output, lines.join('\n'), job.status === 'failed' ? 'error' : '');
      return;
    }
    output.dataset.state = 'success';
    output.appendChild(tool === 'holehe' ? renderHolehe(job) : tool === 'spiderfoot' ? renderSpiderFoot(job) : renderH8mail(job));
  }

  async function request(path, options = {}) {
    const response = await fetch(path, { credentials: 'same-origin', headers: { 'content-type': 'application/json', ...(options.headers || {}) }, ...options });
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

  async function loadJobs() {
    if (!jobsBody || !config) return;
    try {
      const payload = await request('/api/tools/jobs');
      jobsBody.textContent = '';
      if (!payload.jobs?.length) {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 5;
        cell.textContent = 'No tool jobs yet.';
        row.appendChild(cell);
        jobsBody.appendChild(row);
        return;
      }
      payload.jobs.forEach((job) => {
        const row = document.createElement('tr');
        const values = [job.tool, job.status, job.targetReference || '—', formatDate(job.createdAt), job.summary || job.error || '—'];
        values.forEach((value, index) => {
          const cell = document.createElement('td');
          if (index === 2) { const code = document.createElement('code'); code.textContent = String(value); cell.appendChild(code); }
          else cell.textContent = String(value);
          row.appendChild(cell);
        });
        jobsBody.appendChild(row);
      });
    } catch { jobsBody.innerHTML = '<tr><td colspan="5">Unable to load private jobs.</td></tr>'; }
  }

  function stopPolling(jobId) { const timer = activePolls.get(jobId); if (timer) clearTimeout(timer); activePolls.delete(jobId); }
  async function pollJob(jobId, tool, attempt = 0) {
    try {
      const payload = await request(`/api/tools/jobs/${encodeURIComponent(jobId)}`);
      renderResult(tool, payload.job);
      await loadJobs();
      if (['completed', 'failed', 'cancelled'].includes(payload.job.status)) { stopPolling(jobId); return; }
      if (attempt >= 120) { setText(outputFor(tool), `Job ${jobId} is still processing. Return to this page later to view it.`); stopPolling(jobId); return; }
      const timer = setTimeout(() => pollJob(jobId, tool, attempt + 1), 5000);
      activePolls.set(jobId, timer);
    } catch (error) { setText(outputFor(tool), error.message, 'error'); stopPolling(jobId); }
  }

  async function submitTool(form) {
    const tool = form.dataset.toolForm;
    const output = outputFor(tool);
    const data = new FormData(form);
    const payload = { tool, target: String(data.get('target') || '').trim(), purpose: String(data.get('purpose') || '').trim(), confirmLawfulUse: data.get('confirmLawfulUse') === 'on', confirmNoMinor: data.get('confirmNoMinor') === 'on' };
    setFormEnabled(form, false);
    setText(output, 'Submitting encrypted private job…');
    try {
      const response = await request('/api/tools/jobs', { method: 'POST', body: JSON.stringify(payload) });
      form.reset();
      const job = response.job || { id: response.jobId, status: response.status || 'queued' };
      setText(output, `Accepted. Job ${job.id} is ${job.status}.`);
      await loadJobs();
      pollJob(job.id, tool);
    } catch (error) { setText(output, error.message, 'error'); }
    finally { setFormEnabled(form, Boolean(config?.tools?.[tool]?.allowed && config?.configured)); }
  }

  async function initialise() {
    forms.forEach((form) => { setFormEnabled(form, false); form.addEventListener('submit', event => { event.preventDefault(); submitTool(form); }); });
    try {
      config = await request('/api/tools/config');
      const role = config.member?.role || 'member';
      setText(authState, role === 'admin' ? 'Administrator authenticated' : 'Verified member authenticated');
      const onlineTools = Object.entries(config.tools || {}).filter(([, value]) => value.runnerOnline).map(([key]) => key);
      setText(runnerState, onlineTools.length ? `Private service online: ${onlineTools.join(', ')}` : config.configured ? 'Private service configured; runner currently offline' : 'Private service not configured');
      if (adminCard && role === 'admin') adminCard.hidden = false;
      forms.forEach((form) => {
        const tool = form.dataset.toolForm;
        const toolConfig = config.tools?.[tool];
        const allowed = Boolean(config.configured && toolConfig?.allowed);
        setFormEnabled(form, allowed);
        const output = outputFor(tool);
        if (!toolConfig?.allowed) setText(output, tool === 'h8mail' ? 'Administrator authentication required.' : 'This member account cannot use this tool.', 'error');
        else if (!config.configured) setText(output, 'The private tool service has not been configured yet.', 'error');
        else if (!toolConfig.runnerOnline) setText(output, 'The tool is configured, but the private runner is currently offline. Jobs can be queued and will run when it reconnects.');
        else setText(output, `Ready. Daily limit: ${toolConfig.dailyLimit}.`);
      });
      await loadJobs();
    } catch (error) {
      if (error.status === 401) { setText(authState, 'Member login required'); setText(runnerState, 'Tools locked'); forms.forEach(form => setFormEnabled(form, false)); return; }
      setText(authState, 'Membership check failed'); setText(runnerState, error.message);
    }
  }

  window.addEventListener('beforeunload', () => { activePolls.forEach(timer => clearTimeout(timer)); });
  initialise();
})();