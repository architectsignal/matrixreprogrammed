const fs = require('fs');
const path = require('path');
const root = process.cwd();
const issues = [];
function exists(name) { return fs.existsSync(path.join(root, name)); }
function read(name) { return exists(name) ? fs.readFileSync(path.join(root, name), 'utf8') : ''; }
function needFile(name) { if (!exists(name)) issues.push(`missing ${name}`); }
function needText(name, text, label = text) { if (!exists(name) || !read(name).includes(text)) issues.push(`${name} missing ${label}`); }
function forbid(name, text) { if (exists(name) && read(name).toLowerCase().includes(text.toLowerCase())) issues.push(`${name} contains forbidden paid/external marker: ${text}`); }

for (const name of ['search.html', 'search.js', 'search-index.json', 'data/search-facets.json', 'scripts/repair-search-system.js', 'scripts/search-investigation-smoke-test.js']) needFile(name);
needText('search.html', 'SEARCH THE MACHINE', 'current search heading');
needText('search.html', 'id="archive-search"', 'search input');
needText('search.html', 'id="search-results"', 'search results container');
needText('search.html', '<script src="search.js"></script>', 'search runtime');
needText('search.js', '/search-index.json', 'local search index fetch');
needText('search.js', "cache:'no-store'", 'fresh local index request');
needText('search.js', 'fallbackIndex', 'local fallback index');
needText('search.js', 'HTML returned instead of JSON', 'invalid response guard');
needText('data/search-facets.json', 'evidenceBoundary', 'evidence boundary');
needText('scripts/repair-search-system.js', 'search-index.json', 'canonical search repair');
needText('scripts/search-investigation-smoke-test.js', 'search.html', 'current search smoke test');

for (const name of ['search.html', 'search.js', 'scripts/repair-search-system.js']) {
  for (const bad of ['api.openai.com', 'workers-ai', 'ai-gateway', 'OPENAI_API_KEY', 'CLOUDFLARE_API_TOKEN', '@cf/']) forbid(name, bad);
}

if (exists('search-index.json')) {
  let index;
  try { index = JSON.parse(read('search-index.json')); }
  catch (error) { issues.push(`search-index.json invalid JSON: ${error.message}`); }
  if (index) {
    if (!Array.isArray(index) || index.length < 40) issues.push(`search-index.json should contain at least 40 current routes, found ${Array.isArray(index) ? index.length : 'non-array'}`);
    for (const route of ['search.html', 'books.html', 'live-intel.html', 'epstein-files.html', 'evidence-vault.html', 'download-center.html']) {
      if (!index.some(item => item && item.url === route)) issues.push(`search-index.json missing current route ${route}`);
    }
    for (const item of index) {
      if (!item || !item.title || !item.url) issues.push('search-index.json contains route without title/url');
      if (item && /^https?:\/\//i.test(item.url || '')) issues.push(`search-index.json should use a local route, not external URL: ${item.url}`);
    }
  }
}

if (exists('data/search-facets.json')) {
  try {
    const facets = JSON.parse(read('data/search-facets.json'));
    if (Number(facets.totalResults || 0) < 40) issues.push('search facets report too few searchable results');
    if (!facets.evidenceBoundary) issues.push('search facets missing evidence boundary');
  } catch (error) { issues.push(`data/search-facets.json invalid JSON: ${error.message}`); }
}

if (issues.length) {
  console.error('CURRENT LOCAL SEARCH TEST FAILED');
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}
console.log('CURRENT LOCAL SEARCH TEST PASSED');
console.log('Checked the evidence-aware local index, no-store runtime, fallback index, required public routes, response guards and absence of external AI credentials.');
