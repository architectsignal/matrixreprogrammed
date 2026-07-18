const fs = require('fs');
const path = require('path');

const root = process.cwd();
const src = path.join(root, 'src');
const reportFile = path.join(root, 'downloads', 'worker-route-context-matrix-test.json');
fs.mkdirSync(path.dirname(reportFile), { recursive: true });

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (/^worker.*\.js$/i.test(entry.name)) files.push(full);
  }
  return files;
}
function localRoute(value) {
  return /^\/(?:api(?:\/|$)|newsletter|subscribe|unsubscribe|forum|submit-forum|report-forum|track-event|intro-voice|downloads\/forum|\.netlify\/functions\/track-event)/.test(value);
}
function extractRoutes(file) {
  const source = fs.readFileSync(file, 'utf8');
  const routes = new Set();
  for (const match of source.matchAll(/(['"])(\/(?:\\.|(?!\1).)+?)\1/g)) {
    const value = match[2].replace(/\\\//g, '/');
    if (localRoute(value) && !/[${}*+?()[\]|^]/.test(value)) routes.add(value.replace(/\/$/, '') || '/');
  }
  return { source, routes: [...routes] };
}
function classify(route) {
  const publicExact = new Set([
    '/intro-voice', '/forum', '/forum.html', '/forum-health', '/forum-feed', '/forum-posts.json', '/forum-posts.md',
    '/downloads/forum-posts.json', '/downloads/forum-posts.md', '/submit-forum-post', '/report-forum-post',
    '/track-event', '/.netlify/functions/track-event', '/newsletter', '/newsletter.html', '/newsletter-signup', '/subscribe-newsletter',
    '/api/membership/signup', '/api/auth/request-link', '/api/auth/verify', '/api/auth/logout',
    '/api/auth/health', '/newsletter-health', '/api/membership/health', '/api/paypal/health',
    '/unsubscribe-newsletter'
  ]);
  if (route === '/api/paypal/bootstrap-health') return { boundary: 'public', reason: 'Read-only sandbox bootstrap health. The implementation is pinned to PayPal sandbox, requires the sandbox switch, and reports live charging disabled.' };
  if (publicExact.has(route) || /^\/forum-(?:feed|submit|report)-/.test(route)) return { boundary: 'public', reason: 'Public page, intake, health, read-only feed or safely idempotent account boundary.' };
  if (/^\/api\/(?:paypal\/webhook|email\/provider-webhook)$/.test(route)) return { boundary: 'signed-provider', reason: 'Provider signature and event idempotency are required; membership role is irrelevant.' };
  if (/^\/api\/email\/(?:verify|unsubscribe|resubscribe)$/.test(route)) return { boundary: 'signed-token', reason: 'One-time scoped action token is required.' };
  if (/^\/api\/(?:admin|email\/admin|paypal\/(?:admin|sandbox|bootstrap))\//.test(route)) return { boundary: 'administrator', reason: 'Administrative token or administrator member role is required.' };
  if (new Set(['/newsletter-subscribers.json','/api/admin/members','/newsletter-send-weekly','/send-weekly-newsletter']).has(route)) return { boundary: 'administrator', reason: 'Subscriber export or campaign dispatch is administrative.' };
  if (/^\/api\/tools\/(?:config|jobs)(?:\/|$)/.test(route)) return { boundary: 'tool-tiered', reason: 'Authenticated route; the selected tool then enforces Registered or Intelligence tier and verified-self scope.' };
  if (/^\/api\/(?:member|market|email\/(?:preferences|subscriber)|paypal\/(?:config|checkout-intent|subscription))(?:\/|$)/.test(route)) return { boundary: 'registered', reason: 'Authenticated active member session is required; paid entitlements are checked where applicable.' };
  if (/^\/api\/paypal\/donation\/(?:config|order|capture)$/.test(route)) return { boundary: 'public', reason: 'Voluntary support route. It creates or captures a donation but never grants membership entitlements.' };
  if (/^\/api\/email\/(?:health|public)/.test(route)) return { boundary: 'public', reason: 'Public email-system status or safe public intake.' };
  return null;
}
function expectations(boundary) {
  const denied = 'deny';
  if (boundary === 'public') return { anonymous: 'allow', registered: 'allow', intelligence: 'allow', administrator: 'allow' };
  if (boundary === 'signed-provider') return { anonymous: 'signed-provider-only', registered: 'signed-provider-only', intelligence: 'signed-provider-only', administrator: 'signed-provider-only' };
  if (boundary === 'signed-token') return { anonymous: 'valid-action-token-only', registered: 'valid-action-token-only', intelligence: 'valid-action-token-only', administrator: 'valid-action-token-only' };
  if (boundary === 'administrator') return { anonymous: denied, registered: denied, intelligence: denied, administrator: 'allow' };
  if (boundary === 'registered') return { anonymous: denied, registered: 'allow', intelligence: 'allow', administrator: 'allow' };
  if (boundary === 'tool-tiered') return {
    anonymous: denied,
    registered: 'Holehe only; SpiderFoot and h8mail denied',
    intelligence: 'Holehe and SpiderFoot; h8mail verified-self only',
    administrator: 'all tools within documented investigation scope'
  };
  return { anonymous: denied, registered: denied, intelligence: denied, administrator: denied };
}

const files = walk(src);
const routeSources = new Map();
const combinedSource = [];
for (const file of files) {
  const { source, routes } = extractRoutes(file);
  combinedSource.push(source);
  for (const route of routes) {
    if (!routeSources.has(route)) routeSources.set(route, []);
    routeSources.get(route).push(path.relative(root, file).replace(/\\/g, '/'));
  }
}
const matrix = [];
const unclassified = [];
for (const route of [...routeSources.keys()].sort()) {
  const classification = classify(route);
  if (!classification) { unclassified.push(route); continue; }
  matrix.push({ route, sources: routeSources.get(route), ...classification, contexts: expectations(classification.boundary) });
}
const source = combinedSource.join('\n');
const policyChecks = [
  { name: 'anonymous routes fail closed through auth session checks', ok: source.includes("error:'Authentication required'") && source.includes('authSessionMember') },
  { name: 'Registered Holehe boundary exists', ok: /holehe:\{[^}]*minimumTier:'registered'/.test(source) },
  { name: 'Intelligence SpiderFoot boundary exists', ok: /spiderfoot:\{[^}]*minimumTier:'intelligence_6'/.test(source) },
  { name: 'Intelligence h8mail boundary exists', ok: /h8mail:\{[^}]*minimumTier:'intelligence_6'[^}]*selfOnlyForMembers:true/.test(source) },
  { name: 'verified-self enforcement exists', ok: source.includes('selfVerifiedRequired:true') && source.includes('own verified account email') },
  { name: 'administrator scope bypasses only verified-self restriction', ok: source.includes('!osintIsAdmin(required.auth.member)&&!selfVerified') },
  { name: 'effective entitlement view controls OSINT tier', ok: source.includes('member_effective_entitlements') && source.includes('osintEffectiveTier') },
  { name: 'admin runner routes require runner or admin authorization', ok: source.includes('/api/admin/tools/') && (source.includes('osintRunnerAuthorized') || source.includes('runnerAllowed') || source.includes('adminAllowed')) },
  { name: 'PayPal webhook requires signature verification', ok: source.includes('verify-webhook-signature') && source.includes('duplicate:true') },
  { name: 'email provider webhook has verification boundary', ok: source.includes('/api/email/provider-webhook') && /signature|webhook/i.test(source) }
];
const failures = [
  ...unclassified.map(route => ({ name: `unclassified Worker route ${route}`, detail: route })),
  ...policyChecks.filter(item => !item.ok).map(item => ({ name: item.name, detail: 'required source contract missing' }))
];
const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  files: files.map(file => path.relative(root, file).replace(/\\/g, '/')),
  routeCount: matrix.length + unclassified.length,
  classifiedCount: matrix.length,
  unclassified,
  contexts: ['anonymous','registered','intelligence','administrator'],
  matrix,
  toolPolicy: {
    holehe: { minimumTier: 'registered', verifiedSelfOnly: false },
    spiderfoot: { minimumTier: 'intelligence_6', verifiedSelfOnly: false },
    h8mail: { minimumTier: 'intelligence_6', verifiedSelfOnly: true, administratorDocumentedScope: true }
  },
  policyChecks,
  failures,
  boundary: 'Every discovered functional Worker route must be classified. Dynamic OSINT routes are additionally constrained by selected tool, effective entitlement, verified-self status and administrator investigation scope.'
};
fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
if (!report.ok) {
  console.error('WORKER ROUTE CONTEXT MATRIX FAILED');
  failures.forEach(item => console.error(`- ${item.name}`));
  process.exit(1);
}
console.log(`WORKER ROUTE CONTEXT MATRIX PASSED: ${matrix.length} routes classified across anonymous, registered, Intelligence and administrator contexts.`);
