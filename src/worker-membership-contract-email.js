import { ensureSchema, processOutbox } from './worker-email-lifecycle.js';

const tierDetails={
  supporter:{label:'Supporter',amount:'3.00'},
  intelligence:{label:'Intelligence Member',amount:'6.00'},
  research_pro:{label:'Research Pro',amount:'9.00'}
};

function clean(value,max=500){return String(value??'').replace(/<[^>]*>/g,'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max)}
function html(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))}
function bool(value){return value===true||value===1||value==='1'||String(value||'').toLowerCase()==='true'}
function now(){return new Date().toISOString()}
function id(prefix){return `${prefix}-${crypto.randomUUID()}`}
async function hash(value){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value||'')));return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('')}
function hasD1(env){return Boolean(env?.MEMBERS_DB&&typeof env.MEMBERS_DB.prepare==='function')}
async function first(statement){try{return await statement.first()}catch{return null}}

export function transactionalMembershipEmailReady(env,target='live'){
  if(String(target||'live').toLowerCase()!=='live')return true;
  return bool(env?.EMAIL_TRANSACTIONAL_ENABLED)
    && bool(env?.BREVO_DOMAIN_AUTHENTICATED)
    && Boolean(env?.BREVO_API_KEY)
    && Boolean(env?.MEMBERS_FROM_EMAIL);
}

export async function queueMembershipContractConfirmation(env,{memberId,providerSubscriptionId,tier,checkoutIntentId=null,currentPeriodEnd=null}={}){
  if(!hasD1(env))return{queued:false,sent:false,error:'Membership database unavailable'};
  if(!bool(env?.EMAIL_TRANSACTIONAL_ENABLED))return{queued:false,sent:false,error:'Transactional membership email is disabled'};
  await ensureSchema(env);
  const member=await first(env.MEMBERS_DB.prepare("SELECT id,email,display_name FROM members WHERE id=? AND status='active' LIMIT 1").bind(clean(memberId,180)));
  if(!member?.email)return{queued:false,sent:false,error:'Active member email unavailable'};
  const intentId=clean(checkoutIntentId,180)||clean((await first(env.MEMBERS_DB.prepare('SELECT checkout_intent_id FROM paypal_checkout_intent_state WHERE provider_subscription_id=? ORDER BY updated_at DESC LIMIT 1').bind(clean(providerSubscriptionId,180))))?.checkout_intent_id,180);
  if(!intentId)return{queued:false,sent:false,error:'Checkout intent unavailable for contract confirmation'};
  const consent=await first(env.MEMBERS_DB.prepare('SELECT terms_version,withdrawal_notice_version,terms_accepted,recurring_payment_acknowledged,immediate_service_requested,withdrawal_notice_acknowledged,consented_at FROM paypal_checkout_consents WHERE checkout_intent_id=? AND member_id=? LIMIT 1').bind(intentId,member.id));
  if(!consent||![consent.terms_accepted,consent.recurring_payment_acknowledged,consent.immediate_service_requested,consent.withdrawal_notice_acknowledged].every(value=>Number(value)===1))return{queued:false,sent:false,error:'Complete checkout consent record unavailable'};
  const definition=tierDetails[tier];
  if(!definition)return{queued:false,sent:false,error:'Unknown membership tier'};
  const stamp=now();
  const termsUrl='https://matrixreprogrammed.com/membership-terms.html';
  const withdrawalUrl='https://matrixreprogrammed.com/cancellation-withdrawal.html';
  const billingUrl='https://matrixreprogrammed.com/billing-dashboard.html';
  const support='members@matrixreprogrammed.com';
  const subject=`Your Matrix Reprogrammed ${definition.label} membership confirmation`;
  const summary=[
    `${definition.label} membership`,
    `Recurring price: €${definition.amount} per month through PayPal until cancellation`,
    `PayPal subscription: ${clean(providerSubscriptionId,180)}`,
    `Terms accepted: ${clean(consent.terms_version,80)}`,
    `Withdrawal notice acknowledged: ${clean(consent.withdrawal_notice_version,80)}`,
    `Immediate digital service requested: yes`,
    `Consent recorded: ${clean(consent.consented_at,100)}`,
    currentPeriodEnd?`Current verified period end / next billing reference: ${clean(currentPeriodEnd,100)}`:'Current paid period is shown in the billing dashboard.'
  ];
  const rows=summary.map(item=>`<li style="margin:8px 0">${html(item)}</li>`).join('');
  const htmlContent=`<!doctype html><html><body style="background:#050505;color:#f3e6bd;font-family:Arial,sans-serif;padding:28px"><div style="max-width:700px;margin:auto;border:1px solid #8d7137;border-radius:18px;padding:28px;background:#0b0905"><h1 style="color:#d8b56a">Membership confirmed</h1><p>Hello ${html(member.display_name||'Reader')},</p><p>This email is your durable confirmation of the recurring Matrix Reprogrammed membership information and acknowledgements recorded before PayPal checkout.</p><ul>${rows}</ul><p><a href="${billingUrl}" style="display:inline-block;padding:14px 20px;border-radius:12px;background:#d8b56a;color:#090702;text-decoration:none;font-weight:bold">Open billing and cancel membership</a></p><p><a href="${termsUrl}" style="color:#d8b56a">Membership Terms</a> · <a href="${withdrawalUrl}" style="color:#d8b56a">Cancellation &amp; Withdrawal</a></p><p style="font-size:13px;color:#b9aa82">Paid access follows verified PayPal billing state. For support, contact ${support}. Do not send passwords or complete payment credentials.</p></div></body></html>`;
  const textContent=`Membership confirmed\n\nHello ${member.display_name||'Reader'},\n\nThis email is your durable confirmation of the recurring Matrix Reprogrammed membership information and acknowledgements recorded before PayPal checkout.\n\n${summary.map(item=>`- ${item}`).join('\n')}\n\nBilling and cancellation: ${billingUrl}\nMembership Terms: ${termsUrl}\nCancellation & Withdrawal: ${withdrawalUrl}\nSupport: ${support}\n\nPaid access follows verified PayPal billing state. Do not send passwords or complete payment credentials.`;
  const idempotencyKey=`membership-contract:${clean(providerSubscriptionId,180)}:${clean(consent.terms_version,80)}`;
  const payload={to:{email:member.email,name:member.display_name||'Reader'},subject,htmlContent,textContent};
  await env.MEMBERS_DB.prepare("INSERT OR IGNORE INTO email_outbox (id,member_id,campaign_id,message_kind,recipient_email_hash,payload_json,idempotency_key,status,available_at,updated_at,created_at) VALUES (?,?,NULL,'membership_contract_confirmation',?,?,?,'pending',?,?,?)").bind(id('email-outbox'),member.id,await hash(String(member.email).trim().toLowerCase()),JSON.stringify(payload),idempotencyKey,stamp,stamp,stamp).run();
  const row=await first(env.MEMBERS_DB.prepare('SELECT id,status,provider_message_id,last_error FROM email_outbox WHERE idempotency_key=? LIMIT 1').bind(idempotencyKey));
  if(!row)return{queued:false,sent:false,error:'Contract confirmation outbox record unavailable'};
  if(row.status==='sent')return{queued:true,sent:true,idempotent:true,providerMessageId:row.provider_message_id||null};
  const delivery=await processOutbox(env,{memberId:member.id,limit:10});
  const updated=await first(env.MEMBERS_DB.prepare('SELECT status,provider_message_id,last_error FROM email_outbox WHERE idempotency_key=? LIMIT 1').bind(idempotencyKey));
  return{queued:true,sent:updated?.status==='sent',status:updated?.status||'unknown',providerMessageId:updated?.provider_message_id||null,error:updated?.last_error||null,delivery};
}
