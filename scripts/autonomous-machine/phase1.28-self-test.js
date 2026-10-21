#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {sha256,stableStringify}=require('./route-registry');
const hashBytes=v=>crypto.createHash('sha256').update(v).digest('hex');
for(const [name,exports] of Object.entries({
 'production-execution-entropy-provider-candidate-evaluation-request':{assertPayload:()=>true},
 'production-execution-entropy-provider-candidate-evaluation-decision':{assertPayload:()=>true},
 'production-execution-plan-builder':{inspectCandidate:(root,p)=>{const fp=path.join(root,p);if(!fs.existsSync(fp))return{exists:false,currentSha256:null,currentBytes:null};const b=fs.readFileSync(fp);return{exists:true,currentSha256:hashBytes(b),currentBytes:b.length};}},
})){const resolved=require.resolve(`./${name}`);require.cache[resolved]={id:resolved,filename:resolved,loaded:true,exports};}
const {Store,assertPayload,request}=require('./production-execution-entropy-provider-anonymous-criteria-review-request');
class FakeStore{constructor(records,valid=true){this.records=records;this.valid=valid;}verify(){return this.valid?{valid:true,records:this.records.length}:{valid:false,reason:'forced_invalid'};}readRecords(){return this.records;}}
class AuditLog{constructor(fp){this.fp=fp;this.entries=[];}append(type,details,actor){this.entries.push({type,details,actor});fs.writeFileSync(this.fp,JSON.stringify(this.entries));}verify(){return{valid:true,entries:this.entries.length};}readEntries(){return this.entries;}}
const h=v=>sha256(v);
function makeChain(root,opt={}){
 const a='target-a.html',b='evidence-a.html';fs.writeFileSync(path.join(root,a),opt.changed?'alpha-changed':'alpha');if(!opt.missing)fs.writeFileSync(path.join(root,b),'beta');
 const ah=hashBytes(Buffer.from('alpha')),bh=hashBytes(Buffer.from('beta'));
 const requestCandidates=[{proposedRepositoryPath:a,currentSha256:ah,currentBytes:5,evaluationDecisionSha256:ah,evaluationDecisionBytes:5,matchEvaluationDecision:true,writeAllowed:false},{proposedRepositoryPath:b,currentSha256:bh,currentBytes:4,evaluationDecisionSha256:bh,evaluationDecisionBytes:4,matchEvaluationDecision:true,writeAllowed:false}];
 const operations=[{sequence:1,targetId:'dossier:test',operation:opt.scopeChanged?'wrong':'manual_review_and_integrate_evidence',candidatePaths:[a,b],candidateHashes:[{proposedRepositoryPath:a,sha256:ah,bytes:5},{proposedRepositoryPath:b,sha256:bh,bytes:4}],executionAllowed:false,productionWriteAllowed:false}];
 const scopeHash=h(stableStringify({targetIds:['dossier:test'],operations}));
 const evaluationRequest={id:'erq1',recordHash:h('erqr'),payloadHash:h('erqp'),payload:{validity:{validFrom:'2026-07-30T10:20:00.000Z',expiresAt:'2026-07-30T10:20:08.000Z',providerPolicyRequestExpiresAt:'2026-07-30T10:20:09.000Z',sourceBindingRequestExpiresAt:'2026-07-30T10:20:10.000Z',sourceSelectionRequestExpiresAt:'2026-07-30T10:20:11.000Z',entropyRequestExpiresAt:'2026-07-30T10:20:12.000Z'},providerPolicyDecision:{id:'ppd1',providerPolicyRequestId:'ppr1',applicationId:'app1',applicationFingerprint:h('app')},lastMomentPreflight:{snapshotHash:h(stableStringify(requestCandidates)),candidates:requestCandidates},scope:{targetIds:['dossier:test'],operations,recomputedScopeHash:scopeHash}}};
 const decisionCandidates=[{path:a,currentSha256:ah,currentBytes:5,requestSha256:ah,requestBytes:5,writeAllowed:false},{path:b,currentSha256:bh,currentBytes:4,requestSha256:bh,requestBytes:4,writeAllowed:false}];
 const boundary={candidateIdentityPresent:false,candidateEvidenceAttached:false,complianceDetermined:false,providerSelected:false,entropyGenerated:false};
 const evaluationDecision={id:'edc1',recordHash:h('edcr'),payloadHash:h('edcp'),payload:{decision:opt.rejected?'reject':'approve',status:opt.rejected?'rejected_anonymous_provider_evaluation_request_no_authority':'approved_anonymous_provider_evaluation_request_record_only',request:{id:evaluationRequest.id,recordHash:evaluationRequest.recordHash,payloadHash:evaluationRequest.payloadHash},validity:{requestExpiresAt:evaluationRequest.payload.validity.expiresAt},preflight:{allMatch:true,snapshotHash:h(stableStringify(decisionCandidates)),candidates:decisionCandidates},scope:{exact:true,requestScopeHash:scopeHash,recomputedScopeHash:scopeHash,operations},boundary,readyForExecution:false,executionAuthorityGranted:false}};
 return{evaluationRequest,evaluationDecision};
}
function opts(root,chain,store,audit,clock){const key='k'.repeat(40);return{evaluationDecisionId:chain.evaluationDecision.id,evaluationRequestStore:new FakeStore([chain.evaluationRequest]),evaluationDecisionStore:new FakeStore([chain.evaluationDecision]),criteriaReviewRequestStore:store,auditLog:audit,repositoryRoot:root,upstreamIntegrityChecks:[{label:'Upstream',store:new FakeStore([{id:'up'}]),signingKey:key}],evaluationRequestSigningKey:key,evaluationDecisionSigningKey:key,criteriaReviewRequestSigningKey:key,requesterName:'phase128-requester',requesterRole:'production-owner',requesterNote:'Authorise anonymous manual inspection of each abstract criterion without identity, evidence, findings or results.',durationSeconds:2,clock};}
let checks=0;function check(fn){fn();checks++;}async function rejects(fn,re){let ok=false;try{await fn();}catch(e){ok=re.test(e.message);}assert.equal(ok,true,`${re}`);checks++;}
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'p128-')),chain=makeChain(root),store=new Store(path.join(root,'r.jsonl')),audit=new AuditLog(path.join(root,'a.json')),clock=()=>new Date('2026-07-30T10:20:03.000Z'),base=opts(root,chain,store,audit,clock);
 await rejects(()=>request({...base,criteriaReviewRequestSigningKey:'short'}),/at least 32 bytes/);
 await rejects(()=>request({...base,durationSeconds:0}),/between 1 and 4/);
 await rejects(()=>request({...base,durationSeconds:5}),/between 1 and 4/);
 await rejects(()=>request({...base,requesterNote:'short'}),/requesterNote/);
 const result=request(base);
 check(()=>assert.equal(result.reviewMode,'anonymous_manual_criterion_review_authorisation_only'));
 check(()=>assert.equal(result.criteriaCount,8));check(()=>assert.equal(result.candidateIdentityPresent,false));check(()=>assert.equal(result.evidenceAttached,false));check(()=>assert.equal(result.findingsPresent,false));check(()=>assert.equal(result.complianceDetermined,false));check(()=>assert.equal(result.providerSelected,false));check(()=>assert.equal(result.entropyGenerated,false));check(()=>assert.equal(result.executionAuthorityGranted,false));check(()=>assert.equal(result.candidateCount,2));check(()=>assert.equal(result.operationCount,1));check(()=>assert.equal(result.productionWrites,0));
 check(()=>assert.equal(store.verify('k'.repeat(40)).valid,true));check(()=>assert.equal(store.verify('z'.repeat(40)).valid,false));
 const rec=store.readRecords()[0];check(()=>assert.equal(assertPayload(rec.payload),true));check(()=>assert.equal(rec.payload.status,'pending_manual_anonymous_entropy_provider_criteria_review'));check(()=>assert.equal(rec.payload.criteriaReviewPlan.criteria.length,8));check(()=>assert.equal(rec.payload.criteriaReviewPlan.criteria.every(c=>c.manualReviewAuthorised&&c.reviewStatus==='not_started'&&!c.reviewStarted&&!c.reviewCompleted),true));check(()=>assert.equal(rec.payload.criteriaReviewPlan.criteria.every(c=>!c.evidenceAttachmentAllowed&&!c.evidenceAttached&&c.finding===null&&c.score===null&&!c.complianceDetermined&&c.complianceResult===null&&c.recommendation===null),true));check(()=>assert.equal(rec.payload.criteriaReviewPlan.candidateIdentifier,null));check(()=>assert.equal(rec.payload.criteriaReviewPlan.candidateName,null));check(()=>assert.equal(rec.payload.criteriaReviewPlan.candidateFingerprint,null));check(()=>assert.equal(rec.payload.criteriaReviewPlan.candidateEvidenceAttached,false));check(()=>assert.equal(rec.payload.criteriaReviewPlan.automaticScoringAllowed,false));check(()=>assert.equal(rec.payload.criteriaReviewPlan.manualScoringAllowed,false));check(()=>assert.equal(rec.payload.criteriaReviewPlan.complianceResult,null));check(()=>assert.equal(rec.payload.criteriaReviewPlan.selectionRecommendation,null));check(()=>assert.equal(rec.payload.nextAction,'separate_human_anonymous_criteria_review_decision_no_identity_evidence_finding_score_result_selection_or_entropy'));
 const dup=request(base);check(()=>assert.equal(dup.idempotent,true));
 await rejects(()=>request({...base,requesterNote:'A conflicting anonymous criteria review rationale that must be rejected.'}),/different signed/);
 await rejects(()=>request({...base,clock:()=>new Date('2026-07-30T10:20:08.000Z'),criteriaReviewRequestStore:new Store(path.join(root,'expired.jsonl'))}),/active signed windows/);
 await rejects(()=>request({...base,durationSeconds:4,clock:()=>new Date('2026-07-30T10:20:05.000Z'),criteriaReviewRequestStore:new Store(path.join(root,'long.jsonl'))}),/duration exceeds/);
 const cr=fs.mkdtempSync(path.join(os.tmpdir(),'p128c-')),changed=makeChain(cr,{changed:true});await rejects(()=>request(opts(cr,changed,new Store(path.join(cr,'r.jsonl')),new AuditLog(path.join(cr,'a.json')),clock)),/preflight/);
 const mr=fs.mkdtempSync(path.join(os.tmpdir(),'p128m-')),missing=makeChain(mr,{missing:true});await rejects(()=>request(opts(mr,missing,new Store(path.join(mr,'r.jsonl')),new AuditLog(path.join(mr,'a.json')),clock)),/preflight/);
 const sr=fs.mkdtempSync(path.join(os.tmpdir(),'p128s-')),scoped=makeChain(sr,{scopeChanged:true});await rejects(()=>request(opts(sr,scoped,new Store(path.join(sr,'r.jsonl')),new AuditLog(path.join(sr,'a.json')),clock)),/scope/);
 const rr=fs.mkdtempSync(path.join(os.tmpdir(),'p128r-')),rejected=makeChain(rr,{rejected:true});await rejects(()=>request(opts(rr,rejected,new Store(path.join(rr,'r.jsonl')),new AuditLog(path.join(rr,'a.json')),clock)),/approved, exact/);
 await rejects(()=>request({...base,upstreamIntegrityChecks:[{label:'Broken upstream',store:new FakeStore([],false),signingKey:'k'.repeat(40)}],criteriaReviewRequestStore:new Store(path.join(root,'invalid.jsonl'))}),/Broken upstream ledger verification failed/);
 const tam=JSON.parse(fs.readFileSync(path.join(root,'r.jsonl'),'utf8').trim());tam.payload.requester.note='tampered';const tp=path.join(root,'tampered.jsonl');fs.writeFileSync(tp,JSON.stringify(tam)+'\n');check(()=>assert.equal(new Store(tp).verify('k'.repeat(40)).valid,false));
 const mutations=[
  p=>{p.criteriaReviewPlan.candidateIdentityPresent=true;p.criteriaReviewPlan.candidateName='provider';},
  p=>{p.criteriaReviewPlan.candidateEvidenceAllowed=true;p.criteriaReviewPlan.candidateEvidenceAttached=true;},
  p=>{p.criteriaReviewPlan.criteria[0].reviewStarted=true;p.criteriaReviewPlan.criteria[0].reviewStatus='in_progress';},
  p=>{p.criteriaReviewPlan.criteria[0].findingAllowed=true;p.criteriaReviewPlan.criteria[0].finding='finding';},
  p=>{p.criteriaReviewPlan.criteria[0].scoreAllowed=true;p.criteriaReviewPlan.criteria[0].score=10;},
  p=>{p.criteriaReviewPlan.criteria[0].complianceDeterminationAllowed=true;p.criteriaReviewPlan.criteria[0].complianceDetermined=true;p.criteriaReviewPlan.criteria[0].complianceResult='pass';},
  p=>{p.criteriaReviewPlan.criteria[0].recommendationAllowed=true;p.criteriaReviewPlan.criteria[0].recommendation='select';},
  p=>{p.criteriaReviewPlan.providerSelected=true;p.criteriaReviewPlan.providerName='provider';},
  p=>{p.criteriaReviewPlan.entropyGenerated=true;p.criteriaReviewPlan.entropyOutput='bad';},
 ];
 for(const mutate of mutations){const copy=JSON.parse(JSON.stringify(rec.payload));mutate(copy);check(()=>assert.throws(()=>assertPayload(copy),/anonymous criteria review request may authorise inspection only/));}
 check(()=>assert.equal(audit.verify().valid,true));check(()=>assert.equal(audit.readEntries().every(e=>e.details.candidateIdentityPresent===false&&e.details.evidenceAttached===false&&e.details.findingsPresent===false&&e.details.complianceDetermined===false&&e.details.providerSelected===false&&e.details.entropyGenerated===false&&e.details.productionWrites===0),true));
 console.log(JSON.stringify({ok:true,tests:checks,signedCriteriaReviewRequests:store.readRecords().length,criteria:result.criteriaCount,candidates:result.candidateCount,operations:result.operationCount,reviewMode:result.reviewMode,candidateIdentityPresent:false,evidenceAttached:false,findingsPresent:false,automaticScoringAllowed:false,complianceDetermined:false,providerSelected:false,implementationSelected:false,entropyGenerated:false,readyForExecution:false,executionAuthorityGranted:false,productionWrites:0,publicationTasksCreated:0,commitActions:0,deploymentActions:0},null,2));
})().catch(e=>{console.error(e.stack||e.message);process.exitCode=1;});