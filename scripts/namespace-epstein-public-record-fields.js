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

for (const item of data.editorial_review || []) {
  item.public_record_payload = namespacePublicRecord(item.public_record_payload || {});
}

data.publication_policy = {
  ...(data.publication_policy || {}),
  public_record_field_namespace: 'public_record_*',
  public_record_values_preserved: true,
};

fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
console.log(`Namespaced public-record fields in ${(data.editorial_review || []).length} editorial review items without removing values.`);
