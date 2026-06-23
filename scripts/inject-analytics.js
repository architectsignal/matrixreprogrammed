const fs = require('fs');
const path = require('path');

const root = process.cwd();
const ignoredDirs = new Set(['.git', 'node_modules']);
const scriptTag = '<script src="analytics.js"></script>';
let updated = 0;

function walk(dir){
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoredDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.html')) inject(full);
  }
}

function inject(file){
  let html = fs.readFileSync(file, 'utf8');
  if (html.includes(scriptTag)) return;
  if (!html.includes('</body>')) return;
  html = html.replace('</body>', `${scriptTag}</body>`);
  fs.writeFileSync(file, html);
  updated += 1;
}

walk(root);
console.log(`Analytics injection complete. Updated ${updated} HTML file(s).`);
