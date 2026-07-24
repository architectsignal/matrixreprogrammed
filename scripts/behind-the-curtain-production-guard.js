const fs=require('fs');
const path=require('path');
const root=process.cwd();
const site=path.join(root,'_site');
const hard=[];
const source=rel=>path.join(root,rel);
const built=rel=>path.join(site,rel);
const read=file=>fs.existsSync(file)?fs.readFileSync(file,'utf8'):'';
const need=(file,label)=>{if(!fs.existsSync(file))hard.push(`missing ${label}: ${path.relative(root,file)}`)};
const requireText=(file,marker,label)=>{if(!read(file).includes(marker))hard.push(`${label} missing marker: ${marker}`)};
const parse=(file,label)=>{try{return JSON.parse(read(file))}catch(error){hard.push(`${label} invalid JSON: ${error.message}`);return null}};
const requiredSource=['behind-the-curtain-access.html','behind-the-curtain-access-v2.js','data/behind-the-curtain-pyramid.json','data/behind-the-curtain-people-registry.json','behind-the-curtain-capstone.html','behind-the-curtain-capstone.js','data/behind-the-curtain-capstone.json'];
const requiredBuilt=['behind-the-curtain-access.html','behind-the-curtain-access','behind-the-curtain-access-v2.js','data/behind-the-curtain-pyramid.json','data/behind-the-curtain-people-registry.json','behind-the-curtain-capstone.html','behind-the-curtain-capstone','behind-the-curtain-capstone.js','data/behind-the-curtain-capstone.json'];
requiredSource.forEach(rel=>need(source(rel),'source asset'));
requiredBuilt.forEach(rel=>need(built(rel),'built asset'));
for(const base of [source,built]){
  requireText(base('behind-the-curtain-access.html'),'behind-the-curtain-access-v2.js',`${base===source?'source':'built'} Pyramid HTML`);
  requireText(base('behind-the-curtain-access.html'),'SELECT A LEVEL. NAME ITS OPERATORS.',`${base===source?'source':'built'} Pyramid HTML`);
  requireText(base('behind-the-curtain-access.html'),'ENTER THE CAPSTONE',`${base===source?'source':'built'} Pyramid HTML`);
  requireText(base('behind-the-curtain-access.html'),'behind-the-curtain-capstone',`${base===source?'source':'built'} Pyramid HTML`);
  requireText(base('behind-the-curtain-access-v2.js'),'renderSelectedTier',`${base===source?'source':'built'} Pyramid renderer`);
  requireText(base('behind-the-curtain-capstone.html'),'THE CAPSTONE',`${base===source?'source':'built'} capstone HTML`);
  requireText(base('behind-the-curtain-capstone.html'),'BLACK NOBILITY IS A HISTORY BEFORE IT IS A THEORY.',`${base===source?'source':'built'} capstone HTML`);
  requireText(base('behind-the-curtain-capstone.js'),'behind-the-curtain-capstone.json',`${base===source?'source':'built'} capstone renderer`);
}
if(read(source('behind-the-curtain-access-v2.js')).includes('renderHumanApex'))hard.push('legacy global Top 10 renderer remains in source');
if(read(built('behind-the-curtain-access-v2.js')).includes('renderHumanApex'))hard.push('legacy global Top 10 renderer remains in built asset');
const people=parse(source('data/behind-the-curtain-people-registry.json'),'source people registry');
const builtPeople=parse(built('data/behind-the-curtain-people-registry.json'),'built people registry');
const pyramid=parse(source('data/behind-the-curtain-pyramid.json'),'source Pyramid model');
const builtPyramid=parse(built('data/behind-the-curtain-pyramid.json'),'built Pyramid model');
const capstone=parse(source('data/behind-the-curtain-capstone.json'),'source capstone model');
const builtCapstone=parse(built('data/behind-the-curtain-capstone.json'),'built capstone model');
function validatePeople(model,label){if(!model)return;if(model.schemaVersion!==1)hard.push(`${label} schema version must be 1`);if(!Array.isArray(model.people)||model.people.length<80)hard.push(`${label} requires at least 80 people`);if(new Set((model.people||[]).map(x=>x.id)).size!==(model.people||[]).length)hard.push(`${label} contains duplicate person IDs`);const factual=['public-stage','permanent-system','money-gatekeepers','ownership-infrastructure','intelligence-security','policy-architects','connectors'];for(const tier of factual){const count=(model.people||[]).filter(p=>(p.tierAccess||[]).some(a=>a.tierId===tier)).length;if(count<10)hard.push(`${label} tier ${tier} has only ${count} people`)}const union=new Set((model.people||[]).filter(p=>(p.tierAccess||[]).some(a=>factual.includes(a.tierId))).map(p=>p.id));if(union.size<80)hard.push(`${label} factual tier union has only ${union.size} unique people`)}
function validatePyramid(model,label){if(!model)return;if(model.schemaVersion!==2)hard.push(`${label} schema version must be 2`);if(!Array.isArray(model.levels)||model.levels.length!==12)hard.push(`${label} requires 12 levels`);if(!Array.isArray(model.chokePoints)||model.chokePoints.length!==10)hard.push(`${label} requires 10 choke points`);const apex=(model.levels||[]).find(x=>x.id==='human-apex');if(apex?.memberQuery!=='cross-system-top-10'||(apex.memberRefs||[]).length!==0)hard.push(`${label} Human Apex must be dynamic and contain no hard-coded roster`);if(!(model.hiddenHandHypotheses||[]).some(x=>x.classification==='speculative_hypothesis'&&x.notEstablished))hard.push(`${label} lacks a bounded speculative hidden-hand model`);if(!(model.symbolicDossiers||[]).some(x=>x.id==='lightbringer'&&x.notEstablished))hard.push(`${label} lacks bounded Lightbringer dossier`)}
function validateCapstone(model,label){if(!model)return;if(model.schemaVersion!==1)hard.push(`${label} schema version must be 1`);if(!Array.isArray(model.families)||model.families.length<13)hard.push(`${label} requires at least 13 named family files`);for(const id of ['orsini','colonna','borghese','chigi','odescalchi','caetani','massimo'])if(!(model.families||[]).some(x=>x.id===id))hard.push(`${label} missing family ${id}`);for(const family of model.families||[]){if(!family.historicalRecord||!family.speculativeClaim||!family.evidenceFor?.length||!family.evidenceAgainst?.length||!family.requiredProof||!family.notEstablished)hard.push(`${label} family ${family.id} lacks two-sided evidence boundaries`)}for(const id of ['baal','moloch','lightbringer','saturn-black-cube'])if(!(model.symbolicApex||[]).some(x=>x.id===id&&x.notEstablished))hard.push(`${label} missing bounded symbolic dossier ${id}`);if(!(model.models||[]).some(x=>x.classification==='speculative_hypothesis'))hard.push(`${label} must include an explicitly speculative model`);if(!/not established|does not establish|separate speculative/i.test(`${model.editorialBoundary} ${model.historicalFinding}`))hard.push(`${label} lacks a clear speculation boundary`)}
validatePeople(people,'source people registry');validatePeople(builtPeople,'built people registry');
validatePyramid(pyramid,'source Pyramid model');validatePyramid(builtPyramid,'built Pyramid model');
validateCapstone(capstone,'source capstone model');validateCapstone(builtCapstone,'built capstone model');
if(people&&builtPeople&&JSON.stringify(people)!==JSON.stringify(builtPeople))hard.push('source and built people registries differ');
if(pyramid&&builtPyramid&&JSON.stringify(pyramid)!==JSON.stringify(builtPyramid))hard.push('source and built Pyramid models differ');
if(capstone&&builtCapstone&&JSON.stringify(capstone)!==JSON.stringify(builtCapstone))hard.push('source and built capstone models differ');
const report={ok:hard.length===0,checkedAt:new Date().toISOString(),hardIssues:hard,peopleCount:people?.people?.length||0,levels:pyramid?.levels?.length||0,chokePoints:pyramid?.chokePoints?.length||0,capstoneFamilies:capstone?.families?.length||0,capstoneSymbols:capstone?.symbolicApex?.length||0};
fs.mkdirSync(path.join(root,'downloads'),{recursive:true});
fs.writeFileSync(path.join(root,'downloads','behind-the-curtain-production-guard.json'),JSON.stringify(report,null,2));
if(hard.length){console.error(`Behind the Curtain production guard failed with ${hard.length} issue(s):`);hard.forEach(x=>console.error(`- ${x}`));process.exit(1)}
console.log(`Behind the Curtain production guard PASS: ${report.peopleCount} people, ${report.levels} levels, ${report.chokePoints} choke points, ${report.capstoneFamilies} capstone families and ${report.capstoneSymbols} symbolic dossiers verified.`);
