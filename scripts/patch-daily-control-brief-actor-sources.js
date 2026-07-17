const fs = require('fs');
const path = require('path');

const root = process.cwd();
const workerPath = path.join(root, 'src', 'worker-email-lifecycle.js');
if (!fs.existsSync(workerPath)) throw new Error('Email lifecycle Worker is missing');

let source = fs.readFileSync(workerPath, 'utf8');
const before = source;

if (!source.includes('...arrayValue(command.topBillionaires)')) {
  const pattern = /function actorRows\(bundle\)\{[\s\S]*?\}\nfunction developmentRows/;
  if (!pattern.test(source)) throw new Error('Daily Control Brief actorRows function was not found');
  const enhanced = `function actorRows(bundle){const command=objectValue(bundle.command);const synthesis=objectValue(bundle.synthesis);const daily=objectValue(bundle.daily);const candidates=[...arrayValue(command.actorMap),...arrayValue(daily.namedActors),...arrayValue(daily.actorMap),...arrayValue(objectValue(synthesis.inferenceLayer).actorMap),...arrayValue(command.topBillionaires),...arrayValue(command.topContractors),...arrayValue(command.topEntityChanges)];return uniqueRows(candidates.map(actor=>{actor=objectValue(actor);const name=clean(actor.name||actor.title||actor.label,180);const ecosystems=arrayValue(actor.ecosystems).map(item=>clean(item,100)).filter(Boolean);const layers=arrayValue(actor.control_layers).map(item=>clean(item,100)).filter(Boolean);const latest=arrayValue(actor.latest_records).map(item=>clean(objectValue(item).title||item,180)).filter(Boolean);const role=clean(actor.documentedRole||actor.role||actor.roleGroup||actor.type||(ecosystems.length?'Infrastructure and institutional ecosystem watch':'Named in the current record set'),420);const context=clean(arrayValue(actor.summaries).join(' ')||actor.summary||actor.significance||actor.whyItMatters||actor.judgement||(ecosystems.length?\`Ecosystems: \${ecosystems.join(', ')}.\`:'')||(layers.length?\`Control layers: \${layers.join(', ')}.\`:'')||(latest.length?\`Latest record: \${latest[0]}.\`:''),620);const route=clean(actor.route||actor.evidenceRoute||actor.publicRoute||'',300);return{name,role,context,route}}).filter(actor=>actor.name&&!/^(?:unknown|unnamed|actor|institution|company|agency|person|signal)$/i.test(actor.name)),'name').slice(0,10)}\nfunction developmentRows`;
  source = source.replace(pattern, enhanced);
}

for (const marker of ['command.topBillionaires', 'command.topContractors', 'command.topEntityChanges', 'actor.judgement', 'actor.ecosystems']) {
  if (!source.includes(marker)) throw new Error(`Named actor source marker missing: ${marker}`);
}

if (source !== before) fs.writeFileSync(workerPath, source);
console.log(`Daily Control Brief named actor sources ${source !== before ? 'expanded' : 'already current'}.`);
