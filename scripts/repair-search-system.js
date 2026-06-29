const fs = require('fs');
const path = require('path');

const root = process.cwd();
const repairs = [];
function fp(name){ return path.join(root, name); }
function exists(name){ return fs.existsSync(fp(name)); }
function read(name){ return fs.readFileSync(fp(name), 'utf8'); }
function write(name, value){ fs.writeFileSync(fp(name), value); }
function replaceAllText(value, from, to){ return value.split(from).join(to); }

if (exists('search.html')) {
  let html = read('search.html');
  const before = html;
  if (html.includes('<p class="filter-count" id="search-count">Loading local index...</p>')) {
    html = replaceAllText(html, '<p class="filter-count" id="search-count">Loading local index...</p>', '<p class="filter-count" id="search-count">Showing the strongest entry points. Type above to filter the full archive.</p>');
  }
  if (html.includes('<p class="filter-count" id="search-count"></p>')) {
    html = replaceAllText(html, '<p class="filter-count" id="search-count"></p>', '<p class="filter-count" id="search-count">Showing the strongest entry points. Type above to filter the full archive.</p>');
  }
  if (!html.includes('Showing the strongest entry points') && html.includes('<div class="grid" id="search-results">')) {
    html = replaceAllText(html, '<div class="grid" id="search-results">', '<p class="filter-count" id="search-count">Showing the strongest entry points. Type above to filter the full archive.</p><div class="grid" id="search-results">');
  }
  if (html !== before) { write('search.html', html); repairs.push('search-count-copy'); }
}

if (exists('search.js')) {
  let js = read('search.js');
  const before = js;
  js = replaceAllText(js, '(b.keywords||[]).slice(0,8)', '(Array.isArray(b.keywords)?b.keywords:[]).slice(0,8)');
  js = replaceAllText(js, 'String((item.keywords||[])).toLowerCase()', '(Array.isArray(item.keywords)?item.keywords.join(" "):String(item.keywords||"")).toLowerCase()');
  if (js !== before) { write('search.js', js); repairs.push('search-js-cleanup-guard'); }
}

fs.mkdirSync(fp('downloads'), { recursive: true });
write('downloads/search-system-repair-report.json', JSON.stringify({ ok: true, generatedAt: new Date().toISOString(), repairs }, null, 2));
console.log('Search system repair complete: ' + repairs.length + ' repair(s).');
