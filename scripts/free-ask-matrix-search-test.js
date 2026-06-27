const fs = require('fs');
const path = require('path');
const root = process.cwd();
const issues = [];
function exists(name) { return fs.existsSync(path.join(root, name)); }
function read(name) { return fs.readFileSync(path.join(root, name), 'utf8'); }
function needFile(name) { if (!exists(name)) issues.push(`missing ${name}`); }
function needText(name, text) { if (exists(name) && !read(name).includes(text)) issues.push(`${name} missing ${text}`); }
function forbid(name, text) { if (exists(name) && read(name).toLowerCase().includes(text.toLowerCase())) issues.push(`${name} contains forbidden paid/external marker: ${text}`); }
for (const name of ['search.html', 'search.js', 'search-index.json', 'scripts/build-free-ask-matrix-search.js']) needFile(name);
needText('search.html', 'ASK MATRIX.');
needText('search.html', 'Free Local Answer Engine');
needText('search.html', 'No paid AI');
needText('search.html', 'search-index.json');
needText('search.html', 'archive-search');
needText('search.html', 'ask-answer');
needText('search.js', 'ASK MATRIX ROUTE');
needText('search.js', 'search-index.json');
needText('search.js', 'Paid AI calls: none');
needText('search.js', 'routeHints');
needText('scripts/build-free-ask-matrix-search.js', 'No paid AI');
needText('scripts/build-free-ask-matrix-search.js', 'search-index.json');
for (const name of ['search.html', 'search.js', 'scripts/build-free-ask-matrix-search.js']) {
  for (const bad of ['api.openai.com', 'workers-ai', 'ai-gateway', 'autorag', 'OPENAI_API_KEY', 'CLOUDFLARE_API_TOKEN', '@cf/']) forbid(name, bad);
}
if (exists('search-index.json')) {
  const index = JSON.parse(read('search-index.json'));
  if (!Array.isArray(index) || index.length < 20) issues.push('search-index.json should contain at least 20 routes');
  for (const route of ['search.html', 'live-intel.html', 'epstein-files.html', 'news.html', 'migration-flow.html', 'evidence-vault.html', 'download-center.html', 'trust-center.html']) {
    if (!index.some(item => item.url === route)) issues.push(`search-index.json missing route ${route}`);
  }
}
if (issues.length) {
  console.error('FREE ASK MATRIX SEARCH TEST FAILED');
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}
console.log('FREE ASK MATRIX SEARCH TEST PASSED');
console.log('Checked local-only Ask Matrix search, index routes, no paid AI/API calls, and required public markers.');
