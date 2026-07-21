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
    if(/Research Lead/i.test(r.evidenceClass))assert(!r.rank,`Research lead must not claim a rank: ${r.id}`);
  }
}
for(const id of ['asset-managers','sovereign-wealth-funds','pension-funds','foundations','hedge-funds']){
  const c=registry.categories.find(x=>x.id===id);assert(c&&c.ranked>=90,`${id} should contain at least 90 source-ranked records`);
}
const privateEquity=registry.records.filter(r=>r.category==='private-equity');
assert(privateEquity.length>=100,'Private-equity coverage incomplete');
assert(privateEquity.every(r=>!r.rank||Number(r.sourceRank)>0),'Private-equity rank must come from a cited source');
const trustRows=registry.records.filter(r=>r.category==='trusts');
assert(trustRows.filter(r=>/Trust/.test(r.entityType)).length>=25,'Trust coverage needs at least 25 disclosed trust structures');
assert(trustRows.filter(r=>r.entityType==='Endowment').length>=60,'Trust coverage needs at least 60 separately labelled endowments');
assert(trustRows.every(r=>!r.rank),'Composite trust/endowment records must not claim one global category rank');
for(const id of ['family-offices','government-contractors','political-money','philanthropic-networks','asset-owners','banks','property','media','technology-control','energy-resources','defence-security']){
  assert(registry.categories.find(c=>c.id===id)?.coverage>=100,`${id} coverage incomplete`);
}
assert(registry.completeness?.categoriesAtTarget===registry.categories.length,'Not every category reached target');
const normalisation=read('downloads/capital-research-universe-normalization.json');
assert(normalisation.ok===true,'Capital research universe normalisation did not pass');
const categoryJs=fs.readFileSync(path.join(root,'money-category.js'),'utf8');
assert(categoryJs.includes('capitalRole')&&categoryJs.includes('dataQuality'),'Detailed category interface missing');
console.log(`Complete capital lists verified: ${registry.records.length} records across ${registry.categories.length} systems; every system has at least 100 records and unranked research leads remain unranked.`);
