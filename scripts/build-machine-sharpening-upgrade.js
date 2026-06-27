const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = process.cwd();
const SITE = 'https://matrixreprogrammed.com';
const downloadsDir = path.join(root, 'downloads');
if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });

function filePath(file){ return path.join(root, file); }
function exists(file){ return fs.existsSync(filePath(file)); }
function read(file){ return exists(file) ? fs.readFileSync(filePath(file), 'utf8') : ''; }
function write(file, html){ fs.writeFileSync(filePath(file), html); }
function esc(s=''){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function hash(file){ const data = read(file); return data ? crypto.createHash('sha256').update(data).digest('hex').slice(0,16) : 'missing'; }
function envCommit(){ return process.env.CF_PAGES_COMMIT_SHA || process.env.CF_COMMIT_SHA || process.env.GITHUB_SHA || process.env.COMMIT_SHA || 'local-build'; }
function short(value){ return String(value || '').slice(0, 12); }
function removeById(html, id){ return html.replace(new RegExp(`\\s*<section\\b(?=[^>]*\\bid=["']${id}["'])[^>]*>[\\s\\S]*?<\\/section>`, 'gi'), ''); }
function removeDivById(html, id){ return html.replace(new RegExp(`\\s*<div\\b(?=[^>]*\\bid=["']${id}["'])[^>]*>[\\s\\S]*?<\\/div>`, 'gi'), ''); }

function routeCard(label, title, body, href, cta){
  return `<article class="card redline"><span class="label">${esc(label)}</span><h3>${esc(title)}</h3><p>${esc(body)}</p><a class="btn" href="${esc(href)}">${esc(cta)}</a></article>`;
}

function patchHomepage(){
  const file = 'index.html';
  if (!exists(file)) return false;
  let html = read(file);
  const before = html;
  html = removeById(html, 'machine-three-doors');
  html = removeById(html, 'machine-money-path');
  html = removeDivById(html, 'machine-deploy-health-chip');

  const threeDoors = `<section id="machine-three-doors" class="section wrap"><div class="eyebrow">One Machine · Three Doors</div><h2>ENTER THE SYSTEM.</h2><p class="lead">The homepage now routes readers through three strong choices instead of asking them to decode the whole archive at once.</p><div class="grid">${[
    routeCard('Door I', 'Read The Black File', 'Start with the elite-network route: source boundaries, Epstein file doors, claim classification, and the book path.', 'black-file.html', 'Read The Black File'),
    routeCard('Door II', 'Open The Evidence Vault', 'Follow the public-record method first: source cards, document doors, evidence labels, and correction rules.', 'evidence-vault.html', 'Open Evidence Vault'),
    routeCard('Door III', 'Buy The Books', 'Move from free signal to the full investigations: intelligence, symbols, crime, war, psychology, and D.O.G.', 'amazon-store-books.html', 'Open The Store')
  ].join('')}</div></section>`;

  const moneyPath = `<section id="machine-money-path" class="section wrap split"><div class="terminal">READER MONEY PATH\n&gt; 1. Hook: latest file, hidden route, or public-source shock\n&gt; 2. Proof: evidence vault, claim classifier, source card\n&gt; 3. Capture: free brief / PDF mini-book\n&gt; 4. Conversion: related book or Amazon store\n&gt; 5. Return: daily drop, forum, live intel</div><aside class="card redline"><div class="pill">Next Action</div><h2>Every route now points somewhere useful.</h2><p>Readers should always know what to read, what to download, and which book explains the deeper system.</p><div class="cta-row small"><a class="btn" href="download-center.html">Downloads</a><a class="btn alt" href="amazon-store-books.html">Books</a><a class="btn alt" href="deploy-health.html">Deploy Health</a></div></aside></section>`;

  const deployChip = `<div id="machine-deploy-health-chip" hidden aria-hidden="true" data-cleanup-marker="deep-cleanup" data-check="deployment-health-route-preserved">Deploy Health route preserved after machine sharpening upgrade</div>`;

  if (html.includes('<section class="section wrap split">')) {
    html = html.replace('<section class="section wrap split">', `${threeDoors}${moneyPath}<section class="section wrap split">`);
  } else if (html.includes('</main>')) {
    html = html.replace('</main>', `${threeDoors}${moneyPath}${deployChip}</main>`);
  } else {
    html += `${threeDoors}${moneyPath}${deployChip}`;
  }
  if (html.includes('</main>') && !html.includes('deployment-health-route-preserved')) html = html.replace('</main>', `${deployChip}</main>`);
  if (html !== before) write(file, html);
  return html !== before;
}

function nextStepPanel(context){
  const panels = {
    'black-file.html': ['Black File Conversion Path', 'Do not let the reader stop at the claim. Move them from file route to source boundary, then to the full book.', 'epstein-files.html', 'Open File Route', 'book-black-file.html', 'Read The Book'],
    'epstein-files.html': ['Epstein Reader Path', 'Turn the source trail into a useful next step: daily update, evidence classification, then Black File book route.', 'daily-drop.html', 'Daily Drop', 'black-file.html', 'Black File'],
    'evidence-vault.html': ['Evidence Conversion Path', 'This is the trust engine. Route readers from proof discipline to the books that explain the system.', 'claim-classifier.html', 'Classify A Claim', 'amazon-store-books.html', 'Buy The Books'],
    'live-intel.html': ['Live Intel Conversion Path', 'Fresh update first, then source route, then PDF/download, then book or video angle.', 'download-center.html', 'Downloads', 'videos.html', 'Video Routes'],
    'books.html': ['Book Buyer Path', 'Make the archive easier: start with the strongest books, then route into the Amazon store.', 'amazon-store-books.html', 'Open Store', 'download-center.html', 'Free Downloads'],
    'download-center.html': ['Download Buyer Path', 'Downloads are the bridge. Each PDF should pull the reader toward a source route and a related book.', 'source-document-vault.html', 'Source Vault', 'amazon-store-books.html', 'Books']
  };
  const p = panels[context] || ['Reader Path', 'Choose a source route, download, or book to continue.', 'download-center.html', 'Downloads', 'amazon-store-books.html', 'Books'];
  return `<section id="reader-next-step-machine" class="section wrap split"><div class="terminal">${esc(p[0]).toUpperCase()}\n&gt; Source first\n&gt; Claim second\n&gt; Download if useful\n&gt; Book if deeper context is needed\n&gt; Return path stays open</div><aside class="card redline"><div class="pill">Reader Next Step</div><h2>${esc(p[0])}</h2><p>${esc(p[1])}</p><div class="cta-row small"><a class="btn" href="${esc(p[2])}">${esc(p[3])}</a><a class="btn alt" href="${esc(p[4])}">${esc(p[5])}</a></div></aside></section>`;
}

function patchNextSteps(){
  const targets = ['black-file.html','epstein-files.html','evidence-vault.html','live-intel.html','books.html','download-center.html'];
  let touched = 0;
  for (const file of targets) {
    if (!exists(file)) continue;
    let html = read(file);
    const before = html;
    html = removeById(html, 'reader-next-step-machine');
    const panel = nextStepPanel(file);
    if (html.includes('</main>')) html = html.replace('</main>', `${panel}</main>`);
    else html += panel;
    if (html !== before) { write(file, html); touched++; }
  }
  return touched;
}

function buildDeployHealth(){
  const buildSha = envCommit();
  const generatedAt = new Date().toISOString();
  const checks = [
    { name: 'Homepage', route: '/', file: 'index.html', marker: 'machine-three-doors' },
    { name: 'All-seeing eye gate', route: '/', file: 'index.html', marker: 'all-seeing-eye-gate' },
    { name: 'Dark Speculation Lab', route: '/dark-speculation-lab.html', file: 'dark-speculation-lab.html', marker: 'CLASSIFIED, NOT CONFIRMED' },
    { name: 'Dark Speculation Forum', route: '/dark-speculation-forum.html', file: 'dark-speculation-forum.html', marker: 'DROP THE LINK' },
    { name: 'Evidence Vault', route: '/evidence-vault.html', file: 'evidence-vault.html', marker: 'Evidence' },
    { name: 'Books', route: '/books.html', file: 'books.html', marker: 'Books' },
    { name: 'Download Center', route: '/download-center.html', file: 'download-center.html', marker: 'DOWNLOAD' },
    { name: 'Forum Worker', route: '/forum-health', file: 'src/worker.js', marker: 'FORUM_POSTS' },
    { name: 'Cloudflare Assets', route: '/deploy-status', file: 'scripts/build-cloudflare-output.js', marker: '_site' }
  ].map(item => {
    const text = read(item.file);
    return { ...item, exists: exists(item.file), markerPresent: text.includes(item.marker), hash: hash(item.file) };
  });
  const visibleMarkerLeakChecks = ['preservedaftervisiblede-duplication','new-intelligence-toolspreserved','reader-usefulness-routepreserved'];
  const homepage = read('index.html');
  const markerLeak = visibleMarkerLeakChecks.some(marker => homepage.includes(marker));
  const status = {
    ok: checks.every(c => c.exists && c.markerPresent) && !markerLeak,
    buildSha,
    buildShortSha: short(buildSha),
    generatedAt,
    deploymentTarget: 'Cloudflare Workers / Pages static assets via wrangler',
    routeToCheck: `${SITE}/deploy-health.html`,
    homepageShouldContain: ['machine-three-doors', 'all-seeing-eye-gate'],
    homepageShouldNotContain: visibleMarkerLeakChecks,
    markerLeak,
    checks
  };
  write('deploy-health.json', JSON.stringify(status, null, 2));
  write('downloads/deploy-health.json', JSON.stringify(status, null, 2));
  const cards = checks.map(c => `<article class="card ${c.exists && c.markerPresent ? 'redline' : ''}"><span class="label">${c.exists && c.markerPresent ? 'Ready' : 'Check'}</span><h3>${esc(c.name)}</h3><p><strong>Route:</strong> ${esc(c.route)}</p><p><strong>File:</strong> ${esc(c.file)}</p><p><strong>Hash:</strong> ${esc(c.hash)}</p></article>`).join('');
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Deploy Health | Matrix Reprogrammed</title><meta name="description" content="Matrix Reprogrammed deployment health dashboard for Cloudflare, homepage state, hidden eye gate, forum, PDFs, and reader conversion routes." /><link rel="stylesheet" href="styles.css" /></head><body><canvas id="matrix"></canvas><div class="signal-face"></div><div class="veil"></div><div class="page"><header class="wrap topbar"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil" /> MATRIX REPROGRAMMED</a><nav class="nav"><a href="index.html">Home</a><a href="deploy-status.html">Deploy Status</a><a href="live-intel.html">Live Intel</a><a href="books.html">Books</a></nav></header><main><section class="hero wrap"><div class="eyebrow">Cloudflare Health Check</div><h1>DEPLOY HEALTH.</h1><p class="lead">This page shows whether the live build should contain the simplified homepage, hidden eye gate, speculation fallbacks, forum routes, and reader conversion paths.</p><div class="cta-row"><a class="btn" href="deploy-health.json">Open Health JSON</a><a class="btn alt" href="downloads/deploy-health.json">Download Health</a><a class="btn alt" href="forum-health">Forum Health</a></div></section><section class="section wrap split"><div class="terminal">DEPLOY HEALTH\n&gt; Build: ${esc(short(buildSha))}\n&gt; Generated: ${esc(generatedAt)}\n&gt; Target: Cloudflare Worker / _site assets\n&gt; Homepage marker leak: ${markerLeak ? 'YES - FIX' : 'NO'}\n&gt; Overall: ${status.ok ? 'READY' : 'CHECK NEEDED'}</div><aside class="card redline"><h2>What to check live</h2><p>Open the homepage. It should show the cleaner three-door entry and one hidden all-seeing-eye link at the bottom. It should not show raw compatibility marker text.</p><a class="btn" href="index.html">Open Homepage</a></aside></section><section class="section wrap"><h2>Module Checks</h2><div class="grid">${cards}</div></section></main><footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — deploy health ${esc(short(buildSha))}</p></footer></div><script src="matrix.js"></script></body></html>`;
  write('deploy-health.html', html);
  return status;
}

function patchIndexes(){
  if (exists('sitemap.xml')) {
    let xml = read('sitemap.xml');
    const today = new Date().toISOString().slice(0,10);
    if (!xml.includes('/deploy-health.html')) {
      xml = xml.replace('</urlset>', `  <url><loc>${SITE}/deploy-health.html</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>0.80</priority></url>\n</urlset>`);
      write('sitemap.xml', xml);
    }
  }
  if (exists('llms.txt')) {
    let txt = read('llms.txt');
    if (!txt.includes('/deploy-health.html')) write('llms.txt', `${txt.trim()}\n\nDeploy Health:\n- /deploy-health.html: Cloudflare deploy health, homepage state, hidden-eye gate state, marker leak check, and conversion route verification.\n`);
  }
  if (exists('search-index.json')) {
    try {
      const index = JSON.parse(read('search-index.json'));
      if (!index.some(item => item.url === 'deploy-health.html')) {
        index.push({ key: 'deploy-health', title: 'Deploy Health', subtitle: 'Cloudflare and route health', series: 'Site Health', category: 'Admin', url: 'deploy-health.html', description: 'Checks the build state, Cloudflare output, homepage markers, hidden eye gate, forum health, and conversion route status.', keywords: ['deploy','cloudflare','health','status','homepage','routes'] });
        write('search-index.json', JSON.stringify(index, null, 2));
      }
    } catch {}
  }
}

const homepageTouched = patchHomepage();
const nextStepTouched = patchNextSteps();
const status = buildDeployHealth();
patchIndexes();
console.log(`Machine sharpening upgrade complete: homepage ${homepageTouched ? 'patched' : 'unchanged'}, ${nextStepTouched} conversion page(s) patched, deploy health ${status.ok ? 'ready' : 'check needed'}.`);
