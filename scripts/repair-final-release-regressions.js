'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const site = path.join(root, '_site');
const reportPath = path.join(root, 'downloads', 'final-release-regression-repair.json');
const report = {
  ok: true,
  generatedAt: new Date().toISOString(),
  searchFiles: [],
  evidenceFiles: [],
  authContractFiles: [],
  removedEvidenceAliasIds: 0,
  removedRepeatedEvidenceIds: 0
};

function read(file) { return fs.readFileSync(file, 'utf8'); }
function write(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value);
}

function repairSearchRuntime(file) {
  if (!fs.existsSync(file)) return;
  const before = read(file);
  const marker = '/* matrix-search-performance-v1';
  const lastMarker = before.lastIndexOf(marker);
  const end = before.lastIndexOf('})();');
  if (lastMarker < 0 || end < lastMarker) throw new Error(`Canonical Search V3 performance tail missing in ${path.relative(root, file)}`);

  const starts = [
    before.search(/\/\* matrix-search-performance-v1/),
    before.search(/\blet\s+activeIndex\s*=\s*fallbackIndex\s*;/),
    before.indexOf('function init(index){')
  ].filter(index => index >= 0);
  if (!starts.length) throw new Error(`Search V3 runtime start missing in ${path.relative(root, file)}`);

  const start = Math.min(...starts);
  const canonicalTail = before.slice(lastMarker, end + 5);
  const after = `${before.slice(0, start)}${canonicalTail}\n`;
  const activeDeclarations = (after.match(/\blet\s+activeIndex\s*=/g) || []).length;
  const markerCount = (after.match(/matrix-search-performance-v1/g) || []).length;
  if (activeDeclarations !== 1 || markerCount !== 1) {
    throw new Error(`Search V3 runtime remains duplicated in ${path.relative(root, file)}: ${activeDeclarations} activeIndex declaration(s), ${markerCount} marker(s)`);
  }

  write(file, after);
  const syntax = spawnSync(process.execPath, ['--check', file], { cwd: root, encoding: 'utf8' });
  if (syntax.status !== 0) throw new Error(`Search V3 syntax check failed in ${path.relative(root, file)}: ${syntax.stderr || syntax.stdout}`);
  report.searchFiles.push({ file: path.relative(root, file).replace(/\\/g, '/'), changed: after !== before });
}

function repairEvidenceIds(file) {
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return;
  const before = read(file);
  const seen = new Set();
  const after = before.replace(/\s+id\s*=\s*(["'])(evidence-badge-system-route(?:-contract|--duplicate-\d+)?)\1/gi, (match, quote, id) => {
    const key = id.toLowerCase();
    if (/--duplicate-\d+$/.test(key)) {
      report.removedEvidenceAliasIds += 1;
      return '';
    }
    if (seen.has(key)) {
      report.removedRepeatedEvidenceIds += 1;
      return '';
    }
    seen.add(key);
    return match;
  });

  const ids = [...after.matchAll(/(?:^|\s)id\s*=\s*(["'])([^"']+)\1/gi)].map(match => match[2]);
  const duplicateFamilyIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index && /^evidence-badge-system-route/i.test(id)))];
  if (duplicateFamilyIds.length) throw new Error(`${path.relative(root, file)} retains duplicate evidence badge IDs: ${duplicateFamilyIds.join(', ')}`);
  if (/(?:^|\s)id\s*=\s*(["'])evidence-badge-system-route--duplicate-\d+\1/i.test(after)) {
    throw new Error(`${path.relative(root, file)} retains generated evidence badge alias IDs`);
  }

  if (after !== before) write(file, after);
  report.evidenceFiles.push({ file: path.relative(root, file).replace(/\\/g, '/'), changed: after !== before });
}

function repairAuthTestContract(file) {
  if (!fs.existsSync(file)) return;
  const before = read(file);
  const after = before.split('/matrix_session=/.test(').join('/matrix_session_v2=/.test(');
  const currentChecks = (after.match(/\/matrix_session_v2=\/\.test\(/g) || []).length;
  if (after.includes('/matrix_session=/.test(') || currentChecks < 2) {
    throw new Error(`${path.relative(root, file)} does not test the current matrix_session_v2 cookie contract`);
  }
  if (after !== before) write(file, after);
  report.authContractFiles.push({
    file: path.relative(root, file).replace(/\\/g, '/'),
    changed: after !== before,
    sessionCookie: 'matrix_session_v2',
    secureFlagsStillRequired: ['HttpOnly', 'Secure', 'SameSite=Lax']
  });
}

repairSearchRuntime(path.join(root, 'scripts', 'search-v3-runtime-template.js'));
repairSearchRuntime(path.join(root, 'search.js'));
if (fs.existsSync(site)) write(path.join(site, 'search.js'), read(path.join(root, 'search.js')));
repairAuthTestContract(path.join(root, 'scripts', 'membership-auth-test.js'));

const evidenceTargets = [
  'index.html', 'daily-drop.html', 'epstein-files.html', 'network-search.html', 'live-intel.html',
  'evidence-vault.html', 'download-center.html', 'news.html', 'books.html', 'black-file.html'
];
for (const relative of evidenceTargets) {
  repairEvidenceIds(path.join(root, relative));
  repairEvidenceIds(path.join(site, relative));
  repairEvidenceIds(path.join(site, relative.replace(/\.html$/i, '')));
}

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Final release regressions repaired: ${report.searchFiles.length} Search V3 runtime(s), ${report.evidenceFiles.length} evidence route(s), ${report.authContractFiles.length} current auth test contract(s), ${report.removedEvidenceAliasIds} generated alias ID(s), ${report.removedRepeatedEvidenceIds} repeated canonical ID(s).`);
