const fs = require('fs');
const path = require('path');

const root = process.cwd();
const registryPath = path.join(root, 'data', 'criminal-conduct-registry.json');
const policyPath = path.join(root, 'data', 'predators-in-power-policy.json');
const pagePath = path.join(root, 'predators-in-power.html');
const dataPath = path.join(root, 'data', 'predators-in-power.json');
const downloadJsonPath = path.join(root, 'downloads', 'predators-in-power.json');
const downloadCsvPath = path.join(root, 'downloads', 'predators-in-power.csv');
const reportPath = path.join(root, 'downloads', 'predators-in-power-build-report.json');
const reviewQueuePath = path.join(root, 'downloads', 'criminal-conduct-review-queue.json');
const START = '<!-- predators-in-power-route:start -->';
const END = '<!-- predators-in-power-route:end -->';

for (const file of [registryPath, policyPath]) {
  if (!fs.existsSync(file)) throw new Error(`Missing required Predators in Power source: ${path.relative(root, file)}`);
}
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
const categories = registry.categories || {};
const conductDomains = policy.conductDomains || {};
const powerSectors = policy.powerSectors || {};
const failures = [];
const warnings = [];

function esc(value = '') {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function csv(value = '') {
  const text = String(value ?? '').replace(/\r?\n/g, ' ');
  return `"${text.replace(/"/g, '""')}"`;
}
function normalize(value = '') {
  return String(value || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}
function absoluteUrl(value = '') { return /^https?:\/\//i.test(String(value || '')); }
function routeFor(subjectKey, subject) {
  if (subject.dossierRoute) return subject.dossierRoute;
  if (/\.html$/i.test(subjectKey)) return subjectKey;
  if (subject.slug) return `dossier-${subject.slug}.html`;
  return '';
}
function titleFor(subjectKey, subject) {
  return String(subject.name || subject.title || subject.label || subjectKey.replace(/\.html$/i, '').replace(/^(?:dossier|profile|person|entity|institution)-/i, '').replace(/[-_]/g, ' ')).replace(/\b\w/g, letter => letter.toUpperCase()).trim();
}
function laneRank(category) {
  return ({
    conviction_final_judgment: 1,
    charge_indictment_complaint: 2,
    investigation_inquiry: 3,
    civil_regulatory_action: 4,
    substantiated_allegation: 5,
    suspected_conduct: 6,
    rumor_speculation: 7,
    exculpatory_disposition: 8
  })[category] || 99;
}
function roleSummary(role) {
  const dates = [role.from, role.to].filter(Boolean).join(' – ');
  return `${role.title || 'Role not stated'}${role.organization ? `, ${role.organization}` : ''}${dates ? ` (${dates})` : ''}`;
}
function validatePowerRole(subjectName, role, index) {
  for (const field of ['sector', 'title', 'organization', 'sourceLabel', 'sourceUrl', 'lastChecked']) {
    if (!String(role[field] || '').trim()) failures.push(`${subjectName}: power role ${index + 1} missing ${field}`);
  }
  if (role.sector && !powerSectors[role.sector]) failures.push(`${subjectName}: power role ${index + 1} has unknown sector ${role.sector}`);
  if (role.sourceUrl && !absoluteUrl(role.sourceUrl)) failures.push(`${subjectName}: power role ${index + 1} source URL is not absolute`);
}
function validateQualifyingRecord(subjectName, record) {
  const domains = Array.isArray(record.conductDomains) ? record.conductDomains : [];
  if (!domains.length) failures.push(`${subjectName}/${record.id || '(no id)'}: qualifying record missing conductDomains`);
  for (const domain of domains) if (!conductDomains[domain]) failures.push(`${subjectName}/${record.id || '(no id)'}: unknown conduct domain ${domain}`);
  if (!Array.isArray(record.victimClass) || !record.victimClass.length) failures.push(`${subjectName}/${record.id || '(no id)'}: qualifying record missing victimClass`);
  if (!categories[record.category]) failures.push(`${subjectName}/${record.id || '(no id)'}: unknown category ${record.category}`);
  if (!absoluteUrl(record.sourceUrl)) failures.push(`${subjectName}/${record.id || '(no id)'}: source URL is not absolute`);
}
function qualifyingRecords(subjectName, subject) {
  return (subject.records || []).filter(record => record.publicationStatus === 'approved' && record.predatorsInPowerEligible === true && Array.isArray(record.conductDomains) && record.conductDomains.some(domain => conductDomains[domain])).map(record => {
    validateQualifyingRecord(subjectName, record);
    return { ...record, conductDomains: [...new Set(record.conductDomains)], victimClass: [...new Set(record.victimClass || [])] };
  });
}

const subjects = [];
for (const [subjectKey, subject] of Object.entries(registry.subjects || {})) {
  if (subject.predatorsInPowerEligible !== true) continue;
  const name = titleFor(subjectKey, subject);
  const roles = Array.isArray(subject.powerRoles) ? subject.powerRoles : [];
  if (!roles.length) {
    failures.push(`${name}: marked Predators in Power eligible without a sourced power role`);
    continue;
  }
  roles.forEach((role, index) => validatePowerRole(name, role, index));
  const records = qualifyingRecords(name, subject);
  const substantive = records.filter(record => record.category !== 'exculpatory_disposition');
  if (!substantive.length) {
    warnings.push(`${name}: eligibility flag set but no approved qualifying conduct record; subject omitted`);
    continue;
  }
  const sorted = records.sort((a, b) => laneRank(a.category) - laneRank(b.category) || new Date(b.date || 0) - new Date(a.date || 0));
  const primary = sorted.find(record => record.category !== 'exculpatory_disposition') || sorted[0];
  subjects.push({
    key: subjectKey,
    name,
    aliases: subject.aliases || [],
    dossierRoute: routeFor(subjectKey, subject),
    subjectType: subject.subjectType || 'person',
    publicSummary: subject.publicSummary || '',
    powerRoles: roles,
    powerSectors: [...new Set(roles.map(role => role.sector).filter(Boolean))],
    records: sorted,
    primaryLane: primary.category,
    latestRecordDate: sorted.reduce((latest, record) => String(record.date || '') > latest ? String(record.date || '') : latest, ''),
    conductDomains: [...new Set(sorted.flatMap(record => record.conductDomains || []))],
    victimClasses: [...new Set(sorted.flatMap(record => record.victimClass || []))]
  });
}
subjects.sort((a, b) => laneRank(a.primaryLane) - laneRank(b.primaryLane) || String(b.latestRecordDate).localeCompare(String(a.latestRecordDate)) || a.name.localeCompare(b.name));
if (failures.length) throw new Error(`Predators in Power source validation failed: ${failures.join('; ')}`);

let reviewCandidates = [];
if (fs.existsSync(reviewQueuePath)) {
  try {
    const queue = JSON.parse(fs.readFileSync(reviewQueuePath, 'utf8'));
    const terms = Object.keys(conductDomains).flatMap(key => [key.replace(/_/g, ' '), conductDomains[key]]).map(normalize).filter(Boolean);
    reviewCandidates = (queue.candidates || []).filter(item => {
      const hay = normalize(`${item.title || ''} ${item.summary || ''} ${item.establishes || ''}`);
      return terms.some(term => term.length >= 5 && hay.includes(term));
    });
  } catch (error) {
    warnings.push(`Could not read criminal conduct review queue: ${error.message}`);
  }
}

const payload = {
  schemaVersion: 1,
  updated: new Date().toISOString(),
  title: policy.title,
  purpose: policy.purpose,
  eligibilityRule: policy.eligibilityRule,
  rankingRule: policy.rankingRule,
  boundary: 'The page title names an accountability project, not a legal finding about every listed subject. Each record retains its own legal and evidence classification. Charges, investigations and allegations are not convictions. Acquittals, dismissals, reversals, denials and right of reply remain visible.',
  count: subjects.length,
  reviewOnlyCandidateCount: reviewCandidates.length,
  conductDomains,
  powerSectors,
  categories,
  subjects
};
fs.mkdirSync(path.dirname(dataPath), { recursive: true });
fs.mkdirSync(path.dirname(downloadJsonPath), { recursive: true });
fs.writeFileSync(dataPath, `${JSON.stringify(payload, null, 2)}\n`);
fs.writeFileSync(downloadJsonPath, `${JSON.stringify(payload, null, 2)}\n`);

const csvRows = [['subject','dossier_route','subject_type','power_sectors','power_roles','record_id','legal_lane','conduct_domains','victim_class','record_date','jurisdiction','status','outcome','evidence_grade','source_label','source_url','right_of_reply','counter_evidence','proof_needed','boundary']];
for (const subject of subjects) for (const record of subject.records) csvRows.push([
  subject.name,
  subject.dossierRoute,
  subject.subjectType,
  subject.powerSectors.map(key => powerSectors[key] || key).join(' | '),
  subject.powerRoles.map(roleSummary).join(' | '),
  record.id,
  categories[record.category]?.label || record.category,
  (record.conductDomains || []).map(key => conductDomains[key] || key).join(' | '),
  (record.victimClass || []).join(' | '),
  record.date,
  record.jurisdiction || '',
  record.status || '',
  record.outcome || '',
  record.evidenceGrade || '',
  record.sourceLabel || '',
  record.sourceUrl || '',
  record.rightOfReply || '',
  record.counterEvidence || '',
  record.proofNeeded || '',
  record.boundary || ''
]);
fs.writeFileSync(downloadCsvPath, `${csvRows.map(row => row.map(csv).join(',')).join('\n')}\n`);

function roleCards(roles) {
  return roles.map(role => `<article class="pip-role"><span>${esc(powerSectors[role.sector] || role.sector)}</span><h4>${esc(role.title)}</h4><p>${esc(role.organization)}${role.from || role.to ? ` · ${esc([role.from, role.to].filter(Boolean).join(' – '))}` : ''}</p><a href="${esc(role.sourceUrl)}" target="_blank" rel="noopener noreferrer">Verify power role: ${esc(role.sourceLabel)}</a></article>`).join('');
}
function recordCards(records) {
  return records.map(record => `<article class="pip-record" data-lane="${esc(record.category)}" data-conduct="${esc((record.conductDomains || []).join(' '))}"><div class="pip-record__top"><span class="pip-lane">${esc(categories[record.category]?.label || record.category)}</span><span class="pip-grade">Evidence ${esc(record.evidenceGrade || 'not stated')}</span></div><h4>${esc(record.title)}</h4><p>${esc(record.summary)}</p><div class="pip-tags">${(record.conductDomains || []).map(key => `<span>${esc(conductDomains[key] || key)}</span>`).join('')}${(record.victimClass || []).map(value => `<span>Victim class: ${esc(value)}</span>`).join('')}</div><dl><div><dt>Date</dt><dd>${esc(record.date)}</dd></div><div><dt>Jurisdiction</dt><dd>${esc(record.jurisdiction || 'Not stated')}</dd></div><div><dt>Status</dt><dd>${esc(record.status || 'Not stated')}</dd></div><div><dt>Outcome</dt><dd>${esc(record.outcome || 'Not yet determined or not stated')}</dd></div><div><dt>Last checked</dt><dd>${esc(record.lastChecked || 'Not stated')}</dd></div></dl><p><strong>Right of reply / response:</strong> ${esc(record.rightOfReply || 'No documented response located in the approved record.')}</p><p><strong>Counter-evidence / limitation:</strong> ${esc(record.counterEvidence || 'No separate counter-evidence field is recorded.')}</p><p><strong>Proof needed:</strong> ${esc(record.proofNeeded || 'Further primary records may change the classification.')}</p><p class="pip-boundary"><strong>Boundary:</strong> ${esc(record.boundary || categories[record.category]?.boundary || '')}</p><a class="btn alt" href="${esc(record.sourceUrl)}" target="_blank" rel="noopener noreferrer">Open cited source: ${esc(record.sourceLabel)}</a></article>`).join('');
}
function subjectCards(items) {
  if (!items.length) return `<article class="card redline pip-empty"><h3>No approved qualifying subjects are published yet</h3><p>The engine is active. A name will appear only after a qualifying conduct record and a separately sourced power role pass editorial review. Machine matches and public submissions remain pending until verified.</p></article>`;
  return items.map((subject, index) => `<article class="pip-subject" data-pip-subject data-name="${esc(normalize(`${subject.name} ${(subject.aliases || []).join(' ')}`))}" data-lane="${esc(subject.primaryLane)}" data-sectors="${esc(subject.powerSectors.join(' '))}" data-conduct="${esc(subject.conductDomains.join(' '))}"><header><div><span class="label">Subject ${String(index + 1).padStart(3, '0')} · ${esc(categories[subject.primaryLane]?.label || subject.primaryLane)}</span><h2>${esc(subject.name)}</h2>${subject.publicSummary ? `<p>${esc(subject.publicSummary)}</p>` : ''}</div>${subject.dossierRoute ? `<a class="btn" href="${esc(subject.dossierRoute)}">Open Full Dossier</a>` : ''}</header><details open><summary>Documented power / influence roles</summary><div class="pip-role-grid">${roleCards(subject.powerRoles)}</div></details><details><summary>Conduct records and legal posture (${subject.records.length})</summary>${recordCards(subject.records)}</details></article>`).join('');
}

const option = (value, label) => `<option value="${esc(value)}">${esc(label)}</option>`;
const page = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>Predators in Power | Matrix Reprogrammed</title><meta name="description" content="Evidence-classified accountability index for sexual-offence and child-harm records involving people with documented public, corporate, institutional or cultural power."/><link rel="stylesheet" href="styles.css"/><style>.pip-hero{max-width:1100px}.pip-boundary-box{border:1px solid rgba(255,74,74,.5);background:rgba(120,0,0,.12);padding:1rem}.pip-filter-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:.8rem}.pip-filter-grid label{display:grid;gap:.4rem}.pip-filter-grid input,.pip-filter-grid select,.pip-signal input,.pip-signal select,.pip-signal textarea{width:100%;box-sizing:border-box}.pip-count{font-weight:900;letter-spacing:.08em}.pip-subject{border:1px solid rgba(255,80,80,.35);background:rgba(7,7,10,.94);padding:1rem;margin:1.2rem 0;box-shadow:0 0 28px rgba(120,0,0,.12)}.pip-subject>header{display:flex;justify-content:space-between;gap:1rem;align-items:flex-start}.pip-subject details{margin-top:1rem;border-top:1px solid rgba(255,255,255,.12);padding-top:.8rem}.pip-subject summary{cursor:pointer;font-weight:900}.pip-role-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:.8rem;margin-top:.8rem}.pip-role,.pip-record{border:1px solid rgba(255,255,255,.12);padding:.9rem;background:rgba(255,255,255,.025)}.pip-role span,.pip-lane,.pip-grade,.pip-tags span{display:inline-block;border:1px solid rgba(255,80,80,.42);padding:.18rem .45rem;font-size:.72rem;text-transform:uppercase;letter-spacing:.04em}.pip-record{margin:.9rem 0}.pip-record__top{display:flex;justify-content:space-between;gap:.6rem;flex-wrap:wrap}.pip-tags{display:flex;flex-wrap:wrap;gap:.4rem}.pip-record dl{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:.6rem}.pip-record dt{opacity:.7;text-transform:uppercase;font-size:.72rem}.pip-record dd{margin:0}.pip-boundary{border-left:3px solid #ff5050;padding-left:.8rem}.pip-signal{border:1px solid rgba(255,80,80,.4);padding:1rem}.pip-signal textarea{min-height:110px}.pip-hidden{display:none!important}@media(max-width:700px){.pip-subject>header{display:block}.pip-subject>header .btn{margin-top:.8rem;display:inline-block}}</style></head><body><canvas id="matrix"></canvas><div class="signal-face"></div><div class="veil"></div><div class="page"><header class="wrap topbar"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil"/> MATRIX REPROGRAMMED</a><nav class="nav"><a href="index.html">Home</a><a href="wrongdoing-tracker.html">Wrongdoing Tracker</a><a href="evidence-vault.html">Evidence</a><a href="claim-classifier.html">Claim Classifier</a><a href="source-document-vault.html">Sources</a><a href="forum.html">Signal Board</a></nav></header><main><section class="hero wrap pip-hero"><div class="eyebrow">Accountability Intelligence Layer</div><h1>PREDATORS IN POWER.</h1><p class="lead">A source-first index of sexual-offence and child-harm records involving people with documented public, corporate, institutional, financial, religious, media, sporting or cultural power.</p><div class="cta-row"><a class="btn" href="#pip-index">Open Index</a><a class="btn alt" href="#pip-signal-drop">Submit Evidence</a><a class="btn alt" href="downloads/predators-in-power.json">Download JSON</a><a class="btn alt" href="downloads/predators-in-power.csv">Download CSV</a></div></section><section class="section wrap"><div class="pip-boundary-box"><h2>Read the legal lane before the name</h2><p><strong>The page title is the name of an accountability project, not a blanket legal finding.</strong> Convictions are separated from charges, investigations, civil findings, attributed allegations, analytical hypotheses and unverified claims. Charges and investigations are not proof of guilt. Association, employment, office, fame or proximity is not wrongdoing. Acquittals, dismissals, reversals, denials and right of reply remain attached to the record.</p></div></section><section class="section wrap split"><div class="terminal">PREDATORS IN POWER ENGINE\n&gt; Published qualifying subjects: ${subjects.length}\n&gt; Approved conduct records: ${subjects.reduce((sum, subject) => sum + subject.records.length, 0)}\n&gt; Review-only machine candidates: ${reviewCandidates.length}\n&gt; Power-role source required: YES\n&gt; Conduct source required: YES\n&gt; Anonymous claims auto-published: NO\n&gt; Predator score: DISABLED</div><aside class="card redline"><h2>Who qualifies as “in power”?</h2><p>Public office, senior government authority, company ownership or management, boards, finance and trusts, religious or educational authority, law enforcement or military command, healthcare access, media and entertainment influence, sports governance, foundations, major donors, advisers, lobbyists, technology platforms and other documented gatekeeping roles.</p></aside></section><section id="pip-index" class="section wrap"><h2>Evidence-Classified Index</h2><div class="pip-filter-grid"><label>Search name or alias<input id="pip-search" type="search" placeholder="Search subjects"/></label><label>Legal / evidence lane<select id="pip-lane"><option value="">All lanes</option>${Object.entries(categories).map(([key, value]) => option(key, value.label)).join('')}</select></label><label>Power sector<select id="pip-sector"><option value="">All power sectors</option>${Object.entries(powerSectors).map(([key, value]) => option(key, value)).join('')}</select></label><label>Conduct type<select id="pip-conduct"><option value="">All conduct types</option>${Object.entries(conductDomains).map(([key, value]) => option(key, value)).join('')}</select></label></div><p id="pip-result-count" class="pip-count">${subjects.length} qualifying subject${subjects.length === 1 ? '' : 's'} shown</p><div id="pip-subject-list">${subjectCards(subjects)}</div></section><section class="section wrap"><h2>Classification Lanes</h2><div class="grid">${Object.entries(categories).map(([key, value]) => `<article class="card"><span class="label">${esc(value.classification)}</span><h3>${esc(value.label)}</h3><p>${esc(value.boundary)}</p></article>`).join('')}</div></section><section id="pip-signal-drop" class="section wrap"><h2>Predators in Power Signal Drop</h2><p class="lead">Submit a public source for pending editorial review. Do not submit illegal imagery, explicit material, private victim information, addresses, medical records or identifying details about children.</p><form id="pip-signal-form" class="pip-signal" method="post" action="/submit-forum-post"><input type="hidden" name="board" value="main"/><input type="hidden" name="category" value="Predators in Power Source Drop"/><input type="hidden" name="title" value="Predators in Power Source Review"/><input type="hidden" name="body" value=""/><input type="hidden" name="legalSensitive" value="yes"/><div class="pip-filter-grid"><label>Subject name<input name="subjectName" maxlength="180" required/></label><label>Documented power role<input name="powerRole" maxlength="240" required/></label><label>Power sector<select name="powerSector" required><option value="">Choose sector</option>${Object.entries(powerSectors).map(([key, value]) => option(key, value)).join('')}</select></label><label>Conduct type<select name="conductDomain" required><option value="">Choose conduct type</option>${Object.entries(conductDomains).map(([key, value]) => option(key, value)).join('')}</select></label><label>Claim / legal lane<select name="legalLane" required><option value="">Choose lane</option>${Object.entries(categories).map(([key, value]) => option(key, value.label)).join('')}</select></label><label>Jurisdiction<input name="jurisdiction" maxlength="160"/></label><label>Record date<input name="recordDate" type="date"/></label><label>Source URL<input name="sourceUrl" type="url" placeholder="https://..." required/></label><label>Source label<input name="sourceLabel" maxlength="220" placeholder="Court, police, regulator, filing or attributable publisher" required/></label><label>Power-role source URL<input name="roleSourceUrl" type="url" placeholder="https://..." required/></label></div><label>What the source establishes<textarea name="establishes" maxlength="2400" required></textarea></label><label>What the source does not establish<textarea name="doesNotEstablish" maxlength="1800" required></textarea></label><label>Known outcome, denial, response, acquittal, dismissal or counter-evidence<textarea name="response" maxlength="2200" required></textarea></label><label>What record would confirm, upgrade, downgrade or disprove the claim<textarea name="proofNeeded" maxlength="1800" required></textarea></label><label><input type="checkbox" name="victimSafety" value="confirmed" required style="width:auto"/> I have omitted private victim information and all identifying details about children.</label><p class="mini">The submission enters pending review. It cannot add a name, alter a dossier or change an evidence lane until identity, source scope, legal posture, outcome, power role and right of reply are checked.</p><button class="btn" type="submit">Submit for Editorial Review</button></form></section><section class="section wrap"><h2>Victim and Survivor Safety</h2><div class="grid">${(policy.victimSafetyRules || []).map(rule => `<article class="card"><p>${esc(rule)}</p></article>`).join('')}</div></section></main><footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — evidence before inference, source before accusation, outcome before conclusion.</p><p class="warning">Corrections and documented responses must remain attached to the same record. The page is not a substitute for court records, law-enforcement reporting or safeguarding services.</p></footer></div><script src="matrix.js"></script><script>(()=>{const cards=[...document.querySelectorAll('[data-pip-subject]')];const search=document.getElementById('pip-search');const lane=document.getElementById('pip-lane');const sector=document.getElementById('pip-sector');const conduct=document.getElementById('pip-conduct');const count=document.getElementById('pip-result-count');function apply(){const q=(search.value||'').trim().toLowerCase();let visible=0;for(const card of cards){const ok=(!q||card.dataset.name.includes(q))&&(!lane.value||card.dataset.lane===lane.value)&&(!sector.value||card.dataset.sectors.split(' ').includes(sector.value))&&(!conduct.value||card.dataset.conduct.split(' ').includes(conduct.value));card.classList.toggle('pip-hidden',!ok);if(ok)visible++;}count.textContent=visible+' qualifying subject'+(visible===1?'':'s')+' shown';}for(const control of [search,lane,sector,conduct])control.addEventListener(control===search?'input':'change',apply);const form=document.getElementById('pip-signal-form');form.addEventListener('submit',()=>{const v=name=>form.elements[name]?.value?.trim?.()||'';form.elements.body.value=['[PREDATORS IN POWER SOURCE DROP]','Subject: '+v('subjectName'),'Documented power role: '+v('powerRole'),'Power sector: '+v('powerSector'),'Power-role source: '+v('roleSourceUrl'),'Conduct type: '+v('conductDomain'),'Claim / legal lane: '+v('legalLane'),'Jurisdiction: '+(v('jurisdiction')||'not stated'),'Record date: '+(v('recordDate')||'not stated'),'Conduct source: '+v('sourceUrl'),'Source label: '+v('sourceLabel'),'What it establishes: '+v('establishes'),'What it does not establish: '+v('doesNotEstablish'),'Outcome / response / counter-evidence: '+v('response'),'Proof needed: '+v('proofNeeded'),'Victim-safety confirmation: '+(form.elements.victimSafety.checked?'yes':'no'),'Publication status: pending editorial review'].join('\n')})})();</script></body></html>\n`;
/* exposure-integrity-canonical-predators-link */
const exposureHitListBlock = '<!-- exposure-predators-hit-list:start --><section class="section wrap"><article class="card redline"><span class="label">Connected Exposure Integrity System</span><h2>From safeguarding record to the wider power map</h2><p>Open the cinematic Hit List to see what is documented, what is alleged, what remains unproven, which power mechanism matters, which records are missing and where the investigation goes next.</p><div class="cta-row"><a class="btn" href="/hit-list.html">Open the Hit List</a><a class="btn alt" href="/timers.html">Follow Risk Timers</a><a class="btn alt" href="/source-document-vault.html">Verify Sources</a><a class="btn alt" href="/trust-corrections.html">Corrections and Right of Reply</a></div></article></section><!-- exposure-predators-hit-list:end -->';
const exposureBoundaryAnchor = '<section class="section wrap"><div class="pip-boundary-box">';
const exposureLinkedPage = page.includes('href="/hit-list.html"')
  ? page
  : page.includes(exposureBoundaryAnchor)
    ? page.replace(exposureBoundaryAnchor, exposureHitListBlock + exposureBoundaryAnchor)
    : page.replace('</main>', exposureHitListBlock + '</main>');
if (!exposureLinkedPage.includes('href="/hit-list.html"') || !exposureLinkedPage.includes('Connected Exposure Integrity System')) {
  throw new Error('Canonical Predators generator failed to embed the Exposure Integrity Hit List route');
}
fs.writeFileSync(pagePath, exposureLinkedPage);

function patchRouteLink(file) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return false;
  const before = fs.readFileSync(file, 'utf8');
  const block = `${START}<section class="section wrap"><article class="card redline"><span class="label">Accountability Intelligence</span><h2>Predators in Power</h2><p>Open the evidence-classified index for sexual-offence and child-harm records involving people with documented public, corporate, institutional or cultural power.</p><div class="cta-row"><a class="btn" href="predators-in-power.html">Open Predators in Power</a><a class="btn alt" href="predators-in-power.html#pip-signal-drop">Submit Evidence</a></div></article></section>${END}`;
  let clean = before;
  const start = clean.indexOf(START);
  const end = clean.indexOf(END);
  if (start >= 0 && end > start) clean = clean.slice(0, start) + clean.slice(end + END.length);
  if (/<\/main>/i.test(clean)) clean = clean.replace(/<\/main>/i, `${block}</main>`);
  else if (/<footer\b/i.test(clean)) clean = clean.replace(/<footer\b/i, `${block}<footer`);
  else return false;
  if (clean !== before) fs.writeFileSync(file, clean);
  return true;
}
const linked = [];
for (const relative of ['index.html', 'wrongdoing-tracker.html', 'evidence-vault.html', 'subject-index.html']) {
  if (patchRouteLink(path.join(root, relative))) linked.push(relative);
}

const report = {
  ok: true,
  generatedAt: new Date().toISOString(),
  page: 'predators-in-power.html',
  publicData: 'data/predators-in-power.json',
  downloads: ['downloads/predators-in-power.json', 'downloads/predators-in-power.csv'],
  qualifyingSubjects: subjects.length,
  approvedRecords: subjects.reduce((sum, subject) => sum + subject.records.length, 0),
  reviewOnlyCandidates: reviewCandidates.length,
  linkedRoutes: linked,
  warnings,
  boundary: payload.boundary
};
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Predators in Power built: ${subjects.length} qualifying subject(s), ${report.approvedRecords} approved record(s), ${reviewCandidates.length} review-only candidate(s), ${linked.length} route link(s).`);
