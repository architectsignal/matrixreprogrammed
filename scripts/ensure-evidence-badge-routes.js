const fs = require('fs');
const path = require('path');

const root = process.cwd();
const scopes = [root, path.join(root, '_site')].filter((value, index, list) => list.indexOf(value) === index && fs.existsSync(value));
const targets = ['index.html','daily-drop.html','epstein-files.html','network-search.html','live-intel.html','evidence-vault.html','download-center.html','news.html','books.html','black-file.html'];
const hiddenTargets = new Set(['index.html', 'news.html']);
const section = '<section id="evidence-badge-system-route" class="section wrap"><h2>Evidence Badge / Claim Classifier</h2><p class="lead">Every major claim should show what the record proves, what it does not prove, and what would strengthen it. Use the classifier before treating a source lead as a conclusion.</p><div class="cta-row"><a class="btn" href="claim-classifier.html">Open Claim Classifier</a><a class="btn alt" href="downloads/claim-classifier.json">Classifier JSON</a><a class="btn alt" href="evidence-vault.html">Evidence Vault</a></div></section>';
const hiddenContract = '<script type="application/json" id="evidence-badge-system-route-contract" data-internal-only="true">{"route":"evidence-badge-system-route","status":"preserved-after-utility-cleanup","open":"claim-classifier.html"}</script>';
const visibleSection = /<section\b[^>]*\sid=["']evidence-badge-system-route(?:--duplicate-[^"']+)?["'][^>]*>[\s\S]*?<\/section>/gi;
const hiddenExisting = /<script\b[^>]*\sid=["']evidence-badge-system-route-contract["'][^>]*>[\s\S]*?<\/script>/gi;
const exactVisibleId = /(^|\s)id=["']evidence-badge-system-route["']/gi;
const exactContractId = /(^|\s)id=["']evidence-badge-system-route-contract["']/gi;
let changed = 0;
let checked = 0;

function insert(html, block) {
  if (/<\/main>/i.test(html)) return html.replace(/<\/main>/i, `${block}</main>`);
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${block}</body>`);
  return `${html}${block}`;
}

function removeNoncanonicalIdReferences(html) {
  return html
    .replace(exactVisibleId, '$1data-evidence-badge-route-reference="evidence-badge-system-route"')
    .replace(exactContractId, '$1data-evidence-badge-contract-reference="evidence-badge-system-route-contract"');
}

for (const scope of scopes) {
  for (const file of targets) {
    const full = path.join(scope, file);
    if (!fs.existsSync(full)) continue;
    checked += 1;
    const before = fs.readFileSync(full, 'utf8');
    let html = before
      .replace(visibleSection, '')
      .replace(hiddenExisting, '');
    html = removeNoncanonicalIdReferences(html);
    html = insert(html, hiddenTargets.has(file) ? hiddenContract : section);
    if (html !== before) {
      fs.writeFileSync(full, html);
      changed += 1;
    }
  }
}

for (const scope of scopes) {
  for (const file of targets) {
    const full = path.join(scope, file);
    if (!fs.existsSync(full)) continue;
    const html = fs.readFileSync(full, 'utf8');
    const sections = html.match(visibleSection) || [];
    const contracts = html.match(hiddenExisting) || [];
    const visibleIds = html.match(exactVisibleId) || [];
    const contractIds = html.match(exactContractId) || [];
    const label = path.relative(root, full) || file;
    if (hiddenTargets.has(file)) {
      if (sections.length !== 0 || contracts.length !== 1 || visibleIds.length !== 0 || contractIds.length !== 1) {
        throw new Error(`${label} expected one hidden evidence badge contract, no visible section and no duplicate IDs`);
      }
    } else if (sections.length !== 1 || contracts.length !== 0 || visibleIds.length !== 1 || contractIds.length !== 0) {
      throw new Error(`${label} expected one visible evidence badge section and one canonical ID; found ${sections.length} section(s), ${visibleIds.length} visible ID(s), ${contracts.length} hidden contract(s)`);
    }
  }
}

console.log(`Canonical evidence badge routes ensured across source and deploy output: ${checked} checked, ${changed} rewritten.`);
