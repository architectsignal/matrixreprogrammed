const fs=require('fs');
const assert=require('assert');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const index=read('data/behind-the-curtain-intermediaries-index.json');
const profiles=[1,2,3].flatMap(n=>read(`data/behind-the-curtain-intermediaries-${String(n).padStart(2,'0')}.json`));
const sources=read('data/behind-the-curtain-intermediary-sources.json');
const continuity=read('data/behind-the-curtain-continuity-systems.json');
const models=read('data/behind-the-curtain-hidden-hand-models.json');
const families=read('data/behind-the-curtain-family-principals.json');
const symbolic=read('data/behind-the-curtain-symbolic-research.json');
const health=read('data/behind-the-curtain-intermediary-source-health.json');
const addon=fs.readFileSync('behind-the-curtain-hidden-hand.js','utf8');
const pulse=fs.readFileSync('investigation-pulse.js','utf8');
assert.strictEqual(index.asOf,'2026-07-24');
assert.ok(index.editorialBoundary.includes('does not establish criminality'));
assert.strictEqual(profiles.length,24,'expected exactly 24 reviewed intermediaries');
assert.ok(sources.length>=40,'expected deep source ledger');
assert.strictEqual(continuity.length,9);
assert.strictEqual(models.length,9);
assert.strictEqual(families.length,9);
assert.strictEqual(symbolic.length,5);
assert.strictEqual(health.profileCount,24);
const sourceIds=new Set(sources.map(x=>x.id));
const ids=new Set(),names=new Set();
for(const p of profiles){
 assert.ok(p.id&&p.name&&p.currentRole,`missing identity: ${p.id||p.name}`);
 assert.ok(!ids.has(p.id),`duplicate id ${p.id}`);ids.add(p.id);
 assert.ok(!names.has(p.name),`duplicate name ${p.name}`);names.add(p.name);
 assert.ok(p.rank>=1&&p.rank<=24,`${p.id}: invalid rank`);
 assert.ok(p.accessScore>=0&&p.accessScore<=100,`${p.id}: invalid score`);
 assert.ok(['documented_fact','strongly_supported_assessment'].includes(p.classification),`${p.id}: weak live classification`);
 assert.ok(p.verifiedAt&&p.nextReviewDue,`${p.id}: missing review dates`);
 assert.ok(p.mechanisms.length>=2&&p.constraints.length>=2,`${p.id}: shallow evidence model`);
 assert.ok(p.strongestCounterargument,`${p.id}: counterargument required`);
 assert.ok(p.roleSignals.length>=2,`${p.id}: source-watch signals required`);
 for(const id of p.sourceIds)assert.ok(sourceIds.has(id),`${p.id}: missing source ${id}`);
}
assert.deepStrictEqual(profiles.map(x=>x.rank).sort((a,b)=>a-b),Array.from({length:24},(_,i)=>i+1));
for(const s of sources){assert.ok(/^https:\/\//.test(s.url),`${s.id}: HTTPS required`);assert.ok(s.establishes&&s.doesNotEstablish,`${s.id}: source boundary required`)}
for(const f of families){assert.ok(f.namedPeople.length,`${f.familyId}: names required`);for(const id of f.sourceIds)assert.ok(sourceIds.has(id),`${f.familyId}: missing ${id}`)}
for(const s of symbolic){assert.ok(['symbolic_or_mythological','disputed'].includes(s.classification));assert.ok(s.notEstablished);for(const id of s.sourceIds)assert.ok(sourceIds.has(id))}
assert.strictEqual(models.find(x=>x.id==='single-supreme-cabal').classification,'unsupported');
assert.strictEqual(models.find(x=>x.id==='occult-command').classification,'symbolic_or_mythological');
for(const marker of ['WHO GETS INTO THE ROOM?','THE HIDDEN HAND — TESTED, NOT ASSUMED.','WHAT SURVIVES THE ELECTION?','FAMILY NAMES ARE NOT ENOUGH.','BAAL · MOLOCH · SATURN · LUCIFER','failed closed'])assert.ok(addon.includes(marker),`addon missing ${marker}`);
assert.ok(pulse.includes('behind-the-curtain-hidden-hand.js'),'Pyramid must load hidden-hand module');
console.log(`Hidden-hand evidence test passed: ${profiles.length} intermediaries, ${families.length} family lanes, ${models.length} models and ${sources.length} sources.`);
