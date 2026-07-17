const fs = require('fs');
const path = require('path');

const root = process.cwd();
const outputOnly = process.argv.includes('--output');
const outputRoot = path.join(root, '_site');
const base = outputOnly && fs.existsSync(outputRoot) ? outputRoot : root;
const reportPath = path.join(root, 'downloads', outputOnly ? 'machine-entity-output-sanitizer-output.json' : 'machine-entity-output-sanitizer.json');
const changed = [];
const removedFiles = [];
const stats = { invalidStringsRemoved: 0, invalidObjectsRemoved: 0, arraysDeduplicated: 0, htmlCardsRemoved: 0, searchEntriesRemoved: 0 };

function at(relative) { return path.join(base, relative); }
function display(relative) { return path.relative(root, at(relative)).replace(/\\/g, '/'); }
function readJson(relative) {
  const file = at(relative);
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { throw new Error(`${display(relative)} invalid JSON: ${error.message}`); }
}
function writeJson(relative, value) {
  fs.mkdirSync(path.dirname(at(relative)), { recursive: true });
  fs.writeFileSync(at(relative), `${JSON.stringify(value, null, 2)}\n`);
  changed.push(display(relative));
}
function isInvalidName(value) {
  if (value == null) return true;
  const text = String(value).trim();
  return !text || /^\[object Object\]$/i.test(text) || /^(?:undefined|null|nan)$/i.test(text) || /^object-object$/i.test(text);
}
function hasInvalidObjectSlug(value) {
  return /(?:^|[\/-])object-object(?:\.html)?(?:$|[?#])/i.test(String(value || '').trim());
}
function objectName(value) {
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  if (!value || typeof value !== 'object') return '';
  for (const key of ['name', 'title', 'label', 'entity_name', 'entityName', 'agency', 'institution', 'borrower', 'borrowername', 'country', 'countryname', 'organization', 'organisation', 'impagency']) {
    const candidate = value[key];
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
    if (Array.isArray(candidate)) {
      const first = candidate.find(item => typeof item === 'string' && item.trim());
      if (first) return first.trim();
    }
  }
  return '';
}
function cleanNameArray(values) {
  if (!Array.isArray(values)) return [];
  const clean = [];
  const seen = new Set();
  for (const value of values) {
    const name = objectName(value);
    if (isInvalidName(name)) { stats.invalidStringsRemoved++; continue; }
    const key = name.toLowerCase();
    if (seen.has(key)) { stats.arraysDeduplicated++; continue; }
    seen.add(key);
    clean.push(name);
  }
  return clean;
}
function relationshipReferences(item) {
  if (!item || typeof item !== 'object') return [];
  if (Object.prototype.hasOwnProperty.call(item, 'with')) return [item.with];
  if (Object.prototype.hasOwnProperty.call(item, 'from') || Object.prototype.hasOwnProperty.call(item, 'to')) return [item.from, item.to];
  return [item.name || item.title || item.label];
}
function validRelationship(item) {
  const refs = relationshipReferences(item);
  const valid = Boolean(item) && refs.length > 0 && refs.every(ref => !isInvalidName(ref) && !hasInvalidObjectSlug(ref));
  if (!valid) stats.invalidObjectsRemoved++;
  return valid;
}
function cleanObject(value) {
  if (Array.isArray(value)) {
    return value.map(cleanObject).filter(item => {
      if (typeof item === 'string' && (isInvalidName(item) || hasInvalidObjectSlug(item))) { stats.invalidStringsRemoved++; return false; }
      return item !== undefined;
    });
  }
  if (!value || typeof value !== 'object') return value;
  for (const [key, current] of Object.entries(value)) {
    if (['entity_names', 'institution_names'].includes(key) && Array.isArray(current)) {
      value[key] = cleanNameArray(current);
      continue;
    }
    if (['connections', 'relationships'].includes(key) && Array.isArray(current)) {
      value[key] = current.filter(validRelationship).map(cleanObject);
      continue;
    }
    value[key] = cleanObject(current);
  }
  return value;
}
function cleanNamedCollection(container, key) {
  if (!container || !Array.isArray(container[key])) return;
  const before = container[key].length;
  container[key] = container[key].filter(item => {
    if (!item || typeof item !== 'object') { stats.invalidObjectsRemoved++; return false; }
    const name = item.name || item.title || item.label || '';
    const invalid = item.id === 'object-object' || isInvalidName(name) || hasInvalidObjectSlug(item.id) || hasInvalidObjectSlug(item.url);
    if (invalid) stats.invalidObjectsRemoved++;
    return !invalid;
  }).map(cleanObject);
  if (container[key].length !== before && Object.prototype.hasOwnProperty.call(container, 'count')) container.count = container[key].length;
}
function sanitizeJson(relative, namedKeys = []) {
  const data = readJson(relative);
  if (!data) return;
  const before = JSON.stringify(data);
  cleanObject(data);
  for (const key of namedKeys) cleanNamedCollection(data, key);
  if (JSON.stringify(data) !== before) writeJson(relative, data);
}
function removeGeneratedFile(relative) {
  const file = at(relative);
  if (!fs.existsSync(file)) return;
  fs.rmSync(file, { force: true, recursive: true });
  removedFiles.push(display(relative));
}
function patchHtml(relative) {
  const file = at(relative);
  if (!fs.existsSync(file)) return;
  const before = fs.readFileSync(file, 'utf8');
  let html = before;
  const patterns = [
    /<article\b[^>]*>[\s\S]*?<h3>\s*\[object Object\]\s*<\/h3>[\s\S]*?<\/article>/gi,
    /<article\b[^>]*>[\s\S]*?href=["'][^"']*object-object(?:\.html)?[^"']*["'][\s\S]*?<\/article>/gi,
    /<article\b[^>]*>[\s\S]*?<h3>\s*<\/h3>[\s\S]*?<\/article>/gi
  ];
  for (const pattern of patterns) html = html.replace(pattern, () => { stats.htmlCardsRemoved++; return ''; });
  if (html !== before) {
    fs.writeFileSync(file, html);
    changed.push(display(relative));
  }
}
function sanitizeSearchIndex() {
  const relative = 'search-index.json';
  const data = readJson(relative);
  if (!Array.isArray(data)) return;
  const before = data.length;
  const filtered = data.filter(item => item && !isInvalidName(item.title) && !hasInvalidObjectSlug(item.url) && !/\[object Object\]/i.test(String(item.title || '')));
  stats.searchEntriesRemoved += before - filtered.length;
  if (filtered.length !== before) writeJson(relative, filtered);
}

sanitizeJson('data/record-events.json');
sanitizeJson('data/entity-observations.json', ['observations']);
sanitizeJson('data/entity-daily-briefs.json', ['briefs']);
sanitizeJson('data/entity-timelines.json', ['timelines']);
sanitizeJson('data/entity-exposure-index.json', ['entities', 'profiles']);
sanitizeJson('data/main-player-profiles.json', ['profiles', 'players']);
sanitizeJson('data/entity-relationship-scores.json', ['entities', 'relationships']);
sanitizeSearchIndex();
const malformedRoutes = [
  'entity-briefs/object-object.html', 'entity-briefs/object-object',
  'entity-timelines/object-object.html', 'entity-timelines/object-object',
  'entity-exposure/object-object.html', 'entity-exposure/object-object',
  'reports/entity-object-object.html', 'reports/entity-object-object'
];
malformedRoutes.forEach(removeGeneratedFile);
for (const page of ['machine-digest.html', 'entity-daily-briefs.html', 'entity-exposure-index.html', 'machine-intelligence.html', 'daily-missing-records.html', 'reports.html']) patchHtml(page);

const remaining = [];
for (const relative of [
  'data/record-events.json',
  'data/entity-observations.json',
  'data/entity-daily-briefs.json',
  'data/entity-exposure-index.json',
  'data/entity-relationship-scores.json',
  'machine-digest.html',
  'entity-daily-briefs.html',
  'entity-exposure-index.html',
  'daily-missing-records.html',
  'reports.html',
  'search-index.json'
]) {
  const file = at(relative);
  if (!fs.existsSync(file)) continue;
  const text = fs.readFileSync(file, 'utf8');
  if (/\[object Object\]/i.test(text) || /(?:^|[\/-])object-object(?:\.html)?(?:$|[?#])/im.test(text) || /"name"\s*:\s*"\s*"/.test(text)) remaining.push(display(relative));
}
for (const relative of malformedRoutes) if (fs.existsSync(at(relative))) remaining.push(display(relative));
const report = {
  ok: remaining.length === 0,
  generatedAt: new Date().toISOString(),
  mode: outputOnly ? 'cloudflare-output' : 'source-tree',
  base: path.relative(root, base) || '.',
  changed: [...new Set(changed)], removedFiles, stats, remaining,
  boundary: 'Malformed object coercions, invalid relationship references, blank generated entities and object-object routes are excluded from public outputs. Valid court identifiers, company tickers and institutional names are preserved.'
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (remaining.length) {
  remaining.forEach(item => console.error(`MACHINE ENTITY SANITIZER FAILURE: ${item} still contains malformed entity output`));
  process.exit(1);
}
console.log(`Machine entity outputs sanitized (${report.mode}): ${stats.invalidStringsRemoved} invalid names, ${stats.invalidObjectsRemoved} invalid objects, ${stats.htmlCardsRemoved} malformed cards and ${stats.searchEntriesRemoved} search entries removed; ${removedFiles.length} malformed routes deleted.`);
