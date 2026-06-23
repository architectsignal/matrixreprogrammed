const fs = require('fs');
const path = require('path');

const root = process.cwd();
const dataPath = path.join(root, 'data', 'books.json');
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const books = [...data.books].sort((a, b) => (b.priority || 0) - (a.priority || 0));

function esc(s = '') {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function nav() {
  return `<header class="wrap topbar"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil" /> MATRIX REPROGRAMMED</a><nav class="nav"><a href="index.html">Home</a><a href="start-here.html">Start Here</a><a href="books.html">Books</a><a href="search.html">Search</a><a href="news.html">Intel Desk</a><a href="black-file.html">Black File</a><a href="transmissions.html">Rumble</a></nav></header>`;
}

function layout({ title, description, body, extraHead = '', extraScripts = '' }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:type" content="website" />
  <link rel="stylesheet" href="styles.css" />
  ${extraHead}
</head>
<body>
<canvas id="matrix"></canvas><div class="signal-face"></div><div class="veil"></div><div class="page">
${nav()}
${body}
<footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — decode the illusion, follow the signal.</p><p class="warning">Public-record investigation, symbolic analysis, esoteric commentary, fiction, speculation, and author interpretation are separated where needed.</p></footer>
</div><script src="matrix.js"></script>${extraScripts}</body></html>`;
}

function urlFor(book) {
  return book.generatedUrl || book.localUrl || 'books.html';
}

function amazonButtons(book) {
  const parts = [];
  if (book.amazonUs) parts.push(`<a class="btn" href="${esc(book.amazonUs)}" target="_blank" rel="noopener">Amazon US</a>`);
  if (book.amazonUk) parts.push(`<a class="btn alt" href="${esc(book.amazonUk)}" target="_blank" rel="noopener">Amazon UK</a>`);
  if (!parts.length && book.localUrl) parts.push(`<a class="btn" href="${esc(book.localUrl)}">Open Main Page</a>`);
  parts.push(`<a class="btn alt" href="black-file.html">Black File</a>`);
  return `<div class="cta-row">${parts.join('')}</div>`;
}

function relatedCards(book) {
  const related = (book.related || []).map(key => books.find(b => b.key === key)).filter(Boolean).slice(0, 4);
  if (!related.length) return '';
  return `<section class="section wrap"><h2>Related Doors</h2><div class="grid">${related.map(b => `<article class="card"><span class="label">${esc(b.category)}</span><h3>${esc(b.title)}</h3><p>${esc(b.description)}</p><a class="btn" href="${esc(urlFor(b))}">Open Door</a></article>`).join('')}</div></section>`;
}

function bookCard(book, pill = book.category) {
  const buy = book.amazonUs ? `<a class="btn alt" href="${esc(book.amazonUs)}" target="_blank" rel="noopener">Amazon</a>` : '';
  return `<article class="card book-card" data-category="${esc(book.category)}"><div><div class="pill">${esc(pill)}</div><h3>${esc(book.title)}</h3><p>${esc(book.subtitle || book.description)}</p><p>${(book.keywords || []).slice(0, 7).map(k => `<span class="pill">${esc(k)}</span>`).join('')}</p></div><div class="cta-row small"><a class="btn" href="${esc(urlFor(book))}">Open Door</a>${buy}</div></article>`;
}

for (const book of books) {
  const schema = `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'Book', name: book.title, author: { '@type': 'Person', name: 'Nicholas Matthews' }, publisher: { '@type': 'Organization', name: 'Matrix Reprogrammed' }, description: book.description, url: `https://matrixreprogrammed.com/${urlFor(book)}` })}</script>`;
  const body = `<main><section class="hero wrap"><div class="eyebrow">${esc(book.series)}</div><h1>${esc(book.title)}</h1><p class="lead">${esc(book.subtitle || book.description)}</p>${amazonButtons(book)}</section><section class="section wrap split"><div class="terminal">READER PATH\n&gt; ${esc(book.readerPath || 'Open this door if it matches the signal you are following.')}\n&gt; Category: ${esc(book.category)}\n&gt; Series: ${esc(book.series)}\n&gt; Archive route: ${esc(book.key)}</div><aside class="card redline"><h2>Why This Book</h2><p>${esc(book.description)}</p><p>${(book.keywords || []).slice(0, 10).map(k => `<span class="pill">${esc(k)}</span>`).join('')}</p></aside></section>${relatedCards(book)}</main>`;
  fs.writeFileSync(path.join(root, book.generatedUrl), layout({ title: `${book.title} | Matrix Reprogrammed`, description: book.description, body, extraHead: schema }));
}

const grouped = books.reduce((acc, book) => {
  const group = book.series || book.category || 'Archive';
  acc[group] = acc[group] || [];
  acc[group].push(book);
  return acc;
}, {});

const archiveSchema = `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Matrix Reprogrammed Book Archive', url: 'https://matrixreprogrammed.com/books.html', description: 'The Matrix Reprogrammed central archive of books, dossiers, hidden-system analysis, symbolic architecture, war files, survival psychology, intelligence, crime, and public-record power.', hasPart: books.map(book => ({ '@type': 'Book', name: book.title, url: `https://matrixreprogrammed.com/${urlFor(book)}` })) })}</script>`;

const confirmedArchive = `<main><section class="hero wrap"><div class="eyebrow">Database-driven archive</div><h1>THE BOOK ARCHIVE</h1><p class="lead">Every major Matrix Reprogrammed doorway in one place: D.O.G, the Black File, Intelligence Dossiers, Crime Dossiers, Masonic/esoteric work, war files, survival psychology, and dark psychology.</p><div class="cta-row"><a class="btn" href="start-here.html">Start Here</a><a class="btn alt" href="search.html">Search Archive</a><a class="btn alt" href="black-file.html">Black File</a><a class="btn alt" href="news.html">Intel Desk</a></div></section><section class="section wrap split"><div class="terminal">ARCHIVE STATUS\n&gt; Source: data/books.json\n&gt; Generated pages: ${books.length}\n&gt; Search index: active\n&gt; Reader paths: active\n&gt; Black File funnel: active</div><aside class="card redline"><h2>How To Use This Archive</h2><p>Pick a doorway, follow the reader path, then move sideways through related books. The archive is designed as a system, not a shelf.</p></aside></section>${Object.entries(grouped).map(([group, list]) => `<section class="section wrap"><h2>${esc(group)}</h2><div class="grid">${list.map(b => bookCard(b)).join('')}</div></section>`).join('')}${Array.isArray(data.unconfirmedAsinDoors) && data.unconfirmedAsinDoors.length ? `<section class="section wrap"><h2>Unconfirmed ASIN Doors</h2><p class="lead">These are Amazon doors provided earlier but still need exact title mapping before they become final book cards.</p><div class="grid">${data.unconfirmedAsinDoors.map(asin => `<article class="card"><div class="pill">ASIN ${esc(asin)}</div><h3>Archive Door To Confirm</h3><p>This Amazon ASIN is stored for mapping to the correct final title.</p><div class="cta-row small"><a class="btn" href="https://www.amazon.com/dp/${esc(asin)}" target="_blank" rel="noopener">Amazon US</a><a class="btn alt" href="https://www.amazon.co.uk/dp/${esc(asin)}" target="_blank" rel="noopener">Amazon UK</a></div></article>`).join('')}</div></section>` : ''}</main>`;
fs.writeFileSync(path.join(root, 'books.html'), layout({ title: 'Matrix Reprogrammed Book Archive', description: 'The Matrix Reprogrammed database-driven book archive: D.O.G The Architect, Black File, Intelligence Dossiers, Crime Dossiers, Masonic/esoteric books, war files, survival psychology, dark psychology, and hidden-system analysis.', body: confirmedArchive, extraHead: archiveSchema }));

const searchIndex = books.map(book => ({ key: book.key, title: book.title, subtitle: book.subtitle, series: book.series, category: book.category, url: urlFor(book), description: book.description, keywords: book.keywords || [] }));
fs.writeFileSync(path.join(root, 'search-index.json'), JSON.stringify(searchIndex, null, 2));

const startCards = [
  ['Secret societies / symbols', 'D.O.G The Architect, Masonic Symbols, Degree 1, Degree 3', ['dog-the-architect','masonic-symbols','degree-one','degree-three']],
  ['Intelligence agencies / declassified files', 'The Intelligence Dossiers and the Intel Desk', ['intelligence-dossiers','black-file','wwiii']],
  ['Cartels / mafia / laundering / corruption', 'The Crime Dossiers and public-record overlap', ['crime-dossiers','intelligence-dossiers','wwiii']],
  ['War / collapse / system shock', 'WWIII and survival psychology', ['wwiii','keep-calm','intelligence-dossiers']],
  ['Manipulation / psychology / influence', 'Dark psychology and mental sovereignty', ['manipulation-immunity','mind-control-seven-days','analyze-anyone']],
  ['Everything at once', 'The Black File gateway', ['black-file','dog-the-architect','intelligence-dossiers','crime-dossiers']]
];
const startBody = `<main><section class="hero wrap"><div class="eyebrow">Start Here</div><h1>CHOOSE YOUR DOOR.</h1><p class="lead">The archive is large by design. Pick the signal you are trying to understand and enter through the right reader path.</p><div class="cta-row"><a class="btn" href="black-file.html">Open The Black File</a><a class="btn alt" href="search.html">Search Archive</a></div></section><section class="section wrap grid">${startCards.map(([title, desc, keys]) => `<article class="card"><h2>${esc(title)}</h2><p>${esc(desc)}</p>${keys.map(key => books.find(b => b.key === key)).filter(Boolean).map(b => `<p><a class="btn" href="${esc(urlFor(b))}">${esc(b.title)}</a></p>`).join('')}</article>`).join('')}</section></main>`;
fs.writeFileSync(path.join(root, 'start-here.html'), layout({ title: 'Start Here | Matrix Reprogrammed', description: 'Choose the right Matrix Reprogrammed reader path: symbols, intelligence, crime, war, psychology, or the full Black File.', body: startBody }));

const searchBody = `<main><section class="hero wrap"><div class="eyebrow">Archive Search</div><h1>SEARCH THE SIGNAL.</h1><p class="lead">Search the Matrix Reprogrammed books by title, topic, series, category, or keyword.</p><div class="wrap"><input id="archive-search" type="search" placeholder="Search: CIA, masonic, war, cartels, AI, symbols, manipulation..." /></div></section><section class="section wrap"><p class="filter-count" id="search-count"></p><div class="grid" id="search-results"></div></section></main>`;
fs.writeFileSync(path.join(root, 'search.html'), layout({ title: 'Search the Archive | Matrix Reprogrammed', description: 'Search Matrix Reprogrammed books, reader paths, keywords, and archive topics.', body: searchBody, extraScripts: '<script src="search.js"></script>' }));

const searchJs = `(function(){\n  const input = document.getElementById('archive-search');\n  const results = document.getElementById('search-results');\n  const count = document.getElementById('search-count');\n  if (!input || !results) return;\n  function esc(s){return String(s||'').replace(/[&<>\"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c];});}\n  function render(items){\n    count.textContent = items.length + ' archive door' + (items.length === 1 ? '' : 's') + ' shown';\n    results.innerHTML = items.map(b => '<article class="card"><span class="label">'+esc(b.category)+'</span><h3>'+esc(b.title)+'</h3><p>'+esc(b.description)+'</p><p>'+((b.keywords||[]).slice(0,8).map(k => '<span class="pill">'+esc(k)+'</span>').join(''))+'</p><a class="btn" href="'+esc(b.url)+'">Open Door</a></article>').join('');\n  }\n  fetch('search-index.json').then(r => r.json()).then(data => {\n    function run(){\n      const q = input.value.trim().toLowerCase();\n      const items = !q ? data : data.filter(b => [b.title,b.subtitle,b.series,b.category,b.description,(b.keywords||[]).join(' ')].join(' ').toLowerCase().includes(q));\n      render(items);\n    }\n    input.addEventListener('input', run);\n    render(data);\n  });\n})();\n`;
fs.writeFileSync(path.join(root, 'search.js'), searchJs);

console.log(`Built ${books.length} generated book pages, books.html, start-here.html, search.html, and search-index.json.`);
