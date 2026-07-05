const fs = require('fs');
const path = require('path');

const root = process.cwd();
const problems = [];
function exists(file) { return fs.existsSync(path.join(root, file)); }
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function fail(msg) { problems.push(msg); }
function requireFile(file) { if (!exists(file)) fail(`missing required file: ${file}`); }
function requireIncludes(file, text, label = text) { if (!exists(file)) return; if (!read(file).includes(text)) fail(`${file}: missing ${label}`); }
function visibleCopy(file) { return read(file).replace(/<!--[\s\S]*?-->/g, ' ').replace(/<script\b[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '); }

const core = ['index.html','live-intel.html','epstein-files.html','news.html','evidence-vault.html','videos.html','books.html','amazon-store-books.html','optin-center.html','offer-center.html','search.html','netlify.toml','package.json'];
core.forEach(requireFile);

const homepageMustHave = [
  'FOLLOW THE FILES',
  'READ THE SYSTEM',
  'Open Live Intel',
  'Epstein Files',
  'Declassified Files',
  'Buy The Books',
  'Get Free Briefs',
  'Main Doors',
  'Live source lanes',
  'source → evidence → video hook → free brief → book/store',
  'Join The Signal'
];
for (const marker of homepageMustHave) requireIncludes('index.html', marker, `homepage 10/10 marker: ${marker}`);

const pageRoutes = {
  'index.html': ['live-intel.html','epstein-files.html','evidence-vault.html','videos.html','amazon-store-books.html','optin-center.html','books.html','search.html'],
  'live-intel.html': ['downloads/live-intel-latest.json','downloads/live-intel-latest.md','epstein-files.html','evidence-vault.html','videos.html','amazon-store-books.html'],
  'epstein-files.html': ['downloads/epstein-source-watch.json','downloads/epstein-evidence-watch.md','videos.html','amazon-store-books.html','evidence-vault.html'],
  'news.html': ['live-intel.html','videos.html','amazon-store-books.html'],
  'videos.html': ['live-intel.html','amazon-store-books.html'],
  'books.html': ['live-intel.html','amazon-store-books.html']
};
for (const [file, hrefs] of Object.entries(pageRoutes)) {
  for (const href of hrefs) requireIncludes(file, href, `${file} route ${href}`);
}

for (const marker of ['LIVE INTEL.', 'Latest Actionable Updates', 'Evidence Level', 'Why It Matters', 'Next Action', 'VIDEO HOOK', 'Free Brief', 'Books / Store', 'Source Lanes']) {
  requireIncludes('live-intel.html', marker, `live intel usefulness marker: ${marker}`);
}
for (const marker of ['Source Watch JSON', 'Markdown Brief', 'Document And Source Lanes', 'Latest Epstein Bulletins', 'Evidence Boundary', 'Rumble Channels', 'Books / Store']) {
  requireIncludes('epstein-files.html', marker, `Epstein useful marker: ${marker}`);
}
for (const marker of ['downloads/live-intel-latest.json','downloads/live-intel-latest.md','downloads/epstein-source-watch.json','downloads/epstein-evidence-watch.md']) requireFile(marker);
for (const marker of ['rumbleShortTitle','rumbleLongTitle','videoHook','optinRoute','offerRoute','bookRoute','storeRoute']) requireIncludes('downloads/live-intel-latest.json', marker, `live intel data ${marker}`);

const netlify = exists('netlify.toml') ? read('netlify.toml') : '';
for (const route of ['from = "/live-intel"','from = "/epstein"','from = "/amazon-store"','from = "/books"','from = "/forum"','from = "/search"','from = "/rss"','from = "/download-center"','from = "/evidence-vault"','from = "/power-atlas"','from = "/answer-engine"','from = "/distribution"','from = "/trust"']) {
  if (!netlify.includes(route)) fail(`netlify.toml missing critical route ${route}`);
}
for (const header of ['for = "/downloads/*.pdf"','for = "/downloads/*.json"','for = "/downloads/*.md"','X-Frame-Options','Referrer-Policy']) {
  if (!netlify.includes(header)) fail(`netlify.toml missing production header ${header}`);
}
for (const script of ['build-live-intel-machine.js','live-intel-pressure-test.js','epstein-watch-pressure-test.js','ten-out-of-ten-pressure-test.js']) {
  requireIncludes('package.json', script, `package build/script wiring ${script}`);
}

const bannedVisible = [/sales door/i, /Archive route/i, /Database-driven archive/i, /Source:\s*data\//i, /Live generated pages/i, /coming soon/i, /TODO/i, /FIXME/i, /author-facing/i, /ChatGPT/i];
for (const file of ['index.html','live-intel.html','epstein-files.html','news.html','evidence-vault.html','videos.html','books.html','amazon-store-books.html','optin-center.html','offer-center.html']) {
  if (!exists(file)) continue;
  const copy = visibleCopy(file);
  for (const pattern of bannedVisible) if (pattern.test(copy)) fail(`${file}: visible copy still matches ${pattern}`);
}

if (problems.length) {
  console.error('\n10/10 USEFULNESS PRESSURE TEST FAILED\n');
  for (const problem of problems) console.error(`- ${problem}`);
  console.error(`\n${problems.length} issue(s) found.\n`);
  process.exit(1);
}
console.log('10/10 USEFULNESS PRESSURE TEST PASSED');
console.log('Checked command-center homepage, page-specific mission routes, live intel depth, Epstein source-watch depth, downloads, Netlify routes/headers, conversion paths, and visible-copy quality.');
