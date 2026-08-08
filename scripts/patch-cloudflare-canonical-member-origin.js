const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = process.cwd();
const workerPath = path.join(root, 'src', 'worker-production.js');
const membershipPath = path.join(root, 'membership.html');
const reportPath = path.join(root, 'downloads', 'cloudflare-canonical-member-origin.json');

if (!fs.existsSync(workerPath)) throw new Error('Cloudflare production Worker is missing');
const rawBefore = fs.readFileSync(workerPath, 'utf8');
const newline = rawBefore.includes('\r\n') ? '\r\n' : '\n';
const before = rawBefore.replace(/\r\n/g, '\n');
const legacy = "  async fetch(request, env, ctx) {\n    const path = new URL(request.url).pathname.replace(/\\/+$/, '') || '/';";
const canonical = "  async fetch(request, env, ctx) {\n    const requestUrl = new URL(request.url);\n    if (requestUrl.hostname.toLowerCase() === 'www.matrixreprogrammed.com') {\n      requestUrl.hostname = 'matrixreprogrammed.com';\n      return Response.redirect(requestUrl.toString(), 308);\n    }\n    const path = requestUrl.pathname.replace(/\\/+$/, '') || '/';";

let after = before;
if (after.includes(legacy)) after = after.replace(legacy, canonical);
else if (!after.includes(canonical)) throw new Error('Cloudflare canonical-origin insertion anchor is missing');

const checks = {
  redirectsWwwToApex: after.includes("requestUrl.hostname.toLowerCase() === 'www.matrixreprogrammed.com'") && after.includes("requestUrl.hostname = 'matrixreprogrammed.com'"),
  preservesMethodWith308: after.includes('Response.redirect(requestUrl.toString(), 308)'),
  routesFromCanonicalUrl: after.includes("const path = requestUrl.pathname.replace(/\\/+$/, '') || '/';"),
  legacyDirectPathParserRemoved: !after.includes(legacy)
};
if (Object.values(checks).some(value => value !== true)) {
  throw new Error(`Cloudflare canonical-origin repair failed: ${JSON.stringify(checks)}`);
}

const renderedAfter = after.replace(/\n/g, newline);
const workerChanged = renderedAfter !== rawBefore;
if (workerChanged) fs.writeFileSync(workerPath, renderedAfter);

// Generic public-page cleanup is allowed to improve presentation, but membership
// is a transactional runtime surface with authentication and payment hooks. If a
// late generator replaces that structure, restore the exact membership page from
// the checked-out release SHA instead of reconstructing or weakening it.
const requiredMembershipMarkers = [
  'id="join-free-member"',
  'data-tier-price="0"',
  'id="join-supporter"',
  'data-tier-price="3"',
  'id="join-intelligence-member"',
  'data-tier-price="6"',
  'id="join-research-pro"',
  'data-tier-price="9"',
  'paypal-membership.js',
  'Paid checkout remains disabled until the sandbox or live activation gates are deliberately enabled.'
];
const membershipIsCanonical = source => requiredMembershipMarkers.every(marker => source.includes(marker));

let membershipCanonicalRestored = false;
if (!fs.existsSync(membershipPath)) throw new Error('Canonical membership page is missing');
let membership = fs.readFileSync(membershipPath, 'utf8').replace(/\r\n/g, '\n');
if (!membershipIsCanonical(membership)) {
  let checkedInMembership = '';
  try {
    checkedInMembership = execFileSync('git', ['show', 'HEAD:membership.html'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }).replace(/\r\n/g, '\n');
  } catch (error) {
    throw new Error(`Canonical membership runtime was rewritten and the exact checked-in page could not be restored: ${error?.message || error}`);
  }
  if (!membershipIsCanonical(checkedInMembership)) {
    const missing = requiredMembershipMarkers.filter(marker => !checkedInMembership.includes(marker));
    throw new Error(`Checked-in membership runtime is not canonical: ${missing.join(', ')}`);
  }
  const membershipNewline = fs.readFileSync(membershipPath, 'utf8').includes('\r\n') ? '\r\n' : '\n';
  fs.writeFileSync(membershipPath, checkedInMembership.replace(/\n/g, membershipNewline));
  membership = checkedInMembership;
  membershipCanonicalRestored = true;
}

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  changed: workerChanged,
  membershipCanonicalRestored,
  canonicalOrigin: 'https://matrixreprogrammed.com',
  redirectStatus: 308,
  checks,
  membershipMarkersVerified: requiredMembershipMarkers.length,
  reason: 'Host-only authentication cookies must not split member state between www and the apex Cloudflare Worker origin. Membership is a protected transactional surface: if a generic generated-page pass rewrites its runtime structure, the exact page from the checked-out release SHA is restored before strict API hardening.'
}, null, 2));
console.log(`Cloudflare canonical member origin ${workerChanged ? 'repaired' : 'already current'}.`);
if (membershipCanonicalRestored) console.log('Canonical membership runtime restored exactly from the checked-out release SHA.');
