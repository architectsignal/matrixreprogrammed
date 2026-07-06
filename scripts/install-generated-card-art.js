const fs = require('fs');
const path = require('path');

const root = process.cwd();
const fp = p => path.join(root, p);
const ex = p => fs.existsSync(fp(p));
const rd = p => fs.readFileSync(fp(p), 'utf8');
const wr = (p, v) => { fs.mkdirSync(path.dirname(fp(p)), { recursive: true }); fs.writeFileSync(fp(p), v); };
const js = (p, f) => { try { return ex(p) ? JSON.parse(rd(p)) : f; } catch { return f; } };
const esc = s => String(s ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
const slug = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'card';
const updated = new Date().toISOString();

const completed = [
  { id: 'elon-musk', name: 'Elon Musk', title: 'King of Coins', suit: 'Coins', score: 100, route: 'technology, satellite, AI and capital route', batch: 1 },
  { id: 'larry-fink', name: 'Larry Fink', title: 'Queen of Coins', suit: 'Coins', score: 98, route: 'BlackRock / asset-management influence route', batch: 1 },
  { id: 'bill-gates', name: 'Bill Gates', title: 'Knight of Masks', suit: 'Masks', score: 96, route: 'foundation, health, digital-ID and policy route', batch: 1 },
  { id: 'klaus-schwab', name: 'Klaus Schwab', title: 'Ace of Masks', suit: 'Masks', score: 94, route: 'WEF and public-private governance route', batch: 1 },
  { id: 'ursula-von-der-leyen', name: 'Ursula von der Leyen', title: 'Card 5 of Crowns', suit: 'Crowns', score: 92, route: 'EU governance and policy route', batch: 1 },
  { id: 'emmanuel-macron', name: 'Emmanuel Macron', title: 'Card 6 of Crowns', suit: 'Crowns', score: 90, route: 'France / EU governance route', batch: 1 },
  { id: 'tony-blair', name: 'Tony Blair', title: 'Card 7 of Masks', suit: 'Masks', score: 88, route: 'institute, digital-ID and governance route', batch: 1 },
  { id: 'mark-zuckerberg', name: 'Mark Zuckerberg', title: 'Card 8 of Masks', suit: 'Masks', score: 87, route: 'platform, AI and narrative infrastructure route', batch: 1 },
  { id: 'jeff-bezos', name: 'Jeff Bezos', title: 'Card 9 of Coins', suit: 'Coins', score: 86, route: 'capital, cloud, media and logistics route', batch: 1 },
  { id: 'jamie-dimon', name: 'Jamie Dimon', title: 'Card 10 of Coins', suit: 'Coins', score: 85, route: 'banking and financial-system route', batch: 1 },
  { id: 'jerome-powell', name: 'Jerome Powell', title: 'Card 11 of Coins', suit: 'Coins', score: 84, route: 'central-bank and currency route', batch: 1 },
  { id: 'christine-lagarde', name: 'Christine Lagarde', title: 'Card 12 of Coins', suit: 'Coins', score: 83, route: 'central-bank and currency route', batch: 1 },
  { id: 'pope-francis', name: 'Pope Francis', title: 'Card 13 of Masks', suit: 'Masks', score: 82, route: 'religion / interfaith route', batch: 2 },
  { id: 'king-charles-iii', name: 'King Charles III', title: 'Card 14 of Crowns', suit: 'Crowns', score: 82, route: 'royal, climate, commonwealth and governance route', batch: 2 },
  { id: 'erik-prince', name: 'Erik Prince', title: 'Card 15 of Swords', suit: 'Swords', score: 81, route: 'private security / contractor route', batch: 2 },
  { id: 'sam-altman', name: 'Sam Altman', title: 'Card 16 of Masks', suit: 'Masks', score: 80, route: 'AI infrastructure and governance route', batch: 2 },
  { id: 'sundar-pichai', name: 'Sundar Pichai', title: 'Card 17 of Masks', suit: 'Masks', score: 79, route: 'search, AI and platform infrastructure route', batch: 2 },
  { id: 'satya-nadella', name: 'Satya Nadella', title: 'Card 18 of Masks', suit: 'Masks', score: 78, route: 'cloud, AI and enterprise infrastructure route', batch: 2 },
  { id: 'tim-cook', name: 'Tim Cook', title: 'Card 19 of Coins', suit: 'Coins', score: 77, route: 'platform, device and digital infrastructure route', batch: 2 },
  { id: 'jensen-huang', name: 'Jensen Huang', title: 'Card 20 of Coins', suit: 'Coins', score: 76, route: 'AI chip and compute infrastructure route', batch: 2 },
  { id: 'peter-thiel', name: 'Peter Thiel', title: 'Card 21 of Swords', suit: 'Swords', score: 75, route: 'capital, technology and security route', batch: 2 },
  { id: 'george-soros', name: 'George Soros', title: 'Card 22 of Masks', suit: 'Masks', score: 74, route: 'foundation, finance and policy route', batch: 2 }
];

const suitMeta = {
  Coins: { icon: '◆', label: 'CAPITAL ROUTE', motifs: ['finance', 'asset flow', 'market networks', 'allocation'] },
  Crowns: { icon: '♛', label: 'GOVERNANCE ROUTE', motifs: ['policy', 'state power', 'mandate', 'institution'] },
  Swords: { icon: '♠', label: 'SECURITY ROUTE', motifs: ['security', 'contractors', 'strategy', 'access'] },
  Masks: { icon: '♣', label: 'NARRATIVE ROUTE', motifs: ['media', 'belief', 'platforms', 'policy'] }
};

function cardSvg(card) {
  const meta = suitMeta[card.suit] || suitMeta.Masks;
  const initials = card.name.split(/\s+/).map(x => x[0]).join('').slice(0, 3).toUpperCase();
  const title = String(card.title || `Card of ${card.suit}`).toUpperCase();
  const name = card.name.toUpperCase();
  const route = card.route.toUpperCase();
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1800" viewBox="0 0 1200 1800" role="img" aria-label="${esc(card.name)} ${esc(card.title)} Matrix Reprogrammed card artwork">
  <defs>
    <radialGradient id="bg" cx="50%" cy="24%" r="72%"><stop offset="0" stop-color="#26120a"/><stop offset="0.42" stop-color="#090807"/><stop offset="1" stop-color="#020202"/></radialGradient>
    <linearGradient id="red" x1="0" x2="1"><stop offset="0" stop-color="#3b0907"/><stop offset="0.5" stop-color="#751410"/><stop offset="1" stop-color="#300706"/></linearGradient>
    <filter id="glow"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(32)"><line x1="0" y1="0" x2="0" y2="8" stroke="#d8b56a" stroke-opacity=".13" stroke-width="1"/></pattern>
    <style><![CDATA[
      .gold{fill:#d8b56a}.red{fill:#8b1b16}.cream{fill:#f2e2b8}.line{stroke:#d8b56a;stroke-width:3;fill:none}.thin{stroke:#d8b56a;stroke-width:1.2;fill:none;opacity:.75}.micro{font-family:Georgia,serif;font-size:22px;letter-spacing:2px;fill:#d8b56a}.serif{font-family:Georgia,serif}.small{font-size:30px;letter-spacing:4px}.route{font-size:38px;letter-spacing:2px}.name{font-size:78px;letter-spacing:4px}.title{font-size:45px;letter-spacing:6px}.score{font-size:100px}.tiny{font-size:20px;letter-spacing:2px;opacity:.85}
    ]]></style>
  </defs>
  <rect width="1200" height="1800" fill="url(#bg)"/>
  <rect x="34" y="34" width="1132" height="1732" rx="36" fill="none" stroke="#d8b56a" stroke-width="8"/>
  <rect x="58" y="58" width="1084" height="1684" rx="28" fill="none" stroke="#d8b56a" stroke-width="2" opacity=".75"/>
  <rect x="84" y="84" width="1032" height="1632" rx="20" fill="url(#hatch)" opacity=".38"/>
  <path d="M180 114 Q600 62 1020 114 L980 186 Q600 142 220 186 Z" fill="url(#red)" stroke="#d8b56a" stroke-width="4"/>
  <text x="600" y="159" text-anchor="middle" class="serif title cream">${esc(title)}</text>
  <circle cx="150" cy="160" r="70" fill="#100706" stroke="#d8b56a" stroke-width="4"/><circle cx="1050" cy="160" r="70" fill="#100706" stroke="#d8b56a" stroke-width="4"/>
  <text x="150" y="180" text-anchor="middle" class="serif gold" font-size="78">${esc(meta.icon)}</text><text x="1050" y="180" text-anchor="middle" class="serif gold" font-size="78">${esc(meta.icon)}</text>
  <ellipse cx="600" cy="520" rx="330" ry="360" fill="#111" stroke="#d8b56a" stroke-width="6"/>
  <ellipse cx="600" cy="520" rx="296" ry="322" fill="url(#hatch)" stroke="#d8b56a" stroke-width="2" opacity=".95"/>
  <path d="M410 675 C430 535 490 442 600 430 C710 442 770 535 790 675 C730 735 470 735 410 675Z" fill="#16100b" stroke="#d8b56a" stroke-width="3" opacity=".95"/>
  <circle cx="600" cy="360" r="112" fill="#1b1209" stroke="#d8b56a" stroke-width="4"/>
  <text x="600" y="392" text-anchor="middle" class="serif gold" font-size="90">${esc(initials)}</text>
  <path d="M260 824 H940 Q978 824 1002 862 Q978 900 940 900 H260 Q222 900 198 862 Q222 824 260 824Z" fill="#050505" stroke="#d8b56a" stroke-width="6"/>
  <text x="600" y="881" text-anchor="middle" class="serif name cream">${esc(name)}</text>
  <circle cx="600" cy="1076" r="132" fill="#0b0908" stroke="#d8b56a" stroke-width="5"/>
  <circle cx="600" cy="1076" r="108" fill="url(#red)" stroke="#d8b56a" stroke-width="2"/>
  <text x="600" y="1037" text-anchor="middle" class="serif tiny gold">OVERALL INFLUENCE SCORE</text>
  <text x="600" y="1120" text-anchor="middle" class="serif score cream">${esc(card.score)}</text>
  <text x="702" y="1120" class="serif gold" font-size="38">/100</text>
  <rect x="300" y="1242" width="600" height="98" rx="18" fill="#090807" stroke="#d8b56a" stroke-width="4"/>
  <text x="600" y="1282" text-anchor="middle" class="serif small gold">EVIDENCE-GRADE</text>
  <text x="600" y="1324" text-anchor="middle" class="serif" fill="#d8b56a" font-size="46" letter-spacing="4">STRONG ROUTE</text>
  <path d="M160 1410 H1040 L990 1502 H210 Z" fill="url(#red)" stroke="#d8b56a" stroke-width="4"/>
  <text x="600" y="1470" text-anchor="middle" class="serif route cream">${esc(route)}</text>
  <rect x="124" y="230" width="190" height="1050" rx="22" fill="#050505" stroke="#d8b56a" stroke-width="2" opacity=".88"/>
  <rect x="886" y="230" width="190" height="1050" rx="22" fill="#050505" stroke="#d8b56a" stroke-width="2" opacity=".88"/>
  ${meta.motifs.map((m, i) => `<text x="219" y="${330 + i * 210}" text-anchor="middle" class="serif micro">${esc(String(m).toUpperCase())}</text><circle cx="219" cy="${380 + i * 210}" r="44" class="thin"/><text x="219" y="${396 + i * 210}" text-anchor="middle" class="serif gold" font-size="45">${esc(meta.icon)}</text>`).join('\n  ')}
  ${meta.motifs.map((m, i) => `<text x="981" y="${330 + i * 210}" text-anchor="middle" class="serif micro">${esc(String(m).toUpperCase())}</text><rect x="937" y="${352 + i * 210}" width="88" height="88" rx="14" class="thin"/><text x="981" y="${414 + i * 210}" text-anchor="middle" class="serif gold" font-size="45">${esc(meta.icon)}</text>`).join('\n  ')}
  <text x="600" y="1636" text-anchor="middle" class="serif small gold">PUBLIC-RECORD INFLUENCE ROUTE • NOT ACCUSATION</text>
  <text x="600" y="1694" text-anchor="middle" class="serif tiny gold">MATRIX REPROGRAMMED · GENERATED CARD ART LAYER · ${esc(updated.slice(0,10))}</text>
</svg>`;
}

const completedById = new Map(completed.map(c => [c.id, c]));
const deckData = js('data/top-52-power-deck.json', { deck: [] });
const liveCards = completed.map(c => {
  const deckCard = (deckData.deck || []).find(d => d.id === c.id || slug(d.name) === c.id) || {};
  return { ...c, ...deckCard, ...c, asset: `assets/top-52/cards/${c.id}.svg`, galleryRoute: 'top-52-generated-art.html', status: 'asset-live-svg' };
});

for (const c of liveCards) wr(c.asset, cardSvg(c));

const status = {
  ok: true,
  updated,
  title: 'Top 52 Generated Card Artwork Install',
  boundary: 'These are site-ready vector card-art assets for the generated/approved Power Deck cards. They mark the card art as live on-site while binary PNG/WebP portraits can be swapped into the same slots later.',
  totalLive: liveCards.length,
  batches: [
    { id: 'batch-1', name: 'Hero Twelve', status: liveCards.filter(c => c.batch === 1).length === 12 ? 'complete' : 'partial', count: liveCards.filter(c => c.batch === 1).length },
    { id: 'batch-2', name: 'Cards 13-22', status: 'in-progress', count: liveCards.filter(c => c.batch === 2).length }
  ],
  cards: liveCards.map(c => ({ id: c.id, name: c.name, title: c.title || c.cardTitle, suit: c.suit, score: c.score || c.powerScore, batch: c.batch, asset: c.asset, status: c.status }))
};
wr('data/top-52-generated-art.json', JSON.stringify(status, null, 2));
wr('downloads/top-52-generated-art.md', '# Top 52 Generated Card Artwork\n\nGenerated: ' + updated + '\n\nBoundary: ' + status.boundary + '\n\n' + status.cards.map(c => `## ${c.title} — ${c.name}\n- Suit: ${c.suit}\n- Score: ${c.score}/100\n- Status: ${c.status}\n- Asset: ${c.asset}`).join('\n\n'));

const css = `.generated-art-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:1rem}.generated-card-art{border:1px solid rgba(216,181,106,.28);border-radius:22px;background:linear-gradient(160deg,rgba(12,0,0,.92),rgba(0,0,0,.96));padding:1rem}.generated-card-art img{width:100%;height:auto;border-radius:16px;box-shadow:0 18px 70px rgba(0,0,0,.45)}.generated-art-status{display:flex;gap:.5rem;flex-wrap:wrap;margin:.75rem 0}.generated-art-status span{border:1px solid rgba(216,181,106,.35);border-radius:999px;padding:.35rem .65rem;color:#d8b56a}.live-card-art-section img{max-width:420px;width:100%;border-radius:24px;border:1px solid rgba(216,181,106,.38);box-shadow:0 18px 90px rgba(216,181,106,.12)}`;
wr('top-52-generated-art.css', css);

function shell(title, body, prefix = '') {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>${esc(title)} | Matrix Reprogrammed</title><meta name="description" content="Generated Power Deck artwork for the Matrix Reprogrammed Top 52 Persons of Interest."/><link rel="stylesheet" href="${prefix}styles.css"/><link rel="stylesheet" href="${prefix}reader-experience.css"/><link rel="stylesheet" href="${prefix}top-52-generated-art.css"/></head><body><canvas id="matrix"></canvas><div class="page"><header class="wrap topbar"><a class="brand" href="${prefix}index.html"><img src="${prefix}sigil.png" alt="Matrix Reprogrammed sigil"/> MATRIX REPROGRAMMED</a><nav class="nav"><a href="${prefix}top-52-power-deck.html">Power Deck</a><a href="${prefix}top-52-generated-art.html">Generated Art</a><a href="${prefix}top-52-art-studio.html">Art Studio</a><a href="${prefix}data/top-52-generated-art.json">Art Data</a></nav></header>${body}<footer class="footer wrap"><p><strong>Boundary:</strong> editorial card artwork is not evidence and not an accusation.</p></footer></div><script src="${prefix}matrix.js"></script></body></html>`;
}

const galleryCards = liveCards.map(c => `<article class="generated-card-art"><img src="${esc(c.asset)}" alt="${esc(c.name)} generated Power Deck card" loading="lazy"/><h3>${esc(c.name)}</h3><p>${esc(c.title || c.cardTitle)} · ${esc(c.suit)} · ${esc(c.score || c.powerScore)}/100</p><p><strong>Status:</strong> ${esc(c.status)}</p><a class="btn" href="top-52/${esc(c.id)}.html">Open Dossier</a></article>`).join('');
const gallery = `<main><section class="hero wrap"><div class="eyebrow">Power Deck Artwork</div><h1>GENERATED CARD ART IS LIVE.</h1><p class="lead">Batch 1 is complete and Batch 2 has started. These site-ready vector assets lock the card slots, house style, scores, routes and evidence-boundary labels while final PNG/WebP portrait files can be swapped into the same paths later.</p><div class="generated-art-status"><span>${status.totalLive} live card assets</span><span>Batch 1 complete</span><span>Batch 2 in progress</span><span>Public-record route · not accusation</span></div><div class="cta-row"><a class="btn" href="data/top-52-generated-art.json">Artwork Status JSON</a><a class="btn alt" href="downloads/top-52-generated-art.md">Artwork Markdown</a><a class="btn alt" href="top-52-power-deck.html">Open Deck</a></div></section><section class="section wrap"><h2>Live Card Assets</h2><div class="generated-art-grid">${galleryCards}</div></section></main>`;
wr('top-52-generated-art.html', shell('Top 52 Generated Card Artwork', gallery));

if (ex('top-52-power-deck.html')) {
  let html = rd('top-52-power-deck.html');
  if (!html.includes('top-52-generated-art.css')) html = html.replace('</head>', '<link rel="stylesheet" href="top-52-generated-art.css" /></head>');
  if (!html.includes('top-52-generated-art.html')) {
    html = html.replace('top-52-art-studio.html">Art Studio</a>', 'top-52-art-studio.html">Art Studio</a><a href="top-52-generated-art.html">Generated Art</a>');
    html = html.replace('Deck Data</a>', 'Deck Data</a><a class="btn alt" href="top-52-generated-art.html">Generated Art</a>');
  }
  if (!html.includes('id="generated-card-art-wall"')) {
    const wall = `<section id="generated-card-art-wall" class="section wrap"><div class="eyebrow">Generated Artwork</div><h2>Live Power Deck Art</h2><p class="lead">${status.totalLive} card-art assets are now installed on the site. Batch 1 is complete; Batch 2 is underway.</p><div class="generated-art-grid">${liveCards.slice(0, 12).map(c => `<article class="generated-card-art"><img src="${esc(c.asset)}" alt="${esc(c.name)} card art" loading="lazy"/><h3>${esc(c.name)}</h3><a class="btn" href="top-52/${esc(c.id)}.html">Open Dossier</a></article>`).join('')}</div><div class="cta-row"><a class="btn" href="top-52-generated-art.html">Open All Generated Art</a><a class="btn alt" href="data/top-52-generated-art.json">Art Data</a></div></section>`;
    html = html.replace('</main>', wall + '</main>');
  }
  wr('top-52-power-deck.html', html);
}

for (const c of liveCards) {
  const file = `top-52/${c.id}.html`;
  if (!ex(file)) continue;
  let html = rd(file);
  if (!html.includes('../top-52-generated-art.css')) html = html.replace('</head>', '<link rel="stylesheet" href="../top-52-generated-art.css" /></head>');
  html = html.replace(/<section id="generated-card-art"[\s\S]*?<\/section>/, '');
  const section = `<section id="generated-card-art" class="section wrap live-card-art-section"><div class="eyebrow">Generated Card Artwork</div><h2>${esc(c.title || c.cardTitle)}</h2><p class="lead">Site asset is live: ${esc(c.asset)}. This is editorial artwork for a public-record influence route, not an accusation.</p><img src="../${esc(c.asset)}" alt="${esc(c.name)} generated Power Deck card" loading="lazy"/><div class="cta-row"><a class="btn" href="../top-52-generated-art.html">Open Artwork Gallery</a><a class="btn alt" href="../data/top-52-generated-art.json">Art Status</a></div></section>`;
  html = html.includes('</main>') ? html.replace('</main>', section + '</main>') : html + section;
  wr(file, html);
}

for (const file of ['top-52-art-studio.html', 'top-52-batch1-art-queue.html']) {
  if (!ex(file)) continue;
  let html = rd(file);
  if (!html.includes('top-52-generated-art.css')) html = html.replace('</head>', '<link rel="stylesheet" href="top-52-generated-art.css" /></head>');
  if (!html.includes('top-52-generated-art.html')) html = html.replace('</main>', `<section class="section wrap"><div class="eyebrow">Generated Art Install</div><h2>${status.totalLive} card assets are live.</h2><p class="lead">Open the gallery to review Batch 1 and the Batch 2 start.</p><a class="btn" href="top-52-generated-art.html">Open Generated Art</a></section></main>`);
  wr(file, html);
}

if (ex('search-index.json')) {
  const search = js('search-index.json', []);
  if (!search.some(item => item.url === 'top-52-generated-art.html')) search.push({ key: 'top-52-generated-art', title: 'Top 52 Generated Card Artwork', subtitle: 'Power Deck Art Assets', series: 'Top 52 Persons of Interest', category: 'Power Deck', url: 'top-52-generated-art.html', description: 'Generated card artwork assets for the Matrix Reprogrammed Power Deck.', keywords: ['top 52 art', 'power deck', 'generated cards', 'persons of interest'] });
  wr('search-index.json', JSON.stringify(search, null, 2));
}

if (ex('sitemap.xml')) {
  let xml = rd('sitemap.xml');
  if (!xml.includes('/top-52-generated-art.html')) xml = xml.replace('</urlset>', `  <url><loc>https://matrixreprogrammed.com/top-52-generated-art.html</loc><lastmod>${updated.slice(0,10)}</lastmod><changefreq>weekly</changefreq><priority>0.86</priority></url>\n</urlset>`);
  wr('sitemap.xml', xml);
}

if (ex('llms.txt')) {
  let txt = rd('llms.txt');
  const line = '- /top-52-generated-art.html: generated Power Deck card artwork gallery and asset status.';
  if (!txt.includes(line)) wr('llms.txt', `${txt.trim()}\n${line}\n`);
}

for (const file of ['data/top-52-art-studio.json', 'data/top-52-batch1-art-queue.json']) {
  if (!ex(file)) continue;
  const data = js(file, {});
  const walk = obj => {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) return obj.forEach(walk);
    if (obj.id && completedById.has(obj.id)) {
      obj.status = 'asset-live-svg';
      obj.asset = `assets/top-52/cards/${obj.id}.svg`;
    }
    Object.values(obj).forEach(walk);
  };
  walk(data);
  wr(file, JSON.stringify(data, null, 2));
}

console.log(`Generated card art installed: ${status.totalLive} live SVG assets.`);
