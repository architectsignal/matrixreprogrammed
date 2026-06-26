const fs = require('fs');
const path = require('path');

const root = process.cwd();
const downloadsDir = path.join(root, 'downloads');
if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')); } catch { return fallback; }
}
function write(file, content) { fs.writeFileSync(path.join(root, file), content); }
function esc(value = '') { return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function clean(value = '') { return String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
function nav() {
  return `<header class="wrap topbar"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil" /> MATRIX REPROGRAMMED</a><nav class="nav"><a href="index.html">Home</a><a href="daily-drop.html">Daily Drop</a><a href="epstein-files.html">Epstein</a><a href="network-search.html">Network Search</a><a href="claim-classifier.html">Claim Classifier</a><a href="evidence-vault.html">Evidence Vault</a><a href="download-center.html">Downloads</a></nav></header>`;
}
function layout(title, desc, body) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${esc(title)}</title><meta name="description" content="${esc(desc)}" /><meta property="og:title" content="${esc(title)}" /><meta property="og:description" content="${esc(desc)}" /><meta property="og:type" content="website" /><link rel="stylesheet" href="styles.css" /><script type="application/ld+json">${JSON.stringify({'@context':'https://schema.org','@type':'CollectionPage',name:title,description:desc,dateModified:new Date().toISOString()})}</script></head><body><canvas id="matrix"></canvas><div class="signal-face"></div><div class="veil"></div><div class="page">${nav()}${body}<footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — evidence class before claim strength.</p><p class="warning">Classification boundary: a record can be real and still not prove the strongest claim people want to make from it.</p></footer></div><script src="matrix.js"></script></body></html>`;
}

const evidenceVault = readJson('data/evidence-vault.json', { sourceHierarchy: [], claimRules: [], sourceCards: [] });
const peopleIndex = readJson('data/epstein-people-index.json', { evidenceClasses: [] });
const classifier = {
  updated: new Date().toISOString(),
  purpose: 'Public evidence-badge and claim-classifier system for Matrix Reprogrammed. It tells readers what a record proves, what it does not prove, and what source would strengthen a claim.',
  rule: 'Source first. Evidence class second. Claim strength third. Network interpretation last.',
  badges: [
    { label: 'Court Record', strength: 'High', proves: 'A filing, order, docket, exhibit, testimony transcript, judgment, plea, or court-managed document exists.', doesNotProve: 'It does not automatically prove every allegation inside the filing unless the court found it, the party admitted it, or the record independently supports it.', strengthensWith: 'Ruling, exhibit, sworn transcript, plea, verdict, authenticated docket entry.' },
    { label: 'Official Source', strength: 'High', proves: 'A government, regulator, court, agency, committee, or official dataset published the material.', doesNotProve: 'It may still need context, date, definitions, limitations, redactions, and category separation.', strengthensWith: 'Original publication page, dataset notes, definitions, release memo, archive capture.' },
    { label: 'Declassified Archive', strength: 'Medium / High', proves: 'A released file, FOIA record, archive item, or historical government document exists.', doesNotProve: 'It does not automatically prove present-day claims or the full surrounding context.', strengthensWith: 'File date, agency origin, release package, related files, independent corroboration.' },
    { label: 'Email / Message Record', strength: 'Medium / High', proves: 'A correspondence record, message thread, sender/recipient/date/context trail, or archive result exists.', doesNotProve: 'It does not automatically prove the truth of statements made inside the message.', strengthensWith: 'Authenticated archive, full thread, metadata, attachments, matching public records.' },
    { label: 'Flight / Log / Contact Record', strength: 'Medium', proves: 'A name, trip, contact, phone-book entry, schedule, log, or proximity record exists.', doesNotProve: 'It does not prove criminal conduct, knowledge, intent, or participation by itself.', strengthensWith: 'Multiple records, testimony, date alignment, corroborating emails, court exhibits.' },
    { label: 'Sworn Claim', strength: 'Medium', proves: 'A person made a claim under oath or in a legal setting.', doesNotProve: 'A sworn claim is not the same as a court finding or conviction.', strengthensWith: 'Corroborating documents, cross-examination, court acceptance, supporting exhibits.' },
    { label: 'Settlement / NDA', strength: 'Medium', proves: 'A private legal resolution, silence agreement, or civil compromise exists or is credibly reported.', doesNotProve: 'It is not an admission unless the settlement says it is.', strengthensWith: 'Settlement text, court filings, party statements, payment terms, related testimony.' },
    { label: 'Financial / Access Record', strength: 'Medium', proves: 'Money, payments, donations, employment, advisory access, institutional access, or financial proximity exists.', doesNotProve: 'Money or access is not automatic proof of sex-crime participation or operational knowledge.', strengthensWith: 'Invoices, bank records, filings, internal reviews, testimony, contemporaneous correspondence.' },
    { label: 'Credible Reporting / News Lead', strength: 'Lead', proves: 'A reputable outlet has reported a claim, source trail, legal update, or document lead.', doesNotProve: 'Reporting is a lead unless backed by primary documents, direct evidence, or court findings.', strengthensWith: 'Primary records, multiple independent outlets, linked documents, named on-record sources.' },
    { label: 'Interpretive / Symbolic Claim', strength: 'Interpretation', proves: 'An interpretation, pattern, symbolic reading, or analytical argument has been made.', doesNotProve: 'It does not prove criminal conduct or conspiracy by itself.', strengthensWith: 'Primary text, historical source, doctrinal source, direct admission, external corroboration.' },
    { label: 'Speculation Quarantine', strength: 'Quarantined', proves: 'A hypothesis exists but does not yet have enough evidence to publish as a claim.', doesNotProve: 'It proves nothing beyond a research lead.', strengthensWith: 'Primary records, named sources, court documents, official releases, authenticated archives.' },
    { label: 'Unsupported / Rejected', strength: 'Rejected', proves: 'The claim lacks sufficient sourcing or violates the site evidence boundary.', doesNotProve: 'It should not be promoted as fact.', strengthensWith: 'A real public source trail before publication.' }
  ],
  sourceHierarchy: evidenceVault.sourceHierarchy || [],
  claimRules: evidenceVault.claimRules || [],
  peopleEvidenceClasses: peopleIndex.evidenceClasses || []
};

function badgeCards() {
  return classifier.badges.map(b => `<article class="card redline"><span class="label">${esc(b.strength)}</span><h3>${esc(b.label)}</h3><p><strong>What it proves:</strong> ${esc(b.proves)}</p><p><strong>What it does not prove:</strong> ${esc(b.doesNotProve)}</p><p><strong>What strengthens it:</strong> ${esc(b.strengthensWith)}</p></article>`).join('');
}
function hierarchyCards() {
  return (classifier.sourceHierarchy || []).map(label => `<article class="card"><span class="label">Source hierarchy</span><h3>${esc(label)}</h3><p>Use this source type to decide whether the reader is seeing a primary record, a legal record, an official dataset, reporting, or interpretation.</p></article>`).join('');
}
function rulesList() {
  return (classifier.claimRules || []).map(rule => `<li>${esc(rule)}</li>`).join('');
}
function buildClassifierPage() {
  fs.writeFileSync(path.join(root, 'downloads', 'claim-classifier.json'), JSON.stringify(classifier, null, 2));
  fs.writeFileSync(path.join(root, 'downloads', 'claim-classifier.md'), `# Matrix Reprogrammed Claim Classifier\n\nUpdated: ${classifier.updated}\n\nRule: ${classifier.rule}\n\n## Evidence Badges\n\n${classifier.badges.map(b => `### ${b.label}\n\n- Strength: ${b.strength}\n- What it proves: ${b.proves}\n- What it does not prove: ${b.doesNotProve}\n- What strengthens it: ${b.strengthensWith}\n`).join('\n')}\n\n## Claim Rules\n\n${(classifier.claimRules || []).map(r => `- ${r}`).join('\n')}\n`);
  const body = `<main><section class="hero wrap"><div class="eyebrow">Evidence Badge System</div><h1>CLAIM CLASSIFIER.</h1><p class="lead">Before a reader believes a claim, they should know what kind of record supports it. This page classifies court records, official sources, declassified files, emails, contact logs, sworn claims, settlements, financial access, reporting, interpretation, speculation, and unsupported claims.</p><div class="cta-row"><a class="btn" href="downloads/claim-classifier.json">Classifier JSON</a><a class="btn alt" href="downloads/claim-classifier.md">Markdown Classifier</a><a class="btn alt" href="evidence-vault.html">Evidence Vault</a><a class="btn alt" href="daily-drop.html">Daily Drop</a></div></section><section class="section wrap split"><div class="terminal">CLAIM CLASSIFIER STATUS\n&gt; Updated: ${esc(classifier.updated)}\n&gt; Badge classes: ${classifier.badges.length}\n&gt; Source hierarchy entries: ${(classifier.sourceHierarchy || []).length}\n&gt; Claim rules: ${(classifier.claimRules || []).length}\n&gt; Rule: source first, evidence class second, claim strength third</div><aside class="card redline"><h2>How To Use It</h2><p>Open the source. Pick the evidence badge. State what it proves. State what it does not prove. Only then connect it to a network function or book route.</p></aside></section><section class="section wrap"><h2>Evidence Badges</h2><div class="grid">${badgeCards()}</div></section><section class="section wrap"><h2>Source Hierarchy</h2><div class="grid">${hierarchyCards()}</div></section><section class="section wrap"><h2>Claim Rules</h2><div class="card"><ul>${rulesList()}</ul></div></section></main>`;
  write('claim-classifier.html', layout('Claim Classifier | Matrix Reprogrammed', 'Evidence badge and claim-strength classifier for public-record elite-network research.', body));
}
function patchPage(file) {
  const p = path.join(root, file);
  if (!fs.existsSync(p)) return;
  let html = fs.readFileSync(p, 'utf8');
  if (html.includes('id="evidence-badge-system-route"')) return;
  const section = `<section id="evidence-badge-system-route" class="section wrap"><h2>Evidence Badge / Claim Classifier</h2><p class="lead">Every major claim should show what the record proves, what it does not prove, and what would strengthen it. Use the classifier before treating a source lead as a conclusion.</p><div class="cta-row"><a class="btn" href="claim-classifier.html">Open Claim Classifier</a><a class="btn alt" href="downloads/claim-classifier.json">Classifier JSON</a><a class="btn alt" href="evidence-vault.html">Evidence Vault</a></div></section>`;
  html = html.replace('</main>', `${section}</main>`);
  fs.writeFileSync(p, html);
}
function patchSitemap() {
  const p = path.join(root, 'sitemap.xml');
  if (!fs.existsSync(p)) return;
  let xml = fs.readFileSync(p, 'utf8');
  if (!xml.includes('/claim-classifier.html</loc>')) xml = xml.replace('</urlset>', `  <url><loc>https://matrixreprogrammed.com/claim-classifier.html</loc><lastmod>${new Date().toISOString().slice(0,10)}</lastmod><changefreq>weekly</changefreq><priority>0.95</priority></url>\n</urlset>`);
  fs.writeFileSync(p, xml);
}
function patchLlms() {
  const p = path.join(root, 'llms.txt');
  if (!fs.existsSync(p)) return;
  let txt = fs.readFileSync(p, 'utf8');
  if (!txt.includes('/claim-classifier.html')) txt += `\n\nClaim Classifier:\n- /claim-classifier.html: public evidence-badge system defining source class, claim strength, proof boundary, and what would strengthen a claim.\n- /downloads/claim-classifier.json: machine-readable classifier data.\n- /downloads/claim-classifier.md: human-readable classifier brief.\n`;
  fs.writeFileSync(p, txt);
}
function patchSearchIndex() {
  const p = path.join(root, 'search-index.json');
  if (!fs.existsSync(p)) return;
  const index = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (!index.some(item => item.url === 'claim-classifier.html')) {
    index.push({ key:'claim-classifier', title:'Claim Classifier', subtitle:'Evidence badges and claim-strength rules', series:'Matrix Reprogrammed', category:'Evidence System', url:'claim-classifier.html', description:'Public evidence-badge system for court records, official sources, emails, contact logs, settlements, sworn claims, reporting, interpretation, speculation, and unsupported claims.', keywords:['claim classifier','evidence badges','court record','official source','settlement','email record','source boundary','speculation quarantine'] });
  }
  fs.writeFileSync(p, JSON.stringify(index, null, 2));
}

buildClassifierPage();
for (const file of ['index.html','daily-drop.html','epstein-files.html','network-search.html','live-intel.html','evidence-vault.html','download-center.html','news.html','books.html','black-file.html']) patchPage(file);
patchSitemap();
patchLlms();
patchSearchIndex();
console.log(`Evidence badge system built: ${classifier.badges.length} badges, claim-classifier.html, downloads, page patches, sitemap, llms, and search index.`);
