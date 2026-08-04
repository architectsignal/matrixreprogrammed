'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const site = path.join(root, '_site');
const targets = [
  'newsletter.html', 'market-activity.html', 'site-population-audit.html',
  'claim-classifier.html', 'dark-speculation-lab.html', 'download-center.html',
  'institution-profile.html', 'public-consequence-contracts.html',
  'source-document-vault.html', 'subject-dog-architect.html',
  'subject-epstein-black-file.html', 'subject-freemasonry-symbol-system.html',
  'subject-index.html', 'subject-trust-evidence-method.html', 'tracker-dashboard.html'
];
const changes = [];

function patch(file) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return;
  const before = fs.readFileSync(file, 'utf8');
  if (!/<!doctype\s+html|<html\b/i.test(before)) return;
  const after = before
    .replace(/\bsource\s+pathways\b/gi, 'source trails')
    .replace(/\breader\s+pathways\b/gi, 'investigation routes')
    .replace(/\bphase\s+routes\b/gi, 'research routes');
  if (after !== before) {
    fs.writeFileSync(file, after);
    changes.push(path.relative(root, file).split(path.sep).join('/'));
  }
}

for (const relative of targets) {
  patch(path.join(root, relative));
  if (fs.existsSync(site)) {
    patch(path.join(site, relative));
    const alias = path.join(site, relative.replace(/\.html$/i, ''));
    if (fs.existsSync(alias) && fs.statSync(alias).isFile()) patch(alias);
  }
}

const report = {
  ok: true,
  generatedAt: new Date().toISOString(),
  targetPages: targets,
  changes,
  boundary: 'Plural legacy scaffold labels are normalized before the page-specific P1 quality owner runs; evidence records and substantive reader copy are unchanged.'
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'p1-public-quality-preparation.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`P1 public-quality preparation complete: ${changes.length} source/output surface(s) normalized.`);
module.exports = report;
