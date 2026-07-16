(() => {
  'use strict';
  window.__MATRIX_RESEARCH_UI_AUTHORITATIVE__ = true;

  const authState = document.querySelector('[data-auth-state]');
  const runnerState = document.querySelector('[data-runner-state]');
  const h8mailCard = document.querySelector('[data-h8mail-tool]');
  const jobsBody = document.querySelector('[data-jobs-body]');
  const forms = [...document.querySelectorAll('[data-tool-form]')];
  const activePolls = new Map();
  let config = null;
  let jobsCache = [];

  const priorityMeaning = {
    informational: 'Informational means the scan returned context but no urgent defensive signal. Review when convenient.',
    low: 'Low means no strong positive signal was returned. It does not prove the address is absent or safe.',
    medium: 'Medium means one or more findings should be verified soon. It is a review priority, not proof of compromise or wrongdoing.',
    moderate: 'Moderate means one or more findings should be verified soon. It is a review priority, not proof of compromise or wrongdoing.',
    high: 'High means sensitive exposure or several important signals were reported. Take the listed defensive actions promptly and verify the sources.',
    critical: 'Critical means the configured source reported a serious defensive indicator such as infostealer-related material. Act promptly, but verify before drawing broader conclusions.'
  };

  const style = document.createElement('style');
  style.textContent = `
    .tool-output{white-space:normal!important}.decision-report{display:grid;gap:1rem;color:#f3e6bd}.decision-head{display:flex;justify-content:space-between;gap:1rem;align-items:flex-start;flex-wrap:wrap}.decision-head h3{margin:.15rem 0}.decision-badges{display:flex;gap:.45rem;flex-wrap:wrap}.decision-badge{border:1px solid rgba(216,181,106,.4);border-radius:999px;padding:.35rem .7rem;font-size:.76rem;font-weight:800;text-transform:uppercase;letter-spacing:.04em}.decision-badge[data-level=low]{border-color:#4f9f70;color:#a8e7bd}.decision-badge[data-level=medium],.decision-badge[data-level=moderate]{border-color:#d2a74e;color:#f1d28d}.decision-badge[data-level=high],.decision-badge[data-level=critical]{border-color:#c75d55;color:#ffafa7}.decision-badge[data-level=verified]{border-color:#5d8fc7;color:#b6d8ff}.decision-summary{padding:1rem;border:1px solid rgba(216,181,106,.28);border-left:4px solid #d8b56a;border-radius:12px;background:rgba(216,181,106,.07)}.decision-summary h4{margin:0 0 .45rem}.decision-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:.7rem}.decision-stat{padding:.8rem;border:1px solid rgba(216,181,106,.2);border-radius:11px;background:rgba(0,0,0,.24)}.decision-stat strong{display:block;color:#d8b56a;font-size:1.45rem}.decision-stat span{font-size:.8rem;color:#c8bb95}.decision-section{border-top:1px solid rgba(216,181,106,.18);padding-top:.9rem}.decision-section h4{margin:0 0 .55rem}.decision-list{display:grid;gap:.5rem;margin:0;padding:0;list-style:none}.decision-list li{display:grid;grid-template-columns:minmax(130px,205px) 1fr;gap:.7rem;padding:.65rem .75rem;border:1px solid rgba(216,181,106,.15);border-radius:9px;background:rgba(0,0,0,.18)}.decision-list li span{color:#c8bb95}.decision-actions{margin:.2rem 0 0;padding-left:1.25rem}.decision-actions li{margin:.45rem 0}.decision-note{padding:.8rem;border-left:3px solid #d8b56a;background:rgba(216,181,106,.06);color:#d8cfb1}.decision-details{border:1px solid rgba(216,181,106,.18);border-radius:10px;padding:.7rem}.decision-details summary{cursor:pointer;font-weight:800}.decision-details pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:420px;overflow:auto;font-size:.76rem}.decision-empty{color:#c8bb95;font-style:italic}.job-open{margin-top:.45rem;padding:.35rem .6rem;border-radius:8px;border:1px solid rgba(216,181,106,.4);background:transparent;color:#f3e6bd;cursor:pointer}.job-open:hover{background:rgba(216,181,106,.1)}@media(max-width:620px){.decision-list li{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);

  const arr = value => Array.isArray(value) ? value.filter(Boolean) : [];
  const obj = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const titleCase = value => String(value || '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
  const node = (tag, text = '', className = '') => { const element = document.createElement(tag); if (text !== '') element.textContent = String(text); if (className) element.className = className; return element; };
  const add = (parent, ...children) => { children.filter(Boolean).forEach(child => parent.appendChild(child)); return parent; };
  const outputFor = tool => document.querySelector(`[data-tool-output="${tool}"]`);

  function setText(target, text, state = '') {
    if (!target) return;
    target.textContent = text;
    if (state) target.dataset.state = state;
  }

  function setFormEnabled(form, enabled) {
    [...form.elements].forEach(element => { element.disabled = !enabled; });
  }

  function formatDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toLocaleString() : String(value);
  }

  function stat(label, value) {
    return add(node('div', '', 'decision-stat'), node('strong', value), node('span', label));
  }

  function list(items, emptyText = 'Nothing reported.') {
    const result = node('ul', '', 'decision-list');
    if (!items.length) return add(result, node('li', emptyText, 'decision-empty'));
    items.forEach(item => add(result, add(node('li'), node('strong', item.name || 'Finding'), node('span', item.detail || ''))));
    return result;
  }

  function section(label, content) {
    return add(node('section', '', 'decision-section'), node('h4', label), content);
  }

  function details(label, content) {
    return add(node('details', '', 'decision-details'), node('summary', label), content);
  }

  function ordered(items, fallback) {
    const result = node('ol', '', 'decision-actions');
    (items.length ? items : [fallback]).forEach(item => result.appendChild(node('li', item)));
    return result;
  }

  function priority(result, fallback = 'informational') {
    const risk = obj(result.riskAssessment);
    const ai = obj(result.ai_summary);
    return String(risk.level || risk.risk || ai.risk || fallback).toLowerCase();
  }

  function reportShell(job, title, summary, level) {
    const report = node('div', '', 'decision-report');
    const head = node('div', '', 'decision-head');
    const heading = add(node('div'), node('div', `Completed · ${formatDate(job.completedAt || job.createdAt)}`, 'eyebrow'), node('h3', title), node('p', summary));
    const badges = node('div', '', 'decision-badges');
    const priorityBadge = node('span', `${titleCase(level)} review priority`, 'decision-badge');
    priorityBadge.dataset.level = level;
    badges.appendChild(priorityBadge);
    if (job.selfVerified) { const verified = node('span', 'Verified-self report', 'decision-badge'); verified.dataset.level = 'verified'; badges.appendChild(verified); }
    add(head, heading, badges);
    report.appendChild(head);
    return report;
  }

  function summaryBox(title, text, bullets = []) {
    const box = add(node('section', '', 'decision-summary'), node('h4', title), node('p', text));
    if (bullets.length) box.appendChild(list(bullets));
    return box;
  }

  function technical(result) {
    return details('Sanitised technical appendix', node('pre', JSON.stringify(result || {}, null, 2)));
  }

  function runMetadata(result) {
    const meta = obj(result.meta);
    return [
      meta.lookup_id ? { name: 'Lookup reference', detail: meta.lookup_id } : null,
      meta.duration_ms !== undefined ? { name: 'Run time', detail: `${meta.duration_ms} ms` } : null,
      meta.timed_out !== undefined ? { name: 'Timed out', detail: meta.timed_out ? 'Yes — treat the report as partial.' : 'No' } : null,
      meta.version !== undefined ? { name: 'Report version', detail: String(meta.version) } : null
    ].filter(Boolean);
  }

  function renderHolehe(job) {
    const result = obj(job.result);
    const accountRows = arr(result.accounts);
    const possibleRaw = accountRows.length ? accountRows : arr(result.possibleAccounts || result.registrationSignals);
    const possible = possibleRaw.map(item => {
      if (typeof item === 'string') return { name: item, detail: 'The provider response was consistent with an existing account. Verify through the provider directly.' };
      const module = obj(item.module);
      const name = module.name_formatted || module.domain || module.name || item.service || item.name || 'Service';
      return { name, detail: 'Possible registration signal. This does not prove ownership, current use, compromise or wrongdoing.' };
    });
    const validator = obj(result.validator);
    const absentRaw = arr(validator.unregistered).length ? arr(validator.unregistered) : arr(result.noAccountSignals);
    const inconclusiveRaw = arr(validator.inconclusive).length ? arr(validator.inconclusive) : arr(result.inconclusiveServices || result.unavailableOrRateLimited);
    const anomalies = arr(result.parserAnomalies);
    const checked = Number(result.servicesChecked || result.counts?.checked || possible.length + absentRaw.length + inconclusiveRaw.length);
    const reliable = Math.max(0, checked - inconclusiveRaw.length);
    const level = priority(result, possible.length ? 'medium' : 'low');
    const headline = possible.length
      ? `${possible.length} possible account registration signal${possible.length === 1 ? '' : 's'} require verification.`
      : 'No positive account registration signal was returned by this run.';
    const report = reportShell(job, 'Email account-signal decision brief', headline, level);

    report.appendChild(summaryBox('Bottom line', possible.length
      ? `The address produced possible account signals at ${possible.slice(0, 4).map(item => item.name).join(', ')}${possible.length > 4 ? ' and other services' : ''}. Check these first. The result does not show that an account is active or compromised.`
      : 'The configured providers did not return a positive registration signal. This is not proof that no accounts exist, because providers can block, change or limit these checks.', [
        { name: 'Review priority', detail: priorityMeaning[level] || priorityMeaning.informational },
        { name: 'How the label was formed', detail: 'The priority reflects positive account signals and the runner assessment. It is not a breach probability, guilt score or certainty rating.' },
        { name: 'Result quality', detail: `${reliable} of ${checked} attempted services returned a classifiable response; ${inconclusiveRaw.length} did not.` }
      ]));

    const stats = node('div', '', 'decision-grid');
    add(stats, stat('Services attempted', checked), stat('Verify first', possible.length), stat('No-account responses', absentRaw.length), stat('Inconclusive', inconclusiveRaw.length));
    report.appendChild(stats);
    report.appendChild(section('Findings to verify first', list(possible, 'No positive account signal was returned.')));
    report.appendChild(section('What to do next', ordered(arr(result.recommendedActions || result.riskAssessment?.actions), 'Verify any positive signal through the provider’s official sign-in or recovery route.')));
    report.appendChild(node('p', 'What this does not prove: identity, ownership, present use, compromise, intent or wrongdoing. Provider responses can be stale or misleading.', 'decision-note'));
    report.appendChild(details(`${absentRaw.length} no-account responses — lower priority`, list(absentRaw.map(item => ({ name: item.name_formatted || item.name || item, detail: 'Provider response was consistent with no account, but this can change.' })))));
    report.appendChild(details(`${inconclusiveRaw.length} services gave no reliable answer`, list(inconclusiveRaw.map(item => ({ name: item.name_formatted || item.name || item, detail: 'Blocked, rate-limited, unavailable, changed or unrecognised. No conclusion can be drawn.' })))));
    if (anomalies.length) report.appendChild(details(`${anomalies.length} parser anomal${anomalies.length === 1 ? 'y' : 'ies'}`, list(anomalies.map(item => ({ name: 'Unclassified runner line', detail: String(item) })))));
    const metadata = runMetadata(result);
    if (metadata.length) report.appendChild(details('Run metadata', list(metadata)));
    report.appendChild(technical(result));
    return report;
  }

  function renderSpiderFoot(job) {
    const result = obj(job.result);
    const counts = obj(result.eventCounts);
    const domains = arr(result.publicDomainsObserved);
    const modules = arr(result.modulesReporting);
    const eventRows = Object.entries(counts).sort((a, b) => Number(b[1]) - Number(a[1])).map(([name, count]) => ({ name: titleCase(name), detail: `${count} sanitised event${Number(count) === 1 ? '' : 's'}.` }));
    const total = Object.values(counts).reduce((sum, value) => sum + (Number(value) || 0), 0);
    const level = priority(result, total ? 'medium' : 'informational');
    const report = reportShell(job, 'Passive footprint decision brief', `${total} sanitised public-data events were grouped into ${eventRows.length} categories.`, level);
    report.appendChild(summaryBox('Bottom line', domains.length
      ? `The passive scan observed public associations involving ${domains.slice(0, 5).join(', ')}${domains.length > 5 ? ' and other domains' : ''}. Treat these as source leads, not ownership findings.`
      : 'No public domain association was returned in the sanitised result. A quiet scan does not prove that no footprint exists.', [
        { name: 'Review priority', detail: priorityMeaning[level] || priorityMeaning.informational },
        { name: 'How the label was formed', detail: 'The priority reflects the volume and sensitivity of sanitised passive events. It is not a probability of guilt, compromise or control.' },
        { name: 'Collection boundary', detail: 'Only passive modules were requested. External modules may be unavailable, rate-limited or require separate credentials.' }
      ]));
    const stats = node('div', '', 'decision-grid');
    add(stats, stat('Sanitised events', total), stat('Evidence categories', eventRows.length), stat('Public domains', domains.length), stat('Modules reporting', modules.length));
    report.appendChild(stats);
    report.appendChild(section('Evidence categories', list(eventRows, 'No sanitised event category was returned.')));
    report.appendChild(section('What to do next', ordered(arr(result.recommendedActions || result.riskAssessment?.actions), 'Open the relevant public source and verify the association, date and context.')));
    report.appendChild(node('p', 'What this does not prove: ownership, control, identity, intent, current use or wrongdoing. A public association may be historical, indirect or incorrect.', 'decision-note'));
    report.appendChild(details(`${domains.length} public domains observed`, list(domains.map(name => ({ name, detail: 'Public association requiring direct source verification.' })))));
    report.appendChild(details(`${modules.length} collection modules contributed`, list(modules.map(name => ({ name, detail: 'Passive module contributing sanitised events.' })))));
    const metadata = runMetadata(result);
    if (metadata.length) report.appendChild(details('Run metadata', list(metadata)));
    report.appendChild(technical(result));
    return report;
  }

  function renderH8mail(job) {
    const result = obj(job.result);
    const indicators = obj(result.exposureIndicators || result.exposureCategories);
    const positive = Object.entries(indicators).filter(([, value]) => value === true || Number(value) > 0).map(([name, value]) => ({ name: titleCase(name), detail: typeof value === 'boolean' ? 'Category detected; underlying value withheld.' : `${value} sanitised occurrence${Number(value) === 1 ? '' : 's'}; underlying value withheld.` }));
    const breachRows = arr(result.data_breaches?.results);
    const breachNames = breachRows.length ? breachRows.map(row => obj(row.source).name || row.name || 'Unnamed source') : arr(result.breachOrDatasetNames);
    const stealer = obj(result.stealer_logs);
    const level = priority(result, stealer.present ? 'critical' : positive.length ? 'high' : breachNames.length ? 'medium' : 'low');
    const report = reportShell(job, 'Defensive exposure decision brief', positive.length || breachNames.length
      ? `${positive.length} sensitive-data categor${positive.length === 1 ? 'y' : 'ies'} and ${breachNames.length} source reference${breachNames.length === 1 ? '' : 's'} require review.`
      : 'No sensitive exposure category was returned by the configured sources.', level);
    report.appendChild(summaryBox('Bottom line', stealer.present
      ? 'The configured source reported infostealer-related indicators. Change important credentials from a clean device, review sessions and enable multi-factor authentication, then verify the source details.'
      : positive.length
        ? 'The report found sanitised evidence categories associated with the address. The underlying secret values were withheld. Review the source dates and take the defensive actions below.'
        : 'No positive sensitive-data category was returned. This is not proof that the address has never appeared in another dataset.', [
          { name: 'Review priority', detail: priorityMeaning[level] || priorityMeaning.informational },
          { name: 'How the label was formed', detail: 'The priority reflects sensitive categories, source references and infostealer indicators. It is not proof of current compromise or misuse.' },
          { name: 'Privacy protection', detail: 'Passwords, digests, recovery values, telephone numbers, network addresses and raw breach rows are not displayed.' }
        ]));
    const stats = node('div', '', 'decision-grid');
    add(stats, stat('Source references', breachNames.length), stat('Sensitive categories', positive.length), stat('Infostealer indicators', Number(stealer.count || 0)), stat('Source rows', Number(result.sourceRecordCount || indicators.sourceRowsObserved || 0)));
    report.appendChild(stats);
    report.appendChild(section('Exposure categories to address', list(positive, 'No positive sensitive-data category was returned.')));
    report.appendChild(section('What to do next', ordered(arr(result.recommendedActions || result.riskAssessment?.actions), 'Change reused passwords, enable multi-factor authentication and review active sessions.')));
    report.appendChild(node('p', 'What this does not prove: current compromise, who used the data, whether the address owner created the account, or any wrongdoing.', 'decision-note'));
    report.appendChild(details(`${breachNames.length} source or dataset references`, list(breachNames.map(name => ({ name, detail: 'Sanitised source reference. Verify the reported date and scope.' })))));
    report.appendChild(details('Infostealer assessment', list([{ name: stealer.present ? 'Indicator reported' : 'No indicator reported', detail: stealer.present ? `${Number(stealer.count || 0)} related indicator${Number(stealer.count || 0) === 1 ? '' : 's'} were returned; raw values were discarded.` : 'No infostealer-related indicator was returned by the configured source.' }])));
    const metadata = runMetadata(result);
    if (metadata.length) report.appendChild(details('Run metadata', list(metadata)));
    report.appendChild(technical(result));
    return report;
  }

  function renderResult(tool, job) {
    const output = outputFor(tool);
    if (!output || !job) return;
    output.textContent = '';
    output.dataset.reportJobId = job.id || '';
    if (job.status !== 'completed') {
      const message = [
        `Status: ${job.status}`,
        `Created: ${formatDate(job.createdAt)}`,
        job.summary ? `Summary: ${job.summary}` : '',
        job.error ? `Error: ${job.error}` : ''
      ].filter(Boolean).join('\n');
      setText(output, message, job.status === 'failed' ? 'error' : '');
      return;
    }
    output.dataset.state = 'success';
    output.appendChild(tool === 'holehe' ? renderHolehe(job) : tool === 'spiderfoot' ? renderSpiderFoot(job) : renderH8mail(job));
    output.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function request(path, options = {}) {
    const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', headers: { 'content-type': 'application/json', ...(options.headers || {}) }, ...options });
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

  async function openJob(job) {
    try {
      const complete = job.result ? job : (await request(`/api/tools/jobs/${encodeURIComponent(job.id)}`)).job;
      renderResult(complete.tool, complete);
    } catch (error) {
      setText(outputFor(job.tool), error.message, 'error');
    }
  }

  async function loadJobs({ restoreLatest = false } = {}) {
    if (!jobsBody || !config) return;
    try {
      const payload = await request('/api/tools/jobs');
      jobsCache = arr(payload.jobs);
      jobsBody.textContent = '';
      if (!jobsCache.length) {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 5;
        cell.textContent = 'No tool jobs yet.';
        row.appendChild(cell);
        jobsBody.appendChild(row);
        return;
      }
      jobsCache.forEach(job => {
        const row = document.createElement('tr');
        const values = [job.tool, job.status, job.targetReference || 'Private target', formatDate(job.createdAt)];
        values.forEach((value, index) => {
          const cell = document.createElement('td');
          if (index === 2) { const code = document.createElement('code'); code.textContent = String(value); cell.appendChild(code); }
          else cell.textContent = String(value);
          row.appendChild(cell);
        });
        const summaryCell = document.createElement('td');
        summaryCell.appendChild(node('div', job.summary || job.error || 'No summary available.'));
        if (job.status === 'completed') {
          const button = node('button', 'Open clear report', 'job-open');
          button.type = 'button';
          button.addEventListener('click', () => openJob(job));
          summaryCell.appendChild(button);
        }
        row.appendChild(summaryCell);
        jobsBody.appendChild(row);
      });
      if (restoreLatest) {
        const seen = new Set();
        for (const job of jobsCache) {
          if (job.status !== 'completed' || seen.has(job.tool)) continue;
          seen.add(job.tool);
          await openJob(job);
        }
      }
    } catch {
      jobsBody.innerHTML = '<tr><td colspan="5">Unable to load private jobs.</td></tr>';
    }
  }

  function stopPolling(jobId) {
    const timer = activePolls.get(jobId);
    if (timer) clearTimeout(timer);
    activePolls.delete(jobId);
  }

  async function pollJob(jobId, tool, attempt = 0) {
    try {
      const payload = await request(`/api/tools/jobs/${encodeURIComponent(jobId)}`);
      renderResult(tool, payload.job);
      await loadJobs();
      if (['completed', 'failed', 'cancelled'].includes(payload.job.status)) { stopPolling(jobId); return; }
      if (attempt >= 120) { setText(outputFor(tool), 'The job is still processing. It remains stored in Recent Tool Jobs and can be reopened later.'); stopPolling(jobId); return; }
      const timer = setTimeout(() => pollJob(jobId, tool, attempt + 1), 5000);
      activePolls.set(jobId, timer);
    } catch (error) {
      setText(outputFor(tool), error.message, 'error');
      stopPolling(jobId);
    }
  }

  async function submitTool(form) {
    const tool = form.dataset.toolForm;
    const output = outputFor(tool);
    const data = new FormData(form);
    const payload = {
      tool,
      target: String(data.get('target') || '').trim(),
      purpose: String(data.get('purpose') || '').trim(),
      confirmLawfulUse: data.get('confirmLawfulUse') === 'on',
      confirmNoMinor: data.get('confirmNoMinor') === 'on'
    };
    setFormEnabled(form, false);
    setText(output, 'Submitting private job…');
    try {
      const response = await request('/api/tools/jobs', { method: 'POST', body: JSON.stringify(payload) });
      form.reset();
      const job = response.job || { id: response.jobId, tool, status: response.status || 'queued' };
      setText(output, `Accepted. The ${tool} job is ${job.status}. The clear report will replace this message when complete.`);
      await loadJobs();
      pollJob(job.id, tool);
    } catch (error) {
      setText(output, error.message, 'error');
    } finally {
      setFormEnabled(form, Boolean(config?.tools?.[tool]?.allowed && config?.configured));
    }
  }

  async function initialise() {
    forms.forEach(form => {
      setFormEnabled(form, false);
      form.addEventListener('submit', event => { event.preventDefault(); submitTool(form); });
    });
    try {
      config = await request('/api/tools/config');
      const role = config.member?.role || 'member';
      setText(authState, role === 'admin' ? 'Administrator authenticated' : `Verified member · ${config.member?.tier || 'registered'}`);
      const onlineTools = Object.entries(config.tools || {}).filter(([, value]) => value.runnerOnline).map(([key]) => key);
      setText(runnerState, onlineTools.length ? `Private service online: ${onlineTools.join(', ')}` : config.configured ? 'Private service configured; runner currently offline' : 'Private service not configured');
      if (h8mailCard) h8mailCard.hidden = false;
      forms.forEach(form => {
        const tool = form.dataset.toolForm;
        const toolConfig = config.tools?.[tool];
        const allowed = Boolean(config.configured && toolConfig?.allowed);
        setFormEnabled(form, allowed);
        const output = outputFor(tool);
        if (!toolConfig?.allowed) setText(output, tool === 'h8mail' ? 'Intelligence membership required. Members may review only their own verified email.' : 'This membership tier cannot use this tool.', 'error');
        else if (!config.configured) setText(output, 'The private tool service has not been configured yet.', 'error');
        else if (!toolConfig.runnerOnline) setText(output, 'The tool is configured, but the private runner is offline. Jobs can be queued and will run when it reconnects.');
        else setText(output, `Ready. Daily limit: ${toolConfig.dailyLimit}. Results will open as a plain-English decision brief.`);
      });
      await loadJobs({ restoreLatest: true });
    } catch (error) {
      if (error.status === 401) {
        setText(authState, 'Member login required');
        setText(runnerState, 'Tools locked');
        forms.forEach(form => setFormEnabled(form, false));
        return;
      }
      setText(authState, 'Membership check failed');
      setText(runnerState, error.message);
    }
  }

  window.addEventListener('beforeunload', () => activePolls.forEach(timer => clearTimeout(timer)));
  initialise();
})();
