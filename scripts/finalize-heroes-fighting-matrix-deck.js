const fs = require('fs');
const path = require('path');

const root = process.cwd();
const fp = value => path.join(root, value);
const read = value => fs.readFileSync(fp(value), 'utf8');
const write = (value, content) => {
  fs.mkdirSync(path.dirname(fp(value)), { recursive: true });
  fs.writeFileSync(fp(value), content);
};

const suitPaths = [
  'data/heroes-fighting-matrix/keys.json',
  'data/heroes-fighting-matrix/shields.json',
  'data/heroes-fighting-matrix/torches.json',
  'data/heroes-fighting-matrix/swords.json'
];
const suits = suitPaths.map(file => JSON.parse(read(file)));
const cards = suits.flat().sort((a, b) => a.rank - b.rank);

const errors = [];
if (cards.length !== 52) errors.push(`expected 52 cards, found ${cards.length}`);
const ranks = new Set(cards.map(card => card.rank));
const ids = new Set(cards.map(card => card.id));
if (ranks.size !== 52) errors.push('ranks are not unique');
if (ids.size !== 52) errors.push('ids are not unique');
for (let rank = 1; rank <= 52; rank += 1) {
  if (!ranks.has(rank)) errors.push(`missing rank ${rank}`);
}
for (const suit of ['KEYS', 'SHIELDS', 'TORCHES', 'SWORDS']) {
  const count = cards.filter(card => card.suit === suit).length;
  if (count !== 13) errors.push(`${suit} has ${count} cards instead of 13`);
}
for (const card of cards) {
  if (!card.name || !card.id || !card.lane || !card.contribution || !card.whyIncluded || !card.caveat) {
    errors.push(`rank ${card.rank} is missing required editorial fields`);
  }
  if (!Array.isArray(card.sources) || !card.sources.length) errors.push(`rank ${card.rank} has no sources`);
}
if (errors.length) {
  console.error('HEROES DECK VALIDATION FAILED');
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

const generatedAt = new Date().toISOString();
const boundary = 'EDITORIAL RESISTANCE DECK · DOCUMENTED PUBLIC CONTRIBUTION · NOT ENDORSEMENT OF EVERY VIEW OR ACT';
const deck = {
  deckId: 'heroes-fighting-matrix',
  title: 'Heroes Fighting the Matrix',
  subtitle: '52 documented builders, defenders, whistleblowers, investigators and public challengers',
  generatedAt,
  editorialBoundary: boundary,
  rankingRule: 'Deployed infrastructure, verified disclosure, civil-liberties defence, measurable adoption, personal risk and durable public impact outrank fame alone.',
  suits: {
    KEYS: 'Decentralised infrastructure and open protocols',
    SHIELDS: 'Privacy, encryption and civil-liberties defence',
    TORCHES: 'Whistleblowing, investigation and public evidence',
    SWORDS: 'Direct public resistance and anti-establishment influence'
  },
  cards
};
write('data/heroes-fighting-matrix-deck.json', `${JSON.stringify(deck, null, 2)}\n`);

const sourceLedger = {
  deckId: deck.deckId,
  title: `${deck.title} — Source Ledger`,
  generatedAt,
  editorialBoundary: boundary,
  records: cards.map(card => ({
    rank: card.rank,
    id: card.id,
    name: card.name,
    suit: card.suit,
    score: card.score,
    confidence: card.confidence,
    lane: card.lane,
    contribution: card.contribution,
    whyIncluded: card.whyIncluded,
    caveat: card.caveat,
    sources: card.sources
  }))
};
write('downloads/heroes-fighting-matrix-source-ledger.json', `${JSON.stringify(sourceLedger, null, 2)}\n`);

const markdown = [
  '# Heroes Fighting the Matrix — 52-Card Research Ledger',
  '',
  `Generated: ${generatedAt}`,
  '',
  `> ${boundary}`,
  '',
  'The ranking rewards deployed infrastructure, verified disclosure, civil-liberties defence, measurable adoption, personal risk and durable public impact. Inclusion does not certify every claim, opinion, alliance or act associated with a person.',
  '',
  '| Rank | Person | Suit | Score | Documented contribution |',
  '|---:|---|---|---:|---|',
  ...cards.map(card => `| ${card.rank} | ${card.name.replace(/\|/g, '\\|')} | ${card.suit} | ${card.score} | ${card.contribution.replace(/\|/g, '\\|')} |`),
  '',
  '## Source records',
  '',
  ...cards.flatMap(card => [
    `### ${card.rank}. ${card.name}`,
    '',
    `**Lane:** ${card.lane}`,
    '',
    `**Why included:** ${card.whyIncluded}`,
    '',
    `**Boundary:** ${card.caveat}`,
    '',
    ...card.sources.map(source => `- [${source.label}](${source.url}) — ${source.type}`),
    ''
  ])
];
write('downloads/heroes-fighting-matrix-source-ledger.md', `${markdown.join('\n')}\n`);

function injectHubCard() {
  const file = 'deck-expansion-hub.html';
  if (!fs.existsSync(fp(file))) return;
  let html = read(file);
  html = html.replace(/<!-- heroes-deck-hub-card:start -->[\s\S]*?<!-- heroes-deck-hub-card:end -->/g, '');
  const card = `<!-- heroes-deck-hub-card:start --><article class="deck-card" style="border-color:rgba(97,214,180,.45);background:linear-gradient(150deg,rgba(2,24,18,.96),rgba(0,0,0,.95))"><div class="sig" style="color:#61d6b4">⌘</div><h2>Heroes Fighting the Matrix</h2><p>A ranked 52-card counter-deck of decentralised-internet builders, encryption and privacy defenders, whistleblowers, investigative publishers and public challengers. Structural contribution and documented personal risk outrank fame.</p><p><strong>Boundary:</strong> Documented public contribution is not total endorsement. Pending cases, allegations and disputed claims remain explicitly labelled.</p><div class="cta-row small"><a class="btn" href="heroes-fighting-matrix-deck.html">Open Deck</a><a class="btn alt" href="heroes-fighting-matrix-research-ledger.html">Research Ledger</a><a class="btn alt internal-only" href="data/heroes-fighting-matrix-deck.json">Deck Data</a></div></article><!-- heroes-deck-hub-card:end -->`;
  const grid = '<div class="deck-grid">';
  if (html.includes(grid)) html = html.replace(grid, `${grid}${card}`);
  else html = html.replace('</main>', `<section class="wrap section">${card}</section></main>`);
  html = html.replace('Six new 52-card decks using the same source-ledger, dossier, score and downloadable-card structure.', 'Seven specialist 52-card decks using the same source-ledger, dossier, score and downloadable-card structure, including the evidence-bounded resistance deck.');
  write(file, html);
}
injectHubCard();

function ensureLine(file, marker, addition) {
  if (!fs.existsSync(fp(file))) return;
  const content = read(file);
  if (!content.includes(marker)) write(file, `${content.replace(/\s*$/, '')}\n${addition}\n`);
}
ensureLine('robots.txt', 'heroes-fighting-matrix-deck.html', 'Allow: /heroes-fighting-matrix-deck.html\nAllow: /heroes-fighting-matrix-card.html\nAllow: /heroes-fighting-matrix-research-ledger.html\nAllow: /data/heroes-fighting-matrix-deck.json');
ensureLine('llms.txt', 'Heroes Fighting the Matrix', '- Heroes Fighting the Matrix: /heroes-fighting-matrix-deck.html\n- Heroes source ledger: /heroes-fighting-matrix-research-ledger.html\n- Heroes deck data: /data/heroes-fighting-matrix-deck.json');

write('data/heroes-fighting-matrix-build-status.json', `${JSON.stringify({
  ok: true,
  generatedAt,
  cardCount: cards.length,
  suitCounts: Object.fromEntries(['KEYS', 'SHIELDS', 'TORCHES', 'SWORDS'].map(suit => [suit, cards.filter(card => card.suit === suit).length])),
  rankRange: [cards[0].rank, cards[cards.length - 1].rank],
  routes: [
    'heroes-fighting-matrix-deck.html',
    'heroes-fighting-matrix-card.html',
    'heroes-fighting-matrix-research-ledger.html',
    'data/heroes-fighting-matrix-deck.json',
    'downloads/heroes-fighting-matrix-source-ledger.json',
    'downloads/heroes-fighting-matrix-source-ledger.md'
  ],
  boundary
}, null, 2)}\n`);

console.log(`Heroes Fighting the Matrix finalised: ${cards.length} cards, four suits, combined deck and source downloads.`);
