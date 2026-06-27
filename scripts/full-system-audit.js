const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const downloads = path.join(root, 'downloads');
if (!fs.existsSync(downloads)) fs.mkdirSync(downloads, { recursive: true });

const startedAt = new Date().toISOString();
const report = {
  startedAt,
  finishedAt: null,
  ok: true,
  summary: {},
  commands: [],
  systems: [],
  files: [],
  recommendations: []
};

function exists(name) { return fs.existsSync(path.join(root, name)); }
function read(name) { return fs.readFileSync(path.join(root, name), 'utf8'); }
function addSystem(name, ok, details = {}) {
  report.systems.push({ name, ok: Boolean(ok), ...details });
  if (!ok) report.ok = false;
}
function run(label, command, args, options = {}) {
  const started = new Date().toISOString();
  console.log(`\n=== ${label} ===`);
  console.log(`${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    shell: false,
    maxBuffer: 30 * 1024 * 1024,
    env: { ...process.env, FULL_SYSTEM_AUDIT: '1' }
  });
  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  const entry = {
    label,
    command: [command, ...args].join(' '),
    status: result.status,
    ok: result.status === 0,
    startedAt: started,
    finishedAt: new Date().toISOString(),
    stdoutTail: stdout.slice(-5000),
    stderrTail: stderr.slice(-5000)
  };
  report.commands.push(entry);
  if (result.status !== 0 && !options.allowFail) report.ok = false;
  return entry;
}
function countFiles(ext) {
  let count = 0;
  const ignored = new Set(['.git','node_modules','_site','.wrangler']);
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
function needFile(name, label = name) {
  const ok = exists(name);
  report.files.push({ file: name, ok, label });
  if (!ok) report.ok = false;
  return ok;
}
function needText(file, text, label = text) {
  const ok = exists(file) && read(file).includes(text);
  report.files.push({ file, ok, label });
  if (!ok) report.ok = false;
  return ok;
}

// 1. Full build generates every page and runs the normal pressure chain.
run('Full build and normal pressure chain', 'npm', ['run', 'build']);

// 2. Repeat the high-value audits after build so late overwrites are caught.
run('Postbuild site-wide function audit', 'node', ['scripts/site-wide-function-audit.js', '--postbuild']);
run('Static site QA audit', 'node', ['scripts/audit-site.js']);
run('Static link audit', 'node', ['tools/link-audit.js']);

// 3. Focused critical subsystem tests. These catch the exact systems that have broken before.
const focused = [
  ['Ask Matrix free/local search', ['scripts/free-ask-matrix-search-test.js']],
  ['Forum three-board split', ['scripts/forum-board-split-test.js']],
  ['Live Intel', ['scripts/live-intel-pressure-test.js']],
  ['Migration flow / figures', ['scripts/migration-flow-test.js']],
  ['Epstein Watch', ['scripts/epstein-watch-pressure-test.js']],
  ['Atlas layers', ['scripts/atlas-layers-test.js']],
  ['Cloudflare Worker routes', ['scripts/cloudflare-worker-routes-test.js']],
  ['Intel analytics / daily drops', ['scripts/intel-analytics-pressure-test.js']],
  ['Ten out of ten usefulness', ['scripts/ten-out-of-ten-pressure-test.js']],
  ['Subject intelligence hubs', ['scripts/subject-intelligence-hubs-pressure-test.js']],
  ['Source document vault', ['scripts/source-document-vault-pressure-test.js']],
  ['Evidence badges', ['scripts/evidence-badge-pressure-test.js']],
  ['Premier resources', ['scripts/premier-resource-pressure-test.js']],
  ['Global risk clocks', ['scripts/global-risk-clocks-test.js']]
];
for (const [label, args] of focused) run(label, 'node', args);

// 4. Second build and a smaller final pass catch order-dependent overwrites.
run('Second full build for overwrite detection', 'npm', ['run', 'build']);
run('Final site QA audit', 'node', ['scripts/audit-site.js']);
run('Final Cloudflare route audit', 'node', ['scripts/cloudflare-worker-routes-test.js']);
run('Final Ask Matrix audit', 'node', ['scripts/free-ask-matrix-search-test.js']);

// 5. Report concrete system markers.
const htmlCount = countFiles('.html');
const jsCount = countFiles('.js');
const jsonCount = countFiles('.json');
report.summary = {
  htmlFiles: htmlCount,
  javascriptFiles: jsCount,
  jsonFiles: jsonCount,
  commandCount: report.commands.length,
  failedCommands: report.commands.filter(c => !c.ok).length,
  systemCount: 0,
  failedSystems: 0
};

const checks = [
  ['Homepage', 'index.html', 'FOLLOW THE FILES.'],
  ['Main board', 'forum.html', 'data-board="main"'],
  ['Speculation board', 'dark-speculation-forum.html', 'data-board="speculation"'],
  ['Epstein sighting board', 'epstein-alive-board.html', 'data-board="epstein-alive"'],
  ['Hard board worker route', 'src/worker.js', '/submit-speculation-post'],
  ['Ask Matrix', 'search.html', 'id="phase-twelve-authority-engine"'],
  ['Ask Matrix local index', 'search.js', 'search-index.json'],
  ['Live Intel', 'live-intel.html', 'Latest Actionable Updates'],
  ['Epstein files', 'epstein-files.html', 'Evidence Boundary'],
  ['Migration figures', 'news.html', 'Migration / Irregular Immigration'],
  ['Migration numeric marker', 'news.html', '237.5K'],
  ['Power Atlas', 'power-atlas.html', 'phase-two-atlas-engine'],
  ['Evidence Vault', 'evidence-vault.html', 'phase-three-evidence-engine'],
  ['Download Center', 'download-center.html', 'Dossier Packs'],
  ['Deploy status', 'deploy-status.json', 'hardBoardRoutes'],
  ['Cloudflare output', '_site/index.html', 'FOLLOW THE FILES.']
];
for (const [name, file, marker] of checks) addSystem(name, needText(file, marker, marker), { file, marker });

for (const file of [
  'downloads/site-wide-function-audit.json',
  'downloads/site-wide-function-audit.md',
  'site-quality-report.html',
  'site-freshness-report.html',
  'deploy-status.json',
  'downloads/deploy-status.json',
  'data/forum-board-split.json',
  'downloads/seven-day-intel.json',
  'downloads/the-black-file-matrix-reprogrammed.pdf'
]) needFile(file);

report.summary.systemCount = report.systems.length;
report.summary.failedSystems = report.systems.filter(s => !s.ok).length;
report.finishedAt = new Date().toISOString();

if (report.summary.failedCommands) report.recommendations.push('Open the failed command tail in downloads/full-system-audit.json and fix the first failing subsystem before rerunning.');
if (report.summary.failedSystems) report.recommendations.push('Generated output exists but one or more required live markers are missing. Check build order and late overwrite scripts.');
if (!report.summary.failedCommands && !report.summary.failedSystems) report.recommendations.push('All audited systems passed. Deploy is safe from the audited checks.');

fs.writeFileSync(path.join(downloads, 'full-system-audit.json'), JSON.stringify(report, null, 2));
const lines = [
  '# Full System Audit', '',
  `Started: ${report.startedAt}`,
  `Finished: ${report.finishedAt}`,
  `Status: ${report.ok ? 'PASS' : 'FAIL'}`, '',
  '## Summary', '',
  `- HTML files: ${report.summary.htmlFiles}`,
  `- JavaScript files: ${report.summary.javascriptFiles}`,
  `- JSON files: ${report.summary.jsonFiles}`,
  `- Commands run: ${report.summary.commandCount}`,
  `- Failed commands: ${report.summary.failedCommands}`,
  `- Systems checked: ${report.summary.systemCount}`,
  `- Failed systems: ${report.summary.failedSystems}`, '',
  '## Commands', '',
  ...report.commands.map(c => `- ${c.ok ? 'PASS' : 'FAIL'} — ${c.label} — \`${c.command}\``), '',
  '## Systems', '',
  ...report.systems.map(s => `- ${s.ok ? 'PASS' : 'FAIL'} — ${s.name} — ${s.file || ''}`), '',
  '## Required Files', '',
  ...report.files.map(f => `- ${f.ok ? 'PASS' : 'FAIL'} — ${f.file} — ${f.label}`), '',
  '## Recommendations', '',
  ...report.recommendations.map(r => `- ${r}`)
];
fs.writeFileSync(path.join(downloads, 'full-system-audit.md'), lines.join('\n'));

console.log(`\nFULL SYSTEM AUDIT ${report.ok ? 'PASSED' : 'FAILED'}`);
console.log(`Report: downloads/full-system-audit.json and downloads/full-system-audit.md`);
if (!report.ok) process.exit(1);
