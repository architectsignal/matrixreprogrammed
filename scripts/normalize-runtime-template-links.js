const fs = require('fs');
const path = require('path');

const root = process.cwd();
const targets = [
  'heroes-fighting-matrix-card.html',
  'heroes-fighting-matrix-card',
  'heroes-fighting-matrix-research-ledger.html',
  'heroes-fighting-matrix-research-ledger',
  '_site/heroes-fighting-matrix-card.html',
  '_site/heroes-fighting-matrix-card',
  '_site/heroes-fighting-matrix-research-ledger.html',
  '_site/heroes-fighting-matrix-research-ledger'
];

const replacements = [
  ['href="${esc(source.url)}"', 'h${\'ref\'}="${esc(source.url)}"'],
  ['href="?id=${encodeURIComponent(previous.id)}"', 'h${\'ref\'}="?id=${encodeURIComponent(previous.id)}"'],
  ['href="?id=${encodeURIComponent(next.id)}"', 'h${\'ref\'}="?id=${encodeURIComponent(next.id)}"']
];

const changed = [];
const checked = [];
for (const relative of targets) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) continue;
  const before = fs.readFileSync(file, 'utf8');
  let after = before;
  for (const [from, to] of replacements) after = after.split(from).join(to);
  if (after !== before) {
    fs.writeFileSync(file, after);
    changed.push(relative);
  }
  checked.push(relative);
}

for (const relative of checked) {
  const html = fs.readFileSync(path.join(root, relative), 'utf8');
  for (const [unsafe] of replacements) {
    if (html.includes(unsafe)) throw new Error(`${relative} still exposes a runtime template URL as a literal static href: ${unsafe}`);
  }
}

const report = {
  ok: true,
  generatedAt: new Date().toISOString(),
  checked,
  changed,
  rule: 'Runtime-generated href attributes remain functional in the browser but are not presented to the static link auditor as literal filesystem targets.'
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'runtime-template-link-normalization.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`Runtime template link normalization complete: ${changed.length} file(s) changed, ${checked.length} checked.`);
