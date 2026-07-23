(function(){
'use strict';
/* SEARCH V2 compatibility · SEARCH V3 evidence-aware runtime · investigationQueryPrefill */
const input=document.getElementById('archive-search');
const results=document.getElementById('search-results');
const count=document.getElementById('search-count');
const answer=document.getElementById('ask-answer');
const shortcuts=document.getElementById('ask-shortcuts');
const controls={
  grade:document.getElementById('search-grade'),
  type:document.getElementById('search-source-type'),
  status:document.getElementById('search-status'),
  jurisdiction:document.getElementById('search-jurisdiction'),
  entity:document.getElementById('search-entity-type'),
  from:document.getElementById('search-from'),
  to:document.getElementById('search-to'),
  sort:document.getElementById('search-sort'),
  clear:document.getElementById('search-clear'),
  active:document.getElementById('search-active-filters')
};
if(!input||!results)return;
const stop=new Set('the and for with what where when why how does into from that this show about latest update updates are all site page pages tell me'.split(' '));
const layerMap={
  'money-reserves':['gold','reserve','custody','vault','bank','money','payment','debt'],
  'identity-access':['identity','digital','access','wallet','login','agenda','2030'],
  'information-narrative':['brief','media','search','source','document','narrative'],
  'security-emergency':['security','emergency','surveillance','intelligence','cyber','war'],
  'elite-networks':['elite','company','foundation','institution','ownership','contract','procurement','bribery','fraud'],
  'disclosure-black-files':['epstein','disclosure','redaction','court','records','wikileaks','leak','declassified','foia','removed','restored','hash'],
  'government-enforcement':['conviction','enforcement','regulator','inspector','audit','indictment','sanction','corruption']
};
const fallbackIndex=[
  {title:'Intelligent Investigation Machine',url:'investigation-machine.html',category:'Investigation Machine',layer:'government-enforcement',description:'Search the daily and weekly public-record investigation system.',keywords:['investigation','government','enforcement'],priority:110,sourceType:'investigation-route',resultKind:'route'},
  {title:'Investigation Source Ledger',url:'investigation-source-ledger.html',category:'Source Ledger',layer:'disclosure-black-files',description:'Open the registered government, court, regulator and archive sources.',keywords:['source','ledger','government','court'],priority:107,sourceType:'source-registry',resultKind:'source-record',primarySource:true},
  {title:'Public Document Library',url:'document-library.html',category:'Document Extraction',layer:'disclosure-black-files',description:'Open hash-preserved and searchable public documents.',keywords:['document','pdf','ocr','hash'],priority:106,sourceType:'document-extraction',resultKind:'document'},
  {title:'Entity Registry',url:'entity-registry.html',category:'Structured Investigation Data',layer:'disclosure-black-files',description:'Open people, companies, agencies, contracts, cases and findings.',keywords:['entity','people','company','agency','contract'],priority:105,sourceType:'structured-entity-registry',resultKind:'entity'},
  {title:'Evidence Vault',url:'evidence-vault.html',category:'Evidence',layer:'disclosure-black-files',description:'Follow verified source routes and evidence boundaries.',keywords:['evidence','records','documents'],priority:92,sourceType:'route',resultKind:'route'}
];
function esc(value){return String(value==null?'':value).replace(/[&<>"']/g,function(char){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char];});}
function arr(value){if(Array.isArray(value))return value;if(value==null||value==='')return[];return [value];}
function words(query){return String(query||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').split(/\s+/).filter(function(word){return word.length>1&&!stop.has(word);});}
function compact(value){return String(value||'').replace(/\s+/g,' ').trim();}
function field(item,key){return compact(item&&item[key]);}
function listText(value){return arr(value).map(function(item){return typeof item==='object'?Object.values(item).join(' '):String(item);}).join(' ');}
function hay(item){return [item.title,item.category,item.layer,item.description,listText(item.keywords),listText(item.aliases),listText(item.identifiers),listText(item.exactTerms),item.sourceType,item.resultKind,item.sourceAuthority,item.evidenceGrade,item.factualStatus,item.statusClass,item.reviewStatus,item.jurisdiction,item.entityType,item.entity].join(' ').toLowerCase();}
function queryLayer(tokens){let best=null;Object.keys(layerMap).forEach(function(layer){const score=layerMap[layer].reduce(function(total,term){return total+(tokens.indexOf(term)>=0?1:0);},0);if(score&&(!best||score>best.score))best={layer:layer,score:score};});return best;}
function gradeBoost(value){return {A:30,B:20,C:7,D:-15}[String(value||'').toUpperCase()]||0;}
function statusBoost(value){return {established:26,enforcement:18,allegation:3,'source-change':7,'source-record':6,context:0,unverified:-18}[String(value||'').toLowerCase()]||0;}
function reviewBoost(value){const text=String(value||'').toLowerCase();if(text==='human-reviewed')return 14;if(text==='registry-defined'||text==='registry-linked')return 9;if(text.indexOf('unreviewed')>=0)return -4;return 0;}
function score(item,tokens,query){
  const title=field(item,'title').toLowerCase();
  const category=field(item,'category').toLowerCase();
  const description=field(item,'description').toLowerCase();
  const keywordText=listText(item.keywords).toLowerCase();
  const exactTerms=arr(item.exactTerms).concat(arr(item.aliases)).concat(arr(item.identifiers)).map(function(value){return compact(typeof value==='object'?Object.values(value).join(' '):value).toLowerCase();});
  const text=hay(item);
  const phrase=compact(query).toLowerCase();
  let value=Number(item.priority||0)/5;
  if(!tokens.length)return value+gradeBoost(item.evidenceGrade)+statusBoost(item.statusClass)+(item.primarySource?12:0);
  if(phrase){
    if(title===phrase)value+=180;else if(title.indexOf(phrase)===0)value+=100;else if(title.indexOf(phrase)>=0)value+=65;
    if(exactTerms.some(function(term){return term===phrase;}))value+=150;
    else if(exactTerms.some(function(term){return term.indexOf(phrase)>=0;}))value+=75;
    if(text.indexOf(phrase)>=0)value+=35;
  }
  let matched=0;
  tokens.forEach(function(token){
    let hit=false;
    if(title.indexOf(token)>=0){value+=30;hit=true;}
    if(exactTerms.some(function(term){return term.indexOf(token)>=0;})){value+=24;hit=true;}
    if(category.indexOf(token)>=0){value+=13;hit=true;}
    if(keywordText.indexOf(token)>=0){value+=16;hit=true;}
    if(description.indexOf(token)>=0){value+=7;hit=true;}
    if(field(item,'entity').toLowerCase().indexOf(token)>=0||field(item,'entityType').toLowerCase().indexOf(token)>=0){value+=18;hit=true;}
    if(field(item,'factualStatus').toLowerCase().indexOf(token)>=0||field(item,'statusClass').toLowerCase().indexOf(token)>=0){value+=16;hit=true;}
    if(field(item,'jurisdiction').toLowerCase().indexOf(token)>=0){value+=10;hit=true;}
    if(hit)matched++;
  });
  value+=(matched/Math.max(tokens.length,1))*48;
  if(item.primarySource)value+=tokens.some(function(token){return ['official','court','government','regulator','sec','doj','judgment','conviction','enforcement','audit'].indexOf(token)>=0;})?42:20;
  if(String(item.sourceAuthority||'').toLowerCase()==='primary-official')value+=16;
  value+=gradeBoost(item.evidenceGrade)+statusBoost(item.statusClass)+reviewBoost(item.reviewStatus);
  const adjudicatedIntent=tokens.some(function(token){return ['conviction','guilty','judgment','proven','established','order'].indexOf(token)>=0;});
  if(adjudicatedIntent&&item.statusClass==='established')value+=88;
  if(adjudicatedIntent&&['investigation-finding','court-record','document-extraction'].indexOf(String(item.sourceType||''))>=0)value+=36;
  if(adjudicatedIntent&&item.resultKind==='relationship'&&item.statusClass!=='established')value-=72;
  if(tokens.some(function(token){return ['charge','charged','complaint','allegation','indictment'].indexOf(token)>=0;})&&(item.statusClass==='allegation'||item.statusClass==='enforcement'))value+=28;
  const missingIntent=tokens.some(function(token){return ['missing','removed','redaction','redacted','restored','hash','withheld'].indexOf(token)>=0;});
  if(missingIntent&&item.statusClass==='source-change')value+=150;
  if(missingIntent&&item.sourceType==='source-change')value+=70;
  if(missingIntent&&item.resultKind==='relationship'&&item.statusClass!=='source-change')value-=28;
  const layer=queryLayer(tokens);if(layer&&String(item.layer||'')===layer.layer)value+=18;
  return value;
}
function isoTime(value){const date=new Date(value||0);return Number.isFinite(date.getTime())?date.getTime():0;}
function state(){return {
  q:input.value.trim(),grade:controls.grade?controls.grade.value:'',type:controls.type?controls.type.value:'',status:controls.status?controls.status.value:'',jurisdiction:controls.jurisdiction?controls.jurisdiction.value:'',entity:controls.entity?controls.entity.value:'',from:controls.from?controls.from.value:'',to:controls.to?controls.to.value:'',sort:controls.sort?controls.sort.value:'relevance'
};}
function filtered(item,current){
  if(current.grade&&String(item.evidenceGrade||'')!==current.grade)return false;
  if(current.type&&String(item.sourceType||'')!==current.type)return false;
  if(current.status&&String(item.statusClass||'')!==current.status)return false;
  if(current.jurisdiction&&String(item.jurisdiction||'')!==current.jurisdiction)return false;
  if(current.entity&&String(item.entityType||'')!==current.entity)return false;
  const time=isoTime(item.date||item.publicationDate||item.retrievalDate);
  if(current.from&&(!time||time<isoTime(current.from+'T00:00:00Z')))return false;
  if(current.to&&(!time||time>isoTime(current.to+'T23:59:59Z')))return false;
  return true;
}
function label(value){return compact(value).replace(/[-_]+/g,' ').replace(/\b\w/g,function(char){return char.toUpperCase();});}
function pill(value,kind){return value?'<span class="pill search-pill '+esc(kind||'')+'">'+esc(value)+'</span>':'';}
function card(item){
  const metadata=[item.evidenceGrade?'GRADE '+item.evidenceGrade:'',label(item.statusClass),label(item.sourceType),item.jurisdiction,item.entityType,item.date?String(item.date).slice(0,10):''].filter(Boolean).slice(0,6).map(function(value,index){return pill(value,index===0?'grade':'');}).join('');
  const source=item.sourceUrl&&/^https?:/i.test(item.sourceUrl)?'<a class="btn alt" href="'+esc(item.sourceUrl)+'" rel="noopener">Primary Source</a>':'';
  const boundary=item.evidenceGrade==='D'||String(item.reviewStatus||'').indexOf('unreviewed')>=0?'<p class="search-boundary"><strong>Boundary:</strong> Unverified or unreviewed material is not proof of wrongdoing.</p>':'';
  return '<article class="card redline search-result-card"><div class="search-result-meta">'+metadata+'</div><h3>'+esc(item.title)+'</h3><p>'+esc(item.description||'Open this record for the source and evidence boundary.')+'</p>'+boundary+'<div class="cta-row small"><a class="btn" href="'+esc(item.url)+'">Open Result</a>'+source+'<a class="btn alt" href="evidence-policy.html">Evidence Policy</a></div></article>';
}
function populate(select,items,fieldName){if(!select)return;const current=select.value;const counts=new Map();items.forEach(function(item){const value=field(item,fieldName);if(value)counts.set(value,(counts.get(value)||0)+1);});[...counts.entries()].sort(function(a,b){return b[1]-a[1]||a[0].localeCompare(b[0]);}).slice(0,200).forEach(function(pair){const option=document.createElement('option');option.value=pair[0];option.textContent=label(pair[0])+' ('+pair[1]+')';select.appendChild(option);});if([...select.options].some(function(option){return option.value===current;}))select.value=current;}
function applyParams(){const params=new URLSearchParams(location.search);if(params.get('q'))input.value=params.get('q');Object.keys(controls).forEach(function(key){const control=controls[key];if(!control||key==='clear'||key==='active')return;const value=params.get(key);if(value)control.value=value;});}
function updateUrl(current){const params=new URLSearchParams();Object.keys(current).forEach(function(key){const value=current[key];if(value&&!(key==='sort'&&value==='relevance'))params.set(key,value);});const next=location.pathname+(params.toString()?'?'+params.toString():'')+location.hash;history.replaceState(null,'',next);}
function render(index){
  const current=state();const tokens=words(current.q);
  let ranked=index.filter(function(item){return item&&item.url&&item.title&&filtered(item,current);}).map(function(item){return Object.assign({},item,{_score:score(item,tokens,current.q)});});
  if(current.q)ranked=ranked.filter(function(item){return item._score>Number(item.priority||0)/5+2;});
  if(current.sort==='newest')ranked.sort(function(a,b){return isoTime(b.date||b.publicationDate||b.retrievalDate)-isoTime(a.date||a.publicationDate||a.retrievalDate)||b._score-a._score;});
  else if(current.sort==='oldest')ranked.sort(function(a,b){return isoTime(a.date||a.publicationDate||a.retrievalDate)-isoTime(b.date||b.publicationDate||b.retrievalDate)||b._score-a._score;});
  else if(current.sort==='title')ranked.sort(function(a,b){return String(a.title).localeCompare(String(b.title));});
  else ranked.sort(function(a,b){return b._score-a._score||Number(b.primarySource)-Number(a.primarySource)||String(a.title).localeCompare(String(b.title));});
  const total=ranked.length;const shown=ranked.slice(0,current.q||Object.values(current).some(Boolean)?60:24);
  results.innerHTML=shown.length?shown.map(card).join(''):'<article class="card redline"><h3>No matching record</h3><p>Remove a filter or broaden the query. Verified source ledgers, documents and evidence routes remain available.</p></article>';
  if(count)count.textContent=(current.q?'Found ':'Showing ')+shown.length+(total>shown.length?' of '+total:'')+' result'+(total===1?'':'s');
  const active=Object.keys(current).filter(function(key){return current[key]&&!(key==='sort'&&current[key]==='relevance')&&key!=='q';}).map(function(key){return label(key)+': '+current[key];});
  if(controls.active)controls.active.textContent=active.length?'Active filters · '+active.join(' · '):'No filters active.';
  if(answer){const top=shown[0];answer.textContent=current.q&&top?['SEARCH V3 RESULT','> Query: '+current.q,'> Best result: '+top.title,'> Evidence: '+(top.evidenceGrade?'Grade '+top.evidenceGrade:'not graded')+' · '+label(top.statusClass||'context'),'> Source: '+(top.primarySource?'primary or official':'secondary, contextual or unreviewed'),'> Boundary: ranking organises records; it does not establish guilt.'].join('\n'):['SEARCH V3 STATUS','> Evidence-aware ranking: active','> Filters: grade, source, status, jurisdiction, entity and date','> Primary official records: boosted','> Allegations and unverified leads: clearly separated','> Failure fallback: active'].join('\n');}
  updateUrl(current);
}
function init(index){
  index=Array.isArray(index)?index.filter(function(item){return item&&typeof item==='object';}):[];
  populate(controls.grade,index,'evidenceGrade');populate(controls.type,index,'sourceType');populate(controls.status,index,'statusClass');populate(controls.jurisdiction,index,'jurisdiction');populate(controls.entity,index,'entityType');
  applyParams();
  let timer=null;function run(){clearTimeout(timer);timer=setTimeout(function(){render(index);},60);}
  input.addEventListener('input',run);
  Object.keys(controls).forEach(function(key){const control=controls[key];if(!control||key==='clear'||key==='active')return;control.addEventListener('change',run);});
  if(controls.clear)controls.clear.addEventListener('click',function(){input.value='';Object.keys(controls).forEach(function(key){const control=controls[key];if(control&&key!=='clear'&&key!=='active')control.value=key==='sort'?'relevance':'';});render(index);input.focus();});
  if(shortcuts)shortcuts.addEventListener('click',function(event){const button=event.target.closest('button[data-q]');if(!button)return;input.value=button.dataset.q||'';render(index);input.focus();});
  render(index);
}
function loadSearchIndex(){return fetch('/search-index.json',{cache:'no-store',headers:{Accept:'application/json'}}).then(async function(response){const type=String(response.headers.get('content-type')||'').toLowerCase();const text=await response.text();if(!response.ok)throw new Error('HTTP '+response.status);if(!type.includes('application/json')||/^\s*</.test(text))throw new Error('HTML returned instead of JSON');let parsed;try{parsed=JSON.parse(text);}catch(error){throw new Error('Invalid search JSON: '+error.message);}if(!Array.isArray(parsed))throw new Error('Search index is not an array');return parsed;});}
loadSearchIndex().then(init).catch(function(error){init(fallbackIndex);if(count)count.textContent='Search index unavailable — showing verified fallback routes';if(answer)answer.textContent=['SEARCH V3 FALLBACK','> Verified fallback routes active','> '+String(error.message||error).slice(0,120),'> Search remains usable while the main index recovers'].join('\n');});
})();
