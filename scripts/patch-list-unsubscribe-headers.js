const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const target = path.join(root, 'src', 'worker-email-lifecycle.js');
const reportPath = path.join(root, 'downloads', 'list-unsubscribe-header-patch.json');
if (!fs.existsSync(target)) throw new Error('src/worker-email-lifecycle.js is missing');

let source = fs.readFileSync(target, 'utf8');
const report = { ok: true, generatedAt: new Date().toISOString(), changed: [], checks: [] };
function need(condition, message) { report.checks.push({ message, ok: Boolean(condition) }); if (!condition) throw new Error(message); }
function functionRange(text, functionName) {
  const signature = `async function ${functionName}`;
  const start = text.indexOf(signature);
  if (start < 0) return null;
  const paramsOpen = text.indexOf('(', start + signature.length);
  if (paramsOpen < 0) return null;
  let quote = '', escaped = false, lineComment = false, blockComment = false, parenDepth = 0, paramsClose = -1;
  for (let index = paramsOpen; index < text.length; index += 1) {
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
    if (char === '(') parenDepth += 1;
    else if (char === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) { paramsClose = index; break; }
    }
  }
  if (paramsClose < 0) return null;
  const bodyOpen = text.indexOf('{', paramsClose + 1);
  if (bodyOpen < 0) return null;
  quote = ''; escaped = false; lineComment = false; blockComment = false;
  let braceDepth = 0;
  for (let index = bodyOpen; index < text.length; index += 1) {
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
    if (char === '{') braceDepth += 1;
    else if (char === '}') {
      braceDepth -= 1;
      if (braceDepth === 0) return { start, end: index + 1 };
    }
  }
  return null;
}
function replaceFunction(functionName, replacement, label) {
  const found = functionRange(source, functionName);
  need(Boolean(found), `${label} function was not found or was unbalanced`);
  source = `${source.slice(0, found.start)}${replacement}${source.slice(found.end)}`;
  report.changed.push(label);
}

const enqueueReplacement = `async function enqueue(env,member,{campaignId=null,messageKind,subject,htmlContent,textContent,idempotencyKey,headers=null}){
  const outboxId=id(env,'email-outbox');
  const payload={to:{email:member.email,name:member.display_name||'Reader'},subject,htmlContent,textContent,headers:headers||undefined};
  await env.MEMBERS_DB.prepare(\`INSERT OR IGNORE INTO email_outbox (id,member_id,campaign_id,message_kind,recipient_email_hash,payload_json,idempotency_key,status,available_at,updated_at,created_at) VALUES (?,?,?,?,?,?,?,'pending',?,?,?)\`).bind(outboxId,member.id,campaignId,messageKind,await emailHash(member.email),JSON.stringify(payload),idempotencyKey,iso(env),iso(env),iso(env)).run();
  return outboxId
}`;
if (!source.includes('headers:headers||undefined')) replaceFunction('enqueue', enqueueReplacement, 'header-aware-outbox-enqueue');

const campaignBase = "await enqueue(env,member,{campaignId:campaign.id,messageKind:campaign.kind,subject:content.subject,htmlContent,textContent,idempotencyKey:`${campaign.id}:${member.id}`});";
const campaignHeadersOld = "await enqueue(env,member,{campaignId:campaign.id,messageKind:campaign.kind,subject:content.subject,htmlContent,textContent,headers:{'List-Unsubscribe':`<${unsubscribeUrl}>`,'List-Unsubscribe-Post':'List-Unsubscribe=One-Click'},idempotencyKey:`${campaign.id}:${member.id}`});";
const campaignFinal = "await enqueue(env,member,{campaignId:campaign.id,messageKind:campaign.kind,subject:content.subject,htmlContent,textContent,headers:{'List-Unsubscribe':`<${unsubscribeUrl}>`,'List-Unsubscribe-Post':'List-Unsubscribe=One-Click'},idempotencyKey:campaign.kind==='daily'?`daily-control-brief:${member.id}:${(String(campaign.campaign_key||'').match(/\\d{4}-\\d{2}-\\d{2}/)||[iso(env).slice(0,10)])[0]}`:`${campaign.id}:${member.id}`});";
if (!source.includes(campaignFinal)) {
  if (source.includes(campaignHeadersOld)) source = source.replace(campaignHeadersOld, campaignFinal);
  else {
    need(source.includes(campaignBase), 'Campaign enqueue anchor is missing');
    source = source.replace(campaignBase, campaignFinal);
  }
  report.changed.push('campaign-list-unsubscribe-and-daily-deduplication');
}

const immediateBase = "await enqueue(env,member,{messageKind:'first_daily_brief',subject:content.subject,htmlContent,textContent,idempotencyKey:`first-daily-brief:${member.id}:${content.evidenceCheckpointAt||iso(env).slice(0,10)}`});";
const immediateHeadersOld = "await enqueue(env,member,{messageKind:'first_daily_brief',subject:content.subject,htmlContent,textContent,headers:{'List-Unsubscribe':`<${unsubscribeUrl}>`,'List-Unsubscribe-Post':'List-Unsubscribe=One-Click'},idempotencyKey:`first-daily-brief:${member.id}:${content.evidenceCheckpointAt||iso(env).slice(0,10)}`});";
const immediateFinal = "await enqueue(env,member,{messageKind:'first_daily_brief',subject:content.subject,htmlContent,textContent,headers:{'List-Unsubscribe':`<${unsubscribeUrl}>`,'List-Unsubscribe-Post':'List-Unsubscribe=One-Click'},idempotencyKey:`daily-control-brief:${member.id}:${iso(env).slice(0,10)}`});";
const currentFirstBase = "await enqueue(env,member,{campaignId:campaign.id,messageKind:'daily',subject:content.subject,htmlContent:content.html_content,textContent:content.text_content,idempotencyKey});";
const currentFirstFinal = "await enqueue(env,member,{campaignId:campaign.id,messageKind:'daily',subject:content.subject,htmlContent:content.html_content,textContent:content.text_content,headers:unsubscribeUrl?{'List-Unsubscribe':`<${unsubscribeUrl}>`,'List-Unsubscribe-Post':'List-Unsubscribe=One-Click'}:undefined,idempotencyKey});";
if (!source.includes(immediateFinal) && !source.includes(currentFirstFinal)) {
  if (source.includes('async function sendFirstDailyBrief(request,env,member)') && source.includes(currentFirstBase)) {
    source = source.replace('async function sendFirstDailyBrief(request,env,member)', "async function sendFirstDailyBrief(request,env,member,{unsubscribeUrl=''}={})");
    source = source.replace('sendFirstDailyBrief(request,env,member)', 'sendFirstDailyBrief(request,env,member,{unsubscribeUrl})');
    source = source.replace(currentFirstBase, currentFirstFinal);
    report.changed.push('current-first-brief-list-unsubscribe-preserved');
  } else if (source.includes(immediateHeadersOld)) {
    source = source.replace(immediateHeadersOld, immediateFinal);
    report.changed.push('immediate-brief-list-unsubscribe-and-daily-deduplication');
  } else {
    need(source.includes(immediateBase), 'Immediate Daily Brief enqueue anchor is missing');
    source = source.replace(immediateBase, immediateFinal);
    report.changed.push('immediate-brief-list-unsubscribe-and-daily-deduplication');
  }
}

for (const marker of [
  "'List-Unsubscribe'",
  "'List-Unsubscribe-Post':'List-Unsubscribe=One-Click'",
  'headers:headers||undefined',
  'headers:payload.headers||undefined',
  '/api/email/unsubscribe?token=',
  'daily-control-brief:${member.id}:',
  "campaign.kind==='daily'"
]) need(source.includes(marker), `Email lifecycle missing final delivery marker: ${marker}`);
need(source.includes(immediateFinal) || source.includes(currentFirstFinal), 'Email lifecycle is missing List-Unsubscribe headers on the immediate Daily Brief');

fs.writeFileSync(target, source);
const syntax = spawnSync(process.execPath, ['--check', target], { cwd: root, encoding: 'utf8' });
report.syntax = { status: syntax.status, stdout: String(syntax.stdout || ''), stderr: String(syntax.stderr || '') };
if (syntax.status !== 0) {
  report.ok = false;
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  throw new Error(`Final email delivery patch produced invalid Worker syntax: ${syntax.stderr || syntax.stdout}`);
}
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(`Email delivery headers and same-day Daily Brief deduplication installed: ${report.changed.length ? report.changed.join(', ') : 'already current'}.`);