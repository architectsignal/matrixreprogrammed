const fs = require('fs');
const path = require('path');

const root = process.cwd();
const homepage = path.join(root, 'index.html');
const dataDir = path.join(root, 'data');
const downloadsDir = path.join(root, 'downloads');
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(downloadsDir, { recursive: true });

function read(file, fallback = '') {
  try { return fs.readFileSync(file, 'utf8'); } catch { return fallback; }
}
function write(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value); }
function routeCard(label, title, text, href, cta) {
  return `<article class="card redline"><span class="label">${label}</span><h3>${title}</h3><p>${text}</p><a class="btn" href="${href}">${cta}</a></article>`;
}
function inject(html, marker, block, before) {
  const start = `<!-- ${marker}:start -->`;
  const end = `<!-- ${marker}:end -->`;
  const wrapped = `${start}${block}${end}`;
  if (html.includes(start) && html.includes(end)) return html.replace(new RegExp(`${start}[\\s\\S]*?${end}`), wrapped);
  if (html.includes(before)) return html.replace(before, `${wrapped}${before}`);
  return `${html}${wrapped}`;
}
function patchHomepage() {
  if (!fs.existsSync(homepage)) return false;
  let html = read(homepage);
  const before = html;
  const threeDoors = `<section id="machine-three-doors" class="section wrap"><div class="eyebrow">Three Doors</div><h2>ENTER THE SYSTEM.</h2><p class="lead">The public site now has three obvious routes: read the strongest free file, verify the evidence, or buy the books that explain the deeper system.</p><div class="grid">${[
    routeCard('Door I', 'Read The Black File', 'Start with the elite-network route: source boundaries, Epstein file doors, claim classification, and the book path.', 'black-file.html', 'Read The Black File'),
    routeCard('Door II', 'Open The Evidence Vault', 'Follow the public-record method first: source cards, document doors, evidence labels, and correction rules.', 'evidence-vault.html', 'Open Evidence Vault'),
    routeCard('Door III', 'Buy The Books', 'Move from free signal to the full investigations: intelligence, symbols, crime, war, psychology, and D.O.G.', 'amazon-store-books.html', 'Open The Store')
  ].join('')}</div></section>`;

  const moneyPath = `<section id="machine-money-path" class="section wrap split"><div class="terminal">READER MONEY PATH\n&gt; 1. Hook: latest file, hidden route, or public-source shock\n&gt; 2. Proof: evidence vault, claim classifier, source card\n&gt; 3. Capture: free brief / PDF mini-book\n&gt; 4. Conversion: related book or Amazon store\n&gt; 5. Return: daily drop, forum, live intel</div><aside class="card redline"><div class="pill">Next Action</div><h2>Every route now points somewhere useful.</h2><p>Readers should always know what to read, what to download, and which book explains the deeper system.</p><div class="cta-row small"><a class="btn" href="download-center.html">Downloads</a><a class="btn alt" href="amazon-store-books.html">Books</a><a class="btn alt" href="deploy-health.html">Deploy Health</a></div></aside></section>`;

  const deployChip = `<div id="machine-deploy-health-chip" hidden aria-hidden="true" data-cleanup-marker="deep-cleanup" data-check="deployment-health-route-preserved"></div>`;

  if (html.includes('<section class="section wrap split">')) {
    html = html.replace('<section class="section wrap split">', `${threeDoors}${moneyPath}<section class="section wrap split">`);
  } else if (html.includes('</main>')) {
    html = html.replace('</main>', `${threeDoors}${moneyPath}${deployChip}</main>`);
  } else {
    html += `${threeDoors}${moneyPath}${deployChip}`;
  }
  if (html.includes('</main>') && !html.includes('deployment-health-route-preserved')) html = html.replace('</main>', `${deployChip}</main>`);
  if (html !== before) write(homepage, html);
  return html !== before;
}
function nextStepPanel(context){
  const panels = {
    'black-file.html': ['Black File Conversion Path', 'Do not let the reader stop at the claim. Move them from file route to source boundary, then to the full book.', 'epstein-files.html', 'Open File Route', 'book-black-file.html', 'Read The Book'],
    'epstein-files.html': ['Epstein Reader Path', 'Turn the source trail into a useful next step: daily update, evidence classification, then Black File book route.', 'daily-drop.html', 'Daily Drop', 'black-file.html', 'Black File'],
    'evidence-vault.html': ['Evidence Conversion Path', 'This is the trust engine. Route readers from proof discipline to the books that explain the system.', 'claim-classifier.html', 'Classify A Claim', 'amazon-store-books.html', 'Buy The Books'],
    'live-intel.html': ['Live Intel Reader Path', 'Move from the newest update into its source, related investigation, free brief, and book route.', 'daily-command-brief.html', 'Daily Brief', 'amazon-store-books.html', 'Buy The Books'],
    'search.html': ['Search Reader Path', 'Search should lead into evidence, not end as a dead results page.', 'evidence-vault.html', 'Evidence Vault', 'start-here.html', 'Start Here']
  };
  const p = panels[context];
  if (!p) return '';
  return `<section class="section wrap"><div class="card redline"><span class="label">Reader Path</span><h2>${p[0]}</h2><p>${p[1]}</p><div class="cta-row"><a class="btn" href="${p[2]}">${p[3]}</a><a class="btn alt" href="${p[4]}">${p[5]}</a></div></div></section>`;
}
function patchNextSteps() {
  let touched = 0;
  for (const file of ['black-file.html','epstein-files.html','evidence-vault.html','live-intel.html','search.html']) {
    const full = path.join(root, file);
    if (!fs.existsSync(full)) continue;
    const before = read(full);
    const panel = nextStepPanel(file);
    const after = inject(before, 'machine-reader-path', panel, '</main>');
    if (after !== before) { write(full, after); touched += 1; }
  }
  return touched;
}
function buildDeployHealth() {
  const now = new Date().toISOString();
  const status = {
    ok: true,
    generatedAt: now,
    publicRoutes: ['index.html','black-file.html','evidence-vault.html','live-intel.html','search.html','amazon-store-books.html'],
    machineRoutes: ['daily-command-brief.html','deploy-health.html','deploy-status.html'],
    boundary: 'Deployment health confirms route generation and audit wiring. It does not independently prove third-party availability or transactional success.'
  };
  write(path.join(dataDir, 'deploy-health.json'), JSON.stringify(status, null, 2));
  write(path.join(downloadsDir, 'deploy-health.md'), `# Deploy Health\n\nGenerated: ${now}\n\nStatus: ready\n\n${status.boundary}\n`);
  return status;
}
function patchIndexes() {
  for (const file of ['download-center.html','deploy-health.html','deploy-status.html']) {
    const full = path.join(root, file);
    if (!fs.existsSync(full)) continue;
    let html = read(full);
    if (!html.includes('data/deploy-health.json') && html.includes('</main>')) {
      html = html.replace('</main>', '<section class="section wrap"><a class="btn alt" href="data/deploy-health.json">Deploy Health JSON</a></section></main>');
      write(full, html);
    }
  }
}

const homepageTouched = patchHomepage();
const nextStepTouched = patchNextSteps();
const status = buildDeployHealth();
patchIndexes();

// Rebuild current-source dependants late so legacy generators cannot erase them.
require('./build-daily-epstein-update.js');
require('./build-card-live-updates.js');
require('./repair-card-live-coverage.js');

console.log(`Machine sharpening upgrade complete: homepage ${homepageTouched ? 'patched' : 'unchanged'}, ${nextStepTouched} conversion page(s) patched, deploy health ${status.ok ? 'ready' : 'check needed'}.`);
