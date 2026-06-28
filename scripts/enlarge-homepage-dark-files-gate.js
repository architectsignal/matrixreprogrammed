const fs = require('fs');
const path = require('path');
const root = process.cwd();
const homepage = path.join(root, 'index.html');
if (!fs.existsSync(homepage)) {
  console.log('Homepage Dark Files gate enhancer skipped: index.html missing.');
  process.exit(0);
}
let html = fs.readFileSync(homepage, 'utf8');
html = html.replace(/\s*<div id=["']all-seeing-eye-gate["'][\s\S]*?<\/div>/gi, '');
const gate = `
<div id="all-seeing-eye-gate" aria-label="Dark Files gate" style="margin:42px auto 0;text-align:center;opacity:.9;letter-spacing:.16em;">
  <a href="dark-speculation-lab.html" aria-label="Open Dark Files" title="Dark Files" style="display:inline-flex;align-items:center;justify-content:center;width:118px;height:118px;border:1px solid rgba(255,255,255,.18);border-radius:50%;text-decoration:none;font-size:76px;line-height:1;color:inherit;background:radial-gradient(circle,rgba(255,255,255,.08),rgba(255,255,255,.015) 58%,transparent 70%);box-shadow:0 0 28px rgba(255,255,255,.08),inset 0 0 22px rgba(255,255,255,.04);filter:drop-shadow(0 0 18px rgba(255,255,255,.22));">𓂀</a>
  <div style="margin-top:10px;font-size:10px;text-transform:uppercase;letter-spacing:.34em;opacity:.62;">Dark Files</div>
</div>`;
if (html.includes('</footer>')) html = html.replace('</footer>', `${gate}</footer>`);
else html += gate;
fs.writeFileSync(homepage, html);
console.log('Homepage Dark Files gate enlarged.');
