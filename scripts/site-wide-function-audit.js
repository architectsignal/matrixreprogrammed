const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const os = require('os');

const root = process.cwd();
const mode = process.argv.includes('--postbuild') ? 'postbuild' : process.argv.includes('--prebuild') ? 'prebuild' : 'standalone';
const ignored = new Set(['.git', 'node_modules', '_site', '.wrangler']);
const problems = [];
const warnings = [];
const checked = { js: [], json: [], workflows: [], functions: 0, generated: [] };

function p(name) { return path.join(root, name); }
function exists(name) { return fs.existsSync(p(name)); }
function read(name) { return fs.readFileSync(p(name), 'utf8'); }
function rel(full) { return path.relative(root, full).split(path.sep).join('/'); }
function fail(msg) { problems.push(msg); }
function warn(msg) { warnings.push(msg); }
function runNodeScript(script, args = []) {
  const res = spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: 'utf8', maxBuffer: 1024 * 1024 * 6 });
  if (res.status !== 0) {
    fail(`${script} failed while preparing audit: ${(res.stderr || res.stdout || '').trim().slice(-1200)}`);
  }
  return res.status === 0;
}
function ensurePostbuildOutput() {
  if (mode !== 'postbuild') return;
  if (exists('_site/index.html')) return;
  if (exists('scripts/repair-generated-site-artifacts.js')) runNodeScript('scripts/repair-generated-site-artifacts.js');
  if (exists('scripts/repair-search-system.js')) runNodeScript('scripts/repair-search-system.js');
  if (exists('scripts/patch-worker-pages-origin.js')) runNodeScript('scripts/patch-worker-pages-origin.js');
  if (exists('scripts/build-cloudflare-output.js')) runNodeScript('scripts/build-cloudflare-output.js');
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    const r = rel(full);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.js')) checked.js.push(r);
    else if (entry.name.endsWith('.json')) checked.json.push(r);
    else if ((entry.name.endsWith('.yml') || entry.name.endsWith('.yaml')) && r.startsWith('.github/workflows/')) checked.workflows.push(r);
  }
}

function checkJs(name) {
  const src = read(name);
  const moduleLike = src.includes('export default') || /\bimport\s+/.test(src);
  let target = p(name);
  let tmp = '';
  if (moduleLike) {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mr-js-check-'));
    target = path.join(tmp, path.basename(name).replace(/\.js$/, '.mjs'));
    fs.writeFileSync(target, src);
  }
  const res = spawnSync(process.execPath, ['--check', target], { encoding: 'utf8', maxBuffer: 1024 * 1024 });
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  if (res.status !== 0) fail(`${name}: JavaScript syntax failed: ${(res.stderr || res.stdout || '').trim()}`);
  checked.functions += (src.match(/function\s+[A-Za-z0-9_$]+\s*\(/g) || []).length;
  checked.functions += (src.match(/(?:const|let|var)\s+[A-Za-z0-9_$]+\s*=\s*(?:async\s*)?\(/g) || []).length;
}

function checkJson(name) {
  try { JSON.parse(read(name)); } catch (error) { fail(`${name}: invalid JSON: ${error.message}`); }
}

function needFile(name, marker = '') {
  if (!exists(name)) return fail(`missing required file: ${name}`);
  checked.generated.push(name);
  if (marker && !read(name).includes(marker)) fail(`${name}: missing marker ${marker}`);
}

function checkPackage() {
  if (!exists('package.json')) return fail('missing package.json');
  const pkg = JSON.parse(read('package.json'));
  const scripts = pkg.scripts || {};
  if (!scripts.build) fail('package.json missing build script');
  const build = scripts.build || '';
  for (const target of ['harden-public-html.js', 'audit-site.js', 'cloudflare-worker-routes-test.js', 'build-cloudflare-output.js']) {
    if (!build.includes(target)) fail(`package build missing ${target}`);
  }
}

function checkWorkflows() {
  const auditSite = exists('scripts/audit-site.js') ? read('scripts/audit-site.js') : '';
  const auditBootstraps = auditSite.includes('SITE QA BOOTSTRAP') && auditSite.includes('npm') && auditSite.includes('build');
  for (const wf of checked.workflows) {
    const txt = read(wf);
    if (txt.includes('node scripts/audit-site.js') && !txt.includes('npm run build') && !auditBootstraps) fail(`${wf}: runs audit-site.js without build/bootstrap`);
    if (txt.includes('[deploy]') && !/contents:\s*write/.test(txt)) fail(`${wf}: uses deploy marker without contents write permission`);
    if (txt.includes('schedule:') && !txt.includes('workflow_dispatch:')) warn(`${wf}: scheduled workflow has no manual trigger`);
  }
}

function checkPostbuild() {
  if (mode !== 'postbuild') return;
  needFile('index.html', 'FOLLOW THE FILES.');
  needFile('_site/index.html', 'FOLLOW THE FILES.');
  needFile('forum.html', 'data-board="main"');
  needFile('dark-speculation-forum.html', 'data-board="speculation"');
  needFile('epstein-alive-board.html', 'data-board="epstein-alive"');
  needFile('src/worker.js', '/submit-speculation-post');
  needFile('llms.txt', '/forum-feed-epstein-alive');
  needFile('deploy-status.json', 'hardBoardRoutes');
  needFile('news.html', '237.5K');
  needFile('downloads/seven-day-intel.json');
}

ensurePostbuildOutput();
walk(root);
for (const f of checked.js) checkJs(f);
for (const f of checked.json) checkJson(f);
checkPackage();
checkWorkflows();
checkPostbuild();

const report = {
  updated: new Date().toISOString(),
  mode,
  ok: problems.length === 0,
  summary: {
    javascriptFiles: checked.js.length,
    jsonFiles: checked.json.length,
    workflows: checked.workflows.length,
    functionsDetected: checked.functions,
    generatedFilesChecked: checked.generated.length,
    warnings: warnings.length,
    problems: problems.length
  },
  problems,
  warnings,
  checked
};
if (!exists('downloads')) fs.mkdirSync(p('downloads'), { recursive: true });
fs.writeFileSync(p('downloads/site-wide-function-audit.json'), JSON.stringify(report, null, 2));
fs.writeFileSync(p('downloads/site-wide-function-audit.md'), [
  '# Site-Wide Function Audit', '',
  `Updated: ${report.updated}`,
  `Mode: ${mode}`,
  `Status: ${report.ok ? 'PASS' : 'FAIL'}`, '',
  '## Summary', '',
  `- JavaScript files: ${report.summary.javascriptFiles}`,
  `- JSON files: ${report.summary.jsonFiles}`,
  `- Workflows: ${report.summary.workflows}`,
  `- Functions detected: ${report.summary.functionsDetected}`,
  `- Generated files checked: ${report.summary.generatedFilesChecked}`,
  `- Warnings: ${warnings.length}`,
  `- Problems: ${problems.length}`, '',
  '## Problems', '',
  ...(problems.length ? problems.map(x => `- ${x}`) : ['- None']), '',
  '## Warnings', '',
  ...(warnings.length ? warnings.map(x => `- ${x}`) : ['- None'])
].join('\n'));

if (problems.length) {
  console.error('\nSITE-WIDE FUNCTION AUDIT FAILED\n');
  for (const item of problems) console.error(`- ${item}`);
  console.error(`\n${problems.length} issue(s), ${warnings.length} warning(s).`);
  process.exit(1);
}
console.log('SITE-WIDE FUNCTION AUDIT PASSED');
console.log(`Checked ${checked.js.length} JavaScript files, ${checked.json.length} JSON files, ${checked.workflows.length} workflows, ${checked.functions} functions. Warnings: ${warnings.length}.`);
