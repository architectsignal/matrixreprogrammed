const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const root=process.cwd();
const packDir=path.join(root,'card-art-pack');
const outDir=path.join(root,'card-art-inbox');
if(!fs.existsSync(packDir)){console.log('No bundled card-art pack found.');module.exports={installed:0};return}
const parts=fs.readdirSync(packDir).filter(name=>/^people-of-interest\.part\d+\.txt$/.test(name)).sort();
if(!parts.length){console.log('Bundled card-art pack is empty.');module.exports={installed:0};return}
const source=parts.map(name=>fs.readFileSync(path.join(packDir,name),'utf8')).join('');
let pack;
try{pack=JSON.parse(source)}catch(error){throw new Error(`Bundled card-art pack is invalid JSON: ${error.message}`)}
if(pack.deckId!=='people-of-interest'||!Array.isArray(pack.cards)||pack.cards.length!==22)throw new Error('Bundled card-art pack must contain exactly 22 people-of-interest cards.');
fs.mkdirSync(outDir,{recursive:true});
const seen=new Set();
for(const card of pack.cards){
 const id=String(card.id||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
 if(!id||seen.has(id))throw new Error(`Invalid or duplicate bundled card id: ${card.id}`);
 seen.add(id);
 const bytes=Buffer.from(String(card.data||''),'base64');
 const digest=crypto.createHash('sha256').update(bytes).digest('hex');
 if(!bytes.length||digest!==card.sha256)throw new Error(`Bundled artwork checksum failed for ${id}.`);
 fs.writeFileSync(path.join(outDir,`${id}.webp`),bytes);
}
const receipt={ok:true,version:pack.version||1,deckId:pack.deckId,installed:seen.size,parts:parts.length,installedAt:new Date().toISOString(),source:'versioned repository card-art pack',outputDirectory:'card-art-inbox/'};
fs.writeFileSync(path.join(outDir,'bundled-card-art-receipt.json'),`${JSON.stringify(receipt,null,2)}\n`);
console.log(`Bundled card artwork installed: ${seen.size} verified WebP cards.`);
module.exports=receipt;
