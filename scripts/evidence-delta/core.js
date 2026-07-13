const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function asArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function stableValue(value) {
  if (Array.isArray(value)) {
    return value
      .map(stableValue)
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map(key => [key, stableValue(value[key])])
    );
  }
  return value;
}

function stableJson(value) {
  return JSON.stringify(stableValue(value), null, 2) + '\n';
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function fingerprint(value) {
  return sha256(stableJson(value));
}

function getPath(source, dotted) {
  let value = source;
  for (const segment of String(dotted).split('.')) {
    if (value === undefined || value === null || typeof value !== 'object') return undefined;
    value = value[segment];
  }
  return value;
}

function ensureDir(target) {
  fs.mkdirSync(target, { recursive: true });
}

function writeJson(outputDir, relativePath, value) {
  const target = path.join(outputDir, relativePath);
  ensureDir(path.dirname(target));
  fs.writeFileSync(target, stableJson(value));
}

function writeText(outputDir, relativePath, value) {
  const target = path.join(outputDir, relativePath);
  ensureDir(path.dirname(target));
  fs.writeFileSync(target, value);
}

function safeSegment(value) {
  return String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180) || 'record';
}

function unique(values) {
  return [...new Set(values.filter(value => value !== undefined && value !== null && value !== ''))];
}

function normalizedText(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function keyedMap(items, keyGetter) {
  const map = new Map();
  for (const item of asArray(items)) {
    const key = keyGetter(item);
    if (key) map.set(String(key), item);
  }
  return map;
}

function sourceKey(source) {
  return source?.id || source?.url || `${source?.publisher || ''}:${source?.title || ''}`;
}

function factKey(fact) {
  return normalizedText(fact?.statement || fact?.text || '');
}

function differenceByKey(previousItems, currentItems, keyGetter) {
  const previous = keyedMap(previousItems, keyGetter);
  const current = keyedMap(currentItems, keyGetter);
  const added = [];
  const removed = [];
  const modified = [];
  for (const [key, item] of current) {
    if (!previous.has(key)) added.push(item);
    else if (fingerprint(previous.get(key)) !== fingerprint(item)) modified.push({ key, previous: previous.get(key), current: item });
  }
  for (const [key, item] of previous) if (!current.has(key)) removed.push(item);
  return { added, removed, modified };
}

function stringSetDifference(previousItems, currentItems) {
  const previous = new Map(asArray(previousItems).map(item => [normalizedText(item), item]));
  const current = new Map(asArray(currentItems).map(item => [normalizedText(item), item]));
  return {
    added: [...current.entries()].filter(([key]) => key && !previous.has(key)).map(([, value]) => value),
    removed: [...previous.entries()].filter(([key]) => key && !current.has(key)).map(([, value]) => value)
  };
}

function sectionFingerprints(record, sections) {
  return Object.fromEntries(sections.map(section => [section, fingerprint(getPath(record, section))]));
}

function changedSections(previousRecord, currentRecord, sections) {
  const previous = sectionFingerprints(previousRecord, sections);
  const current = sectionFingerprints(currentRecord, sections);
  return {
    previous,
    current,
    changed: sections.filter(section => previous[section] !== current[section])
  };
}

function maxSeverity(deltaTypes, policy) {
  if (!deltaTypes.length) return 'none';
  const order = policy.severityOrder;
  return deltaTypes
    .map(type => policy.deltaTypes[type]?.severity || 'medium')
    .sort((left, right) => order.indexOf(right) - order.indexOf(left))[0] || 'medium';
}

function countBy(items, getter) {
  const counts = {};
  for (const item of items) {
    const key = String(getter(item) ?? 'unknown');
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])));
}

module.exports = {
  readJson,
  clone,
  asArray,
  stableValue,
  stableJson,
  sha256,
  fingerprint,
  getPath,
  ensureDir,
  writeJson,
  writeText,
  safeSegment,
  unique,
  normalizedText,
  sourceKey,
  factKey,
  differenceByKey,
  stringSetDifference,
  sectionFingerprints,
  changedSections,
  maxSeverity,
  countBy
};
