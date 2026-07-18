const fs = require('fs');
const path = require('path');

const root = process.cwd();
const mode = String(process.argv[2] || '').toLowerCase();
const checkpoint = path.join(root, '.release-checkpoints', 'search-v3');
const files = ['search.html', 'search.js', 'search-index.json', 'data/search-facets.json'];

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function readJson(file) { return JSON.parse(read(file)); }
function validate(base = root) {
  const get = file => fs.readFileSync(path.join(base, file), 'utf8');
  const js = get('search.js');
  const html = get('search.html');
  const index = JSON.parse(get('search-index.json'));
  const facets = JSON.parse(get('data/search-facets.json'));
  const problems = [];
  if (!js.includes('SEARCH V3') || !js.includes('SEARCH V2 compatibility')) problems.push('search.js is not the authoritative V3 runtime');
  if (!html.includes('id="search-v3-filters"') || !html.includes('id="archive-search"')) problems.push('search.html is not the authoritative V3 interface');
  if (!Array.isArray(index) || index.length < 1000 || !index.every(item => item && item.searchVersion === 3)) problems.push('search-index.json is not fully V3-normalised');
  if (facets.searchVersion !== 3 || Number(facets.totalResults) !== index.length) problems.push('search facets do not match the V3 index');
  return { ok: problems.length === 0, problems, results: Array.isArray(index) ? index.length : 0 };
}
function copy(from, to) {
  for (const file of files) {
    const source = path.join(from, file);
    const target = path.join(to, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
}

if (!['save', 'restore', 'verify'].includes(mode)) {
  console.error('Usage: node scripts/search-v3-checkpoint.js save|restore|verify');
  process.exit(2);
}
if (mode === 'save') {
  const state = validate(root);
  if (!state.ok) {
    console.error('SEARCH V3 CHECKPOINT SAVE FAILED');
    state.problems.forEach(problem => console.error('- ' + problem));
    process.exit(1);
  }
  fs.rmSync(checkpoint, { recursive: true, force: true });
  copy(root, checkpoint);
  fs.writeFileSync(path.join(checkpoint, 'checkpoint.json'), JSON.stringify({ savedAt: new Date().toISOString(), results: state.results, files }, null, 2));
  console.log(`Search V3 checkpoint saved: ${state.results} results.`);
  process.exit(0);
}
if (!fs.existsSync(path.join(checkpoint, 'checkpoint.json'))) {
  console.error('SEARCH V3 CHECKPOINT MISSING');
  process.exit(1);
}
if (mode === 'restore') {
  const state = validate(checkpoint);
  if (!state.ok) {
    console.error('SEARCH V3 CHECKPOINT RESTORE FAILED: checkpoint invalid');
    state.problems.forEach(problem => console.error('- ' + problem));
    process.exit(1);
  }
  copy(checkpoint, root);
  const restored = validate(root);
  if (!restored.ok) {
    console.error('SEARCH V3 CHECKPOINT RESTORE FAILED: restored files invalid');
    restored.problems.forEach(problem => console.error('- ' + problem));
    process.exit(1);
  }
  console.log(`Search V3 checkpoint restored after late generators: ${restored.results} results.`);
  process.exit(0);
}
const state = validate(root);
if (!state.ok) {
  console.error('SEARCH V3 CHECKPOINT VERIFY FAILED');
  state.problems.forEach(problem => console.error('- ' + problem));
  process.exit(1);
}
console.log(`Search V3 checkpoint verification passed: ${state.results} results.`);
