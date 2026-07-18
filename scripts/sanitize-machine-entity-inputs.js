const fs = require('fs');
const path = require('path');

const root = process.cwd();
const placeholder = /\[object Object\]|\bobject Object\b|\[object Array\]|^\s*(?:undefined|null|NaN)\s*$/i;
const targets = [
  'data/record-events.json',
  'data/entity-observations.json',
  'data/machine-state/record-event-snapshot.json',
  'data/daily-brain-brief.json',
  'data/entity-daily-briefs.json',
  'data/entity-exposure-index.json',
  'data/private-contractor-intelligence.json',
  'data/change-detection.json',
  'data/entity-relationship-scores.json',
  'data/latest-public-drops.json',
  'data/global-risk-clocks.json',
  'data/deep-intel-feed-matrix.json',
  'data/card-intelligence-feed.json',
  'data/card-source-ledger.json'
];

function scalarText(value, depth = 0) {
  if (value == null || depth > 6) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    const text = String(value).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return placeholder.test(text) ? '' : text;
  }
  if (Array.isArray(value)) return value.map(item => scalarText(item, depth + 1)).filter(Boolean).join(', ');
  if (typeof value === 'object') {
    for (const key of ['name','label','title','display_name','displayName','entity','entity_name','institution','agency','agency_name','value','text','description','summary','project_name','countryname']) {
      const candidate = scalarText(value[key], depth + 1);
      if (candidate) return candidate;
    }
    return Object.values(value).map(item => scalarText(item, depth + 1)).filter(Boolean).slice(0, 4).join(', ');
  }
  return '';
}
function cleanList(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(scalarText).filter(Boolean))];
}
function sanitize(value, key = '', depth = 0) {
  if (depth > 12 || value == null) return value;
  if (typeof value === 'string') return placeholder.test(value) ? '' : value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    if (/(?:^|_)(?:entity|institution)?_?names$|^names$|^control_layers$|^lanes$|^roles$|^companies$|^watch_next$|^missing_records$/i.test(key)) return cleanList(value);
    return value.map(item => sanitize(item, key, depth + 1)).filter(item => item !== '' && item !== null && item !== undefined);
  }
  if (typeof value === 'object') {
    const output = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      if (/^(?:name|from|to|with|title|label|summary|entity|institution)$/i.test(childKey)) {
        const label = scalarText(childValue);
        if (label) output[childKey] = label;
        continue;
      }
      const safe = sanitize(childValue, childKey, depth + 1);
      if (safe !== '' && safe !== undefined) output[childKey] = safe;
    }
    return output;
  }
  return value;
}
function validNamed(item) {
  if (!item || typeof item !== 'object') return false;
  return Boolean(scalarText(item.name || item.title || item.label || item.entity));
}
function normalizeKnown(relative, data) {
  if (relative.endsWith('record-events.json') && Array.isArray(data.events)) {
    data.events = data.events.map(event => ({ ...event, entity_names:cleanList(event.entity_names), institution_names:cleanList(event.institution_names), control_layers:cleanList(event.control_layers) }));
  }
  if (relative.endsWith('record-event-snapshot.json') && Array.isArray(data.records)) data.records = data.records.map(record => ({ ...record, names:cleanList(record.names) }));
  if (relative.endsWith('entity-observations.json') && Array.isArray(data.observations)) data.observations = data.observations.filter(validNamed);
  if (relative.endsWith('entity-daily-briefs.json') && Array.isArray(data.briefs)) {
    data.briefs = data.briefs.filter(validNamed).map(brief => ({ ...brief, name:scalarText(brief.name), connections:(brief.connections || []).filter(link => scalarText(link?.with || link?.from || link?.to)) }));
  }
  if (relative.endsWith('entity-exposure-index.json')) {
    for (const key of ['profiles','entities']) if (Array.isArray(data[key])) data[key] = data[key].filter(validNamed);
  }
  if (relative.endsWith('private-contractor-intelligence.json') && Array.isArray(data.profiles)) {
    data.profiles = data.profiles.filter(validNamed).map(profile => ({ ...profile, main_players:(profile.main_players || []).filter(validNamed) }));
  }
  if (relative.endsWith('entity-relationship-scores.json') && Array.isArray(data.relationships)) {
    data.relationships = data.relationships.filter(link => scalarText(link?.from) && scalarText(link?.to)).map(link => ({ ...link, from:scalarText(link.from), to:scalarText(link.to), control_layers:cleanList(link.control_layers), lanes:cleanList(link.lanes) }));
  }
  if (relative.endsWith('latest-public-drops.json') && Array.isArray(data.drops)) data.drops = data.drops.filter(validNamed);
  if (relative.endsWith('global-risk-clocks.json') && Array.isArray(data.clocks)) data.clocks = data.clocks.filter(validNamed);
  if (relative.endsWith('card-source-ledger.json') && Array.isArray(data.entries)) data.entries = data.entries.filter(item => item && typeof item === 'object');
  return data;
}

const touched = [];
const residual = [];
for (const relative of targets) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) continue;
  let data;
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { continue; }
  const before = JSON.stringify(data);
  const safe = normalizeKnown(relative, sanitize(data));
  const after = JSON.stringify(safe);
  if (after !== before) {
    fs.writeFileSync(file, `${JSON.stringify(safe, null, 2)}\n`);
    touched.push(relative);
  }
  if (placeholder.test(fs.readFileSync(file, 'utf8'))) residual.push(relative);
}

const report = {
  ok: residual.length === 0,
  generatedAt: new Date().toISOString(),
  touched,
  residual,
  boundary: 'Machine inputs must resolve object-valued labels before any public brief, report, timeline, relationship or conclusion page is generated.'
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'recovery-machine-input-sanitize.json'), `${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) throw new Error(`Machine input placeholders remain: ${residual.join(', ')}`);
console.log(`Machine inputs sanitized; ${touched.length} file(s) updated.`);
