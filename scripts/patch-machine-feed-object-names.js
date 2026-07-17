const fs = require('fs');
const path = require('path');

const root = process.cwd();
const runnerPath = path.join(root, 'scripts', 'fetch-public-record-feeds.js');
if (!fs.existsSync(runnerPath)) throw new Error('fetch-public-record-feeds.js is missing');

let runner = fs.readFileSync(runnerPath, 'utf8');
const beforeRunner = runner;
const oldClean = "function clean(value = '') { return String(value ?? '').replace(/<[^>]+>/g, ' ').replace(/\\s+/g, ' ').trim(); }";
const newClean = `function scalarText(value, depth = 0) {
  if (value == null || depth > 4) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(item => scalarText(item, depth + 1)).filter(Boolean).join(', ');
  if (typeof value === 'object') {
    for (const key of ['name','label','title','text','value','display_name','project_name','countryname','sector','agency','agency_name','description']) {
      const resolved = scalarText(value[key], depth + 1);
      if (resolved) return resolved;
    }
    return Object.values(value).map(item => scalarText(item, depth + 1)).filter(Boolean).slice(0, 4).join(', ');
  }
  return '';
}
function clean(value = '') { return scalarText(value).replace(/<[^>]+>/g, ' ').replace(/\\s+/g, ' ').trim(); }`;
if (runner.includes(oldClean)) runner = runner.replace(oldClean, newClean);
if (!runner.includes('function scalarText(value, depth = 0)')) throw new Error('Machine feed scalar normalizer was not installed');

const oldUniq = "function uniq(items) { return [...new Set(arr(items).map(clean).filter(Boolean))]; }";
const newUniq = "function uniq(items) { return [...new Set(arr(items).map(clean).filter(value => value && value !== '[object Object]' && value !== 'object Object'))]; }";
if (runner.includes(oldUniq)) runner = runner.replace(oldUniq, newUniq);
if (!runner.includes("value !== '[object Object]'")) throw new Error('Machine feed placeholder filter was not installed');

if (runner !== beforeRunner) fs.writeFileSync(runnerPath, runner);

const roots = [root, path.join(root, '_site')].filter((value, index, all) => all.indexOf(value) === index && fs.existsSync(value));
const touched = [];
function display(file) { return path.relative(root, file).replace(/\\/g, '/'); }
function writeJson(relative, transform) {
  for (const base of roots) {
    const file = path.join(base, relative);
    if (!fs.existsSync(file)) continue;
    let data;
    try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { continue; }
    const next = transform(data);
    const before = JSON.stringify(data);
    const after = JSON.stringify(next);
    if (after === before) continue;
    fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
    touched.push(display(file));
  }
}
function validName(value) {
  const text = String(value ?? '').trim();
  return Boolean(text && text !== '[object Object]' && text !== 'object Object' && text !== '[object Array]');
}
writeJson('data/entity-observations.json', data => ({
  ...data,
  observations: (Array.isArray(data.observations) ? data.observations : []).filter(item => validName(item?.name))
}));
writeJson('data/daily-brain-brief.json', data => ({
  ...data,
  entityObservationSignals: (Array.isArray(data.entityObservationSignals) ? data.entityObservationSignals : []).filter(item => validName(item?.name))
}));

function scrubText(relative) {
  for (const base of roots) {
    const file = path.join(base, relative);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
    const before = fs.readFileSync(file, 'utf8');
    let after = before;
    after = after.replace(/<article\b[^>]*>[\s\S]*?<h3>\s*\[object Object\]\s*<\/h3>[\s\S]*?<\/article>/gi, '');
    after = after.replace(/^.*\[object Object\].*$(?:\r?\n)?/gmi, '');
    if (after !== before) {
      fs.writeFileSync(file, after);
      touched.push(display(file));
    }
  }
}
for (const relative of ['machine-digest.html','daily-brain-brief.html','downloads/machine-digest.md','downloads/daily-brain-brief.md']) scrubText(relative);

const residual = [];
for (const base of roots) {
  for (const relative of ['data/entity-observations.json','data/daily-brain-brief.json','machine-digest.html','daily-brain-brief.html','downloads/machine-digest.md','downloads/daily-brain-brief.md']) {
    const file = path.join(base, relative);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
    if (fs.readFileSync(file, 'utf8').includes('[object Object]')) residual.push(display(file));
  }
}
const report = {
  ok: residual.length === 0,
  generatedAt: new Date().toISOString(),
  runnerPatched: runner !== beforeRunner,
  roots: roots.map(value => path.relative(root, value) || '.'),
  touched: [...new Set(touched)],
  residual,
  boundary: 'Object-valued upstream fields are converted into meaningful labels when available. Unresolvable object placeholders are excluded rather than published as entity names.'
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'machine-feed-object-name-patch.json'), `${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) throw new Error(`Machine feed object placeholders remain: ${residual.join(', ')}`);
console.log(`Machine feed object-name normalization ${report.runnerPatched ? 'installed' : 'already current'}; ${report.touched.length} source/output file(s) sanitized.`);
