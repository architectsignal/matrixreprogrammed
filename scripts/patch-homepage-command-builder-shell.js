const fs = require('fs');
const path = require('path');

const root = process.cwd();
const builderPath = path.join(root, 'scripts', 'build-homepage-command-surface.js');
const reportPath = path.join(root, 'downloads', 'homepage-command-builder-shell-patch.json');
if (!fs.existsSync(builderPath)) throw new Error('scripts/build-homepage-command-surface.js is missing');

const before = fs.readFileSync(builderPath, 'utf8');
let after = before;
let changed = false;

const shellMarker = 'function ensureHomepageShell(';
if (!after.includes(shellMarker)) {
  const anchor = 'function read(file) {';
  const index = after.indexOf(anchor);
  if (index < 0) throw new Error('Homepage command builder read helper anchor missing');
  const helper = `function ensureHomepageShell(file){
  if(!fs.existsSync(file))return false;
  let html=fs.readFileSync(file,'utf8');
  if(/<main\\b/i.test(html))return false;
  const closeBody=/<\\/body>/i;
  const shell='<main id="main-content" class="wrap"></main>';
  html=closeBody.test(html)?html.replace(closeBody,\`${shell}</body>\`):\`${html}${shell}\`;
  fs.writeFileSync(file,html);
  return true;
}

`;
  after = `${after.slice(0, index)}${helper}${after.slice(index)}`;
  changed = true;
}

const homepageAnchor = "const homepagePath = path.join(root, 'index.html');";
const ensureCall = "ensureHomepageShell(homepagePath);";
if (!after.includes(ensureCall)) {
  if (!after.includes(homepageAnchor)) throw new Error('Homepage command builder homepage path anchor missing');
  after = after.replace(homepageAnchor, `${homepageAnchor}\n${ensureCall}`);
  changed = true;
}

for (const marker of [shellMarker, ensureCall, '<main id="main-content" class="wrap"></main>']) {
  if (!after.includes(marker)) throw new Error(`Homepage command builder shell marker missing: ${marker}`);
}

if (changed) fs.writeFileSync(builderPath, after);
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  changed,
  builder: 'scripts/build-homepage-command-surface.js',
  boundary: 'Every direct homepage command-surface build repairs a missing main shell before inserting the current mission surface.'
}, null, 2)}\n`);

require('./patch-deploy-status-current-mission.js');
require('./patch-paypal-voluntary-support.js');
require('./patch-voluntary-support-store.js');
require('./patch-brevo-transactional-readiness.js');
require('./patch-email-launch-console.js');
require('./patch-email-automation-guard.js');
require('./patch-email-campaign-quality.js');
require('./patch-membership-signup-server-fallback.js');
require('./brevo-operational-readiness-audit.js');
require('./patch-production-receipt-email-safety.js');
require('./repair-deep-audit-public-defects.js');
console.log(`Homepage command builder shell recovery ${changed ? 'installed' : 'already present'}; stable audit v2, current deploy mission, €1–€5,000 voluntary support, authenticated transactional email, guarded daily and weekly campaigns, membership signup fallback, operational audit, safe production receipt and public repairs applied.`);
