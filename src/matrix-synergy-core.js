const HTTPS_SOURCE=/^https:\/\/[^\s]+$/i;
const ISO_DATE=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

export const MATRIX_EVENT_TYPES=Object.freeze([
  'record.discovered','record.verified','record.speculative','record.corrected','record.withdrawn',
  'entity.linked','entity.unlinked','conclusion.opened','conclusion.downgraded','conclusion.reopened',
  'mission.created','contribution.received','contribution.accepted','contribution.invalidated',
  'reward.granted','reward.revoked','source.failed','source.recovered','system.degraded','system.recovered',
  'source.discovered','source.changed','document.discovered','document.changed','evidence.created',
  'relationship.created','claim.created','claim.changed','claim.contradicted','dossier.changed','forecast.changed',
  'resource.discovered','resource.benchmarked','resource.failed','model.discovered','model.benchmarked',
  'value.discovered','value.entitlement.proven','value.claim.submitted','value.received','value.swept','value.failed','value.fraud.blocked','value.cycle.completed',
  'value.permissionless.opportunity.verified','value.permissionless.simulated','value.permissionless.submitted',
  'value.permissionless.confirmed','value.permissionless.reconciled','value.permissionless.failed','value.permissionless.cycle.completed',
  'page.stale','site.change.proposed','build.failed','deploy.succeeded','user.correction.accepted',
  'learning.signal.created','cycle.completed'
]);

export const PROPAGATION_TARGETS=Object.freeze([
  'dossiers','entities','relationships','timelines','trackers','conclusions','search_indexes',
  'dashboards','member_alerts','watchlists','sitemaps','machine_readable_outputs'
]);

export const HUMAN_ACTION_REASONS=Object.freeze([
  'provider_account_creation','captcha','email_or_phone_verification','identity_check','oauth',
  'licence_or_terms_acceptance','secret_entry','payment_approval','provider_permission_change',
  'destructive_operation','legal_intervention','consequential_external_operation'
]);

export const MISSION_CATEGORIES=Object.freeze([
  'locate_primary_source','verify_date_or_identifier','identify_correction','resolve_public_entity',
  'transcribe_public_record','check_broken_source','document_contradiction','supply_accessible_summary'
]);

export const MATRIX_LEVELS=Object.freeze([
  {name:'Observer',minimum:0},
  {name:'Source Scout',minimum:25},
  {name:'Evidence Mapper',minimum:100},
  {name:'Accountability Analyst',minimum:300},
  {name:'Matrix Pathfinder',minimum:750}
]);

function text(value,max=1000){return String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);}
function list(value,max=100){return Array.isArray(value)?value.map(item=>text(item,240)).filter(Boolean).slice(0,max):[];}
function finite(value,fallback=0){const number=Number(value);return Number.isFinite(number)?number:fallback;}
function hasUnsafeMaterial(input={}){
  return Boolean(input.executableContent||input.secretsDetected||input.privatePersonalData||input.promptInjection||input.malwareDetected||input.prohibitedMaterial);
}

export function classifyEvidence(input={}){
  const retrievedAt=text(input.retrievedAt||input.retrievalDate,40);
  const sourceUrl=text(input.sourceUrl,1500);
  if(hasUnsafeMaterial(input))return{
    evidenceClass:'SECURITY_QUARANTINE',confidence:0,publicationState:'rejected',
    factualEligible:false,conclusionEligible:false,alertEligible:false,
    reasons:['unsafe-or-prohibited-material']
  };
  const verificationChecks={
    trustedSystemAssertion:input.trustedSystemAssertion===true,
    directlyVerifiable:input.directlyVerifiable===true,
    attributable:input.attributable===true,
    authenticated:input.authenticated===true,
    primaryOrAuthoritative:['primary','authoritative'].includes(text(input.sourceKind,30).toLowerCase()),
    secureSource:HTTPS_SOURCE.test(sourceUrl),
    retrievalRecorded:ISO_DATE.test(retrievedAt),
    immutableFingerprint:/^[a-f0-9]{64}$/i.test(text(input.contentSha256,80))
  };
  const missingVerification=Object.entries(verificationChecks).filter(([,passed])=>!passed).map(([name])=>name);
  if(!missingVerification.length)return{
    evidenceClass:'VERIFIED',confidence:100,publicationState:'verified',
    factualEligible:true,conclusionEligible:true,alertEligible:true,reasons:[]
  };
  return{
    evidenceClass:'SPECULATION',confidence:0,publicationState:'speculation',
    factualEligible:false,conclusionEligible:false,alertEligible:false,
    reasons:['verification-incomplete'],missingVerification,
    visibleLabel:'SPECULATION',sourceUrl:sourceUrl||null,retrievedAt:retrievedAt||null
  };
}

export function propagationPlan(eventType,evidence={}){
  const targets=[...PROPAGATION_TARGETS];
  const actions=targets.map(target=>({target,action:'refresh-from-event'}));
  if(['record.corrected','record.withdrawn'].includes(eventType)){
    actions.push({target:'conclusions',action:'reopen-or-downgrade'});
    actions.push({target:'member_alerts',action:'issue-correction-notice'});
    actions.push({target:'rewards',action:'recalculate-and-revoke-invalid'});
  }
  if(evidence.evidenceClass!=='VERIFIED'){
    for(const action of actions){
      if(['conclusions','member_alerts'].includes(action.target))action.action='exclude-from-factual-output';
    }
  }
  return actions;
}

export function buildMatrixEvent(input={}){
  const eventType=text(input.eventType,80);
  if(!MATRIX_EVENT_TYPES.includes(eventType))throw new Error('Unsupported Matrix event type');
  const evidence=input.evidenceOutcome||classifyEvidence(input.evidence||{});
  const auditIdentifier=text(input.auditIdentifier,180);
  const timestamp=text(input.timestamp,40);
  if(!auditIdentifier)throw new Error('Matrix events require an audit identifier');
  if(!ISO_DATE.test(timestamp))throw new Error('Matrix events require an ISO UTC timestamp');
  return{
    eventType,timestamp,auditIdentifier,
    origin:text(input.origin,120),source:text(input.source,1500),actor:text(input.actor,180),
    affectedEntities:list(input.affectedEntities),affectedPages:list(input.affectedPages),
    evidenceClass:evidence.evidenceClass,confidence:evidence.evidenceClass==='VERIFIED'?100:0,
    reviewState:evidence.evidenceClass==='VERIFIED'?'automatically-verified':evidence.evidenceClass==='SPECULATION'?'automatically-labelled-speculation':'security-quarantined',
    factualEligible:evidence.factualEligible===true,
    propagation:propagationPlan(eventType,evidence)
  };
}

export function classifyHumanAction(input={}){
  const reason=text(input.reason,100);
  if(reason==='content_uncertainty'||reason==='editorial_review')return{
    allowed:false,route:'automatic-classification',classification:'SPECULATION',
    message:'Unverified content is automatically labelled SPECULATION; it is not routed to human editorial review.'
  };
  if(!HUMAN_ACTION_REASONS.includes(reason))return{allowed:false,route:'blocked',classification:null,message:'Human action is not permitted for this reason.'};
  return{allowed:true,route:'human-action',classification:null,message:'External or consequential action requires explicit human completion.'};
}

export function levelForPoints(points){
  const score=Math.max(0,Math.floor(finite(points)));
  return [...MATRIX_LEVELS].reverse().find(level=>score>=level.minimum)||MATRIX_LEVELS[0];
}

export function evaluateContribution(input={}){
  const evidence=input.evidenceOutcome||classifyEvidence(input.evidence||{});
  const category=text(input.category,80);
  const reasons=[];
  if(!MISSION_CATEGORIES.includes(category))reasons.push('ineligible-category');
  if(evidence.evidenceClass==='SECURITY_QUARANTINE')reasons.push('security-quarantine');
  if(evidence.evidenceClass!=='VERIFIED')reasons.push('not-verified');
  if(input.duplicate===true||finite(input.duplicateCount)>0)reasons.push('duplicate-source');
  if(finite(input.recentSubmissionCount)>20)reasons.push('rate-limit');
  if(input.suspiciousCoordination===true)reasons.push('suspicious-coordination');
  if(input.accusationOrIdeologyReward===true)reasons.push('prohibited-reward-basis');
  const accepted=reasons.length===0;
  const points=accepted?Math.min(25,Math.max(5,Math.floor(finite(input.basePoints,10)))):0;
  return{
    accepted,points,reasons,
    contributionState:evidence.evidenceClass==='SECURITY_QUARANTINE'?'quarantined':accepted?'accepted':'classified',
    evidenceClass:evidence.evidenceClass,
    visibleLabel:evidence.evidenceClass==='SPECULATION'?'SPECULATION':null,
    canSupportConclusions:accepted&&evidence.conclusionEligible===true
  };
}

export function rewardAdjustment(input={}){
  const original=Math.max(0,Math.floor(finite(input.originalPoints)));
  if(input.invalidated===true||input.evidenceWithdrawn===true)return{pointsDelta:-original,state:'revoked',reason:'supporting-evidence-invalidated'};
  return{pointsDelta:0,state:'unchanged',reason:null};
}

export function evaluateModelCandidate(input={}){
  const blockers=[];
  if(input.zeroCostVerified!==true||input.externalChargePossible!==false)blockers.push('zero-cost-not-proven');
  if(input.licenceAllowed!==true)blockers.push('licence-not-approved');
  if(input.privacyPassed!==true)blockers.push('privacy-gate-failed');
  if(input.rollbackReady!==true)blockers.push('rollback-not-ready');
  if(input.citationIntegrityPassed!==true)blockers.push('citation-integrity-failed');
  if(input.hallucinationRate===undefined||finite(input.hallucinationRate,101)>finite(input.incumbentHallucinationRate,100))blockers.push('hallucination-regression');
  if(input.qualityScore===undefined||finite(input.qualityScore)<finite(input.incumbentQualityScore))blockers.push('quality-not-superior');
  return{replace:!blockers.length,state:blockers.length?'quarantined':'approved-for-staged-rollout',blockers};
}

export function truthfulSystemState(input={}){
  if(input.enabled===false)return'disabled';
  if(input.blocker)return'blocked';
  if(input.awaitingHumanAction===true)return'awaiting_human_action';
  if(input.structuralChecksPassed!==true)return'broken';
  if(input.dependenciesReachable!==true)return'degraded';
  if(input.dataConnected!==true)return'structurally_operational';
  if(input.evidenceReady!==true)return'data_connected';
  if(input.liveVerificationPassed!==true)return'evidence_ready';
  return'live_verified';
}

export function safeJson(value,max=16000){
  try{const result=JSON.stringify(value??null);return result.length<=max?result:JSON.stringify({truncated:true});}catch{return'null';}
}
