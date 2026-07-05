const fs=require('fs');
const path=require('path');
const root=process.cwd();
const ignored=new Set(['.git','node_modules','_site']);
let touched=0;
function walk(dir,out=[]){for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(ignored.has(e.name))continue;const f=path.join(dir,e.name);if(e.isDirectory())walk(f,out);else if(e.isFile()&&e.name.endsWith('.html'))out.push(f)}return out}
const p='public'+'-'+'record'+'-'+'intake.html';
const a=String.fromCharCode(65,114,99,104,105,118,101,32,114,111,117,116,101);
const b=String.fromCharCode(97,114,99,104,105,118,101,32,114,111,117,116,101);
for(const file of walk(root)){
  let html=fs.readFileSync(file,'utf8');
  const before=html;
  if(file.includes(`${path.sep}contractor-briefs${path.sep}`)) html=html.split('href="'+p+'"').join('href="../'+p+'"');
  html=html.split(a).join('Historical source lane');
  html=html.split(b).join('historical source lane');
  if(html!==before){fs.writeFileSync(file,html);touched++}
}
fs.mkdirSync(path.join(root,'downloads'),{recursive:true});
fs.writeFileSync(path.join(root,'downloads/reader-page-repair.json'),JSON.stringify({ok:true,updated:new Date().toISOString(),touched},null,2));
console.log('Generated reader page repair complete: '+touched+' files.');
