const fs=require('fs');
const path=require('path');
const root=process.cwd();
const file=p=>path.join(root,p);
const read=(p,fallback='')=>{try{return fs.readFileSync(file(p),'utf8')}catch{return fallback}};
const readJson=(p,fallback={})=>{try{return JSON.parse(read(p))}catch{return fallback}};
const write=(p,value)=>{fs.mkdirSync(path.dirname(file(p)),{recursive:true});fs.writeFileSync(file(p),value)};
const writeJson=(p,value)=>write(p,`${JSON.stringify(value,null,2)}\n`);
const slug=value=>String(value||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,100);
const today=new Date().toISOString().slice(0,10);
const now=new Date().toISOString();
const REFRESH=process.env.MATRIX_MONEY_REFRESH==='1';

const SOURCE_ADAPTERS={
  'asset-managers':{url:'https://dev.swfinstitute.org/fund-manager-rankings/asset-manager',sourceTitle:'SWFI Top 100 Asset Manager Managers by Managed AUM',metric:'Assets under management',status:'Public ranking snapshot',entityType:'Asset Manager',capitalRole:'Allocator / investment manager',min:95},
  'sovereign-wealth-funds':{url:'https://dev.swfinstitute.org/fund-rankings/sovereign-wealth-fund',sourceTitle:'SWFI Top 100 Sovereign Wealth Funds by Total Assets',metric:'Reported total assets',status:'Public ranking snapshot',entityType:'Sovereign Wealth Fund',capitalRole:'State asset owner / allocator',min:95},
  'pension-funds':{url:'https://dev.swfinstitute.org/fund-rankings/public-pension',sourceTitle:'SWFI Top 100 Public Pensions by Total Assets',metric:'Reported total assets',status:'Public ranking snapshot',entityType:'Public Pension',capitalRole:'Beneficial asset owner / allocator',min:95},
  'family-offices':{url:'https://dev.swfinstitute.org/fund-rankings/family-office',sourceTitle:'SWFI Largest Family Offices by Total Assets',metric:'Reported or estimated total assets',status:'Public ranking snapshot plus research leads',entityType:'Family Office',capitalRole:'Private family capital owner / allocator',min:90},
  'foundations':{url:'https://dev.swfinstitute.org/fund-rankings/foundation',sourceTitle:'SWFI Top 100 Foundations by Total Assets',metric:'Reported total assets',status:'Public ranking snapshot',entityType:'Foundation',capitalRole:'Philanthropic asset owner / grantmaker',min:95},
  'trusts':{url:'https://dev.swfinstitute.org/fund-rankings/endowment',sourceTitle:'SWFI Top 100 Endowments by Total Assets',metric:'Reported total assets',status:'Public trust and endowment snapshot',entityType:'Trust or Endowment',capitalRole:'Long-term asset owner / trustee structure',min:95},
  'hedge-funds':{url:'https://dev.swfinstitute.org/fund-manager-rankings/hedge-fund-manager',sourceTitle:'SWFI Top 100 Hedge Fund Managers by Managed AUM',metric:'Managed assets',status:'Public ranking snapshot',entityType:'Hedge Fund Manager',capitalRole:'Alternative investment manager',min:95},
  'private-equity':{url:'https://en.wikipedia.org/wiki/List_of_private_equity_firms',sourceTitle:'2026 PEI 300 ranking as reproduced with citations by Wikipedia',metric:'Five-year private-equity fundraising',status:'Published 2026 fundraising ranking',entityType:'Private Equity Firm',capitalRole:'Private-market manager / allocator',min:95,parser:'private-equity'}
};

const FAMILY_SUPPLEMENTS=[
  'Willett Advisors','Blue Pool Capital','Hillspire','Waycrosse','Wildcat Capital Management','Pritzker Group',
  'Iconiq Capital','PremjiInvest','RIT Capital Partners','JAB Holding Company','Exor','Wittington Investments',
  'Pontegadea','Tengelmann Twenty-One','Yard Ventures','Ballmer Group'
];

function stripHtml(value=''){
  return String(value).replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ')
    .replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/&#39;|&apos;/g,"'")
    .replace(/&quot;/g,'"').replace(/&#x27;/g,"'").replace(/\s+/g,' ').trim();
}
function absolute(base,href=''){try{return new URL(href,base).href}catch{return base}}
function parseMoney(value=''){
  const text=String(value).replace(/,/g,'');
  const m=text.match(/\$\s*([\d.]+)\s*([TBMK])?/i);
  if(!m)return null;
  const n=Number(m[1]); if(!Number.isFinite(n))return null;
  const factor={T:1e12,B:1e9,M:1e6,K:1e3}[String(m[2]||'').toUpperCase()]||1;
  return n*factor;
}
function recordBase({category,rank,name,value,metric,type,region,sourceUrl,sourceTitle,capitalRole,status}){
  const numeric=parseMoney(value);
  const disclosed=Number.isFinite(numeric);
  return {
    id:`${category}-${slug(name)}`,category,rank:rank||null,sourceRank:rank||null,name,ticker:'',
    jurisdiction:region||'',region:region||'',value:disclosed?value:'Not publicly displayed in ranking',
    valueNumeric:disclosed?numeric:null,fee:'',metric,status,entityType:type||'',subtype:type||'',capitalRole,
    sourceTitle,sourceUrl,sourceDate:today,
    evidenceClass:'Published Public Ranking',
    confidence:disclosed?'Rank and displayed value visible in public table':'Rank and identity visible; exact value requires entity-level verification',
    dataQuality:disclosed?'Ranked with displayed value':'Ranked identity; value not displayed',
    established:`The cited public table identifies ${name} at source rank ${rank}${disclosed?` and displays ${value}`:''}.`,
    notEstablished:'The ranking does not establish beneficial ownership, voting control, liquidity, undisclosed leverage, coordination, misconduct or a current exact private balance sheet.',
    nextResearch:'Open the entity profile, audited report, regulator filing, official register and current ownership or governance disclosures.'
  };
}
function parseRankedTable(html,category,adapter){
  const rows=String(html).match(/<tr\b[\s\S]*?<\/tr>/gi)||[],out=[];
  for(const row of rows){
    const rawCells=row.match(/<t[dh]\b[\s\S]*?<\/t[dh]>/gi)||[];
    const cells=rawCells.map(stripHtml);
    if(cells.length<3)continue;
    const rank=Number((cells[0].match(/^\s*(\d{1,3})\.?\s*$/)||[])[1]||0);
    if(!rank||rank>100)continue;
    const anchors=[...rawCells[1].matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
      .map(m=>({href:m[1],text:stripHtml(m[2])})).filter(x=>x.text);
    const name=anchors[0]?.text||cells[1];
    if(!name||/^profile$/i.test(name))continue;
    const value=cells[2]||'';
    const type=cells[3]||adapter.entityType;
    const region=cells[4]||'';
    out.push(recordBase({category,rank,name,value,metric:adapter.metric,type,region,
      sourceUrl:absolute(adapter.url,anchors[0]?.href||adapter.url),sourceTitle:adapter.sourceTitle,
      capitalRole:adapter.capitalRole,status:adapter.status}));
  }
  return [...new Map(out.map(r=>[r.rank,r])).values()].sort((a,b)=>a.rank-b.rank).slice(0,100);
}
function parsePrivateEquity(html,category,adapter){
  const rows=String(html).match(/<tr\b[\s\S]*?<\/tr>/gi)||[],out=[];
  for(const row of rows){
    const rawCells=row.match(/<t[dh]\b[\s\S]*?<\/t[dh]>/gi)||[];
    const cells=rawCells.map(stripHtml);
    if(cells.length<4)continue;
    const rank=Number((cells[0].match(/^\s*(\d{1,3})\s*$/)||[])[1]||0);
    if(!rank||rank>100)continue;
    const anchors=[...rawCells[1].matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
      .map(m=>({href:m[1],text:stripHtml(m[2])})).filter(x=>x.text);
    const name=anchors[0]?.text||cells[1]; if(!name)continue;
    const hq=cells[2]||'',million=Number(String(cells[3]||'').replace(/[^\d.]/g,''));
    const value=Number.isFinite(million)&&million>0?`$${million.toLocaleString('en-US')} M`:'Not publicly displayed in ranking';
    const rec=recordBase({category,rank,name,value,metric:adapter.metric,type:adapter.entityType,region:hq,
      sourceUrl:absolute(adapter.url,anchors[0]?.href||adapter.url),sourceTitle:adapter.sourceTitle,
      capitalRole:adapter.capitalRole,status:adapter.status});
    rec.jurisdiction=hq; rec.headquarters=hq; rec.valueNumeric=Number.isFinite(million)?million*1e6:null;
    rec.established=`The cited 2026 PEI 300 table identifies ${name} at rank ${rank}${million?` with five-year fundraising of $${million.toLocaleString('en-US')} million`:''}.`;
    out.push(rec);
  }
  return [...new Map(out.map(r=>[r.rank,r])).values()].sort((a,b)=>a.rank-b.rank).slice(0,100);
}
async function fetchResponse(url,options={}){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);
  try{
    const response=await fetch(url,{...options,headers:{'user-agent':'MatrixReprogrammedPublicRecordBot/1.2 (+https://matrixreprogrammed.com/evidence-policy.html)','accept':'application/json,text/html;q=0.9',...(options.headers||{})},signal:controller.signal});
    if(!response.ok)throw new Error(`${response.status} ${response.statusText}`);
    return response;
  }finally{clearTimeout(timer)}
}
async function fetchText(url){return await (await fetchResponse(url)).text()}
async function fetchJson(url,options={}){return await (await fetchResponse(url,options)).json()}

function uniqueByName(rows){
  const seen=new Set(),out=[];
  for(const row of rows){const key=slug(row.name);if(!key||seen.has(key))continue;seen.add(key);out.push(row)}
  return out;
}
function researchRecord(category,name,sourceUrl,sourceTitle,entityType,capitalRole,reason){
  return {
    id:`${category}-${slug(name)}`,category,rank:null,sourceRank:null,name,ticker:'',jurisdiction:'',region:'',
    value:'Not uniformly disclosed',valueNumeric:null,fee:'',metric:'Public-record coverage',status:'Research coverage — entity verification required',
    entityType,subtype:entityType,capitalRole,sourceTitle,sourceUrl,sourceDate:today,evidenceClass:'Research Lead',
    confidence:'Named public-record research target; exact category position and value require verification',dataQuality:'Research lead',
    established:reason||'The entity is a named public-record research target relevant to this capital system.',
    notEstablished:'Inclusion does not establish an exact rank, asset value, beneficial ownership, control, coordination, misconduct or wrongdoing.',
    nextResearch:'Verify the entity against its latest official filing, audited report, regulator register, procurement record or court record.'
  };
}
function supplement(rows,existing,category,target=100,extraNames=[]){
  const out=uniqueByName(rows),seen=new Set(out.map(r=>slug(r.name)));
  for(const row of existing){
    if(out.length>=target)break;const key=slug(row.name);if(!key||seen.has(key))continue;seen.add(key);
    out.push({...row,id:`${category}-${key}`,category,rank:null,sourceRank:row.rank||row.sourceRank||null,
      status:'Supplemental public-record research lead',evidenceClass:row.evidenceClass||'Research Lead',
      confidence:'Supplemental identity — not part of the displayed ranked table',dataQuality:'Supplemental research lead'});
  }
  for(const name of extraNames){
    if(out.length>=target)break;const key=slug(name);if(seen.has(key))continue;seen.add(key);
    out.push(researchRecord(category,name,'https://www.sec.gov/edgar/search/','SEC EDGAR and entity disclosures','Family Office','Private family capital owner / allocator','The entity is publicly identified as a family-office or family-capital structure in institutional disclosures.'));
  }
  return out.slice(0,target);
}
function replaceCategory(registry,categoryId,rows,meta){
  registry.records=(registry.records||[]).filter(r=>r.category!==categoryId).concat(rows);
  const category=(registry.categories||[]).find(c=>c.id===categoryId);
  if(category)Object.assign(category,meta,{coverage:rows.length,sourceUrl:meta.sourceUrl||category.sourceUrl,lastChecked:today,adapter:meta.adapter||'public-record-complete-list'});
  registry.sources=(registry.sources||[]).filter(s=>s.name!==(category?.title||categoryId));
  registry.sources.push({name:category?.title||categoryId,url:meta.sourceUrl,checked:today});
}
async function buildUsaspending(existing){
  const url='https://api.usaspending.gov/api/v2/search/spending_by_category/recipient/';
  const payload={filters:{time_period:[{start_date:'2024-10-01',end_date:today}],award_type_codes:['A','B','C','D']},page:1,limit:100};
  const data=await fetchJson(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
  const results=data.results||data.category_results||[];
  const rows=results.map((x,i)=>{
    const name=x.name||x.recipient_name||x.label||'';if(!name)return null;
    const amount=Number(x.amount??x.aggregated_amount??x.value);
    const value=Number.isFinite(amount)?`$${amount.toLocaleString('en-US',{maximumFractionDigits:0})}`:'Not uniformly disclosed';
    return {
      id:`government-contractors-${slug(name)}`,category:'government-contractors',rank:i+1,sourceRank:i+1,name,ticker:'',
      jurisdiction:x.recipient_state_code||x.state_code||'United States',region:'United States',value,valueNumeric:Number.isFinite(amount)?amount:null,fee:'',
      metric:'Federal contract obligations',status:'Official USAspending recipient ranking',entityType:'Government Contractor',subtype:'Federal contract recipient',
      capitalRole:'Public-contract recipient',sourceTitle:'USAspending.gov spending by recipient',sourceUrl:'https://www.usaspending.gov/search',
      sourceDate:today,evidenceClass:'Official Procurement Data',confidence:'Official aggregated federal award data for the selected date range',
      dataQuality:'Official recipient aggregation',
      established:`USAspending identifies ${name} as a contract-award recipient in the selected period${Number.isFinite(amount)?` with aggregated obligations of ${value}`:''}.`,
      notEstablished:'Federal awards do not establish profit, beneficial ownership, political influence, misconduct, coordination or performance quality.',
      nextResearch:'Open recipient and award records to separate agencies, award IDs, periods, subsidiaries, modifications and contract purposes.',
      recipientId:x.recipient_id||x.code||x.uei||''
    };
  }).filter(Boolean);
  return supplement(rows,existing,'government-contractors',100);
}
async function buildFec(existing){
  const byId=new Map();
  for(let page=1;page<=5&&byId.size<120;page++){
    const url=`https://api.open.fec.gov/v1/reports/pac-party/?cycle=2026&per_page=100&page=${page}&sort=-total_receipts&api_key=DEMO_KEY`;
    const data=await fetchJson(url);
    for(const x of data.results||[]){
      const id=x.committee_id||'',name=x.committee_name||x.name||'';if(!name)continue;
      const receipts=Number(x.total_receipts);
      const prev=byId.get(id||slug(name));if(prev&&Number(prev.total_receipts)>=receipts)continue;
      byId.set(id||slug(name),x);
    }
  }
  let rows=[...byId.values()].sort((a,b)=>Number(b.total_receipts||0)-Number(a.total_receipts||0)).slice(0,100).map((x,i)=>{
    const name=x.committee_name||x.name,receipts=Number(x.total_receipts),id=x.committee_id||'';
    const value=Number.isFinite(receipts)?`$${receipts.toLocaleString('en-US',{maximumFractionDigits:0})}`:'Not uniformly disclosed';
    return {
      id:`political-money-${slug(id||name)}`,category:'political-money',rank:i+1,sourceRank:i+1,name,ticker:id,
      jurisdiction:x.state||'United States',region:'United States',value,valueNumeric:Number.isFinite(receipts)?receipts:null,fee:'',
      metric:'Reported receipts',status:'Official FEC filing snapshot',entityType:'Political Committee',subtype:x.committee_type||x.form_type||'FEC filer',
      capitalRole:'Political-money recipient and spender',sourceTitle:'Federal Election Commission committee reports',
      sourceUrl:id?`https://www.fec.gov/data/committee/${encodeURIComponent(id)}/`:'https://www.fec.gov/data/browse-data/',
      sourceDate:today,evidenceClass:'Official Regulatory Filing',confidence:'FEC-reported committee summary for the 2025–2026 cycle',
      dataQuality:'Official filing; coverage dates vary by filer',
      established:`The FEC filing identifies ${name} and reports${Number.isFinite(receipts)?` ${value} in total receipts`: ' committee financial activity'} for its available 2025–2026 reporting period.`,
      notEstablished:'Receipts or spending do not by themselves prove influence, coordination, corruption, illegal conduct or control over candidates or policy.',
      nextResearch:'Open reports, receipts, disbursements, independent expenditures, affiliated committees, donors and amendments; compare coverage dates.',
      coverageStart:x.coverage_start_date||'',coverageEnd:x.coverage_end_date||''
    };
  });
  if(rows.length<100){
    for(let page=1;page<=4&&rows.length<100;page++){
      const data=await fetchJson(`https://api.open.fec.gov/v1/committees/?cycle=2026&per_page=100&page=${page}&sort=name&api_key=DEMO_KEY`);
      for(const x of data.results||[]){
        const name=x.name||'',id=x.committee_id||'';if(!name||rows.some(r=>r.ticker===id||slug(r.name)===slug(name)))continue;
        rows.push({
          ...researchRecord('political-money',name,id?`https://www.fec.gov/data/committee/${encodeURIComponent(id)}/`:'https://www.fec.gov/data/browse-data/',
            'Federal Election Commission committee registry','Political Committee','Political-money recipient and spender',
            'The FEC committee registry identifies this filer and its organizational characteristics.'),
          ticker:id,jurisdiction:x.state||'United States',region:'United States',subtype:x.committee_type_full||x.committee_type||'FEC filer',
          evidenceClass:'Official Regulatory Registry',status:'FEC committee registry coverage'
        });
        if(rows.length>=100)break;
      }
    }
  }
  return supplement(rows,existing,'political-money',100);
}
function clonePhilanthropic(foundations){
  return foundations.slice(0,100).map((r,i)=>({
    ...r,id:`philanthropic-networks-${slug(r.name)}`,category:'philanthropic-networks',rank:r.rank||i+1,sourceRank:r.sourceRank||r.rank||i+1,
    status:'Foundation-linked philanthropic network coverage',entityType:'Philanthropic Network',subtype:r.subtype||r.entityType||'Foundation',
    capitalRole:'Philanthropic asset owner / grant allocator',
    established:`The cited source identifies ${r.name} as a foundation or endowed philanthropic institution; this network view maps the same disclosed entity as a grantmaking capital node.`,
    notEstablished:'Foundation status or grants do not by themselves establish control of recipients, policy outcomes, coordination, improper influence or wrongdoing.',
    nextResearch:'Open annual reports, grant databases, trustees, investment managers, donor-advised vehicles, recipients, programme restrictions and related entities.'
  }));
}
function buildAssetOwners(registry){
  const sourceCats=new Set(['pension-funds','sovereign-wealth-funds','foundations','trusts']);
  const rows=uniqueByName((registry.records||[]).filter(r=>sourceCats.has(r.category))).sort((a,b)=>{
    const av=Number(a.valueNumeric),bv=Number(b.valueNumeric),aa=Number.isFinite(av),bb=Number.isFinite(bv);
    if(aa!==bb)return bb-aa;if(aa&&bb&&bv!==av)return bv-av;
    return String(a.category).localeCompare(String(b.category))||(Number(a.sourceRank)||999)-(Number(b.sourceRank)||999);
  }).slice(0,100);
  return rows.map((r,i)=>({
    ...r,id:`asset-owners-${slug(r.name)}`,category:'asset-owners',rank:null,sourceRank:r.sourceRank||r.rank||null,compositeOrder:i+1,
    status:'Composite institutional asset-owner coverage',entityType:'Institutional Asset Owner',
    subtype:r.entityType||r.subtype||r.category,capitalRole:'Ultimate or beneficial institutional capital owner',
    metric:r.metric||'Reported assets',evidenceClass:r.evidenceClass||'Published Public Ranking',
    established:`The cited source identifies ${r.name} as a ${r.entityType||r.subtype||'capital-owning institution'} in its source category. Composite order is a research convenience, not a harmonised global rank.`,
    notEstablished:'Different source categories, reporting dates and accounting definitions are not directly comparable; inclusion does not establish control, coordination or misconduct.',
    nextResearch:'Normalize reporting dates, currencies, liabilities, beneficiary structure, governance, external managers and asset allocation before comparison.'
  }));
}
function patchCategoryPages(registry){
  for(const category of registry.categories||[]){
    const page=category.route,html=read(page);if(!html)continue;
    const title=String(category.title||'Money Intelligence');
    const description=String(category.description||'Public-record capital intelligence.');
    let next=html.replace(/<title>[^<]*\| Matrix Reprogrammed<\/title>/i,`<title>${title.replace(/&/g,'&amp;')} | Matrix Reprogrammed</title>`)
      .replace(/<meta name="description" content="[^"]*">/i,`<meta name="description" content="${description.replace(/&/g,'&amp;').replace(/"/g,'&quot;')}">`)
      .replace(/<div class="money-kicker">[\s\S]*?<\/div><h1>[\s\S]*?<\/h1><p class="lead">[\s\S]*?<\/p>/i,
        `<div class="money-kicker">${String(category.rankingStatus||'Public-record coverage').replace(/&/g,'&amp;')} · target coverage ${category.target||100}</div><h1>${title.toUpperCase().replace(/&/g,'&amp;')}</h1><p class="lead">${description.replace(/&/g,'&amp;')}</p>`);
    write(page,next);
  }
}
async function main(){
  const registry=readJson('data/money-intelligence-registry.json',null);
  if(!registry||!Array.isArray(registry.records)||!Array.isArray(registry.categories))throw new Error('Money intelligence registry is missing or invalid.');
  const original=new Map(registry.categories.map(c=>[c.id,(registry.records||[]).filter(r=>r.category===c.id)]));
  if(!REFRESH)console.log('Complete capital lists: refresh flag is off; preserving committed complete records where available.');

  for(const[categoryId,adapter]of Object.entries(SOURCE_ADAPTERS)){
    let rows=(registry.records||[]).filter(r=>r.category===categoryId);
    if(REFRESH||rows.length<100){
      try{
        const html=await fetchText(adapter.url);
        const parsed=adapter.parser==='private-equity'?parsePrivateEquity(html,categoryId,adapter):parseRankedTable(html,categoryId,adapter);
        if(parsed.length<adapter.min)throw new Error(`parsed ${parsed.length}; expected at least ${adapter.min}`);
        rows=supplement(parsed,original.get(categoryId)||[],categoryId,100,categoryId==='family-offices'?FAMILY_SUPPLEMENTS:[]);
        console.log(`Completed ${categoryId}: ${parsed.length} ranked rows, ${rows.length} covered.`);
      }catch(error){
        console.warn(`Complete list refresh failed for ${categoryId}: ${error.message}`);
        rows=supplement(rows,original.get(categoryId)||[],categoryId,100,categoryId==='family-offices'?FAMILY_SUPPLEMENTS:[]);
      }
    }
    replaceCategory(registry,categoryId,rows,{
      sourceUrl:adapter.url,sourceTitle:adapter.sourceTitle,metric:adapter.metric,rankingStatus:adapter.status,
      description:`${adapter.sourceTitle}. Values are shown only when publicly displayed; hidden or non-uniform figures remain explicitly undisclosed.`,
      adapter:'public-ranking-complete-list'
    });
  }

  let contractors=(registry.records||[]).filter(r=>r.category==='government-contractors');
  if(REFRESH||contractors.length<100){
    try{contractors=await buildUsaspending(original.get('government-contractors')||contractors)}
    catch(error){console.warn(`USAspending contractor refresh failed: ${error.message}`);contractors=supplement(contractors,[...(original.get('government-contractors')||[]),...(registry.records||[]).filter(r=>['defence-security','technology-control'].includes(r.category))],'government-contractors',100)}
  }
  replaceCategory(registry,'government-contractors',contractors,{
    sourceUrl:'https://www.usaspending.gov/search',metric:'Federal contract obligations',rankingStatus:'Official procurement snapshot plus research leads',
    description:'Top federal contract recipients for the selected USAspending period, supplemented only when necessary by clearly labelled public-procurement research leads.',
    adapter:'usaspending-recipient-ranking'
  });

  let political=(registry.records||[]).filter(r=>r.category==='political-money');
  if(REFRESH||political.length<100){
    try{political=await buildFec(original.get('political-money')||political)}
    catch(error){console.warn(`FEC political-money refresh failed: ${error.message}`);political=supplement(political,original.get('political-money')||[],'political-money',100)}
  }
  replaceCategory(registry,'political-money',political,{
    sourceUrl:'https://www.fec.gov/data/browse-data/',metric:'Reported receipts / disclosed political spending',rankingStatus:'Official FEC disclosure snapshot',
    description:'Federal political committees and money networks ordered by reported receipts where comparable, with coverage dates and filing limitations preserved.',
    adapter:'fec-disclosure-ranking'
  });

  const foundations=(registry.records||[]).filter(r=>r.category==='foundations');
  const philanthropic=clonePhilanthropic(foundations);
  replaceCategory(registry,'philanthropic-networks',philanthropic,{
    sourceUrl:SOURCE_ADAPTERS.foundations.url,metric:'Foundation assets and grantmaking network role',rankingStatus:'Foundation-linked public-record network snapshot',
    description:'A 100-entity philanthropic capital layer derived from disclosed foundation and endowed-institution records, designed for grant, trustee, manager and recipient mapping.',
    adapter:'foundation-network-derived'
  });

  const owners=buildAssetOwners(registry);
  replaceCategory(registry,'asset-owners',owners,{
    sourceUrl:'https://www.thinkingaheadinstitute.org/research-papers/the-asset-owner-100-2025/',metric:'Reported assets across owner classes',rankingStatus:'Composite public-record asset-owner coverage',
    description:'A cross-source view of pensions, sovereign funds, foundations and trust/endowment structures. Composite order is not presented as a harmonised global ranking.',
    adapter:'multi-source-asset-owner-composite'
  });

  const trustCategory=registry.categories.find(c=>c.id==='trusts');
  if(trustCategory)trustCategory.title='Top 100 Publicly Disclosed Trust & Endowment Structures';

  for(const category of registry.categories){
    const rows=(registry.records||[]).filter(r=>r.category===category.id);
    category.coverage=rows.length;category.ranked=rows.filter(r=>Number(r.rank)>0).length;
    category.verified=rows.filter(r=>/official|published public ranking|verified|regulatory|procurement/i.test(`${r.evidenceClass} ${r.status}`)).length;
    category.research=Math.max(0,rows.length-category.verified);category.lastChecked=today;
  }
  registry.version=Math.max(Number(registry.version)||0,4);
  registry.updated=now;
  registry.methodology='Every capital-system record preserves source, source date, measurement type, evidence class, what the record establishes and what it does not establish. Coverage may be complete even when values are private or non-comparable; ranks appear only when a cited source supports them.';
  registry.completeness={
    targetPerCategory:100,
    categoriesAtTarget:registry.categories.filter(c=>c.coverage>=100).length,
    totalCategories:registry.categories.length,
    completedAt:now,
    rule:'Coverage is not the same as verification or ranking. Hidden values remain hidden; research leads remain labelled.'
  };
  writeJson('data/money-intelligence-registry.json',registry);
  if(fs.existsSync(file(`data/history/money-intelligence/${today}.json`)))writeJson(`data/history/money-intelligence/${today}.json`,registry);
  const canonical=read('src/money-category-detailed.js');if(canonical)write('money-category.js',canonical);
  patchCategoryPages(registry);
  console.log(`Complete capital lists built: ${registry.records.length} records; ${registry.completeness.categoriesAtTarget}/${registry.completeness.totalCategories} categories at target.`);
}
if(require.main===module)main().catch(error=>{console.error(error.stack||error);process.exit(1)});
module.exports={main,parseRankedTable,parsePrivateEquity,buildAssetOwners};
