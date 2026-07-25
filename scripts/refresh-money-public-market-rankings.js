const fs=require('fs');
const path=require('path');

const root=process.cwd();
const registryPath=path.join(root,'data','money-intelligence-registry.json');
const today=new Date().toISOString().slice(0,10);
const requireLive=process.env.MATRIX_MONEY_REQUIRE_LIVE==='1';

const ADAPTERS={
  companies:{url:'https://companiesmarketcap.com/',metric:'Market capitalisation',status:'Verified market snapshot',title:'Largest public companies by market capitalisation',min:100},
  'investment-vehicles':{url:'https://companiesmarketcap.com/etfs/largest-etfs-by-marketcap/',metric:'Vehicle market capitalisation',status:'Verified market snapshot',title:'Largest ETFs by market capitalisation',min:100,vehicle:true},
  banks:{url:'https://companiesmarketcap.com/banks/largest-banks-by-market-cap/',metric:'Market capitalisation',status:'Verified public-market snapshot',title:'Largest banks by market capitalisation',min:100},
  property:{url:'https://companiesmarketcap.com/real-estate/largest-real-estate-companies-by-market-cap/',metric:'Market capitalisation',status:'Verified public-market snapshot',title:'Largest real-estate companies by market capitalisation',min:100},
  media:{url:'https://companiesmarketcap.com/media-press/largest-media-and-press-companies-by-market-cap/',metric:'Market capitalisation',status:'Verified public-market snapshot',title:'Largest media and press companies by market capitalisation',min:100},
  'technology-control':{url:'https://companiesmarketcap.com/tech/largest-tech-companies-by-market-cap/',metric:'Market capitalisation proxy',status:'Verified public-market snapshot',title:'Largest technology companies by market capitalisation',min:100},
  'energy-resources':{url:'https://companiesmarketcap.com/energy/largest-companies-by-market-cap/',metric:'Market capitalisation',status:'Verified public-market snapshot',title:'Largest energy companies by market capitalisation',min:100},
  'defence-security':{url:'https://companiesmarketcap.com/aerospace/largest-companies-by-market-cap/',metric:'Aerospace market capitalisation proxy',status:'Verified public-market snapshot',title:'Largest aerospace companies by market capitalisation',min:90}
};

const slug=value=>String(value||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,90);
const stripHtml=value=>String(value||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/g,'&').replace(/&#39;|&apos;/g,"'").replace(/&quot;/g,'"').replace(/\s+/g,' ').trim();
const absolute=(base,href='')=>{try{return new URL(href,base).href}catch{return base}};
const quantitative=row=>Number(row?.rank)>0&&/[$€£¥₹]\s*[\d,.]+\s*[TBM]\b/i.test(String(row?.value||''))&&/^https:\/\//.test(String(row?.sourceUrl||''));

function parseRows(html,category,adapter){
  const rows=String(html).match(/<tr\b[\s\S]*?<\/tr>/gi)||[],out=[];
  for(const row of rows){
    const rawCells=row.match(/<td\b[\s\S]*?<\/td>/gi)||[];
    const cells=rawCells.map(stripHtml);
    const rankMatch=row.match(/class=["'][^"']*rank-td[^"']*["'][^>]*>\s*(\d{1,3})/i)||cells.map(cell=>cell.match(/^(\d{1,3})$/)).find(Boolean);
    const rank=Number(rankMatch?.[1]||0);
    if(!rank||rank>100)continue;
    const block=row.match(/class=["'][^"']*name-div[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<\/td>/i)?.[1]||row;
    const anchors=[...block.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map(match=>({href:match[1],text:stripHtml(match[2])})).filter(item=>/[A-Za-z]/.test(item.text));
    let name=anchors[0]?.text||'';
    let ticker=stripHtml(block.match(/class=["'][^"']*(?:company-code|ticker)[^"']*["'][^>]*>([\s\S]*?)<\//i)?.[1]||'');
    if(!ticker&&name){const parts=name.split(' '),last=parts.at(-1);if(/^[A-Z0-9][A-Z0-9.\-]{0,14}$/.test(last)){ticker=last;name=parts.slice(0,-1).join(' ')}}
    if(!name)name=cells.find(cell=>/[A-Za-z]{3}/.test(cell)&&!/[$€£¥₹]/.test(cell))||`Rank ${rank}`;
    const valueCell=cells.find(cell=>/[$€£¥₹]\s*[\d,.]+\s*[TBM]\b/i.test(cell))||stripHtml(row);
    const value=(valueCell.match(/[$€£¥₹]\s*[\d,.]+\s*[TBM]\b/i)||[])[0]?.replace(/\s+/g,' ')||'';
    if(!value)continue;
    const percentages=[...stripHtml(row).matchAll(/\d+(?:\.\d+)?%/g)].map(match=>match[0]);
    const jurisdiction=cells.at(-1)||'';
    const entitySourceUrl=absolute(adapter.url,anchors[0]?.href||adapter.url);
    out.push({
      id:`${category}-${slug(ticker||name)}`,
      category,
      rank,
      name,
      ticker,
      jurisdiction,
      value,
      fee:adapter.vehicle?percentages.at(-1)||'':'',
      metric:adapter.metric,
      status:adapter.status,
      sourceTitle:`CompaniesMarketCap — ${adapter.title}`,
      sourceUrl:adapter.url,
      entitySourceUrl,
      sourceDate:today,
      evidenceClass:'Verified Market Data',
      confidence:'Dated public-market ranking snapshot',
      established:`The dated ranking page displays this entity at rank ${rank} with ${adapter.metric.toLowerCase()} of ${value}.`,
      notEstablished:'Market capitalisation is not cash, revenue, profit, assets under management, beneficial ownership, voting control, operational control, coordination or wrongdoing.',
      nextResearch:'Open issuer filings, annual reports, voting-rights disclosures, ownership records, contracts, debt, cash and sector-specific primary data.'
    });
  }
  return [...new Map(out.map(record=>[record.rank,record])).values()].sort((a,b)=>a.rank-b.rank).slice(0,100);
}

async function fetchText(url){
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),35000);
  try{
    const response=await fetch(url,{headers:{'user-agent':'MatrixReprogrammedPublicRecordBot/1.2 (+https://matrixreprogrammed.com/evidence-policy.html)','accept':'text/html,application/xhtml+xml'},signal:controller.signal});
    if(!response.ok)throw new Error(`${response.status} ${response.statusText}`);
    return await response.text();
  }finally{clearTimeout(timeout)}
}

async function main(){
  if(!fs.existsSync(registryPath))throw new Error('Money intelligence registry is missing');
  const registry=JSON.parse(fs.readFileSync(registryPath,'utf8'));
  const categories=new Map((registry.categories||[]).map(category=>[category.id,category]));
  const diagnostics=[];
  for(const [categoryId,adapter] of Object.entries(ADAPTERS)){
    const existing=(registry.records||[]).filter(record=>record.category===categoryId);
    let parsed=[],error='';
    try{parsed=parseRows(await fetchText(adapter.url),categoryId,adapter)}catch(cause){error=cause.message}
    const expected=Math.min(adapter.min,100);
    if(parsed.length<expected){
      const retained=existing.filter(quantitative).sort((a,b)=>a.rank-b.rank).slice(0,100);
      if(retained.length>=expected){parsed=retained;error=error||`Live parser returned ${parsed.length}; retained prior verified snapshot`}
      else if(requireLive)throw new Error(`${categoryId}: expected at least ${expected} quantitative rows, parsed ${parsed.length}; ${error||'market-cap cells not found'}`);
    }
    if(!parsed.length){diagnostics.push({category:categoryId,ok:false,parsed:0,error:error||'No quantitative rows'});continue}
    registry.records=[...(registry.records||[]).filter(record=>record.category!==categoryId),...parsed];
    const category=categories.get(categoryId);
    if(category)Object.assign(category,{metric:adapter.metric,rankingStatus:adapter.status,sourceTitle:`CompaniesMarketCap — ${adapter.title}`,sourceUrl:adapter.url,coverage:parsed.length,ranked:parsed.length,verified:parsed.length,research:0,lastChecked:today,refreshAdapter:{type:'public-market-ranking',url:adapter.url,live:!error,quantitativeRows:parsed.length}});
    diagnostics.push({category:categoryId,ok:parsed.length>=expected,parsed:parsed.length,expected,error});
  }
  registry.updated=new Date().toISOString();
  registry.publicMarketRefresh={generatedAt:registry.updated,source:'CompaniesMarketCap ranking pages',boundary:'Market capitalisation is a dated market-value measure and does not establish cash ownership, assets under management, voting control, operational control or wrongdoing.',diagnostics};
  fs.writeFileSync(registryPath,`${JSON.stringify(registry,null,2)}\n`);
  const failures=diagnostics.filter(item=>!item.ok);
  fs.mkdirSync(path.join(root,'downloads'),{recursive:true});
  fs.writeFileSync(path.join(root,'downloads','money-public-market-refresh.json'),`${JSON.stringify({ok:failures.length===0,generatedAt:registry.updated,diagnostics},null,2)}\n`);
  if(requireLive&&failures.length)throw new Error(`Public-market refresh incomplete: ${failures.map(item=>item.category).join(', ')}`);
  console.log(`Public-market ranking refresh complete: ${diagnostics.reduce((sum,item)=>sum+item.parsed,0)} quantitative rows across ${diagnostics.length} categories.`);
}

main().catch(error=>{console.error(error.stack||error.message);process.exit(1)});
