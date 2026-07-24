const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dataDir = path.join(root, 'data', 'heroes-fighting-matrix');
const deckDataPath = path.join(root, 'data', 'heroes-fighting-matrix-deck.json');
const deckPagePath = path.join(root, 'heroes-fighting-matrix-deck.html');
const ledgerPagePath = path.join(root, 'heroes-fighting-matrix-research-ledger.html');
const dossierDir = path.join(root, 'heroes-fighting-matrix');
const assetDir = path.join(root, 'assets', 'heroes-fighting-matrix', 'cards');
const downloadDir = path.join(root, 'downloads');

const SUITS = {
  KEYS: {
    icon: '⌘',
    name: 'Keys',
    label: 'Decentralised infrastructure',
    color: '#61d6b4',
    pale: '#c8fff0',
    gradient: ['#09251e', '#020606'],
  },
  SHIELDS: {
    icon: '⬡',
    name: 'Shields',
    label: 'Privacy and civil liberties',
    color: '#63aee8',
    pale: '#d6edff',
    gradient: ['#0a2034', '#020507'],
  },
  TORCHES: {
    icon: '✦',
    name: 'Torches',
    label: 'Whistleblowers and exposure',
    color: '#e5a84f',
    pale: '#ffe4b3',
    gradient: ['#321b08', '#070402'],
  },
  SWORDS: {
    icon: '⚔',
    name: 'Swords',
    label: 'Direct public resistance',
    color: '#d85d62',
    pale: '#ffd5d7',
    gradient: ['#310b0d', '#070202'],
  },
};

const DECK_BOUNDARY = 'EDITORIAL RESISTANCE DECK · DOCUMENTED PUBLIC CONTRIBUTION · NOT ENDORSEMENT OF EVERY VIEW OR ACT';
const DECK_SUMMARY = 'A ranked, source-led map of 52 people who built decentralised infrastructure, defended privacy, exposed concealed systems or created major public routes around institutional gatekeepers.';

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeXml(value = '') {
  return escapeHtml(value);
}

function wrapSvgText(value, max = 30) {
  const words = String(value).split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (test.length > max && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

function validate(cards) {
  if (cards.length !== 52) throw new Error(`Expected 52 cards, found ${cards.length}.`);
  const ranks = new Set();
  const ids = new Set();
  const counts = Object.fromEntries(Object.keys(SUITS).map((key) => [key, 0]));
  for (const card of cards) {
    if (!Number.isInteger(card.rank) || card.rank < 1 || card.rank > 52) throw new Error(`Invalid rank: ${card.rank}`);
    if (ranks.has(card.rank)) throw new Error(`Duplicate rank: ${card.rank}`);
    if (!card.id || ids.has(card.id)) throw new Error(`Invalid or duplicate id: ${card.id}`);
    if (!SUITS[card.suit]) throw new Error(`Unknown suit for ${card.id}: ${card.suit}`);
    if (!Array.isArray(card.sources) || !card.sources.length) throw new Error(`No sources for ${card.id}`);
    ranks.add(card.rank);
    ids.add(card.id);
    counts[card.suit] += 1;
  }
  for (let rank = 1; rank <= 52; rank += 1) {
    if (!ranks.has(rank)) throw new Error(`Missing rank ${rank}.`);
  }
  for (const [suit, count] of Object.entries(counts)) {
    if (count !== 13) throw new Error(`${suit} must contain 13 cards, found ${count}.`);
  }
  return counts;
}

function pageShell({ title, description, body, extraStyle = '', extraScript = '' }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>${escapeHtml(title)} | Matrix Reprogrammed</title>
<meta name="description" content="${escapeHtml(description)}"/>
<link rel="stylesheet" href="styles.css"/>
<link rel="stylesheet" href="reader-experience.css"/>
<style>
:root{--hero-green:#61d6b4;--hero-blue:#63aee8;--hero-gold:#e5a84f;--hero-red:#d85d62}
.hero-deck-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:1rem}
.hero-card{border:1px solid rgba(97,214,180,.26);border-radius:22px;padding:.75rem;background:linear-gradient(145deg,rgba(4,12,11,.97),rgba(0,0,0,.97));box-shadow:0 20px 45px rgba(0,0,0,.25)}
.hero-card img{display:block;width:100%;aspect-ratio:2/3;object-fit:cover;border-radius:16px;border:1px solid rgba(255,255,255,.16);background:#050505}
.hero-card h2{font-size:1.12rem;margin:.55rem 0 .3rem}.hero-card p{margin:.35rem 0}.hero-meta{font-size:.79rem;color:#c9d5d2}.hero-actions{display:flex;gap:.45rem;flex-wrap:wrap;margin-top:.65rem}.hero-actions a{font-size:.76rem;padding:.43rem .58rem}
.hero-controls{display:grid;grid-template-columns:minmax(220px,1fr) auto;gap:.75rem;margin:1rem 0}.hero-controls input{width:100%;padding:.8rem 1rem;border-radius:14px;border:1px solid rgba(255,255,255,.18);background:#050807;color:#fff}.hero-filters{display:flex;gap:.4rem;flex-wrap:wrap}.hero-filters button{border:1px solid rgba(255,255,255,.2);border-radius:999px;padding:.62rem .85rem;background:#080b0a;color:#eee;cursor:pointer}.hero-filters button.active{border-color:var(--hero-green);color:var(--hero-green)}
.hero-boundary,.hero-method{border:1px solid rgba(97,214,180,.28);border-radius:20px;padding:1rem;background:rgba(1,8,7,.78)}.hero-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:.75rem}.hero-stat{padding:1rem;border:1px solid rgba(255,255,255,.12);border-radius:18px;background:rgba(0,0,0,.35)}.hero-stat strong{display:block;font-size:1.55rem;color:var(--hero-green)}
.source-list{display:grid;gap:.6rem}.source-item{padding:.8rem;border:1px solid rgba(255,255,255,.12);border-radius:14px;background:rgba(0,0,0,.3)}.source-item a{overflow-wrap:anywhere}.badge{display:inline-block;border:1px solid currentColor;border-radius:999px;padding:.18rem .48rem;font-size:.72rem;text-transform:uppercase;letter-spacing:.08em}.confidence-contested{color:#ff9a9e}.confidence-medium,.confidence-medium-high{color:#ffd28c}.confidence-high{color:#8ef1d3}
.dossier-grid{display:grid;grid-template-columns:minmax(250px,380px) minmax(0,1fr);gap:1.3rem;align-items:start}.dossier-card{position:sticky;top:1rem}.dossier-card img{width:100%;border-radius:20px;border:1px solid rgba(255,255,255,.18)}.evidence-box{padding:1rem;border-radius:18px;border:1px solid rgba(255,255,255,.14);background:rgba(0,0,0,.4);margin-bottom:1rem}.rank-link{display:flex;justify-content:space-between;gap:1rem;padding:.7rem 0;border-bottom:1px solid rgba(255,255,255,.1)}
${extraStyle}
@media(max-width:760px){.hero-controls{grid-template-columns:1fr}.dossier-grid{grid-template-columns:1fr}.dossier-card{position:static}}
</style>
<style id="public-internal-visibility">.internal-only,[data-internal-only="true"]{display:none!important}</style>
</head>
<body><canvas id="matrix"></canvas><div class="page">
<header class="wrap topbar"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil"/> MATRIX REPROGRAMMED</a><nav class="nav"><a href="heroes-fighting-matrix-deck.html">Heroes Deck</a><a href="heroes-fighting-matrix-research-ledger.html">Source Ledger</a><a href="deck-expansion-hub.html">Deck Hub</a><a href="search.html">Search</a></nav></header>
<section class="reader-governor-strip"><div><strong>Matrix Reprogrammed</strong><span>Evidence, infrastructure, dissent and public-interest resistance.</span></div><nav><a href="daily-command-brief.html">Daily Brief</a><a href="control-structure.html">Power Map</a><a href="evidence-vault.html">Evidence</a><a href="research-tools.html">Research</a></nav></section>
${body}
<footer class="footer wrap"><p><strong>Boundary:</strong> ${escapeHtml(DECK_BOUNDARY)}</p></footer></div><script src="matrix.js"></script>${extraScript}</body></html>`;
}

function makeCardSvg(card) {
  const suit = SUITS[card.suit];
  const initials = card.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 3).toUpperCase();
  const laneLines = wrapSvgText(card.lane, 32);
  const nameLines = wrapSvgText(card.name.toUpperCase(), 21);
  const scoreWidth = Math.round(620 * card.score / 100);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1800" viewBox="0 0 1200 1800" role="img" aria-label="${escapeXml(card.name)} Heroes Fighting the Matrix card">
<defs>
<radialGradient id="bg" cx="50%" cy="22%" r="86%"><stop offset="0" stop-color="${suit.gradient[0]}"/><stop offset=".58" stop-color="${suit.gradient[1]}"/><stop offset="1" stop-color="#010202"/></radialGradient>
<pattern id="grid" width="56" height="56" patternUnits="userSpaceOnUse"><path d="M56 0H0V56" fill="none" stroke="${suit.color}" stroke-opacity=".08"/></pattern>
<linearGradient id="beam" x1="0" y1="1" x2="1" y2="0"><stop stop-color="${suit.color}" stop-opacity="0"/><stop offset=".52" stop-color="${suit.color}" stop-opacity=".2"/><stop offset="1" stop-color="${suit.color}" stop-opacity="0"/></linearGradient>
</defs>
<rect width="1200" height="1800" fill="url(#bg)"/><rect x="58" y="58" width="1084" height="1684" rx="42" fill="url(#grid)"/><path d="M90 1380L1110 310" stroke="url(#beam)" stroke-width="210"/>
<rect x="32" y="32" width="1136" height="1736" rx="42" fill="none" stroke="${suit.color}" stroke-width="8"/><rect x="53" y="53" width="1094" height="1694" rx="34" fill="none" stroke="${suit.pale}" stroke-opacity=".75" stroke-width="2"/>
<text x="600" y="112" text-anchor="middle" fill="${suit.pale}" font-family="Arial,sans-serif" font-size="28" font-weight="700" letter-spacing="5">MATRIX REPROGRAMMED</text><line x1="285" y1="140" x2="915" y2="140" stroke="${suit.color}" stroke-width="2"/><text x="600" y="188" text-anchor="middle" fill="#f4f4ec" font-family="Georgia,serif" font-size="39" font-weight="700" letter-spacing="3">HEROES FIGHTING THE MATRIX</text>
<g><rect x="65" y="76" width="112" height="132" rx="16" fill="#050908" stroke="${suit.color}" stroke-width="3"/><text x="121" y="127" text-anchor="middle" fill="${suit.pale}" font-family="Georgia,serif" font-size="46" font-weight="700">${card.rank}</text><text x="121" y="184" text-anchor="middle" fill="${suit.color}" font-family="Georgia,serif" font-size="43">${suit.icon}</text></g>
<g><rect x="1023" y="76" width="112" height="132" rx="16" fill="#050908" stroke="${suit.color}" stroke-width="3"/><text x="1079" y="127" text-anchor="middle" fill="${suit.pale}" font-family="Georgia,serif" font-size="46" font-weight="700">${card.rank}</text><text x="1079" y="184" text-anchor="middle" fill="${suit.color}" font-family="Georgia,serif" font-size="43">${suit.icon}</text></g>
<circle cx="600" cy="657" r="330" fill="#050807" stroke="${suit.color}" stroke-width="7"/><circle cx="600" cy="657" r="303" fill="none" stroke="${suit.pale}" stroke-opacity=".44" stroke-width="2"/><circle cx="600" cy="657" r="250" fill="none" stroke="${suit.color}" stroke-opacity=".25" stroke-width="3" stroke-dasharray="8 14"/>
<text x="600" y="570" text-anchor="middle" fill="${suit.color}" font-family="Georgia,serif" font-size="88">${suit.icon}</text><text x="600" y="725" text-anchor="middle" fill="#f6f6ef" font-family="Georgia,serif" font-size="170" font-weight="700" letter-spacing="10">${escapeXml(initials)}</text><text x="600" y="810" text-anchor="middle" fill="${suit.pale}" font-family="Arial,sans-serif" font-size="25" letter-spacing="7">DOCUMENTED PUBLIC CONTRIBUTION</text>
<rect x="125" y="1050" width="950" height="300" rx="28" fill="#030605" fill-opacity=".94" stroke="${suit.color}" stroke-width="5"/>
${nameLines.map((line, index) => `<text x="600" y="${1140 + index * 68}" text-anchor="middle" fill="#f7f6ed" font-family="Georgia,serif" font-size="${nameLines.length > 1 ? 58 : 72}" font-weight="700" letter-spacing="2">${escapeXml(line)}</text>`).join('')}
<text x="600" y="${nameLines.length > 1 ? 1305 : 1245}" text-anchor="middle" fill="${suit.color}" font-family="Arial,sans-serif" font-size="28" font-weight="700" letter-spacing="4">${suit.name.toUpperCase()} · CARD ${card.rank}</text>
${laneLines.map((line, index) => `<text x="600" y="${1408 + index * 38}" text-anchor="middle" fill="${suit.pale}" font-family="Arial,sans-serif" font-size="28" font-weight="700" letter-spacing="1">${escapeXml(line.toUpperCase())}</text>`).join('')}
<text x="600" y="1530" text-anchor="middle" fill="#f5f5ee" font-family="Georgia,serif" font-size="52" font-weight="700">RESISTANCE SCORE ${card.score} / 100</text><rect x="290" y="1570" width="620" height="28" rx="14" fill="#161c1a" stroke="${suit.color}" stroke-width="2"/><rect x="294" y="1574" width="${scoreWidth}" height="20" rx="10" fill="${suit.color}"/>
<rect x="135" y="1630" width="930" height="92" rx="18" fill="#030605" stroke="${suit.pale}" stroke-width="2"/><text x="600" y="1668" text-anchor="middle" fill="#f0f0e9" font-family="Arial,sans-serif" font-size="22" font-weight="700" letter-spacing="1">DOCUMENTED CONTRIBUTION · NOT TOTAL ENDORSEMENT</text><text x="600" y="1702" text-anchor="middle" fill="${suit.color}" font-family="Arial,sans-serif" font-size="18">Ranked for infrastructure, evidence, risk, reach and durability</text>
</svg>`;
}

function makeDossier(card, cards) {
  const suit = SUITS[card.suit];
  const previous = cards.find((item) => item.rank === card.rank - 1);
  const next = cards.find((item) => item.rank === card.rank + 1);
  const sources = card.sources.map((source, index) => `<div class="source-item"><span class="badge">${escapeHtml(source.type || 'source')}</span><h3>${index + 1}. ${escapeHtml(source.label)}</h3><a href="${escapeHtml(source.url)}" rel="noopener noreferrer">Open source record</a></div>`).join('');
  const body = `<main class="wrap section">
<div class="eyebrow">Heroes Fighting the Matrix · ${escapeHtml(suit.name)} · Rank ${card.rank}</div>
<h1>${escapeHtml(card.name)}</h1>
<p class="lead">${escapeHtml(card.lane)}</p>
<div class="dossier-grid">
<aside class="dossier-card"><img src="../assets/heroes-fighting-matrix/cards/${escapeHtml(card.id)}.svg" alt="${escapeHtml(card.name)} Heroes Fighting the Matrix card"/><div class="hero-actions"><a class="btn" href="../assets/heroes-fighting-matrix/cards/${escapeHtml(card.id)}.svg" download>Download Card</a><a class="btn alt" href="../heroes-fighting-matrix-deck.html">Full Deck</a></div></aside>
<section>
<div class="hero-stats"><div class="hero-stat"><strong>#${card.rank}</strong>overall rank</div><div class="hero-stat"><strong>${card.score}</strong>resistance score</div><div class="hero-stat"><strong style="color:${suit.color}">${escapeHtml(suit.name)}</strong>${escapeHtml(suit.label)}</div><div class="hero-stat"><strong class="confidence-${escapeHtml(card.confidence)}">${escapeHtml(card.confidence)}</strong>confidence</div></div>
<div class="evidence-box"><h2>Documented contribution</h2><p>${escapeHtml(card.contribution)}</p></div>
<div class="evidence-box"><h2>Why this person is included</h2><p>${escapeHtml(card.whyIncluded)}</p></div>
<div class="evidence-box"><h2>Editorial boundary</h2><p>${escapeHtml(card.caveat)}</p><p><strong>${escapeHtml(DECK_BOUNDARY)}</strong></p></div>
<h2>Source route</h2><div class="source-list">${sources}</div>
<div class="rank-link">${previous ? `<a href="${escapeHtml(previous.id)}.html">← #${previous.rank} ${escapeHtml(previous.name)}</a>` : '<span></span>'}${next ? `<a href="${escapeHtml(next.id)}.html">#${next.rank} ${escapeHtml(next.name)} →</a>` : '<span></span>'}</div>
</section></div></main>`;
  return pageShell({
    title: `${card.name} - Heroes Fighting the Matrix`,
    description: `${card.name}: ${card.contribution}`,
    body,
  }).replace(/href="styles\.css"/g, 'href="../styles.css"').replace(/href="reader-experience\.css"/g, 'href="../reader-experience.css"').replace(/src="sigil\.png"/g, 'src="../sigil.png"').replace(/href="index\.html"/g, 'href="../index.html"').replace(/href="heroes-fighting-matrix-deck\.html"/g, 'href="../heroes-fighting-matrix-deck.html"').replace(/href="heroes-fighting-matrix-research-ledger\.html"/g, 'href="../heroes-fighting-matrix-research-ledger.html"').replace(/href="deck-expansion-hub\.html"/g, 'href="../deck-expansion-hub.html"').replace(/href="search\.html"/g, 'href="../search.html"').replace(/href="daily-command-brief\.html"/g, 'href="../daily-command-brief.html"').replace(/href="control-structure\.html"/g, 'href="../control-structure.html"').replace(/href="evidence-vault\.html"/g, 'href="../evidence-vault.html"').replace(/href="research-tools\.html"/g, 'href="../research-tools.html"').replace(/src="matrix\.js"/g, 'src="../matrix.js"');
}

function makeDeckPage(cards, counts) {
  const cardsHtml = cards.map((card) => {
    const suit = SUITS[card.suit];
    return `<article class="hero-card" data-suit="${card.suit}" data-search="${escapeHtml(`${card.name} ${card.lane} ${card.contribution} ${card.suit}`.toLowerCase())}"><a href="heroes-fighting-matrix/${escapeHtml(card.id)}.html"><img src="assets/heroes-fighting-matrix/cards/${escapeHtml(card.id)}.svg" alt="${escapeHtml(card.name)} card artwork" loading="lazy"/></a><div class="hero-meta">#${card.rank} · ${escapeHtml(suit.name)} · Score ${card.score}/100</div><h2>${escapeHtml(card.name)}</h2><p class="hero-meta">${escapeHtml(card.lane)}</p><div class="hero-actions"><a class="btn" href="heroes-fighting-matrix/${escapeHtml(card.id)}.html">Deep Dossier</a><a class="btn alt" href="assets/heroes-fighting-matrix/cards/${escapeHtml(card.id)}.svg" download>Download</a></div></article>`;
  }).join('');
  const filterButtons = ['ALL', ...Object.keys(SUITS)].map((suit, index) => `<button type="button" data-filter="${suit}" class="${index === 0 ? 'active' : ''}">${suit === 'ALL' ? 'All 52' : `${SUITS[suit].icon} ${SUITS[suit].name}`}</button>`).join('');
  const body = `<main>
<section class="hero wrap"><div class="eyebrow">52-card counter-power deck</div><h1>HEROES FIGHTING THE MATRIX.</h1><p class="lead">${escapeHtml(DECK_SUMMARY)}</p><div class="cta-row"><a class="btn" href="heroes-fighting-matrix-research-ledger.html">Open Research Ledger</a><a class="btn alt" href="data/heroes-fighting-matrix-deck.json">Deck Data</a><a class="btn alt" href="deck-expansion-hub.html">Deck Hub</a></div></section>
<section class="section wrap split"><div class="terminal">52-CARD MODE\n&gt; 13 Keys: decentralised infrastructure\n&gt; 13 Shields: privacy and civil liberties\n&gt; 13 Torches: exposure and whistleblowing\n&gt; 13 Swords: direct public resistance</div><aside class="hero-boundary"><h2>What “hero” means here</h2><p>It means a documented contribution that reduced centralised control, exposed hidden conduct, defended civil liberties or opened an alternative route around institutional gatekeepers.</p><p><strong>It does not mean moral perfection, legal innocence, factual accuracy in every claim or endorsement of every belief.</strong></p></aside></section>
<section class="section wrap"><div class="hero-stats"><div class="hero-stat"><strong>52</strong>ranked people</div>${Object.entries(counts).map(([suit, count]) => `<div class="hero-stat"><strong style="color:${SUITS[suit].color}">${count}</strong>${escapeHtml(SUITS[suit].name)}</div>`).join('')}<div class="hero-stat"><strong>100%</strong>source-routed</div></div></section>
<section class="section wrap"><h2>Search and filter the deck</h2><div class="hero-controls"><input id="hero-search" type="search" placeholder="Search names, technologies, cases or contribution routes..." aria-label="Search Heroes deck"/><div class="hero-filters">${filterButtons}</div></div><p id="hero-count" class="hero-meta">Showing all 52 cards.</p><div class="hero-deck-grid" id="hero-grid">${cardsHtml}</div></section>
<section class="section wrap hero-method"><h2>Ranking method</h2><p>Scores weight deployed infrastructure, censorship or surveillance resistance, real-world adoption, personal risk, independence from central institutions, durability and documented public impact. Structural builders outrank personalities whose contribution is primarily reach.</p><p><strong>${escapeHtml(DECK_BOUNDARY)}</strong></p></section>
</main>`;
  const script = `<script>(function(){const input=document.getElementById('hero-search');const cards=[...document.querySelectorAll('.hero-card')];const buttons=[...document.querySelectorAll('[data-filter]')];const count=document.getElementById('hero-count');let filter='ALL';function apply(){const q=input.value.trim().toLowerCase();let shown=0;cards.forEach(card=>{const visible=(filter==='ALL'||card.dataset.suit===filter)&&(!q||card.dataset.search.includes(q));card.hidden=!visible;if(visible)shown++;});count.textContent='Showing '+shown+' of 52 cards.';}buttons.forEach(button=>button.addEventListener('click',()=>{filter=button.dataset.filter;buttons.forEach(item=>item.classList.toggle('active',item===button));apply();}));input.addEventListener('input',apply);})();</script>`;
  return pageShell({ title: 'Heroes Fighting the Matrix Deck', description: DECK_SUMMARY, body, extraScript: script });
}

function makeLedger(cards) {
  const rows = cards.map((card) => `<article class="evidence-box"><div class="hero-meta">#${card.rank} · ${escapeHtml(card.suit)} · Score ${card.score}/100 · ${escapeHtml(card.confidence)}</div><h2><a href="heroes-fighting-matrix/${escapeHtml(card.id)}.html">${escapeHtml(card.name)}</a></h2><p><strong>Contribution:</strong> ${escapeHtml(card.contribution)}</p><p><strong>Boundary:</strong> ${escapeHtml(card.caveat)}</p><div class="source-list">${card.sources.map((source) => `<div class="source-item"><span class="badge">${escapeHtml(source.type || 'source')}</span> <a href="${escapeHtml(source.url)}" rel="noopener noreferrer">${escapeHtml(source.label)}</a></div>`).join('')}</div></article>`).join('');
  const body = `<main class="wrap section"><div class="eyebrow">Evidence route · all 52 cards</div><h1>HEROES DECK RESEARCH LEDGER.</h1><p class="lead">The primary and authoritative source route behind every inclusion, score and boundary in the deck.</p><div class="cta-row"><a class="btn" href="heroes-fighting-matrix-deck.html">Open Deck</a><a class="btn alt" href="downloads/heroes-fighting-matrix-source-ledger.json">Download JSON Ledger</a><a class="btn alt" href="downloads/heroes-fighting-matrix-source-ledger.md">Download Markdown Ledger</a></div><section class="hero-boundary"><h2>Evidence rule</h2><p>A source proves only what it records. Inclusion does not convert allegations, disputed interpretations or pending cases into facts. Contested cards are marked and bounded.</p></section><section class="section">${rows}</section></main>`;
  return pageShell({ title: 'Heroes Fighting the Matrix Research Ledger', description: 'Sources and editorial boundaries for all 52 Heroes Fighting the Matrix cards.', body });
}

function makeMarkdownLedger(cards) {
  const lines = ['# Heroes Fighting the Matrix - Source Ledger', '', DECK_SUMMARY, '', `**Boundary:** ${DECK_BOUNDARY}`, ''];
  for (const card of cards) {
    lines.push(`## ${card.rank}. ${card.name}`, '', `- **Suit:** ${card.suit}`, `- **Score:** ${card.score}/100`, `- **Confidence:** ${card.confidence}`, `- **Lane:** ${card.lane}`, `- **Contribution:** ${card.contribution}`, `- **Why included:** ${card.whyIncluded}`, `- **Boundary:** ${card.caveat}`, '', '### Sources');
    card.sources.forEach((source) => lines.push(`- [${source.label}](${source.url}) - ${source.type || 'source'}`));
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

function patchHub() {
  const hubPath = path.join(root, 'deck-expansion-hub.html');
  if (!fs.existsSync(hubPath)) return;
  let html = fs.readFileSync(hubPath, 'utf8');
  if (html.includes('heroes-fighting-matrix-deck.html')) return;
  const card = `<article class="deck-card"><div class="sig">⚡</div><h2>Heroes Fighting the Matrix</h2><p>52 people who built decentralised infrastructure, defended privacy, exposed concealed systems or created major public routes around institutional gatekeepers.</p><p><strong>Boundary:</strong> Documented public contribution is not total endorsement. Contested claims and pending legal matters remain explicitly labelled.</p><div class="cta-row small"><a class="btn" href="heroes-fighting-matrix-deck.html">Open Deck</a><a class="btn alt" href="heroes-fighting-matrix-research-ledger.html">Source Ledger</a></div></article>`;
  const marker = '</div><script type="application/json" id="compatibility-marker-vault"';
  if (html.includes(marker)) html = html.replace(marker, `${card}</div><script type="application/json" id="compatibility-marker-vault"`);
  else html = html.replace('</main>', `<section class="section wrap">${card}</section></main>`);
  fs.writeFileSync(hubPath, html);
}

const sourceFiles = ['keys.json', 'shields.json', 'torches.json', 'swords.json'];
const cards = sourceFiles.flatMap((file) => readJson(path.join(dataDir, file))).sort((a, b) => a.rank - b.rank);
const counts = validate(cards);

ensureDir(dossierDir);
ensureDir(assetDir);
ensureDir(downloadDir);

const deckData = {
  deckId: 'heroes-fighting-matrix',
  title: 'Heroes Fighting the Matrix',
  version: 1,
  generatedAt: new Date().toISOString(),
  count: cards.length,
  boundary: DECK_BOUNDARY,
  methodology: {
    criteria: ['deployed infrastructure', 'censorship or surveillance resistance', 'real-world adoption', 'personal risk', 'independence', 'durability', 'documented public impact'],
    note: 'Structural builders outrank personalities whose contribution is primarily audience reach.',
  },
  suits: Object.fromEntries(Object.entries(SUITS).map(([key, value]) => [key, { name: value.name, label: value.label, count: counts[key] }])),
  cards,
};

fs.writeFileSync(deckDataPath, `${JSON.stringify(deckData, null, 2)}\n`);
fs.writeFileSync(path.join(downloadDir, 'heroes-fighting-matrix-source-ledger.json'), `${JSON.stringify(deckData, null, 2)}\n`);
fs.writeFileSync(path.join(downloadDir, 'heroes-fighting-matrix-source-ledger.md'), makeMarkdownLedger(cards));
fs.writeFileSync(deckPagePath, makeDeckPage(cards, counts));
fs.writeFileSync(ledgerPagePath, makeLedger(cards));

for (const card of cards) {
  fs.writeFileSync(path.join(assetDir, `${card.id}.svg`), makeCardSvg(card));
  fs.writeFileSync(path.join(dossierDir, `${card.id}.html`), makeDossier(card, cards));
}

patchHub();
console.log(`Heroes Fighting the Matrix built: ${cards.length} cards, ${cards.length} dossiers, source ledger and deck wall.`);
