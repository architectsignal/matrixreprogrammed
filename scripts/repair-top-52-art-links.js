const fs = require('fs');
const path = require('path');

const root = process.cwd();
let files = 0;
let links = 0;

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) out.push(...walk(full));
    else if (name.endsWith('.html')) out.push(full);
  }
  return out;
}

function replacementFor(target) {
  if (target.startsWith('../../top-52/')) return '../../top-52-power-deck.html';
  if (target.startsWith('../top-52/')) return '../top-52-power-deck.html';
  if (target.startsWith('top-52/')) return 'top-52-power-deck.html';
  return target;
}

for (const file of walk(root)) {
  let html = fs.readFileSync(file, 'utf8');
  const before = html;
  html = html.replace(/href=(['"])(\.\.\/\.\.\/top-52\/[^'"]+|\.\.\/top-52\/[^'"]+|top-52\/[^'"]+)\1/g, (m, q, target) => {
    const fixed = replacementFor(target);
    if (fixed !== target) links += 1;
    return `href=${q}${fixed}${q}`;
  });
  if (html !== before) {
    fs.writeFileSync(file, html);
    files += 1;
  }
}

console.log(`Top 52 art link repair complete: ${files} file(s), ${links} link(s) fixed.`);
