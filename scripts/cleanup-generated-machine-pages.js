const fs = require('fs');
const path = require('path');

const root = process.cwd();
const reportPath = path.join(root, 'downloads', 'generated-machine-page-cleanup.json');

function display(file) {
  return path.relative(root, file).replace(/\\/g, '/');
}

function isHtmlOrAlias(name) {
  return name.endsWith('.html') || !path.extname(name);
}

function removeMatching(relativeDir, predicate) {
  const removed = [];
  for (const base of [root, path.join(root, '_site')]) {
    const directory = path.join(base, relativeDir);
    if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) continue;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isFile() || !predicate(entry.name)) continue;
      const file = path.join(directory, entry.name);
      fs.rmSync(file, { force: true });
      removed.push(display(file));
    }
  }
  return removed;
}

function record(action, removed) {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  let report = { ok: true, generatedAt: new Date().toISOString(), actions: [] };
  try {
    const prior = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    if (prior && Array.isArray(prior.actions)) report = prior;
  } catch {}
  report.generatedAt = new Date().toISOString();
  report.actions.push({ action, removedCount: removed.length, removed });
  report.totalRemoved = report.actions.reduce((sum, item) => sum + Number(item.removedCount || 0), 0);
  report.boundary = 'Only machine-generated entity brief, entity exposure and elite report HTML/extensionless routes are removed. Hand-authored pages outside these generated namespaces are untouched.';
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Generated page cleanup ${action}: ${removed.length} stale or previous file(s) removed.`);
  return removed;
}

function cleanEntityBriefs() {
  return record('entity-briefs', removeMatching('entity-briefs', isHtmlOrAlias));
}

function cleanEntityExposure() {
  return record('entity-exposure', removeMatching('entity-exposure', isHtmlOrAlias));
}

function isGeneratedEliteReport(name) {
  if (!isHtmlOrAlias(name)) return false;
  const stem = name.replace(/\.html$/i, '');
  return /^(?:daily-revelation-report|missing-records-report|contradiction-watch-report|(?:entity|contractor|billionaire|institution|subject)-[a-z0-9][a-z0-9-]*)$/.test(stem);
}

function cleanEliteReports() {
  return record('elite-reports', removeMatching('reports', isGeneratedEliteReport));
}

function cleanAllGeneratedMachinePages() {
  return {
    entityBriefs: cleanEntityBriefs(),
    entityExposure: cleanEntityExposure(),
    eliteReports: cleanEliteReports()
  };
}

module.exports = {
  cleanEntityBriefs,
  cleanEntityExposure,
  cleanEliteReports,
  cleanAllGeneratedMachinePages,
  isGeneratedEliteReport
};

if (require.main === module) cleanAllGeneratedMachinePages();
