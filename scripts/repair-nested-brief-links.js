const fs = require('fs');
const path = require('path');
const root = process.cwd();
const dirs = ['contractor-briefs','billionaire-briefs','institution-briefs','subject-briefs','main-players','entity-timelines','entity-briefs','entity-exposure'];
let touched = 0;
let fixes = 0;
function fixFile(file){
  const depth = path.relative(root, path.dirname(file)).split(path.sep).filter(Boolean).length;
  if (!depth) return;
  const prefix = '../'.repeat(depth);
  let html = fs.readFileSync(file, 'utf8');
  const before = html;
  html = html.replace(/\b(href|src)="(?!https?:|mailto:|tel:|#|\/|\.\.\/|\.\/|data:)([^"]+)"/g, (m, attr, url) => {
    fixes += 1;
    return `${attr}="${prefix}${url}"`;
  });
  if (html !== before) {
    fs.writeFileSync(file, html);
    touched += 1;
  }
}
for (const dir of dirs) {
  const full = path.join(root, dir);
  if (!fs.existsSync(full)) continue;
  for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.html')) fixFile(path.join(full, entry.name));
  }
}
console.log(`Nested brief link repair complete: ${touched} file(s), ${fixes} link(s) checked/fixed.`);
