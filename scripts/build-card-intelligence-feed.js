const fs=require('fs');
const path=require('path');
const root=process.cwd();
const fp=p=>path.join(root,p);
const ex=p=>fs.existsSync(fp(p));
const rd=p=>fs.readFileSync(fp(p),'utf8');
const wr=(p,v)=>{fs.mkdirSync(path.dirname(fp(p)),{recursive:true});fs.writeFileSync(fp(p),v)};
const js=(p,f)=>{try{return ex(p)?JSON.parse(rd(p)):f}catch{return f}};
const slug=s=>String(s??'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')||'card';
const clamp=n=>Math.max(0,Math.min(100,Math.round(n)));
function scoreParts(raw,hasRoute){
  const base=Number(raw)||70;
  return {publicRole:clamp(base),networkReach:clamp(base-4+(hasRoute?5:0)),updatePriority:clamp(base-8+(base>88?8:0)),evidenceRoute:clamp((hasRoute?78:58)+(base>90?8:0)),narrativeSignal:clamp(base-2),legalProximity:clamp(hasRoute?42:30)};
}
function confidence(parts,hasRoute){const avg=(parts.publicRole+parts.networkReach+parts.evidenceRoute)/3;return avg>88&&hasRoute?'high':avg>74?'medium':'watch'}
function rationale(deckId,name,suit,lane,score,hasRoute){
  const boundary='This is a speculative routing rationale for research navigation, not a factual allegation, proof of intent, or claim of wrongdoing.';
  if(deckId==='institutions'){
    return `${name} is included because its public role intersects with ${lane}. In the deck logic, the ${suit} suit marks the main route a reader should investigate first. The speculative reason for watching this card is that institutions with this kind of public function can sit near policy, standards, finance, technology, health, security, data, or narrative systems that affect many downstream decisions. The score of ${score}/100 means high research relevance and update priority, not guilt or hidden control. ${hasRoute?'Because it has a database route, the dossier should point readers toward source pages and related records.':'Because the direct database route is limited, the dossier should invite source leads, corrections and public-record links.'} ${boundary}`;
  }
  if(deckId==='controlled-opposition'){
    return `${name} is included because the public-facing lane is ${lane}. The speculative reason is not that the person is proven controlled; it is that a high-visibility opposition figure, media lane, platform incentive, controversy pattern, audience-capture dynamic, or recurring gatekeeping accusation can shape what audiences see, trust, ignore, or fight over. The ${suit} suit identifies the first narrative route to examine. The score of ${score}/100 is an attention-and-update score, not a proof score. The dossier should track public statements, platform shifts, funding or business incentives when public, corrections, counter-evidence, and reader-submitted source leads. ${boundary}`;
  }
  return `${name} is included because this card appears to function as a high-relevance public-record route in the deck. The speculative reason is that the card may connect readers into overlapping lanes of governance, capital, security, media, technology, policy, narrative influence, missing records, or public controversy. The ${suit} suit is the first investigation lane, and the ${score}/100 score is a relevance and update-priority indicator, not an accusation score. ${boundary}`;
}
function proximityRules(name){return{status:'no verified public-record entry yet',entries:[],requirements:['public record or official source route','precise name, relationship type, date range and source route','separate findings, allegations, investigations, civil matters and unsupported claims','no rumor, private data, doxxing or guilt by association'],boundary:`No proximity entry should be listed for ${name} unless the relationship is documented by a public-record source route. Association does not prove shared guilt, intent, knowledge or wrongdoing.`,submissionPrompt:'Readers may submit public-record leads through the card forum. Leads must be reviewed before being added.'}}
function feedItems(name,score,hasRoute){return[
  {type:'monitor',weight:score,title:'Watch for public-record changes',summary:`Track new public records, official statements, corrections, court or policy documents, archived material and reliable reporting related to ${name}.`},
  {type:'route',weight:hasRoute?88:62,title:'Source route priority',summary:hasRoute?'This card already has a route into the site database or related evidence pages.':'This card needs stronger source routes, archive links or public-record leads from reader submissions.'},
  {type:'proximity',weight:50,title:'Public-record proximity lane',summary:'Only list proximity or relationship entries when supported by official records, public documents or reliable public documentation. Do not infer guilt by association.'},
  {type:'boundary',weight:100,title:'Evidence boundary',summary:'Keep claims separated from speculation. User submissions are leads until reviewed.'}
]}
function card(deckId,deckTitle,c,sourceFile){
  const id=slug(c[1]||c.name);
  const name=c[1]||c.name;
  const rank=c[0]||c.rank;
  const suit=c[2]||c.suit||'Route';
  const score=Number(c[3]||c.score||c.powerScore||70);
  const lane=c[4]||c.lane||c.role||'public relevance route';
  const route=c[5]||c.profileRoute||'';
  const hasRoute=Boolean(route);
  const parts=scoreParts(score,hasRoute);
  return {id,deckId,deckTitle,rank,name,suit,score,lane,route,sourceFile,scoreModel:{version:'1.2',scoreType:'relevance-and-update-priority',confidence:confidence(parts,hasRoute),dimensions:parts,explanation:'Scores rank research relevance, public role, source-route strength, proximity research priority and update priority. They do not measure guilt, intent, secret control or wrongdoing.'},speculativeRationale:rationale(deckId,name,suit,lane,score,hasRoute),legalProximity:proximityRules(name),feedItems:feedItems(name,score,hasRoute),updateTriggers:['new public-record source','reliable correction or counter-evidence','new database route','broken link report','reader-submitted source lead','major public statement or policy change','official record or reliable source involving a documented relationship']};
}
function loadArrayDeck(file,deckId,title){const d=js(file,{deck:[]});return(d.deck||[]).map(c=>card(deckId,title,c,file))}
let cards=[];
cards=cards.concat(loadArrayDeck('data/controlled-opposition-deck.json','controlled-opposition','Controlled Opposition Deck'));
cards=cards.concat(loadArrayDeck('data/institution-deck.json','institutions','Institution Deck'));
const byDeck=cards.reduce((a,c)=>{(a[c.deckId]||(a[c.deckId]=[])).push(c);return a},{});
const out={ok:true,title:'Card Intelligence Feed And Scoring Model',updated:new Date().toISOString(),boundary:'This feed provides research routing, scoring context, public-record proximity rules and speculative rationale. It is not an accusation system and does not assert guilt, intent, hidden control or unlawful conduct.',model:{scoreType:'research relevance and update priority',dimensions:['publicRole','networkReach','updatePriority','evidenceRoute','narrativeSignal','legalProximity'],confidence:['high','medium','watch'],rule:'Scores guide where readers and editors should look first. They do not prove claims.'},legalProximityRules:{name:'Public-record proximity lane',rule:'Only add proximity entries when supported by public-record source routes. Never use rumor or guilt by association.',acceptedSources:['public record','official document','public docket','official investigation report','regulator action','parliamentary or public inquiry record','high-reliability reporting with clear source attribution'],rejectedSources:['unsourced social media claim','rumor','private personal data','doxxing','guilt by association','anonymous allegation without documents']},totals:{cards:cards.length,decks:Object.keys(byDeck).length},cards,byDeck};
wr('data/card-intelligence-feed.json',JSON.stringify(out,null,2));
wr('downloads/card-intelligence-feed.md','# Card Intelligence Feed\n\nUpdated: '+out.updated+'\n\nBoundary: '+out.boundary+'\n\n## Public-Record Proximity Rule\nOnly add proximity entries when supported by public-record source routes. Association does not prove shared guilt, intent, knowledge or wrongdoing.\n\n'+cards.map(c=>`## ${c.deckTitle} #${c.rank}: ${c.name}\nScore: ${c.score}/100 · Confidence: ${c.scoreModel.confidence}\n\n${c.speculativeRationale}\n\nProximity lane: ${c.legalProximity.status}. ${c.legalProximity.boundary}\n`).join('\n'));
console.log(`Card intelligence feed built: ${cards.length} cards.`);
