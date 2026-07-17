const fs = require('fs');
const path = require('path');

const root = process.cwd();
const targets = ['deploy-health.html', 'entity-registry.html', 'relationship-registry.html', 'site-population-audit.html', 'source-changes.html'];
const changed = [];
const checked = [];

function patchFile(file) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return;
  let html = fs.readFileSync(file, 'utf8');
  const before = html;
  if (!/(?:src=["'])matrix\.js(?:["'])/i.test(html)) {
    html = /<\/body>/i.test(html)
      ? html.replace(/<\/body>/i, '<script src="matrix.js"></script></body>')
      : `${html}\n<script src="matrix.js"></script>\n`;
  }
  if (html !== before) {
    fs.writeFileSync(file, html);
    changed.push(path.relative(root, file).replace(/\\/g, '/'));
  }
  checked.push({ file: path.relative(root, file).replace(/\\/g, '/'), matrixRuntime: html.includes('src="matrix.js"') || html.includes("src='matrix.js'") });
}

for (const base of [root, path.join(root, '_site')]) {
  if (!fs.existsSync(base)) continue;
  for (const target of targets) {
    patchFile(path.join(base, target));
    if (base.endsWith(`${path.sep}_site`)) patchFile(path.join(base, target.replace(/\.html$/i, '')));
  }
}

const ok = checked.length > 0 && checked.every(item => item.matrixRuntime);
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'late-generated-shared-runtime-patch.json'), `${JSON.stringify({
  ok,
  generatedAt: new Date().toISOString(),
  changed,
  checked,
  boundary: 'Restores the shared matrix.js runtime only on the five late-generated pages previously identified by the link audit. Page content and data are unchanged.'
}, null, 2)}\n`);
if (!ok) throw new Error(`Late generated shared runtime patch failed: ${JSON.stringify(checked)}`);
console.log(`Late generated shared runtime verified on ${checked.length} source/output route(s); ${changed.length} patched.`);
