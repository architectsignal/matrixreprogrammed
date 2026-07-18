const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const builderPath = path.join(root, 'scripts', 'build-homepage-command-surface.js');
const reportPath = path.join(root, 'downloads', 'homepage-command-builder-shell-patch.json');
if (!fs.existsSync(builderPath)) throw new Error('scripts/build-homepage-command-surface.js is missing');

const before = fs.readFileSync(builderPath, 'utf8');
let after = before;
let changed = false;

const shellMarker = 'function ensureHomepageShell(';
const validHelper = String.raw`function ensureHomepageShell(file){
  if(!fs.existsSync(file))return false;
  let html=fs.readFileSync(file,'utf8');
  if(/<main\b/i.test(html))return false;
  const closeBody=/<\/body>/i;
  const shell='<main id="main-content" class="wrap"></main>';
  html=closeBody.test(html)?html.replace(closeBody,shell+'</body>'):html+shell;
  fs.writeFileSync(file,html);
  return true;
}`;

function functionRange(text, signature) {
  const start = text.indexOf(signature);
  if (start < 0) return null;
  const open = text.indexOf('{', start + signature.length);
  if (open < 0) return null;
  let depth = 0, quote = '', escaped = false, lineComment = false, blockComment = false;
  for (let index = open; index < text.length; index += 1) {
    const char = text[index], next = text[index + 1] || '';
    if (lineComment) { if (char === '\n') lineComment = false; continue; }
    if (blockComment) { if (char === '*' && next === '/') { blockComment = false; index += 1; } continue; }
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (char === '\\') { escaped = true; continue; }
      if (char === quote) quote = '';
      continue;
    }
    if (char === '/' && next === '/') { lineComment = true; index += 1; continue; }
    if (char === '/' && next === '*') { blockComment = true; index += 1; continue; }
    if (char === "'" || char === '"' || char === '`') { quote = char; continue; }
    if (char === '{') depth += 1;
    else if (char === '}') { depth -= 1; if (depth === 0) return { start, end: index + 1 }; }
  }
  return null;
}

if (after.includes(shellMarker)) {
  const found = functionRange(after, shellMarker);
  if (!found) throw new Error('Existing homepage shell helper is unbalanced');
  const current = after.slice(found.start, found.end);
  if (current !== validHelper) {
    after = `${after.slice(0, found.start)}${validHelper}${after.slice(found.end)}`;
    changed = true;
  }
} else {
  const rootAnchor = 'const root = process.cwd();';
  if (!after.includes(rootAnchor)) throw new Error('Homepage command builder root declaration missing');
  after = after.replace(rootAnchor, `${rootAnchor}\n${validHelper}`);
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
for (const marker of [shellMarker, ensureCall, '<main id="main-content" class="wrap"></main>', 'if(/<main\\b/i.test(html))', 'const closeBody=/<\\/body>/i;']) if (!after.includes(marker)) throw new Error(`Homepage command builder shell marker missing: ${marker}`);

if (changed) fs.writeFileSync(builderPath, after);
const syntax = spawnSync(process.execPath, ['--check', builderPath], { cwd: root, encoding: 'utf8' });
if (syntax.status !== 0) throw new Error(`Homepage command builder shell repair produced invalid JavaScript: ${syntax.stderr || syntax.stdout}`);

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  changed,
  builder: 'scripts/build-homepage-command-surface.js',
  patchStrategy: 'Install or replace the helper using String.raw so regular-expression escapes survive code generation, then syntax-check the generated builder.',
  ensureCall,
  syntaxChecked: true,
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
require('./patch-list-unsubscribe-headers.js');
require('./brevo-operational-readiness-audit.js');
require('./patch-production-receipt-email-safety.js');
require('./repair-deep-audit-public-defects.js');
console.log(`Homepage command builder shell recovery ${changed ? 'installed' : 'already present'}; generated regexes syntax-checked, deep consent-controlled briefing email and one-click unsubscribe headers reapplied before Brevo certification.`);
