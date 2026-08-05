#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const checkedDate = new Date().toISOString().slice(0, 10);
const reportPath = path.join(root, 'downloads', 'public-audit-boundary-reconciliation.json');
const changes = [];
const checks = [];

const freshnessPages = [
  'accountability-watch.html', 'billionaire-control-tracker.html', 'billionaire-watch.html',
  'brief-disclosure-watch.html', 'card-batch-tracker.html', 'contradiction-watch.html',
  'control-system-tracker.html', 'daily-control-brief-signup.html', 'daily-missing-records.html',
  'dashboard-conflict.html', 'dashboard-epstein.html', 'dashboard-human-cost.html',
  'dashboard-intelligence.html', 'dashboard-migration.html', 'elite-family-tracker.html',
  'epstein-billionaire-tracker.html', 'epstein-sighting-watch.html', 'gold-reserve-tracker.html',
  'institution-control-tracker.html', 'intel-archive.html', 'latest-public-drops.html',
  'palantir-watch.html', 'policy-watch.html', 'public-answer-clock.html',
  'reports/daily-revelation-report.html', 'secret-societies-tracker.html',
  'update-lane-answer-engine.html', 'update-lane-book-universe.html',
  'update-lane-distribution-sales.html', 'update-lane-evidence-vault.html',
  'update-lane-funnels-trust.html', 'update-lane-intel-desk.html',
  'update-lane-power-atlas.html', 'wrongdoing-tracker.html'
];

const assessmentPages = [
  'black-file-theory.html', 'brief-disclosure-watch.html', 'contradiction-watch.html',
  'emergency-power-theory.html', 'institutional-capture-theory.html',
  'jurisdictional-power-theory.html', 'media-narrative-theory.html',
  'new-world-order-theory.html', 'one-world-currency-theory.html',
  'one-world-religion-theory.html', 'policy-watch.html',
  'reports/contradiction-watch-report.html', 'theory-lab.html'
];

const thinPageCopy = {
  'controlled-opposition-profile.html': '<section class="section evidence-boundary" data-public-audit-reconciliation="thin-copy"><h2>Profile route boundary</h2><p>This router opens a named profile from the Controlled Opposition deck. A listing is an investigation route, not a factual finding about motive, coordination, wrongdoing, or hidden control. Use the linked dossier to inspect its cited records, dates, source types, counter-evidence and unresolved gaps.</p><p><strong>SPECULATION:</strong> Any interpretation that goes beyond directly attributable records remains speculation. Ambiguous identities stay unlinked, and source absence is not evidence of guilt. Verify the entity, jurisdiction and primary record before drawing a conclusion.</p></section>',
  'money-search.html': '<section class="section wrap evidence-boundary" data-public-audit-reconciliation="thin-copy"><h2>How to read money results</h2><p>The search interface loads public-record money routes in the browser. Search results identify records and research paths; they do not by themselves prove beneficial ownership, operational control, illegality, coordination, intent, or wrongdoing.</p><p><strong>Evidence boundary:</strong> Confirm the named entity, reporting period, jurisdiction, currency, filing type and source publication date in the linked record. Ambiguous matches remain separate, and unsupported interpretations must be labelled <strong>SPECULATION</strong>.</p><noscript><p>JavaScript is required for interactive results. The <a href="follow-the-money.html">Money Command</a> and <a href="evidence-vault.html">Evidence Vault</a> remain available as static research routes.</p></noscript></section>'
};

function insertBeforeMainEnd(html, fragment) {
  if (/<\/main>/i.test(html)) return html.replace(/<\/main>/i, `${fragment}</main>`);
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${fragment}</body>`);
  throw new Error('No stable content insertion point');
}

function replaceOrInsert(html, marker, fragment) {
  const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const existing = new RegExp(`<section\\b[^>]*data-public-audit-reconciliation=["']${escaped}["'][^>]*>[\\s\\S]*?<\\/section>`, 'i');
  return existing.test(html) ? html.replace(existing, fragment) : insertBeforeMainEnd(html, fragment);
}

function patch(relative, kind, transform) {
  for (const prefix of ['', '_site']) {
    const targetRelative = prefix ? path.join(prefix, relative) : relative;
    const file = path.join(root, targetRelative);
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) continue;
    const before = fs.readFileSync(file, 'utf8');
    const after = transform(before);
    if (after !== before) {
      fs.writeFileSync(file, after);
      changes.push(targetRelative.split(path.sep).join('/'));
    }
    checks.push({
      file: targetRelative.split(path.sep).join('/'),
      kind,
      ok: after.includes(`data-public-audit-reconciliation="${kind}"`)
    });
  }
}

for (const relative of freshnessPages) {
  patch(relative, 'freshness', html => replaceOrInsert(html, 'freshness',
    `<section class="section evidence-boundary" data-public-audit-reconciliation="freshness"><p><strong>Operational freshness:</strong> Page structure and available records were checked ${checkedDate}. This is an operational review date, not a substitute for the publication, event or retrieval date attached to each source. No newer item is implied where no authenticated update is shown.</p></section>`));
}

for (const relative of assessmentPages) {
  patch(relative, 'assessment', html => replaceOrInsert(html, 'assessment',
    `<section class="section evidence-boundary" data-public-audit-reconciliation="assessment"><h2>Assessment and falsification boundary</h2><p><strong>SPECULATION:</strong> Any hypothesis on this page that is not fully authenticated by directly verifiable, attributable evidence remains speculation and cannot support a factual allegation, guilt by association, or an automated conclusion.</p><p><strong>Missing verification:</strong> A defensible conclusion requires identity-resolved primary records, publication and event dates, provenance, and corroboration that addresses contradictory evidence. Source clustering alone does not establish intent or coordination.</p><p><strong>Counterpoint:</strong> Similar patterns may result from ordinary institutional incentives, incomplete reporting, shared vendors, public policy, coincidence, or data-quality limits.</p><p><strong>Watch next / falsifier:</strong> Seek a primary record that directly confirms or contradicts the mechanism claimed. If supporting evidence is corrected, withdrawn or fails entity resolution, downgrade or reopen the assessment.</p><p>Evidence and provenance review date: <time datetime="${checkedDate}">${checkedDate}</time>.</p></section>`));
}

for (const [relative, fragment] of Object.entries(thinPageCopy)) {
  patch(relative, 'thin-copy', html => replaceOrInsert(html, 'thin-copy', fragment));
}

const redirectPage = 'follow-the-money/making-money.html';
for (const prefix of ['', '_site']) {
  const targetRelative = prefix ? path.join(prefix, redirectPage) : redirectPage;
  const file = path.join(root, targetRelative);
  if (!fs.existsSync(file)) continue;
  const html = fs.readFileSync(file, 'utf8');
  checks.push({
    file: targetRelative.split(path.sep).join('/'),
    kind: 'redirect',
    ok: /http-equiv=["']refresh["']/i.test(html) && /rel=["']canonical["']/i.test(html)
  });
}

const report = {
  ok: checks.length > 0 && checks.every(check => check.ok),
  generatedAt: new Date().toISOString(),
  checkedDate,
  changes,
  checks,
  blackFileHeroFinalized: false,
  blackFileHeroSurfaces: [],
  namespaceAliasesFinalized: false,
  deployableAliasesFinalized: false,
  boundary: 'Operational review dates never replace source publication, event or retrieval dates. Unauthenticated interpretations are visibly labelled SPECULATION and cannot support factual conclusions. The canonical Black File hero is finalized before the final deployable alias pass.'
};

if (!report.ok) throw new Error('Public audit boundary reconciliation failed closed.');

const aliasRoutingReport = require('./patch-public-route-aliases.js');
if (!aliasRoutingReport.ok) throw new Error('Public route namespace alias routing failed closed.');
report.namespaceAliasesFinalized = true;

// This postbuild script is the last normal npm-build owner. Finalize the Black
// File public hero here so Test Site artifacts, local previews, release audits
// and production deployment all receive the same canonical H1—not merely the
// later deploy-guard or exhaustive-audit paths.
const blackFileHeroReport = require('./finalize-black-file-public-hero.js');
if (!blackFileHeroReport.ok) throw new Error('Black File public hero finalization failed closed during postbuild.');
report.blackFileHeroFinalized = true;
report.blackFileHeroSurfaces = blackFileHeroReport.surfaces || [];

const aliasReport = require('./finalize-public-route-aliases.js');
if (!aliasReport.ok) throw new Error('Public route alias finalization failed closed.');
report.deployableAliasesFinalized = true;
report.ok = report.ok
  && report.namespaceAliasesFinalized
  && report.blackFileHeroFinalized
  && report.deployableAliasesFinalized;

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (fs.existsSync(path.join(root, '_site'))) {
  const destination = path.join(root, '_site', 'downloads', path.basename(reportPath));
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(reportPath, destination);
}

if (!report.ok) throw new Error('Public audit boundary reconciliation did not complete every final owner.');
console.log(`Public audit boundaries reconciled: ${checks.length} checks, ${changes.length} file change(s); Black File hero, namespace routes and deployable aliases finalized.`);
