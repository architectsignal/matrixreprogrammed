const fs = require('fs');
const path = require('path');

const root = process.cwd();
const checkedDate = '25 June 2026';

function exists(file){ return fs.existsSync(path.join(root, file)); }
function read(file){ return fs.readFileSync(path.join(root, file), 'utf8'); }
function write(file, html){ fs.writeFileSync(path.join(root, file), html); }
function esc(value){ return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

const commandCenterSection = `<section id="epstein-command-center-order" class="section wrap command-center-order"><div class="eyebrow">Command Center Order</div><h2>THE EPSTEIN FILES COMMAND CENTER</h2><p class="lead">Open the files first. Then track the people, timeline, emails, evidence strength, and network function. The purpose is exposure through the record: document, classify, cross-reference, then follow the money, access, silence, and institutional failure.</p><div class="grid"><article class="card redline"><span class="label">1</span><h3>Open The Actual Files</h3><p>Start with official disclosures, court dockets, oversight records, email archives, and source-search doors.</p><a class="btn" href="#epstein-file-cockpit">Actual Files Cockpit</a></article><article class="card redline"><span class="label">2</span><h3>Read Latest Bulletins</h3><p>Use dated bulletins as leads, not verdicts. Then open the source door behind each update.</p><a class="btn" href="#epstein-watch-enhanced">Latest Bulletins</a></article><article class="card redline"><span class="label">3</span><h3>Track People / Entities</h3><p>Separate conviction, court record, sworn claim, email contact, flight/contact record, settlement, and peripheral mention.</p><a class="btn" href="#epstein-people-tracker">People Tracker</a></article><article class="card redline"><span class="label">4</span><h3>Follow The Timeline</h3><p>Sequence matters: date, evidence class, people/entities, source door, what the record supports, and what remains open.</p><a class="btn" href="#epstein-timeline-map">Timeline Map</a></article><article class="card redline"><span class="label">5</span><h3>Read The Emails</h3><p>Email and contact trails expose relationship frequency, media strategy, leverage, reputation repair, and contradiction lanes.</p><a class="btn" href="#epstein-email-signals">Email Signals</a></article><article class="card redline"><span class="label">6</span><h3>Classify The Evidence</h3><p>A conviction is not an email. A flight log is not a confession. A settlement is not automatic admission.</p><a class="btn" href="#epstein-evidence-ladder">Evidence Ladder</a></article><article class="card redline"><span class="label">7</span><h3>Map The Network Function</h3><p>Access, logistics, money, reputation repair, legal pressure, silence, media leverage, and institutional failure.</p><a class="btn" href="#epstein-network-architecture">Network Matrix</a></article><article class="card redline"><span class="label">8</span><h3>Read The Black File</h3><p>The public record gives the trail. The Black File turns the trail into a deeper dossier and funnel entry point.</p><a class="btn" href="book-black-file.html">Read The Black File</a></article></div></section>`;

const blackFileFunnel = `<section id="black-file-conversion-panel" class="section wrap black-file-conversion"><div class="terminal">BLACK FILE ROUTE\n&gt; You have seen the public record.\n&gt; Now follow the pattern through the full dossier.\n&gt; Open the free brief, read the Black File, watch the breakdown, or enter the book archive.</div><div class="grid"><article class="card redline"><span class="label">Dossier</span><h3>Read The Black File</h3><p>The deeper file connects names, dates, documents, institutions, money, silence, and leverage into a full reading path.</p><a class="btn" href="book-black-file.html">Read The Black File</a></article><article class="card"><span class="label">Free Brief</span><h3>Get The Free Brief</h3><p>Use the free brief as the entry point: the short, sharp record trail that pulls readers deeper into the system.</p><a class="btn alt" href="optin-center.html">Get The Free Brief</a></article><article class="card"><span class="label">Store</span><h3>Open The Book Store</h3><p>Move from the public page into the complete Matrix Reprogrammed book universe.</p><a class="btn alt" href="amazon-store-books.html">Open The Amazon Store</a></article><article class="card"><span class="label">Video</span><h3>Watch The Breakdown</h3><p>Turn the file trail into a watchable sequence for Rumble and short-form traffic.</p><a class="btn alt" href="videos.html">Watch The Rumble Breakdown</a></article></div></section>`;

function insertBeforeMainEnd(html, section) {
  if (!html.includes('</main>')) return html;
  return html.replace('</main>', `${section}</main>`);
}
function insertAfterHeroOrBeforeFirstSection(html, section) {
  if (html.includes('id="epstein-command-center-order"')) return html;
  const firstMainSection = html.indexOf('<section', html.indexOf('<main'));
  const secondSection = firstMainSection >= 0 ? html.indexOf('<section', firstMainSection + 8) : -1;
  if (secondSection >= 0) return html.slice(0, secondSection) + section + html.slice(secondSection);
  return insertBeforeMainEnd(html, section);
}
function addEpsteinPolish() {
  const file = 'epstein-files.html';
  if (!exists(file)) return false;
  let html = read(file);
  const before = html;
  html = insertAfterHeroOrBeforeFirstSection(html, commandCenterSection);
  if (!html.includes('id="black-file-conversion-panel"')) html = insertBeforeMainEnd(html, blackFileFunnel);
  html = html.replace(/<title>.*?Epstein.*?<\/title>/i, '<title>Epstein Files Command Center | Matrix Reprogrammed</title>');
  html = html.replace(/<meta name="description" content="[^"]*"/i, '<meta name="description" content="Open the Epstein Files Command Center: actual files, people tracker, timeline map, email signals, evidence ladder, network architecture, and Black File reading path."');
  if (html !== before) write(file, html);
  return html !== before;
}

const moneyPages = [
  'index.html',
  'live-intel.html',
  'epstein-files.html',
  'evidence-vault.html',
  'power-atlas.html',
  'books.html',
  'book-universe.html',
  'sales-ladder.html',
  'offer-center.html',
  'optin-center.html'
];
function addMoneyPanels() {
  let touched = 0;
  for (const file of moneyPages) {
    if (!exists(file)) continue;
    let html = read(file);
    if (html.includes('id="black-file-conversion-panel"')) continue;
    html = insertBeforeMainEnd(html, blackFileFunnel);
    write(file, html);
    touched += 1;
  }
  return touched;
}

const touchedEpstein = addEpsteinPolish();
const touchedMoney = addMoneyPanels();
console.log(`Command Center polish complete: Epstein page ${touchedEpstein ? 'updated' : 'already current'}, ${touchedMoney} money-funnel panels added. Checked ${checkedDate}.`);
