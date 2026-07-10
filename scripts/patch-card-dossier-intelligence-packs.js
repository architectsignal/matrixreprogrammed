const fs=require('fs');
const path=require('path');
const root=process.cwd();
const fp=p=>path.join(root,p);
const ex=p=>fs.existsSync(fp(p));
const rd=p=>fs.readFileSync(fp(p),'utf8');
const wr=(p,v)=>{fs.mkdirSync(path.dirname(fp(p)),{recursive:true});fs.writeFileSync(fp(p),v)};
const js=(p,f)=>{try{return ex(p)?JSON.parse(rd(p)):f}catch{return f}};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const slug=s=>String(s||'').toLowerCase().replace(/&/g,' and ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')||'card';
const arr=value=>Array.isArray(value)?value:String(value||'').split(/[;,]/).map(x=>x.trim()).filter(Boolean);
const manifest=js('data/card-download-manifest.json',{decks:[]});
const feed=js('data/card-intelligence-feed.json',{cards:[]});
const feedMap=new Map((feed.cards||[]).map(c=>[`${c.deckId}:${c.id}`,c]));
const deckDataCache={};
function readDeckData(deck){if(deckDataCache[deck.id])return deckDataCache[deck.id];const file=deck.source||`data/${deck.id}-deck.json`;const data=js(file,{cards:[],deck:[]});const list=data.cards||data.deck||[];const map=new Map(list.map(c=>[slug(c.id||c.name||c[1]),c]));deckDataCache[deck.id]={data,map};return deckDataCache[deck.id];}
function val(obj,keys,fallback=''){for(const k of keys){if(obj&&obj[k]!==undefined&&obj[k]!==null&&obj[k]!=='')return obj[k];}return fallback;}
function list(items){const values=arr(items);return values.length?`<ul>${values.slice(0,12).map(x=>`<li>${esc(typeof x==='object'?JSON.stringify(x):x)}</li>`).join('')}</ul>`:'<p>Needs source-backed entries.</p>';}
const profiles={
'people-of-interest':{title:'Person Dossier Intelligence Pack',focus:['public offices and board roles','institutional routes','policy or capital lanes','public statements and official records','known corrections and counter-evidence'],records:['official biography','public filings','board or foundation pages','court/regulator records where applicable','reliable reporting with primary-source links']},
'controlled-opposition':{title:'Narrative Lane Intelligence Pack',focus:['platform incentives','audience-capture risk','public claims','funding/business routes when sourced','where the claim stops'],records:['official channels','public company/foundation pages','platform archives','interviews','corrections and counter-evidence']},
'institutions':{title:'Institutional Infrastructure Pack',focus:['mandate and governance','funding and membership','standards or policy output','implementation routes','regulatory or procurement hooks'],records:['official mandate','annual reports','membership lists','regulatory filings','policy papers and procurement records']},
'power-families':{title:'Power Family Intelligence Pack',focus:['wealth route','foundation or family-office route','public companies and trusts','philanthropy and universities','political or media proximity where documented'],records:['public filings','foundation pages','annual reports','credible wealth records','official biographies and archive records']},
'secret-societies':{title:'Society / Order Intelligence Pack',focus:['documented history','symbols and rituals in public sources','known public members where verified','institutional proximity','myth versus record'],records:['official websites','museum/archive material','academic histories','public registers','primary documents']},
'policy':{title:'Policy Implementation Pack',focus:['source text','sponsoring institution','legal status','implementation stage','affected jurisdictions and control-system lane'],records:['legislation','treaty text','regulator guidance','official consultation pages','implementation roadmaps']},
'think-tanks':{title:'Think Tank Influence Pack',focus:['funders where disclosed','fellows and board routes','reports that shape policy','government or corporate links','conference and media routes'],records:['annual reports','funding disclosures','board pages','reports','public-event pages']},
'black-nobility':{title:'Historical-Genealogical Pack',focus:['documented genealogy','titles and territories','church/court proximity','marriage alliances','archives and modern relevance'],records:['official family archive','heraldic/genealogical reference','museum or estate page','academic history','public foundation records']},
'jurisdictions-of-power':{title:'Jurisdictional Power Pack',focus:['legal status','tax/corporate/financial function','treaty and regulatory routes','registry or court role','connection to capital, diplomacy or standards'],records:['government pages','company registries','regulator publications','treaty records','court or sanctions records']}
};
function deepSummary(deckId,card,raw,feedCard){
  const p=profiles[deckId]||profiles.institutions;
  const name=card.name||val(raw,['name'],card.id);
  const lane=card.lane||val(raw,['lane','role','history'],'research lane');
  const history=val(raw,['history','subtitle','base'],lane);
  const score=Number(card.score||val(raw,['score','powerScore'],feedCard?.score||0))||0;
  const confidence=feedCard?.scoreModel?.confidence||'watch';
  const why=val(raw,['why'],feedCard?.speculativeRationale||`${name} is included as a source-route card inside ${deckId}.`);
  const sourceRoute=val(raw,['sourceRoute'],`Build this card from official pages, public records, archives, filings, regulator documents and reliable reporting about ${name}.`);
  const sourceStatus=feedCard?.sourceRelationshipRules?.status||'no reviewed public-source entry yet';
  const requirements=feedCard?.sourceRelationshipRules?.requirements||p.records;
  const triggers=feedCard?.updateTriggers||['new public-record source','reliable correction or counter-evidence','new implementation record'];
  return{p,name,lane,history,score,confidence,why,sourceRoute,sourceStatus,requirements,triggers};
}
function conclusionFor(deck,d){
  const strength=d.confidence==='high'?'strong priority':d.confidence==='medium'?'moderate priority':'watch priority';
  const conclusion=`${d.name} is currently a ${strength} research route in the ${deck.title}. The strongest defensible use of this dossier is to trace ${d.lane}, attach dated primary records and distinguish documented implementation from proximity, commentary or speculation.`;
  const why=`Its ${d.score||'unscored'} relevance score directs research attention toward ${d.lane}; it does not measure guilt, intent or hidden control.`;
  const boundary=`Current confidence is ${d.confidence}. Card inclusion and network proximity do not prove coordination, wrongdoing, shared knowledge or private intent.`;
  const missing=arr(d.requirements).slice(0,4);
  const next=arr(d.triggers).slice(0,4);
  const change=`Upgrade this assessment only when a dated primary record establishes a concrete role, transaction, policy output, legal action, governance link or implementation route. Downgrade it when corrections, counter-evidence or broken source chains weaken the route.`;
  return{conclusion,why,boundary,missing,next,change};
}
function pack(deck,card){
  const {map}=readDeckData(deck);
  const raw=map.get(card.id)||{};
  const feedCard=feedMap.get(`${deck.id}:${card.id}`)||{};
  const d=deepSummary(deck.id,card,raw,feedCard);
  const c=conclusionFor(deck,d);
  const extra=[];
  if(raw.keyFigures)extra.push(`<h3>Key Public Figures / Nodes</h3>${list(raw.keyFigures)}`);
  if(raw.alliances)extra.push(`<h3>Alliance / Relationship Routes</h3>${list(raw.alliances)}`);
  if(raw.functions)extra.push(`<h3>Core Functions</h3>${list(raw.functions)}`);
  if(raw.powerRoutes)extra.push(`<h3>Power Routes</h3>${list(raw.powerRoutes)}`);
  return `<!-- dossier-intelligence-pack:start --><section class="section" id="dossier-intelligence-pack"><h2>${esc(d.p.title)}</h2><p><strong>${esc(d.name)}</strong> sits in the <strong>${esc(deck.title)}</strong> as a research route, not an accusation. This dossier moves from visual card to records, evidence boundaries, missing documents and a current assessment.</p><section class="card redline" id="current-evidence-bounded-conclusion"><span class="label">Current Evidence-Bounded Conclusion</span><h3>${esc(d.name)}</h3><p><strong>Conclusion:</strong> ${esc(c.conclusion)}</p><p><strong>Why it matters:</strong> ${esc(c.why)}</p><p><strong>Evidence boundary:</strong> ${esc(c.boundary)}</p><p><strong>What would change the conclusion:</strong> ${esc(c.change)}</p><p><strong>Source status:</strong> ${esc(d.sourceStatus)}</p><div class="score-grid"><article class="intel-box"><h3>Missing Records</h3>${list(c.missing)}</article><article class="intel-box"><h3>Next Actions</h3>${list(c.next)}</article></div></section><p><strong>Working summary:</strong> ${esc(d.history)}</p><p><strong>Why this card is routed here:</strong> ${esc(d.why)}</p><div class="score-grid"><article class="intel-box"><h3>Score / Confidence</h3><p>${esc(d.score||'Unscored')} · confidence lane: ${esc(d.confidence)}. Scores are relevance and update-priority signals only.</p></article><article class="intel-box"><h3>Research Lane</h3><p>${esc(d.lane)}</p></article><article class="intel-box"><h3>Evidence Boundary</h3><p>No card inclusion proves secret control, guilt, wrongdoing, shared intent, deception, or unlawful conduct. Claims must stay inside what sources show.</p></article></div><h3>What To Track</h3>${list(d.p.focus)}<h3>Primary Records To Seek</h3>${list(d.p.records)}${extra.join('')}<h3>Source Route</h3><p>${esc(d.sourceRoute)}</p><h3>Missing-Record Questions</h3><ul><li>What primary document would confirm or limit the strongest claim on this card?</li><li>What source would connect this card to another deck without relying on guilt by association?</li><li>What correction or counter-source would downgrade the card score?</li><li>What dated public record shows a real implementation route rather than commentary?</li></ul><h3>Conclusion Standard</h3><p>Every finished conclusion must include: conclusion, why it matters, evidence boundary, confidence, missing record, what would change it, and next action.</p><div class="cta-row small"><a class="btn" href="../source-intake.html">Submit Source Lead</a><a class="btn alt" href="../card-intelligence-feed.html">Card Feed</a><a class="btn alt" href="../data/card-download-manifest.json">Manifest</a></div></section><!-- dossier-intelligence-pack:end -->`;
}
function replacePack(html,block){
  if(html.includes('<!-- dossier-intelligence-pack:start -->')&&html.includes('<!-- dossier-intelligence-pack:end -->')) return html.replace(/<!-- dossier-intelligence-pack:start -->[\s\S]*?<!-- dossier-intelligence-pack:end -->/,block);
  if(html.includes('id="dossier-intelligence-pack"')){
    const start=html.indexOf('<section class="section" id="dossier-intelligence-pack">');
    const anchors=['<section class="section" id="dossier-depth-core">','<div id="card-intel-forum"></div>','</main>'];
    const endCandidates=anchors.map(a=>html.indexOf(a,start+1)).filter(i=>i>start);
    if(endCandidates.length){const end=Math.min(...endCandidates);return html.slice(0,start)+block+html.slice(end);}
  }
  if(html.includes('id="dossier-depth-core"'))return html.replace('<section class="section" id="dossier-depth-core">',block+'<section class="section" id="dossier-depth-core">');
  if(html.includes('<div id="card-intel-forum"></div>'))return html.replace('<div id="card-intel-forum"></div>',block+'<div id="card-intel-forum"></div>');
  return html.includes('</main>')?html.replace('</main>',block+'</main>'):html+block;
}
let checked=0,patched=0,conclusions=0,missing=[];
for(const deck of manifest.decks||[]){
  for(const card of deck.cards||[]){
    checked++;
    const route=String(card.profileRoute||'').split('?')[0];
    if(!route||!ex(route)){missing.push({deck:deck.id,card:card.id,route});continue;}
    let html=rd(route);
    const before=html;
    html=replacePack(html,pack(deck,card));
    if(html!==before)patched++;
    if(html.includes('id="current-evidence-bounded-conclusion"'))conclusions++;
    wr(route,html);
  }
}
const report={ok:missing.length===0&&conclusions===checked,updated:new Date().toISOString(),checkedCards:checked,patchedOrRefreshed:patched,conclusionsInstalled:conclusions,missing};
wr('data/card-dossier-intelligence-pack-audit.json',JSON.stringify(report,null,2));
wr('downloads/card-dossier-intelligence-pack-audit.md','# Card Dossier Intelligence Pack Audit\n\nUpdated: '+report.updated+'\n\nResult: '+(report.ok?'PASS':'FAIL')+'\n\nChecked cards: '+checked+'\n\nPatched/refreshed: '+patched+'\n\nConclusions installed: '+conclusions+'\n\nMissing dossiers: '+missing.length+'\n\n'+(missing.map(m=>`- ${m.deck}/${m.card} — ${m.route}`).join('\n')||'No missing dossier pages.'));
if(!report.ok){console.error(`CARD DOSSIER CONCLUSION FEED FAILED: ${checked} checked, ${conclusions} conclusions, ${missing.length} missing.`);process.exit(1);}
console.log(`Card dossier intelligence packs complete: ${checked} checked, ${patched} patched, ${conclusions} evidence-bounded conclusions, ${missing.length} missing.`);
