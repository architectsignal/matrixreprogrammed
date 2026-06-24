const fs = require('fs');
const path = require('path');

const root = process.cwd();
const dataDir = path.join(root, 'data');
const downloadsDir = path.join(root, 'downloads');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });

const ignoredDirs = new Set(['.git', 'node_modules']);
const ignoredFiles = new Set(['site-freshness-report.html']);
const htmlFiles = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoredDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    const rel = path.relative(root, full).replace(/\\/g, '/');
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.html') && !ignoredFiles.has(entry.name)) htmlFiles.push(rel);
  }
}
walk(root);

function esc(s = '') { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function visibleCopy(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function contexts(copy, regex) {
  const out = [];
  for (const match of copy.matchAll(regex)) {
    const start = Math.max(0, match.index - 90);
    const end = Math.min(copy.length, match.index + match[0].length + 110);
    const context = copy.slice(start, end).replace(/\s+/g, ' ').trim();
    out.push({ value: match[0], context });
    if (out.length >= 12) break;
  }
  return out;
}
function priorityFor(copy, file) {
  const text = `${file} ${copy}`.toLowerCase();
  let score = 0;
  for (const term of ['latest','current','today','weekly','live','updated','crisis','figure','rate','percent','percentage','death','deaths','claim','claims','payout','migration','vaccine','epstein','war','conflict','surveillance','inflation','crime','cartel','human cost']) if (text.includes(term)) score += 1;
  if (/\d+(\.\d+)?\s*%/.test(copy)) score += 2;
  if (/[€$£]\s?\d|\d+\s?(million|billion|trillion)/i.test(copy)) score += 2;
  if (/\b20\d{2}\b/.test(copy)) score += 1;
  if (score >= 8) return 'High';
  if (score >= 4) return 'Medium';
  return 'Low';
}
const pages = htmlFiles.map(file => {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  const copy = visibleCopy(html);
  const percentages = contexts(copy, /\b\d+(?:\.\d+)?\s*%\b/g);
  const money = contexts(copy, /(?:[€$£]\s?\d[\d,.]*|\b\d[\d,.]*\s?(?:million|billion|trillion)\b)/gi);
  const dates = contexts(copy, /\b(?:20\d{2}|19\d{2})\b/g);
  const crisisFigures = contexts(copy, /\b\d[\d,.]*\s?(?:deaths?|claims?|cases?|migrants?|refugees?|payouts?|lawsuits?|files?|pages?|sources?|bulletins?|updates?|feeds?|lanes?|maps?|offers?|books?)\b/gi);
  const figureCount = percentages.length + money.length + crisisFigures.length;
  return {
    file,
    priority: priorityFor(copy, file),
    figureCount,
    percentages,
    money,
    crisisFigures,
    dates: dates.slice(0, 6),
    needsSourceRule: figureCount > 0,
    recommendation: figureCount > 0 ? 'Attach source-specific update rule before auto-changing figures.' : 'No obvious dynamic figures detected.'
  };
}).filter(p => p.figureCount || p.priority !== 'Low')
  .sort((a, b) => ({ High: 0, Medium: 1, Low: 2 }[a.priority] - { High: 0, Medium: 1, Low: 2 }[b.priority]) || b.figureCount - a.figureCount);

const report = {
  generatedBy: 'Matrix Reprogrammed weekly site-wide freshness scanner',
  policy: 'This scanner finds figures and stale-risk copy. It does not rewrite figures unless a trusted source rule exists. Wrong automatic numbers are worse than old numbers.',
  scannedPages: htmlFiles.length,
  flaggedPages: pages.length,
  highPriorityPages: pages.filter(p => p.priority === 'High').length,
  mediumPriorityPages: pages.filter(p => p.priority === 'Medium').length,
  pages
};
function stableSignature(obj) {
  return JSON.stringify({ scannedPages: obj.scannedPages, pages: obj.pages.map(p => ({ file: p.file, priority: p.priority, figureCount: p.figureCount, percentages: p.percentages.map(x => x.value), money: p.money.map(x => x.value), crisisFigures: p.crisisFigures.map(x => x.value) })) });
}
const reportPath = path.join(dataDir, 'site-freshness-report.json');
let previous = null;
if (fs.existsSync(reportPath)) {
  try { previous = JSON.parse(fs.readFileSync(reportPath, 'utf8')); } catch (_) {}
}
if (previous && stableSignature(previous) === stableSignature(report)) {
  console.log(`Site freshness scan checked ${htmlFiles.length} pages: no meaningful figure changes.`);
  process.exit(0);
}
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

const md = [
  '# Site Freshness Report',
  '',
  report.policy,
  '',
  `Scanned pages: ${report.scannedPages}`,
  `Flagged pages: ${report.flaggedPages}`,
  `High priority pages: ${report.highPriorityPages}`,
  `Medium priority pages: ${report.mediumPriorityPages}`,
  '',
  '## High Priority Pages',
  ...pages.filter(p => p.priority === 'High').slice(0, 30).map(p => `- ${p.file}: ${p.figureCount} figure/stat markers. ${p.recommendation}`),
  '',
  '## Medium Priority Pages',
  ...pages.filter(p => p.priority === 'Medium').slice(0, 40).map(p => `- ${p.file}: ${p.figureCount} figure/stat markers.`),
  '',
  '## Auto-Update Boundary',
  '- Live Intel updates can be fetched weekly from source lanes.',
  '- Hard figures, percentages, payouts, deaths, claims, and crisis numbers require explicit source rules before replacement.',
  '- The safe path is scan → flag → source-rule → update.'
].join('\n');
fs.writeFileSync(path.join(downloadsDir, 'site-freshness-report.md'), md);

const cards = pages.slice(0, 80).map(p => `<article class="card ${p.priority === 'High' ? 'redline' : ''}"><span class="label">${esc(p.priority)} · ${p.figureCount} figure markers</span><h3>${esc(p.file)}</h3><p>${esc(p.recommendation)}</p><details><summary>Detected examples</summary><p>${esc([...p.percentages, ...p.money, ...p.crisisFigures].slice(0, 8).map(x => `${x.value} — ${x.context}`).join('\n'))}</p></details></article>`).join('');
const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Site Freshness Report | Matrix Reprogrammed</title><meta name="description" content="Weekly figure freshness scan for Matrix Reprogrammed pages." /><link rel="stylesheet" href="styles.css" /></head><body><canvas id="matrix"></canvas><div class="signal-face"></div><div class="veil"></div><div class="page"><header class="wrap topbar"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil" /> MATRIX REPROGRAMMED</a><nav class="nav"><a href="index.html">Home</a><a href="live-intel.html">Live Intel</a><a href="news.html">Intel Desk</a><a href="evidence-vault.html">Evidence Vault</a><a href="books.html">Books</a></nav></header><main><section class="hero wrap"><div class="eyebrow">Weekly Freshness Scanner</div><h1>SITE FRESHNESS REPORT.</h1><p class="lead">This report scans public pages for figures, percentages, money amounts, crisis numbers, dates, deaths, claims, and stale-risk language. It flags what needs source rules before automatic replacement.</p><div class="cta-row"><a class="btn" href="data/site-freshness-report.json">JSON Report</a><a class="btn alt" href="downloads/site-freshness-report.md">Markdown Report</a><a class="btn alt" href="live-intel.html">Live Intel</a></div></section><section class="section wrap split"><div class="terminal">FRESHNESS SCAN STATUS\n&gt; Pages scanned: ${report.scannedPages}\n&gt; Flagged pages: ${report.flaggedPages}\n&gt; High priority: ${report.highPriorityPages}\n&gt; Medium priority: ${report.mediumPriorityPages}\n&gt; Boundary: source rule required before auto-rewrite</div><aside class="card redline"><h2>Important Boundary</h2><p>${esc(report.policy)}</p></aside></section><section class="section wrap"><h2>Flagged Pages</h2><div class="grid">${cards}</div></section></main><footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — scan, verify, then update.</p></footer></div><script src="matrix.js"></script></body></html>`;
fs.writeFileSync(path.join(root, 'site-freshness-report.html'), html);
console.log(`Site freshness scan complete: ${report.flaggedPages} flagged pages from ${report.scannedPages} scanned pages.`);
