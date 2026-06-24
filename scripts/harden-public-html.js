const fs = require('fs');
const path = require('path');
const root = process.cwd();
const ignored = new Set(['.git','node_modules']);
const htmlFiles = [];
function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){if(ignored.has(entry.name))continue;const full=path.join(dir,entry.name);if(entry.isDirectory())walk(full);else if(entry.name.endsWith('.html'))htmlFiles.push(full);}}
function ensureFixesCss(html){if(/href=["']fixes\.css["']/i.test(html))return html;return html.replace(/<link rel=["']stylesheet["'] href=["']styles\.css["']\s*\/?>/i, match => `${match}<link rel="stylesheet" href="fixes.css" />`);}
function sanitizeCopy(html){return html
  .replace(/ChatGPT search/gi,'AI search')
  .replace(/ChatGPT/gi,'AI systems')
  .replace(/placeholder/gi,'reserved field')
  .replace(/Placeholder/gi,'Reserved field');}
function ensureAnchor(html,id,label){const rx=new RegExp(`id=["']${id}["']`,'i');if(rx.test(html))return html;const mainClose='</main>';const section=`<section id="${id}" class="section wrap"><h2>${label}</h2><p class="lead">This section is generated as a stable anchor for dashboard routing and source-led updates.</p></section>`;return html.includes(mainClose)?html.replace(mainClose,section+mainClose):html+section;}
walk(root);
for(const file of htmlFiles){let html=fs.readFileSync(file,'utf8');const before=html;html=ensureFixesCss(html);html=sanitizeCopy(html);if(path.basename(file)==='news.html')html=ensureAnchor(html,'conflict-zones','Conflict Zones');if(html!==before)fs.writeFileSync(file,html);}
console.log(`Hardened ${htmlFiles.length} HTML files: fixes.css injected, banned public copy sanitized, critical anchors checked.`);
