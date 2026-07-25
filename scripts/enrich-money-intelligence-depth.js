const fs=require('fs');
const path=require('path');
const root=process.cwd(),now=new Date().toISOString(),today=now.slice(0,10);
const file=p=>path.join(root,p);
const read=(p,fallback=null)=>{try{return JSON.parse(fs.readFileSync(file(p),'utf8'))}catch{return fallback}};
const write=(p,v)=>{const target=file(p);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,`${JSON.stringify(v,null,2)}\n`)};
const array=v=>Array.isArray(v)?v:[],unique=v=>[...new Set(array(v).filter(Boolean))];
const normalise=v=>String(v||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,' and ').replace(/\b(the|plc|incorporated|inc|corp|corporation|company|co|limited|ltd|llc|lp|sa|se|ag|nv)\b/g,' ').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
const slug=v=>normalise(v).replace(/\s+/g,'-').slice(0,100);
const grade=g=>({A:5,B:4,C:3,D:1}[String(g||'').toUpperCase()]||0);
const placeholder=v=>!String(v||'').trim()||/research index rank|not uniformly disclosed|measure pending|research lead|verify/i.test(String(v));
const quantitative=v=>!placeholder(v)&&/\d/.test(String(v));
const financialEvidence=r=>/verified market data|official procurement|institutional disclosure|public filing|regulator|audited|annual report/i.test(`${r.evidenceClass||''} ${r.status||''} ${r.sourceTitle||''}`);
const registry=read('data/money-intelligence-registry.json');
if(!registry||!Array.isArray(registry.records)||!Array.isArray(registry.categories))throw new Error('Money intelligence registry is missing or invalid.');
const entities=read('data/entity-registry.json',{entities:[]}),relations=read('data/relationship-registry.json',{relationships:[]});
const byName=new Map(),byId=new Map();
function bestEvidence(entity){return array(entity?.evidenceRefs).slice().sort((a,b)=>grade(b.evidenceGrade)-grade(a.evidenceGrade)||String(b.retrievalDate||'').localeCompare(String(a.retrievalDate||'')))[0]||null}
for(const entity of array(entities.entities)){
  byId.set(entity.id,entity);byId.set(String(entity.id||'').replace(/^entity-/,''),entity);
  for(const label of [entity.name,...array(entity.aliases)]){
    const key=normalise(label);if(!key)continue;const current=byName.get(key);
    if(!current||grade(bestEvidence(entity)?.evidenceGrade)>grade(bestEvidence(current)?.evidenceGrade))byName.set(key,entity);
  }
}
const categories=new Map(registry.categories.map(c=>[c.id,c]));
const moneyNames=new Map(registry.records.map(r=>[normalise(r.name),r.name]));
const crosswalk=[],profiles=[],timeline=[],generatedRelations=[],relationKeys=new Set();
function match(record){for(const key of unique([record.name,record.ticker,...array(record.aliases)].map(normalise)))if(byName.has(key))return byName.get(key);return null}
function addRelation(r){const from=String(r.from||'').trim(),to=String(r.to||'').trim();if(!from||!to||normalise(from)===normalise(to))return;const key=`${normalise(from)}|${r.type||'relatedTo'}|${normalise(to)}|${r.sourceUrl||''}`;if(relationKeys.has(key))return;relationKeys.add(key);generatedRelations.push({id:r.id||`money-rel-${slug(key)}`,from,to,type:r.type||'relatedTo',evidenceClass:r.evidenceClass||'Public record',sourceTitle:r.sourceTitle||'',sourceUrl:r.sourceUrl||'',sourceDate:r.sourceDate||r.date||'',established:r.established||'',notEstablished:r.notEstablished||'This relationship does not by itself establish control, coordination or wrongdoing.'})}
for(const record of registry.records){
  const category=categories.get(record.category)||{},entity=match(record),evidence=bestEvidence(entity),originalRank=Number(record.rank)>0?Number(record.rank):Number(record.candidateOrder)>0?Number(record.candidateOrder):null;
  const verified=Boolean(originalRank&&quantitative(record.value)&&record.sourceUrl&&financialEvidence(record)),identity=Boolean(evidence);
  if(!verified&&originalRank){record.candidateOrder=originalRank;record.rank=null}
  record.value=placeholder(record.value)?'Not uniformly disclosed':record.value;
  record.categorySourceTitle=record.categorySourceTitle||record.sourceTitle||category.primarySourceTitle||'';
  record.categorySourceUrl=record.categorySourceUrl||record.sourceUrl||category.primarySourceUrl||category.sourceUrl||'';
  record.categorySourceDate=record.categorySourceDate||record.sourceDate||category.lastChecked||'';
  const linkedSources=array(entity?.evidenceRefs).slice().sort((a,b)=>grade(b.evidenceGrade)-grade(a.evidenceGrade)).slice(0,10).map(ref=>({sourceId:ref.sourceId||'',sourceTitle:ref.sourceTitle||'',sourceUrl:ref.sourceUrl||'',sourceDate:ref.publicationDate||ref.retrievalDate||'',evidenceGrade:ref.evidenceGrade||'',factualStatus:ref.factualStatus||'',establishes:ref.establishes||'',doesNotEstablish:ref.doesNotEstablish||'',reviewStatus:ref.reviewStatus||''}));
  const source=linkedSources[0];
  record.identityVerified=identity;record.financialMeasureVerified=verified;
  record.verificationStatus=verified?'verified-measurement':identity?'identity-sourced-measure-pending':'research-lead-measure-pending';
  record.status=verified?record.status:identity?'Identity sourced · measure pending':'Research lead · measure pending';
  record.evidenceClass=verified?record.evidenceClass:identity?'Identity evidence':'Research Lead';
  if(!verified&&source){record.sourceTitle=source.sourceTitle;record.sourceUrl=source.sourceUrl;record.sourceDate=source.sourceDate||today}
  record.profile={centralEntityId:entity?.id||null,centralEntityType:entity?.type||null,centralReviewStatus:entity?.reviewStatus||null,aliases:unique(entity?.aliases||[]).slice(0,20),roles:unique(entity?.roles||[]),identifiers:array(entity?.identifiers).slice(0,20),properties:entity?.properties||{},sourceCount:linkedSources.length,linkedSources};
  record.established=verified?(record.established||`The dated source supports the displayed ${category.metric||'measure'} and ranking position.`):identity?'The named entity is resolved to an individual public-record profile. The category measure remains pending record-level verification.':'The name is retained as a research candidate from the category source. No individual measurement is represented as verified.';
  record.notEstablished='Inclusion does not establish beneficial ownership, hidden control, coordination, wrongdoing or an exact current private balance sheet. A category-level source does not substitute for record-level verification.';
  record.nextResearch=verified?'Cross-check the next dated filing, ownership disclosures, voting rights, mandates, contracts and material changes.':`Obtain a dated entity-level disclosure for ${category.metric||'the category measure'}, confirm jurisdiction and legal identity, then connect sourced owners, subsidiaries, mandates, contracts and counterparties.`;
  record.checked=record.sourceDate||today;
  crosswalk.push({moneyRecordId:record.id,name:record.name,category:record.category,centralEntityId:entity?.id||null,identityVerified:identity,financialMeasureVerified:verified,verificationStatus:record.verificationStatus,sourceCount:linkedSources.length});
  profiles.push({id:record.id,name:record.name,category:record.category,categoryTitle:category.title||record.categoryTitle||record.category,candidateOrder:record.candidateOrder||record.rank||null,rank:record.rank||null,value:record.value,jurisdiction:record.jurisdiction||'',ticker:record.ticker||'',verificationStatus:record.verificationStatus,financialMeasureVerified:verified,identityVerified:identity,sourceTitle:record.sourceTitle||'',sourceUrl:record.sourceUrl||'',categorySourceTitle:record.categorySourceTitle,categorySourceUrl:record.categorySourceUrl,profile:record.profile,established:record.established,notEstablished:record.notEstablished,nextResearch:record.nextResearch});
  for(const ref of linkedSources)timeline.push({id:`${record.id}:${ref.sourceId||slug(ref.sourceUrl)}`,date:ref.sourceDate||today,entityId:record.id,entity:record.name,category:record.category,type:'source-linked',title:ref.sourceTitle,sourceUrl:ref.sourceUrl,evidenceGrade:ref.evidenceGrade,establishes:ref.establishes,doesNotEstablish:ref.doesNotEstablish});
}
const relevant=new Set(['owns','contractsWith','awardedTo','paid','operatedBy','affiliatedWith','reportedTransaction','reportedPositionChange','relatedTo']);
for(const relation of array(relations.relationships)){
  if(!relevant.has(relation.type))continue;const fromEntity=byId.get(relation.from),toEntity=byId.get(relation.to),from=fromEntity?.name||relation.fromName||'',to=toEntity?.name||relation.toName||'';
  if(!from||!to||(!moneyNames.has(normalise(from))&&!moneyNames.has(normalise(to))))continue;
  addRelation({id:`structured-${relation.id}`,from,to,type:relation.type,evidenceClass:`Structured registry grade ${relation.evidenceGrade||'ungraded'}`,sourceTitle:relation.sourceTitle||'',sourceUrl:relation.sourceUrl||'',sourceDate:relation.publicationDate||relation.retrievalDate||relation.date||'',established:relation.establishes||'',notEstablished:relation.doesNotEstablish||''});
}
registry.relationships=[...array(registry.relationships).filter(r=>!String(r.id||'').startsWith('structured-')),...generatedRelations];
for(const category of registry.categories){const rows=registry.records.filter(r=>r.category===category.id),ranked=rows.filter(r=>r.financialMeasureVerified&&Number(r.rank)>0).length,verified=rows.filter(r=>r.financialMeasureVerified).length,profiled=rows.filter(r=>r.identityVerified).length;Object.assign(category,{target:category.target||100,coverage:rows.length,candidates:rows.length,ranked,verified,profiled,research:Math.max(0,rows.length-verified),lastChecked:unique(rows.map(r=>r.sourceDate)).sort().at(-1)||category.lastChecked||today,completionTruth:verified===(category.target||100)?'record-level-complete':'candidate-list-partial-verification'})}
const verifiedMeasures=registry.records.filter(r=>r.financialMeasureVerified).length,identityProfiles=registry.records.filter(r=>r.identityVerified).length;
registry.version=Math.max(Number(registry.version)||0,4);registry.updated=now;
registry.methodology={summary:typeof registry.methodology==='string'?registry.methodology:registry.methodology?.summary||'Evidence-led capital registry.',coverageTruth:'Candidate coverage, identity profiling and verified quantitative ranking are separate counts. A 100-name candidate list is never presented as 100 verified measurements.',recordVerification:'A record is counted as financially verified only when its individual row carries a dated quantitative value, a numeric rank and a supporting source. Category-level sources cannot verify every row.',identityResolution:'Central entity-registry matches add identity context and sourced relationships, but do not verify assets, ownership, control or wrongdoing.',overlapPropagation:'Resolved identities and sourced relationships feed the money overlap graph, search index, profile index, timeline feed and intelligence brief.'};
registry.depthSummary={generatedAt:now,totalRecords:registry.records.length,verifiedMeasures,identityProfiles,unresolvedResearchLeads:Math.max(0,registry.records.length-identityProfiles),relationships:registry.relationships.length,centralRegistryMatches:crosswalk.filter(x=>x.centralEntityId).length};
write('data/money-intelligence-registry.json',registry);write('data/money-entity-crosswalk.json',{version:1,generatedAt:now,summary:registry.depthSummary,records:crosswalk});write('data/money-profile-index.json',{version:1,generatedAt:now,records:profiles});write('data/money-relationship-feed.json',{version:1,generatedAt:now,boundary:'Relationship records are research routes and do not establish coordinated control or wrongdoing.',relationships:registry.relationships});write('data/money-timeline-feed.json',{version:1,generatedAt:now,events:timeline.sort((a,b)=>String(b.date).localeCompare(String(a.date)))});
const truth=registry.categories.map(c=>({id:c.id,title:c.title,route:c.route,target:c.target,candidates:c.candidates,covered:c.coverage,profiled:c.profiled,ranked:c.ranked,verified:c.verified,research:c.research,completionTruth:c.completionTruth,rankingStatus:c.rankingStatus,lastChecked:c.lastChecked}));
const report={ok:registry.categories.every(c=>c.coverage<=c.target&&c.verified<=c.coverage&&c.ranked<=c.verified),generatedAt:now,summary:registry.depthSummary,categories:truth,evidenceBoundary:registry.methodology.coverageTruth};write('data/money-intelligence-depth-report.json',report);write('data/money-top100-research-report.json',{...report,checkedDate:today,totalCategories:registry.categories.length,totalRecords:registry.records.length,verifiedMeasures,identityProfiles});
const search=read('search-index.json',[]);if(Array.isArray(search)){const retained=search.filter(x=>x.sourceType!=='money-intelligence-profile');for(const p of profiles)retained.push({title:p.name,category:`Money Intelligence · ${p.categoryTitle}`,layer:'money-reserves',url:`money-profile.html?id=${encodeURIComponent(p.id)}`,description:`${p.value||'Measure pending'} · ${p.jurisdiction||'Jurisdiction pending'} · ${p.established}`,keywords:unique([p.name,p.ticker,p.jurisdiction,p.categoryTitle,p.value,p.verificationStatus,...array(p.profile?.aliases),...array(p.profile?.roles)].flatMap(v=>String(v||'').toLowerCase().split(/[^a-z0-9]+/)).filter(w=>w.length>2)).slice(0,80),priority:p.financialMeasureVerified?92:p.identityVerified?82:66,sourceType:'money-intelligence-profile'});write('search-index.json',retained)}
console.log(`Money depth enrichment complete: ${registry.records.length} candidates, ${identityProfiles} identity profiles, ${verifiedMeasures} verified measures, ${registry.relationships.length} relationships.`);
