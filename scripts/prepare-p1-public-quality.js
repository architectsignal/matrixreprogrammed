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
const guideRepairs = [];

function patch(file) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return;
  const before = fs.readFileSync(file, 'utf8');
  if (!/<!doctype\s+html|<html\b/i.test(before)) return;
  const relative = path.relative(root, file).split(path.sep).join('/');
  let after = before
    .replace(/\bsource\s+pathways\b/gi, 'source trails')
    .replace(/\breader\s+pathways\b/gi, 'investigation routes')
    .replace(/\bphase\s+routes\b/gi, 'research routes');

  // A legacy PDF catalogue label called the current Business Creation Engine
  // “Business system” and derived a non-existent business-system.pdf filename.
  // The canonical detailed guide and generated asset are business-builder.pdf.
  if (/download-center(?:\.html)?$/i.test(relative)) {
    const beforeRepair = after;
    after = after
      .replace(/downloads\/wealth-guides\/business-system\.pdf/gi, 'downloads/wealth-guides/business-builder.pdf')
      .replace(/Wealth Guides\/Business system/gi, 'Business Creation Engine');
    if (after !== beforeRepair) guideRepairs.push(relative);
  }

  if (after !== before) {
    fs.writeFileSync(file, after);
    changes.push(relative);
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

const sourceGuide = path.join(root, 'downloads', 'wealth-guides', 'business-builder.pdf');
const outputGuide = path.join(site, 'downloads', 'wealth-guides', 'business-builder.pdf');
const report = {
  ok: fs.existsSync(sourceGuide) && (!fs.existsSync(site) || fs.existsSync(outputGuide)),
  generatedAt: new Date().toISOString(),
  targetPages: targets,
  changes,
  guideRepairs,
  canonicalBusinessGuide: 'downloads/wealth-guides/business-builder.pdf',
  canonicalBusinessGuidePresent: fs.existsSync(sourceGuide),
  deployableBusinessGuidePresent: !fs.existsSync(site) || fs.existsSync(outputGuide),
  boundary: 'Plural legacy scaffold labels and the obsolete Business system PDF alias are normalized before the page-specific P1 quality owner runs; evidence records and substantive reader copy are unchanged.'
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'p1-public-quality-preparation.json'), `${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) {
  console.error('P1 public-quality preparation failed: the canonical Business Creation Engine PDF is missing.');
  process.exit(1);
}
console.log(`P1 public-quality preparation complete: ${changes.length} source/output surface(s) normalized; ${guideRepairs.length} stale Business system route(s) repaired.`);
module.exports = report;
