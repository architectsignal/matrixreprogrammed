const fs=require('fs');
const path=require('path');
const root=process.cwd();
const fp=p=>path.join(root,p);
const wr=(p,v)=>{fs.mkdirSync(path.dirname(fp(p)),{recursive:true});fs.writeFileSync(fp(p),v)};
const walk=(dir,files=[])=>{for(const name of fs.readdirSync(dir)){if(['.git','node_modules','.wrangler','dist','build'].includes(name))continue;const full=path.join(dir,name);const st=fs.statSync(full);if(st.isDirectory())walk(full,files);else files.push(full)}return files};
const rel=p=>path.relative(root,p).replace(/\\/g,'/');
function visibleText(html){return html.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<template[\s\S]*?<\/template>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()}
const publicFiles=walk(root).filter(p=>/\.(html|md|json)$/i.test(p)).filter(p=>!rel(p).startsWith('node_modules/'));
const severePatterns=[/\[object Object\]/i,/lorem ipsum/i,/as an ai language model/i,/chatgpt/i,/author note/i,/internal note/i,/source-facing/i,/do not show/i,/debug only/i,/undefined\s*undefined/i,/NaN/i];
const softPatterns=[/TODO/i,/FIXME/i,/placeholder/i,/compatibility marker/i,/test marker/i,/dummy/i,/sample text/i];
const issues=[];
for(const file of publicFiles){const r=rel(file);let raw='';try{raw=fs.readFileSync(file,'utf8')}catch{continue}const body=r.endsWith('.html')?visibleText(raw):raw;for(const pattern of severePatterns){if(pattern.test(body))issues.push({severity:'high',file:r,pattern:String(pattern),note:'Potentially visible internal, broken, or author-facing text.'})}for(const pattern of softPatterns){if(pattern.test(body))issues.push({severity:'review',file:r,pattern:String(pattern),note:'Review whether this text is intentionally visible.'})}}
const htmlFiles=walk(root).filter(p=>/\.html$/i.test(p));
const intake=[];
for(const file of htmlFiles){const r=rel(file);let raw='';try{raw=fs.readFileSync(file,'utf8')}catch{continue}const lower=raw.toLowerCase();const hasForm=/<form\b/i.test(raw)||/<input\b/i.test(raw)||/<textarea\b/i.test(raw)||/card-intel-forum|forum-post|submit|source lead|correction/i.test(raw);if(!hasForm)continue;const text=visibleText(raw).toLowerCase();const hasBoundary=/boundary|evidence|source|review|privacy|submission|correction|lead/.test(text);const hasAction=/submit|send|search|upload|post|review|open/.test(text);const hasFallback=/manifest unavailable|unavailable|try again|reviewed|lead|correction|source/.test(text);intake.push({file:r,hasBoundary,hasAction,hasFallback,status:hasBoundary&&hasAction?'ok':'review'})}
const summary={ok:issues.filter(i=>i.severity==='high').length===0,intakeOk:intake.every(i=>i.status==='ok'),updated:new Date().toISOString(),filesScanned:publicFiles.length,highIssues:issues.filter(i=>i.severity==='high').length,reviewIssues:issues.filter(i=>i.severity==='review').length,intakeAreas:intake.length,weakIntakeAreas:intake.filter(i=>i.status!=='ok').length};
const report={title:'Site Public Copy And Intake Audit',summary,issues:issues.slice(0,500),intake};
wr('data/site-public-copy-intake-audit.json',JSON.stringify(report,null,2));
wr('downloads/site-public-copy-intake-audit.md','# Site Public Copy And Intake Audit\n\nUpdated: '+summary.updated+'\n\nFiles scanned: '+summary.filesScanned+'\n\nHigh issues: '+summary.highIssues+'\n\nReview issues: '+summary.reviewIssues+'\n\nIntake areas: '+summary.intakeAreas+'\n\nWeak intake areas: '+summary.weakIntakeAreas+'\n\n## High Issues\n'+(report.issues.filter(i=>i.severity==='high').map(i=>`- ${i.file}: ${i.pattern} — ${i.note}`).join('\n')||'None')+'\n\n## Intake Areas To Review\n'+(intake.filter(i=>i.status!=='ok').map(i=>`- ${i.file}: boundary=${i.hasBoundary}, action=${i.hasAction}, fallback=${i.hasFallback}`).join('\n')||'None'));
console.log(`Public copy/intake audit complete: ${summary.highIssues} high issue(s), ${summary.weakIntakeAreas} weak intake area(s).`);
