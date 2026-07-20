const fs = require('fs');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');

const root = process.cwd();
const downloads = path.join(root, 'downloads');
fs.mkdirSync(downloads, { recursive: true });

const startedAt = new Date().toISOString();
const report = {
  startedAt,
  finishedAt: null,
  ok: true,
  summary: {},
  commands: [],
  systems: [],
  files: [],
  warnings: [],
  recommendations: [],
  architecture: {
    workerStack: 'src/worker-production.js -> strict email/member/PayPal boundaries -> D1 forum persistence -> legacy static application',
    forumStorage: 'Cloudflare D1 authoritative; KV excluded from public forum runtime',
    paymentStatus: 'runtime-gated and Cloudflare-dashboard-managed; checkout requires credentials, environment agreement, D1 activation, live confirmation and three active plans',
    deploymentModel: 'one automatic canonical Cloudflare deploy plus one manual fallback'
  }
};

function exists(name) { return fs.existsSync(path.join(root, name)); }
function read(name) { return exists(name) ? fs.readFileSync(path.join(root, name), 'utf8') : ''; }
function commitSha() {
  const supplied = process.env.DEPLOY_COMMIT_SHA || process.env.GITHUB_SHA || '';
  if (/^[a-f0-9]{40}$/i.test(supplied)) return supplied;
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(); }
  catch { return supplied || 'unknown'; }
}
const deploySha = commitSha();

function addSystem(name, ok, details = {}, critical = true) {
  const item = { name, ok: Boolean(ok), critical, ...details };
  report.systems.push(item);
  if (!item.ok && critical) report.ok = false;
  if (!item.ok && !critical) report.warnings.push(`${name}: advisory check failed`);
  return item.ok;
}
function run(label, command, args, options = {}) {
  const critical = options.critical !== false;
  const started = new Date().toISOString();
  console.log(`\n=== ${label} ===`);
  console.log(`${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    shell: false,
    maxBuffer: 50 * 1024 * 1024,
    env: { ...process.env, FULL_SYSTEM_AUDIT: '1', DEPLOY_COMMIT_SHA: deploySha, SOURCE_DOCUMENTS_PER_RUN: process.env.SOURCE_DOCUMENTS_PER_RUN || '0', ...(options.env || {}) }
  });
  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  const entry = { label, command: [command, ...args].join(' '), status: result.status, ok: result.status === 0, critical, startedAt: started, finishedAt: new Date().toISOString(), stdoutTail: stdout.slice(-6000), stderrTail: stderr.slice(-6000) };
  report.commands.push(entry);
  if (!entry.ok && critical) report.ok = false;
  if (!entry.ok && !critical) report.warnings.push(`${label}: advisory command exited ${result.status}`);
  return entry;
}
function countFiles(ext) {
  let count = 0;
  const ignored = new Set(['.git', 'node_modules', '_site', '.wrangler']);
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ignored.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(ext)) count += 1;
    }
  }
  walk(root);
  return count;
}
function needFile(name, label = name, critical = true) {
  const ok = exists(name);
  report.files.push({ file: name, ok, label, critical });
  if (!ok && critical) report.ok = false;
  if (!ok && !critical) report.warnings.push(`Optional file missing: ${name}`);
  return ok;
}
function needText(file, text, label = text, critical = true) {
  const ok = exists(file) && read(file).includes(text);
  report.files.push({ file, ok, label, critical });
  if (!ok && critical) report.ok = false;
  if (!ok && !critical) report.warnings.push(`${file} missing advisory marker ${label}`);
  return ok;
}
function forbidText(file, text, label = text, critical = true) {
  const ok = !exists(file) || !read(file).includes(text);
  report.files.push({ file, ok, label: `forbid ${label}`, critical });
  if (!ok && critical) report.ok = false;
  if (!ok && !critical) report.warnings.push(`${file} contains advisory-forbidden marker ${label}`);
  return ok;
}

run('Complete normal build', 'npm', ['run', 'build']);
run('D1-authoritative forum contract', 'node', ['scripts/forum-persistence-d1-test.js']);
run('Canonical final production reconciliation', 'node', ['scripts/final-production-reconcile.js']);
run('Production freshness guard', 'node', ['scripts/production-freshness-guard.js']);
run('Production synchronization contract', 'node', ['scripts/production-sync-test.js']);
run('Current site-function harmony', 'node', ['scripts/site-function-harmony-test.js']);
run('Legacy regression and Cloudflare pressure gate', 'node', ['scripts/cloudflare-focused-pressure-wrapper.js']);
run('Final production deploy guard', 'node', ['scripts/production-deploy-guard.js']);
run('Static site QA audit', 'node', ['scripts/audit-site.js']);
run('Static local-link audit', 'node', ['tools/link-audit.js']);
run('Exhaustive public output audit', 'node', ['scripts/exhaustive-public-site-audit-v2.js']);
run('Search and investigation smoke test', 'node', ['scripts/search-investigation-smoke-test.js']);

const focused = [
  ['Ask Matrix free/local search', 'scripts/free-ask-matrix-search-test.js'],
  ['Membership authentication', 'scripts/membership-auth-test.js'],
  ['Phase 5 authentication and entitlements', 'scripts/phase5-auth-entitlement-runner.mjs'],
  ['Phase 6 PayPal state machine', 'scripts/phase6-paypal-state-runner.mjs'],
  ['Forum board split', 'scripts/forum-board-split-test.js'],
  ['Live Intel', 'scripts/live-intel-pressure-test.js'],
  ['Migration flow', 'scripts/migration-flow-test.js'],
  ['Epstein Watch', 'scripts/epstein-watch-pressure-test.js'],
  ['Atlas layers', 'scripts/atlas-layers-test.js'],
  ['Cloudflare Worker routes', 'scripts/cloudflare-worker-routes-test.js'],
  ['Intel analytics', 'scripts/intel-analytics-pressure-test.js'],
  ['Mission intelligence', 'scripts/mission-intelligence-10-test.js'],
  ['Evidence badges', 'scripts/evidence-badge-pressure-test.js'],
  ['Premier resources', 'scripts/premier-resource-pressure-test.js']
];
for (const [label, script] of focused) {
  if (exists(script)) run(label, 'node', [script]);
  else report.warnings.push(`${label}: ${script} is not present`);
}

const checks = [
  ['Homepage', 'index.html', 'MAP THE STRUCTURE. READ THE SIGNALS.'],
  ['Homepage security route', 'index.html', 'Security Tools'],
  ['Homepage dark-web route', 'index.html', 'Dark Web Safety'],
  ['Free membership', 'membership.html', 'Free Member'],
  ['Membership €3 tier', 'membership.html', '€3'],
  ['Membership €6 tier', 'membership.html', '€6'],
  ['Membership €9 tier', 'membership.html', '€9'],
  ['Membership PayPal runtime', 'membership.html', 'paypal-membership.js'],
  ['Membership disabled-by-default notice', 'membership.html', 'Paid checkout remains disabled until the sandbox or live activation gates are deliberately enabled.'],
  ['Strict Worker entrypoint', 'wrangler.toml', 'main = "src/worker-production.js"'],
  ['Strict forum boundary', 'src/worker-production.js', 'non-authoritative-forum-response-blocked'],
  ['Strict PayPal boundary', 'src/worker-production.js', 'non-authoritative-paypal-response-blocked'],
  ['PayPal Worker route', 'src/worker-paypal-subscriptions.js', '/api/paypal/webhook'],
  ['D1 forum persistence', 'src/worker-forum-persistence.js', 'Cloudflare D1 MEMBERS_DB.forum_posts'],
  ['D1-only public runtime', 'src/worker-production.js', 'FORUM_POSTS: undefined'],
  ['Commit-bound health Worker', 'deploy-health.json', 'src/worker-production.js'],
  ['Commit-bound PayPal health', 'deploy-health.json', '"paymentStatus": "runtime-gated-dashboard-managed"'],
  ['Ask Matrix', 'search.html', 'SEARCH THE MACHINE'],
  ['Ask Matrix local index', 'search.js', 'search-index.json'],
  ['Live Intel', 'live-intel.html', 'LIVE INTEL'],
  ['Evidence Archive', 'evidence-archive.html', 'EVIDENCE ARCHIVE'],
  ['Geographic Atlas', 'geographic-power-atlas.html', 'GEOGRAPHIC POWER ATLAS'],
  ['Public Data Lab', 'data-lab.html', 'PUBLIC DATA'],
  ['Main board', 'forum.html', 'data-board="main"'],
  ['Speculation board', 'dark-speculation-forum.html', 'data-board="speculation"'],
  ['Epstein sighting board', 'epstein-alive-board.html', 'data-board="epstein-alive"'],
  ['Cloudflare output', '_site/index.html', 'MAP THE STRUCTURE. READ THE SIGNALS.'],
  ['Built PayPal membership', '_site/membership.html', 'paypal-membership.js'],
  ['Built health D1', '_site/deploy-health.json', 'src/worker-production.js']
];
for (const [name, file, marker] of checks) addSystem(name, needText(file, marker, marker), { file, marker });
forbidText('membership.html', 'Coming soon — no payment taken', 'obsolete deferred membership page');
forbidText('membership.html', '€19/month', 'legacy €19 tier');
forbidText('membership.html', '€49/month', 'legacy €49 tier');
forbidText('_site/membership.html', 'Coming soon — no payment taken', 'built obsolete membership page');

for (const file of [
  'deploy-manifest.json', 'deploy-health.json', 'deploy-health.html', 'downloads/deploy-health.json',
  'downloads/production-sync-test.json', 'downloads/production-freshness-guard.json',
  'downloads/production-deploy-guard-report.json', 'downloads/forum-persistence-d1-test.json',
  'downloads/cloudflare-worker-routes-test.json', 'downloads/cloudflare-focused-pressure-wrapper.json',
  'downloads/site-function-harmony-report.json', 'downloads/exhaustive-public-site-audit.json',
  'downloads/search-investigation-smoke-test.json', 'downloads/phase5-auth-entitlement-test/summary.json',
  'downloads/phase6-paypal-state-test/summary.json', 'data/daily-investigation-conclusions.json',
  'data/weekly-investigation-conclusions.json', 'data/daily-power-conclusions.json', 'data/outcome-briefings.json'
]) needFile(file);

report.summary = {
  deploySha,
  htmlFiles: countFiles('.html'),
  javascriptFiles: countFiles('.js'),
  jsonFiles: countFiles('.json'),
  commandCount: report.commands.length,
  failedCriticalCommands: report.commands.filter(command => command.critical && !command.ok).length,
  advisoryCommandFailures: report.commands.filter(command => !command.critical && !command.ok).length,
  systemCount: report.systems.length,
  failedCriticalSystems: report.systems.filter(system => system.critical && !system.ok).length,
  warningCount: report.warnings.length
};
report.finishedAt = new Date().toISOString();
if (report.summary.failedCriticalCommands) report.recommendations.push('Fix the first critical command failure before treating the repository as release-ready.');
if (report.summary.failedCriticalSystems) report.recommendations.push('A required current-production marker is missing; inspect build order and final reconciliation.');
if (!report.summary.failedCriticalCommands && !report.summary.failedCriticalSystems) report.recommendations.push('Current production architecture passed: strict Worker, D1 forum, member entitlements, server-gated PayPal, current routes and commit-bound health.');

fs.writeFileSync(path.join(downloads, 'full-system-audit.json'), JSON.stringify(report, null, 2));
const lines = [
  '# Full System Audit', '', `Started: ${report.startedAt}`, `Finished: ${report.finishedAt}`,
  `Status: ${report.ok ? 'PASS' : 'FAIL'}`, `Commit: ${deploySha}`, '', '## Architecture', '',
  `- Worker stack: ${report.architecture.workerStack}`, `- Forum: ${report.architecture.forumStorage}`,
  `- Payments: ${report.architecture.paymentStatus}`, `- Deployments: ${report.architecture.deploymentModel}`, '',
  '## Summary', '', `- Commands: ${report.summary.commandCount}`,
  `- Failed critical commands: ${report.summary.failedCriticalCommands}`, `- Systems: ${report.summary.systemCount}`,
  `- Failed critical systems: ${report.summary.failedCriticalSystems}`, `- Warnings: ${report.summary.warningCount}`, '',
  '## Commands', '', ...report.commands.map(command => `- ${command.ok ? 'PASS' : (command.critical ? 'FAIL' : 'WARN')} — ${command.label} — \`${command.command}\``), '',
  '## Systems', '', ...report.systems.map(system => `- ${system.ok ? 'PASS' : (system.critical ? 'FAIL' : 'WARN')} — ${system.name} — ${system.file || ''}`), '',
  '## Warnings', '', ...(report.warnings.length ? report.warnings.map(warning => `- ${warning}`) : ['- None']), '',
  '## Recommendations', '', ...report.recommendations.map(recommendation => `- ${recommendation}`)
];
fs.writeFileSync(path.join(downloads, 'full-system-audit.md'), lines.join('\n'));
console.log(`\nFULL SYSTEM AUDIT ${report.ok ? 'PASSED' : 'FAILED'}`);
console.log('Report: downloads/full-system-audit.json and downloads/full-system-audit.md');
if (!report.ok) process.exit(1);
