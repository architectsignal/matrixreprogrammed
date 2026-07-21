const fs = require('fs');
const path = require('path');

const root = process.cwd();
const productionPath = path.join(root, 'src', 'worker-production.js');
const emailPath = path.join(root, 'src', 'worker-email-lifecycle.js');
const dashboardPath = path.join(root, 'member-dashboard.html');
const helperPath = path.join(root, 'scripts', 'intelligence-reporting-email-integration.txt');
const reportPath = path.join(root, 'downloads', 'intelligence-reporting-system-install.json');

for (const required of [productionPath, emailPath, helperPath, path.join(root, 'src', 'worker-intelligence-reports.js')]) {
  if (!fs.existsSync(required)) throw new Error(`Required reporting-system file missing: ${path.relative(root, required)}`);
}

function replaceOnce(source, from, to, label) {
  if (source.includes(to)) return source;
  if (!source.includes(from)) throw new Error(`${label} anchor not found`);
  return source.replace(from, to);
}

function patchProduction(source) {
  source = replaceOnce(
    source,
    "import emailWorker, { emailRoutes, processOutbox } from './worker-email-lifecycle.js';",
    "import emailWorker, { emailRoutes, processOutbox } from './worker-email-lifecycle.js';\nimport intelligenceReportWorker, { isIntelligenceReportRoute } from './worker-intelligence-reports.js';",
    'Production reporting import'
  );

  const validatorAnchor = `async function validateEmailResponse(response) {
  const origin = response.headers.get('x-matrix-origin');
  if (origin !== 'cloudflare-worker-email-lifecycle') {
    return unavailable('non-authoritative-email-response-blocked', \`Origin was \${origin || 'missing'}\`, 'email');
  }
  return response;
}`;
  const validator = `${validatorAnchor}

async function validateIntelligenceReportResponse(response) {
  const responseOrigin = response.headers.get('x-matrix-origin');
  if (responseOrigin !== 'cloudflare-worker-intelligence-reports') {
    return unavailable('non-authoritative-intelligence-report-response-blocked', \`Origin was \${responseOrigin || 'missing'}\`, 'member');
  }
  return response;
}`;
  source = replaceOnce(source, validatorAnchor, validator, 'Production reporting validator');

  const routeAnchor = `    if (emailRoutes.has(path)) {
      if (!hasD1(env)) return unavailable('members-db-binding-unavailable', '', 'email');`;
  const routeBlock = `    if (isIntelligenceReportRoute(path)) {
      if (!hasD1(env)) return unavailable('members-db-binding-unavailable', '', 'member');
      try {
        return validateIntelligenceReportResponse(await intelligenceReportWorker.fetch(request, env, ctx));
      } catch (error) {
        return unavailable('intelligence-report-worker-exception', error?.message || error, 'member');
      }
    }

${routeAnchor}`;
  source = replaceOnce(source, routeAnchor, routeBlock, 'Production reporting route');

  for (const marker of [
    "import intelligenceReportWorker, { isIntelligenceReportRoute }",
    'validateIntelligenceReportResponse',
    'intelligence-report-worker-exception'
  ]) if (!source.includes(marker)) throw new Error(`Production reporting marker missing: ${marker}`);
  return source;
}

const helperCode = fs.readFileSync(helperPath, 'utf8').trim();

function patchEmail(source) {
  const importLine = "import { buildMemberIntelligenceReport, buildWelcomeIntelligenceEmail, intelligenceReportSystemHealth } from './worker-intelligence-reports.js';\n";
  if (!source.includes(importLine.trim())) source = importLine + source;

  source = replaceOnce(
    source,
    "  '/api/email/admin/test-transactional',\n  '/api/email/admin/quarantine-retries']);",
    "  '/api/email/admin/test-transactional',\n  '/api/email/admin/report-system-health',\n  '/api/email/admin/quarantine-retries']);",
    'Email report health route registry'
  );

  const firstBriefAnchor = "async function sendFirstDailyBrief(request,env,member){";
  if (!source.includes('async function sendDetailedFirstDailyBrief(request,env,member)')) {
    if (!source.includes(firstBriefAnchor)) throw new Error('Detailed first brief insertion anchor missing');
    source = source.replace(firstBriefAnchor, `${helperCode}\n${firstBriefAnchor}`);
  }

  const welcomeOld = "const template=emailTemplate({heading:'Welcome to Matrix Reprogrammed',name:member.display_name,copy:'Your verified email preferences are active. Use the dashboard to control daily, weekly and release notices.',actionLabel:'Open subscriber dashboard',actionUrl:dashboardUrl,footer:`Unsubscribe: ${unsubscribeUrl}`});";
  const welcomeNew = "const template=await safeWelcomeIntelligenceEmail(request,env,member,{dashboardUrl,unsubscribeUrl});";
  source = replaceOnce(source, welcomeOld, welcomeNew, 'Detailed welcome email');

  const verifyCallOld = 'const firstBrief=await sendFirstDailyBrief(request,env,member);';
  const verifyCallNew = 'const firstBrief=await sendDetailedFirstDailyBrief(request,env,member);';
  source = replaceOnce(source, verifyCallOld, verifyCallNew, 'Detailed first daily brief call');

  const automationQueueOld = '  const queued=await queueCampaign(env,campaign);\n  const delivery=await processOutbox(env,{limit:100});';
  const automationQueueNew = '  const queued=await queuePersonalizedAutomatedCampaign(request,env,campaign,kind);\n  const delivery=await processOutbox(env,{limit:100});';
  source = replaceOnce(source, automationQueueOld, automationQueueNew, 'Personalized scheduled campaign queue');

  const healthAnchor = "async function handleAdminHealth(request,env){if(!adminAllowed(request,env))return json({ok:false,error:'Forbidden'},403);return json(await adminHealth(env))}";
  const healthBlock = `${healthAnchor}\nasync function handleAdminReportSystemHealth(request,env){if(!adminAllowed(request,env))return json({ok:false,error:'Forbidden'},403);return json({ok:true,reportSystem:await intelligenceReportSystemHealth(request,env)})}`;
  source = replaceOnce(source, healthAnchor, healthBlock, 'Email reporting health handler');

  const routeOld = "if(request.method==='POST'&&path==='/api/email/admin/test-transactional')return handleAdminTransactionalTest(request,env);if(request.method==='POST'&&path==='/api/email/admin/quarantine-retries')return handleAdminQuarantineRetries(request,env);";
  const routeNew = "if(request.method==='POST'&&path==='/api/email/admin/test-transactional')return handleAdminTransactionalTest(request,env);if(request.method==='GET'&&path==='/api/email/admin/report-system-health')return handleAdminReportSystemHealth(request,env);if(request.method==='POST'&&path==='/api/email/admin/quarantine-retries')return handleAdminQuarantineRetries(request,env);";
  source = replaceOnce(source, routeOld, routeNew, 'Email reporting health route');

  for (const marker of [
    'buildMemberIntelligenceReport',
    'buildWelcomeIntelligenceEmail',
    'safeWelcomeIntelligenceEmail',
    'sendDetailedFirstDailyBrief',
    'queuePersonalizedAutomatedCampaign',
    '/api/email/admin/report-system-health'
  ]) if (!source.includes(marker)) throw new Error(`Email reporting marker missing: ${marker}`);
  return source;
}

function patchDashboard(source) {
  const marker = 'data-intelligence-report-system="v1"';
  if (source.includes(marker)) return source;
  const card = `
<section class="member-panel intelligence-report-card" ${marker}>
  <p class="eyebrow">PERSONAL INTELLIGENCE WORKSPACE</p>
  <h2>Detailed reports and living PDF dossiers</h2>
  <p>Review daily and weekly reports built from your followed subjects and watchlists. Every report preserves evidence labels, source dates, contradictions, limitations and version history.</p>
  <p><a class="button" href="/intelligence-reports.html">Open intelligence reports</a></p>
</section>
`;
  if (source.includes('</main>')) return source.replace('</main>', `${card}</main>`);
  if (source.includes('</body>')) return source.replace('</body>', `${card}</body>`);
  throw new Error('Member dashboard insertion anchor missing');
}

const productionBefore = fs.readFileSync(productionPath, 'utf8');
const emailBefore = fs.readFileSync(emailPath, 'utf8');
const productionAfter = patchProduction(productionBefore);
const emailAfter = patchEmail(emailBefore);
if (productionAfter !== productionBefore) fs.writeFileSync(productionPath, productionAfter);
if (emailAfter !== emailBefore) fs.writeFileSync(emailPath, emailAfter);

let dashboardChanged = false;
if (fs.existsSync(dashboardPath)) {
  const before = fs.readFileSync(dashboardPath, 'utf8');
  const after = patchDashboard(before);
  if (after !== before) { fs.writeFileSync(dashboardPath, after); dashboardChanged = true; }
}

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  productionWorkerChanged: productionAfter !== productionBefore,
  emailWorkerChanged: emailAfter !== emailBefore,
  memberDashboardChanged: dashboardChanged,
  routes: ['/api/member/intelligence-reports','/api/member/intelligence-reports/latest','/api/member/report-profile','/api/intelligence/admin/health','/api/intelligence/admin/generate','/api/email/admin/report-system-health'],
  safety: {
    failClosedOriginValidation: true,
    separateD1Tables: true,
    existingOutboxAndConsentReused: true,
    scheduledAutomationStatePreserved: true,
    paypalFilesModified: false
  }
}, null, 2)}\n`);
console.log(`Intelligence reporting system ${productionAfter !== productionBefore || emailAfter !== emailBefore || dashboardChanged ? 'installed' : 'already current'}.`);

require('./build-money-intelligence-expansion.js');
require('./money-intelligence-expansion-test.js');
require('./build-money-overlap-map.js');
require('./money-overlap-map-test.js');
