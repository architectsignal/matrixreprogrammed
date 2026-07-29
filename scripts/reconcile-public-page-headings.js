'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const outputRoot = path.join(root, '_site');
const reportPath = path.join(root, 'downloads', 'public-page-heading-reconciliation.json');
const changes = [];
const checks = [];

function patch(relative, transform, required = true) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    if (required) throw new Error(`Required public page is missing: ${relative}`);
    return;
  }
  const before = fs.readFileSync(file, 'utf8');
  const after = transform(before, relative);
  if (after !== before) {
    fs.writeFileSync(file, after);
    changes.push(relative);
  }
}

function patchDailyWatch(html, relative) {
  const next = html
    .replace(/\.hit-list-head h2\{/g, '.hit-list-head h1{')
    .replace(/<h2(\s+id=["']daily-hit-list-title["'][^>]*)>([\s\S]*?)<\/h2>/i, '<h1$1>$2</h1>');
  const ok = /<h1\s+id=["']daily-hit-list-title["'][^>]*>[\s\S]*?<\/h1>/i.test(next);
  checks.push({ file: relative, contract: 'visible daily-watch H1', ok });
  if (!ok) throw new Error(`${relative} could not be reconciled to a visible Daily Intelligence Hit List H1`);
  return next;
}

function patchHeroesCard(html, relative) {
  let next = html;
  if (!/id=["']heroes-card-page-title["']/i.test(next)) {
    const title = '<header class="public-page-title" aria-labelledby="heroes-card-page-title"><span class="eyebrow">Heroes Fighting the Matrix</span><h1 id="heroes-card-page-title">Heroes Fighting the Matrix Card</h1><p class="lead">Open a source-led profile card with documented contribution, evidence links and clear editorial boundaries.</p></header>';
    if (/<main\b[^>]*>/i.test(next)) next = next.replace(/(<main\b[^>]*>)/i, `$1${title}`);
    else if (/<\/header>/i.test(next)) next = next.replace(/<\/header>/i, `</header>${title}`);
    else throw new Error(`${relative} has no stable insertion point for its visible H1`);
  }
  const ok = /<h1\s+id=["']heroes-card-page-title["'][^>]*>[\s\S]*?<\/h1>/i.test(next);
  checks.push({ file: relative, contract: 'visible heroes-card H1', ok });
  if (!ok) throw new Error(`${relative} could not be reconciled to a visible Heroes Fighting the Matrix Card H1`);
  return next;
}

function patchEntityBrief(html, relative) {
  let next = html;
  if (!/data-public-evidence-boundary=["']true["']/i.test(next)) {
    const boundary = '<p class="evidence-boundary" data-public-evidence-boundary="true"><strong>Evidence boundary:</strong> This brief summarizes source-linked public records and relationship signals. It does not prove private intent, wrongdoing, coordination, or control.</p>';
    if (/<\/main>/i.test(next)) next = next.replace(/<\/main>/i, `${boundary}</main>`);
    else if (/<footer\b/i.test(next)) next = next.replace(/<footer\b/i, `${boundary}<footer`);
    else if (/<\/body>/i.test(next)) next = next.replace(/<\/body>/i, `${boundary}</body>`);
    else throw new Error(`${relative} has no stable insertion point for its evidence boundary`);
  }
  const ok = /data-public-evidence-boundary=["']true["'][^>]*>[\s\S]*?<strong>\s*Evidence boundary:\s*<\/strong>/i.test(next);
  checks.push({ file: relative, contract: 'static visible evidence boundary', ok });
  if (!ok) throw new Error(`${relative} could not be reconciled to a static visible evidence boundary`);
  return next;
}

function patchEntityBriefDirectory(baseRelative, required) {
  const directory = path.join(root, baseRelative);
  if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
    if (required) throw new Error(`Required entity brief directory is missing: ${baseRelative}`);
    return;
  }
  const pages = fs.readdirSync(directory)
    .filter(name => name.endsWith('.html'))
    .sort();
  if (required && pages.length === 0) throw new Error(`No entity briefs were found in ${baseRelative}`);
  for (const name of pages) patch(path.join(baseRelative, name), patchEntityBrief, required);
}

patch('daily-watch.html', patchDailyWatch);
patch('heroes-fighting-matrix-card.html', patchHeroesCard);
patchEntityBriefDirectory('entity-briefs', true);

if (fs.existsSync(outputRoot) && fs.statSync(outputRoot).isDirectory()) {
  for (const relative of ['daily-watch.html', 'daily-watch']) patch(path.join('_site', relative), patchDailyWatch, false);
  for (const relative of ['heroes-fighting-matrix-card.html', 'heroes-fighting-matrix-card']) patch(path.join('_site', relative), patchHeroesCard, false);
  patchEntityBriefDirectory(path.join('_site', 'entity-briefs'), false);
}

const headingChecks = checks.filter(item => /H1/.test(item.contract));
const boundaryChecks = checks.filter(item => item.contract === 'static visible evidence boundary');
const report = {
  ok: headingChecks.length >= 2 && boundaryChecks.length > 0 && checks.every(item => item.ok),
  generatedAt: new Date().toISOString(),
  owner: 'scripts/reconcile-public-page-headings.js',
  changes,
  checks,
  summary: {
    headingChecks: headingChecks.length,
    entityBoundaryChecks: boundaryChecks.length,
    changedFiles: changes.length
  },
  boundary: 'This reconciliation changes document hierarchy and makes existing evidence limitations statically visible. It does not alter evidence, rankings, claims, membership, payment, forum or Worker behaviour.'
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (fs.existsSync(outputRoot) && fs.statSync(outputRoot).isDirectory()) {
  const destination = path.join(outputRoot, 'downloads', path.basename(reportPath));
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(reportPath, destination);
}

if (!report.ok) throw new Error('Public page heading and evidence-boundary reconciliation failed closed.');
console.log(`Public page headings and entity evidence boundaries reconciled: ${checks.length} route checks, ${changes.length} file change(s).`);
