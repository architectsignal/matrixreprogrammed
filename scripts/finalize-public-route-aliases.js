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
  ['subject-briefs.html', 'subject-briefs'],
  ['entity-timelines.html', 'entity-timelines']
]);
const privateOutputDirectoryConflicts = new Set([
  'card-artwork-batches.html'
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

const featureMaturityReport = require('./finalize-feature-maturity.js');
if (!featureMaturityReport.ok) {
  throw new Error('Feature maturity labels failed closed before public-quality, search and alias finalization.');
}

const report = {
  ok: false,
  generatedAt: new Date().toISOString(),
  sitePresent: fs.existsSync(site),
  featureMaturityFinalized: featureMaturityReport.ok === true,
  publicFeatureRoutes: featureMaturityReport.publicRoutes || [],
  withheldFeatureRoutes: featureMaturityReport.withheldRoutes || [],
  publicQualityPrepared: false,
  publicQualityFinalized: false,
  publicQualityRoutesFinalized: false,
  searchFinalized: false,
  htmlFiles: 0,
  synchronizedAliases: 0,
  identicalAliases: 0,
  directoryConflicts: [],
  privateOutputDirectoryRepairs: [],
  unexpectedDirectoryConflicts: [],
  mismatches: [],
  boundary: 'Every feature route remains public with an honest maturity label. Every deployable .html route then has a byte-identical extensionless file unless its extensionless name is a real namespace directory; approved namespace collisions are served by exact Worker aliases.'
};

if (!report.sitePresent) {
  report.ok = report.featureMaturityFinalized && report.withheldFeatureRoutes.length === 0;
  report.skipped = '_site is absent; source maturity labels are finalized while public quality, search and alias output wait for deployable assets.';
} else {
  const publicQualityPreparation = require('./prepare-p1-public-quality.js');
  if (!publicQualityPreparation.ok) throw new Error('P1 public-quality preparation failed closed.');
  report.publicQualityPrepared = true;

  const publicQualityReport = require('./finalize-p1-public-quality.js');
  if (!publicQualityReport.ok) throw new Error('P1 public-quality finalization failed closed before search and route aliases.');
  report.publicQualityFinalized = true;

  const publicQualityRoutesReport = require('./finalize-p1-public-quality-routes.js');
  if (!publicQualityRoutesReport.ok) throw new Error('P1 public-quality route finalization failed closed before search and route aliases.');
  report.publicQualityRoutesFinalized = true;

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
      if (privateOutputDirectoryConflicts.has(relativeHtml)) {
        fs.rmSync(aliasFile, { recursive: true, force: true });
        report.privateOutputDirectoryRepairs.push({
          html: relativeHtml,
          directory: relativeAlias,
          repair: 'removed-private-output-directory'
        });
      } else {
        const expectedDirectory = directoryConflicts.get(relativeHtml);
        const item = {
          html: relativeHtml,
          directory: relativeAlias,
          approved: expectedDirectory === relativeAlias
        };
        report.directoryConflicts.push(item);
        if (!item.approved) report.unexpectedDirectoryConflicts.push(item);
        continue;
      }
    }

    fs.mkdirSync(path.dirname(aliasFile), { recursive: true });
    const htmlHash = digest(htmlFile);
    const aliasHash = fs.existsSync(aliasFile) && fs.statSync(aliasFile).isFile()
      ? digest(aliasFile)
      : '';
    if (htmlHash !== aliasHash) {
      fs.copyFileSync(htmlFile, aliasFile);
      report.synchronizedAliases += 1;
    }

    const finalAliasHash = fs.existsSync(aliasFile) && fs.statSync(aliasFile).isFile()
      ? digest(aliasFile)
      : '';
    if (finalAliasHash === htmlHash) report.identicalAliases += 1;
    else report.mismatches.push({
      html: relativeHtml,
      alias: relativeAlias,
      htmlHash,
      aliasHash: finalAliasHash
    });
  }

  for (const [htmlRoute, directoryRoute] of directoryConflicts) {
    const htmlFile = path.join(site, htmlRoute);
    const directory = path.join(site, directoryRoute);
    if (!fs.existsSync(htmlFile) || !fs.statSync(htmlFile).isFile()) {
      report.mismatches.push({
        html: htmlRoute,
        alias: directoryRoute,
        error: 'canonical HTML route missing'
      });
    }
    if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
      report.mismatches.push({
        html: htmlRoute,
        alias: directoryRoute,
        error: 'expected namespace directory missing'
      });
    }
  }

  const observedConflicts = new Set(
    report.directoryConflicts.map(item => `${item.html}|${item.directory}`)
  );
  for (const [htmlRoute, directoryRoute] of directoryConflicts) {
    if (!observedConflicts.has(`${htmlRoute}|${directoryRoute}`)) {
      report.mismatches.push({
        html: htmlRoute,
        alias: directoryRoute,
        error: 'approved namespace collision was not observed'
      });
    }
  }

  report.ok = report.featureMaturityFinalized
    && report.publicFeatureRoutes.length === 4
    && report.withheldFeatureRoutes.length === 0
    && report.publicQualityPrepared
    && report.publicQualityFinalized
    && report.publicQualityRoutesFinalized
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
  ? `Public maturity labels, page quality, clean search and route aliases finalized: ${report.publicFeatureRoutes.length} public pilot/active routes, zero withheld, ${report.identicalAliases} byte-identical aliases, ${report.synchronizedAliases} repaired and ${report.directoryConflicts.length} approved namespace collisions.`
  : 'Public feature maturity labels finalized with zero withholding; deployable search and aliases wait for _site.');

module.exports = report;
