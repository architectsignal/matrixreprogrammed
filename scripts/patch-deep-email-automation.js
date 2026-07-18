const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const target = path.join(root, 'src', 'worker-email-lifecycle.js');
const reportPath = path.join(root, 'downloads', 'deep-email-automation-patch.json');
if (!fs.existsSync(target)) throw new Error('src/worker-email-lifecycle.js is missing');
let source = fs.readFileSync(target, 'utf8');
const report = { ok: true, generatedAt: new Date().toISOString(), patched: [], checks: [] };
function need(condition, message) { report.checks.push({ message, ok: Boolean(condition) }); if (!condition) throw new Error(message); }
function range(text, signature) {
  const start = text.indexOf(signature);
  if (start < 0) return null;
  const open = text.indexOf('{', start + signature.length);
  if (open < 0) return null;
  let depth = 0, quote = '', escaped = false, lineComment = false, blockComment = false;
  for (let index = open; index < text.length; index += 1) {
    const char = text[index], next = text[index + 1] || '';
    if (lineComment) { if (char === '\n') lineComment = false; continue; }
    if (blockComment) { if (char === '*' && next === '/') { blockComment = false; index += 1; } continue; }
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (char === '\\') { escaped = true; continue; }
      if (char === quote) quote = '';
      continue;
    }
    if (char === '/' && next === '/') { lineComment = true; index += 1; continue; }
    if (char === '/' && next === '*') { blockComment = true; index += 1; continue; }
    if (char === "'" || char === '"' || char === '`') { quote = char; continue; }
    if (char === '{') depth += 1;
    else if (char === '}') { depth -= 1; if (depth === 0) return { start, end: index + 1 }; }
  }
  return null;
}
function replaceFunction(signature, replacement, label) {
  const found = range(source, signature);
  need(Boolean(found), `${label} function was not found or was unbalanced`);
  source = `${source.slice(0, found.start)}${replacement}${source.slice(found.end)}`;
  report.patched.push(label);
}

const importLine = "import { buildBriefEmail } from './worker-daily-brief-email.js';";
if (!source.includes(importLine)) {
  source = `${importLine}\n${source}`;
  report.patched.push('daily-brief-email-import');
}

if (!source.includes('async function issueReusableEmailToken')) {
  const anchor = 'async function tokenRecord(env,raw,purpose)';
  need(source.includes(anchor), 'email token helper anchor is missing');
  const helper = `async function issueReusableEmailToken(env,memberId,purpose,scope={},minutes=365*24*60){const raw=tokenValue(env,purpose);const tokenHash=await hash(raw);const stamp=iso(env);await env.MEMBERS_DB.prepare('INSERT INTO email_action_tokens (id,member_id,token_hash,purpose,scope_json,expires_at,created_at) VALUES (?,?,?,?,?,?,?)').bind(id(env,'email-token'),memberId,tokenHash,purpose,JSON.stringify(scope),iso(env,minutes*60*1000),stamp).run();return raw}\n`;
  source = source.replace(anchor, `${helper}${anchor}`);
  report.patched.push('reusable-personalized-email-token');
}

const queueCampaignReplacement = `async function queueCampaign(env,campaign){
  const content=await first(env.MEMBERS_DB.prepare('SELECT * FROM email_campaign_content_versions WHERE id=?').bind(campaign.content_version_id));
  const segment=await first(env.MEMBERS_DB.prepare('SELECT segment_key FROM email_segments WHERE id=?').bind(campaign.segment_id));
  const recipients=await eligibleMembers(env,segment.segment_key);
  for(const member of recipients){
    const preferenceToken=await issueReusableEmailToken(env,member.id,'preferences',{memberId:member.id,campaignId:campaign.id});
    const unsubscribeToken=await issueReusableEmailToken(env,member.id,'unsubscribe',{memberId:member.id,campaignId:campaign.id});
    const preferenceUrl=\`https://matrixreprogrammed.com/subscriber-dashboard.html?token=\${encodeURIComponent(preferenceToken)}\`;
    const unsubscribeUrl=\`https://matrixreprogrammed.com/api/email/unsubscribe?token=\${encodeURIComponent(unsubscribeToken)}\`;
    const footerHtml=\`<div style="margin-top:24px;padding-top:14px;border-top:1px solid #5f4c27;font-size:12px;color:#b9aa82"><a href="\${preferenceUrl}" style="color:#d8b56a">Manage preferences</a> · <a href="\${unsubscribeUrl}" style="color:#d8b56a">Unsubscribe</a></div>\`;
    const htmlContent=String(content.html_content||'').includes('</body>')?String(content.html_content).replace('</body>',footerHtml+'</body>'):String(content.html_content||'')+footerHtml;
    const textContent=\`\${String(content.text_content||'')}\n\nManage preferences: \${preferenceUrl}\nUnsubscribe: \${unsubscribeUrl}\`;
    await env.MEMBERS_DB.prepare(\`INSERT OR IGNORE INTO email_deliveries (id,campaign_id,member_id,recipient_email_hash,status,queued_at,updated_at) VALUES (?,?,?,?, 'queued',?,?)\`).bind(id(env,'email-delivery'),campaign.id,member.id,await emailHash(member.email),iso(env),iso(env)).run();
    await enqueue(env,member,{campaignId:campaign.id,messageKind:campaign.kind,subject:content.subject,htmlContent,textContent,idempotencyKey:\`\${campaign.id}:\${member.id}\`});
  }
  await env.MEMBERS_DB.prepare(\`UPDATE email_campaigns SET status='sending',started_at=COALESCE(started_at,?),recipient_count=?,updated_at=? WHERE id=?\`).bind(iso(env),recipients.length,iso(env),campaign.id).run();
  return{recipientCount:recipients.length}
}`;
replaceFunction('async function queueCampaign(env,campaign)', queueCampaignReplacement, 'personalized-campaign-queue');

const loadCampaignSourceReplacement = `async function loadCampaignSource(request,env,kind){
  if(!env?.ASSETS||typeof env.ASSETS.fetch!=='function')return null;
  const candidates=kind==='weekly'
    ?['/downloads/weekly-investigation-report.json','/data/weekly-intelligence.json','/data/daily-brain-brief.json','/downloads/daily-brain-brief.json','/downloads/outcome-briefings.json']
    :['/data/daily-brain-brief.json','/downloads/daily-brain-brief.json','/data/live-intel.json','/downloads/outcome-briefings.json'];
  for(const pathname of candidates){
    try{
      const response=await env.ASSETS.fetch(new Request(new URL(pathname,request.url),{headers:{accept:'application/json'}}));
      if(!response.ok)continue;
      const data=await response.json();
      if(data&&typeof data==='object')return{pathname,data};
    }catch{}
  }
  return null
}`;
replaceFunction('async function loadCampaignSource(request,env,kind)', loadCampaignSourceReplacement, 'deep-campaign-source-loader');

const sourceItemsReplacement = `function sourceItems(source){
  const data=source?.data;if(!data)return[];
  const candidates=[data.briefings,data.sectionBriefings,data.records,data.items,data.findings,data.entries,data.results,data.cards,data.topSignals];
  for(const value of candidates)if(Array.isArray(value))return value.slice(0,12);
  return[]
}`;
replaceFunction('function sourceItems(source)', sourceItemsReplacement, 'deep-campaign-source-items');

if (!source.includes('async function queueImmediateDailyBrief')) {
  const anchor = 'async function handleVerify(request,env)';
  need(source.includes(anchor), 'handleVerify anchor is missing');
  const helper = `async function queueImmediateDailyBrief(request,env,member,{dashboardUrl='',unsubscribeUrl=''}={}){
  const current=await preferences(env,member.id)||await savePreferences(env,member.id,{});
  if(current.public_daily_brief!==1)return{queued:false,reason:'public-daily-preference-disabled'};
  const sourceBundle=await loadCampaignSource(request,env,'daily');
  const content=buildBriefEmail({kind:'daily',source:sourceBundle,baseUrl:origin(request),date:iso(env).slice(0,10),recipientTier:member.tier||'registered'});
  const footerHtml=\`<div style="margin-top:24px;padding-top:14px;border-top:1px solid #5f4c27;font-size:12px;color:#b9aa82"><a href="\${dashboardUrl}" style="color:#d8b56a">Manage preferences</a> · <a href="\${unsubscribeUrl}" style="color:#d8b56a">Unsubscribe</a></div>\`;
  const htmlContent=content.htmlContent.includes('</body>')?content.htmlContent.replace('</body>',footerHtml+'</body>'):content.htmlContent+footerHtml;
  const textContent=\`\${content.textContent}\n\nManage preferences: \${dashboardUrl}\nUnsubscribe: \${unsubscribeUrl}\`;
  await enqueue(env,member,{messageKind:'first_daily_brief',subject:content.subject,htmlContent,textContent,idempotencyKey:\`first-daily-brief:\${member.id}:\${content.evidenceCheckpointAt||iso(env).slice(0,10)}\`});
  return{queued:true,source:sourceBundle?.pathname||null,briefingCount:content.brief?.briefings?.length||0,subject:content.subject}
}\n`;
  source = source.replace(anchor, `${helper}${anchor}`);
  report.patched.push('immediate-first-daily-brief-helper');
}

{
  const found = range(source, 'async function handleVerify(request,env)');
  need(Boolean(found), 'handleVerify function is missing');
  let functionText = source.slice(found.start, found.end);
  if (!functionText.includes('queueImmediateDailyBrief(request,env,member')) {
    const deliveryAnchor = 'const delivery=await processOutbox(env,{memberId:member.id,limit:5});';
    need(functionText.includes(deliveryAnchor), 'handleVerify delivery anchor is missing');
    functionText = functionText.replace(deliveryAnchor, "const immediateBrief=await queueImmediateDailyBrief(request,env,member,{dashboardUrl,unsubscribeUrl});const delivery=await processOutbox(env,{memberId:member.id,limit:10});");
    functionText = functionText.replace('{purpose,providerSynced:providerSync.synced,welcomeSent:delivery.sent>0}', '{purpose,providerSynced:providerSync.synced,welcomeSent:delivery.sent>0,immediateBrief}');
    functionText = functionText.replace('providerSync,welcomeSent:delivery.sent>0}', 'providerSync,welcomeSent:delivery.sent>0,immediateBrief}');
    source = `${source.slice(0, found.start)}${functionText}${source.slice(found.end)}`;
    report.patched.push('verification-immediate-first-brief');
  }
}

const automatedCampaignReplacement = `async function automatedCampaign(request,env,kind){
  if(!automationEnabled(env))return{enabled:false,created:false,reason:'EMAIL_AUTOMATION_ENABLED is not true'};
  const sourceBundle=await loadCampaignSource(request,env,kind);
  const content=buildBriefEmail({kind,source:sourceBundle,baseUrl:origin(request),date:iso(env).slice(0,10),recipientTier:kind==='weekly'?'public-weekly':'public-daily'});
  const date=iso(env).slice(0,10);
  const segmentKey=kind==='weekly'?'public_weekly_digest':'public_daily_brief';
  const campaign=await createCampaign(env,{kind,segmentKey,subject:content.subject,preheader:content.preheader,htmlContent:content.htmlContent,textContent:content.textContent,campaignKey:\`automation:\${kind}:\${date}:v3\`,canonicalRecordIds:content.canonicalRecordIds,evidenceCheckpointAt:content.evidenceCheckpointAt},'email-automation');
  const queued=await queueCampaign(env,campaign);
  const delivery=await processOutbox(env,{limit:250});
  await audit(env,'email-automation','email.campaign.automated','email_campaign',campaign.id,{kind,source:sourceBundle?.pathname||null,briefingCount:content.brief?.briefings?.length||0,structureVersion:3,...queued,...delivery});
  return{enabled:true,created:true,campaignId:campaign.id,source:sourceBundle?.pathname||null,briefingCount:content.brief?.briefings?.length||0,structureVersion:3,...queued,...delivery}
}`;
replaceFunction('async function automatedCampaign(request,env,kind)', automatedCampaignReplacement, 'structured-automated-campaign');

if (!source.includes('function parisScheduleKind')) {
  const anchor = 'async function scheduledHandler(event,env,ctx)';
  need(source.includes(anchor), 'scheduledHandler anchor is missing');
  const helper = `function parisScheduleKind(env){
  const current=now(env);
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Paris',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(current).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));
  if(parts.hour==='08'&&parts.minute==='05')return'daily';
  if(parts.weekday==='Mon'&&parts.hour==='09'&&parts.minute==='15')return'weekly';
  return''
}\n`;
  source = source.replace(anchor, `${helper}${anchor}`);
  report.patched.push('paris-dst-schedule-helper');
}

const scheduledReplacement = `async function scheduledHandler(event,env,ctx){
  if(!hasD1(env))return;
  const request=new Request('https://matrixreprogrammed.com/api/email/admin/run-automation');
  const job=async()=>{
    await ensureSchema(env);
    const kind=parisScheduleKind(env);
    if(automationEnabled(env)&&kind)await automatedCampaign(request,env,kind);
    await processOutbox(env,{limit:250})
  };
  if(ctx?.waitUntil)ctx.waitUntil(job());else await job()
}`;
replaceFunction('async function scheduledHandler(event,env,ctx)', scheduledReplacement, 'paris-dst-scheduled-handler');

for (const marker of [
  importLine,
  'issueReusableEmailToken',
  'queueImmediateDailyBrief',
  'first_daily_brief',
  'buildBriefEmail({kind',
  'structureVersion:3',
  "timeZone:'Europe/Paris'",
  "parts.hour==='08'&&parts.minute==='05'",
  "parts.weekday==='Mon'&&parts.hour==='09'&&parts.minute==='15'",
  'Manage preferences:',
  'Unsubscribe:'
]) need(source.includes(marker), `Patched email lifecycle missing marker: ${marker}`);

fs.writeFileSync(target, source);
const syntax = spawnSync(process.execPath, ['--check', target], { cwd: root, encoding: 'utf8' });
report.syntax = { status: syntax.status, stdout: String(syntax.stdout || ''), stderr: String(syntax.stderr || '') };
if (syntax.status !== 0) {
  report.ok = false;
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  throw new Error(`Patched email lifecycle failed syntax validation: ${syntax.stderr || syntax.stdout}`);
}
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(`Deep email automation patched: ${report.patched.length} change group(s); immediate and scheduled structured briefs enabled in code.`);
