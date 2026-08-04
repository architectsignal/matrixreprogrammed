'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const issues = [];
const need = (condition, message) => { if (!condition) issues.push(message); };

const preparation = JSON.parse(read('downloads/p1-public-quality-preparation.json'));
const quality = JSON.parse(read('downloads/p1-public-quality-finalization.json'));
const corrections = JSON.parse(read('downloads/corrections-route-finalization.json'));
const routes = JSON.parse(read('downloads/p1-public-quality-routes.json'));
const finalizer = read('scripts/finalize-p1-public-quality.js');
const routeFinalizer = read('scripts/finalize-p1-public-quality-routes.js');
const correctionOwner = read('scripts/ensure-corrections-route.js');
const aliasOwner = read('scripts/finalize-public-route-aliases.js');

const expectedPages = [
  'newsletter.html',
  'market-activity.html',
  'site-population-audit.html',
  'claim-classifier.html',
  'dark-speculation-lab.html',
  'download-center.html',
  'institution-profile.html',
  'public-consequence-contracts.html',
  'source-document-vault.html',
  'subject-dog-architect.html',
  'subject-epstein-black-file.html',
  'subject-freemasonry-symbol-system.html',
  'subject-index.html',
  'subject-trust-evidence-method.html',
  'tracker-dashboard.html'
];

need(preparation.ok === true, 'P1 quality preparation report is not healthy');
need(preparation.canonicalBusinessGuide === 'downloads/wealth-guides/business-builder.pdf', 'Canonical Business Creation guide route changed');
need(preparation.canonicalBusinessGuidePresent === true, 'Canonical Business Creation guide is missing from source output');
need(preparation.deployableBusinessGuidePresent === true, 'Canonical Business Creation guide is missing from deployable output');
need(quality.ok === true, 'P1 quality finalization report is not healthy');
need(quality.targetCount === 15, `Expected 15 weak pages; found ${quality.targetCount}`);
need(JSON.stringify(quality.targetPages) === JSON.stringify(expectedPages), 'P1 weak-page target set changed');
need(Array.isArray(quality.issues) && quality.issues.length === 0, 'P1 quality finalization has unresolved issues');
need(corrections.ok === true, 'Canonical corrections route report is not healthy');
need(corrections.canonicalRoute === 'corrections.html', 'Canonical corrections route changed');
need(Array.isArray(corrections.issues) && corrections.issues.length === 0, 'Corrections route has unresolved issues');
need(routes.ok === true, 'P1 quality route report is not healthy');
need(routes.checkedSurfaces >= 15, `Expected at least 15 quality surfaces; found ${routes.checkedSurfaces}`);
need(Array.isArray(routes.issues) && routes.issues.length === 0, 'P1 reader routes have unresolved issues');
need(routes.correctionsRoute?.ok === true, 'P1 route owner did not verify the corrections destination');
need(routes.correctionsRoute?.canonicalRoute === 'corrections.html', 'P1 route owner points to the wrong correction destination');
need(routes.canonicalBusinessGuide === 'downloads/wealth-guides/business-builder.pdf', 'P1 route owner is not bound to the generated Business Creation guide');
need(routes.sourceGuidePresent === true, 'P1 route owner could not verify the source Business Creation guide');
need(routes.deployableGuidePresent === true, 'P1 route owner could not verify the deployable Business Creation guide');

for (const heading of ['What this is', 'Strongest record', 'Why it matters', 'What it does not prove', 'What to do next']) {
  need(finalizer.includes(`<h3>${heading}</h3>`), `P1 quality finalizer missing section: ${heading}`);
}
for (const route of ['evidence-vault.html', 'live-intel.html', 'books.html', 'videos.html', 'corrections.html']) {
  need(finalizer.includes(route), `P1 quality finalizer missing route: ${route}`);
}
need(routeFinalizer.includes('optin-center.html'), 'P1 route finalizer is missing the distinct free-brief route');
need(routeFinalizer.includes("require('./ensure-corrections-route.js')"), 'P1 route finalizer does not materialize the correction destination');
need(finalizer.includes('id="figure-source-status"'), 'Market Activity figure source panel is missing');
need(finalizer.includes('machine-data-link'), 'Download Center machine-data demotion is missing');
need(finalizer.includes('data-reviewed="${reviewed}"'), 'Visible review-date contract is missing');
need(finalizer.includes('Appearance in a contact book, flight log, photograph or network does not establish criminal conduct'), 'Epstein association boundary is missing');
need(finalizer.includes('A shared symbol does not by itself prove membership, command, secret coordination'), 'Freemasonry symbol boundary is missing');
need(finalizer.includes('A transaction or holding does not establish beneficial control'), 'Market activity evidence boundary is missing');
need(correctionOwner.includes('data-corrections-route="canonical"'), 'Correction route lacks its canonical ownership marker');
need(correctionOwner.includes('contact-the-machine.html?type=correction'), 'Correction route lacks the public correction intake path');
need(correctionOwner.toLowerCase().includes('corrections strengthen the public record'), 'Correction route lacks its credibility boundary');

// Prove the cleanup owner and its reader-facing replacements exist. The test
// must not require forbidden public phrases to remain embedded verbatim merely
// so it can find them in source code; every rendered result below is inspected
// independently for residual scaffold copy.
need(finalizer.includes('function cleanScaffold'), 'P1 scaffold cleanup owner is missing');
for (const replacement of ['INVESTIGATION ROUTE', 'Investigation Route', 'source trail', 'Research layer', "'system'"]) {
  need(finalizer.includes(replacement), `P1 scaffold replacement is missing: ${replacement}`);
}
need(aliasOwner.includes("require('./finalize-p1-public-quality.js')"), 'Final route owner does not reapply P1 quality after late generators');
need(aliasOwner.includes("require('./finalize-p1-public-quality-routes.js')"), 'Final route owner does not reapply complete P1 reader routes');
need(aliasOwner.indexOf("require('./finalize-p1-public-quality.js')") < aliasOwner.indexOf("require('./finalize-clean-public-search.js')"), 'Search is rebuilt before P1 reader copy is finalized');

for (const result of quality.results || []) {
  need(result.words >= 220, `${result.file} remains thin at ${result.words} words`);
  need(result.hasQualitySection === true, `${result.file} lacks the P1 quality section`);
  need(result.hasReviewDate === true, `${result.file} lacks the review date`);
  need(result.hasCorrections === true, `${result.file} lacks the correction route`);
  need((result.scaffold || []).length === 0, `${result.file} retains visible scaffold copy`);
}

for (const relative of ['corrections.html', '_site/corrections.html', '_site/corrections']) {
  const file = path.join(root, relative);
  if (!fs.existsSync(path.join(root, '_site')) && relative.startsWith('_site/')) continue;
  need(fs.existsSync(file) && fs.statSync(file).isFile(), `${relative} correction destination is missing`);
  if (fs.existsSync(file) && fs.statSync(file).isFile()) {
    const html = fs.readFileSync(file, 'utf8');
    need(html.includes('data-corrections-route="canonical"'), `${relative} lacks the canonical correction marker`);
    need(html.includes('contact-the-machine.html?type=correction'), `${relative} lacks the correction intake path`);
  }
}

for (const relative of ['download-center.html', '_site/download-center.html', '_site/download-center']) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
  const html = fs.readFileSync(file, 'utf8');
  need(!html.includes('downloads/wealth-guides/business-system.pdf'), `${relative} retains the dead Business system PDF route`);
  need(html.includes('downloads/wealth-guides/business-builder.pdf'), `${relative} does not link to the generated Business Creation Engine PDF`);
}
need(fs.existsSync(path.join(root, 'downloads', 'wealth-guides', 'business-builder.pdf')), 'Generated Business Creation Engine PDF is missing');
if (fs.existsSync(path.join(root, '_site'))) {
  need(fs.existsSync(path.join(root, '_site', 'downloads', 'wealth-guides', 'business-builder.pdf')), 'Deployable Business Creation Engine PDF is missing');
}

const report = {
  ok: issues.length === 0,
  generatedAt: new Date().toISOString(),
  targetPages: expectedPages.length,
  checkedSurfaces: quality.results?.length || 0,
  readerRouteSurfaces: routes.checkedSurfaces || 0,
  correctionsRoute: corrections.canonicalRoute,
  canonicalBusinessGuide: routes.canonicalBusinessGuide,
  boundary: 'The P1 pass improves reader comprehension and routing without changing evidence records, allegations, D1 state, membership, payments or production deployment. Correction links resolve to a durable public route, every promoted download resolves to a generated file, and forbidden scaffold language is checked in rendered output rather than retained in production code.',
  issues
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'p1-public-quality-contract-test.json'), `${JSON.stringify(report, null, 2)}\n`);
if (issues.length) {
  console.error('P1 PUBLIC QUALITY CONTRACT FAILED');
  issues.slice(0, 100).forEach(issue => console.error(`- ${issue}`));
  process.exit(1);
}
console.log(`P1 PUBLIC QUALITY CONTRACT PASSED: ${report.targetPages} weak pages receive page-specific guidance, six reader routes, a durable correction destination, review dates, evidence limits and verified downloads.`);
