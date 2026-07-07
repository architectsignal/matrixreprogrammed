const fs = require('fs');
const path = require('path');

const root = process.cwd();
const fp = p => path.join(root, p);
const ex = p => fs.existsSync(fp(p));
const rd = p => fs.readFileSync(fp(p), 'utf8');
const wr = (p, v) => { fs.mkdirSync(path.dirname(fp(p)), { recursive: true }); fs.writeFileSync(fp(p), v); };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const slug = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'card';
const updated = new Date().toISOString();

const suits = {
  Masks: 'media, persona, narrative and attention',
  Crowns: 'politics, populism and state power',
  Coins: 'monetized opposition, platforms and products',
  Mirrors: 'truth movements, conspiracy, disclosure and spiritual dissent'
};

const seed = [
  ['Alex Jones','conspiracy media / outrage engine','Masks',96,'Legacy opposition-media node; high public controversy; strong audience monetization and litigation record.'],
  ['Andrew Tate','manosphere / masculinity culture-war','Coins',94,'Influence machine across platforms, male-youth identity, monetized courses, bans and legal controversy.'],
  ['Mark Sargent','flat earth / cosmology opposition','Mirrors',72,'Flat Earth public figure; useful as cosmology boundary case and ridicule-containment lane.'],
  ['David Icke','conspiracy / spiritual politics','Mirrors',90,'Long-running conspiracy-spiritual dissent figure; high symbolic reach and movement-split history.'],
  ['Russell Brand','alternative media / spiritual populism','Masks',88,'Mainstream-to-alt-media bridge with large audience and anti-establishment positioning.'],
  ['Joe Rogan','platform gate / open debate hub','Masks',92,'High-reach conversation gate; hosts establishment and dissident figures inside the same platform lane.'],
  ['Tucker Carlson','mainstream-to-alt media bridge','Crowns',91,'Political media gatekeeper with elite access and populist opposition positioning.'],
  ['Candace Owens','culture-war opposition','Crowns',82,'Culture-war influence route with high engagement and establishment-opposition tension.'],
  ['Jordan Peterson','intellectual opposition / psychology','Mirrors',85,'Academic-to-platform dissent route; identity, religion, psychology and culture-war lanes.'],
  ['Ben Shapiro','conservative opposition gate','Masks',84,'Structured conservative media lane with high audience discipline and strong gatekeeping role.'],
  ['Tim Pool','independent media / civil-war narrative','Masks',80,'Independent-media node; recurring conflict-frame amplification and platform-native reach.'],
  ['Steven Crowder','conservative media outrage','Masks',76,'Comedy-politics outrage lane with monetized media and activist audience.'],
  ['Charlie Kirk','youth politics / activist machine','Crowns',78,'Institutionalized youth-politics opposition route and campaign mobilization node.'],
  ['Matt Walsh','culture-war moral gate','Crowns',74,'Culture-war moral narrative lane; high engagement on gender, family and institutional conflict.'],
  ['Glenn Beck','legacy conspiracy-right bridge','Masks',77,'Legacy broadcast-to-alt-media bridge; long-running warning-system style.'],
  ['Piers Morgan','mainstream debate gate','Masks',75,'Mainstream argument gate; hosts dissent while keeping debate inside broadcast constraints.'],
  ['Elon Musk','free-speech platform paradox','Coins',100,'Platform-owner/free-speech paradox; opposition energy and infrastructure ownership in one card.'],
  ['Kanye West / Ye','celebrity disruption / symbolic opposition','Masks',79,'Celebrity disruption node; narrative instability, cancellation cycles and symbolic conflict.'],
  ['RFK Jr.','vaccine/state-health opposition','Crowns',89,'Health-state opposition lane with legal, political and public-health controversy routes.'],
  ['Tulsi Gabbard','anti-war/state-security crossover','Crowns',81,'Anti-war positioning and state-security crossover create a high-signal opposition card.'],
  ['Vivek Ramaswamy','anti-woke corporate-politics crossover','Coins',78,'Corporate capital, anti-woke branding and political ambition converge.'],
  ['Nigel Farage','populist Brexit/media opposition','Crowns',82,'Populist opposition gate with long-term media-politics crossover.'],
  ['Marine Le Pen','nationalist opposition gate','Crowns',78,'European nationalist opposition lane; establishment pressure and electoral normalization.'],
  ['Geert Wilders','European populist opposition','Crowns',76,'Populist opposition route across immigration, security and electoral politics.'],
  ['Javier Milei','libertarian shock opposition','Coins',80,'Libertarian shock-politics lane; anti-state rhetoric inside state power.'],
  ['Steve Bannon','populist strategy / movement architect','Crowns',86,'Movement-architecture card; populist media, strategy and institutional conflict.'],
  ['Roger Stone','political dark-arts operator','Masks',77,'Political operator lane; scandal, strategy and spectacle overlap.'],
  ['Milo Yiannopoulos','provocation/media disruption','Masks',68,'Provocation node; cancellation, attention spikes and movement contamination risk.'],
  ['Nick Fuentes','extremist edge / movement contamination risk','Mirrors',70,'Extreme-edge card; useful for mapping contamination, deplatforming and boundary policing.'],
  ['Gavin McInnes','alt-right/media provocation','Masks',69,'Media provocation and movement formation route.'],
  ['Laura Loomer','outrage activism / censorship martyrdom','Masks',70,'Censorship-martyrdom and outrage activism lane.'],
  ['Mike Cernovich','Pizzagate-era online influence','Mirrors',67,'Online influence route from early conspiracy-social media cycles.'],
  ['Jack Posobiec','narrative warfare / online right','Masks',73,'Online-right narrative node; rapid framing, memes and political messaging.'],
  ['James O\'Keefe','undercover media opposition','Masks',75,'Undercover-media opposition lane; exposure model and legal controversy risk.'],
  ['Project Veritas network','opposition media machine','Masks',74,'Network card for undercover opposition-media mechanics; not a person card but included as a machine node.'],
  ['Naomi Wolf','liberal-to-alt-media dissent','Mirrors',72,'Liberal-to-alt-media dissent lane; COVID and civil-liberties crossover.'],
  ['Bret Weinstein','COVID/lab-leak/intellectual dissent','Mirrors',76,'Science dissent/intellectual opposition route.'],
  ['Heather Heying','science dissent network','Mirrors',68,'Science dissent network route and adjacent intellectual lane.'],
  ['Del Bigtree','vaccine opposition media','Mirrors',74,'Vaccine opposition media route with strong movement audience.'],
  ['Robert Malone','COVID-vaccine opposition','Mirrors',79,'Medical dissent lane; COVID vaccine narrative conflict.'],
  ['Peter McCullough','COVID-medical dissent','Mirrors',78,'Medical dissent and public-health opposition route.'],
  ['Sherri Tenpenny','vaccine-conspiracy lane','Mirrors',66,'Vaccine-conspiracy opposition card; strong evidence-boundary requirements.'],
  ['Kate Shemirani','anti-vax protest split lane','Mirrors',64,'Anti-vax protest and split-lane card.'],
  ['Mark Steele','5G / protest split lane','Mirrors',63,'5G protest opposition lane and movement-split card.'],
  ['Piers Corbyn','climate/COVID protest opposition','Mirrors',67,'Climate/COVID protest opposition lane.'],
  ['Max Blumenthal','anti-war / geopolitical dissent','Crowns',73,'Anti-war/geopolitical dissent route.'],
  ['Jimmy Dore','left anti-establishment media','Masks',72,'Left anti-establishment media lane.'],
  ['Glenn Greenwald','civil-liberties / anti-security-state media','Masks',76,'Civil-liberties and security-state opposition route.'],
  ['Matt Taibbi','censorship / establishment-media critic','Masks',74,'Censorship and media-criticism route.'],
  ['Julian Assange','disclosure / information-war symbol','Mirrors',90,'Disclosure and information-war symbol card.'],
  ['Edward Snowden','surveillance-state opposition symbol','Mirrors',88,'Surveillance-state opposition symbol card.'],
  ['Graham Hancock','ancient-history opposition / soft disclosure','Mirrors',70,'Ancient-history opposition and soft-disclosure lane.']
];

const boundary = 'This is a watchlist and narrative-analysis deck. Inclusion does not assert that anyone is proven controlled opposition, an intelligence asset, paid handler, or knowingly deceptive. It maps public opposition roles, platform incentives, gatekeeping accusations, audience capture, and update priority.';

function artPrompt(card) {
  return `Museum-quality Victorian engraved opposition playing card for ${card.name}; ${card.suit} suit; black lacquer, antique gold, deep crimson evidence marks, mirror/gatekeeper symbolism, dignified editorial portrait, not defamatory, no criminal implication, no intelligence-asset claim, Matrix Reprogrammed collector deck frame.`;
}

const deck = seed.map((x, i) => {
  const [name, lane, suit, score, why] = x;
  const id = slug(name.replace('/', ' '));
  return {
    id,
    rank: i + 1,
    cardTitle: `Card ${i + 1} of ${suit}`,
    name,
    suit,
    suitMeaning: suits[suit],
    lane,
    oppositionSignalScore: score,
    whyThisCard: why,
    scoring: {
      audienceReach: Math.min(100, score + (i < 10 ? 4 : 0)),
      platformAccess: suit === 'Coins' || suit === 'Masks' ? Math.min(100, score + 2) : Math.max(35, score - 8),
      movementSplitRisk: suit === 'Mirrors' ? Math.min(100, score + 8) : Math.max(40, score - 6),
      establishmentBridge: suit === 'Crowns' || suit === 'Masks' ? Math.min(100, score + 4) : Math.max(35, score - 10),
      monetizationRoute: suit === 'Coins' ? Math.min(100, score + 8) : Math.max(35, score - 5),
      narrativeContainment: Math.min(100, score + (['Masks','Mirrors'].includes(suit) ? 5 : 0)),
      controversyHeat: Math.min(100, score + (i < 30 ? 6 : 2)),
      evidenceBoundaryNeed: Math.min(100, 70 + Math.round(score / 4)),
      updatePriority: score >= 85 ? 95 : score >= 72 ? 78 : 62
    },
    riskLabels: ['gatekeeper accusation risk','audience capture risk','rage-cycle amplification risk','movement split risk','evidence-boundary risk'],
    evidenceBoundary: boundary,
    updatePriority: score >= 85 ? 'high' : score >= 72 ? 'medium' : 'watch',
    route: `controlled-opposition/${id}.html`,
    artAsset: `assets/controlled-opposition/cards/${id}.webp`,
    artStatus: ex(`assets/controlled-opposition/cards/${id}.webp`) ? 'asset-live' : 'prompt-ready',
    artPrompt: artPrompt({ name, suit })
  };
});

const data = { ok: true, updated, title: 'Controlled Opposition Deck', subtitle: '52-card public opposition media and gatekeeper watchlist', boundary, suits: Object.entries(suits).map(([name, meaning]) => ({ name, meaning })), method: ['Same structure as the Top 52 Persons of Interest deck.', 'Scores rank public opposition-role signals, not guilt or proof of control.', 'Each card can be updated when new public-record information becomes available.', 'Artwork slots use the same prompt-ready / asset-live pattern as the first deck.'], deck };
wr('data/controlled-opposition-deck.json', JSON.stringify(data, null, 2));
wr('downloads/controlled-opposition-deck.md', '# Controlled Opposition Deck\n\nGenerated: ' + updated + '\n\nBoundary: ' + boundary + '\n\n' + deck.map(c => '## ' + c.cardTitle + ' — ' + c.name + '\nScore: ' + c.oppositionSignalScore + '/100\nSuit: ' + c.suit + '\nLane: ' + c.lane + '\nRoute: ' + c.route + '\nBoundary: ' + c.evidenceBoundary).join('\n\n'));

function nav(prefix='') {
  return `<header class="wrap topbar"><a class="brand" href="${prefix}index.html"><img src="${prefix}sigil.png" alt="Matrix Reprogrammed sigil"/> MATRIX REPROGRAMMED</a><nav class="nav"><a href="${prefix}top-52-power-deck.html">Top 52</a><a href="${prefix}controlled-opposition-deck.html">Controlled Opposition</a><a href="${prefix}evidence-vault.html">Evidence Vault</a><a href="${prefix}search.html">Search</a></nav></header>`;
}
function shell(title, desc, body, prefix='') {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>${esc(title)} | Matrix Reprogrammed</title><meta name="description" content="${esc(desc)}"/><link rel="stylesheet" href="${prefix}styles.css"/><link rel="stylesheet" href="${prefix}reader-experience.css"/><style>.deck-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(255px,1fr));gap:1rem}.op-card{position:relative;min-height:520px;border:1px solid rgba(216,181,106,.28);border-radius:24px;padding:1rem;background:radial-gradient(circle at 50% 0,rgba(216,181,106,.16),transparent 36%),linear-gradient(160deg,rgba(24,0,0,.96),rgba(0,0,0,.95));box-shadow:0 0 55px rgba(150,0,0,.12),inset 0 0 0 2px rgba(255,255,255,.035)}.op-card:before{content:'';position:absolute;inset:.55rem;border:1px solid rgba(216,181,106,.22);border-radius:18px;pointer-events:none}.op-card .portrait{height:155px;border:1px solid rgba(216,181,106,.2);border-radius:18px;margin:1rem 0;display:grid;place-items:center;text-align:center;background:repeating-linear-gradient(90deg,rgba(255,255,255,.035) 0 1px,transparent 1px 8px),radial-gradient(circle,rgba(216,181,106,.12),rgba(0,0,0,.72))}.op-card .score{font-size:2.35rem;font-weight:900;color:#d8b56a}.bar{height:9px;border:1px solid rgba(216,181,106,.25);border-radius:99px;overflow:hidden}.bar span{display:block;height:100%;background:linear-gradient(90deg,#6b0000,#d8b56a)}.boundary-box{border:1px solid rgba(216,181,106,.35);border-radius:20px;padding:1rem;background:rgba(0,0,0,.45)}.mini{font-size:.83rem;color:#c8b98c}</style></head><body><canvas id="matrix"></canvas><div class="page">${nav(prefix)}${body}<footer class="footer wrap"><p><strong>Boundary:</strong> controlled opposition is treated as an allegation and narrative-analysis category, not a proven status.</p></footer></div><script src="${prefix}matrix.js"></script></body></html>`;
}
function cardHtml(c) {
  return `<article class="op-card ${esc(c.suit.toLowerCase())}"><div class="card-corner"><span>${esc(c.suit)}</span><strong>#${c.rank}</strong></div><div class="portrait"><div><strong>${esc(c.cardTitle)}</strong><br/><span class="mini">editorial art slot · ${esc(c.artStatus)}</span></div></div><h2>${esc(c.name)}</h2><p>${esc(c.lane)}</p><div class="score">${c.oppositionSignalScore}<small>/100</small></div><p class="mini">${esc(c.suitMeaning)}</p><a class="btn" href="${esc(c.route)}">Open Card</a></article>`;
}
const hub = `<main><section class="hero wrap"><div class="eyebrow">New Deck · Narrative Analysis</div><h1>CONTROLLED OPPOSITION DECK.</h1><p class="lead">A 52-card watchlist mapping public opposition figures, gatekeeper accusations, attention cycles, platform incentives, movement-split risk and update priority. Inclusion is not proof of control.</p><div class="cta-row"><a class="btn" href="data/controlled-opposition-deck.json">Deck Data</a><a class="btn alt" href="downloads/controlled-opposition-deck.md">Download Cards</a><a class="btn alt" href="top-52-power-deck.html">Back to Top 52</a></div></section><section class="section wrap split"><div class="terminal">CONTROLLED OPPOSITION SYSTEM\n&gt; Cards: ${deck.length}\n&gt; Evidence boundary: active\n&gt; Artwork slots: prompt-ready / asset-live\n&gt; Update model: refresh scores as new public info appears</div><aside class="boundary-box"><h2>Evidence rule</h2><p>${esc(boundary)}</p></aside></section><section class="section wrap"><h2>Deck Wall</h2><div class="deck-grid">${deck.map(cardHtml).join('')}</div></section></main>`;
wr('controlled-opposition-deck.html', shell('Controlled Opposition Deck', '52-card Matrix Reprogrammed watchlist for public opposition media, gatekeeper accusations, movement-split risk and update priority.', hub));

function profile(c) {
  const scores = Object.entries(c.scoring).map(([k,v]) => `<article class="card"><span class="label">${esc(k.replace(/([A-Z])/g,' $1'))}</span><h3>${v}/100</h3><div class="bar"><span style="width:${v}%"></span></div></article>`).join('');
  const body = `<main><section class="hero wrap"><div class="eyebrow">${esc(c.cardTitle)}</div><h1>${esc(c.name).toUpperCase()}</h1><p class="lead">${esc(c.lane)} · opposition signal ${c.oppositionSignalScore}/100 · ${esc(c.suit)}.</p><div class="cta-row"><a class="btn" href="../controlled-opposition-deck.html">Back to Deck</a><a class="btn alt" href="../data/controlled-opposition-deck.json">Deck Data</a><a class="btn alt" href="../evidence-vault.html">Evidence Vault</a></div></section><section class="section wrap"><div class="grid"><article class="card redline"><h2>Why this card exists</h2><p>${esc(c.whyThisCard)}</p></article><article class="card"><h2>Artwork slot</h2><p>${esc(c.artAsset)}</p><p><strong>Status:</strong> ${esc(c.artStatus)}</p></article><article class="card redline"><h2>Boundary</h2><p>${esc(c.evidenceBoundary)}</p></article></div></section><section class="section wrap"><h2>Controlled Opposition Signal Profile</h2><p class="lead">These are narrative-analysis scores, not guilt scores.</p><div class="grid">${scores}</div></section><section class="section wrap"><h2>Card Art Prompt</h2><div class="boundary-box">${esc(c.artPrompt)}</div></section></main>`;
  wr(c.route, shell(c.name + ' Controlled Opposition Card', c.lane + ' controlled opposition watchlist card with evidence boundary.', body, '../'));
}
deck.forEach(profile);

function patchFile(file, marker, insertion) {
  if (!ex(file)) return;
  let html = rd(file);
  if (html.includes(marker)) return;
  html = html.includes('</main>') ? html.replace('</main>', insertion + '</main>') : html + insertion;
  wr(file, html);
}
patchFile('top-52-power-deck.html', 'controlled-opposition-deck.html', `<section id="controlled-opposition-link" class="section wrap split"><div><div class="eyebrow">Second Deck</div><h2>Controlled Opposition Deck</h2><p class="lead">Open the companion 52-card watchlist for public opposition media, gatekeeper accusations, platform incentives and movement-split risk.</p><div class="cta-row"><a class="btn" href="controlled-opposition-deck.html">Open Controlled Opposition Deck</a></div></div><aside class="card redline"><h3>Boundary</h3><p>Inclusion is not proof of control, payment, intelligence handling or deception.</p></aside></section>`);
patchFile('index.html', 'controlled-opposition-deck.html', `<section id="controlled-opposition-home" class="section wrap"><div class="eyebrow">New Deck</div><h2>Controlled Opposition Deck</h2><p class="lead">A second 52-card intelligence deck mapping opposition media, gatekeeper accusations, movement-split risk, platform incentives and update priority.</p><div class="cta-row"><a class="btn" href="controlled-opposition-deck.html">Open Deck</a><a class="btn alt" href="top-52-power-deck.html">Top 52 Deck</a></div></section>`);

if (ex('search-index.json')) {
  let search = [];
  try { search = JSON.parse(rd('search-index.json')); } catch {}
  if (!search.some(x => x.url === 'controlled-opposition-deck.html')) search.push({ key:'controlled-opposition-deck', title:'Controlled Opposition Deck | Matrix Reprogrammed', subtitle:'52-card opposition media watchlist', series:'Power Decks', category:'Narrative Analysis', url:'controlled-opposition-deck.html', description:'Controlled opposition watchlist with evidence boundaries, signal scores, suits and update priorities.', keywords:['controlled opposition','gatekeeper','opposition media','watchlist','power deck'] });
  wr('search-index.json', JSON.stringify(search, null, 2));
}
if (ex('sitemap.xml')) {
  let xml = rd('sitemap.xml');
  if (!xml.includes('/controlled-opposition-deck.html')) xml = xml.replace('</urlset>', `  <url><loc>https://matrixreprogrammed.com/controlled-opposition-deck.html</loc><lastmod>${updated.slice(0,10)}</lastmod><changefreq>daily</changefreq><priority>0.91</priority></url>\n</urlset>`);
  wr('sitemap.xml', xml);
}
if (ex('llms.txt')) {
  let txt = rd('llms.txt');
  const line = '- /controlled-opposition-deck.html: 52-card controlled-opposition / gatekeeper watchlist with evidence boundaries.';
  if (!txt.includes(line)) wr('llms.txt', txt.trim() + '\n' + line + '\n');
}
console.log('Controlled Opposition Deck built: ' + deck.length + ' cards.');
