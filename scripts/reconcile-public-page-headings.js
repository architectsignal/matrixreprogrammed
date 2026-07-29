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
  let next = html
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

patch('daily-watch.html', patchDailyWatch);
patch('heroes-fighting-matrix-card.html', patchHeroesCard);

if (fs.existsSync(outputRoot) && fs.statSync(outputRoot).isDirectory()) {
  for (const relative of ['daily-watch.html', 'daily-watch']) patch(path.join('_site', relative), patchDailyWatch, false);
  for (const relative of ['heroes-fighting-matrix-card.html', 'heroes-fighting-matrix-card']) patch(path.join('_site', relative), patchHeroesCard, false);
}

const report = {
  ok: checks.length >= 2 && checks.every(item => item.ok),
  generatedAt: new Date().toISOString(),
  owner: 'scripts/reconcile-public-page-headings.js',
  changes,
  checks,
  boundary: 'This reconciliation changes document hierarchy only. It does not alter evidence, rankings, claims, membership, payment, forum or Worker behaviour.'
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (fs.existsSync(outputRoot) && fs.statSync(outputRoot).isDirectory()) {
  const destination = path.join(outputRoot, 'downloads', path.basename(reportPath));
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(reportPath, destination);
}

if (!report.ok) throw new Error('Public page heading reconciliation failed closed.');
console.log(`Public page headings reconciled: ${checks.length} route checks, ${changes.length} file change(s).`);
