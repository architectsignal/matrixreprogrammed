const fs = require('fs');
const path = require('path');

const root = process.cwd();
const file = path.join(root, 'scripts', 'full-site-function-tool-audit.js');
if (!fs.existsSync(file)) throw new Error('full-site-function-tool-audit.js is missing');

let source = fs.readFileSync(file, 'utf8');
const before = source;

source = source.replace(
  "'/api/', '/forum-', '/submit-', '/report-', '/track-', '/member-', '/billing-', '/admin-', '/newsletter-', '/osint-', '/health', '/deploy-status'",
  "'/api/', '/forum-', '/submit-', '/report-', '/track-', '/member-', '/billing-', '/admin-', '/newsletter-', '/osint-', '/health', '/deploy-status', '/intro-voice'"
);

source = source.replace(
  "const attributes = [...html.matchAll(/\\b(?:href|src|action)\\s*=\\s*([\"'])([^\"']+)\\1/gi)];",
  "const attributes = [...html.matchAll(/(?:^|\\s)(?:href|src|action)\\s*=\\s*([\"'])([^\"']+)\\1/gi)];"
);

for (const marker of [
  "'/deploy-status', '/intro-voice'",
  "html.matchAll(/(?:^|\\s)(?:href|src|action)"
]) if (!source.includes(marker)) throw new Error(`Full-site audit target-detection marker missing: ${marker}`);

if (source !== before) fs.writeFileSync(file, source);
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'full-site-audit-target-detection-patch.json'), `${JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  changed: source !== before,
  fixes: [
    'Only real whitespace-delimited href, src and action attributes are treated as routes; data-action fields and JavaScript object properties are excluded.',
    'The Worker-served /intro-voice route is recognized as dynamic.'
  ]
}, null, 2)}\n`);
console.log(`Full-site audit target detection ${source !== before ? 'patched' : 'already current'}.`);
