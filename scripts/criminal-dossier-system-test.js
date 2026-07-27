'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const reportPath = path.join(root, 'downloads', 'criminal-status-dossier-coverage.json');
const registryPath = path.join(root, 'data', 'criminal-conduct-registry.json');
const START = '<!-- criminal-safeguarding-status:start -->';
const failures = [];

function readJson(file, fallback = {}) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function array(value) { return Array.isArray(value) ? value : []; }

const report = readJson(reportPath, {});
const registry = readJson(registryPath, { subjects: {} });
if (report.ok !== true) failures.push('Coverage report is missing or blocked.');
if (Number(report.minimumPredatorsInPowerTarget) < 100) failures.push('Minimum Predators in Power target must remain at least 100.');
if (Number(report.dossierPagesDetected) < 1) failures.push('No dossier pages were detected for criminal-status coverage.');
if (Number(report.dossierPagesDetected) !== array(report.coverage).length) failures.push('Coverage count does not match coverage rows.');

for (const item of array(report.coverage)) {
  const file = path.join(root, item.route || '');
  if (!item.route || !fs.existsSync(file)) {
    failures.push(`Covered dossier route is missing: ${item.route || '(blank)'}`);
    continue;
  }
  const html = fs.readFileSync(file, 'utf8');
  if (!html.includes(START)) failures.push(`${item.route}: Criminal & Safeguarding Status panel is missing.`);
  if (!/Evidence boundary:/i.test(html)) failures.push(`${item.route}: evidence boundary is missing from criminal status.`);
  if (!/Submit Evidence or Correction/i.test(html)) failures.push(`${item.route}: correction/evidence route is missing.`);
  if (item.matchStatus === 'no-approved-match' && !/not a clearance statement/i.test(html)) failures.push(`${item.route}: no-match status is not clearly bounded.`);
  if (item.matchStatus === 'approved-registry-subject' && !/Open Complete Criminal Dossier/i.test(html)) failures.push(`${item.route}: approved record does not link to the complete criminal dossier.`);
}

for (const [key, subject] of Object.entries(registry.subjects || {})) {
  if (subject.predatorsInPowerEligible !== true) continue;
  const route = subject.dossierRoute;
  const approved = array(subject.records).some(record => record.publicationStatus === 'approved');
  if (!approved) continue;
  if (!route || !fs.existsSync(path.join(root, route))) failures.push(`${key}: approved subject dossier route is missing.`);
  const row = array(report.coverage).find(item => item.route === route);
  if (!row || row.matchStatus !== 'approved-registry-subject') failures.push(`${key}: approved subject was not matched by the site-wide criminal system.`);
}

const result = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  target: report.minimumPredatorsInPowerTarget || 100,
  approvedDossiers: report.approvedPredatorsInPowerDossiers || 0,
  dossierPagesChecked: array(report.coverage).length,
  failures
};
fs.writeFileSync(path.join(root, 'downloads', 'criminal-dossier-system-test.json'), `${JSON.stringify(result, null, 2)}\n`);
if (failures.length) throw new Error(`Criminal dossier system test failed: ${failures.join('; ')}`);
console.log(`Criminal dossier system passed: ${result.dossierPagesChecked} dossier pages checked; ${result.approvedDossiers}/${result.target} Predators in Power dossiers approved.`);
