const fs=require('fs');
const path=require('path');
const root=process.cwd();
const blockedRoot=new Set(['.git','.github','node_modules','_site','evidence-archive','browsertrix-output','tools']);
const report={generatedAt:new Date().toISOString(),filesChanged:0,siteFilesChanged:0,dataFilesChanged:0,duplicateIdsRenamed:0,brokenLinksFixed:0,outdatedUrlsFixed:0,unavailableStoreLinksRemoved:0,changes:[]};
function walk(dir,blocked=new Set()){const out=[];if(!fs.existsSync(dir))return out;for(const entry of fs.readdirSync(dir,{withFileTypes:true})){if(blocked.has(entry.name))continue;const full=path.join(dir,entry.name);if(entry.isDirectory())out.push(...walk(full,blocked));else if(entry.name.endsWith('.html'))out.push(full)}return out}
const verifiedBis='https://www.bis.org/about/bisih/topics/cbdc.htm';
const replacements=new Map([
  ['href="forum-health"','href="/forum-health"'],
  ["href='forum-health'","href='/forum-health'"],
  ['https://www.who.int/about/policies/publishing/logos-and-use','https://www.who.int/about/policies/publishing/copyright'],
  ['https://www.un.org/en/about-us/un-logo-and-flag','https://www.un.org/en/about-us/un-emblem-and-flag'],
  ['https://www.bis.org/about/bisih/topics/cbdc.htm',verifiedBis],
  ['https://www.bis.org/topics/cbdc.htm',verifiedBis]
]);
const unavailableAmazon=[
  {asin:'B0G4HLSLHL',us:'https://www.amazon.com/dp/B0G4HLSLHL',uk:'https://www.amazon.co.uk/dp/B0G4HLSLHL'},
  {asin:'B0GZBQBN1Z',us:'https://www.amazon.com/dp/B0GZBQBN1Z',uk:'https://www.amazon.co.uk/dp/B0GZBQBN1Z'}
];
function escapeRegex(value){return String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}
function patchHtml(file,renameDuplicateIds){const before=fs.readFileSync(file,'utf8');let html=before;for(const [oldValue,newValue] of replacements){if(html.includes(oldValue)){const count=html.split(oldValue).length-1;html=html.split(oldValue).join(newValue);if(oldValue.includes('forum-health'))report.brokenLinksFixed+=count;else report.outdatedUrlsFixed+=count}}
  for(const item of unavailableAmazon){const anchor=new RegExp(`<a\\b[^>]*href=["']${escapeRegex(item.us)}["'][^>]*>[\\s\\S]*?<\\/a>`,'gi');html=html.replace(anchor,()=>{report.unavailableStoreLinksRemoved++;return ''});html=html.split(`,"${item.us}"`).join('');html=html.split(`"${item.us}",`).join('');html=html.split(item.us).join(item.uk)}
  if(renameDuplicateIds){const seen=new Map();html=html.replace(/\bid\s*=\s*(["'])([^"']+)\1/gi,(match,quote,id)=>{const count=seen.get(id)||0;seen.set(id,count+1);if(count===0)return match;report.duplicateIdsRenamed++;return `id=${quote}${id}--duplicate-${count+1}${quote}`})}
  if(html!==before){fs.writeFileSync(file,html);report.filesChanged++;if(file.startsWith(path.join(root,'_site')))report.siteFilesChanged++;report.changes.push(path.relative(root,file).replace(/\\/g,'/'))}}
function patchData(file){if(!fs.existsSync(file))return;const before=fs.readFileSync(file,'utf8');let text=before;for(const [oldValue,newValue] of replacements)text=text.split(oldValue).join(newValue);for(const item of unavailableAmazon){text=text.replace(new RegExp(`"amazon_us"\\s*:\\s*"${escapeRegex(item.us)}"`,'g'),`"amazon_us":null,"amazon_us_status":"unavailable_404_checked_2026-07-15"`);text=text.replace(new RegExp(`"amazonUs"\\s*:\\s*"${escapeRegex(item.us)}"`,'g'),`"amazonUs":null,"amazonUsStatus":"unavailable_404_checked_2026-07-15"`)}if(text!==before){fs.writeFileSync(file,text);report.filesChanged++;report.dataFilesChanged++;report.changes.push(path.relative(root,file).replace(/\\/g,'/'))}}
for(const file of walk(root,blockedRoot))patchHtml(file,true);
for(const file of walk(path.join(root,'_site')))patchHtml(file,true);
for(const rel of ['data/kdp_asin_map.json','data/content-routes.json','data/conclusions-engine-batch-001.json','_site/data/kdp_asin_map.json','_site/data/content-routes.json','_site/data/conclusions-engine-batch-001.json'])patchData(path.join(root,rel));
fs.mkdirSync(path.join(root,'downloads'),{recursive:true});
fs.writeFileSync(path.join(root,'downloads','public-site-error-repair.json'),JSON.stringify(report,null,2));
console.log(`Public site error repair complete: ${report.filesChanged} file(s), ${report.siteFilesChanged} deployed-output HTML file(s), ${report.dataFilesChanged} data file(s), ${report.duplicateIdsRenamed} duplicate id(s), ${report.brokenLinksFixed} dynamic route repair(s), ${report.outdatedUrlsFixed} outdated URL(s), ${report.unavailableStoreLinksRemoved} unavailable store link(s) removed.`);
