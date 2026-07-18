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
  report.changed.push(label);
}

const enqueueReplacement = `async function enqueue(env,member,{campaignId=null,messageKind,subject,htmlContent,textContent,idempotencyKey,headers=null}){
  const outboxId=id(env,'email-outbox');
  const payload={to:{email:member.email,name:member.display_name||'Reader'},subject,htmlContent,textContent,headers:headers||undefined};
  await env.MEMBERS_DB.prepare(\`INSERT OR IGNORE INTO email_outbox (id,member_id,campaign_id,message_kind,recipient_email_hash,payload_json,idempotency_key,status,available_at,updated_at,created_at) VALUES (?,?,?,?,?,?,?,'pending',?,?,?)\`).bind(outboxId,member.id,campaignId,messageKind,await emailHash(member.email),JSON.stringify(payload),idempotencyKey,iso(env),iso(env),iso(env)).run();
  return outboxId
}`;
if (!source.includes('headers:headers||undefined')) replaceFunction('async function enqueue(env,member', enqueueReplacement, 'header-aware-outbox-enqueue');

const campaignOld = "await enqueue(env,member,{campaignId:campaign.id,messageKind:campaign.kind,subject:content.subject,htmlContent,textContent,idempotencyKey:`${campaign.id}:${member.id}`});";
const campaignNew = "await enqueue(env,member,{campaignId:campaign.id,messageKind:campaign.kind,subject:content.subject,htmlContent,textContent,headers:{'List-Unsubscribe':`<${unsubscribeUrl}>`,'List-Unsubscribe-Post':'List-Unsubscribe=One-Click'},idempotencyKey:`${campaign.id}:${member.id}`});";
if (!source.includes(campaignNew)) {
  need(source.includes(campaignOld), 'Campaign enqueue anchor is missing');
  source = source.replace(campaignOld, campaignNew);
  report.changed.push('campaign-list-unsubscribe-headers');
}

const immediateOld = "await enqueue(env,member,{messageKind:'first_daily_brief',subject:content.subject,htmlContent,textContent,idempotencyKey:`first-daily-brief:${member.id}:${content.evidenceCheckpointAt||iso(env).slice(0,10)}`});";
const immediateNew = "await enqueue(env,member,{messageKind:'first_daily_brief',subject:content.subject,htmlContent,textContent,headers:{'List-Unsubscribe':`<${unsubscribeUrl}>`,'List-Unsubscribe-Post':'List-Unsubscribe=One-Click'},idempotencyKey:`first-daily-brief:${member.id}:${content.evidenceCheckpointAt||iso(env).slice(0,10)}`});";
if (!source.includes(immediateNew)) {
  need(source.includes(immediateOld), 'Immediate Daily Brief enqueue anchor is missing');
  source = source.replace(immediateOld, immediateNew);
  report.changed.push('immediate-brief-list-unsubscribe-headers');
}

for (const marker of [
  "'List-Unsubscribe'",
  "'List-Unsubscribe-Post':'List-Unsubscribe=One-Click'",
  'headers:headers||undefined',
  'headers:payload.headers||undefined',
  '/api/email/unsubscribe?token='
]) need(source.includes(marker), `Email lifecycle missing unsubscribe marker: ${marker}`);

fs.writeFileSync(target, source);
const syntax = spawnSync(process.execPath, ['--check', target], { cwd: root, encoding: 'utf8' });
report.syntax = { status: syntax.status, stdout: String(syntax.stdout || ''), stderr: String(syntax.stderr || '') };
if (syntax.status !== 0) {
  report.ok = false;
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  throw new Error(`List-Unsubscribe patch produced invalid email Worker syntax: ${syntax.stderr || syntax.stdout}`);
}
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(`List-Unsubscribe headers installed: ${report.changed.length ? report.changed.join(', ') : 'already current'}.`);
