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
  const rootAnchor = 'const root = process.cwd();';
  if (!after.includes(rootAnchor)) throw new Error('Homepage command builder root declaration missing');
  const helper = `function ensureHomepageShell(file){
  if(!fs.existsSync(file))return false;
  let html=fs.readFileSync(file,'utf8');
  if(/<main\\b/i.test(html))return false;
  const closeBody=/<\\/body>/i;
  const shell='<main id="main-content" class="wrap"></main>';
  html=closeBody.test(html)?html.replace(closeBody,shell+'</body>'):html+shell;
  fs.writeFileSync(file,html);
  return true;
}`;
  after = after.replace(rootAnchor, `${rootAnchor}\n${helper}`);
  changed = true;
}

const callCandidates = [
  { variable: 'indexPath', anchor: "const indexPath=file('index.html'); if(!fs.existsSync(indexPath)) throw new Error('index.html is required');" },
  { variable: 'homepagePath', anchor: "const homepagePath = path.join(root, 'index.html');" },
  { variable: 'indexPath', anchor: "const indexPath = file('index.html');" },
  { variable: 'homepagePath', anchor: "const homepagePath=path.join(root,'index.html');" }
];

let ensureCall = '';
for (const candidate of callCandidates) {
  const call = `ensureHomepageShell(${candidate.variable});`;
  if (after.includes(call)) { ensureCall = call; break; }
  if (after.includes(candidate.anchor)) { after = after.replace(candidate.anchor, `${candidate.anchor}\n${call}`); ensureCall = call; changed = true; break; }
}
if (!ensureCall) {
  const declaration = after.match(/const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:file\(\s*['"]index\.html['"]\s*\)|path\.join\(\s*root\s*,\s*['"]index\.html['"]\s*\))\s*;[^\n]*/);
  if (!declaration) throw new Error('Homepage command builder index path declaration missing');
  ensureCall = `ensureHomepageShell(${declaration[1]});`;
  after = after.replace(declaration[0], `${declaration[0]}\n${ensureCall}`);
  changed = true;
}
for (const marker of [shellMarker, ensureCall, '<main id="main-content" class="wrap"></main>']) if (!after.includes(marker)) throw new Error(`Homepage command builder shell marker missing: ${marker}`);

if (changed) fs.writeFileSync(builderPath, after);
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  changed,
  builder: 'scripts/build-homepage-command-surface.js',
  patchStrategy: 'Insert the shell helper after the stable root declaration and call it after any supported index-page declaration.',
  ensureCall,
  repeatSafe: true,
  boundary: 'Every direct homepage command-surface build repairs a missing main shell before inserting the current mission surface.'
}, null, 2)}\n`);

require('./patch-deploy-status-current-mission.js');
require('./patch-paypal-voluntary-support.js');
require('./patch-voluntary-support-store.js');
require('./patch-brevo-transactional-readiness.js');
require('./patch-email-launch-console.js');
require('./patch-email-automation-guard.js');
require('./repair-email-campaign-source-anchor.js');
require('./patch-email-campaign-quality.js');
require('./patch-membership-signup-server-fallback.js');
// Legacy email repair modules above may restore the shallow lifecycle. The authorised
// deep briefing lifecycle is the final owner before operational certification.
require('./patch-deep-email-automation.js');
require('./brevo-operational-readiness-audit.js');
require('./patch-production-receipt-email-safety.js');
require('./repair-deep-audit-public-defects.js');
console.log(`Homepage command builder shell recovery ${changed ? 'installed' : 'already present'}; deep consent-controlled briefing email was reapplied as the final lifecycle owner before Brevo certification.`);
