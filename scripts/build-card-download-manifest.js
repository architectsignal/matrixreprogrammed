const fs=require('fs');
const path=require('path');
const root=process.cwd();
const fp=p=>path.join(root,p);
const ex=p=>fs.existsSync(fp(p));
const rd=p=>fs.readFileSync(fp(p),'utf8');
const wr=(p,v)=>{fs.mkdirSync(path.dirname(fp(p)),{recursive:true});fs.writeFileSync(fp(p),v)};
const js=(p,f)=>{try{return ex(p)?JSON.parse(rd(p)):f}catch{return f}};
const slug=s=>String(s??'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')||'card';
function normalizeArrayDeck(file,deckId,title,assetBase,profileBase){const data=js(file,{deck:[]});return{ id:deckId,title,source:file,cards:(data.deck||[]).map(c=>{const id=slug(c.name||c[1]);return{ id,rank:c.rank||c[0],name:c.name||c[1],suit:c.suit||c[2],score:c.powerScore||c.score||c[3],lane:c.lane||c[4]||'',asset:`${assetBase}/${id}.svg`,downloadAsset:`${assetBase}/${id}.svg`,profileRoute:`${profileBase}/${id}.html`,evidenceBoundary:c.boundary||'Card artwork is a visual gateway. Evidence and current Intel live in the linked profile.'}})}}
function normalizeObjectDeck(file,deckId,title,assetBase,profileBase){const data=js(file,{deck:[]});const arr=data.cards||data.deck||[];return{ id:deckId,title:data.title||title,source:file,cards:arr.map(c=>{const id=slug(c.id||c.name);return{ id,rank:c.rank,name:c.name,suit:c.suit,score:c.powerScore||c.score,lane:c.lane||'',asset:c.artAsset||c.asset||`${assetBase}/${id}.svg`,downloadAsset:c.downloadAsset||c.artAsset||c.asset||`${assetBase}/${id}.svg`,profileRoute:c.profileRoute||`${profileBase}/${id}.html`,evidenceBoundary:c.boundary||data.boundary||'Card artwork is a visual gateway. Evidence and current Intel live in the linked profile.'}})}}
const decks=[
 normalizeObjectDeck('data/top-52-power-deck.json','people-of-interest','People of Interest','assets/top-52/cards','top-52'),
 normalizeArrayDeck('data/controlled-opposition-deck.json','controlled-opposition','Controlled Opposition','assets/controlled-opposition/cards','controlled-opposition'),
 normalizeArrayDeck('data/institution-deck.json','institutions','Institution Deck','assets/institution/cards','institutions'),
 normalizeObjectDeck('data/power-families-deck.json','power-families','Power Families Deck','assets/power-families/cards','power-families'),
 normalizeObjectDeck('data/secret-societies-deck.json','secret-societies','Secret Societies Deck','assets/secret-societies/cards','secret-societies'),
 normalizeObjectDeck('data/policy-deck.json','policy','Policy Deck','assets/policy/cards','policy'),
 normalizeObjectDeck('data/think-tanks-deck.json','think-tanks','Think Tanks Deck','assets/think-tanks/cards','think-tanks'),
 normalizeObjectDeck('data/black-nobility-deck.json','black-nobility','Black Nobility & Allied Dynasties Deck','assets/black-nobility/cards','black-nobility'),
 normalizeObjectDeck('data/jurisdictions-of-power-deck.json','jurisdictions-of-power','Jurisdictions of Power Deck','assets/jurisdictions-of-power/cards','jurisdictions-of-power')
].filter(d=>d.cards.length);
const missing=[];
for(const deck of decks){for(const card of deck.cards){if(!ex(card.asset))missing.push({deck:deck.id,card:card.id,asset:card.asset,missing:'asset'});if(!ex(card.profileRoute))missing.push({deck:deck.id,card:card.id,profileRoute:card.profileRoute,missing:'profile'});}}
const manifest={ok:missing.length===0,title:'Matrix Reprogrammed Card Download Manifest',updated:new Date().toISOString(),boundary:'Card downloads are visual gateways. Evidence, current Intel and scoring live in linked profiles and source routes.',cardContractVersion:'1.4',expectedCardsPerDeck:52,totalDecks:decks.length,totalCards:decks.reduce((n,d)=>n+d.cards.length,0),missing,downloadHub:'card-downloads.html',decks};
wr('data/card-download-manifest.json',JSON.stringify(manifest,null,2));
wr('downloads/card-download-manifest.md','# Card Download Manifest\n\nUpdated: '+manifest.updated+'\n\nDecks: '+manifest.totalDecks+'\n\nTotal cards: '+manifest.totalCards+'\n\nMissing routes/assets: '+missing.length+'\n\n'+decks.map(d=>'## '+d.title+'\n'+d.cards.map(c=>`- ${c.rank}. ${c.name} — ${c.asset} — ${c.profileRoute}`).join('\n')).join('\n\n'));
console.log(`Card download manifest built: ${manifest.totalDecks} decks / ${manifest.totalCards} cards, ${missing.length} missing routes/assets.`);
