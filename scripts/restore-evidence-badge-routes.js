const fs = require('fs');
const path = require('path');

const root = process.cwd();
const roots = [root, path.join(root, '_site')].filter((value, index, all) => all.indexOf(value) === index && fs.existsSync(value));
const targets = ['index.html','daily-drop.html','epstein-files.html','network-search.html','live-intel.html','evidence-vault.html','download-center.html','news.html','books.html','black-file.html'];
const marker = 'id="evidence-badge-system-route"';
const section = `<section id="evidence-badge-system-route" class="section wrap"><h2>Evidence Badge / Claim Classifier</h2><p class="lead">Every major claim should show what the record proves, what it does not prove and what would strengthen it. Use the classifier before treating a source lead as a conclusion.</p><div class="cta-row"><a class="btn" href="claim-classifier.html">Open Claim Classifier</a><a class="btn alt" href="downloads/claim-classifier.json">Classifier JSON</a><a class="btn alt" href="evidence-vault.html">Evidence Vault</a></div></section>`;
const changed = [];
const failures = [];

for (const base of roots) {
  for (const relative of targets) {
    const file = path.join(base, relative);
    if (!fs.existsSync(file)) {
      if (base === root) failures.push(`${relative} missing`);
      continue;
    }
    let html = fs.readFileSync(file, 'utf8');
    if (!html.includes(marker)) {
      if (html.includes('</main>')) html = html.replace('</main>', `${section}</main>`);
      else if (html.includes('</body>')) html = html.replace('</body>', `${section}</body>`);
      else { failures.push(`${path.relative(root, file)} has no insertion boundary`); continue; }
      fs.writeFileSync(file, html);
      changed.push(path.relative(root, file).replace(/\\/g, '/'));
    }
  }
}
for (const base of roots) for (const relative of targets) {
  const file = path.join(base, relative);
  if (fs.existsSync(file) && !fs.readFileSync(file, 'utf8').includes(marker)) failures.push(`${path.relative(root, file)} missing evidence badge route after repair`);
}
const report = { ok: failures.length === 0, generatedAt: new Date().toISOString(), roots: roots.map(value => path.relative(root, value) || '.'), changed, targets, failures };
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'evidence-badge-route-restore.json'), `${JSON.stringify(report, null, 2)}\n`);
if (failures.length) {
  failures.forEach(item => console.error(`EVIDENCE BADGE ROUTE RESTORE FAILURE: ${item}`));
  process.exit(1);
}
console.log(`Evidence badge routes restored across source and output: ${changed.length} file(s) changed.`);
