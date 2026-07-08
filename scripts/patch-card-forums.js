const fs=require('fs');
const path=require('path');
const root=process.cwd();
const fp=p=>path.join(root,p);
const ex=p=>fs.existsSync(fp(p));
const rd=p=>fs.readFileSync(fp(p),'utf8');
const wr=(p,v)=>fs.writeFileSync(fp(p),v);
function injectRootScripts(h){
  if(!h.includes('card-forum.js')) h=h.replace('<script src="matrix.js"></script>','<script src="card-forum.js"></script><script src="intake-fallback.js"></script><script src="matrix.js"></script>');
  else if(!h.includes('intake-fallback.js')) h=h.replace('<script src="matrix.js"></script>','<script src="intake-fallback.js"></script><script src="matrix.js"></script>');
  return h;
}
function injectSubScripts(h){
  if(!h.includes('card-forum.js')) h=h.replace('<script src="../matrix.js"></script>','<script src="../card-forum.js"></script><script src="../intake-fallback.js"></script><script src="../matrix.js"></script>');
  else if(!h.includes('intake-fallback.js')) h=h.replace('<script src="../matrix.js"></script>','<script src="../intake-fallback.js"></script><script src="../matrix.js"></script>');
  return h;
}
function inject(file,deckId){
  if(!ex(file))return;
  let h=rd(file);
  if(!h.includes('id="card-intel-forum"')) h=h.replace('</main>','<div id="card-intel-forum"></div></main>');
  h=injectRootScripts(h);
  if(!h.includes('matrixCardForumMount(')) h=h.replace('</body>',`<script>document.addEventListener('DOMContentLoaded',function(){matrixCardForumMount('card-intel-forum',{deckId:'${deckId}',cardId:new URLSearchParams(location.search).get('card')||document.body.dataset.cardId||'unknown-card'});});</script></body>`);
  wr(file,h);
}
inject('controlled-opposition-profile.html','controlled-opposition');
inject('institution-profile.html','institutions');
for(const dirName of ['top-52','controlled-opposition','institutions','power-families','secret-societies','policy','think-tanks','black-nobility','jurisdictions-of-power']){
  const dir=fp(dirName);
  if(!fs.existsSync(dir)||!fs.statSync(dir).isDirectory())continue;
  for(const name of fs.readdirSync(dir)){
    if(!name.endsWith('.html'))continue;
    const file=dirName+'/'+name;
    let h=rd(file);
    const cardId=name.replace(/\.html$/,'');
    if(!h.includes('id="card-intel-forum"')) h=h.replace('</main>','<div id="card-intel-forum"></div></main>');
    h=injectSubScripts(h);
    if(!h.includes('matrixCardForumMount(')) h=h.replace('</body>',`<script>document.addEventListener('DOMContentLoaded',function(){matrixCardForumMount('card-intel-forum',{deckId:'${dirName}',cardId:'${cardId}'});});</script></body>`);
    wr(file,h);
  }
}
console.log('Card forum blocks and intake fallback injected into profile pages.');
