const fs=require('fs');
const path=require('path');
const {parsePayload,hash}=require('./source-adapter-core.js');

const root=process.cwd();
const registryPath=path.join(root,'data','source-adapter-registry.json');
const outputPath=path.join(root,'data','source-evidence-records.json');
const reportPath=path.join(root,'downloads','source-adapter-run.json');
const htmlPath=path.join(root,'public-source-evidence.html');
const markdownPath=path.join(root,'downloads','source-evidence-records.md');
fs.mkdirSync(path.join(root,'downloads'),{recursive:true});

function readJson(file,fallback){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return fallback;}}
function esc(value){return String(value||'').replace(/[&<>"']/g,c=>c==='&'?'&amp;':c==='<'?'&lt;':c==='>'?'&gt;':c==='"'?'&quot;':'&#39;');}
async function mapLimit(values,limit,fn){const out=new Array(values.length);let cursor=0;async function worker(){while(cursor<values.length){const i=cursor++;out[i]=await fn(values[i]);}}await Promise.all(Array.from({length:Math.max(1,Math.min(limit,values.length||1))},worker));return out;}

const registry=readJson(registryPath,null);
if(!registry||!Array.isArray(registry.sources))throw new Error('data/source-adapter-registry.json is missing or invalid');
const previous=readJson(outputPath,{records:[]});
const retrievedAt=new Date().toISOString();
const mode=String(process.argv[2]||process.env.SOURCE_ADAPTER_MODE||'daily').toLowerCase();
const selected=registry.sources.filter(source=>(source.frequency||[]).includes(mode)&&source.enabled!==false);
const USER_AGENT=process.env.SOURCE_ADAPTER_USER_AGENT||'MatrixReprogrammedSourceAdapters/1.0 njmgroupfrance@gmail.com';
const MAX_BYTES=8*1024*1024;

async function fetchSource(source){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),Number(source.timeoutMs||25000));
  try{
    const response=await fetch(source.url,{redirect:'follow',signal:controller.signal,headers:{'user-agent':USER_AGENT,accept:source.format==='json'?'application/json,*/*':'text/html,application/rss+xml,application/atom+xml,application/xml,*/*'}});
    const body=await response.text();
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    if(Buffer.byteLength(body)>MAX_BYTES)throw new Error(`body too large: ${Buffer.byteLength(body)}`);
    const records=parsePayload(source,body,response.headers.get('content-type')||'',retrievedAt);
    return {sourceId:source.id,label:source.label,status:'fetched',statusCode:response.status,finalUrl:response.url,bytes:Buffer.byteLength(body),bodyHash:hash(body),records};
  }catch(error){
    return {sourceId:source.id,label:source.label,status:error.name==='AbortError'?'failed-timeout':'failed-request',error:error.message,records:[]};
  }finally{clearTimeout(timer);}
}

function mergeRecords(current){
  const map=new Map((previous.records||[]).map(record=>[record.id,record]));
  for(const record of current)map.set(record.id,record);
  return [...map.values()].sort((a,b)=>new Date(b.publicationDate)-new Date(a.publicationDate)).slice(0,3000);
}
function buildHtml(records,results){
  const cards=records.slice(0,300).map(record=>`<article class="card redline" data-source-category="${esc(record.sourceCategory)}"><span class="label">${esc(record.evidenceClassification)}</span><h2>${esc(record.title)}</h2><p>${esc(record.summary)}</p><p><strong>Publisher:</strong> ${esc(record.publisher)} · <strong>Jurisdiction:</strong> ${esc(record.jurisdiction)} · <strong>Published:</strong> ${esc(record.publicationDate.slice(0,10))}</p><p><strong>Evidence boundary:</strong> ${esc(record.evidenceBoundary)}</p><div class="cta-row small"><a class="btn" href="${esc(record.itemUrl)}" rel="noopener noreferrer">Open original source</a></div></article>`).join('');
  const failed=results.filter(item=>item.status!=='fetched');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>Public Source Evidence | Matrix Reprogrammed</title><meta name="description" content="Official legislation, energy regulation, statistics, parliamentary records, company filings, procurement notices, court publications and clearly labelled news signals."/><link rel="stylesheet" href="styles.css"/><link rel="stylesheet" href="fixes.css"/></head><body><div class="page"><header class="wrap topbar"><a class="brand" href="index.html">MATRIX REPROGRAMMED</a><nav class="nav"><a href="search.html">Search</a><a href="evidence-vault.html">Evidence Vault</a><a href="public-record-intake.html">Source Intake</a></nav></header><main><section class="hero wrap"><div class="eyebrow">Phase 2 · Information Supply</div><h1>PUBLIC SOURCE EVIDENCE.</h1><p class="lead">Official records and clearly labelled secondary signals, normalized without converting AI summaries into evidence.</p><p>${records.length} retained records from ${results.filter(x=>x.status==='fetched').length} fetched sources. ${failed.length} source failure(s) are recorded, not hidden.</p></section><section class="section wrap grid">${cards||'<article class="card redline"><h2>No current records</h2><p>The source adapters have not completed a successful pull yet. Existing Matrix evidence remains available.</p></article>'}</section></main></div></body></html>`;
}
function buildMarkdown(records,results){
  const lines=['# Matrix Public Source Evidence','',`Generated: ${retrievedAt}`,`Records: ${records.length}`,'',registry.evidenceBoundary,''];
  for(const record of records.slice(0,500)){
    lines.push(`## ${record.title}`,'',`- Publisher: ${record.publisher}`,`- Jurisdiction: ${record.jurisdiction}`,`- Published: ${record.publicationDate}`,`- Classification: ${record.evidenceClassification}`,`- Source: ${record.itemUrl}`,'',record.summary,'',`Evidence boundary: ${record.evidenceBoundary}`,'');
  }
  lines.push('## Source run status','');
  for(const result of results)lines.push(`- ${result.label}: ${result.status}${result.error?` — ${result.error}`:''}`);
  return `${lines.join('\n')}\n`;
}

(async()=>{
  if(typeof fetch!=='function')throw new Error('Node 18+ fetch is required');
  const results=await mapLimit(selected,Number(process.env.SOURCE_ADAPTER_CONCURRENCY||3),fetchSource);
  const fetched=results.flatMap(result=>result.records||[]);
  const records=mergeRecords(fetched);
  const payload={
    version:registry.version,
    updated:retrievedAt,
    mission:registry.mission,
    evidenceBoundary:registry.evidenceBoundary,
    sourceCount:registry.sources.length,
    selectedSourceCount:selected.length,
    successfulSourceCount:results.filter(result=>result.status==='fetched').length,
    degraded:results.some(result=>result.status!=='fetched'),
    recordCount:records.length,
    records
  };
  fs.writeFileSync(outputPath,`${JSON.stringify(payload,null,2)}\n`);
  fs.writeFileSync(htmlPath,buildHtml(records,results));
  fs.writeFileSync(markdownPath,buildMarkdown(records,results));
  const report={ok:results.some(result=>result.status==='fetched')||records.length>0,generatedAt:retrievedAt,mode,selectedSources:selected.length,fetchedSources:results.filter(r=>r.status==='fetched').length,failedSources:results.filter(r=>r.status!=='fetched').length,newRecords:fetched.length,retainedRecords:records.length,results:results.map(({records,...rest})=>({...rest,recordCount:records.length}))};
  fs.writeFileSync(reportPath,`${JSON.stringify(report,null,2)}\n`);
  if(!report.ok&&String(process.env.SOURCE_ADAPTER_STRICT||'').toLowerCase()==='true'){console.error('SOURCE ADAPTER RUN FAILED: no current or retained records');process.exit(1);}
  console.log(`Source adapters complete: ${report.fetchedSources}/${selected.length} sources fetched, ${records.length} evidence records retained${report.failedSources?` (${report.failedSources} degraded source(s))`:''}.`);
})().catch(error=>{console.error(error.stack||error.message);process.exit(1);});
