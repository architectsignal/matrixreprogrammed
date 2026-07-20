const fs=require('fs');
const path=require('path');
const {loadRegistry,registryLookup,slug}=require('./card-art-resolver.js');
const root=process.cwd();
const fp=p=>path.join(root,p);
const ex=p=>fs.existsSync(fp(p));
const rd=p=>fs.readFileSync(fp(p),'utf8');
const wr=(p,v)=>{fs.mkdirSync(path.dirname(fp(p)),{recursive:true});fs.writeFileSync(fp(p),v)};
const js=(p,f)=>{try{return ex(p)?JSON.parse(rd(p)):f}catch{return f}};
const registry=loadRegistry();
function resolvedArt(deckId,id,fallback){const record=registryLookup(registry,deckId,id);return{asset:record?.asset||fallback,status:record?.status||'placeholder-svg',realArt:Boolean(record?.realArt),source:record?.source||fallback}}
function normalizeArrayDeck(file,deckId,title,assetBase,profileBase){const data=js(file,{deck:[]});return{id:deckId,title,source:file,cards:(data.deck||[]).map(c=>{const id=slug(c.name||c[1]);const art=resolvedArt(deckId,id,`${assetBase}/${id}.svg`);return{id,rank:c.rank||c[0],name:c.name||c[1],suit:c.suit||c[2],score:c.powerScore||c.score||c[3],lane:c.lane||c[4]||'',asset:art.asset,downloadAsset:art.asset,artStatus:art.status,realArt:art.realArt,artSource:art.source,profileRoute:`${profileBase}/${id}.html`,sourceRoute:c.route||c.profileRoute||'',evidenceBoundary:c.boundary||'Card artwork is a visual gateway. Evidence and current Intel live in the linked dossier.'}})}}
function normalizeObjectDeck(file,deckId,title,assetBase,profileBase){const data=js(file,{deck:[]});const arr=data.cards||data.deck||[];return{id:deckId,title:data.title||title,source:file,cards:arr.map(c=>{const id=slug(c.id||c.name);const art=resolvedArt(deckId,id,c.artAsset||c.asset||`${assetBase}/${id}.svg`);return{id,rank:c.rank,name:c.name,suit:c.suit,score:c.powerScore||c.score,lane:c.lane||c.role||'',asset:art.asset,downloadAsset:art.asset,artStatus:art.status,realArt:art.realArt,artSource:art.source,profileRoute:`${profileBase}/${id}.html`,sourceRoute:c.route||c.profileRoute||'',evidenceBoundary:c.boundary||data.boundary||'Card artwork is a visual gateway. Evidence and current Intel live in linked dossiers and source routes.'}})}}
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
const totalCards=decks.reduce((n,d)=>n+d.cards.length,0);
const realArtCount=decks.reduce((n,d)=>n+d.cards.filter(c=>c.realArt).length,0);
const placeholderCount=totalCards-realArtCount;
const manifest={ok:missing.length===0,title:'Matrix Reprogrammed Card Download Manifest',updated:new Date().toISOString(),boundary:'Card downloads are visual gateways. Existing real artwork is preferred; labelled placeholders remain only where no approved image has been matched. Evidence, current Intel and scoring live in linked dossiers and source routes.',cardContractVersion:'2.0',expectedCardsPerDeck:52,totalDecks:decks.length,totalCards,realArtCount,placeholderCount,missing,unmatchedStoredImages:registry.unmatchedRasterCandidates||[],artRegistry:'data/card-art-registry.json',artUploadInbox:'card-art-inbox/',downloadHub:'card-downloads.html',decks};
wr('data/card-download-manifest.json',JSON.stringify(manifest,null,2));
wr('downloads/card-download-manifest.md','# Card Download Manifest\n\nUpdated: '+manifest.updated+'\n\nDecks: '+manifest.totalDecks+'\n\nTotal cards: '+manifest.totalCards+'\n\nReal artwork: '+realArtCount+'\n\nPlaceholders awaiting approved art: '+placeholderCount+'\n\nMissing routes/assets: '+missing.length+'\n\nUnmatched stored images: '+manifest.unmatchedStoredImages.length+'\n\n'+decks.map(d=>'## '+d.title+'\n'+d.cards.map(c=>`- ${c.rank}. ${c.name} — ${c.asset} — ${c.artStatus} — ${c.profileRoute}${c.sourceRoute?' — source route: '+c.sourceRoute:''}`).join('\n')).join('\n\n'));
console.log(`Card download manifest built: ${manifest.totalDecks} decks / ${manifest.totalCards} cards, ${realArtCount} real images, ${placeholderCount} placeholders, ${missing.length} missing routes/assets.`);
