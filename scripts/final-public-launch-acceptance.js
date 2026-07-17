const fs = require('fs');
const path = require('path');

const root = process.cwd();
const outputOnly = process.argv.includes('--output');
const requestedRoot = process.argv.find(value => value.startsWith('--root='));
const explicitRoot = requestedRoot ? path.resolve(root, requestedRoot.slice('--root='.length)) : null;
const scanRoots = explicitRoot ? [explicitRoot] : outputOnly ? [path.join(root, '_site')] : [root, path.join(root, '_site')];
const ignoredDirs = new Set(['.git', '.github', 'node_modules', '.wrangler', 'scripts', 'tools', 'netlify', 'evidence-archive', 'source-snapshots', 'browsertrix-output']);
const htmlFiles = [];

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.html') || (!path.extname(entry.name) && entry.name !== '_headers')) htmlFiles.push(full);
  }
}

for (const dir of [...new Set(scanRoots.map(value => path.resolve(value)))]) walk(dir);

const forbiddenText = [
  ['visible compatibility marker', /preservedaftervisiblede-duplication/i],
  ['unfinished boundary loader', /Loading boundary\.\.\./i],
  ['escaped dashboard status block', /STATUS FROM CORE\\n/i],
  ['unresolved template token', /\{\{\s*[A-Z0-9_.-]+\s*\}\}/i],
  ['unresolved environment token', /\b(?:YOUR|REPLACE_ME|CHANGE_ME)_[A-Z0-9_]+\b/],
  ['development localhost URL', /https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?/i]
];

const findings = [];
const idsByFile = new Map();

function lineNumber(text, index) {
  return text.slice(0, index).split('\n').length;
}

function add(file, type, detail, index = 0) {
  findings.push({ file: path.relative(root, file).replace(/\\/g, '/'), line: lineNumber(fs.readFileSync(file, 'utf8'), index), type, detail });
}

for (const file of [...new Set(htmlFiles)]) {
  let html;
  try { html = fs.readFileSync(file, 'utf8'); } catch { continue; }
  if (!/<!doctype html|<html\b/i.test(html)) continue;

  for (const [label, pattern] of forbiddenText) {
    const match = pattern.exec(html);
    if (match) add(file, label, match[0].slice(0, 160), match.index);
  }

  for (const match of html.matchAll(/<(a|button)\b([^>]*)>([\s\S]*?)<\/\1>/gi)) {
    const attrs = match[2] || '';
    const visible = String(match[3] || '')
      .replace(/<script\b[\s\S]*?<\/script>/gi, '')
      .replace(/<style\b[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;|&#160;/gi, ' ')
      .trim();
    const hasAccessibleName = /\baria-label\s*=\s*['"][^'"]+['"]/i.test(attrs) || /\btitle\s*=\s*['"][^'"]+['"]/i.test(attrs);
    if (!visible && !hasAccessibleName) add(file, 'unnamed interactive control', match[0].slice(0, 180), match.index || 0);
  }

  for (const match of html.matchAll(/<a\b([^>]*)>/gi)) {
    const attrs = match[1] || '';
    const href = /\bhref\s*=\s*(['"])(.*?)\1/i.exec(attrs);
    if (href && !href[2].trim()) add(file, 'empty link target', match[0].slice(0, 180), match.index || 0);
  }

  const ids = new Map();
  for (const match of html.matchAll(/\bid\s*=\s*(['"])([^'"]+)\1/gi)) {
    const id = match[2];
    if (!ids.has(id)) ids.set(id, []);
    ids.get(id).push(match.index || 0);
  }
  idsByFile.set(file, ids);
  for (const [id, positions] of ids) {
    if (positions.length > 1) add(file, 'duplicate HTML id', `${id} (${positions.length} occurrences)`, positions[1]);
  }
}

findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.type.localeCompare(b.type));

if (!htmlFiles.length) {
  console.error('Final public launch acceptance failed: no HTML surfaces were found.');
  process.exit(1);
}

if (findings.length) {
  console.error(`Final public launch acceptance failed: ${findings.length} blocking finding(s) across ${htmlFiles.length} HTML surface(s).`);
  for (const item of findings.slice(0, 250)) console.error(`- ${item.file}:${item.line} [${item.type}] ${item.detail}`);
  if (findings.length > 250) console.error(`- ... ${findings.length - 250} additional finding(s) omitted`);
  process.exit(1);
}

console.log(`Final public launch acceptance passed: ${htmlFiles.length} HTML surface(s); no leaked markers, unfinished dashboard states, unresolved tokens, empty targets, unnamed controls, localhost URLs, or duplicate IDs.`);
