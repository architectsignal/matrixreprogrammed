const fs = require('fs');
const path = require('path');

const root = process.cwd();
const runtime = 'power-dossier-runtime.js';
const files = fs.readdirSync(root).filter(name => /^dossier-[a-z0-9-]+\.html$/i.test(name));
const failures = [];
let patched = 0;

for (const name of files) {
  const file = path.join(root, name);
  let html = fs.readFileSync(file, 'utf8');
  if (!html.includes('id="name"') || !html.includes('id="content"') || !html.includes('data/power-dossiers.json')) continue;
  if (!html.includes(`<script src="${runtime}"></script>`)) {
    if (html.includes('</body>')) html = html.replace('</body>', `<script src="${runtime}"></script></body>`);
    else html += `<script src="${runtime}"></script>`;
    fs.writeFileSync(file, html);
    patched++;
  }
  const after = fs.readFileSync(file, 'utf8');
  if (!after.includes(`<script src="${runtime}"></script>`)) failures.push(`${name} missing resilient dossier runtime`);
}

const runtimePath = path.join(root, runtime);
if (!fs.existsSync(runtimePath)) failures.push(`${runtime} missing`);
else {
  const source = fs.readFileSync(runtimePath, 'utf8');
  for (const marker of ['DOSSIER TEMPORARILY UNAVAILABLE', "fetch('data/power-dossiers.json'", 'document.documentElement.dataset.dossierState']) {
    if (!source.includes(marker)) failures.push(`${runtime} missing ${marker}`);
  }
}

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  dossierPagesFound: files.length,
  dossierPagesPatched: patched,
  runtime,
  failures
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'power-dossier-runtime-report.json'), `${JSON.stringify(report, null, 2)}\n`);
if (failures.length) {
  failures.forEach(item => console.error(`POWER DOSSIER RUNTIME FAILURE: ${item}`));
  process.exit(1);
}
console.log(`Power dossier runtime wired: ${files.length} dossier page(s), ${patched} newly patched, fail-safe loading enabled.`);
