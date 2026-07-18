const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

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
  if (!changed.includes(relative)) changed.push(relative);
  return true;
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`${label} anchor is missing`);
  return source.replace(before, after);
}

function runRequired(relative, label) {
  const script = at(relative);
  if (!fs.existsSync(script)) throw new Error(`${label} script is missing: ${relative}`);
  const result = spawnSync(process.execPath, [script], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 30 * 1024 * 1024
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) throw new Error(`${label} failed with status ${result.status}`);
}

// Paid checkout must require credentials, the environment switch, the D1 switch,
// live confirmation when applicable, three ACTIVE provider plans and every stronger
// commercial/contract-confirmation gate installed by the canonical PayPal patch.
// Late recovery generators may restore an older Worker, so this hardener reapplies
// the complete commercial patch instead of accepting a legacy activation marker.
{
  const relative = 'src/worker-paypal-subscriptions.js';
  let source = read(relative);
  const beforeCommercialRepair = source;
  const commercialMarkers = [
    "import { queueMembershipContractConfirmation, transactionalMembershipEmailReady } from './worker-membership-contract-email.js';",
    "const commercialTermsVersion='2026-07-18-v1'",
    'commercialLegalReady:legalReady',
    'contractConfirmationReady:contractEmailReady',
    'paypal_checkout_consents',
    'paypal.checkout.consent_recorded',
    'paypal.membership_contract_confirmation',
    'PayPal checkout is disabled until every activation, commercial-readiness and contract-confirmation gate passes'
  ];
  if (!commercialMarkers.every(marker => source.includes(marker))) {
    runRequired('scripts/patch-commercial-paypal-guard.js', 'Canonical commercial PayPal guard');
    source = read(relative);
    if (source !== beforeCommercialRepair && !changed.includes(relative)) changed.push(relative);
  }

  const weakMultilinePlanCheck = "const plansReady=planRows.length===3&&planRows.every(row=>String(row.status).toUpperCase()==='ACTIVE');";
  const strongMultilinePlanCheck = "const plansReady=planRows.length===3&&planRows.every(row=>String(row.status).toUpperCase()==='ACTIVE'&&row.provider_plan_id&&row.provider_product_id);";
  if (source.includes(weakMultilinePlanCheck)) source = source.replace(weakMultilinePlanCheck, strongMultilinePlanCheck);

  const finalMarkers = [
    ...commercialMarkers,
    strongMultilinePlanCheck,
    '&&confirmation&&legalReady&&contractEmailReady&&plansReady'
  ];
  const missing = finalMarkers.filter(marker => !source.includes(marker));
  if (missing.length) throw new Error(`PayPal commercial hardening remains incomplete: ${missing.join(' | ')}`);
  write(relative, source);

  const syntax = spawnSync(process.execPath, ['--check', at(relative)], { cwd: root, encoding: 'utf8' });
  if (syntax.stdout) process.stdout.write(syntax.stdout);
  if (syntax.stderr) process.stderr.write(syntax.stderr);
  if (syntax.status !== 0) throw new Error(`Hardened PayPal Worker failed syntax validation with status ${syntax.status}`);
}

// The canonical recovery membership template must understand the authoritative
// email lifecycle response and must not render PayPal while checkoutEnabled=false.
// The same repaired template is authoritative for the source page and any existing
// Cloudflare output so a late legacy generator cannot leave placeholder pricing or
// client behaviour behind immediately before deployment.
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
  write('membership.html', source);
  if (fs.existsSync(at('_site/membership.html'))) write('_site/membership.html', source);
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
    paypal: 'late recovery paths reapply the complete commercial guard; checkout requires legal readiness, durable confirmation, credentials, environment switch, D1 switch, confirmation and three identified ACTIVE plans',
    membershipSource: 'the repaired template is synchronized into source and existing Cloudflare output before contract verification',
    externalActions: 'no email delivery or PayPal request is performed by this hardening script'
  }
};
fs.mkdirSync(at('downloads'), { recursive: true });
fs.writeFileSync(at('downloads/worker-api-contract-hardening.json'), JSON.stringify(report, null, 2));
console.log(`Worker/API contracts hardened: ${changed.length ? changed.join(', ') : 'already current'}.`);
