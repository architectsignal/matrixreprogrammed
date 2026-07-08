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
function scoreParts(raw,hasRoute){const base=Number(raw)||70;return{publicRole:clamp(base),networkReach:clamp(base-4+(hasRoute?5:0)),updatePriority:clamp(base-8+(base>88?8:0)),evidenceRoute:clamp((hasRoute?78:58)+(base>90?8:0)),narrativeSignal:clamp(base-2),relationshipRoute:clamp(hasRoute?42:30)}}
function confidence(parts,hasRoute){const avg=(parts.publicRole+parts.networkReach+parts.evidenceRoute)/3;return avg>88&&hasRoute?'high':avg>74?'medium':'watch'}
function rationale(deckId,name,suit,lane,score,hasRoute){const boundary='This is a speculative routing rationale for research navigation, not a factual allegation, proof of intent, or claim of wrongdoing.';return `${name} is included because it is a high-relevance public-record route in the ${deckId} deck. The card points readers toward ${lane}. The ${suit} suit marks the first investigation lane, and the ${score}/100 score is a relevance and update-priority indicator, not an accusation score. ${hasRoute?'This card has a route into the site database or dossier layer.':'This card needs stronger source routes, archive links, corrections and public-record leads.'} ${boundary}`}
function sourceRules(name){return{status:'no reviewed public-source entry yet',entries:[],requirements:['public source route','clear relationship or record type','date range when available','what the source shows','what the source does not show'],boundary:`No relationship or source entry should be listed for ${name} unless it is documented by a public source route. A documented relationship does not prove shared intent, knowledge or wrongdoing.`,submissionPrompt:'Readers may submit public-source leads through the card forum. Leads must be reviewed before being added.'}}
function feedItems(name,score,hasRoute){return[
{type:'monitor',weight:score,title:'Watch for public-record changes',summary:`Track new public records, official statements, corrections, archived material and reliable reporting related to ${name}.`},
{type:'route',weight:hasRoute?88:62,title:'Source route priority',summary:hasRoute?'This card already has a route into the site database or related dossier pages.':'This card needs stronger source routes, archive links or reader-submitted public-source leads.'},
{type:'relationship',weight:50,title:'Documented relationship lane',summary:'Only list relationship entries when supported by public source routes. Do not infer guilt by association.'},
{type:'boundary',weight:100,title:'Evidence boundary',summary:'Keep claims separated from speculation. User submissions are leads until reviewed.'}
]}
function card(deckId,deckTitle,c,sourceFile){const id=slug(c[1]||c.id||c.name);const name=c[1]||c.name;const rank=c[0]||c.rank;const suit=c[2]||c.suit||'Route';const score=Number(c[3]||c.score||c.powerScore||70);const lane=c[4]||c.lane||c.role||'public relevance route';const route=c[5]||c.profileRoute||`${deckId}/${id}.html`;const hasRoute=Boolean(route);const parts=scoreParts(score,hasRoute);return{id,deckId,deckTitle,rank,name,suit,score,lane,route,sourceFile,scoreModel:{version:'1.5',scoreType:'relevance-and-update-priority',confidence:confidence(parts,hasRoute),dimensions:parts,explanation:'Scores rank research relevance, public role, source-route strength, relationship-route priority and update priority. They do not measure guilt, intent, secret control or wrongdoing.'},speculativeRationale:rationale(deckId,name,suit,lane,score,hasRoute),sourceRelationshipRules:sourceRules(name),feedItems:feedItems(name,score,hasRoute),updateTriggers:['new public-record source','reliable correction or counter-evidence','new database route','broken link report','reader-submitted source lead','major public statement or policy change','reviewed source involving a documented relationship']}}
function loadArrayDeck(file,deckId,title){const d=js(file,{deck:[]});return(d.deck||[]).map(c=>card(deckId,title,c,file))}
function loadObjectDeck(file,deckId,title){const d=js(file,{cards:[]});return(d.cards||d.deck||[]).map(c=>card(deckId,d.title||title,c,file))}
let cards=[];
cards=cards.concat(loadObjectDeck('data/top-52-power-deck.json','people-of-interest','People of Interest'));
cards=cards.concat(loadArrayDeck('data/controlled-opposition-deck.json','controlled-opposition','Controlled Opposition Deck'));
cards=cards.concat(loadArrayDeck('data/institution-deck.json','institutions','Institution Deck'));
cards=cards.concat(loadObjectDeck('data/power-families-deck.json','power-families','Power Families Deck'));
cards=cards.concat(loadObjectDeck('data/secret-societies-deck.json','secret-societies','Secret Societies Deck'));
cards=cards.concat(loadObjectDeck('data/policy-deck.json','policy','Policy Deck'));
cards=cards.concat(loadObjectDeck('data/think-tanks-deck.json','think-tanks','Think Tanks Deck'));
cards=cards.concat(loadObjectDeck('data/black-nobility-deck.json','black-nobility','Black Nobility & Allied Dynasties Deck'));
cards=cards.concat(loadObjectDeck('data/jurisdictions-of-power-deck.json','jurisdictions-of-power','Jurisdictions of Power Deck'));
const byDeck=cards.reduce((a,c)=>{(a[c.deckId]||(a[c.deckId]=[])).push(c);return a},{});
const out={ok:true,title:'Card Intelligence Feed And Scoring Model',updated:new Date().toISOString(),boundary:'This feed provides research routing, scoring context, relationship-source rules and speculative rationale. It is not an accusation system and does not assert guilt, intent, hidden control or unlawful conduct.',model:{scoreType:'research relevance and update priority',dimensions:['publicRole','networkReach','updatePriority','evidenceRoute','narrativeSignal','relationshipRoute'],confidence:['high','medium','watch'],rule:'Scores guide where readers and editors should look first. They do not prove claims.'},sourceRelationshipRules:{rule:'Only add relationship entries when supported by public source routes. Never use rumor or guilt by association.',acceptedSources:['official page','public record','public database','public filing','annual report','archive page','reliable report with clear source attribution'],rejectedSources:['unsourced social media claim','rumor','private personal data','doxxing','guilt by association','anonymous allegation without documents']},totals:{cards:cards.length,decks:Object.keys(byDeck).length},cards,byDeck};
wr('data/card-intelligence-feed.json',JSON.stringify(out,null,2));
wr('downloads/card-intelligence-feed.md','# Card Intelligence Feed\n\nUpdated: '+out.updated+'\n\nBoundary: '+out.boundary+'\n\n## Source Relationship Rule\nOnly add relationship entries when supported by public source routes. Association does not prove shared intent, knowledge or wrongdoing.\n\n'+cards.map(c=>`## ${c.deckTitle} #${c.rank}: ${c.name}\nScore: ${c.score}/100 · Confidence: ${c.scoreModel.confidence}\n\n${c.speculativeRationale}\n\nSource relationship lane: ${c.sourceRelationshipRules.status}. ${c.sourceRelationshipRules.boundary}\n`).join('\n'));
console.log(`Card intelligence feed built: ${Object.keys(byDeck).length} decks / ${cards.length} cards.`);
