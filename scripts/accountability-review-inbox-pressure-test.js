'use strict';

require('./finalize-accountability-review-inbox.js');

const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');
const root=process.cwd();
const outputRoot=path.join(root,'_site');
const failures=[];
const exists=(relative,base=root)=>fs.existsSync(path.join(base,relative));
const read=(relative,base=root)=>{const file=path.join(base,relative);if(!fs.existsSync(file))throw new Error(`Missing ${path.relative(root,file)}`);return fs.readFileSync(file,'utf8');};
const fail=message=>failures.push(message);

for(const relative of ['accountability-review-inbox.html','accountability-review-inbox.js','review-dashboard.html','src/worker-consequence-evidence.js','scripts/finalize-accountability-review-inbox.js','scripts/accountability-review-inbox-pressure-test.js','downloads/accountability-review-inbox-report.json'])if(!exists(relative))fail(`Missing ${relative}`);
for(const relative of ['accountability-review-inbox.js','src/worker-consequence-evidence.js','scripts/finalize-accountability-review-inbox.js','scripts/accountability-review-inbox-pressure-test.js']){if(!exists(relative))continue;const result=spawnSync(process.execPath,['--check',path.join(root,relative)],{cwd:root,encoding:'utf8'});if(result.status!==0)fail(`${relative} syntax failed: ${result.stderr||result.stdout}`);}

if(!failures.length){
  const page=read('accountability-review-inbox.html');
  const client=read('accountability-review-inbox.js');
  const worker=read('src/worker-consequence-evidence.js');
  const dashboard=read('review-dashboard.html');
  for(const marker of ['id="review-queue"','id="review-workspace"','id="terms-form"','id="evidence-form"','id="assessment-form"','id="admin-token"','noindex,nofollow,noarchive','A due checkpoint is not a verdict','What this does not establish','Named reviewer'])if(!page.includes(marker))fail(`Review inbox page missing ${marker}`);
  for(const marker of ["api('/api/public/consequence-due')",'/api/public/consequence-contracts/',"'/api/admin/consequence-contracts/lock'","'/api/admin/consequence-evidence'","'/api/admin/consequence-assessment'",'x-admin-token','evidenceIds','doesNotEstablish','primarySourceUrls','measurableSuccess'])if(!client.includes(marker))fail(`Review inbox client missing ${marker}`);
  if(/localStorage|sessionStorage|document\.cookie/.test(client))fail('Administrator token or review state may be persisted in the browser');
  for(const marker of ['/api/public/consequence-due','/api/public/consequence-contracts','/api/admin/consequence-contracts/lock','/api/admin/consequence-evidence','/api/admin/consequence-assessment','Primary decision terms must be locked','Every cited evidence record must be accepted','Published assessments require a named reviewer','does_not_establish','right_of_reply','counter_evidence'])if(!worker.includes(marker))fail(`Consequence evidence worker missing ${marker}`);
  if(!dashboard.includes('href="accountability-review-inbox.html"'))fail('Review dashboard does not link to Accountability Review Inbox');
}
if(exists('_site'))for(const relative of ['accountability-review-inbox.html','accountability-review-inbox.js','review-dashboard.html'])if(!exists(relative,outputRoot))fail(`Cloudflare output missing ${relative}`);
const report={ok:failures.length===0,generatedAt:new Date().toISOString(),failures,checks:{humanRouteDiscoverable:failures.every(item=>!item.includes('Review dashboard')),tokenMemoryOnly:failures.every(item=>!item.includes('persisted')),threeStageWorkflow:failures.every(item=>!item.includes('form')&&!item.includes('client')),editorialGates:failures.every(item=>!item.includes('worker')),cloudflareParity:failures.every(item=>!item.includes('Cloudflare'))}};
fs.mkdirSync(path.join(root,'downloads'),{recursive:true});fs.writeFileSync(path.join(root,'downloads','accountability-review-inbox-pressure-test.json'),`${JSON.stringify(report,null,2)}\n`);if(exists('_site')){fs.mkdirSync(path.join(outputRoot,'downloads'),{recursive:true});fs.copyFileSync(path.join(root,'downloads','accountability-review-inbox-pressure-test.json'),path.join(outputRoot,'downloads','accountability-review-inbox-pressure-test.json'));}
if(failures.length){console.error('ACCOUNTABILITY REVIEW INBOX PRESSURE TEST FAILED');for(const item of failures)console.error(`- ${item}`);process.exit(1);}console.log('Accountability Review Inbox pressure test passed.');
