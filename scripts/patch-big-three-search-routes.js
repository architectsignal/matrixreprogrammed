const fs = require('fs');
const path = require('path');
const root = process.cwd();
function fp(p){return path.join(root,p)}
function exists(p){return fs.existsSync(fp(p))}
function read(p){return fs.readFileSync(fp(p),'utf8')}
function write(p,v){fs.mkdirSync(path.dirname(fp(p)),{recursive:true});fs.writeFileSync(fp(p),v)}
function add(url,title,category,description,keywords){
  if(!exists('search-index.json')) return;
  let index=[]; try{index=JSON.parse(read('search-index.json'))}catch{index=[]}
  if(!Array.isArray(index)) index=[];
  if(!index.some(x=>x&&x.url===url)) index.push({url,title,category,description,keywords,layer:'money-reserves',priority:91,sourceType:url.endsWith('.html')?'html':'json-feed'});
  write('search-index.json',JSON.stringify(index,null,2));
}
const routes=[
 ['big-three-asset-managers.html','Big Three Asset Manager Tracker','Asset Manager Tracker','BlackRock, Vanguard and State Street tracking hub for management, AUM, holdings, contracts, proxy voting, custody, policy routes and missing records.',['BlackRock','Vanguard','State Street','Big Three','asset managers','AUM','13F','proxy voting','contracts']],
 ['big-three/blackrock.html','BlackRock Tracker','Asset Manager Tracker','BlackRock profile tracking management, AUM, iShares, Aladdin, holdings, public records, contracts and missing records.',['BlackRock','BLK','iShares','Aladdin','AUM','13F','proxy voting']],
 ['big-three/vanguard.html','Vanguard Tracker','Asset Manager Tracker','Vanguard profile tracking management, AUM, funds, holdings, voting, retirement routes and missing records.',['Vanguard','Salim Ramji','AUM','index funds','proxy voting','retirement']],
 ['big-three/state-street.html','State Street Tracker','Asset Manager Tracker','State Street profile tracking investment management, custody, SPDR ETFs, AUM, AUC/AUA, holdings, contracts and missing records.',['State Street','State Street Investment Management','SPDR','custody','AUM','AUC','AUA']],
 ['data/big-three-asset-managers.json','Big Three Asset Manager JSON','Machine Data','Machine-readable Big Three tracker data.',['BlackRock','Vanguard','State Street','machine data']],
 ['downloads/big-three-asset-managers.md','Big Three Asset Manager Download','Downloads','Downloadable Big Three tracker report.',['BlackRock','Vanguard','State Street','download']]
];
for(const r of routes) add(...r);
fs.mkdirSync(fp('downloads'),{recursive:true});
write('downloads/big-three-search-routes-report.json',JSON.stringify({ok:true,updated:new Date().toISOString(),routes:routes.map(r=>r[0])},null,2));
console.log('Big Three search routes patched: '+routes.length);
