const fs = require('fs');
const path = require('path');

const root = process.cwd();
const indexPath = path.join(root, 'index.html');
const startHerePath = path.join(root, 'start-here.html');
if (!fs.existsSync(indexPath)) throw new Error('index.html not found for primary navigation reconciliation.');
if (!fs.existsSync(startHerePath)) throw new Error('start-here.html not found for Start Here reconciliation.');

const primaryLinks = [
  ['start-here.html', 'Start Here'],
  ['books.html', 'Books'],
  ['power-atlas.html', 'Control System'],
  ['evidence-vault.html', 'Declassified Files'],
  ['live-intel.html', 'Live Intel'],
  ['security-privacy.html', 'Security Tools'],
  ['dark-web-safety.html', 'Dark Web Safety'],
  ['search.html', 'Search']
];
const primaryHtml = primaryLinks.map(([href, label]) => `<a href="${href}">${label}</a>`).join('');

let html = fs.readFileSync(indexPath, 'utf8');
const navMatch = html.match(/<div class="nav-primary">[\s\S]*?<\/div>/i);
if (!navMatch) throw new Error('Homepage primary navigation container not found.');
html = html.replace(navMatch[0], `<div class="nav-primary">${primaryHtml}</div>`);
fs.writeFileSync(indexPath, html);

let startHere = fs.readFileSync(startHerePath, 'utf8');
startHere = startHere.replace(/<!-- start-here-safety:start -->[\s\S]*?<!-- start-here-safety:end -->/gi, '');
startHere = startHere.replace(/<section class="section commercial-internal">/g, '<section class="section">');
const startNav = startHere.match(/<nav\b[^>]*class=["'][^"']*\bnav\b[^"']*["'][^>]*>[\s\S]*?<\/nav>/i);
if (!startNav) throw new Error('Start Here navigation not found.');
const startNavHtml = '<nav class="nav" aria-label="Start Here navigation"><a href="start-here.html" aria-current="page">Start Here</a><a href="security-privacy.html">Security Tools</a><a href="dark-web-safety.html">Dark Web Safety</a><a href="search.html">Search</a><a href="index.html">Home</a></nav>';
startHere = startHere.replace(startNav[0], startNavHtml);
fs.writeFileSync(startHerePath, startHere);

const count = (text, value) => (text.match(new RegExp(`href="${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'g')) || []).length;
const renderedPrimary = (html.match(/<div class="nav-primary">([\s\S]*?)<\/div>/i) || [])[1] || '';
const anchorCount = (renderedPrimary.match(/<a\b[^>]*href=/gi) || []).length;
if (anchorCount !== 8) throw new Error(`Homepage primary navigation must contain exactly eight links; found ${anchorCount}.`);
if (count(html, 'security-privacy.html') < 1 || count(html, 'dark-web-safety.html') < 1) throw new Error('Homepage safety links are missing.');
if (count(startHere, 'security-privacy.html') < 2 || count(startHere, 'dark-web-safety.html') < 2) throw new Error('Start Here navigation or safety cards are missing.');
if (/<!-- start-here-safety:start -->/i.test(startHere)) throw new Error('Obsolete duplicate Start Here safety block remains.');
console.log('Primary navigation reconciled to eight canonical public tabs; Start Here safety routes remain visible.');
