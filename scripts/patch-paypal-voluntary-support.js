const fs = require('fs');
const path = require('path');

const root = process.cwd();
const workerPath = path.join(root, 'src', 'worker-paypal-subscriptions.js');
const reportPath = path.join(root, 'downloads', 'paypal-voluntary-support-patch.json');
if (!fs.existsSync(workerPath)) throw new Error('src/worker-paypal-subscriptions.js is missing');

let source = fs.readFileSync(workerPath, 'utf8');
let changed = false;

const oldRoutes = "const exactRoutes=new Set(['/api/paypal/config','/api/paypal/checkout-intent','/api/paypal/subscription/confirm','/api/paypal/subscription','/api/paypal/subscription/cancel','/api/paypal/webhook','/api/paypal/admin/health','/api/paypal/admin/plans/bootstrap','/api/paypal/admin/subscriptions','/api/paypal/admin/events','/api/paypal/admin/reconcile','/api/paypal/admin/activation']);";
const newRoutes = "const exactRoutes=new Set(['/api/paypal/config','/api/paypal/checkout-intent','/api/paypal/subscription/confirm','/api/paypal/subscription','/api/paypal/subscription/cancel','/api/paypal/donation/config','/api/paypal/donation/order','/api/paypal/donation/capture','/api/paypal/webhook','/api/paypal/admin/health','/api/paypal/admin/plans/bootstrap','/api/paypal/admin/subscriptions','/api/paypal/admin/events','/api/paypal/admin/reconcile','/api/paypal/admin/activation']);";
if (!source.includes(newRoutes)) {
  if (!source.includes(oldRoutes)) throw new Error('PayPal route registry patch target not found');
  source = source.replace(oldRoutes, newRoutes);
  changed = true;
}

const activationMarker = "async function activationState(env){const target=environment(env);const setting=await runtimeSetting(env,target);const environmentSwitch=target==='live'?bool(env?.PAYPAL_PRODUCTION_ENABLED):bool(env?.PAYPAL_SANDBOX_ENABLED);const confirmation=target!=='live'||String(env?.PAYPAL_LIVE_ACTIVATION_CONFIRMATION||'')==='MATRIX_PAYPAL_LIVE_CONFIRMED';const planRows=await plans(env,target);return{environment:target,configured:configured(env),environmentSwitch,databaseSwitch:Boolean(setting.checkout_enabled),confirmation,plansReady:planRows.length===3&&planRows.every(row=>String(row.status).toUpperCase()==='ACTIVE'),checkoutEnabled:configured(env)&&environmentSwitch&&Boolean(setting.checkout_enabled)&&confirmation&&planRows.length===3,setting,plans:planRows}}";
const donationFunctions = `
function donationAmount(value){const parsed=Number(String(value??'').replace(',','.'));if(!Number.isFinite(parsed)||parsed<1||parsed>5000)return null;return parsed.toFixed(2)}
async function donationState(env){const target=environment(env);const environmentSwitch=target==='live'?bool(env?.PAYPAL_PRODUCTION_ENABLED):bool(env?.PAYPAL_SANDBOX_ENABLED);const confirmation=target!=='live'||String(env?.PAYPAL_LIVE_ACTIVATION_CONFIRMATION||'')==='MATRIX_PAYPAL_LIVE_CONFIRMED';const enabled=bool(env?.PAYPAL_DONATIONS_ENABLED)&&configured(env)&&environmentSwitch&&confirmation;return{environment:target,configured:configured(env),environmentSwitch,confirmation,donationsSwitch:bool(env?.PAYPAL_DONATIONS_ENABLED),enabled,liveChargingEnabled:target==='live'&&enabled,minAmount:'1.00',maxAmount:'5000.00',currency:'EUR'}}
async function donationConfig(request,env){const state=await donationState(env);return json({ok:true,...state,publicEvidenceFree:true,requiresMemberLogin:true,legalBoundary:'This is a voluntary support payment, not a charitable or tax-deductible donation. It does not buy stronger evidence, alter conclusions or restrict the public evidence routes.'})}
async function createDonationOrder(request,env){const required=await requireAuth(request,env);if(required.response)return required.response;const state=await donationState(env);if(!state.enabled)return json({ok:false,error:'Voluntary PayPal support is disabled until the configured sandbox or live safety gates pass',environment:state.environment,liveChargingEnabled:false},503);const input=await body(request);const amount=donationAmount(input.amount);if(!amount)return json({ok:false,error:'Choose a donation amount between €1.00 and €5,000.00'},400);const productKey=clean(input.productKey||'matrix-reprogrammed-support',80).replace(/[^a-z0-9_-]/gi,'-');const label=clean(input.label||'Matrix Reprogrammed public-record research',120);const customId=clean(\`${'${required.auth.member.id}'}:${'${productKey}'}\`,127);const origin=new URL(request.url).origin;const result=await paypal(env,'/v2/checkout/orders',{method:'POST',requestId:id('donation-order'),body:JSON.stringify({intent:'CAPTURE',purchase_units:[{reference_id:productKey,custom_id:customId,description:label,amount:{currency_code:'EUR',value:amount}}],application_context:{brand_name:'Matrix Reprogrammed',landing_page:'NO_PREFERENCE',user_action:'PAY_NOW',return_url:\`${'${origin}'}/store.html?donation=approved\`,cancel_url:\`${'${origin}'}/store.html?donation=cancelled\`}})});const order=result.payload||{};const approveUrl=(order.links||[]).find(link=>link.rel==='approve')?.href||'';if(!order.id||!approveUrl)throw new Error('PayPal did not return an approval link');await audit(env,required.auth.member.id,'paypal.donation.order_created','paypal_order',order.id,{amount,currency:'EUR',productKey,label,environment:state.environment});return json({ok:true,orderId:order.id,approveUrl,amount,currency:'EUR',environment:state.environment,liveChargingEnabled:state.liveChargingEnabled})}
async function captureDonationOrder(request,env){const required=await requireAuth(request,env);if(required.response)return required.response;const state=await donationState(env);if(!state.enabled)return json({ok:false,error:'Voluntary PayPal support is disabled until the configured sandbox or live safety gates pass',environment:state.environment,liveChargingEnabled:false},503);const input=await body(request);const orderId=clean(input.orderId,140);if(!/^[A-Z0-9-]{8,140}$/i.test(orderId))return json({ok:false,error:'A valid PayPal order ID is required'},400);const result=await paypal(env,\`/v2/checkout/orders/${'${encodeURIComponent(orderId)}'}/capture\`,{method:'POST',requestId:\`matrix-donation-capture-${'${orderId}'}\`});const payload=result.payload||{};const unit=payload.purchase_units?.[0]||{};const capture=unit.payments?.captures?.[0]||{};const customId=clean(unit.custom_id,127);if(!customId.startsWith(\`${'${required.auth.member.id}'}:\`))return json({ok:false,error:'PayPal support order does not belong to this member'},409);const amount=donationAmount(capture.amount?.value||unit.amount?.value);const currency=clean(capture.amount?.currency_code||unit.amount?.currency_code||'',10).toUpperCase();if(payload.status!=='COMPLETED'||capture.status!=='COMPLETED'||!amount||currency!=='EUR')return json({ok:false,error:'PayPal support payment is not complete or has an invalid amount'},409);const paymentId=clean(capture.id||orderId,160);const eventId=\`donation:${'${orderId}'}\`;const current=now();await env.MEMBERS_DB.prepare('INSERT OR IGNORE INTO paypal_payment_records (id,subscription_id,provider_subscription_id,provider_payment_id,provider_event_id,payment_type,status,gross_amount,refund_amount,currency_code,paid_at,refunded_at,reversed_at,raw_resource_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id('payment'),null,null,paymentId,eventId,'donation','COMPLETED',amount,null,'EUR',clean(capture.create_time||current,100),null,null,safePayload(payload),current,current).run();await audit(env,required.auth.member.id,'paypal.donation.captured','paypal_payment',paymentId,{orderId,amount,currency:'EUR',productKey:clean(unit.reference_id,80),environment:state.environment});return json({ok:true,completed:true,orderId,paymentId,amount,currency:'EUR',environment:state.environment,liveChargingEnabled:state.liveChargingEnabled,message:'Thank you for supporting the public-record research archive.'})}
`;
if (!source.includes('async function donationConfig(request,env)')) {
  if (!source.includes(activationMarker)) throw new Error('PayPal activation-state insertion target not found');
  source = source.replace(activationMarker, `${activationMarker}${donationFunctions}`);
  changed = true;
} else {
  const replacements = [
    ['parsed>500', 'parsed>5000'],
    ["maxAmount:'500.00'", "maxAmount:'5000.00'"],
    ['€500.00', '€5,000.00']
  ];
  for (const [from, to] of replacements) {
    if (source.includes(from)) { source = source.replaceAll(from, to); changed = true; }
  }
}

const oldRouteHandler = "async function route(request,env){if(!hasD1(env))return json({ok:false,error:'Membership database unavailable'},503);const path=new URL(request.url).pathname.replace(/\\/+$/,'')||'/';if(path==='/api/paypal/config'&&request.method==='GET')return config(request,env);if(path==='/api/paypal/checkout-intent'&&request.method==='POST')return checkoutIntent(request,env);if(path==='/api/paypal/subscription/confirm'&&request.method==='POST')return confirm(request,env);if(path==='/api/paypal/subscription'&&request.method==='GET')return currentStatus(request,env);if(path==='/api/paypal/subscription/cancel'&&request.method==='POST')return cancel(request,env);if(path==='/api/paypal/webhook'&&request.method==='POST')return webhook(request,env);";
const newRouteHandler = "async function route(request,env){if(!hasD1(env))return json({ok:false,error:'Membership database unavailable'},503);const path=new URL(request.url).pathname.replace(/\\/+$/,'')||'/';if(path==='/api/paypal/config'&&request.method==='GET')return config(request,env);if(path==='/api/paypal/checkout-intent'&&request.method==='POST')return checkoutIntent(request,env);if(path==='/api/paypal/subscription/confirm'&&request.method==='POST')return confirm(request,env);if(path==='/api/paypal/subscription'&&request.method==='GET')return currentStatus(request,env);if(path==='/api/paypal/subscription/cancel'&&request.method==='POST')return cancel(request,env);if(path==='/api/paypal/donation/config'&&request.method==='GET')return donationConfig(request,env);if(path==='/api/paypal/donation/order'&&request.method==='POST')return createDonationOrder(request,env);if(path==='/api/paypal/donation/capture'&&request.method==='POST')return captureDonationOrder(request,env);if(path==='/api/paypal/webhook'&&request.method==='POST')return webhook(request,env);";
if (!source.includes(newRouteHandler)) {
  if (!source.includes(oldRouteHandler)) throw new Error('PayPal route handler patch target not found');
  source = source.replace(oldRouteHandler, newRouteHandler);
  changed = true;
}

for (const marker of [
  '/api/paypal/donation/config',
  'function donationAmount(value)',
  'parsed>5000',
  "maxAmount:'5000.00'",
  'PAYPAL_DONATIONS_ENABLED',
  'not a charitable or tax-deductible donation',
  "payment_type,status,gross_amount",
  "paypal.donation.captured"
]) if (!source.includes(marker)) throw new Error(`Voluntary support worker marker missing: ${marker}`);

if (changed) fs.writeFileSync(workerPath, source);
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  changed,
  routes: ['/api/paypal/donation/config','/api/paypal/donation/order','/api/paypal/donation/capture'],
  amount: { currency: 'EUR', minimum: '1.00', maximum: '5000.00', userChosen: true },
  requiresMemberLogin: true,
  evidenceAccessRemainsFree: true,
  legalBoundary: 'Voluntary support payment; not charitable or tax-deductible; no influence over evidence or conclusions.',
  activationBoundary: 'Sandbox or fully confirmed live PayPal environment plus PAYPAL_DONATIONS_ENABLED.'
}, null, 2)}\n`);
console.log(`PayPal voluntary support flow ${changed ? 'installed' : 'already current'}.`);
