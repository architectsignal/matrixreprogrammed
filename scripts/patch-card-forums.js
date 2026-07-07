const fs=require('fs');
const path=require('path');
const root=process.cwd();
const fp=p=>path.join(root,p);
const ex=p=>fs.existsSync(fp(p));
const rd=p=>fs.readFileSync(fp(p),'utf8');
const wr=(p,v)=>fs.writeFileSync(fp(p),v);
function inject(file,deckId){
  if(!ex(file))return;
  let h=rd(file);
  if(!h.includes('id="card-intel-forum"')) h=h.replace('</main>','<div id="card-intel-forum"></div></main>');
  if(!h.includes('card-forum.js')) h=h.replace('<script src="matrix.js"></script>','<script src="card-forum.js"></script><script src="matrix.js"></script>');
  if(!h.includes('matrixCardForumMount(')) h=h.replace('</body>',`<script>document.addEventListener('DOMContentLoaded',function(){matrixCardForumMount('card-intel-forum',{deckId:'${deckId}',cardId:new URLSearchParams(location.search).get('card')||document.body.dataset.cardId||'unknown-card'});});</script></body>`);
  wr(file,h);
}
inject('controlled-opposition-profile.html','controlled-opposition');
inject('institution-profile.html','institutions');
const topDir=fp('top-52');
if(ex('top-52')&&fs.statSync(topDir).isDirectory()){
  for(const name of fs.readdirSync(topDir)){
    if(!name.endsWith('.html'))continue;
    const file='top-52/'+name;
    let h=rd(file);
    const cardId=name.replace(/\.html$/,'');
    if(!h.includes('id="card-intel-forum"')) h=h.replace('</main>','<div id="card-intel-forum"></div></main>');
    if(!h.includes('card-forum.js')) h=h.replace('<script src="../matrix.js"></script>','<script src="../card-forum.js"></script><script src="../matrix.js"></script>');
    if(!h.includes('matrixCardForumMount(')) h=h.replace('</body>',`<script>document.addEventListener('DOMContentLoaded',function(){matrixCardForumMount('card-intel-forum',{deckId:'people-of-interest',cardId:'${cardId}'});});</script></body>`);
    wr(file,h);
  }
}
console.log('Card forum blocks injected into profile pages.');
