const fs = require('fs');
const path = require('path');

const root = process.cwd();
const workerPath = path.join(root, 'src', 'worker.js');
const reportDir = path.join(root, 'downloads');
fs.mkdirSync(reportDir, { recursive: true });

function fail(message) {
  const report = { ok: false, generatedAt: new Date().toISOString(), error: message };
  fs.writeFileSync(path.join(reportDir, 'membership-auth-patch-report.json'), JSON.stringify(report, null, 2));
  console.error('Membership auth patch failed: ' + message);
  process.exit(1);
}

if (!fs.existsSync(workerPath)) fail('src/worker.js missing');
let worker = fs.readFileSync(workerPath, 'utf8');
const beforeWorker = worker;

for (const marker of ['function hasMembersDb(env)', 'persistMembershipSignup', 'handleNewsletterSignup', 'd1First']) {
  if (!worker.includes(marker)) fail('membership foundation missing marker: ' + marker);
}

const helpers = String.raw`/* membership-auth-v1: verification, passwordless login, hashed tokens, secure sessions, Brevo transactional delivery */
function authBytes(length=32){const bytes=new Uint8Array(length);crypto.getRandomValues(bytes);return bytes}
function authBase64Url(bytes){let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
async function authHash(value){const data=new TextEncoder().encode(String(value||''));const digest=await crypto.subtle.digest('SHA-256',data);return Array.from(new Uint8Array(digest)).map(byte=>byte.toString(16).padStart(2,'0')).join('')}
function authId(prefix){return String(prefix||'auth')+'-'+crypto.randomUUID()}
function authCookieValue(request){const raw=request.headers.get('cookie')||'';for(const part of raw.split(';')){const pair=part.trim().split('=');if(pair.shift()==='matrix_session')return decodeURIComponent(pair.join('='))}return''}
function authSessionCookie(token,maxAge=2592000){return 'matrix_session='+encodeURIComponent(token)+'; Path=/; Max-Age='+maxAge+'; HttpOnly; Secure; SameSite=Lax'}
function authClearCookie(){return 'matrix_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax'}
function authHtml(value){return String(value||'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))}
function authOrigin(request){const url=new URL(request.url);return ['matrixreprogrammed.com','www.matrixreprogrammed.com'].includes(url.hostname)?url.origin:'https://matrixreprogrammed.com'}
function authMailConfigured(env){return Boolean(env&&env.BREVO_API_KEY&&env.MEMBERS_FROM_EMAIL)}
async function authSendEmail(env,member,link,purpose){if(!authMailConfigured(env))return{configured:false,sent:false,error:'transactional email not configured'};const verify=purpose==='verify_email';const subject=verify?'Verify your Matrix Reprogrammed membership':'Your Matrix Reprogrammed login link';const heading=verify?'Verify your email':'Sign in to your member account';const action=verify?'Verify membership':'Sign in securely';const safeName=authHtml(member.display_name||member.name||'Member');const safeLink=authHtml(link);const htmlContent='<!doctype html><html><body style="background:#050505;color:#f3e6bd;font-family:Arial,sans-serif;padding:28px"><div style="max-width:620px;margin:auto;border:1px solid #8d7137;border-radius:18px;padding:28px;background:#0b0905"><h1 style="color:#d8b56a">'+heading+'</h1><p>Hello '+safeName+',</p><p>Use the secure one-time link below. It expires in 15 minutes and can only be used once.</p><p><a href="'+safeLink+'" style="display:inline-block;padding:14px 20px;border-radius:12px;background:#d8b56a;color:#090702;text-decoration:none;font-weight:bold">'+action+'</a></p><p style="font-size:13px;color:#b9aa82">If you did not request this, ignore this email. Matrix Reprogrammed never asks for a password through this link.</p></div></body></html>';const textContent=heading+'\n\nOpen this one-time link within 15 minutes:\n'+link+'\n\nIf you did not request this, ignore this email.';try{const response=await fetch('https://api.brevo.com/v3/smtp/email',{method:'POST',headers:{accept:'application/json','content-type':'application/json','api-key':String(env.BREVO_API_KEY)},body:JSON.stringify({sender:{email:String(env.MEMBERS_FROM_EMAIL),name:String(env.MEMBERS_FROM_NAME||'Matrix Reprogrammed')},to:[{email:String(member.email),name:String(member.display_name||member.name||'Member')}],subject,htmlContent,textContent})});const responseText=await response.text();let payload={};try{payload=JSON.parse(responseText||'{}')}catch{}return{configured:true,sent:response.status===201,messageId:payload.messageId||null,status:response.status,error:response.status===201?null:cleanText(payload.message||responseText||'email provider rejected request',500)}}catch(error){return{configured:true,sent:false,error:cleanText(error&&error.message,500)}}}
async function authIssueLink(request,env,member,purpose){if(!hasMembersDb(env))return{configured:false,sent:false,error:'D1 membership database unavailable'};const now=new Date();const expiresAt=new Date(now.getTime()+15*60*1000).toISOString();const rawToken=authBase64Url(authBytes(32));const tokenHash=await authHash(rawToken);const linkId=authId('magic');await env.MEMBERS_DB.prepare("UPDATE magic_links SET used_at=? WHERE member_id=? AND purpose=? AND used_at IS NULL").bind(now.toISOString(),member.id,purpose).run();await env.MEMBERS_DB.prepare("INSERT INTO magic_links (id,member_id,token_hash,purpose,expires_at,created_at) VALUES (?,?,?,?,?,?)").bind(linkId,member.id,tokenHash,purpose,expiresAt,now.toISOString()).run();const link=authOrigin(request)+'/api/auth/verify?purpose='+encodeURIComponent(purpose)+'&token='+encodeURIComponent(rawToken);const delivery=await authSendEmail(env,member,link,purpose);if(!delivery.sent){await env.MEMBERS_DB.prepare("UPDATE magic_links SET used_at=? WHERE id=?").bind(new Date().toISOString(),linkId).run()}return{...delivery,expiresAt,purpose}}
async function authMemberByEmail(env,email){return d1First(env.MEMBERS_DB.prepare("SELECT id,email,display_name,status,marketing_status,tier,email_verified_at,created_at,updated_at,last_login_at FROM members WHERE email=? AND status <> 'deleted' LIMIT 1").bind(email))}
async function authMemberById(env,id){return d1First(env.MEMBERS_DB.prepare("SELECT id,email,display_name,status,marketing_status,tier,email_verified_at,created_at,updated_at,last_login_at FROM members WHERE id=? AND status <> 'deleted' LIMIT 1").bind(id))}
async function authCreateSession(env,memberId){const rawToken=authBase64Url(authBytes(32));const sessionHash=await authHash(rawToken);const now=new Date();const expiresAt=new Date(now.getTime()+30*24*60*60*1000).toISOString();await env.MEMBERS_DB.prepare("INSERT INTO member_sessions (id,member_id,session_hash,expires_at,created_at,last_seen_at) VALUES (?,?,?,?,?,?)").bind(authId('session'),memberId,sessionHash,expiresAt,now.toISOString(),now.toISOString()).run();await env.MEMBERS_DB.prepare("UPDATE members SET last_login_at=?,updated_at=? WHERE id=?").bind(now.toISOString(),now.toISOString(),memberId).run();return{rawToken,expiresAt}}
async function authSessionMember(request,env){if(!hasMembersDb(env))return null;const rawToken=authCookieValue(request);if(!rawToken)return null;const sessionHash=await authHash(rawToken);const now=new Date().toISOString();const session=await d1First(env.MEMBERS_DB.prepare("SELECT id,member_id,expires_at,revoked_at FROM member_sessions WHERE session_hash=? LIMIT 1").bind(sessionHash));if(!session||session.revoked_at||String(session.expires_at||'')<=now)return null;const member=await authMemberById(env,session.member_id);if(!member||member.status!=='active')return null;await env.MEMBERS_DB.prepare("UPDATE member_sessions SET last_seen_at=? WHERE id=?").bind(now,session.id).run().catch(()=>null);return{session,member}}
async function handleAuthRequestLink(request,env){const body=await readBody(request);const email=cleanText(body.email||'',240).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return json({ok:false,error:'Valid email required'},400);if(!hasMembersDb(env))return json({ok:false,configured:false,error:'Membership database unavailable'},503);if(!authMailConfigured(env))return json({ok:false,configured:false,error:'Transactional email delivery is not configured'},503);const member=await authMemberByEmail(env,email);if(member){const purpose=member.email_verified_at?'login':'verify_email';await authIssueLink(request,env,member,purpose)}return json({ok:true,accepted:true,message:'If a matching member account exists, a one-time link has been sent.'},202)}
async function handleAuthVerify(request,env){const url=new URL(request.url);const rawToken=cleanText(url.searchParams.get('token')||'',300);const requestedPurpose=cleanText(url.searchParams.get('purpose')||'',40);const failure=reason=>new Response(null,{status:303,headers:{...securityHeaders,Location:authOrigin(request)+'/member-login.html?error='+encodeURIComponent(reason),'Cache-Control':'no-store'}});if(!hasMembersDb(env)||!rawToken)return failure('invalid-link');const tokenHash=await authHash(rawToken);const record=await d1First(env.MEMBERS_DB.prepare("SELECT id,member_id,purpose,expires_at,used_at FROM magic_links WHERE token_hash=? LIMIT 1").bind(tokenHash));const now=new Date().toISOString();if(!record||record.used_at||String(record.expires_at||'')<=now||record.purpose!==requestedPurpose)return failure('expired-or-used');const member=await authMemberById(env,record.member_id);if(!member)return failure('member-not-found');if(record.purpose==='verify_email'){await env.MEMBERS_DB.prepare("UPDATE members SET status='active',marketing_status=CASE WHEN marketing_status='suppressed' THEN marketing_status ELSE 'subscribed' END,email_verified_at=COALESCE(email_verified_at,?),updated_at=? WHERE id=?").bind(now,now,member.id).run()}else if(record.purpose!=='login')return failure('invalid-purpose');await env.MEMBERS_DB.prepare("UPDATE magic_links SET used_at=? WHERE id=?").bind(now,record.id).run();const session=await authCreateSession(env,member.id);const destination=authOrigin(request)+'/member-dashboard.html?'+(record.purpose==='verify_email'?'verified=1':'login=1');return new Response(null,{status:303,headers:{...securityHeaders,Location:destination,'Set-Cookie':authSessionCookie(session.rawToken),'Cache-Control':'no-store'}})}
async function handleAuthLogout(request,env){const rawToken=authCookieValue(request);if(rawToken&&hasMembersDb(env)){const sessionHash=await authHash(rawToken);await env.MEMBERS_DB.prepare("UPDATE member_sessions SET revoked_at=? WHERE session_hash=? AND revoked_at IS NULL").bind(new Date().toISOString(),sessionHash).run().catch(()=>null)}return new Response(JSON.stringify({ok:true,authenticated:false}),{status:200,headers:{...jsonHeaders,'Set-Cookie':authClearCookie()}})}
async function handleMemberMe(request,env){const auth=await authSessionMember(request,env);if(!auth)return json({ok:false,authenticated:false,error:'Authentication required'},401);const subscription=await d1First(env.MEMBERS_DB.prepare("SELECT provider,provider_subscription_id,provider_plan_id,tier,status,next_billing_at,current_period_end,cancel_at_period_end FROM subscriptions WHERE member_id=? ORDER BY updated_at DESC LIMIT 1").bind(auth.member.id));return json({ok:true,authenticated:true,member:{id:auth.member.id,email:auth.member.email,displayName:auth.member.display_name||'',role:'member',tier:auth.member.tier,status:auth.member.status,marketingStatus:auth.member.marketing_status,emailVerifiedAt:auth.member.email_verified_at,createdAt:auth.member.created_at,lastLoginAt:auth.member.last_login_at},subscription:subscription||null,paidAccessEnabled:false,paymentProvider:'paypal-pending'})}
async function handleAuthHealth(env){let schemaReady=false;let members=0;if(hasMembersDb(env)){try{const row=await env.MEMBERS_DB.prepare("SELECT COUNT(*) AS count FROM members").first();members=Number(row&&row.count||0);await env.MEMBERS_DB.prepare("SELECT COUNT(*) AS count FROM magic_links").first();await env.MEMBERS_DB.prepare("SELECT COUNT(*) AS count FROM member_sessions").first();schemaReady=true}catch{schemaReady=false}}return json({ok:schemaReady,d1Connected:hasMembersDb(env),authSchemaReady:schemaReady,transactionalEmailConfigured:authMailConfigured(env),provider:'brevo',members,magicLinkMinutes:15,sessionDays:30,endpoints:{signup:'/api/membership/signup',requestLink:'/api/auth/request-link',verify:'/api/auth/verify',logout:'/api/auth/logout',me:'/api/member/me'},updatedAt:new Date().toISOString()})}
`;

if (!worker.includes('membership-auth-v1:')) {
  const anchor = 'async function handleNewsletterSignup';
  if (!worker.includes(anchor)) fail('signup handler anchor missing');
  worker = worker.replace(anchor, helpers + '\n' + anchor);
}

const signupHandler = String.raw`async function handleNewsletterSignup(request,env){const body=await readBody(request);const email=cleanText(body.email||'',240).toLowerCase();const name=cleanText(body.name||body.displayName||'',120);if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return json({ok:false,persistent:false,saved:false,error:'Valid email required'},400);if(!consentGranted(body.marketingConsent))return json({ok:false,persistent:false,saved:false,error:'Explicit email consent is required'},400);const result=await persistMembershipSignup(env,{email,name,source:body.source||'membership-signup',sourcePage:body.sourcePage||body.page||'',wordingVersion:body.consentVersion||'membership-consent-v1'});const member=result.member||null;let delivery={configured:authMailConfigured(env),sent:false,error:null};if(result.saved&&member&&hasMembersDb(env))delivery=await authIssueLink(request,env,member,'verify_email');const message=!result.saved?'Member could not be persisted.':delivery.sent?'Saved. Check your email to verify membership.':hasMembersDb(env)?'Member saved, but verification email delivery is not configured or failed.':'Member saved in compatibility storage; email verification requires D1.';return json({ok:result.saved,configured:result.configured,persistent:result.persistent,saved:result.saved,memberId:member&&member.id,status:result.saved?'pending-verification':'storage-error',storage:result.storage,emailVerificationRequired:true,emailDeliveryConfigured:delivery.configured,emailSent:delivery.sent,message,error:result.error||delivery.error||undefined},result.saved?202:503)}`;

const signupPatterns = [
  /async function handleNewsletterSignup\(request,env\)\{[\s\S]*?\}\nasync function handleSubscribeNewsletter/,
  /async function handleNewsletterSignup\(request, env\)\{[\s\S]*?\}\nasync function handleSubscribeNewsletter/
];
let signupReplaced = false;
for (const pattern of signupPatterns) {
  if (pattern.test(worker)) {
    worker = worker.replace(pattern, signupHandler + '\nasync function handleSubscribeNewsletter');
    signupReplaced = true;
    break;
  }
}
if (!signupReplaced) fail('membership signup handler shape not recognized');

const routeAnchor = "if(request.method==='POST'&&(originalPath==='/newsletter-signup'||originalPath==='/subscribe-newsletter'||originalPath==='/api/membership/signup'))return handleNewsletterSignup(request,env);";
if (!worker.includes(routeAnchor)) fail('membership signup route anchor missing');
if (!worker.includes("originalPath==='/api/auth/request-link'")) {
  worker = worker.replace(routeAnchor, routeAnchor + "if(request.method==='POST'&&originalPath==='/api/auth/request-link')return handleAuthRequestLink(request,env);if(request.method==='GET'&&originalPath==='/api/auth/verify')return handleAuthVerify(request,env);if(request.method==='POST'&&originalPath==='/api/auth/logout')return handleAuthLogout(request,env);if(request.method==='GET'&&originalPath==='/api/member/me')return handleMemberMe(request,env);if(request.method==='GET'&&originalPath==='/api/auth/health')return handleAuthHealth(env);");
}

const required = [
  'membership-auth-v1:',
  "crypto.subtle.digest('SHA-256'",
  "api.brevo.com/v3/smtp/email",
  "purpose==='verify_email'",
  "'Set-Cookie':authSessionCookie",
  "originalPath==='/api/auth/request-link'",
  "originalPath==='/api/auth/verify'",
  "originalPath==='/api/auth/logout'",
  "originalPath==='/api/member/me'",
  "originalPath==='/api/auth/health'",
  'emailVerificationRequired:true'
];
const missing = required.filter(marker => !worker.includes(marker));
if (missing.length) fail('patched Worker missing auth marker(s): ' + missing.join(', '));
if (worker.includes('token_hash,rawToken')) fail('raw magic token must never be written to D1');

if (worker !== beforeWorker) fs.writeFileSync(workerPath, worker);
const report = {
  ok: true,
  generatedAt: new Date().toISOString(),
  changed: worker !== beforeWorker,
  mode: 'D1 email verification and passwordless magic-link authentication',
  provider: 'Brevo transactional email',
  rawTokensStored: false,
  sessionCookie: 'HttpOnly Secure SameSite=Lax',
  required
};
fs.writeFileSync(path.join(reportDir, 'membership-auth-patch-report.json'), JSON.stringify(report, null, 2));
console.log('Membership auth patch OK: verification links, passwordless login, secure sessions and member identity endpoint installed.');
