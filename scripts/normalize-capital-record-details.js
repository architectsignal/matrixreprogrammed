const fs=require('fs');
const path=require('path');
const root=process.cwd();
const file=p=>path.join(root,p);
const today=new Date().toISOString().slice(0,10);
const now=new Date().toISOString();
const registry=JSON.parse(fs.readFileSync(file('data/money-intelligence-registry.json'),'utf8'));
const defaults={
  companies:['Company','Capital issuer / operating company'],
  'investment-vehicles':['Investment Vehicle','Pooled capital vehicle'],
  'asset-managers':['Asset Manager','Allocator / investment manager'],
  'sovereign-wealth-funds':['Sovereign Wealth Fund','State asset owner / allocator'],
  'pension-funds':['Pension Fund','Beneficial asset owner / allocator'],
  'family-offices':['Family Office','Private family capital owner / allocator'],
  foundations:['Foundation','Philanthropic asset owner / grantmaker'],
  trusts:['Trust or Endowment','Long-term asset owner / trustee structure'],
  banks:['Bank or Financial Institution','Capital intermediary / lender / custodian'],
  'private-equity':['Private Equity Firm','Private-market manager / allocator'],
  'hedge-funds':['Hedge Fund Manager','Alternative investment manager'],
  'government-contractors':['Government Contractor','Public-contract recipient'],
  property:['Property or Land Company','Property owner / operator / capital recipient'],
  media:['Media Company','Media asset owner / distributor'],
  'technology-control':['Technology Company','Digital infrastructure owner / operator'],
  'energy-resources':['Energy or Resource Company','Resource owner / producer / infrastructure operator'],
  'defence-security':['Defence or Security Company','Defence supplier / public-contract recipient'],
  'political-money':['Political Money Entity','Political-money recipient / spender / intermediary'],
  'philanthropic-networks':['Philanthropic Network','Grantmaking asset owner / allocator'],
  'asset-owners':['Institutional Asset Owner','Ultimate or beneficial institutional capital owner']
};
const slug=value=>String(value||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,100);
const categories=new Map((registry.categories||[]).map(c=>[c.id,c]));
const universeDir=file('data/capital-research-universe');
const universes=[];
if(fs.existsSync(universeDir)){
  for(const name of fs.readdirSync(universeDir).filter(name=>name.endsWith('.json')).sort()){
    const value=JSON.parse(fs.readFileSync(path.join(universeDir,name),'utf8'));
    if(value?.id&&Array.isArray(value.names))universes.push(value);
  }
}
const addedByCategory={};
for(const universe of universes){
  const category=categories.get(universe.id);
  if(!category)throw new Error(`Capital research universe references unknown category: ${universe.id}`);
  const target=Number(category.target)||100;
  const existing=(registry.records||[]).filter(record=>record.category===universe.id);
  const seen=new Set(existing.map(record=>slug(record.name)).filter(Boolean));
  let added=0;
  for(const name of universe.names){
    if(existing.length+added>=target)break;
    const key=slug(name);
    if(!key||seen.has(key))continue;
    seen.add(key);
    registry.records.push({
      id:`${universe.id}-${key}`,
      category:universe.id,
      rank:null,
      sourceRank:null,
      name,
      ticker:'',
      jurisdiction:'',
      region:'',
      value:'Not uniformly disclosed',
      valueNumeric:null,
      fee:'',
      metric:category.metric||'Public-record coverage',
      status:'Curated public-record coverage — entity-level verification required',
      entityType:universe.entityType||defaults[universe.id]?.[0]||'Capital Entity',
      subtype:universe.entityType||defaults[universe.id]?.[0]||'Capital Entity',
      capitalRole:universe.capitalRole||defaults[universe.id]?.[1]||'Capital-system participant',
      sourceTitle:universe.sourceTitle||category.sourceTitle||category.title,
      sourceUrl:universe.sourceUrl||category.sourceUrl,
      sourceDate:universe.updated||today,
      evidenceClass:'Public-Record Research Lead',
      confidence:'Named public-record research target; exact category position, value and current operational role require source-level verification',
      dataQuality:'Curated research lead — not source-ranked',
      established:universe.reason||'The cited public-record route identifies this entity as relevant to the stated capital-system category.',
      notEstablished:'Inclusion does not establish an exact rank, asset value, beneficial ownership, voting control, coordination, misconduct, wrongdoing or a current exact private balance sheet.',
      nextResearch:'Open the cited source and the entity’s latest official filing, annual report, regulator record, procurement record or committee disclosure; verify identity, date, ownership, value, role and any material changes.'
    });
    added++;
  }
  const coverage=(registry.records||[]).filter(record=>record.category===universe.id).length;
  if(coverage<target)throw new Error(`${universe.id} research universe could only produce ${coverage}/${target} unique records`);
  addedByCategory[universe.id]=added;
  category.sourceTitle=universe.sourceTitle||category.sourceTitle;
  category.sourceUrl=universe.sourceUrl||category.sourceUrl;
  category.lastChecked=today;
  category.rankingStatus=`${category.rankingStatus||'Public-record coverage'}; source-ranked records and clearly labelled research leads are separated`;
  category.description=`${category.description||''} Coverage reaches ${target} named public-record entities. A record without a source rank is a research lead, not a ranking claim.`.trim();
  registry.sources=registry.sources||[];
  if(!registry.sources.some(source=>source.url===category.sourceUrl&&source.name===category.title))registry.sources.push({name:category.title,url:category.sourceUrl,checked:today});
}
for(const record of registry.records||[]){
  const [entityType,capitalRole]=defaults[record.category]||['Capital Entity','Capital-system participant'];
  const category=categories.get(record.category)||{};
  record.entityType=record.entityType||entityType;
  record.subtype=record.subtype||record.entityType;
  record.capitalRole=record.capitalRole||capitalRole;
  record.sourceTitle=record.sourceTitle||category.sourceTitle||category.title||record.category;
  record.sourceDate=record.sourceDate||category.lastChecked||registry.updated?.slice?.(0,10)||today;
  record.sourceRank=record.sourceRank||record.rank||null;
  record.region=record.region||record.jurisdiction||'';
  record.dataQuality=record.dataQuality||record.confidence||record.evidenceClass||record.status||'Public-record coverage';
  record.established=record.established||'The cited source identifies this entity in the stated capital-system context.';
  record.notEstablished=record.notEstablished||'The record does not establish beneficial ownership, coordinated control, misconduct or wrongdoing.';
  record.nextResearch=record.nextResearch||'Open the cited source and current primary filings for ownership, governance, value, contracts and related entities.';
}
for(const category of registry.categories||[]){
  const rows=registry.records.filter(record=>record.category===category.id);
  category.coverage=rows.length;
  category.ranked=rows.filter(record=>Number(record.rank)>0).length;
  category.verified=rows.filter(record=>/official|published|verified|regulatory|procurement|market data|institutional disclosure/i.test(`${record.evidenceClass} ${record.status}`)).length;
  category.research=Math.max(0,rows.length-category.verified);
  category.lastChecked=category.lastChecked||today;
}
registry.version=Math.max(Number(registry.version)||0,4);
registry.updated=now;
registry.completeness={
  targetPerCategory:100,
  categoriesAtTarget:registry.categories.filter(category=>category.coverage>=100).length,
  totalCategories:registry.categories.length,
  completedAt:now,
  rule:'Coverage is not the same as verification or ranking. Source ranks appear only where the cited source supports them; all other additions remain clearly labelled research leads.'
};
fs.writeFileSync(file('data/money-intelligence-registry.json'),`${JSON.stringify(registry,null,2)}\n`);
const history=file(`data/history/money-intelligence/${today}.json`);
if(fs.existsSync(history))fs.writeFileSync(history,`${JSON.stringify(registry,null,2)}\n`);
fs.mkdirSync(file('downloads'),{recursive:true});
fs.writeFileSync(file('downloads/capital-research-universe-normalization.json'),`${JSON.stringify({ok:registry.completeness.categoriesAtTarget===registry.completeness.totalCategories,generatedAt:now,universes:universes.map(value=>({id:value.id,candidates:value.names.length,added:addedByCategory[value.id]||0})),completeness:registry.completeness,boundary:'The research universe completes named public-record coverage without converting unranked entities into ranked records.'},null,2)}\n`);
if(registry.completeness.categoriesAtTarget!==registry.completeness.totalCategories)throw new Error(`Capital completeness remains ${registry.completeness.categoriesAtTarget}/${registry.completeness.totalCategories}`);
console.log(`Normalized detailed capital schema for ${registry.records.length} records; all ${registry.completeness.totalCategories} systems reached target without inventing ranks.`);
