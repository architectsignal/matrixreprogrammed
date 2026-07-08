const fs=require('fs');
const path=require('path');
const root=process.cwd();
const fp=p=>path.join(root,p);
const ex=p=>fs.existsSync(fp(p));
const rd=p=>fs.readFileSync(fp(p),'utf8');
const wr=(p,v)=>fs.writeFileSync(fp(p),v);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function js(p,f){try{return ex(p)?JSON.parse(rd(p)):f}catch{return f}}
const feed=js('data/card-intelligence-feed.json',{cards:[]});
function fileFor(c){if(c.deckId==='controlled-opposition')return `controlled-opposition/${c.id}.html`;if(c.deckId==='institutions')return `institutions/${c.id}.html`;return ''}
function section(c){const d=c.scoreModel?.dimensions||{};const items=c.feedItems||[];const triggers=c.updateTriggers||[];return `<section class="section" id="card-intelligence-feed-section"><h2>Why This Card Is In The Deck</h2><p>${esc(c.speculativeRationale)}</p><p class="mini"><strong>Boundary:</strong> This is a research-routing rationale. It does not assert guilt, intent, secret control, hidden funding, unlawful conduct or proven deception.</p><h2>Feed & Scoring System</h2><div class="score-grid"><article class="intel-box"><h3>Score Type</h3><p>${esc(c.scoreModel?.explanation||'Research relevance and update priority.')}</p><p class="mini">Confidence: ${esc(c.scoreModel?.confidence||'watch')}</p></article><article class="intel-box"><h3>Scoring Dimensions</h3><p>Public role: ${esc(d.publicRole)} / Network reach: ${esc(d.networkReach)} / Update priority: ${esc(d.updatePriority)} / Evidence route: ${esc(d.evidenceRoute)} / Narrative signal: ${esc(d.narrativeSignal)}</p></article><article class="intel-box"><h3>Latest Feed Slots</h3><ul>${items.map(i=>`<li><strong>${esc(i.title)}:</strong> ${esc(i.summary)}</li>`).join('')}</ul></article><article class="intel-box"><h3>Update Triggers</h3><ul>${triggers.map(t=>`<li>${esc(t)}</li>`).join('')}</ul></article></div><div class="route-list"><a class="btn alt" href="../data/card-intelligence-feed.json">Feed Data</a><a class="btn alt" href="../downloads/card-intelligence-feed.md">Readable Feed Export</a><a class="btn alt" href="../card-dossier-standard.html">Dossier Standard</a></div></section>`}
let touched=0;
for(const c of feed.cards||[]){const f=fileFor(c);if(!f||!ex(f))continue;let html=rd(f);if(html.includes('id="card-intelligence-feed-section"'))continue;const block=section(c);if(html.includes('<div id="card-intel-forum"></div>'))html=html.replace('<div id="card-intel-forum"></div>',block+'<div id="card-intel-forum"></div>');
else if(html.includes('</main>'))html=html.replace('</main>',block+'</main>');else html+=block;wr(f,html);touched++;}
console.log(`Card intelligence sections injected into ${touched} dossier page(s).`);
