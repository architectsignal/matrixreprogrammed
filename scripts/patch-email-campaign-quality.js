const fs = require('fs');
const path = require('path');

const root = process.cwd();
const workerPath = path.join(root, 'src', 'worker-email-lifecycle.js');
const reportPath = path.join(root, 'downloads', 'email-campaign-quality-patch.json');
if (!fs.existsSync(workerPath)) throw new Error('src/worker-email-lifecycle.js is missing');

let source = fs.readFileSync(workerPath, 'utf8');
let changed = false;

function escapeRegex(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function replaceFunctionLine(prefix, replacement, marker) {
  if (marker && source.includes(marker)) return;
  const pattern = new RegExp(`^${escapeRegex(prefix)}.*$`, 'm');
  if (!pattern.test(source)) throw new Error(`Email campaign function anchor missing: ${prefix}`);
  source = source.replace(pattern, () => replacement);
  changed = true;
}
function insertBefore(prefix, marker, block) {
  if (source.includes(marker)) return;
  const index = source.indexOf(prefix);
  if (index < 0) throw new Error(`Email campaign insertion anchor missing: ${prefix}`);
  source = `${source.slice(0, index)}${block}\n${source.slice(index)}`;
  changed = true;
}

replaceFunctionLine('async function issueToken(', `async function issueToken(env,memberId,purpose,scope={},minutes=30){
  const raw=tokenValue(env,purpose);
  const tokenHash=await hash(raw);
  const stamp=iso(env);
  const reusable=['preferences','unsubscribe'].includes(purpose);
  if(!reusable)await env.MEMBERS_DB.prepare('UPDATE email_action_tokens SET revoked_at=? WHERE member_id=? AND purpose=? AND used_at IS NULL AND revoked_at IS NULL').bind(stamp,memberId,purpose).run();
  else await env.MEMBERS_DB.prepare('UPDATE email_action_tokens SET revoked_at=? WHERE member_id=? AND purpose=? AND expires_at<=? AND revoked_at IS NULL').bind(stamp,memberId,purpose,stamp).run();
  await env.MEMBERS_DB.prepare('INSERT INTO email_action_tokens (id,member_id,token_hash,purpose,scope_json,expires_at,created_at) VALUES (?,?,?,?,?,?,?)').bind(id(env,'email-token'),memberId,tokenHash,purpose,JSON.stringify(scope),iso(env,minutes*60*1000),stamp).run();
  return raw;
}`, "const reusable=['preferences','unsubscribe'].includes(purpose)");

replaceFunctionLine('async function enqueue(', `async function enqueue(env,member,{campaignId=null,messageKind,subject,htmlContent,textContent,idempotencyKey,headers=null}){
  const outboxId=id(env,'email-outbox');
  const payload={to:{email:member.email,name:member.display_name||'Reader'},subject,htmlContent,textContent,...(headers&&typeof headers==='object'?{headers}:{})};
  await env.MEMBERS_DB.prepare(\`INSERT OR IGNORE INTO email_outbox (id,member_id,campaign_id,message_kind,recipient_email_hash,payload_json,idempotency_key,status,available_at,updated_at,created_at) VALUES (?,?,?,?,?,?,?,'pending',?,?,?)\`).bind(outboxId,member.id,campaignId,messageKind,await emailHash(member.email),JSON.stringify(payload),idempotencyKey,iso(env),iso(env),iso(env)).run();
  return outboxId;
}`, 'idempotencyKey,headers=null');

replaceFunctionLine('async function loadCampaignSource(', `async function loadCampaignSource(request,env,kind){
  if(!env?.ASSETS||typeof env.ASSETS.fetch!=='function')return null;
  const candidates=kind==='weekly'
    ? ['/data/weekly-investigation-conclusions.json','/downloads/weekly-investigation-report.json','/data/outcome-briefings.json','/data/daily-brain-brief.json']
    : ['/data/daily-brain-brief.json','/data/daily-investigation-conclusions.json','/data/live-intel.json','/data/outcome-briefings.json'];
  for(const pathname of candidates){
    try{
      const response=await env.ASSETS.fetch(new Request(new URL(pathname,request.url),{headers:{accept:'application/json'}}));
      if(response.ok){const data=await response.json();return{pathname,data};}
    }catch{}
  }
  return null;
}`, '/data/weekly-investigation-conclusions.json');

replaceFunctionLine('function sourceItems(', `function sourceItems(source){
  const data=source?.data;
  if(!data)return[];
  const rows=[];
  const seen=new Set();
  const add=item=>{
    if(item===undefined||item===null)return;
    const normalized=typeof item==='string'?{title:'Key conclusion',summary:item}:item;
    const key=clean(JSON.stringify([normalized.title||normalized.headline||normalized.section||normalized.label||'',normalized.summary||normalized.meaning||normalized.conclusion||normalized.record||'']),800);
    if(!key||seen.has(key))return;
    seen.add(key);rows.push(normalized);
  };
  if(Array.isArray(data))data.forEach(add);
  if(Array.isArray(data.topConclusions))data.topConclusions.forEach((value,index)=>add({title:\`Conclusion \${index+1}\`,summary:value,status:'analysis'}));
  if(Array.isArray(data.sectionBriefings))data.sectionBriefings.forEach(add);
  if(Array.isArray(data.topSignals))data.topSignals.forEach(add);
  if(Array.isArray(data.tomorrowWatchList))data.tomorrowWatchList.slice(0,3).forEach(value=>add({title:'Watch next',summary:value,status:'watch'}));
  if(Array.isArray(data.missingRecords))data.missingRecords.slice(0,2).forEach(value=>add({title:'Record needed',summary:typeof value==='string'?value:\`\${value.section||'Investigation'}: \${value.record||''}\`,status:'missing-record'}));
  if(Array.isArray(data.establishedWrongdoing))data.establishedWrongdoing.slice(0,6).forEach(add);
  if(Array.isArray(data.meaningfulSourceChanges))data.meaningfulSourceChanges.slice(0,3).forEach(add);
  for(const key of ['briefings','findings','records','items','entries','results','cards'])if(Array.isArray(data[key]))data[key].forEach(add);
  return rows.slice(0,10);
}`, 'const seen=new Set()');

const helperBlock = `function campaignRow(item,index){
  if(typeof item==='string')return{heading:clean(item,180)||\`Signal \${index+1}\`,summary:'',label:'Evidence-bounded conclusion',route:'',canonicalId:''};
  const heading=clean(item.title||item.headline||item.section||item.label||item.term||\`Signal \${index+1}\`,180);
  const parts=[item.summary,item.meaning,item.conclusion,item.whyItMatters,item.why,item.likely,item.implication,item.record].map(value=>clean(value||'',700)).filter(Boolean);
  const summary=[...new Set(parts)].slice(0,2).join(' ');
  const grade=clean(item.evidenceGrade||item.grade||item.confidence||'',40);
  const status=clean(item.status||item.sourceStatus||item.lane||item.classification||'',80);
  const label=[grade?\`Grade \${grade}\`:'',status].filter(Boolean).join(' · ')||'Evidence-bounded signal';
  const route=clean(item.itemUrl||item.sourceUrl||item.route||(Array.isArray(item.pages)?item.pages[0]:''),500);
  return{heading,summary,label,route,canonicalId:clean(item.canonicalId||item.id||item.signalId||'',160)};
}
function appendMarketingFooter(htmlContent,textContent,preferenceUrl,unsubscribeUrl){
  const footerHtml=\`<hr style="border:0;border-top:1px solid #8d7137;margin:28px 0"><p style="font-size:13px;color:#b9aa82">You received this because you verified a Matrix Reprogrammed email subscription. <a href="\${html(preferenceUrl)}" style="color:#d8b56a">Manage preferences</a> · <a href="\${html(unsubscribeUrl)}" style="color:#d8b56a">Unsubscribe</a> · <a href="https://matrixreprogrammed.com/privacy.html" style="color:#d8b56a">Privacy</a></p>\`;
  const original=String(htmlContent||'');
  const htmlWithFooter=/<\\/body>/i.test(original)?original.replace(/<\\/body>/i,\`\${footerHtml}</body>\`):\`\${original}\${footerHtml}\`;
  const textWithFooter=\`\${String(textContent||'').trim()}\\n\\nManage preferences: \${preferenceUrl}\\nUnsubscribe: \${unsubscribeUrl}\\nPrivacy: https://matrixreprogrammed.com/privacy.html\`;
  return{htmlContent:htmlWithFooter,textContent:textWithFooter};
}`;
insertBefore('async function queueCampaign(', 'function appendMarketingFooter(', helperBlock);

replaceFunctionLine('async function queueCampaign(', `async function queueCampaign(env,campaign){
  const content=await first(env.MEMBERS_DB.prepare('SELECT * FROM email_campaign_content_versions WHERE id=?').bind(campaign.content_version_id));
  const segment=await first(env.MEMBERS_DB.prepare('SELECT segment_key FROM email_segments WHERE id=?').bind(campaign.segment_id));
  const recipients=await eligibleMembers(env,segment.segment_key);
  const siteOrigin='https://matrixreprogrammed.com';
  for(const member of recipients){
    const preferenceToken=await issueToken(env,member.id,'preferences',{memberId:member.id,campaignId:campaign.id},365*24*60);
    const unsubscribeToken=await issueToken(env,member.id,'unsubscribe',{memberId:member.id,campaignId:campaign.id},365*24*60);
    const preferenceUrl=\`\${siteOrigin}/subscriber-dashboard.html?token=\${encodeURIComponent(preferenceToken)}\`;
    const unsubscribeUrl=\`\${siteOrigin}/api/email/unsubscribe?token=\${encodeURIComponent(unsubscribeToken)}\`;
    const personalized=appendMarketingFooter(content.html_content,content.text_content,preferenceUrl,unsubscribeUrl);
    await env.MEMBERS_DB.prepare(\`INSERT OR IGNORE INTO email_deliveries (id,campaign_id,member_id,recipient_email_hash,status,queued_at,updated_at) VALUES (?,?,?,?, 'queued',?,?)\`).bind(id(env,'email-delivery'),campaign.id,member.id,await emailHash(member.email),iso(env),iso(env)).run();
    await enqueue(env,member,{campaignId:campaign.id,messageKind:campaign.kind,subject:content.subject,...personalized,idempotencyKey:\`\${campaign.id}:\${member.id}\`,headers:{'List-Unsubscribe':\`<\${unsubscribeUrl}>\`,'List-Unsubscribe-Post':'List-Unsubscribe=One-Click','X-Matrix-Campaign':campaign.campaign_key}});
  }
  const stamp=iso(env);
  const status=recipients.length?'sending':'sent';
  await env.MEMBERS_DB.prepare(\`UPDATE email_campaigns SET status=?,started_at=COALESCE(started_at,?),completed_at=?,recipient_count=?,updated_at=? WHERE id=?\`).bind(status,stamp,recipients.length?null:stamp,recipients.length,stamp,campaign.id).run();
  return{recipientCount:recipients.length,status};
}`, "'List-Unsubscribe-Post':'List-Unsubscribe=One-Click'");

replaceFunctionLine('async function automatedCampaign(', `async function automatedCampaign(request,env,kind){
  if(!automationEnabled(env))return{enabled:false,created:false,reason:'EMAIL_AUTOMATION_ENABLED is not true'};
  const retryQuarantine=typeof quarantineConfiguredRetries==='function'?await quarantineConfiguredRetries(env,'email-automation'):{configured:false,quarantined:0};
  const source=await loadCampaignSource(request,env,kind);
  const items=sourceItems(source);
  const title=kind==='weekly'?'Weekly Signal Drop':'Daily Control Brief';
  const date=iso(env).slice(0,10);
  const rows=items.length?items.map(campaignRow):[{heading:'No verified source changes loaded',summary:'The source bundle contained no usable records, so the system withheld claims rather than inventing an update.',label:'Fail-closed content boundary',route:'',canonicalId:''}];
  const sourceLabel=source?.pathname||'No source bundle';
  const routeUrl=route=>{if(!route)return'';try{return new URL(route,origin(request)).toString()}catch{return''}};
  const htmlRows=rows.map(row=>\`<article style="border-top:1px solid #6f582d;padding:18px 0"><p style="margin:0 0 6px;color:#d8b56a;font-size:12px;text-transform:uppercase;letter-spacing:.08em">\${html(row.label)}</p><h2 style="margin:0 0 8px;color:#f3e6bd;font-size:21px">\${html(row.heading)}</h2>\${row.summary?\`<p style="margin:0;color:#e3d7b6;line-height:1.55">\${html(row.summary)}</p>\`:''}\${routeUrl(row.route)?\`<p><a href="\${html(routeUrl(row.route))}" style="color:#d8b56a">Open the underlying record</a></p>\`:''}</article>\`).join('');
  const htmlContent=\`<!doctype html><html><body style="margin:0;background:#050505;color:#f3e6bd;font-family:Arial,sans-serif"><div style="display:none;max-height:0;overflow:hidden">\${html(rows[0]?.heading||title)}</div><div style="max-width:680px;margin:auto;padding:28px"><div style="border:1px solid #8d7137;border-radius:18px;padding:28px;background:#0b0905"><p style="color:#d8b56a;letter-spacing:.12em;text-transform:uppercase;font-size:12px">Matrix Reprogrammed · \${html(date)}</p><h1 style="margin:0 0 12px;color:#d8b56a;font-size:32px">\${html(title)}</h1><p style="color:#b9aa82">Source: \${html(sourceLabel)} · \${rows.length} ranked items</p>\${htmlRows}<p style="margin-top:24px"><a href="\${origin(request)}/daily-brain-brief.html" style="display:inline-block;padding:13px 18px;border-radius:10px;background:#d8b56a;color:#090702;text-decoration:none;font-weight:bold">Open the full intelligence brief</a></p><p style="font-size:13px;color:#b9aa82"><strong>Evidence boundary:</strong> Records and analysis retain their source, status and confidence labels. Association is not proof, and allegations are not findings of guilt.</p></div></div></body></html>\`;
  const textContent=\`\${title} — \${date}\\nSource: \${sourceLabel}\\n\\n\${rows.map(row=>\`[\${row.label}] \${row.heading}\\n\${row.summary}\${routeUrl(row.route)?\`\\n\${routeUrl(row.route)}\`:''}\`).join('\\n\\n')}\\n\\nEvidence boundary: records and analysis retain their source, status and confidence labels. Association is not proof.\\n\${origin(request)}/daily-brain-brief.html\`;
  const campaign=await createCampaign(env,{kind,segmentKey:kind==='weekly'?'public_weekly_digest':'public_daily_brief',subject:\`\${title} — \${date}\`,preheader:rows[0]?.heading||title,htmlContent,textContent,campaignKey:\`automation:\${kind}:\${date}\`,canonicalRecordIds:rows.map(row=>row.canonicalId).filter(Boolean),evidenceCheckpointAt:clean(source?.data?.generatedAt||source?.data?.updated||iso(env),80)},'email-automation');
  const queued=await queueCampaign(env,campaign);
  const delivery=await processOutbox(env,{limit:100});
  await audit(env,'email-automation','email.campaign.automated','email_campaign',campaign.id,{kind,source:sourceLabel,retryQuarantine,...queued,...delivery});
  return{enabled:true,created:true,campaignId:campaign.id,source:sourceLabel,retryQuarantine,...queued,...delivery};
}`, "const retryQuarantine=typeof quarantineConfiguredRetries==='function'");

for (const marker of [
  '/data/daily-brain-brief.json',
  '/data/weekly-investigation-conclusions.json',
  'function campaignRow(',
  'function appendMarketingFooter(',
  "'List-Unsubscribe'",
  "'List-Unsubscribe-Post':'List-Unsubscribe=One-Click'",
  'subscriber-dashboard.html?token=',
  'No verified source changes loaded',
  "const status=recipients.length?'sending':'sent'",
  "['preferences','unsubscribe'].includes(purpose)"
]) if (!source.includes(marker)) throw new Error(`Email campaign quality marker missing: ${marker}`);

if (changed) fs.writeFileSync(workerPath, source);
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  changed,
  dailySource: '/data/daily-brain-brief.json',
  weeklySource: '/data/weekly-investigation-conclusions.json',
  contentPolicy: 'Ranked source-backed conclusions, signals, records and watch items; fail closed when no usable records exist.',
  compliance: ['Per-recipient preferences link','Per-recipient unsubscribe link','List-Unsubscribe header','One-click unsubscribe header','Privacy link','Long-lived reusable action links'],
  campaignStateRepair: 'Zero-recipient campaigns complete as sent instead of remaining stuck in sending.',
  evidenceBoundary: true
}, null, 2)}\n`);
console.log(`Email campaign quality ${changed ? 'installed' : 'already current'}: useful sources, evidence labels, preferences and unsubscribe controls.`);
