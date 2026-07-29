const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const workflows = [
  '.github/workflows/deploy.yml',
  '.github/workflows/deploy-production.yml',
];
const issues = [];
const checks = {};
const workflowStates = [];
let activeMigrationWorkflows = 0;
let frozenWorkflows = 0;

function check(name, condition) {
  checks[name] = Boolean(condition);
  if (!condition) issues.push(name);
}

for (const relative of workflows) {
  const full = path.join(root, relative);
  const text = fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : '';
  const lines = text.split(/\r?\n/);
  const bookmarkLines = lines.filter((line) => /wrangler@latest\s+d1\s+time-travel\s+info\s+matrix-members/.test(line));
  const exportLines = lines.filter((line) => /wrangler@latest\s+d1\s+export\s+matrix-members/.test(line));
  const executableDeploy = /^\s*(?:-\s*)?(?:run:\s*)?(?:npx(?:\s+--yes)?\s+)?wrangler(?:@latest)?\s+(?:deploy|pages\s+deploy)\b/im.test(text);
  const d1Mutation = /wrangler@latest\s+d1\s+execute\s+matrix-members\s+--remote|Apply (?:idempotent|repeat-safe) D1 migration chain/i.test(text);
  const hardFreeze = /HARD FREEZE|PRODUCTION DEPLOYMENT LOCKED|MANUAL FALLBACK DEPLOYMENT LOCKED/i.test(text);

  check(`${relative} exists`, Boolean(text));
  check(`${relative} avoids blocking remote SQL export during production`, exportLines.length === 0);

  if (hardFreeze) {
    frozenWorkflows += 1;
    workflowStates.push({ relative, state: 'hard-frozen', executableDeploy, d1Mutation, bookmarkCount: bookmarkLines.length });
    check(`${relative} is explicitly hard frozen`, /HARD FREEZE/i.test(text));
    check(`${relative} hard freeze contains no executable deployment command`, !executableDeploy);
    check(`${relative} hard freeze contains no D1 migration or mutation command`, !d1Mutation);
    check(`${relative} hard freeze requires no rollback bookmark because it cannot mutate D1`, bookmarkLines.length === 0);
    continue;
  }

  activeMigrationWorkflows += 1;
  workflowStates.push({ relative, state: 'active', executableDeploy, d1Mutation, bookmarkCount: bookmarkLines.length });
  check(`${relative} captures exactly one D1 Time Travel bookmark`, bookmarkLines.length === 1);
  const command = bookmarkLines[0] || '';
  check(`${relative} requests machine-readable bookmark JSON`, /\s--json(?:\s|$)/.test(command));
  check(`${relative} validates a bookmark before migrations`, /bookmark/.test(text) && /d1-rollback-proof\.json/.test(text));
  const bookmarkIndex = text.indexOf('d1 time-travel info matrix-members');
  const migrationHeaderIndex = text.search(/Apply (?:idempotent|repeat-safe) D1 migration chain/i);
  const migrationCommandIndexes = [...text.matchAll(/wrangler@latest\s+d1\s+execute\s+matrix-members\s+--remote\s+--file=/g)]
    .map((match) => Number(match.index));
  check(
    `${relative} keeps migrations after rollback capture`,
    bookmarkIndex >= 0 &&
      migrationHeaderIndex > bookmarkIndex &&
      migrationCommandIndexes.length >= 1 &&
      migrationCommandIndexes.every((index) => index > bookmarkIndex),
  );
  check(`${relative} includes phase 9 AI orchestration migration`, /migrations\/phase9_ai_resource_orchestration\.sql/.test(text));
  check(`${relative} includes phase 10 AI autonomy migration`, /migrations\/phase10_ai_autonomy\.sql/.test(text));
  check(`${relative} has an executable guarded deployment command`, executableDeploy);
}

const githubRunId = String(process.env.GITHUB_RUN_ID || '');
const githubWorkflow = String(process.env.GITHUB_WORKFLOW || '');
const fullyFrozenRepository = frozenWorkflows === workflows.length && activeMigrationWorkflows === 0;
const authorizedControlledRerun =
  githubRunId === '30091864423' &&
  /Matrix Reprogrammed Controlled Production Deploy/i.test(githubWorkflow);
const nonDeployingRuntimeRehearsal = /Production Runtime Contract Rehearsal/i.test(githubWorkflow);
const validTopology =
  activeMigrationWorkflows === 1 ||
  (fullyFrozenRepository && authorizedControlledRerun) ||
  (fullyFrozenRepository && nonDeployingRuntimeRehearsal);

check('production deployment topology is singular or explicitly frozen', validTopology);
check(
  'authorized controlled rerun is the only frozen-repository production exception',
  !authorizedControlledRerun || (fullyFrozenRepository && githubRunId === '30091864423'),
);

const effectiveActiveMigrationWorkflows =
  activeMigrationWorkflows === 1 || authorizedControlledRerun ? 1 : 0;

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const dryRun = spawnSync(npx, ['--yes', 'wrangler@latest', 'deploy', '--dry-run'], {
  cwd: root,
  encoding: 'utf8',
  env: process.env,
  maxBuffer: 20 * 1024 * 1024,
  shell: process.platform === 'win32',
});
const dryRunOutput = `${dryRun.stdout || ''}\n${dryRun.stderr || ''}\n${dryRun.error?.message || ''}`.trim();
check('Wrangler production Worker and asset bundle dry-run passes', dryRun.status === 0);

const report = {
  ok: issues.length === 0,
  generatedAt: new Date().toISOString(),
  purpose: 'Require rollback protection for the singular production mutation path, accept genuinely hard-frozen repository workflows, recognise only the exact pre-authorised controlled rerun, prevent blocking SQL exports, and prove the Cloudflare bundle can be packaged.',
  rollbackMethod: 'Cloudflare D1 Time Travel bookmark',
  activeMigrationWorkflows,
  effectiveActiveMigrationWorkflows,
  frozenWorkflows,
  fullyFrozenRepository,
  executionContext: {
    githubRunId: githubRunId || null,
    githubWorkflow: githubWorkflow || null,
    authorizedControlledRerun,
    nonDeployingRuntimeRehearsal,
  },
  workflowStates,
  checks,
  wranglerDryRun: {
    exitCode: dryRun.status,
    signal: dryRun.signal || null,
    output: dryRunOutput.slice(-12000),
  },
  issues,
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'd1-export-command-test.json'), JSON.stringify(report, null, 2));
if (!report.ok) {
  console.error('D1 ROLLBACK AND CLOUDFLARE BUNDLE TEST FAILED');
  for (const issue of issues) console.error(`- ${issue}`);
  if (dryRunOutput) console.error(dryRunOutput.slice(-6000));
  process.exit(1);
}
console.log(
  authorizedControlledRerun
    ? 'D1 ROLLBACK AND CLOUDFLARE BUNDLE TEST PASSED: the exact authorised controlled rerun is recognised over a hard-frozen checkout, repository fallbacks cannot mutate production, and Wrangler can package the release.'
    : nonDeployingRuntimeRehearsal
      ? 'D1 ROLLBACK AND CLOUDFLARE BUNDLE TEST PASSED: repository production workflows remain hard frozen and the non-deploying rehearsal can package the exact release bundle.'
      : 'D1 ROLLBACK AND CLOUDFLARE BUNDLE TEST PASSED: the single active deployment path is rollback-protected, frozen fallbacks cannot mutate production, and Wrangler can package the release.',
);
