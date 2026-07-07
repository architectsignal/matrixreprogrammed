const fs = require('fs');
const path = require('path');
const root = process.cwd();
const fp = p => path.join(root, p);
const ex = p => fs.existsSync(fp(p));
const rd = p => fs.readFileSync(fp(p), 'utf8');
const wr = (p, v) => { fs.mkdirSync(path.dirname(fp(p)), { recursive: true }); fs.writeFileSync(fp(p), v); };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const slug = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'institution';
const updated = new Date().toISOString();

const suits = {
  Towers: 'formal institutions, governments, treaty bodies and governance hubs',
  Vaults: 'banks, asset managers, funds and monetary infrastructure',
  Temples: 'foundations, NGOs, interfaith systems, policy networks and civil society',
  Signals: 'media, platforms, universities, data systems and narrative infrastructure'
};

const seed = [
  ['BlackRock','Vaults',100,'asset management / ownership infrastructure','Asset-management giant used as a core ownership-route card.'],
  ['Vanguard','Vaults',99,'index funds / ownership infrastructure','Ownership infrastructure route across passive investing and institutional capital.'],
  ['State Street','Vaults',96,'custody / asset management','Major custody and asset-management route.'],
  ['Bank for International Settlements','Vaults',98,'central-bank coordination','Central-bank coordination card and monetary architecture route.'],
  ['International Monetary Fund','Vaults',95,'international finance / sovereign debt','Debt, surveillance, conditionality and crisis-finance route.'],
  ['World Bank','Vaults',93,'development finance','Development-finance and policy implementation route.'],
  ['Federal Reserve System','Vaults',97,'central banking / dollar system','Dollar-system and central-bank influence route.'],
  ['European Central Bank','Vaults',92,'euro monetary system','Euro-system monetary authority route.'],
  ['World Economic Forum','Temples',96,'public-private governance network','Public-private governance and convening route.'],
  ['United Nations','Towers',94,'global governance / treaty system','Global treaty, standards and agency network route.'],
  ['World Health Organization','Towers',91,'global health governance','Global health-policy and emergency-governance route.'],
  ['NATO','Towers',93,'security alliance','Security-alliance route across governments and defense systems.'],
  ['Council on Foreign Relations','Temples',88,'foreign-policy think tank','Foreign-policy elite network and policy-shaping route.'],
  ['Trilateral Commission','Temples',85,'policy network','Transnational policy-network card.'],
  ['Bilderberg Group','Temples',84,'private elite conference','Private elite-conference route; high secrecy-perception, evidence-boundary important.'],
  ['Chatham House','Temples',82,'foreign-policy institute','Foreign-policy institute and elite convening route.'],
  ['Brookings Institution','Temples',80,'policy think tank','Washington policy think-tank route.'],
  ['RAND Corporation','Temples',83,'defense and policy research','Defense-policy research and simulation route.'],
  ['Heritage Foundation','Temples',78,'conservative policy institute','Policy agenda, personnel and governance route.'],
  ['Open Society Foundations','Temples',82,'foundation / civil society','Philanthropy, NGOs and civil-society funding route.'],
  ['Bill & Melinda Gates Foundation','Temples',90,'global health / philanthropy','Health, agriculture, education and policy philanthropy route.'],
  ['Rockefeller Foundation','Temples',86,'philanthropy / development policy','Historic philanthropy and development-policy route.'],
  ['Ford Foundation','Temples',80,'philanthropy / civil society','Civil-society and grantmaking route.'],
  ['Carnegie Endowment for International Peace','Temples',76,'foreign-policy research','Foreign-policy research network route.'],
  ['Central Intelligence Agency','Towers',92,'intelligence service','Intelligence-state institution card.'],
  ['National Security Agency','Towers',90,'signals intelligence','Signals-intelligence and surveillance infrastructure route.'],
  ['MI6','Towers',86,'foreign intelligence','UK foreign-intelligence route.'],
  ['GCHQ','Towers',84,'signals intelligence','UK signals-intelligence route.'],
  ['Mossad','Towers',86,'foreign intelligence','Israeli foreign-intelligence route.'],
  ['FSB','Towers',84,'security service','Russian state-security route.'],
  ['Palantir','Signals',88,'data analytics / security software','Data-platform and security-infrastructure route.'],
  ['Google','Signals',94,'search, cloud, AI and narrative infrastructure','Search, cloud, AI and information-discovery route.'],
  ['Meta','Signals',90,'social platforms / attention infrastructure','Social-platform and attention-infrastructure route.'],
  ['X Corp','Signals',84,'social platform / public square','Platform-public-square and free-speech route.'],
  ['Microsoft','Signals',91,'cloud, AI and enterprise infrastructure','Cloud, AI and institutional software route.'],
  ['Amazon Web Services','Signals',89,'cloud infrastructure','Cloud backbone and state/private infrastructure route.'],
  ['NVIDIA','Signals',87,'AI compute / chips','AI compute bottleneck route.'],
  ['OpenAI','Signals',88,'frontier AI systems','Frontier AI model and governance route.'],
  ['Reuters','Signals',76,'news wire / information infrastructure','News-wire and information-distribution route.'],
  ['Associated Press','Signals',75,'news wire / information infrastructure','News-wire infrastructure route.'],
  ['BBC','Signals',78,'public broadcaster','Public broadcaster and narrative route.'],
  ['CNN','Signals',76,'news media','Global television news route.'],
  ['Fox News','Signals',77,'news media','Conservative media route.'],
  ['New York Times','Signals',79,'newspaper / agenda-setting media','Agenda-setting media route.'],
  ['World Trade Organization','Towers',80,'trade governance','Trade-rules and dispute-governance route.'],
  ['European Commission','Towers',89,'EU executive governance','EU regulatory and policy-executive route.'],
  ['World Economic Forum Young Global Leaders','Temples',83,'leadership network','Leadership pipeline and public-private network route.'],
  ['Council of the European Union','Towers',82,'EU member-state governance','EU state-governance coordination route.'],
  ['World Council of Churches','Temples',70,'interfaith / religious network','Interfaith and religious-network route.'],
  ['Vatican / Holy See','Temples',82,'religious diplomacy / sovereignty','Religious diplomacy and sovereign microstate route.'],
  ['Blackstone','Vaults',86,'private equity / alternative assets','Private-equity and real-assets route.'],
  ['JPMorgan Chase','Vaults',88,'banking / finance infrastructure','Banking infrastructure and market-power route.']
];

const boundary = 'Institution cards map public institutional power, funding routes, governance roles, network centrality and evidence priority. Inclusion is not an allegation of illegality, secret control, conspiracy, criminality or unified intent.';
function score(item) { const s = item[2]; return { capitalControl:s==='Vaults'?96:65, governanceReach:s==='Towers'?96:72, policyInfluence:s==='Temples'?94:72, dataNarrativePower:s==='Signals'?96:66, networkConnectivity:item[3].includes('global')?88:78, evidenceStrength:72, opacityRisk:['Temples','Vaults'].includes(s)?84:76, updatePriority:item[2]==='Vaults'||item[2]==='Signals'?90:82 }; }
function artPrompt(name,suit){return `Museum-quality Victorian engraved institution playing card for ${name}; ${suit} suit; black lacquer, antique gold, deep crimson evidence marks, architectural institutional sigil, no defamation, no criminal implication, no secret-control claim, Matrix Reprogrammed collector deck frame.`}
const deck = seed.map((x,i)=>({ id:slug(x[0]), rank:i+1, cardTitle:`Card ${i+1} of ${x[1]}`, name:x[0], suit:x[1], suitMeaning:suits[x[1]], lane:x[3], influenceScore:x[2], whyThisCard:x[4], scoring:score(x), evidenceBoundary:boundary, updatePriority:x[2]>=90?'high':x[2]>=80?'medium':'watch', route:`institutions/${slug(x[0])}.html`, artAsset:`assets/institutions/cards/${slug(x[0])}.webp`, artStatus:ex(`assets/institutions/cards/${slug(x[0])}.webp`)?'asset-live':'prompt-ready', artPrompt:artPrompt(x[0],x[1]) }));
const data = { ok:true, updated, title:'Institution Deck', subtitle:'52-card institutional power map', boundary, suits:Object.entries(suits).map(([name,meaning])=>({name,meaning})), method:['Same structure as the Top 52 Persons of Interest deck.','Scores rank public institutional influence routes, not guilt.','Each institution can be updated as new public information appears.','People cards and institution cards should cross-link into the relationship graph.'], deck };
wr('data/institution-deck.json', JSON.stringify(data,null,2));
wr('downloads/institution-deck.md', '# Institution Deck\n\nGenerated: '+updated+'\n\nBoundary: '+boundary+'\n\n'+deck.map(c=>'## '+c.cardTitle+' — '+c.name+'\nScore: '+c.influenceScore+'/100\nSuit: '+c.suit+'\nLane: '+c.lane+'\nRoute: '+c.route+'\nBoundary: '+c.evidenceBoundary).join('\n\n'));
function nav(prefix=''){return `<header class="wrap topbar"><a class="brand" href="${prefix}index.html"><img src="${prefix}sigil.png" alt="Matrix Reprogrammed sigil"/> MATRIX REPROGRAMMED</a><nav class="nav"><a href="${prefix}top-52-power-deck.html">People</a><a href="${prefix}institution-deck.html">Institutions</a><a href="${prefix}controlled-opposition-deck.html">Controlled Opposition</a><a href="${prefix}evidence-vault.html">Evidence Vault</a></nav></header>`}
function shell(title,desc,body,prefix=''){return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>${esc(title)} | Matrix Reprogrammed</title><meta name="description" content="${esc(desc)}"/><link rel="stylesheet" href="${prefix}styles.css"/><link rel="stylesheet" href="${prefix}reader-experience.css"/><style>.deck-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(255px,1fr));gap:1rem}.inst-card{position:relative;min-height:500px;border:1px solid rgba(216,181,106,.28);border-radius:24px;padding:1rem;background:radial-gradient(circle at 50% 0,rgba(216,181,106,.17),transparent 36%),linear-gradient(160deg,rgba(0,8,18,.96),rgba(0,0,0,.95));box-shadow:0 0 55px rgba(216,181,106,.10),inset 0 0 0 2px rgba(255,255,255,.035)}.inst-card:before{content:'';position:absolute;inset:.55rem;border:1px solid rgba(216,181,106,.22);border-radius:18px;pointer-events:none}.portrait{height:150px;border:1px solid rgba(216,181,106,.2);border-radius:18px;margin:1rem 0;display:grid;place-items:center;text-align:center;background:repeating-linear-gradient(90deg,rgba(255,255,255,.035) 0 1px,transparent 1px 8px),radial-gradient(circle,rgba(216,181,106,.12),rgba(0,0,0,.72))}.score{font-size:2.35rem;font-weight:900;color:#d8b56a}.mini{font-size:.83rem;color:#c8b98c}.bar{height:9px;border:1px solid rgba(216,181,106,.25);border-radius:99px;overflow:hidden}.bar span{display:block;height:100%;background:linear-gradient(90deg,#06304a,#d8b56a)}.boundary-box{border:1px solid rgba(216,181,106,.35);border-radius:20px;padding:1rem;background:rgba(0,0,0,.45)}</style></head><body><canvas id="matrix"></canvas><div class="page">${nav(prefix)}${body}<footer class="footer wrap"><p><strong>Boundary:</strong> institution cards map public routes and evidence priorities, not criminal accusations.</p></footer></div><script src="${prefix}matrix.js"></script></body></html>`}
function cardHtml(c){return `<article class="inst-card"><div class="card-corner"><span>${esc(c.suit)}</span><strong>#${c.rank}</strong></div><div class="portrait"><div><strong>${esc(c.cardTitle)}</strong><br/><span class="mini">institutional sigil slot · ${esc(c.artStatus)}</span></div></div><h2>${esc(c.name)}</h2><p>${esc(c.lane)}</p><div class="score">${c.influenceScore}<small>/100</small></div><p class="mini">${esc(c.suitMeaning)}</p><a class="btn" href="${esc(c.route)}">Open Institution</a></article>`}
const hub = `<main><section class="hero wrap"><div class="eyebrow">Deck III · Institutional Power Map</div><h1>INSTITUTION DECK.</h1><p class="lead">A 52-card institutional intelligence deck mapping banks, asset managers, treaty bodies, intelligence agencies, foundations, think tanks, platforms, media and governance hubs. Public routes only. No unsupported claims.</p><div class="cta-row"><a class="btn" href="data/institution-deck.json">Deck Data</a><a class="btn alt" href="downloads/institution-deck.md">Download Cards</a><a class="btn alt" href="top-52-power-deck.html">People Deck</a><a class="btn alt" href="controlled-opposition-deck.html">Controlled Opposition</a></div></section><section class="section wrap split"><div class="terminal">INSTITUTION DECK SYSTEM\n&gt; Cards: ${deck.length}\n&gt; Evidence boundary: active\n&gt; Artwork slots: prompt-ready / asset-live\n&gt; Update model: refresh scores as new public records appear</div><aside class="boundary-box"><h2>Evidence rule</h2><p>${esc(boundary)}</p></aside></section><section class="section wrap"><h2>Institution Wall</h2><div class="deck-grid">${deck.map(cardHtml).join('')}</div></section></main>`;
wr('institution-deck.html', shell('Institution Deck','52-card Matrix Reprogrammed institutional power map for public governance, finance, policy, media and platform routes.',hub));
for(const c of deck){const scores=Object.entries(c.scoring).map(([k,v])=>`<article class="card"><span class="label">${esc(k.replace(/([A-Z])/g,' $1'))}</span><h3>${v}/100</h3><div class="bar"><span style="width:${v}%"></span></div></article>`).join('');const body=`<main><section class="hero wrap"><div class="eyebrow">${esc(c.cardTitle)}</div><h1>${esc(c.name).toUpperCase()}</h1><p class="lead">${esc(c.lane)} · institutional influence ${c.influenceScore}/100 · ${esc(c.suit)}.</p><div class="cta-row"><a class="btn" href="../institution-deck.html">Back to Institution Deck</a><a class="btn alt" href="../top-52-power-deck.html">People Deck</a><a class="btn alt" href="../evidence-vault.html">Evidence Vault</a></div></section><section class="section wrap"><div class="grid"><article class="card redline"><h2>Why this institution appears</h2><p>${esc(c.whyThisCard)}</p></article><article class="card"><h2>Artwork slot</h2><p>${esc(c.artAsset)}</p><p><strong>Status:</strong> ${esc(c.artStatus)}</p></article><article class="card redline"><h2>Boundary</h2><p>${esc(c.evidenceBoundary)}</p></article></div></section><section class="section wrap"><h2>Institution Signal Profile</h2><p class="lead">These are public influence-route scores, not wrongdoing scores.</p><div class="grid">${scores}</div></section><section class="section wrap"><h2>Card Art Prompt</h2><div class="boundary-box">${esc(c.artPrompt)}</div></section></main>`;wr(c.route,shell(c.name+' Institution Card',c.lane+' institution intelligence card with evidence boundary.',body,'../'))}
function patchFile(file, marker, insertion){if(!ex(file))return;let html=rd(file);if(html.includes(marker))return;html=html.includes('</main>')?html.replace('</main>', insertion+'</main>'):html+insertion;wr(file,html)}
patchFile('top-52-power-deck.html','institution-deck.html',`<section id="institution-deck-link" class="section wrap split"><div><div class="eyebrow">Deck III</div><h2>Institution Deck</h2><p class="lead">Open the companion 52-card institution map for banks, agencies, think tanks, platforms, foundations, media and governance hubs.</p><div class="cta-row"><a class="btn" href="institution-deck.html">Open Institution Deck</a></div></div><aside class="card redline"><h3>Boundary</h3><p>Institution cards map public routes and influence signals, not criminal accusations.</p></aside></section>`);
patchFile('index.html','institution-deck.html',`<section id="institution-deck-home" class="section wrap"><div class="eyebrow">Deck III</div><h2>Institution Deck</h2><p class="lead">A 52-card institutional power map linking people, banks, agencies, foundations, platforms, media and governance bodies.</p><div class="cta-row"><a class="btn" href="institution-deck.html">Open Institution Deck</a><a class="btn alt" href="top-52-power-deck.html">People Deck</a></div></section>`);
if(ex('search-index.json')){let search=[];try{search=JSON.parse(rd('search-index.json'))}catch{};if(!search.some(x=>x.url==='institution-deck.html'))search.push({key:'institution-deck',title:'Institution Deck | Matrix Reprogrammed',subtitle:'52-card institutional power map',series:'Power Decks',category:'Institutions',url:'institution-deck.html',description:'Institutional deck with evidence boundaries, influence scores, suits and update priorities.',keywords:['institutions','power deck','BlackRock','WEF','BIS','IMF','World Bank','CIA','media']});wr('search-index.json',JSON.stringify(search,null,2))}
if(ex('sitemap.xml')){let xml=rd('sitemap.xml');if(!xml.includes('/institution-deck.html'))xml=xml.replace('</urlset>',`  <url><loc>https://matrixreprogrammed.com/institution-deck.html</loc><lastmod>${updated.slice(0,10)}</lastmod><changefreq>daily</changefreq><priority>0.92</priority></url>\n</urlset>`);wr('sitemap.xml',xml)}
if(ex('llms.txt')){let txt=rd('llms.txt');const line='- /institution-deck.html: 52-card institution deck mapping public institutional power routes with evidence boundaries.';if(!txt.includes(line))wr('llms.txt',txt.trim()+'\n'+line+'\n')}
console.log('Institution Deck built: '+deck.length+' cards.');
