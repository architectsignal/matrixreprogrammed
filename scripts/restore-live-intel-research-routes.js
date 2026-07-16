const fs = require('fs');
const path = require('path');

const root = process.cwd();
const target = path.join(root, 'live-intel.html');
if (!fs.existsSync(target)) throw new Error('live-intel.html not found');

let html = fs.readFileSync(target, 'utf8');
const before = html;

const routes = [
  {
    id: 'source-card-system',
    section: `<section id="source-card-system" class="section wrap"><h2>Source Cards</h2><p class="lead">Open the source card before sharing a strong claim: source, evidence class, what the record supports, what it does not prove, and the next document route.</p><div class="cta-row"><a class="btn" href="source-cards.html">Open Source Cards</a><a class="btn alt" href="downloads/source-cards.json">Source Cards JSON</a></div></section>`
  },
  {
    id: 'daily-drop-command-route',
    section: `<section id="daily-drop-command-route" class="section wrap"><h2>Daily Drop / Command Center</h2><p class="lead">Return daily for source-watch changes, file movement, evidence-class badges, people and entity updates, actual source doors, free briefs and book routes.</p><div class="cta-row"><a class="btn" href="daily-drop.html">Open Today’s Drop</a><a class="btn alt" href="network-search.html">Search The Network</a><a class="btn alt" href="epstein-files.html#premier-epstein-command-center">Epstein Command Center</a><a class="btn alt" href="downloads/daily-drop.json">Daily Drop Data</a></div></section>`
  },
  {
    id: 'evidence-badge-system-route',
    section: `<section id="evidence-badge-system-route" class="section wrap"><h2>Evidence Badge / Claim Classifier</h2><p class="lead">Every major claim should show what the record proves, what it does not prove, and what would strengthen it. Use the classifier before treating a source lead as a conclusion.</p><div class="cta-row"><a class="btn" href="claim-classifier.html">Open Claim Classifier</a><a class="btn alt" href="downloads/claim-classifier.json">Classifier JSON</a><a class="btn alt" href="evidence-vault.html">Evidence Vault</a></div></section>`
  },
  {
    id: 'source-document-vault-route',
    section: `<section id="source-document-vault-route" class="section wrap"><h2>Actual Files First</h2><p class="lead">Open the source door before the interpretation. The Source Document Vault routes readers to official disclosures, courts, archives, financial records, influence records and evidence classification.</p><div class="cta-row"><a class="btn" href="source-document-vault.html">Open Source Document Vault</a><a class="btn alt" href="downloads/source-document-vault.json">Vault JSON</a><a class="btn alt" href="claim-classifier.html">Claim Classifier</a></div></section>`
  }
];

for (const route of routes) {
  if (html.includes(`id="${route.id}"`)) continue;
  if (!html.includes('</main>')) throw new Error(`live-intel.html cannot accept ${route.id}: </main> missing`);
  html = html.replace('</main>', `${route.section}</main>`);
}

fs.writeFileSync(target, html);
const missing = routes.filter(route => !html.includes(`id="${route.id}"`));
if (missing.length) throw new Error(`Live Intel research-route restoration incomplete: ${missing.map(item => item.id).join(', ')}`);

fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'live-intel-research-routes.json'), JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  changed: html !== before,
  routes: routes.map(route => route.id)
}, null, 2));
console.log(`Live Intel research routes restored: ${routes.length} required route(s); changed=${html !== before}.`);
