'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const roots = [root, path.join(root, '_site')]
  .filter((value, index, all) => all.indexOf(value) === index && fs.existsSync(value));
const requiredRoutes = [
  'evidence-vault.html',
  'live-intel.html',
  'books.html',
  'videos.html',
  'optin-center.html',
  'corrections.html'
];
const reportPath = path.join(root, 'downloads', 'p1-public-quality-routes.json');
const results = [];

function walk(directory, output = []) {
  if (!fs.existsSync(directory)) return output;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ['.git', '.github', 'node_modules', '.wrangler', 'scripts', 'downloads', 'data'].includes(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file, output);
    else if (entry.isFile() && (entry.name.endsWith('.html') || !path.extname(entry.name))) output.push(file);
  }
  return output;
}

function patch(file) {
  let html;
  try { html = fs.readFileSync(file, 'utf8'); } catch { return; }
  if (!/<!doctype\s+html|<html\b/i.test(html) || !/data-p1-public-quality=/i.test(html)) return;
  const before = html;
  html = html.replace(/(<section\b[^>]*data-p1-public-quality=["'][^"']+["'][^>]*>[\s\S]*?<div class=["']cta-row["']>)([\s\S]*?)(<\/div>)/i,
    (match, opening, buttons, closing) => {
      let nextButtons = buttons;
      if (!/href=["']optin-center\.html["']/i.test(nextButtons)) {
        nextButtons += '<a class="btn alt" href="optin-center.html">Choose a free briefing</a>';
      }
      return `${opening}${nextButtons}${closing}`;
    });
  if (html !== before) fs.writeFileSync(file, html);
  const missingRoutes = requiredRoutes.filter(route => !new RegExp(`href=["']${route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'i').test(html));
  results.push({
    file: path.relative(root, file).split(path.sep).join('/'),
    changed: html !== before,
    missingRoutes
  });
}

for (const base of roots) for (const file of walk(base)) patch(file);
const issues = results.flatMap(result => result.missingRoutes.map(route => `${result.file}: missing ${route}`));
const report = {
  ok: results.length >= 15 && issues.length === 0,
  generatedAt: new Date().toISOString(),
  checkedSurfaces: results.length,
  requiredRoutes,
  results,
  issues,
  boundary: 'Every P1 quality page exposes direct reader routes to evidence, current change, books, video, a free briefing and corrections. The free-brief route is distinct from newsletter subscription.'
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) {
  console.error('P1 PUBLIC QUALITY ROUTE FINALIZATION FAILED');
  if (results.length < 15) console.error(`- only ${results.length} P1 quality surfaces were found`);
  issues.slice(0, 100).forEach(issue => console.error(`- ${issue}`));
  process.exit(1);
}
console.log(`P1 PUBLIC QUALITY ROUTES PASSED: ${results.length} source/output surfaces expose all six reader routes.`);
module.exports = report;
