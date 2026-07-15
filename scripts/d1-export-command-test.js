const fs = require('fs');
const path = require('path');

const root = process.cwd();
const workflows = [
  '.github/workflows/deploy.yml',
  '.github/workflows/deploy-production.yml'
];
const issues = [];
const checks = {};

function check(name, condition) {
  checks[name] = Boolean(condition);
  if (!condition) issues.push(name);
}

for (const relative of workflows) {
  const full = path.join(root, relative);
  const text = fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : '';
  const bookmarkLines = text.split(/\r?\n/).filter(line => /wrangler@latest\s+d1\s+time-travel\s+info\s+matrix-members/.test(line));
  const exportLines = text.split(/\r?\n/).filter(line => /wrangler@latest\s+d1\s+export\s+matrix-members/.test(line));
  check(`${relative} exists`, Boolean(text));
  check(`${relative} captures exactly one D1 Time Travel bookmark`, bookmarkLines.length === 1);
  const command = bookmarkLines[0] || '';
  check(`${relative} requests machine-readable bookmark JSON`, /\s--json(?:\s|$)/.test(command));
  check(`${relative} validates a bookmark before migrations`, /bookmark/.test(text) && /d1-rollback-proof\.json/.test(text));
  check(`${relative} avoids blocking remote SQL export during production`, exportLines.length === 0);
  check(`${relative} keeps migrations after rollback capture`, text.indexOf('d1 time-travel info matrix-members') < text.indexOf('Apply idempotent D1 migration chain'));
}

const report = {
  ok: issues.length === 0,
  generatedAt: new Date().toISOString(),
  purpose: 'Require a validated D1 Time Travel bookmark before production migrations and prevent the remote SQL export service from blocking deployment.',
  rollbackMethod: 'Cloudflare D1 Time Travel bookmark',
  checks,
  issues
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'd1-export-command-test.json'), JSON.stringify(report, null, 2));
if (!report.ok) {
  console.error('D1 ROLLBACK COMMAND TEST FAILED');
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}
console.log('D1 ROLLBACK COMMAND TEST PASSED: automatic and manual releases require a validated Time Travel bookmark before migrations.');
