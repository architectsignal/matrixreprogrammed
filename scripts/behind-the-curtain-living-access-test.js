const fs = require('fs');
const path = require('path');

const root = process.cwd();
const read = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const must = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const assert = (ok, message) => {
  if (!ok) throw new Error(message);
};

const data = read('data/behind-the-curtain-living-access.json');
const intake = read('data/behind-the-curtain-living-access-intake.json');
const history = read('data/behind-the-curtain-living-access-history.json');
const continuity = read('data/behind-the-curtain-continuity-layers.json');
const html = must('behind-the-curtain-access.html');
const js = must('behind-the-curtain-access.js');

const score = (candidate) =>
  Math.round(
    Object.entries(data.scoreDimensions).reduce(
      (total, [key, weight]) => total + Number(candidate.dimensions[key]) * Number(weight),
      0,
    ) / 10,
  ) / 10;

assert(
  Object.values(data.scoreDimensions).reduce((a, b) => a + Number(b), 0) === 100,
  'Living score weights must total 100',
);

const ranked = data.candidates
  .filter((candidate) => candidate.rank && candidate.rank <= 10)
  .sort((a, b) => a.rank - b.rank);

assert(ranked.length === 10, 'Living public ranking must contain exactly ten people');
assert(new Set(ranked.map((candidate) => candidate.id)).size === 10, 'Living candidate IDs must be unique');

ranked.forEach((candidate, index) => {
  assert(candidate.rank === index + 1, `${candidate.id} rank is not sequential`);
  assert(candidate.status === 'verified_current', `${candidate.id} is not verified current`);
  assert(
    candidate.currentRole && candidate.verifiedAt && candidate.nextReviewDue,
    `${candidate.id} lacks role verification dates`,
  );
  assert(
    Math.abs(score(candidate) - Number(candidate.accessScore)) < 0.05,
    `${candidate.id} score does not match weighted dimensions`,
  );
  assert(candidate.sourceIds.length >= 1, `${candidate.id} lacks role sources`);
  assert(
    candidate.strongestCounterargument && candidate.removalTriggers.length,
    `${candidate.id} lacks red-team or removal rules`,
  );
});

for (let index = 1; index < ranked.length; index += 1) {
  assert(
    ranked[index - 1].accessScore >= ranked[index].accessScore,
    'Living ranking is not score sorted',
  );
}

const sourceIds = new Set(data.sources.map((source) => source.id));
data.sources.forEach((source) =>
  assert(
    /^https:\/\//.test(source.url) && source.establishes && source.doesNotEstablish,
    `${source.id} lacks bounded HTTPS sourcing`,
  ),
);
ranked.forEach((candidate) =>
  candidate.sourceIds.forEach((id) => assert(sourceIds.has(id), `${candidate.id} references missing source ${id}`)),
);

assert(Array.isArray(intake.entries), 'Living intake entries missing');
assert(history.snapshots.length >= 1, 'Living historical archive is empty');
assert(
  history.snapshots.every((snapshot) => snapshot.asOf && snapshot.reason && snapshot.ranking.length === 10),
  'Living snapshot is incomplete',
);
assert(
  continuity.layers.length === 10 && continuity.evolutionPolicy?.continuous === true,
  'Continuity evolution model is incomplete',
);
assert(
  html.includes('id="living-top-ten"') &&
    html.includes('id="continuity-layer"') &&
    html.includes('id="living-history"'),
  'Living Access page sections missing',
);
assert(
  js.includes('behind-the-curtain-living-access.json') &&
    js.includes('behind-the-curtain-living-access-history.json') &&
    js.includes('behind-the-curtain-continuity-layers.json'),
  'Living client data feeds missing',
);

const deployWorkflow = must('.github/workflows/deploy.yml');
const fallbackWorkflow = must('.github/workflows/deploy-production.yml');
const dispatcherWorkflow = must('.github/workflows/one-shot-dispatch-controlled-production.yml');
const hasProductionDeployCommand = (text) => {
  const normalized = text.toLowerCase();
  return normalized.includes('wrangler@latest deploy') || normalized.includes('wrangler deploy');
};
const guardedManualRelease =
  deployWorkflow.includes('name: Matrix Reprogrammed Controlled Production Deploy') &&
  deployWorkflow.includes('workflow_dispatch:') &&
  !deployWorkflow.includes('\n  push:') &&
  !deployWorkflow.includes('\n  schedule:') &&
  deployWorkflow.includes('inputs.confirmation') &&
  deployWorkflow.includes('DEPLOY MATRIX REPROGRAMMED') &&
  deployWorkflow.includes('cancel-in-progress: false') &&
  hasProductionDeployCommand(deployWorkflow);
const authorizedControlledDeploy =
  process.env.MATRIX_AUTHORIZED_CONTROLLED_DEPLOY === 'true' || guardedManualRelease;

if (authorizedControlledDeploy) {
  assert(
    deployWorkflow.includes('name: Matrix Reprogrammed Controlled Production Deploy'),
    'Authorized release must use the named controlled production workflow',
  );
  assert(deployWorkflow.includes('workflow_dispatch:'), 'Authorized release must remain manual-only');
  assert(!deployWorkflow.includes('\n  push:'), 'Authorized release must not have a push trigger');
  assert(!deployWorkflow.includes('\n  schedule:'), 'Authorized release must not have a schedule trigger');
  assert(deployWorkflow.includes('inputs.confirmation'), 'Authorized release lacks the confirmation input gate');
  assert(
    deployWorkflow.includes('DEPLOY MATRIX REPROGRAMMED'),
    'Authorized release lacks the exact owner confirmation phrase',
  );
  assert(
    deployWorkflow.includes('cancel-in-progress: false'),
    'Authorized release must not replace an active production run',
  );
  assert(
    hasProductionDeployCommand(deployWorkflow),
    'Authorized controlled workflow does not contain a production deploy command',
  );
  assert(
    !hasProductionDeployCommand(fallbackWorkflow),
    'Manual fallback must remain production-frozen during the authorized release',
  );
  assert(
    !hasProductionDeployCommand(dispatcherWorkflow),
    'One-shot dispatcher must not contain a direct Cloudflare deploy command',
  );
} else {
  for (const relative of [
    '.github/workflows/deploy.yml',
    '.github/workflows/deploy-production.yml',
    '.github/workflows/one-shot-dispatch-controlled-production.yml',
  ]) {
    const text = must(relative);
    assert(!hasProductionDeployCommand(text), `${relative} must remain production-frozen`);
  }
}

console.log(
  `Behind the Curtain Living Access PASS: ${ranked.length}/10 current people, ${data.sources.length} bounded sources, ${history.snapshots.length} historical snapshots, ${continuity.layers.length} continuity mechanisms; ${
    authorizedControlledDeploy ? 'guarded one-run production authorization verified' : 'production remains frozen'
  }.`,
);
