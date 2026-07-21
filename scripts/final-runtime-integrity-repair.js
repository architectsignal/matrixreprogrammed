'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const reportPath = path.join(root, 'downloads', 'final-runtime-integrity-repair.json');
const report = {
  ok: true,
  generatedAt: new Date().toISOString(),
  searchFiles: [],
  htmlFiles: [],
  boundary: 'This pass repairs only deterministic release-integrity defects: duplicate JavaScript declarations and already-suffixed duplicate evidence-badge IDs. It does not alter evidence, conclusions, access tiers or forum data.'
};

function writeIfChanged(file, before, after) {
  if (after === before) return false;
  fs.writeFileSync(file, after);
  return true;
}

function repairSearch(relative) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return;
  const before = fs.readFileSync(file, 'utf8');
  const declarationsBefore = (before.match(/\b(?:let|const|var)\s+activeIndex\b/g) || []).length;
  const after = before.replace(/\b(?:let|const)\s+activeIndex\b/g, 'var activeIndex');
  const changed = writeIfChanged(file, before, after);
  const syntax = spawnSync(process.execPath, ['--check', file], { cwd: root, encoding: 'utf8', stdio: 'pipe' });
  report.searchFiles.push({ relative, declarationsBefore, changed, syntaxOk: syntax.status === 0, syntaxError: syntax.status === 0 ? null : String(syntax.stderr || syntax.stdout || 'node --check failed') });
  if (syntax.status !== 0) report.ok = false;
}

function repairEvidenceBadgeSuffixes(relative) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return;
  const before = fs.readFileSync(file, 'utf8');
  const seen = new Set();
  let renamed = 0;
  const after = before.replace(/(\sid\s*=\s*["'])(evidence-badge-system-route--duplicate-\d+)(["'])/gi, (match, open, id, close) => {
    if (!seen.has(id)) {
      seen.add(id);
      return match;
    }
    let suffix = 2;
    let next = `${id}--integrity-${suffix}`;
    while (seen.has(next)) next = `${id}--integrity-${++suffix}`;
    seen.add(next);
    renamed += 1;
    return `${open}${next}${close}`;
  });
  const changed = writeIfChanged(file, before, after);
  report.htmlFiles.push({ relative, renamed, changed });
}

for (const relative of ['search.js', '_site/search.js']) repairSearch(relative);
for (const relative of ['download-center.html', '_site/download-center.html', '_site/download-center']) repairEvidenceBadgeSuffixes(relative);

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) throw new Error('Final runtime integrity repair could not produce syntactically valid Search V3 output.');
console.log(`Final runtime integrity repair passed: ${report.searchFiles.length} Search file(s), ${report.htmlFiles.reduce((sum, item) => sum + item.renamed, 0)} duplicate suffixed ID(s) renamed.`);
