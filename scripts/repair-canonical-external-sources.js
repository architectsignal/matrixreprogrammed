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
function replaceSafely(text) {
  let next = text;
  const protectedValues = [];
  let index = 0;
  for (const to of replacements.values()) {
    const token = `__MATRIX_CANONICAL_SOURCE_${index++}__`;
    if (next.includes(to)) {
      next = next.split(to).join(token);
      protectedValues.push([token, to]);
    }
  }
  for (const [from, to] of replacements) {
    const count = next.split(from).length - 1;
    if (!count) continue;
    next = next.split(from).join(to);
    replacementCounts[from].count += count;
  }
  for (const [token, to] of protectedValues) next = next.split(token).join(to);
  return next;
}

const files = walk(root).filter(isTextCandidate);
for (const file of files) {
  const before = readText(file);
  if (before === null) continue;
  const after = replaceSafely(before);
  if (after !== before) {
    fs.writeFileSync(file, after);
    changed.push(display(file));
  }
}

const residual = [];
const canonicalSeen = new Set();
for (const file of files) {
  const text = readText(file);
  if (text === null) continue;
  for (const [from, to] of replacements) {
    if (text.includes(from) && !text.includes(to)) residual.push({ file: display(file), url: from });
    if (text.includes(to)) canonicalSeen.add(to);
  }
}
const canonicalPresent = [...replacements.values()].every(to => canonicalSeen.has(to));
const ok = residual.length === 0 && canonicalPresent;
const report = {
  ok,
  generatedAt: new Date().toISOString(),
  changed: [...new Set(changed)],
  replacements: replacementCounts,
  residual,
  canonicalPresent: [...canonicalSeen],
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
if (!ok) throw new Error(`Canonical external source repair failed: ${JSON.stringify({ residual, canonicalSeen: [...canonicalSeen] })}`);
console.log(`Canonical external source repair passed: ${changed.length} file(s) changed; ${Object.values(replacementCounts).reduce((sum, item) => sum + item.count, 0)} stale reference(s) replaced.`);
