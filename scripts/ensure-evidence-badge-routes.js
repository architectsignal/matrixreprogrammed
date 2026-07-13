const fs = require('fs');
const path = require('path');

const root = process.cwd();
const targets = ['index.html','daily-drop.html','epstein-files.html','network-search.html','live-intel.html','evidence-vault.html','download-center.html','news.html','books.html','black-file.html'];
const section = '<section id="evidence-badge-system-route" class="section wrap"><h2>Evidence Badge / Claim Classifier</h2><p class="lead">Every major claim should show what the record proves, what it does not prove, and what would strengthen it. Use the classifier before treating a source lead as a conclusion.</p><div class="cta-row"><a class="btn" href="claim-classifier.html">Open Claim Classifier</a><a class="btn alt" href="downloads/claim-classifier.json">Classifier JSON</a><a class="btn alt" href="evidence-vault.html">Evidence Vault</a></div></section>';
const visibleSection = /<section\b[^>]*\bid=["']evidence-badge-system-route["'][^>]*>[\s\S]*?<\/section>/gi;
const anyId = /\bid=(["'])evidence-badge-system-route\1/gi;
let changed = 0;

for (const file of targets) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) continue;
  const before = fs.readFileSync(full, 'utf8');
  let html = before.replace(visibleSection, '');
  html = html.replace(anyId, 'data-evidence-badge-compat="true"');
  if (/<\/main>/i.test(html)) html = html.replace(/<\/main>/i, `${section}</main>`);
  else if (/<\/body>/i.test(html)) html = html.replace(/<\/body>/i, `${section}</body>`);
  else html += section;
  if (html !== before) {
    fs.writeFileSync(full, html);
    changed += 1;
  }
}

for (const file of targets) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) continue;
  const html = fs.readFileSync(full, 'utf8');
  const sections = html.match(visibleSection) || [];
  const ids = html.match(anyId) || [];
  if (sections.length !== 1 || ids.length !== 1) throw new Error(`${file} expected one canonical evidence badge section and ID, found ${sections.length} section(s), ${ids.length} ID(s)`);
}

console.log(`Canonical evidence badge routes ensured: ${targets.length} checked, ${changed} rewritten.`);
