#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const outputRoot = path.join(root, '_site');
const downloads = path.join(root, 'downloads');
const strictWarnings = process.argv.includes('--strict-warnings');
const ignoredSourceDirectories = new Set(['.git', '.wrangler', '_site', 'node_modules']);
const internalPages = new Set([
  'admin-control-center.html', 'admin-payment-dashboard.html', 'campaign-calendar.html',
  'card-art-studio.html', 'card-artwork-automation.html', 'card-artwork-batches.html',
  'card-artwork-queue.html', 'card-system-health.html', 'deploy-health.html',
  'deploy-status.html', 'distribution-center.html', 'funnel-book-path.html',
  'information-gathering-system.html', 'launch-room.html', 'machine-index.html',
  'monetisation-dashboard.html', 'offer-center.html', 'review-dashboard.html',
  'sales-ladder.html', 'schema-index.html', 'site-brain-router.html',
  'site-population-audit.html', 'source-intake.html',
  'speculative-conclusion-review-queue.html', 'thank-you-book-path.html',
  'update-monitor.html'
]);
const dynamicRoutes = new Set([
  'forum-health', 'forum-feed', 'forum-feed-main', 'forum-feed-speculation',
  'forum-feed-epstein-alive', 'forum-posts.json', 'forum-posts.md',
  'newsletter-signup', 'subscribe-newsletter', 'track-event', 'intro-voice',
  'submit-forum-post', 'submit-main-post', 'submit-speculation-post',
  'submit-epstein-alive-post', 'report-forum-post', 'report-main-post',
  'report-speculation-post', 'report-epstein-alive-post'
]);
const dynamicPage = /^(?:live-intel|news|daily-[\w-]+|[\w-]+-(?:watch|tracker|clock)|dashboard-[\w-]+|timers|update-[\w-]+|current-[\w-]+|latest-[\w-]+|intel-archive)\.html$/i;
const conclusionPage = /(?:^|[-_/])(?:conclusions?|theory|analysis|assessment|briefing|brief|dossier|watch)(?:[-_.\/]|$)/i;
const forbiddenPublicCopy = [
  'Free public intelligence builds trust', 'Email capture builds the list',
  'TURN THE INTELLIGENCE MACHINE INTO PRODUCTS', 'READER MONEY PATH',
  'CAPTURE SYSTEM', 'Persistent Cloudflare D1 member record',
  'Weekly newsletter sender', 'Monetisation Dashboard', 'Mission + Money Engine',
  'Site Brain Router', 'Card System Health', 'Artwork Automation', 'Copy/Intake Audit'
];

function slash(value) { return value.split(path.sep).join('/'); }
function sourcePath(relative) { return path.join(root, relative); }
function exists(relative) { return fs.existsSync(sourcePath(relative)); }
function read(relative) { return fs.readFileSync(sourcePath(relative), 'utf8'); }
function hash(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function walk(directory, ignored, base = directory, output = []) {
  if (!fs.existsSync(directory)) return output;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignored.has(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full, ignored, base, output);
    else output.push(slash(path.relative(base, full)));
  }
  return output;
}
function staticMarkup(html) {
  return String(html)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|template|textarea)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ');
}
function visibleText(html) {
  return staticMarkup(html)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}
function allMatches(value, regex, group = 1) {
  const result = [];
  let match;
  while ((match = regex.exec(value))) result.push(match[group]);
  return result;
}
function ids(markup) { return allMatches(markup, /\sid\s*=\s*["']([^"']+)["']/gi); }
function noindex(html) {
  return /<meta\b[^>]*(?:name=["']robots["'][^>]*content=["'][^"']*noindex|content=["'][^"']*noindex[^"']*["'][^>]*name=["']robots["'])/i.test(html);
}
function normalizeTarget(from, target) {
  const pathname = String(target).split(/[?#]/)[0].trim();
  if (!pathname || /^(?:https?:|mailto:|tel:|javascript:|data:|blob:)/i.test(pathname)) return null;
  return slash(pathname.startsWith('/')
    ? path.normalize(pathname.slice(1))
    : path.normalize(path.join(path.dirname(from), pathname))).replace(/^\.\//, '');
}
function targetExists(relative) {
  if (!relative || dynamicRoutes.has(relative.replace(/^\//, ''))) return true;
  if (exists(relative)) return true;
  if (!path.extname(relative) && exists(`${relative}.html`)) return true;
  return false;
}
function targetHtml(relative) {
  if (exists(relative) && relative.endsWith('.html')) return relative;
  if (!path.extname(relative) && exists(`${relative}.html`)) return `${relative}.html`;
  return null;
}
function conclusionScore(text, html) {
  const lower = text.toLowerCase();
  const checks = {
    length: text.split(/\s+/).length >= 220,
    sources: (html.match(/<a\b[^>]*href\s*=\s*["']https?:\/\/[^"']+["']/gi) || []).length >= 2 || /official|filing|court record|source|dataset|archive/i.test(text),
    specifics: /\b20\d{2}\b|\b\d+(?:\.\d+)?%\b|[€$£]\s?\d|\b\d+(?:\.\d+)?\s*(?:million|billion|trillion)\b/i.test(text),
    boundary: /evidence boundary|not proof|does not prove|association is not|speculation|cannot establish/i.test(text),
    mechanism: /mechanism|through|because|pipeline|incentive|dependency|operates through|works by/i.test(lower),
    implication: /why it matters|implication|this means|consequence|impact|risk/i.test(lower),
    limitation: /limitation|however|counterpoint|alternative explanation|uncertain|unknown|but this does not/i.test(lower),
    next: /watch next|next record|next step|falsification|verify|monitor|what to watch/i.test(lower)
  };
  return { score: Object.values(checks).filter(Boolean).length, checks };
}
function newestDate(text) {
  const values = allMatches(text, /\b(20\d{2}-(?:0[1-9]|1[0-2])-(?:[0-2]\d|3[01])(?:T[0-2]\d:[0-5]\d(?::[0-5]\d(?:\.\d+)?)?Z?)?)\b/g)
    .map(value => Date.parse(value.length === 10 ? `${value}T00:00:00Z` : value))
    .filter(Number.isFinite);
  return values.length ? Math.max(...values) : null;
}

const sourceFiles = walk(root, ignoredSourceDirectories);
const htmlFiles = sourceFiles.filter(file => file.endsWith('.html')).sort();
const builtFiles = walk(outputRoot, new Set()).sort();
const hardFailures = [];
const warnings = [];
const pages = [];
const externalLinks = new Set();
let linkReferences = 0;

for (const file of htmlFiles) {
  const html = read(file);
  const markup = staticMarkup(html);
  const text = visibleText(html);
  const basename = path.basename(file);
  const internal = internalPages.has(basename) || noindex(html);
  const page = { file, internal, bytes: Buffer.byteLength(html), words: text ? text.split(/\s+/).length : 0, sha256: hash(html), hardFailures: [], warnings: [] };
  const fail = message => { page.hardFailures.push(message); hardFailures.push({ category: 'Broken functionality', file, message }); };
  const warn = (category, message) => { page.warnings.push(message); warnings.push({ category, file, message }); };

  if (!internal) {
    if (!/<title\b[^>]*>[\s\S]*?<\/title>/i.test(html)) fail('Missing document title.');
    if (!/<meta\b[^>]*name=["']viewport["']/i.test(html)) fail('Missing viewport metadata.');
    if (!/<h1\b/i.test(markup)) fail('Missing visible static H1.');
    const redirect = /<meta\b[^>]*http-equiv=["']refresh["']/i.test(html) && /<link\b[^>]*rel=["']canonical["']/i.test(html);
    if (page.words < 70 && !redirect) warn('Placeholder', `Thin visible copy (${page.words} words).`);
    for (const phrase of forbiddenPublicCopy) if (text.toLowerCase().includes(phrase.toLowerCase())) fail(`Visible author-facing phrase: ${phrase}`);
  }

  const idValues = ids(markup);
  const duplicateIds = [...new Set(idValues.filter((id, index) => idValues.indexOf(id) !== index))];
  if (duplicateIds.length) fail(`Duplicate IDs: ${duplicateIds.join(', ')}`);
  const idSet = new Set(idValues);

  for (const match of markup.matchAll(/\s(href|src|action)\s*=\s*["']([^"']*)["']/gi)) {
    linkReferences += 1;
    const attribute = match[1].toLowerCase();
    const target = match[2].trim();
    if (!target || target === '#') { if (!internal) warn('Navigation', `${attribute} placeholder.`); continue; }
    if (/^(?:mailto:|tel:|javascript:|data:|blob:)/i.test(target)) continue;
    if (/^https?:\/\//i.test(target)) { externalLinks.add(target); continue; }
    if (target.startsWith('#')) { if (!idSet.has(target.slice(1))) fail(`Missing anchor target ${target}.`); continue; }
    const [targetWithoutAnchor, anchor] = target.split('#');
    const resolved = normalizeTarget(file, targetWithoutAnchor);
    if (resolved && !targetExists(resolved)) { fail(`Missing local ${attribute} target ${target}.`); continue; }
    if (anchor && resolved) {
      const targetFile = targetHtml(resolved);
      if (targetFile && !new Set(ids(staticMarkup(read(targetFile)))).has(anchor)) fail(`Missing cross-page anchor ${target}.`);
    }
  }

  if (!internal && dynamicPage.test(basename)) {
    const newest = newestDate(text);
    if (!newest) warn('Data freshness', 'Dynamic page has no visible date.');
    else {
      page.newestAgeDays = Math.floor((Date.now() - newest) / 86400000);
      if (page.newestAgeDays > 21) warn('Data freshness', `Newest visible date is ${page.newestAgeDays} days old.`);
    }
  }
  const nonAssessmentSurface = /(?:signup|quality-report)\.html$/i.test(basename);
  if (!internal && !nonAssessmentSurface && (conclusionPage.test(file) || /what the records support|current assessment|testable hypotheses/i.test(text))) {
    page.conclusion = conclusionScore(text, html);
    if (/conclusions?\.html$/i.test(basename) && page.conclusion.score < 6) fail(`Dedicated conclusion depth is ${page.conclusion.score}/8.`);
    else if (page.conclusion.score < 5) warn('Misleading health', `Shallow conclusion depth is ${page.conclusion.score}/8.`);
  }
  pages.push(page);
}

const sitemapUrls = exists('sitemap.xml') ? allMatches(read('sitemap.xml'), /<loc>([^<]+)<\/loc>/gi) : [];
for (const location of sitemapUrls) {
  let route = '';
  try { route = new URL(location).pathname.replace(/^\//, '') || 'index.html'; }
  catch { hardFailures.push({ category: 'Navigation', file: 'sitemap.xml', message: `Invalid sitemap URL ${location}.` }); continue; }
  if (!targetExists(route)) hardFailures.push({ category: 'Navigation', file: 'sitemap.xml', message: `Missing sitemap target ${route}.` });
  if (internalPages.has(path.basename(route))) hardFailures.push({ category: 'Security', file: 'sitemap.xml', message: `Internal page is indexed: ${route}.` });
}

const publicPages = pages.filter(page => !page.internal);
const builtSet = new Set(builtFiles);
const missingBuiltPages = publicPages.map(page => page.file).filter(file => !builtSet.has(file));
for (const file of missingBuiltPages) hardFailures.push({ category: 'Broken functionality', file, message: 'Public source page is missing from _site output.' });

const categories = {};
for (const item of [...hardFailures, ...warnings]) categories[item.category] = (categories[item.category] || 0) + 1;
const conclusionPages = publicPages.filter(page => page.conclusion);
const report = {
  ok: hardFailures.length === 0 && (!strictWarnings || warnings.length === 0),
  generatedAt: new Date().toISOString(),
  scope: 'All source HTML recursively, built-output parity, static markup links and anchors, visible structure, sitemap exposure, freshness signals and conclusion depth.',
  totals: {
    sourceFiles: sourceFiles.length, htmlPages: pages.length, publicPages: publicPages.length,
    internalPages: pages.length - publicPages.length, builtFiles: builtFiles.length,
    sitemapUrls: sitemapUrls.length, linkReferences, externalLinks: externalLinks.size,
    conclusionPages: conclusionPages.length,
    deepConclusionPages: conclusionPages.filter(page => page.conclusion.score >= 6).length,
    hardFailures: hardFailures.length, warnings: warnings.length,
    missingBuiltPages: missingBuiltPages.length
  },
  categories,
  hardFailures,
  warnings,
  pages
};

fs.mkdirSync(downloads, { recursive: true });
fs.writeFileSync(path.join(downloads, 'exhaustive-public-site-audit.json'), `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(path.join(downloads, 'exhaustive-public-site-audit.md'), [
  '# Exhaustive Public Site Audit', '',
  `Generated: ${report.generatedAt}`, `Result: ${report.ok ? 'PASS' : 'FAIL'}`, '',
  '## Scope', '', report.scope, '',
  '## Totals', '',
  ...Object.entries(report.totals).map(([key, value]) => `- ${key}: ${value}`), '',
  '## Classified findings', '',
  ...Object.entries(categories).sort().map(([key, value]) => `- ${key}: ${value}`), '',
  '## Hard failures', '',
  ...(hardFailures.length ? hardFailures.map(item => `- [${item.category}] ${item.file}: ${item.message}`) : ['- None']), '',
  '## Warnings', '',
  ...(warnings.length ? warnings.slice(0, 500).map(item => `- [${item.category}] ${item.file}: ${item.message}`) : ['- None'])
].join('\n'));

console.log(`EXHAUSTIVE PUBLIC SITE AUDIT ${report.ok ? 'PASSED' : 'FAILED'}: ${publicPages.length} public pages, ${linkReferences} static references, ${hardFailures.length} hard failures, ${warnings.length} warnings.`);
if (!report.ok) process.exit(1);
