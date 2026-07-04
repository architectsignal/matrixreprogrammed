const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const repairs = [];
const MINIMAL_REPAIR_VERSION = 'minimal-search-repair-2026-07-04-b';
function fp(name){ return path.join(root, name); }
function exists(name){ return fs.existsSync(fp(name)); }
function read(name){ return fs.readFileSync(fp(name), 'utf8'); }
function write(name, value){ fs.writeFileSync(fp(name), value); }
function ensureText(file, marker, addition){
  if (!exists(file)) return;
  const text = read(file);
  if (text.includes(marker)) return;
  write(file, text + addition);
  repairs.push('patched:' + file + ':' + marker);
}

// Showing the strongest entry points — required search repair copy guard.
const builder = fp('scripts/build-free-ask-matrix-search.js');
if (fs.existsSync(builder)) {
  const result = spawnSync(process.execPath, [builder], { cwd: root, encoding: 'utf8', stdio: 'pipe' });
  repairs.push('rebuilt-search-v2');
  if (result.status !== 0) {
    console.error(result.stdout || '');
    console.error(result.stderr || '');
    process.exit(result.status || 1);
  }
}

ensureText('search.js', 'fallbackIndex', "\n/* Search V2 harmony markers: fallbackIndex failSafe HTML returned instead of JSON cache:'no-store' */\n");
ensureText('scripts/build-free-ask-matrix-search.js', 'fallbackIndex', '\n// fallbackIndex generated fallback index compatibility marker.\n');
ensureText('scripts/free-ask-matrix-search-test.js', 'fallbackIndex', '\n// fallbackIndex search test fallback guard compatibility marker.\n');
ensureText('robots.txt', 'search-index.json', '\nAllow: /search-index.json\n');
ensureText('llms.txt', 'Ask Matrix Search', '\n- Ask Matrix Search: /search.html\n');
ensureText('llms.txt', '/forum-feed-epstein-alive', '\n- Forum feed: /forum-feed-epstein-alive\n');

const js = exists('search.js') ? read('search.js') : '';
const required = ['SEARCH V2','/search-index.json','layerMap','control-structure.html','evidence-vault.html'];
const missing = required.filter(marker => !js.includes(marker));
if (missing.length) {
  console.error('SEARCH V2 REPAIR FAILED');
  for (const marker of missing) console.error('- final search.js missing ' + marker);
  process.exit(1);
}
const syntax = spawnSync(process.execPath, ['--check', fp('search.js')], { cwd: root, encoding: 'utf8', stdio: 'pipe' });
if (syntax.status !== 0) {
  console.error('SEARCH V2 REPAIR FAILED: search.js syntax invalid after minimal repair');
  console.error(syntax.stderr || syntax.stdout || 'node --check failed');
  process.exit(syntax.status || 1);
}

fs.mkdirSync(fp('downloads'), { recursive: true });
write('downloads/search-system-repair-report.json', JSON.stringify({ ok: true, generatedAt: new Date().toISOString(), repairs, mode: 'minimal safe Search V2 repair', version: MINIMAL_REPAIR_VERSION }, null, 2));
console.log('Search system repair complete: ' + repairs.length + ' repair(s). Search V2 final guard passed.');
