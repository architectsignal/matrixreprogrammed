const fs = require('fs');
const path = require('path');

const root = process.cwd();
const reportPath = path.join(root, 'downloads', 'canonical-external-source-repair.json');
const replacements = new Map([
  ['https://www.bis.org/topic/cbdc.htm', 'https://www.bis.org/about/bisih/topics/cbdc.htm'],
  ['https://search.worldbank.org/api/v2/projects', 'https://projects.worldbank.org/en/projects-operations/project-search'],
  ['https://efile.fara.gov/ords/fara/f?p=1381:1', 'https://efile.fara.gov/search'],
  ['https://cde.ucr.cjis.gov/', 'https://cde.ucr.cjis.gov/LATEST/'],
  ['https://www.bmi.gv.at/508/Statistiken/', 'https://www.bmi.gv.at/downloads/start.html']
]);
const skippedDirs = new Set(['.git', 'node_modules', '.wrangler', 'browsertrix-output', 'downloads']);
const binaryExtensions = new Set(['.png','.jpg','.jpeg','.gif','.webp','.ico','.pdf','.zip','.gz','.woff','.woff2','.ttf','.eot','.mp3','.mp4','.mov','.avi','.sqlite','.db']);
const changed = [];
const replacementCounts = Object.fromEntries([...replacements].map(([from, to]) => [from, { to, count: 0 }]));

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && skippedDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}
function display(file) { return path.relative(root, file).replace(/\\/g, '/'); }
function isTextCandidate(file) {
  if (display(file) === 'scripts/repair-canonical-external-sources.js') return false;
  if (binaryExtensions.has(path.extname(file).toLowerCase())) return false;
  const stat = fs.statSync(file);
  return stat.size <= 20 * 1024 * 1024;
}
function readText(file) {
  const buffer = fs.readFileSync(file);
  if (buffer.includes(0)) return null;
  return buffer.toString('utf8');
}

const files = walk(root).filter(isTextCandidate);
for (const file of files) {
  const before = readText(file);
  if (before === null) continue;
  let after = before;
  for (const [from, to] of replacements) {
    const count = after.split(from).length - 1;
    if (!count) continue;
    after = after.split(from).join(to);
    replacementCounts[from].count += count;
  }
  if (after !== before) {
    fs.writeFileSync(file, after);
    changed.push(display(file));
  }
}

const residual = [];
for (const file of files) {
  const text = readText(file);
  if (text === null) continue;
  for (const from of replacements.keys()) if (text.includes(from)) residual.push({ file: display(file), url: from });
}
const canonicalPresent = Object.values(replacementCounts).every(item => item.count > 0 || files.some(file => {
  const text = readText(file);
  return text !== null && text.includes(item.to);
}));
const ok = residual.length === 0 && canonicalPresent;
const report = {
  ok,
  generatedAt: new Date().toISOString(),
  changed: [...new Set(changed)],
  replacements: replacementCounts,
  residual,
  sources: {
    bis: 'BIS Innovation Hub CBDC topic',
    worldBank: 'World Bank Projects & Operations advanced search',
    fara: 'FARA public filing search',
    fbi: 'FBI Crime Data Explorer current application root',
    austria: 'Austrian Interior Ministry downloads and statistics landing page'
  }
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (!ok) throw new Error(`Canonical external source repair failed: ${JSON.stringify({ residual, replacementCounts })}`);
console.log(`Canonical external source repair passed: ${changed.length} file(s) changed; ${Object.values(replacementCounts).reduce((sum, item) => sum + item.count, 0)} stale reference(s) replaced.`);
