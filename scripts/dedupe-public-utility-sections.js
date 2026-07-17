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
const failures = [];

function esc(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function findBlocks(html, baseId) {
  const rx = new RegExp(`<section\\b[^>]*\\bid=(["'])${esc(baseId)}(?:--duplicate-\\d+)*\\1[^>]*>[\\s\\S]*?<\\/section>`, 'gi');
  return [...html.matchAll(rx)].map(match => ({ text: match[0], index: match.index || 0 }));
}
function normalizeBlock(block, baseId) {
  return block.replace(new RegExp(`\\bid=(["'])${esc(baseId)}(?:--duplicate-\\d+)*\\1`, 'i'), `id="${baseId}"`);
}
function dedupe(html, baseId) {
  const blocks = findBlocks(html, baseId);
  if (blocks.length <= 1) return blocks.length === 1 ? html.replace(blocks[0].text, normalizeBlock(blocks[0].text, baseId)) : html;
  const exact = blocks.find(block => new RegExp(`\\bid=(["'])${esc(baseId)}\\1`, 'i').test(block.text)) || blocks[0];
  const keep = normalizeBlock(exact.text, baseId);
  let inserted = false;
  const rx = new RegExp(`<section\\b[^>]*\\bid=(["'])${esc(baseId)}(?:--duplicate-\\d+)*\\1[^>]*>[\\s\\S]*?<\\/section>`, 'gi');
  return html.replace(rx, () => {
    if (inserted) return '';
    inserted = true;
    return keep;
  });
}

for (const base of bases) {
  for (const relative of targets) {
    const file = path.join(base, relative);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
    const before = fs.readFileSync(file, 'utf8');
    let html = before;
    for (const id of utilityIds) html = dedupe(html, id);
    if (html !== before) {
      fs.writeFileSync(file, html);
      changed.push(path.relative(root, file).replace(/\\/g, '/'));
    }
    const ids = [...html.matchAll(/\bid\s*=\s*(["'])([^"']+)\1/gi)].map(match => match[2]);
    const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))].filter(id => utilityIds.some(baseId => id === baseId || id.startsWith(`${baseId}--duplicate-`)));
    if (duplicates.length) failures.push(`${path.relative(root, file)} retains duplicate utility IDs: ${duplicates.join(', ')}`);
    for (const id of utilityIds) {
      const count = findBlocks(html, id).length;
      if (count > 1) failures.push(`${path.relative(root, file)} retains ${count} ${id} sections`);
    }
  }
}

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  mode: outputOnly ? 'cloudflare-output' : 'source-and-output',
  changed: [...new Set(changed)],
  utilityIds,
  failures
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', outputOnly ? 'public-utility-dedupe-output.json' : 'public-utility-dedupe.json'), `${JSON.stringify(report, null, 2)}\n`);
if (failures.length) {
  failures.forEach(item => console.error(`PUBLIC UTILITY DEDUPE FAILURE: ${item}`));
  process.exit(1);
}
console.log(`Public utility sections deduplicated (${report.mode}): ${report.changed.length} file(s) changed.`);
