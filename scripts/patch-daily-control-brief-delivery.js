const fs = require('fs');
const path = require('path');

const root = process.cwd();
const workerPath = path.join(root, 'src', 'worker-email-lifecycle.js');
if (!fs.existsSync(workerPath)) throw new Error('src/worker-email-lifecycle.js not found');

let source = fs.readFileSync(workerPath, 'utf8');
const marker = 'daily-first-brief-v1';

if (!source.includes(marker)) {
  const helper = [
    '',
    `const DAILY_FIRST_BRIEF_VERSION='${marker}';`,
    "function dailyCampaignDate(campaign,env){const match=String(campaign?.campaign_key||'').match(/\\d{4}-\\d{2}-\\d{2}/);return match?match[0]:iso(env).slice(0,10)}",
    "function dailyControlBriefIdempotency(campaign,member,env){const key=String(campaign?.campaign_key||'');if(key.startsWith('automation:daily:')||key.startsWith('daily-first-brief:'))return `daily-control-brief:${member.id}:${dailyCampaignDate(campaign,env)}`;return `${campaign.id}:${member.id}`}",
    "async function sendFirstDailyBrief(request,env,member){const p=await preferences(env,member.id)||{};if(p.public_daily_brief!==1)return{eligible:false,state:'not-selected',queued:false,sent:false,retry:false};const date=iso(env).slice(0,10);const idempotencyKey=`daily-control-brief:${member.id}:${date}`;const existing=await first(env.MEMBERS_DB.prepare('SELECT id,status,provider_message_id,last_error FROM email_outbox WHERE idempotency_key=? LIMIT 1').bind(idempotencyKey));if(existing)return{eligible:true,state:existing.status==='sent'?'already-sent':'already-queued',queued:true,sent:existing.status==='sent',retry:existing.status==='retry',providerMessageId:existing.provider_message_id||null,error:existing.last_error||null};const sourceBundle=await loadCampaignSource(request,env,'daily');const items=sourceItems(sourceBundle);const title='Daily Control Brief';const rows=items.length?items.map((item,index)=>({heading:clean(item.title||item.headline||item.subject||item.label||`Signal ${index+1}`,180),summary:clean(item.summary||item.description||item.body||item.finding||'',600)})):[{heading:'Evidence and intelligence update',summary:'The canonical daily source bundle was unavailable, so no unsupported claims were inserted. Open Live Intel for the latest evidence-bounded records.'}];const htmlContent=`<!doctype html><html><body><h1>${html(title)} — ${date}</h1>${rows.map(row=>`<h2>${html(row.heading)}</h2><p>${html(row.summary)}</p>`).join('')}<p><strong>Evidence boundary:</strong> Records and analysis remain subject to their source and interpretive labels. Association is not proof.</p><p><a href=\"${origin(request)}/live-intel.html\">Open Live Intel</a></p></body></html>`;const textLines=[`${title} — ${date}`,''];for(const row of rows){textLines.push(row.heading,row.summary,'')}textLines.push('Evidence boundary: association is not proof.',`${origin(request)}/live-intel.html`);const textContent=textLines.join(String.fromCharCode(10));const campaign=await createCampaign(env,{kind:'daily',segmentKey:'public_daily_brief',subject:`${title} — ${date}`,htmlContent,textContent,campaignKey:`daily-first-brief:${member.id}:${date}`,canonicalRecordIds:items.map(item=>item.canonicalId||item.id).filter(Boolean),evidenceCheckpointAt:clean(sourceBundle?.data?.generatedAt||iso(env),80)},'email-verification');const content=await first(env.MEMBERS_DB.prepare('SELECT * FROM email_campaign_content_versions WHERE id=?').bind(campaign.content_version_id));await env.MEMBERS_DB.prepare(`INSERT OR IGNORE INTO email_deliveries (id,campaign_id,member_id,recipient_email_hash,status,queued_at,updated_at) VALUES (?,?,?,?, 'queued',?,?)`).bind(id(env,'email-delivery'),campaign.id,member.id,await emailHash(member.email),iso(env),iso(env)).run();await enqueue(env,member,{campaignId:campaign.id,messageKind:'daily',subject:content.subject,htmlContent:content.html_content,textContent:content.text_content,idempotencyKey});await env.MEMBERS_DB.prepare(`UPDATE email_campaigns SET status='sending',started_at=COALESCE(started_at,?),recipient_count=1,updated_at=? WHERE id=?`).bind(iso(env),iso(env),campaign.id).run();const delivery=await processOutbox(env,{memberId:member.id,limit:10});const state=delivery.sent>0?'sent':delivery.retry>0?'queued-for-retry':delivery.failed>0?'failed':'queued';await audit(env,member.id,'email.daily.first_brief','email_campaign',campaign.id,{version:DAILY_FIRST_BRIEF_VERSION,source:sourceBundle?.pathname||null,state,...delivery});return{eligible:true,state,queued:true,sent:delivery.sent>0,retry:delivery.retry>0,failed:delivery.failed>0,campaignId:campaign.id,source:sourceBundle?.pathname||null,...delivery}}",
    ''
  ].join('\n');
  const anchor = 'async function handleVerify(request,env){';
  if (!source.includes(anchor)) throw new Error('handleVerify anchor missing');
  source = source.replace(anchor, helper + anchor);
}

const queuePattern = /async function queueCampaign\(env,campaign\)\{[\s\S]*?\nasync function loadCampaignSource/;
if (!queuePattern.test(source)) throw new Error('queueCampaign function not found');
const replacementQueue = [
  "async function queueCampaign(env,campaign){const content=await first(env.MEMBERS_DB.prepare('SELECT * FROM email_campaign_content_versions WHERE id=?').bind(campaign.content_version_id));const segment=await first(env.MEMBERS_DB.prepare('SELECT segment_key FROM email_segments WHERE id=?').bind(campaign.segment_id));const recipients=await eligibleMembers(env,segment.segment_key);let queued=0,skippedExisting=0;for(const member of recipients){const idempotencyKey=dailyControlBriefIdempotency(campaign,member,env);const existing=await first(env.MEMBERS_DB.prepare('SELECT id FROM email_outbox WHERE idempotency_key=? LIMIT 1').bind(idempotencyKey));if(existing){skippedExisting+=1;continue}await env.MEMBERS_DB.prepare(`INSERT OR IGNORE INTO email_deliveries (id,campaign_id,member_id,recipient_email_hash,status,queued_at,updated_at) VALUES (?,?,?,?, 'queued',?,?)`).bind(id(env,'email-delivery'),campaign.id,member.id,await emailHash(member.email),iso(env),iso(env)).run();await enqueue(env,member,{campaignId:campaign.id,messageKind:campaign.kind,subject:content.subject,htmlContent:content.html_content,textContent:content.text_content,idempotencyKey});queued+=1}await env.MEMBERS_DB.prepare(`UPDATE email_campaigns SET status=?,started_at=COALESCE(started_at,?),recipient_count=?,updated_at=? WHERE id=?`).bind(queued?'sending':'sent',iso(env),queued,iso(env),campaign.id).run();return{recipientCount:queued,skippedExisting}}",
  'async function loadCampaignSource'
].join('\n');
source = source.replace(queuePattern, replacementQueue);

const firstBriefFunction = source.includes('async function sendDetailedFirstDailyBrief')
  ? 'sendDetailedFirstDailyBrief'
  : 'sendFirstDailyBrief';
const oldVerifyTail = "await enqueue(env,member,{messageKind:'welcome',subject:'Welcome to Matrix Reprogrammed',...template,idempotencyKey:`welcome:${member.id}:${stamp.slice(0,10)}`});const delivery=await processOutbox(env,{memberId:member.id,limit:5});await audit(env,member.id,'email.verified','member',member.id,{purpose,providerSynced:providerSync.synced,welcomeSent:delivery.sent>0});if(testMode(env))return json({ok:true,verified:true,memberId:member.id,preferenceToken,unsubscribeToken,dashboardUrl,providerSync,welcomeSent:delivery.sent>0});return redirect(`${origin(request)}/email-status.html?verified=1&token=${encodeURIComponent(preferenceToken)}`)}";
const newVerifyTail = "await enqueue(env,member,{messageKind:'welcome',subject:'Welcome to Matrix Reprogrammed',...template,idempotencyKey:`welcome:${member.id}:${stamp.slice(0,10)}`});const welcomeDelivery=await processOutbox(env,{memberId:member.id,limit:5});const firstBrief=await sendFirstDailyBrief(request,env,member);await audit(env,member.id,'email.verified','member',member.id,{purpose,providerSynced:providerSync.synced,welcomeSent:welcomeDelivery.sent>0,firstDailyBrief:firstBrief});if(testMode(env))return json({ok:true,verified:true,memberId:member.id,preferenceToken,unsubscribeToken,dashboardUrl,providerSync,welcomeSent:welcomeDelivery.sent>0,firstDailyBrief:firstBrief});const briefState=encodeURIComponent(firstBrief.state||'not-selected');return redirect(`${origin(request)}/email-status.html?verified=1&token=${encodeURIComponent(preferenceToken)}&dailyBrief=${briefState}`)}".replace('sendFirstDailyBrief', firstBriefFunction);
const acceptedVerifyCalls = [
  'const firstBrief=await sendDetailedFirstDailyBrief(request,env,member)',
  'const firstBrief=await sendFirstDailyBrief(request,env,member)'
];
if (source.includes(oldVerifyTail)) source = source.replace(oldVerifyTail, newVerifyTail);
else if (!acceptedVerifyCalls.some(call => source.includes(call))) throw new Error('handleVerify delivery tail not found');

source = source.replace("'/api/email/admin/campaigns','/api/email/admin/process-outbox','/api/email/admin/run-automation'", "'/api/email/admin/campaigns','/api/email/admin/process-outbox','/api/email/admin/run-automation','/api/email/admin/subscriber'");

if (!source.includes('async function handleAdminSubscriber')) {
  const adminAnchor = 'async function handleAdminHealth(request,env){';
  const adminHelper = [
    "async function handleAdminSubscriber(request,env){if(!adminAllowed(request,env))return json({ok:false,error:'Forbidden'},403);await ensureSchema(env);const url=new URL(request.url);const requestedEmail=clean(url.searchParams.get('email'),254).toLowerCase();const requestedHash=clean(url.searchParams.get('emailHash'),128);let member=requestedEmail?await memberByEmail(env,requestedEmail):null;if(!member&&requestedHash){const candidates=await all(env.MEMBERS_DB.prepare(`SELECT id,email,display_name,role,tier,status,marketing_status,source,email_verified_at,created_at,updated_at,last_login_at FROM members WHERE status<>'deleted' ORDER BY updated_at DESC LIMIT 500`));for(const candidate of candidates){if(await emailHash(candidate.email)===requestedHash){member=candidate;break}}}if(!member)return json({ok:false,error:'Subscriber not found'},404);const p=await preferences(env,member.id);const segments=await all(env.MEMBERS_DB.prepare(`SELECT s.segment_key,s.label,m.state,m.reason,m.activated_at,m.updated_at FROM email_segment_memberships m JOIN email_segments s ON s.id=m.segment_id WHERE m.member_id=? ORDER BY s.segment_key`).bind(member.id));const suppressions=await all(env.MEMBERS_DB.prepare(`SELECT scope,segment_key,reason,source,active,suppressed_at,cleared_at FROM email_suppressions WHERE member_id=? ORDER BY suppressed_at DESC LIMIT 20`).bind(member.id));const deliveries=await all(env.MEMBERS_DB.prepare(`SELECT c.kind,c.campaign_key,c.status campaign_status,d.status delivery_status,d.provider_message_id,d.queued_at,d.sent_at,d.delivered_at,d.failure_reason FROM email_deliveries d JOIN email_campaigns c ON c.id=d.campaign_id WHERE d.member_id=? ORDER BY d.queued_at DESC LIMIT 30`).bind(member.id));return json({ok:true,subscriber:{id:member.id,emailHash:await emailHash(member.email),displayName:member.display_name,tier:member.tier,status:member.status,marketingStatus:member.marketing_status,verifiedAt:member.email_verified_at,source:member.source},preferences:p,segments,suppressions,deliveries})}",
    ''
  ].join('\n');
  if (!source.includes(adminAnchor)) throw new Error('admin health anchor missing');
  source = source.replace(adminAnchor, adminHelper + adminAnchor);
}

source = source.replace("if(request.method==='GET'&&path==='/api/email/admin/health')return handleAdminHealth(request,env);", "if(request.method==='GET'&&path==='/api/email/admin/health')return handleAdminHealth(request,env);if(request.method==='GET'&&path==='/api/email/admin/subscriber')return handleAdminSubscriber(request,env);");

const hasAcceptedBriefCall = acceptedVerifyCalls.some(call => source.includes(call));
if (!source.includes(marker) || !hasAcceptedBriefCall || !source.includes('/api/email/admin/subscriber')) {
  throw new Error('Daily Control Brief delivery patch did not apply completely');
}

fs.writeFileSync(workerPath, source);
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'daily-control-brief-delivery-patch.json'), JSON.stringify({
  ok: true,
  version: marker,
  immediateAfterVerification: true,
  firstBriefBuilder: firstBriefFunction,
  sameDayIdempotency: 'daily-control-brief:{memberId}:{YYYY-MM-DD}',
  adminSubscriberDiagnostic: true,
  generatedAt: new Date().toISOString()
}, null, 2));
console.log(`Daily Control Brief immediate delivery, same-day idempotency and protected subscriber diagnostics applied with ${firstBriefFunction}.`);
