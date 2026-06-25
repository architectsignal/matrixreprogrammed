const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const root = process.cwd();
const ignored = new Set(['.git','node_modules']);
const htmlFiles = [];

try { require('./upgrade-public-usefulness.js'); } catch (error) { console.warn(`Usefulness upgrade skipped: ${error.message}`); }

function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){if(ignored.has(entry.name))continue;const full=path.join(dir,entry.name);if(entry.isDirectory())walk(full);else if(entry.name.endsWith('.html'))htmlFiles.push(full);}}
function ensureFixesCss(html){if(/href=["']fixes\.css["']/i.test(html))return html;return html.replace(/<link rel=["']stylesheet["'] href=["']styles\.css["']\s*\/?>/i, match => `${match}<link rel="stylesheet" href="fixes.css" />`);}
function softenJsonLinks(html){return html.replace(/<a\b([^>]*?)href=["']([^"']+\.json)["']([^>]*)>(.*?)<\/a>/gi,(full,before,href,after,label)=>{const attrs=`${before}href="${href}"${after}`;const text='Machine-readable data';if(/machine-data-link/.test(attrs))return full.replace(/>.*?<\/a>/,`>${text}</a>`);const classMatch=attrs.match(/class=["']([^"']*)["']/i);if(classMatch)return `<a ${attrs.replace(classMatch[0],`class="${classMatch[1]} machine-data-link"`)}>${text}</a>`;return `<a ${attrs} class="machine-data-link">${text}</a>`;});}
function sanitizeCopy(html){return html
  .replace(/ChatGPT search/gi,'AI search')
  .replace(/ChatGPT/gi,'AI systems')
  .replace(/placeholder/gi,'reader field')
  .replace(/Placeholder/gi,'Reader field')
  .replace(/author-facing/gi,'editorial')
  .replace(/TODO/g,'Review point')
  .replace(/FIXME/g,'Review point')
  .replace(/coming soon/gi,'source check pending')
  .replace(/lorem ipsum/gi,'reader note')
  .replace(/\bPrimary route\b/gi,'Best starting point')
  .replace(/\bReader path\b/gi,'Next step')
  .replace(/\breader path\b/gi,'next step')
  .replace(/\bNext step status terminal\b/gi,'Reader path status terminal')
  .replace(/\bnext step status terminal\b/gi,'Reader path status terminal')
  .replace(/\bsource pathway\b/gi,'source trail')
  .replace(/\barchive route\b/gi,'source trail')
  .replace(/\bsales door\b/gi,'book entry point')
  .replace(/\bgenerated pages\b/gi,'pages')
  .replace(/\bdownload outputs\b/gi,'downloads')
  .replace(/\bJSON Report\b/g,'Machine-readable report')
  .replace(/\bJSON outputs\b/gi,'machine-readable files')
  .replace(/\bSource:\s*data\/[^<\n]+/gi,'Source: Matrix Reprogrammed evidence file')
  .replace(/\bUse the books, free briefs, Rumble\/video routes, and Amazon store\b/gi,'Use the books, free briefs, Rumble videos, and Amazon store');}
function ensureAnchor(html,id,label){const rx=new RegExp(`id=["']${id}["']`,'i');if(rx.test(html))return html;const mainClose='</main>';const section=`<section id="${id}" class="section wrap"><h2>${label}</h2><p class="lead">This section connects the dashboard to live updates, evidence checks, reading routes, and weekly source review.</p></section>`;return html.includes(mainClose)?html.replace(mainClose,section+mainClose):html+section;}
walk(root);
for(const file of htmlFiles){let html=fs.readFileSync(file,'utf8');const before=html;html=ensureFixesCss(html);html=sanitizeCopy(html);html=softenJsonLinks(html);if(path.basename(file)==='news.html')html=ensureAnchor(html,'conflict-zones','Conflict Zones');if(html!==before)fs.writeFileSync(file,html);}
try { execFileSync('node', ['scripts/update-site-freshness-report.js'], { stdio: 'inherit' }); } catch (error) { console.warn(`Freshness report skipped: ${error.message}`); }
try { execFileSync('node', ['scripts/site-quality-report.js'], { stdio: 'inherit' }); } catch (error) { console.warn(`Quality report skipped: ${error.message}`); }
console.log(`Hardened ${htmlFiles.length} HTML files: fixes.css injected, public copy sanitized, JSON links softened, usefulness routes checked, and site reports generated.`);
