const fs = require('fs');
const path = require('path');

const root = process.cwd();
const placeholder = /\[object Object\]|\bobject Object\b|\[object Array\]/i;
const targets = [
  'data/record-events.json',
  'data/entity-observations.json',
  'data/machine-state/record-event-snapshot.json'
];
function scalarText(value, depth = 0) {
  if (value == null || depth > 6) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    const text = String(value).trim();
    return placeholder.test(text) ? '' : text;
  }
  if (Array.isArray(value)) return value.map(item => scalarText(item, depth + 1)).filter(Boolean).join(', ');
  if (typeof value === 'object') {
    for (const key of ['name','label','title','display_name','displayName','entity','value','text','description','project_name','countryname','agency_name']) {
      const candidate = scalarText(value[key], depth + 1);
      if (candidate) return candidate;
    }
    return Object.values(value).map(item => scalarText(item, depth + 1)).filter(Boolean).slice(0, 4).join(', ');
  }
  return '';
}
function sanitize(value, key = '', depth = 0) {
  if (depth > 10 || value == null) return value;
  if (typeof value === 'string') return placeholder.test(value) ? '' : value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    if (/(?:^|_)(?:entity|institution)?_?names$|^names$/i.test(key)) {
      return [...new Set(value.map(item => scalarText(item)).filter(Boolean))];
    }
    return value.map(item => sanitize(item, key, depth + 1)).filter(item => item !== '' && item !== null && item !== undefined);
  }
  if (typeof value === 'object') {
    const output = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      if (/^(?:name|from|to|with)$/i.test(childKey)) {
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

const touched = [];
const residual = [];
for (const relative of targets) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) continue;
  let data;
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { continue; }
  const before = JSON.stringify(data);
  const safe = sanitize(data);
  if (relative.endsWith('entity-observations.json') && Array.isArray(safe.observations)) {
    safe.observations = safe.observations.filter(item => scalarText(item?.name));
  }
  if (relative.endsWith('record-event-snapshot.json') && Array.isArray(safe.records)) {
    safe.records = safe.records.map(record => ({ ...record, names: [...new Set((record.names || []).map(scalarText).filter(Boolean))] }));
  }
  if (relative.endsWith('record-events.json') && Array.isArray(safe.events)) {
    safe.events = safe.events.map(event => ({
      ...event,
      entity_names: [...new Set((event.entity_names || []).map(scalarText).filter(Boolean))],
      institution_names: [...new Set((event.institution_names || []).map(scalarText).filter(Boolean))]
    }));
  }
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
  boundary: 'Historical machine state must not republish unresolved object values as entity names.'
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'recovery-machine-input-sanitize.json'), `${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) throw new Error(`Machine entity input placeholders remain: ${residual.join(', ')}`);
console.log(`Machine entity inputs sanitized; ${touched.length} file(s) updated.`);
