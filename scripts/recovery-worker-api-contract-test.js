const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const { pathToFileURL } = require('url');

const root = process.cwd();
const at = relative => path.join(root, relative);
const failures = [];
const checks = {};
const need = (condition, message) => { if (!condition) failures.push(message); };
const read = relative => fs.existsSync(at(relative)) ? fs.readFileSync(at(relative), 'utf8') : '';

const hardening = spawnSync(process.execPath, [at('scripts/harden-worker-api-contracts.js')], {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 20 * 1024 * 1024
});
if (hardening.stdout) process.stdout.write(hardening.stdout);
if (hardening.stderr) process.stderr.write(hardening.stderr);
need(hardening.status === 0, `Worker/API hardening failed with status ${hardening.status}`);

for (const relative of [
  'src/worker-production.js',
  'src/worker.js',
  'src/worker-member-experience.js',
  'src/worker-forum-persistence.js',
  'src/worker-paypal-subscriptions.js',
  'src/worker-email-lifecycle.js',
  'src/worker-access-gate.js',
  'scripts/templates/membership-auth/membership.template',
  'membership.html',
  'migrations/0001_membership_foundation.sql',
  'migrations/phase5_member_experience.sql',
  'migrations/phase6_paypal_subscriptions.sql',
  'wrangler.jsonc'
]) need(fs.existsSync(at(relative)), `Missing API contract file: ${relative}`);

const production = read('src/worker-production.js');
const legacy = read('src/worker.js');
const member = read('src/worker-member-experience.js');
const forum = read('src/worker-forum-persistence.js');
const paypal = read('src/worker-paypal-subscriptions.js');
const email = read('src/worker-email-lifecycle.js');
const access = read('src/worker-access-gate.js');
const template = read('scripts/templates/membership-auth/membership.template');
const membership = read('membership.html');
const foundation = read('migrations/0001_membership_foundation.sql');
const experience = read('migrations/phase5_member_experience.sql');
const paypalMigration = read('migrations/phase6_paypal_subscriptions.sql');
const wrangler = read('wrangler.jsonc');

checks.authRouteOwnership = production.includes('const authRoutes = new Set([')
  && ['/api/auth/request-link','/api/auth/verify','/api/auth/logout','/api/auth/health'].every(route => production.includes(`'${route}'`))
  && production.includes('if (authRoutes.has(path))')
  && production.includes('validateAuthResponse');
need(checks.authRouteOwnership, 'Passwordless authentication routes are not explicitly owned by the production Worker');

const authBoundary = production.indexOf('if (authRoutes.has(path))');
const memberBoundary = production.indexOf('if (isMemberExperienceRoute(path))');
const forumBoundary = production.indexOf('if (!forumRoutes.has(path))');
checks.routeOrder = authBoundary >= 0 && memberBoundary > authBoundary && forumBoundary > memberBoundary;
need(checks.routeOrder, 'Production route order does not place auth and member handling before forum fallback');

checks.authOrigin = (legacy.match(/X-Matrix-Origin':'cloudflare-worker-api/g) || []).length >= 2
  && production.includes("origin !== 'cloudflare-worker-api'");
need(checks.authOrigin, 'Authentication redirects or responses are not protected by origin validation');

checks.sessionSecurity = legacy.includes('HttpOnly; Secure; SameSite=Lax')
  && legacy.includes('UPDATE magic_links SET used_at=?')
  && legacy.includes('expires in 15 minutes')
  && member.includes('revoked_at IS NULL')
  && member.includes('expires_at>?');
need(checks.sessionSecurity, 'Passwordless session expiry, single-use or secure-cookie controls are incomplete');

checks.memberEntitlements = member.includes('supporter_3:2')
  && member.includes('intelligence_6:3')
  && member.includes('research_pro_9:4')
  && experience.includes('CREATE VIEW member_effective_entitlements')
  && experience.includes("WHEN 4 THEN 'research_pro_9'")
  && experience.includes("WHEN 1 THEN 'registered'");
need(checks.memberEntitlements, 'Member entitlement ranks or effective entitlement view are incomplete');

checks.forumPersistence = forum.includes("import { memberSessionContext } from './worker-member-experience.js';")
  && forum.includes("error: 'A verified free member account is required to post.'")
  && forum.includes("'forum.post.created'")
  && forum.includes("member_id TEXT NOT NULL DEFAULT ''")
  && forum.includes("postingAccess: 'verified-free-member-session'");
need(checks.forumPersistence, 'Forum posting is not fully tied to a verified D1 member session and audit trail');

checks.paypalFailClosed = paypal.includes('const plansReady=')
  && paypal.includes('&&confirmation&&plansReady,setting,plans:planRows')
  && paypal.includes("error:'PayPal checkout is disabled until activation gates pass'")
  && wrangler.includes('"PAYPAL_ENVIRONMENT": "sandbox"')
  && wrangler.includes('"PAYPAL_PRODUCTION_ENABLED": "false"');
need(checks.paypalFailClosed, 'PayPal checkout does not require all activation gates or production is not explicitly disabled');

checks.membershipClientContract = template.includes('data.verification && data.verification.sent')
  && template.includes('if (!config.checkoutEnabled)')
  && template.indexOf('if (!config.checkoutEnabled)') < template.indexOf('await loadSdk(config.clientId)')
  && membership.includes('data.verification && data.verification.sent')
  && membership.includes('if (!config.checkoutEnabled)');
need(checks.membershipClientContract, 'Membership UI does not match the authoritative signup response or PayPal activation contract');

checks.emailFailClosed = email.includes('function providerConfigured(env){return Boolean(env?.BREVO_API_KEY&&env?.MEMBERS_FROM_EMAIL)}')
  && email.includes("if(!env?.EMAIL_WEBHOOK_SECRET||!secureEqual(secret,env.EMAIL_WEBHOOK_SECRET))")
  && email.includes('Explicit email consent is required')
  && email.toLowerCase().includes('verification delivery is queued and will retry');
need(checks.emailFailClosed, 'Email lifecycle does not fail closed on provider, webhook or consent boundaries');

checks.protectedAccess = access.includes("'/downloads/timer-synthesis.md', 'supporter_3'")
  && access.includes("'/downloads/probability-snapshot.md', 'intelligence_6'")
  && access.includes('Membership storage is unavailable. Protected content remains closed.')
  && access.includes('This resource is not included in the current membership tier.');
need(checks.protectedAccess, 'Protected asset tier rules or fail-closed responses are incomplete');

checks.schemaFoundation = ['members','magic_links','member_sessions','subscriptions','audit_log'].every(table => foundation.includes(`CREATE TABLE IF NOT EXISTS ${table}`))
  && ['paypal_runtime_settings','paypal_plans','paypal_subscription_transitions'].every(table => paypalMigration.includes(table));
need(checks.schemaFoundation, 'D1 membership or PayPal migration foundation is incomplete');

// Execute the actual production Worker in a temporary ESM package with no D1,
// provider secrets or payment credentials. Every protected subsystem must fail closed,
// while ordinary static assets must still be delegated to ASSETS.
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-worker-contract-'));
const tempSrc = path.join(tempRoot, 'src');
fs.mkdirSync(tempSrc, { recursive: true });
for (const entry of fs.readdirSync(at('src'), { withFileTypes: true })) {
  if (entry.isFile() && entry.name.endsWith('.js')) fs.copyFileSync(at(`src/${entry.name}`), path.join(tempSrc, entry.name));
}
fs.writeFileSync(path.join(tempRoot, 'package.json'), JSON.stringify({ type: 'module' }));
const runtimeScript = `
import production from ${JSON.stringify(pathToFileURL(path.join(tempSrc, 'worker-production.js')).href)};
import { protectedAssetTier, enforceProtectedAssetAccess } from ${JSON.stringify(pathToFileURL(path.join(tempSrc, 'worker-access-gate.js')).href)};
const assert=(condition,message)=>{if(!condition)throw new Error(message)};
const call=async(pathname,env={},method='GET')=>production.fetch(new Request('https://matrixreprogrammed.com'+pathname,{method}),env,{waitUntil(){}});
for(const pathname of ['/api/auth/health','/api/member/me','/forum-health','/api/paypal/checkout-intent','/api/email/admin/health']){
  const response=await call(pathname,{},pathname.includes('checkout-intent')?'POST':'GET');
  assert(response.status===503,pathname+' must return 503 without MEMBERS_DB');
  assert(response.headers.get('x-matrix-origin')==='cloudflare-worker-production-boundary',pathname+' must be blocked by production boundary');
}
const protectedResponse=await call('/downloads/timer-synthesis.md',{ASSETS:{fetch:async()=>new Response('should not open')}});
assert(protectedResponse.status===503,'Protected asset must remain closed without D1');
assert(protectedAssetTier('/downloads/timer-synthesis.md')==='supporter_3','Supporter asset mapping failed');
assert(protectedAssetTier('/downloads/probability-snapshot.md')==='intelligence_6','Intelligence asset mapping failed');
assert(protectedAssetTier('/downloads/research-bundle.zip')==='research_pro_9','Research asset mapping failed');
const direct=await enforceProtectedAssetAccess(new Request('https://matrixreprogrammed.com/downloads/the-black-file-matrix-reprogrammed.pdf'),{});
assert(direct.status===503,'Direct access gate must fail closed without D1');
const staticResponse=await call('/index.html',{ASSETS:{fetch:async()=>new Response('<!doctype html><title>ok</title>',{status:200,headers:{'content-type':'text/html'}})}});
assert(staticResponse.status===200,'Static assets must remain available through ASSETS');
console.log('runtime-boundaries-ok');
`;
const runtime = spawnSync(process.execPath, ['--input-type=module', '-e', runtimeScript], {
  cwd: tempRoot,
  encoding: 'utf8',
  maxBuffer: 20 * 1024 * 1024
});
fs.rmSync(tempRoot, { recursive: true, force: true });
if (runtime.stdout) process.stdout.write(runtime.stdout);
if (runtime.stderr) process.stderr.write(runtime.stderr);
checks.runtimeBoundaries = runtime.status === 0;
need(checks.runtimeBoundaries, `Executable Worker boundary test failed with status ${runtime.status}`);

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  checks,
  failures,
  externalActions: {
    emailSent: false,
    paypalCalled: false,
    productionDeployed: false
  },
  boundary: 'This test executes local Worker code only. It uses no live credentials, sends no email, calls no PayPal endpoint and deploys nothing.'
};
fs.mkdirSync(at('downloads'), { recursive: true });
fs.writeFileSync(at('downloads/recovery-worker-api-contract-test.json'), JSON.stringify(report, null, 2));
if (failures.length) {
  console.error('RECOVERY WORKER/API CONTRACT TEST FAILED');
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('RECOVERY WORKER/API CONTRACT TEST PASSED: auth, D1, forum, protected access, email and PayPal remain authoritative and fail closed.');
