const fs=require('fs');
const path=require('path');
const root=process.cwd();
const fp=p=>path.join(root,p);
const ex=p=>fs.existsSync(fp(p));
const rd=p=>fs.readFileSync(fp(p),'utf8');
const wr=(p,v)=>{fs.mkdirSync(path.dirname(fp(p)),{recursive:true});fs.writeFileSync(fp(p),v)};
const js=(p,f)=>{try{return ex(p)?JSON.parse(rd(p)):f}catch{return f}};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const data=js('data/top-52-power-deck.json',{deck:[],suits:[]});
const deck=Array.isArray(data.deck)?data.deck:[];
const updated=new Date().toISOString();
function initials(name){return String(name||'MR').split(/\s+/).filter(Boolean).slice(0,3).map(x=>x[0]).join('').toUpperCase()||'MR'}
function sigil(c){const map={Crowns:'♛',Coins:'♦',Swords:'♠',Masks:'♣'};return map[c.suit]||c.icon||'◆'}
const manifest={ok:true,updated,title:'Top 52 Phase 3 Visual Deck',boundary:'Portrait slots are editorial-symbolic placeholders. They are not allegations, mugshots or proof of wrongdoing. Any future likeness art should be sourced and labelled as editorial illustration.',cards:deck.map(c=>({id:c.id,name:c.name,cardTitle:c.cardTitle,suit:c.suit,rank:c.rank,score:c.powerScore,initials:initials(c.name),sigil:sigil(c),shareTitle:`${c.cardTitle}: ${c.name}`,shareLine:`${c.powerScore}/100 public-record influence route · ${c.suit}`,portraitMode:'editorial-symbolic-placeholder',portraitPrompt:`Victorian engraved editorial playing-card portrait frame for ${c.name}, symbolic newspaper-caricature style, dignified public-record influence card, not defamatory, no criminal implication, ${c.suit} suit, red black gold occult dossier border, Matrix Reprogrammed style`,printFile:`top-52/share/${c.id}.html`}))};
wr('data/top-52-card-art-manifest.json',JSON.stringify(manifest,null,2));
wr('downloads/top-52-card-art-manifest.md','# Top 52 Card Art Manifest\n\nGenerated: '+updated+'\n\nBoundary: '+manifest.boundary+'\n\n'+manifest.cards.map(c=>'## '+c.shareTitle+'\n'+c.shareLine+'\nPrompt: '+c.portraitPrompt).join('\n\n'));
const css=`
:root{--deck-gold:#d8b56a;--deck-red:#8b0000;--deck-ink:#050505;--deck-cream:#f4ead2}.top52-phase3-banner{border:1px solid rgba(216,181,106,.35);border-radius:26px;padding:1.25rem;margin:1rem auto;background:radial-gradient(circle at 15% 0,rgba(216,181,106,.18),transparent 35%),linear-gradient(135deg,rgba(10,0,0,.92),rgba(0,0,0,.94));box-shadow:0 0 70px rgba(216,181,106,.08),inset 0 0 100px rgba(255,255,255,.02)}.top52-phase3-banner h2{margin:.25rem 0;font-size:clamp(1.7rem,4vw,3.5rem)}.top52-filters{display:flex;gap:.5rem;flex-wrap:wrap;margin:1rem 0}.top52-filters a{border:1px solid rgba(216,181,106,.35);border-radius:999px;padding:.45rem .75rem;color:#fff;text-decoration:none;background:rgba(255,255,255,.04)}.suit-anchor{display:block;position:relative;top:-120px;visibility:hidden}.power-card{overflow:hidden;isolation:isolate;transition:transform .18s ease,box-shadow .18s ease}.power-card:hover{transform:translateY(-7px) rotate(-.35deg);box-shadow:0 16px 80px rgba(216,181,106,.18),0 0 70px rgba(150,0,0,.18)}.power-card .portrait{position:relative;overflow:hidden}.power-card .portrait:before{content:'';position:absolute;inset:0;background:repeating-linear-gradient(90deg,rgba(255,255,255,.04) 0 1px,transparent 1px 7px),radial-gradient(circle at 50% 35%,rgba(216,181,106,.22),transparent 42%)}.power-card .portrait span{position:relative;z-index:2;text-shadow:0 0 25px rgba(216,181,106,.35)}.power-card .portrait em{position:relative;z-index:2;display:block;letter-spacing:.12em;text-transform:uppercase}.power-card.crowns{background:radial-gradient(circle at 50% 0,rgba(216,181,106,.24),transparent 38%),linear-gradient(160deg,rgba(20,4,0,.98),rgba(0,0,0,.94))}.power-card.coins{background:radial-gradient(circle at 50% 0,rgba(180,130,20,.25),transparent 38%),linear-gradient(160deg,rgba(12,8,0,.98),rgba(0,0,0,.94))}.power-card.swords{background:radial-gradient(circle at 50% 0,rgba(180,180,210,.16),transparent 38%),linear-gradient(160deg,rgba(0,8,14,.98),rgba(0,0,0,.94))}.power-card.masks{background:radial-gradient(circle at 50% 0,rgba(120,0,160,.18),transparent 38%),linear-gradient(160deg,rgba(12,0,18,.98),rgba(0,0,0,.94))}.power-card .score{color:var(--deck-gold);text-shadow:0 0 22px rgba(216,181,106,.22)}.card-art-note{font-size:.78rem;color:#c8b98c;border-top:1px solid rgba(216,181,106,.18);padding-top:.5rem;margin-top:.5rem}.top52-print-link{display:inline-block;margin-top:.5rem;color:#fff;border-bottom:1px solid rgba(216,181,106,.5)}@media print{body{background:#000}.reader-governor-strip,.topbar,.footer,.cta-row,.top52-filters{display:none!important}.power-card{break-inside:avoid;page-break-inside:avoid;box-shadow:none}}
`;
wr('top-52-phase3.css',css);
function patchPage(file,prefix=''){
 if(!ex(file))return false;
 let html=rd(file);
 if(!html.includes('top-52-phase3.css')) html=html.replace('</head>',`<link rel="stylesheet" href="${prefix}top-52-phase3.css" /></head>`);
 return wr(file,html),true;
}
patchPage('top-52-power-deck.html','');
for(const c of deck){patchPage(`top-52/${c.id}.html`,'../')}
if(ex('top-52-power-deck.html')){
 let html=rd('top-52-power-deck.html');
 html=html.replace(/<section id="top52-phase3-visual-system"[\s\S]*?<\/section>/,'');
 const anchors='<span id="Crowns" class="suit-anchor"></span><span id="Coins" class="suit-anchor"></span><span id="Swords" class="suit-anchor"></span><span id="Masks" class="suit-anchor"></span>';
 const banner=`<section id="top52-phase3-visual-system" class="top52-phase3-banner wrap"><div class="eyebrow">Phase 3 Visual System</div><h2>Esoteric Playing-Card Interface</h2><p class="lead">The deck now has suit filters, symbolic portrait slots, share-card art metadata, print-ready styling and a future portrait manifest. The portrait slots are editorial illustrations, not accusations.</p><div class="top52-filters"><a href="#top52-phase3-visual-system">All Cards</a><a href="#Crowns">♛ Crowns</a><a href="#Coins">♦ Coins</a><a href="#Swords">♠ Swords</a><a href="#Masks">♣ Masks</a><a href="data/top-52-card-art-manifest.json">Art Manifest</a><a href="downloads/top-52-card-art-manifest.md">Download Art Notes</a></div>${anchors}</section>`;
 html=html.includes('<section class="section wrap"><h2>Card Wall</h2>')?html.replace('<section class="section wrap"><h2>Card Wall</h2>',banner+'<section class="section wrap"><h2>Card Wall</h2>'):html.replace('</main>',banner+'</main>');
 for(const c of deck){const needle=`<a class="btn" href="top-52/${esc(c.id)}.html">Open Dossier</a></article>`;const replace=`<a class="btn" href="top-52/${esc(c.id)}.html">Open Dossier</a><p class="card-art-note">${esc(manifest.cards.find(x=>x.id===c.id)?.initials||'MR')} · ${esc(c.suit)} editorial card slot</p></article>`;html=html.replace(needle,replace)}
 wr('top-52-power-deck.html',html);
}
for(const c of deck){
 const file=`top-52/${c.id}.html`;if(!ex(file))continue;
 let html=rd(file);
 const art=manifest.cards.find(x=>x.id===c.id);
 html=html.replace(/<section id="phase3-card-art"[\s\S]*?<\/section>/,'');
 const block=`<section id="phase3-card-art" class="section wrap"><div class="top52-phase3-banner"><div class="eyebrow">Phase 3 Card Art</div><h2>${esc(art.cardTitle)}</h2><p class="lead">Portrait slot: ${esc(art.portraitMode)}. Initials: ${esc(art.initials)}. Suit: ${esc(art.suit)}.</p><p class="card-art-note">Future illustration prompt stored in the art manifest. Any likeness should remain editorial and public-record based.</p><a class="btn" href="../data/top-52-card-art-manifest.json">Open Art Manifest</a></div></section>`;
 html=html.includes('</main>')?html.replace('</main>',block+'</main>'):html+block;
 wr(file,html);
}
console.log('Top 52 Phase 3 visuals built: '+deck.length+' cards.');
