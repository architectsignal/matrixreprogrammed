import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildMatrixEvent,classifyEvidence,classifyHumanAction,evaluateContribution,evaluateModelCandidate,levelForPoints,propagationPlan,rewardAdjustment,truthfulSystemState} from '../src/matrix-synergy-core.js';
import {handleMatrixSynergyRoute,isMatrixSynergyRoute} from '../src/worker-matrix-synergy.js';
import memberWorker from '../src/worker-member-experience.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');
const sha='a'.repeat(64);
const verifiedInput={trustedSystemAssertion:true,directlyVerifiable:true,attributable:true,authenticated:true,sourceKind:'primary',sourceUrl:'https://official.example/record',retrievedAt:'2026-08-02T12:00:00.000Z',contentSha256:sha};

const verified=classifyEvidence(verifiedInput);
assert.equal(verified.evidenceClass,'VERIFIED');
assert.equal(verified.confidence,100);
assert.equal(verified.conclusionEligible,true);

const memberClaim=classifyEvidence({...verifiedInput,trustedSystemAssertion:false});
assert.equal(memberClaim.evidenceClass,'SPECULATION');
assert.equal(memberClaim.confidence,0);
assert.equal(memberClaim.conclusionEligible,false);
assert.ok(memberClaim.missingVerification.includes('trustedSystemAssertion'));

const missingHash=classifyEvidence({...verifiedInput,contentSha256:''});
assert.equal(missingHash.evidenceClass,'SPECULATION');
assert.equal(missingHash.visibleLabel,'SPECULATION');

const unsafe=classifyEvidence({...verifiedInput,promptInjection:true});
assert.equal(unsafe.evidenceClass,'SECURITY_QUARANTINE');
assert.equal(unsafe.publicationState,'rejected');

const event=buildMatrixEvent({eventType:'record.verified',timestamp:'2026-08-02T12:00:00.000Z',auditIdentifier:'audit-1',origin:'test',source:verifiedInput.sourceUrl,actor:'pipeline',affectedEntities:['entity-1'],affectedPages:['dossier.html'],evidenceOutcome:verified});
assert.equal(event.reviewState,'automatically-verified');
assert.equal(event.propagation.length,12);
assert.ok(event.propagation.some(item=>item.target==='machine_readable_outputs'));

const correction=propagationPlan('record.withdrawn',memberClaim);
assert.ok(correction.some(item=>item.target==='rewards'&&item.action==='recalculate-and-revoke-invalid'));
assert.ok(correction.some(item=>item.target==='conclusions'&&item.action==='exclude-from-factual-output'));

assert.deepEqual(classifyHumanAction({reason:'editorial_review'}).route,'automatic-classification');
assert.equal(classifyHumanAction({reason:'editorial_review'}).classification,'SPECULATION');
assert.equal(classifyHumanAction({reason:'captcha'}).allowed,true);
assert.equal(classifyHumanAction({reason:'unclear'}).allowed,false);

const accepted=evaluateContribution({category:'locate_primary_source',evidenceOutcome:verified,basePoints:15});
assert.equal(accepted.accepted,true);
assert.equal(accepted.points,15);
assert.equal(accepted.canSupportConclusions,true);

for(const blocked of [
  evaluateContribution({category:'locate_primary_source',evidenceOutcome:memberClaim,basePoints:15}),
  evaluateContribution({category:'locate_primary_source',evidenceOutcome:verified,duplicate:true,basePoints:15}),
  evaluateContribution({category:'locate_primary_source',evidenceOutcome:verified,recentSubmissionCount:21,basePoints:15}),
  evaluateContribution({category:'locate_primary_source',evidenceOutcome:verified,suspiciousCoordination:true,basePoints:15}),
  evaluateContribution({category:'locate_primary_source',evidenceOutcome:verified,accusationOrIdeologyReward:true,basePoints:15})
]){
  assert.equal(blocked.accepted,false);
  assert.equal(blocked.points,0);
}

assert.equal(levelForPoints(0).name,'Observer');
assert.equal(levelForPoints(750).name,'Matrix Pathfinder');
assert.deepEqual(rewardAdjustment({originalPoints:20,evidenceWithdrawn:true}),{pointsDelta:-20,state:'revoked',reason:'supporting-evidence-invalidated'});

const modelBase={zeroCostVerified:true,externalChargePossible:false,licenceAllowed:true,privacyPassed:true,rollbackReady:true,citationIntegrityPassed:true,hallucinationRate:1,incumbentHallucinationRate:2,qualityScore:91,incumbentQualityScore:90};
assert.equal(evaluateModelCandidate(modelBase).replace,true);
assert.equal(evaluateModelCandidate({...modelBase,externalChargePossible:true}).state,'quarantined');
assert.equal(evaluateModelCandidate({...modelBase,hallucinationRate:3}).replace,false);

assert.equal(truthfulSystemState({enabled:false}),'disabled');
assert.equal(truthfulSystemState({enabled:true,structuralChecksPassed:true,dependenciesReachable:false}),'degraded');
assert.equal(truthfulSystemState({enabled:true,structuralChecksPassed:true,dependenciesReachable:true,dataConnected:true,evidenceReady:true,liveVerificationPassed:true}),'live_verified');
assert.equal(truthfulSystemState({enabled:true,blocker:'budget'}),'blocked');

assert.equal(isMatrixSynergyRoute('/api/matrix/admin/health'),true);
const denied=await handleMatrixSynergyRoute(new Request('https://matrixreprogrammed.com/api/matrix/admin/health'),{ADMIN_API_TOKEN:'test-secret'});
assert.equal(denied.status,403);
const unavailable=await handleMatrixSynergyRoute(new Request('https://matrixreprogrammed.com/api/matrix/admin/health',{headers:{'x-admin-token':'test-secret'}}),{ADMIN_API_TOKEN:'test-secret'});
assert.equal(unavailable.status,503);
const memberUnavailable=await memberWorker.fetch(new Request('https://matrixreprogrammed.com/api/member/missions'),{});
assert.equal(memberUnavailable.status,503);

const migration=read('migrations/phase13_matrix_synergy.sql');
for(const table of ['matrix_events','matrix_missions','matrix_contributions','matrix_impact_trail','matrix_rewards','matrix_human_actions','matrix_models','matrix_model_benchmarks','matrix_capabilities','matrix_learning_ledger'])assert.ok(migration.includes(`CREATE TABLE IF NOT EXISTS ${table}`),`Missing ${table}`);
assert.ok(migration.includes("evidence_class IN ('VERIFIED','SPECULATION','SECURITY_QUARANTINE')"));
assert.ok(!migration.includes('human_review'));
assert.ok(migration.includes('content_sha256'));

const memberWorkerSource=read('src/worker-member-experience.js');
for(const route of ['/api/member/missions','/api/member/contributions','/api/member/impact','/api/member/progression','/api/member/admin/matrix'])assert.ok(memberWorkerSource.includes(route),`Missing member route ${route}`);
assert.ok(memberWorkerSource.includes('trustedSystemAssertion:false'));
assert.ok(memberWorkerSource.includes('humanEditorialReview:false'));
assert.ok(memberWorkerSource.includes("const claimClass=evidence.evidenceClass==='VERIFIED'?'verified-fact':'speculation'"));

const adminWorker=read('src/worker-matrix-synergy.js');
for(const route of ['/api/matrix/admin/health','/api/matrix/admin/events','/api/matrix/admin/human-actions','/api/matrix/admin/models'])assert.ok(adminWorker.includes(route),`Missing admin route ${route}`);
assert.ok(adminWorker.includes('truthfulSystemState'));

const dashboard=read('member-dashboard.html');
for(const marker of ['id="missions"','id="progression"','id="impact"','SPECULATION','It is not routed to human editorial review'])assert.ok(dashboard.includes(marker),`Missing dashboard marker ${marker}`);
const adminDashboard=read('admin-member-dashboard.html');
for(const marker of ['id="matrix-synergy-health"','id="matrix-capability-rows"','id="matrix-event-rows"','visibly stored as SPECULATION'])assert.ok(adminDashboard.includes(marker),`Missing admin dashboard marker ${marker}`);

console.log('Matrix synergy core passed: 10 evidence/event/member/model/health domains, automatic SPECULATION boundaries, ethical rewards, correction propagation and provider-only human actions.');
