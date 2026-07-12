const fs=require('fs');
const path=require('path');
const root=process.cwd();
const blocked=new Set(['.git','.github','node_modules','_site','evidence-archive','browsertrix-output','tools']);
const report={generatedAt:new Date().toISOString(),filesChanged:0,duplicateIdsRenamed:0,brokenLinksFixed:0,outdatedUrlsFixed:0,changes:[]};
function walk(dir){const out=[];if(!fs.existsSync(dir))return out;for(const entry of fs.readdirSync(dir,{withFileTypes:true})){if(blocked.has(entry.name))continue;const full=path.join(dir,entry.name);if(entry.isDirectory())out.push(...walk(full));else if(entry.name.endsWith('.html'))out.push(full)}return out}
const replacements=new Map([
  ['href="forum-health"','href="forum.html"'],
  ["href='forum-health'","href='forum.html'"],
  ['https://www.who.int/about/policies/publishing/logos-and-use','https://www.who.int/about/policies/publishing/copyright'],
  ['https://www.un.org/en/about-us/un-logo-and-flag','https://www.un.org/en/about-us/un-emblem-and-flag'],
  ['https://www.bis.org/topic/cbdc.htm','https://www.bis.org/topics/cbdc.htm']
]);
for(const file of walk(root)){
  const before=fs.readFileSync(file,'utf8');
  let html=before;
  for(const [oldValue,newValue] of replacements){if(html.includes(oldValue)){const count=html.split(oldValue).length-1;html=html.split(oldValue).join(newValue);if(oldValue.includes('forum-health'))report.brokenLinksFixed+=count;else report.outdatedUrlsFixed+=count}}
  const seen=new Map();
  html=html.replace(/\bid\s*=\s*(["'])([^"']+)\1/gi,(match,quote,id)=>{const count=seen.get(id)||0;seen.set(id,count+1);if(count===0)return match;report.duplicateIdsRenamed++;return `id=${quote}${id}--duplicate-${count+1}${quote}`});
  if(html!==before){fs.writeFileSync(file,html);report.filesChanged++;report.changes.push(path.relative(root,file).replace(/\\/g,'/'))}
}
fs.mkdirSync(path.join(root,'downloads'),{recursive:true});
fs.writeFileSync(path.join(root,'downloads','public-site-error-repair.json'),JSON.stringify(report,null,2));
console.log(`Public site error repair complete: ${report.filesChanged} file(s), ${report.duplicateIdsRenamed} duplicate id(s), ${report.brokenLinksFixed} broken link(s), ${report.outdatedUrlsFixed} outdated URL(s).`);
