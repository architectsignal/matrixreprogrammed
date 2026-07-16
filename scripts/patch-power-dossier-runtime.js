const fs = require('fs');
const path = require('path');

const root = process.cwd();
const runtime = 'power-dossier-runtime.js';
const roots = [root, path.join(root, '_site')].filter((value, index, all) => all.indexOf(value) === index && fs.existsSync(value));
const failures = [];
const files = [];
let patched = 0;

for (const base of roots) {
  for (const name of fs.readdirSync(base).filter(name => /^dossier-[a-z0-9-]+\.html$/i.test(name))) {
    const file = path.join(base, name);
    files.push(path.relative(root, file).replace(/\\/g, '/'));
    let html = fs.readFileSync(file, 'utf8');
    if (!html.includes('id="name"') || !html.includes('id="content"') || !html.includes('data/power-dossiers.json')) continue;
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

const runtimePath = path.join(root, runtime);
if (!fs.existsSync(runtimePath)) failures.push(`${runtime} missing`);
else {
  const source = fs.readFileSync(runtimePath, 'utf8');
  for (const marker of ['DOSSIER TEMPORARILY UNAVAILABLE', "fetch('data/power-dossiers.json'", 'document.documentElement.dataset.dossierState']) {
    if (!source.includes(marker)) failures.push(`${runtime} missing ${marker}`);
  }
}
if (fs.existsSync(path.join(root, '_site')) && !fs.existsSync(path.join(root, '_site', runtime))) failures.push(`_site/${runtime} missing from Cloudflare output`);

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  roots: roots.map(value => path.relative(root, value) || '.'),
  dossierPagesFound: files.length,
  dossierPagesPatched: patched,
  runtime,
  files,
  failures
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'power-dossier-runtime-report.json'), `${JSON.stringify(report, null, 2)}\n`);
if (failures.length) {
  failures.forEach(item => console.error(`POWER DOSSIER RUNTIME FAILURE: ${item}`));
  process.exit(1);
}
console.log(`Power dossier runtime wired across source and Cloudflare output: ${files.length} page(s), ${patched} newly patched.`);
