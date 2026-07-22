import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const checks = [];

function check(name, condition, detail) {
  checks.push({ name, ok: Boolean(condition), detail });
}

const wrangler = read('wrangler.toml');
const production = read('src/worker-production.js');
const auth = read('src/worker.js');
const member = read('src/worker-member-experience.js');
const paypal = read('src/worker-paypal-subscriptions.js');
const paypalMigration = read('migrations/phase6_paypal_subscriptions.sql');
const gate = read('src/worker-access-gate.js');
const email = read('src/worker-email-lifecycle.js');
const membership = read('membership.html');
const membershipTemplate = read('scripts/templates/membership-auth/membership.template');
const login = read('member-login.html');
const dashboardHtml = read('member-dashboard.html');
const dashboardApp = read('member-dashboard-app.js');
const billingDashboard = read('billing-dashboard.js');
const emailStatus = read('email-status.html');
const cloudflareBuild = read('scripts/build-cloudflare-output.js');

check('Cloudflare production worker is authoritative', wrangler.includes('main = "src/worker-production.js"'), 'wrangler.toml must deploy src/worker-production.js');
check('Cloudflare Assets are authoritative', wrangler.includes('[assets]') && wrangler.includes('directory = "./_site"') && wrangler.includes('binding = "ASSETS"'), 'Cloudflare Assets must serve _site');
check('Cloudflare D1 membership database is bound', wrangler.includes('binding = "MEMBERS_DB"') && wrangler.includes('database_name = "matrix-members"'), 'MEMBERS_DB must remain the membership authority');
check('Worker runs before assets', wrangler.includes('run_worker_first = true'), 'Authenticated and protected routes must reach the Worker before static assets');
check('Production router dispatches email lifecycle', production.includes('emailRoutes.has(path)') && production.includes('validateEmailResponse'), 'Newsletter, welcome and campaign routes must use worker-email-lifecycle.js');
check('Production router dispatches PayPal lifecycle', production.includes('isPayPalRoute(path)') && production.includes('validatePayPalResponse'), 'PayPal routes must use worker-paypal-subscriptions.js');
check('Production router dispatches member experience', production.includes('isMemberExperienceRoute(path)') && production.includes('validateMemberResponse'), 'Dashboard routes must use worker-member-experience.js');
check('Production router protects member assets', production.includes('protectedAssetTier(path)') && production.includes('enforceProtectedAssetAccess'), 'Protected downloads must be checked before static delivery');
check('Cloudflare Worker canonicalizes www to apex', production.includes("requestUrl.hostname.toLowerCase() === 'www.matrixreprogrammed.com'") && production.includes("requestUrl.hostname = 'matrixreprogrammed.com'") && production.includes('Response.redirect(requestUrl.toString(), 308)'), 'Every member and API request must reach the same host-only cookie origin with a method-preserving redirect');

check('Login writes current secure session cookie', auth.includes("matrix_session_v2='+encodeURIComponent(token)") && auth.includes('HttpOnly; Secure; SameSite=Lax'), 'Passwordless login must issue the current secure cookie');
check('Logout clears current and legacy cookies', auth.includes('matrix_session_v2=;') && auth.includes('matrix_session=;'), 'Logout must clear both cookie generations');
check('Member dashboard accepts current and legacy cookies', member.includes("cookieValue(request,'matrix_session_v2')||cookieValue(request,'matrix_session')"), 'Member APIs must accept current sessions and a temporary legacy fallback');
check('PayPal accepts current and legacy cookies', paypal.includes('values.matrix_session_v2||values.matrix_session'), 'A logged-in member must remain authenticated when loading or creating a subscription');
check('Protected assets accept current and legacy cookies', gate.includes("cookieValue(request, 'matrix_session_v2') || cookieValue(request, 'matrix_session')"), 'Logged-in members must not be denied protected downloads because of cookie-version drift');

check('PayPal subscription view exposes compatibility fields', paypalMigration.includes('s.status AS provider_status') && paypalMigration.includes('p.updated_at AS state_updated_at'), 'The duplicate guard needs both provider status and modern state timestamps');
check('Duplicate active PayPal subscriptions are blocked', paypal.includes('currentSubscriptionForMember') && paypal.includes('An active PayPal membership already exists') && paypal.includes('bool(currentSubscription.paid_access)') && paypal.includes("billingUrl:'/billing-dashboard.html'"), 'An active entitlement must block allocation of another checkout intent');
check('Legacy active PayPal subscriptions are blocked', paypal.includes("LOWER(provider_status) IN ('active','trialing')") && paypal.includes("datetime(current_period_end)>datetime('now')") && paypal.includes('AS paid_access'), 'Older active subscriptions without a PayPal state row must still prevent duplicate billing');
check('PayPal config exposes compatible billing state', paypal.includes('currentSubscription:currentSubscription||null') && paypal.includes('paidAccess:bool(currentSubscription?.paid_access)'), 'The membership page must recognise modern and legacy paid access');
check('Active membership UI routes to billing', membership.includes("billingLink.textContent = 'Manage billing'") && membership.includes('Paid access is already active'), 'An active member should see billing management instead of another subscription button');
check('Billing dashboard requests include credentials', billingDashboard.includes("fetch(path,{cache:'no-store',credentials:'include'"), 'Billing status and cancellation must carry the active Cloudflare session');

check('Membership signup sends canonical consent', membershipTemplate.includes('consent:marketingConsent,marketingConsent'), 'The membership form must send the same explicit consent contract the email worker validates');
check('Email lifecycle accepts compatible consent alias', email.includes('input.consent??input.marketingConsent'), 'Existing clients using marketingConsent must remain compatible');
check('Newsletter consent remains explicit', membership.includes('id="member-consent"') && membership.includes('name="marketingConsent"') && membership.includes('type="checkbox" required') && email.includes('Explicit email consent is required'), 'No marketing subscription may be activated without a required checkbox and server-side explicit-consent validation');
check('Membership requests include credentials', membership.includes("credentials:'include'") && membership.includes('/api/paypal/config'), 'Same-origin member cookies must be sent on PayPal and signup requests');
check('Dashboard requests include credentials', dashboardApp.includes("fetch(path,{cache:'no-store',credentials:'include'") && dashboardApp.includes("/api/auth/logout',{method:'POST',credentials:'include'"), 'Dashboard reads, writes and logout must retain the active session');
check('Free dashboard avoids paid watchlist request', dashboardApp.includes("capabilities.includes('member_watchlists')") && dashboardApp.includes('if(canWatch)tasks.push(loadWatchlists())'), 'A registered member must not be redirected to access denied while the dashboard loads');
check('Dashboard exposes tier-aware membership management', dashboardHtml.includes('id="membership-action"') && dashboardApp.includes("membershipAction.href=paid?'billing-dashboard.html':'membership.html'"), 'Free members need an upgrade route and paid members need a billing route');
check('Verified subscriber has recovery routes', emailStatus.includes('Manage email preferences') && emailStatus.includes('Open member login'), 'Verification success must offer both preference management and secure member access');
check('Login uses canonical Cloudflare origin', login.includes("const MEMBER_CANONICAL_ORIGIN = 'https://matrixreprogrammed.com'") && login.includes("fetch('/api/auth/request-link'"), 'The login page must stay on the canonical Worker origin');

check('Welcome email uses D1 outbox', email.includes("messageKind:'welcome'") && email.includes('processOutbox(env,{memberId:member.id,limit:5})'), 'Welcome delivery must be recorded and processed through the authoritative outbox');
check('First daily brief uses detailed intelligence builder', email.includes('const firstBrief=await sendDetailedFirstDailyBrief(request,env,member);') && !email.includes('const firstBrief=await sendFirstDailyBrief(request,env,member);') && email.includes('email.daily.detailed_first_brief_fallback'), 'Selected daily subscribers should get the detailed brief with a safe fallback, and the legacy executable call must be absent');
check('Daily and weekly Cloudflare cron paths exist', wrangler.includes('"5 6 * * *"') && wrangler.includes('"15 7 * * 1"') && email.includes("event?.cron==='15 7 * * 1'"), 'Cloudflare scheduled events must drive daily and weekly automation');
check('Brevo lifecycle is fail-closed', email.includes('BREVO_API_KEY') && email.includes('BREVO_DOMAIN_AUTHENTICATED') && email.includes('Transactional email delivery is disabled'), 'Provider configuration and sender-domain readiness must be verified before delivery success');
check('Email retries and suppression are persistent', email.includes("status IN ('pending','retry')") && email.includes('email_suppressions') && email.includes('email_webhook_receipts'), 'Retries, unsubscribes, bounces and webhook events must remain in D1');

check('Cloudflare output excludes Netlify runtime files', cloudflareBuild.includes("blockedDirs = new Set(['.git','.github','node_modules','scripts','netlify'") && cloudflareBuild.includes("blockedFiles = new Set(['_redirects'") && cloudflareBuild.includes('_site/_redirects must not be deployed'), 'Legacy Netlify compatibility files must not enter the Cloudflare asset bundle');
check('Cloudflare build applies membership repair before copying assets', cloudflareBuild.indexOf("require('./patch-membership-auth-ui.js')") > -1 && cloudflareBuild.indexOf("require('./patch-membership-auth-ui.js')") < cloudflareBuild.indexOf('rm(out);'), 'The final member contract must be repaired before _site is rebuilt');

const failed = checks.filter(item => !item.ok);
const report = {
  ok: failed.length === 0,
  platform: 'Cloudflare Worker + D1 + Cloudflare Assets',
  generatedAt: new Date().toISOString(),
  checks,
  failed: failed.map(item => item.name)
};

fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'cloudflare-member-experience-test.json'), JSON.stringify(report, null, 2));

if (failed.length) {
  console.error(`Cloudflare member experience test failed (${failed.length}):`);
  for (const item of failed) console.error(`- ${item.name}: ${item.detail}`);
  process.exit(1);
}

console.log(`Cloudflare member experience test passed: ${checks.length} contracts verified.`);
