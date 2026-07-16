const fs = require('fs');
const path = require('path');

const root = process.cwd();
const reportPath = path.join(root, 'downloads', 'machine-entity-output-sanitizer.json');
const changed = [];
const removedFiles = [];
const stats = { invalidStringsRemoved: 0, invalidObjectsRemoved: 0, arraysDeduplicated: 0, htmlCardsRemoved: 0, searchEntriesRemoved: 0 };

function at(relative) { return path.join(root, relative); }
function readJson(relative) {
  const file = at(relative);
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { throw new Error(`${relative} invalid JSON: ${error.message}`); }
}
function writeJson(relative, value) {
  fs.mkdirSync(path.dirname(at(relative)), { recursive: true });
  fs.writeFileSync(at(relative), `${JSON.stringify(value, null, 2)}\n`);
  changed.push(relative);
}
function isInvalidName(value) {
  if (value == null) return true;
  const text = String(value).trim();
  return !text || /^\[object Object\]$/i.test(text) || /^(?:undefined|null|nan)$/i.test(text);
}
function objectName(value) {
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  if (!value || typeof value !== 'object') return '';
  for (const key of ['name', 'title', 'label', 'entity_name', 'entityName', 'agency', 'institution', 'borrower', 'country', 'organization', 'organisation']) {
    const candidate = value[key];
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return '';
}
function cleanNameArray(values) {
  if (!Array.isArray(values)) return [];
  const clean = [];
  const seen = new Set();
  for (const value of values) {
    const name = objectName(value);
    if (isInvalidName(name)) {
      stats.invalidStringsRemoved++;
      continue;
    }
    const key = name.toLowerCase();
    if (seen.has(key)) {
      stats.arraysDeduplicated++;
      continue;
    }
    seen.add(key);
    clean.push(name);
  }
  return clean;
}
function cleanObject(value) {
  if (Array.isArray(value)) return value.map(cleanObject).filter(item => item !== undefined);
  if (!value || typeof value !== 'object') return value;
  for (const [key, current] of Object.entries(value)) {
    if (['entity_names', 'institution_names', 'entities', 'institutions', 'people', 'organizations', 'organisations'].includes(key) && Array.isArray(current)) {
      value[key] = cleanNameArray(current);
      continue;
    }
    if (key === 'connections' && Array.isArray(current)) {
      value[key] = current.filter(item => {
        const ok = item && !isInvalidName(item.with || item.name || item.title);
        if (!ok) stats.invalidObjectsRemoved++;
        return ok;
      }).map(cleanObject);
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
    if (!item || typeof item !== 'object') {
      stats.invalidObjectsRemoved++;
      return false;
    }
    const name = item.name || item.title || item.label || '';
    const invalid = item.id === 'object-object' || isInvalidName(name);
    if (invalid) stats.invalidObjectsRemoved++;
    return !invalid;
  }).map(cleanObject);
  if (container[key].length !== before) container.count = container[key].length;
}
function sanitizeJson(relative, namedKeys = []) {
  const data = readJson(relative);
  if (!data) return;
  const before = JSON.stringify(data);
  cleanObject(data);
  for (const key of namedKeys) cleanNamedCollection(data, key);
  const after = JSON.stringify(data);
  if (after !== before) writeJson(relative, data);
}
function removeGeneratedFile(relative) {
  const file = at(relative);
  if (!fs.existsSync(file)) return;
  fs.rmSync(file, { force: true });
  removedFiles.push(relative);
}
function patchHtml(relative) {
  const file = at(relative);
  if (!fs.existsSync(file)) return;
  const before = fs.readFileSync(file, 'utf8');
  let html = before;
  const patterns = [
    /<article\b[^>]*>[\s\S]*?<h3>\s*\[object Object\]\s*<\/h3>[\s\S]*?<\/article>/gi,
    /<article\b[^>]*>[\s\S]*?href=["'][^"']*object-object\.html[^"']*["'][\s\S]*?<\/article>/gi,
    /<article\b[^>]*>[\s\S]*?<h3>\s*<\/h3>[\s\S]*?<\/article>/gi
  ];
  for (const pattern of patterns) {
    html = html.replace(pattern, match => {
      stats.htmlCardsRemoved++;
      return '';
    });
  }
  html = html.replace(/\[object Object\]/g, 'Unresolved entity');
  if (html !== before) {
    fs.writeFileSync(file, html);
    changed.push(relative);
  }
}
function sanitizeSearchIndex() {
  const relative = 'search-index.json';
  const data = readJson(relative);
  if (!Array.isArray(data)) return;
  const before = data.length;
  const filtered = data.filter(item => item && !isInvalidName(item.title) && !/object-object/i.test(`${item.title || ''} ${item.url || ''}`));
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

removeGeneratedFile('entity-briefs/object-object.html');
removeGeneratedFile('entity-timelines/object-object.html');
for (const page of ['machine-digest.html', 'entity-daily-briefs.html', 'entity-exposure-index.html', 'machine-intelligence.html']) patchHtml(page);

const remaining = [];
for (const relative of ['data/record-events.json', 'data/entity-observations.json', 'data/entity-daily-briefs.json', 'machine-digest.html', 'entity-daily-briefs.html', 'search-index.json']) {
  const file = at(relative);
  if (!fs.existsSync(file)) continue;
  const text = fs.readFileSync(file, 'utf8');
  if (/\[object Object\]/i.test(text) || /"name"\s*:\s*"\s*"/.test(text)) remaining.push(relative);
}

const report = {
  ok: remaining.length === 0,
  generatedAt: new Date().toISOString(),
  changed: [...new Set(changed)],
  removedFiles,
  stats,
  remaining,
  boundary: 'Malformed object coercions and blank generated entities are excluded from public outputs. Valid court identifiers, company tickers and institutional names are preserved.'
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (remaining.length) {
  remaining.forEach(item => console.error(`MACHINE ENTITY SANITIZER FAILURE: ${item} still contains malformed entity output`));
  process.exit(1);
}
console.log(`Machine entity outputs sanitized: ${stats.invalidStringsRemoved} invalid names, ${stats.invalidObjectsRemoved} invalid objects, ${stats.htmlCardsRemoved} malformed cards and ${stats.searchEntriesRemoved} search entries removed.`);
