const fs=require('fs');
const path=require('path');
const quality=require('./search-quality-engine.js');
const root=process.cwd(),failures=[],checks=[];
const pass=(name,detail)=>checks.push({name,ok:true,detail});
const fail=(name,detail)=>{checks.push({name,ok:false,detail});failures.push(`${name}: ${detail}`);};

const groups={
  'household-energy':[
    'why7 has my eletric gine up','why has my electric gone up','why has my electricity bill gone up','electric bill higher','energy prices','standing charge increase','why is my power bill so high','my EDF bill increased','electricity unit rate went up','why did my tariff change','higher gas and electricity costs','supplier raised my energy price','electric meter bill increase','household power costs rising','why is the standing fee higher','what changed on my energy contract','electricity price cap increase','network charge on my bill','wholesale energy price effect','why am i paying more per kwh'
  ],
  'health-medical':[
    'AIDS policy costs','HIV treatment policy','hospital closure impact','vaccine contract health policy','why did medicine price rise','public health restriction','cancer treatment waiting list','pharma company trial','patient data policy','disease surveillance system'
  ],
  'government-policy':[
    'what law caused this restriction','government policy decision','parliament voted on the bill','which regulator approved it','ministry implementation plan','public authority decision','new legislation consequence','who had legal authority','government promised benefit','policy outcome review'
  ],
  'money-contracts':[
    'who received the public contract','procurement award value','company filing ownership','where did the grant money go','supplier profit after price rise','government spending contract','tender winner and amount','shareholder ownership filing','budget allocation outcome','public money trail'
  ],
  'courts-enforcement':[
    'court judgment outcome','lawsuit against company','who was convicted','appeal court ruling','legal case docket','enforcement action','sanctions court challenge','indicted public official','court publication record','judicial decision consequence'
  ],
  'disclosure-files':[
    'Epstein files redaction','missing public records','FOIA documents withheld','sealed court files','wikileaks archive documents','record removed from website','declassified file release','public disclosure delay','missing evidence document','redaction log'
  ],
  'power-networks':[
    'who controls BlackRock','billionaire foundation influence','elite family network','institutional power map','lobbying influence on policy','who controls the company','power network relationships','foundation board connections','corporate influence route','family office control'
  ],
  'information-media':[
    'media narrative change','news coverage of policy','censorship report','press investigation','journalism source record','broadcast coverage','information campaign','news report correction','media ownership influence','narrative tracking'
  ]
};
const noMatch=['purple unicorn weather','banana spaceship tax','invisible dragon permit','moon cheese orbit','telepathic toaster dream','underwater bicycle cloud','time travel rainbow','alien sandwich melody','ghost pineapple telescope','quantum potato orchestra'];
const fixtureMeta={
  'household-energy':['Household Electricity Bills and Tariffs','fixture-electricity.html','Energy bills'],
  'health-medical':['AIDS, HIV and Public Health Policy','fixture-aids.html','Health'],
  'government-policy':['Government Policy and Legislation','fixture-policy.html','Government policy'],
  'money-contracts':['Public Contracts and Company Filings','fixture-contracts.html','Money and contracts'],
  'courts-enforcement':['Court Records and Enforcement','fixture-courts.html','Courts'],
  'disclosure-files':['Disclosure Files and Missing Records','fixture-disclosure.html','Disclosure'],
  'power-networks':['Power Networks and Institutional Control','fixture-power.html','Power networks'],
  'information-media':['News, Media and Information','fixture-media.html','Information and media']
};
const fixtures=Object.entries(fixtureMeta).map(([domain,[title,url,category]],index)=>{
  const spec=quality.DOMAINS[domain];
  return {title,url,category,layer:domain,description:`${spec.label}. ${spec.terms.join(' ')} ${spec.phrases.join(' ')}.`,keywords:[...spec.terms,...spec.phrases],priority:domain==='health-medical'?120:10+index};
});
const total=Object.values(groups).reduce((n,list)=>n+list.length,0)+noMatch.length;
total>=100?pass('permanent benchmark size',`${total} cases`):fail('permanent benchmark size',`${total} cases`);

for(const [domain,queries] of Object.entries(groups)){
  for(const query of queries){
    const interpreted=quality.interpretQuery(query);
    interpreted.domain===domain?pass(`domain ${query}`,domain):fail(`domain ${query}`,`expected ${domain}, got ${interpreted.domain}; corrected=${interpreted.corrected}`);
    const outcome=quality.search(fixtures,query,{limit:10});
    if(!outcome.strong||!outcome.results.length){fail(`ranking ${query}`,'no strong fixture result');continue;}
    outcome.results[0]._itemDomain===domain?pass(`ranking ${query}`,outcome.results[0].url):fail(`ranking ${query}`,`expected ${domain}, got ${outcome.results[0]._itemDomain}`);
    if(domain==='household-energy'){
      const bad=outcome.results.slice(0,10).some(item=>/aids|hiv/i.test(`${item.title} ${item.url}`));
      bad?fail(`energy mismatch ${query}`,'AIDS/HIV appeared in top ten'):pass(`energy mismatch ${query}`,'health domain excluded');
    }
  }
}
for(const query of noMatch){
  const outcome=quality.search(fixtures,query,{limit:10});
  outcome.strong?fail(`no-match ${query}`,`unexpected ${outcome.results[0]?.url}`):pass(`no-match ${query}`,'honest low-confidence boundary');
}
const mandatory=quality.interpretQuery('why7 has my eletric gine up');
mandatory.corrected.includes('electricity bill')&&mandatory.domain==='household-energy'?pass('mandatory correction',mandatory.corrected):fail('mandatory correction',JSON.stringify(mandatory));

const actualPath=path.join(root,'search-index.json');
if(fs.existsSync(actualPath)){
  try{
    const actual=quality.search(JSON.parse(fs.readFileSync(actualPath,'utf8')),'why7 has my eletric gine up',{limit:10});
    const bad=actual.results.some(item=>/aids|hiv/i.test(`${item.title} ${item.category} ${item.description} ${(item.keywords||[]).join(' ')}`));
    bad?fail('actual-index energy/health separation','AIDS/HIV appeared in top ten'):pass('actual-index energy/health separation',actual.strong?actual.results.slice(0,3).map(x=>x.url).join(', '):'honest no-match');
  }catch(error){fail('actual-index evaluation',error.message);}
}else pass('actual-index evaluation','index not present before build; fixture benchmark completed');

const report={ok:failures.length===0,generatedAt:new Date().toISOString(),engineVersion:quality.VERSION,benchmarkCases:total,checks,failures};
fs.mkdirSync(path.join(root,'downloads'),{recursive:true});
fs.writeFileSync(path.join(root,'downloads','search-quality-benchmark.json'),`${JSON.stringify(report,null,2)}\n`);
if(failures.length){console.error(`SEARCH QUALITY BENCHMARK FAILED: ${failures.length}`);failures.slice(0,30).forEach(x=>console.error(`- ${x}`));process.exit(1);}
console.log(`Search quality benchmark passed: ${total} permanent queries, ${checks.length} checks.`);
