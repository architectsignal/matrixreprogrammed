const fs=require('fs');
const assert=require('assert');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const data=read('data/behind-the-curtain-capstone.json');
const sources=read('data/behind-the-curtain-capstone-sources.json');
const html=fs.readFileSync('behind-the-curtain-capstone.html','utf8');
const js=fs.readFileSync('behind-the-curtain-capstone.js','utf8');
const link=fs.readFileSync('behind-the-curtain-capstone-link.js','utf8');
const pulse=fs.readFileSync('investigation-pulse.js','utf8');
assert.strictEqual(data.asOf,'2026-07-24');
assert.ok(data.editorialBoundary.includes('does not establish'));
assert.ok(data.definition.documented.includes('1870'));
assert.ok(data.definition.importantLimit.includes('white nobility'));
assert.ok(data.houses.length>=12,'expected at least twelve house files');
assert.strictEqual(data.coordinationModels.length,6);
assert.strictEqual(data.symbolicApex.length,5);
assert.ok(sources.length>=20,'expected a deep capstone source ledger');
const ids=new Set(sources.map(s=>s.id));
for(const source of sources){assert.ok(/^https:\/\//.test(source.url),`${source.id}: HTTPS required`);assert.ok(source.establishes&&source.doesNotEstablish,`${source.id}: source boundary required`)}
for(const house of data.houses){assert.ok(house.id&&house.name&&house.historicalRecord,`invalid house ${house.id||house.name}`);assert.ok(house.assessment&&house.whatWouldProveMore.length,`${house.id}: evidence assessment required`);for(const id of house.sourceIds)assert.ok(ids.has(id),`${house.id}: missing source ${id}`)}
for(const item of data.symbolicApex){assert.ok(/symbolic|disputed/i.test(item.classification),`${item.id}: symbolic classification required`);assert.ok(item.notEstablished,`${item.id}: explicit non-finding required`);for(const id of item.sourceIds)assert.ok(ids.has(id),`${item.id}: missing source ${id}`)}
assert.ok(data.houses.some(x=>x.id==='orsini'),'Orsini file required');
assert.ok(data.houses.some(x=>x.id==='colonna'),'Colonna file required');
assert.strictEqual(data.houses.find(x=>x.id==='ruspoli-counterexample').classification,'documented_white_nobility_counterexample');
assert.strictEqual(data.coordinationModels.find(x=>x.id==='black-nobility-secret-council').classification,'speculative');
assert.strictEqual(data.coordinationModels.find(x=>x.id==='ancient-bloodline-command').classification,'unsupported');
assert.strictEqual(data.coordinationModels.find(x=>x.id==='occult-apex-command').classification,'symbolic_or_metaphysical_not_verified');
for(const marker of ['THE CAPSTONE','BLACK NOBILITY &amp; THE SYMBOLIC APEX','SPECULATIVE CAPSTONE — NOT A COMMAND FINDING','THE HOUSE FILES','THE SYMBOLIC APEX','WHAT WOULD IT TAKE TO PROVE THE HIDDEN HAND?'])assert.ok(html.includes(marker),`HTML missing ${marker}`);
for(const marker of ['Capstone failed closed','cap-house-grid','cap-model-grid','cap-symbol-grid','data-cap-mode'])assert.ok(js.includes(marker),`renderer missing ${marker}`);
assert.ok(link.includes('behind-the-curtain-capstone.html'),'Pyramid gate must link to capstone');
assert.ok(link.includes('Speculative Capstone'),'Pyramid gate must label speculation');
assert.ok(pulse.includes('behind-the-curtain-capstone-link.js'),'Pyramid page must load capstone gate');
console.log(`Capstone test passed: ${data.houses.length} houses, ${data.coordinationModels.length} models, ${data.symbolicApex.length} symbolic dossiers and ${sources.length} sources.`);
