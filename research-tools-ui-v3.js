(() => {
  'use strict';
  const VERSION = '3.1.0';
  const categoryLabels = {
    authenticationMaterial: 'Authentication value',
    digestMaterial: 'Authentication digest',
    recoveryData: 'Recovery information',
    telephoneData: 'Telephone identifier',
    networkAddressData: 'Network identifier',
    usernameData: 'Username or login',
    nameData: 'Personal name',
    postalAddressData: 'Postal address',
    dateOfBirthData: 'Date of birth',
    financialData: 'Financial or billing identifier',
    authenticationTokenData: 'Session or access token'
  };

  const style = document.createElement('style');
  style.textContent = `
    .tool-output{white-space:normal!important}.intel-v3{display:grid;gap:1rem;color:#f3e6bd}.intel-v3-head{display:flex;justify-content:space-between;gap:1rem;align-items:flex-start;flex-wrap:wrap}.intel-v3-head h3{margin:.1rem 0}.intel-v3-badges{display:flex;gap:.45rem;flex-wrap:wrap}.intel-v3-badge{border:1px solid rgba(216,181,106,.4);border-radius:999px;padding:.35rem .68rem;font-size:.76rem;font-weight:800;text-transform:uppercase}.intel-v3-badge[data-level=verified]{border-color:#5d8fc7;color:#b6d8ff}.intel-v3-badge[data-level=high],.intel-v3-badge[data-level=critical]{border-color:#c75d55;color:#ffafa7}.intel-v3-badge[data-level=medium]{border-color:#d2a74e;color:#f1d28d}.intel-v3-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:.7rem}.intel-v3-stat{padding:.85rem;border:1px solid rgba(216,181,106,.22);border-radius:12px;background:rgba(216,181,106,.055)}.intel-v3-stat strong{display:block;font-size:1.5rem;color:#d8b56a}.intel-v3-stat span{font-size:.8rem;color:#c8bb95}.intel-v3-callout{padding:.85rem;border-left:4px solid #d8b56a;background:rgba(216,181,106,.07);border-radius:8px}.intel-v3-section{border-top:1px solid rgba(216,181,106,.18);padding-top:.85rem}.intel-v3-section h4{margin:0 0 .55rem}.intel-v3-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:.7rem}.intel-v3-card{padding:.8rem;border:1px solid rgba(216,181,106,.18);border-radius:10px;background:rgba(0,0,0,.25)}.intel-v3-card h5{margin:0 0 .35rem}.intel-v3-card p{margin:.28rem 0;color:#c8bb95}.intel-v3-list{display:grid;gap:.5rem;margin:0;padding:0;list-style:none}.intel-v3-list li{display:grid;grid-template-columns:minmax(140px,210px) 1fr;gap:.7rem;padding:.65rem;border:1px solid rgba(216,181,106,.15);border-radius:9px}.intel-v3-list span{color:#c8bb95}.intel-v3-details{border:1px solid rgba(216,181,106,.18);border-radius:9px;padding:.7rem}.intel-v3-details summary{cursor:pointer;font-weight:800}.intel-v3-details pre{white-space:pre-wrap;max-height:420px;overflow:auto;font-size:.76rem}.intel-v3-actions li{margin:.4rem 0}@media(max-width:620px){.intel-v3-list li{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);

  const arr = value => Array.isArray(value) ? value.filter(Boolean) : [];
  const obj = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const title = value => String(value || '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const node = (tag, text = '', cls = '') => { const el = document.createElement(tag); if (text !== '') el.textContent = String(text); if (cls) el.className = cls; return el; };
  const add = (parent, ...children) => { children.filter(Boolean).forEach(child => parent.appendChild(child)); return parent; };
  const stat = (label, value) => add(node('div', '', 'intel-v3-stat'), node('strong', value), node('span', label));
  const section = (label, content) => add(node('section', '', 'intel-v3-section'), node('h4', label), content);
  const details = (label, content) => add(node('details', '', 'intel-v3-details'), node('summary', label), content);
  const list = items => { const ul = node('ul', '', 'intel-v3-list'); if (!items.length) return add(ul, node('li', 'Nothing reported.')); items.forEach(item => add(ul, add(node('li'), node('strong', item.name), node('span', item.detail || '')))); return ul; };
  const cards = items => { const grid = node('div', '', 'intel-v3-cards'); if (!items.length) return add(grid, node('p', 'Nothing reported.')); items.forEach(item => add(grid, add(node('article', '', 'intel-v3-card'), node('h5', item.name), ...arr(item.lines).map(line => node('p', line))))); return grid; };
  const badge = (label, level) => { const b = node('span', label, 'intel-v3-badge'); b.dataset.level = level || ''; return b; };

  function parseRaw(text) {
    const start = text.indexOf('{');
    if (start < 0) return null;
    try { return JSON.parse(text.slice(start)); } catch { return null; }
  }

  function reportHead(titleText, summary, level, selfVerified) {
    const head = node('div', '', 'intel-v3-head');
    const left = add(node('div'), node('div', `Report interface ${VERSION}`, 'eyebrow'), node('h3', titleText), node('p', summary));
    const badges = node('div', '', 'intel-v3-badges');
    badges.appendChild(badge(`${title(level || 'informational')} priority`, String(level || 'informational').toLowerCase()));
    if (selfVerified) badges.appendChild(badge('Verified-self detail', 'verified'));
    return add(head, left, badges);
  }

  function renderAccount(result, selfVerified = false) {
    const possible = arr(result.accounts).map(record => {
      const module = obj(record.module);
      return { name: module.name_formatted || title(module.name || module.domain), lines: [module.domain || module.name || '', `${module.type_name || 'Online service'} · ${title(record.confidence || 'possible')} confidence`, 'Provider behaviour was consistent with an account. Verify through the provider directly.'] };
    });
    const validator = obj(result.validator);
    const absent = arr(validator.unregistered).length ? arr(validator.unregistered) : arr(result.noAccountSignals);
    const inconclusive = arr(validator.inconclusive).length ? arr(validator.inconclusive) : arr(result.inconclusiveServices);
    const risk = obj(result.riskAssessment);
    const root = node('div', '', 'intel-v3');
    root.appendChild(reportHead('Email account exposure surface', `${possible.length} possible account association${possible.length === 1 ? '' : 's'} found. This registration check does not establish compromise.`, risk.level || obj(result.ai_summary).risk || 'medium', selfVerified));
    const stats = node('div', '', 'intel-v3-grid');
    add(stats, stat('Services attempted', result.servicesChecked || possible.length + absent.length + inconclusive.length), stat('Possible accounts', possible.length), stat('No-account responses', absent.length), stat('No reliable answer', inconclusive.length)); root.appendChild(stats);
    root.appendChild(add(node('div', '', 'intel-v3-callout'), node('strong', 'What matters'), node('div', possible.length ? `Review: ${possible.map(item => item.name).join(', ')}.` : 'No positive registration lead was returned.')));
    root.appendChild(add(node('div', '', 'intel-v3-callout'), node('strong', 'Boundary'), node('div', 'A registration signal is not proof of ownership, activity, compromise or wrongdoing.')));
    root.appendChild(section('Possible account associations', cards(possible)));
    const actions = arr(result.recommendedActions || risk.actions); const ol = node('ol', '', 'intel-v3-actions'); actions.forEach(action => ol.appendChild(node('li', action))); root.appendChild(section('Recommended defensive actions', ol));
    root.appendChild(details(`${absent.length} services returned no-account responses`, list(absent.map(item => ({ name: item.name_formatted || item.name || item, detail: 'Provider response was consistent with no account.' })))));
    root.appendChild(details(`${inconclusive.length} providers were inconclusive`, list(inconclusive.map(item => ({ name: item.name_formatted || item.name || item, detail: 'Blocked, rate-limited, unavailable or changed.' })))));
    return root;
  }

  function renderExposure(result, selfVerified = false) {
    const indicators = obj(result.exposureIndicators || result.exposureCategories);
    const hints = selfVerified ? arr(result.recognitionHints) : [];
    const breaches = arr(result.data_breaches?.results).length ? arr(result.data_breaches.results) : arr(result.breachOrDatasetNames).map(name => ({ source: { name }, exposed_data: arr(result.exposureClasses) }));
    const stealer = obj(result.stealer_logs);
    const risk = obj(result.riskAssessment);
    const root = node('div', '', 'intel-v3');
    root.appendChild(reportHead('Defensive email exposure assessment', risk.reason || obj(result.ai_summary).risk_reason || risk.summary || 'Exposure evidence classified.', risk.level || obj(result.ai_summary).risk || 'medium', selfVerified));
    const stats = node('div', '', 'intel-v3-grid'); add(stats, stat('Source references', breaches.length), stat('Sensitive categories', Object.keys(indicators).filter(key => Number(indicators[key]) > 0).length), stat('Recognition clues', hints.length), stat('Infostealer indicators', Number(stealer.count || 0))); root.appendChild(stats);
    root.appendChild(add(node('div', '', 'intel-v3-callout'), node('strong', selfVerified ? 'Ownership verified' : 'Standard disclosure'), node('div', selfVerified ? 'Masked clues are shown because the searched mailbox matches the signed-in verified mailbox.' : 'All categories, sources, dates and counts are shown. Recognition clues require a matching verified mailbox.')));
    if (selfVerified) root.appendChild(section('Recognisable masked clues', cards(hints.map(hint => ({ name: categoryLabels[hint.kind] || title(hint.kind), lines: [hint.display || 'Value present · withheld', `Source: ${hint.source || 'Unlabelled'}`, `Reported: ${hint.reportedDate || 'Unknown'}`, `Occurrences: ${hint.occurrences || 1}${Number(hint.sameValueCount || 1) > 1 ? ` · same value appeared ${hint.sameValueCount} times` : ''}`, `Context: ${hint.context || 'Source record'}`] })))));
    root.appendChild(section('Complete exposure inventory', list(Object.entries(indicators).filter(([, count]) => Number(count) > 0).map(([key, count]) => ({ name: categoryLabels[key] || title(key), detail: `${count} classified occurrence${Number(count) === 1 ? '' : 's'}; underlying value withheld.` })))));
    root.appendChild(section('Source timeline', cards(breaches.map(row => ({ name: obj(row.source).name || 'Unnamed source', lines: [`Reported: ${obj(row.source).date || 'Unknown'}`, `Categories: ${arr(row.exposed_data).map(key => categoryLabels[key] || title(key)).join(', ') || 'Not classified'}`] }))));
    root.appendChild(section('Infostealer assessment', list([{ name: stealer.present ? 'Detected' : 'Not detected', detail: stealer.present ? `${stealer.count || 0} related indicator(s) reported.` : 'No related indicator returned by the configured source.' }])));
    const actions = arr(result.recommendedActions || risk.actions); const ol = node('ol', '', 'intel-v3-actions'); actions.forEach(action => ol.appendChild(node('li', action))); root.appendChild(section('Priority remediation', ol));
    return root;
  }

  function renderGeneric(result) {
    const root = node('div', '', 'intel-v3'); root.appendChild(reportHead('Passive public-footprint assessment', obj(result.riskAssessment).summary || obj(result.ai_summary).headline || 'Passive findings classified.', obj(result.riskAssessment).level || 'informational', false));
    root.appendChild(section('Evidence categories', list(Object.entries(obj(result.eventCounts)).map(([key, count]) => ({ name: title(key), detail: `${count} event(s)` }))));
    root.appendChild(details('Public domains observed', list(arr(result.publicDomainsObserved).map(name => ({ name, detail: 'Public association requiring source verification.' }))))); return root;
  }

  function render(output, result, selfVerified = false) {
    if (!output || !result || output.dataset.v3Rendered === '1') return;
    output.textContent = ''; output.dataset.v3Rendered = '1'; output.dataset.state = 'success';
    output.appendChild(result.engine === 'holehe' ? renderAccount(result, selfVerified) : result.engine === 'h8mail' ? renderExposure(result, selfVerified) : renderGeneric(result));
    output.appendChild(details('Sanitised technical JSON', node('pre', JSON.stringify(result, null, 2))));
  }

  function inspectOutput(output) {
    if (!output || output.dataset.v3Rendered === '1' || output.querySelector('.intel-v3,.email-intel-report')) return;
    const parsed = parseRaw(output.textContent || '');
    if (parsed) render(output, parsed, false);
  }

  document.querySelectorAll('[data-tool-output]').forEach(output => {
    inspectOutput(output);
    new MutationObserver(() => inspectOutput(output)).observe(output, { childList: true, subtree: true, characterData: true });
  });

  async function restoreLatest() {
    try {
      const response = await fetch('/api/tools/jobs', { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) return;
      const payload = await response.json();
      for (const job of arr(payload.jobs)) {
        if (job.status !== 'completed' || !job.result) continue;
        const output = document.querySelector(`[data-tool-output="${job.tool}"]`);
        if (output && output.dataset.v3Rendered !== '1') render(output, job.result, Boolean(job.selfVerified));
      }
    } catch {}
  }
  restoreLatest();
})();
