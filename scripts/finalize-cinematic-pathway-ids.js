const fs = require('fs');
const path = require('path');

const root = process.cwd();
const reportPath = path.join(root, 'downloads', 'cinematic-pathway-id-finalization.json');
const ignored = new Set([
  '.git', '.github', '.wrangler', '.matrix-production-bin', 'node_modules', '_site',
  'data', 'downloads', 'scripts', 'tools', 'templates', 'pagefind',
  'evidence-archive', 'source-snapshots', 'browsertrix-output'
]);
const outputIgnored = new Set([
  '.git', '.github', '.wrangler', '.matrix-production-bin', 'node_modules',
  'data', 'downloads', 'scripts', 'tools', 'templates', 'pagefind',
  'evidence-archive', 'source-snapshots', 'browsertrix-output'
]);

const markerPattern = '<!--\\s*cinematic-pathways:start\\s*-->[\\s\\S]*?<!--\\s*cinematic-pathways:end\\s*-->\\s*';
const sectionPattern = '<section\\b(?=[^>]*\\bclass\\s*=\\s*["\\\'][^"\\\']*\\bmatrix-pathways\\b[^"\\\']*["\\\'])[^>]*>[\\s\\S]*?<\\/section>\\s*';

function markerRegex(flags = 'gi') { return new RegExp(markerPattern, flags); }
function sectionRegex(flags = 'gi') { return new RegExp(sectionPattern, flags); }
function normalizeRoute(value) { return String(value || '').split(path.sep).join('/'); }
function escapeRegExp(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function countExactClassToken(html, className, tagName = '') {
  const expression = /<([a-z][a-z0-9:-]*)\b[^>]*\bclass\s*=\s*(["'])([^"']*)\2[^>]*>/gi;
  const wantedTag = String(tagName || '').toLowerCase();
  let count = 0;
  let match;
  while ((match = expression.exec(String(html || '')))) {
    if (wantedTag && match[1].toLowerCase() !== wantedTag) continue;
    const tokens = match[3].trim().split(/\s+/).filter(Boolean);
    if (tokens.includes(className)) count += 1;
  }
  return count;
}

function routeSlug(relative) {
  const withoutHtml = normalizeRoute(relative).replace(/\.html$/i, '');
  const slug = withoutHtml
    .replace(/^\/+|\/+$/g, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return slug || 'home';
}

function looksLikeHtml(file) {
  if (file.toLowerCase().endsWith('.html')) return true;
  if (path.extname(file)) return false;
  let handle;
  try {
    handle = fs.openSync(file, 'r');
    const buffer = Buffer.alloc(1024);
    const bytes = fs.readSync(handle, buffer, 0, buffer.length, 0);
    return /<!doctype\s+html|<html\b/i.test(buffer.subarray(0, bytes).toString('utf8'));
  } catch {
    return false;
  } finally {
    if (handle !== undefined) fs.closeSync(handle);
  }
}

function walk(directory, ignoredDirectories, output = []) {
  if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) return output;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full, ignoredDirectories, output);
    else if (entry.isFile() && looksLikeHtml(full)) output.push(full);
  }
  return output;
}

function canonicalSection(section, titleId) {
  let next = String(section || '').trim();
  const oldTitleId = /matrix-pathways-title(?:-[a-z0-9][a-z0-9-]*)?/gi;
  next = next.replace(oldTitleId, titleId);

  next = next.replace(/<section\b([^>]*)>/i, (match, attributes) => {
    let attrs = attributes;
    if (/\baria-labelledby\s*=\s*["'][^"']*["']/i.test(attrs)) {
      attrs = attrs.replace(/\baria-labelledby\s*=\s*["'][^"']*["']/i, `aria-labelledby="${titleId}"`);
    } else {
      attrs = `${attrs} aria-labelledby="${titleId}"`;
    }
    return `<section${attrs}>`;
  });

  const idExpression = new RegExp(`\\bid\\s*=\\s*["']${escapeRegExp(titleId)}["']`, 'gi');
  let titleIdSeen = false;
  next = next.replace(idExpression, () => {
    if (titleIdSeen) return '';
    titleIdSeen = true;
    return `id="${titleId}"`;
  });
  if (!titleIdSeen) {
    next = next.replace(/<h2\b([^>]*)>/i, `<h2 id="${titleId}"$1>`);
  }

  const idCount = (next.match(new RegExp(`\\bid=["']${escapeRegExp(titleId)}["']`, 'gi')) || []).length;
  if (idCount !== 1) throw new Error(`Canonical pathway section has ${idCount} copies of ${titleId}.`);
  if (!new RegExp(`\\baria-labelledby=["']${escapeRegExp(titleId)}["']`, 'i').test(next)) {
    throw new Error(`Canonical pathway section does not reference ${titleId}.`);
  }
  return next;
}

function insertBeforeBoundary(html, block) {
  if (/<\/main>/i.test(html)) return html.replace(/<\/main>/i, `${block}\n</main>`);
  if (/<footer\b/i.test(html)) return html.replace(/<footer\b/i, `${block}\n<footer`);
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${block}\n</body>`);
  return `${html}\n${block}\n`;
}

function finalizeHtml(html, relative) {
  if (!/matrix-pathways/i.test(html)) return { html, changed: false, sectionsBefore: 0 };

  const markers = [...html.matchAll(markerRegex('gi'))].map(match => match[0]);
  const sections = [...html.matchAll(sectionRegex('gi'))].map(match => match[0]);
  if (!markers.length && !sections.length) return { html, changed: false, sectionsBefore: 0 };

  const selectedBlock = markers.at(-1) || sections.at(-1);
  const selectedSection = selectedBlock.match(sectionRegex('i'))?.[0] || '';
  if (!selectedSection) throw new Error(`${relative}: could not extract the cinematic pathway section.`);

  const titleId = `matrix-pathways-title-${routeSlug(relative)}`;
  const section = canonicalSection(selectedSection, titleId);
  const canonicalBlock = `<!-- cinematic-pathways:start -->${section}<!-- cinematic-pathways:end -->`;

  let clean = html.replace(markerRegex('gi'), '');
  clean = clean.replace(sectionRegex('gi'), '');
  const next = insertBeforeBoundary(clean, canonicalBlock);

  // A word-boundary regex also matches descendant classes such as
  // matrix-pathways-head and matrix-pathways-boundary. Count the exact class
  // token on <section> elements so a valid full pathway block is not rejected.
  const sectionCount = countExactClassToken(next, 'matrix-pathways', 'section');
  const canonicalIdCount = (next.match(new RegExp(`\\bid=["']${escapeRegExp(titleId)}["']`, 'gi')) || []).length;
  const legacyIdCount = (next.match(/\bid=["']matrix-pathways-title["']/gi) || []).length;
  if (sectionCount !== 1) throw new Error(`${relative}: expected one cinematic pathway section, found ${sectionCount}.`);
  if (canonicalIdCount !== 1) throw new Error(`${relative}: expected one ${titleId}, found ${canonicalIdCount}.`);
  if (legacyIdCount) throw new Error(`${relative}: legacy matrix-pathways-title ID survived finalization.`);

  return {
    html: next,
    changed: next !== html,
    sectionsBefore: sections.length,
    markerBlocksBefore: markers.length,
    titleId,
    duplicatesRemoved: Math.max(0, sections.length - 1)
  };
}

function processRoot(base, label, ignoredDirectories) {
  const files = walk(base, ignoredDirectories);
  const results = [];
  for (const file of files) {
    const before = fs.readFileSync(file, 'utf8');
    if (!/matrix-pathways/i.test(before)) continue;
    const relative = normalizeRoute(path.relative(base, file));
    const result = finalizeHtml(before, relative);
    if (result.changed) fs.writeFileSync(file, result.html);
    results.push({
      file: normalizeRoute(path.relative(root, file)),
      root: label,
      changed: result.changed,
      sectionsBefore: result.sectionsBefore,
      markerBlocksBefore: result.markerBlocksBefore || 0,
      duplicatesRemoved: result.duplicatesRemoved || 0,
      titleId: result.titleId || ''
    });
  }
  return results;
}

const results = [
  ...processRoot(root, 'source', ignored),
  ...(fs.existsSync(path.join(root, '_site'))
    ? processRoot(path.join(root, '_site'), '_site', outputIgnored)
    : [])
];
const changed = results.filter(item => item.changed);
const duplicatesRemoved = results.reduce((sum, item) => sum + item.duplicatesRemoved, 0);
const report = {
  ok: true,
  generatedAt: new Date().toISOString(),
  inspected: results.length,
  changed: changed.length,
  duplicatesRemoved,
  files: results,
  boundary: 'Every document receives at most one cinematic pathway section and one deterministic route-specific heading ID. The content and evidence boundary of the selected canonical section are preserved.'
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Cinematic pathway ID finalization passed: ${results.length} page(s) checked, ${changed.length} normalized, ${duplicatesRemoved} duplicate section(s) removed.`);

module.exports = { finalizeHtml, routeSlug, countExactClassToken };
