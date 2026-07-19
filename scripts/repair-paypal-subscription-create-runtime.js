const fs = require('fs');
const path = require('path');

const root = process.cwd();
const workerPath = path.join(root, 'src', 'worker-paypal-subscriptions.js');
const productionPath = path.join(root, 'src', 'worker-production.js');
const clientPath = path.join(root, 'paypal-membership.js');
const siteClientPath = path.join(root, '_site', 'paypal-membership.js');
const reportPath = path.join(root, 'downloads', 'paypal-subscription-create-state-repair.json');

function read(file) {
  if (!fs.existsSync(file)) throw new Error(`Missing required file: ${path.relative(root, file)}`);
  return fs.readFileSync(file, 'utf8');
}

function writeIfChanged(file, source) {
  const before = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (before === source) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, source);
  return true;
}

function insertAfter(source, anchor, addition, label) {
  if (source.includes(addition)) return source;
  if (!source.includes(anchor)) throw new Error(`${label} insertion anchor missing`);
  return source.replace(anchor, `${anchor}${addition}`);
}

let worker = read(workerPath);
let production = read(productionPath);
let client = read(clientPath);
const changed = [];

// The public route registry must permanently own the server-created subscription flow.
if (!worker.includes("'/api/paypal/subscription/create'")) {
  worker = worker.replace(
    "'/api/paypal/config','/api/paypal/checkout-intent','/api/paypal/subscription/confirm'",
    "'/api/paypal/config','/api/paypal/checkout-intent','/api/paypal/subscription/create','/api/paypal/subscription/return','/api/paypal/subscription/confirm'"
  );
}

if (!worker.includes('function redirect(location)')) {
  worker = insertAfter(
    worker,
    "function json(data,status=200,extra={}){return new Response(JSON.stringify(data,null,2),{status,headers:{...headers,...extra}})}",
    "\nfunction redirect(location){return new Response(null,{status:303,headers:{...headers,Location:location}})}",
    'PayPal redirect helper'
  );
}

// Preserve PayPal's safe issue description and debug identifier without exposing credentials.
if (!worker.includes('error.paypalDebugId')) {
  const oldPaypal = "if(!response.ok)throw new Error(clean(payload.message||payload.error_description||payload.name||text||`PayPal HTTP ${response.status}`,900));return{status:response.status,payload}";
  const newPaypal = "if(!response.ok){const details=Array.isArray(payload.details)?payload.details.map(item=>clean(`${item.issue||''}${item.description?`: ${item.description}`:''}`,500)).filter(Boolean).join('; '):'';const failure=new Error(clean(details||payload.message||payload.error_description||payload.name||text||`PayPal HTTP ${response.status}`,900));failure.paypalDebugId=clean(payload.debug_id||'',120);failure.paypalName=clean(payload.name||'',120);throw failure}return{status:response.status,payload}";
  if (!worker.includes(oldPaypal)) throw new Error('PayPal provider error parser anchor missing');
  worker = worker.replace(oldPaypal, newPaypal);
}

const serverFunctions = `async function createSubscriptionApproval(request,env){const intentResponse=await checkoutIntent(request,env);if(!intentResponse.ok)return intentResponse;const intent=await intentResponse.json();const origin=new URL(request.url).origin;const returnUrl=\`${'${origin}'}/api/paypal/subscription/return?checkout_intent=\${encodeURIComponent(intent.intentId)}\`;const cancelUrl=\`${'${origin}'}/membership.html?paypal=cancelled\`;try{const result=await paypal(env,'/v1/billing/subscriptions',{method:'POST',requestId:\`matrix-subscription-\${intent.intentId}\`,body:JSON.stringify({plan_id:intent.planId,custom_id:intent.intentId,application_context:{brand_name:'Matrix Reprogrammed',shipping_preference:'NO_SHIPPING',user_action:'SUBSCRIBE_NOW',return_url:returnUrl,cancel_url:cancelUrl}})});const created=result.payload||{};const approveUrl=(created.links||[]).find(link=>link.rel==='approve')?.href||'';if(!created.id||!approveUrl)throw new Error('PayPal did not return a subscription approval link');const current=now();await env.MEMBERS_DB.prepare("UPDATE paypal_checkout_intent_state SET status='created',provider_subscription_id=?,updated_at=? WHERE checkout_intent_id=?").bind(clean(created.id,140),current,intent.intentId).run().catch(()=>null);await audit(env,intent.memberId||null,'paypal.subscription.approval_created','paypal_subscription',created.id,{checkoutIntentId:intent.intentId,tier:intent.tier,environment:intent.environment});return json({ok:true,checkoutIntentId:intent.intentId,subscriptionId:created.id,approveUrl,environment:intent.environment,expiresAt:intent.expiresAt})}catch(error){const providerMessage=clean(error.message||error,700);const errorCode=clean(error.paypalName||'PAYPAL_SUBSCRIPTION_CREATE_FAILED',120);const debugId=clean(error.paypalDebugId||'',120)||null;await env.MEMBERS_DB.prepare("UPDATE paypal_checkout_intent_state SET status='failed',failed_at=?,failure_reason=?,updated_at=? WHERE checkout_intent_id=?").bind(now(),providerMessage,now(),intent.intentId).run().catch(()=>null);await audit(env,intent.memberId||null,'paypal.subscription.create_failed','paypal_checkout_intent',intent.intentId,{tier:intent.tier,environment:intent.environment,errorCode,debugId,message:providerMessage});return json({ok:false,error:'PayPal could not start the subscription.',message:providerMessage,errorCode,debugId,environment:intent.environment},502)}}
async function subscriptionReturn(request,env){const url=new URL(request.url);const checkoutIntentId=clean(url.searchParams.get('checkout_intent'),180);let subscriptionId=clean(url.searchParams.get('subscription_id')||url.searchParams.get('subscriptionId'),140);if(!checkoutIntentId)return redirect('/membership.html?paypal_error=missing_checkout_intent');if(!subscriptionId){const state=await first(env.MEMBERS_DB.prepare('SELECT provider_subscription_id FROM paypal_checkout_intent_state WHERE checkout_intent_id=? LIMIT 1').bind(checkoutIntentId));subscriptionId=clean(state?.provider_subscription_id,140)}if(!subscriptionId)return redirect('/membership.html?paypal_error=missing_subscription_id');const forwardedHeaders=new Headers({'content-type':'application/json'});const sessionCookie=request.headers.get('cookie');if(sessionCookie)forwardedHeaders.set('cookie',sessionCookie);const confirmation=await confirm(new Request(request.url,{method:'POST',headers:forwardedHeaders,body:JSON.stringify({subscriptionId,checkoutIntentId})}),env);let payload={};try{payload=await confirmation.clone().json()}catch{}if(!confirmation.ok)return redirect(\`/membership.html?paypal_error=\${encodeURIComponent(clean(payload.message||payload.error||'verification_failed',200))}\`);return redirect('/billing-dashboard.html?paypal=confirmed')}
`;

if (!worker.includes('async function createSubscriptionApproval')) {
  const anchor = '\nfunction billingTimes(details)';
  if (!worker.includes(anchor)) throw new Error('PayPal server function insertion anchor missing');
  worker = worker.replace(anchor, `\n${serverFunctions}function billingTimes(details)`);
} else {
  const start = worker.indexOf('async function createSubscriptionApproval');
  const end = worker.indexOf('function billingTimes(details)', start);
  if (start < 0 || end < 0) throw new Error('Existing PayPal server function block is malformed');
  worker = `${worker.slice(0, start)}${serverFunctions}${worker.slice(end)}`;
}

const oldDispatcher = "if(path==='/api/paypal/checkout-intent'&&request.method==='POST')return checkoutIntent(request,env);if(path==='/api/paypal/subscription/confirm'&&request.method==='POST')return confirm(request,env);";
const newDispatcher = "if(path==='/api/paypal/checkout-intent'&&request.method==='POST')return checkoutIntent(request,env);if(path==='/api/paypal/subscription/create'&&request.method==='POST')return createSubscriptionApproval(request,env);if(path==='/api/paypal/subscription/return'&&request.method==='GET')return subscriptionReturn(request,env);if(path==='/api/paypal/subscription/confirm'&&request.method==='POST')return confirm(request,env);";
if (!worker.includes(newDispatcher)) {
  if (!worker.includes(oldDispatcher)) throw new Error('PayPal dispatcher anchor missing');
  worker = worker.replace(oldDispatcher, newDispatcher);
}

// Sandbox rehearsals gate every subscription start, not only the intent allocation call.
production = production.replace(
  "if (path === '/api/paypal/checkout-intent'\n        && request.method === 'POST'",
  "if (['/api/paypal/checkout-intent', '/api/paypal/subscription/create'].includes(path)\n        && request.method === 'POST'"
);

// The strict Worker places the useful exception in `message`/`detail`; show that first.
client = client.replace(
  "throw new Error(data.error||data.message||'Payment request failed')",
  "throw new Error(data.message||data.detail||data.error||'Payment request failed')"
);
client = client.replace(
  "throw new Error(data.message||data.error||'Payment request failed')",
  "throw new Error(data.message||data.detail||data.error||'Payment request failed')"
);

if (writeIfChanged(workerPath, worker)) changed.push('src/worker-paypal-subscriptions.js');
if (writeIfChanged(productionPath, production)) changed.push('src/worker-production.js');
if (writeIfChanged(clientPath, client)) changed.push('paypal-membership.js');
if (fs.existsSync(path.dirname(siteClientPath)) && writeIfChanged(siteClientPath, client)) changed.push('_site/paypal-membership.js');

const finalWorker = read(workerPath);
const finalProduction = read(productionPath);
const finalClient = read(clientPath);
for (const marker of [
  '/api/paypal/subscription/create',
  '/api/paypal/subscription/return',
  'async function createSubscriptionApproval',
  "status='created',provider_subscription_id=?",
  "status='failed',failed_at=?,failure_reason=?,updated_at=?",
  "return json({ok:false,error:'PayPal could not start the subscription.'",
  'error.paypalDebugId',
  "rel==='approve'"
]) {
  if (!finalWorker.includes(marker)) throw new Error(`PayPal durable-create marker missing: ${marker}`);
}
if (!finalProduction.includes("'/api/paypal/subscription/create'")) throw new Error('Production Worker does not gate server-created subscription starts');
if (!finalClient.includes('data.message||data.detail||data.error')) throw new Error('Membership client still hides the useful PayPal failure detail');
if (finalWorker.includes("status='approval_pending'") || finalWorker.includes("status='provider_create_failed'")) throw new Error('Invalid D1 PayPal checkout state remains');

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  changed,
  checkoutState: 'created until provider approval',
  failureState: 'failed with failed_at and failure_reason',
  approvalLinkPolicy: 'accept the official PayPal rel=approve link',
  providerFailurePolicy: 'return a safe PayPal issue description, code and debug ID without exposing credentials',
  bookkeepingPolicy: 'a nonessential D1 provider-ID update cannot block an already-created PayPal approval redirect',
  sourceOwnership: 'server create/return routes are restored before build and after late sanitation',
  schemaCompatibility: 'uses only statuses allowed by phase6_paypal_subscriptions.sql'
}, null, 2)}\n`);
console.log('PayPal subscription creation repaired permanently: routes restored, D1-compatible state, resilient redirect and provider diagnostics installed.');
