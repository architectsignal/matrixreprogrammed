#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {sha256,stableStringify}=require('./route-registry');
function hashBytes(v){return crypto.createHash('sha256').update(v).digest('hex');}
for(const [name,exports] of Object.entries({
 'production-change-request-store':{assertChangeRequestPayload:()=>true},
 'production-change-decision-store':{assertDecisionPayload:()=>true},
 'production-execution-plan-store':{assertExecutionPlanPayload:()=>true},
 'production-execution-plan-decision-store':{assertExecutionPlanDecisionPayload:()=>true},
 'production-execution-authorisation-request-store':{assertExecutionAuthorisationRequestPayload:()=>true},
 'production-execution-authorisation-decision-store':{assertExecutionAuthorisationDecisionPayload:()=>true},
 'production-execution-token-request-store':{assertExecutionTokenRequestPayload:()=>true},
 'production-execution-token-decision-store':{assertExecutionTokenDecisionPayload:()=>true},
 'production-execution-token-issuance-request-store':{assertExecutionTokenIssuanceRequestPayload:()=>true},
 'production-execution-token-issuance-decision-store':{assertExecutionTokenIssuanceDecisionPayload:()=>true},
 'production-execution-token-material-generation-request-store':{assertTokenMaterialGenerationRequestPayload:()=>true},
 'production-execution-token-material-generation-decision-store':{assertTokenMaterialGenerationDecisionPayload:()=>true},
 'production-execution-plan-builder':{inspectCandidate:(root,p)=>{const fp=path.join(root,p);if(!fs.existsSync(fp))return{exists:false,currentSha256:null,currentBytes:null};const b=fs.readFileSync(fp);return{exists:true,currentSha256:hashBytes(b),currentBytes:b.length};}},
})){
 const resolved=require.resolve(`./${name}`);require.cache[resolved]={id:resolved,filename:resolved,loaded:true,exports};
}
const {ProductionExecutionEntropyGenerationRequestStore,assertEntropyGenerationRequestPayload}=require('./production-execution-entropy-generation-request-store');
const {requestProductionExecutionEntropyGeneration}=require('./production-execution-entropy-generation-request-service');
class FakeStore{constructor(records,valid=true){this.records=records;this.valid=valid;}verify(){return this.valid?{valid:true,records:this.records.length}:{valid:false,reason:'forced_invalid'};}readRecords(){return this.records;}}
class AuditLog{constructor(fp){this.fp=fp;this.entries=[];}append(type,details,actor){this.entries.push({type,details,actor});fs.writeFileSync(this.fp,JSON.stringify(this.entries));}verify(){return{valid:true,entries:this.entries.length};}readEntries(){return this.entries;}}
const h=v=>sha256(v);
function makeChain(root,opt={}){
 const a='target-a.html',b='evidence-a.html';
 fs.writeFileSync(path.join(root,a),opt.changed?'alpha-changed':'alpha');if(!opt.missing)fs.writeFileSync(path.join(root,b),'beta');
 const ah=hashBytes(Buffer.from('alpha')),bh=hashBytes(Buffer.from('beta'));
 const cr={id:'cr1',recordHash:h('crr'),payloadHash:h('crp'),payload:{application:{id:'app1',fingerprint:h('app')}}};
 const cd={id:'cd1',recordHash:h('cdr'),payloadHash:h('cdp'),payload:{decision:'approve',executionAuthorityGranted:false}};
 const mappings=[{targetId:'dossier:test',candidates:[{proposedRepositoryPath:a,currentSha256:ah,currentBytes:5},{proposedRepositoryPath:b,currentSha256:bh,currentBytes:4}]}];
 const steps=[{sequence:1,targetId:'dossier:test',action:'manual_review_and_integrate_evidence',candidatePaths:[a,b],executionAllowed:false,productionWriteAllowed:false}];
 const plan={id:'plan1',recordHash:h('pr'),payloadHash:h('pp'),payload:{repositorySnapshot:{maxFileBytes:1024},targetMappings:mappings,executionPlan:{steps}}};
 const pd={id:'pd1',recordHash:h('pdr'),payloadHash:h('pdp'),payload:{decision:'approve',executionAuthorityGranted:false}};
 const ar={id:'ar1',recordHash:h('arr'),payloadHash:h('arp'),payload:{}};
 const ad={id:'ad1',recordHash:h('adr'),payloadHash:h('adp'),payload:{decision:'approve',executionAuthorityGranted:false,authorisationGranted:false}};
 const tr={id:'tr1',recordHash:h('trr'),payloadHash:h('trp'),payload:{}};
 const td={id:'td1',recordHash:h('tdr'),payloadHash:h('tdp'),payload:{decision:'approve',executionAuthorityGranted:false,tokenIssued:false,executionTokenAvailable:false}};
 const ir={id:'ir1',recordHash:h('irr'),payloadHash:h('irp'),payload:{}};
 const id={id:'id1',recordHash:h('idr'),payloadHash:h('idp'),payload:{decision:'approve',executionAuthorityGranted:false,tokenIssued:false,executionTokenAvailable:false}};
 const operations=[{sequence:1,targetId:'dossier:test',operation:opt.scopeChanged?'wrong':'manual_review_and_integrate_evidence',candidatePaths:[a,b],candidateHashes:[{proposedRepositoryPath:a,sha256:ah,bytes:5},{proposedRepositoryPath:b,sha256:bh,bytes:4}],executionAllowed:false,productionWriteAllowed:false}];
 const scopeHash=h(stableStringify({targetIds:['dossier:test'],operations}));
 const reqCandidates=[{proposedRepositoryPath:a,currentSha256:ah,currentBytes:5},{proposedRepositoryPath:b,currentSha256:bh,currentBytes:4}];
 const gr={id:'gr1',recordHash:h('grr'),payloadHash:h('grp'),payload:{validity:{validFrom:'2026-07-30T00:30:00.000Z',expiresAt:'2026-07-30T00:30:20.000Z',issuanceRequestExpiresAt:'2026-07-30T00:31:00.000Z',tokenRequestExpiresAt:'2026-07-30T00:32:00.000Z',upstreamExpiresAt:'2026-07-30T00:33:00.000Z'},scope:{recomputedScopeHash:scopeHash,operations,targetIds:['dossier:test']},lastMomentPreflight:{snapshotHash:h(stableStringify(reqCandidates)),candidates:reqCandidates}}};
 const finalCandidates=reqCandidates.map(c=>({...c,generationRequestSha256:c.currentSha256,generationRequestBytes:c.currentBytes,matchGenerationRequest:true,writeAllowed:false}));
 const gd={id:'gd1',recordHash:h('gdr'),payloadHash:h('gdp'),payload:{decision:'approve',status:'approved_token_material_generation_request_record_only',readyForExecution:false,executionAuthorityGranted:false,authorisationGranted:false,tokenIssued:false,executionTokenAvailable:false,generationRequest:{id:gr.id,recordHash:gr.recordHash,payloadHash:gr.payloadHash,issuanceDecisionId:id.id,issuanceRequestId:ir.id,tokenDecisionId:td.id,tokenRequestId:tr.id,authorisationDecisionId:ad.id,authorisationRequestId:ar.id,executionPlanDecisionId:pd.id,executionPlanId:plan.id,sourceDecisionId:cd.id,changeRequestId:cr.id,applicationId:'app1',applicationFingerprint:h('app'),requestScopeHash:scopeHash,decisionScopeHash:scopeHash,issuanceScopeHash:scopeHash,generationScopeHash:scopeHash,generationRequestScopeHash:scopeHash,requestFinalSnapshotHash:h('rfs'),decisionPreflightSnapshotHash:h('dps'),issuancePreflightSnapshotHash:h('ips'),issuanceDecisionPreflightSnapshotHash:h('idps'),generationRequestPreflightSnapshotHash:gr.payload.lastMomentPreflight.snapshotHash,candidateSnapshotHash:h(stableStringify(mappings)),executionStepsHash:h(stableStringify(steps)),backupManifestHash:h('backup'),restoreManifestHash:h('restore')},finalPreflight:{required:true,allMatchGenerationRequest:true,snapshotHash:h(stableStringify(finalCandidates)),candidates:finalCandidates},scopeReview:{required:true,generationRequestScopeHash:scopeHash,recomputedScopeHash:scopeHash,exactScopeMatch:true,operations,operationCount:1,candidateCount:2},generationState:{entropyGenerated:false,tokenMaterialGenerated:false,tokenMaterialIssued:false,bearerSecretGenerated:false,bearerSecretIssued:false},targetIds:['dossier:test']}};
 return{cr,cd,plan,pd,ar,ad,tr,td,ir,id,gr,gd};
}
function opts(root,c,store,audit,clock){const key='k'.repeat(40);return{tokenMaterialGenerationDecisionId:c.gd.id,changeRequestStore:new FakeStore([c.cr]),changeDecisionStore:new FakeStore([c.cd]),planStore:new FakeStore([c.plan]),planDecisionStore:new FakeStore([c.pd]),authorisationRequestStore:new FakeStore([c.ar]),authorisationDecisionStore:new FakeStore([c.ad]),tokenRequestStore:new FakeStore([c.tr]),tokenDecisionStore:new FakeStore([c.td]),tokenIssuanceRequestStore:new FakeStore([c.ir]),tokenIssuanceDecisionStore:new FakeStore([c.id]),tokenMaterialGenerationRequestStore:new FakeStore([c.gr]),tokenMaterialGenerationDecisionStore:new FakeStore([c.gd]),entropyGenerationRequestStore:store,auditLog:audit,repositoryRoot:root,changeRequestSigningKey:key,changeDecisionSigningKey:key,planSigningKey:key,planDecisionSigningKey:key,authorisationRequestSigningKey:key,authorisationDecisionSigningKey:key,tokenRequestSigningKey:key,tokenDecisionSigningKey:key,tokenIssuanceRequestSigningKey:key,tokenIssuanceDecisionSigningKey:key,tokenMaterialGenerationRequestSigningKey:key,tokenMaterialGenerationDecisionSigningKey:key,entropyGenerationRequestSigningKey:key,requesterName:'phase118-requester',requesterRole:'production-owner',requesterNote:'Request an entropy-generation review record without entropy output or execution authority.',durationSeconds:6,clock};}
let checks=0;function check(fn){fn();checks++;}async function rejects(fn,re){let ok=false;try{await fn();}catch(e){ok=re.test(e.message);}assert.equal(ok,true,re);checks++;}
(async()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'p118-'));const c=makeChain(root);const store=new ProductionExecutionEntropyGenerationRequestStore(path.join(root,'e.jsonl'));const audit=new AuditLog(path.join(root,'a.json'));const clock=()=>new Date('2026-07-30T00:30:05.000Z');const base=opts(root,c,store,audit,clock);
 await rejects(()=>requestProductionExecutionEntropyGeneration({...base,entropyGenerationRequestSigningKey:'short'}),/at least 32 bytes/);
 await rejects(()=>requestProductionExecutionEntropyGeneration({...base,durationSeconds:2}),/between 3 and 15/);
 await rejects(()=>requestProductionExecutionEntropyGeneration({...base,durationSeconds:16}),/between 3 and 15/);
 await rejects(()=>requestProductionExecutionEntropyGeneration({...base,requesterNote:'short'}),/requesterNote/);
 const result=requestProductionExecutionEntropyGeneration(base);
 for(const [field,value] of Object.entries({generationRequested:true,entropySourceSelected:false,entropyGenerated:false,entropyOutputProduced:false,tokenMaterialGenerated:false,tokenMaterialIssued:false,bearerSecretGenerated:false,bearerSecretIssued:false,readyForExecution:false,executionAuthorityGranted:false,productionWrites:0,candidateCount:2,operationCount:1}))check(()=>assert.equal(result[field],value));
 check(()=>assert.equal(store.verify('k'.repeat(40)).valid,true));check(()=>assert.equal(store.verify('z'.repeat(40)).valid,false));
 const rec=store.readRecords()[0];check(()=>assert.equal(assertEntropyGenerationRequestPayload(rec.payload),true));check(()=>assert.equal(rec.payload.status,'pending_manual_entropy_generation_review'));check(()=>assert.equal(rec.payload.entropyState.entropySource,null));check(()=>assert.equal(rec.payload.entropyState.entropyBytesRequested,0));check(()=>assert.equal(rec.payload.entropyState.entropyOutput,null));check(()=>assert.equal(rec.payload.entropyState.entropyDigest,null));check(()=>assert.equal(rec.payload.nextAction,'separate_human_entropy_generation_decision_no_entropy_output'));
 const dup=requestProductionExecutionEntropyGeneration(base);check(()=>assert.equal(dup.idempotent,true));
 await rejects(()=>requestProductionExecutionEntropyGeneration({...base,requesterNote:'A conflicting entropy generation request rationale for the same approval.'}),/different signed/);
 await rejects(()=>requestProductionExecutionEntropyGeneration({...base,clock:()=>new Date('2026-07-30T00:30:20.000Z'),entropyGenerationRequestStore:new ProductionExecutionEntropyGenerationRequestStore(path.join(root,'expired.jsonl'))}),/at least 3 seconds/);
 await rejects(()=>requestProductionExecutionEntropyGeneration({...base,durationSeconds:15,clock:()=>new Date('2026-07-30T00:30:10.000Z'),entropyGenerationRequestStore:new ProductionExecutionEntropyGenerationRequestStore(path.join(root,'long.jsonl'))}),/exceeds remaining/);
 const cr=fs.mkdtempSync(path.join(os.tmpdir(),'p118c-'));const cc=makeChain(cr,{changed:true});await rejects(()=>requestProductionExecutionEntropyGeneration(opts(cr,cc,new ProductionExecutionEntropyGenerationRequestStore(path.join(cr,'e.jsonl')),new AuditLog(path.join(cr,'a.json')),clock)),/Last-moment/);
 const mr=fs.mkdtempSync(path.join(os.tmpdir(),'p118m-'));const mc=makeChain(mr,{missing:true});await rejects(()=>requestProductionExecutionEntropyGeneration(opts(mr,mc,new ProductionExecutionEntropyGenerationRequestStore(path.join(mr,'e.jsonl')),new AuditLog(path.join(mr,'a.json')),clock)),/Last-moment/);
 const sr=fs.mkdtempSync(path.join(os.tmpdir(),'p118s-'));const sc=makeChain(sr,{scopeChanged:true});await rejects(()=>requestProductionExecutionEntropyGeneration(opts(sr,sc,new ProductionExecutionEntropyGenerationRequestStore(path.join(sr,'e.jsonl')),new AuditLog(path.join(sr,'a.json')),clock)),/scope does not exactly match/);
 await rejects(()=>requestProductionExecutionEntropyGeneration({...base,planStore:new FakeStore([c.plan],false),entropyGenerationRequestStore:new ProductionExecutionEntropyGenerationRequestStore(path.join(root,'invalid.jsonl'))}),/Production execution plan ledger verification failed/);
 const tam=JSON.parse(fs.readFileSync(path.join(root,'e.jsonl'),'utf8').trim());tam.payload.requester.note='tampered';const tp=path.join(root,'tampered.jsonl');fs.writeFileSync(tp,JSON.stringify(tam)+'\n');check(()=>assert.equal(new ProductionExecutionEntropyGenerationRequestStore(tp).verify('k'.repeat(40)).valid,false));
 const mut=JSON.parse(JSON.stringify(rec.payload));mut.entropyState.entropyGenerated=true;check(()=>assert.throws(()=>assertEntropyGenerationRequestPayload(mut),/cannot select a source, generate entropy/));
 check(()=>assert.equal(audit.verify().valid,true));check(()=>assert.equal(audit.readEntries().every(e=>e.details.entropySourceSelected===false&&e.details.entropyGenerated===false&&e.details.entropyOutputProduced===false&&e.details.productionWrites===0),true));
 console.log(JSON.stringify({ok:true,tests:checks,signedEntropyGenerationRequests:store.readRecords().length,candidates:result.candidateCount,operations:result.operationCount,generationRequested:true,entropySourceSelected:false,entropyGenerated:false,entropyOutputProduced:false,tokenMaterialGenerated:false,tokenMaterialIssued:false,bearerSecretGenerated:false,bearerSecretIssued:false,readyForExecution:false,executionAuthorityGranted:false,productionWrites:0,publicationTasksCreated:0,commitActions:0,deploymentActions:0},null,2));
})().catch(e=>{console.error(e.stack||e.message);process.exitCode=1;});
