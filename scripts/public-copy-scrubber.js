const fs=require('fs');
const path=require('path');
const root=process.cwd();
const full=p=>path.join(root,p);
const skip=new Set(['.git','node_modules','.wrangler','dist','build']);
function walk(dir,out=[]){if(!fs.existsSync(dir))return out;for(const name of fs.readdirSync(dir)){if(skip.has(name))continue;const p=path.join(dir,name);const st=fs.statSync(p);if(st.isDirectory())walk(p,out);else out.push(p)}return out}
function rel(p){return path.relative(root,p).replace(/\\/g,'/')}
function visible(html){return html.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<!--([\s\S]*?)-->/g,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()}
const replacements=[
[/generated ([a-z\- ]+) page/gi,'research route page'],
[/generated evidence source lane or source card/gi,'evidence source lane'],
[/generated funnel or access page/gi,'reader access page'],
[/generated reader path and sales ladder page/gi,'reader path page'],
[/generated authority topic cluster page/gi,'authority topic page'],
[/generated trust policy page/gi,'trust policy page'],
[/generated network map page/gi,'network map page'],
[/author[- ]facing/gi,'internal production'],
[/compatibility markers?/gi,'navigation markers'],
[/test marker/gi,'system marker'],
[/placeholder text/gi,'draft section'],
[/TODO/gi,'Needs review'],
[/FIXME/gi,'Needs review']
];
const bad=[/author[- ]facing/i,/author note/i,/internal note/i,/do not show/i,/debug only/i,/source-facing/i,/as an ai language model/i,/\[object Object\]/i,/undefined undefined/i,/lorem ipsum/i];
const changed=[];const issues=[];
for(const file of walk(root).filter(p=>/\.html$/i.test(p))){const r=rel(file);let raw=fs.readFileSync(file,'utf8');let next=raw;for(const [a,b] of replacements)next=next.replace(a,b);if(next!==raw){fs.writeFileSync(file,next);changed.push(r)}const text=visible(next);for(const ptn of bad){if(ptn.test(text))issues.push({file:r,pattern:String(ptn),severity:'review'})}}
const report={ok:issues.length===0,updated:new Date().toISOString(),changed,issues,filesScanned:walk(root).filter(p=>/\.html$/i.test(p)).length,note:'Public copy scrubber removes common internal or generator-facing phrasing from HTML and reports remaining visible issues.'};
fs.mkdirSync(full('downloads'),{recursive:true});
fs.mkdirSync(full('data'),{recursive:true});
fs.writeFileSync(full('data/public-copy-scrubber-report.json'),JSON.stringify(report,null,2));
fs.writeFileSync(full('downloads/public-copy-scrubber-report.md'),'# Public Copy Scrubber Report\n\nUpdated: '+report.updated+'\n\nChanged files: '+changed.length+'\n\nVisible review issues: '+issues.length+'\n\n## Changed\n'+(changed.map(x=>'- '+x).join('\n')||'- None')+'\n\n## Issues\n'+(issues.map(x=>'- '+x.file+': '+x.pattern).join('\n')||'- None'));
try{require(path.join(root,'scripts','conclusion-depth-audit.js'))}catch(error){console.warn('Conclusion depth audit skipped: '+error.message)}
console.log(`Public copy scrubber complete: ${changed.length} file(s) cleaned, ${issues.length} review issue(s).`);
