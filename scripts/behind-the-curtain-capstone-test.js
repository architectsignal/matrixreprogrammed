const fs=require('fs');
const path=require('path');
const root=process.cwd();
const read=rel=>JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));
const text=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const assert=(ok,message)=>{if(!ok)throw new Error(message)};
const data=read('data/behind-the-curtain-capstone.json');
const html=text('behind-the-curtain-capstone.html');
const js=text('behind-the-curtain-capstone.js');
const patch=text('scripts/patch-behind-the-curtain-tier-ui.js');
const bridge=text('scripts/patch-public-static-route-bridge.js');
assert(data.schemaVersion===1,'Capstone schema version must be 1');
assert(data.families.length>=13,'Capstone requires at least thirteen named family files');
assert(new Set(data.families.map(x=>x.id)).size===data.families.length,'Capstone family IDs must be unique');
for(const id of ['orsini','colonna','borghese','chigi','odescalchi','caetani','massimo'])assert(data.families.some(x=>x.id===id),`Missing required family file ${id}`);
for(const family of data.families){assert(family.historicalRecord&&family.speculativeClaim,`${family.id} must separate history from speculation`);assert(family.evidenceFor?.length&&family.evidenceAgainst?.length,`${family.id} requires evidence for and against`);assert(family.requiredProof&&family.notEstablished,`${family.id} requires proof threshold and not-established boundary`)}
assert(data.symbolicApex.length>=4,'Symbolic apex is incomplete');
for(const id of ['baal','moloch','lightbringer','saturn-black-cube']){const item=data.symbolicApex.find(x=>x.id===id);assert(item&&item.historicalFrame&&item.speculativeClaim&&item.evidenceFor?.length&&item.evidenceAgainst?.length&&item.notEstablished,`Symbolic dossier ${id} is incomplete`)}
assert(data.models.some(x=>x.classification==='speculative_hypothesis'),'Capstone must explicitly classify speculative hypotheses');
assert(data.models.some(x=>x.id==='historical-continuity'&&x.classification==='strongly_supported_assessment'),'Historical continuity model missing');
assert(/separate speculative|not established|does not prove/i.test(data.editorialBoundary+' '+data.historicalFinding),'Capstone global boundary is inadequate');
assert(data.sources.length>=12,'Capstone source vault is incomplete');
for(const source of data.sources){assert(/^https:\/\//.test(source.url),`${source.id} requires HTTPS`);assert(source.establishes&&source.doesNotEstablish,`${source.id} requires two-sided source boundary`)}
for(const marker of ['THE CAPSTONE','BLACK NOBILITY IS A HISTORY BEFORE IT IS A THEORY.','BAAL. MOLOCH. SATURN. THE LIGHTBRINGER.','behind-the-curtain-capstone.js'])assert(html.includes(marker),`Capstone HTML missing ${marker}`);
assert(js.includes('/api/public/structural-power/capstone'),'Capstone renderer does not load its evidence model through the public Worker API');
assert(bridge.includes("['/api/public/structural-power/capstone', '/data/behind-the-curtain-capstone.json']"),'The public Capstone API must be bound to the validated local evidence model');
assert(js.includes("cache:'no-store'"),'Capstone evidence must refresh without stale browser cache');
assert(js.includes('failed closed'),'Capstone must fail closed');
assert(patch.includes('ENTER THE CAPSTONE')&&patch.includes('behind-the-curtain-capstone'),'Pyramid gateway compatibility patch is missing');
const combined=JSON.stringify(data).toLowerCase();
for(const forbidden of ['orsini control the world','family worships baal','family worships moloch','lucifer commands the families','black nobility controls every'])assert(!combined.includes(forbidden),`Unsupported factual assertion detected: ${forbidden}`);
console.log(`Behind the Curtain Capstone PASS: ${data.families.length} family files, ${data.symbolicApex.length} symbolic dossiers, ${data.models.length} competing models and ${data.sources.length} bounded sources through the Structural Power public API.`);
