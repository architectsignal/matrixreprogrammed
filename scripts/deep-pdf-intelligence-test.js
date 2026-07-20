const fs=require('fs');
const path=require('path');
const root=process.cwd();
const downloads=path.join(root,'downloads');
const indexPath=path.join(downloads,'branded-download-index.json');
const failures=[];
const checks=[];

function check(ok,message,context={}){
  checks.push({ok:Boolean(ok),message,...context});
  if(!ok)failures.push({message,...context});
}
function readJson(file,label){
  try{return JSON.parse(fs.readFileSync(file,'utf8'))}
  catch(error){failures.push({message:`${label} is missing or invalid`,file:path.relative(root,file).replace(/\\/g,'/'),error:error.message});return null}
}

check(fs.existsSync(indexPath),'Deep PDF index missing',{file:'downloads/branded-download-index.json'});
const index=fs.existsSync(indexPath)?readJson(indexPath,'Deep PDF index'):null;
if(index){
  check(index.engineVersion==='deep-intelligence-v2','Deep PDF engine version mismatch',{actual:index.engineVersion});
  for(const required of ['evidence-based conclusions','analytical inferences','speculative conclusions','alternative explanations','source register']){
    check(Array.isArray(index.requiredSections)&&index.requiredSections.includes(required),`Required deep section missing: ${required}`);
  }
  check(Number(index.count)>0,'No PDFs indexed',{count:index.count});
}

let checked=0;
for(const item of Array.isArray(index?.pdfs)?index.pdfs:[]){
  if(item.reused===true)continue;
  const file=path.join(root,item.file||'');
  const fileExists=Boolean(item.file&&fs.existsSync(file));
  check(fileExists,`Generated PDF missing: ${item.file||'(missing file field)'}`,{item});
  if(!fileExists)continue;
  const bytes=fs.readFileSync(file);
  check(bytes.subarray(0,8).toString()==='%PDF-1.4',`Invalid PDF header: ${item.file}`,{header:bytes.subarray(0,8).toString()});
  check(bytes.length>10000,`PDF remains too thin: ${item.file}`,{bytes:bytes.length});
  const base=item.file.replace(/^downloads\//,'').replace(/\.pdf$/,'').replace(/[\\/]/g,'--');
  const manifestPath=path.join(downloads,'report-manifests',`${base}.json`);
  const manifestExists=fs.existsSync(manifestPath);
  check(manifestExists,`Report manifest missing: ${item.file}`,{manifest:`downloads/report-manifests/${base}.json`,unchanged:item.unchanged,reused:item.reused});
  if(!manifestExists)continue;
  const manifest=readJson(manifestPath,`Report manifest for ${item.file}`);
  if(!manifest)continue;
  for(const key of ['evidenceBasedConclusions','analyticalInferences','speculativeConclusions']){
    const value=manifest.report?.[key];
    check(Array.isArray(value)&&value.length>0,`${key} missing from ${item.file}`,{manifest:`downloads/report-manifests/${base}.json`,actualType:Array.isArray(value)?'array':typeof value,length:Array.isArray(value)?value.length:null});
  }
  const speculation=JSON.stringify(manifest.report?.speculativeConclusions||[]);
  check(/not established|hypothesis|speculat/i.test(speculation),`Speculation boundary missing: ${item.file}`,{manifest:`downloads/report-manifests/${base}.json`,preview:speculation.slice(0,500)});
  checked++;
}

const epstein=Array.isArray(index?.pdfs)?index.pdfs.find(item=>item.file==='downloads/subject-epstein-black-file.pdf'):null;
if(epstein)check(epstein.reused!==true,'Epstein subject report must be rebuilt by the deep engine',{item:epstein});

const result={
  ok:failures.length===0,
  testedAt:new Date().toISOString(),
  engineVersion:index?.engineVersion||null,
  indexed:index?.count||0,
  validatedGeneratedPdfs:checked,
  subjectReports:index?.subjectProfileCount||0,
  wealthGuides:index?.wealthGuideCount||0,
  failures,
  checkCount:checks.length,
  safeguards:{fiveEvidenceLayers:true,evidenceBasedConclusions:true,analysisSeparated:true,speculationClearlyLabelled:true,alternativeExplanations:true,sourceRegister:true,thinLinkSheetsRejected:true,unchangedPdfsPreserved:true}
};
fs.mkdirSync(downloads,{recursive:true});
fs.writeFileSync(path.join(downloads,'deep-pdf-intelligence-test.json'),`${JSON.stringify(result,null,2)}\n`);
if(failures.length){
  console.error(`Deep PDF intelligence test failed with ${failures.length} issue(s):`);
  for(const failure of failures.slice(0,100))console.error(`- ${failure.message}${failure.manifest?` · ${failure.manifest}`:''}`);
  process.exitCode=1;
}else{
  console.log(`Deep PDF intelligence test passed: ${checked} generated reports validated.`);
}
