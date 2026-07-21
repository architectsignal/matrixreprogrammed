const fs=require('fs');const path=require('path');const root=process.cwd();const file=p=>path.join(root,p);
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
const categories=new Map((registry.categories||[]).map(c=>[c.id,c]));
for(const record of registry.records||[]){
  const [entityType,capitalRole]=defaults[record.category]||['Capital Entity','Capital-system participant'];
  const category=categories.get(record.category)||{};
  record.entityType=record.entityType||entityType;
  record.subtype=record.subtype||record.entityType;
  record.capitalRole=record.capitalRole||capitalRole;
  record.sourceTitle=record.sourceTitle||category.sourceTitle||category.title||record.category;
  record.sourceDate=record.sourceDate||category.lastChecked||registry.updated?.slice?.(0,10)||new Date().toISOString().slice(0,10);
  record.sourceRank=record.sourceRank||record.rank||null;
  record.region=record.region||record.jurisdiction||'';
  record.dataQuality=record.dataQuality||record.confidence||record.evidenceClass||record.status||'Public-record coverage';
  record.established=record.established||'The cited source identifies this entity in the stated capital-system context.';
  record.notEstablished=record.notEstablished||'The record does not establish beneficial ownership, coordinated control, misconduct or wrongdoing.';
  record.nextResearch=record.nextResearch||'Open the cited source and current primary filings for ownership, governance, value, contracts and related entities.';
}
for(const category of registry.categories||[]){
  const rows=registry.records.filter(r=>r.category===category.id);
  category.coverage=rows.length;category.ranked=rows.filter(r=>Number(r.rank)>0).length;
  category.verified=rows.filter(r=>/official|published|verified|regulatory|procurement|market data|institutional disclosure/i.test(`${r.evidenceClass} ${r.status}`)).length;
  category.research=Math.max(0,rows.length-category.verified);
}
fs.writeFileSync(file('data/money-intelligence-registry.json'),`${JSON.stringify(registry,null,2)}\n`);
console.log(`Normalized detailed capital schema for ${registry.records.length} records.`);
