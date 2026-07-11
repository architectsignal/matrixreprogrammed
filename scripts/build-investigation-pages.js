const fs = require('fs');
const path = require('path');

const root = process.cwd();
const dataDir = path.join(root, 'data');
const downloadsDir = path.join(root, 'downloads');
const buildGeneratedAt = new Date().toISOString();
const buildDate = buildGeneratedAt.slice(0, 10);
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(downloadsDir, { recursive: true });

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')); } catch { return fallback; }
}
function esc(value = '') {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
function prettyDate(value) {
  if (!value) return 'First scheduled source run pending';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(date) + ' UTC';
}
function list(items) {
  return `<ul>${(items || []).map(item => `<li>${esc(item)}</li>`).join('')}</ul>`;
}
function nav() {
  return `<nav class="nav"><a href="daily-investigation-conclusions.html">Daily Conclusions</a><a href="weekly-investigation-report.html">Weekly Report</a><a href="investigation-source-ledger.html">Source Ledger</a><a href="evidence-vault.html">Evidence Vault</a><a href="search.html">Search</a></nav>`;
}
function shell(title, description, body) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>${esc(title)} | Matrix Reprogrammed</title><meta name="description" content="${esc(description)}"/><link rel="stylesheet" href="styles.css"/><link rel="stylesheet" href="fixes.css"/><link rel="stylesheet" href="reader-experience.css"/></head><body><canvas id="matrix"></canvas><div class="signal-face"></div><div class="veil"></div><div class="page"><header class="wrap topbar"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil"/> MATRIX REPROGRAMMED</a>${nav()}</header><main>${body}</main><footer class="footer wrap"><p><strong>Evidence rule:</strong> convictions and final official outcomes may establish wrongdoing within their exact scope. Charges are allegations. Leaks are leads until authenticated and corroborated.</p></footer></div><script src="matrix.js"></script><script src="investigation-pulse.js"></script><script src="analytics.js"></script></body></html>`;
}
function findingCard(finding) {
  const grade = finding.evidenceGrade || 'C';
  const status = String(finding.status || 'record-update').replace(/-/g, ' ');
  const indicators = (finding.wrongdoingIndicators || []).length ? `<p><strong>Indicators:</strong> ${esc(finding.wrongdoingIndicators.join(', '))}</p>` : '';
  return `<article class="card redline"><span class="label">GRADE ${esc(grade)} · ${esc(status)} · SEVERITY ${esc(finding.severity || 1)}</span><h3>${esc(finding.title)}</h3><p><strong>Source:</strong> ${esc(finding.sourceLabel)} · ${esc(prettyDate(finding.published))}</p><p><strong>Conclusion:</strong> ${esc(finding.conclusion)}</p><p><strong>Mechanism:</strong> ${esc(finding.mechanism)}</p><p><strong>Implication:</strong> ${esc(finding.implication)}</p><p><strong>Boundary:</strong> ${esc(finding.evidenceBoundary)}</p>${indicators}<h4>Next records</h4>${list(finding.nextRecords)}<div class="cta-row small"><a class="btn" href="${esc(finding.itemUrl || finding.sourceUrl)}" rel="noopener">Open Source</a><a class="btn alt" href="search.html?q=${encodeURIComponent(finding.title || '')}">Search Connections</a></div></article>`;
}
function sourceCard(source) {
  const status = source.status || 'not-yet-run';
  return `<article class="card ${status === 'fetched' ? '' : 'redline'}"><span class="label">${esc(source.authority || 'source')} · ${esc(status)}</span><h3>${esc(source.label || source.sourceId)}</h3><p><strong>Lane:</strong> ${esc(source.lane || 'general')}</p><p><strong>Last attempt:</strong> ${esc(prettyDate(source.lastAttempt))}</p><p><strong>Last success:</strong> ${esc(prettyDate(source.lastSuccess))}</p><p><strong>Items:</strong> ${esc(source.itemCount || 0)} · <strong>Changed:</strong> ${source.changed ? 'yes' : 'no'}</p>${source.error ? `<p><strong>Error:</strong> ${esc(source.error)}</p>` : ''}<a class="btn alt" href="${esc(source.finalUrl || source.url)}" rel="noopener">Open Source Platform</a></article>`;
}
function permanentMethodSection() {
  return `<section class="section wrap"><div class="eyebrow">Public review date: ${buildDate}</div><h2>HOW THE MACHINE REACHES A DEFENSIBLE CONCLUSION.</h2><div class="grid"><article class="card redline"><h3>1. Establish the record status</h3><p><strong>Official source rule:</strong> a conviction, guilty plea, sentence, final judgment, regulator order or comparable adjudicated court record may establish wrongdoing only within the exact conduct, parties and period stated in that document. An indictment, criminal complaint, charge, arrest, investigation or allegation is not proof of guilt and remains labelled as an allegation.</p><p><strong>Leak rule:</strong> WikiLeaks, archive releases, emails, cables and other leaked documents are evidence leads. The machine checks provenance, date, document chain, internal consistency, named entities, corroborating filings and reliable counter-records before using them to support a substantive claim.</p></article><article class="card redline"><h3>2. Explain the mechanism of power</h3><p><strong>Mechanism:</strong> every important finding must connect a person or institution to a documented route such as office, legal authority, beneficial ownership, contract, payment, lobbying record, proxy vote, procurement decision, regulatory action, access rule or implementation system. Repeated proximity or a high network score alone is not a finding of corruption.</p><p><strong>Implication:</strong> a supported chain can expose how wrongdoing, conflicts, public money or institutional protection operated. It can also reveal which agency, company, contractor, court, regulator or oversight body had the authority to stop, disclose or remedy the conduct.</p></article><article class="card redline"><h3>3. State limitations and the next test</h3><p><strong>Evidence boundary:</strong> the machine separates established wrongdoing, official enforcement, charges, audit findings, sourced analysis, reasonable inference, speculation and unsupported claims. It does not turn association, wealth, office, nationality, a photograph, a flight entry or a missing file into guilt.</p><p><strong>Counterpoint:</strong> alternative explanations, dismissals, acquittals, appeals, corrected records, legal privilege, victim protection and ordinary administrative error must remain visible.</p><p><strong>Watch next:</strong> obtain the primary filing, judgment, contract, award notice, audit report, disclosure index, redaction log, financial record or authenticated document capable of upgrading, narrowing or falsifying the conclusion.</p></article></div><div class="cta-row"><a class="btn" href="investigation-source-ledger.html">Audit Every Source</a><a class="btn alt" href="evidence-policy.html">Evidence Policy</a><a class="btn alt" href="daily-missing-records.html">Missing Records</a><a class="btn alt" href="search.html?q=corruption%20wrongdoing%20official%20records">Search Wrongdoing Records</a></div></section>`;
}
function productSection(product, heading) {
  const findings = product.strongestFindings || [];
  const generatedAt = product.generatedAt || buildGeneratedAt;
  return `<section class="hero wrap"><div class="eyebrow">${esc(product.kind || 'Investigation')} Intelligence · ${esc(prettyDate(generatedAt))}</div><h1>${esc(heading)}</h1><p class="lead">${esc(product.topConclusion || 'No current conclusion loaded.')}</p><p><strong>Boundary:</strong> ${esc(product.boundary || '')}</p><p class="figure-caption">Public review date: ${buildDate}</p><div class="cta-row"><a class="btn" href="investigation-machine.html">Investigation Machine</a><a class="btn alt" href="investigation-source-ledger.html">Source Ledger</a><a class="btn alt" href="search.html">Search Evidence</a></div></section><section class="section wrap split"><div class="terminal">INVESTIGATION STATUS\n&gt; Sources scheduled: ${esc(product.summary?.sourcesScheduled || 0)}\n&gt; Sources fetched: ${esc(product.summary?.sourcesFetched || 0)}\n&gt; Changed sources: ${esc(product.summary?.changedSources || 0)}\n&gt; Findings in window: ${esc(product.summary?.findingsInWindow || 0)}\n&gt; Established wrongdoing: ${esc(product.summary?.establishedWrongdoingFindings || 0)}\n&gt; Official actions: ${esc(product.summary?.officialActionFindings || 0)}\n&gt; Leak/document leads: ${esc(product.summary?.documentOrLeakLeads || 0)}</div><aside class="card redline"><h2>Method</h2><p>The machine ranks official adjudication, enforcement, audit findings, charges, source changes and document releases separately. It connects the record to money, office, contract, authority, implementation and missing evidence.</p></aside></section>${permanentMethodSection()}<section class="section wrap"><h2>Strongest Findings</h2><div class="grid">${findings.length ? findings.map(findingCard).join('') : '<article class="card"><h3>No new finding crossed the threshold</h3><p>This is a neutral result. It does not prove that no wrongdoing occurred outside the monitored sources. The source ledger still records every attempted search, blocked source, changed index and failure so the gap remains visible.</p></article>'}</div></section><section class="section wrap"><h2>Missing Records And Next Moves</h2><div class="grid">${(product.missingRecords || []).slice(0, 20).map(item => `<article class="card"><h3>${esc(item.title)}</h3>${list(item.nextRecords)}<a class="btn alt" href="${esc(item.source)}" rel="noopener">Open Starting Record</a></article>`).join('') || '<article class="card"><h3>No machine-generated queue yet</h3><p>The permanent next-record rule still applies: verify the official filing, judgment, contract, audit, disclosure log or authenticated document before upgrading any claim.</p></article>'}</div></section>`;
}
function markdownProduct(product, heading) {
  const lines = [`# ${heading}`, '', `Generated: ${product.generatedAt || buildGeneratedAt}`, '', product.topConclusion || '', '', `Boundary: ${product.boundary || ''}`, '', '## Summary', ''];
  for (const [key, value] of Object.entries(product.summary || {})) lines.push(`- ${key}: ${value}`);
  lines.push('', '## Permanent Evidence Method', '', 'Final official records may establish wrongdoing only within their exact scope. Charges remain allegations. Leaks require authentication and corroboration. Every finding must explain its mechanism, implication, limitation and next falsification record.', '', '## Strongest Findings', '');
  for (const finding of product.strongestFindings || []) {
    lines.push(`### ${finding.title}`, '', `Grade: ${finding.evidenceGrade} · Status: ${finding.status} · Severity: ${finding.severity}`, '', `Source: ${finding.sourceLabel}`, '', `Conclusion: ${finding.conclusion}`, '', `Mechanism: ${finding.mechanism}`, '', `Implication: ${finding.implication}`, '', `Boundary: ${finding.evidenceBoundary}`, '', `Next records: ${(finding.nextRecords || []).join('; ')}`, '', `Source URL: ${finding.itemUrl || finding.sourceUrl}`, '');
  }
  return lines.join('\n');
}

const registry = readJson('data/investigation-source-registry.json', { mission: 'Investigation source registry not loaded.', rules: [], lanes: [], sources: [] });
const state = readJson('data/investigation-source-state.json', { updated: null, sources: {} });
const ledger = readJson('data/investigation-ledger.json', { updated: null, findings: [] });
const daily = readJson('data/daily-investigation-conclusions.json', {
  kind: 'daily', generatedAt: state.updated, topConclusion: 'The investigation machine is configured and awaiting its first scheduled source run.', summary: {}, strongestFindings: [], missingRecords: [], boundary: registry.rules?.[0] || ''
});
const weekly = readJson('data/weekly-investigation-conclusions.json', {
  kind: 'weekly', generatedAt: state.updated, topConclusion: 'The weekly investigation machine is configured and awaiting its first scheduled source run.', summary: {}, strongestFindings: [], missingRecords: [], boundary: registry.rules?.[0] || ''
});
const sourceStates = Object.values(state.sources || {});
const latestFindings = (ledger.findings || []).slice(0, 30);
const fetchedCount = sourceStates.filter(source => source.status === 'fetched').length;
const failedCount = sourceStates.filter(source => String(source.status || '').startsWith('failed')).length;
const establishedCount = (ledger.findings || []).filter(finding => finding.status === 'established-wrongdoing').length;

const investigationBody = `<section class="hero wrap"><div class="eyebrow">Living Public-Record Investigation System · ${buildDate}</div><h1>INTELLIGENT INVESTIGATION MACHINE.</h1><p class="lead">Daily and weekly searches across government platforms, official enforcement sources, Epstein disclosures, oversight records, financial filings, contracts, declassified archives, WikiLeaks and international anti-corruption sources.</p><p><strong>Mission:</strong> ${esc(registry.mission)}</p><div class="cta-row"><a class="btn" href="daily-investigation-conclusions.html">Daily Conclusions</a><a class="btn alt" href="weekly-investigation-report.html">Weekly Investigation</a><a class="btn alt" href="investigation-source-ledger.html">Every Source Check</a><a class="btn alt" href="search.html">Search The Machine</a></div></section><section class="section wrap split"><div class="terminal">INVESTIGATION PULSE\n&gt; Last source run: ${esc(prettyDate(state.updated))}\n&gt; Registered sources: ${esc((registry.sources || []).length)}\n&gt; Sources fetched last run: ${esc(fetchedCount)}\n&gt; Source failures: ${esc(failedCount)}\n&gt; Findings in ledger: ${esc((ledger.findings || []).length)}\n&gt; Established wrongdoing records: ${esc(establishedCount)}\n&gt; Daily + weekly conclusions: active</div><aside class="card redline"><h2>Vigorous, Not Reckless</h2><p>The machine searches aggressively and preserves failures, changed indexes and missing records. It calls wrongdoing established only when an official final record supports that exact conclusion. Charges remain allegations. Leaks remain leads until authenticated.</p></aside></section><section class="section wrap"><h2>Investigation Lanes</h2><div class="grid">${(registry.lanes || []).map(lane => `<article class="card"><span class="label">${esc(lane.id)}</span><h3>${esc(lane.title)}</h3><p>${esc(lane.description)}</p><a class="btn alt" href="${esc(lane.route)}">Open Route</a></article>`).join('')}</div></section><section class="section wrap"><h2>Latest Evidence Findings</h2><div class="grid">${latestFindings.length ? latestFindings.map(findingCard).join('') : '<article class="card"><h3>First source run pending</h3><p>The source registry and conclusion rules are active. The scheduled workflow will populate the ledger.</p></article>'}</div></section><section class="section wrap"><h2>Non-Negotiable Evidence Rules</h2>${list(registry.rules)}</section>`;

const sourceBody = `<section class="hero wrap"><div class="eyebrow">Every Search Attempt Preserved · ${buildDate}</div><h1>INVESTIGATION SOURCE LEDGER.</h1><p class="lead">Source status, last success, changed content, parsed item count and failures. A failed or blocked source remains visible instead of silently disappearing.</p><div class="cta-row"><a class="btn" href="investigation-machine.html">Machine</a><a class="btn alt" href="daily-investigation-conclusions.html">Daily Conclusions</a><a class="btn alt" href="weekly-investigation-report.html">Weekly Report</a></div></section><section class="section wrap"><h2>Registered Source Platforms</h2><div class="grid">${(registry.sources || []).map(source => sourceCard({ ...source, ...(state.sources?.[source.id] || {}) })).join('')}</div></section>`;

fs.writeFileSync(path.join(root, 'investigation-machine.html'), shell('Investigation Machine', 'Daily and weekly public-record investigation across government, enforcement, Epstein, financial, contract, oversight and leak sources.', investigationBody));
fs.writeFileSync(path.join(root, 'daily-investigation-conclusions.html'), shell('Daily Investigation Conclusions', 'Daily evidence-bounded conclusions about official wrongdoing, enforcement, allegations, document releases and missing records.', productSection(daily, 'DAILY INVESTIGATION CONCLUSIONS.')));
fs.writeFileSync(path.join(root, 'weekly-investigation-report.html'), shell('Weekly Investigation Report', 'Weekly cross-source investigation findings, patterns, official actions, established wrongdoing records and missing evidence.', productSection(weekly, 'WEEKLY INVESTIGATION REPORT.')));
fs.writeFileSync(path.join(root, 'investigation-source-ledger.html'), shell('Investigation Source Ledger', 'Status and history for every government, enforcement, archive, WikiLeaks and oversight source monitored by the investigation machine.', sourceBody));

const status = {
  updated: buildGeneratedAt,
  lastInvestigationRun: state.updated,
  registeredSources: (registry.sources || []).length,
  fetchedSources: fetchedCount,
  failedSources: failedCount,
  ledgerFindings: (ledger.findings || []).length,
  establishedWrongdoingRecords: establishedCount,
  dailyGeneratedAt: daily.generatedAt || null,
  weeklyGeneratedAt: weekly.generatedAt || null,
  searchRoute: 'search.html',
  investigationRoute: 'investigation-machine.html',
  boundary: 'The pulse reports investigation activity. It does not convert allegations or leaks into proof.'
};
fs.writeFileSync(path.join(dataDir, 'investigation-status.json'), JSON.stringify(status, null, 2));
fs.writeFileSync(path.join(downloadsDir, 'daily-investigation-conclusions.md'), markdownProduct(daily, 'Daily Investigation Conclusions'));
fs.writeFileSync(path.join(downloadsDir, 'weekly-investigation-report.md'), markdownProduct(weekly, 'Weekly Investigation Report'));
fs.writeFileSync(path.join(downloadsDir, 'investigation-source-ledger.md'), ['# Investigation Source Ledger', '', `Generated: ${status.updated}`, '', ...(registry.sources || []).map(source => { const current = state.sources?.[source.id] || {}; return `- ${source.label}: ${current.status || 'not-yet-run'}; last success ${current.lastSuccess || 'none'}; ${source.url}`; })].join('\n'));

const pulseJs = `(function(){
  if(document.querySelector('[data-investigation-pulse]'))return;
  function esc(s){return String(s||'').replace(/[&<>]/g,function(c){return c==='&'?'&amp;':c==='<'?'&lt;':'&gt;';});}
  fetch('/data/investigation-status.json',{cache:'no-store',headers:{Accept:'application/json'}}).then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json();}).then(function(s){
    var box=document.createElement('aside');box.setAttribute('data-investigation-pulse','true');box.className='wrap investigation-pulse';
    box.innerHTML='<strong>Investigation Machine:</strong> last source run '+esc(s.lastInvestigationRun||'pending')+' · '+esc(s.registeredSources)+' sources registered · '+esc(s.ledgerFindings)+' evidence findings · <a href="investigation-machine.html">open machine</a> · <a href="daily-investigation-conclusions.html">daily conclusions</a> · <a href="search.html">search</a>';
    var footer=document.querySelector('footer');if(footer&&footer.parentNode)footer.parentNode.insertBefore(box,footer);else document.body.appendChild(box);
  }).catch(function(){var box=document.createElement('aside');box.setAttribute('data-investigation-pulse','true');box.className='wrap investigation-pulse';box.innerHTML='<strong>Investigation Machine:</strong> status feed unavailable · <a href="investigation-source-ledger.html">check source ledger</a>';var footer=document.querySelector('footer');if(footer&&footer.parentNode)footer.parentNode.insertBefore(box,footer);});
})();`;
fs.writeFileSync(path.join(root, 'investigation-pulse.js'), pulseJs);

console.log(`Investigation pages built: ${(registry.sources || []).length} sources, ${(ledger.findings || []).length} findings, daily and weekly conclusions, global pulse status.`);
