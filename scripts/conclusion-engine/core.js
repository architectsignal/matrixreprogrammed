const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const stopWords = new Set('a an and are as at be been by can could did do does for from had has have he her hers him his how i in into is it its may might more most must no not of on only or our should so than that the their them then there these they this those through to under until up was were what when where which who why will with would you your'.split(/\s+/));

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function stableJson(value) { return JSON.stringify(value, null, 2) + '\n'; }
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function ensureDir(target) { fs.mkdirSync(target, { recursive: true }); }
function writeJson(outputDir, name, value) { ensureDir(outputDir); fs.writeFileSync(path.join(outputDir, name), stableJson(value)); }
function writeText(outputDir, name, value) { ensureDir(outputDir); fs.writeFileSync(path.join(outputDir, name), value); }
function asArray(value) { if (value === undefined || value === null) return []; return Array.isArray(value) ? value : [value]; }
function text(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join(' ');
  return Object.values(value).map(text).filter(Boolean).join(' ');
}
function normalized(value) { return text(value).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' '); }
function tokens(value, dropStop = false) { const list = normalized(value).split(' ').filter(Boolean); return dropStop ? list.filter(token => !stopWords.has(token) && token.length > 2) : list; }
function unique(values) { return [...new Set(values.filter(Boolean))]; }
function jaccard(a, b) { const aa = new Set(tokens(a, true)); const bb = new Set(tokens(b, true)); const union = new Set([...aa, ...bb]); if (!union.size) return 0; let overlap = 0; for (const item of aa) if (bb.has(item)) overlap += 1; return overlap / union.size; }
function getPath(source, dotted) { let value = source; for (const segment of String(dotted).split('.')) { if (value === null || value === undefined || typeof value !== 'object') return undefined; value = value[segment]; } return value; }
function countBy(items, getter) { const out = {}; for (const item of items) { const key = String(getter(item) ?? 'unknown'); out[key] = (out[key] || 0) + 1; } return Object.fromEntries(Object.entries(out).sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0]))); }
function dateAgeDays(iso, now) { const parsed = Date.parse(iso || ''); if (!Number.isFinite(parsed)) return null; return Math.max(0, Math.floor((now - parsed) / 86400000)); }
function sourceAuthority(record) { const authorities = asArray(record.sources).map(source => source.authority || 'unknown'); const ranked = ['primary', 'official', 'secondary', 'lead_only', 'unknown']; return ranked.find(item => authorities.includes(item)) || authorities[0] || 'unknown'; }
function sourceIds(record) { return unique(asArray(record.sources).map(source => source.id)); }
function recordSpecificTerms(record) { return unique([...tokens(record.title, true), ...asArray(record.entities).flatMap(entity => tokens(entity.name, true)), ...asArray(record.sources).flatMap(source => [...tokens(source.title, true), ...tokens(source.publisher, true)])]).filter(token => token.length > 3); }
function containsAny(haystack, terms) { const n = normalized(haystack); return terms.filter(term => n.includes(normalized(term))); }
function recordDescriptor(record) {
  const source = asArray(record.sources)[0] || {};
  let reference = source.id || record.id;
  if (typeof source.url === 'string') {
    try {
      const url = new URL(source.url);
      const last = url.pathname.split('/').filter(Boolean).pop();
      if (last) reference = decodeURIComponent(last);
    } catch {}
  }
  const cleanReference = String(reference).replace(/\s+/g, ' ').slice(0, 100);
  return cleanReference && normalized(cleanReference) !== normalized(record.title) ? `${record.title} — ${cleanReference}` : record.title;
}
function recordSourceLabel(record) { const source = asArray(record.sources)[0] || {}; return source.publisher || source.title || source.id || 'the cited source'; }
function recordStatusLabel(record) { const values = asArray(record.recordStatus); return values.length ? values.join(', ').replaceAll('_', ' ') : 'the stated record status'; }
function firstFact(record) { return asArray(record.establishedFacts).map(fact => fact.statement || fact.text || '').find(Boolean) || ''; }
function existingVectorMap(record) { return new Map(asArray(record.missionAssessment?.convergenceVectors).map(vector => [vector.vector, vector])); }

module.exports = { readJson, stableJson, sha256, ensureDir, writeJson, writeText, asArray, text, normalized, tokens, unique, jaccard, getPath, countBy, dateAgeDays, sourceAuthority, sourceIds, recordSpecificTerms, containsAny, recordDescriptor, recordSourceLabel, recordStatusLabel, firstFact, existingVectorMap };
