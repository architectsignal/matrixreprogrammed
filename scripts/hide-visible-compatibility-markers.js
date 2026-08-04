const fs = require('fs');
const path = require('path');

const root = process.cwd();
const outputOnly = process.argv.includes('--output');
const targets = outputOnly && fs.existsSync(path.join(root, '_site')) ? [path.join(root, '_site')] : [root];
const ignoredDirs = new Set(['.git', '.github', 'node_modules', '.wrangler', 'scripts', 'tools', 'netlify', 'evidence-archive', 'source-snapshots', 'browsertrix-output']);
if (!outputOnly) ignoredDirs.add('_site');

const malformedTokens = [
  'new-intelligence-toolspreservedaftervisiblede-duplication',
  'AuthorityHubroutepreservedaftervisiblede-duplication',
  'SchemaIndexroutepreservedaftervisiblede-duplication',
  'FeedCenterroutepreservedaftervisiblede-duplication',
  'ShareCenterroutepreservedaftervisiblede-duplication',
  'LaunchRoomroutepreservedaftervisiblede-duplication',
  'OfferCenterroutepreservedaftervisiblede-duplication',
  'DailyDroproutepreservedaftervisiblede-duplication',
  'Evidencebadgeroutepreservedaftervisiblede-duplication',
  'SourceDocumentVaultroutepreservedaftervisiblede-duplication',
  'reader-usefulness-routepreservedaftervisiblede-duplication',
  'figure-source-statuspreservedaftervisiblede-duplication'
];

const forbiddenPublicResidue = [
  ...malformedTokens,
  'preservedaftervisiblede-duplication',
  'compatibility-marker-vault',
  'public-copy-internal-vault',
  'compatibility-routes-preserved-with-clean-public-copy',
  'downloads/forum-posts.json',
  'downloads/forum-posts.md',
  ' reader field='
];

function escRegExp(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.html') || !path.extname(entry.name)) out.push(full);
  }
  return out;
}
function removeExistingVault(html) {
  return html
    .replace(/\s*<div\b(?=[^>]*\bid=["']compatibility-marker-vault["'])[^>]*>[\s\S]*?<\/div>/gi, '')
    .replace(/\s*<script\b(?=[^>]*\bid=["']compatibility-marker-vault["'])[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/\s*<script\b(?=[^>]*\bid=["']public-copy-internal-vault["'])[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/\s*<div\b(?=[^>]*\bclass=["'][^"']*\bcompatibility-markers\b[^"']*["'])[^>]*>[\s\S]*?<\/div>/gi, '');
}
function removeRetiredForumExports(html) {
  return html
    .replace(/\s*<a\b(?=[^>]*\bhref=["'][^"']*downloads\/forum-posts\.(?:json|md)["'])[^>]*>[\s\S]*?<\/a>/gi, '')
    .replace(/\bdownloads\/forum-posts\.(?:json|md)\b/gi, 'forum.html');
}
function repairMalformedFields(html) {
  return html.replace(/\sreader\s+field=(["'])(.*?)\1/gi, (_match, quote, value) => ` placeholder=${quote}${value}${quote}`);
}
function removeVisibleMarkerText(html) {
  html = html.replace(/>([^<]*preservedaftervisiblede-duplication[^<]*)</gi, '><');
  html = html.replace(/<!--[\s\S]*?preservedaftervisiblede-duplication[\s\S]*?-->/gi, '');
  for (const token of malformedTokens) html = html.replace(new RegExp(escRegExp(token), 'g'), '');
  html = html.replace(/\s+preservedaftervisiblede-duplication\b/g, '');
  html = html.replace(/\n{3,}/g, '\n\n');
  return html;
}
function patch(file) {
  let html;
  try { html = fs.readFileSync(file, 'utf8'); }
  catch { return false; }
  if (!/<!doctype html|<html\b/i.test(html)) return false;
  const before = html;
  html = removeExistingVault(html);
  html = removeRetiredForumExports(html);
  html = repairMalformedFields(html);
  html = removeVisibleMarkerText(html);
  if (html !== before) fs.writeFileSync(file, html);
  return html !== before;
}

const files = targets.flatMap(target => walk(target));
const touched = files.filter(patch).length;
const remaining = [];
for (const file of files) {
  let html = '';
  try { html = fs.readFileSync(file, 'utf8'); } catch { continue; }
  for (const token of forbiddenPublicResidue) {
    if (html.includes(token)) remaining.push(`${path.relative(root, file)}:${token}`);
  }
}
if (remaining.length) {
  console.error(`Public residue scrub failed: ${remaining.length} leak(s) remain.`);
  remaining.slice(0, 100).forEach(item => console.error(`- ${item}`));
  process.exit(1);
}
console.log(`Public residue scrub complete: ${touched} HTML file(s) patched across ${files.length} HTML surfaces; compatibility/internal payloads, retired forum-export references and malformed reader fields are absent.`);
