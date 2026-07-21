const fs=require('fs');const path=require('path');const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
const registry=read('data/money-intelligence-registry.json');
assert(registry.version>=4,'Expected capital registry version 4');
assert(registry.categories.length>=20,'Expected 20 capital systems');
const ids=new Set();
for(const c of registry.categories){
  const rows=registry.records.filter(r=>r.category===c.id);
  assert(rows.length>=100,`${c.id} has only ${rows.length} records`);
  assert(c.coverage===rows.length,`${c.id} coverage metadata mismatch`);
  for(const r of rows){
    assert(r.id&&!ids.has(r.id),`Duplicate or missing record id ${r.id}`);ids.add(r.id);
    assert(r.name&&r.sourceUrl&&r.sourceDate,`Weak source metadata for ${r.id}`);
    assert(r.evidenceClass&&r.established&&r.notEstablished&&r.nextResearch,`Weak evidence boundary for ${r.id}`);
    assert(r.entityType&&r.capitalRole,`Missing detailed capital role for ${r.id}`);
    if(r.rank)assert(Number(r.sourceRank||r.rank)>0,`Rank without source rank for ${r.id}`);
  }
}
for(const id of ['asset-managers','sovereign-wealth-funds','pension-funds','foundations','trusts','private-equity','hedge-funds']){
  const c=registry.categories.find(x=>x.id===id);assert(c&&c.ranked>=90,`${id} should contain at least 90 source-ranked records`);
}
assert(registry.categories.find(c=>c.id==='family-offices').coverage>=100,'Family-office coverage incomplete');
assert(registry.categories.find(c=>c.id==='government-contractors').coverage>=100,'Contractor coverage incomplete');
assert(registry.categories.find(c=>c.id==='political-money').coverage>=100,'Political-money coverage incomplete');
assert(registry.categories.find(c=>c.id==='philanthropic-networks').coverage>=100,'Philanthropic coverage incomplete');
assert(registry.categories.find(c=>c.id==='asset-owners').coverage>=100,'Asset-owner coverage incomplete');
assert(registry.completeness?.categoriesAtTarget===registry.categories.length,'Not every category reached target');
const categoryJs=fs.readFileSync(path.join(root,'money-category.js'),'utf8');
assert(categoryJs.includes('capitalRole')&&categoryJs.includes('dataQuality'),'Detailed category interface missing');
console.log(`Complete capital lists verified: ${registry.records.length} records across ${registry.categories.length} systems; every system has at least 100 records.`);
