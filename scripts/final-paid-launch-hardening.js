const fs = require('fs');
const path = require('path');

const root = process.cwd();
const sourceSha = String(process.env.GITHUB_SHA || process.env.CF_PAGES_COMMIT_SHA || process.env.COMMIT_SHA || 'local').trim();
const ignored = new Set(['.git', '.github', 'node_modules', '.wrangler', '_site', 'scripts', 'tools', 'evidence-archive', 'source-snapshots', 'browsertrix-output']);
const report = {
  generatedAt: new Date().toISOString(), sourceSha,
  htmlChecked: 0, htmlChanged: 0, markersRemoved: 0, canonicalTagsAdded: 0,
  freshnessLabelsAdded: 0, publicCopyReplacements: 0, dashboardRepairs: 0,
  actorDocumentLabelsRemoved: 0, visibleEscapedNewlinesRemoved: 0,
  malformedRuntimeValuesRemoved: 0, problems: []
};

function slash(value) { return value.split(path.sep).join('/'); }
function isHtmlFile(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.html') return true;
  if (ext) return false;
  try { return /<!doctype html|<html\b/i.test(fs.readFileSync(file, 'utf8').slice(0, 1000)); } catch { return false; }
}
function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && ignored.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (isHtmlFile(full)) files.push(full);
  }
  return files;
}
function routeFor(file, base) {
  let rel = slash(path.relative(base, file));
  if (rel === 'index.html' || rel === 'index') return '/';
  rel = rel.replace(/\.html$/i, '');
  return `/${rel.replace(/^\/+/, '')}`;
}
function replaceCount(input, pattern, replacement, counter) {
  let count = 0;
  const output = input.replace(pattern, (...args) => {
    count += 1;
    return typeof replacement === 'function' ? replacement(...args) : replacement;
  });
  report[counter] += count;
  return output;
}
function removeMarkerLeaks(html) {
  const patterns = [
    /preservedaftervisible-de-duplication/gi,
    /preservedaftervisiblede-duplication/gi,
    /preserved\s*after\s*visible\s*[- ]?de[- ]?duplication/gi
  ];
  for (const pattern of patterns) html = replaceCount(html, pattern, '', 'markersRemoved');
  html = replaceCount(html, /<!--[^>]*preserved[^>]*visible[^>]*duplication[^>]*-->/gi, '', 'markersRemoved');
  html = replaceCount(html, />([^<]*preserved[^<]*visible[^<]*duplication[^<]*)</gi, '><', 'markersRemoved');
  return html;
}
function replacePublicJargon(html) {
  const replacements = new Map([
    ['Site Brain Router', 'Site navigation'],
    ['Machine Index', 'Site index'],
    ['Answer Engine', 'Research answers'],
    ['Money Engine', 'Membership support'],
    ['Mission + Money Engine', 'Project support'],
    ['Capture System', 'Email updates'],
    ['Monetisation Dashboard', 'Membership dashboard'],
    ['Reader Money Path', 'Membership options'],
    ['Operational Board', 'Status dashboard']
  ]);
  for (const [from, to] of replacements) {
    html = replaceCount(html, new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), to, 'publicCopyReplacements');
  }
  return html;
}
function removeActorDocumentNames(html) {
  const documentNames = '(?:SEC Complaint|Court Complaint|Indictment|Charging Document|Affidavit|Exhibit|Docket Entry)';
  const actorArticle = new RegExp(`<article\\b(?=[^>]*(?:class=["'][^"']*(?:actor|person|entity)[^"']*["']|data-entity-type=["']actor["']))[^>]*>[\\s\\S]*?<h[2-4][^>]*>\\s*${documentNames}\\s*</h[2-4]>[\\s\\S]*?<\\/article>`, 'gi');
  return replaceCount(html, actorArticle, '', 'actorDocumentLabelsRemoved');
}
function sanitizeVisibleTextNodes(html) {
  return html.replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>|<!--([\s\S]*?)-->|<[^>]+>|[^<]+/gi, token => {
    if (token.startsWith('<')) return token;
    let next = token;
    next = replaceCount(next, /\\r\\n|\\n|\\r/g, '\n', 'visibleEscapedNewlinesRemoved');
    next = replaceCount(next, /\b(Card\s+ID\s*:\s*)(?:undefined|null|NaN)\b/gi, '$1not assigned', 'malformedRuntimeValuesRemoved');
    next = replaceCount(next, /\b(?:undefined|null|NaN)\b/g, 'not available', 'malformedRuntimeValuesRemoved');
    return next;
  });
}
function visibleText(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--([\s\S]*?)-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:nbsp|amp|lt|gt|quot|#39);/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function canonicalize(html, route) {
  const canonical = `https://matrixreprogrammed.com${route}`;
  if (/<link\b[^>]*rel=["']canonical["']/i.test(html)) {
    return html.replace(/<link\b[^>]*rel=["']canonical["'][^>]*>/i, `<link rel="canonical" href="${canonical}" />`);
  }
  const tag = `<link rel="canonical" href="${canonical}" />`;
  report.canonicalTagsAdded += 1;
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${tag}</head>`);
  return tag + html;
}
function addFreshness(html, file) {
  const name = path.basename(file).toLowerCase();
  const title = ((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').toLowerCase();
  const target = /(?:^|[-_])(daily|live|latest|weekly)(?:[-_.]|$)/.test(name) || /\b(daily|live|latest|weekly)\b/.test(title);
  if (!target || html.includes('data-site-freshness-label')) return html;
  const date = new Date().toISOString().slice(0, 10);
  const block = `<div class="freshness-label" data-site-freshness-label="true" role="status"><strong>Freshness:</strong> generated ${date}. Each source lane should be checked against its displayed last-successful refresh.</div>`;
  report.freshnessLabelsAdded += 1;
  if (/<main\b[^>]*>/i.test(html)) return html.replace(/(<main\b[^>]*>)/i, `$1${block}`);
  return html.replace(/(<body\b[^>]*>)/i, `$1${block}`);
}
function addPartialRefreshMessage(html, file) {
  const name = path.basename(file).toLowerCase();
  if (!/(daily|live|latest|weekly|feed|news)/.test(name) || html.includes('partial-source-refresh-message')) return html;
  const block = `<p id="partial-source-refresh-message" class="warning" hidden>Some source lanes did not refresh successfully. Available lanes remain visible with their last successful update; missing lanes are not presented as current.</p><script>(function(){var failed=document.querySelector('[data-source-status="failed"],[data-refresh-status="failed"],[data-lane-status="failed"],[data-feed-status="partial"]');var note=document.getElementById('partial-source-refresh-message');if(failed&&note)note.hidden=false;}());</script>`;
  if (/<\/main>/i.test(html)) return html.replace(/<\/main>/i, `${block}</main>`);
  return html.replace(/<\/body>/i, `${block}</body>`);
}
function repairDashboard(html, file) {
  if (!/case-status-dashboard(?:\.html)?$/i.test(file)) return html;
  const before = html;
  html = html.replace(/data\.book\s+links/g, 'data.moneyRoutes');
  html = html.replace(/Loading boundary\.\.\./gi, 'This dashboard tracks public-record workflow and evidence quality. Association is not proof of wrongdoing.');
  html = html.replace(/<h3>Loading lanes\.\.\.<\/h3>\s*<p>The operational board is loading\.<\/p>/gi, '<h3>Status available</h3><p>Open Tracker Core for the complete current lane status.</p>');
  html = html.replace(/STATUS FROM CORE\\n/gi, 'STATUS FROM CORE<br>');
  html = html.replace(/&gt; ([^<\\]+)\\n/gi, '&gt; $1<br>');
  if (html !== before) report.dashboardRepairs += 1;
  return html;
}
function patch(file, base) {
  let html = fs.readFileSync(file, 'utf8');
  const before = html;
  report.htmlChecked += 1;
  html = removeMarkerLeaks(html);
  html = replacePublicJargon(html);
  html = removeActorDocumentNames(html);
  html = repairDashboard(html, file);
  html = sanitizeVisibleTextNodes(html);
  html = canonicalize(html, routeFor(file, base));
  html = addFreshness(html, file);
  html = addPartialRefreshMessage(html, file);
  html = html.replace(/\n{4,}/g, '\n\n\n');
  if (html !== before) {
    fs.writeFileSync(file, html);
    report.htmlChanged += 1;
  }
}

const output = path.join(root, '_site');
const roots = [{ base: root, files: walk(root) }];
if (fs.existsSync(output)) roots.push({ base: output, files: walk(output) });
const seen = new Set();
for (const group of roots) {
  for (const file of group.files) {
    const key = path.resolve(file);
    if (seen.has(key)) continue;
    seen.add(key);
    patch(file, group.base);
  }
}

for (const file of seen) {
  const html = fs.readFileSync(file, 'utf8');
  const text = visibleText(html);
  if (/preservedaftervisible(?:-)?de-duplication/i.test(html)) report.problems.push(`${slash(path.relative(root, file))}: visible de-duplication marker remains`);
  if (/\\r\\n|\\n|\\r/.test(text)) report.problems.push(`${slash(path.relative(root, file))}: escaped newline remains visible`);
  if (/\b(?:undefined|null|NaN)\b/.test(text)) report.problems.push(`${slash(path.relative(root, file))}: malformed runtime value remains visible`);
  if (/case-status-dashboard(?:\.html)?$/i.test(file)) {
    if (/Loading boundary|Loading lanes|data\.book\s+links|STATUS FROM CORE\\n/i.test(html)) report.problems.push(`${slash(path.relative(root, file))}: dashboard placeholder or syntax defect remains`);
    for (const id of ['counts', 'grades', 'next']) {
      if (new RegExp(`id=["']${id}["']\\s*>\\s*<\\/div>`, 'i').test(html)) report.problems.push(`${slash(path.relative(root, file))}: empty core section #${id}`);
    }
  }
}

fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'final-paid-launch-hardening.json'), JSON.stringify(report, null, 2));
if (fs.existsSync(output)) {
  fs.writeFileSync(path.join(output, 'build-provenance.json'), JSON.stringify({
    sourceSha,
    generatedAt: report.generatedAt,
    gate: 'paid-launch-critical-gate',
    artifactDirectory: '_site'
  }, null, 2));
}
if (report.problems.length) {
  console.error('FINAL PAID LAUNCH HARDENING FAILED');
  report.problems.forEach(problem => console.error(`- ${problem}`));
  process.exit(1);
}
console.log(`FINAL PAID LAUNCH HARDENING PASSED: ${report.htmlChecked} HTML surfaces checked; ${report.htmlChanged} changed; ${report.markersRemoved} marker leaks, ${report.visibleEscapedNewlinesRemoved} escaped newlines and ${report.malformedRuntimeValuesRemoved} malformed values removed.`);
