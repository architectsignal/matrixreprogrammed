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

const safetySection = '<!-- start-here-safety:start --><section class="section wrap" id="start-here-safety"><div class="eyebrow">Protect The Researcher</div><h2>SECURITY, PRIVACY & DARK WEB SAFETY.</h2><p class="lead">Before opening sensitive records, building an OSINT workflow or using Tor, establish a threat model, separate identities and understand what each tool can and cannot protect.</p><div class="grid"><article id="start-here-security-tools" class="card redline"><h3>Security, Privacy & OSINT Safety</h3><p>Build a complete free protection system covering Tails, Tor, secure messaging, local PGP, email aliases, passwords, encryption, metadata removal, breach checks and defensive monitoring.</p><a class="btn alt" href="security-privacy.html">Open Security Tools</a></article><article id="start-here-dark-web-safety" class="card redline"><h3>Dark Web Safety Guide</h3><p>Follow the lawful step-by-step Tor workflow, verify official onion services, isolate downloads and understand the non-clickable danger watch before entering onion services.</p><a class="btn alt" href="dark-web-safety.html">Open Dark Web Safety</a></article></div><p><strong>Boundary:</strong> privacy tools reduce specific risks; they do not create invisibility, authorise illegal access or make unknown onion links safe.</p></section><!-- start-here-safety:end -->';
if (!startHere.includes('</main>')) throw new Error('Start Here main element not found.');
startHere = startHere.replace('</main>', `${safetySection}</main>`);
fs.writeFileSync(startHerePath, startHere);

const count = (text, value) => (text.match(new RegExp(`href="${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'g')) || []).length;
const renderedPrimary = (html.match(/<div class="nav-primary">([\s\S]*?)<\/div>/i) || [])[1] || '';
const anchorCount = (renderedPrimary.match(/<a\b[^>]*href=/gi) || []).length;
if (anchorCount !== 8) throw new Error(`Homepage primary navigation must contain exactly eight links; found ${anchorCount}.`);
if (count(html, 'security-privacy.html') < 1 || count(html, 'dark-web-safety.html') < 1) throw new Error('Homepage safety links are missing.');
if (count(startHere, 'security-privacy.html') < 2 || count(startHere, 'dark-web-safety.html') < 2) throw new Error('Start Here navigation or safety cards are missing.');
if ((startHere.match(/<!-- start-here-safety:start -->/g) || []).length !== 1) throw new Error('Start Here safety section is missing or duplicated.');
console.log('Primary navigation reconciled to eight canonical public tabs; Start Here safety cards recreated after legacy generators.');
