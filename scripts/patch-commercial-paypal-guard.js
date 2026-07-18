const fs = require('fs');
const path = require('path');

const root = process.cwd();
const workerPath = path.join(root, 'src', 'worker-paypal-subscriptions.js');
const contractEmailPath = path.join(root, 'src', 'worker-membership-contract-email.js');
const reportPath = path.join(root, 'downloads', 'commercial-paypal-guard-patch.json');
if (!fs.existsSync(workerPath)) throw new Error('src/worker-paypal-subscriptions.js is missing');
if (!fs.existsSync(contractEmailPath)) throw new Error('src/worker-membership-contract-email.js is missing');

let source = fs.readFileSync(workerPath, 'utf8');
const report = { ok: true, generatedAt: new Date().toISOString(), patched: [], checks: [] };
function need(condition, message) { report.checks.push({ message, ok: Boolean(condition) }); if (!condition) throw new Error(message); }

const contractImport = "import { queueMembershipContractConfirmation, transactionalMembershipEmailReady } from './worker-membership-contract-email.js';";
if (!source.includes(contractImport)) {
  source = `${contractImport}\n${source}`;
  report.patched.push('membership-contract-email-import');
}

if (!source.includes("const commercialTermsVersion='2026-07-18-v1'")) {
  const tierAnchor = "const tiers={supporter:{label:'Supporter',price:'3.00',runtimeTier:'supporter_3'},intelligence:{label:'Intelligence Member',price:'6.00',runtimeTier:'intelligence_6'},research_pro:{label:'Research Pro',price:'9.00',runtimeTier:'research_pro_9'}};";
  need(source.includes(tierAnchor), 'PayPal tier registry anchor was not found');
  source = source.replace(tierAnchor, `${tierAnchor}\nconst commercialTermsVersion='2026-07-18-v1';\nconst withdrawalNoticeVersion='2026-07-18-v1';`);
  report.patched.push('commercial-version-constants');
}

if (!source.includes('function commercialLegalReady')) {
  const boolAnchor = "function bool(value){return value===true||value===1||value==='1'||String(value||'').toLowerCase()==='true'}";
  need(source.includes(boolAnchor), 'PayPal boolean helper anchor was not found');
  source = source.replace(boolAnchor, `${boolAnchor}\nfunction commercialLegalReady(env,target=environment(env)){return target!=='live'||(bool(env?.COMMERCIAL_LEGAL_READY)&&String(env?.COMMERCIAL_LEGAL_CONFIRMATION||'')==='MATRIX_COMMERCIAL_LEGAL_CONFIRMED')}\nfunction contractConfirmationReady(env,target=environment(env)){return target!=='live'||transactionalMembershipEmailReady(env,target)}`);
  report.patched.push('commercial-legal-and-contract-email-helpers');
}

const activationStateReplacement = `async function activationState(env){
  const target=environment(env);
  const setting=await runtimeSetting(env,target);
  const environmentSwitch=target==='live'?bool(env?.PAYPAL_PRODUCTION_ENABLED):bool(env?.PAYPAL_SANDBOX_ENABLED);
  const confirmation=target!=='live'||String(env?.PAYPAL_LIVE_ACTIVATION_CONFIRMATION||'')==='MATRIX_PAYPAL_LIVE_CONFIRMED';
  const legalReady=commercialLegalReady(env,target);
  const contractEmailReady=contractConfirmationReady(env,target);
  const planRows=await plans(env,target);
  const plansReady=planRows.length===3&&planRows.every(row=>String(row.status).toUpperCase()==='ACTIVE');
  return{environment:target,configured:configured(env),environmentSwitch,databaseSwitch:Boolean(setting.checkout_enabled),confirmation,commercialLegalReady:legalReady,contractConfirmationReady:contractEmailReady,plansReady,checkoutEnabled:configured(env)&&environmentSwitch&&Boolean(setting.checkout_enabled)&&confirmation&&legalReady&&contractEmailReady&&plansReady,setting,plans:planRows};
}`;
if (!source.includes('contractConfirmationReady:contractEmailReady')) {
  const pattern = /async function activationState\(env\)\{[\s\S]*?\n?\}/;
  need(pattern.test(source), 'PayPal activationState function anchor was not found');
  source = source.replace(pattern, activationStateReplacement);
  report.patched.push('activation-state-contract-email-gate');
}

const configReplacement = `async function config(request,env){
  const required=await requireAuth(request,env);if(required.response)return required.response;
  const state=await activationState(env);
  return json({ok:true,authenticated:true,environment:state.environment,currency:'EUR',clientId:state.configured?String(env.PAYPAL_CLIENT_ID):null,configured:state.configured,checkoutEnabled:state.checkoutEnabled,webhookConfigured:Boolean(env.PAYPAL_WEBHOOK_ID),commercialLegalReady:state.commercialLegalReady,contractConfirmationReady:state.contractConfirmationReady,termsVersion:commercialTermsVersion,withdrawalNoticeVersion,tiers:Object.fromEntries(Object.entries(tiers).map(([key,value])=>[key,{label:value.label,price:value.price,planId:state.plans.find(plan=>plan.tier===key)?.provider_plan_id||null}])),activation:{environmentSwitch:state.environmentSwitch,databaseSwitch:state.databaseSwitch,confirmation:state.confirmation,commercialLegalReady:state.commercialLegalReady,contractConfirmationReady:state.contractConfirmationReady,plansReady:state.plansReady}});
}`;
if (!source.includes('termsVersion:commercialTermsVersion')) {
  const pattern = /async function config\(request,env\)\{[^\n]+\}/;
  need(pattern.test(source), 'PayPal config function anchor was not found');
  source = source.replace(pattern, configReplacement);
  report.patched.push('config-commercial-readiness');
} else if (!source.includes('contractConfirmationReady:state.contractConfirmationReady')) {
  const pattern = /async function config\(request,env\)\{[\s\S]*?\n?\}/;
  need(pattern.test(source), 'Patched PayPal config function anchor was not found');
  source = source.replace(pattern, configReplacement);
  report.patched.push('config-contract-email-readiness');
}

const checkoutReplacement = `async function checkoutIntent(request,env){
  const required=await requireAuth(request,env);if(required.response)return required.response;
  const state=await activationState(env);
  if(!state.checkoutEnabled)return json({ok:false,configured:state.configured,environment:state.environment,commercialLegalReady:state.commercialLegalReady,contractConfirmationReady:state.contractConfirmationReady,error:'PayPal checkout is disabled until every activation, commercial-readiness and contract-confirmation gate passes'},503);
  const input=await body(request);
  const tier=clean(input.tier,40);
  if(!tiers[tier])return json({ok:false,error:'Unknown membership tier'},400);
  const consentOk=input.termsAccepted===true&&input.recurringPaymentAcknowledged===true&&input.immediateServiceRequested===true&&input.withdrawalNoticeAcknowledged===true&&clean(input.termsVersion,40)===commercialTermsVersion&&clean(input.withdrawalNoticeVersion,40)===withdrawalNoticeVersion;
  if(!consentOk)return json({ok:false,error:'Accept the current membership terms, recurring-payment notice, immediate-service request and withdrawal notice before checkout'},400);
  const plan=state.plans.find(item=>item.tier===tier);
  if(!plan)return json({ok:false,error:'The selected PayPal plan is unavailable'},409);
  const current=new Date();
  const currentIso=current.toISOString();
  const expiresAt=new Date(current.getTime()+30*60*1000).toISOString();
  await env.MEMBERS_DB.prepare('UPDATE paypal_checkout_intents SET used_at=? WHERE member_id=? AND used_at IS NULL').bind(currentIso,required.auth.member.id).run();
  const intentId=id('paypal-intent');
  await env.MEMBERS_DB.prepare('INSERT INTO paypal_checkout_intents (id,member_id,tier,plan_id,expires_at,created_at) VALUES (?,?,?,?,?,?)').bind(intentId,required.auth.member.id,tier,plan.provider_plan_id,expiresAt,currentIso).run();
  await env.MEMBERS_DB.prepare("INSERT INTO paypal_checkout_intent_state (checkout_intent_id,environment,status,updated_at,created_at) VALUES (?,?,'created',?,?)").bind(intentId,state.environment,currentIso,currentIso).run();
  try{
    const userAgentHash=await hash(request.headers.get('user-agent')||'');
    const ipCountry=clean(request.headers.get('cf-ipcountry')||'',8)||null;
    await env.MEMBERS_DB.prepare('INSERT INTO paypal_checkout_consents (checkout_intent_id,member_id,terms_version,withdrawal_notice_version,terms_accepted,recurring_payment_acknowledged,immediate_service_requested,withdrawal_notice_acknowledged,user_agent_hash,ip_country,consented_at,created_at) VALUES (?,?,?,?,1,1,1,1,?,?,?,?)').bind(intentId,required.auth.member.id,commercialTermsVersion,withdrawalNoticeVersion,userAgentHash,ipCountry,currentIso,currentIso).run();
  }catch(error){
    await env.MEMBERS_DB.prepare('DELETE FROM paypal_checkout_intents WHERE id=?').bind(intentId).run().catch(()=>null);
    await audit(env,required.auth.member.id,'paypal.checkout.consent_failed','paypal_checkout_intent',intentId,{tier,error:clean(error.message||error,500)});
    return json({ok:false,error:'Checkout consent could not be recorded. No PayPal subscription was created.'},503);
  }
  await audit(env,required.auth.member.id,'paypal.checkout.consent_recorded','paypal_checkout_intent',intentId,{tier,termsVersion:commercialTermsVersion,withdrawalNoticeVersion});
  return json({ok:true,intentId,tier,planId:plan.provider_plan_id,customId:intentId,clientId:String(env.PAYPAL_CLIENT_ID),currency:'EUR',environment:state.environment,expiresAt,consentRecorded:true,termsVersion:commercialTermsVersion,withdrawalNoticeVersion});
}`;
if (!source.includes('paypal.checkout.consent_recorded')) {
  const pattern = /async function checkoutIntent\(request,env\)\{[\s\S]*?\n\nfunction billingTimes/;
  need(pattern.test(source), 'PayPal checkoutIntent function anchor was not found');
  source = source.replace(pattern, `${checkoutReplacement}\n\nfunction billingTimes`);
  report.patched.push('durable-checkout-consent');
} else if (!source.includes('contract-confirmation gate passes')) {
  const pattern = /async function checkoutIntent\(request,env\)\{[\s\S]*?\n\nfunction billingTimes/;
  need(pattern.test(source), 'Patched PayPal checkoutIntent function anchor was not found');
  source = source.replace(pattern, `${checkoutReplacement}\n\nfunction billingTimes`);
  report.patched.push('checkout-contract-email-gate');
}

if (!source.includes('paypal.membership_contract_confirmation')) {
  const syncReturnPattern = /await recordTransition\(env,\{subscriptionId:row\.id,providerSubscriptionId,eventId:event\.id,eventType:event\.type\|\|'subscription\.sync',fromState:old\?\.billing_state,toState:state,entitlementBefore:Boolean\(old\?\.entitlement_active\),entitlementAfter:entitlement,reason:`Provider status \$\{providerStatus\}`,payloadHash:event\.payloadHash\}\);return\{subscriptionId:providerSubscriptionId,localSubscriptionId:row\.id,tier,status:providerStatus,billingState:state,paidAccess:entitlement,currentPeriodEnd:periodEnd,nextBillingAt:times\.nextBillingAt\}\}/;
  need(syncReturnPattern.test(source), 'PayPal syncSubscription return anchor was not found');
  const replacement = `await recordTransition(env,{subscriptionId:row.id,providerSubscriptionId,eventId:event.id,eventType:event.type||'subscription.sync',fromState:old?.billing_state,toState:state,entitlementBefore:Boolean(old?.entitlement_active),entitlementAfter:entitlement,reason:\`Provider status \${providerStatus}\`,payloadHash:event.payloadHash});
  let contractConfirmation={queued:false,sent:false,reason:'not-newly-active'};
  if(entitlement&&!Boolean(old?.entitlement_active)){
    const checkoutIntentId=clean(details?.custom_id,180)||clean((await first(env.MEMBERS_DB.prepare('SELECT checkout_intent_id FROM paypal_checkout_intent_state WHERE provider_subscription_id=? ORDER BY updated_at DESC LIMIT 1').bind(providerSubscriptionId)))?.checkout_intent_id,180)||null;
    try{
      contractConfirmation=await queueMembershipContractConfirmation(env,{memberId,providerSubscriptionId,tier,checkoutIntentId,currentPeriodEnd:periodEnd});
      await audit(env,memberId,'paypal.membership_contract_confirmation','subscription',providerSubscriptionId,contractConfirmation);
    }catch(error){
      contractConfirmation={queued:false,sent:false,error:clean(error.message||error,500)};
      await audit(env,memberId,'paypal.membership_contract_confirmation_failed','subscription',providerSubscriptionId,contractConfirmation);
    }
  }
  return{subscriptionId:providerSubscriptionId,localSubscriptionId:row.id,tier,status:providerStatus,billingState:state,paidAccess:entitlement,currentPeriodEnd:periodEnd,nextBillingAt:times.nextBillingAt,contractConfirmation}}`;
  source = source.replace(syncReturnPattern, replacement);
  report.patched.push('membership-contract-confirmation-transition');
}

const activationReplacement = `async function activation(request,env){
  const required=await requireAdmin(request,env);if(required.response)return required.response;
  const input=await body(request);
  const target=input.environment==='live'?'live':'sandbox';
  const enabled=Boolean(input.enabled);
  if(target!==environment(env))return json({ok:false,error:'Activation target must match PAYPAL_ENVIRONMENT'},409);
  const state=await activationState(env);
  if(enabled){
    if(!state.configured||!state.plansReady)return json({ok:false,error:'Credentials, webhook and all three active plans are required'},409);
    if(target==='sandbox'&&!bool(env.PAYPAL_SANDBOX_ENABLED))return json({ok:false,error:'PAYPAL_SANDBOX_ENABLED must be true'},409);
    if(target==='live'){
      if(!state.commercialLegalReady)return json({ok:false,error:'Verified commercial operator information and the protected commercial legal confirmation are required before live checkout'},409);
      if(!state.contractConfirmationReady)return json({ok:false,error:'Authenticated transactional email is required to deliver the durable membership contract confirmation'},409);
      if(!bool(env.PAYPAL_PRODUCTION_ENABLED)||String(env.PAYPAL_LIVE_ACTIVATION_CONFIRMATION||'')!=='MATRIX_PAYPAL_LIVE_CONFIRMED')return json({ok:false,error:'Live environment switches are not confirmed'},409);
      if(String(input.phrase||'')!=='ACTIVATE MATRIX PAYPAL LIVE')return json({ok:false,error:'Exact live activation phrase required'},400);
    }
  }
  const current=now();
  await env.MEMBERS_DB.prepare('UPDATE paypal_runtime_settings SET checkout_enabled=?,activation_reason=?,activated_by=?,activated_at=CASE WHEN ?=1 THEN ? ELSE activated_at END,deactivated_at=CASE WHEN ?=0 THEN ? ELSE deactivated_at END,updated_at=? WHERE environment=?').bind(enabled?1:0,clean(input.reason||\`\${enabled?'Enabled':'Disabled'} by administrator\`,500),required.auth.member.id,enabled?1:0,current,enabled?1:0,current,current,target).run();
  await audit(env,required.auth.member.id,enabled?'paypal.activation.enabled':'paypal.activation.disabled','paypal_environment',target,{reason:input.reason||'',environmentSwitch:state.environmentSwitch,commercialLegalReady:state.commercialLegalReady,contractConfirmationReady:state.contractConfirmationReady});
  const updated=await activationState(env);
  return json({ok:true,environment:target,commercialLegalReady:updated.commercialLegalReady,contractConfirmationReady:updated.contractConfirmationReady,checkoutEnabled:updated.checkoutEnabled});
}`;
if (!source.includes('Authenticated transactional email is required to deliver the durable membership contract confirmation')) {
  const pattern = /async function activation\(request,env\)\{[\s\S]*?\n\nasync function route/;
  need(pattern.test(source), 'PayPal activation function anchor was not found');
  source = source.replace(pattern, `${activationReplacement}\n\nasync function route`);
  report.patched.push('live-activation-contract-email-gate');
}

for (const marker of [
  contractImport,
  "const commercialTermsVersion='2026-07-18-v1'",
  'function commercialLegalReady',
  'function contractConfirmationReady',
  'contractConfirmationReady:contractEmailReady',
  'paypal_checkout_consents',
  'paypal.checkout.consent_recorded',
  'paypal.membership_contract_confirmation',
  'Authenticated transactional email is required to deliver the durable membership contract confirmation'
]) need(source.includes(marker), `Patched PayPal Worker missing marker: ${marker}`);

fs.writeFileSync(workerPath, source);
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(`Commercial PayPal guard patched: ${report.patched.length} change group(s); consent, durable contract confirmation and live legal gates present.`);
