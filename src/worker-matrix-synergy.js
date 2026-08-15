import {buildMatrixEvent,classifyEvidence,safeJson,truthfulSystemState} from './matrix-synergy-core.js';

const ROUTES=new Set(['/api/matrix/admin/health','/api/matrix/admin/events','/api/matrix/admin/human-actions','/api/matrix/admin/models']);
const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','x-frame-options':'DENY','x-matrix-origin':'matrix-synergy'};

export function isMatrixSynergyRoute(pathname=''){return ROUTES.has(String(pathname||'').replace(/\/+$/,'')||'/');}
function json(value,status=200){return new Response(JSON.stringify(value,null,2),{status,headers});}
function clean(value,max=1000){return String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);}
function token(value){return String(value||'').trim();}
function secureEqual(left,right){const a=token(left),b=token(right);if(!a||a.length!==b.length)return false;let mismatch=0;for(let index=0;index<a.length;index+=1)mismatch|=a.charCodeAt(index)^b.charCodeAt(index);return mismatch===0;}
function authorized(request,env){const direct=token(request.headers.get('x-admin-token'));const bearer=token(/^Bearer\s+(.+)$/i.exec(request.headers.get('authorization')||'')?.[1]);const expected=[token(env?.AI_MANAGEMENT_ADMIN_TOKEN),token(env?.ADMIN_API_TOKEN)].filter(Boolean);return[direct,bearer].filter(Boolean).some(value=>expected.some(secret=>secureEqual(value,secret)));}
function hasD1(env){return Boolean(env?.MEMBERS_DB&&typeof env.MEMBERS_DB.prepare==='function');}
async function all(statement){const result=await statement.all();return Array.isArray(result?.results)?result.results:[];}
async function readBody(request){try{return await request.json();}catch{return{};}}
function newId(prefix){return`${prefix}-${crypto.randomUUID()}`;}
function nowIso(){return new Date().toISOString();}

async function health(env){
  const rows=await all(env.MEMBERS_DB.prepare('SELECT capability_id,label,structural_checks_passed,dependencies_reachable,data_connected,evidence_ready,live_verification_passed,state,blocker,checked_at,evidence_json FROM matrix_capabilities ORDER BY capability_id'));
  const capabilities=rows.map(row=>{
    const computedState=truthfulSystemState({enabled:row.state!=='disabled',blocker:row.blocker||'',awaitingHumanAction:row.state==='awaiting_human_action',structuralChecksPassed:Boolean(row.structural_checks_passed),dependenciesReachable:Boolean(row.dependencies_reachable),dataConnected:Boolean(row.data_connected),evidenceReady:Boolean(row.evidence_ready),liveVerificationPassed:Boolean(row.live_verification_passed)});
    return{id:row.capability_id,label:row.label,state:computedState,reportedState:row.state,stateConsistent:computedState===row.state,blocker:row.blocker||null,checkedAt:row.checked_at,evidence:JSON.parse(row.evidence_json||'{}')};
  });
  const totals={};for(const item of capabilities)totals[item.state]=(totals[item.state]||0)+1;
  return json({ok:true,truthModel:'Runtime state is derived from structural, dependency, data, evidence and live-verification checks; file existence alone is never green.',count:capabilities.length,totals,capabilities});
}

async function events(request,env){
  if(request.method==='GET'){
    const rows=await all(env.MEMBERS_DB.prepare('SELECT event_id,event_type,timestamp,origin,source,evidence_class,actor,affected_entities_json,affected_pages_json,confidence,review_state,audit_identifier,propagation_json,payload_json,created_at FROM matrix_events ORDER BY timestamp DESC LIMIT 300'));
    return json({ok:true,count:rows.length,events:rows.map(row=>({...row,affected_entities:JSON.parse(row.affected_entities_json||'[]'),affected_pages:JSON.parse(row.affected_pages_json||'[]'),propagation:JSON.parse(row.propagation_json||'[]'),payload:JSON.parse(row.payload_json||'{}')}))});
  }
  if(request.method!=='POST')return json({ok:false,error:'Method not allowed'},405);
  const body=await readBody(request);const current=nowIso();const auditIdentifier=clean(body.auditIdentifier,180)||newId('audit-event');
  const evidence=classifyEvidence({...body.evidence,trustedSystemAssertion:true,retrievedAt:body.evidence?.retrievedAt||current});
  const event=buildMatrixEvent({eventType:body.eventType,timestamp:current,auditIdentifier,origin:clean(body.origin,120)||'trusted-admin-pipeline',source:clean(body.source||body.evidence?.sourceUrl,1500),actor:clean(body.actor,180)||'matrix-pipeline',affectedEntities:body.affectedEntities,affectedPages:body.affectedPages,evidenceOutcome:evidence});
  const eventId=newId('event');
  const result=await env.MEMBERS_DB.prepare('INSERT OR IGNORE INTO matrix_events (event_id,event_type,timestamp,origin,source,evidence_class,actor,affected_entities_json,affected_pages_json,confidence,review_state,audit_identifier,propagation_json,payload_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(eventId,event.eventType,event.timestamp,event.origin,event.source||null,event.evidenceClass,event.actor,safeJson(event.affectedEntities),safeJson(event.affectedPages),event.confidence,event.reviewState,event.auditIdentifier,safeJson(event.propagation),safeJson(body.payload||{}),current).run();
  const created=Number(result?.meta?.changes||0)>0;
  const persisted=created?eventId:(await env.MEMBERS_DB.prepare('SELECT event_id FROM matrix_events WHERE audit_identifier=? LIMIT 1').bind(auditIdentifier).first())?.event_id||null;
  return json({ok:true,created,eventId:persisted,event},created?201:200);
}

async function humanActions(env){
  const rows=await all(env.MEMBERS_DB.prepare("SELECT action_id,reason,provider,summary,status,audit_identifier,created_at,updated_at FROM matrix_human_actions WHERE status='awaiting' ORDER BY created_at ASC LIMIT 200"));
  return json({ok:true,count:rows.length,humanEditorialReview:false,scope:'Only provider-mandated, legal, identity, credential, permission, payment, destructive or consequential external operations can appear here.',actions:rows});
}

async function models(env){
  const rows=await all(env.MEMBERS_DB.prepare("SELECT m.model_id,m.provider,m.model_name,m.version,m.licence,m.zero_cost_verified,m.external_charge_possible,m.privacy_state,m.rollout_state,m.rollback_model_id,m.updated_at,(SELECT quality_score FROM matrix_model_benchmarks b WHERE b.model_id=m.model_id ORDER BY created_at DESC LIMIT 1) AS quality_score,(SELECT hallucination_rate FROM matrix_model_benchmarks b WHERE b.model_id=m.model_id ORDER BY created_at DESC LIMIT 1) AS hallucination_rate,(SELECT citation_integrity_passed FROM matrix_model_benchmarks b WHERE b.model_id=m.model_id ORDER BY created_at DESC LIMIT 1) AS citation_integrity_passed FROM matrix_models m ORDER BY m.updated_at DESC"));
  return json({ok:true,count:rows.length,replacementRule:'A candidate cannot replace an incumbent unless it is superior, zero-cost verified, licence/privacy safe, citation-safe and rollback-ready.',models:rows.map(row=>({...row,zero_cost_verified:Boolean(row.zero_cost_verified),external_charge_possible:Boolean(row.external_charge_possible),citation_integrity_passed:Boolean(row.citation_integrity_passed)}))});
}

export async function handleMatrixSynergyRoute(request,env){
  if(!authorized(request,env))return json({ok:false,error:'Forbidden'},403);
  if(!hasD1(env))return json({ok:false,error:'Matrix database unavailable'},503);
  const path=new URL(request.url).pathname.replace(/\/+$/,'')||'/';
  if(path==='/api/matrix/admin/health'&&request.method==='GET')return health(env);
  if(path==='/api/matrix/admin/events')return events(request,env);
  if(path==='/api/matrix/admin/human-actions'&&request.method==='GET')return humanActions(env);
  if(path==='/api/matrix/admin/models'&&request.method==='GET')return models(env);
  return json({ok:false,error:'Matrix synergy route not found'},404);
}
