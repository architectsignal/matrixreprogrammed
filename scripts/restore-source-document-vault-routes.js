const fs = require('fs');
const path = require('path');

const root = process.cwd();
const roots = [root, path.join(root, '_site')].filter((value, index, all) => all.indexOf(value) === index && fs.existsSync(value));
const targets = ['index.html','daily-drop.html','epstein-files.html','network-search.html','claim-classifier.html','evidence-vault.html','download-center.html','live-intel.html','news.html','books.html'];
const hiddenTargets = new Set(['index.html', 'news.html']);
const token = 'source-document-vault-route';
const section = `<section id="source-document-vault-route" class="section wrap"><h2>Actual Files First</h2><p class="lead">Open the source door before the interpretation. The Source Document Vault routes readers to official disclosures, courts, archives, financial records, influence records and evidence classification.</p><div class="cta-row"><a class="btn" href="source-document-vault.html">Open Source Document Vault</a><a class="btn alt" href="downloads/source-document-vault.json">Vault JSON</a><a class="btn alt" href="claim-classifier.html">Claim Classifier</a></div></section>`;
const hiddenContract = `<script type="application/json" id="source-document-vault-route-contract" data-internal-only="true">{"route":"source-document-vault-route","status":"preserved-after-utility-cleanup","open":"source-document-vault.html"}</script>`;
const changed = [];
const failures = [];

function removeVisibleSection(html) {
  return html.replace(/\s*<section\b(?=[^>]*\bid=["']source-document-vault-route["'])[^>]*>[\s\S]*?<\/section>/gi, '');
}
function removeHiddenContract(html) {
  return html.replace(/\s*<script\b(?=[^>]*\bid=["']source-document-vault-route-contract["'])[^>]*>[\s\S]*?<\/script>/gi, '');
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
    let html = removeHiddenContract(removeVisibleSection(before));
    html = insert(html, hiddenTargets.has(relative) ? hiddenContract : section);
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
  if (!html.includes(token)) failures.push(`${path.relative(root, file)} missing source vault contract after repair`);
  const visible = /<section\b(?=[^>]*\bid=["']source-document-vault-route["'])/i.test(html);
  if (hiddenTargets.has(relative) && visible) failures.push(`${path.relative(root, file)} retains visible source vault duplicate after cleanup`);
  if (!hiddenTargets.has(relative) && !visible) failures.push(`${path.relative(root, file)} missing visible source vault route`);
}
const report = { ok: failures.length === 0, generatedAt: new Date().toISOString(), roots: roots.map(value => path.relative(root, value) || '.'), changed, targets, failures };
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'source-document-vault-route-restore.json'), `${JSON.stringify(report, null, 2)}\n`);
if (failures.length) {
  failures.forEach(item => console.error(`SOURCE VAULT ROUTE RESTORE FAILURE: ${item}`));
  process.exit(1);
}
console.log(`Source Document Vault contracts restored across source and output: ${changed.length} file(s) changed.`);
