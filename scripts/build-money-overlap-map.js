const fs=require('fs');
const path=require('path');
const root=process.cwd();
const file=p=>path.join(root,p);
const read=(p,fallback='')=>{try{return fs.readFileSync(file(p),'utf8')}catch{return fallback}};
const readJson=(p,fallback={})=>{try{return JSON.parse(read(p))}catch{return fallback}};
const write=(p,value)=>{fs.mkdirSync(path.dirname(file(p)),{recursive:true});fs.writeFileSync(file(p),value)};
const writeJson=(p,value)=>write(p,`${JSON.stringify(value,null,2)}\n`);
const slug=value=>String(value||'').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,90);
const today=new Date().toISOString().slice(0,10);
const now=new Date().toISOString();
const MARKET_ADAPTERS={
  banks:{url:'https://companiesmarketcap.com/banks/largest-banks-by-market-cap/',metric:'Market capitalisation',status:'Verified public-market snapshot',description:'Publicly traded banks and bank holding companies ranked by dated market capitalisation. Total assets, deposits, custody and state support remain separate measures.',min:100},
  property:{url:'https://companiesmarketcap.com/real-estate/largest-real-estate-companies-by-market-cap/',metric:'Market capitalisation',status:'Verified public-market snapshot',description:'Publicly traded real-estate companies ranked by dated market capitalisation. Private land, sovereign holdings and beneficial ownership are not implied.',min:100},
  media:{url:'https://companiesmarketcap.com/media-press/largest-media-and-press-companies-by-market-cap/',metric:'Market capitalisation',status:'Verified public-market snapshot',description:'Publicly traded media and press companies ranked by dated market capitalisation, separate from audience, voting control and distribution power.',min:100},
  'technology-control':{url:'https://companiesmarketcap.com/tech/largest-tech-companies-by-market-cap/',metric:'Market capitalisation proxy',status:'Verified public-market snapshot',description:'Publicly traded technology companies ranked by dated market capitalisation as a market-value proxy. Infrastructure reach, data access and operational control require separate evidence.',min:100},
  'energy-resources':{url:'https://companiesmarketcap.com/energy/largest-companies-by-market-cap/',metric:'Market capitalisation',status:'Verified public-market snapshot',description:'Publicly traded energy companies ranked by dated market capitalisation. Reserves, production, concessions and state control remain separate measures.',min:100},
  'defence-security':{url:'https://companiesmarketcap.com/aerospace/largest-companies-by-market-cap/',metric:'Aerospace market capitalisation proxy',status:'Verified public-market snapshot plus research lead',description:'Publicly traded aerospace companies ranked by dated market capitalisation, supplemented only where needed by clearly labelled defence research leads. Arms revenue and contract value remain separate measures.',min:90}
};
const CORPORATE=/\b(the|plc|incorporated|inc|corp|corporation|company|co|limited|ltd|llc|lp|sa|se|ag|nv|group|holdings?|partners?|management|investment|investments|capital|international|global)\b/g;
const ALIASES=new Map(Object.entries({
  'alphabet google':'alphabet','google public sector':'alphabet','alphabet youtube':'alphabet','google':'alphabet',
  'amazon web services':'amazon','amazon mgm studios':'amazon','aws':'amazon','apple services':'apple','meta platforms':'meta','facebook':'meta',
  'boeing defense space security':'boeing','boeing defense space and security':'boeing','blackstone real estate':'blackstone',
  'brookfield property partners':'brookfield','brookfield asset management':'brookfield','brookfield corporation':'brookfield','tencent media':'tencent',
  'walt disney':'disney','the walt disney company':'disney','government pension fund global norway':'government pension fund global',
  'bill melinda gates foundation network':'bill melinda gates foundation','open society foundations network':'open society foundations',
  'bloomberg philanthropies network':'bloomberg philanthropies','ford foundation network':'ford foundation','rockefeller foundation network':'rockefeller foundation',
  'wellcome trust network':'wellcome trust','chan zuckerberg initiative network':'chan zuckerberg initiative','macarthur foundation network':'macarthur foundation',
  'hewlett foundation network':'william flora hewlett foundation','packard foundation network':'david lucile packard foundation',
  'walton family foundation network':'walton family foundation','moore foundation network':'moore foundation','robert wood johnson foundation network':'robert wood johnson foundation',
  'mastercard foundation network':'mastercard foundation','ikea foundation network':'ikea foundation','novo nordisk foundation network':'novo nordisk foundation',
  'tata trusts network':'tata trusts','azim premji foundation network':'azim premji foundation','carnegie corporation network':'carnegie corporation new york',
  'mellon foundation network':'andrew w mellon foundation','lilly endowment network':'lilly endowment','knight foundation network':'knight foundation',
  'kresge foundation network':'kresge foundation','pew charitable trusts network':'pew charitable trusts','fidelity charitable network':'fidelity charitable donor advised funds',
  'schwab charitable network':'schwab charitable donor advised funds','national philanthropic trust network':'national philanthropic trust'
}));
function cleanName(value=''){
  let s=String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  s=s.replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
  if(ALIASES.has(s))return ALIASES.get(s);
  const stripped=s.replace(CORPORATE,' ').replace(/\s+/g,' ').trim();
  return ALIASES.get(stripped)||stripped||s;
}
function stripHtml(value=''){return String(value).replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&#39;|&apos;/g,"'").replace(/&quot;/g,'"').replace(/\s+/g,' ').trim()}
function absolute(base,href=''){try{return new URL(href,base).href}catch{return base}}
function parseMarketRows(html,category,adapter){
  const rows=String(html).match(/<tr\b[\s\S]*?<\/tr>/gi)||[],out=[];
  for(const row of rows){
    const cells=(row.match(/<td\b[\s\S]*?<\/td>/gi)||[]).map(stripHtml);
    const rankMatch=row.match(/class=["'][^"']*rank-td[^"']*["'][^>]*>\s*(\d{1,3})/i)||cells.map(x=>x.match(/^(\d{1,3})$/)).find(Boolean);
    const rank=Number(rankMatch?.[1]||0);if(!rank||rank>100)continue;
    const block=row.match(/class=["'][^"']*name-div[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<\/td>/i)?.[1]||row;
    const anchors=[...block.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map(m=>({href:m[1],text:stripHtml(m[2])})).filter(x=>/[A-Za-z]/.test(x.text));
    let name=anchors[0]?.text||'';let ticker=stripHtml(block.match(/class=["'][^"']*(?:company-code|ticker)[^"']*["'][^>]*>([\s\S]*?)<\//i)?.[1]||'');
    if(!ticker&&name){const parts=name.split(' '),last=parts.at(-1);if(/^[A-Z0-9][A-Z0-9.\-]{0,12}$/.test(last)){ticker=last;name=parts.slice(0,-1).join(' ')}}
    if(!name)name=cells.find(x=>/[A-Za-z]{3}/.test(x)&&!/^\$/.test(x))||`Rank ${rank}`;
    const value=(row.match(/\$\s*[\d,.]+\s*[TBM]/i)||[])[0]?.replace(/\s+/g,' ')||'';
    const jurisdiction=cells.at(-1)||'';
    out.push({id:`${category}-${slug(ticker||name)}`,category,rank,name,ticker,jurisdiction,value,fee:'',metric:adapter.metric,status:adapter.status,sourceUrl:absolute(adapter.url,anchors[0]?.href||adapter.url),sourceDate:today,evidenceClass:'Verified Market Data',confidence:'Dated public-market snapshot',established:`The cited ranking identifies this publicly traded entity and its displayed ${adapter.metric.toLowerCase()} at the source date.`,notEstablished:'Market value does not establish revenue, assets, beneficial ownership, voting control, operational control, coordination or wrongdoing.',nextResearch:'Open annual reports, ownership filings, voting rights, contracts, regulatory records and sector-specific primary data.'});
  }
  return [...new Map(out.map(x=>[x.rank,x])).values()].sort((a,b)=>a.rank-b.rank).slice(0,100);
}
async function fetchText(url){const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),30000);try{const response=await fetch(url,{headers:{'user-agent':'MatrixReprogrammedPublicRecordBot/1.1 (+https://matrixreprogrammed.com/evidence-policy.html)','accept':'text/html,application/xhtml+xml'},signal:controller.signal});if(!response.ok)throw new Error(`${response.status} ${response.statusText}`);return await response.text()}finally{clearTimeout(timeout)}}
function supplementToTarget(parsed,oldRows,target=100){
  const keys=new Set(parsed.map(r=>cleanName(r.name))),out=[...parsed];
  for(const row of oldRows){if(out.length>=target)break;const key=cleanName(row.name);if(!key||keys.has(key))continue;keys.add(key);out.push({...row,rank:null,status:'Research watch list',evidenceClass:row.evidenceClass||'Research Lead',confidence:'Supplemental research lead — not part of the ranked market snapshot'});}
  return out;
}
function displayName(records,key){return records.map(r=>r.name).filter(Boolean).sort((a,b)=>a.length-b.length)[0]||key}
function buildOverlap(registry){
  const categories=registry.categories||[],grouped=new Map();
  for(const row of registry.records||[]){const key=cleanName(row.name);if(!key)continue;if(!grouped.has(key))grouped.set(key,{key,records:[]});grouped.get(key).records.push(row)}
  const relationNames=new Set();for(const rel of registry.relationships||[]){relationNames.add(cleanName(rel.from));relationNames.add(cleanName(rel.to))}
  const groups=[...grouped.values()].map(g=>({...g,name:displayName(g.records,g.key),categories:[...new Set(g.records.map(r=>r.category))]}));
  const overlaps=groups.filter(g=>g.categories.length>1).sort((a,b)=>b.categories.length-a.categories.length||b.records.length-a.records.length||a.name.localeCompare(b.name));
  const retained=groups.filter(g=>g.categories.length>1||relationNames.has(g.key));
  const nodes=categories.map(c=>({id:`category:${c.id}`,kind:'category',label:c.title.replace(/^Top 100 /,''),category:c.id,coverage:c.coverage||0,target:c.target||100,status:c.rankingStatus||''}));
  const nodeIds=new Set(nodes.map(n=>n.id));
  for(const g of retained){const id=`entity:${g.key}`;nodes.push({id,kind:'entity',label:g.name,key:g.key,categories:g.categories,recordCount:g.records.length,evidence:[...new Set(g.records.map(r=>r.evidenceClass).filter(Boolean))]});nodeIds.add(id)}
  const edges=[];
  for(const g of retained)for(const category of g.categories)edges.push({id:`membership:${g.key}:${category}`,source:`entity:${g.key}`,target:`category:${category}`,type:'appears in category',evidenceClass:'Registry overlap',category,sourceUrl:g.records.find(r=>r.category===category)?.sourceUrl||'',notEstablished:'Repeated appearance across categories does not by itself establish common control, coordination or wrongdoing.'});
  for(const rel of registry.relationships||[]){const fromKey=cleanName(rel.from),toKey=cleanName(rel.to),source=`entity:${fromKey}`,target=`entity:${toKey}`;if(!nodeIds.has(source)){nodes.push({id:source,kind:'entity',label:rel.from,key:fromKey,categories:[],recordCount:0,evidence:[rel.evidenceClass].filter(Boolean)});nodeIds.add(source)}if(!nodeIds.has(target)){nodes.push({id:target,kind:'entity',label:rel.to,key:toKey,categories:[],recordCount:0,evidence:[rel.evidenceClass].filter(Boolean)});nodeIds.add(target)}edges.push({id:rel.id||`relationship:${fromKey}:${toKey}`,source,target,type:rel.type||'related to',evidenceClass:rel.evidenceClass||'Public record',sourceUrl:rel.sourceUrl||'',sourceDate:rel.sourceDate||'',established:rel.established||'',notEstablished:rel.notEstablished||''})}
  const pairMap=new Map();for(const g of groups){const cats=[...g.categories].sort();for(let i=0;i<cats.length;i++)for(let j=i+1;j<cats.length;j++){const key=`${cats[i]}|${cats[j]}`;pairMap.set(key,(pairMap.get(key)||0)+1)}}
  const categoryPairs=[...pairMap].map(([key,count])=>{const[from,to]=key.split('|');return{from,to,count}}).sort((a,b)=>b.count-a.count||a.from.localeCompare(b.from));
  const jurisdictions=new Set((registry.records||[]).map(r=>String(r.jurisdiction||'').replace(/[^A-Za-zÀ-ÿ .'-]/g,'').trim()).filter(Boolean));
  return{version:1,generatedAt:now,registryUpdated:registry.updated||null,methodology:'Nodes are public-record registry entries. Category links show repeated appearance after conservative name normalisation. Existing sourced relationships remain separate from inferred overlap.',boundary:'An overlap is a research route, not proof that entities coordinate, control one another or commit wrongdoing.',summary:{records:(registry.records||[]).length,categories:categories.length,jurisdictions:jurisdictions.size,overlapEntities:overlaps.length,relationshipEdges:(registry.relationships||[]).length,categoryPairs:categoryPairs.filter(p=>p.count>0).length},categories,nodes,edges,overlaps:overlaps.map(g=>({key:g.key,name:g.name,categories:g.categories,recordCount:g.records.length,records:g.records.map(r=>({id:r.id,category:r.category,rank:r.rank,name:r.name,status:r.status,evidenceClass:r.evidenceClass,sourceUrl:r.sourceUrl,sourceDate:r.sourceDate,established:r.established,notEstablished:r.notEstablished}))})),categoryPairs};
}
function evidenceBreakdown(rows){const verified=rows.filter(r=>/verified|official|institutional disclosure|public filing|regulator|contract/i.test(`${r.evidenceClass} ${r.status}`)).length;return{coverage:rows.length,ranked:rows.filter(r=>Number(r.rank)>0).length,verified,research:Math.max(0,rows.length-verified)}}
function patchHub(){
  const pathName='follow-the-money.html',html=read(pathName);if(!html)return;
  const replacement=`<!-- money-command-center:start --><section id="money-command-center" class="section wrap"><div class="money-kicker">Money Intelligence Command Center</div><h2>WHO OWNS, ALLOCATES, RECEIVES AND CONTROLS CAPITAL?</h2><p class="lead">One registry connects people, companies, funds, trusts, foundations, banks, contracts, grants and political money while keeping verified records separate from estimates and research leads.</p><div class="money-stat-grid" id="money-command-stats"><div class="money-stat"><span>Loading</span><strong>Registry</strong></div></div><div class="money-command-grid" id="money-command-grid"><article class="money-command-card"><span>Loading</span><strong>Capital systems</strong><small>Reading current registry</small></article></div><div id="money-overlap-preview" class="money-dual"></div><div class="cta-row"><a class="btn" href="money-search.html">Search Money Intelligence</a><a class="btn alt" href="money-graph.html">Open Relationship &amp; Overlap Map</a><a class="btn alt" href="data/money-intelligence-registry.json">Open Registry JSON</a></div></section><!-- money-command-center:end -->`;
  let next=html.replace(/<!-- money-command-center:start -->[\s\S]*?<!-- money-command-center:end -->/,replacement);
  if(!next.includes('money-overlap.css'))next=next.replace('</head>','<link rel="stylesheet" href="money-overlap.css"></head>');
  if(!next.includes('money-command-center.js'))next=next.replace('</body>','<script src="money-command-center.js"></script></body>');
  write(pathName,next);
}
function copyAssets(){
  const pairs=[['src/money-overlap-graph.html','money-graph.html'],['src/money-overlap-graph.js','money-graph.js'],['src/money-command-center.js','money-command-center.js']];
  for(const[src,dest]of pairs){const content=read(src);if(!content)throw new Error(`Missing canonical overlap asset ${src}`);write(dest,content)}
}
async function refreshPublicMarketCategories(registry){
  if(process.env.MATRIX_MONEY_REFRESH!=='1')return false;
  let changed=false;
  for(const[categoryId,adapter]of Object.entries(MARKET_ADAPTERS)){
    try{
      const parsed=parseMarketRows(await fetchText(adapter.url),categoryId,adapter);
      if(parsed.length<adapter.min)throw new Error(`only ${parsed.length} ranked rows parsed; expected at least ${adapter.min}`);
      const oldRows=(registry.records||[]).filter(r=>r.category===categoryId),rows=supplementToTarget(parsed,oldRows,100);
      registry.records=(registry.records||[]).filter(r=>r.category!==categoryId).concat(rows);
      const category=(registry.categories||[]).find(c=>c.id===categoryId);if(category){Object.assign(category,{sourceUrl:adapter.url,metric:adapter.metric,rankingStatus:adapter.status,description:adapter.description,adapter:'public-market-category'});}
      registry.sources=(registry.sources||[]).filter(s=>s.name!==(category?.title||categoryId));registry.sources.push({name:category?.title||categoryId,url:adapter.url,checked:today});
      changed=true;console.log(`Refreshed ${categoryId}: ${parsed.length} ranked, ${rows.length} covered.`);
    }catch(error){console.warn(`Public market refresh failed for ${categoryId}: ${error.message}`)}
  }
  return changed;
}
async function main(){
  const registry=readJson('data/money-intelligence-registry.json',null);if(!registry||!Array.isArray(registry.records)||!Array.isArray(registry.categories))throw new Error('Money intelligence registry is missing or invalid.');
  const changed=await refreshPublicMarketCategories(registry);
  for(const category of registry.categories){const rows=registry.records.filter(r=>r.category===category.id),b=evidenceBreakdown(rows);Object.assign(category,b,{coverage:b.coverage,lastChecked:[...rows.map(r=>r.sourceDate).filter(Boolean)].sort().at(-1)||null,refreshAdapter:MARKET_ADAPTERS[category.id]?{type:'public-market-category',url:MARKET_ADAPTERS[category.id].url,live:changed}:category.refreshAdapter||{type:category.adapter||'research-watchlist',live:false}})}
  registry.version=Math.max(Number(registry.version)||0,3);registry.updated=changed?now:registry.updated||now;
  const graph=buildOverlap(registry);registry.overlapSummary=graph.summary;registry.overlapGeneratedAt=graph.generatedAt;
  writeJson('data/money-intelligence-registry.json',registry);writeJson('data/money-overlap-graph.json',graph);
  if(fs.existsSync(file(`data/history/money-intelligence/${today}.json`)))writeJson(`data/history/money-intelligence/${today}.json`,registry);
  const searchRecords=registry.records.map(r=>({...r,categoryTitle:registry.categories.find(c=>c.id===r.category)?.title||r.category,route:registry.categories.find(c=>c.id===r.category)?.route||'follow-the-money.html',search:[r.name,r.ticker,r.jurisdiction,r.value,r.status,r.evidenceClass,r.category].join(' ').toLowerCase()}));writeJson('data/money-search-index.json',{updated:registry.updated,records:searchRecords});
  const brief=readJson('data/money-intelligence-brief-feed.json',{});brief.updated=registry.updated;brief.coverage=registry.categories.map(c=>({category:c.title,route:c.route,coverage:c.coverage,target:c.target,status:c.rankingStatus,ranked:c.ranked,verified:c.verified,research:c.research}));brief.overlap=graph.summary;brief.routes=[...new Set([...(brief.routes||[]),'money-graph.html'])];writeJson('data/money-intelligence-brief-feed.json',brief);
  copyAssets();patchHub();
  console.log(`Money overlap map built: ${graph.summary.overlapEntities} overlap entities, ${graph.edges.length} edges, ${registry.records.length} records.`);
}
main().catch(error=>{console.error(error.stack||error);process.exit(1)});
