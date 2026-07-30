const fs=require('fs');
const path=require('path');
const core=require('./source-adapter-core.js');
const failures=[],checks=[];
const pass=(name,detail)=>checks.push({name,ok:true,detail});
const fail=(name,detail)=>{checks.push({name,ok:false,detail});failures.push(`${name}: ${detail}`);};
const now='2026-07-30T00:00:00.000Z';
const sources={
  rss:{id:'rss',category:'parliament',label:'Parliament',publisher:'Assemblée nationale',jurisdiction:'France',sourceQuality:'A',evidenceClassification:'official-parliamentary-record',format:'rss',url:'https://example.test/rss',keywords:['energy']},
  html:{id:'html',category:'regulator',label:'Regulator',publisher:'CRE',jurisdiction:'France',sourceQuality:'A',evidenceClassification:'official-regulator-publication',format:'html',url:'https://example.test/news',keywords:['electricity']},
  ods:{id:'ods',category:'procurement',label:'Procurement',publisher:'BOAMP',jurisdiction:'France',sourceQuality:'A',evidenceClassification:'official-procurement-record',format:'json',parser:'opendatasoft-records',url:'https://example.test/api',keywords:['electricity']},
  euro:{id:'euro',category:'official-statistics',label:'Electricity prices',publisher:'Eurostat',jurisdiction:'EU / France',sourceQuality:'A',evidenceClassification:'official-statistics',format:'json',parser:'eurostat-jsonstat',url:'https://example.test/euro',officialDocs:'https://example.test/docs',keywords:['electricity']}
};
const rss=`<rss><channel><item><title>Energy bill committee report</title><link>https://example.test/report</link><description>Official report</description><pubDate>Wed, 29 Jul 2026 10:00:00 GMT</pubDate></item></channel></rss>`;
const html=`<html><head><title>CRE news</title></head><body><a href="/electricity-tariff">Electricity tariff decision</a></body></html>`;
const ods={results:[{objet:'Electricity supply contract',nomacheteur:'City Council',titulaire:'Energy Supplier',dateparution:'2026-07-29',url_avis:'https://example.test/award'}]};
const euro={label:'Electricity prices',updated:'2026-07-29',id:['geo','time'],size:[1,2],dimension:{geo:{category:{index:{FR:0},label:{FR:'France'}}},time:{category:{index:{'2025-S1':0,'2025-S2':1},label:{'2025-S1':'2025 first semester','2025-S2':'2025 second semester'}}}},value:[0.25,0.27]};
const records=[
  ...core.parsePayload(sources.rss,rss,'application/rss+xml',now),
  ...core.parsePayload(sources.html,html,'text/html',now),
  ...core.parsePayload(sources.ods,JSON.stringify(ods),'application/json',now),
  ...core.parsePayload(sources.euro,JSON.stringify(euro),'application/json',now)
];
records.length===5?pass('fixture record count',records.length):fail('fixture record count',records.length);
for(const record of records){
  for(const field of ['publisher','publicationDate','jurisdiction','entities','claims','sourceQuality','evidenceClassification','itemUrl','rawHash','evidenceBoundary']){
    const ok=record[field]!==undefined&&record[field]!==null&&(Array.isArray(record[field])||String(record[field]).length>0);
    ok?pass(`${record.sourceId} ${field}`,'present'):fail(`${record.sourceId} ${field}`,'missing');
  }
  record.analysisGeneratedByAI===false?pass(`${record.sourceId} AI boundary`,'false'):fail(`${record.sourceId} AI boundary`,String(record.analysisGeneratedByAI));
  record.claims.every(claim=>claim.sourceUrl===record.itemUrl)?pass(`${record.sourceId} claim provenance`,'bound to source'):fail(`${record.sourceId} claim provenance`,'source mismatch');
}
const report={ok:failures.length===0,generatedAt:new Date().toISOString(),checks,failures};
fs.mkdirSync(path.join(process.cwd(),'downloads'),{recursive:true});
fs.writeFileSync(path.join(process.cwd(),'downloads','source-adapter-contract-test.json'),`${JSON.stringify(report,null,2)}\n`);
if(failures.length){console.error(`SOURCE ADAPTER CONTRACT TEST FAILED: ${failures.length}`);failures.forEach(x=>console.error(`- ${x}`));process.exit(1);}
console.log(`Source adapter contract test passed: ${records.length} records, ${checks.length} schema and provenance checks.`);
