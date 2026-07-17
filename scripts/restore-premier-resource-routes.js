const fs = require('fs');
const path = require('path');

const root = process.cwd();
const roots = [root, path.join(root, '_site')].filter((value, index, all) => all.indexOf(value) === index && fs.existsSync(value));
const targets = ['index.html', 'live-intel.html', 'evidence-vault.html', 'download-center.html', 'books.html'];
const marker = 'id="daily-drop-command-route"';
const section = `<section id="daily-drop-command-route" class="section wrap"><h2>Daily Drop / Command Center</h2><p class="lead">Return here daily for source-watch changes, Epstein file movement, evidence-class badges, people and entity updates, actual source doors, free briefs and book routes.</p><div class="cta-row"><a class="btn" href="daily-drop.html">Open Today’s Drop</a><a class="btn alt" href="network-search.html">Search The Network</a><a class="btn alt" href="epstein-files.html#premier-epstein-command-center">Epstein Command Center</a><a class="btn alt" href="downloads/daily-drop.json">Daily Drop Data</a></div></section>`;
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
  if (fs.existsSync(file) && !fs.readFileSync(file, 'utf8').includes(marker)) failures.push(`${path.relative(root, file)} missing Daily Drop route after repair`);
}
const report = { ok: failures.length === 0, generatedAt: new Date().toISOString(), roots: roots.map(value => path.relative(root, value) || '.'), changed, targets, failures };
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'premier-resource-route-restore.json'), `${JSON.stringify(report, null, 2)}\n`);
if (failures.length) {
  failures.forEach(item => console.error(`PREMIER ROUTE RESTORE FAILURE: ${item}`));
  process.exit(1);
}
console.log(`Premier resource routes restored across source and output: ${changed.length} file(s) changed.`);
