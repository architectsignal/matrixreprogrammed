const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const root = path.resolve(__dirname, '..');
const payloadDir = path.join(__dirname, 'power-family-payload');
const payloadBase64 = fs.readdirSync(payloadDir)
  .filter((name) => /^part-\d+\.txt$/.test(name))
  .sort()
  .map((name) => fs.readFileSync(path.join(payloadDir, name), 'utf8').trim())
  .join('');

const outputs = JSON.parse(
  zlib.gunzipSync(Buffer.from(payloadBase64, 'base64')).toString('utf8')
);

for (const [relativePath, content] of Object.entries(outputs)) {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content.endsWith('\n') ? content : `${content}\n`);
}

const contracts = [
  ['behind-the-curtain-capstone.html', [
    'POWER-FAMILY INTELLIGENCE LAYER',
    'id="current-map"',
    'id="directory"',
    'id="claims"',
    'id="questions"',
    'power-family-intelligence-layer.js'
  ]],
  ['power-family-intelligence-layer.js', [
    'Proximity-to-Power Assessment',
    'familyPersonLinks',
    'localStorage',
    'data-open-person',
    'fails closed'
  ]],
  ['data/power-family-intelligence-layer.json', [
    'Documented Fact',
    'Deep Speculation',
    'reviewTriggers',
    'monitoringTargets'
  ]]
];

for (const [relativePath, needles] of contracts) {
  const text = fs.readFileSync(path.join(root, relativePath), 'utf8');
  for (const needle of needles) {
    if (!text.includes(needle)) {
      throw new Error(`${relativePath} missing required contract: ${needle}`);
    }
  }
}

JSON.parse(fs.readFileSync(path.join(root, 'data/power-family-intelligence-layer.json'), 'utf8'));
console.log('Power-Family Intelligence Layer generated and validated.');
