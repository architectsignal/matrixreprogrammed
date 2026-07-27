'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const registryPath = path.join(root, 'data', 'criminal-conduct-registry.json');
const sourcePath = path.join(root, 'data', 'criminal-conduct-subjects.json');
const reportPath = path.join(root, 'downloads', 'criminal-conduct-registry-build-report.json');
const checked = '2026-07-27';

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function clean(value, maximum = 2400) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, maximum);
}
function array(value) {
  return Array.isArray(value) ? value : [];
}
function absoluteUrl(value) {
  return /^https?:\/\//i.test(String(value || ''));
}
function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

for (const file of [registryPath, sourcePath]) {
  if (!fs.existsSync(file)) throw new Error(`Missing criminal conduct source: ${path.relative(root, file)}`);
}

const registry = readJson(registryPath);
const source = readJson(sourcePath);
const categories = registry.categories || {};
const failures = [];
const warnings = [];
const expanded = {};

for (const item of array(source.subjects)) {
  const key = clean(item.key, 120);
  const name = clean(item.name, 220);
  if (!key || !name) {
    failures.push('Subject source missing key or name');
    continue;
  }
  if (expanded[key]) failures.push(`Duplicate subject key: ${key}`);

  const powerRoles = array(item.powerRoles).map((role, index) => {
    for (const field of ['sector', 'title', 'organization', 'sourceLabel', 'sourceUrl']) {
      if (!clean(role[field], 900)) failures.push(`${name}: power role ${index + 1} missing ${field}`);
    }
    if (!absoluteUrl(role.sourceUrl)) failures.push(`${name}: power role ${index + 1} source is not an absolute URL`);
    return {
      ...role,
      title: clean(role.title, 300),
      organization: clean(role.organization, 300),
      sourceLabel: clean(role.sourceLabel, 300),
      sourceUrl: clean(role.sourceUrl, 1200),
      lastChecked: clean(role.lastChecked || source.updated || checked, 40)
    };
  });

  const records = array(item.findings).map((finding, index) => {
    const category = clean(finding.category, 100);
    const categoryConfig = categories[category];
    if (!categoryConfig) failures.push(`${name}: finding ${index + 1} uses unknown category ${category || '(blank)'}`);
    for (const field of ['id', 'title', 'summary', 'sourceLabel', 'sourceUrl', 'date', 'jurisdiction', 'status', 'outcome']) {
      if (!clean(finding[field], 2400)) failures.push(`${name}: finding ${index + 1} missing ${field}`);
    }
    if (!absoluteUrl(finding.sourceUrl)) failures.push(`${name}: finding ${finding.id || index + 1} source is not an absolute URL`);
    if (!array(finding.domains).length) failures.push(`${name}: finding ${finding.id || index + 1} has no conduct domains`);
    if (!array(finding.victims).length) failures.push(`${name}: finding ${finding.id || index + 1} has no victim class`);
    return {
      id: clean(finding.id, 180),
      category,
      title: clean(finding.title, 400),
      summary: clean(finding.summary, 2400),
      sourceLabel: clean(finding.sourceLabel, 400),
      sourceUrl: clean(finding.sourceUrl, 1200),
      sourceAuthority: clean(finding.sourceAuthority || 'primary_official', 100),
      date: clean(finding.date, 40),
      jurisdiction: clean(finding.jurisdiction, 240),
      status: clean(finding.status, 120),
      outcome: clean(finding.outcome, 1000),
      evidenceGrade: clean(finding.evidenceGrade || 'A', 12),
      lastChecked: clean(finding.lastChecked || source.updated || checked, 40),
      publicationStatus: 'approved',
      rightOfReply: clean(finding.rightOfReply || 'No separate response located in the approved record.', 1600),
      counterEvidence: clean(finding.counterEvidence || 'No separate counter-evidence field was supplied.', 1800),
      proofNeeded: clean(finding.proofNeeded || 'Continue monitoring authoritative court and inquiry records.', 1400),
      boundary: clean(finding.boundary || categoryConfig?.boundary || 'Read only within the stated legal and evidential status.', 1200),
      conductDomains: unique(array(finding.domains).map(value => clean(value, 100))),
      victimClass: unique(array(finding.victims).map(value => clean(value, 160))),
      predatorsInPowerEligible: true,
      linkedRecordIds: unique(array(finding.linkedRecordIds).map(value => clean(value, 180)))
    };
  });

  if (!powerRoles.length) failures.push(`${name}: no sourced power role`);
  if (!records.length) failures.push(`${name}: no approved finding`);

  const conclusion = item.conclusion || {};
  for (const field of ['finding', 'whyItMatters', 'mechanism', 'effect', 'widerDirection', 'alternativeExplanation', 'doesNotProve', 'evidenceStrength', 'confidence']) {
    if (!clean(conclusion[field], 2400)) failures.push(`${name}: conclusion missing ${field}`);
  }
  if (!array(conclusion.lanes).length) failures.push(`${name}: conclusion missing lanes`);
  if (!array(conclusion.nextQuestions).length) failures.push(`${name}: conclusion missing next questions`);

  expanded[key] = {
    name,
    aliases: unique(array(item.aliases).map(value => clean(value, 220))),
    subjectType: clean(item.subjectType || 'person', 80),
    slug: clean(item.slug || key, 120),
    dossierRoute: clean(item.dossierRoute || `dossier-${key}.html`, 300),
    historicalCase: item.historicalCase === true,
    caseEra: clean(item.caseEra, 220),
    lifeStatus: clean(item.lifeStatus, 120),
    legalStatusSummary: clean(item.legalStatusSummary, 1400),
    publicSummary: clean(item.publicSummary, 1800),
    predatorsInPowerEligible: true,
    powerRoles,
    records,
    relationships: array(item.relationships),
    institutionalFailures: unique(array(item.institutionalFailures).map(value => clean(value, 900))),
    conclusion: {
      finding: clean(conclusion.finding, 1800),
      lanes: unique(array(conclusion.lanes).map(value => clean(value, 120))),
      whyItMatters: clean(conclusion.whyItMatters, 1800),
      mechanism: clean(conclusion.mechanism, 1800),
      effect: clean(conclusion.effect, 1000),
      widerDirection: clean(conclusion.widerDirection, 1800),
      alternativeExplanation: clean(conclusion.alternativeExplanation, 1800),
      doesNotProve: clean(conclusion.doesNotProve, 1800),
      evidenceStrength: clean(conclusion.evidenceStrength, 200),
      confidence: clean(conclusion.confidence, 200),
      nextQuestions: unique(array(conclusion.nextQuestions).map(value => clean(value, 500)))
    }
  };
}

if (failures.length) throw new Error(`Criminal conduct source validation failed: ${failures.join('; ')}`);

registry.schemaVersion = Math.max(Number(registry.schemaVersion || 1), 2);
registry.updated = new Date().toISOString();
registry.subjects = { ...(registry.subjects || {}), ...expanded };
registry.sourceFile = 'data/criminal-conduct-subjects.json';
registry.subjectCount = Object.keys(registry.subjects).length;
registry.approvedFindingCount = Object.values(registry.subjects).reduce((sum, subject) => sum + array(subject.records).filter(record => record.publicationStatus === 'approved').length, 0);
fs.writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`);

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  source: path.relative(root, sourcePath),
  subjectsHydrated: Object.keys(expanded).length,
  totalRegistrySubjects: registry.subjectCount,
  approvedFindings: registry.approvedFindingCount,
  warnings
}, null, 2)}\n`);

console.log(`Criminal conduct registry hydrated: ${Object.keys(expanded).length} sourced subjects and ${registry.approvedFindingCount} approved findings.`);
