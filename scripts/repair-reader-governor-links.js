const fs = require('fs');
const path = require('path');
const root = process.cwd();
const ignored = new Set(['.git','node_modules']);
let touched = 0;
let fixes = 0;
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && entry.name.endsWith('.html') && !full.includes(`${path.sep}_site${path.sep}`)) out.push(full);
  }
  return out;
}
for (const file of walk(root)) {
  let html = fs.readFileSync(file, 'utf8');
  const before = html;
  html = html.replace(/href="([^"]*)protected-claim-source-links\.html"/g, (m, prefix) => {
    fixes += 1;
    return `href="${prefix}evidence-vault.html"`;
  });
  html = html.replace(/href="([^"]*)source-review-links\.html"/g, (m, prefix) => {
    fixes += 1;
    return `href="${prefix}evidence-vault.html"`;
  });
  if (html !== before) {
    fs.writeFileSync(file, html);
    touched += 1;
  }
}
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'reader-governor-link-repair.json'), JSON.stringify({ ok: true, touched, fixes, target: 'evidence-vault.html', generatedAt: new Date().toISOString() }, null, 2));
console.log(`Reader governor link repair complete: ${touched} file(s), ${fixes} link(s).`);
