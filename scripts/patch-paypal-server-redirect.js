const fs = require('fs');
const path = require('path');

const root = process.cwd();
const reportPath = path.join(root, 'downloads', 'paypal-server-redirect-patch.json');
const paths = {
  paypalWorker: path.join(root, 'src', 'worker-paypal-subscriptions.js'),
  productionWorker: path.join(root, 'src', 'worker-production.js'),
  client: path.join(root, 'paypal-membership.js'),
  routeTest: path.join(root, 'scripts', 'cloudflare-worker-routes-test.js'),
  harmonyTest: path.join(root, 'scripts', 'site-function-harmony-test.js'),
  rehearsalTest: path.join(root, 'scripts', 'phase7-paypal-sandbox-rehearsal-test.mjs'),
  verifier: path.join(root, 'scripts', 'verify-live-production.js'),
  receipt: path.join(root, 'scripts', 'build-production-deploy-receipt.js'),
  reconcile: path.join(root, 'scripts', 'final-production-reconcile.js')
};

const report = { ok: false, generatedAt: new Date().toISOString(), changed: [], checked: [] };
function read(file) {
  if (!fs.existsSync(file)) throw new Error(`Missing required file: ${path.relative(root, file)}`);
  return fs.readFileSync(file, 'utf8');
}
function write(file, text, label) {
  fs.writeFileSync(file, text);
  report.changed.push(label || path.relative(root, file));
}
function replaceRequired(text, oldValue, newValue, label) {
  if (text.includes(newValue)) return text;
  if (!text.includes(oldValue)) throw new Error(`${label} patch target not found`);
  return text.replace(oldValue, newValue);
}
function replaceBlock(text, startMarker, endMarker, replacement, label) {
  if (text.includes(replacement)) return text;
  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error(`${label} block target not found`);
  return `${text.slice(0, start)}${replacement}${text.slice(end)}`;
}
function requireMarker(text, marker, label) {
  const ok = text.includes(marker);
  report.checked.push({ label, marker, ok });
  if (!ok) throw new Error(`${label} missing marker: ${marker}`);
}

const canonicalClient = `(() => {
  const paidTiers=['supporter','intelligence','research_pro'];
  const $=id=>document.getElementById(id);
  const api=async(path,options={})=>{const response=await fetch(path,{cache:'no-store',credentials:'include',headers:{accept:'application/json',...(options.body?{'content-type':'application/json'}:{})},...options,body:options.body?JSON.stringify(options.body):undefined});const text=await response.text();let data={};try{data=JSON.parse(text||'{}')}catch{data={ok:false,error:text||'Invalid response'}}if(response.status===401)throw Object.assign(new Error('Log in to choose a paid membership.'),{authentication:true});if(!response.ok||data.ok===false)throw new Error(data.error||data.message||'Payment request failed');return data};
  const status=(message,type='')=>{const node=$('paypal-membership-status');if(node){node.className='membership-status '+type;node.textContent=message}};
  function renderLoginActions(){for(const tier of paidTiers){const container=$(\`paypal-button-\${tier}\`);if(!container)continue;container.replaceChildren();const link=document.createElement('a');link.className='btn';link.href=\`member-login.html?return=\${encodeURIComponent('/membership.html')}\`;link.textContent='Log in to subscribe';container.append(link)}}
  function safeApprovalUrl(value){const url=new URL(String(value||''));if(url.protocol!=='https:'||!['www.paypal.com','www.sandbox.paypal.com'].includes(url.hostname))throw new Error('PayPal returned an invalid approval address');return url.href}
  function renderCheckoutActions(){for(const tier of paidTiers){const container=$(\`paypal-button-\${tier}\`);if(!container)continue;container.replaceChildren();const button=document.createElement('button');button.type='button';button.className='btn';button.textContent='Continue securely to PayPal';button.addEventListener('click',async()=>{button.disabled=true;button.textContent='Opening PayPal…';try{status('Creating a secure PayPal approval session…');const result=await api('/api/paypal/subscription/create',{method:'POST',body:{tier}});location.assign(safeApprovalUrl(result.approveUrl))}catch(error){button.disabled=false;button.textContent='Continue securely to PayPal';status(error.message||'PayPal checkout could not start.','danger')}});container.append(button)}}
  function showReturnMessage(){const params=new URLSearchParams(location.search);if(params.get('paypal')==='cancelled')status('PayPal checkout was cancelled. No charge or entitlement change was recorded.','warning');if(params.get('paypal_error'))status(\`PayPal returned safely, but verification failed: \${params.get('paypal_error')}\`,'danger')}
  async function start(){showReturnMessage();try{status('Checking PayPal checkout readiness…');const config=await api('/api/paypal/config');if(!config.configured){status('PayPal credentials and webhook are not configured yet. No payment can be taken.','warning');return}if(!config.checkoutEnabled){status(\`PayPal \${config.environment} checkout is installed but still disabled behind the activation switches. No payment can be taken.\`,'warning');return}renderCheckoutActions();status(\`PayPal \${config.environment} checkout is enabled. Choose a tier to continue directly to PayPal’s secure approval page.\`,config.environment==='live'?'good':'warning')}catch(error){if(error.authentication){status('Log in first. The paid membership buttons will appear immediately after your verified Matrix session is active.','warning');document.querySelectorAll('[data-paypal-login]').forEach(node=>node.hidden=false);renderLoginActions()}else status(error.message||'PayPal checkout is unavailable.','danger')}}
  start();
})();
`;

let paypalWorker = read(paths.paypalWorker);
paypalWorker = replaceRequired(
  paypalWorker,
  "'/api/paypal/config','/api/paypal/checkout-intent','/api/paypal/subscription/confirm'",
  "'/api/paypal/config','/api/paypal/checkout-intent','/api/paypal/subscription/create','/api/paypal/subscription/return','/api/paypal/subscription/confirm'",
  'PayPal route registration'
);
if (!paypalWorker.includes('function redirect(location)')) {
  const anchor = "function json(data,status=200,extra={}){return new Response(JSON.stringify(data,null,2),{status,headers:{...headers,...extra}})}";
  paypalWorker = replaceRequired(paypalWorker, anchor, `${anchor}\nfunction redirect(location){return new Response(null,{status:303,headers:{...headers,Location:location}})}`, 'PayPal redirect helper');
}
const serverFunctions = `async function createSubscriptionApproval(request,env){const intentResponse=await checkoutIntent(request,env);if(!intentResponse.ok)return intentResponse;const intent=await intentResponse.json();const origin=new URL(request.url).origin;const returnUrl=\`${'${origin}'}/api/paypal/subscription/return?checkout_intent=\${encodeURIComponent(intent.intentId)}\`;const cancelUrl=\`${'${origin}'}/membership.html?paypal=cancelled\`;try{const result=await paypal(env,'/v1/billing/subscriptions',{method:'POST',requestId:\`matrix-subscription-\${intent.intentId}\`,body:JSON.stringify({plan_id:intent.planId,custom_id:intent.intentId,application_context:{brand_name:'Matrix Reprogrammed',shipping_preference:'NO_SHIPPING',user_action:'SUBSCRIBE_NOW',return_url:returnUrl,cancel_url:cancelUrl}})});const created=result.payload||{};const approveUrl=(created.links||[]).find(link=>link.rel==='approve'&&link.method==='GET')?.href||'';if(!created.id||!approveUrl)throw new Error('PayPal did not return a subscription approval link');const current=now();await env.MEMBERS_DB.prepare("UPDATE paypal_checkout_intent_state SET status='approval_pending',provider_subscription_id=?,updated_at=? WHERE checkout_intent_id=?").bind(clean(created.id,140),current,intent.intentId).run();await audit(env,intent.memberId||null,'paypal.subscription.approval_created','paypal_subscription',created.id,{checkoutIntentId:intent.intentId,tier:intent.tier,environment:intent.environment});return json({ok:true,checkoutIntentId:intent.intentId,subscriptionId:created.id,approveUrl,environment:intent.environment,expiresAt:intent.expiresAt})}catch(error){await env.MEMBERS_DB.prepare("UPDATE paypal_checkout_intent_state SET status='provider_create_failed',updated_at=? WHERE checkout_intent_id=?").bind(now(),intent.intentId).run().catch(()=>null);throw error}}
async function subscriptionReturn(request,env){const url=new URL(request.url);const checkoutIntentId=clean(url.searchParams.get('checkout_intent'),180);let subscriptionId=clean(url.searchParams.get('subscription_id')||url.searchParams.get('subscriptionId'),140);if(!checkoutIntentId)return redirect('/membership.html?paypal_error=missing_checkout_intent');if(!subscriptionId){const state=await first(env.MEMBERS_DB.prepare('SELECT provider_subscription_id FROM paypal_checkout_intent_state WHERE checkout_intent_id=? LIMIT 1').bind(checkoutIntentId));subscriptionId=clean(state?.provider_subscription_id,140)}if(!subscriptionId)return redirect('/membership.html?paypal_error=missing_subscription_id');const forwardedHeaders=new Headers({'content-type':'application/json'});const sessionCookie=request.headers.get('cookie');if(sessionCookie)forwardedHeaders.set('cookie',sessionCookie);const confirmation=await confirm(new Request(request.url,{method:'POST',headers:forwardedHeaders,body:JSON.stringify({subscriptionId,checkoutIntentId})}),env);let payload={};try{payload=await confirmation.clone().json()}catch{}if(!confirmation.ok)return redirect(\`/membership.html?paypal_error=\${encodeURIComponent(clean(payload.error||payload.message||'verification_failed',200))}\`);return redirect('/billing-dashboard.html?paypal=confirmed')}
`;
if (!paypalWorker.includes('async function createSubscriptionApproval')) {
  paypalWorker = replaceRequired(paypalWorker, '\nfunction billingTimes(details)', `\n${serverFunctions}\nfunction billingTimes(details)`, 'server-created PayPal subscription functions');
}
paypalWorker = replaceRequired(
  paypalWorker,
  "if(path==='/api/paypal/checkout-intent'&&request.method==='POST')return checkoutIntent(request,env);if(path==='/api/paypal/subscription/confirm'&&request.method==='POST')return confirm(request,env);",
  "if(path==='/api/paypal/checkout-intent'&&request.method==='POST')return checkoutIntent(request,env);if(path==='/api/paypal/subscription/create'&&request.method==='POST')return createSubscriptionApproval(request,env);if(path==='/api/paypal/subscription/return'&&request.method==='GET')return subscriptionReturn(request,env);if(path==='/api/paypal/subscription/confirm'&&request.method==='POST')return confirm(request,env);",
  'PayPal route dispatcher'
);
write(paths.paypalWorker, paypalWorker, 'src/worker-paypal-subscriptions.js');

let productionWorker = read(paths.productionWorker);
productionWorker = replaceRequired(
  productionWorker,
  "if (path === '/api/paypal/checkout-intent'\n        && request.method === 'POST'",
  "if (['/api/paypal/checkout-intent', '/api/paypal/subscription/create'].includes(path)\n        && request.method === 'POST'",
  'sandbox gate for server-created subscriptions'
);
write(paths.productionWorker, productionWorker, 'src/worker-production.js');

if (read(paths.client) !== canonicalClient) write(paths.client, canonicalClient, 'paypal-membership.js');

let routeTest = read(paths.routeTest);
routeTest = replaceRequired(
  routeTest,
  "for (const marker of ['/api/paypal/checkout-intent','/api/paypal/subscription/confirm','Retry PayPal checkout']) {",
  "for (const marker of ['/api/paypal/subscription/create','Continue securely to PayPal','/api/paypal/config']) {",
  'Cloudflare route test PayPal client markers'
);
write(paths.routeTest, routeTest, 'scripts/cloudflare-worker-routes-test.js');

let harmonyTest = read(paths.harmonyTest);
harmonyTest = replaceRequired(harmonyTest, "needText(file, '/api/paypal/checkout-intent', 'PayPal checkout intent runtime');", "needText(file, '/api/paypal/subscription/create', 'server-created PayPal subscription runtime');", 'Harmony PayPal create route');
harmonyTest = replaceRequired(harmonyTest, "needText(file, '/api/paypal/subscription/confirm', 'PayPal confirmation runtime');", "needText(file, 'Continue securely to PayPal', 'PayPal redirect checkout action');", 'Harmony PayPal action');
harmonyTest = replaceRequired(harmonyTest, "needText(file, 'Retry PayPal checkout', 'PayPal SDK retry action');", "forbidText(file, 'paypal.com/sdk/js', 'obsolete browser-loaded PayPal SDK');", 'Harmony obsolete SDK guard');
write(paths.harmonyTest, harmonyTest, 'scripts/site-function-harmony-test.js');

let rehearsalTest = read(paths.rehearsalTest);
rehearsalTest = replaceRequired(
  rehearsalTest,
  "check('production boundary gates checkout intent', production.includes(\"path === '/api/paypal/checkout-intent'\") && production.includes('enforceSandboxRehearsalGate'));",
  "check('production boundary gates all subscription starts', production.includes(\"'/api/paypal/subscription/create'\") && production.includes('enforceSandboxRehearsalGate'));",
  'Phase 7 server subscription gate test'
);
write(paths.rehearsalTest, rehearsalTest, 'scripts/phase7-paypal-sandbox-rehearsal-test.mjs');

const verifierFunction = `async function verifyPayPalBoundary() {
  const configResponse = await fetchText('/api/paypal/config');
  const config = parseJson(configResponse.text);
  const checkoutResponse = await fetchText('/api/paypal/checkout-intent', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tier: 'supporter' })
  });
  const checkout = parseJson(checkoutResponse.text);
  const createResponse = await fetchText('/api/paypal/subscription/create', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tier: 'supporter' })
  });
  const create = parseJson(createResponse.text);
  const configProtected = configResponse.status === 401
    && configResponse.headers['x-matrix-origin'] === 'cloudflare-worker-paypal-subscriptions'
    && config?.ok === false && config?.authenticated === false;
  const checkoutProtected = checkoutResponse.status === 401
    && checkoutResponse.headers['x-matrix-origin'] === 'cloudflare-worker-paypal-subscriptions'
    && checkout?.ok === false && checkout?.authenticated === false;
  const createProtected = createResponse.status === 401
    && createResponse.headers['x-matrix-origin'] === 'cloudflare-worker-paypal-subscriptions'
    && create?.ok === false && create?.authenticated === false;
  return {
    ok: configProtected && checkoutProtected && createProtected,
    runtimeModel: 'authenticated-member-only server-created subscription; Cloudflare-managed credentials and switches; D1 activation gate',
    config: { status: configResponse.status, origin: configResponse.headers['x-matrix-origin'] || null, data: config },
    checkout: { status: checkoutResponse.status, origin: checkoutResponse.headers['x-matrix-origin'] || null, data: checkout },
    subscriptionCreate: { status: createResponse.status, origin: createResponse.headers['x-matrix-origin'] || null, data: create },
    anonymousChargePossible: false
  };
}`;
let verifier = read(paths.verifier);
verifier = replaceBlock(verifier, 'async function verifyPayPalBoundary() {', '\n\nasync function verifyEmailAutomationBoundary() {', verifierFunction, 'live PayPal boundary verifier');
write(paths.verifier, verifier, 'scripts/verify-live-production.js');

let receipt = read(paths.receipt);
receipt = replaceRequired(
  receipt,
  "const sdkFallbackWired = paypalClient.includes('Retry PayPal checkout')\n    && paypalClient.includes('PayPal SDK network request was blocked or rejected')\n    && paypalClient.includes('credentials:\\'include\\'');",
  "const serverRedirectWired = paypalClient.includes('/api/paypal/subscription/create')\n    && paypalClient.includes('Continue securely to PayPal')\n    && paypalClient.includes(\"credentials:'include'\")\n    && paypalWorker.includes(\"'/v1/billing/subscriptions'\")\n    && paypalWorker.includes(\"rel==='approve'\");",
  'production receipt server redirect wiring'
);
receipt = replaceRequired(receipt, 'sdkFallbackWired,', 'serverRedirectWired,', 'production receipt PayPal field');
receipt = replaceRequired(receipt, '&& sdkFallbackWired', '&& serverRedirectWired', 'production receipt PayPal gate');
write(paths.receipt, receipt, 'scripts/build-production-deploy-receipt.js');

let reconcile = read(paths.reconcile);
if (!reconcile.includes("run('scripts/patch-paypal-server-redirect.js');")) {
  reconcile = replaceRequired(reconcile, "run('scripts/phase7-paypal-sandbox-rehearsal-test.mjs');", "run('scripts/phase7-paypal-sandbox-rehearsal-test.mjs');\nrun('scripts/patch-paypal-server-redirect.js');", 'final reconcile PayPal redirect owner');
  write(paths.reconcile, reconcile, 'scripts/final-production-reconcile.js');
}

for (const [file, markers] of [
  [paths.paypalWorker, ['/api/paypal/subscription/create','/api/paypal/subscription/return','async function createSubscriptionApproval','async function subscriptionReturn',"'/v1/billing/subscriptions'","rel==='approve'"]],
  [paths.productionWorker, ["'/api/paypal/subscription/create'",'enforceSandboxRehearsalGate']],
  [paths.client, ['/api/paypal/subscription/create','Continue securely to PayPal','location.assign','credentials:\'include\'']],
  [paths.verifier, ['/api/paypal/subscription/create','subscriptionCreate','anonymousChargePossible: false']],
  [paths.receipt, ['serverRedirectWired','Continue securely to PayPal']]
]) {
  const text = read(file);
  for (const marker of markers) requireMarker(text, marker, path.relative(root, file));
}
if (read(paths.client).includes('paypal.com/sdk/js')) throw new Error('Browser-loaded PayPal SDK remains in canonical membership client');

report.ok = true;
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log('PayPal server redirect checkout installed: Worker creates the subscription, returns the official approval URL, verifies the PayPal return, and the browser no longer loads paypal.com/sdk/js.');
