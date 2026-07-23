const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const root=process.cwd();
const packDir=path.join(root,'card-art-pack');
const outDir=path.join(root,'card-art-inbox');
if(!fs.existsSync(packDir)){console.log('No bundled card-art pack found.');module.exports={installed:0};return}
const groups=new Map();
for(const name of fs.readdirSync(packDir)){
 const match=name.match(/^(people-of-interest|puppets-of-interest)(?:-[a-z0-9-]+)?\.(b64part|part)(\d+)\.txt$/i);
 if(!match)continue;
 const prefix=name.replace(/\.(?:b64)?part\d+\.txt$/i,'');
 const encoding=match[2].toLowerCase()==='b64part'?'base64':'utf8';
 const key=`${prefix}|${encoding}`;
 if(!groups.has(key))groups.set(key,{prefix,encoding,names:[]});
 groups.get(key).names.push(name);
}
if(!groups.size){console.log('Bundled card-art pack is empty.');module.exports={installed:0};return}
fs.mkdirSync(outDir,{recursive:true});
const receipts=[];
for(const {prefix,encoding,names} of groups.values()){
 const parts=names.sort((a,b)=>Number(a.match(/(?:b64)?part(\d+)\.txt$/i)[1])-Number(b.match(/(?:b64)?part(\d+)\.txt$/i)[1]));
 let source=parts.map(name=>fs.readFileSync(path.join(packDir,name),'utf8').trim()).join('');
 if(encoding==='base64')source=Buffer.from(source,'base64').toString('utf8');
 let pack;
 try{pack=JSON.parse(source)}catch(error){throw new Error(`Bundled card-art pack ${prefix} is invalid JSON: ${error.message}`)}
 if(!['people-of-interest','puppets-of-interest','top-52'].includes(pack.deckId)||!Array.isArray(pack.cards)||pack.cards.length<1||pack.cards.length>52)throw new Error(`Bundled card-art pack ${prefix} must contain 1–52 Puppets of Interest cards.`);
 const seen=new Set();
 for(const card of pack.cards){
  const id=String(card.id||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  if(!id||seen.has(id))throw new Error(`Invalid or duplicate bundled card id in ${prefix}: ${card.id}`);
  seen.add(id);
  const bytes=Buffer.from(String(card.data||''),'base64');
  const digest=crypto.createHash('sha256').update(bytes).digest('hex');
  if(!bytes.length||digest!==card.sha256)throw new Error(`Bundled artwork checksum failed for ${id}.`);
  const ext=String(card.extension||'webp').toLowerCase().replace(/[^a-z0-9]/g,'')||'webp';
  fs.writeFileSync(path.join(outDir,`${id}.${ext}`),bytes);
 }
 receipts.push({ok:true,version:pack.version||1,batchId:pack.batchId||prefix,deckId:pack.deckId,installed:seen.size,parts:parts.length,encoding,installedAt:new Date().toISOString(),source:'versioned repository card-art pack',outputDirectory:'card-art-inbox/'});
}
const receipt={ok:true,installed:receipts.reduce((sum,item)=>sum+item.installed,0),batches:receipts,installedAt:new Date().toISOString()};
fs.writeFileSync(path.join(outDir,'bundled-card-art-receipt.json'),`${JSON.stringify(receipt,null,2)}\n`);
console.log(`Bundled Puppets artwork installed: ${receipt.installed} verified cards across ${receipts.length} batch(es).`);
module.exports=receipt;