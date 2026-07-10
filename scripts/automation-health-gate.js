const fs = require('fs');
const path = require('path');

const root = process.cwd();
const mode = process.env.AUTOMATION_HEALTH_MODE || process.argv[2] || 'orchestrator';
const downloads = path.join(root, 'downloads');
fs.mkdirSync(downloads, { recursive: true });

function json(file) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) return null;
  try { return JSON.parse(fs.readFileSync(full, 'utf8')); } catch { return null; }
}

const requiredByMode = {
  daily: [
    ['downloads/daily-sitewide-build-report.json', data => data && data.ok === true && !(data.failedSteps || []).length && !(data.hardMissing || []).length],
    ['downloads/critical-route-drift-report.json', data => data && data.ok === true],
    ['downloads/newsletter-persistence-test.json', data => data && data.ok === true],
    ['downloads/site-function-harmony-report.json', data => data && data.ok === true]
  ],
  orchestrator: [
    ['downloads/automatic-orchestrator-final-audit.json', data => data && data.ok === true && Number(data.hardFailures || data.softFailures || 0) === 0],
    ['downloads/critical-route-drift-report.json', data => data && data.ok === true],
    ['downloads/newsletter-persistence-test.json', data => data && data.ok === true],
    ['downloads/site-function-harmony-report.json', data => data && data.ok === true]
  ],
  deploy: [
    ['downloads/deployment-proof.json', data => data && data.ok === true && data.expectedSha],
    ['downloads/critical-route-drift-report.json', data => data && data.ok === true],
    ['downloads/newsletter-persistence-test.json', data => data && data.ok === true]
  ]
};

const rules = requiredByMode[mode] || requiredByMode.orchestrator;
const checks = rules.map(([file, validate]) => {
  const data = json(file);
  let ok = false;
  try { ok = Boolean(validate(data)); } catch { ok = false; }
  return { file, ok, present: Boolean(data), status: data && (data.status || (data.ok ? 'passed' : 'failed')) || 'missing' };
});
const failed = checks.filter(check => !check.ok);
const report = {
  ok: failed.length === 0,
  mode,
  status: failed.length ? 'failed' : 'passed',
  generatedAt: new Date().toISOString(),
  checks,
  failed,
  boundary: 'A workflow is green only when every required machine report is present and explicitly healthy.'
};
fs.writeFileSync(path.join(downloads, `automation-health-${mode}.json`), JSON.stringify(report, null, 2));
fs.writeFileSync(path.join(downloads, `automation-health-${mode}.md`), '# Automation Health Gate\n\nMode: '+mode+'\nResult: '+(report.ok?'PASS':'FAIL')+'\n\n'+checks.map(c=>`- ${c.ok?'PASS':'FAIL'}: ${c.file} (${c.status})`).join('\n'));

if (!report.ok) {
  console.error(`AUTOMATION HEALTH GATE FAILED: ${mode}`);
  failed.forEach(item => console.error(`- ${item.file}: ${item.status}`));
  process.exit(1);
}
console.log(`AUTOMATION HEALTH GATE PASSED: ${mode}`);
