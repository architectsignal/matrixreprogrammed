const fs = require('fs');
const path = require('path');

const root = process.cwd();
const roots = [root, path.join(root, '_site')].filter((value, index, all) => all.indexOf(value) === index && fs.existsSync(value));
const targets = ['index.html','daily-drop.html','epstein-files.html','network-search.html','live-intel.html','evidence-vault.html','download-center.html','news.html','books.html','black-file.html'];
const hiddenTargets = new Set(['index.html', 'news.html']);
const token = 'evidence-badge-system-route';
const section = `<section id="evidence-badge-system-route" class="section wrap"><h2>Evidence Badge / Claim Classifier</h2><p class="lead">Every major claim should show what the record proves, what it does not prove and what would strengthen it. Use the classifier before treating a source lead as a conclusion.</p><div class="cta-row"><a class="btn" href="claim-classifier.html">Open Claim Classifier</a><a class="btn alt" href="downloads/claim-classifier.json">Classifier JSON</a><a class="btn alt" href="evidence-vault.html">Evidence Vault</a></div></section>`;
const hiddenContract = `<script type="application/json" id="evidence-badge-system-route-contract" data-internal-only="true">{"route":"evidence-badge-system-route","status":"preserved-after-utility-cleanup","open":"claim-classifier.html"}</script>`;
const changed = [];
const failures = [];

function removeVisibleSection(html) {
  return html.replace(/\s*<section\b(?=[^>]*\bid=["']evidence-badge-system-route["'])[^>]*>[\s\S]*?<\/section>/gi, '');
}
function insert(html, block) {
  if (html.includes('</main>')) return html.replace('</main>', `${block}</main>`);
  if (html.includes('</body>')) return html.replace('</body>', `${block}</body>`);
  return '';
}

for (const base of roots) {
  for (const relative of targets) {
    const file = path.join(base, relative);
    if (!fs.existsSync(file)) {
      if (base === root) failures.push(`${relative} missing`);
      continue;
    }
    const before = fs.readFileSync(file, 'utf8');
    let html = before;
    if (hiddenTargets.has(relative)) {
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
for (const base of roots) for (const relative of targets) {
  const file = path.join(base, relative);
  if (!fs.existsSync(file)) continue;
  const html = fs.readFileSync(file, 'utf8');
  if (!html.includes(token)) failures.push(`${path.relative(root, file)} missing evidence badge contract after repair`);
  if (hiddenTargets.has(relative) && /<section\b(?=[^>]*\bid=["']evidence-badge-system-route["'])/i.test(html)) failures.push(`${path.relative(root, file)} retains visible evidence badge duplicate after cleanup`);
}
const report = { ok: failures.length === 0, generatedAt: new Date().toISOString(), roots: roots.map(value => path.relative(root, value) || '.'), changed, targets, failures };
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'evidence-badge-route-restore.json'), `${JSON.stringify(report, null, 2)}\n`);
if (failures.length) {
  failures.forEach(item => console.error(`EVIDENCE BADGE ROUTE RESTORE FAILURE: ${item}`));
  process.exit(1);
}
console.log(`Evidence badge contracts restored across source and output: ${changed.length} file(s) changed.`);
