'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const registryPath = path.join(root, 'data', 'criminal-conduct-registry.json');
const reportPath = path.join(root, 'downloads', 'criminal-conduct-wave-build-report.json');

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function array(value) { return Array.isArray(value) ? value : []; }
function clean(value, maximum = 2400) { return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, maximum); }
function unique(values) { return [...new Set(values.filter(Boolean))]; }
function absoluteUrl(value) { return /^https?:\/\//i.test(String(value || '')); }

if (!fs.existsSync(registryPath)) throw new Error('Missing criminal conduct registry before wave hydration.');
const waveFiles = fs.readdirSync(path.join(root, 'data')).filter(name => /^criminal-conduct-subjects-wave\d+\.json$/i.test(name)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
const registry = readJson(registryPath);
registry.subjects = registry.subjects || {};
const categories = registry.categories || {};
const failures = [];
const warnings = [];
const merged = [];
const sourceKeys = new Map();

for (const filename of waveFiles) {
  const source = readJson(path.join(root, 'data', filename));
  for (const item of array(source.subjects)) {
    const key = clean(item.key, 120);
    const name = clean(item.name, 220);
    if (!key || !name) { failures.push(`${filename}: subject missing key or name`); continue; }
    if (sourceKeys.has(key)) {
      failures.push(`${filename}: duplicate source subject key ${key}; already declared by ${sourceKeys.get(key)}`);
      continue;
    }
    sourceKeys.set(key, filename);

    const existing = registry.subjects[key];
    if (existing && existing.sourceWave && existing.sourceWave !== filename) {
      failures.push(`${filename}: registry subject ${key} is owned by ${existing.sourceWave}`);
      continue;
    }
    if (existing && !existing.sourceWave) {
      failures.push(`${filename}: subject key ${key} conflicts with a base-registry subject`);
      continue;
    }

    const powerRoles = array(item.powerRoles).map((role, index) => {
      for (const field of ['sector','title','organization','sourceLabel','sourceUrl']) if (!clean(role[field])) failures.push(`${name}: power role ${index + 1} missing ${field}`);
      if (!absoluteUrl(role.sourceUrl)) failures.push(`${name}: power role ${index + 1} source URL is invalid`);
      return { ...role, title:clean(role.title,300), organization:clean(role.organization,300), sourceLabel:clean(role.sourceLabel,400), sourceUrl:clean(role.sourceUrl,1200), lastChecked:clean(role.lastChecked || source.updated || new Date().toISOString().slice(0,10),40) };
    });

    const records = array(item.findings).map((finding, index) => {
      const category = clean(finding.category, 100);
      const config = categories[category];
      if (!config) failures.push(`${name}: finding ${index + 1} uses unknown category ${category}`);
      for (const field of ['id','title','summary','sourceLabel','sourceUrl','date','jurisdiction','status','outcome']) if (!clean(finding[field])) failures.push(`${name}: finding ${index + 1} missing ${field}`);
      if (!absoluteUrl(finding.sourceUrl)) failures.push(`${name}: finding ${finding.id || index + 1} source URL is invalid`);
      if (!array(finding.domains).length) failures.push(`${name}: finding ${finding.id || index + 1} missing conduct domains`);
      if (!array(finding.victims).length) failures.push(`${name}: finding ${finding.id || index + 1} missing victim class`);
      return {
        id:clean(finding.id,180), category, title:clean(finding.title,400), summary:clean(finding.summary,2400), sourceLabel:clean(finding.sourceLabel,400), sourceUrl:clean(finding.sourceUrl,1200), sourceAuthority:clean(finding.sourceAuthority || 'primary_official',100), date:clean(finding.date,40), jurisdiction:clean(finding.jurisdiction,240), status:clean(finding.status,120), outcome:clean(finding.outcome,1200), evidenceGrade:clean(finding.evidenceGrade || 'A',12), lastChecked:clean(finding.lastChecked || source.updated || new Date().toISOString().slice(0,10),40), publicationStatus:'approved', rightOfReply:clean(finding.rightOfReply || 'No separate response located in the approved record.',1600), counterEvidence:clean(finding.counterEvidence || 'No separate counter-evidence field was supplied.',1800), proofNeeded:clean(finding.proofNeeded || 'Continue monitoring authoritative court and inquiry records.',1400), boundary:clean(finding.boundary || config?.boundary || 'Read only within the stated legal and evidential status.',1200), conductDomains:unique(array(finding.domains).map(value => clean(value,100))), victimClass:unique(array(finding.victims).map(value => clean(value,160))), predatorsInPowerEligible:true, linkedRecordIds:unique(array(finding.linkedRecordIds).map(value => clean(value,180)))
      };
    });

    const conclusion = item.conclusion || {};
    for (const field of ['finding','whyItMatters','mechanism','effect','widerDirection','alternativeExplanation','doesNotProve','evidenceStrength','confidence']) if (!clean(conclusion[field])) failures.push(`${name}: conclusion missing ${field}`);
    if (!array(conclusion.lanes).length) failures.push(`${name}: conclusion missing lanes`);
    if (!array(conclusion.nextQuestions).length) failures.push(`${name}: conclusion missing next questions`);
    if (!powerRoles.length) failures.push(`${name}: no sourced power role`);
    if (!records.length) failures.push(`${name}: no approved finding`);

    registry.subjects[key] = {
      sourceWave: filename,
      name,
      aliases:unique(array(item.aliases).map(value => clean(value,220))),
      subjectType:clean(item.subjectType || 'person',80),
      slug:clean(item.slug || key,120),
      dossierRoute:clean(item.dossierRoute || `dossier-${key}.html`,300),
      historicalCase:item.historicalCase === true,
      caseEra:clean(item.caseEra,220),
      lifeStatus:clean(item.lifeStatus,120),
      legalStatusSummary:clean(item.legalStatusSummary,1600),
      publicSummary:clean(item.publicSummary,1800),
      predatorsInPowerEligible:true,
      powerRoles,
      records,
      relationships:array(item.relationships),
      institutionalFailures:unique(array(item.institutionalFailures).map(value => clean(value,1000))),
      conclusion:{ finding:clean(conclusion.finding,1800), lanes:unique(array(conclusion.lanes).map(value => clean(value,120))), whyItMatters:clean(conclusion.whyItMatters,1800), mechanism:clean(conclusion.mechanism,1800), effect:clean(conclusion.effect,1000), widerDirection:clean(conclusion.widerDirection,1800), alternativeExplanation:clean(conclusion.alternativeExplanation,1800), doesNotProve:clean(conclusion.doesNotProve,1800), evidenceStrength:clean(conclusion.evidenceStrength,200), confidence:clean(conclusion.confidence,200), nextQuestions:unique(array(conclusion.nextQuestions).map(value => clean(value,500))) }
    };
    merged.push({ wave:filename, key, name, records:records.length, mode:existing ? 'regenerated' : 'added' });
  }
}

if (failures.length) throw new Error(`Criminal conduct wave validation failed: ${failures.join('; ')}`);
registry.schemaVersion = Math.max(Number(registry.schemaVersion || 1), 3);
registry.updated = new Date().toISOString();
registry.waveFiles = waveFiles.map(filename => `data/${filename}`);
registry.subjectCount = Object.keys(registry.subjects || {}).length;
registry.approvedFindingCount = Object.values(registry.subjects || {}).reduce((sum, subject) => sum + array(subject.records).filter(record => record.publicationStatus === 'approved').length, 0);
fs.writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
fs.mkdirSync(path.dirname(reportPath), { recursive:true });
fs.writeFileSync(reportPath, `${JSON.stringify({ ok:true, generatedAt:new Date().toISOString(), idempotent:true, waveFiles, subjectsMerged:merged.length, totalRegistrySubjects:registry.subjectCount, approvedFindings:registry.approvedFindingCount, merged, warnings }, null, 2)}\n`);
console.log(`Additional criminal waves hydrated idempotently: ${merged.length} subjects from ${waveFiles.length} wave files; registry now contains ${registry.subjectCount}.`);
