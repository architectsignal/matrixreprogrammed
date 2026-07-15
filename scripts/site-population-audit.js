const fs=require('fs');
const path=require('path');
const root=process.cwd();
const timerSanitizer=path.join(root,'scripts','sanitize-timer-source-links.js');
if(fs.existsSync(path.join(root,'timers.html'))&&fs.existsSync(timerSanitizer))require(timerSanitizer);
const ignore=new Set(['.git','node_modules','_site']);
const workerRoutes=new Set(['forum-health','deploy-status','search','forum-feed-main','forum-feed-speculation','forum-feed-epstein-alive','submit-forum-post','submit-speculation-post','submit-epstein-alive-post']);
function walk(dir,out=[]){for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(ignore.has(e.name))continue;const f=path.join(dir,e.name);if(e.isDirectory())walk(f,out);else if(e.isFile()&&e.name.endsWith('.html'))out.push(f)}return out}
function rel(f){return path.relative(root,f).replace(/\\/g,'/')}
function text(s){return String(s).replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim()}
const files=walk(root);const weak=[];const dead=[];const placeholders=[];const bad=[];
for(const f of files){const h=fs.readFileSync(f,'utf8');const r=rel(f);const t=text(h);const words=t.split(/\s+/).filter(Boolean).length;const links=[...h.matchAll(/href="([^"]+)"/g)].map(m=>m[1]).filter(x=>x&&!x.startsWith('http')&&!x.startsWith('mailto:')&&!x.startsWith('#'));
 if(words<80&&!/thank|redirect|alias|feed|json/i.test(r))weak.push({file:r,words});
 if(links.length<2&&!/thank|redirect|alias|feed|json/i.test(r))dead.push({file:r,links:links.length});
 if(/Not yet recorded|No current item recorded|undefined|null|null\/|TODO|coming soon/i.test(h))placeholders.push({file:r});
 for(const link of links){const clean=link.split('#')[0].split('?')[0];if(!clean||/^\//.test(clean))continue;if(workerRoutes.has(clean))continue;const target=path.normalize(path.join(path.dirname(f),clean));if(!fs.existsSync(target))bad.push({file:r,link})}
}
const report={ok:bad.length===0,updated:new Date().toISOString(),htmlFiles:files.length,weak:weak.slice(0,200),dead:dead.slice(0,200),placeholders:placeholders.slice(0,200),badLinks:bad.slice(0,200),counts:{weak:weak.length,dead:dead.length,placeholders:placeholders.length,badLinks:bad.length}};
fs.mkdirSync(path.join(root,'downloads'),{recursive:true});
fs.writeFileSync(path.join(root,'downloads/site-population-audit.json'),JSON.stringify(report,null,2));
fs.writeFileSync(path.join(root,'site-population-audit.html'),`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Site Population Audit</title><link rel="stylesheet" href="styles.css"></head><body><main class="wrap"><h1>Site Population Audit</h1><p>HTML files: ${report.htmlFiles}</p><p>Weak: ${report.counts.weak} · Dead-end: ${report.counts.dead} · Placeholders: ${report.counts.placeholders} · Bad links: ${report.counts.badLinks}</p><h2>Bad Links</h2><pre>${JSON.stringify(report.badLinks,null,2)}</pre><h2>Weak Pages</h2><pre>${JSON.stringify(report.weak.slice(0,80),null,2)}</pre><h2>Dead Ends</h2><pre>${JSON.stringify(report.dead.slice(0,80),null,2)}</pre><h2>Placeholders</h2><pre>${JSON.stringify(report.placeholders.slice(0,80),null,2)}</pre></main></body></html>`);
if(bad.length){console.error('SITE POPULATION AUDIT FAILED');for(const x of bad.slice(0,40))console.error('- '+x.file+' -> '+x.link);process.exit(1)}
console.log('SITE POPULATION AUDIT PASSED WITH WARNINGS: weak '+weak.length+', dead '+dead.length+', placeholders '+placeholders.length);
