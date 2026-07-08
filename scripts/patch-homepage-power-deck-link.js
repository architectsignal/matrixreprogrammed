const fs=require('fs');
const path=require('path');
const root=process.cwd();
const fp=p=>path.join(root,p);
const ex=p=>fs.existsSync(fp(p));
const rd=p=>fs.readFileSync(fp(p),'utf8');
const wr=(p,v)=>fs.writeFileSync(fp(p),v);
if(!ex('index.html')) process.exit(0);
let html=rd('index.html');
html=html.replace(/<!-- power-deck-home-link:start -->[\s\S]*?<!-- power-deck-home-link:end -->/,'');
const card=(eyebrow,symbol,label,title,lead,boundary,buttons)=>`  <article class="card redline deck-entry-card" style="position:relative;overflow:hidden;background:radial-gradient(circle at 12% 20%,rgba(180,0,0,.28),transparent 26%),linear-gradient(135deg,rgba(18,0,0,.96),rgba(0,0,0,.94));">
    <div aria-hidden="true" style="position:absolute;right:1.2rem;top:1rem;width:120px;height:120px;border:1px solid rgba(216,181,106,.55);border-radius:50%;box-shadow:0 0 0 18px rgba(216,181,106,.05),0 0 0 38px rgba(180,0,0,.05);display:grid;place-items:center;font-size:3rem;color:#d8b56a;opacity:.7;">${symbol}</div>
    <div class="eyebrow">${eyebrow}</div>
    <span class="label">${label}</span>
    <h2>${title}</h2>
    <p class="lead">${lead}</p>
    <p><strong>Boundary:</strong> ${boundary}</p>
    <div class="cta-row small">${buttons.map(b=>`<a class="btn${b.alt?' alt':''}" href="${b.href}">${b.text}</a>`).join('')}</div>
  </article>`;
const block=`<!-- power-deck-home-link:start -->
<section id="power-deck-home-link" class="section wrap">
  <div class="eyebrow">Matrix Reprogrammed · Intelligence Decks</div>
  <h2>THE 52-CARD CONTROL MAPS.</h2>
  <p class="lead">Seven fixed decks route readers into public-record paths: people, opposition lanes, institutions, power families, public/private societies, policies and think tanks. Every deck uses the same source-ledger, dossier and evidence-boundary structure.</p>
  <div class="cta-row"><a class="btn" href="deck-expansion-hub.html">Open Deck Expansion Hub</a><a class="btn alt" href="card-downloads.html">Open Card Downloads</a><a class="btn alt" href="card-system-health.html">Card System Health</a><a class="btn alt" href="card-production-pipeline.html">Production Pipeline</a><a class="btn alt" href="data/deck-expansion-wave.json">Expansion Data</a></div>
  <div class="grid">
${card('Persons of Interest · Greatest Hits','◎','The Power Deck','PERSONS OF INTEREST','Top 52 Players: a 52-card map of public-record influence routes across governance, capital, security, narrative systems, missing records and convergence lanes.','this is an influence-route deck, not an accusation list. Each card opens a dossier with evidence boundaries and source routes.',[
  {href:'top-52-power-deck.html',text:'Open The Power Deck'},
  {href:'top-52-art-studio.html',text:'Open Art Studio',alt:true},
  {href:'data/top-52-power-deck.json',text:'Deck Data',alt:true}
])}
${card('Controlled Opposition · Narrative Gateways','◉','The Opposition Deck','CONTROLLED OPPOSITION','Top 52 Opposition Lanes: a 52-card map of media lanes, platform incentives, audience capture, movement-split risk, gatekeeping claims and narrative containment routes.','this is a watchlist and narrative-analysis deck, not proof that anyone is controlled, paid, handled, deceptive or unlawful. Each card keeps the evidence boundary visible.',[
  {href:'controlled-opposition-deck.html',text:'Open Opposition Deck'},
  {href:'card-downloads.html',text:'Download Cards',alt:true},
  {href:'data/controlled-opposition-deck.json',text:'Deck Data',alt:true}
])}
${card('Institution Deck · Control Infrastructure','⬡','The Institution Deck','INSTITUTIONS','Top 52 Institutions: a 52-card map of organizations relevant to digital identity, central banking, asset management, surveillance, biosecurity, standards, AI governance and narrative power.','this ranks institutional relevance to the site mission, not criminality, intent, secret control or unlawful conduct. Each card is a research route into public records and database pages.',[
  {href:'institution-deck.html',text:'Open Institution Deck'},
  {href:'institution-control-tracker.html',text:'Open Tracker',alt:true},
  {href:'data/institution-deck.json',text:'Deck Data',alt:true}
])}
${card('Deck Expansion · Families / Societies / Policies / Think Tanks','♔','The Expansion Wave','NEXT 208 CARDS','Four new 52-card decks: Power Families, Secret Societies, Policy, and Think Tanks. Each card opens a dossier with main public nodes, why-it-matters rationale, source routes, score, download and forum intake.','inclusion means research relevance to the public influence map, not proof of hidden control, collective intent, unlawful conduct or wrongdoing.',[
  {href:'deck-expansion-hub.html',text:'Open Expansion Hub'},
  {href:'power-families-deck.html',text:'Families',alt:true},
  {href:'secret-societies-deck.html',text:'Societies',alt:true},
  {href:'policy-deck.html',text:'Policies',alt:true},
  {href:'think-tanks-deck.html',text:'Think Tanks',alt:true}
])}
  </div>
</section>
<!-- power-deck-home-link:end -->`;
if(html.includes('<section id="homepage-critical-clocks"')) html=html.replace('<section id="homepage-critical-clocks"',block+'<section id="homepage-critical-clocks"');
else if(html.includes('<main id="main-archive">')) html=html.replace('<main id="main-archive">','<main id="main-archive">'+block);
else html+=block;
wr('index.html',html);
console.log('Homepage intelligence deck and expansion hub links patched.');
