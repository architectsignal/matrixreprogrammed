#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {sha256,stableStringify}=require('./route-registry');

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
const {ProductionExecutionTokenIssuanceDecisionStore,assertExecutionTokenIssuanceDecisionPayload}=require('./production-execution-token-issuance-decision-store');
const {decideProductionExecutionTokenIssuance}=require('./production-execution-token-issuance-decision-service');
function hashBytes(v){return crypto.createHash('sha256').update(v).digest('hex');}
class FakeStore{constructor(records,valid=true){this.records=records;this.valid=valid;} verify(){return this.valid?{valid:true,records:this.records.length}:{valid:false,reason:'forced_invalid'};} readRecords(){return this.records;}}
class AuditLog{constructor(fp){this.fp=fp;this.entries=[];} append(type,details,actor){this.entries.push({type,details,actor});fs.writeFileSync(this.fp,JSON.stringify(this.entries));} verify(){return {valid:true,entries:this.entries.length};} readEntries(){return this.entries;}}
const h=v=>sha256(v);
function makeChain(root,opt={}){
 const a='target-a.html',b='evidence-a.html';
 fs.writeFileSync(path.join(root,a),opt.changed?'alpha-changed':'alpha'); if(!opt.missing)fs.writeFileSync(path.join(root,b),'beta');
 const ah=hashBytes(Buffer.from('alpha')), bh=hashBytes(Buffer.from('beta'));
 const cr={id:'cr1',recordHash:h('crr'),payloadHash:h('crp'),payload:{application:{id:'app1',fingerprint:h('app')}}};
 const cd={id:'cd1',recordHash:h('cdr'),payloadHash:h('cdp'),payload:{decision:'approve',executionAuthorityGranted:false}};
 const mappings=[{targetId:'dossier:test',candidates:[{proposedRepositoryPath:a,currentSha256:ah,currentBytes:5},{proposedRepositoryPath:b,currentSha256:bh,currentBytes:4}]}];
 const steps=[{sequence:1,targetId:'dossier:test',action:'manual_review_and_integrate_evidence',candidatePaths:[a,b],executionAllowed:false,productionWriteAllowed:false}];
 const plan={id:'plan1',recordHash:h('pr'),payloadHash:h('pp'),payload:{repositorySnapshot:{maxFileBytes:1024},targetMappings:mappings,executionPlan:{steps}}};
 const pd={id:'pd1',recordHash:h('pdr'),payloadHash:h('pdp'),payload:{decision:'approve',executionAuthorityGranted:false}};
 const ar={id:'ar1',recordHash:h('arr'),payloadHash:h('arp'),payload:{validity:{expiresAt:'2026-07-30T00:20:00.000Z'}}};
 const ad={id:'ad1',recordHash:h('adr'),payloadHash:h('adp'),payload:{decision:'approve',executionAuthorityGranted:false,authorisationGranted:false}};
 const finalCandidates=[{proposedRepositoryPath:a,currentSha256:ah,currentBytes:5},{proposedRepositoryPath:b,currentSha256:bh,currentBytes:4}];
 const operations=[{sequence:1,targetId:'dossier:test',operation:opt.scopeChanged?'wrong':'manual_review_and_integrate_evidence',candidatePaths:[a,b],candidateHashes:[{proposedRepositoryPath:a,sha256:ah,bytes:5},{proposedRepositoryPath:b,sha256:bh,bytes:4}],executionAllowed:false,productionWriteAllowed:false}];
 const scopeHash=h(stableStringify({targetIds:['dossier:test'],operations}));
 const tr={id:'tr1',recordHash:h('trr'),payloadHash:h('trp'),payload:{validity:{validFrom:'2026-07-30T00:10:00.000Z',expiresAt:'2026-07-30T00:15:00.000Z',upstreamExpiresAt:'2026-07-30T00:20:00.000Z'},scope:{scopeHash,targetIds:['dossier:test'],operations},finalSnapshot:{snapshotHash:h('trs')}}};
 const td={id:'td1',recordHash:h('tdr'),payloadHash:h('tdp'),payload:{decision:'approve',status:'approved_execution_token_request_record_only',readyForExecution:false,executionAuthorityGranted:false,authorisationGranted:false,tokenIssued:false,executionTokenAvailable:false,tokenRequest:{id:tr.id,recordHash:tr.recordHash,payloadHash:tr.payloadHash},finalPreflight:{required:true,allMatchRequest:true},scopeReview:{required:true,exactScopeMatch:true}}};
 const reqCandidates=finalCandidates.map(c=>({...c,decisionSha256:c.currentSha256,decisionBytes:c.currentBytes,matchTokenDecision:true,writeAllowed:false}));
 const ir={id:'ir1',recordHash:h('irr'),payloadHash:h('irp'),payload:{tokenDecision:{id:td.id,recordHash:td.recordHash,payloadHash:td.payloadHash,tokenRequestId:tr.id,authorisationDecisionId:ad.id,authorisationRequestId:ar.id,executionPlanDecisionId:pd.id,executionPlanId:plan.id,sourceDecisionId:cd.id,changeRequestId:cr.id,applicationId:'app1',applicationFingerprint:h('app'),requestScopeHash:scopeHash,requestFinalSnapshotHash:h('rfs'),decisionPreflightSnapshotHash:h('dps'),decisionScopeHash:scopeHash,candidateSnapshotHash:h(stableStringify(mappings)),executionStepsHash:h(stableStringify(steps)),backupManifestHash:h('backup'),restoreManifestHash:h('restore')},validity:{validFrom:'2026-07-30T00:12:00.000Z',expiresAt:'2026-07-30T00:12:30.000Z',tokenRequestExpiresAt:'2026-07-30T00:15:00.000Z',upstreamExpiresAt:'2026-07-30T00:20:00.000Z'},lastMomentPreflight:{snapshotHash:h(stableStringify(reqCandidates)),candidates:reqCandidates},scope:{targetIds:['dossier:test'],operations,recomputedScopeHash:scopeHash,tokenRequestScopeHash:scopeHash,tokenDecisionScopeHash:scopeHash}}};
 return {cr,cd,plan,pd,ar,ad,tr,td,ir};
}
function opts(root,c,store,audit,clock){const key='k'.repeat(40);return{executionTokenIssuanceRequestId:c.ir.id,changeRequestStore:new FakeStore([c.cr]),changeDecisionStore:new FakeStore([c.cd]),planStore:new FakeStore([c.plan]),planDecisionStore:new FakeStore([c.pd]),authorisationRequestStore:new FakeStore([c.ar]),authorisationDecisionStore:new FakeStore([c.ad]),tokenRequestStore:new FakeStore([c.tr]),tokenDecisionStore:new FakeStore([c.td]),tokenIssuanceRequestStore:new FakeStore([c.ir]),tokenIssuanceDecisionStore:store,auditLog:audit,repositoryRoot:root,changeRequestSigningKey:key,changeDecisionSigningKey:key,planSigningKey:key,planDecisionSigningKey:key,authorisationRequestSigningKey:key,authorisationDecisionSigningKey:key,tokenRequestSigningKey:key,tokenDecisionSigningKey:key,tokenIssuanceRequestSigningKey:key,tokenIssuanceDecisionSigningKey:key,decision:'approve',reviewerName:'phase115-reviewer',reviewerRole:'production-owner',reviewerNote:'Approve issuance request record for a separate token material generation review only.',completedReviews:{issuanceRequestWindowReview:true,finalPreflightReview:true,exactScopeReview:true,backupEvidenceReview:true,restoreEvidenceReview:true,productionOwnerReview:true},clock};}
let checks=0;function check(fn){fn();checks++;}async function rejects(fn,re){let ok=false;try{await fn();}catch(e){ok=re.test(e.message);}assert.equal(ok,true,re);checks++;}
(async()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'p115-'));const c=makeChain(root);const store=new ProductionExecutionTokenIssuanceDecisionStore(path.join(root,'d.jsonl'));const audit=new AuditLog(path.join(root,'a.json'));const base=opts(root,c,store,audit,()=>new Date('2026-07-30T00:12:10.000Z'));
await rejects(()=>decideProductionExecutionTokenIssuance({...base,tokenIssuanceDecisionSigningKey:'short'}),/at least 32 bytes/);
await rejects(()=>decideProductionExecutionTokenIssuance({...base,decision:'maybe'}),/approve or reject/);
await rejects(()=>decideProductionExecutionTokenIssuance({...base,completedReviews:{}}),/completedReviews/);
await rejects(()=>decideProductionExecutionTokenIssuance({...base,completedReviews:{...base.completedReviews,exactScopeReview:false},tokenIssuanceDecisionStore:new ProductionExecutionTokenIssuanceDecisionStore(path.join(root,'inc.jsonl'))}),/completed exactScopeReview/);
const result=decideProductionExecutionTokenIssuance(base);
check(()=>assert.equal(result.decision,'approve'));check(()=>assert.equal(result.candidateCount,2));check(()=>assert.equal(result.operationCount,1));check(()=>assert.equal(result.tokenIssued,false));check(()=>assert.equal(result.tokenMaterialIssued,false));check(()=>assert.equal(result.bearerSecretIssued,false));check(()=>assert.equal(result.executionAuthorityGranted,false));check(()=>assert.equal(store.verify('k'.repeat(40)).valid,true));check(()=>assert.equal(store.verify('z'.repeat(40)).valid,false));
const rec=store.readRecords()[0];check(()=>assert.equal(assertExecutionTokenIssuanceDecisionPayload(rec.payload),true));check(()=>assert.equal(rec.payload.status,'approved_execution_token_issuance_request_record_only'));check(()=>assert.equal(rec.payload.validityReview.remainingSeconds,20));check(()=>assert.equal(rec.payload.finalPreflight.candidates.length,2));check(()=>assert.equal(rec.payload.scopeReview.exactScopeMatch,true));check(()=>assert.equal(rec.payload.issuanceState.tokenMaterialIssued,false));check(()=>assert.equal(rec.payload.issuanceState.bearerSecretIssued,false));check(()=>assert.equal(rec.payload.nextAction,'separate_token_material_generation_request_and_execution_firebreak'));
const dup=decideProductionExecutionTokenIssuance(base);check(()=>assert.equal(dup.idempotent,true));await rejects(()=>decideProductionExecutionTokenIssuance({...base,decision:'reject'}),/different signed/);
await rejects(()=>decideProductionExecutionTokenIssuance({...base,clock:()=>new Date('2026-07-30T00:12:30.000Z'),tokenIssuanceDecisionStore:new ProductionExecutionTokenIssuanceDecisionStore(path.join(root,'expired.jsonl'))}),/active issuance request/);
await rejects(()=>decideProductionExecutionTokenIssuance({...base,clock:()=>new Date('2026-07-30T00:12:27.000Z'),tokenIssuanceDecisionStore:new ProductionExecutionTokenIssuanceDecisionStore(path.join(root,'short.jsonl'))}),/at least 5 seconds/);
const cr=fs.mkdtempSync(path.join(os.tmpdir(),'p115c-'));const cc=makeChain(cr,{changed:true});await rejects(()=>decideProductionExecutionTokenIssuance(opts(cr,cc,new ProductionExecutionTokenIssuanceDecisionStore(path.join(cr,'d.jsonl')),new AuditLog(path.join(cr,'a.json')),base.clock)),/preflight hash/);
const mr=fs.mkdtempSync(path.join(os.tmpdir(),'p115m-'));const mc=makeChain(mr,{missing:true});await rejects(()=>decideProductionExecutionTokenIssuance(opts(mr,mc,new ProductionExecutionTokenIssuanceDecisionStore(path.join(mr,'d.jsonl')),new AuditLog(path.join(mr,'a.json')),base.clock)),/preflight hash/);
const sr=fs.mkdtempSync(path.join(os.tmpdir(),'p115s-'));const sc=makeChain(sr,{scopeChanged:true});await rejects(()=>decideProductionExecutionTokenIssuance(opts(sr,sc,new ProductionExecutionTokenIssuanceDecisionStore(path.join(sr,'d.jsonl')),new AuditLog(path.join(sr,'a.json')),base.clock)),/scope does not exactly match/);
const rr=fs.mkdtempSync(path.join(os.tmpdir(),'p115r-'));const rc=makeChain(rr);const rs=new ProductionExecutionTokenIssuanceDecisionStore(path.join(rr,'d.jsonl'));const rejected=decideProductionExecutionTokenIssuance({...opts(rr,rc,rs,new AuditLog(path.join(rr,'a.json')),()=>new Date('2026-07-30T00:13:00.000Z')),decision:'reject',reviewerName:'rejector',reviewerRole:'editor',reviewerNote:'Reject issuance request without token material or authority.',completedReviews:{issuanceRequestWindowReview:true,finalPreflightReview:false,exactScopeReview:false,backupEvidenceReview:false,restoreEvidenceReview:false,productionOwnerReview:false}});check(()=>assert.equal(rejected.decision,'reject'));check(()=>assert.equal(rejected.candidateCount,0));check(()=>assert.equal(rs.readRecords()[0].payload.nextAction,'none'));
const tam=JSON.parse(fs.readFileSync(path.join(root,'d.jsonl'),'utf8').trim());tam.payload.reviewer.note='tampered';const tp=path.join(root,'tampered.jsonl');fs.writeFileSync(tp,JSON.stringify(tam)+'\n');check(()=>assert.equal(new ProductionExecutionTokenIssuanceDecisionStore(tp).verify('k'.repeat(40)).valid,false));
const mut=JSON.parse(JSON.stringify(rec.payload));mut.issuanceState.tokenMaterialIssued=true;check(()=>assert.throws(()=>assertExecutionTokenIssuanceDecisionPayload(mut),/cannot issue/));
check(()=>assert.equal(audit.verify().valid,true));check(()=>assert.equal(audit.readEntries().every(e=>e.details.tokenIssued===false&&e.details.tokenMaterialIssued===false&&e.details.bearerSecretIssued===false&&e.details.productionWrites===0),true));
console.log(JSON.stringify({ok:true,tests:checks,signedTokenIssuanceDecisions:store.readRecords().length+rs.readRecords().length,approved:1,rejected:1,candidates:result.candidateCount,operations:result.operationCount,tokenIssued:false,tokenMaterialIssued:false,bearerSecretIssued:false,readyForExecution:false,executionAuthorityGranted:false,productionWrites:0,publicationTasksCreated:0,commitActions:0,deploymentActions:0},null,2));})();
