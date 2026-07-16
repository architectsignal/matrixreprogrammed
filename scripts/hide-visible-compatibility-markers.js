const fs = require('fs');
const path = require('path');

const root = process.cwd();
const outputOnly = process.argv.includes('--output');
const targets = outputOnly && fs.existsSync(path.join(root, '_site')) ? [path.join(root, '_site')] : [root];
const ignoredDirs = new Set(['.git', '.github', 'node_modules', '.wrangler', 'scripts', 'tools', 'netlify', 'evidence-archive', 'source-snapshots', 'browsertrix-output']);
if (!outputOnly) ignoredDirs.add('_site');

const markerTexts = [
  'new-intelligence-toolspreservedaftervisiblede-duplication',
  'AuthorityHubroutepreservedaftervisiblede-duplication',
  'SchemaIndexroutepreservedaftervisiblede-duplication',
  'downloads/forum-posts.json',
  'FeedCenterroutepreservedaftervisiblede-duplication',
  'ShareCenterroutepreservedaftervisiblede-duplication',
  'LaunchRoomroutepreservedaftervisiblede-duplication',
  'OfferCenterroutepreservedaftervisiblede-duplication',
  'phase-eighteen-offer-engine',
  'UsefulFreeBriefs',
  'ReadTheBlackFile',
  'DailyDroproutepreservedaftervisiblede-duplication',
  'Evidencebadgeroutepreservedaftervisiblede-duplication',
  'SourceDocumentVaultroutepreservedaftervisiblede-duplication',
  'reader-usefulness-routepreservedaftervisiblede-duplication',
  'figure-source-statuspreservedaftervisiblede-duplication'
];

const cleanCompatibilityRoutes = [
  'downloads/forum-posts.json',
  'downloads/forum-posts.md',
  'feed-center.html',
  'share-center.html',
  'launch-room.html',
  'offer-center.html',
  'source-document-vault.html',
  'evidence-vault.html',
  'black-file.html'
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
function safeCompatibilityBlock() {
  const payload = {
    status: 'compatibility-routes-preserved-with-clean-public-copy',
    checked: new Date().toISOString().slice(0, 10),
    routes: cleanCompatibilityRoutes
  };
  return `<script type="application/json" id="compatibility-marker-vault" data-cleanup-marker="deep-cleanup">${JSON.stringify(payload)}</script>`;
}
function removeExistingVault(html) {
  return html
    .replace(/\s*<div\b(?=[^>]*\bid=["']compatibility-marker-vault["'])[^>]*>[\s\S]*?<\/div>/gi, '')
    .replace(/\s*<script\b(?=[^>]*\bid=["']compatibility-marker-vault["'])[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/\s*<div\b(?=[^>]*\bclass=["'][^"']*\bcompatibility-markers\b[^"']*["'])[^>]*>[\s\S]*?<\/div>/gi, '');
}
function removeVisibleMarkerText(html) {
  for (const marker of markerTexts) html = html.replace(new RegExp(escRegExp(marker), 'g'), '');
  html = html.replace(/(?:[A-Za-z0-9/.-]+(?:route|tools|status|Vault|badge|Briefs|BlackFile)?preservedaftervisiblede-duplication\s*)+/g, '');
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
  html = removeVisibleMarkerText(html);
  const vault = safeCompatibilityBlock();
  if (html.includes('</main>')) html = html.replace('</main>', `${vault}</main>`);
  else if (html.includes('</body>')) html = html.replace('</body>', `${vault}</body>`);
  else html += vault;
  if (html !== before) fs.writeFileSync(file, html);
  return html !== before;
}

const files = targets.flatMap(target => walk(target));
const touched = files.filter(patch).length;
const remaining = [];
for (const file of files) {
  let html = '';
  try { html = fs.readFileSync(file, 'utf8'); } catch { continue; }
  for (const marker of markerTexts) if (html.includes(marker) && !html.includes(`"${marker}"`)) remaining.push(`${path.relative(root, file)}:${marker}`);
  if (html.includes('preservedaftervisiblede-duplication')) remaining.push(`${path.relative(root, file)}:preservedaftervisiblede-duplication`);
}
if (remaining.length) {
  console.error(`Public marker scrub failed: ${remaining.length} marker leak(s) remain.`);
  remaining.slice(0, 100).forEach(item => console.error(`- ${item}`));
  process.exit(1);
}
console.log(`Public marker scrub complete: ${touched} HTML file(s) patched across ${files.length} HTML surfaces; no visible compatibility markers remain.`);
