const fs = require('fs');
const path = require('path');

const root = process.cwd();
const indexPath = path.join(root, 'index.html');
const startHerePath = path.join(root, 'start-here.html');
if (!fs.existsSync(indexPath)) throw new Error('index.html not found for primary safety navigation patch.');
if (!fs.existsSync(startHerePath)) throw new Error('start-here.html not found for safety route patch.');

let html = fs.readFileSync(indexPath, 'utf8');
const navMatch = html.match(/<div class="nav-primary">([\s\S]*?)<\/div>/i);
if (!navMatch) throw new Error('Primary navigation container not found.');

let links = navMatch[1];
links = links.replace(/<a href="security-privacy\.html">Security Tools<\/a>/gi, '');
links = links.replace(/<a href="dark-web-safety\.html">Dark Web Safety<\/a>/gi, '');
const promoted = '<a href="security-privacy.html">Security Tools</a><a href="dark-web-safety.html">Dark Web Safety</a>';
if (/<a href="search\.html">Search<\/a>/i.test(links)) {
  links = links.replace(/<a href="search\.html">Search<\/a>/i, `${promoted}<a href="search.html">Search</a>`);
} else {
  links += promoted;
}
html = html.replace(navMatch[0], `<div class="nav-primary">${links}</div>`);
fs.writeFileSync(indexPath, html);

let startHere = fs.readFileSync(startHerePath, 'utf8');
const startNav = startHere.match(/<nav class="nav">([\s\S]*?)<\/nav>/i);
if (!startNav) throw new Error('Start Here navigation not found.');
let startLinks = startNav[1]
  .replace(/<a href="security-privacy\.html">Security Tools<\/a>/gi, '')
  .replace(/<a href="dark-web-safety\.html">Dark Web Safety<\/a>/gi, '');
if (/<a href="search\.html">Search<\/a>/i.test(startLinks)) {
  startLinks = startLinks.replace(/<a href="search\.html">Search<\/a>/i, `${promoted}<a href="search.html">Search</a>`);
} else {
  startLinks += promoted;
}
startHere = startHere.replace(startNav[0], `<nav class="nav">${startLinks}</nav>`);

const cardsStart = '<!-- start-here-safety:start -->';
const cardsEnd = '<!-- start-here-safety:end -->';
const safetyCards = `${cardsStart}<section class="section" id="start-here-safety"><div class="eyebrow">Protect The Researcher</div><h2>SECURITY, PRIVACY & DARK WEB SAFETY.</h2><p class="lead">Before opening sensitive records, building an OSINT workflow or using Tor, establish a threat model, separate identities and understand what each tool can and cannot protect.</p><div class="intel-grid"><article class="intel-card"><h3>Security, Privacy & OSINT Safety</h3><p>Build a complete free protection system covering Tails, Tor, secure messaging, local PGP, email aliases, passwords, encryption, metadata removal, breach checks and defensive monitoring.</p><a class="btn alt" href="security-privacy.html">Open Security Tools</a></article><article class="intel-card"><h3>Dark Web Safety Guide</h3><p>Follow the lawful step-by-step Tor workflow, verify official onion services, isolate downloads and understand the non-clickable danger watch before entering onion services.</p><a class="btn alt" href="dark-web-safety.html">Open Dark Web Safety</a></article></div><p class="mini"><strong>Boundary:</strong> privacy tools reduce specific risks; they do not create invisibility, authorise illegal access or make unknown onion links safe.</p></section>${cardsEnd}`;
const cardsPattern = new RegExp(`${cardsStart}[\\s\\S]*?${cardsEnd}`, 'i');
if (cardsPattern.test(startHere)) startHere = startHere.replace(cardsPattern, safetyCards);
else startHere = startHere.replace('</main>', `${safetyCards}</main>`);
fs.writeFileSync(startHerePath, startHere);

const count = (text, value) => (text.match(new RegExp(`href="${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'g')) || []).length;
if (!/<div class="nav-primary">[\s\S]*href="security-privacy\.html"[\s\S]*href="dark-web-safety\.html"[\s\S]*<\/div>/i.test(html)) {
  throw new Error('Safety links were not promoted into primary navigation.');
}
if (count(startHere, 'security-privacy.html') < 2 || count(startHere, 'dark-web-safety.html') < 2) {
  throw new Error('Start Here safety navigation or cards are missing.');
}
if (!startHere.includes('id="start-here-safety"')) throw new Error('Start Here safety section is missing.');
console.log('Primary navigation and Start Here now expose Security Tools and Dark Web Safety.');
