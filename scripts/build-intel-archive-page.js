const fs = require('fs');
const path = require('path');

const root = process.cwd();
const dropsDir = path.join(root, 'data', 'drops');
const outPath = path.join(root, 'intel-archive.html');

function esc(s = '') {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function readDrops() {
  if (!fs.existsSync(dropsDir)) return [];
  return fs.readdirSync(dropsDir)
    .filter(file => file.endsWith('.json'))
    .map(file => {
      try { return JSON.parse(fs.readFileSync(path.join(dropsDir, file), 'utf8')); }
      catch { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

function categoryFor(drop) {
  const hay = `${drop.label || ''} ${drop.title || ''} ${drop.summary || ''}`.toLowerCase();
  if (/epstein|maxwell/.test(hay)) return { label: 'Epstein / Public Record', key: 'epstein' };
  if (/traffick|exploitation|missing children|children/.test(hay)) return { label: 'Trafficking Watch', key: 'trafficking' };
  if (/israel|gaza|iran|red sea|houthi|hamas|hezbollah|war|nato|ukraine|russia|china/.test(hay)) return { label: 'War File', key: 'war' };
  if (/wikileaks|archive|leak/.test(hay)) return { label: 'WikiLeaks / Archive Drop', key: 'archive' };
  if (/declass|cia|fbi|nsa|vault|intelligence/.test(hay)) return { label: 'Declassified / Intel', key: 'declassified' };
  if (/cartel|mafia|launder|sanction|corruption|crime/.test(hay)) return { label: 'Crime-State', key: 'crime' };
  return { label: drop.label || 'Signal', key: 'intelligence' };
}

const filters = [
  ['all', 'All Signals'],
  ['war', 'War File'],
  ['epstein', 'Epstein / Public Record'],
  ['trafficking', 'Trafficking Watch'],
  ['declassified', 'Declassified'],
  ['archive', 'WikiLeaks / Archive'],
  ['crime', 'Crime-State'],
  ['intelligence', 'Intelligence Watch']
];

const filterButtons = `<div class="filter-panel">${filters.map(([key, label]) => `<button class="btn" type="button" data-filter="${key}">${label}</button>`).join('')}</div><p class="filter-count" data-filter-count></p>`;

const drops = readDrops();
const cards = drops.length ? drops.map(drop => {
  const category = categoryFor(drop);
  const source = drop.sourceLink ? `<p class="source-list"><a href="${esc(drop.sourceLink)}" target="_blank" rel="noopener">Open source record</a></p>` : '';
  const reader = drop.book && drop.book.localUrl ? `<a class="btn alt" href="${esc(drop.book.localUrl.replace('https://matrixreprogrammed.com/', ''))}">${esc(drop.book.title || 'Reader Path')}</a>` : '<a class="btn alt" href="books.html">Book Archive</a>';
  return `<article class="news-item" data-category="${esc(category.key)}"><span class="label">${esc(category.label)}</span><h3>${esc(drop.title || 'Signal Bulletin')}</h3><p class="dateline">${esc(drop.date || '')} · ${esc(drop.source || '')}</p><p>${esc(drop.angle || drop.summary || 'Source-led Matrix Reprogrammed bulletin.')}</p>${source}<div class="cta-row small">${reader}<a class="btn" href="black-file.html">Black File</a></div></article>`;
}).join('\n') : '<article class="news-item" data-category="archive"><span class="label">Archive</span><h3>No archived bulletins yet</h3><p>The archive fills automatically after the daily source engine begins saving drops.</p><p class="source-list"><a href="news.html">Return to Intel Desk</a></p></article>';

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Intel Bulletin Archive | Matrix Reprogrammed</title>
  <meta name="description" content="Matrix Reprogrammed Intel Bulletin Archive: past source-led bulletins on wars, declassified files, Epstein public records, trafficking watch, WikiLeaks, sanctions, intelligence, and crime-state overlap." />
  <meta property="og:title" content="Intel Bulletin Archive | Matrix Reprogrammed" />
  <meta property="og:description" content="Past Matrix Reprogrammed source-led bulletins and reader paths." />
  <meta property="og:type" content="website" />
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
<canvas id="matrix"></canvas><div class="signal-face"></div><div class="veil"></div><div class="page">
<header class="wrap topbar"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil" /> MATRIX REPROGRAMMED</a><nav class="nav"><a href="index.html">Home</a><a href="books.html">Books</a><a href="news.html">Intel Desk</a><a href="intel-archive.html">Archive</a><a href="videos.html">Videos</a><a href="black-file.html">Black File</a><a href="transmissions.html">Rumble</a></nav></header>
<main>
<section class="hero wrap"><div class="eyebrow">Intel Bulletin Archive</div><h1>THE OLD SIGNALS<br>DO NOT VANISH.</h1><p class="lead">Live bulletins stay on the Intel Desk for seven days. Older source-led drops are stored here so the site remains fresh while the archive keeps the pattern trail.</p><div class="cta-row"><a class="btn" href="news.html">Latest 7 Days</a><a class="btn alt" href="books.html">Book Archive</a><a class="btn alt" href="black-file.html">Black File</a></div></section>
<section class="section wrap split"><div class="terminal">ARCHIVE RULE
&gt; Live desk: latest 7 days
&gt; Archive page: older saved drops
&gt; Source first
&gt; Claim second
&gt; Pattern last</div><aside class="card redline"><h2>Evidence Boundary</h2><p>Archived bulletins remain source-led. A record, filing, sanction, archive item, or headline is treated as a signal, not a complete conclusion.</p></aside></section>
<section class="section wrap"><h2>Archived Bulletins</h2><p class="lead">Filter the archive by the kind of signal you want to follow.</p>${filterButtons}${cards}</section>
</main><footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — decode the illusion, follow the signal.</p><p class="warning">Public-record investigation, symbolic analysis, esoteric commentary, fiction, speculation, and author interpretation are separated where needed.</p></footer></div><script src="matrix.js"></script><script src="archive-filter.js"></script></body></html>`;

fs.writeFileSync(outPath, html);
console.log(`Built ${outPath} with ${drops.length} archived bulletin(s).`);
