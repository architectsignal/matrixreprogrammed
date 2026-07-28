'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const wavePath = path.join(root, 'data', 'predators-in-power-official-wave4.json');
const registryPath = path.join(root, 'data', 'criminal-conduct-registry.json');
const reportPath = path.join(root, 'downloads', 'predators-in-power-official-wave4-merge.json');
const site = path.join(root, '_site');

if (!fs.existsSync(wavePath)) throw new Error('Missing data/predators-in-power-official-wave4.json');
if (!fs.existsSync(registryPath)) throw new Error('Missing data/criminal-conduct-registry.json');
const wave = JSON.parse(fs.readFileSync(wavePath, 'utf8'));
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
const failures = [];
const added = [];
const updated = [];
const dossiersCreated = [];

if (Number(registry.schemaVersion || 0) < 1 || !registry.categories || !registry.subjects) throw new Error('Invalid criminal conduct registry');
if (!Array.isArray(wave.subjects)) throw new Error('Invalid official wave subjects');

function esc(value = '') {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function normalize(value = '') {
  return String(value || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}
function unique(values = []) { return [...new Set(values.filter(Boolean))]; }
function absolute(value = '') { return /^https:\/\//i.test(String(value || '')); }
function roleKey(role) { return normalize(`${role.title}|${role.organization}|${role.from}|${role.to}|${role.status}`); }
function recordFromFinding(finding, checkedAt) {
  const category = registry.categories[finding.category];
  if (!category) throw new Error(`Unknown criminal category ${finding.category}`);
  return {
    id: finding.id,
    category: finding.category,
    title: finding.title,
    summary: finding.summary,
    sourceLabel: finding.sourceLabel,
    sourceUrl: finding.sourceUrl,
    sourceAuthority: 'primary_official',
    date: finding.date,
    jurisdiction: finding.jurisdiction,
    status: finding.status,
    outcome: finding.outcome,
    evidenceGrade: 'A',
    lastChecked: checkedAt,
    publicationStatus: 'approved',
    rightOfReply: finding.rightOfReply,
    counterEvidence: finding.counterEvidence,
    proofNeeded: finding.proofNeeded,
    boundary: finding.boundary || category.boundary,
    conductDomains: unique(finding.domains || []),
    victimClass: unique(finding.victims || []),
    predatorsInPowerEligible: true,
    linkedRecordIds: []
  };
}
function validateSubject(subject) {
  for (const field of ['key', 'name', 'dossierRoute', 'legalStatusSummary', 'publicSummary']) {
    if (!String(subject[field] || '').trim()) failures.push(`${subject.name || '(unnamed)'} missing ${field}`);
  }
  if (!Array.isArray(subject.powerRoles) || !subject.powerRoles.length) failures.push(`${subject.name}: no sourced power role`);
  if (!Array.isArray(subject.findings) || !subject.findings.length) failures.push(`${subject.name}: no official finding`);
  for (const [index, role] of (subject.powerRoles || []).entries()) {
    for (const field of ['sector', 'title', 'organization', 'status', 'sourceLabel', 'sourceUrl']) {
      if (!String(role[field] || '').trim()) failures.push(`${subject.name}: role ${index + 1} missing ${field}`);
    }
    if (role.sourceUrl && !absolute(role.sourceUrl)) failures.push(`${subject.name}: role ${index + 1} source is not HTTPS`);
    if (role.statusSourceUrl && !absolute(role.statusSourceUrl)) failures.push(`${subject.name}: status source is not HTTPS`);
  }
  for (const finding of subject.findings || []) {
    for (const field of ['id', 'category', 'title', 'summary', 'sourceLabel', 'sourceUrl', 'date', 'jurisdiction', 'status', 'rightOfReply', 'counterEvidence', 'proofNeeded', 'boundary']) {
      if (!String(finding[field] || '').trim()) failures.push(`${subject.name}/${finding.id || '(no id)'} missing ${field}`);
    }
    if (finding.sourceUrl && !absolute(finding.sourceUrl)) failures.push(`${subject.name}/${finding.id}: source is not HTTPS`);
    if (!registry.categories[finding.category]) failures.push(`${subject.name}/${finding.id}: unknown category ${finding.category}`);
  }
}

function dossierHtml(subject) {
  const roles = subject.powerRoles.map(role => `<article class="card"><span class="label">${esc(role.status)}</span><h3>${esc(role.title)}</h3><p>${esc(role.organization)} · ${esc([role.from, role.to].filter(Boolean).join(' – '))}</p><a class="btn alt" href="${esc(role.sourceUrl)}" target="_blank" rel="noopener noreferrer">Verify role: ${esc(role.sourceLabel)}</a>${role.statusSourceUrl ? ` <a class="btn alt" href="${esc(role.statusSourceUrl)}" target="_blank" rel="noopener noreferrer">Verify current/former status</a>` : ''}</article>`).join('');
  const sources = subject.findings.map(finding => `<article class="card redline"><span class="label">${esc(registry.categories[finding.category]?.label || finding.category)}</span><h3>${esc(finding.title)}</h3><p>${esc(finding.summary)}</p><p><strong>Legal posture:</strong> ${esc(finding.status)}. ${esc(finding.outcome || '')}</p><p><strong>Boundary:</strong> ${esc(finding.boundary)}</p><a class="btn alt" href="${esc(finding.sourceUrl)}" target="_blank" rel="noopener noreferrer">Open official source</a></article>`).join('');
  const conclusion = subject.conclusion || {};
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>${esc(subject.name)} | Predators in Power Dossier | Matrix Reprogrammed</title><meta name="description" content="Evidence-classified public-record dossier for ${esc(subject.name)} with documented power roles, legal posture, official sources, counter-evidence and proof needed."/><link rel="stylesheet" href="styles.css"/><link rel="stylesheet" href="reader-experience.css"/></head><body><canvas id="matrix"></canvas><div class="page"><header class="wrap topbar"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil"/> MATRIX REPROGRAMMED</a><nav class="nav"><a href="predators-in-power.html">Predators in Power</a><a href="evidence-vault.html">Evidence</a><a href="source-document-vault.html">Sources</a><a href="search.html">Search</a></nav></header><main data-entity-dossier="true" data-person-dossier="true" data-predators-official-wave="2026-07-28"><section class="hero wrap"><div class="eyebrow">Predators in Power · Evidence-Classified Dossier</div><h1>${esc(subject.name)}</h1><p class="lead">${esc(subject.publicSummary)}</p><p><strong>Legal-status summary:</strong> ${esc(subject.legalStatusSummary)}</p><div class="cta-row"><a class="btn" href="predators-in-power.html">Open accountability index</a><a class="btn alt" href="source-document-vault.html">Search official records</a></div></section><section class="section wrap"><h2>Documented Power Roles</h2><div class="grid">${roles}</div></section><section class="section wrap"><h2>Official Legal Records</h2><div class="grid">${sources}</div></section><section class="section wrap"><article class="card"><h2>User-Friendly Conclusion</h2><p><strong>Finding:</strong> ${esc(conclusion.finding || 'See cited official records.')}</p><p><strong>Why it matters:</strong> ${esc(conclusion.whyItMatters || '')}</p><p><strong>Mechanism:</strong> ${esc(conclusion.mechanism || '')}</p><p><strong>Effect on investigation lanes:</strong> ${esc(conclusion.effect || '')}</p><p><strong>Alternative explanation:</strong> ${esc(conclusion.alternativeExplanation || '')}</p><p><strong>What it does not prove:</strong> ${esc(conclusion.doesNotProve || '')}</p><p><strong>Evidence strength:</strong> ${esc(conclusion.evidenceStrength || '')} · ${esc(conclusion.confidence || '')}</p><h3>Evidence to seek next</h3><ul>${(conclusion.nextQuestions || []).map(item => `<li>${esc(item)}</li>`).join('')}</ul></article></section></main><footer class="footer wrap"><p>Charges are not convictions. Office or association is not wrongdoing. Corrections, dismissals, acquittals, appeals and right of reply remain attached.</p></footer></div><script src="matrix.js"></script></body></html>\n`;
}
function writeDossier(subject) {
  const relative = subject.dossierRoute;
  const file = path.join(root, relative);
  const alias = file.replace(/\.html$/i, '');
  const marker = 'data-predators-official-wave="2026-07-28"';
  if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8').includes(marker)) {
    const html = dossierHtml(subject);
    fs.writeFileSync(file, html);
    fs.writeFileSync(alias, html);
    dossiersCreated.push(relative);
    if (fs.existsSync(site)) {
      fs.mkdirSync(path.dirname(path.join(site, relative)), { recursive: true });
      fs.writeFileSync(path.join(site, relative), html);
      fs.writeFileSync(path.join(site, relative.replace(/\.html$/i, '')), html);
    }
  }
}

for (const subject of wave.subjects) validateSubject(subject);
if (failures.length) throw new Error(`Official Predators wave validation failed: ${failures.join('; ')}`);

for (const subject of wave.subjects) {
  const records = subject.findings.map(finding => recordFromFinding(finding, wave.updated));
  const incoming = {
    name: subject.name,
    aliases: unique(subject.aliases || []),
    subjectType: 'person',
    slug: subject.key,
    dossierRoute: subject.dossierRoute,
    historicalCase: false,
    caseEra: subject.legalStatusSummary,
    lifeStatus: subject.lifeStatus,
    legalStatusSummary: subject.legalStatusSummary,
    publicSummary: subject.publicSummary,
    predatorsInPowerEligible: true,
    sourceFile: 'data/predators-in-power-official-wave4.json',
    powerRoles: subject.powerRoles.map(role => ({ ...role, lastChecked: role.lastChecked || wave.updated })),
    records,
    relationships: subject.relationships || [],
    institutionalFailures: subject.institutionalFailures || [],
    conclusion: subject.conclusion || {}
  };
  const existing = registry.subjects[subject.key];
  if (!existing) {
    registry.subjects[subject.key] = incoming;
    added.push(subject.name);
  } else {
    const recordMap = new Map([...(existing.records || []), ...records].map(record => [record.id, record]));
    const roleMap = new Map([...(existing.powerRoles || []), ...incoming.powerRoles].map(role => [roleKey(role), role]));
    registry.subjects[subject.key] = {
      ...existing,
      ...incoming,
      aliases: unique([...(existing.aliases || []), ...incoming.aliases]),
      records: [...recordMap.values()],
      powerRoles: [...roleMap.values()],
      relationships: [...(existing.relationships || []), ...(incoming.relationships || [])],
      institutionalFailures: unique([...(existing.institutionalFailures || []), ...(incoming.institutionalFailures || [])])
    };
    updated.push(subject.name);
  }
  writeDossier(subject);
}

registry.updated = wave.updated;
registry.rules = unique([...(registry.rules || []), 'Official Predators waves must preserve exact role status, legal posture, presumption of innocence, counter-evidence and final dispositions.']);
fs.writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`);

const report = {
  ok: true,
  generatedAt: new Date().toISOString(),
  source: path.relative(root, wavePath),
  registry: path.relative(root, registryPath),
  added,
  updated,
  dossiersCreated,
  recordsMerged: wave.subjects.reduce((sum, subject) => sum + subject.findings.length, 0),
  boundary: wave.publicationRule
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Official Predators wave merged: ${added.length} added, ${updated.length} updated, ${report.recordsMerged} official record(s), ${dossiersCreated.length} dossier surface(s).`);
