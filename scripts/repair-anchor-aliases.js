const fs = require('fs');
const path = require('path');

const root = process.cwd();
const ignoredDirs = new Set(['.git', 'node_modules', '_site', '.wrangler']);
const report = {
  ok: true,
  checkedAt: new Date().toISOString(),
  scannedHtmlFiles: 0,
  linksChecked: 0,
  aliasesInserted: [],
  skipped: [],
  warnings: []
};

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoredDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.name.endsWith('.html')) files.push(full);
  }
  return files;
}
function rel(file) { return path.relative(root, file).replace(/\\/g, '/'); }
function isExternal(href) { return /^(https?:|mailto:|tel:|javascript:|data:)/i.test(href) || href.startsWith('#') || href === ''; }
function hasAnchor(html, anchor) {
  const safe = anchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\sid=["']${safe}["']`, 'i').test(html) || new RegExp(`\\sname=["']${safe}["']`, 'i').test(html);
}
function safeAnchor(anchor) {
  return /^[A-Za-z][A-Za-z0-9_:\-.]*$/.test(anchor);
}
function insertAlias(html, anchor) {
  const alias = `<span id="${anchor}" class="anchor-alias" aria-hidden="true"></span>`;
  if (html.includes('</main>')) return html.replace('</main>', `${alias}</main>`);
  if (html.includes('</body>')) return html.replace('</body>', `${alias}</body>`);
  return `${html}\n${alias}`;
}

const htmlFiles = walk(root);
report.scannedHtmlFiles = htmlFiles.length;
const htmlCache = new Map(htmlFiles.map(file => [rel(file), fs.readFileSync(file, 'utf8')]));
const pending = new Map();

for (const sourceFile of htmlFiles) {
  const sourceRel = rel(sourceFile);
  const html = htmlCache.get(sourceRel);
  const attrRegex = /(?:href|src)=["']([^"']+)["']/gi;
  let match;
  while ((match = attrRegex.exec(html)) !== null) {
    const raw = match[1].trim();
    if (isExternal(raw) || !raw.includes('#')) continue;
    const [targetPart, anchorAndQuery] = raw.split('#');
    const anchor = (anchorAndQuery || '').split('?')[0].trim();
    if (!targetPart || !anchor) continue;
    report.linksChecked += 1;
    if (!safeAnchor(anchor)) {
      report.skipped.push({ source: sourceRel, href: raw, reason: 'unsafe-or-non-html-anchor' });
      continue;
    }
    const target = targetPart.split('?')[0].trim();
    if (!target.endsWith('.html')) continue;
    const resolved = path.normalize(path.join(path.dirname(sourceFile), target));
    if (!resolved.startsWith(root)) {
      report.skipped.push({ source: sourceRel, href: raw, reason: 'outside-site-root' });
      continue;
    }
    const targetRel = rel(resolved);
    if (!htmlCache.has(targetRel)) {
      report.skipped.push({ source: sourceRel, href: raw, reason: 'target-file-missing' });
      continue;
    }
    if (hasAnchor(htmlCache.get(targetRel), anchor)) continue;
    if (!pending.has(targetRel)) pending.set(targetRel, new Set());
    pending.get(targetRel).add(anchor);
    report.aliasesInserted.push({ source: sourceRel, target: targetRel, anchor, href: raw });
  }
}

for (const [targetRel, anchors] of pending.entries()) {
  let html = htmlCache.get(targetRel);
  for (const anchor of anchors) {
    if (!hasAnchor(html, anchor)) html = insertAlias(html, anchor);
  }
  fs.writeFileSync(path.join(root, targetRel), html);
}

fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'anchor-alias-repair-report.json'), JSON.stringify(report, null, 2));
console.log(`Anchor alias repair scanned ${report.scannedHtmlFiles} HTML files, checked ${report.linksChecked} anchored links, inserted ${report.aliasesInserted.length} aliases.`);
