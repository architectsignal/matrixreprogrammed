const fs = require('fs');
const path = require('path');

const root = process.cwd();
const SITE = 'https://matrixreprogrammed.com';
const dataPath = path.join(root, 'data', 'dark-speculation-claims.json');
if (!fs.existsSync(dataPath)) {
  console.log('No dark speculation dataset found. Skipping.');
  process.exit(0);
}
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const liveIntel = readJson('data/live-intel.json', { items: [] });
if (!fs.existsSync(path.join(root, 'downloads'))) fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });

function readJson(file, fallback){ try { return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')); } catch { return fallback; } }
function exists(file){ return fs.existsSync(path.join(root, file)); }
function read(file){ return fs.readFileSync(path.join(root, file), 'utf8'); }
function write(file, html){ fs.writeFileSync(path.join(root, file), html); }
function esc(s=''){ return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function routeUrl(route=''){ return /^https?:\/\//i.test(route) ? route : `${SITE}/${String(route).replace(/^\//,'')}`; }
function terms(claim){ return Array.from(new Set([claim.title, claim.category, claim.label, claim.boundary, ...(claim.keywords || [])].join(' ').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 3))); }
function score(text, t){ const hay = String(text || '').toLowerCase(); return t.reduce((n, term) => n + (hay.includes(term) ? 1 : 0), 0); }
function matchesFor(claim, limit=4){
  const t = terms(claim);
  return (liveIntel.items || [])
    .map(item => ({ item, score: score([item.title,item.summary,item.lane,item.sourceLabel,item.evidenceBoundary].join(' '), t) }))
    .filter(x => x.score > 0)
    .sort((a,b) => b.score - a.score)
    .slice(0, limit)
    .map(x => x.item);
}
function nav(){ return `<header class="wrap topbar"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil" /> MATRIX REPROGRAMMED</a><nav class="nav"><a href="index.html">Home</a><a href="dark-speculation-lab.html">Dark Lab</a><a href="dark-speculation-forum.html">Drop Box</a><a href="claim-classifier.html">Claim Classifier</a><a href="source-document-vault.html">Sources</a><a href="download-center.html">Downloads</a><a href="books.html">Books</a></nav></header>`; }
function layout(title, desc, body){ return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${esc(title)}</title><meta name="description" content="${esc(desc)}" /><meta property="og:title" content="${esc(title)}" /><meta property="og:description" content="${esc(desc)}" /><meta property="og:type" content="website" /><link rel="stylesheet" href="styles.css" /></head><body><canvas id="matrix"></canvas><div class="signal-face"></div><div class="veil"></div><div class="page">${nav()}${body}<footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — source first, claim second.</p><p class="warning">Dark Speculation Boundary: this archive tracks motifs, rumours, symbols, public-record-adjacent claims, and internet lore. It does not present them as fact.</p></footer></div><script src="matrix.js"></script></body></html>`; }
function claimCard(claim){
  const m = matchesFor(claim);
  const matchLine = m.length ? `${m.length} live-intel match(es)` : 'No current live-intel match';
  return `<article class="card redline"><span class="label">${esc(claim.category)} · ${esc(claim.label)}</span><h3>${esc(claim.title)}</h3><p><strong>Boundary:</strong> ${esc(claim.boundary)}</p><p><strong>Weekly scan:</strong> ${esc(matchLine)}</p><p class="source-list">${(claim.keywords || []).slice(0,5).map(k => `<span class="pill">${esc(k)}</span>`).join(' ')}</p><div class="cta-row small"><a class="btn alt" href="claim-classifier.html">Classify</a><a class="btn alt" href="source-document-vault.html">Sources</a><a class="btn" href="dark-speculation-forum.html">Drop Link</a></div></article>`;
}
function groupedClaims(){
  const groups = new Map();
  for (const claim of data.claims || []) {
    if (!groups.has(claim.category)) groups.set(claim.category, []);
    groups.get(claim.category).push(claim);
  }
  return Array.from(groups.entries()).map(([cat, claims]) => `<section class="section wrap"><h2>${esc(cat)}</h2><div class="grid">${claims.map(claimCard).join('')}</div></section>`).join('');
}
function buildScan(){
  const claims = (data.claims || []).map(claim => {
    const matches = matchesFor(claim, 8).map(item => ({ title: item.title, url: item.url, sourceLabel: item.sourceLabel, published: item.published, summary: item.summary, evidenceBoundary: item.evidenceBoundary }));
    return { slug: claim.slug, title: claim.title, category: claim.category, label: claim.label, keywords: claim.keywords, boundary: claim.boundary, matchCount: matches.length, matches };
  });
  const scan = { updated: new Date().toISOString(), cadence: data.weeklyScan.cadence, method: data.weeklyScan.method, totalClaims: claims.length, claims };
  write('downloads/dark-speculation-scan.json', JSON.stringify(scan, null, 2));
  write('downloads/dark-speculation-scan.md', `# Dark Speculation Weekly Scan\n\nUpdated: ${scan.updated}\n\nBoundary: ${data.boundary}\n\n${claims.map(c => `## ${c.title}\n\n- Category: ${c.category}\n- Label: ${c.label}\n- Matches: ${c.matchCount}\n- Boundary: ${c.boundary}`).join('\n\n')}\n`);
  return scan;
}
function buildLab(scan){
  const body = `<main><section class="hero wrap"><div class="eyebrow">Dark Speculation Lab</div><h1>DARK SPECULATION LAB.<br>CLASSIFIED, NOT CONFIRMED.</h1><p class="lead">${esc(data.boundary)}</p><div class="cta-row"><a class="btn" href="dark-speculation-forum.html">Post A Dark Lead</a><a class="btn alt" href="downloads/dark-speculation-scan.json">Weekly Scan JSON</a><a class="btn alt" href="claim-classifier.html">Claim Classifier</a></div></section><section class="section wrap split"><div class="terminal">DARK SPECULATION ENGINE\n&gt; Claim motifs: ${(data.claims || []).length}\n&gt; Labels: ${(data.claimLabels || []).length}\n&gt; Weekly update: ${esc(data.weeklyScan.cadence)}\n&gt; Scan output: ${esc(data.weeklyScan.output)}\n&gt; Rule: source first / claim second\n&gt; Status: speculation lab, not a verdict</div><aside class="card redline"><h2>Hard Boundary</h2><p>No doxxing. No private victim names. No illegal material. No graphic exploitation. No direct accusation against real people without source-specific evidence. Symbols and screenshots are not proof.</p></aside></section><section class="section wrap"><h2>Deepest Claim Lanes</h2><div class="grid">${(data.claimLabels || []).map(label => `<article class="card"><span class="label">Evidence Label</span><h3>${esc(label)}</h3></article>`).join('')}</div></section>${groupedClaims()}<section class="section wrap"><h2>Reader Drop Box</h2><article class="card redline"><h3>Have a link, photo archive, video, court record, or counter-source?</h3><p>Drop it in the Dark Speculation Forum. Links are welcome. Illegal content, private exploitation material, doxxing, and direct unsourced accusations are not.</p><a class="btn" href="dark-speculation-forum.html">Open Dark Speculation Drop Box</a></article></section></main>`;
  write('dark-speculation-lab.html', layout('Dark Speculation Lab | Matrix Reprogrammed', data.subtitle, body));
}
function buildForum(){
  const body = `<main><section class="hero wrap"><div class="eyebrow">Dark Speculation Drop Box</div><h1>DROP THE LINK.<br>CLASSIFY THE CLAIM.<br>KEEP IT LEGAL.</h1><p class="lead">A reader board for dark speculation links, source trails, photos hosted elsewhere, videos, symbol questions, counter-sources, debunks, and public-record leads. For fun, but not lawless.</p><div class="cta-row"><a class="btn" href="#submit-signal">Post A Lead</a><a class="btn alt" href="dark-speculation-lab.html">Dark Lab</a><a class="btn alt" href="claim-classifier.html">Claim Classifier</a></div></section><section class="section wrap split"><div class="terminal">DARK DROP RULES\n&gt; Links only for photos/files\n&gt; No illegal material\n&gt; No private victim names\n&gt; No doxxing\n&gt; No graphic exploitation detail\n&gt; No direct accusations without sources\n&gt; Mark speculation as speculation\n&gt; Counter-sources welcome</div><aside class="card redline"><h2>Signal Pass</h2><p>Posting uses the existing Signal Pass anti-spam gate. Reading is free. Payment does not buy agreement or approval.</p><div class="cta-row small"><a class="btn" href="https://www.paypal.me/njmgroup/1" target="_blank" rel="noopener">Pay €1 Signal Pass</a><a class="btn alt" href="#submit-signal">Post After Unlock</a></div></aside></section><section id="signal-pass" class="section wrap split"><div class="card redline"><h2>Unlock Posting</h2><p>The drop box is free to read. Signal Pass adds friction against bots and spam.</p><p><a class="btn" href="https://www.paypal.me/njmgroup/1" target="_blank" rel="noopener">Pay €1 via PayPal</a></p><button class="btn alt" type="button" id="unlock-signal-pass">I’ve Paid — Unlock Posting</button><p class="form-status" id="signal-pass-status"></p></div><aside class="card"><h2>Best Dark Leads</h2><p>Best posts include a source link, exact claim, evidence type, counter-source if available, and whether it is public record, symbolism, folklore, or speculation.</p></aside></section><section id="submit-signal" class="section wrap split signal-locked"><div class="card redline"><h2>Post A Dark Speculation Lead</h2><p class="signal-lock-message">Posting is locked until Signal Pass is unlocked on this device.</p><form id="signal-board-form"><label>Category</label><select name="category" required><option value="Dark Speculation Link Drop">Dark Speculation Link Drop</option><option value="Dark Speculation Photo Link">Photo / Archive Link</option><option value="Occult Symbol Claim">Occult Symbol Claim</option><option value="Modern Slavery Source">Modern Slavery Source</option><option value="Blue Beam / UFO Claim">Blue Beam / UFO Claim</option><option value="Debunk / Counter-Source">Debunk / Counter-Source</option></select><label>Name or handle</label><input name="name" maxlength="80" placeholder="Anonymous / handle" /><label>Title</label><input name="title" maxlength="140" required placeholder="Short claim or source title" /><label>Source link / photo link / archive link</label><input name="sourceUrl" type="url" maxlength="500" placeholder="https://..." /><label>Message</label><textarea name="body" maxlength="2400" required placeholder="Drop the claim, link, boundary, and why it matters. Keep it legal: no illegal content, private victim names, doxxing, graphic exploitation, or direct unsourced accusations."></textarea><input name="website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true" /><button class="btn" type="submit">Post To The Dark Drop Box</button><p class="form-status" id="signal-form-status"></p></form></div><aside class="card"><h2>Posting Boundary</h2><p>Post links, not illegal files. Do not upload or request exploitative material. Do not name private victims. Do not accuse real people without a source route.</p></aside></section><section id="board-feed" class="section wrap"><h2>Dark Speculation Feed</h2><p class="lead">Posts appear publicly by default after Signal Pass unlock. Report threats, doxxing, private victim names, explicit exploitation material, spam, or illegal content.</p><div class="grid" id="signal-board-feed"><article class="card"><h3>Loading signals...</h3><p>The board is checking for posts.</p></article></div></section></main>`;
  write('dark-speculation-forum.html', layout('Dark Speculation Forum | Matrix Reprogrammed', 'Reader drop box for dark speculation links, photo links, counter-sources, source trails, and claim classification.', body).replace('</body>', '<script src="forum.js"></script></body>'));
}
function patchFileList(){
  const routes = ['dark-speculation-lab.html','dark-speculation-forum.html'];
  if (exists('sitemap.xml')) {
    let xml = read('sitemap.xml');
    const today = new Date().toISOString().slice(0,10);
    const add = routes.filter(r => !xml.includes(`/${r}</loc>`)).map(r => `  <url><loc>${SITE}/${r}</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.91</priority></url>`).join('\n');
    if (add) write('sitemap.xml', xml.replace('</urlset>', `${add}\n</urlset>`));
  }
  if (exists('llms.txt')) {
    let txt = read('llms.txt');
    const block = '\n\nDark Speculation Lab:\n- /dark-speculation-lab.html: classified-not-confirmed index of dark conspiracy motifs and weekly scan results.\n- /dark-speculation-forum.html: reader drop box for speculation links and counter-sources.\n- /downloads/dark-speculation-scan.json: weekly motif scan output.\n';
    if (!txt.includes('/dark-speculation-lab.html')) write('llms.txt', `${txt.trim()}${block}`);
  }
  if (exists('search-index.json')) {
    const index = JSON.parse(read('search-index.json'));
    if (!index.some(x => x.url === 'dark-speculation-lab.html')) index.push({ key: 'dark-speculation-lab', title: 'Dark Speculation Lab', subtitle: 'Classified, not confirmed', series: 'Speculation Lab', category: 'Dark Claims', url: 'dark-speculation-lab.html', description: 'Dark conspiracy motif index with evidence labels, source boundaries, and weekly scan output.', keywords: ['dark speculation','conspiracy motifs','adrenochrome','blue beam','modern slavery','occult claims'] });
    if (!index.some(x => x.url === 'dark-speculation-forum.html')) index.push({ key: 'dark-speculation-forum', title: 'Dark Speculation Drop Box', subtitle: 'Reader source links and counter-sources', series: 'Speculation Lab', category: 'Forum', url: 'dark-speculation-forum.html', description: 'Reader drop box for dark speculation links, photo links, archive links, and counter-sources.', keywords: ['forum','source drop','dark speculation','reader links'] });
    write('search-index.json', JSON.stringify(index, null, 2));
  }
}
const scan = buildScan();
buildLab(scan);
buildForum();
patchFileList();
console.log(`Built Dark Speculation Lab with ${(data.claims || []).length} claim motifs and weekly scan outputs.`);
