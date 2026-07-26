const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = process.cwd();
const indexPath = path.join(root, 'index.html');
const startHerePath = path.join(root, 'start-here.html');
if (!fs.existsSync(indexPath)) throw new Error('index.html not found for primary navigation reconciliation.');
if (!fs.existsSync(startHerePath)) throw new Error('start-here.html not found for Start Here reconciliation.');

// This navigation patch runs before the repository's final site-QA gate. Build
// the canonical Death Files routes first so adding their links can never create
// a temporary broken-link failure during the same production build.
const deathDataPath = path.join(root, 'data', 'death-files.json');
const deathBuilderPath = path.join(root, 'scripts', 'build-death-files.js');
if (!fs.existsSync(deathDataPath)) throw new Error('Canonical Death Files data is missing before navigation reconciliation.');
const deathData = JSON.parse(fs.readFileSync(deathDataPath, 'utf8'));
if (!Array.isArray(deathData.dossiers) || deathData.dossiers.length !== 100) {
  throw new Error(`Navigation release requires exactly 100 Death Files dossiers; found ${deathData.dossiers?.length || 0}.`);
}
if (!fs.existsSync(deathBuilderPath)) throw new Error('Death Files builder is missing before navigation reconciliation.');
execFileSync(process.execPath, [deathBuilderPath], { cwd: root, stdio: 'inherit', env: process.env });
if (!fs.existsSync(path.join(root, 'death-files.html'))) throw new Error('Death Files landing page was not generated before navigation reconciliation.');
const dossierPages = fs.readdirSync(root).filter(name => /^death-file-.+\.html$/i.test(name));
if (dossierPages.length !== 100) throw new Error(`Expected 100 generated Death Files dossiers before navigation reconciliation; found ${dossierPages.length}.`);

const primaryLinks = [
  ['start-here.html', 'Start Here'],
  ['books.html', 'Books'],
  ['death-files.html', 'Death Files'],
  ['independent-links.html', 'Independent Links'],
  ['live-intel.html', 'Live Intel'],
  ['power-atlas.html', 'Control System'],
  ['evidence-vault.html', 'Declassified Files'],
  ['search.html', 'Search']
];
const primaryHtml = primaryLinks.map(([href, label]) => `<a href="${href}">${label}</a>`).join('');
const moreGroups = [
  ['Research & Data', [
    ['data-lab.html', 'Public Data Lab'],
    ['research-tools.html', 'Research Tools'],
    ['evidence-archive.html', 'Evidence Archive'],
    ['evidence-network-map.html', 'Evidence Network'],
    ['geographic-power-atlas.html', 'Geographic Atlas'],
    ['source-document-vault.html', 'Source Vault'],
    ['independent-links.html', 'Top 100 Independent Links']
  ]],
  ['Investigations & Intelligence', [
    ['death-files.html', 'Death Files'],
    ['behind-the-curtain.html', 'Behind the Curtain'],
    ['follow-the-money.html', 'Follow the Money'],
    ['elite-family-tracker.html', 'Track the Families'],
    ['epstein-files.html', 'Epstein Files'],
    ['investigation-machine.html', 'Investigation Machine'],
    ['network-maps.html', 'Network Maps']
  ]],
  ['Community, Books & Membership', [
    ['book-universe.html', 'Book Universe'],
    ['forum.html', 'Signal Board'],
    ['membership.html', 'Membership'],
    ['subscriber-dashboard.html', 'Subscriber Dashboard'],
    ['amazon-store-books.html', 'Amazon Store'],
    ['videos.html', 'Rumble Channels']
  ]],
  ['Briefs, Safety & Support', [
    ['security-privacy.html', 'Security Tools'],
    ['dark-web-safety.html', 'Dark Web Safety'],
    ['optin-center.html', 'Opt-in Center'],
    ['offer-center.html', 'Offer Center'],
    ['newsletter.html', 'Newsletter'],
    ['download-center.html', 'Download Center'],
    ['contact-the-machine.html', 'Contact the Machine']
  ]]
];
const moreHtml = `<details class="nav-more"><summary>More</summary><div class="nav-drawer">${moreGroups.map(([title, links]) => `<div class="nav-group"><strong>${title}</strong>${links.map(([href, label]) => `<a href="${href}">${label}</a>`).join('')}</div>`).join('')}</div></details>`;
const homepageNavHtml = `<nav class="nav nav-shell" aria-label="Primary navigation"><div class="nav-primary">${primaryHtml}</div>${moreHtml}</nav>`;

function replaceNavigation(document) {
  const topbar = /<header\b[^>]*class=["'][^"']*\btopbar\b[^"']*["'][^>]*>[\s\S]*?<\/header>/i;
  const headerMatch = document.match(topbar);
  if (!headerMatch) throw new Error('Primary navigation header not found.');
  const nav = /<nav\b[^>]*>[\s\S]*?<\/nav>/i;
  const nextHeader = nav.test(headerMatch[0])
    ? headerMatch[0].replace(nav, homepageNavHtml)
    : headerMatch[0].replace(/<\/header>$/i, `${homepageNavHtml}</header>`);
  return document.replace(headerMatch[0], nextHeader);
}

let html = replaceNavigation(fs.readFileSync(indexPath, 'utf8'));
fs.writeFileSync(indexPath, html);

let startHere = fs.readFileSync(startHerePath, 'utf8');
startHere = startHere.replace(/<!-- start-here-safety:start -->[\s\S]*?<!-- start-here-safety:end -->/gi, '');
startHere = startHere.replace(/<section class="section commercial-internal">/g, '<section class="section">');
startHere = replaceNavigation(startHere);
const safetySection = '<!-- start-here-safety:start --><section class="section wrap" id="start-here-safety"><div class="eyebrow">Protect The Researcher</div><h2>SECURITY, PRIVACY & DARK WEB SAFETY.</h2><p class="lead">Before opening sensitive records, building an OSINT workflow or using Tor, establish a threat model, separate identities and understand what each tool can and cannot protect.</p><div class="grid"><article id="start-here-security-tools" class="card redline"><h3>Security, Privacy & OSINT Safety</h3><p>Build a protection system covering secure messaging, passwords, encryption, metadata removal, breach checks and defensive monitoring.</p><a class="btn alt" href="security-privacy.html">Open Security Tools</a></article><article id="start-here-dark-web-safety" class="card redline"><h3>Dark Web Safety Guide</h3><p>Follow the lawful Tor workflow, verify official onion services, isolate downloads and understand the risks before opening unknown services.</p><a class="btn alt" href="dark-web-safety.html">Open Dark Web Safety</a></article></div><div class="cta-row"><a class="btn alt" href="death-files.html">Death Files</a><a class="btn alt" href="independent-links.html">Independent Links</a><a class="btn alt" href="forum.html">Signal Board</a></div><p><strong>Boundary:</strong> privacy tools reduce specific risks; they do not create invisibility, authorise illegal access or make unknown links safe.</p></section><!-- start-here-safety:end -->';
if (!startHere.includes('</main>')) throw new Error('Start Here main element not found.');
startHere = startHere.replace('</main>', `${safetySection}</main>`);
fs.writeFileSync(startHerePath, startHere);

// The Capstone's search controls are implemented by its own power-family
// runtime. Remove the obsolete reference to a file that no longer exists.
const capstonePath = path.join(root, 'behind-the-curtain-capstone.html');
if (fs.existsSync(capstonePath)) {
  let capstone = fs.readFileSync(capstonePath, 'utf8');
  capstone = capstone.replace(/\s*<script\s+src=["']search-system\.js["']><\/script>/gi, '');
  fs.writeFileSync(capstonePath, capstone);
}

for (const [route, label] of primaryLinks) {
  if (!html.includes(`href="${route}">${label}</a>`)) throw new Error(`Homepage primary route missing: ${label}`);
  if (!startHere.includes(`href="${route}">${label}</a>`)) throw new Error(`Start Here primary route missing: ${label}`);
}
for (const route of ['death-files.html','independent-links.html','elite-family-tracker.html','security-privacy.html','dark-web-safety.html','contact-the-machine.html']) {
  if (!html.includes(`href="${route}"`)) throw new Error(`Homepage final navigation missing ${route}`);
  if (!startHere.includes(`href="${route}"`)) throw new Error(`Start Here final navigation missing ${route}`);
}
const primaryMarkup = (html.match(/<div\b[^>]*class=["'][^"']*\bnav-primary\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i) || [])[1] || '';
const anchorCount = (primaryMarkup.match(/<a\b[^>]*href=/gi) || []).length;
if (anchorCount !== 8) throw new Error(`Homepage primary navigation must contain exactly eight links; found ${anchorCount}.`);
if ((startHere.match(/<!-- start-here-safety:start -->/g) || []).length !== 1) throw new Error('Start Here safety section is missing or duplicated.');
console.log('Final navigation preserved: Death Files, Independent Links, Declassified Files, family tracking, safety routes and the corrected Capstone runtime are all present.');
