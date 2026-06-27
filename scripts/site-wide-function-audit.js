const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const args = process.argv.slice(2);
const isPostbuild = args.includes('--postbuild') || args.includes('--standalone-postbuild');
const report = {
  updated: new Date().toISOString(),
  mode: isPostbuild ? 'postbuild' : args.includes('--prebuild') ? 'prebuild' : 'standalone',
  ok: true,
  summary: {},
  problems: [],
  warnings: [],
  checked: {
    javascriptFiles: [],
    jsonFiles: [],
    packageScripts: [],
    workflows: [],
    generatedFiles: [],
    functions: []
  }
};

const ignoredDirs = new Set(['.git', 'node_modules', '_site', '.wrangler']);
const jsFiles = [];
const jsonFiles = [];
const workflowFiles = [];
const htmlFiles = [];

function rel(file) { return path.relative(root, file).replace(/\\/g, '/'); }
function file(name) { return path.join(root, name); }
function exists(name) { return fs.existsSync(file(name)); }
function read(name) { return fs.readFileSync(file(name), 'utf8'); }
function problem(message) { report.ok = false; report.problems.push(message); }
function warning(message) { report.warnings.push(message); }
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoredDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    const r = rel(full);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.js')) jsFiles.push(r);
    else if (entry.name.endsWith('.json')) jsonFiles.push(r);
    else if (entry.name.endsWith('.yml') || entry.name.endsWith('.yaml')) {
      if (r.startsWith('.github/workflows/')) workflowFiles.push(r);
    } else if (entry.name.endsWith('.html')) htmlFiles.push(r);
  }
}

function runNodeCheck(js, content) {
  const isModuleLike = /\bexport\s+default\b|\bimport\s+[^;]+from\s+['"]/m.test(content);
  const result = isModuleLike
    ? spawnSync(process.execPath, ['--check', '--input-type=module', '-e', content], { cwd: root, encoding: 'utf8', maxBuffer: 1024 * 1024 })
    : spawnSync(process.execPath, ['--check', js], { cwd: root, encoding: 'utf8', maxBuffer: 1024 * 1024 });
  if (result.status !== 0) problem(`${js}: JavaScript syntax check failed: ${(result.stderr || result.stdout || '').trim()}`);
}

function functionInventory(js, content) {
  const names = new Set();
  for (const match of content.matchAll(/function\s+([A-Za-z0-9_$]+)\s*\(/g)) names.add(match[1]);
  for (const match of content.matchAll(/(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g)) names.add(match[1]);
  for (const match of content.matchAll(/(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=\s*async\s+function/g)) names.add(match[1]);
  for (const name of names) report.checked.functions.push({ file: js, name });
}

function checkRequireTargets(js, content) {
  for (const match of content.matchAll(/require\(['"](\.\.?\/[^'"]+)['"]\)/g)) {
    const target = match[1];
    const base = path.normalize(path.join(path.dirname(js), target)).replace(/\\/g, '/');
    const candidates = [base, `${base}.js`, `${base}.json`, path.join(base, 'index.js').replace(/\\/g, '/')];
    if (!candidates.some(exists)) problem(`${js}: require target missing: ${target}`);
  }
}

function checkDangerPatterns(js, content) {
  const allowedRepairScripts = new Set([
    'scripts/site-wide-function-audit.js',
    'scripts/live-intel-pressure-test.js',
    'scripts/migration-flow-test.js',
    'scripts/build-live-intel-machine.js'
  ]);
  const forbidden = [
    ['offer-intelligence-entry.html', 'obsolete Live Intel intelligence offer route'],
    ['offer-crime-dossier-entry.html', 'obsolete Live Intel crime offer route'],
    ['EST. SOURCE-SPLIT', 'deprecated migration placeholder'],
    ['&lt;a href=', 'escaped RSS anchor leakage'],
    ['&lt;font ', 'escaped RSS font leakage']
  ];
  for (const [needle, label] of forbidden) {
    if (content.includes(needle) && !allowedRepairScripts.has(js)) {
      problem(`${js}: contains ${label}: ${needle}`);
    }
  }
  if (/process\.exit\(1\)/.test(content) && /update-.*\.js$/.test(js) && !/pressure-test|test|audit/.test(js)) {
    warning(`${js}: updater contains process.exit(1); updater scripts should usually fail soft so daily drops do not die from feed/source errors.`);
  }
}

function checkJson(json) {
  try {
    JSON.parse(read(json));
  } catch (error) {
    problem(`${json}: invalid JSON: ${error.message}`);
  }
}

function checkPackage() {
  if (!exists('package.json')) return problem('missing package.json');
  let pkg;
  try { pkg = JSON.parse(read('package.json')); } catch (error) { return problem(`package.json invalid: ${error.message}`); }
  const scripts = pkg.scripts || {};
  const scriptNames = Object.keys(scripts);
  report.checked.packageScripts = scriptNames;
  if (!scripts.build) problem('package.json missing build script');
  for (const [name, command] of Object.entries(scripts)) {
    for (const match of String(command).matchAll(/node\s+([^\s&|;]+\.js)/g)) {
      const target = match[1].replace(/^['"]|['"]$/g, '');
      if (!exists(target)) problem(`package script ${name}: missing node target ${target}`);
    }
  }
  const build = scripts.build || '';
  const orderingRules = [
    ['build-intel-desk.js', 'migration-flow-test.js', 'Intel Desk must build before migration test'],
    ['build-live-intel-machine.js', 'live-intel-pressure-test.js', 'Live Intel must build before Live Intel pressure test'],
    ['update-seven-day-intel.js', 'build-phase14-dossier-packs.js', 'seven-day intel must refresh before dossier packs'],
    ['build-phase19-lead-magnets.js', 'phase19-pressure-test.js', 'lead magnets must build before phase19 pressure test'],
    ['harden-public-html.js', 'audit-site.js', 'public HTML hardening must run before audit'],
    ['inject-analytics.js', 'audit-site.js', 'analytics/final patches must run before audit'],
    ['build-cloudflare-output.js', '', 'Cloudflare output builder should remain last']
  ];
  for (const [a, b, label] of orderingRules) {
    const ia = build.indexOf(a);
    const ib = b ? build.indexOf(b) : build.lastIndexOf(a);
    if (ia === -1) problem(`package build missing ${a}: ${label}`);
    else if (b && ib === -1) problem(`package build missing ${b}: ${label}`);
    else if (b && ia > ib) problem(`package build order wrong: ${label}`);
    else if (!b && ia !== ib) warning(`package build has multiple ${a} entries; should normally appear once at the end.`);
  }
}

function checkWorkflows() {
  for (const wf of workflowFiles) {
    const text = read(wf);
    report.checked.workflows.push(wf);
    if (/node scripts\/audit-site\.js/.test(text) && !/npm run build/.test(text)) {
      problem(`${wf}: runs audit-site.js without npm run build first`);
    }
    if (/\[deploy\]/.test(text) && !/contents:\s*write/.test(text)) {
      problem(`${wf}: uses [deploy] commits but permissions.contents is not write`);
    }
    if (/schedule:/.test(text) && !/workflow_dispatch:/.test(text)) {
      warning(`${wf}: scheduled workflow should usually include workflow_dispatch for manual reruns.`);
    }
  }
}

function checkPostBuildOutputs() {
  if (!isPostbuild) return;
  const required = [
    'index.html', 'news.html', 'live-intel.html', 'epstein-files.html', 'migration-flow.html', 'download-center.html',
    'sitemap.xml', 'llms.txt', 'search-index.json', 'deploy-status.json', 'downloads/live-intel-latest.json', 'downloads/live-intel-latest.md',
    'downloads/seven-day-intel.json', 'downloads/the-black-file-matrix-reprogrammed.pdf', '_site/index.html'
  ];
  for (const name of required) {
    if (!exists(name)) problem(`postbuild output missing: ${name}`);
    else report.checked.generatedFiles.push(name);
  }
  const publicForbidden = [
    ['live-intel.html', '&lt;a href=', 'reader-visible RSS anchor markup'],
    ['live-intel.html', '&lt;font ', 'reader-visible RSS font markup'],
    ['downloads/live-intel-latest.json', 'offer-intelligence-entry.html', 'obsolete intelligence offer route'],
    ['downloads/live-intel-latest.json', 'offer-crime-dossier-entry.html', 'obsolete crime offer route'],
    ['news.html', 'EST. SOURCE-SPLIT', 'deprecated migration placeholder'],
    ['migration-flow.html', 'EST. SOURCE-SPLIT', 'deprecated migration placeholder']
  ];
  for (const [target, needle, label] of publicForbidden) {
    if (exists(target) && read(target).includes(needle)) problem(`${target}: contains ${label}: ${needle}`);
  }
  if (exists('news.html')) {
    const news = read('news.html');
    for (const marker of ['237.5K', '178K', '41,472', '800+', '117M', '256,302 sexual violence offences', '98,190 rape offences']) {
      if (!news.includes(marker)) problem(`news.html missing migration/intel marker: ${marker}`);
    }
  }
}

function writeReport() {
  const downloads = file('downloads');
  if (!fs.existsSync(downloads)) fs.mkdirSync(downloads, { recursive: true });
  report.summary = {
    javascriptFiles: report.checked.javascriptFiles.length,
    jsonFiles: report.checked.jsonFiles.length,
    workflows: report.checked.workflows.length,
    functionsDetected: report.checked.functions.length,
    generatedFilesChecked: report.checked.generatedFiles.length,
    warnings: report.warnings.length,
    problems: report.problems.length
  };
  fs.writeFileSync(file('downloads/site-wide-function-audit.json'), JSON.stringify(report, null, 2));
  const lines = [
    '# Site-Wide Function Audit', '',
    `Updated: ${report.updated}`,
    `Mode: ${report.mode}`,
    `Status: ${report.ok ? 'PASS' : 'FAIL'}`, '',
    '## Summary', '',
    `- JavaScript files: ${report.summary.javascriptFiles}`,
    `- JSON files: ${report.summary.jsonFiles}`,
    `- Workflows: ${report.summary.workflows}`,
    `- Functions detected: ${report.summary.functionsDetected}`,
    `- Generated files checked: ${report.summary.generatedFilesChecked}`,
    `- Warnings: ${report.summary.warnings}`,
    `- Problems: ${report.summary.problems}`, '',
    '## Problems', '',
    ...(report.problems.length ? report.problems.map(p => `- ${p}`) : ['- None']), '',
    '## Warnings', '',
    ...(report.warnings.length ? report.warnings.map(w => `- ${w}`) : ['- None'])
  ];
  fs.writeFileSync(file('downloads/site-wide-function-audit.md'), lines.join('\n'));
}

walk(root);
report.checked.javascriptFiles = jsFiles;
report.checked.jsonFiles = jsonFiles;

for (const js of jsFiles) {
  const content = read(js);
  runNodeCheck(js, content);
  functionInventory(js, content);
  checkRequireTargets(js, content);
  checkDangerPatterns(js, content);
}
for (const json of jsonFiles) checkJson(json);
checkPackage();
checkWorkflows();
checkPostBuildOutputs();
writeReport();

if (report.problems.length) {
  console.error('\nSITE-WIDE FUNCTION AUDIT FAILED\n');
  for (const p of report.problems) console.error(`- ${p}`);
  console.error(`\n${report.problems.length} issue(s), ${report.warnings.length} warning(s). Report: downloads/site-wide-function-audit.json\n`);
  process.exit(1);
}
console.log('SITE-WIDE FUNCTION AUDIT PASSED');
console.log(`Checked ${report.summary.javascriptFiles} JavaScript files, ${report.summary.jsonFiles} JSON files, ${report.summary.workflows} workflows, ${report.summary.functionsDetected} functions, ${report.summary.generatedFilesChecked} generated outputs. Warnings: ${report.summary.warnings}.`);
