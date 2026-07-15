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
  const lines = text.split(/\r?\n/).filter(line => /wrangler@latest\s+d1\s+export\s+matrix-members/.test(line));
  check(`${relative} exists`, Boolean(text));
  check(`${relative} has exactly one D1 export command`, lines.length === 1);
  const command = lines[0] || '';
  check(`${relative} exports the remote database`, /\s--remote(?:\s|$)/.test(command));
  check(`${relative} writes an explicit output file`, /\s--output(?:\s|$)/.test(command));
  check(`${relative} uses Wrangler export skip-confirmation`, /\s--skip-confirmation(?:\s|$)/.test(command));
  check(`${relative} does not use execute-only --yes after export`, !/d1\s+export[^\n]*\s--yes(?:\s|$)/.test(command));
}

const report = {
  ok: issues.length === 0,
  generatedAt: new Date().toISOString(),
  purpose: 'Prevent production D1 rollback exports from using the d1 execute --yes flag. Wrangler d1 export requires --skip-confirmation (-y).',
  checks,
  issues
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'd1-export-command-test.json'), JSON.stringify(report, null, 2));
if (!report.ok) {
  console.error('D1 EXPORT COMMAND TEST FAILED');
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}
console.log('D1 EXPORT COMMAND TEST PASSED: automatic and manual rollback exports use --skip-confirmation.');
