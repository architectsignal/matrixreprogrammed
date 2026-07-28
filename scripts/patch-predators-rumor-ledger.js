'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const target = path.join(root, 'scripts', 'expand-predators-in-power.js');
const marker = 'function rumorLedgerEligible(record)';

if (!fs.existsSync(target)) throw new Error('Missing expand-predators-in-power.js');
let source = fs.readFileSync(target, 'utf8');

function syntaxCheck() {
  const result = spawnSync(process.execPath, ['--check', target], {
    cwd: root,
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 10 * 1024 * 1024
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) throw new Error('Rumor-ledger patched expansion builder failed syntax validation');
}

function replaceRequired(label, pattern, replacement) {
  if (!pattern.test(source)) throw new Error(`Rumor-ledger patch anchor missing: ${label}`);
  source = source.replace(pattern, replacement);
}

if (source.includes(marker)) {
  syntaxCheck();
  console.log('Predators rumor/speculation ledger patch already applied and syntax-valid.');
  process.exit(0);
}

const eligibilityBlock = `function publicClaimEligible(record) {
  if (record.category !== 'suspected_conduct') return false;
  return record.publicationStatus === 'approved' && record.legalReviewStatus === 'approved' && absolute(record.sourceUrl) && Boolean(record.sourceLabel && record.rightOfReply && record.counterEvidence && record.proofNeeded && record.boundary);
}
function rumorLedgerEligible(record) {
  return record && record.category === 'rumor_speculation';
}
function namedRumorEligible(record) {
  return rumorLedgerEligible(record) && absolute(record.sourceUrl) && Boolean(String(record.sourceLabel || '').trim());
}
function rumorState(record) {
  const allowed = new Set(policy.rumorStates || []);
  const explicit = String(record.verificationState || record.rumorState || '').trim();
  if (allowed.has(explicit)) return explicit;
  const status = normalize(record.status || '');
  for (const candidate of ['disproved', 'contradicted', 'unsupported', 'partially-corroborated', 'corroborated-not-proven', 'promoted-to-evidence-lane']) {
    if (status.includes(normalize(candidate))) return candidate;
  }
  return namedRumorEligible(record) ? 'publicly-circulating' : 'submitted-unverified';
}
function escapeRegExp(value = '') {
  return String(value).replace(/[.*+?^$\{\}()|[\]\\]/g, '\\$&');
}
function redactRumorText(value, subject = {}) {
  let text = String(value || '').trim() || 'Unverified submission awaiting structured review.';
  const names = unique([subject.name, ...(subject.aliases || [])]).sort((a, b) => String(b).length - String(a).length);
  for (const name of names) {
    if (!String(name || '').trim()) continue;
    text = text.replace(new RegExp(escapeRegExp(name), 'gi'), '[subject withheld pending attribution]');
  }
  return text;
}
function normalizedRumorRecord(record, fallbackId) {
  return {
    ...record,
    id: String(record.id || fallbackId || 'rumor-unassigned'),
    category: 'rumor_speculation',
    title: String(record.title || 'Unverified rumor or speculation'),
    summary: String(record.summary || record.claim || record.description || 'Unverified claim awaiting structured review.'),
    sourceLabel: String(record.sourceLabel || record.claimOrigin || record.source || 'Anonymous or unattributed submission'),
    sourceUrl: absolute(record.sourceUrl) ? record.sourceUrl : '',
    date: String(record.date || record.firstSeen || record.createdAt || new Date().toISOString().slice(0, 10)),
    status: rumorState(record),
    verificationState: rumorState(record),
    rightOfReply: String(record.rightOfReply || 'No response located or requested yet.'),
    counterEvidence: String(record.counterEvidence || 'No counter-evidence assessment completed yet.'),
    proofNeeded: String(record.proofNeeded || 'An attributable source, independent corroboration, primary records and a documented response.'),
    boundary: String(record.boundary || policy.boundary || 'This is an unverified rumor and does not establish wrongdoing.')
  };
}

const subjectsByName`;

replaceRequired(
  'claim eligibility functions',
  /function publicClaimEligible\(record\) \{[\s\S]*?\n\}\n\nconst subjectsByName/,
  eligibilityBlock
);

const rumorCollectionBlock = `const publicClaims = [];
const namedRumors = [];
const anonymizedRumors = [];
const rumorKeys = new Set();

function childFocusedRecord(record) {
  return Array.isArray(record.conductDomains) && record.conductDomains.some(domain => childDomains.has(domain));
}
function addRumor(subject, rawRecord, sourceKind) {
  if (!rumorLedgerEligible(rawRecord) || !childFocusedRecord(rawRecord)) return;
  const record = normalizedRumorRecord(rawRecord, 'rumor-' + (rumorKeys.size + 1));
  const key = normalize(subject.name) + '|' + normalize(record.id) + '|' + normalize(record.summary);
  if (rumorKeys.has(key)) return;
  rumorKeys.add(key);
  if (namedRumorEligible(record)) {
    namedRumors.push({
      subject: subject.name,
      dossierRoute: subject.dossierRoute || '',
      powerStatus: subject.powerStatus || 'unknown',
      verificationState: rumorState(record),
      sourceKind,
      record
    });
    return;
  }
  anonymizedRumors.push({
    rumorId: record.id,
    sourceKind,
    targetStatus: 'identity withheld pending attribution',
    title: record.title,
    summary: redactRumorText(record.summary, subject),
    firstSeen: record.date,
    sourceLabel: record.sourceLabel,
    sourceUrl: record.sourceUrl,
    verificationState: rumorState(record),
    rightOfReply: record.rightOfReply,
    counterEvidence: record.counterEvidence,
    proofNeeded: record.proofNeeded,
    boundary: record.boundary
  });
}

for (const subject of payload.subjects) {
  for (const record of subject.records || []) {
    if (!childFocusedRecord(record)) continue;
    if (record.category === 'suspected_conduct' && publicClaimEligible(record)) {
      publicClaims.push({
        subject: subject.name,
        dossierRoute: subject.dossierRoute,
        powerStatus: subject.powerStatus,
        record
      });
    }
    if (record.category === 'rumor_speculation') addRumor(subject, record, 'published-subject-record');
  }
}

for (const [key, registrySubject] of Object.entries(registry.subjects || {})) {
  const name = titleFor(key, registrySubject);
  let roles = Array.isArray(registrySubject.powerRoles) ? [...registrySubject.powerRoles] : [];
  const exactOfficeRole = officeRoleFor(name);
  if (exactOfficeRole && !roles.some(role => normalize(role.title) === normalize(exactOfficeRole.title) && normalize(role.organization) === normalize(exactOfficeRole.organization))) roles.push(exactOfficeRole);
  const status = powerStatus(name, roles);
  const subject = {
    name,
    aliases: registrySubject.aliases || [],
    dossierRoute: routeFor(key, registrySubject),
    powerStatus: status.status
  };
  for (const record of registrySubject.records || []) {
    if (record.category === 'rumor_speculation') addRumor(subject, record, 'criminal-conduct-registry');
  }
}

const reviewCandidates = Array.isArray(reviewQueue.candidates) ? reviewQueue.candidates : [];
for (let index = 0; index < reviewCandidates.length; index += 1) {
  const candidate = reviewCandidates[index] || {};
  const privateTarget = {
    name: candidate.subject || candidate.name || candidate.person || candidate.target || '',
    aliases: candidate.aliases || []
  };
  const record = normalizedRumorRecord({
    ...candidate,
    id: candidate.id || 'community-rumor-' + (index + 1),
    category: 'rumor_speculation',
    title: candidate.title || 'Unverified community or machine-generated lead',
    summary: candidate.claim || candidate.summary || candidate.reason || candidate.description,
    sourceLabel: candidate.sourceLabel || candidate.source || 'Anonymous, community or machine-generated submission',
    verificationState: 'submitted-unverified'
  }, 'community-rumor-' + (index + 1));
  anonymizedRumors.push({
    rumorId: record.id,
    sourceKind: 'review-queue',
    targetStatus: 'identity withheld pending attribution',
    title: record.title,
    summary: redactRumorText(record.summary, privateTarget),
    firstSeen: record.date,
    sourceLabel: record.sourceLabel,
    sourceUrl: record.sourceUrl,
    verificationState: 'submitted-unverified',
    rightOfReply: record.rightOfReply,
    counterEvidence: record.counterEvidence,
    proofNeeded: record.proofNeeded,
    boundary: record.boundary
  });
}

const privateReviewCandidates =`;

replaceRequired(
  'rumor collection pipeline',
  /const publicClaims = \[\];[\s\S]*?\nconst privateReviewCandidates =/,
  rumorCollectionBlock
);

replaceRequired(
  'claims JSON output',
  /fs\.writeFileSync\(claimsPath, `\$\{JSON\.stringify\([^\n]+\n/,
  "fs.writeFileSync(claimsPath, JSON.stringify({ updated: new Date().toISOString(), boundary: policy.claimsReviewRule, publicApprovedClaimCount: publicClaims.length, namedRumorCount: namedRumors.length, anonymizedRumorCount: anonymizedRumors.length, totalRumorCount: namedRumors.length + anonymizedRumors.length, privateReviewCandidateCount: privateReviewCandidates, publicClaims, namedRumors, anonymizedRumors }, null, 2) + '\\n');\n"
);

const cardBlock = `const approvedClaimCards = publicClaims.map(item => '<article class="pip-review-card"><span class="label">ATTRIBUTED CLAIM — NOT A FINDING</span><h3>' + esc(item.subject) + '</h3><p>' + esc(item.record.summary) + '</p><p><strong>What is not proven:</strong> ' + esc(item.record.boundary) + '</p><p><strong>Response / counter-evidence:</strong> ' + esc(item.record.rightOfReply) + ' ' + esc(item.record.counterEvidence) + '</p><a class="btn alt" href="' + esc(item.record.sourceUrl) + '" target="_blank" rel="noopener noreferrer">Open attributable source</a></article>').join('');
const namedRumorCards = namedRumors.map(item => '<article class="pip-review-card" data-rumor-state="' + esc(item.verificationState) + '"><span class="label">RUMOUR — NOT VERIFIED</span><h3>' + esc(item.subject) + '</h3><p>' + esc(item.record.summary) + '</p><p><strong>Origin:</strong> ' + esc(item.record.sourceLabel) + ' · <strong>State:</strong> ' + esc(item.verificationState) + '</p><p><strong>Response / counter-evidence:</strong> ' + esc(item.record.rightOfReply) + ' ' + esc(item.record.counterEvidence) + '</p><p><strong>Evidence needed:</strong> ' + esc(item.record.proofNeeded) + '</p><p><strong>What it does not prove:</strong> ' + esc(item.record.boundary) + '</p><a class="btn alt" href="' + esc(item.record.sourceUrl) + '" target="_blank" rel="noopener noreferrer">Open original public source</a></article>').join('');
const anonymizedRumorCards = anonymizedRumors.map(item => '<article class="pip-review-card" data-rumor-state="' + esc(item.verificationState) + '"><span class="label">RUMOUR — NOT VERIFIED</span><h3>' + esc(item.title) + '</h3><p><strong>' + esc(item.targetStatus) + '.</strong> ' + esc(item.summary) + '</p><p><strong>Origin:</strong> ' + esc(item.sourceLabel) + ' · <strong>State:</strong> ' + esc(item.verificationState) + '</p><p><strong>Evidence needed:</strong> ' + esc(item.proofNeeded) + '</p><p><strong>What it does not prove:</strong> ' + esc(item.boundary) + '</p></article>').join('');
const ledgerCards = approvedClaimCards + namedRumorCards + anonymizedRumorCards || '<article class="card redline"><h3>No rumours currently recorded</h3><p>The ledger remains active and will show attributed rumours, redacted submissions and their eventual supported, contradicted or disproved outcomes.</p></article>';
const expansionBlock =`;

replaceRequired(
  'ledger card renderer',
  /const approvedClaimCards = [^\n]+\nconst expansionBlock =/,
  cardBlock
);

const textReplacements = [
  ['Claims under review do not publish unsupported names.', 'Rumours and speculation are shown in a separate ledger and never treated as verified findings.'],
  ['Claims-review JSON', 'Rumour-ledger JSON'],
  ['<h2>Claims Under Review</h2>', '<h2>Rumour / Speculation Ledger</h2>'],
  ['<strong>Publicly approved named claims:</strong> ${publicClaims.length} · <strong>Private machine/submission candidates:</strong> ${privateReviewCandidates} · <strong>Unreviewed claim records excluded:</strong> ${excludedClaimRecords}', '<strong>Legally reviewed suspected-conduct claims:</strong> ${publicClaims.length} · <strong>Named attributable rumours:</strong> ${namedRumors.length} · <strong>Redacted anonymous/unattributed rumours:</strong> ${anonymizedRumors.length} · <strong>Total rumours retained:</strong> ${namedRumors.length + anonymizedRumors.length}'],
  ['${approvedClaimCards}</div>', '${ledgerCards}</div>'],
  ["'Claims-review methodology and approved records shown below'", "'Rumour and speculation ledger shown below'"]
];
for (const [before, after] of textReplacements) {
  if (!source.includes(before)) throw new Error(`Rumor-ledger text anchor missing: ${before}`);
  source = source.replace(before, after);
}

replaceRequired(
  'expansion report rumor fields',
  /  publicApprovedClaims: publicClaims\.length,\n  privateReviewCandidates,\n  excludedUnreviewedClaimRecords: excludedClaimRecords,/,
  "  publicApprovedClaims: publicClaims.length,\n  namedRumors: namedRumors.length,\n  anonymizedRumors: anonymizedRumors.length,\n  totalRumors: namedRumors.length + anonymizedRumors.length,\n  privateReviewCandidates,"
);

replaceRequired(
  'completion message',
  /console\.log\(`Predators in Power expanded:[^\n]+/,
  "console.log('Predators in Power expanded: ' + payload.subjects.length + ' verified subject(s), ' + currentSubjects.length + ' current/suspended power, ' + childSubjects.length + ' child-focused, ' + autoAdded.length + ' auto-added coverage omission(s), ' + publicClaims.length + ' legally reviewed suspected-conduct claim(s), and ' + (namedRumors.length + anonymizedRumors.length) + ' rumor/speculation ledger record(s).');"
);

const before = fs.readFileSync(target, 'utf8');
fs.writeFileSync(target, source);
try {
  syntaxCheck();
} catch (error) {
  fs.writeFileSync(target, before);
  throw error;
}

console.log('Predators in Power now retains every relevant rumor/speculation record in a public named-or-redacted ledger with zero verified-evidence weight.');
