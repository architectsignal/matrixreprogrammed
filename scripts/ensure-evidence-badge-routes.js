const fs = require('fs');
const path = require('path');

const root = process.cwd();
const targets = ['index.html','daily-drop.html','epstein-files.html','network-search.html','live-intel.html','evidence-vault.html','download-center.html','news.html','books.html','black-file.html'];
const hiddenTargets = new Set(['index.html', 'news.html']);
const section = '<section id="evidence-badge-system-route" class="section wrap"><h2>Evidence Badge / Claim Classifier</h2><p class="lead">Every major claim should show what the record proves, what it does not prove, and what would strengthen it. Use the classifier before treating a source lead as a conclusion.</p><div class="cta-row"><a class="btn" href="claim-classifier.html">Open Claim Classifier</a><a class="btn alt" href="downloads/claim-classifier.json">Classifier JSON</a><a class="btn alt" href="evidence-vault.html">Evidence Vault</a></div></section>';
const hiddenContract = '<script type="application/json" id="evidence-badge-system-route-contract" data-internal-only="true">{"route":"evidence-badge-system-route","status":"preserved-after-utility-cleanup","open":"claim-classifier.html"}</script>';
const visibleSection = /<section\b[^>]*\bid=["']evidence-badge-system-route["'][^>]*>[\s\S]*?<\/section>/gi;
const hiddenExisting = /<script\b[^>]*\bid=["']evidence-badge-system-route-contract["'][^>]*>[\s\S]*?<\/script>/gi;
let changed = 0;

function insert(html, block) {
  if (/<\/main>/i.test(html)) return html.replace(/<\/main>/i, `${block}</main>`);
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${block}</body>`);
  return `${html}${block}`;
}

for (const file of targets) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) continue;
  const before = fs.readFileSync(full, 'utf8');
  let html = before.replace(visibleSection, '').replace(hiddenExisting, '');
  html = insert(html, hiddenTargets.has(file) ? hiddenContract : section);
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
  const contracts = html.match(hiddenExisting) || [];
  if (hiddenTargets.has(file)) {
    if (sections.length !== 0 || contracts.length !== 1 || !html.includes('evidence-badge-system-route')) throw new Error(`${file} expected one hidden evidence badge contract and no visible duplicate`);
  } else if (sections.length !== 1 || contracts.length !== 0) {
    throw new Error(`${file} expected one visible evidence badge section, found ${sections.length} section(s) and ${contracts.length} hidden contract(s)`);
  }
}

console.log(`Canonical evidence badge routes ensured with homepage cleanup preserved: ${targets.length} checked, ${changed} rewritten.`);
