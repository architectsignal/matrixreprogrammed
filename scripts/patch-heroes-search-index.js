const fs = require('fs');
const path = require('path');
const root = process.cwd();
const fp = value => path.join(root, value);
const read = value => fs.readFileSync(fp(value), 'utf8');
const write = (value, content) => fs.writeFileSync(fp(value), content);

const suitFiles = [
  'data/heroes-fighting-matrix/keys.json',
  'data/heroes-fighting-matrix/shields.json',
  'data/heroes-fighting-matrix/torches.json',
  'data/heroes-fighting-matrix/swords.json'
];
const cards = suitFiles.flatMap(file => JSON.parse(read(file))).sort((a, b) => a.rank - b.rank);
const names = cards.map(card => card.name);
const keywords = [
  'heroes fighting the matrix', 'resistance deck', 'decentralised internet', 'decentralized internet',
  'privacy', 'encryption', 'Tor', 'Signal', 'IPFS', 'Matrix protocol', 'whistleblowers',
  'investigative journalism', 'civil liberties', 'censorship resistance', ...names
];

let index = [];
try { index = JSON.parse(read('search-index.json')); } catch { index = []; }
if (!Array.isArray(index)) index = [];
const routes = [
  {
    url: 'heroes-fighting-matrix-deck.html',
    title: 'Heroes Fighting the Matrix — 52-Card Resistance Deck',
    category: 'People and Resistance',
    layer: 'disclosure-black-files',
    description: 'A ranked, source-led deck of decentralised-internet builders, privacy defenders, whistleblowers, investigative publishers and public challengers.',
    keywords,
    priority: 95,
    sourceType: 'html'
  },
  {
    url: 'heroes-fighting-matrix-card.html',
    title: 'Heroes Fighting the Matrix — Individual Dossiers',
    category: 'People and Resistance',
    layer: 'elite-networks',
    description: 'Dynamic evidence-bounded dossier route for all 52 people in the Heroes Fighting the Matrix deck.',
    keywords: ['hero dossier', 'individual card', 'source ledger', ...names],
    priority: 91,
    sourceType: 'html'
  },
  {
    url: 'heroes-fighting-matrix-research-ledger.html',
    title: 'Heroes Fighting the Matrix — Research Ledger',
    category: 'Evidence Ledgers',
    layer: 'disclosure-black-files',
    description: 'The source, confidence and editorial-boundary ledger behind all 52 resistance cards.',
    keywords: ['source ledger', 'research ledger', 'confidence', 'caveat', ...names],
    priority: 94,
    sourceType: 'html'
  },
  {
    url: 'data/heroes-fighting-matrix-deck.json',
    title: 'Heroes Fighting the Matrix Deck JSON',
    category: 'Machine Data',
    layer: 'information-narrative',
    description: 'Machine-readable combined 52-card resistance deck.',
    keywords: ['heroes deck data', '52 cards', 'machine readable', ...names],
    priority: 88,
    sourceType: 'json-feed'
  },
  {
    url: 'downloads/heroes-fighting-matrix-source-ledger.json',
    title: 'Heroes Fighting the Matrix Source Ledger JSON',
    category: 'Downloads',
    layer: 'disclosure-black-files',
    description: 'Downloadable source ledger for the complete resistance deck.',
    keywords: ['download', 'source ledger', 'heroes', ...names],
    priority: 86,
    sourceType: 'json-feed'
  }
];
for (const route of routes) {
  const existing = index.findIndex(item => item && item.url === route.url);
  if (existing >= 0) index[existing] = { ...index[existing], ...route };
  else index.push(route);
}
write('search-index.json', `${JSON.stringify(index, null, 2)}\n`);
console.log(`Heroes deck search index patched: ${routes.length} routes and ${names.length} named people.`);
