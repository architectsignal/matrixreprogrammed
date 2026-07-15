const fs = require('fs');
const path = require('path');

const root = process.cwd();
const authWorkerPath = path.join(root, 'src', 'worker.js');
const lifecyclePath = path.join(root, 'src', 'worker-email-lifecycle.js');

function read(file) { return fs.readFileSync(file, 'utf8'); }
function write(file, content) { fs.writeFileSync(file, content); }
function replaceBetween(text, startMarker, endMarker, replacement, label) {
  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0 || end <= start) throw new Error(`${label} patch markers not found`);
  const current = text.slice(start, end);
  if (current === replacement) return text;
  return text.slice(0, start) + replacement + text.slice(end);
}

let authWorker = read(authWorkerPath);
const authSendEmail = `async function authSendEmail(env,member,link,purpose){
  if(!authMailConfigured(env))return{configured:false,sent:false,error:'transactional email not configured'};
  const verify=purpose==='verify_email';
  const subject=verify?'Verify your Matrix Reprogrammed membership':'Your Matrix Reprogrammed login link';
  const heading=verify?'Verify your email':'Sign in to your member account';
  const action=verify?'Verify membership':'Sign in securely';
  const recipientEmail=String(member&&member.email||'').trim();
  const recipientName=String(member&&member.display_name||member&&member.name||'Member');
  const safeName=authHtml(recipientName);
  const safeLink=authHtml(link);
  const htmlContent='<!doctype html><html><body style="background:#050505;color:#f3e6bd;font-family:Arial,sans-serif;padding:28px"><div style="max-width:620px;margin:auto;border:1px solid #8d7137;border-radius:18px;padding:28px;background:#0b0905"><h1 style="color:#d8b56a">'+heading+'</h1><p>Hello '+safeName+',</p><p>Use the secure one-time link below. It expires in 15 minutes and can only be used once.</p><p><a href="'+safeLink+'" style="display:inline-block;padding:14px 20px;border-radius:12px;background:#d8b56a;color:#090702;text-decoration:none;font-weight:bold">'+action+'</a></p><p style="font-size:13px;color:#b9aa82">If you did not request this, ignore this email. Matrix Reprogrammed never asks for a password through this link.</p></div></body></html>';
  const textContent=heading+'\\n\\nHello '+recipientName+',\\n\\nOpen this one-time link within 15 minutes:\\n'+link+'\\n\\nIf you did not request this, ignore this email.';
  const payload={
    sender:{email:String(env.MEMBERS_FROM_EMAIL),name:String(env.MEMBERS_FROM_NAME||'Matrix Reprogrammed')},
    to:[{email:recipientEmail,name:recipientName}],
    subject,htmlContent,textContent
  };
  const payloadLengths={subject:subject.length,html:htmlContent.length,text:textContent.length,link:String(link||'').length};
  if(!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(recipientEmail)||subject.trim().length<4||htmlContent.trim().length<80||textContent.trim().length<30||!String(link||'').startsWith('https://')){
    return{configured:true,sent:false,permanent:true,error:'invalid-or-empty-login-email-payload',payloadLengths};
  }
  try{
    const response=await fetch('https://api.brevo.com/v3/smtp/email',{method:'POST',headers:{accept:'application/json','content-type':'application/json','api-key':String(env.BREVO_API_KEY)},body:JSON.stringify(payload)});
    const responseText=await response.text();let providerPayload={};try{providerPayload=JSON.parse(responseText||'{}')}catch{}
    return{configured:true,sent:response.status===201,messageId:providerPayload.messageId||null,status:response.status,error:response.status===201?null:cleanText(providerPayload.message||responseText||'email provider rejected request',500),payloadLengths};
  }catch(error){return{configured:true,sent:false,error:cleanText(error&&error.message,500),payloadLengths}}
}
`;
authWorker = replaceBetween(authWorker, 'async function authSendEmail(', 'async function authIssueLink(', authSendEmail, 'authSendEmail');

const authRequestHandler = `async function handleAuthRequestLink(request,env){
  const body=await readBody(request);
  const email=cleanText(body.email||'',240).toLowerCase();
  if(!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email))return json({ok:false,error:'Valid email required'},400);
  if(!hasMembersDb(env))return json({ok:false,configured:false,error:'Membership database unavailable'},503);
  if(!authMailConfigured(env))return json({ok:false,configured:false,error:'Transactional email delivery is not configured'},503);
  const member=await authMemberByEmail(env,email);
  if(member){
    const purpose=member.email_verified_at?'login':'verify_email';
    const delivery=await authIssueLink(request,env,member,purpose);
    await env.MEMBERS_DB.prepare("INSERT INTO audit_log (id,actor_id,action,target_type,target_id,metadata_json,created_at) VALUES (?,?,?,?,?,?,?)").bind(authId('audit'),member.id,'auth.magic_link.delivery','member',member.id,JSON.stringify({purpose,sent:Boolean(delivery.sent),configured:Boolean(delivery.configured),providerStatus:delivery.status||null,messageId:delivery.messageId||null,error:delivery.error||null,payloadLengths:delivery.payloadLengths||null}),new Date().toISOString()).run().catch(()=>null);
  }
  return json({ok:true,accepted:true,message:'If a matching member account exists, a complete one-time login email has been sent.'},202)
}
`;
authWorker = replaceBetween(authWorker, 'async function handleAuthRequestLink(', 'async function handleAuthVerify(', authRequestHandler, 'handleAuthRequestLink');
write(authWorkerPath, authWorker);

let lifecycle = read(lifecyclePath);
const providerSender = `function emailPayloadCheck(payload){
  const recipient=String(payload&&payload.to&&payload.to.email||'').trim();
  const subject=String(payload&&payload.subject||'').trim();
  const htmlContent=String(payload&&payload.htmlContent||'').trim();
  const textContent=String(payload&&payload.textContent||'').trim();
  const validRecipient=/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(recipient);
  const hasBody=htmlContent.length>=20||textContent.length>=10;
  return{ok:validRecipient&&subject.length>=4&&hasBody,recipient,subject,htmlContent,textContent,lengths:{subject:subject.length,html:htmlContent.length,text:textContent.length}}
}
async function sendProviderEmail(env,payload){
  if(!providerConfigured(env))return{configured:false,sent:false,error:'Brevo transactional delivery is not configured'};
  const checked=emailPayloadCheck(payload);
  if(!checked.ok)return{configured:true,sent:false,permanent:true,error:'invalid-or-empty-transactional-email-payload',payloadLengths:checked.lengths};
  try{
    const response=await providerFetch(env)('https://api.brevo.com/v3/smtp/email',{method:'POST',headers:{accept:'application/json','content-type':'application/json','api-key':String(env.BREVO_API_KEY)},body:JSON.stringify({sender:{email:String(env.MEMBERS_FROM_EMAIL),name:String(env.MEMBERS_FROM_NAME||'Matrix Reprogrammed')},to:[payload.to],subject:checked.subject,htmlContent:checked.htmlContent,textContent:checked.textContent})});
    const text=await response.text();let data={};try{data=JSON.parse(text||'{}')}catch{}
    return{configured:true,sent:response.status===201,status:response.status,messageId:data.messageId||null,error:response.status===201?null:clean(data.message||text||'Brevo rejected email',500),payloadLengths:checked.lengths};
  }catch(error){return{configured:true,sent:false,error:clean(error&&error.message,500),payloadLengths:checked.lengths}}
}
`;
const providerStart = lifecycle.includes('function emailPayloadCheck(') ? 'function emailPayloadCheck(' : 'async function sendProviderEmail(';
lifecycle = replaceBetween(lifecycle, providerStart, 'async function processOutbox(', providerSender, 'sendProviderEmail');
const oldParse = "let payload={};try{payload=JSON.parse(row.payload_json||'{}')}catch{}const delivery=await sendProviderEmail(env,payload);";
const safeParse = "let payload=null;let payloadError='';try{payload=JSON.parse(row.payload_json||'')}catch{payloadError='invalid-outbox-payload-json'}const delivery=payloadError?{configured:providerConfigured(env),sent:false,permanent:true,error:payloadError}:await sendProviderEmail(env,payload);";
if (!lifecycle.includes(safeParse)) {
  if (!lifecycle.includes(oldParse)) throw new Error('processOutbox payload parser patch target not found');
  lifecycle = lifecycle.replace(oldParse, safeParse);
}
lifecycle = lifecycle.replace('if(attempts>=5){failed+=1;', 'if(delivery.permanent||attempts>=5){failed+=1;');
write(lifecyclePath, lifecycle);

require('./login-email-resend-test.js');
console.log('Passwordless login email delivery hardened: complete payload required on every request; malformed outbox messages fail closed.');
