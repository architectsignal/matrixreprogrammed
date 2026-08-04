'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const correctionsRoute = require('./ensure-corrections-route.js');
if (!correctionsRoute.ok) throw new Error('The canonical corrections route failed closed.');
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
const canonicalBusinessGuide = 'downloads/wealth-guides/business-builder.pdf';
const retiredBusinessGuide = 'downloads/wealth-guides/business-system.pdf';
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
  const relative = path.relative(root, file).split(path.sep).join('/');

  // The detailed guide catalogue uses business-builder.pdf. A legacy display
  // label derived business-system.pdf after the page-specific P1 finalizer.
  // Repair it here, in the true final route owner, so source and both deployable
  // aliases can never promote a file that is not generated.
  if (/(?:^|\/)download-center(?:\.html)?$/i.test(relative)) {
    html = html
      .replace(/downloads\/wealth-guides\/business-system\.pdf/gi, canonicalBusinessGuide)
      .replace(/Wealth Guides\/Business system/gi, 'Business Creation Engine');
  }

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
  const isDownloadCenter = /(?:^|\/)download-center(?:\.html)?$/i.test(relative);
  results.push({
    file: relative,
    changed: html !== before,
    missingRoutes,
    canonicalBusinessGuide: !isDownloadCenter || html.includes(canonicalBusinessGuide),
    retiredBusinessGuideAbsent: !isDownloadCenter || !html.includes(retiredBusinessGuide)
  });
}

for (const base of roots) for (const file of walk(base)) patch(file);
const issues = results.flatMap(result => [
  ...result.missingRoutes.map(route => `${result.file}: missing ${route}`),
  ...(result.canonicalBusinessGuide ? [] : [`${result.file}: missing generated Business Creation Engine PDF route`]),
  ...(result.retiredBusinessGuideAbsent ? [] : [`${result.file}: retains dead Business system PDF route`])
]);
const sourceGuide = path.join(root, canonicalBusinessGuide);
const deployableGuide = path.join(root, '_site', canonicalBusinessGuide);
if (!fs.existsSync(sourceGuide)) issues.push(`${canonicalBusinessGuide}: generated source PDF missing`);
if (fs.existsSync(path.join(root, '_site')) && !fs.existsSync(deployableGuide)) issues.push(`_site/${canonicalBusinessGuide}: generated deployable PDF missing`);

const report = {
  ok: correctionsRoute.ok && results.length >= 15 && issues.length === 0,
  generatedAt: new Date().toISOString(),
  checkedSurfaces: results.length,
  requiredRoutes,
  correctionsRoute: {
    ok: correctionsRoute.ok,
    canonicalRoute: correctionsRoute.canonicalRoute,
    targets: correctionsRoute.targets
  },
  canonicalBusinessGuide,
  sourceGuidePresent: fs.existsSync(sourceGuide),
  deployableGuidePresent: !fs.existsSync(path.join(root, '_site')) || fs.existsSync(deployableGuide),
  results,
  issues,
  boundary: 'Every P1 quality page exposes direct reader routes to evidence, current change, books, video, a free briefing and the durable corrections route. The free-brief route is distinct from newsletter subscription, and every promoted PDF route must resolve to a generated file.'
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) {
  console.error('P1 PUBLIC QUALITY ROUTE FINALIZATION FAILED');
  if (!correctionsRoute.ok) console.error('- canonical corrections route is unhealthy');
  if (results.length < 15) console.error(`- only ${results.length} P1 quality surfaces were found`);
  issues.slice(0, 100).forEach(issue => console.error(`- ${issue}`));
  process.exit(1);
}
console.log(`P1 PUBLIC QUALITY ROUTES PASSED: ${results.length} source/output surfaces expose all six reader routes, the corrections destination and only generated PDF assets.`);
module.exports = report;
