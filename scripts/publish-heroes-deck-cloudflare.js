const fs = require('fs');
const path = require('path');

const root = process.cwd();
const output = path.join(root, '.cloudflare', 'pages-output');
const files = [
  'index.html',
  'deck-expansion-hub.html',
  'heroes-fighting-matrix-deck.html',
  'heroes-fighting-matrix-card.html',
  'heroes-fighting-matrix-research-ledger.html',
  'search-index.json',
  'data/heroes-fighting-matrix-deck.json',
  'data/heroes-fighting-matrix-build-status.json',
  'data/heroes-fighting-matrix/keys.json',
  'data/heroes-fighting-matrix/shields.json',
  'data/heroes-fighting-matrix/torches.json',
  'data/heroes-fighting-matrix/swords.json',
  'downloads/heroes-fighting-matrix-source-ledger.json',
  'downloads/heroes-fighting-matrix-source-ledger.md'
];

fs.mkdirSync(output, { recursive: true });
const missing = [];
for (const file of files) {
  const source = path.join(root, file);
  if (!fs.existsSync(source)) {
    missing.push(file);
    continue;
  }
  const destination = path.join(output, file);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}
if (missing.length) {
  console.error('HEROES CLOUDFLARE PUBLISH FAILED');
  missing.forEach(file => console.error(`- missing ${file}`));
  process.exit(1);
}
fs.writeFileSync(
  path.join(output, 'data', 'heroes-fighting-matrix-release.json'),
  `${JSON.stringify({
    ok: true,
    publishedAt: new Date().toISOString(),
    cardCount: 52,
    suitCounts: { KEYS: 13, SHIELDS: 13, TORCHES: 13, SWORDS: 13 },
    files
  }, null, 2)}\n`
);
console.log(`Heroes deck copied to Cloudflare output: ${files.length} verified files.`);
