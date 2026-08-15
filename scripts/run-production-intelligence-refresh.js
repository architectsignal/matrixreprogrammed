const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const downloads = path.join(root, 'downloads');
fs.mkdirSync(downloads, { recursive: true });

const commands = [
  ['scripts/repair-investigation-source-registry.js'],
  ['scripts/source-adapter-contract-test.js'],
  ['scripts/run-investigation-machine.js', 'daily'],
  ['scripts/run-source-adapters.js', 'daily'],
  ['scripts/update-live-intel.js'],
  ['scripts/record-live-intel-check.js'],
  ['scripts/update-seven-day-intel.js'],
  ['scripts/build-outcome-briefings.js'],
  ['scripts/build-daily-brain-brief.js'],
  ['scripts/build-investigation-pages.js'],
  ['scripts/build-mission-intelligence-10.js'],
  ['scripts/build-live-intel-machine.js'],
  // These are direct dependants of the refreshed Live Intel window and are
  // themselves production-freshness datasets. Rebuild them here before the
  // strict source-only guard instead of relying on the separate scheduled
  // Live Intel workflow to have run inside the previous 26 hours.
  ['scripts/build-daily-epstein-update.js'],
  ['scripts/build-card-live-updates.js'],
  ['scripts/patch-conclusion-integrity-cards.js'],
  ['scripts/build-behind-the-curtain-tier-registry.js'],
  ['scripts/patch-behind-the-curtain-tier-ui.js'],
  ['scripts/build-behind-the-curtain.js'],
  // Daily Watch is a freshness-gated derived dataset. Rebuild it from the
  // refreshed investigation and family-access inputs before the source guard.
  ['scripts/enforce-mission-data-contracts.js'],
  ['scripts/build-daily-watch.js']
];

const report = {
  ok: false,
  generatedAt: new Date().toISOString(),
  degraded: false,
  commands: [],
  freshnessGuard: null,
  freshnessScope: 'prebuild-source-only'
};

function runNode(script, args = [], extraEnv = {}) {
  const startedAt = new Date().toISOString();
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ...extraEnv },
    maxBuffer: 1024 * 1024 * 100
  });
  const stdout = String(result.stdout || '');
  const stderr = String(result.stderr || '');
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  return {
    command: [process.execPath, script, ...args].join(' '),
    script,
    args,
    startedAt,
    completedAt: new Date().toISOString(),
    status: Number.isInteger(result.status) ? result.status : 1,
    signal: result.signal || null,
    error: result.error ? String(result.error.message || result.error) : null,
    stdoutTail: stdout.slice(-4000),
    stderrTail: stderr.slice(-4000)
  };
}

for (const [script, ...args] of commands) {
  if (!fs.existsSync(path.join(root, script))) {
    report.commands.push({
      command: `${process.execPath} ${script} ${args.join(' ')}`.trim(),
      script,
      args,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      status: 1,
      signal: null,
      error: 'script missing',
      stdoutTail: '',
      stderrTail: ''
    });
    console.error(`Refresh command missing: ${script}`);
    continue;
  }
  console.log(`\n===== PRODUCTION REFRESH: ${script}${args.length ? ` ${args.join(' ')}` : ''} =====`);
  report.commands.push(runNode(script, args));
}

const failed = report.commands.filter(item => item.status !== 0);
report.degraded = failed.length > 0;
if (failed.length) {
  console.warn(`Production refresh completed with ${failed.length} failed command(s). Existing source freshness will now decide whether deployment may continue.`);
  for (const item of failed) console.warn(`- ${item.script}: exit ${item.status}${item.error ? ` (${item.error})` : ''}`);
}

// This gate runs before the complete site build, so it validates refreshed
// source datasets only. The canonical post-build freshness step later checks
// both source and _site output and remains the final deployment authority.
const freshness = runNode('scripts/production-freshness-guard.js', [], {
  MATRIX_REQUIRE_PRODUCTION_FRESHNESS: '1',
  MATRIX_FRESHNESS_SOURCE_ONLY: '1'
});
report.freshnessGuard = freshness;
report.ok = freshness.status === 0;
report.completedAt = new Date().toISOString();
fs.writeFileSync(path.join(downloads, 'production-intelligence-refresh.json'), `${JSON.stringify(report, null, 2)}\n`);

if (freshness.status !== 0) {
  console.error('Production intelligence refresh cannot continue: the current source datasets did not pass the strict prebuild freshness guard.');
  process.exit(1);
}

if (failed.length) {
  console.warn('Strict source freshness passed. Deployment may continue using the current verified source datasets; failed refresh commands are recorded in downloads/production-intelligence-refresh.json.');
} else {
  console.log('Production intelligence refresh completed successfully and strict prebuild source freshness passed.');
}
