#!/usr/bin/env node
'use strict';
const path=require('node:path');
const {AuditLog}=require('./audit-log');
const {ProductionChangeRequestStore}=require('./production-change-request-store');
const {ProductionChangeDecisionStore}=require('./production-change-decision-store');
const {ProductionExecutionPlanStore}=require('./production-execution-plan-store');
const {ProductionExecutionPlanDecisionStore}=require('./production-execution-plan-decision-store');
const {ProductionExecutionAuthorisationRequestStore}=require('./production-execution-authorisation-request-store');
const {ProductionExecutionAuthorisationDecisionStore}=require('./production-execution-authorisation-decision-store');
const {ProductionExecutionTokenRequestStore}=require('./production-execution-token-request-store');
const {ProductionExecutionTokenDecisionStore}=require('./production-execution-token-decision-store');
const {ProductionExecutionTokenIssuanceRequestStore}=require('./production-execution-token-issuance-request-store');
const {ProductionExecutionTokenIssuanceDecisionStore}=require('./production-execution-token-issuance-decision-store');
const {ProductionExecutionTokenMaterialGenerationRequestStore}=require('./production-execution-token-material-generation-request-store');
const {ProductionExecutionTokenMaterialGenerationDecisionStore}=require('./production-execution-token-material-generation-decision-store');
const {ProductionExecutionEntropyGenerationRequestStore}=require('./production-execution-entropy-generation-request-store');
const {ProductionExecutionEntropyGenerationDecisionStore}=require('./production-execution-entropy-generation-decision-store');
const {ProductionExecutionEntropySourceSelectionRequestStore}=require('./production-execution-entropy-source-selection-request-store');
const {ProductionExecutionEntropySourceSelectionDecisionStore}=require('./production-execution-entropy-source-selection-decision-store');
const {ProductionExecutionEntropySourceBindingRequestStore}=require('./production-execution-entropy-source-binding-request-store');
const {ProductionExecutionEntropySourceBindingDecisionStore}=require('./production-execution-entropy-source-binding-decision-store');
const {ProductionExecutionEntropyProviderPolicyRequestStore}=require('./production-execution-entropy-provider-policy-request-store');
const {ProductionExecutionEntropyProviderPolicyDecisionStore}=require('./production-execution-entropy-provider-policy-decision-store');
const {Store:EvaluationRequestStore}=require('./production-execution-entropy-provider-candidate-evaluation-request');
const {Store:EvaluationDecisionStore}=require('./production-execution-entropy-provider-candidate-evaluation-decision');
const {Store:CriteriaReviewRequestStore,request}=require('./production-execution-entropy-provider-anonymous-criteria-review-request');

const root=path.resolve(__dirname,'../..'),runtime=path.join(root,'.autonomous-machine');
const env=n=>{const v=process.env[n];if(!v)throw new Error(`${n} is required`);return v;};
const opt=(args,name)=>{const i=args.indexOf(name);return i<0||i===args.length-1?null:args[i+1];};
const defs=[
 ['Production change request',ProductionChangeRequestStore,'production-change-requests.jsonl','AIM_CHANGE_REQUEST_SIGNING_KEY'],
 ['Production change decision',ProductionChangeDecisionStore,'production-change-decisions.jsonl','AIM_CHANGE_DECISION_SIGNING_KEY'],
 ['Execution plan',ProductionExecutionPlanStore,'production-execution-plans.jsonl','AIM_EXECUTION_PLAN_SIGNING_KEY'],
 ['Execution plan decision',ProductionExecutionPlanDecisionStore,'production-execution-plan-decisions.jsonl','AIM_EXECUTION_PLAN_DECISION_SIGNING_KEY'],
 ['Authorisation request',ProductionExecutionAuthorisationRequestStore,'production-execution-authorisation-requests.jsonl','AIM_EXECUTION_AUTHORISATION_REQUEST_SIGNING_KEY'],
 ['Authorisation decision',ProductionExecutionAuthorisationDecisionStore,'production-execution-authorisation-decisions.jsonl','AIM_EXECUTION_AUTHORISATION_DECISION_SIGNING_KEY'],
 ['Token request',ProductionExecutionTokenRequestStore,'production-execution-token-requests.jsonl','AIM_EXECUTION_TOKEN_REQUEST_SIGNING_KEY'],
 ['Token decision',ProductionExecutionTokenDecisionStore,'production-execution-token-decisions.jsonl','AIM_EXECUTION_TOKEN_DECISION_SIGNING_KEY'],
 ['Token issuance request',ProductionExecutionTokenIssuanceRequestStore,'production-execution-token-issuance-requests.jsonl','AIM_EXECUTION_TOKEN_ISSUANCE_REQUEST_SIGNING_KEY'],
 ['Token issuance decision',ProductionExecutionTokenIssuanceDecisionStore,'production-execution-token-issuance-decisions.jsonl','AIM_EXECUTION_TOKEN_ISSUANCE_DECISION_SIGNING_KEY'],
 ['Token material request',ProductionExecutionTokenMaterialGenerationRequestStore,'production-execution-token-material-generation-requests.jsonl','AIM_EXECUTION_TOKEN_MATERIAL_GENERATION_REQUEST_SIGNING_KEY'],
 ['Token material decision',ProductionExecutionTokenMaterialGenerationDecisionStore,'production-execution-token-material-generation-decisions.jsonl','AIM_EXECUTION_TOKEN_MATERIAL_GENERATION_DECISION_SIGNING_KEY'],
 ['Entropy request',ProductionExecutionEntropyGenerationRequestStore,'production-execution-entropy-generation-requests.jsonl','AIM_EXECUTION_ENTROPY_GENERATION_REQUEST_SIGNING_KEY'],
 ['Entropy decision',ProductionExecutionEntropyGenerationDecisionStore,'production-execution-entropy-generation-decisions.jsonl','AIM_EXECUTION_ENTROPY_GENERATION_DECISION_SIGNING_KEY'],
 ['Source selection request',ProductionExecutionEntropySourceSelectionRequestStore,'production-execution-entropy-source-selection-requests.jsonl','AIM_EXECUTION_ENTROPY_SOURCE_SELECTION_REQUEST_SIGNING_KEY'],
 ['Source selection decision',ProductionExecutionEntropySourceSelectionDecisionStore,'production-execution-entropy-source-selection-decisions.jsonl','AIM_EXECUTION_ENTROPY_SOURCE_SELECTION_DECISION_SIGNING_KEY'],
 ['Source binding request',ProductionExecutionEntropySourceBindingRequestStore,'production-execution-entropy-source-binding-requests.jsonl','AIM_EXECUTION_ENTROPY_SOURCE_BINDING_REQUEST_SIGNING_KEY'],
 ['Source binding decision',ProductionExecutionEntropySourceBindingDecisionStore,'production-execution-entropy-source-binding-decisions.jsonl','AIM_EXECUTION_ENTROPY_SOURCE_BINDING_DECISION_SIGNING_KEY'],
 ['Provider policy request',ProductionExecutionEntropyProviderPolicyRequestStore,'production-execution-entropy-provider-policy-requests.jsonl','AIM_EXECUTION_ENTROPY_PROVIDER_POLICY_REQUEST_SIGNING_KEY'],
 ['Provider policy decision',ProductionExecutionEntropyProviderPolicyDecisionStore,'production-execution-entropy-provider-policy-decisions.jsonl','AIM_EXECUTION_ENTROPY_PROVIDER_POLICY_DECISION_SIGNING_KEY'],
];
const upstream=()=>defs.map(([label,C,file,key])=>({label,store:new C(path.join(runtime,file)),signingKey:env(key)}));
const evaluationRequests=new EvaluationRequestStore(path.join(runtime,'production-execution-entropy-provider-candidate-evaluation-requests.jsonl'));
const evaluationDecisions=new EvaluationDecisionStore(path.join(runtime,'production-execution-entropy-provider-candidate-evaluation-decisions.jsonl'));
const criteriaRequests=new CriteriaReviewRequestStore(path.join(runtime,'production-execution-entropy-provider-anonymous-criteria-review-requests.jsonl'));
const audit=new AuditLog(path.join(runtime,'audit.jsonl'));
function usage(){console.log('Phase 1.28 anonymous criteria-review requests\n\nCommands:\n  list\n  show <id>\n  request <evaluation-decision-id> --requester <name> --role <role> --note <reason> [--duration-seconds <1-4>]\n  verify\n\nThis authorises manual inspection of anonymous criteria only. Identity, evidence, findings, scores, compliance results, recommendations, provider selection, entropy, writes, commits, deployment and publication remain forbidden.');}
function run(){const [cmd='help',...args]=process.argv.slice(2);if(['help','-h','--help'].includes(cmd)){usage();return;}const requestKey=env('AIM_EXECUTION_ENTROPY_PROVIDER_CANDIDATE_EVALUATION_REQUEST_SIGNING_KEY'),decisionKey=env('AIM_EXECUTION_ENTROPY_PROVIDER_CANDIDATE_EVALUATION_DECISION_SIGNING_KEY'),criteriaKey=env('AIM_EXECUTION_ENTROPY_PROVIDER_ANONYMOUS_CRITERIA_REVIEW_REQUEST_SIGNING_KEY');if(cmd==='verify'){console.log(JSON.stringify(criteriaRequests.verify(criteriaKey),null,2));return;}if(cmd==='list'){console.log(JSON.stringify(criteriaRequests.readRecords().map(r=>({id:r.id,evaluationDecisionId:r.payload.evaluationDecision.id,status:r.payload.status,requester:r.payload.requester.name,expiresAt:r.payload.validity.expiresAt,reviewMode:r.payload.criteriaReviewPlan.reviewMode,criteriaCount:r.payload.criteriaReviewPlan.criteria.length,candidateIdentityPresent:false,evidenceAttached:false,complianceDetermined:false,createdAt:r.createdAt,recordHash:r.recordHash})),null,2));return;}if(cmd==='show'){const id=args[0],r=criteriaRequests.readRecords().find(x=>x.id===id||x.payload.evaluationDecision.id===id);if(!r)throw new Error(`Criteria review request not found: ${id}`);console.log(JSON.stringify(r,null,2));return;}if(cmd==='request'){if(!args[0])throw new Error('request requires an evaluation-decision id');console.log(JSON.stringify(request({evaluationDecisionId:args[0],evaluationRequestStore:evaluationRequests,evaluationDecisionStore:evaluationDecisions,criteriaReviewRequestStore:criteriaRequests,auditLog:audit,repositoryRoot:root,upstreamIntegrityChecks:upstream(),evaluationRequestSigningKey:requestKey,evaluationDecisionSigningKey:decisionKey,criteriaReviewRequestSigningKey:criteriaKey,criteriaReviewRequestSigningKeyId:process.env.AIM_EXECUTION_ENTROPY_PROVIDER_ANONYMOUS_CRITERIA_REVIEW_REQUEST_SIGNING_KEY_ID||'anonymous-provider-criteria-review-request-key',requesterName:opt(args,'--requester'),requesterRole:opt(args,'--role'),requesterNote:opt(args,'--note'),durationSeconds:opt(args,'--duration-seconds')}),null,2));return;}throw new Error(`Unknown command: ${cmd}`);}
try{run();}catch(e){console.error(e.stack||e.message);process.exitCode=1;}