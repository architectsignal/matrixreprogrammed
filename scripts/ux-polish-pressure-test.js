const fs = require('fs');
const path = require('path');

const root = process.cwd();
const problems = [];
function exists(file) { return fs.existsSync(path.join(root, file)); }
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function fail(msg) { problems.push(msg); }
function requireFile(file) { if (!exists(file)) fail(`missing required file: ${file}`); }
function requireIncludes(file, text, label = text) { if (!exists(file)) return; if (!read(file).includes(text)) fail(`${file}: missing ${label}`); }
function requireNotIncludes(file, text, label = text) { if (!exists(file)) return; if (read(file).includes(text)) fail(`${file}: still contains ${label}`); }
function countPrimaryLinks(html) { const m = html.match(/<div class="nav-primary">([\s\S]*?)<\/div>/); if (!m) return 0; return (m[1].match(/<a\s+/g) || []).length; }

const corePages = ['index.html', 'start-here.html', 'books.html', 'black-file.html', 'offer-center.html', 'optin-center.html', 'search.html'];
for (const file of ['scripts/cleanup-duplicates.js', 'fixes.css', 'package.json', 'netlify.toml', ...corePages]) requireFile(file);

for (const file of corePages) {
  requireIncludes(file, 'nav-shell', 'polished navigation shell');
  requireIncludes(file, 'nav-primary', 'primary navigation group');
  requireIncludes(file, 'nav-more', 'More navigation drawer');
  requireIncludes(file, '<summary>More</summary>', 'More drawer trigger');
  requireIncludes(file, 'Amazon Store', 'Amazon Store route');
  requireIncludes(file, 'Opt-in Center', 'Opt-in Center route');
  requireIncludes(file, 'Offer Center', 'Offer Center route');
  requireIncludes(file, 'Signal Board', 'Signal Board route');
  const primaryCount = countPrimaryLinks(read(file));
  if (primaryCount > 8) fail(`${file}: primary nav has ${primaryCount} links; expected 8 or fewer`);
  for (const phrase of ['Phase 19 Lead Magnet / Capture Engine', 'Phase 18 Offer Stack / Revenue Ladder Engine', 'Phase 17 Campaign Calendar / Launch Room Engine', 'This section is generated as a stable anchor']) {
    requireNotIncludes(file, phrase, `public implementation copy: ${phrase}`);
  }
}

const cleanup = read('scripts/cleanup-duplicates.js');
for (const marker of ['nav-shell', 'nav-primary', 'nav-more', 'nav-drawer', 'Reader Tools', 'Evidence & Trust', 'Archive Systems', 'Live Doors']) {
  if (!cleanup.includes(marker)) fail(`cleanup-duplicates.js missing UX nav marker: ${marker}`);
}
for (const route of ['optin-center.html', 'offer-center.html', 'amazon-store-books.html', 'forum.html', 'power-atlas.html', 'evidence-vault.html']) {
  if (!cleanup.includes(route)) fail(`cleanup-duplicates.js master nav missing ${route}`);
}
if (!cleanup.includes('cleanupImplementationCopy')) fail('cleanup-duplicates.js missing public copy scrubber');

const fixes = read('fixes.css');
for (const marker of ['.nav-shell', '.nav-primary', '.nav-more', '.nav-drawer', '.nav-group', '@media(max-width:820px)']) {
  if (!fixes.includes(marker)) fail(`fixes.css missing UX style marker: ${marker}`);
}

const pkg = read('package.json');
if (!pkg.includes('ux-polish-pressure-test.js')) fail('package.json build missing ux-polish-pressure-test.js');
const netlify = read('netlify.toml');
if (!netlify.includes('ux-polish-pressure-test.js')) fail('netlify.toml build command missing ux-polish-pressure-test.js');

if (problems.length) {
  console.error('\nUX POLISH PRESSURE TEST FAILED\n');
  for (const problem of problems) console.error(`- ${problem}`);
  console.error(`\n${problems.length} issue(s) found.\n`);
  process.exit(1);
}
console.log('UX POLISH PRESSURE TEST PASSED');
console.log('Checked short primary nav, More drawer, master route coverage, public copy scrub, responsive drawer CSS, and build wiring.');
