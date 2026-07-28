'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const basePath = path.join(root, 'data', 'predators-in-power.json');
const registryPath = path.join(root, 'data', 'criminal-conduct-registry.json');
const officePath = path.join(root, 'data', 'current-office-holders.json');
const policyPath = path.join(root, 'data', 'predators-in-power-expansion-policy.json');
const reviewPath = path.join(root, 'downloads', 'criminal-conduct-review-queue.json');
const pagePath = path.join(root, 'predators-in-power.html');
const reportPath = path.join(root, 'downloads', 'predators-in-power-expansion-report.json');
const currentPath = path.join(root, 'downloads', 'predators-in-power-current-power.json');
const childPath = path.join(root, 'downloads', 'predators-in-power-child-focus.json');
const claimsPath = path.join(root, 'downloads', 'predators-in-power-claims-review.json');
const csvPath = path.join(root, 'downloads', 'predators-in-power-expanded.csv');
const START = '<!-- predators-in-power-expansion:start -->';
const END = '<!-- predators-in-power-expansion:end -->';

for (const file of [basePath, registryPath, policyPath, pagePath]) {
  if (!fs.existsSync(file)) throw new Error(`Missing Predators expansion input: ${path.relative(root, file)}`);
}

const payload = JSON.parse(fs.readFileSync(basePath, 'utf8'));
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
const office = fs.existsSync(officePath) ? JSON.parse(fs.readFileSync(officePath, 'utf8')) : { holders: [] };
const reviewQueue = fs.existsSync(reviewPath) ? JSON.parse(fs.readFileSync(reviewPath, 'utf8')) : { candidates: [] };
const failures = [];
const warnings = [];

function esc(value = '') {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function csv(value = '') {
  return `"${String(value ?? '').replace(/\r?\n/g, ' ').replace(/"/g, '""')}"`;
}
function normalize(value = '') {
  return String(value || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}
function unique(values = []) { return [...new Set(values.filter(Boolean))]; }
function absolute(value = '') { return /^https:\/\//i.test(String(value || '')); }
function laneRank(category) {
  return ({ conviction_final_judgment: 1, canonical_penal_judgment: 2, charge_indictment_complaint: 3, investigation_inquiry: 4, civil_regulatory_action: 5, substantiated_allegation: 6, suspected_conduct: 7, rumor_speculation: 8, exculpatory_disposition: 9 })[category] || 99;
}
function titleFor(key, subject) {
  return String(subject.name || subject.title || subject.label || key.replace(/\.html$/i, '').replace(/^(?:dossier|profile|person|entity|institution)-/i, '').replace(/[-_]/g, ' ')).replace(/\b\w/g, char => char.toUpperCase()).trim();
}
function routeFor(key, subject) {
  if (subject.dossierRoute) return subject.dossierRoute;
  if (/\.html$/i.test(key)) return key;
  return subject.slug ? `dossier-${subject.slug}.html` : '';
}
function statusToken(value = '') { return normalize(value).replace(/\s+/g, ' '); }
function statusIn(value, allowed) {
  const token = statusToken(value);
  return allowed.some(item => token === statusToken(item) || token.includes(statusToken(item)));
}
function dateAgeDays(value) {
  const time = Date.parse(value || '');
  return Number.isFinite(time) ? Math.floor((Date.now() - time) / 86400000) : Infinity;
}

const childDomains = new Set(policy.childFocusDomains || []);
const currentStatuses = policy.currentRoleStatuses || [];
const formerStatuses = policy.formerRoleStatuses || [];
const officeByName = new Map();
for (const holder of office.holders || []) {
  for (const name of [holder.name, holder.styledName, ...(holder.aliases || [])]) {
    if (name) officeByName.set(normalize(name), holder);
  }
}

function approvedChildRecords(subject) {
  return (subject.records || []).filter(record => record.publicationStatus === 'approved' && Array.isArray(record.conductDomains) && record.conductDomains.some(domain => childDomains.has(domain)));
}
function validateRole(subjectName, role, index) {
  for (const field of ['sector', 'title', 'organization', 'sourceLabel', 'sourceUrl', 'lastChecked']) {
    if (!String(role[field] || '').trim()) failures.push(`${subjectName}: power role ${index + 1} missing ${field}`);
  }
  if (role.sourceUrl && !absolute(role.sourceUrl)) failures.push(`${subjectName}: role ${index + 1} source must be HTTPS`);
}
function validateRecord(subjectName, record) {
  for (const field of ['id', 'category', 'title', 'summary', 'sourceLabel', 'sourceUrl', 'date', 'status', 'evidenceGrade', 'lastChecked', 'boundary']) {
    if (!String(record[field] || '').trim()) failures.push(`${subjectName}/${record.id || '(no id)'} missing ${field}`);
  }
  if (record.sourceUrl && !absolute(record.sourceUrl)) failures.push(`${subjectName}/${record.id}: source must be HTTPS`);
}
function officeRoleFor(name) {
  const holder = officeByName.get(normalize(name));
  if (!holder) return null;
  return {
    sector: 'public_office',
    title: holder.office,
    organization: holder.jurisdiction,
    from: holder.currentSince,
    to: 'present',
    status: 'current',
    sourceLabel: `Official current office-holder source for ${holder.jurisdiction}`,
    sourceUrl: holder.sourceUrl,
    lastChecked: String(office.checkedAt || '').slice(0, 10) || new Date().toISOString().slice(0, 10),
    evidenceClass: holder.evidenceClass || 'official-current-role'
  };
}
function powerStatus(name, roles) {
  const exactOffice = officeRoleFor(name);
  if (exactOffice) return { status: 'current', basis: 'official-current-office-holder-registry', currentRoles: [exactOffice] };
  const currentRoles = roles.filter(role => statusIn(role.status || role.to, currentStatuses));
  if (currentRoles.length) return { status: 'current', basis: 'sourced-power-role', currentRoles };
  if (roles.some(role => statusIn(role.status || role.to, formerStatuses))) return { status: 'former', basis: 'sourced-former-role', currentRoles: [] };
  return { status: 'unknown', basis: 'role-status-not-explicit', currentRoles: [] };
}
function legalGroups(records) {
  const categories = new Set(records.map(record => record.category));
  const groups = [];
  if (categories.has('conviction_final_judgment') || categories.has('canonical_penal_judgment')) groups.push('convictions');
  if (categories.has('charge_indictment_complaint')) groups.push('charges');
  if (categories.has('investigation_inquiry') || categories.has('civil_regulatory_action') || categories.has('substantiated_allegation')) groups.push('official-proceedings');
  if (categories.has('suspected_conduct') || categories.has('rumor_speculation')) groups.push('claims-review');
  if (categories.has('exculpatory_disposition')) groups.push('responses');
  return groups;
}
function publicClaimEligible(record) {
  if (!['suspected_conduct', 'rumor_speculation'].includes(record.category)) return false;
  return record.publicationStatus === 'approved' && record.legalReviewStatus === 'approved' && absolute(record.sourceUrl) && Boolean(record.sourceLabel && record.rightOfReply && record.counterEvidence && record.proofNeeded && record.boundary);
}

const subjectsByName = new Map();
for (const subject of payload.subjects || []) subjectsByName.set(normalize(subject.name), subject);
const qualifyingRegistryNames = [];
const autoAdded = [];

for (const [key, subject] of Object.entries(registry.subjects || {})) {
  const name = titleFor(key, subject);
  const records = approvedChildRecords(subject);
  let roles = Array.isArray(subject.powerRoles) ? [...subject.powerRoles] : [];
  const exactOfficeRole = officeRoleFor(name);
  if (exactOfficeRole && !roles.some(role => normalize(role.title) === normalize(exactOfficeRole.title) && normalize(role.organization) === normalize(exactOfficeRole.organization))) roles.push(exactOfficeRole);
  if (!records.length || !roles.length) continue;
  qualifyingRegistryNames.push(normalize(name));
  roles.forEach((role, index) => validateRole(name, role, index));
  records.forEach(record => validateRecord(name, record));
  if (subjectsByName.has(normalize(name))) continue;
  const sorted = [...records].sort((a, b) => laneRank(a.category) - laneRank(b.category) || String(b.date || '').localeCompare(String(a.date || '')));
  const primary = sorted.find(record => record.category !== 'exculpatory_disposition') || sorted[0];
  const added = {
    key,
    name,
    aliases: subject.aliases || [],
    dossierRoute: routeFor(key, subject),
    subjectType: subject.subjectType || 'person',
    publicSummary: subject.publicSummary || '',
    powerRoles: roles,
    powerSectors: unique(roles.map(role => role.sector)),
    records: sorted,
    primaryLane: primary.category,
    latestRecordDate: sorted.reduce((latest, record) => String(record.date || '') > latest ? String(record.date || '') : latest, ''),
    conductDomains: unique(sorted.flatMap(record => record.conductDomains || [])),
    victimClasses: unique(sorted.flatMap(record => record.victimClass || [])),
    autoIncludedByCoverageAudit: true
  };
  payload.subjects.push(added);
  subjectsByName.set(normalize(name), added);
  autoAdded.push(name);
}

payload.subjects = (payload.subjects || []).map(subject => {
  const childRecords = (subject.records || []).filter(record => Array.isArray(record.conductDomains) && record.conductDomains.some(domain => childDomains.has(domain)));
  const status = powerStatus(subject.name, subject.powerRoles || []);
  for (const role of status.currentRoles) {
    if (!absolute(role.sourceUrl)) failures.push(`${subject.name}: current role lacks official HTTPS source`);
    if (dateAgeDays(role.lastChecked) > Number(policy.freshnessDays || 120)) failures.push(`${subject.name}: current role source is stale (${role.lastChecked || 'not stated'})`);
  }
  return {
    ...subject,
    childFocusedRecordCount: childRecords.length,
    childFocused: childRecords.length > 0,
    powerStatus: status.status,
    powerStatusBasis: status.basis,
    legalGroups: legalGroups(subject.records || [])
  };
});

payload.subjects.sort((a, b) => laneRank(a.primaryLane) - laneRank(b.primaryLane) || String(b.latestRecordDate || '').localeCompare(String(a.latestRecordDate || '')) || a.name.localeCompare(b.name));
payload.schemaVersion = Math.max(Number(payload.schemaVersion || 1), 2);
payload.expansion = {
  updated: new Date().toISOString(),
  policy: 'data/predators-in-power-expansion-policy.json',
  coverageRule: policy.coverageRule,
  currentStatusRule: policy.currentStatusRule,
  claimsReviewRule: policy.claimsReviewRule,
  autoAddedSubjects: autoAdded,
  currentPowerCount: payload.subjects.filter(subject => subject.powerStatus === 'current').length,
  formerPowerCount: payload.subjects.filter(subject => subject.powerStatus === 'former').length,
  unknownPowerStatusCount: payload.subjects.filter(subject => subject.powerStatus === 'unknown').length,
  childFocusedSubjectCount: payload.subjects.filter(subject => subject.childFocused).length
};
payload.count = payload.subjects.length;

const missing = unique(qualifyingRegistryNames).filter(name => !subjectsByName.has(name));
for (const name of missing) failures.push(`Qualifying child-focused registry subject omitted: ${name}`);

const publicClaims = [];
let excludedClaimRecords = 0;
for (const subject of payload.subjects) {
  for (const record of subject.records || []) {
    if (!['suspected_conduct', 'rumor_speculation'].includes(record.category)) continue;
    if (!Array.isArray(record.conductDomains) || !record.conductDomains.some(domain => childDomains.has(domain))) continue;
    if (publicClaimEligible(record)) {
      publicClaims.push({
        subject: subject.name,
        dossierRoute: subject.dossierRoute,
        powerStatus: subject.powerStatus,
        record
      });
    } else {
      excludedClaimRecords++;
    }
  }
}

const privateReviewCandidates = Array.isArray(reviewQueue.candidates) ? reviewQueue.candidates.length : 0;
const currentSubjects = payload.subjects.filter(subject => subject.powerStatus === 'current');
const childSubjects = payload.subjects.filter(subject => subject.childFocused);

fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(basePath, `${JSON.stringify(payload, null, 2)}\n`);
fs.writeFileSync(path.join(root, 'downloads', 'predators-in-power.json'), `${JSON.stringify(payload, null, 2)}\n`);
fs.writeFileSync(currentPath, `${JSON.stringify({ updated: new Date().toISOString(), boundary: policy.boundary, count: currentSubjects.length, subjects: currentSubjects }, null, 2)}\n`);
fs.writeFileSync(childPath, `${JSON.stringify({ updated: new Date().toISOString(), boundary: policy.boundary, count: childSubjects.length, subjects: childSubjects }, null, 2)}\n`);
fs.writeFileSync(claimsPath, `${JSON.stringify({ updated: new Date().toISOString(), boundary: policy.claimsReviewRule, publicApprovedClaimCount: publicClaims.length, privateReviewCandidateCount: privateReviewCandidates, excludedUnreviewedClaimRecords: excludedClaimRecords, publicClaims }, null, 2)}\n`);

const rows = [['subject','power_status','power_status_basis','legal_groups','primary_lane','child_focused','child_record_count','power_sectors','dossier_route','latest_record_date']];
for (const subject of payload.subjects) rows.push([subject.name, subject.powerStatus, subject.powerStatusBasis, (subject.legalGroups || []).join(' | '), subject.primaryLane, subject.childFocused ? 'yes' : 'no', subject.childFocusedRecordCount, (subject.powerSectors || []).join(' | '), subject.dossierRoute || '', subject.latestRecordDate || '']);
fs.writeFileSync(csvPath, `${rows.map(row => row.map(csv).join(',')).join('\n')}\n`);

function removeExisting(html) {
  let next = html;
  while (true) {
    const start = next.indexOf(START);
    const end = next.indexOf(END, start + START.length);
    if (start < 0 || end < 0) break;
    next = next.slice(0, start) + next.slice(end + END.length);
  }
  return next;
}

const clientMap = Object.fromEntries(payload.subjects.map(subject => [normalize(subject.name), { powerStatus: subject.powerStatus, legalGroups: subject.legalGroups || [], childFocused: subject.childFocused }]));
const tabButtons = (policy.tabs || []).map((tab, index) => `<button type="button" class="pip-tab${index === 0 ? ' is-active' : ''}" data-pip-tab="${esc(tab.id)}">${esc(tab.label)}</button>`).join('');
const approvedClaimCards = publicClaims.length ? publicClaims.map(item => `<article class="pip-review-card"><span class="label">${esc(payload.categories?.[item.record.category]?.label || item.record.category)}</span><h3>${esc(item.subject)}</h3><p>${esc(item.record.summary)}</p><p><strong>What is not proven:</strong> ${esc(item.record.boundary)}</p><p><strong>Response / counter-evidence:</strong> ${esc(item.record.rightOfReply)} ${esc(item.record.counterEvidence)}</p><a class="btn alt" href="${esc(item.record.sourceUrl)}" target="_blank" rel="noopener noreferrer">Open attributable source</a></article>`).join('') : '<article class="card redline"><h3>No named claims passed the publication threshold</h3><p>Unsupported rumors, anonymous claims, association-based insinuations and machine matches remain unpublished. This tab records the review process, not guilt.</p></article>';
const expansionBlock = `${START}<style id="pip-expansion-style">.pip-tabs{display:flex;flex-wrap:wrap;gap:.55rem;margin:1rem 0}.pip-tab{border:1px solid rgba(255,80,80,.45);background:rgba(255,255,255,.025);color:inherit;padding:.65rem .8rem;cursor:pointer}.pip-tab.is-active{background:rgba(160,0,0,.3);box-shadow:0 0 16px rgba(255,0,0,.15)}.pip-tab-hidden{display:none!important}.pip-review-panel{border:1px solid rgba(255,80,80,.38);padding:1rem;margin:1rem 0}.pip-review-panel[hidden]{display:none}.pip-review-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:.8rem}.pip-review-card{border:1px solid rgba(255,255,255,.12);padding:1rem;background:rgba(255,255,255,.025)}</style><section class="pip-expansion-controls"><h3>Power Status and Legal Posture</h3><p class="mini">Current status requires a separately sourced, recently checked role. Former officials remain historical. Claims under review do not publish unsupported names.</p><div class="pip-tabs" role="tablist">${tabButtons}</div><p><a class="btn alt" href="downloads/predators-in-power-current-power.json">Current-power JSON</a> <a class="btn alt" href="downloads/predators-in-power-child-focus.json">Child-focus JSON</a> <a class="btn alt" href="downloads/predators-in-power-claims-review.json">Claims-review JSON</a></p></section><section id="pip-claims-review-panel" class="pip-review-panel" hidden><h2>Claims Under Review</h2><p><strong>Publicly approved named claims:</strong> ${publicClaims.length} · <strong>Private machine/submission candidates:</strong> ${privateReviewCandidates} · <strong>Unreviewed claim records excluded:</strong> ${excludedClaimRecords}</p><p>${esc(policy.claimsReviewRule)}</p><div class="pip-review-grid">${approvedClaimCards}</div></section><script id="pip-expansion-runtime">(()=>{const map=${JSON.stringify(clientMap)};const norm=v=>(v||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();const cards=[...document.querySelectorAll('[data-pip-subject]')];for(const card of cards){const name=norm(card.querySelector('h2')?.textContent||'');const meta=map[name]||{powerStatus:'unknown',legalGroups:[],childFocused:false};card.dataset.powerStatus=meta.powerStatus;card.dataset.legalGroups=meta.legalGroups.join(' ');card.dataset.childFocused=meta.childFocused?'yes':'no';}const buttons=[...document.querySelectorAll('[data-pip-tab]')];const panel=document.getElementById('pip-claims-review-panel');const count=document.getElementById('pip-result-count');let active='all';function apply(){let visible=0;for(const card of cards){let show=true;if(active==='current-power')show=card.dataset.powerStatus==='current';else if(active==='former-power')show=card.dataset.powerStatus==='former'||card.dataset.powerStatus==='unknown';else if(active==='convictions')show=card.dataset.legalGroups.split(' ').includes('convictions');else if(active==='charges')show=card.dataset.legalGroups.split(' ').some(value=>value==='charges'||value==='official-proceedings');else if(active==='claims-review')show=false;card.classList.toggle('pip-tab-hidden',!show);if(show&&!card.classList.contains('pip-hidden'))visible++;}if(panel)panel.hidden=active!=='claims-review';if(count)count.textContent=active==='claims-review'?'Claims-review methodology and approved records shown below':visible+' qualifying subject'+(visible===1?'':'s')+' shown';}for(const button of buttons)button.addEventListener('click',()=>{active=button.dataset.pipTab||'all';buttons.forEach(item=>item.classList.toggle('is-active',item===button));apply();});for(const control of ['pip-search','pip-lane','pip-sector','pip-conduct'].map(id=>document.getElementById(id)).filter(Boolean)){control.addEventListener(control.id==='pip-search'?'input':'change',()=>setTimeout(apply,0));}apply();})();</script>${END}`;

let html = removeExisting(fs.readFileSync(pagePath, 'utf8'));
if (!html.includes('id="pip-index"')) failures.push('Predators page missing pip-index injection target');
else html = html.replace(/(<section id="pip-index"[\s\S]*?<h2>Evidence-Classified Index<\/h2>)/i, `$1${expansionBlock}`);
fs.writeFileSync(pagePath, html);

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  totalSubjects: payload.subjects.length,
  qualifyingChildRegistrySubjects: unique(qualifyingRegistryNames).length,
  autoAddedSubjects: autoAdded,
  currentPowerSubjects: currentSubjects.length,
  formerPowerSubjects: payload.subjects.filter(subject => subject.powerStatus === 'former').length,
  unknownPowerStatusSubjects: payload.subjects.filter(subject => subject.powerStatus === 'unknown').length,
  childFocusedSubjects: childSubjects.length,
  publicApprovedClaims: publicClaims.length,
  privateReviewCandidates,
  excludedUnreviewedClaimRecords: excludedClaimRecords,
  outputs: [path.relative(root, currentPath), path.relative(root, childPath), path.relative(root, claimsPath), path.relative(root, csvPath)],
  warnings,
  failures,
  boundary: policy.boundary
};
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (failures.length) {
  failures.forEach(item => console.error(`PREDATORS EXPANSION FAILURE: ${item}`));
  process.exit(1);
}
console.log(`Predators in Power expanded: ${payload.subjects.length} verified subject(s), ${currentSubjects.length} current/suspended power, ${childSubjects.length} child-focused, ${autoAdded.length} auto-added coverage omission(s), ${publicClaims.length} publicly approved claim record(s); unsupported claims remain private.`);
