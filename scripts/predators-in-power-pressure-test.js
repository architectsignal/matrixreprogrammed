const fs = require('fs');
const path = require('path');

const root = process.cwd();
const site = path.join(root, '_site');
const failures = [];
const reportPath = path.join(root, 'downloads', 'predators-in-power-pressure-test.json');

function read(file) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error(`Missing required file: ${path.relative(root, file)}`);
  return fs.readFileSync(file, 'utf8');
}
function json(file) { return JSON.parse(read(file)); }
function fail(message) { failures.push(message); }
function checkPage(file, label) {
  const html = read(file);
  for (const marker of [
    'PREDATORS IN POWER.',
    'Read the legal lane before the name',
    'The page title is the name of an accountability project, not a blanket legal finding.',
    'Charges and investigations are not proof of guilt.',
    'Association, employment, office, fame or proximity is not wrongdoing.',
    'id="pip-search"',
    'id="pip-lane"',
    'id="pip-sector"',
    'id="pip-conduct"',
    'id="pip-signal-form"',
    'Predators in Power Source Drop',
    'pending editorial review',
    'I have omitted private victim information and all identifying details about children.',
    'Predator score: DISABLED',
    'downloads/predators-in-power.json',
    'downloads/predators-in-power.csv'
  ]) if (!html.includes(marker)) fail(`${label} missing marker: ${marker}`);
  if (/auto[- ]?publish/i.test(html) && !/Anonymous claims auto-published: NO/i.test(html)) fail(`${label} contains unsafe auto-publication language`);
  if (/\[object Object\]/.test(html)) fail(`${label} contains raw object placeholder`);
}

const policy = json(path.join(root, 'data', 'predators-in-power-policy.json'));
const registry = json(path.join(root, 'data', 'criminal-conduct-registry.json'));
const payload = json(path.join(root, 'data', 'predators-in-power.json'));
const build = json(path.join(root, 'downloads', 'predators-in-power-build-report.json'));
const links = json(path.join(root, 'downloads', 'predators-in-power-conduct-links.json'));
const sync = json(path.join(root, 'downloads', 'predators-in-power-output-sync.json'));

if (policy.schemaVersion !== 1) fail('policy schemaVersion must be 1');
if (!policy.eligibilityRule?.includes('editorially approved qualifying conduct record')) fail('eligibility policy must require an approved conduct record');
if (!policy.eligibilityRule?.includes('sourced qualifying power or influence role')) fail('eligibility policy must require a sourced power role');
if (!String(policy.rankingRule || '').includes('Do not create a predator score')) fail('policy must prohibit predator scoring');
if (Object.keys(policy.conductDomains || {}).length < 12) fail('conduct taxonomy is incomplete');
if (Object.keys(policy.powerSectors || {}).length < 15) fail('power-sector taxonomy is incomplete');
if (!Array.isArray(policy.victimSafetyRules) || policy.victimSafetyRules.length < 5) fail('victim-safety rules are incomplete');
if (!payload.boundary?.includes('not a legal finding')) fail('public payload lacks page-title legal boundary');
if (payload.count !== (payload.subjects || []).length) fail('public payload subject count mismatch');
if (payload.reviewOnlyCandidateCount < 0) fail('review-only candidate count invalid');
if (!build.ok || build.qualifyingSubjects !== payload.count) fail('build report does not match public payload');
if (!links.ok || links.checkedCount < 1 || (links.failures || []).length) fail('Criminal Conduct dropdown cross-link report failed');
if (fs.existsSync(site) && !sync.ok) fail('Cloudflare output synchronization failed');

const ids = new Set();
for (const subject of payload.subjects || []) {
  if (!subject.name) fail('published subject missing name');
  if (!Array.isArray(subject.powerRoles) || !subject.powerRoles.length) fail(`${subject.name}: missing sourced power role`);
  for (const role of subject.powerRoles || []) {
    for (const field of ['sector', 'title', 'organization', 'sourceLabel', 'sourceUrl', 'lastChecked']) if (!String(role[field] || '').trim()) fail(`${subject.name}: power role missing ${field}`);
    if (!policy.powerSectors[role.sector]) fail(`${subject.name}: invalid power sector ${role.sector}`);
    if (!/^https?:\/\//i.test(role.sourceUrl || '')) fail(`${subject.name}: invalid power-role source URL`);
  }
  const substantive = (subject.records || []).filter(record => record.category !== 'exculpatory_disposition');
  if (!substantive.length) fail(`${subject.name}: no substantive conduct record`);
  for (const record of subject.records || []) {
    if (ids.has(record.id)) fail(`duplicate public record ID ${record.id}`);
    ids.add(record.id);
    if (record.publicationStatus !== 'approved') fail(`${subject.name}/${record.id}: non-approved record published`);
    if (record.predatorsInPowerEligible !== true) fail(`${subject.name}/${record.id}: record lacks explicit page eligibility`);
    if (!Array.isArray(record.conductDomains) || !record.conductDomains.length) fail(`${subject.name}/${record.id}: missing conduct domain`);
    for (const domain of record.conductDomains || []) if (!policy.conductDomains[domain]) fail(`${subject.name}/${record.id}: invalid conduct domain ${domain}`);
    if (!Array.isArray(record.victimClass) || !record.victimClass.length) fail(`${subject.name}/${record.id}: missing victim class`);
    if (!registry.categories[record.category]) fail(`${subject.name}/${record.id}: invalid legal lane ${record.category}`);
    if (!/^https?:\/\//i.test(record.sourceUrl || '')) fail(`${subject.name}/${record.id}: invalid conduct source URL`);
    for (const field of ['rightOfReply', 'counterEvidence', 'proofNeeded', 'boundary', 'lastChecked']) if (!String(record[field] || '').trim()) fail(`${subject.name}/${record.id}: missing ${field}`);
  }
}

checkPage(path.join(root, 'predators-in-power.html'), 'source page');
for (const relative of ['index.html', 'wrongdoing-tracker.html', 'evidence-vault.html', 'subject-index.html']) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) continue;
  const html = read(file);
  if (!html.includes('<!-- predators-in-power-route:start -->') || !html.includes('predators-in-power.html')) fail(`${relative} missing Predators in Power route block`);
}
for (const relative of links.checked || []) {
  const file = path.join(root, relative.replace(/^_site\//, '_site/'));
  if (!fs.existsSync(file)) { fail(`${relative} from conduct-link report is missing`); continue; }
  const html = read(file);
  if (!html.includes('<!-- predators-in-power-conduct-link:start -->') || !html.includes('Open Predators in Power')) fail(`${relative} missing conduct dropdown cross-link`);
}
if (fs.existsSync(site)) {
  checkPage(path.join(site, 'predators-in-power.html'), 'built .html page');
  checkPage(path.join(site, 'predators-in-power'), 'built extensionless page');
  for (const relative of ['data/predators-in-power.json', 'downloads/predators-in-power.json', 'downloads/predators-in-power.csv']) {
    if (!fs.existsSync(path.join(site, relative))) fail(`built output missing ${relative}`);
  }
}

const result = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  qualifyingSubjects: payload.count,
  approvedRecords: ids.size,
  conductDomains: Object.keys(policy.conductDomains || {}).length,
  powerSectors: Object.keys(policy.powerSectors || {}).length,
  conductDropdownLinks: links.checkedCount,
  outputPresent: fs.existsSync(site),
  failures
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\n`);
if (failures.length) {
  console.error('PREDATORS IN POWER PRESSURE TEST FAILED');
  failures.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}
console.log(`Predators in Power pressure test passed: ${result.qualifyingSubjects} qualifying subject(s), ${result.approvedRecords} approved record(s), ${result.conductDomains} conduct domains, ${result.powerSectors} power sectors, ${result.conductDropdownLinks} conduct-dropdown link(s).`);
