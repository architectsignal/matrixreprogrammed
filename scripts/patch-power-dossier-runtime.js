const fs = require('fs');
const path = require('path');

const root = process.cwd();
const runtime = 'power-dossier-runtime.js';
const runtimePath = path.join(root, runtime);
const output = path.join(root, '_site');
const roots = [root, output].filter((value, index, all) => all.indexOf(value) === index && fs.existsSync(value));
const failures = [];
const files = [];
let patched = 0;
let copiedRuntime = false;

if (!fs.existsSync(runtimePath)) failures.push(`${runtime} missing`);
const runtimeSource = fs.existsSync(runtimePath) ? fs.readFileSync(runtimePath, 'utf8') : '';
if (runtimeSource) {
  for (const marker of ['DOSSIER TEMPORARILY UNAVAILABLE', "fetch('data/power-dossiers.json'", 'document.documentElement.dataset.dossierState']) {
    if (!runtimeSource.includes(marker)) failures.push(`${runtime} missing ${marker}`);
  }
}
if (fs.existsSync(output) && runtimeSource) {
  const outputRuntime = path.join(output, runtime);
  if (!fs.existsSync(outputRuntime) || fs.readFileSync(outputRuntime, 'utf8') !== runtimeSource) {
    fs.writeFileSync(outputRuntime, runtimeSource);
    copiedRuntime = true;
  }
}

function isDossierFile(base, name) {
  if (!/^dossier-[a-z0-9-]+(?:\.html)?$/i.test(name)) return false;
  const file = path.join(base, name);
  try { return fs.statSync(file).isFile(); } catch { return false; }
}

for (const base of roots) {
  for (const name of fs.readdirSync(base).filter(name => isDossierFile(base, name))) {
    const file = path.join(base, name);
    let html = fs.readFileSync(file, 'utf8');
    if (!html.includes('id="name"') || !html.includes('id="content"') || !html.includes('data/power-dossiers.json')) continue;
    files.push(path.relative(root, file).replace(/\\/g, '/'));
    if (!html.includes(`<script src="${runtime}"></script>`)) {
      if (html.includes('</body>')) html = html.replace('</body>', `<script src="${runtime}"></script></body>`);
      else html += `<script src="${runtime}"></script>`;
      fs.writeFileSync(file, html);
      patched++;
    }
    const after = fs.readFileSync(file, 'utf8');
    if (!after.includes(`<script src="${runtime}"></script>`)) failures.push(`${path.relative(root, file)} missing resilient dossier runtime`);
  }
}
if (fs.existsSync(output) && !fs.existsSync(path.join(output, runtime))) failures.push(`_site/${runtime} missing from Cloudflare output`);

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  roots: roots.map(value => path.relative(root, value) || '.'),
  dossierPagesFound: files.length,
  dossierPagesPatched: patched,
  runtime,
  copiedRuntime,
  files,
  failures
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'power-dossier-runtime-report.json'), `${JSON.stringify(report, null, 2)}\n`);
if (failures.length) {
  failures.forEach(item => console.error(`POWER DOSSIER RUNTIME FAILURE: ${item}`));
  process.exit(1);
}
console.log(`Power dossier runtime wired across source and Cloudflare output: ${files.length} HTML/extensionless page(s), ${patched} newly patched, runtime copy ${copiedRuntime ? 'updated' : 'current'}.`);
