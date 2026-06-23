const fs = require('fs');
const path = require('path');

const root = process.cwd();
const data = JSON.parse(fs.readFileSync(path.join(root, 'data', 'books.json'), 'utf8'));
const books = [...data.books].sort((a, b) => (b.priority || 0) - (a.priority || 0));

function esc(s = '') {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function urlFor(book) {
  return book.generatedUrl || book.localUrl || 'books.html';
}

function card(book, pill = book.category) {
  return `<article class="card book-card"><div><div class="pill">${esc(pill)}</div><h3>${esc(book.title)}</h3><p>${esc(book.subtitle || book.description)}</p></div><div class="cta-row small"><a class="btn" href="${esc(urlFor(book))}">Open Door</a>${book.amazonUs ? `<a class="btn alt" href="${esc(book.amazonUs)}" target="_blank" rel="noopener">Amazon</a>` : ''}</div></article>`;
}

function pick(keys) {
  return keys.map(key => books.find(b => b.key === key)).filter(Boolean);
}

const flagship = books.find(b => b.key === 'dog-the-architect') || books[0];
const blackFile = books.find(b => b.key === 'black-file') || books[1];
const featured = pick(['dog-the-architect', 'intelligence-dossiers', 'crime-dossiers', 'wwiii', 'masonic-symbols', 'manipulation-immunity']).slice(0, 6);
const symbols = pick(['dog-the-architect', 'masonic-symbols', 'degree-one', 'degree-three']);
const power = pick(['intelligence-dossiers', 'crime-dossiers', 'wwiii', 'black-file']);
const mind = pick(['manipulation-immunity', 'mind-control-seven-days', 'analyze-anyone', 'keep-calm']);

const orgSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Matrix Reprogrammed',
  url: 'https://matrixreprogrammed.com/',
  description: 'Dark book archive and source-led Intel Desk for public-record dossiers, esoteric symbolism, survival, war files, dark psychology, and hidden-system analysis.',
  founder: { '@type': 'Person', name: 'Nicholas Matthews' }
};

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Matrix Reprogrammed | Decode the Illusion</title>
  <meta name="description" content="Matrix Reprogrammed is the dark book archive and Intel Desk for D.O.G The Architect, public-record dossiers, war files, dark psychology, Masonic symbolism, intelligence systems, crime networks, and hidden-system analysis by Nicholas Matthews." />
  <meta property="og:title" content="Matrix Reprogrammed | Decode the Illusion" />
  <meta property="og:description" content="Books, source-led Intel Desk updates, public-record dossiers, dark psychology, survival, war files, Masonic symbolism, and hidden-system analysis by Nicholas Matthews." />
  <meta property="og:type" content="website" />
  <link rel="stylesheet" href="styles.css" />
  <link rel="stylesheet" href="welcome-gate.css" />
  <script type="application/ld+json">${JSON.stringify(orgSchema)}</script>
</head>
<body>
<canvas id="matrix"></canvas><div class="signal-face"></div><div class="veil"></div>
<section class="signal-gate" data-signal-gate aria-label="Welcome to Matrix Reprogrammed"><div class="gate-panel"><div class="gate-content"><div class="gate-sigil" aria-hidden="true"></div><div class="gate-kicker">Signal Gate Open</div><h1 class="gate-title">Welcome To <span>Matrix Reprogrammed</span></h1><div class="gate-terminal" data-gate-type aria-live="polite"></div><div class="gate-actions"><a class="btn" href="#main-archive" data-enter-archive>Enter The Archive</a><a class="btn alt" href="black-file.html" data-enter-archive>Request The Black File</a><button class="gate-skip" type="button" data-enter-archive>Skip Intro</button></div></div></div></section><button class="gate-replay" type="button" data-replay-gate aria-label="Replay welcome intro">◎</button>
<div class="page"><header class="wrap topbar"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil" /> MATRIX REPROGRAMMED</a><nav class="nav"><a href="index.html">Home</a><a href="start-here.html">Start Here</a><a href="books.html">Books</a><a href="search.html">Search</a><a href="news.html">Intel Desk</a><a href="videos.html">Videos</a><a href="transmissions.html">Rumble</a><a href="black-file.html">Black File</a></nav></header>
<main id="main-archive">
<section class="hero wrap"><div class="eyebrow">The archive is open</div><h1>REALITY IS EDITED.<br>LEARN TO READ THE CODE.</h1><p class="lead">A living archive of books, dossiers, source-led bulletins, symbols, war files, survival psychology, intelligence systems, crime networks, public records, and hidden architecture.</p><div class="cta-row"><a class="btn" href="start-here.html">Choose Your Door</a><a class="btn alt" href="search.html">Search The Archive</a><a class="btn alt" href="news.html">Open Intel Desk</a><a class="btn alt" href="black-file.html">Request The Black File</a></div></section>
<section class="section wrap split"><div class="terminal">&gt; SIGNAL DETECTED\n&gt; The archive is now database-driven.\n&gt; Books become doors.\n&gt; News becomes structure.\n&gt; Search becomes navigation.\n&gt; The reader chooses the path.\n&gt; The system points deeper.</div><aside class="card redline"><div class="pill">Flagship</div><h2>${esc(flagship.title)}</h2><p>${esc(flagship.description)}</p><div class="cta-row small"><a class="btn" href="${esc(urlFor(flagship))}">Enter Flagship</a><a class="btn alt" href="${esc(urlFor(blackFile))}">Black File</a></div></aside></section>
<section class="section wrap"><h2>Featured Doors</h2><p class="lead">The strongest entry points are pulled from the central book database so the homepage stays aligned with the archive.</p><div class="grid">${featured.map((b, i) => card(b, i === 0 ? 'Flagship Door' : b.category)).join('')}</div></section>
<section class="section wrap"><h2>Reader Pathways</h2><p class="lead">Choose the obsession that already has your attention. The archive will give it structure.</p><div class="grid"><article class="card"><h2>Symbols & Secret Orders</h2><p>D.O.G, Masonic symbols, degrees, ritual architecture, temple language, mystery echoes, and hidden design.</p>${symbols.map(b => `<p><a class="btn" href="${esc(urlFor(b))}">${esc(b.title)}</a></p>`).join('')}</article><article class="card"><h2>Files, War & Power</h2><p>Intelligence dossiers, crime-state overlap, public records, sanctions, war files, archives, courts, and oversight failure.</p>${power.map(b => `<p><a class="btn" href="${esc(urlFor(b))}">${esc(b.title)}</a></p>`).join('')}</article><article class="card"><h2>Mind, Control & Survival</h2><p>Manipulation defense, crisis psychology, emotional control, survival function, and the inner mechanics of attention.</p>${mind.map(b => `<p><a class="btn" href="${esc(urlFor(b))}">${esc(b.title)}</a></p>`).join('')}</article></div></section>
<section class="section wrap split"><div class="card"><h2>Signal Intel Desk</h2><p>Short source-led bulletins on wars, declassified files, court records, Epstein-related public records, WikiLeaks/archive drops, sanctions, surveillance, censorship, and crime-state overlap.</p><div class="cta-row small"><a class="btn" href="news.html">Latest 7 Days</a><a class="btn alt" href="intel-archive.html">Bulletin Archive</a></div></div><div class="card redline"><h2>Join The Signal</h2><p>Request The Black File and enter the archive through thirty-three systems, reader pathways, and one map through the machine.</p><form name="black-file" method="POST" data-netlify="true"><input type="hidden" name="form-name" value="black-file" /><input name="email" type="email" placeholder="your@email.com" /><button class="btn" type="submit">Request The Black File</button></form></div></section>
</main><footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — decode the illusion, follow the signal.</p><p class="warning">Public-record investigation, symbolic analysis, esoteric commentary, fiction, speculation, and author interpretation are separated where needed.</p></footer></div><script src="matrix.js"></script><script src="welcome-gate.js"></script></body></html>`;

fs.writeFileSync(path.join(root, 'index.html'), html);
console.log(`Built database-driven homepage with ${featured.length} featured doors.`);
