const fs=require('fs');
const path=require('path');
const root=process.cwd();
const fp=p=>path.join(root,p);
const ex=p=>fs.existsSync(fp(p));
const rd=p=>fs.readFileSync(fp(p),'utf8');
const wr=(p,v)=>{fs.mkdirSync(path.dirname(fp(p)),{recursive:true});fs.writeFileSync(fp(p),v)};
const js=(p,f={})=>{try{return JSON.parse(rd(p))}catch{return f}};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today=new Date();
const day=value=>{const d=new Date(value);return Number.isNaN(d.getTime())?null:d};
const ageDays=value=>{const d=day(value);return d===null?null:Math.max(0,Math.floor((today-d)/86400000));};
const verifiedRecord=record=>/verified|official|primary|regulator|court|government|public-record/i.test([record.evidenceClass,record.status,record.confidence].join(' '));
const numericRank=record=>Number.isFinite(Number(record.rank))&&Number(record.rank)>0;
const hasValue=record=>String(record.value||'').trim()||String(record.fee||'').trim();
const stripTop100=title=>String(title||'Money intelligence').replace(/^Top\s+100\s+/i,'').replace(/^Top\s+\d+\s+/i,'');

if(!ex('data/money-intelligence-registry.json'))process.exit(0);
const registry=js('data/money-intelligence-registry.json',{categories:[],records:[]});
const records=Array.isArray(registry.records)?registry.records:[];
const categoryAudits=[];
for(const category of registry.categories||[]){
 const categoryRecords=records.filter(record=>record.category===category.id);
 const target=Math.max(1,Number(category.target||100));
 const reviewed=categoryRecords.length;
 const ranked=categoryRecords.filter(numericRank).length;
 const verified=categoryRecords.filter(verifiedRecord).length;
 const research=Math.max(0,reviewed-verified);
 const blankValues=categoryRecords.filter(record=>!hasValue(record)).length;
 const missingToTarget=Math.max(0,target-reviewed);
 const completenessPct=Math.min(100,Math.round(reviewed/target*1000)/10);
 const sourceDates=categoryRecords.map(record=>day(record.sourceDate)).filter(Boolean).sort((a,b)=>b-a);
 const latestRecordDate=sourceDates[0]?sourceDates[0].toISOString().slice(0,10):category.lastChecked||null;
 const staleDays=ageDays(latestRecordDate);
 const complete=reviewed>=target;
 const baseTitle=stripTop100(category.title);
 category.originalTargetTitle=category.originalTargetTitle||category.title;
 category.title=complete?`Top ${target} ${baseTitle}`:`${baseTitle} — ${reviewed} reviewed routes (building to ${target})`;
 category.coverage=reviewed;
 category.reviewed=reviewed;
 category.ranked=ranked;
 category.verified=verified;
 category.research=research;
 category.missingToTarget=missingToTarget;
 category.blankValueCount=blankValues;
 category.completenessPct=completenessPct;
 category.lastChecked=latestRecordDate||category.lastChecked||null;
 category.freshnessStatus=staleDays===null?'No dated record':staleDays<=7?'Current dated snapshot':staleDays<=31?'Recent dated snapshot':`Stale review required (${staleDays} days)`;
 category.publicStatus=complete?`${reviewed}/${target} reviewed routes; ${verified} verified; ${blankValues} values undisclosed or missing.`:`Partial coverage: ${reviewed}/${target} reviewed routes; ${missingToTarget} still required; ${verified} verified; ${blankValues} values undisclosed or missing.`;
 category.rankingStatus=complete&&ranked>=target?category.rankingStatus:`Partial coverage — ${reviewed}/${target} reviewed; ${ranked} currently ranked`;
 category.refreshAdapter={...(category.refreshAdapter||{}),live:false,mode:'dated-public-record',lastSuccessfulRecordDate:latestRecordDate};
 categoryAudits.push({id:category.id,title:category.title,route:category.route,target,reviewed,ranked,verified,research,missingToTarget,blankValueCount:blankValues,completenessPct,lastChecked:category.lastChecked,freshnessStatus:category.freshnessStatus,sourceUrl:category.sourceUrl});
}
registry.updated=new Date().toISOString();
registry.coveragePolicy='A category may use “Top 100” only when 100 reviewed records exist. Partial watchlists display their exact reviewed count and missing-to-target gap. Blank values remain visibly undisclosed rather than invented.';
registry.auditSummary={categoryCount:categoryAudits.length,totalTarget:categoryAudits.reduce((n,c)=>n+c.target,0),totalReviewed:categoryAudits.reduce((n,c)=>n+c.reviewed,0),totalVerified:categoryAudits.reduce((n,c)=>n+c.verified,0),totalMissing:categoryAudits.reduce((n,c)=>n+c.missingToTarget,0),totalBlankValues:categoryAudits.reduce((n,c)=>n+c.blankValueCount,0),completeCategories:categoryAudits.filter(c=>c.reviewed>=c.target).length,partialCategories:categoryAudits.filter(c=>c.reviewed<c.target).length};
wr('data/money-intelligence-registry.json',JSON.stringify(registry,null,2)+'\n');

const wealth=js('data/follow-the-money-top-100.json',{});
const baselineAge=ageDays(wealth.baselineDate);
wealth.freshness={mode:'annual-baseline',isLive:false,baselineDate:wealth.baselineDate||null,lastSystemCheck:wealth.updated||null,baselineAgeDays:baselineAge,status:'Annual dated baseline. It is not a live net-worth feed.',nextAction:'Preserve the annual baseline and add separately dated live estimates only when a traceable source is available.'};
wr('data/follow-the-money-top-100.json',JSON.stringify(wealth,null,2)+'\n');

const audit={ok:true,updated:new Date().toISOString(),policy:registry.coveragePolicy,top100Freshness:wealth.freshness,summary:registry.auditSummary,categories:categoryAudits,priorityGaps:categoryAudits.filter(c=>c.missingToTarget||c.blankValueCount).sort((a,b)=>b.missingToTarget-a.missingToTarget||b.blankValueCount-a.blankValueCount)};
wr('data/money-intelligence-audit.json',JSON.stringify(audit,null,2)+'\n');
wr('downloads/money-intelligence-gaps.csv',['category,title,target,reviewed,ranked,verified,missing_to_target,blank_values,completeness_pct,last_checked,freshness_status',...categoryAudits.map(c=>[c.id,c.title,c.target,c.reviewed,c.ranked,c.verified,c.missingToTarget,c.blankValueCount,c.completenessPct,c.lastChecked||'',c.freshnessStatus].map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(','))].join('\n')+'\n');

function healthBlock(prefix=''){
 const s=registry.auditSummary;
 return `<!-- money-coverage-health:start --><section id="money-coverage-health" class="section wrap"><div class="money-kicker">Coverage and freshness audit</div><h2>WHAT IS COMPLETE, PARTIAL OR STILL MISSING?</h2><p class="lead">The money system now separates complete rankings from partial research watchlists. No 30-record list is presented as a finished Top 100.</p><div class="money-stat-grid"><div class="money-stat"><span>Reviewed records</span><strong>${s.totalReviewed}/${s.totalTarget}</strong></div><div class="money-stat"><span>Verified records</span><strong>${s.totalVerified}</strong></div><div class="money-stat"><span>Still required</span><strong>${s.totalMissing}</strong></div><div class="money-stat"><span>Blank / undisclosed values</span><strong>${s.totalBlankValues}</strong></div><div class="money-stat"><span>Complete categories</span><strong>${s.completeCategories}</strong></div><div class="money-stat"><span>Partial categories</span><strong>${s.partialCategories}</strong></div></div><div class="money-warning"><strong>Freshness boundary:</strong> the wealth ranking is an annual baseline dated ${esc(wealth.baselineDate||'unknown')}, not a live feed. Category pages show their last dated record and exact coverage.</div><div class="cta-row"><a class="btn" href="${prefix}data/money-intelligence-audit.json">Open Coverage Audit</a><a class="btn alt" href="${prefix}downloads/money-intelligence-gaps.csv">Download Missing-Data Queue</a><a class="btn alt" href="${prefix}money-graph.html">Open Money Graph</a></div></section><!-- money-coverage-health:end -->`;
}

if(ex('follow-the-money.html')){
 let html=rd('follow-the-money.html');
 html=html.replace(/<!-- money-coverage-health:start -->[\s\S]*?<!-- money-coverage-health:end -->/g,'');
 html=html.replace(/<div class="money-kicker">Public-record wealth intelligence · Baseline[^<]*<\/div>/,`<div class="money-kicker">Public-record wealth intelligence · Annual baseline ${esc(wealth.baselineDate||'undated')} · last system check ${esc(wealth.updated||'undated')}</div>`);
 html=html.includes('<section class="section wrap" id="top-100">')?html.replace('<section class="section wrap" id="top-100">',healthBlock('')+'<section class="section wrap" id="top-100">'):html.replace('</main>',healthBlock('')+'</main>');
 wr('follow-the-money.html',html);
}

for(const category of registry.categories||[]){
 const route=category.route;
 if(!route||!ex(route))continue;
 let html=rd(route);
 html=html.replace(/<!-- money-category-coverage:start -->[\s\S]*?<!-- money-category-coverage:end -->/g,'');
 html=html.replace(/<title>[\s\S]*?\| Matrix Reprogrammed<\/title>/,`<title>${esc(category.title)} | Matrix Reprogrammed</title>`);
 html=html.replace(/<h1>[\s\S]*?<\/h1>/,`<h1>${esc(category.title).toUpperCase()}</h1>`);
 html=html.replace(/<div class="money-kicker">[\s\S]*?<\/div>/,`<div class="money-kicker">${esc(category.rankingStatus)} · ${esc(category.freshnessStatus)}</div>`);
 const panel=`<!-- money-category-coverage:start --><section class="section wrap money-category-coverage"><div class="money-stat-grid"><div class="money-stat"><span>Reviewed</span><strong>${category.reviewed}/${category.target}</strong></div><div class="money-stat"><span>Ranked</span><strong>${category.ranked}</strong></div><div class="money-stat"><span>Verified</span><strong>${category.verified}</strong></div><div class="money-stat"><span>Still required</span><strong>${category.missingToTarget}</strong></div><div class="money-stat"><span>Blank / undisclosed values</span><strong>${category.blankValueCount}</strong></div><div class="money-stat"><span>Completeness</span><strong>${category.completenessPct}%</strong></div></div><p class="money-warning"><strong>Coverage boundary:</strong> ${esc(category.publicStatus)} Last dated record: ${esc(category.lastChecked||'not recorded')}.</p></section><!-- money-category-coverage:end -->`;
 html=html.replace('<section id="registry"',panel+'<section id="registry"');
 wr(route,html);
}

console.log(`Money intelligence coverage repaired: ${registry.auditSummary.totalReviewed}/${registry.auditSummary.totalTarget} reviewed, ${registry.auditSummary.totalMissing} missing, ${registry.auditSummary.totalBlankValues} blank values.`);
