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
 'production-execution-entropy-provider-policy-request-store':{REQUIRED_CHARACTERISTICS:Object.freeze({localOperatingSystemManaged:true,cryptographicallySecure:true,noNetworkDependency:true,noExternalProvider:true,noUserSuppliedSeed:true,noDeterministicFallback:true,failClosedOnUnavailable:true,entropyOutputLoggingForbidden:true}),assertEntropyProviderPolicyRequestPayload:()=>true},
 'production-execution-entropy-provider-policy-decision-store':{assertEntropyProviderPolicyDecisionPayload:()=>true},
 'production-execution-plan-builder':{inspectCandidate:(root,p)=>{const fp=path.join(root,p);if(!fs.existsSync(fp))return{exists:false,currentSha256:null,currentBytes:null};const b=fs.readFileSync(fp);return{exists:true,currentSha256:hashBytes(b),currentBytes:b.length};}},
})){const resolved=require.resolve(`./${name}`);require.cache[resolved]={id:resolved,filename:resolved,loaded:true,exports};}
const {REQUIRED_CHARACTERISTICS}=require('./production-execution-entropy-provider-policy-request-store');
const {Store:ProductionExecutionEntropyProviderCandidateEvaluationRequestStore,assertPayload:assertEntropyProviderCandidateEvaluationRequestPayload,request:requestProductionExecutionEntropyProviderCandidateEvaluation}=require('./production-execution-entropy-provider-candidate-evaluation-request');
class FakeStore{constructor(records,valid=true){this.records=records;this.valid=valid;}verify(){return this.valid?{valid:true,records:this.records.length}:{valid:false,reason:'forced_invalid'};}readRecords(){return this.records;}}
class AuditLog{constructor(fp){this.fp=fp;this.entries=[];}append(type,details,actor){this.entries.push({type,details,actor});fs.writeFileSync(this.fp,JSON.stringify(this.entries));}verify(){return{valid:true,entries:this.entries.length};}readEntries(){return this.entries;}}
const h=v=>sha256(v);
function policyState(){return{policyRequested:true,sourceClassBound:true,boundSourceClass:'operating_system_csprng',providerPolicyDefined:true,permittedProviderClass:'local_operating_system_managed_csprng_interface',requiredCharacteristics:{...REQUIRED_CHARACTERISTICS},providerSelectionRequired:true,providerSelected:false,providerName:null,implementationSelectionRequired:true,implementationSelected:false,implementationName:null,librarySelected:false,libraryName:null,apiSelected:false,apiName:null,deviceSelected:false,deviceName:null,syscallSelected:false,syscallName:null,networkSourceAllowed:false,externalProviderAllowed:false,entropyBytesRequested:0,entropyGenerated:false,entropyOutput:null,entropyDigest:null,tokenMaterialGenerated:false,tokenMaterialIssued:false,tokenDigest:null,tokenId:null,bearerSecretGenerated:false,bearerSecretIssued:false,credentialGenerated:false,credentialIssued:false,consumed:false,useCount:0,maxUses:1};}
function makeChain(root,opt={}){
 const a='target-a.html',b='evidence-a.html';fs.writeFileSync(path.join(root,a),opt.changed?'alpha-changed':'alpha');if(!opt.missing)fs.writeFileSync(path.join(root,b),'beta');
 const ah=hashBytes(Buffer.from('alpha')),bh=hashBytes(Buffer.from('beta'));
 const requestCandidates=[{proposedRepositoryPath:a,currentSha256:ah,currentBytes:5,sourceBindingDecisionSha256:ah,sourceBindingDecisionBytes:5,matchSourceBindingDecision:true,writeAllowed:false},{proposedRepositoryPath:b,currentSha256:bh,currentBytes:4,sourceBindingDecisionSha256:bh,sourceBindingDecisionBytes:4,matchSourceBindingDecision:true,writeAllowed:false}];
 const requestOperations=[{sequence:1,targetId:'dossier:test',operation:'manual_review_and_integrate_evidence',candidatePaths:[a,b],candidateHashes:[{proposedRepositoryPath:a,sha256:ah,bytes:5},{proposedRepositoryPath:b,sha256:bh,bytes:4}],executionAllowed:false,productionWriteAllowed:false}];
 const scopeHash=h(stableStringify({targetIds:['dossier:test'],operations:requestOperations}));
 const request={id:'ppr1',recordHash:h('pprr'),payloadHash:h('pprp'),payload:{validity:{validFrom:'2026-07-30T09:30:00.000Z',expiresAt:'2026-07-30T09:30:06.000Z',sourceBindingRequestExpiresAt:'2026-07-30T09:30:07.000Z',sourceSelectionRequestExpiresAt:'2026-07-30T09:30:08.000Z',entropyRequestExpiresAt:'2026-07-30T09:30:09.000Z'},scope:{targetIds:['dossier:test'],operations:requestOperations,recomputedScopeHash:scopeHash}}};
 const decisionCandidates=requestCandidates.map(c=>({proposedRepositoryPath:c.proposedRepositoryPath,currentSha256:c.currentSha256,currentBytes:c.currentBytes,providerPolicyRequestSha256:c.currentSha256,providerPolicyRequestBytes:c.currentBytes,matchProviderPolicyRequest:true,writeAllowed:false}));
 const decisionOperations=[{sequence:1,targetId:'dossier:test',operation:opt.scopeChanged?'wrong':'manual_review_and_integrate_evidence',candidatePaths:[a,b],candidateHashes:[{proposedRepositoryPath:a,sha256:ah,bytes:5},{proposedRepositoryPath:b,sha256:bh,bytes:4}],executionAllowed:false,productionWriteAllowed:false}];
 const decisionScopeHash=h(stableStringify({targetIds:['dossier:test'],operations:decisionOperations}));
 const decision={id:'ppd1',recordHash:h('ppdr'),payloadHash:h('ppdp'),payload:{decision:opt.rejected?'reject':'approve',status:opt.rejected?'rejected_entropy_provider_policy_request_no_provider_implementation_or_authority':'approved_entropy_provider_policy_request_record_only',providerPolicyRequest:{id:request.id,recordHash:request.recordHash,payloadHash:request.payloadHash,sourceBindingDecisionId:'sbd1',sourceBindingRequestId:'sbr1',sourceSelectionDecisionId:'ssd1',sourceSelectionRequestId:'ssr1',entropyDecisionId:'ed1',entropyRequestId:'er1',applicationId:'app1',applicationFingerprint:h('app')},validityReview:{requestExpiresAt:request.payload.validity.expiresAt},providerPolicy:policyState(),finalPreflight:{required:true,allMatchProviderPolicyRequest:true,snapshotHash:h(stableStringify(decisionCandidates)),candidates:decisionCandidates},scopeReview:{required:true,providerPolicyRequestScopeHash:scopeHash,recomputedScopeHash:decisionScopeHash,exactScopeMatch:true,operations:decisionOperations},targetIds:['dossier:test'],readyForExecution:false,executionAuthorityGranted:false,authorisationGranted:false}};
 return{request,decision};
}
function opts(root,chain,store,audit,clock){const key='k'.repeat(40);return{entropyProviderPolicyDecisionId:chain.decision.id,entropyProviderPolicyRequestStore:new FakeStore([chain.request]),entropyProviderPolicyDecisionStore:new FakeStore([chain.decision]),entropyProviderCandidateEvaluationRequestStore:store,auditLog:audit,repositoryRoot:root,upstreamIntegrityChecks:[{label:'Upstream',store:new FakeStore([{id:'up'}]),signingKey:key}],entropyProviderPolicyRequestSigningKey:key,entropyProviderPolicyDecisionSigningKey:key,entropyProviderCandidateEvaluationRequestSigningKey:key,requesterName:'phase126-requester',requesterRole:'production-owner',requesterNote:'Request an anonymous abstract provider compliance evaluation without identifying or selecting any provider.',durationSeconds:2,clock};}
let checks=0;function check(fn){fn();checks++;}async function rejects(fn,re){let ok=false;try{await fn();}catch(e){ok=re.test(e.message);}assert.equal(ok,true,`${re}`);checks++;}
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'p126-'));const chain=makeChain(root);const store=new ProductionExecutionEntropyProviderCandidateEvaluationRequestStore(path.join(root,'e.jsonl'));const audit=new AuditLog(path.join(root,'a.json'));const clock=()=>new Date('2026-07-30T09:30:03.000Z');const base=opts(root,chain,store,audit,clock);
 await rejects(()=>requestProductionExecutionEntropyProviderCandidateEvaluation({...base,entropyProviderCandidateEvaluationRequestSigningKey:'short'}),/at least 32 bytes/);
 await rejects(()=>requestProductionExecutionEntropyProviderCandidateEvaluation({...base,durationSeconds:0}),/between 1 and 5/);
 await rejects(()=>requestProductionExecutionEntropyProviderCandidateEvaluation({...base,durationSeconds:6}),/between 1 and 5/);
 await rejects(()=>requestProductionExecutionEntropyProviderCandidateEvaluation({...base,requesterNote:'short'}),/requesterNote/);
 const result=requestProductionExecutionEntropyProviderCandidateEvaluation(base);
 check(()=>assert.equal(result.evaluationMode,'anonymous_abstract_policy_compliance_only'));
 check(()=>assert.equal(result.criteriaCount,8));check(()=>assert.equal(result.candidateIdentityPresent,false));
 check(()=>assert.equal(result.providerSelected,false));check(()=>assert.equal(result.implementationSelected,false));
 check(()=>assert.equal(result.complianceDetermined,false));check(()=>assert.equal(result.entropyGenerated,false));
 check(()=>assert.equal(result.executionAuthorityGranted,false));check(()=>assert.equal(result.candidateCount,2));
 check(()=>assert.equal(result.operationCount,1));check(()=>assert.equal(result.productionWrites,0));
 check(()=>assert.equal(store.verify('k'.repeat(40)).valid,true));check(()=>assert.equal(store.verify('z'.repeat(40)).valid,false));
 const rec=store.readRecords()[0];check(()=>assert.equal(assertEntropyProviderCandidateEvaluationRequestPayload(rec.payload),true));
 check(()=>assert.equal(rec.payload.status,'pending_manual_anonymous_entropy_provider_candidate_evaluation_review'));
 check(()=>assert.equal(rec.payload.evaluationProfile.candidateIdentifier,null));check(()=>assert.equal(rec.payload.evaluationProfile.candidateName,null));
 check(()=>assert.equal(rec.payload.evaluationProfile.candidateFingerprint,null));check(()=>assert.equal(rec.payload.evaluationProfile.candidateEvidenceAttached,false));
 check(()=>assert.equal(rec.payload.evaluationProfile.automaticScoringAllowed,false));check(()=>assert.equal(rec.payload.evaluationProfile.complianceResult,null));
 check(()=>assert.equal(rec.payload.evaluationProfile.selectionRecommendation,null));check(()=>assert.equal(rec.payload.evaluationProfile.criteria.every(c=>c.evaluationStatus==='pending_manual_abstract_compliance_review'),true));
 check(()=>assert.equal(rec.payload.nextAction,'separate_human_anonymous_provider_candidate_evaluation_decision_no_identity_selection_or_entropy_output'));
 const dup=requestProductionExecutionEntropyProviderCandidateEvaluation(base);check(()=>assert.equal(dup.idempotent,true));
 await rejects(()=>requestProductionExecutionEntropyProviderCandidateEvaluation({...base,requesterNote:'A conflicting abstract evaluation rationale that must be rejected.'}),/different signed/);
 await rejects(()=>requestProductionExecutionEntropyProviderCandidateEvaluation({...base,clock:()=>new Date('2026-07-30T09:30:06.000Z'),entropyProviderCandidateEvaluationRequestStore:new ProductionExecutionEntropyProviderCandidateEvaluationRequestStore(path.join(root,'expired.jsonl'))}),/active signed windows/);
 await rejects(()=>requestProductionExecutionEntropyProviderCandidateEvaluation({...base,durationSeconds:4,entropyProviderCandidateEvaluationRequestStore:new ProductionExecutionEntropyProviderCandidateEvaluationRequestStore(path.join(root,'long.jsonl'))}),/duration exceeds/);
 const cr=fs.mkdtempSync(path.join(os.tmpdir(),'p126c-'));const changed=makeChain(cr,{changed:true});await rejects(()=>requestProductionExecutionEntropyProviderCandidateEvaluation(opts(cr,changed,new ProductionExecutionEntropyProviderCandidateEvaluationRequestStore(path.join(cr,'e.jsonl')),new AuditLog(path.join(cr,'a.json')),clock)),/preflight/);
 const mr=fs.mkdtempSync(path.join(os.tmpdir(),'p126m-'));const missing=makeChain(mr,{missing:true});await rejects(()=>requestProductionExecutionEntropyProviderCandidateEvaluation(opts(mr,missing,new ProductionExecutionEntropyProviderCandidateEvaluationRequestStore(path.join(mr,'e.jsonl')),new AuditLog(path.join(mr,'a.json')),clock)),/preflight/);
 const sr=fs.mkdtempSync(path.join(os.tmpdir(),'p126s-'));const scoped=makeChain(sr,{scopeChanged:true});await rejects(()=>requestProductionExecutionEntropyProviderCandidateEvaluation(opts(sr,scoped,new ProductionExecutionEntropyProviderCandidateEvaluationRequestStore(path.join(sr,'e.jsonl')),new AuditLog(path.join(sr,'a.json')),clock)),/scope does not exactly match/);
 const rr=fs.mkdtempSync(path.join(os.tmpdir(),'p126r-'));const rejected=makeChain(rr,{rejected:true});await rejects(()=>requestProductionExecutionEntropyProviderCandidateEvaluation(opts(rr,rejected,new ProductionExecutionEntropyProviderCandidateEvaluationRequestStore(path.join(rr,'e.jsonl')),new AuditLog(path.join(rr,'a.json')),clock)),/approved, exact/);
 await rejects(()=>requestProductionExecutionEntropyProviderCandidateEvaluation({...base,upstreamIntegrityChecks:[{label:'Broken upstream',store:new FakeStore([],false),signingKey:'k'.repeat(40)}],entropyProviderCandidateEvaluationRequestStore:new ProductionExecutionEntropyProviderCandidateEvaluationRequestStore(path.join(root,'invalid.jsonl'))}),/Broken upstream ledger verification failed/);
 const tam=JSON.parse(fs.readFileSync(path.join(root,'e.jsonl'),'utf8').trim());tam.payload.requester.note='tampered';const tp=path.join(root,'tampered.jsonl');fs.writeFileSync(tp,JSON.stringify(tam)+'\n');check(()=>assert.equal(new ProductionExecutionEntropyProviderCandidateEvaluationRequestStore(tp).verify('k'.repeat(40)).valid,false));
 const mutations=[
  p=>{p.evaluationProfile.candidateIdentityPresent=true;p.evaluationProfile.candidateName='provider';},
  p=>{p.evaluationProfile.providerSelected=true;p.evaluationProfile.providerName='provider';},
  p=>{p.evaluationProfile.implementationSelected=true;p.evaluationProfile.implementationName='library';},
  p=>{p.evaluationProfile.complianceDetermined=true;p.evaluationProfile.complianceResult='pass';},
  p=>{p.evaluationProfile.criteria[0].evidenceAttached=true;p.evaluationProfile.criteria[0].evidenceReference='evidence';},
  p=>{p.evaluationProfile.entropyGenerated=true;p.evaluationProfile.entropyOutput='bad';},
 ];
 for(const mutate of mutations){const copy=JSON.parse(JSON.stringify(rec.payload));mutate(copy);check(()=>assert.throws(()=>assertEntropyProviderCandidateEvaluationRequestPayload(copy),/anonymous provider evaluation may define pending abstract compliance criteria only|criteria are invalid/));}
 check(()=>assert.equal(audit.verify().valid,true));check(()=>assert.equal(audit.readEntries().every(e=>e.details.candidateIdentityPresent===false&&e.details.providerSelected===false&&e.details.complianceDetermined===false&&e.details.entropyGenerated===false&&e.details.productionWrites===0),true));
 console.log(JSON.stringify({ok:true,tests:checks,signedProviderCandidateEvaluationRequests:store.readRecords().length,criteria:result.criteriaCount,candidates:result.candidateCount,operations:result.operationCount,evaluationMode:result.evaluationMode,candidateIdentityPresent:false,providerSelected:false,implementationSelected:false,complianceDetermined:false,entropyGenerated:false,readyForExecution:false,executionAuthorityGranted:false,productionWrites:0,publicationTasksCreated:0,commitActions:0,deploymentActions:0},null,2));
})().catch(e=>{console.error(e.stack||e.message);process.exitCode=1;});
