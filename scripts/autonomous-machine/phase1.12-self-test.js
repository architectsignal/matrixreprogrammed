#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {sha256,stableStringify}=require('./route-registry');
const {AuditLog}=require('./audit-log');
function hashBytes(value){return crypto.createHash('sha256').update(value).digest('hex');}
for (const [name, exports] of Object.entries({
  'production-change-request-store': { assertChangeRequestPayload: () => true },
  'production-change-decision-store': { assertDecisionPayload: () => true },
  'production-execution-plan-store': { assertExecutionPlanPayload: () => true },
  'production-execution-plan-decision-store': { assertExecutionPlanDecisionPayload: () => true },
  'production-execution-authorisation-request-store': { assertExecutionAuthorisationRequestPayload: () => true },
  'production-execution-authorisation-decision-store': { assertExecutionAuthorisationDecisionPayload: () => true },
  'production-execution-plan-builder': {
    inspectCandidate: (repositoryRoot, candidatePath) => {
      const filePath = path.join(repositoryRoot, candidatePath);
      if (!fs.existsSync(filePath)) return { exists: false, currentSha256: null, currentBytes: null };
      const stat = fs.statSync(filePath);
      return {
        exists: stat.isFile(),
        currentSha256: hashBytes(fs.readFileSync(filePath)),
        currentBytes: stat.size,
      };
    },
  },
})) {
  const resolved = require.resolve(`./${name}`);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}
const {ProductionExecutionTokenRequestStore,assertExecutionTokenRequestPayload}=require('./production-execution-token-request-store');
const {requestProductionExecutionToken}=require('./production-execution-token-request-service');
let checks=0; function check(fn){fn();checks+=1;} async function rejects(fn,re){let ok=false;try{await fn();}catch(e){ok=re.test(e.message);}assert.equal(ok,true);checks+=1;}
class FakeStore{constructor(records,valid=true){this.records=records;this.valid=valid;} verify(){return this.valid?{valid:true,records:this.records.length}:{valid:false,reason:'forced_invalid'};} readRecords(){return this.records;}}
const h=(x)=>sha256(x);
function makeChain(root,{rejected=false,changed=false,missing=false}={}){
  const primary='target-a.html', evidence='evidence-a.html';
  fs.writeFileSync(path.join(root,primary),changed?'alpha-changed':'alpha');
  if(!missing)fs.writeFileSync(path.join(root,evidence),'beta');
  const evidenceHash=hashBytes(Buffer.from('beta'));
  const primaryHash=hashBytes(Buffer.from('alpha'));
  const request={id:'change-request-1',recordHash:h('crr'),payloadHash:h('crp'),payload:{application:{id:'app-1',fingerprint:h('app')}}};
  const changeDecision={id:'change-decision-1',recordHash:h('cdr'),payloadHash:h('cdp'),payload:{decision:'approve',executionAuthorityGranted:false}};
  const targetMappings=[{targetId:'dossier:test',candidates:[
    {proposedRepositoryPath:primary,currentSha256:primaryHash,currentBytes:5},
    {proposedRepositoryPath:evidence,currentSha256:evidenceHash,currentBytes:4},
  ]}];
  const steps=[{sequence:1,targetId:'dossier:test',action:'manual_review_and_integrate_evidence',candidatePaths:[primary,evidence],executionAllowed:false,productionWriteAllowed:false}];
  const plan={id:'plan-1',recordHash:h('pr'),payloadHash:h('pp'),payload:{repositorySnapshot:{maxFileBytes:1024},targetMappings,executionPlan:{steps}}};
  const planDecision={id:'plan-decision-1',recordHash:h('pdr'),payloadHash:h('pdp'),payload:{decision:'approve',executionAuthorityGranted:false}};
  const authorisationRequest={id:'auth-request-1',recordHash:h('arr'),payloadHash:h('arp'),payload:{validity:{expiresAt:'2026-07-29T22:10:00.000Z'}}};
  const freshCandidates=[
    {proposedRepositoryPath:primary,currentSha256:primaryHash,currentBytes:5,requestSha256:primaryHash,requestBytes:5,matchRequest:true,writeAllowed:false},
    {proposedRepositoryPath:evidence,currentSha256:evidenceHash,currentBytes:4,requestSha256:evidenceHash,requestBytes:4,matchRequest:true,writeAllowed:false},
  ];
  const authorisationDecision={id:'auth-decision-1',recordHash:h('adr'),payloadHash:h('adp'),payload:{
    decision:rejected?'reject':'approve',status:rejected?'rejected_execution_authorisation_no_authorisation':'approved_execution_authorisation_record_only',
    readyForExecution:false,executionAuthorityGranted:false,authorisationGranted:false,
    authorisationRequest:{id:authorisationRequest.id,recordHash:authorisationRequest.recordHash,payloadHash:authorisationRequest.payloadHash,executionPlanDecisionId:planDecision.id,executionPlanId:plan.id,sourceDecisionId:changeDecision.id,changeRequestId:request.id,applicationId:'app-1',applicationFingerprint:h('app'),candidateSnapshotHash:h(stableStringify(targetMappings)),executionStepsHash:h(stableStringify(steps)),requestFreshSnapshotHash:h('request-fresh'),rollbackManifestHash:h('rollback')},
    validityReview:{requestExpiresAt:'2026-07-29T22:10:00.000Z'},
    freshRecheck:{required:true,allMatchRequest:true,snapshotHash:h(stableStringify(freshCandidates)),candidates:freshCandidates},
    backupVerification:{required:true,allVerified:true,manifestHash:h('backup')},
    restoreRehearsal:{required:true,allVerified:true,manifestHash:h('restore')},
  }};
  return {request,changeDecision,plan,planDecision,authorisationRequest,authorisationDecision};
}
function baseOptions(root,chain,tokenStore,audit,clock){const key='k'.repeat(40);return {executionAuthorisationDecisionId:chain.authorisationDecision.id,changeRequestStore:new FakeStore([chain.request]),changeDecisionStore:new FakeStore([chain.changeDecision]),planStore:new FakeStore([chain.plan]),planDecisionStore:new FakeStore([chain.planDecision]),authorisationRequestStore:new FakeStore([chain.authorisationRequest]),authorisationDecisionStore:new FakeStore([chain.authorisationDecision]),tokenRequestStore:tokenStore,auditLog:audit,repositoryRoot:root,changeRequestSigningKey:key,changeDecisionSigningKey:key,planSigningKey:key,planDecisionSigningKey:key,authorisationRequestSigningKey:key,authorisationDecisionSigningKey:key,tokenRequestSigningKey:key,requesterName:'phase112-requester',requesterRole:'production-owner',requesterNote:'Request a single-use token review record only.',durationSeconds:120,clock};}
(async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'phase112-repo-')); const runtime=path.join(root,'.autonomous-machine');fs.mkdirSync(runtime,{recursive:true});
  const chain=makeChain(root); const storePath=path.join(runtime,'token-requests.jsonl'); const tokenStore=new ProductionExecutionTokenRequestStore(storePath); const audit=new AuditLog(path.join(runtime,'audit.jsonl')); const sentinel=path.join(root,'production-sentinel.json');fs.writeFileSync(sentinel,'{"safe":true}');const sentinelHash=hashBytes(fs.readFileSync(sentinel));
  const clock=()=>new Date('2026-07-29T22:02:00.000Z'); const base=baseOptions(root,chain,tokenStore,audit,clock);
  await rejects(()=>requestProductionExecutionToken({...base,tokenRequestSigningKey:'short'}),/at least 32 bytes/);
  await rejects(()=>requestProductionExecutionToken({...base,executionAuthorisationDecisionId:''}),/executionAuthorisationDecisionId/);
  await rejects(()=>requestProductionExecutionToken({...base,requesterName:''}),/requesterName/);
  await rejects(()=>requestProductionExecutionToken({...base,requesterRole:''}),/requesterRole/);
  await rejects(()=>requestProductionExecutionToken({...base,requesterNote:'short'}),/requesterNote/);
  await rejects(()=>requestProductionExecutionToken({...base,durationSeconds:29}),/durationSeconds/);
  await rejects(()=>requestProductionExecutionToken({...base,durationSeconds:301}),/durationSeconds/);
  const result=requestProductionExecutionToken(base);
  check(()=>assert.equal(result.tokenIssued,false));check(()=>assert.equal(result.readyForExecution,false));check(()=>assert.equal(result.executionAuthorityGranted,false));check(()=>assert.equal(result.candidateCount,2));check(()=>assert.equal(result.operationCount,1));check(()=>assert.equal(result.expiresAt,'2026-07-29T22:04:00.000Z'));check(()=>assert.equal(result.productionWrites,0));check(()=>assert.equal(tokenStore.readRecords().length,1));check(()=>assert.equal(tokenStore.verify('k'.repeat(40)).valid,true));check(()=>assert.equal(tokenStore.verify('z'.repeat(40)).valid,false));check(()=>assert.equal(fs.readFileSync(storePath,'utf8').includes('k'.repeat(40)),false));
  const rec=tokenStore.readRecords()[0];
  check(()=>assert.equal(assertExecutionTokenRequestPayload(rec.payload),true));check(()=>assert.equal(rec.payload.authority,'single_use_execution_token_request_only_no_token_or_execution_authority'));check(()=>assert.equal(rec.payload.status,'pending_manual_single_use_execution_token_review'));check(()=>assert.equal(rec.payload.validity.durationSeconds,120));check(()=>assert.equal(rec.payload.validity.singleUseRequested,true));check(()=>assert.equal(rec.payload.tokenState.tokenMaterialIssued,false));check(()=>assert.equal(rec.payload.tokenState.tokenDigest,null));check(()=>assert.equal(rec.payload.tokenState.tokenId,null));check(()=>assert.equal(rec.payload.tokenState.consumed,false));check(()=>assert.equal(rec.payload.tokenState.useCount,0));check(()=>assert.equal(rec.payload.tokenState.maxUses,1));check(()=>assert.equal(rec.payload.finalSnapshot.allMatchAuthorisationDecision,true));check(()=>assert.equal(rec.payload.finalSnapshot.candidates.length,2));check(()=>assert.equal(rec.payload.scope.operationCount,1));check(()=>assert.equal(rec.payload.scope.candidateCount,2));check(()=>assert.equal(rec.payload.scope.operations[0].operation,'manual_review_and_integrate_evidence'));check(()=>assert.equal(rec.payload.scope.operations[0].executionAllowed,false));check(()=>assert.equal(rec.payload.productionFilePath,null));check(()=>assert.equal(rec.payload.productionDestinationResolved,false));check(()=>assert.equal(rec.payload.finalDestinationConfirmed,false));check(()=>assert.equal(rec.payload.tokenIssued,false));check(()=>assert.equal(rec.payload.executionTokenAvailable,false));check(()=>assert.equal(rec.payload.safety.executionAllowed,false));check(()=>assert.equal(rec.payload.safety.productionWriteAllowed,false));
  const dup=requestProductionExecutionToken(base);check(()=>assert.equal(dup.idempotent,true));check(()=>assert.equal(dup.executionTokenRequestId,result.executionTokenRequestId));check(()=>assert.equal(tokenStore.readRecords().length,1));
  await rejects(()=>requestProductionExecutionToken({...base,requesterNote:'Different rationale must not replace the signed token request.'}),/different signed/);
  await rejects(()=>requestProductionExecutionToken({...base,clock:()=>new Date('2026-07-29T22:05:00.000Z')}),/expired/);
  const rejectedRoot=fs.mkdtempSync(path.join(os.tmpdir(),'phase112-rejected-')); const rejected=makeChain(rejectedRoot,{rejected:true});await rejects(()=>requestProductionExecutionToken(baseOptions(rejectedRoot,rejected,new ProductionExecutionTokenRequestStore(path.join(rejectedRoot,'tokens.jsonl')),new AuditLog(path.join(rejectedRoot,'audit.jsonl')),clock)),/approved, verified/);
  const changedRoot=fs.mkdtempSync(path.join(os.tmpdir(),'phase112-changed-')); const changed=makeChain(changedRoot,{changed:true});await rejects(()=>requestProductionExecutionToken(baseOptions(changedRoot,changed,new ProductionExecutionTokenRequestStore(path.join(changedRoot,'tokens.jsonl')),new AuditLog(path.join(changedRoot,'audit.jsonl')),clock)),/Final execution-token hash/);
  const missingRoot=fs.mkdtempSync(path.join(os.tmpdir(),'phase112-missing-')); const missing=makeChain(missingRoot,{missing:true});await rejects(()=>requestProductionExecutionToken(baseOptions(missingRoot,missing,new ProductionExecutionTokenRequestStore(path.join(missingRoot,'tokens.jsonl')),new AuditLog(path.join(missingRoot,'audit.jsonl')),clock)),/Final execution-token hash/);
  await rejects(()=>requestProductionExecutionToken({...base,durationSeconds:300,clock:()=>new Date('2026-07-29T22:06:00.000Z'),tokenRequestStore:new ProductionExecutionTokenRequestStore(path.join(runtime,'window.jsonl'))}),/exceeds the remaining/);
  await rejects(()=>requestProductionExecutionToken({...base,planStore:new FakeStore([chain.plan],false),tokenRequestStore:new ProductionExecutionTokenRequestStore(path.join(runtime,'invalid.jsonl'))}),/Production execution plan ledger verification failed/);
  const tampered=JSON.parse(fs.readFileSync(storePath,'utf8').trim());tampered.payload.requester.note='tampered';const tamperedPath=path.join(runtime,'tampered.jsonl');fs.writeFileSync(tamperedPath,`${JSON.stringify(tampered)}\n`);check(()=>assert.equal(new ProductionExecutionTokenRequestStore(tamperedPath).verify('k'.repeat(40)).valid,false));
  const mutated=JSON.parse(JSON.stringify(rec.payload));mutated.tokenState.tokenMaterialIssued=true;check(()=>assert.throws(()=>assertExecutionTokenRequestPayload(mutated),/cannot issue/));
  const mutated2=JSON.parse(JSON.stringify(rec.payload));mutated2.scope.operations[0].candidateHashes[0].sha256=h('wrong');check(()=>assert.throws(()=>assertExecutionTokenRequestPayload(mutated2),/does not match final snapshot/));
  check(()=>assert.equal(audit.verify().valid,true));check(()=>assert.equal(audit.readEntries().every(e=>e.details.tokenIssued===false&&e.details.readyForExecution===false&&e.details.executionAuthorityGranted===false&&e.details.productionWrites===0),true));check(()=>assert.equal(hashBytes(fs.readFileSync(sentinel)),sentinelHash));check(()=>assert.equal(fs.existsSync(path.join(root,'.git','index.lock')),false));check(()=>assert.equal(fs.existsSync(path.join(root,'deploy')),false));
  console.log(JSON.stringify({ok:true,tests:checks,signedExecutionTokenRequests:tokenStore.readRecords().length,candidates:result.candidateCount,operations:result.operationCount,tokenIssued:false,readyForExecution:false,executionAuthorityGranted:false,productionWrites:0,publicationTasksCreated:0,commitActions:0,deploymentActions:0,auditEntries:audit.verify().entries},null,2));
})().catch(e=>{console.error(e.stack||e);process.exit(1);});
