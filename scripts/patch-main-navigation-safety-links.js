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
const primaryContainer = html.match(/<div\b[^>]*class=["'][^"']*\bnav-primary\b[^"']*["'][^>]*>[\s\S]*?<\/div>/i);
if (primaryContainer) {
  html = html.replace(primaryContainer[0], `<div class="nav-primary">${primaryHtml}</div>`);
} else {
  const navContainer = html.match(/(<nav\b[^>]*class=["'][^"']*\bnav\b[^"']*["'][^>]*>)[\s\S]*?(<\/nav>)/i);
  if (!navContainer) throw new Error('Homepage primary navigation container not found.');
  html = html.replace(navContainer[0], `${navContainer[1]}${primaryHtml}${navContainer[2]}`);
}
fs.writeFileSync(indexPath, html);

let startHere = fs.readFileSync(startHerePath, 'utf8');
startHere = startHere.replace(/<!-- start-here-safety:start -->[\s\S]*?<!-- start-here-safety:end -->/gi, '');
startHere = startHere.replace(/<section class="section commercial-internal">/g, '<section class="section">');
const startNav = startHere.match(/<nav\b[^>]*class=["'][^"']*\bnav\b[^"']*["'][^>]*>[\s\S]*?<\/nav>/i);
if (!startNav) throw new Error('Start Here navigation not found.');
const startNavHtml = `<nav class="nav nav-shell" aria-label="Start Here navigation"><div class="nav-primary">${primaryHtml}</div><details class="nav-more"><summary>More</summary><div class="nav-drawer"><div class="nav-group"><strong>Reader Resources</strong><a href="amazon-store-books.html">Amazon Store</a><a href="videos.html">Rumble Channels</a><a href="optin-center.html">Opt-in Center</a><a href="offer-center.html">Offer Center</a><a href="book-universe.html">Book Universe</a></div><div class="nav-group"><strong>Evidence & Community</strong><a href="forum.html">Signal Board</a><a href="research-tools.html">Research Tools</a><a href="evidence-archive.html">Evidence Archive</a><a href="data-lab.html">Public Data Lab</a><a href="geographic-power-atlas.html">Geographic Atlas</a></div></div></details></nav>`;
startHere = startHere.replace(startNav[0], startNavHtml);

const safetySection = '<!-- start-here-safety:start --><section class="section wrap" id="start-here-safety"><div class="eyebrow">Protect The Researcher</div><h2>SECURITY, PRIVACY & DARK WEB SAFETY.</h2><p class="lead">Before opening sensitive records, building an OSINT workflow or using Tor, establish a threat model, separate identities and understand what each tool can and cannot protect.</p><div class="grid"><article id="start-here-security-tools" class="card redline"><h3>Security, Privacy & OSINT Safety</h3><p>Build a complete free protection system covering Tails, Tor, secure messaging, local PGP, email aliases, passwords, encryption, metadata removal, breach checks and defensive monitoring.</p><a class="btn alt" href="security-privacy.html">Open Security Tools</a></article><article id="start-here-dark-web-safety" class="card redline"><h3>Dark Web Safety Guide</h3><p>Follow the lawful step-by-step Tor workflow, verify official onion services, isolate downloads and understand the non-clickable danger watch before entering onion services.</p><a class="btn alt" href="dark-web-safety.html">Open Dark Web Safety</a></article></div><div class="cta-row"><a class="btn alt" href="book-universe.html">Book Universe</a><a class="btn alt" href="forum.html">Signal Board</a><a class="btn alt" href="research-tools.html">Research Tools</a></div><p><strong>Boundary:</strong> privacy tools reduce specific risks; they do not create invisibility, authorise illegal access or make unknown onion links safe.</p></section><!-- start-here-safety:end -->';
if (!startHere.includes('</main>')) throw new Error('Start Here main element not found.');
startHere = startHere.replace('</main>', `${safetySection}</main>`);
fs.writeFileSync(startHerePath, startHere);

const count = (text, value) => (text.match(new RegExp(`href="${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'g')) || []).length;
const renderedPrimary = (
  (html.match(/<div\b[^>]*class=["'][^"']*\bnav-primary\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i) || [])[1]
  || (html.match(/<nav\b[^>]*class=["'][^"']*\bnav\b[^"']*["'][^>]*>([\s\S]*?)<\/nav>/i) || [])[1]
  || ''
);
const anchorCount = (renderedPrimary.match(/<a\b[^>]*href=/gi) || []).length;
if (anchorCount !== 8) throw new Error(`Homepage primary navigation must contain exactly eight links; found ${anchorCount}.`);
if (count(html, 'security-privacy.html') < 1 || count(html, 'dark-web-safety.html') < 1) throw new Error('Homepage safety links are missing.');
if (count(startHere, 'security-privacy.html') < 2 || count(startHere, 'dark-web-safety.html') < 2) throw new Error('Start Here navigation or safety cards are missing.');
if (count(startHere, 'book-universe.html') < 1 || count(startHere, 'forum.html') < 1) throw new Error('Start Here compatibility routes are missing.');
if (!startHere.includes('nav-shell') || !startHere.includes('nav-more') || !startHere.includes('<summary>More</summary>')) throw new Error('Start Here polished navigation shell is missing.');
if ((startHere.match(/<!-- start-here-safety:start -->/g) || []).length !== 1) throw new Error('Start Here safety section is missing or duplicated.');
console.log('Primary navigation reconciled across legacy and current homepage shells; polished Start Here shell and safety routes recreated.');
