const fs = require('fs');
const path = require('path');

const root = process.cwd();
const outputOnly = process.argv.includes('--output');
const bases = outputOnly
  ? (fs.existsSync(path.join(root, '_site')) ? [path.join(root, '_site')] : [])
  : [root, ...(fs.existsSync(path.join(root, '_site')) ? [path.join(root, '_site')] : [])];
const utilityIds = ['evidence-badge-system-route', 'source-document-vault-route', 'reader-usefulness-route', 'figure-source-status'];
const targets = ['black-file.html', 'black-file'];
const changed = [];
const renamed = [];
const failures = [];

function isUtilityId(id) {
  return utilityIds.some(baseId => id === baseId || id.startsWith(`${baseId}--`));
}
function resolveUtilityIdCollisions(html, fileLabel) {
  const seen = new Map();
  return html.replace(/\bid\s*=\s*(["'])([^"']+)\1/gi, (full, quote, id) => {
    if (!isUtilityId(id)) return full;
    const count = (seen.get(id) || 0) + 1;
    seen.set(id, count);
    if (count === 1) return full;
    let candidate = `${id}--dedup-${count}`;
    let suffix = count;
    while (seen.has(candidate) || new RegExp(`\\bid\\s*=\\s*(["'])${candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\1`, 'i').test(html)) {
      suffix += 1;
      candidate = `${id}--dedup-${suffix}`;
    }
    seen.set(candidate, 1);
    renamed.push({ file: fileLabel, from: id, to: candidate });
    return `id=${quote}${candidate}${quote}`;
  });
}
function duplicateUtilityIds(html) {
  const ids = [...html.matchAll(/\bid\s*=\s*(["'])([^"']+)\1/gi)].map(match => match[2]).filter(isUtilityId);
  return [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
}

for (const base of bases) {
  for (const relative of targets) {
    const file = path.join(base, relative);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
    const before = fs.readFileSync(file, 'utf8');
    const label = path.relative(root, file).replace(/\\/g, '/');
    const html = resolveUtilityIdCollisions(before, label);
    if (html !== before) {
      fs.writeFileSync(file, html);
      changed.push(label);
    }
    const duplicates = duplicateUtilityIds(html);
    if (duplicates.length) failures.push(`${label} retains duplicate utility IDs: ${duplicates.join(', ')}`);
  }
}

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  mode: outputOnly ? 'cloudflare-output' : 'source-and-output',
  changed: [...new Set(changed)],
  renamed,
  utilityIds,
  failures,
  boundary: 'Generated utility content is preserved. Only later duplicate ID attributes within the four protected utility namespaces are renamed.'
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', outputOnly ? 'public-utility-dedupe-output.json' : 'public-utility-dedupe.json'), `${JSON.stringify(report, null, 2)}\n`);
if (failures.length) {
  failures.forEach(item => console.error(`PUBLIC UTILITY DEDUPE FAILURE: ${item}`));
  process.exit(1);
}
console.log(`Public utility ID collisions resolved (${report.mode}): ${report.renamed.length} ID(s) renamed across ${report.changed.length} file(s).`);
