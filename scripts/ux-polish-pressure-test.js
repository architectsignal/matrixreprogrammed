const fs = require('fs');
const path = require('path');

const root = process.cwd();
const problems = [];
function exists(file) { return fs.existsSync(path.join(root, file)); }
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function fail(msg) { problems.push(msg); }
function requireFile(file) { if (!exists(file)) fail(`missing required file: ${file}`); }
function requireIncludes(file, text, label = text) { if (!exists(file)) return; if (!read(file).includes(text)) fail(`${file}: missing ${label}`); }
function countPrimaryLinks(html) { const m = html.match(/<div class="nav-primary">([\s\S]*?)<\/div>/); if (!m) return 0; return (m[1].match(/<a\s+/g) || []).length; }
function visibleCopy(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');
}

const corePages = ['index.html', 'start-here.html', 'books.html', 'black-file.html', 'offer-center.html', 'optin-center.html', 'search.html', 'news.html', 'videos.html'];
const bannedReaderCopy = [
  'Phase 19 Lead Magnet / Capture Engine',
  'Phase 18 Offer Stack / Revenue Ladder Engine',
  'Phase 17 Campaign Calendar / Launch Room Engine',
  'This section is generated as a stable anchor',
  'Use this page as a sales door and an archive route',
  'The book sells the deep dive',
  'sales door',
  'book sells the deep dive'
];
for (const file of ['scripts/cleanup-duplicates.js', 'fixes.css', 'package.json', 'netlify.toml', ...corePages]) requireFile(file);

for (const file of corePages) {
  requireIncludes(file, 'nav-shell', 'polished navigation shell');
  requireIncludes(file, 'nav-primary', 'primary navigation group');
  requireIncludes(file, 'nav-more', 'More navigation drawer');
  requireIncludes(file, '<summary>More</summary>', 'More drawer trigger');
  for (const label of ['Books', 'Amazon Store', 'Control System', 'Declassified Files', 'Live Intel', 'Rumble Channels', 'Search']) {
    requireIncludes(file, label, `${label} mission route`);
  }
  for (const label of ['Opt-in Center', 'Offer Center', 'Signal Board']) {
    requireIncludes(file, label, `${label} secondary route`);
  }
  const html = read(file);
  const primaryCount = countPrimaryLinks(html);
  if (primaryCount > 8) fail(`${file}: primary nav has ${primaryCount} links; expected 8 or fewer`);
  const copy = visibleCopy(html);
  for (const phrase of bannedReaderCopy) {
    if (copy.includes(phrase)) fail(`${file}: visible public implementation/sales scaffold copy: ${phrase}`);
  }
}

const cleanup = read('scripts/cleanup-duplicates.js');
for (const marker of ['nav-shell', 'nav-primary', 'nav-more', 'nav-drawer', 'Sell / Capture', 'Evidence & Trust', 'Control Maps', 'Freedom Ecosystem']) {
  if (!cleanup.includes(marker)) fail(`cleanup-duplicates.js missing UX nav marker: ${marker}`);
}
for (const route of ['books.html', 'amazon-store-books.html', 'videos.html', 'news.html', 'power-atlas.html', 'evidence-vault.html', 'optin-center.html', 'offer-center.html', 'forum.html']) {
  if (!cleanup.includes(route)) fail(`cleanup-duplicates.js master nav missing ${route}`);
}
if (!cleanup.includes('cleanupImplementationCopy')) fail('cleanup-duplicates.js missing public copy scrubber');
for (const phrase of ['Use this page as a sales door', 'The book sells the deep dive', 'Continue The Investigation']) {
  if (!cleanup.includes(phrase)) fail(`cleanup-duplicates.js missing reader-copy scrub rule for ${phrase}`);
}

const fixes = read('fixes.css');
for (const marker of ['.nav-shell', '.nav-primary', '.nav-more', '.nav-drawer', '.nav-group', '@media(max-width:820px)']) {
  if (!fixes.includes(marker)) fail(`fixes.css missing UX style marker: ${marker}`);
}

const pkg = read('package.json');
if (!pkg.includes('ux-polish-pressure-test.js')) fail('package.json build missing ux-polish-pressure-test.js');
const netlify = read('netlify.toml');
for (const step of ['cleanup-duplicates.js', 'phase19-pressure-test.js']) {
  if (!netlify.includes(step)) fail(`netlify.toml build command missing ${step}`);
}

if (problems.length) {
  console.error('\nUX POLISH PRESSURE TEST FAILED\n');
  for (const problem of problems) console.error(`- ${problem}`);
  console.error(`\n${problems.length} issue(s) found.\n`);
  process.exit(1);
}
console.log('UX POLISH PRESSURE TEST PASSED');
console.log('Checked mission-led primary nav, More drawer, route coverage, visible public copy scrub, responsive drawer CSS, and build wiring.');
