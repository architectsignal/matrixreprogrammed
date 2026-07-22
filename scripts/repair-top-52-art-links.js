const fs=require('fs');
const path=require('path');
const root=process.cwd();
const skipped=new Set(['.git','node_modules','_site','.wrangler','.netlify']);
let files=0;
let links=0;

function walk(dir){
 if(!fs.existsSync(dir))return[];
 const out=[];
 for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
  if(entry.isDirectory()&&skipped.has(entry.name))continue;
  const full=path.join(dir,entry.name);
  if(entry.isDirectory())out.push(...walk(full));
  else if(entry.name.endsWith('.html'))out.push(full);
 }
 return out;
}

function canonicalTarget(target){
 const match=String(target).match(/(?:^|\/)(top-52)\/([^/?#]+?)(?:\.html)?(?:[?#].*)?$/i);
 if(!match)return target;
 const id=match[2].replace(/\.html$/i,'');
 const dossier=path.join(root,'top-52',`${id}.html`);
 if(!fs.existsSync(dossier))throw new Error(`Top 52 dossier target is missing: top-52/${id}.html`);
 return `/top-52/${id}`;
}

for(const file of walk(root)){
 const before=fs.readFileSync(file,'utf8');
 const after=before.replace(/href=(['"])(\.\.\/\.\.\/top-52\/[^'"]+|\.\.\/top-52\/[^'"]+|top-52\/[^'"]+)\1/g,(match,quote,target)=>{
  const next=canonicalTarget(target);
  if(next!==target)links+=1;
  return `href=${quote}${next}${quote}`;
 });
 if(after!==before){fs.writeFileSync(file,after);files+=1;}
}

console.log(`Top 52 dossier link normalization complete: ${files} file(s), ${links} link(s) converted to direct extensionless dossiers.`);
