'use strict';

require('./install-consequence-evidence-worker.js');
require('./finalize-accountability-tracker-runtime.js');

const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');
const root=process.cwd();
const outputRoot=path.join(root,'_site');
const failures=[];
const warnings=[];
const file=(relative,base=root)=>path.join(base,relative);
const exists=(relative,base=root)=>fs.existsSync(file(relative,base));
const read=(relative,base=root)=>{if(!exists(relative,base))throw new Error(`Missing ${path.relative(root,file(relative,base))}`);return fs.readFileSync(file(relative,base),'utf8');};
const json=relative=>JSON.parse(read(relative));
const fail=message=>failures.push(message);

const required=['src/worker-consequence-tracker.js','src/worker-consequence-evidence.js','src/worker-production.js','scripts/install-consequence-evidence-worker.js','scripts/finalize-accountability-tracker-runtime.js','scripts/accountability-tracker-pressure-test.js','accountability-tracker-runtime.js','accountability-tracker-runtime.css','wrangler.toml','data/public-consequence-contracts.json','data/public-consequence-due-index.json','public-consequence-contracts.html','index.html','downloads/consequence-evidence-worker-install.json','downloads/accountability-tracker-runtime-report.json'];
for(const relative of required)if(!exists(relative))fail(`Missing ${relative}`);
for(const relative of ['src/worker-consequence-tracker.js','src/worker-consequence-evidence.js','src/worker-production.js','scripts/install-consequence-evidence-worker.js','scripts/finalize-accountability-tracker-runtime.js','scripts/accountability-tracker-pressure-test.js','accountability-tracker-runtime.js']){
  if(!exists(relative))continue;const result=spawnSync(process.execPath,['--check',file(relative)],{cwd:root,encoding:'utf8'});if(result.status!==0)fail(`${relative} syntax failed: ${result.stderr||result.stdout}`);
}
if(!failures.length){
  const production=read('src/worker-production.js');
  for(const marker of ["worker-consequence-tracker.js","worker-consequence-evidence.js",'isConsequenceTrackerRoute(path)','isConsequenceEvidenceRoute(path)','validateConsequenceTrackerResponse','validateConsequenceEvidenceResponse','consequenceTrackerWorker.scheduled'])if(!production.includes(marker))fail(`Production worker missing ${marker}`);
  const automatic=read('src/worker-consequence-tracker.js');
  for(const marker of ['MAX_MANIFEST_CONTRACTS = 12','MAX_DUE_PER_RUN = 4','consequence_contracts','consequence_contract_versions','consequence_review_queue','consequence_events','member_entity_follows','/api/member/consequence-events','locked-primary-decision-record','perFollowerWrites: 0','aiInferenceInsideWorker: false'])if(!automatic.includes(marker))fail(`Bounded tracker missing ${marker}`);
  const evidence=read('src/worker-consequence-evidence.js');
  for(const marker of ['consequence_contract_terms','consequence_evidence_items','consequence_outcome_assessments','official_record','counter_evidence','right_of_reply','does_not_establish','Every cited evidence record must be accepted','Published assessments require a named reviewer','Primary decision terms must be locked','checkpoint_assessed','/api/public/consequence-contracts','/api/public/consequence-due','/api/admin/consequence-contracts/lock','/api/admin/consequence-evidence','/api/admin/consequence-assessment'])if(!evidence.includes(marker))fail(`Evidence layer missing ${marker}`);
  if(!evidence.includes('[30,90,365].includes'))fail('Evidence layer does not enforce 30/90/365 checkpoints');
  const wrangler=read('wrangler.toml');if(!wrangler.includes('"5 6 * * *"'))fail('Daily Cloudflare checkpoint cron is missing');
  const ledger=json('data/public-consequence-contracts.json');if(!Array.isArray(ledger.contracts)||ledger.contracts.length<3)fail('Static consequence contract source is empty');
  for(const contract of ledger.contracts){const cadence=(contract.checkpoints||[]).map(item=>Number(item.daysAfterAction)).join(',');if(cadence!=='30,90,365')fail(`${contract.id} static cadence is not 30,90,365`);if(contract.outcomeVerdict!=='not-scored')fail(`${contract.id} contains a premature static verdict`);}
  for(const relative of ['index.html','public-consequence-contracts.html']){const html=read(relative);if(!html.includes('accountability-tracker-runtime.js')||!html.includes('accountability-tracker-runtime.css'))fail(`${relative} lacks live tracker runtime`);}
  const runtime=read('accountability-tracker-runtime.js');for(const marker of ['/api/public/consequence-contracts?limit=100','data-contract-id','Live D1 record','static-fallback'])if(!runtime.includes(marker))fail(`Public tracker runtime missing ${marker}`);
}
if(exists('_site'))for(const relative of ['index.html','public-consequence-contracts.html','accountability-tracker-runtime.js','accountability-tracker-runtime.css'])if(!exists(relative,outputRoot))fail(`Cloudflare output missing ${relative}`);
const report={ok:failures.length===0,generatedAt:new Date().toISOString(),failures,warnings,checks:{boundedDailyScheduler:failures.every(item=>!item.includes('Bounded tracker')&&!item.includes('cron')),persistentVersionHistory:failures.every(item=>!item.includes('contract_versions')),followedDashboardEvents:failures.every(item=>!item.includes('member_entity_follows')),classifiedEvidence:failures.every(item=>!item.includes('Evidence layer')),editorialVerdictGate:failures.every(item=>!item.includes('accepted')&&!item.includes('reviewer')&&!item.includes('terms')),publicLiveRuntime:failures.every(item=>!item.includes('runtime'))}};
fs.mkdirSync(path.join(root,'downloads'),{recursive:true});fs.writeFileSync(path.join(root,'downloads','accountability-tracker-pressure-test.json'),`${JSON.stringify(report,null,2)}\n`);if(exists('_site')){fs.mkdirSync(path.join(outputRoot,'downloads'),{recursive:true});fs.copyFileSync(path.join(root,'downloads','accountability-tracker-pressure-test.json'),path.join(outputRoot,'downloads','accountability-tracker-pressure-test.json'));}
if(failures.length){console.error('ACCOUNTABILITY TRACKER PRESSURE TEST FAILED');for(const item of failures)console.error(`- ${item}`);process.exit(1);}console.log(`Unified Accountability Twin tracker pressure test passed with ${warnings.length} warning(s).`);
