const fs = require('fs');
const path = require('path');

const root = process.cwd();
const target = path.join(root, 'src', 'worker-paypal-subscriptions.js');

const duplicateFirst = "async function checkoutIntent(request,env){const required=await requireAuth(request,env);if(required.response)return required.response;const currentSubscription=await currentSubscriptionForMember(env,required.auth.member.id);if(currentSubscription&&bool(currentSubscription.paid_access))return json({ok:false,error:'An active PayPal membership already exists. Use the billing dashboard to manage or cancel it before starting another subscription.',currentSubscription,billingUrl:'/billing-dashboard.html'},409);const state=await activationState(env);if(!state.checkoutEnabled)return json({ok:false,configured:state.configured,environment:state.environment,error:'PayPal checkout is disabled until activation gates pass'},503);";
const shutdownFirst = "async function checkoutIntent(request,env){const required=await requireAuth(request,env);if(required.response)return required.response;const state=await activationState(env);if(!state.checkoutEnabled)return json({ok:false,configured:state.configured,environment:state.environment,error:'PayPal checkout is disabled until activation gates pass'},503);const currentSubscription=await currentSubscriptionForMember(env,required.auth.member.id);if(currentSubscription&&bool(currentSubscription.paid_access))return json({ok:false,error:'An active PayPal membership already exists. Use the billing dashboard to manage or cancel it before starting another subscription.',currentSubscription,billingUrl:'/billing-dashboard.html'},409);";

function repairPayPalCheckoutGateOrder(source) {
  if (source.includes(shutdownFirst)) return source;
  if (!source.includes(duplicateFirst)) {
    throw new Error('PayPal checkout gate-order repair could not find the duplicate-subscription guard');
  }
  return source.replace(duplicateFirst, shutdownFirst);
}

if (require.main === module) {
  if (!fs.existsSync(target)) throw new Error(`PayPal Worker missing: ${target}`);
  const before = fs.readFileSync(target, 'utf8');
  const after = repairPayPalCheckoutGateOrder(before);
  if (after !== before) fs.writeFileSync(target, after);
  const disabledIndex = after.indexOf("if(!state.checkoutEnabled)return json(");
  const duplicateIndex = after.indexOf("if(currentSubscription&&bool(currentSubscription.paid_access))");
  if (disabledIndex < 0 || duplicateIndex < 0 || disabledIndex > duplicateIndex) {
    throw new Error('PayPal checkout gate order is not fail-closed');
  }
  console.log(`PayPal checkout gate order ${after === before ? 'already current' : 'repaired'}: Cloudflare activation shutdown precedes duplicate-subscription handling.`);
}

module.exports = { repairPayPalCheckoutGateOrder, duplicateFirst, shutdownFirst };
