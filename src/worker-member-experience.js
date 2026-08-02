import {buildMatrixEvent,classifyEvidence,evaluateContribution,levelForPoints,propagationPlan,safeJson,truthfulSystemState} from './matrix-synergy-core.js';

const workerOrigin='cloudflare-worker-member-experience';
const tierRank={anonymous:0,registered:1,supporter_3:2,intelligence_6:3,research_pro_9:4};
const tierAliases={free:'registered',registered:'registered',supporter:'supporter_3',supporter_3:'supporter_3',intelligence:'intelligence_6',intelligence_6:'intelligence_6',research_pro:'research_pro_9',research_pro_9:'research_pro_9'};
const tierCapabilities={
  registered:['free_dashboard','session_controls','saved_public_content','followed_public_topics','public_download_history','public_weekly_archive','newsletter_preferences'],
  supporter_3:['supporter_dashboard','supporter_weekly_archive','supporter_downloads','supporter_announcements','basic_follow_updates'],
  intelligence_6:['intelligence_dashboard','premium_daily_archive','member_watchlists','entity_following','intelligence_downloads','member_investigation_routes'],
  research_pro_9:['research_dashboard','advanced_watchlists','research_downloads','citation_exports','evidence_path_exports','research_queue','priority_source_requests']
};
const staticRoutes=new Set([
  '/api/member/me','/api/member/dashboard','/api/member/sessions','/api/member/sessions/revoke-others','/api/member/saved','/api/member/follows','/api/member/watchlists','/api/member/archive','/api/member/downloads','/api/member/missions','/api/member/contributions','/api/member/impact','/api/member/progression','/api/member/admin/summary','/api/member/admin/matrix','/api/member/admin/members','/api/member/admin/grants','/api/member/admin/archive','/api/member/admin/downloads'
]);
const dynamicRoutePatterns=[
  /^\/api\/member\/sessions\/[^/]+$/,
  /^\/api\/member\/saved\/[^/]+$/,
  /^\/api\/member\/follows\/[^/]+$/,
  /^\/api\/member\/watchlists\/[^/]+$/,
  /^\/api\/member\/downloads\/[^/]+$/,
  /^\/api\/member\/admin\/grants\/[^/]+$/,
  /^\/api\/member\/admin\/archive\/[^/]+$/,
  /^\/api\/member\/admin\/downloads\/[^/]+$/
];

export const memberRoutes=staticRoutes;
export function isMemberExperienceRoute(pathname=''){return staticRoutes.has(pathname)||dynamicRoutePatterns.some(pattern=>pattern.test(pathname));}

const baseHeaders={
  'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff',
  'X-Frame-Options':'SAMEORIGIN',
  'Referrer-Policy':'strict-origin-when-cross-origin',
  'X-Matrix-Origin':workerOrigin
};
function json(data,status=200,headers={}){return new Response(JSON.stringify(data,null,2),{status,headers:{...baseHeaders,...headers}});}
function clean(value,max=500){return String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);}
function safeId(value,max=180){return clean(value,max).replace(/[^A-Za-z0-9._:-]/g,'-').replace(/-+/g,'-');}
function nowIso(){return new Date().toISOString();}
function newId(prefix){return `${prefix}-${crypto.randomUUID()}`;}
function hasD1(env){return Boolean(env?.MEMBERS_DB&&typeof env.MEMBERS_DB.prepare==='function');}
async function first(statement){try{return await statement.first();}catch{return null;}}
async function all(statement){try{const result=await statement.all();return Array.isArray(result?.results)?result.results:[];}catch{return[];}}
async function strictFirst(statement){return await statement.first();}
async function strictAll(statement){const result=await statement.all();return Array.isArray(result?.results)?result.results:[];}
async function readBody(request){try{if((request.headers.get('content-type')||'').includes('application/json'))return await request.json();const form=await request.formData();return Object.fromEntries(form.entries());}catch{return{};}}
function cookieValue(request,name){const raw=request.headers.get('cookie')||'';for(const part of raw.split(';')){const index=part.indexOf('=');if(index<0)continue;if(part.slice(0,index).trim()===name)return decodeURIComponent(part.slice(index+1).trim());}return'';}
async function hash(value){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value||'')));return Array.from(new Uint8Array(digest)).map(byte=>byte.toString(16).padStart(2,'0')).join('');}
function normalizeTier(value){return tierAliases[String(value||'').toLowerCase()]||'registered';}
function rank(value){return tierRank[normalizeTier(value)]??0;}
function capabilities(effectiveTier){const effectiveRank=rank(effectiveTier);return Object.entries(tierCapabilities).filter(([tier])=>tierRank[tier]<=effectiveRank).flatMap(([,items])=>items);}
function safeRoute(value){const route=clean(value,500);if(!route.startsWith('/')||route.startsWith('//')||/^[a-z]+:/i.test(route))return'';return route;}
function safeMetadata(value,max=4000){try{const text=JSON.stringify(value&&typeof value==='object'?value:{});return text.length<=max?text:'{}';}catch{return'{}';}}
function noLeakDenied(auth,requiredTier='registered',message='Access denied'){
  const authenticated=Boolean(auth);
  return json({ok:false,authenticated,error:message,requiredTier,currentTier:auth?.entitlement?.effective_tier||'anonymous',upgradeUrl:'/membership.html'},authenticated?403:401);
}
async function audit(env,actorId,action,targetType,targetId,metadata={}){if(!hasD1(env))return;await env.MEMBERS_DB.prepare('INSERT INTO audit_log (id,actor_id,action,target_type,target_id,metadata_json,created_at) VALUES (?,?,?,?,?,?,?)').bind(newId('audit'),actorId||null,action,targetType||null,targetId||null,safeMetadata(metadata,8000),nowIso()).run().catch(()=>null);}
async function activity(env,memberId,activityType,targetType,targetId,route,metadata={}){if(!memberId)return;await env.MEMBERS_DB.prepare('INSERT INTO member_activity_history (id,member_id,activity_type,target_type,target_id,route,created_at,metadata_json) VALUES (?,?,?,?,?,?,?,?)').bind(newId('activity'),memberId,activityType,targetType||null,targetId||null,safeRoute(route)||null,nowIso(),safeMetadata(metadata)).run().catch(()=>null);}

async function entitlementForMember(env,member){
  const row=await first(env.MEMBERS_DB.prepare('SELECT member_id,email,display_name,role,status,email_verified_at,tier_rank,effective_tier,is_admin,paid_access FROM member_effective_entitlements WHERE member_id=? LIMIT 1').bind(member.id));
  if(row)return{...row,tier_rank:Number(row.tier_rank||0),is_admin:Boolean(row.is_admin),paid_access:Boolean(row.paid_access)};
  const verified=member.status==='active'&&Boolean(member.email_verified_at);
  return{member_id:member.id,email:member.email,display_name:member.display_name||'',role:member.role||'member',status:member.status,email_verified_at:member.email_verified_at||null,tier_rank:verified?1:0,effective_tier:verified?'registered':'anonymous',is_admin:member.role==='admin',paid_access:false};
}
async function enforceSessionLimit(env,memberId,currentSessionId){
  const sessions=await all(env.MEMBERS_DB.prepare("SELECT id,last_seen_at,created_at FROM member_sessions WHERE member_id=? AND revoked_at IS NULL AND expires_at>? ORDER BY CASE WHEN id=? THEN 0 ELSE 1 END,last_seen_at DESC,created_at DESC").bind(memberId,nowIso(),currentSessionId));
  for(const session of sessions.slice(10))await env.MEMBERS_DB.prepare('UPDATE member_sessions SET revoked_at=? WHERE id=? AND member_id=? AND revoked_at IS NULL').bind(nowIso(),session.id,memberId).run().catch(()=>null);
}
async function authContext(request,env){
  if(!hasD1(env))return null;
  const rawToken=cookieValue(request,'matrix_session_v2')||cookieValue(request,'matrix_session');
  if(!rawToken)return null;
  const sessionHash=await hash(rawToken);
  const current=nowIso();
  const session=await first(env.MEMBERS_DB.prepare('SELECT id,member_id,expires_at,created_at,last_seen_at,revoked_at FROM member_sessions WHERE session_hash=? LIMIT 1').bind(sessionHash));
  if(!session||session.revoked_at||String(session.expires_at||'')<=current)return null;
  const member=await first(env.MEMBERS_DB.prepare("SELECT id,email,display_name,role,tier,status,marketing_status,email_verified_at,created_at,updated_at,last_login_at FROM members WHERE id=? AND status='active' LIMIT 1").bind(session.member_id));
  if(!member)return null;
  await env.MEMBERS_DB.prepare('UPDATE member_sessions SET last_seen_at=? WHERE id=?').bind(current,session.id).run().catch(()=>null);
  await enforceSessionLimit(env,member.id,session.id);
  const entitlement=await entitlementForMember(env,member);
  return{session,member,entitlement,capabilities:capabilities(entitlement.effective_tier)};
}
export async function memberSessionContext(request,env){return authContext(request,env);}
async function requireAuth(request,env){const auth=await authContext(request,env);return auth?{auth}:{response:noLeakDenied(null,'registered','Authentication required')};}
async function requireTier(request,env,minimumTier){const auth=await authContext(request,env);if(!auth)return{response:noLeakDenied(null,minimumTier,'Authentication required')};if(auth.entitlement.tier_rank<rank(minimumTier)&&!auth.entitlement.is_admin)return{response:noLeakDenied(auth,minimumTier,'This membership tier does not include the requested resource')};return{auth};}
async function requireAdmin(request,env){const required=await requireAuth(request,env);if(required.response)return required;if(!required.auth.entitlement.is_admin)return{response:noLeakDenied(required.auth,'admin','Administrator access required')};return required;}
function publicMember(auth){return{id:auth.member.id,email:auth.member.email,displayName:auth.member.display_name||'',role:auth.member.role||'member',accountStatus:auth.member.status,marketingStatus:auth.member.marketing_status,emailVerifiedAt:auth.member.email_verified_at||null,createdAt:auth.member.created_at,lastLoginAt:auth.member.last_login_at,effectiveTier:auth.entitlement.effective_tier,tierRank:auth.entitlement.tier_rank,paidAccess:auth.entitlement.paid_access,isAdmin:auth.entitlement.is_admin,capabilities:auth.capabilities};}

async function dashboard(request,env){
  const required=await requireAuth(request,env);if(required.response)return required.response;const {auth}=required;
  const [saved,followed,watches,downloads,sessions,archive]=await Promise.all([
    first(env.MEMBERS_DB.prepare('SELECT COUNT(*) AS count FROM member_saved_items WHERE member_id=?').bind(auth.member.id)),
    first(env.MEMBERS_DB.prepare('SELECT COUNT(*) AS count FROM member_entity_follows WHERE member_id=?').bind(auth.member.id)),
    first(env.MEMBERS_DB.prepare('SELECT COUNT(*) AS count FROM member_watch_items WHERE member_id=? AND active=1').bind(auth.member.id)),
    first(env.MEMBERS_DB.prepare("SELECT COUNT(*) AS count FROM member_download_events WHERE member_id=? AND result='allowed'").bind(auth.member.id)),
    first(env.MEMBERS_DB.prepare("SELECT COUNT(*) AS count FROM member_sessions WHERE member_id=? AND revoked_at IS NULL AND expires_at>?").bind(auth.member.id,nowIso())),
    first(env.MEMBERS_DB.prepare("SELECT COUNT(*) AS count FROM member_archive_entries WHERE publication_status='published' AND CASE minimum_tier WHEN 'registered' THEN 1 WHEN 'supporter_3' THEN 2 WHEN 'intelligence_6' THEN 3 WHEN 'research_pro_9' THEN 4 ELSE 99 END<=?").bind(auth.entitlement.tier_rank))
  ]);
  const subscription=await first(env.MEMBERS_DB.prepare('SELECT provider,provider_subscription_id,tier,status,next_billing_at,current_period_end,cancel_at_period_end FROM subscriptions WHERE member_id=? ORDER BY updated_at DESC LIMIT 1').bind(auth.member.id));
  return json({ok:true,authenticated:true,member:publicMember(auth),subscription:subscription||null,counts:{saved:Number(saved?.count||0),followed:Number(followed?.count||0),watchlists:Number(watches?.count||0),downloads:Number(downloads?.count||0),activeSessions:Number(sessions?.count||0),archiveEntries:Number(archive?.count||0)},paymentActivation:false});
}
async function memberMe(request,env){const required=await requireAuth(request,env);if(required.response)return required.response;return json({ok:true,authenticated:true,member:publicMember(required.auth),paidAccessEnabled:required.auth.entitlement.paid_access,paymentProvider:'paypal-deferred'});}

async function listSessions(request,env){
  const required=await requireAuth(request,env);if(required.response)return required.response;const rows=await all(env.MEMBERS_DB.prepare('SELECT id,created_at,last_seen_at,expires_at,revoked_at FROM member_sessions WHERE member_id=? ORDER BY created_at DESC LIMIT 30').bind(required.auth.member.id));
  return json({ok:true,authenticated:true,sessions:rows.map(row=>({id:row.id,createdAt:row.created_at,lastSeenAt:row.last_seen_at,expiresAt:row.expires_at,revokedAt:row.revoked_at||null,current:row.id===required.auth.session.id,active:!row.revoked_at&&String(row.expires_at)>nowIso()}))});
}
async function revokeSession(request,env,id){
  const required=await requireAuth(request,env);if(required.response)return required.response;const row=await first(env.MEMBERS_DB.prepare('SELECT id FROM member_sessions WHERE id=? AND member_id=? LIMIT 1').bind(id,required.auth.member.id));if(!row)return json({ok:false,error:'Session not found'},404);
  await env.MEMBERS_DB.prepare('UPDATE member_sessions SET revoked_at=? WHERE id=? AND member_id=? AND revoked_at IS NULL').bind(nowIso(),id,required.auth.member.id).run();
  await activity(env,required.auth.member.id,'session_revoke','session',id,'/api/member/sessions');
  return json({ok:true,revoked:true,current:id===required.auth.session.id});
}
async function revokeOthers(request,env){
  const required=await requireAuth(request,env);if(required.response)return required.response;const result=await env.MEMBERS_DB.prepare('UPDATE member_sessions SET revoked_at=? WHERE member_id=? AND id<>? AND revoked_at IS NULL').bind(nowIso(),required.auth.member.id,required.auth.session.id).run();
  await activity(env,required.auth.member.id,'session_revoke','session','other-sessions','/api/member/sessions/revoke-others');
  return json({ok:true,revokedOthers:true,changes:Number(result?.meta?.changes||0)});
}

async function listSaved(request,env){const required=await requireAuth(request,env);if(required.response)return required.response;const rows=await all(env.MEMBERS_DB.prepare('SELECT id,canonical_id,item_type,title,route,minimum_tier,metadata_json,saved_at,updated_at FROM member_saved_items WHERE member_id=? ORDER BY saved_at DESC LIMIT 500').bind(required.auth.member.id));return json({ok:true,count:rows.length,items:rows.map(row=>({id:row.id,canonicalId:row.canonical_id,itemType:row.item_type,title:row.title,route:row.route,minimumTier:row.minimum_tier,savedAt:row.saved_at,updatedAt:row.updated_at}))});}
async function saveItem(request,env){
  const required=await requireAuth(request,env);if(required.response)return required.response;const body=await readBody(request);const canonicalId=safeId(body.canonicalId||body.id);const title=clean(body.title,240);const route=safeRoute(body.route);const minimumTier=normalizeTier(body.minimumTier||'registered');
  if(!canonicalId||!title||!route)return json({ok:false,error:'Canonical ID, title and local route are required'},400);if(rank(minimumTier)>required.auth.entitlement.tier_rank&&!required.auth.entitlement.is_admin)return noLeakDenied(required.auth,minimumTier,'This item is outside the current membership tier');
  const existing=await first(env.MEMBERS_DB.prepare('SELECT id FROM member_saved_items WHERE member_id=? AND canonical_id=? LIMIT 1').bind(required.auth.member.id,canonicalId));const current=nowIso();const id=existing?.id||newId('saved');
  await env.MEMBERS_DB.prepare('INSERT INTO member_saved_items (id,member_id,canonical_id,item_type,title,route,minimum_tier,metadata_json,saved_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(member_id,canonical_id) DO UPDATE SET item_type=excluded.item_type,title=excluded.title,route=excluded.route,minimum_tier=excluded.minimum_tier,metadata_json=excluded.metadata_json,updated_at=excluded.updated_at').bind(id,required.auth.member.id,canonicalId,clean(body.itemType||'content',60),title,route,minimumTier,safeMetadata(body.metadata),current,current).run();
  await activity(env,required.auth.member.id,'save','content',canonicalId,route);return json({ok:true,saved:true,id},existing?200:201);
}
async function deleteSaved(request,env,id){const required=await requireAuth(request,env);if(required.response)return required.response;const row=await first(env.MEMBERS_DB.prepare('SELECT canonical_id,route FROM member_saved_items WHERE id=? AND member_id=? LIMIT 1').bind(id,required.auth.member.id));if(!row)return json({ok:false,error:'Saved item not found'},404);await env.MEMBERS_DB.prepare('DELETE FROM member_saved_items WHERE id=? AND member_id=?').bind(id,required.auth.member.id).run();await activity(env,required.auth.member.id,'unsave','content',row.canonical_id,row.route);return json({ok:true,deleted:true});}

async function listFollows(request,env){const required=await requireAuth(request,env);if(required.response)return required.response;const rows=await all(env.MEMBERS_DB.prepare('SELECT id,entity_id,entity_type,label,route,minimum_tier,notifications_enabled,created_at,updated_at FROM member_entity_follows WHERE member_id=? ORDER BY created_at DESC LIMIT 500').bind(required.auth.member.id));return json({ok:true,count:rows.length,items:rows.map(row=>({id:row.id,entityId:row.entity_id,entityType:row.entity_type,label:row.label,route:row.route,minimumTier:row.minimum_tier,notificationsEnabled:Boolean(row.notifications_enabled),createdAt:row.created_at,updatedAt:row.updated_at}))});}
async function followEntity(request,env){
  const required=await requireAuth(request,env);if(required.response)return required.response;const body=await readBody(request);const entityId=safeId(body.entityId||body.id);const entityType=clean(body.entityType||'topic',50).toLowerCase();const label=clean(body.label,200);const route=safeRoute(body.route||'');const minimumTier=['entity','institution'].includes(entityType)?'intelligence_6':'registered';
  if(!entityId||!label)return json({ok:false,error:'Entity ID and label are required'},400);if(rank(minimumTier)>required.auth.entitlement.tier_rank&&!required.auth.entitlement.is_admin)return noLeakDenied(required.auth,minimumTier,'Entity and institution following requires Intelligence membership');
  const current=nowIso();const existing=await first(env.MEMBERS_DB.prepare('SELECT id FROM member_entity_follows WHERE member_id=? AND entity_id=? LIMIT 1').bind(required.auth.member.id,entityId));const id=existing?.id||newId('follow');
  await env.MEMBERS_DB.prepare('INSERT INTO member_entity_follows (id,member_id,entity_id,entity_type,label,route,minimum_tier,notifications_enabled,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(member_id,entity_id) DO UPDATE SET entity_type=excluded.entity_type,label=excluded.label,route=excluded.route,minimum_tier=excluded.minimum_tier,notifications_enabled=excluded.notifications_enabled,updated_at=excluded.updated_at').bind(id,required.auth.member.id,entityId,entityType,label,route||null,minimumTier,body.notificationsEnabled===false?0:1,current,current).run();
  await activity(env,required.auth.member.id,'follow',entityType,entityId,route);return json({ok:true,followed:true,id,minimumTier},existing?200:201);
}
async function deleteFollow(request,env,id){const required=await requireAuth(request,env);if(required.response)return required.response;const row=await first(env.MEMBERS_DB.prepare('SELECT entity_id,entity_type,route FROM member_entity_follows WHERE id=? AND member_id=? LIMIT 1').bind(id,required.auth.member.id));if(!row)return json({ok:false,error:'Follow not found'},404);await env.MEMBERS_DB.prepare('DELETE FROM member_entity_follows WHERE id=? AND member_id=?').bind(id,required.auth.member.id).run();await activity(env,required.auth.member.id,'unfollow',row.entity_type,row.entity_id,row.route);return json({ok:true,deleted:true});}

async function listWatches(request,env){const required=await requireTier(request,env,'intelligence_6');if(required.response)return required.response;const rows=await all(env.MEMBERS_DB.prepare('SELECT id,target_id,target_type,label,route,criteria_json,minimum_tier,active,created_at,updated_at FROM member_watch_items WHERE member_id=? ORDER BY updated_at DESC LIMIT 300').bind(required.auth.member.id));return json({ok:true,count:rows.length,items:rows.map(row=>({id:row.id,targetId:row.target_id,targetType:row.target_type,label:row.label,route:row.route,criteria:JSON.parse(row.criteria_json||'{}'),minimumTier:row.minimum_tier,active:Boolean(row.active),createdAt:row.created_at,updatedAt:row.updated_at}))});}
async function createWatch(request,env){
  const required=await requireTier(request,env,'intelligence_6');if(required.response)return required.response;const body=await readBody(request);const targetId=safeId(body.targetId||body.id);const targetType=clean(body.targetType||'topic',50).toLowerCase();const allowedTypes=new Set(['entity','topic','institution','jurisdiction','policy','record','source_change']);const label=clean(body.label,200);const route=safeRoute(body.route||'');const criteria=body.criteria&&typeof body.criteria==='object'?body.criteria:{};const advanced=Boolean(criteria.filters||criteria.threshold||criteria.jurisdictions||criteria.export);const minimumTier=advanced?'research_pro_9':'intelligence_6';
  if(!targetId||!label||!allowedTypes.has(targetType))return json({ok:false,error:'Valid target ID, type and label are required'},400);if(rank(minimumTier)>required.auth.entitlement.tier_rank&&!required.auth.entitlement.is_admin)return noLeakDenied(required.auth,minimumTier,'Advanced watchlist criteria require Research Pro');
  const existing=await first(env.MEMBERS_DB.prepare('SELECT id FROM member_watch_items WHERE member_id=? AND target_type=? AND target_id=? LIMIT 1').bind(required.auth.member.id,targetType,targetId));const id=existing?.id||newId('watch');const current=nowIso();
  await env.MEMBERS_DB.prepare('INSERT INTO member_watch_items (id,member_id,target_id,target_type,label,route,criteria_json,minimum_tier,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,1,?,?) ON CONFLICT(member_id,target_type,target_id) DO UPDATE SET label=excluded.label,route=excluded.route,criteria_json=excluded.criteria_json,minimum_tier=excluded.minimum_tier,active=1,updated_at=excluded.updated_at').bind(id,required.auth.member.id,targetId,targetType,label,route||null,safeMetadata(criteria,12000),minimumTier,current,current).run();
  await activity(env,required.auth.member.id,'watch',targetType,targetId,route,{minimumTier});return json({ok:true,watching:true,id,minimumTier},existing?200:201);
}
async function deleteWatch(request,env,id){const required=await requireTier(request,env,'intelligence_6');if(required.response)return required.response;const row=await first(env.MEMBERS_DB.prepare('SELECT target_id,target_type,route FROM member_watch_items WHERE id=? AND member_id=? LIMIT 1').bind(id,required.auth.member.id));if(!row)return json({ok:false,error:'Watch item not found'},404);await env.MEMBERS_DB.prepare('DELETE FROM member_watch_items WHERE id=? AND member_id=?').bind(id,required.auth.member.id).run();await activity(env,required.auth.member.id,'unwatch',row.target_type,row.target_id,row.route);return json({ok:true,deleted:true});}

async function archive(request,env){
  const required=await requireAuth(request,env);if(required.response)return required.response;const url=new URL(request.url);const limit=Math.min(200,Math.max(1,Number(url.searchParams.get('limit')||50)));const rows=await all(env.MEMBERS_DB.prepare("SELECT id,canonical_id,content_type,title,summary,route,minimum_tier,claim_class,evidence_grade,speculative_label,published_at,updated_at FROM member_archive_entries WHERE publication_status='published' AND CASE minimum_tier WHEN 'registered' THEN 1 WHEN 'supporter_3' THEN 2 WHEN 'intelligence_6' THEN 3 WHEN 'research_pro_9' THEN 4 ELSE 99 END<=? ORDER BY published_at DESC,updated_at DESC LIMIT ?").bind(required.auth.entitlement.tier_rank,limit));
  return json({ok:true,effectiveTier:required.auth.entitlement.effective_tier,count:rows.length,entries:rows.map(row=>({id:row.id,canonicalId:row.canonical_id,contentType:row.content_type,title:row.title,summary:row.summary,route:row.route,minimumTier:row.minimum_tier,claimClass:row.claim_class,evidenceGrade:row.evidence_grade,speculativeLabel:row.speculative_label,publishedAt:row.published_at,updatedAt:row.updated_at}))});
}
async function listDownloads(request,env){
  const required=await requireAuth(request,env);if(required.response)return required.response;const rows=await all(env.MEMBERS_DB.prepare('SELECT d.id,d.title,d.description,d.file_name,d.mime_type,d.minimum_tier,d.product_key,e.eligible FROM member_download_catalog d LEFT JOIN member_download_eligibility e ON e.download_id=d.id AND e.member_id=? WHERE d.active=1 ORDER BY d.updated_at DESC').bind(required.auth.member.id));
  return json({ok:true,effectiveTier:required.auth.entitlement.effective_tier,downloads:rows.filter(row=>Number(row.eligible)===1).map(row=>({id:row.id,title:row.title,description:row.description,fileName:row.file_name,mimeType:row.mime_type,minimumTier:row.minimum_tier,downloadUrl:`/api/member/downloads/${encodeURIComponent(row.id)}`}))});
}
async function logDownload(env,memberId,downloadId,result,reason,effectiveTier){await env.MEMBERS_DB.prepare('INSERT INTO member_download_events (id,member_id,download_id,result,denial_reason,effective_tier,created_at,metadata_json) VALUES (?,?,?,?,?,?,?,?)').bind(newId('download-event'),memberId||null,downloadId,result,reason||null,effectiveTier||null,nowIso(),'{}').run().catch(()=>null);}
async function download(request,env,id){
  const auth=await authContext(request,env);if(!auth){return noLeakDenied(null,'registered','Authentication required');}
  const row=await first(env.MEMBERS_DB.prepare('SELECT d.id,d.title,d.storage_key,d.file_name,d.mime_type,d.minimum_tier,d.product_key,e.eligible FROM member_download_catalog d LEFT JOIN member_download_eligibility e ON e.download_id=d.id AND e.member_id=? WHERE d.id=? AND d.active=1 LIMIT 1').bind(auth.member.id,id));
  if(!row){return json({ok:false,error:'Download not found'},404);}
  if(Number(row.eligible)!==1){await logDownload(env,auth.member.id,id,'denied','insufficient-entitlement',auth.entitlement.effective_tier);await activity(env,auth.member.id,'access_denied','download',id,request.url);return noLeakDenied(auth,row.minimum_tier,'This download is outside the current entitlement');}
  if(!env?.MEMBER_ASSETS||typeof env.MEMBER_ASSETS.get!=='function'){await logDownload(env,auth.member.id,id,'failed','protected-storage-unavailable',auth.entitlement.effective_tier);return json({ok:false,error:'Protected download storage is unavailable'},503);}
  const object=await env.MEMBER_ASSETS.get(row.storage_key);if(!object){await logDownload(env,auth.member.id,id,'missing','object-not-found',auth.entitlement.effective_tier);return json({ok:false,error:'Download is temporarily unavailable'},404);}
  await logDownload(env,auth.member.id,id,'allowed',null,auth.entitlement.effective_tier);await activity(env,auth.member.id,'download','download',id,request.url);
  const headers=new Headers({'Content-Type':row.mime_type||'application/octet-stream','Content-Disposition':`attachment; filename="${String(row.file_name||'download').replace(/["\r\n]/g,'')}"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Matrix-Origin':workerOrigin});
  if(object.httpEtag)headers.set('ETag',object.httpEtag);return new Response(object.body??await object.arrayBuffer(),{status:200,headers});
}

async function listMissions(request,env){
  const required=await requireAuth(request,env);if(required.response)return required.response;
  const rows=await strictAll(env.MEMBERS_DB.prepare("SELECT mission_id,title,description,category,evidence_requirements_json,source_scope_json,base_points,status,minimum_tier,created_at,updated_at FROM matrix_missions WHERE status='open' ORDER BY base_points DESC,updated_at DESC LIMIT 100"));
  return json({ok:true,count:rows.length,missions:rows.map(row=>({id:row.mission_id,title:row.title,description:row.description,category:row.category,evidenceRequirements:JSON.parse(row.evidence_requirements_json||'{}'),sourceScope:JSON.parse(row.source_scope_json||'[]'),basePoints:Number(row.base_points||0),status:row.status,minimumTier:row.minimum_tier,createdAt:row.created_at,updatedAt:row.updated_at}))});
}

async function createContribution(request,env){
  const required=await requireAuth(request,env);if(required.response)return required.response;
  const body=await readBody(request);const missionId=safeId(body.missionId);const summary=clean(body.summary,3000);const sourceUrl=clean(body.sourceUrl,1500);const sourceTitle=clean(body.sourceTitle,300);const sourcePublisher=clean(body.sourcePublisher,300);const publicationDate=clean(body.publicationDate,40);const retrievedAt=nowIso();
  if(!missionId||!summary||!/^https:\/\/[^\s]+$/i.test(sourceUrl))return json({ok:false,error:'Mission, summary and a secure public source URL are required'},400);
  const mission=await strictFirst(env.MEMBERS_DB.prepare("SELECT mission_id,category,base_points,status FROM matrix_missions WHERE mission_id=? AND status='open' LIMIT 1").bind(missionId));if(!mission)return json({ok:false,error:'Mission not found or not open'},404);
  const recent=await strictFirst(env.MEMBERS_DB.prepare("SELECT COUNT(*) AS count FROM matrix_contributions WHERE member_id=? AND created_at>=datetime('now','-1 hour')").bind(required.auth.member.id));
  if(Number(recent?.count||0)>=20)return json({ok:false,error:'Contribution rate limit reached; try again later'},429);
  const contentSha256=await hash([missionId,sourceUrl,summary,sourcePublisher,publicationDate].join('\n'));
  const duplicate=await strictFirst(env.MEMBERS_DB.prepare('SELECT contribution_id FROM matrix_contributions WHERE member_id=? AND mission_id=? AND content_sha256=? LIMIT 1').bind(required.auth.member.id,missionId,contentSha256));if(duplicate)return json({ok:false,error:'This contribution was already received',existingId:duplicate.contribution_id},409);
  const evidence=classifyEvidence({trustedSystemAssertion:false,directlyVerifiable:false,attributable:Boolean(sourcePublisher),authenticated:false,sourceKind:'unverified-member-submission',sourceUrl,retrievedAt,contentSha256});
  const evaluation=evaluateContribution({category:mission.category,evidenceOutcome:evidence,basePoints:Number(mission.base_points||0),recentSubmissionCount:Number(recent?.count||0),duplicate:false,suspiciousCoordination:false,accusationOrIdeologyReward:false});
  const contributionId=newId('contribution');const auditIdentifier=newId('audit-matrix');const current=nowIso();
  const event=buildMatrixEvent({eventType:'contribution.received',timestamp:current,auditIdentifier,origin:'member-dashboard',source:sourceUrl,actor:required.auth.member.id,affectedEntities:[],affectedPages:[],evidenceOutcome:evidence});
  const statements=[
    env.MEMBERS_DB.prepare('INSERT INTO matrix_contributions (contribution_id,mission_id,member_id,category,summary,source_url,source_title,source_publisher,publication_date,retrieved_at,content_sha256,evidence_class,visible_label,missing_verification_json,state,conclusion_eligible,points_awarded,audit_identifier,metadata_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(contributionId,missionId,required.auth.member.id,mission.category,summary,sourceUrl,sourceTitle||null,sourcePublisher||null,publicationDate||null,retrievedAt,contentSha256,evidence.evidenceClass,evidence.visibleLabel||null,safeJson(evidence.missingVerification||[]),evaluation.contributionState,evaluation.canSupportConclusions?1:0,evaluation.points,auditIdentifier,safeJson({classificationReasons:evaluation.reasons,automaticClassification:true,humanEditorialReview:false}),current,current),
    env.MEMBERS_DB.prepare('INSERT INTO matrix_events (event_id,event_type,timestamp,origin,source,evidence_class,actor,affected_entities_json,affected_pages_json,confidence,review_state,audit_identifier,propagation_json,payload_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(newId('event'),event.eventType,event.timestamp,event.origin,event.source,event.evidenceClass,event.actor,safeJson(event.affectedEntities),safeJson(event.affectedPages),event.confidence,event.reviewState,event.auditIdentifier,safeJson(event.propagation),safeJson({contributionId,missionId}),current),
    env.MEMBERS_DB.prepare('INSERT INTO matrix_impact_trail (impact_id,contribution_id,member_id,event_type,affected_outputs_json,explanation,evidence_class,audit_identifier,created_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(newId('impact'),contributionId,required.auth.member.id,'contribution.received',safeJson(propagationPlan('contribution.received',evidence)),'Submission recorded and automatically classified. It cannot support factual conclusions unless a trusted verification process authenticates the source.',evidence.evidenceClass,newId('audit-impact'),current)
  ];
  if(typeof env.MEMBERS_DB.batch==='function')await env.MEMBERS_DB.batch(statements);else for(const statement of statements)await statement.run();
  await activity(env,required.auth.member.id,'matrix_contribution','mission',missionId,'/api/member/contributions',{contributionId,evidenceClass:evidence.evidenceClass});
  return json({ok:true,created:true,id:contributionId,evidenceClass:evidence.evidenceClass,visibleLabel:evidence.visibleLabel||null,missingVerification:evidence.missingVerification||[],pointsAwarded:evaluation.points,canSupportConclusions:evaluation.canSupportConclusions,humanEditorialReview:false,message:'This submission is automatically labelled SPECULATION until the trusted verification pipeline authenticates every required element.'},201);
}

async function listImpact(request,env){
  const required=await requireAuth(request,env);if(required.response)return required.response;
  const rows=await strictAll(env.MEMBERS_DB.prepare('SELECT impact_id,contribution_id,event_type,affected_outputs_json,explanation,evidence_class,audit_identifier,created_at FROM matrix_impact_trail WHERE member_id=? ORDER BY created_at DESC LIMIT 200').bind(required.auth.member.id));
  return json({ok:true,count:rows.length,impact:rows.map(row=>({id:row.impact_id,contributionId:row.contribution_id,eventType:row.event_type,affectedOutputs:JSON.parse(row.affected_outputs_json||'[]'),explanation:row.explanation,evidenceClass:row.evidence_class,auditIdentifier:row.audit_identifier,createdAt:row.created_at}))});
}

async function progression(request,env){
  const required=await requireAuth(request,env);if(required.response)return required.response;
  const score=await strictFirst(env.MEMBERS_DB.prepare('SELECT COALESCE(SUM(points_delta),0) AS points FROM matrix_rewards WHERE member_id=?').bind(required.auth.member.id));
  const accepted=await strictFirst(env.MEMBERS_DB.prepare("SELECT COUNT(*) AS count FROM matrix_contributions WHERE member_id=? AND state='accepted' AND evidence_class='VERIFIED'").bind(required.auth.member.id));
  const speculative=await strictFirst(env.MEMBERS_DB.prepare("SELECT COUNT(*) AS count FROM matrix_contributions WHERE member_id=? AND evidence_class='SPECULATION'").bind(required.auth.member.id));
  const points=Math.max(0,Number(score?.points||0));const level=levelForPoints(points);
  return json({ok:true,points,level:level.name,levelMinimum:level.minimum,verifiedContributions:Number(accepted?.count||0),speculativeContributions:Number(speculative?.count||0),rewardBasis:'Only authenticated, non-duplicate evidence work can earn points. Page views, ideology, accusations and mass posting never earn rewards.',revocable:true});
}

async function adminSummary(request,env){
  const required=await requireAdmin(request,env);if(required.response)return required.response;const queries=await Promise.all([
    first(env.MEMBERS_DB.prepare("SELECT COUNT(*) AS count FROM members WHERE status<>'deleted'")),
    first(env.MEMBERS_DB.prepare("SELECT COUNT(*) AS count FROM member_sessions WHERE revoked_at IS NULL AND expires_at>? ").bind(nowIso())),
    first(env.MEMBERS_DB.prepare("SELECT COUNT(*) AS count FROM member_access_grants WHERE status='active' AND starts_at<=? AND (expires_at IS NULL OR expires_at>?)").bind(nowIso(),nowIso())),
    first(env.MEMBERS_DB.prepare("SELECT COUNT(*) AS count FROM member_saved_items")),
    first(env.MEMBERS_DB.prepare("SELECT COUNT(*) AS count FROM member_entity_follows")),
    first(env.MEMBERS_DB.prepare("SELECT COUNT(*) AS count FROM member_watch_items WHERE active=1")),
    first(env.MEMBERS_DB.prepare("SELECT COUNT(*) AS count FROM member_download_events WHERE result='denied'"))
  ]);
  const byTier=await all(env.MEMBERS_DB.prepare('SELECT effective_tier,COUNT(*) AS count FROM member_effective_entitlements GROUP BY effective_tier ORDER BY tier_rank'));
  return json({ok:true,admin:true,counts:{members:Number(queries[0]?.count||0),activeSessions:Number(queries[1]?.count||0),activeGrants:Number(queries[2]?.count||0),savedItems:Number(queries[3]?.count||0),follows:Number(queries[4]?.count||0),watchlists:Number(queries[5]?.count||0),deniedDownloads:Number(queries[6]?.count||0)},membersByTier:byTier});
}
async function adminMatrix(request,env){
  const required=await requireAdmin(request,env);if(required.response)return required.response;
  const counts=await Promise.all([
    strictFirst(env.MEMBERS_DB.prepare('SELECT COUNT(*) AS count FROM matrix_events')),
    strictFirst(env.MEMBERS_DB.prepare("SELECT COUNT(*) AS count FROM matrix_contributions WHERE evidence_class='VERIFIED'")),
    strictFirst(env.MEMBERS_DB.prepare("SELECT COUNT(*) AS count FROM matrix_contributions WHERE evidence_class='SPECULATION'")),
    strictFirst(env.MEMBERS_DB.prepare("SELECT COUNT(*) AS count FROM matrix_contributions WHERE evidence_class='SECURITY_QUARANTINE'")),
    strictFirst(env.MEMBERS_DB.prepare("SELECT COUNT(*) AS count FROM matrix_human_actions WHERE status='awaiting'")),
    strictFirst(env.MEMBERS_DB.prepare("SELECT COUNT(*) AS count FROM matrix_models WHERE rollout_state='active'"))
  ]);
  const capabilityRows=await strictAll(env.MEMBERS_DB.prepare('SELECT capability_id,label,structural_checks_passed,dependencies_reachable,data_connected,evidence_ready,live_verification_passed,state,blocker,checked_at FROM matrix_capabilities ORDER BY capability_id'));
  const recentEvents=await strictAll(env.MEMBERS_DB.prepare('SELECT event_id,event_type,timestamp,evidence_class,review_state,audit_identifier FROM matrix_events ORDER BY timestamp DESC LIMIT 30'));
  const capabilities=capabilityRows.map(row=>({id:row.capability_id,label:row.label,state:truthfulSystemState({enabled:row.state!=='disabled',blocker:row.blocker||'',awaitingHumanAction:row.state==='awaiting_human_action',structuralChecksPassed:Boolean(row.structural_checks_passed),dependenciesReachable:Boolean(row.dependencies_reachable),dataConnected:Boolean(row.data_connected),evidenceReady:Boolean(row.evidence_ready),liveVerificationPassed:Boolean(row.live_verification_passed)}),blocker:row.blocker||null,checkedAt:row.checked_at}));
  return json({ok:true,admin:true,humanEditorialReview:false,counts:{events:Number(counts[0]?.count||0),verifiedContributions:Number(counts[1]?.count||0),speculativeContributions:Number(counts[2]?.count||0),quarantinedContributions:Number(counts[3]?.count||0),awaitingHumanActions:Number(counts[4]?.count||0),activeModels:Number(counts[5]?.count||0)},capabilities,recentEvents,humanActionScope:'Provider, legal, identity, credential, permission, payment, destructive or consequential operations only.'});
}
async function adminMembers(request,env){
  const required=await requireAdmin(request,env);if(required.response)return required.response;const url=new URL(request.url);const query=clean(url.searchParams.get('q')||'',120).toLowerCase();const rows=query?await all(env.MEMBERS_DB.prepare("SELECT e.member_id,e.email,e.display_name,e.role,e.status,e.email_verified_at,e.effective_tier,e.tier_rank,e.paid_access,s.active_sessions FROM member_effective_entitlements e LEFT JOIN member_session_summary s ON s.member_id=e.member_id WHERE LOWER(e.email) LIKE ? OR LOWER(COALESCE(e.display_name,'')) LIKE ? ORDER BY e.email LIMIT 200").bind(`%${query}%`,`%${query}%`)):await all(env.MEMBERS_DB.prepare('SELECT e.member_id,e.email,e.display_name,e.role,e.status,e.email_verified_at,e.effective_tier,e.tier_rank,e.paid_access,s.active_sessions FROM member_effective_entitlements e LEFT JOIN member_session_summary s ON s.member_id=e.member_id ORDER BY e.email LIMIT 200'));
  return json({ok:true,count:rows.length,members:rows.map(row=>({id:row.member_id,email:row.email,displayName:row.display_name,role:row.role,status:row.status,emailVerifiedAt:row.email_verified_at,effectiveTier:row.effective_tier,tierRank:Number(row.tier_rank||0),paidAccess:Boolean(row.paid_access),activeSessions:Number(row.active_sessions||0)}))});
}
async function adminListGrants(request,env){const required=await requireAdmin(request,env);if(required.response)return required.response;const rows=await all(env.MEMBERS_DB.prepare('SELECT g.id,g.member_id,m.email,g.tier,g.source,g.source_reference,g.status,g.starts_at,g.expires_at,g.reason,g.created_by,g.created_at,g.updated_at,g.revoked_at FROM member_access_grants g JOIN members m ON m.id=g.member_id ORDER BY g.created_at DESC LIMIT 500'));return json({ok:true,count:rows.length,grants:rows});}
async function adminCreateGrant(request,env){
  const required=await requireAdmin(request,env);if(required.response)return required.response;const body=await readBody(request);const memberId=safeId(body.memberId);const tier=String(body.tier||'');if(!['supporter','intelligence','research_pro'].includes(tier))return json({ok:false,error:'Valid paid tier required'},400);const member=await first(env.MEMBERS_DB.prepare("SELECT id,email FROM members WHERE id=? AND status<>'deleted' LIMIT 1").bind(memberId));if(!member)return json({ok:false,error:'Member not found'},404);const current=nowIso();const expiresAt=body.expiresAt&&Number.isFinite(Date.parse(body.expiresAt))?new Date(body.expiresAt).toISOString():null;const id=newId('grant');
  await env.MEMBERS_DB.prepare("INSERT INTO member_access_grants (id,member_id,tier,source,source_reference,status,starts_at,expires_at,reason,created_by,created_at,updated_at) VALUES (?,?,?,'manual',?,'active',?,?,?,?,?,?)").bind(id,memberId,tier,clean(body.sourceReference||'',200)||null,current,expiresAt,clean(body.reason||'Manual audited access grant',500),required.auth.member.id,current,current).run();
  await audit(env,required.auth.member.id,'member.grant.created','member_access_grant',id,{memberId,tier,expiresAt});return json({ok:true,created:true,id,memberId,tier,expiresAt},201);
}
async function adminRevokeGrant(request,env,id){const required=await requireAdmin(request,env);if(required.response)return required.response;const current=nowIso();const result=await env.MEMBERS_DB.prepare("UPDATE member_access_grants SET status='revoked',revoked_at=?,updated_at=? WHERE id=? AND status<>'revoked'").bind(current,current,id).run();if(!Number(result?.meta?.changes||0))return json({ok:false,error:'Grant not found or already revoked'},404);await audit(env,required.auth.member.id,'member.grant.revoked','member_access_grant',id,{});return json({ok:true,revoked:true});}
async function adminArchive(request,env,id=''){
  const required=await requireAdmin(request,env);if(required.response)return required.response;
  if(request.method==='GET'){const rows=await all(env.MEMBERS_DB.prepare('SELECT * FROM member_archive_entries ORDER BY updated_at DESC LIMIT 500'));return json({ok:true,count:rows.length,entries:rows});}
  if(request.method==='DELETE'){const result=await env.MEMBERS_DB.prepare("UPDATE member_archive_entries SET publication_status='withdrawn',updated_at=? WHERE id=?").bind(nowIso(),id).run();return Number(result?.meta?.changes||0)?json({ok:true,withdrawn:true}):json({ok:false,error:'Archive entry not found'},404);}
  const body=await readBody(request);const canonicalId=safeId(body.canonicalId);const title=clean(body.title,240);const route=safeRoute(body.route);const minimumTier=normalizeTier(body.minimumTier||'registered');
  if(!canonicalId||!title||!route)return json({ok:false,error:'Canonical ID, title and local route required'},400);
  const current=nowIso();const evidence=classifyEvidence({...body.evidence,trustedSystemAssertion:true,retrievedAt:body.evidence?.retrievedAt||current});
  if(evidence.evidenceClass==='SECURITY_QUARANTINE')return json({ok:false,error:'Unsafe material was rejected and must be handled through the security-quarantine process'},400);
  const entryId=id||newId('archive');const claimClass=evidence.evidenceClass==='VERIFIED'?'verified-fact':'speculation';const evidenceGrade=evidence.evidenceClass==='VERIFIED'?'A':'U';const speculativeLabel=evidence.evidenceClass==='SPECULATION'?'SPECULATION':null;
  const metadata={...(body.metadata&&typeof body.metadata==='object'?body.metadata:{}),automaticClassification:true,humanEditorialReview:false,evidenceClass:evidence.evidenceClass,missingVerification:evidence.missingVerification||[],sourceUrl:body.evidence?.sourceUrl||null,retrievedAt:body.evidence?.retrievedAt||current};
  await env.MEMBERS_DB.prepare("INSERT INTO member_archive_entries (id,canonical_id,content_type,title,summary,route,minimum_tier,claim_class,evidence_grade,speculative_label,publication_status,published_at,updated_at,metadata_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,COALESCE(?,?),?,?) ON CONFLICT(canonical_id) DO UPDATE SET content_type=excluded.content_type,title=excluded.title,summary=excluded.summary,route=excluded.route,minimum_tier=excluded.minimum_tier,claim_class=excluded.claim_class,evidence_grade=excluded.evidence_grade,speculative_label=excluded.speculative_label,publication_status=excluded.publication_status,published_at=COALESCE(member_archive_entries.published_at,excluded.published_at),updated_at=excluded.updated_at,metadata_json=excluded.metadata_json").bind(entryId,canonicalId,clean(body.contentType||'brief',80),title,clean(body.summary||'',1000),route,minimumTier,claimClass,evidenceGrade,speculativeLabel,'published',body.publishedAt||current,current,current,safeMetadata(metadata,12000)).run();
  await audit(env,required.auth.member.id,'member.archive.upserted','member_archive_entry',entryId,{canonicalId,minimumTier,evidenceClass:evidence.evidenceClass});
  return json({ok:true,saved:true,id:entryId,evidenceClass:evidence.evidenceClass,visibleLabel:speculativeLabel,missingVerification:evidence.missingVerification||[],humanEditorialReview:false},201);
}
async function adminDownloads(request,env,id=''){
  const required=await requireAdmin(request,env);if(required.response)return required.response;if(request.method==='GET'){const rows=await all(env.MEMBERS_DB.prepare('SELECT id,title,description,file_name,mime_type,minimum_tier,product_key,active,created_at,updated_at FROM member_download_catalog ORDER BY updated_at DESC LIMIT 500'));return json({ok:true,count:rows.length,downloads:rows});}if(request.method==='DELETE'){const result=await env.MEMBERS_DB.prepare('UPDATE member_download_catalog SET active=0,updated_at=? WHERE id=?').bind(nowIso(),id).run();return Number(result?.meta?.changes||0)?json({ok:true,deactivated:true}):json({ok:false,error:'Download not found'},404);}const body=await readBody(request);const title=clean(body.title,240);const storageKey=clean(body.storageKey,500);const fileName=clean(body.fileName,240);const minimumTier=body.minimumTier==='separate_product'?'separate_product':normalizeTier(body.minimumTier||'registered');if(!title||!storageKey||!fileName)return json({ok:false,error:'Title, storage key and filename required'},400);if(minimumTier==='separate_product'&&!body.productKey)return json({ok:false,error:'Separate-product downloads require a product key'},400);const current=nowIso();const downloadId=id||newId('download');await env.MEMBERS_DB.prepare('INSERT INTO member_download_catalog (id,title,description,storage_key,file_name,mime_type,minimum_tier,product_key,active,created_at,updated_at,metadata_json) VALUES (?,?,?,?,?,?,?,?,1,?,?,?) ON CONFLICT(storage_key) DO UPDATE SET title=excluded.title,description=excluded.description,file_name=excluded.file_name,mime_type=excluded.mime_type,minimum_tier=excluded.minimum_tier,product_key=excluded.product_key,active=1,updated_at=excluded.updated_at,metadata_json=excluded.metadata_json').bind(downloadId,title,clean(body.description||'',1000),storageKey,fileName,clean(body.mimeType||'application/octet-stream',120),minimumTier,clean(body.productKey||'',120)||null,current,current,safeMetadata(body.metadata,12000)).run();await audit(env,required.auth.member.id,'member.download.upserted','member_download',downloadId,{minimumTier});return json({ok:true,saved:true,id:downloadId},201);}

async function route(request,env){
  if(!hasD1(env))return json({ok:false,error:'Membership database unavailable'},503);const url=new URL(request.url);const path=url.pathname.replace(/\/+$/,'')||'/';
  if(path==='/api/member/me'&&request.method==='GET')return memberMe(request,env);
  if(path==='/api/member/dashboard'&&request.method==='GET')return dashboard(request,env);
  if(path==='/api/member/sessions'&&request.method==='GET')return listSessions(request,env);
  if(path==='/api/member/sessions/revoke-others'&&request.method==='POST')return revokeOthers(request,env);
  let match=path.match(/^\/api\/member\/sessions\/([^/]+)$/);if(match&&request.method==='DELETE')return revokeSession(request,env,decodeURIComponent(match[1]));
  if(path==='/api/member/saved'&&request.method==='GET')return listSaved(request,env);if(path==='/api/member/saved'&&request.method==='POST')return saveItem(request,env);match=path.match(/^\/api\/member\/saved\/([^/]+)$/);if(match&&request.method==='DELETE')return deleteSaved(request,env,decodeURIComponent(match[1]));
  if(path==='/api/member/follows'&&request.method==='GET')return listFollows(request,env);if(path==='/api/member/follows'&&request.method==='POST')return followEntity(request,env);match=path.match(/^\/api\/member\/follows\/([^/]+)$/);if(match&&request.method==='DELETE')return deleteFollow(request,env,decodeURIComponent(match[1]));
  if(path==='/api/member/watchlists'&&request.method==='GET')return listWatches(request,env);if(path==='/api/member/watchlists'&&request.method==='POST')return createWatch(request,env);match=path.match(/^\/api\/member\/watchlists\/([^/]+)$/);if(match&&request.method==='DELETE')return deleteWatch(request,env,decodeURIComponent(match[1]));
  if(path==='/api/member/archive'&&request.method==='GET')return archive(request,env);
  if(path==='/api/member/downloads'&&request.method==='GET')return listDownloads(request,env);match=path.match(/^\/api\/member\/downloads\/([^/]+)$/);if(match&&request.method==='GET')return download(request,env,decodeURIComponent(match[1]));
  if(path==='/api/member/missions'&&request.method==='GET')return listMissions(request,env);
  if(path==='/api/member/contributions'&&request.method==='POST')return createContribution(request,env);
  if(path==='/api/member/impact'&&request.method==='GET')return listImpact(request,env);
  if(path==='/api/member/progression'&&request.method==='GET')return progression(request,env);
  if(path==='/api/member/admin/summary'&&request.method==='GET')return adminSummary(request,env);if(path==='/api/member/admin/matrix'&&request.method==='GET')return adminMatrix(request,env);if(path==='/api/member/admin/members'&&request.method==='GET')return adminMembers(request,env);if(path==='/api/member/admin/grants'&&request.method==='GET')return adminListGrants(request,env);if(path==='/api/member/admin/grants'&&request.method==='POST')return adminCreateGrant(request,env);match=path.match(/^\/api\/member\/admin\/grants\/([^/]+)$/);if(match&&request.method==='DELETE')return adminRevokeGrant(request,env,decodeURIComponent(match[1]));
  if(path==='/api/member/admin/archive')return adminArchive(request,env);match=path.match(/^\/api\/member\/admin\/archive\/([^/]+)$/);if(match)return adminArchive(request,env,decodeURIComponent(match[1]));
  if(path==='/api/member/admin/downloads')return adminDownloads(request,env);match=path.match(/^\/api\/member\/admin\/downloads\/([^/]+)$/);if(match)return adminDownloads(request,env,decodeURIComponent(match[1]));
  return json({ok:false,error:'Member route not found'},404);
}

export default{async fetch(request,env){try{return await route(request,env);}catch{return json({ok:false,error:'Member experience failed safely'},500);}}};
