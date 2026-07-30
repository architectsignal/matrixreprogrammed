const fs=require('fs');
const path=require('path');

const root=process.cwd();
const indexPath=path.join(root,'search-index.json');
const reportPath=path.join(root,'downloads','source-evidence-search-extension.json');
fs.mkdirSync(path.dirname(reportPath),{recursive:true});

if(!fs.existsSync(indexPath)){
  console.error('Source evidence search extension failed: search-index.json missing');
  process.exit(1);
}
let index;
try{index=JSON.parse(fs.readFileSync(indexPath,'utf8'));}catch(error){console.error(`Source evidence search extension failed: ${error.message}`);process.exit(1);}
if(!Array.isArray(index)){console.error('Source evidence search extension failed: index is not an array');process.exit(1);}

const routes=[
  {
    url:'public-source-evidence.html',
    title:'Public Source Evidence — Bills, Policies, Contracts and Outcomes',
    category:'Official Public Sources',
    layer:'household-energy',
    description:'Official evidence routes for household electricity bills, energy prices, tariffs, standing charges, suppliers, regulators, legislation, parliamentary decisions, company filings, procurement contracts, court publications and public consequences.',
    keywords:['electricity bill','energy price','tariff','standing charge','unit rate','supplier','regulator','wholesale energy','legislation','parliament','company filing','procurement','court publication','public consequence'],
    priority:74,
    sourceType:'source-evidence-route'
  },
  {
    url:'data/source-evidence-records.json',
    title:'Public Source Evidence Records JSON',
    category:'Machine Data',
    layer:'household-energy',
    description:'Machine-readable official and evidence-classified source records with publisher, date, jurisdiction, entities, claims, source quality and original-source provenance.',
    keywords:['source evidence','electricity','energy','official statistics','regulator','legislation','procurement','court','publisher','jurisdiction','claims','provenance'],
    priority:70,
    sourceType:'json-feed'
  }
];

const map=new Map(index.filter(item=>item&&item.url).map(item=>[item.url,item]));
for(const route of routes){
  const prior=map.get(route.url)||{};
  map.set(route.url,{...prior,...route,keywords:[...new Set([...(prior.keywords||[]),...route.keywords])],priority:Math.max(Number(prior.priority||0),route.priority)});
}
const finalIndex=[...map.values()].sort((a,b)=>Number(b.priority||0)-Number(a.priority||0)||String(a.title||'').localeCompare(String(b.title||'')));
fs.writeFileSync(indexPath,JSON.stringify(finalIndex,null,2));
const report={ok:true,generatedAt:new Date().toISOString(),routes:routes.map(route=>route.url),indexSize:finalIndex.length,boundary:'Search routes point to local Matrix evidence surfaces; original external sources remain attached inside each evidence record.'};
fs.writeFileSync(reportPath,`${JSON.stringify(report,null,2)}\n`);
console.log(`Source evidence search extension complete: ${routes.length} routes, ${finalIndex.length} total indexed routes.`);
