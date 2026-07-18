const fs = require('fs');
const path = require('path');

const root = process.cwd();
const changed = [];
const at = relative => path.join(root, relative);

function read(relative) {
  const file = at(relative);
  if (!fs.existsSync(file)) throw new Error(`API contract hardening missing ${relative}`);
  return fs.readFileSync(file, 'utf8');
}

function write(relative, content) {
  const file = at(relative);
  const before = fs.readFileSync(file, 'utf8');
  if (before === content) return false;
  fs.writeFileSync(file, content);
  changed.push(relative);
  return true;
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`${label} anchor is missing`);
  return source.replace(before, after);
}

// Paid checkout must require credentials, the environment switch, the D1 switch,
// live confirmation when applicable, and three ACTIVE provider plans.
{
  const relative = 'src/worker-paypal-subscriptions.js';
  let source = read(relative);
  const pattern = /async function activationState\(env\)\{[^\n]*\}/;
  const replacement = "async function activationState(env){const target=environment(env);const setting=await runtimeSetting(env,target);const environmentSwitch=target==='live'?bool(env?.PAYPAL_PRODUCTION_ENABLED):bool(env?.PAYPAL_SANDBOX_ENABLED);const confirmation=target!=='live'||String(env?.PAYPAL_LIVE_ACTIVATION_CONFIRMATION||'')==='MATRIX_PAYPAL_LIVE_CONFIRMED';const planRows=await plans(env,target);const plansReady=planRows.length===3&&planRows.every(row=>String(row.status).toUpperCase()==='ACTIVE'&&row.provider_plan_id&&row.provider_product_id);return{environment:target,configured:configured(env),environmentSwitch,databaseSwitch:Boolean(setting.checkout_enabled),confirmation,plansReady,checkoutEnabled:configured(env)&&environmentSwitch&&Boolean(setting.checkout_enabled)&&confirmation&&plansReady,setting,plans:planRows}}";
  if (!source.includes('&&confirmation&&plansReady,setting,plans:planRows')) {
    if (!pattern.test(source)) throw new Error('PayPal activationState function is missing');
    source = source.replace(pattern, replacement);
  }
  write(relative, source);
}

// The canonical recovery membership template must understand the authoritative
// email lifecycle response and must not render PayPal while checkoutEnabled=false.
{
  const relative = 'scripts/templates/membership-auth/membership.template';
  let source = read(relative);
  source = replaceRequired(
    source,
    "      signupStatus.className = 'status ok';\n      signupStatus.textContent = data.emailSent ? 'Check your email for your verification link.' : 'Your account was saved, but the verification email could not be sent. Please try again later.';\n      if (data.emailSent) signupForm.reset();",
    "      const emailSent = Boolean(data.emailSent || (data.verification && data.verification.sent));\n      signupStatus.className = emailSent ? 'status ok' : 'status pending';\n      signupStatus.textContent = emailSent ? 'Check your email for your verification link.' : 'Your account was saved. Verification delivery is queued and will retry when email delivery is available.';\n      if (emailSent) signupForm.reset();",
    'membership email response compatibility'
  );
  source = replaceRequired(
    source,
    "      if (!response.ok || !config.configured || !config.clientId) {\n        systemStatus.className = 'status pending';\n        systemStatus.textContent = 'Paid memberships are being configured. Free Member access remains available.';\n        setAllPlanMessages('Coming soon. No payment can be taken yet.');\n        return;\n      }\n      await loadSdk(config.clientId);",
    "      if (!response.ok || !config.configured || !config.clientId) {\n        systemStatus.className = 'status pending';\n        systemStatus.textContent = 'Paid memberships are being configured. Free Member access remains available.';\n        setAllPlanMessages('Checkout is not configured. No payment can be taken.');\n        return;\n      }\n      if (!config.checkoutEnabled) {\n        systemStatus.className = 'status pending';\n        systemStatus.textContent = 'PayPal is installed but checkout remains disabled behind the server activation gates. No payment can be taken.';\n        setAllPlanMessages('Checkout disabled. Free Member access remains available.');\n        return;\n      }\n      await loadSdk(config.clientId);",
    'membership PayPal activation boundary'
  );
  write(relative, source);
}

// Authentication remains implemented by the mature legacy module for now, but
// production must own those routes explicitly and validate the response origin.
{
  const relative = 'src/worker.js';
  let source = read(relative);
  source = source.replace(
    "headers:{...securityHeaders,Location:authOrigin(request)+'/member-login.html?error='+encodeURIComponent(reason),'Cache-Control':'no-store'}",
    "headers:{...securityHeaders,Location:authOrigin(request)+'/member-login.html?error='+encodeURIComponent(reason),'Cache-Control':'no-store','X-Matrix-Origin':'cloudflare-worker-api'}"
  );
  source = source.replace(
    "headers:{...securityHeaders,Location:destination,'Set-Cookie':authSessionCookie(session.rawToken),'Cache-Control':'no-store'}",
    "headers:{...securityHeaders,Location:destination,'Set-Cookie':authSessionCookie(session.rawToken),'Cache-Control':'no-store','X-Matrix-Origin':'cloudflare-worker-api'}"
  );
  write(relative, source);
}

{
  const relative = 'src/worker-production.js';
  let source = read(relative);
  if (!source.includes('const authRoutes = new Set([')) {
    const anchor = 'const jsonHeaders = {';
    if (!source.includes(anchor)) throw new Error('Production Worker JSON headers anchor is missing');
    const authRoutes = `const authRoutes = new Set([\n  '/api/auth/request-link',\n  '/api/auth/verify',\n  '/api/auth/logout',\n  '/api/auth/health'\n]);\n\n`;
    source = source.replace(anchor, authRoutes + anchor);
  }
  if (!source.includes('async function validateAuthResponse')) {
    const anchor = 'async function validatePayPalResponse(response) {';
    if (!source.includes(anchor)) throw new Error('Production Worker validation anchor is missing');
    const validator = `async function validateAuthResponse(response) {\n  const origin = response.headers.get('x-matrix-origin');\n  if (origin !== 'cloudflare-worker-api') {\n    return unavailable('non-authoritative-auth-response-blocked', \`Origin was \${origin || 'missing'}\`, 'member');\n  }\n  return response;\n}\n\n`;
    source = source.replace(anchor, validator + anchor);
  }
  if (!source.includes('if (authRoutes.has(path))')) {
    const anchor = '    if (isMemberExperienceRoute(path)) {';
    if (!source.includes(anchor)) throw new Error('Production Worker member route anchor is missing');
    const routeBlock = `    if (authRoutes.has(path)) {\n      if (!hasD1(env)) return unavailable('members-db-binding-unavailable', '', 'member');\n      try {\n        return validateAuthResponse(await forumWorker.fetch(request, d1OnlyForumEnv(env), ctx));\n      } catch (error) {\n        return unavailable('auth-worker-exception', error?.message || error, 'member');\n      }\n    }\n`;
    source = source.replace(anchor, routeBlock + anchor);
  }
  write(relative, source);
}

const report = {
  ok: true,
  generatedAt: new Date().toISOString(),
  changed,
  contracts: {
    passwordlessAuth: 'explicit production-owned route set with response-origin validation',
    freeSignup: 'supports verification.sent and queued delivery truthfully',
    paypal: 'checkout requires credentials, environment switch, D1 switch, confirmation and three ACTIVE plans',
    externalActions: 'no email delivery or PayPal request is performed by this hardening script'
  }
};
fs.mkdirSync(at('downloads'), { recursive: true });
fs.writeFileSync(at('downloads/worker-api-contract-hardening.json'), JSON.stringify(report, null, 2));
console.log(`Worker/API contracts hardened: ${changed.length ? changed.join(', ') : 'already current'}.`);
