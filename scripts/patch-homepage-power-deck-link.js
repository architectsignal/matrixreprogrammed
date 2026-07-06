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
const block=`<!-- power-deck-home-link:start -->
<section id="power-deck-home-link" class="section wrap">
  <div class="eyebrow">Persons of Interest · Greatest Hits</div>
  <div class="card redline" style="position:relative;overflow:hidden;background:radial-gradient(circle at 12% 20%,rgba(180,0,0,.28),transparent 26%),linear-gradient(135deg,rgba(18,0,0,.96),rgba(0,0,0,.94));">
    <div aria-hidden="true" style="position:absolute;right:1.2rem;top:1rem;width:120px;height:120px;border:1px solid rgba(216,181,106,.55);border-radius:50%;box-shadow:0 0 0 18px rgba(216,181,106,.05),0 0 0 38px rgba(180,0,0,.05);display:grid;place-items:center;font-size:3rem;color:#d8b56a;opacity:.7;">◎</div>
    <span class="label">The Power Deck</span>
    <h2>PERSONS OF INTEREST</h2>
    <p class="lead">Top 52 Players: a 52-card map of the strongest public-record influence routes across governance, capital, security, narrative systems, missing records and convergence lanes.</p>
    <p><strong>Boundary:</strong> this is an influence-route deck, not an accusation list. Each card opens a dossier with evidence boundaries and source routes.</p>
    <div class="cta-row small"><a class="btn" href="top-52-power-deck.html">Open The Power Deck</a><a class="btn alt" href="top-52-art-studio.html">Open Art Studio</a><a class="btn alt" href="data/top-52-power-deck.json">Deck Data</a></div>
  </div>
</section>
<!-- power-deck-home-link:end -->`;
if(html.includes('<section id="homepage-critical-clocks"')) html=html.replace('<section id="homepage-critical-clocks"',block+'<section id="homepage-critical-clocks"');
else if(html.includes('<main id="main-archive">')) html=html.replace('<main id="main-archive">','<main id="main-archive">'+block);
else html+=block;
wr('index.html',html);
console.log('Homepage Persons of Interest link patched.');
