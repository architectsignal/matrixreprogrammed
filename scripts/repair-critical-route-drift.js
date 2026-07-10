const fs = require('fs');
const path = require('path');

const root = process.cwd();
const reportDir = path.join(root, 'downloads');
fs.mkdirSync(reportDir, { recursive: true });

const ignored = new Set(['.git', 'node_modules', '.wrangler']);
const replacements = [
  [/power-entities\.html/g, 'entities.html']
];
const touched = [];
const removedCorruptCards = [];
const hardIssues = [];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function relative(file) {
  return path.relative(root, file).replace(/\\/g, '/');
}

function repairTextFile(file) {
  const rel = relative(file);
  if (!/\.(html|js|json|md|txt)$/i.test(rel)) return;
  let before;
  try { before = fs.readFileSync(file, 'utf8'); } catch { return; }
  let after = before;
  for (const [pattern, replacement] of replacements) after = after.replace(pattern, replacement);

  if (/\.html$/i.test(rel) && after.includes('[object Object]')) {
    const prior = after;
    after = after.replace(/<article\b[^>]*>[\s\S]*?\[object Object\][\s\S]*?<\/article>/gi, '');
    if (after !== prior) removedCorruptCards.push(rel);
  }

  if (after !== before) {
    fs.writeFileSync(file, after);
    touched.push(rel);
  }
}

for (const file of walk(root)) repairTextFile(file);

const criticalPages = [
  'entity-daily-briefs.html',
  'machine-digest.html',
  'machine-intelligence.html',
  'search.html',
  'search.js'
];
for (const rel of criticalPages) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) {
    hardIssues.push(`${rel} missing`);
    continue;
  }
  const text = fs.readFileSync(file, 'utf8');
  if (text.includes('power-entities.html')) hardIssues.push(`${rel} still references power-entities.html`);
  if (text.includes('[object Object]')) hardIssues.push(`${rel} still exposes [object Object]`);
}

const report = {
  ok: hardIssues.length === 0,
  status: hardIssues.length ? 'failed' : touched.length || removedCorruptCards.length ? 'repaired' : 'passed',
  generatedAt: new Date().toISOString(),
  touched,
  removedCorruptCards,
  hardIssues,
  boundary: 'Generated public pages must not expose dead critical routes or JavaScript object coercion artifacts.'
};

fs.writeFileSync(path.join(reportDir, 'critical-route-drift-report.json'), JSON.stringify(report, null, 2));
fs.writeFileSync(path.join(reportDir, 'critical-route-drift-report.md'), [
  '# Critical Route Drift Report',
  '',
  `Generated: ${report.generatedAt}`,
  `Result: ${report.ok ? 'PASS' : 'FAIL'}`,
  `Status: ${report.status}`,
  '',
  '## Repaired Files',
  touched.length ? touched.map(x => `- ${x}`).join('\n') : '- None',
  '',
  '## Removed Corrupt Cards',
  removedCorruptCards.length ? removedCorruptCards.map(x => `- ${x}`).join('\n') : '- None',
  '',
  '## Hard Issues',
  hardIssues.length ? hardIssues.map(x => `- ${x}`).join('\n') : '- None'
].join('\n'));

if (!report.ok) {
  console.error('CRITICAL ROUTE DRIFT GATE FAILED');
  hardIssues.forEach(issue => console.error(`- ${issue}`));
  process.exit(1);
}

console.log(`Critical route drift gate passed: ${touched.length} file(s) repaired, ${removedCorruptCards.length} corrupt card block(s) removed.`);
