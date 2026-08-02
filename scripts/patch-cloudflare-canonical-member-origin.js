const fs = require('fs');
const path = require('path');

const root = process.cwd();
const workerPath = path.join(root, 'src', 'worker-production.js');
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
if (renderedAfter !== rawBefore) fs.writeFileSync(workerPath, renderedAfter);
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  changed: renderedAfter !== rawBefore,
  canonicalOrigin: 'https://matrixreprogrammed.com',
  redirectStatus: 308,
  checks,
  reason: 'Host-only authentication cookies must not split member state between www and the apex Cloudflare Worker origin.'
}, null, 2));
console.log(`Cloudflare canonical member origin ${renderedAfter !== rawBefore ? 'repaired' : 'already current'}.`);
