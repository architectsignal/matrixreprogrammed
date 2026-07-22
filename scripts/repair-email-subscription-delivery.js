const fs = require('fs');
const path = require('path');

const root = process.cwd();
const emailPath = path.join(root, 'src', 'worker-email-lifecycle.js');
const tomlPath = path.join(root, 'wrangler.toml');
const jsoncPath = path.join(root, 'wrangler.jsonc');
const reportPath = path.join(root, 'downloads', 'email-subscription-delivery-repair.json');

for (const required of [emailPath, tomlPath, jsoncPath]) {
  if (!fs.existsSync(required)) throw new Error(`Required email delivery source is missing: ${path.relative(root, required)}`);
}

function replaceOnce(source, before, after, label) {
  if (source.includes(before)) return source.replace(before, after);
  if (source.includes(after)) return source;
  throw new Error(`${label} anchor not found`);
}

function repairEmailWorker(source) {
  const unsafeUpsert = "async function upsertSignupMember(env,input,{resubscribe=false}={}){const email=clean(input.email,254).toLowerCase();const name=clean(input.name,120);const stamp=iso(env);const requestedId='subscriber-'+(await hash(email)).slice(0,24);await env.MEMBERS_DB.prepare(`INSERT INTO members (id,email,display_name,role,tier,status,marketing_status,source,created_at,updated_at) VALUES (?,?,?,'member','free','pending','pending',?,?,?) ON CONFLICT(email) DO UPDATE SET display_name=CASE WHEN excluded.display_name<>'' THEN excluded.display_name ELSE members.display_name END,status=CASE WHEN members.status='deleted' THEN members.status ELSE members.status END,marketing_status=CASE WHEN ?=1 THEN 'pending' WHEN members.marketing_status IN ('suppressed','bounced','complained') THEN members.marketing_status ELSE 'pending' END,source=excluded.source,updated_at=excluded.updated_at`).bind(requestedId,email,name,clean(input.source||input.path||'newsletter-signup',180),stamp,stamp,resubscribe?1:0).run();return memberByEmail(env,email)}";
  const safeUpsert = "async function upsertSignupMember(env,input,{resubscribe=false}={}){const email=clean(input.email,254).toLowerCase();const name=clean(input.name,120);const stamp=iso(env);const requestedId='subscriber-'+(await hash(email)).slice(0,24);await env.MEMBERS_DB.prepare(`INSERT INTO members (id,email,display_name,role,tier,status,marketing_status,source,created_at,updated_at) VALUES (?,?,?,'member','free','pending','pending',?,?,?) ON CONFLICT(email) DO UPDATE SET display_name=CASE WHEN excluded.display_name<>'' THEN excluded.display_name ELSE members.display_name END,status=CASE WHEN members.status='deleted' THEN members.status ELSE members.status END,marketing_status=CASE WHEN ?=1 THEN 'pending' WHEN members.status='active' AND members.email_verified_at IS NOT NULL AND members.marketing_status='subscribed' THEN 'subscribed' WHEN members.marketing_status IN ('suppressed','bounced','complained','unsubscribed') THEN members.marketing_status ELSE 'pending' END,source=excluded.source,updated_at=excluded.updated_at`).bind(requestedId,email,name,clean(input.source||input.path||'newsletter-signup',180),stamp,stamp,resubscribe?1:0).run();return memberByEmail(env,email)}";
  source = replaceOnce(source, unsafeUpsert, safeUpsert, 'Verified subscriber state preservation');

  const signupStartLegacy = "const email=clean(input.email,254).toLowerCase();if(!validEmail(email))return json({ok:false,error:'Valid email required'},400);if(!bool(input.consent,false))return json({ok:false,error:'Explicit email consent is required'},400);let member=await upsertSignupMember(env,{...input,email},{resubscribe});";
  const signupStartCompatible = "const email=clean(input.email,254).toLowerCase();if(!validEmail(email))return json({ok:false,error:'Valid email required'},400);if(!bool(input.consent??input.marketingConsent,false))return json({ok:false,error:'Explicit email consent is required'},400);let member=await upsertSignupMember(env,{...input,email},{resubscribe});";
  const signupStartSafe = "const email=clean(input.email,254).toLowerCase();if(!validEmail(email))return json({ok:false,error:'Valid email required'},400);if(!bool(input.consent??input.marketingConsent,false))return json({ok:false,error:'Explicit email consent is required'},400);const existingBeforeSignup=await memberByEmail(env,email);let member=await upsertSignupMember(env,{...input,email},{resubscribe});";
  if (source.includes(signupStartCompatible)) source = source.replace(signupStartCompatible, signupStartSafe);
  else if (source.includes(signupStartLegacy)) source = source.replace(signupStartLegacy, signupStartSafe);
  else if (!source.includes(signupStartSafe)) throw new Error('Existing subscriber snapshot anchor not found');

  const consentAnchor = "const consentId=await appendConsent(env,member.id,true,sourcePage,resubscribe?'email-resubscribe-v1':'email-signup-v2');await savePreferences(env,member.id,input);const purpose=resubscribe?'resubscribe':'verify_marketing';";
  const consentSafe = "const consentId=await appendConsent(env,member.id,true,sourcePage,resubscribe?'email-resubscribe-v1':'email-signup-v2');await savePreferences(env,member.id,input);const blockedStatuses=new Set(['unsubscribed','suppressed','bounced','complained']);const alreadyVerified=Boolean(!resubscribe&&existingBeforeSignup&&existingBeforeSignup.status==='active'&&existingBeforeSignup.email_verified_at&&!blockedStatuses.has(String(existingBeforeSignup.marketing_status||''))&&!(await activeSuppression(env,member.id)));if(alreadyVerified){await env.MEMBERS_DB.prepare(`UPDATE members SET marketing_status='subscribed',updated_at=? WHERE id=? AND status='active' AND email_verified_at IS NOT NULL`).bind(iso(env),member.id).run();member=await memberById(env,member.id);await syncSegments(env,member);const providerSync=await syncBrevoContact(env,member,{blacklisted:false});await audit(env,member.id,'email.signup.verified_preferences_refreshed','member',member.id,{sourcePage,providerSynced:providerSync.synced,verificationRequired:false});return json({ok:true,accepted:true,saved:true,status:'active',providerSync,verification:{required:false,queued:false,sent:false},message:'Your verified subscription remains active and your email preferences were updated.'},200)}const purpose=resubscribe?'resubscribe':'verify_marketing';";
  source = replaceOnce(source, consentAnchor, consentSafe, 'Verified repeat-signup fast path');

  const scheduledBefore = "async function scheduledHandler(event,env,ctx){if(!hasD1(env))return;const request=new Request('https://matrixreprogrammed.com/api/email/admin/run-automation');const job=async()=>{await ensureSchema(env);if(!automationEnabled(env))return;if(event?.cron==='15 7 * * 1')await automatedCampaign(request,env,'weekly');else if(event?.cron==='5 6 * * *')await automatedCampaign(request,env,'daily');await processOutbox(env,{limit:250})};if(ctx?.waitUntil)ctx.waitUntil(job());else await job()}";
  const scheduledAfter = "async function repairVerifiedPendingSubscribers(env){const stamp=iso(env);const restored=await env.MEMBERS_DB.prepare(`UPDATE members SET marketing_status='subscribed',updated_at=? WHERE status='active' AND email_verified_at IS NOT NULL AND marketing_status='pending' AND COALESCE((SELECT ec.granted FROM email_consents ec WHERE ec.member_id=members.id AND ec.consent_type='marketing_email' ORDER BY ec.created_at DESC LIMIT 1),0)=1 AND NOT EXISTS (SELECT 1 FROM email_suppressions es WHERE es.member_id=members.id AND es.active=1 AND es.scope='all_marketing')`).bind(stamp).run();const members=await all(env.MEMBERS_DB.prepare(`SELECT id FROM members WHERE updated_at=? AND status='active' AND marketing_status='subscribed' AND email_verified_at IS NOT NULL`).bind(stamp));for(const row of members){const member=await memberById(env,row.id);if(member)await syncSegments(env,member)}return{restored:Number(restored?.meta?.changes||0),segmentsResynced:members.length}}
async function scheduledHandler(event,env,ctx){if(!hasD1(env))return;const request=new Request('https://matrixreprogrammed.com/api/email/admin/run-automation');const job=async()=>{await ensureSchema(env);if(!automationEnabled(env))return;await repairVerifiedPendingSubscribers(env);const cron=String(event?.cron||'');const stamp=now(env);const minuteOfDay=stamp.getUTCHours()*60+stamp.getUTCMinutes();if(cron==='15 7 * * 1')await automatedCampaign(request,env,'weekly');else if(cron==='5 6 * * *')await automatedCampaign(request,env,'daily');else if(cron==='35 * * * *'){if(minuteOfDay>=365)await automatedCampaign(request,env,'daily');if(stamp.getUTCDay()===1&&minuteOfDay>=435)await automatedCampaign(request,env,'weekly')}await processOutbox(env,{limit:250})};if(ctx?.waitUntil)ctx.waitUntil(job());else await job()}";
  source = replaceOnce(source, scheduledBefore, scheduledAfter, 'Missed campaign catch-up and verified subscriber recovery');

  for (const marker of [
    'existingBeforeSignup',
    'input.consent??input.marketingConsent',
    'email.signup.verified_preferences_refreshed',
    'repairVerifiedPendingSubscribers',
    "event?.cron||''",
    "cron==='35 * * * *'",
    "members.email_verified_at IS NOT NULL AND members.marketing_status='subscribed'"
  ]) if (!source.includes(marker)) throw new Error(`Email repair marker missing: ${marker}`);
  return source;
}

function repairToml(source) {
  const required = 'crons = ["5 6 * * *", "15 7 * * 1", "35 * * * *"]';
  if (/^crons\s*=\s*\[[^\]]*\]\s*$/m.test(source)) return source.replace(/^crons\s*=\s*\[[^\]]*\]\s*$/m, required);
  if (!/^\[triggers\]\s*$/m.test(source)) throw new Error('wrangler.toml [triggers] section is missing');
  return source.replace(/^\[triggers\]\s*$/m, `[triggers]\n${required}`);
}

function repairJsonc(source) {
  const required = '"crons": ["5 6 * * *", "15 7 * * 1", "35 * * * *"]';
  if (/"crons"\s*:\s*\[[^\]]*\]/s.test(source)) return source.replace(/"crons"\s*:\s*\[[^\]]*\]/s, required);
  if (!/"triggers"\s*:\s*\{/m.test(source)) throw new Error('wrangler.jsonc triggers object is missing');
  return source.replace(/"triggers"\s*:\s*\{/m, `"triggers": {\n    ${required},`);
}

const emailBefore = fs.readFileSync(emailPath, 'utf8');
const tomlBefore = fs.readFileSync(tomlPath, 'utf8');
const jsoncBefore = fs.readFileSync(jsoncPath, 'utf8');
const emailAfter = repairEmailWorker(emailBefore);
const tomlAfter = repairToml(tomlBefore);
const jsoncAfter = repairJsonc(jsoncBefore);

if (emailAfter !== emailBefore) fs.writeFileSync(emailPath, emailAfter);
if (tomlAfter !== tomlBefore) fs.writeFileSync(tomlPath, tomlAfter);
if (jsoncAfter !== jsoncBefore) fs.writeFileSync(jsoncPath, jsoncAfter);

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  changed: {
    emailWorker: emailAfter !== emailBefore,
    wranglerToml: tomlAfter !== tomlBefore,
    wranglerJsonc: jsoncAfter !== jsoncBefore
  },
  safeguards: {
    canonicalConsentCompatible: true,
    verifiedRepeatSignupPreserved: true,
    pendingVerifiedRecoverySupported: true,
    runtimeRecoveryBeforeCampaign: true,
    explicitUnsubscribeAndSuppressionsPreserved: true,
    hourlyIdempotentCatchUp: true,
    dailyCron: '5 6 * * *',
    weeklyCron: '15 7 * * 1',
    catchUpCron: '35 * * * *'
  }
}, null, 2)}\n`);
console.log(`Email subscription delivery repair ${emailAfter !== emailBefore || tomlAfter !== tomlBefore || jsoncAfter !== jsoncBefore ? 'applied' : 'already current'}.`);
