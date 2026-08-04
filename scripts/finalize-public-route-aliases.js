'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const site = path.join(root, '_site');
const reportPath = path.join(root, 'downloads', 'public-route-alias-proof.json');
const directoryConflicts = new Map([
  ['follow-the-money.html', 'follow-the-money'],
  ['making-money.html', 'making-money'],
  ['card-artwork-batches.html', 'card-artwork-batches'],
  ['subject-briefs.html', 'subject-briefs'],
  ['entity-timelines.html', 'entity-timelines']
]);

function slash(value) {
  return String(value || '').split(path.sep).join('/');
}

function digest(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function walk(directory, output = []) {
  if (!fs.existsSync(directory)) return output;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file, output);
    else if (entry.isFile() && entry.name.endsWith('.html')) output.push(file);
  }
  return output;
}

const maturityReport = require('./finalize-feature-maturity.js');
if (!maturityReport.ok) throw new Error('Feature maturity finalization failed closed before search and alias synchronization.');

const report = {
  ok: false,
  generatedAt: new Date().toISOString(),
  sitePresent: fs.existsSync(site),
  featureMaturityFinalized: maturityReport.ok === true,
  primaryPromotionWithheld: maturityReport.primaryPromotionWithheld || [],
  searchFinalized: false,
  htmlFiles: 0,
  synchronizedAliases: 0,
  identicalAliases: 0,
  directoryConflicts: [],
  unexpectedDirectoryConflicts: [],
  mismatches: [],
  boundary: 'Feature maturity is finalized before search. Every deployable .html route then receives a byte-identical extensionless file unless its extensionless name is a real namespace directory. Approved namespace collisions are served by exact Worker aliases.'
};

if (!report.sitePresent) {
  report.ok = report.featureMaturityFinalized;
  report.skipped = '_site is absent; feature maturity was finalized in source, while search and alias synchronization wait for deployable output.';
} else {
  const searchReport = require('./finalize-clean-public-search.js');
  if (!searchReport.ok) throw new Error('Clean public search finalization failed closed before route alias synchronization.');
  report.searchFinalized = true;

  const htmlFiles = walk(site).sort();
  report.htmlFiles = htmlFiles.length;

  for (const htmlFile of htmlFiles) {
    const relativeHtml = slash(path.relative(site, htmlFile));
    const aliasFile = htmlFile.slice(0, -'.html'.length);
    const relativeAlias = slash(path.relative(site, aliasFile));

    if (fs.existsSync(aliasFile) && fs.statSync(aliasFile).isDirectory()) {
      const expectedDirectory = directoryConflicts.get(relativeHtml);
      const item = { html: relativeHtml, directory: relativeAlias, approved: expectedDirectory === relativeAlias };
      report.directoryConflicts.push(item);
      if (!item.approved) report.unexpectedDirectoryConflicts.push(item);
      continue;
    }

    fs.mkdirSync(path.dirname(aliasFile), { recursive: true });
    const htmlHash = digest(htmlFile);
    const aliasHash = fs.existsSync(aliasFile) && fs.statSync(aliasFile).isFile() ? digest(aliasFile) : '';
    if (htmlHash !== aliasHash) {
      fs.copyFileSync(htmlFile, aliasFile);
      report.synchronizedAliases += 1;
    }

    const finalAliasHash = fs.existsSync(aliasFile) && fs.statSync(aliasFile).isFile() ? digest(aliasFile) : '';
    if (finalAliasHash === htmlHash) report.identicalAliases += 1;
    else report.mismatches.push({ html: relativeHtml, alias: relativeAlias, htmlHash, aliasHash: finalAliasHash });
  }

  for (const [htmlRoute, directoryRoute] of directoryConflicts) {
    const htmlFile = path.join(site, htmlRoute);
    const directory = path.join(site, directoryRoute);
    if (!fs.existsSync(htmlFile) || !fs.statSync(htmlFile).isFile()) {
      report.mismatches.push({ html: htmlRoute, alias: directoryRoute, error: 'canonical HTML route missing' });
    }
    if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
      report.mismatches.push({ html: htmlRoute, alias: directoryRoute, error: 'expected namespace directory missing' });
    }
  }

  const observedConflicts = new Set(report.directoryConflicts.map(item => `${item.html}|${item.directory}`));
  for (const [htmlRoute, directoryRoute] of directoryConflicts) {
    if (!observedConflicts.has(`${htmlRoute}|${directoryRoute}`)) {
      report.mismatches.push({ html: htmlRoute, alias: directoryRoute, error: 'approved namespace collision was not observed' });
    }
  }

  report.ok = report.featureMaturityFinalized
    && report.searchFinalized
    && report.mismatches.length === 0
    && report.unexpectedDirectoryConflicts.length === 0
    && report.directoryConflicts.length === directoryConflicts.size
    && report.identicalAliases + report.directoryConflicts.length === report.htmlFiles;
}

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

if (!report.ok) {
  console.error('PUBLIC ROUTE ALIAS FINALIZATION FAILED');
  for (const item of [...report.mismatches, ...report.unexpectedDirectoryConflicts].slice(0, 100)) {
    console.error(`- ${JSON.stringify(item)}`);
  }
  process.exit(1);
}

console.log(report.sitePresent
  ? `Feature maturity and public route aliases finalized: ${report.primaryPromotionWithheld.length} pilot feature(s) withheld from primary promotion; ${report.identicalAliases} byte-identical aliases, ${report.synchronizedAliases} repaired, ${report.directoryConflicts.length} approved namespace collisions.`
  : `Feature maturity finalized in source; ${report.primaryPromotionWithheld.length} pilot feature(s) withheld while deployable alias output is absent.`);

module.exports = report;
