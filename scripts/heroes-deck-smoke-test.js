const fs = require('fs');
const path = require('path');

const root = process.cwd();
const fp = value => path.join(root, value);
const required = [
  'heroes-fighting-matrix-deck.html',
  'heroes-fighting-matrix-card.html',
  'heroes-fighting-matrix-research-ledger.html',
  'data/heroes-fighting-matrix-deck.json',
  'downloads/heroes-fighting-matrix-source-ledger.json',
  'downloads/heroes-fighting-matrix-source-ledger.md',
  'data/heroes-fighting-matrix-build-status.json',
  'deck-expansion-hub.html',
  'index.html',
  'search-index.json'
];
const failures = [];
for (const file of required) if (!fs.existsSync(fp(file))) failures.push(`missing ${file}`);

if (!failures.length) {
  const deck = JSON.parse(fs.readFileSync(fp('data/heroes-fighting-matrix-deck.json'), 'utf8'));
  const cards = Array.isArray(deck.cards) ? deck.cards : [];
  if (cards.length !== 52) failures.push(`combined deck has ${cards.length} cards`);
  const ranks = cards.map(card => card.rank).sort((a, b) => a - b);
  if (ranks.join(',') !== Array.from({ length: 52 }, (_, index) => index + 1).join(',')) failures.push('rank sequence is not 1–52');
  for (const suit of ['KEYS', 'SHIELDS', 'TORCHES', 'SWORDS']) {
    const count = cards.filter(card => card.suit === suit).length;
    if (count !== 13) failures.push(`${suit} count is ${count}`);
  }
  const ids = new Set(cards.map(card => card.id));
  if (ids.size !== 52) failures.push('card ids are not unique');
  if (!cards.some(card => card.id === 'andrew-tate')) failures.push('Andrew Tate card missing');
  if (!cards.some(card => card.id === 'tristan-tate')) failures.push('Tristan Tate card missing');
  if (!cards.some(card => card.id === 'roger-dingledine')) failures.push('Roger Dingledine card missing');

  const deckHtml = fs.readFileSync(fp('heroes-fighting-matrix-deck.html'), 'utf8');
  for (const marker of ['data/heroes-fighting-matrix/keys.json', 'heroes-fighting-matrix-card.html', 'EDITORIAL RESISTANCE DECK']) {
    if (!deckHtml.includes(marker)) failures.push(`deck page missing marker ${marker}`);
  }
  const cardHtml = fs.readFileSync(fp('heroes-fighting-matrix-card.html'), 'utf8');
  for (const marker of ['URLSearchParams', 'sources', 'caveat']) {
    if (!cardHtml.includes(marker)) failures.push(`card route missing marker ${marker}`);
  }
  const hub = fs.readFileSync(fp('deck-expansion-hub.html'), 'utf8');
  if (!hub.includes('heroes-fighting-matrix-deck.html')) failures.push('Deck Hub link missing');
  const home = fs.readFileSync(fp('index.html'), 'utf8');
  if (!home.includes('heroes-fighting-matrix-deck.html')) failures.push('homepage link missing');
  const index = JSON.parse(fs.readFileSync(fp('search-index.json'), 'utf8'));
  if (!Array.isArray(index) || !index.some(item => item && item.url === 'heroes-fighting-matrix-deck.html')) failures.push('search route missing');

  const cf = fp('.cloudflare/pages-output');
  if (fs.existsSync(cf)) {
    for (const file of ['heroes-fighting-matrix-deck.html', 'heroes-fighting-matrix-card.html', 'heroes-fighting-matrix-research-ledger.html', 'data/heroes-fighting-matrix-deck.json']) {
      if (!fs.existsSync(path.join(cf, file))) failures.push(`Cloudflare output missing ${file}`);
    }
  }
}

if (failures.length) {
  console.error('HEROES DECK SMOKE TEST FAILED');
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('Heroes deck smoke test passed: 52 cards, four suits, navigation, search, downloads and Cloudflare routes verified.');
