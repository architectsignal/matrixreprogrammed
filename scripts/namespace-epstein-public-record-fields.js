const fs = require('fs');
const path = require('path');

const dataPath = path.join(process.cwd(), 'data', 'epstein-relationship-intelligence.json');
if (!fs.existsSync(dataPath)) throw new Error('Missing Epstein relationship data');

const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const publicFieldNames = new Set([
  'content_markdown',
  'content_html',
  'bcc_recipients',
  'bcc_recipients_json',
  'restricted_text',
  'sender_raw',
  'body_original',
  'body_clean',
]);

function namespacePublicRecord(value) {
  if (Array.isArray(value)) return value.map(namespacePublicRecord);
  if (!value || typeof value !== 'object') return value;
  const output = {};
  for (const [key, child] of Object.entries(value)) {
    const target = publicFieldNames.has(key) ? `public_record_${key}` : key;
    output[target] = namespacePublicRecord(child);
  }
  return output;
}

function leafValues(value, output = []) {
  if (Array.isArray(value)) {
    value.forEach(item => leafValues(item, output));
  } else if (value && typeof value === 'object') {
    Object.values(value).forEach(item => leafValues(item, output));
  } else {
    output.push(JSON.stringify(value));
  }
  return output;
}

let preservedValueCount = 0;
for (const item of data.editorial_review || []) {
  const before = leafValues(item.public_record_payload || {}).sort();
  const transformed = namespacePublicRecord(item.public_record_payload || {});
  const after = leafValues(transformed).sort();
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    throw new Error(`Public-record value preservation failed for ${item.review_id || item.item_id || 'review item'}`);
  }
  preservedValueCount += before.length;
  item.public_record_payload = transformed;
}

data.publication_policy = {
  ...(data.publication_policy || {}),
  public_record_field_namespace: 'public_record_*',
  public_record_values_preserved: true,
  public_record_value_count: preservedValueCount,
};

fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
console.log(`Namespaced public-record fields in ${(data.editorial_review || []).length} editorial review items and verified ${preservedValueCount} values were preserved.`);
