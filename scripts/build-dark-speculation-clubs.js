const fs = require('fs');
const path = require('path');

const root = process.cwd();
const SITE = 'https://matrixreprogrammed.com';
const dataPath = path.join(root, 'data', 'dark-speculation-clubs.json');

if (!fs.existsSync(dataPath)) {
  console.log('No dark speculation club dataset found. Skipping.');
  process.exit(0);
}

const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const investigations = Array.isArray(data.investigations) ? data.investigations : [];
const evidenceLevels = Array.isArray(data.evidenceLevels) ? data.evidenceLevels : [];

function full(file) { return path.join(root, file); }
function exists(file) { return fs.existsSync(full(file)); }
function read(file) { return fs.readFileSync(full(file), 'utf8'); }
function write(file, content) {
  const output = full(file);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, content);
}
function esc(value = '') {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function pageFile(inv) { return `dark-speculation-${inv.slug}.html`; }
function evidenceUrl(inv) { return `dark-speculation-forum.html?investigation=${encodeURIComponent(inv.slug)}#submit-signal`; }
function list(items, empty = 'No reviewed items are published yet.') {
  const safe = Array.isArray(items) ? items : [];
  if (!safe.length) return `<p>${esc(empty)}</p>`;
  return `<ul>${safe.map(item => `<li>${esc(item)}</li>`).join('')}</ul>`;
}
function nav() {
  return `<header class="wrap topbar"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil" /> MATRIX REPROGRAMMED</a><nav class="nav"><a href="index.html">Home</a><a href="tracker-dashboard.html">Trackers</a><a href="dark-speculation-lab.html">Dark Lab</a><a href="epstein-files.html">Epstein</a><a href="power-research-method.html">Power Method</a><a href="source-document-vault.html">Sources</a><a href="newsletter.html">Weekly File</a></nav></header>`;
}
function layout(title, description, body) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${esc(title)}</title><meta name="description" content="${esc(description)}" /><meta property="og:title" content="${esc(title)}" /><meta property="og:description" content="${esc(description)}" /><meta property="og:type" content="website" /><link rel="stylesheet" href="styles.css" /><link rel="stylesheet" href="fixes.css" /></head><body><canvas id="matrix"></canvas><div class="signal-face"></div><div class="veil"></div><div class="page">${nav()}${body}<footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — preserve the claim, test the evidence.</p><p class="warning">Boundary: inclusion does not establish membership, guilt, criminality, ritual activity, or coordination. Association and symbolism are not proof.</p></footer></div><script src="matrix.js"></script></body></html>`;
}

function validate() {
  if (!investigations.length) throw new Error('Dark speculation club dataset contains no investigations.');
  const seen = new Set();
  for (const inv of investigations) {
    for (const field of ['slug', 'title', 'classification', 'status', 'assessment', 'summary']) {
      if (!inv[field]) throw new Error(`Missing ${field} in dark speculation investigation.`);
    }
    if (seen.has(inv.slug)) throw new Error(`Duplicate dark speculation slug: ${inv.slug}`);
    seen.add(inv.slug);
  }
}

function evidenceLevelCards() {
  return evidenceLevels.map(level => `<article class="card"><span class="label">LEVEL ${esc(level.code)}</span><h3>${esc(level.label)}</h3><p>${esc(level.description)}</p></article>`).join('');
}

function investigationCard(inv) {
  const open = Array.isArray(inv.questions) ? inv.questions.length : 0;
  const documented = Array.isArray(inv.documented) ? inv.documented.length : 0;
  const disputed = Array.isArray(inv.complications) ? inv.complications.length : 0;
  return `<article class="card redline" id="club-${esc(inv.slug)}"><span class="label">${esc(inv.classification)}</span><h3>${esc(inv.title)}</h3><p>${esc(inv.summary)}</p><p><strong>Status:</strong> ${esc(inv.status)}</p><p><strong>Current assessment:</strong> ${esc(inv.assessment)}</p><p><strong>Case signals:</strong> ${documented} documented lanes · ${open} open questions · ${disputed} complications or counterpoints</p><p><strong>Last updated:</strong> ${esc(data.updated)}</p><div class="cta-row small"><a class="btn" href="${esc(pageFile(inv))}">Open Investigation</a><a class="btn alt" href="${esc(evidenceUrl(inv))}">Drop Evidence</a></div></article>`;
}

function detailPage(inv) {
  const aliasText = Array.isArray(inv.aliases) && inv.aliases.length ? inv.aliases.join(' · ') : inv.title;
  const body = `<main>
<section class="hero wrap"><div class="eyebrow">Dark Speculation Lab · Investigation File</div><h1>${esc(inv.title).toUpperCase()}</h1><p class="lead">${esc(inv.summary)}</p><div class="cta-row"><a class="btn" href="${esc(evidenceUrl(inv))}">Drop Evidence For This Investigation</a><a class="btn alt" href="dark-speculation-lab.html#club-${esc(inv.slug)}">Back To Dark Lab</a><a class="btn alt" href="claim-classifier.html">Claim Classifier</a><a class="btn alt" href="source-document-vault.html">Source Vault</a></div></section>
<section class="section wrap split"><div class="terminal">INVESTIGATION RECORD\n&gt; File: ${esc(inv.slug)}\n&gt; Classification: ${esc(inv.classification)}\n&gt; Status: ${esc(inv.status)}\n&gt; Assessment: ${esc(inv.assessment)}\n&gt; Updated: ${esc(data.updated)}\n&gt; Rule: a symbol, injury, garment, gesture, number, photograph or attendance record is not proof of the stronger allegation</div><aside class="card redline"><h2>Evidence Boundary</h2><p>${esc(data.boundary)}</p><p><strong>Alternative names:</strong> ${esc(aliasText)}</p></aside></section>
<section class="section wrap"><h2>What The Claim Says</h2><div class="grid">${(inv.claimVersions || []).map((item, index) => `<article class="card"><span class="label">CLAIM VERSION ${index + 1}</span><h3>${esc(item)}</h3><p>This version is preserved for investigation. It is not automatically accepted as fact.</p></article>`).join('')}</div></section>
<section class="section wrap split"><article class="card redline"><h2>What Is Documented</h2>${list(inv.documented)}</article><article class="card"><h2>Evidence Against Or Complicating The Claim</h2>${list(inv.complications)}</article></section>
<section class="section wrap"><h2>Open Questions</h2><div class="grid">${(inv.questions || []).map((item, index) => `<article class="card"><span class="label">OPEN QUESTION ${index + 1}</span><h3>${esc(item)}</h3><p>Submit a dated primary source, archive copy, official record, original media, correction, or credible counter-source.</p></article>`).join('')}</div></section>
<section class="section wrap"><h2>Competing Explanations</h2><div class="grid">${(inv.competing || []).map(item => `<article class="card"><h3>${esc(item)}</h3><p>Test this explanation against the same evidence standard as every competing hypothesis.</p></article>`).join('')}</div></section>
<section class="section wrap"><h2>Evidence Classification</h2><div class="grid">${evidenceLevelCards()}</div></section>
<section class="section wrap split"><article class="card redline"><h2>Case-File Standard</h2><p>Break viral collages and compilations into individual cases. Record the original source, publication date, person or organization, location, alleged meaning, documented circumstances, public response, supporting evidence, contradicting evidence, confidence grade, editorial status, and last review date.</p><p>Do not create a membership list from symbols, clothes, injuries, gestures, attendance, numerology, or association alone.</p></article><article class="card"><h2>Evidence Drop</h2><p>Submit verifiable evidence, original sources, corrections, or alternative explanations. Do not submit threats, private addresses, stolen credentials, illegal material, private victim identities, or unsupported accusations.</p><a class="btn" href="${esc(evidenceUrl(inv))}">Open Evidence Drop For ${esc(inv.title)}</a></article></section>
<section class="section wrap"><h2>Search Terms</h2><p class="source-list">${(inv.keywords || []).map(keyword => `<span class="pill">${esc(keyword)}</span>`).join(' ')}</p></section>
</main>`;
  write(pageFile(inv), layout(`${inv.title} | Dark Speculation Lab`, inv.summary, body));
}

function patchMarked(file, startMarker, endMarker, block, anchor) {
  if (!exists(file)) throw new Error(`Required generated file missing: ${file}`);
  let html = read(file);
  const marked = `${startMarker}${block}${endMarker}`;
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker);
  if (start >= 0 && end > start) {
    html = html.slice(0, start) + marked + html.slice(end + endMarker.length);
  } else {
    const anchorIndex = html.indexOf(anchor);
    if (anchorIndex < 0) throw new Error(`Could not find patch anchor in ${file}`);
    html = html.slice(0, anchorIndex) + marked + html.slice(anchorIndex);
  }
  write(file, html);
}

function patchLab() {
  const cards = investigations.map(investigationCard).join('');
  const block = `<section class="section wrap" id="club-investigations"><div class="eyebrow">Club, Symbol And Ritual Claims</div><h2>INVESTIGATION FILES</h2><p class="lead">These cards preserve the strongest versions of recurring claims, document ordinary and historical explanations, keep open questions visible, and route every investigation to its own evidence drop. They are investigation files, not membership lists or verdicts.</p><div class="grid">${cards}</div></section>`;
  patchMarked('dark-speculation-lab.html', '<!-- dark-club-investigations-start -->', '<!-- dark-club-investigations-end -->', block, '<section class="section wrap"><h2>Reader Drop Box');
}

function patchForum() {
  const file = 'dark-speculation-forum.html';
  if (!exists(file)) throw new Error(`Required generated file missing: ${file}`);
  let html = read(file);
  const optionStart = '<!-- dark-club-options-start -->';
  const optionEnd = '<!-- dark-club-options-end -->';
  const options = investigations.map(inv => `<option data-investigation="${esc(inv.slug)}" value="Club Investigation: ${esc(inv.title)}">${esc(inv.title)}</option>`).join('');
  const markedOptions = `${optionStart}${options}${optionEnd}`;
  const currentStart = html.indexOf(optionStart);
  const currentEnd = html.indexOf(optionEnd);
  if (currentStart >= 0 && currentEnd > currentStart) {
    html = html.slice(0, currentStart) + markedOptions + html.slice(currentEnd + optionEnd.length);
  } else {
    const anchor = '<option value="Debunk / Counter-Source">';
    const anchorIndex = html.indexOf(anchor);
    if (anchorIndex < 0) throw new Error('Could not find forum category option anchor.');
    html = html.slice(0, anchorIndex) + markedOptions + html.slice(anchorIndex);
  }

  const scriptStart = '<!-- dark-club-prefill-start -->';
  const scriptEnd = '<!-- dark-club-prefill-end -->';
  const prefill = `${scriptStart}<script>(function(){var params=new URLSearchParams(window.location.search);var slug=params.get('investigation');if(!slug)return;var form=document.getElementById('signal-board-form');if(!form)return;var select=form.querySelector('select[name="category"]');var option=select&&select.querySelector('option[data-investigation="'+CSS.escape(slug)+'"]');if(option){select.value=option.value;}var hidden=form.querySelector('input[name="investigationSlug"]');if(!hidden){hidden=document.createElement('input');hidden.type='hidden';hidden.name='investigationSlug';form.appendChild(hidden);}hidden.value=slug;var title=form.querySelector('input[name="title"]');if(title&&option&&!title.value){title.placeholder='Evidence or correction for '+option.textContent;}var heading=form.closest('.card');if(heading&&option){var h2=heading.querySelector('h2');if(h2)h2.textContent='Post Evidence: '+option.textContent;}})();</script>${scriptEnd}`;
  const ps = html.indexOf(scriptStart);
  const pe = html.indexOf(scriptEnd);
  if (ps >= 0 && pe > ps) html = html.slice(0, ps) + prefill + html.slice(pe + scriptEnd.length);
  else html = html.replace('</body>', `${prefill}</body>`);
  write(file, html);
}

function writeDownloads() {
  const output = {
    updated: data.updated,
    boundary: data.boundary,
    totalInvestigations: investigations.length,
    evidenceLevels,
    investigations: investigations.map(inv => ({ ...inv, page: pageFile(inv), evidenceDrop: evidenceUrl(inv) }))
  };
  write('downloads/dark-speculation-club-investigations.json', JSON.stringify(output, null, 2));
  const md = `# Dark Speculation Club Investigations\n\nUpdated: ${data.updated}\n\nBoundary: ${data.boundary}\n\n${investigations.map(inv => `## ${inv.title}\n\n- Classification: ${inv.classification}\n- Status: ${inv.status}\n- Assessment: ${inv.assessment}\n- Page: /${pageFile(inv)}\n- Evidence drop: /${evidenceUrl(inv)}\n\n${inv.summary}\n\n### Documented lanes\n${(inv.documented || []).map(item => `- ${item}`).join('\n')}\n\n### Complications\n${(inv.complications || []).map(item => `- ${item}`).join('\n')}\n\n### Open questions\n${(inv.questions || []).map(item => `- ${item}`).join('\n')}`).join('\n\n')}\n`;
  write('downloads/dark-speculation-club-investigations.md', md);
}

function patchSitemap() {
  if (!exists('sitemap.xml')) return;
  let xml = read('sitemap.xml');
  const routes = [
    ...investigations.map(pageFile),
    'downloads/dark-speculation-club-investigations.json',
    'downloads/dark-speculation-club-investigations.md'
  ];
  const today = data.updated;
  const additions = routes
    .filter(route => !xml.includes(`/${route}</loc>`))
    .map(route => `  <url><loc>${SITE}/${route}</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.88</priority></url>`)
    .join('\n');
  if (additions) xml = xml.replace('</urlset>', `${additions}\n</urlset>`);
  write('sitemap.xml', xml);
}

function patchLlms() {
  if (!exists('llms.txt')) return;
  let txt = read('llms.txt');
  const start = '<!-- dark-club-investigations-start -->';
  const end = '<!-- dark-club-investigations-end -->';
  const lines = investigations.map(inv => `- /${pageFile(inv)}: ${inv.title}. ${inv.classification}. Current assessment: ${inv.assessment}.`).join('\n');
  const block = `${start}\n\nDark Speculation Club Investigations:\n${lines}\n- /downloads/dark-speculation-club-investigations.json: machine-readable investigation index, evidence levels, open questions and evidence-drop routes.\n${end}`;
  const s = txt.indexOf(start);
  const e = txt.indexOf(end);
  if (s >= 0 && e > s) txt = txt.slice(0, s) + block + txt.slice(e + end.length);
  else txt = `${txt.trim()}\n\n${block}\n`;
  write('llms.txt', txt);
}

function patchSearchIndex() {
  if (!exists('search-index.json')) return;
  const raw = JSON.parse(read('search-index.json'));
  const index = Array.isArray(raw) ? raw : (Array.isArray(raw.items) ? raw.items : null);
  if (!index) return;
  for (const inv of investigations) {
    const item = {
      key: `dark-speculation-${inv.slug}`,
      title: inv.title,
      subtitle: inv.classification,
      series: 'Dark Speculation Lab',
      category: 'Club Investigation',
      url: pageFile(inv),
      description: inv.summary,
      keywords: Array.from(new Set([inv.title, ...(inv.aliases || []), ...(inv.keywords || []), inv.classification]))
    };
    const found = index.findIndex(entry => entry.url === item.url || entry.key === item.key);
    if (found >= 0) index[found] = { ...index[found], ...item };
    else index.push(item);
  }
  if (Array.isArray(raw)) write('search-index.json', JSON.stringify(index, null, 2));
  else { raw.items = index; write('search-index.json', JSON.stringify(raw, null, 2)); }
}

function verify() {
  const lab = read('dark-speculation-lab.html');
  const forum = read('dark-speculation-forum.html');
  for (const inv of investigations) {
    if (!exists(pageFile(inv))) throw new Error(`Missing generated investigation page: ${pageFile(inv)}`);
    if (!lab.includes(`id="club-${inv.slug}"`)) throw new Error(`Dark Lab card missing: ${inv.slug}`);
    if (!forum.includes(`data-investigation="${inv.slug}"`)) throw new Error(`Evidence-drop option missing: ${inv.slug}`);
  }
  if (!exists('downloads/dark-speculation-club-investigations.json')) throw new Error('Missing club investigation JSON download.');
}

validate();
for (const inv of investigations) detailPage(inv);
patchLab();
patchForum();
writeDownloads();
patchSitemap();
patchLlms();
patchSearchIndex();
verify();
console.log(`Built ${investigations.length} Dark Speculation Lab club investigations with detail pages, evidence-drop routing, search records, sitemap entries and machine-readable downloads.`);
