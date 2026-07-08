const fs=require('fs');
const path=require('path');
const root=process.cwd();
const fp=p=>path.join(root,p);
const ex=p=>fs.existsSync(fp(p));
const rd=p=>fs.readFileSync(fp(p),'utf8');
const wr=(p,v)=>{fs.mkdirSync(path.dirname(fp(p)),{recursive:true});fs.writeFileSync(fp(p),v)};
const js=(p,f)=>{try{return ex(p)?JSON.parse(rd(p)):f}catch(e){return {...f,_parseError:e.message}}};
const manifest=js('data/card-download-manifest.json',{decks:[]});
const feed=js('data/card-intelligence-feed.json',{cards:[],byDeck:{}});
const issues=[];
const expectedDecks=['people-of-interest','controlled-opposition','institutions','power-families','secret-societies','policy','think-tanks','black-nobility','jurisdictions-of-power'];
const manifestDeckIds=new Set((manifest.decks||[]).map(d=>d.id));
const feedDeckIds=new Set(Object.keys(feed.byDeck||{}));
for(const id of expectedDecks){if(!manifestDeckIds.has(id))issues.push({severity:'high',deck:id,note:'Missing from card download manifest'});if(!feedDeckIds.has(id))issues.push({severity:'high',deck:id,note:'Missing from card intelligence feed'});}
for(const deck of manifest.decks||[]){
  if((deck.cards||[]).length!==52)issues.push({severity:'high',deck:deck.id,note:`Expected 52 cards, found ${(deck.cards||[]).length}`});
  const seen=new Set();
  for(const card of deck.cards||[]){
    const key=`${deck.id}:${card.id}`;
    if(seen.has(card.id))issues.push({severity:'high',deck:deck.id,card:card.id,note:'Duplicate card id'});
    seen.add(card.id);
    if(!card.profileRoute||!ex(String(card.profileRoute).split('?')[0]))issues.push({severity:'high',deck:deck.id,card:card.id,note:`Missing dossier route ${card.profileRoute}`});
    else{
      const html=rd(String(card.profileRoute).split('?')[0]);
      const required=['Evidence Boundary','Source Rule','Update Triggers','card-intel-forum','dossier-intelligence-pack'];
      const missing=required.filter(x=>!html.includes(x));
      if(missing.length)issues.push({severity:'review',deck:deck.id,card:card.id,note:'Dossier missing markers: '+missing.join(', ')});
    }
    if(!card.asset||!ex(card.asset))issues.push({severity:'high',deck:deck.id,card:card.id,note:`Missing artwork asset ${card.asset}`});
    const feedCard=(feed.cards||[]).find(c=>c.deckId===deck.id&&c.id===card.id);
    if(!feedCard)issues.push({severity:'review',deck:deck.id,card:card.id,note:'Missing exact card in intelligence feed'});
  }
}
const summary={ok:issues.filter(i=>i.severity==='high').length===0,updated:new Date().toISOString(),expectedDecks:expectedDecks.length,manifestDecks:(manifest.decks||[]).length,manifestCards:(manifest.decks||[]).reduce((n,d)=>n+(d.cards||[]).length,0),feedDecks:Object.keys(feed.byDeck||{}).length,feedCards:(feed.cards||[]).length,highIssues:issues.filter(i=>i.severity==='high').length,reviewIssues:issues.filter(i=>i.severity==='review').length};
const report={title:'Card Deck System Audit',summary,issues};
wr('data/card-deck-system-audit.json',JSON.stringify(report,null,2));
wr('downloads/card-deck-system-audit.md','# Card Deck System Audit\n\nUpdated: '+summary.updated+'\n\nExpected decks: '+summary.expectedDecks+'\n\nManifest decks: '+summary.manifestDecks+'\n\nManifest cards: '+summary.manifestCards+'\n\nFeed decks: '+summary.feedDecks+'\n\nFeed cards: '+summary.feedCards+'\n\nHigh issues: '+summary.highIssues+'\n\nReview issues: '+summary.reviewIssues+'\n\n'+(issues.map(i=>`- ${i.severity}: ${i.deck}${i.card?'/'+i.card:''} — ${i.note}`).join('\n')||'No issues.'));
console.log(`Card deck system audit complete: ${summary.manifestDecks} decks / ${summary.manifestCards} cards, ${summary.highIssues} high issue(s).`);
if(process.env.STRICT_CARD_DECK_AUDIT==='1'&&summary.highIssues)process.exit(1);
