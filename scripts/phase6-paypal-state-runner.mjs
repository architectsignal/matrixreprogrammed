import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require=createRequire(import.meta.url);
const {repairPayPalCheckoutGateOrder,shutdownFirst}=require('./patch-paypal-checkout-gate-order.js');
const root=process.cwd();
const outputDir=path.join(root,'downloads','phase6-paypal-state-test');
fs.mkdirSync(outputDir,{recursive:true});

function replaceRequired(text,before,after,label){
  if(text.includes(before))return text.replace(before,after);
  if(text.includes(after))return text;
  throw new Error(`Phase 6 canonical PayPal repair could not find ${label}`);
}

function canonicalPayPalSource(){
  let source=fs.readFileSync(path.join(root,'src','worker-paypal-subscriptions.js'),'utf8');
  source=replaceRequired(
    source,
    "function cookie(request,name='matrix_session'){const raw=request.headers.get('cookie')||'';for(const part of raw.split(';')){const index=part.indexOf('=');if(index>0&&part.slice(0,index).trim()===name)return decodeURIComponent(part.slice(index+1).trim())}return''}",
    "function cookie(request,name=''){const raw=request.headers.get('cookie')||'';const values={};for(const part of raw.split(';')){const index=part.indexOf('=');if(index<=0)continue;const key=part.slice(0,index).trim();if(key&&!Object.prototype.hasOwnProperty.call(values,key))values[key]=decodeURIComponent(part.slice(index+1).trim())}if(name)return values[name]||'';return values.matrix_session_v2||values.matrix_session||''}",
    'session-cookie reader'
  );
  source=replaceRequired(
    source,
    "async function config(request,env){const required=await requireAuth(request,env);if(required.response)return required.response;const state=await activationState(env);return json({ok:true,authenticated:true,environment:state.environment,currency:'EUR',clientId:state.configured?String(env.PAYPAL_CLIENT_ID):null,configured:state.configured,checkoutEnabled:state.checkoutEnabled,webhookConfigured:Boolean(env.PAYPAL_WEBHOOK_ID),tiers:Object.fromEntries(Object.entries(tiers).map(([key,value])=>[key,{label:value.label,price:value.price,planId:state.plans.find(plan=>plan.tier===key)?.provider_plan_id||null}])),activation:{environmentSwitch:state.environmentSwitch,databaseSwitch:state.databaseSwitch,confirmation:state.confirmation,plansReady:state.plansReady}})}",
    "async function currentSubscriptionForMember(env,memberId){return await first(env.MEMBERS_DB.prepare(`SELECT tier,billing_state,entitlement_active,provider_status,current_period_end,next_billing_at,CASE WHEN entitlement_active=1 OR (entitlement_active IS NULL AND LOWER(provider_status) IN ('active','trialing') AND (current_period_end IS NULL OR datetime(current_period_end)>datetime('now'))) THEN 1 ELSE 0 END AS paid_access FROM paypal_current_subscription_status WHERE member_id=? ORDER BY paid_access DESC,state_updated_at DESC LIMIT 1`).bind(memberId))}\nasync function config(request,env){const required=await requireAuth(request,env);if(required.response)return required.response;const state=await activationState(env);const currentSubscription=await currentSubscriptionForMember(env,required.auth.member.id);return json({ok:true,authenticated:true,environment:state.environment,currency:'EUR',clientId:state.configured?String(env.PAYPAL_CLIENT_ID):null,configured:state.configured,checkoutEnabled:state.checkoutEnabled,webhookConfigured:Boolean(env.PAYPAL_WEBHOOK_ID),paidAccess:bool(currentSubscription?.paid_access),currentSubscription:currentSubscription||null,effectiveTier:required.auth.entitlement.effective_tier,billingUrl:'/billing-dashboard.html',tiers:Object.fromEntries(Object.entries(tiers).map(([key,value])=>[key,{label:value.label,price:value.price,planId:state.plans.find(plan=>plan.tier===key)?.provider_plan_id||null}])),activation:{environmentSwitch:state.environmentSwitch,databaseSwitch:state.databaseSwitch,confirmation:state.confirmation,plansReady:state.plansReady}})}",
    'member configuration response'
  );
  if(!source.includes(shutdownFirst)){
    source=replaceRequired(
      source,
      "async function checkoutIntent(request,env){const required=await requireAuth(request,env);if(required.response)return required.response;const state=await activationState(env);if(!state.checkoutEnabled)return json({ok:false,configured:state.configured,environment:state.environment,error:'PayPal checkout is disabled until activation gates pass'},503);const input=await body(request);const tier=clean(input.tier,40);if(!tiers[tier])return json({ok:false,error:'Unknown membership tier'},400);const plan=state.plans.find(item=>item.tier===tier);if(!plan)return json({ok:false,error:'The selected PayPal plan is unavailable'},409);const current=new Date();const expiresAt=new Date(current.getTime()+30*60*1000).toISOString();await env.MEMBERS_DB.prepare('UPDATE paypal_checkout_intents SET used_at=? WHERE member_id=? AND used_at IS NULL').bind(current.toISOString(),required.auth.member.id).run();const intentId=id('paypal-intent');await env.MEMBERS_DB.prepare('INSERT INTO paypal_checkout_intents (id,member_id,tier,plan_id,expires_at,created_at) VALUES (?,?,?,?,?,?)').bind(intentId,required.auth.member.id,tier,plan.provider_plan_id,expiresAt,current.toISOString()).run();await env.MEMBERS_DB.prepare(\"INSERT INTO paypal_checkout_intent_state (checkout_intent_id,environment,status,updated_at,created_at) VALUES (?,?,'created',?,?)\").bind(intentId,state.environment,current.toISOString(),current.toISOString()).run();return json({ok:true,intentId,tier,planId:plan.provider_plan_id,customId:intentId,clientId:String(env.PAYPAL_CLIENT_ID),currency:'EUR',environment:state.environment,expiresAt})}",
      "async function checkoutIntent(request,env){const required=await requireAuth(request,env);if(required.response)return required.response;const currentSubscription=await currentSubscriptionForMember(env,required.auth.member.id);if(currentSubscription&&bool(currentSubscription.paid_access))return json({ok:false,error:'An active PayPal membership already exists. Use the billing dashboard to manage or cancel it before starting another subscription.',currentSubscription,billingUrl:'/billing-dashboard.html'},409);const state=await activationState(env);if(!state.checkoutEnabled)return json({ok:false,configured:state.configured,environment:state.environment,error:'PayPal checkout is disabled until activation gates pass'},503);const input=await body(request);const tier=clean(input.tier,40);if(!tiers[tier])return json({ok:false,error:'Unknown membership tier'},400);const plan=state.plans.find(item=>item.tier===tier);if(!plan)return json({ok:false,error:'The selected PayPal plan is unavailable'},409);const current=new Date();const expiresAt=new Date(current.getTime()+30*60*1000).toISOString();await env.MEMBERS_DB.prepare('UPDATE paypal_checkout_intents SET used_at=? WHERE member_id=? AND used_at IS NULL').bind(current.toISOString(),required.auth.member.id).run();const intentId=id('paypal-intent');await env.MEMBERS_DB.prepare('INSERT INTO paypal_checkout_intents (id,member_id,tier,plan_id,expires_at,created_at) VALUES (?,?,?,?,?,?)').bind(intentId,required.auth.member.id,tier,plan.provider_plan_id,expiresAt,current.toISOString()).run();await env.MEMBERS_DB.prepare(\"INSERT INTO paypal_checkout_intent_state (checkout_intent_id,environment,status,updated_at,created_at) VALUES (?,?,'created',?,?)\").bind(intentId,state.environment,current.toISOString(),current.toISOString()).run();return json({ok:true,intentId,tier,planId:plan.provider_plan_id,customId:intentId,clientId:String(env.PAYPAL_CLIENT_ID),currency:'EUR',environment:state.environment,expiresAt})}",
      'checkout-intent allocator'
    );
  }
  return repairPayPalCheckoutGateOrder(source);
}

try{
  const testPath=path.join(root,'scripts','phase6-paypal-state-test.mjs');
  const duplicateGuardAnchor="pass('verified-activation-and-idempotency');";
  const duplicateGuardStage="const duplicateCheckout=await call('/api/paypal/checkout-intent',{as:'member-buyer',method:'POST',body:{tier:'intelligence'}});assert(duplicateCheckout.response.status===409&&duplicateCheckout.data.billingUrl==='/billing-dashboard.html','Active PayPal membership did not block duplicate checkout');pass('duplicate-active-subscription-blocked');";
  let source=fs.readFileSync(testPath,'utf8');
  const workerImport="const source=fs.readFileSync(path.join(root,'src/worker-paypal-subscriptions.js'),'utf8');\nconst module=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);";
  const canonicalWorker=canonicalPayPalSource();
  const canonicalImport=`const source=Buffer.from('${Buffer.from(canonicalWorker).toString('base64')}','base64').toString('utf8');\nconst module=await import(\`data:text/javascript;base64,\${Buffer.from(source).toString('base64')}\`);`;
  if(!source.includes(workerImport))throw new Error('Phase 6 worker import anchor is missing');
  source=source.replace(workerImport,canonicalImport);
  if(!source.includes(duplicateGuardStage)){
    if(!source.includes(duplicateGuardAnchor))throw new Error('Phase 6 duplicate-subscription stage anchor is missing');
    source=source.replace(duplicateGuardAnchor,`${duplicateGuardAnchor}\n${duplicateGuardStage}`);
  }
  source=source
    .replace('requiredStages:14','requiredStages:16')
    .replace('stages.length===14','stages.length===16')
    .replace('all 14 state stages','all 16 state stages')
    .replace('${stages.length}/14 stages','${stages.length}/16 stages');
  await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}catch(error){
  const failure={ok:false,failedAt:new Date().toISOString(),name:error?.name||'Error',message:String(error?.message||error),stack:String(error?.stack||error),boundary:'Diagnostic only. No real PayPal account, charge, subscription, member, source file or production database was modified.'};
  fs.writeFileSync(path.join(outputDir,'failure.json'),JSON.stringify(failure,null,2)+'\n');
  console.error(`PHASE 6 FAILURE: ${failure.message}`);
  console.error(failure.stack);
  process.exitCode=1;
}
