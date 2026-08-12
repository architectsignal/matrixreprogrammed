'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const workflowsDir = path.join(root, '.github', 'workflows');
const failures = [];
const checked = [];

function isAutonomousWorkflow(text) {
  return /(^|\n)\s*(schedule|workflow_run):\s*/m.test(text);
}

function canWriteContents(text) {
  return /(^|\n)\s*contents:\s*write\s*$/m.test(text);
}

function pushesGit(text) {
  return /\bgit\s+push\b/.test(text);
}

function hasFreezeGuard(text) {
  return /release-freeze-guard\.js\s+--is-frozen/.test(text)
    || /production-release\.freeze/.test(text);
}

for (const name of fs.readdirSync(workflowsDir).filter(name => /\.ya?ml$/i.test(name)).sort()) {
  const file = path.join(workflowsDir, name);
  const text = fs.readFileSync(file, 'utf8');
  if (!isAutonomousWorkflow(text) || !canWriteContents(text) || !pushesGit(text)) continue;
  const guarded = hasFreezeGuard(text);
  checked.push({ workflow: name, guarded });
  if (!guarded) failures.push(`${name}: autonomous contents-write workflow can git push without a production release freeze guard`);
}

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  checked,
  failures,
  policy: 'Every scheduled or workflow_run GitHub Action with contents: write and git push must fail closed on the controlled production release freeze before pushing.'
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'autonomous-main-write-freeze-audit.json'), `${JSON.stringify(report, null, 2)}\n`);

if (failures.length) {
  console.error(`AUTONOMOUS MAIN WRITE FREEZE AUDIT FAILED: ${failures.length}`);
  failures.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}
console.log(`Autonomous main-write freeze audit passed: ${checked.length} scheduled/workflow_run writer(s) are release-freeze guarded.`);
