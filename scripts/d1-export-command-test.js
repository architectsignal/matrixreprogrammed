const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

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

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const dryRun = spawnSync(npx, ['--yes', 'wrangler@latest', 'deploy', '--dry-run'], {
  cwd: root,
  encoding: 'utf8',
  env: process.env,
  maxBuffer: 20 * 1024 * 1024
});
const dryRunOutput = `${dryRun.stdout || ''}\n${dryRun.stderr || ''}`.trim();
check('Wrangler production Worker and asset bundle dry-run passes', dryRun.status === 0);

const report = {
  ok: issues.length === 0,
  generatedAt: new Date().toISOString(),
  purpose: 'Require a validated D1 Time Travel bookmark before production migrations, prevent blocking SQL exports, and prove the exact Cloudflare bundle can be packaged.',
  rollbackMethod: 'Cloudflare D1 Time Travel bookmark',
  checks,
  wranglerDryRun: {
    exitCode: dryRun.status,
    signal: dryRun.signal || null,
    output: dryRunOutput.slice(-12000)
  },
  issues
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'd1-export-command-test.json'), JSON.stringify(report, null, 2));
if (!report.ok) {
  console.error('D1 ROLLBACK AND CLOUDFLARE BUNDLE TEST FAILED');
  for (const issue of issues) console.error(`- ${issue}`);
  if (dryRunOutput) console.error(dryRunOutput.slice(-6000));
  process.exit(1);
}
console.log('D1 ROLLBACK AND CLOUDFLARE BUNDLE TEST PASSED: rollback protection is present and Wrangler can package the production release.');
