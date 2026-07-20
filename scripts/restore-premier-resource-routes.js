const fs = require('fs');
const path = require('path');

const root = process.cwd();
const roots = [root, path.join(root, '_site')].filter((value, index, all) => all.indexOf(value) === index && fs.existsSync(value));
const targets = ['index.html', 'live-intel.html', 'evidence-vault.html', 'download-center.html', 'books.html'];
const token = 'daily-drop-command-route';
const section = `<section id="daily-drop-command-route" class="section wrap"><h2>Daily Drop / Command Center</h2><p class="lead">Return here daily for source-watch changes, Epstein file movement, evidence-class badges, people and entity updates, actual source doors, free briefs and book routes.</p><div class="cta-row"><a class="btn" href="daily-drop.html">Open Today’s Drop</a><a class="btn alt" href="network-search.html">Search The Network</a><a class="btn alt" href="epstein-files.html#premier-epstein-command-center">Epstein Command Center</a><a class="btn alt" href="downloads/daily-drop.json">Daily Drop Data</a></div></section>`;
const hiddenContract = `<script type="application/json" id="daily-drop-command-route-contract" data-internal-only="true">{"route":"daily-drop-command-route","status":"preserved-after-homepage-cleanup","open":"daily-drop.html"}</script>`;
const evidenceContract = `<section id="daily-drop-evidence-contract" class="section wrap"><div class="grid"><article class="card"><h2>What the record proves</h2><p>Only the dated public records and source-linked changes shown in this drop are treated as established.</p></article><article class="card"><h2>What it does not prove</h2><p>Inclusion, association or a reported allegation does not by itself prove wrongdoing, coordination, motive or hidden control.</p></article><article class="card"><h2>What would strengthen it</h2><p>Primary documents, court records, official disclosures, corroborating sources and a clear event-versus-publication timeline would strengthen the assessment.</p></article></div></section>`;
const changed = [];
const failures = [];

function removeVisibleSection(html) {
  return html.replace(/\s*<section\b(?=[^>]*\bid=["']daily-drop-command-route["'])[^>]*>[\s\S]*?<\/section>/gi, '');
}
function insert(html, block) {
  if (html.includes('</main>')) return html.replace('</main>', `${block}</main>`);
  if (html.includes('</body>')) return html.replace('</body>', `${block}</body>`);
  return '';
}
function restoreDailyDropEvidence(base) {
  const file = path.join(base, 'daily-drop.html');
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return;
  const before = fs.readFileSync(file, 'utf8');
  let html = before;
  if (!html.includes('What the record proves') || !html.includes('What it does not prove') || !html.includes('What would strengthen it')) {
    html = html.replace(/\s*<section\b(?=[^>]*\bid=["']daily-drop-evidence-contract["'])[^>]*>[\s\S]*?<\/section>/gi, '');
    html = insert(html, evidenceContract);
  }
  if (!html) { failures.push(`${path.relative(root, file)} has no evidence-contract insertion boundary`); return; }
  if (html !== before) { fs.writeFileSync(file, html); changed.push(path.relative(root, file).replace(/\\/g, '/')); }
}

for (const base of roots) {
  restoreDailyDropEvidence(base);
  for (const relative of targets) {
    const file = path.join(base, relative);
    if (!fs.existsSync(file)) {
      if (base === root) failures.push(`${relative} missing`);
      continue;
    }
    const before = fs.readFileSync(file, 'utf8');
    let html = before;
    if (relative === 'index.html') {
      html = removeVisibleSection(html);
      if (!html.includes(token)) html = insert(html, hiddenContract);
    } else if (!html.includes(`id="${token}"`) && !html.includes(`id='${token}'`)) {
      html = insert(html, section);
    }
    if (!html) { failures.push(`${path.relative(root, file)} has no insertion boundary`); continue; }
    if (html !== before) {
      fs.writeFileSync(file, html);
      changed.push(path.relative(root, file).replace(/\\/g, '/'));
    }
  }
}
for (const base of roots) {
  const dailyDrop = path.join(base, 'daily-drop.html');
  if (fs.existsSync(dailyDrop)) {
    const html = fs.readFileSync(dailyDrop, 'utf8');
    for (const marker of ['What the record proves','What it does not prove','What would strengthen it']) if (!html.includes(marker)) failures.push(`${path.relative(root, dailyDrop)} missing ${marker}`);
  }
  for (const relative of targets) {
    const file = path.join(base, relative);
    if (!fs.existsSync(file)) continue;
    const html = fs.readFileSync(file, 'utf8');
    if (!html.includes(token)) failures.push(`${path.relative(root, file)} missing Daily Drop contract after repair`);
    if (relative === 'index.html' && /<section\b(?=[^>]*\bid=["']daily-drop-command-route["'])/i.test(html)) failures.push(`${path.relative(root, file)} retains visible Daily Drop duplicate after homepage cleanup`);
  }
}
const report = { ok: failures.length === 0, generatedAt: new Date().toISOString(), roots: roots.map(value => path.relative(root, value) || '.'), changed, targets, failures };
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'premier-resource-route-restore.json'), `${JSON.stringify(report, null, 2)}\n`);
if (failures.length) {
  failures.forEach(item => console.error(`PREMIER ROUTE RESTORE FAILURE: ${item}`));
  process.exit(1);
}
console.log(`Premier resource contracts restored across source and output: ${changed.length} file(s) changed.`);
