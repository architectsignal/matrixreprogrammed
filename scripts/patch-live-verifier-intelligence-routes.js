const fs = require('fs');
const path = require('path');

const root = process.cwd();
const file = path.join(root, 'scripts', 'verify-live-production.js');
if (!fs.existsSync(file)) throw new Error('scripts/verify-live-production.js is missing');
let source = fs.readFileSync(file, 'utf8');
const before = source;

const anchor = "  '/live-intel': 'LIVE INTEL',";
const additions = [
  "  '/daily-epstein-update': 'DAILY EPSTEIN UPDATE.',",
  "  '/data/daily-epstein-update.json': '\"title\": \"Daily Epstein Update\"',",
  "  '/data/live-machine-status.json': '\"status\": \"machine-dependants-generated\"',",
  "  '/controlled-opposition/andrew-tate.html': 'investigation-pulse.js',"
];
if (!source.includes(anchor)) throw new Error('Live verifier route marker anchor not found');
for (const line of additions) {
  if (!source.includes(line)) source = source.replace(anchor, `${anchor}\n${line}`);
}

fs.writeFileSync(file, source);
const report = {
  ok: additions.every(line => source.includes(line)),
  generatedAt: new Date().toISOString(),
  changed: source !== before,
  routes: [
    '/daily-epstein-update',
    '/data/daily-epstein-update.json',
    '/data/live-machine-status.json',
    '/controlled-opposition/andrew-tate.html'
  ],
  boundary: 'The production verifier must prove current Epstein output, machine status and named card runtime coverage before declaring the site healthy.'
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'live-verifier-intelligence-routes-patch.json'), `${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) throw new Error('Live verifier intelligence route patch did not apply');
console.log(`Live verifier intelligence routes ${report.changed ? 'patched' : 'already current'}.`);
