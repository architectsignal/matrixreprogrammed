'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const files = {
  payload: path.join(root, 'data', 'predators-in-power.json'),
  registry: path.join(root, 'data', 'criminal-conduct-registry.json'),
  office: path.join(root, 'data', 'current-office-holders.json'),
  policy: path.join(root, 'data', 'predators-in-power-expansion-policy.json'),
  report: path.join(root, 'downloads', 'predators-in-power-expansion-report.json'),
  current: path.join(root, 'downloads', 'predators-in-power-current-power.json'),
  child: path.join(root, 'downloads', 'predators-in-power-child-focus.json'),
  claims: path.join(root, 'downloads', 'predators-in-power-claims-review.json'),
  page: path.join(root, 'predators-in-power.html'),
  patch: path.join(root, 'scripts', 'patch-predators-rumor-ledger.js'),
  output: path.join(root, 'downloads', 'predators-in-power-expansion-test.json')
};
const failures = [];

function readJson(file) {
  if (!fs.existsSync(file)) throw new Error(`Missing Predators expansion artifact: ${path.relative(root, file)}`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function normalize(value = '') {
  return String(value || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}
function absolute(value = '') { return /^https:\/\//i.test(String(value || '')); }
function ageDays(value) {
  const time = Date.parse(value || '');
  return Number.isFinite(time) ? Math.floor((Date.now() - time) / 86400000) : Infinity;
}
function statusMatches(value, allowed) {
  const token = normalize(value);
  return allowed.some(item => token === normalize(item) || token.includes(normalize(item)));
}
function hasText(value) { return Boolean(String(value || '').trim()); }

const payload = readJson(files.payload);
const registry = readJson(files.registry);
const office = fs.existsSync(files.office) ? readJson(files.office) : { holders: [] };
const policy = readJson(files.policy);
const report = readJson(files.report);
const current = readJson(files.current);
const child = readJson(files.child);
const claims = readJson(files.claims);
const page = fs.existsSync(files.page) ? fs.readFileSync(files.page, 'utf8') : '';
const patch = fs.existsSync(files.patch) ? fs.readFileSync(files.patch, 'utf8') : '';
const childDomains = new Set(policy.childFocusDomains || []);

if (!report.ok) failures.push('expansion build report is not ok');
if (Number(payload.schemaVersion || 0) < 2) failures.push('expanded Predators payload must use schemaVersion >= 2');
if (!payload.expansion) failures.push('expanded Predators payload missing expansion metadata');
if (!Array.isArray(payload.subjects) || !payload.subjects.length) failures.push('expanded Predators payload has no subjects');
if (Number(policy.schemaVersion || 0) < 2) failures.push('rumor-ledger policy must use schemaVersion >= 2');
for (const field of ['siteWideRumorPrinciple', 'claimsReviewRule', 'publicRumorRule', 'anonymousRumorRule', 'scoringRule']) {
  if (!hasText(policy[field])) failures.push(`rumor-ledger policy missing ${field}`);
}
if (current.count !== (current.subjects || []).length) failures.push('current-power output count mismatch');
if (child.count !== (child.subjects || []).length) failures.push('child-focus output count mismatch');
if ((claims.publicClaims || []).length !== Number(claims.publicApprovedClaimCount || 0)) failures.push('claims-review public suspected-conduct count mismatch');
if ((claims.namedRumors || []).length !== Number(claims.namedRumorCount || 0)) failures.push('named rumor count mismatch');
if ((claims.anonymizedRumors || []).length !== Number(claims.anonymizedRumorCount || 0)) failures.push('anonymized rumor count mismatch');
if (Number(claims.totalRumorCount || 0) !== Number(claims.namedRumorCount || 0) + Number(claims.anonymizedRumorCount || 0)) failures.push('total rumor count mismatch');
if (!patch.includes('function rumorLedgerEligible(record)') || !patch.includes('zero verified-evidence weight')) failures.push('rumor-ledger patch contract is missing');

const published = new Map((payload.subjects || []).map(subject => [normalize(subject.name), subject]));
const qualifying = [];
for (const [key, subject] of Object.entries(registry.subjects || {})) {
  const name = String(subject.name || subject.title || subject.label || key);
  const records = (subject.records || []).filter(record => record.publicationStatus === 'approved' && Array.isArray(record.conductDomains) && record.conductDomains.some(domain => childDomains.has(domain)));
  const roles = Array.isArray(subject.powerRoles) ? subject.powerRoles : [];
  const isCurrentOffice = (office.holders || []).some(holder => normalize(holder.name) === normalize(name) || normalize(holder.styledName || '') === normalize(name));
  if (records.length && (roles.length || isCurrentOffice)) qualifying.push(name);
}
for (const name of qualifying) if (!published.has(normalize(name))) failures.push(`qualifying child-focused subject omitted: ${name}`);

let payloadRumorRecords = 0;
for (const subject of payload.subjects || []) {
  if (!['current', 'former', 'unknown'].includes(subject.powerStatus)) failures.push(`${subject.name}: invalid powerStatus ${subject.powerStatus}`);
  if (!Array.isArray(subject.legalGroups)) failures.push(`${subject.name}: legalGroups missing`);
  const childRecords = (subject.records || []).filter(record => Array.isArray(record.conductDomains) && record.conductDomains.some(domain => childDomains.has(domain)));
  if (Boolean(childRecords.length) !== Boolean(subject.childFocused)) failures.push(`${subject.name}: childFocused flag mismatch`);
  if (childRecords.length !== Number(subject.childFocusedRecordCount || 0)) failures.push(`${subject.name}: child-focused record count mismatch`);

  if (subject.powerStatus === 'current') {
    const currentRoles = (subject.powerRoles || []).filter(role => statusMatches(role.status || role.to, policy.currentRoleStatuses || []));
    const officeMatch = (office.holders || []).find(holder => normalize(holder.name) === normalize(subject.name) || normalize(holder.styledName || '') === normalize(subject.name));
    if (!currentRoles.length && !officeMatch) failures.push(`${subject.name}: current power status lacks a current sourced role`);
    for (const role of currentRoles) {
      if (!absolute(role.sourceUrl)) failures.push(`${subject.name}: current role source is not HTTPS`);
      if (ageDays(role.lastChecked) > Number(policy.freshnessDays || 120)) failures.push(`${subject.name}: current role source is stale`);
    }
    if (officeMatch && !absolute(officeMatch.sourceUrl)) failures.push(`${subject.name}: current office registry source is not HTTPS`);
  }

  for (const record of childRecords) {
    if (record.category === 'suspected_conduct' && record.publicationStatus === 'approved') {
      if (record.legalReviewStatus !== 'approved') failures.push(`${subject.name}/${record.id}: published suspected-conduct claim lacks approved legal review`);
      for (const field of ['sourceUrl', 'sourceLabel', 'rightOfReply', 'counterEvidence', 'proofNeeded', 'boundary']) {
        if (!hasText(record[field])) failures.push(`${subject.name}/${record.id}: reviewed suspected-conduct claim missing ${field}`);
      }
      if (!absolute(record.sourceUrl)) failures.push(`${subject.name}/${record.id}: reviewed suspected-conduct source is not HTTPS`);
    }
    if (record.category === 'rumor_speculation') payloadRumorRecords++;
  }
}

for (const item of claims.publicClaims || []) {
  const record = item.record || {};
  if (record.category !== 'suspected_conduct') failures.push(`${item.subject}: public approved-claim output contains a non-suspected lane`);
  if (record.publicationStatus !== 'approved' || record.legalReviewStatus !== 'approved') failures.push(`${item.subject}: public suspected-conduct claim lacks editorial and legal approval`);
  if (!absolute(record.sourceUrl)) failures.push(`${item.subject}: public suspected-conduct source is not HTTPS`);
}

for (const item of claims.namedRumors || []) {
  const record = item.record || {};
  if (!hasText(item.subject)) failures.push('named rumor missing subject');
  if (record.category !== 'rumor_speculation') failures.push(`${item.subject || '(unnamed)'}: named rumor has wrong category`);
  if (!absolute(record.sourceUrl) || !hasText(record.sourceLabel)) failures.push(`${item.subject || '(unnamed)'}: named rumor lacks attributable public source`);
  for (const field of ['summary', 'verificationState', 'rightOfReply', 'counterEvidence', 'proofNeeded', 'boundary']) {
    if (!hasText(record[field])) failures.push(`${item.subject || '(unnamed)'}/${record.id || '(no id)'}: named rumor missing ${field}`);
  }
}

for (const item of claims.anonymizedRumors || []) {
  for (const forbidden of ['subject', 'name', 'person', 'target', 'privateSubject']) {
    if (forbidden in item) failures.push(`anonymized rumor ${item.rumorId || '(no id)'} exposes ${forbidden}`);
  }
  if (item.targetStatus !== 'identity withheld pending attribution') failures.push(`anonymized rumor ${item.rumorId || '(no id)'} missing identity-withheld status`);
  for (const field of ['rumorId', 'title', 'summary', 'sourceLabel', 'verificationState', 'proofNeeded', 'boundary']) {
    if (!hasText(item[field])) failures.push(`anonymized rumor ${item.rumorId || '(no id)'} missing ${field}`);
  }
}

if (Number(claims.totalRumorCount || 0) < payloadRumorRecords) failures.push('rumor ledger omits rumor records already attached to published subjects');
if ('candidates' in claims) failures.push('public rumor-ledger output must not expose private candidate records');
if (Number(report.totalRumors || 0) !== Number(claims.totalRumorCount || 0)) failures.push('build report rumor total does not match public rumor ledger');

for (const marker of [
  '<!-- predators-in-power-expansion:start -->',
  'data-pip-tab="current-power"',
  'data-pip-tab="former-power"',
  'data-pip-tab="convictions"',
  'data-pip-tab="charges"',
  'data-pip-tab="claims-review"',
  'Rumour / Speculation Ledger',
  'RUMOUR — NOT VERIFIED',
  'Total rumours retained:',
  'downloads/predators-in-power-current-power.json',
  'downloads/predators-in-power-child-focus.json',
  'downloads/predators-in-power-claims-review.json',
  "document.addEventListener('DOMContentLoaded'"
]) {
  if (!page.includes(marker)) failures.push(`Predators page missing ${marker}`);
}
if (page.includes('Unsupported rumors, anonymous claims, association-based insinuations and machine matches remain unpublished.')) failures.push('obsolete rumor-exclusion boundary remains on page');

const result = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  totalSubjects: (payload.subjects || []).length,
  qualifyingChildRegistrySubjects: qualifying.length,
  currentPowerSubjects: current.count,
  childFocusedSubjects: child.count,
  publicApprovedClaims: claims.publicApprovedClaimCount,
  namedRumors: claims.namedRumorCount,
  anonymizedRumors: claims.anonymizedRumorCount,
  totalRumors: claims.totalRumorCount,
  privateReviewCandidates: claims.privateReviewCandidateCount,
  autoAddedSubjects: report.autoAddedSubjects || [],
  failures,
  boundary: policy.boundary
};
fs.mkdirSync(path.dirname(files.output), { recursive: true });
fs.writeFileSync(files.output, `${JSON.stringify(result, null, 2)}\n`);
if (failures.length) {
  console.error('PREDATORS IN POWER EXPANSION TEST FAILED');
  failures.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}
console.log(`Predators in Power expansion test passed: ${result.totalSubjects} verified subject(s), ${result.qualifyingChildRegistrySubjects} qualifying child-focused registry subject(s), ${result.currentPowerSubjects} current/suspended power subject(s), ${result.publicApprovedClaims} legally reviewed suspected-conduct claim(s), and ${result.totalRumors} retained rumor/speculation ledger record(s).`);
