const fs = require('fs');
const path = require('path');

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

// Public cleanup and reader-governor passes are allowed to normalize presentation
// markup, but the membership runtime needs stable tier hooks. Repair those hooks
// from durable tier content before the strict membership/API hardening checks run.
let membershipTierContractsChanged = false;
if (fs.existsSync(membershipPath)) {
  const rawMembership = fs.readFileSync(membershipPath, 'utf8');
  const membershipNewline = rawMembership.includes('\r\n') ? '\r\n' : '\n';
  let membership = rawMembership.replace(/\r\n/g, '\n');
  const tierContracts = [
    {
      id: 'join-free-member',
      price: '0',
      anchors: ['data-tier-price="0"', 'Create or access free account', '€0 / forever', 'no card required']
    },
    {
      id: 'join-supporter',
      price: '3',
      anchors: ['data-tier-price="3"', 'paypal-button-supporter', '€3 donation / month']
    },
    {
      id: 'join-intelligence-member',
      price: '6',
      anchors: ['data-tier-price="6"', 'paypal-button-intelligence', '€6 donation / month']
    },
    {
      id: 'join-research-pro',
      price: '9',
      anchors: ['data-tier-price="9"', 'paypal-button-research_pro', '€9 donation / month']
    }
  ];

  for (const tier of tierContracts) {
    const idMarker = `id="${tier.id}"`;
    const priceMarker = `data-tier-price="${tier.price}"`;
    if (membership.includes(idMarker) && membership.includes(priceMarker)) continue;

    let anchorIndex = -1;
    for (const anchor of tier.anchors) {
      anchorIndex = membership.indexOf(anchor);
      if (anchorIndex >= 0) break;
    }
    if (anchorIndex < 0) {
      throw new Error(`Canonical membership tier could not be recovered: ${tier.id}`);
    }

    const articleStart = membership.lastIndexOf('<article', anchorIndex);
    const articleEnd = articleStart >= 0 ? membership.indexOf('>', articleStart) : -1;
    if (articleStart < 0 || articleEnd < 0 || articleEnd < anchorIndex && membership.indexOf('</article>', articleStart) < anchorIndex) {
      throw new Error(`Canonical membership tier article is missing: ${tier.id}`);
    }

    let opening = membership.slice(articleStart, articleEnd + 1);
    if (!opening.includes(idMarker)) opening = opening.replace('<article', `<article id="${tier.id}"`);
    if (!opening.includes(priceMarker)) opening = opening.replace('<article', `<article data-tier-price="${tier.price}"`);
    membership = `${membership.slice(0, articleStart)}${opening}${membership.slice(articleEnd + 1)}`;
  }

  const renderedMembership = membership.replace(/\n/g, membershipNewline);
  membershipTierContractsChanged = renderedMembership !== rawMembership;
  if (membershipTierContractsChanged) fs.writeFileSync(membershipPath, renderedMembership);
}

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  changed: workerChanged,
  membershipTierContractsChanged,
  canonicalOrigin: 'https://matrixreprogrammed.com',
  redirectStatus: 308,
  checks,
  reason: 'Host-only authentication cookies must not split member state between www and the apex Cloudflare Worker origin. Stable membership tier hooks are self-healed before strict API hardening so public presentation cleanup cannot break member checkout contracts.'
}, null, 2));
console.log(`Cloudflare canonical member origin ${workerChanged ? 'repaired' : 'already current'}.`);
if (membershipTierContractsChanged) console.log('Canonical membership tier structure repaired before hardening.');
