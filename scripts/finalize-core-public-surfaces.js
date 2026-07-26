const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const site = path.join(root, '_site');
const reportPath = path.join(root, 'downloads', 'core-public-surfaces-finalize.json');
const report = { ok: false, generatedAt: new Date().toISOString(), commands: [], copied: [], checks: [] };
function run(script, optional = false) {
  const file = path.join(root, script);
  if (!fs.existsSync(file)) { if (optional) return false; throw new Error(`Required finalizer missing: ${script}`); }
  const result = spawnSync(process.execPath, [file], { cwd: root, encoding: 'utf8', env: process.env, maxBuffer: 1024 * 1024 * 40 });
  report.commands.push({ script, status: result.status, stdout: String(result.stdout || '').slice(-2500), stderr: String(result.stderr || '').slice(-2500) });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) throw new Error(`${script} failed`);
  return true;
}
function copy(relative) {
  const source = path.join(root, relative);
  if (!fs.existsSync(source) || fs.statSync(source).isDirectory()) throw new Error(`Core public source missing: ${relative}`);
  const destination = path.join(site, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
  if (!report.copied.includes(relative)) report.copied.push(relative);
  if (relative.endsWith('.html')) {
    const extensionless = path.join(site, relative.replace(/\.html$/i, ''));
    if (!(fs.existsSync(extensionless) && fs.statSync(extensionless).isDirectory())) fs.copyFileSync(source, extensionless);
  }
}
function requireText(relative, markers) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) throw new Error(`${relative} is missing`);
  const text = fs.readFileSync(file, 'utf8');
  for (const marker of markers) {
    const ok = text.includes(marker);
    report.checks.push({ relative, marker, ok });
    if (!ok) throw new Error(`${relative} missing required marker: ${marker}`);
  }
}
if (!fs.existsSync(site)) throw new Error('_site is missing; run the normal build first');
run('scripts/build-death-files.js');
run('scripts/patch-main-navigation-safety-links.js');
run('scripts/restore-homepage-navigation.js');
run('scripts/patch-homepage-construction-banner.js');
const fixed = [
  'index.html','start-here.html','independent-links.html',
  'data/independent-links-1.json','data/independent-links-2.json','data/independent-links-3.json','data/independent-links-4.json',
  'death-files.html','death-files.js','data/death-files.json','data/death-files-runtime.json',
  'downloads/death-files-index.json','downloads/death-files-index.md','fixes.css','sitemap.xml',
  'homepage-mask-intro.css','homepage-mask-intro-data.js','homepage-mask-intro.js','welcome-gate.css','welcome-gate.js'
];
for (const relative of fixed) copy(relative);
const generatedDeathPages = fs.readdirSync(root).filter(name => (/^death-files-.+\.html$/i.test(name) || /^death-file-.+\.html$/i.test(name))).sort();
if (generatedDeathPages.length < 6) throw new Error(`Death Files output is incomplete: ${generatedDeathPages.length} generated pages`);
for (const relative of generatedDeathPages) copy(relative);
copy('index.html');
copy('start-here.html');
requireText('index.html', ['id="matrix-construction-banner"','UNDER CONSTRUCTION — HELP US BUILD THE MACHINE.','https://gofund.me/0a3c74fc9','href="death-files.html"','href="independent-links.html"','20260725-video-v9','welcome-gate.js']);
requireText('independent-links.html', ['TOP 100 INDEPENDENT RESEARCH LINKS.','data/independent-links-1.json','Expected 100 sources']);
requireText('death-files.html', ['THE DEATH FILES.','id="dossiers"','death-files.js']);
requireText('death-files-pattern-lab.html', ['DEATH PATTERN LAB.','A cluster is not a conspiracy']);
requireText('death-files-methodology.html', ['HOW THE DEATH FILES WORK.','Three-Layer Conclusion System']);
requireText('homepage-mask-intro-data.js', ['20260725-video-v9','"decodedBytes":123874','globalThis.__MATRIX_INTRO_BASE64__']);
requireText('homepage-mask-intro.js', ['forceReplay',"get('intro') === '1'",'HTMLVideoElement']);
requireText('welcome-gate.js', ['data-signal-gate']);
for (const relative of ['index.html','independent-links.html','death-files.html','death-files-pattern-lab.html','death-files-methodology.html','homepage-mask-intro-data.js']) {
  const deployed = path.join(site, relative);
  if (!fs.existsSync(deployed)) throw new Error(`Deployable core route missing: _site/${relative}`);
  const text = fs.readFileSync(deployed, 'utf8');
  if (relative === 'index.html' && (!text.includes('matrix-construction-banner') || !text.includes('death-files.html') || !text.includes('independent-links.html') || !text.includes('20260725-video-v9'))) throw new Error('Deployable homepage lost a protected public surface');
}
report.ok = true;
report.intro = { version: '20260725-video-v9', decodedBytes: 123874 };
report.deathPages = ['death-files.html', ...generatedDeathPages];
report.protectedRoutes = ['/','/independent-links.html','/death-files.html', ...generatedDeathPages.map(name => `/${name}`)];
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Core public surfaces finalized: support banner, Top 100 Links, Death Files (${generatedDeathPages.length + 1} pages), verified v9 intro and welcome gate copied into the exact Cloudflare bundle.`);