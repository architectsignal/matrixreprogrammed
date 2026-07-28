'use strict';

require('./install-accountability-tracker-worker.js');
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

const required=['src/worker-accountability-tracker.js','src/worker-production.js','scripts/install-accountability-tracker-worker.js','scripts/finalize-accountability-tracker-runtime.js','scripts/accountability-tracker-pressure-test.js','accountability-tracker-runtime.js','accountability-tracker-runtime.css','wrangler.toml','data/public-consequence-contracts.json','public-consequence-contracts.html','index.html','downloads/accountability-tracker-worker-install.json','downloads/accountability-tracker-runtime-report.json'];
for(const relative of required)if(!exists(relative))fail(`Missing ${relative}`);
for(const relative of ['src/worker-accountability-tracker.js','src/worker-production.js','scripts/install-accountability-tracker-worker.js','scripts/finalize-accountability-tracker-runtime.js','scripts/accountability-tracker-pressure-test.js','accountability-tracker-runtime.js']){
  if(!exists(relative))continue;const result=spawnSync(process.execPath,['--check',file(relative)],{cwd:root,encoding:'utf8'});if(result.status!==0)fail(`${relative} syntax failed: ${result.stderr||result.stdout}`);
}
if(!failures.length){
  const production=read('src/worker-production.js');
  for(const marker of ["worker-accountability-tracker.js",'isAccountabilityTrackerRoute(path)','validateAccountabilityTrackerResponse','runAccountabilityTracker(env',"processOutbox(env, { limit: 100 })"])if(!production.includes(marker))fail(`Production worker missing ${marker}`);
  const worker=read('src/worker-accountability-tracker.js');
  for(const marker of ['accountability_contracts','accountability_contract_versions','accountability_contract_terms','accountability_checkpoints','accountability_review_queue','accountability_evidence_events','accountability_outcome_assessments','accountability_notification_receipts','accountability_tracker_runs','member_entity_follows','email_outbox','email_suppressions','/api/accountability/health','/api/accountability/contracts','/api/accountability/due','/api/accountability/admin/run','locked-primary-record','Every cited evidence ID must be accepted','Published assessments require a named reviewer','accountability-checkpoint-due','accountability-outcome-published'])if(!worker.includes(marker))fail(`Tracker worker missing ${marker}`);
  if(!worker.includes("[30,90,365].includes"))fail('Tracker does not enforce 30/90/365 checkpoint cadence');
  if(!worker.includes("outcomeVerdict:row.outcome_verdict")||!worker.includes("outcome_verdict=accountability_contracts.outcome_verdict"))fail('Tracker does not preserve the no-premature-overwrite outcome boundary');
  const wrangler=read('wrangler.toml');if(!wrangler.includes('"35 * * * *"'))fail('Hourly Cloudflare cron required for checkpoint tracking is missing');
  const ledger=json('data/public-consequence-contracts.json');if(!Array.isArray(ledger.contracts)||ledger.contracts.length<3)fail('Static consequence contract source is empty');
  for(const contract of ledger.contracts){const cadence=(contract.checkpoints||[]).map(item=>Number(item.daysAfterAction)).join(',');if(cadence!=='30,90,365')fail(`${contract.id} static cadence is not 30/90/365`);if(contract.outcomeVerdict!=='not-scored')fail(`${contract.id} contains a premature static verdict`);}
  for(const relative of ['index.html','public-consequence-contracts.html']){const html=read(relative);if(!html.includes('accountability-tracker-runtime.js')||!html.includes('accountability-tracker-runtime.css'))fail(`${relative} lacks live tracker runtime`);}
  const runtime=read('accountability-tracker-runtime.js');for(const marker of ['/api/accountability/contracts?limit=200','data-contract-id','Live D1 record','static-fallback'])if(!runtime.includes(marker))fail(`Public tracker runtime missing ${marker}`);
}
if(exists('_site'))for(const relative of ['index.html','public-consequence-contracts.html','accountability-tracker-runtime.js','accountability-tracker-runtime.css'])if(!exists(relative,outputRoot))fail(`Cloudflare output missing ${relative}`);
const report={ok:failures.length===0,generatedAt:new Date().toISOString(),failures,warnings,checks:{persistentD1History:failures.every(item=>!item.includes('contract_versions')),hourlyCheckpointQueue:failures.every(item=>!item.includes('cron')),followNotifications:failures.every(item=>!item.includes('member_entity_follows')&&!item.includes('email_outbox')),editorialVerdictGate:failures.every(item=>!item.includes('accepted')&&!item.includes('reviewer')),publicLiveRuntime:failures.every(item=>!item.includes('runtime'))}};
fs.mkdirSync(path.join(root,'downloads'),{recursive:true});fs.writeFileSync(path.join(root,'downloads','accountability-tracker-pressure-test.json'),`${JSON.stringify(report,null,2)}\n`);if(exists('_site')){fs.mkdirSync(path.join(outputRoot,'downloads'),{recursive:true});fs.copyFileSync(path.join(root,'downloads','accountability-tracker-pressure-test.json'),path.join(outputRoot,'downloads','accountability-tracker-pressure-test.json'));}
if(failures.length){console.error('ACCOUNTABILITY TRACKER PRESSURE TEST FAILED');for(const item of failures)console.error(`- ${item}`);process.exit(1);}console.log(`Accountability tracker pressure test passed with ${warnings.length} warning(s).`);
