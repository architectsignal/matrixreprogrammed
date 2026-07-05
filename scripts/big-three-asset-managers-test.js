const fs = require('fs');
const path = require('path');
const root = process.cwd();
function exists(p){return fs.existsSync(path.join(root,p))}
function read(p){return fs.readFileSync(path.join(root,p),'utf8')}
const failures=[];
function file(p){if(!exists(p)) failures.push(`${p} missing`)}
function text(p,m){if(!exists(p)||!read(p).includes(m)) failures.push(`${p} missing ${m}`)}
['big-three-asset-managers.html','big-three/blackrock.html','big-three/vanguard.html','big-three/state-street.html','data/big-three-asset-managers.json','downloads/big-three-asset-managers.md'].forEach(file);
text('big-three-asset-managers.html','BLACKROCK. VANGUARD. STATE STREET.');
text('big-three/blackrock.html','Management / board');
text('big-three/vanguard.html','Contracts / mandates to track');
text('big-three/state-street.html','AUM and AUC/AUA');
try{
  const data=JSON.parse(read('data/big-three-asset-managers.json'));
  if(!Array.isArray(data.companies)||data.companies.length!==3) failures.push('Big Three JSON must contain 3 companies');
  for(const id of ['blackrock','vanguard','state-street']) if(!data.companies.some(c=>c.id===id)) failures.push(`Big Three JSON missing ${id}`);
  if(!Array.isArray(data.lanes)||data.lanes.length<10) failures.push('Big Three JSON needs deep tracking lanes');
}catch{failures.push('Big Three JSON invalid')}
if(exists('search-index.json')){
  const index=read('search-index.json');
  for(const marker of ['big-three-asset-managers.html','big-three/blackrock.html','big-three/vanguard.html','big-three/state-street.html']) if(!index.includes(marker)) failures.push(`search index missing ${marker}`);
}
if(failures.length){console.error('BIG THREE ASSET MANAGERS TEST FAILED');for(const f of failures) console.error('- '+f);process.exit(1)}
console.log('BIG THREE ASSET MANAGERS TEST PASSED');
