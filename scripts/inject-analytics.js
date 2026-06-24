const fs = require('fs');
const path = require('path');

const root = process.cwd();
const ignoredDirs = new Set(['.git', 'node_modules']);
const scriptTag = '<script src="analytics.js"></script>';
let updated = 0;
let hardened = 0;

function walk(dir){
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoredDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.html')) processHtml(full);
  }
}

function ensureFixesCss(html){
  if (/href=["']fixes\.css["']/i.test(html)) return html;
  return html.replace(/<link rel=["']stylesheet["'] href=["']styles\.css["']\s*\/?>/i, m => `${m}<link rel="stylesheet" href="fixes.css" />`);
}

function sanitizeCopy(html){
  return html
    .replace(/ChatGPT search/gi, 'AI search')
    .replace(/ChatGPT/gi, 'AI systems')
    .replace(/placeholder/gi, 'reserved field')
    .replace(/Placeholder/gi, 'Reserved field');
}

function ensureAnchor(html, id, label){
  const rx = new RegExp(`id=["']${id}["']`, 'i');
  if (rx.test(html)) return html;
  const section = `<section id="${id}" class="section wrap"><h2>${label}</h2><p class="lead">Stable dashboard anchor for source-led updates.</p></section>`;
  return html.includes('</main>') ? html.replace('</main>', `${section}</main>`) : `${html}${section}`;
}

function processHtml(file){
  let html = fs.readFileSync(file, 'utf8');
  const before = html;
  html = ensureFixesCss(html);
  html = sanitizeCopy(html);
  if (path.basename(file) === 'news.html') html = ensureAnchor(html, 'conflict-zones', 'Conflict Zones');
  if (!html.includes(scriptTag) && html.includes('</body>')) {
    html = html.replace('</body>', `${scriptTag}</body>`);
    updated += 1;
  }
  if (html !== before) {
    fs.writeFileSync(file, html);
    hardened += 1;
  }
}

walk(root);
console.log(`Analytics injection complete. Updated ${updated} HTML file(s). Hardened ${hardened} HTML file(s).`);
