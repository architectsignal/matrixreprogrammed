const fs=require('fs');
const path=require('path');
const root=process.cwd();
const read=relative=>JSON.parse(fs.readFileSync(path.join(root,relative),'utf8'));
const text=relative=>fs.readFileSync(path.join(root,relative),'utf8');
const assert=(condition,message)=>{if(!condition)throw new Error(message)};
const slug=value=>String(value||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');

const families=read('data/behind-the-curtain-family-access.json');
const living=read('data/behind-the-curtain-living-access.json');
const core=read('data/behind-the-curtain.json');
const pyramid=read('data/behind-the-curtain-pyramid.json');
const html=text('behind-the-curtain-access.html');
const js=text('behind-the-curtain-access.js');

assert(families.schemaVersion===1,'Access Layer schema version missing');
assert(families.families.length>=9,'At least nine documented family structures are required');
assert(new Set(families.families.map(x=>x.id)).size===families.families.length,'Family IDs must be unique');
assert(families.families.every((x,i)=>x.rank===i+1),'Family ranks must be sequential');
assert(families.families.every(x=>x.accessScore>=0&&x.accessScore<=100),'Access scores must be bounded');
assert(families.families.every(x=>x.documentedAccess.length&&x.constraints.length&&x.strongestCounterargument&&x.unsupportedClaim),'Every family requires evidence, constraints and claim boundaries');
assert(families.families.every(x=>x.sourceIds.length>=2),'Every family requires at least two sources');
assert(Object.values(families.scoreDimensions).reduce((a,b)=>a+Number(b),0)===100,'Access score weights must total 100');
assert(families.structureAccessMatrix.length===10,'All ten structural power centers require an access test');
assert(families.sources.length>=20,'Primary source ledger is incomplete');

assert(pyramid.schemaVersion===1,'Pyramid schema version missing');
assert(pyramid.levels.length===12,'The Pyramid must contain twelve levels');
assert(new Set(pyramid.levels.map(x=>x.id)).size===12,'Pyramid level IDs must be unique');
assert([...pyramid.levels].sort((a,b)=>a.level-b.level).every((x,i)=>x.level===i+1),'Pyramid levels must be numbered 1 through 12');
assert(pyramid.chokePoints.length===10,'The Pyramid must map ten choke points');
assert(pyramid.pathways.length>=6,'The Pyramid requires at least six mechanism pathways');
assert(pyramid.symbolicDossiers.length>=8,'The symbolic apex requires at least eight bounded dossiers');
assert(pyramid.symbolicDossiers.some(x=>x.id==='lightbringer'&&x.notEstablished),'The Lightbringer must be present with a not-established boundary');
assert(pyramid.levels.find(x=>x.id==='lightbringer')?.minimumMode==='symbolic','The Lightbringer must remain in symbolic mode');
assert(pyramid.levels.find(x=>x.id==='thirteen-families')?.memberRefs.length===13,'The Thirteen Families review must name exactly thirteen investigated structures');
assert(/does not verify|not a verified|does not establish/i.test(pyramid.thirteenFamiliesReview.currentFinding+' '+pyramid.thirteenFamiliesReview.headline),'The Thirteen Families claim requires an explicit non-verification boundary');
assert(/No evidence package|No single supreme|No evidence/i.test(pyramid.innerCouncilsReview.currentFinding),'Inner council review requires an unresolved boundary');
assert(pyramid.updatePolicy.failClosed===true,'The Pyramid must fail closed');
assert(Number(pyramid.updatePolicy.pollMinutes)>=5,'Automatic refresh must not poll excessively');

const indexes={
  living:new Set(living.candidates.map(x=>x.id)),
  family:new Set(families.families.map(x=>x.id)),
  core:new Set(core.powerCenters.map(x=>x.id)),
  historical:new Set(families.historicalArchitects.map(x=>slug(x.name))),
  symbolic:new Set(pyramid.symbolicDossiers.map(x=>x.id))
};
const refs=[
  ...pyramid.levels.flatMap(x=>x.memberRefs||[]),
  ...pyramid.chokePoints.flatMap(x=>x.memberRefs||[]),
  ...pyramid.pathways.flatMap(x=>(x.steps||[]).filter(step=>step.dataset&&step.id))
];
for(const ref of refs){
  assert(indexes[ref.dataset],`Unknown Pyramid dataset ${ref.dataset}`);
  assert(indexes[ref.dataset].has(ref.id),`Unresolved Pyramid reference ${ref.dataset}:${ref.id}`);
}

for(const source of [...families.sources,...living.sources,...core.sources]){
  assert(/^https:\/\//.test(source.url),'Every source requires HTTPS');
  assert(source.establishes&&source.doesNotEstablish,'Every source requires an evidence boundary');
}

for(const required of ['THE PYRAMID','THE NAMES ARE NAMED','WHO CAN REACH EACH CHOKE POINT','THE DYNASTY FILES','THE INNER COUNCILS','THE LIGHTBRINGER']){
  assert(html.includes(required),`Missing cinematic page section: ${required}`);
}
assert(js.includes('setInterval')&&js.includes('pollMinutes'),'The page must refresh when reviewed evidence changes');
assert(js.includes('failed closed')||js.includes('fail closed'),'The page must fail closed');
assert(js.includes("data-view-mode")&&js.includes('symbolic'),'Evidence and symbolic modes are missing');
assert(js.includes('openProfile')&&js.includes('sourceBlock'),'Named profile drawers and source boundaries are missing');

const combined=JSON.stringify({families,pyramid}).toLowerCase();
for(const forbidden of ['one family controls the world','secretly controls all','ethnicity controls','lightbringer controls every']){
  assert(!combined.includes(forbidden),`Unsupported universal-control claim detected: ${forbidden}`);
}

console.log(`Behind the Curtain Pyramid PASS: ${pyramid.levels.length} levels, ${pyramid.chokePoints.length} choke points, ${living.candidates.filter(x=>x.rank&&x.rank<=10).length} living names, ${families.families.length} dynasties, ${pyramid.symbolicDossiers.length} symbolic dossiers.`);
require('./behind-the-curtain-hidden-hand-test.js');
require('./behind-the-curtain-capstone-test.js');
