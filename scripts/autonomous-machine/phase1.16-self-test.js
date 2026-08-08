#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {sha256,stableStringify}=require('./route-registry');
function hashBytes(v){return crypto.createHash('sha256').update(v).digest('hex');}
for (const [name, exports] of Object.entries({
  'production-change-request-store': { assertChangeRequestPayload: () => true },
  'production-change-decision-store': { assertDecisionPayload: () => true },
  'production-execution-plan-store': { assertExecutionPlanPayload: () => true },
  'production-execution-plan-decision-store': { assertExecutionPlanDecisionPayload: () => true },
  'production-execution-authorisation-request-store': { assertExecutionAuthorisationRequestPayload: () => true },
  'production-execution-authorisation-decision-store': { assertExecutionAuthorisationDecisionPayload: () => true },
  'production-execution-token-request-store': { assertExecutionTokenRequestPayload: () => true },
  'production-execution-token-decision-store': { assertExecutionTokenDecisionPayload: () => true },
  'production-execution-token-issuance-request-store': { assertExecutionTokenIssuanceRequestPayload: () => true },
  'production-execution-token-issuance-decision-store': { assertExecutionTokenIssuanceDecisionPayload: () => true },
  'production-execution-plan-builder': {
    inspectCandidate: (repositoryRoot, candidatePath) => {
      const filePath = path.join(repositoryRoot, candidatePath);
      if (!fs.existsSync(filePath)) return { exists: false, currentSha256: null, currentBytes: null };
      const bytes = fs.readFileSync(filePath);
      return { exists: true, currentSha256: hashBytes(bytes), currentBytes: bytes.length };
    },
  },
})) {
  const resolved = require.resolve(`./${name}`);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}
const {ProductionExecutionTokenMaterialGenerationRequestStore,assertTokenMaterialGenerationRequestPayload}=require('./production-execution-token-material-generation-request-store');
const {requestProductionExecutionTokenMaterialGeneration}=require('./production-execution-token-material-generation-request-service');
class FakeStore{constructor(records,valid=true){this.records=records;this.valid=valid;} verify(){return this.valid?{valid:true,records:this.records.length}:{valid:false,reason:'forced_invalid'};} readRecords(){return this.records;}}
class AuditLog{constructor(fp){this.fp=fp;this.entries=[];}append(type,details,actor){this.entries.push({type,details,actor});fs.writeFileSync(this.fp,JSON.stringify(this.entries));}verify(){return{valid:true,entries:this.entries.length};}readEntries(){return this.entries;}}
const h=v=>sha256(v);
function makeChain(root,opt={}){
 const a='target-a.html',b='evidence-a.html';fs.writeFileSync(path.join(root,a),opt.changed?'alpha-changed':'alpha');if(!opt.missing)fs.writeFileSync(path.join(root,b),'beta');
 const ah=hashBytes(Buffer.from('alpha')),bh=hashBytes(Buffer.from('beta'));
 const cr={id:'cr1',recordHash:h('crr'),payloadHash:h('crp'),payload:{application:{id:'app1',fingerprint:h('app')}}};
 const cd={id:'cd1',recordHash:h('cdr'),payloadHash:h('cdp'),payload:{decision:'approve',executionAuthorityGranted:false}};
 const mappings=[{targetId:'dossier:test',candidates:[{proposedRepositoryPath:a,currentSha256:ah,currentBytes:5},{proposedRepositoryPath:b,currentSha256:bh,currentBytes:4}]}];
 const steps=[{sequence:1,targetId:'dossier:test',action:'manual_review_and_integrate_evidence',candidatePaths:[a,b],executionAllowed:false,productionWriteAllowed:false}];
 const plan={id:'plan1',recordHash:h('pr'),payloadHash:h('pp'),payload:{repositorySnapshot:{maxFileBytes:1024},targetMappings:mappings,executionPlan:{steps}}};
 const pd={id:'pd1',recordHash:h('pdr'),payloadHash:h('pdp'),payload:{decision:'approve',executionAuthorityGranted:false}};
 const ar={id:'ar1',recordHash:h('arr'),payloadHash:h('arp'),payload:{validity:{expiresAt:'2026-07-30T00:40:00.000Z'}}};
 const ad={id:'ad1',recordHash:h('adr'),payloadHash:h('adp'),payload:{decision:'approve',executionAuthorityGranted:false,authorisationGranted:false}};
 const operations=[{sequence:1,targetId:'dossier:test',operation:opt.scopeChanged?'wrong':'manual_review_and_integrate_evidence',candidatePaths:[a,b],candidateHashes:[{proposedRepositoryPath:a,sha256:ah,bytes:5},{proposedRepositoryPath:b,sha256:bh,bytes:4}],executionAllowed:false,productionWriteAllowed:false}];
 const scopeHash=h(stableStringify({targetIds:['dossier:test'],operations}));
 const tr={id:'tr1',recordHash:h('trr'),payloadHash:h('trp'),payload:{validity:{expiresAt:'2026-07-30T00:35:00.000Z',upstreamExpiresAt:'2026-07-30T00:40:00.000Z'}}};
 const td={id:'td1',recordHash:h('tdr'),payloadHash:h('tdp'),payload:{decision:'approve',executionAuthorityGranted:false,tokenIssued:false,executionTokenAvailable:false}};
 const irCandidates=[{proposedRepositoryPath:a,currentSha256:ah,currentBytes:5},{proposedRepositoryPath:b,currentSha256:bh,currentBytes:4}];
 const ir={id:'ir1',recordHash:h('irr'),payloadHash:h('irp'),payload:{validity:{validFrom:'2026-07-30T00:30:00.000Z',expiresAt:'2026-07-30T00:30:30.000Z',tokenRequestExpiresAt:'2026-07-30T00:35:00.000Z',upstreamExpiresAt:'2026-07-30T00:40:00.000Z'},scope:{recomputedScopeHash:scopeHash,tokenRequestScopeHash:scopeHash,tokenDecisionScopeHash:scopeHash,targetIds:['dossier:test'],operations},lastMomentPreflight:{snapshotHash:h(stableStringify(irCandidates)),candidates:irCandidates}}};
 const finalCandidates=irCandidates.map(c=>({...c,issuanceRequestSha256:c.currentSha256,issuanceRequestBytes:c.currentBytes,matchIssuanceRequest:true,writeAllowed:false}));
 const id={id:'id1',recordHash:h('idr'),payloadHash:h('idp'),payload:{decision:'approve',status:'approved_execution_token_issuance_request_record_only',readyForExecution:false,executionAuthorityGranted:false,authorisationGranted:false,tokenIssued:false,executionTokenAvailable:false,issuanceState:{tokenMaterialIssued:false,bearerSecretIssued:false},issuanceRequest:{id:ir.id,recordHash:ir.recordHash,payloadHash:ir.payloadHash,tokenDecisionId:td.id,tokenRequestId:tr.id,authorisationDecisionId:ad.id,authorisationRequestId:ar.id,executionPlanDecisionId:pd.id,executionPlanId:plan.id,sourceDecisionId:cd.id,changeRequestId:cr.id,applicationId:'app1',applicationFingerprint:h('app'),requestScopeHash:scopeHash,decisionScopeHash:scopeHash,issuanceScopeHash:scopeHash,requestFinalSnapshotHash:h('rfs'),decisionPreflightSnapshotHash:h('dps'),issuancePreflightSnapshotHash:ir.payload.lastMomentPreflight.snapshotHash,candidateSnapshotHash:h(stableStringify(mappings)),executionStepsHash:h(stableStringify(steps)),backupManifestHash:h('backup'),restoreManifestHash:h('restore')},finalPreflight:{required:true,allMatchIssuanceRequest:true,snapshotHash:h(stableStringify(finalCandidates)),candidates:finalCandidates},scopeReview:{required:true,exactScopeMatch:true,issuanceRequestScopeHash:scopeHash,recomputedScopeHash:scopeHash,operations},targetIds:['dossier:test']}};
 return{cr,cd,plan,pd,ar,ad,tr,td,ir,id};
}
function opts(root,c,store,audit,clock){const key='k'.repeat(40);return{executionTokenIssuanceDecisionId:c.id.id,changeRequestStore:new FakeStore([c.cr]),changeDecisionStore:new FakeStore([c.cd]),planStore:new FakeStore([c.plan]),planDecisionStore:new FakeStore([c.pd]),authorisationRequestStore:new FakeStore([c.ar]),authorisationDecisionStore:new FakeStore([c.ad]),tokenRequestStore:new FakeStore([c.tr]),tokenDecisionStore:new FakeStore([c.td]),tokenIssuanceRequestStore:new FakeStore([c.ir]),tokenIssuanceDecisionStore:new FakeStore([c.id]),tokenMaterialGenerationRequestStore:store,auditLog:audit,repositoryRoot:root,changeRequestSigningKey:key,changeDecisionSigningKey:key,planSigningKey:key,planDecisionSigningKey:key,authorisationRequestSigningKey:key,authorisationDecisionSigningKey:key,tokenRequestSigningKey:key,tokenDecisionSigningKey:key,tokenIssuanceRequestSigningKey:key,tokenIssuanceDecisionSigningKey:key,tokenMaterialGenerationRequestSigningKey:key,requesterName:'phase116-requester',requesterRole:'production-owner',requesterNote:'Request a separate token material generation review without generating any secret.',durationSeconds:10,clock};}
let checks=0;function check(fn){fn();checks++;}async function rejects(fn,re){let ok=false;try{await fn();}catch(e){ok=re.test(e.message);}assert.equal(ok,true,re);checks++;}
(async()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'p116-'));const c=makeChain(root);const store=new ProductionExecutionTokenMaterialGenerationRequestStore(path.join(root,'g.jsonl'));const audit=new AuditLog(path.join(root,'a.json'));const clock=()=>new Date('2026-07-30T00:30:10.000Z');const base=opts(root,c,store,audit,clock);
 await rejects(()=>requestProductionExecutionTokenMaterialGeneration({...base,tokenMaterialGenerationRequestSigningKey:'short'}),/at least 32 bytes/);
 await rejects(()=>requestProductionExecutionTokenMaterialGeneration({...base,durationSeconds:4}),/between 5 and 30/);
 await rejects(()=>requestProductionExecutionTokenMaterialGeneration({...base,durationSeconds:31}),/between 5 and 30/);
 await rejects(()=>requestProductionExecutionTokenMaterialGeneration({...base,requesterNote:'short'}),/requesterNote/);
 const result=requestProductionExecutionTokenMaterialGeneration(base);
 check(()=>assert.equal(result.generationRequested,true));check(()=>assert.equal(result.entropyGenerated,false));check(()=>assert.equal(result.tokenMaterialGenerated,false));check(()=>assert.equal(result.tokenMaterialIssued,false));check(()=>assert.equal(result.bearerSecretGenerated,false));check(()=>assert.equal(result.bearerSecretIssued,false));check(()=>assert.equal(result.executionAuthorityGranted,false));check(()=>assert.equal(result.productionWrites,0));check(()=>assert.equal(result.candidateCount,2));check(()=>assert.equal(result.operationCount,1));
 check(()=>assert.equal(store.verify('k'.repeat(40)).valid,true));check(()=>assert.equal(store.verify('z'.repeat(40)).valid,false));const rec=store.readRecords()[0];check(()=>assert.equal(assertTokenMaterialGenerationRequestPayload(rec.payload),true));check(()=>assert.equal(rec.payload.status,'pending_manual_token_material_generation_review'));check(()=>assert.equal(rec.payload.generationState.entropyGenerated,false));check(()=>assert.equal(rec.payload.generationState.tokenMaterialGenerated,false));check(()=>assert.equal(rec.payload.generationState.tokenDigest,null));check(()=>assert.equal(rec.payload.generationState.tokenId,null));check(()=>assert.equal(rec.payload.nextAction,'separate_human_token_material_generation_decision_no_secret'));
 const dup=requestProductionExecutionTokenMaterialGeneration(base);check(()=>assert.equal(dup.idempotent,true));await rejects(()=>requestProductionExecutionTokenMaterialGeneration({...base,requesterNote:'A different generation request rationale that must conflict.'}),/different signed/);
 await rejects(()=>requestProductionExecutionTokenMaterialGeneration({...base,clock:()=>new Date('2026-07-30T00:30:30.000Z'),tokenMaterialGenerationRequestStore:new ProductionExecutionTokenMaterialGenerationRequestStore(path.join(root,'expired.jsonl'))}),/at least 5 seconds/);
 await rejects(()=>requestProductionExecutionTokenMaterialGeneration({...base,durationSeconds:25,tokenMaterialGenerationRequestStore:new ProductionExecutionTokenMaterialGenerationRequestStore(path.join(root,'long.jsonl'))}),/exceeds remaining/);
 const cr=fs.mkdtempSync(path.join(os.tmpdir(),'p116c-'));const cc=makeChain(cr,{changed:true});await rejects(()=>requestProductionExecutionTokenMaterialGeneration(opts(cr,cc,new ProductionExecutionTokenMaterialGenerationRequestStore(path.join(cr,'g.jsonl')),new AuditLog(path.join(cr,'a.json')),clock)),/Last-moment/);
 const mr=fs.mkdtempSync(path.join(os.tmpdir(),'p116m-'));const mc=makeChain(mr,{missing:true});await rejects(()=>requestProductionExecutionTokenMaterialGeneration(opts(mr,mc,new ProductionExecutionTokenMaterialGenerationRequestStore(path.join(mr,'g.jsonl')),new AuditLog(path.join(mr,'a.json')),clock)),/Last-moment/);
 const sr=fs.mkdtempSync(path.join(os.tmpdir(),'p116s-'));const sc=makeChain(sr,{scopeChanged:true});await rejects(()=>requestProductionExecutionTokenMaterialGeneration(opts(sr,sc,new ProductionExecutionTokenMaterialGenerationRequestStore(path.join(sr,'g.jsonl')),new AuditLog(path.join(sr,'a.json')),clock)),/scope does not exactly match/);
 await rejects(()=>requestProductionExecutionTokenMaterialGeneration({...base,planStore:new FakeStore([c.plan],false),tokenMaterialGenerationRequestStore:new ProductionExecutionTokenMaterialGenerationRequestStore(path.join(root,'invalid.jsonl'))}),/Production execution plan ledger verification failed/);
 const tam=JSON.parse(fs.readFileSync(path.join(root,'g.jsonl'),'utf8').trim());tam.payload.requester.note='tampered';const tp=path.join(root,'tampered.jsonl');fs.writeFileSync(tp,JSON.stringify(tam)+'\n');check(()=>assert.equal(new ProductionExecutionTokenMaterialGenerationRequestStore(tp).verify('k'.repeat(40)).valid,false));
 const mut=JSON.parse(JSON.stringify(rec.payload));mut.generationState.tokenMaterialGenerated=true;check(()=>assert.throws(()=>assertTokenMaterialGenerationRequestPayload(mut),/cannot generate/));
 check(()=>assert.equal(audit.verify().valid,true));check(()=>assert.equal(audit.readEntries().every(e=>e.details.entropyGenerated===false&&e.details.tokenMaterialGenerated===false&&e.details.bearerSecretGenerated===false&&e.details.productionWrites===0),true));
 console.log(JSON.stringify({ok:true,tests:checks,signedTokenMaterialGenerationRequests:store.readRecords().length,candidates:result.candidateCount,operations:result.operationCount,generationRequested:true,entropyGenerated:false,tokenMaterialGenerated:false,tokenMaterialIssued:false,bearerSecretGenerated:false,bearerSecretIssued:false,readyForExecution:false,executionAuthorityGranted:false,productionWrites:0,publicationTasksCreated:0,commitActions:0,deploymentActions:0},null,2));
})().catch(e=>{console.error(e.stack||e.message);process.exitCode=1;});
