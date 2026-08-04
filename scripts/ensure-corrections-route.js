'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const site = path.join(root, '_site');
const policyPath = path.join(root, 'data', 'trust-center.json');
const reportPath = path.join(root, 'downloads', 'corrections-route-finalization.json');
const reviewed = '2026-08-04';

function esc(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function readPolicy() {
  if (!fs.existsSync(policyPath)) {
    throw new Error('data/trust-center.json is missing; the correction route cannot be evidence-bound.');
  }
  const data = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
  const correction = (data.pages || []).find(page => page.slug === 'corrections-policy');
  if (!correction) throw new Error('The Trust Center correction policy is missing.');
  return { data, correction };
}

function render(correction) {
  const rules = (correction.sections || [])
    .map(rule => `<li>${esc(rule)}</li>`)
    .join('');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Corrections and Challenges | Matrix Reprogrammed</title>
  <meta name="description" content="Challenge a Matrix Reprogrammed name, date, figure, source classification, route or conclusion with a precise public record." />
  <meta property="og:title" content="Corrections and Challenges | Matrix Reprogrammed" />
  <meta property="og:description" content="Submit a precise, source-backed correction or challenge to the public accountability record." />
  <meta property="og:type" content="website" />
  <link rel="canonical" href="https://matrixreprogrammed.com/corrections.html" />
  <link rel="stylesheet" href="styles.css" />
  <link rel="stylesheet" href="fixes.css" />
</head>
<body>
  <canvas id="matrix" aria-hidden="true"></canvas>
  <div class="page">
    <header class="wrap topbar">
      <a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil" /> MATRIX REPROGRAMMED</a>
      <nav class="nav" aria-label="Primary navigation">
        <a href="start-here.html">Start Here</a>
        <a href="evidence-vault.html">Evidence Vault</a>
        <a href="claim-classifier.html">Claim Classifier</a>
        <a href="trust-center.html">Trust Center</a>
        <a href="contact-the-machine.html">Contact</a>
      </nav>
    </header>
    <main data-corrections-route="canonical" data-reviewed="${reviewed}">
      <section class="hero wrap">
        <div class="eyebrow">Public correction route · reviewed ${reviewed}</div>
        <h1>CORRECTIONS<br />&amp; CHALLENGES.</h1>
        <p class="lead">A public accountability record must be correctable. Challenge a name, date, figure, quotation, source class, relationship, route or conclusion with the exact page location and the strongest record available.</p>
        <div class="cta-row">
          <a class="btn" href="contact-the-machine.html?type=correction">Submit a correction</a>
          <a class="btn alt" href="trust-corrections.html">Read the correction policy</a>
          <a class="btn alt" href="evidence-policy.html">Evidence policy</a>
        </div>
      </section>
      <section class="section wrap split">
        <div>
          <div class="eyebrow">What to include</div>
          <h2>MAKE THE CHALLENGE PRECISE.</h2>
          <div class="grid">
            <article class="card"><h3>1. Exact location</h3><p>Provide the public URL, page heading and the sentence, figure, label or relationship that should be reviewed.</p></article>
            <article class="card"><h3>2. Proposed correction</h3><p>State what is wrong or incomplete and provide the corrected wording, date, identity, scope or evidence classification.</p></article>
            <article class="card"><h3>3. Strongest record</h3><p>Link the primary document, court record, official filing, archived statement or credible counter-source that supports the challenge.</p></article>
            <article class="card"><h3>4. Why it changes the record</h3><p>Explain whether the new material strengthens, weakens, narrows, contradicts or merely adds context to the published conclusion.</p></article>
          </div>
        </div>
        <aside class="card redline">
          <h2>Correction boundary</h2>
          <p>${esc(correction.summary)}</p>
          <ul>${rules}</ul>
          <p><strong>Fair-response rule:</strong> disagreement alone does not require deletion, and publication does not make a claim immune from correction. The evidence class, wording and prominence must follow the strongest available record.</p>
        </aside>
      </section>
      <section class="section wrap">
        <div class="eyebrow">Review outcome</div>
        <h2>WHAT HAPPENS NEXT.</h2>
        <div class="grid">
          <article class="card"><h3>Factual error</h3><p>The page should be corrected promptly and the stronger record attached.</p></article>
          <article class="card"><h3>Evidence overstated</h3><p>The claim should be narrowed or downgraded rather than defended beyond the record.</p></article>
          <article class="card"><h3>Credible dispute</h3><p>The counter-source and unresolved point should remain visible while the evidence is reviewed.</p></article>
          <article class="card"><h3>No supporting record</h3><p>The challenge may be logged without changing the page. Unsupported repetition is not counter-evidence.</p></article>
        </div>
        <p class="evidence-note"><strong>Privacy:</strong> do not submit private victim information, credentials, unlawfully obtained material or unnecessary personal data through the ordinary contact route. Use the secure intake instructions for sensitive lawful records.</p>
      </section>
    </main>
    <footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — corrections strengthen the public record.</p></footer>
  </div>
  <script src="matrix.js"></script>
</body>
</html>`;
}

function writeFile(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const before = fs.existsSync(file) && fs.statSync(file).isFile() ? fs.readFileSync(file, 'utf8') : '';
  if (before !== content) fs.writeFileSync(file, content);
  return before !== content;
}

function addSitemapRoute(base) {
  const file = path.join(base, 'sitemap.xml');
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return false;
  let xml = fs.readFileSync(file, 'utf8');
  if (xml.includes('/corrections.html</loc>')) return false;
  const route = `  <url><loc>https://matrixreprogrammed.com/corrections.html</loc><lastmod>${reviewed}</lastmod><changefreq>weekly</changefreq><priority>0.92</priority></url>`;
  if (!/<\/urlset>/i.test(xml)) throw new Error(`${path.relative(root, file)} has no sitemap closing tag.`);
  xml = xml.replace(/<\/urlset>/i, `${route}\n</urlset>`);
  fs.writeFileSync(file, xml);
  return true;
}

function addLlmsRoute(base) {
  const file = path.join(base, 'llms.txt');
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return false;
  let text = fs.readFileSync(file, 'utf8');
  if (/\/corrections\.html\b/.test(text)) return false;
  text = `${text.trim()}\n- /corrections.html: public route for precise source-backed corrections and challenges.\n`;
  fs.writeFileSync(file, text);
  return true;
}

const { correction } = readPolicy();
const html = render(correction);
const targets = [path.join(root, 'corrections.html')];
if (fs.existsSync(site) && fs.statSync(site).isDirectory()) {
  targets.push(path.join(site, 'corrections.html'), path.join(site, 'corrections'));
}
const results = targets.map(file => ({
  file: path.relative(root, file).split(path.sep).join('/'),
  changed: writeFile(file, html)
}));
const metadataChanges = [];
for (const base of [root, site]) {
  if (!fs.existsSync(base) || !fs.statSync(base).isDirectory()) continue;
  if (addSitemapRoute(base)) metadataChanges.push(path.relative(root, path.join(base, 'sitemap.xml')).split(path.sep).join('/'));
  if (addLlmsRoute(base)) metadataChanges.push(path.relative(root, path.join(base, 'llms.txt')).split(path.sep).join('/'));
}

const requiredMarkers = [
  'data-corrections-route="canonical"',
  'CORRECTIONS',
  'Submit a correction',
  'Read the correction policy',
  'Correction boundary',
  'contact-the-machine.html?type=correction'
];
const issues = [];
for (const target of targets) {
  const content = fs.readFileSync(target, 'utf8');
  for (const marker of requiredMarkers) {
    if (!content.includes(marker)) issues.push(`${path.relative(root, target)} missing ${marker}`);
  }
}
const report = {
  ok: issues.length === 0,
  generatedAt: new Date().toISOString(),
  reviewed,
  canonicalRoute: 'corrections.html',
  policyRoute: 'trust-corrections.html',
  targets: results,
  metadataChanges,
  issues,
  boundary: 'The correction route accepts precise, source-backed challenges. It does not auto-delete records, publish private material or treat unsupported disagreement as counter-evidence.'
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) {
  console.error('CORRECTIONS ROUTE FINALIZATION FAILED');
  issues.forEach(issue => console.error(`- ${issue}`));
  process.exit(1);
}
console.log(`Corrections route finalized across ${results.length} source/output route(s); ${results.filter(result => result.changed).length} changed.`);
module.exports = report;
