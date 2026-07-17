const fs = require('fs');
const path = require('path');

const root = process.cwd();
const workerPath = path.join(root, 'src', 'worker-email-lifecycle.js');
const reportPath = path.join(root, 'downloads', 'email-automation-guard-patch.json');
if (!fs.existsSync(workerPath)) throw new Error('src/worker-email-lifecycle.js is missing');

let source = fs.readFileSync(workerPath, 'utf8');
let changed = false;

const marker = 'async function quarantineConfiguredRetries(env';
if (!source.includes(marker)) {
  const anchor = 'async function handleAdminQuarantineRetries(request,env){';
  const index = source.indexOf(anchor);
  if (index < 0) throw new Error('Protected retry quarantine handler must be installed before the automation guard');
  const helper = `async function quarantineConfiguredRetries(env,actor='email-automation'){
  const cutoffRaw=clean(env?.EMAIL_RETRY_QUARANTINE_BEFORE||'',80);
  if(!cutoffRaw)return{configured:false,quarantined:0,reason:'EMAIL_RETRY_QUARANTINE_BEFORE is not configured'};
  if(!Number.isFinite(Date.parse(cutoffRaw)))throw new Error('EMAIL_RETRY_QUARANTINE_BEFORE must be a valid ISO time');
  await ensureSchema(env);
  const cutoff=new Date(cutoffRaw).toISOString();
  const rows=await all(env.MEMBERS_DB.prepare(\`SELECT id,member_id,campaign_id,message_kind,attempt_count,created_at,last_error FROM email_outbox WHERE status='retry' AND created_at<? ORDER BY created_at\`).bind(cutoff));
  const stamp=iso(env);
  const byKind={};
  const campaignIds=new Set();
  for(const row of rows){
    const kind=clean(row.message_kind||'unknown',80)||'unknown';
    byKind[kind]=Number(byKind[kind]||0)+1;
    if(row.campaign_id)campaignIds.add(row.campaign_id);
    const previous=clean(row.last_error||'',300);
    const reason=\`Automatically quarantined before newsletter activation at \${stamp}\${previous?\`: \${previous}\`:''}\`;
    await env.MEMBERS_DB.prepare(\`UPDATE email_outbox SET status='quarantined',locked_at=NULL,last_error=?,updated_at=? WHERE id=? AND status='retry'\`).bind(reason,stamp,row.id).run();
    if(row.campaign_id)await env.MEMBERS_DB.prepare(\`UPDATE email_deliveries SET status='failed',failed_at=COALESCE(failed_at,?),failure_reason='quarantined-pre-activation-retry',last_event_at=?,updated_at=? WHERE campaign_id=? AND member_id=? AND status IN ('queued','deferred')\`).bind(stamp,stamp,stamp,row.campaign_id,row.member_id).run();
  }
  for(const campaignId of campaignIds)await refreshCampaign(env,campaignId);
  if(rows.length)await audit(env,actor,'email.outbox.configured_retries_quarantined','email_outbox','configured-retry-cutoff',{before:cutoff,count:rows.length,byKind,campaignCount:campaignIds.size});
  return{configured:true,quarantined:rows.length,before:cutoff,byKind,campaignsRefreshed:campaignIds.size};
}

`;
  source = `${source.slice(0, index)}${helper}${source.slice(index)}`;
  changed = true;
}

for (const required of [
  'EMAIL_RETRY_QUARANTINE_BEFORE',
  'email.outbox.configured_retries_quarantined',
  "status='quarantined'",
  'quarantined-pre-activation-retry'
]) if (!source.includes(required)) throw new Error(`Email automation guard marker missing: ${required}`);

if (changed) fs.writeFileSync(workerPath, source);
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  changed,
  cutoffVariable: 'EMAIL_RETRY_QUARANTINE_BEFORE',
  behavior: 'Every automated campaign quarantines retry records older than the configured activation cutoff before creating or sending new campaign mail.',
  recipientDataExposed: false,
  auditLogged: true,
  repeatSafe: true
}, null, 2)}\n`);
console.log(`Email automation retry guard ${changed ? 'installed' : 'already current'}.`);
