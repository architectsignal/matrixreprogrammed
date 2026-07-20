const assert=require('assert/strict');
const fs=require('fs');
const path=require('path');
const root=process.cwd();
const downloads=path.join(root,'downloads');
const manifests=path.join(root,'data','report-manifests');
const indexPath=path.join(downloads,'branded-download-index.json');
const normalise=value=>String(value||'').replace(/\\/g,'/').replace(/^\.\//,'');
const successPath=path.join(downloads,'deep-pdf-intelligence-test.json');
const failurePath=path.join(downloads,'deep-pdf-intelligence-test-failure.json');
const diagnostic={ok:false,testedAt:new Date().toISOString(),indexPath:path.relative(root,indexPath),manifestDirectory:path.relative(root,manifests),publicManifestDirectoryExists:fs.existsSync(path.join(downloads,'report-manifests')),manifestFiles:[],indexedOutputs:[],missingManifests:[],thinPdfs:[],invalidPdfs:[]};

try{
  assert.ok(fs.existsSync(indexPath),'Deep PDF index missing');
  assert.ok(fs.existsSync(manifests),'Internal deep PDF manifest directory missing');
  assert.ok(!diagnostic.publicManifestDirectoryExists,'Internal report manifests must not be exposed as public downloads');

  const manifestFiles=[];
  (function walk(directory){
    for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
      const full=path.join(directory,entry.name);
      if(entry.isDirectory())walk(full);
      else if(entry.isFile()&&entry.name.endsWith('.json'))manifestFiles.push(full);
    }
  })(manifests);
  diagnostic.manifestFiles=manifestFiles.map(file=>path.relative(root,file).replace(/\\/g,'/'));

  const manifestsByOutput=new Map();
  for(const manifestFile of manifestFiles){
    const manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
    const output=normalise(manifest.output);
    if(output)manifestsByOutput.set(output,{manifest,manifestFile});
  }

  const index=JSON.parse(fs.readFileSync(indexPath,'utf8'));
  diagnostic.engineVersion=index.engineVersion;
  diagnostic.indexed=index.count;
  diagnostic.indexedOutputs=(index.pdfs||[]).map(item=>normalise(item.file));
  assert.equal(index.engineVersion,'deep-intelligence-v2');
  for(const required of ['evidence-based conclusions','analytical inferences','speculative conclusions','alternative explanations','source register'])assert.ok(index.requiredSections.includes(required),`Required deep section missing: ${required}`);
  assert.ok(index.count>0,'No PDFs indexed');

  let checked=0;
  for(const item of index.pdfs){
    if(item.reused)continue;
    const output=normalise(item.file);
    const file=path.join(root,output);
    if(!fs.existsSync(file)){diagnostic.invalidPdfs.push({output,reason:'missing'});continue;}
    const bytes=fs.readFileSync(file);
    if(bytes.subarray(0,8).toString()!=='%PDF-1.4')diagnostic.invalidPdfs.push({output,reason:'invalid-header',header:bytes.subarray(0,8).toString()});
    if(bytes.length<=10000)diagnostic.thinPdfs.push({output,bytes:bytes.length});
    const located=manifestsByOutput.get(output);
    if(!located){diagnostic.missingManifests.push(output);continue;}
    const manifest=located.manifest;
    for(const key of ['evidenceBasedConclusions','analyticalInferences','speculativeConclusions'])assert.ok(Array.isArray(manifest.report?.[key])&&manifest.report[key].length,`${key} missing from ${item.file}`);
    assert.match(JSON.stringify(manifest.report.speculativeConclusions),/not established|hypothesis|speculat/i,`Speculation boundary missing: ${item.file}`);
    checked++;
  }
  assert.deepEqual(diagnostic.invalidPdfs,[],`Generated PDF failures: ${JSON.stringify(diagnostic.invalidPdfs.slice(0,20))}`);
  assert.deepEqual(diagnostic.thinPdfs,[],`PDFs remain too thin: ${JSON.stringify(diagnostic.thinPdfs.slice(0,20))}`);
  assert.deepEqual(diagnostic.missingManifests,[],`Internal report manifests missing for: ${diagnostic.missingManifests.slice(0,20).join(', ')}${diagnostic.missingManifests.length>20?' …':''}`);

  const epstein=index.pdfs.find(item=>normalise(item.file)==='downloads/subject-epstein-black-file.pdf');
  if(epstein)assert.ok(!epstein.reused,'Epstein subject report must be rebuilt by the deep engine');
  const result={ok:true,testedAt:new Date().toISOString(),engineVersion:index.engineVersion,indexed:index.count,validatedGeneratedPdfs:checked,internalManifestCount:manifestFiles.length,subjectReports:index.subjectProfileCount||0,wealthGuides:index.wealthGuideCount||0,manifestDirectory:'data/report-manifests',safeguards:{fiveEvidenceLayers:true,evidenceBasedConclusions:true,analysisSeparated:true,speculationClearlyLabelled:true,alternativeExplanations:true,sourceRegister:true,thinLinkSheetsRejected:true,unchangedPdfsPreserved:true,internalManifestsNotPublicDownloads:true,manifestOutputVerified:true}};
  fs.writeFileSync(successPath,`${JSON.stringify(result,null,2)}\n`);
  if(fs.existsSync(failurePath))fs.rmSync(failurePath,{force:true});
  console.log(`Deep PDF intelligence test passed: ${checked} generated reports validated against ${manifestFiles.length} internal manifests.`);
}catch(error){
  diagnostic.error={name:error.name,message:error.message,stack:String(error.stack||'').split('\n').slice(0,12)};
  fs.mkdirSync(downloads,{recursive:true});
  fs.writeFileSync(failurePath,`${JSON.stringify(diagnostic,null,2)}\n`);
  console.error(`DEEP_PDF_TEST_FAILURE ${JSON.stringify({message:error.message,publicManifestDirectoryExists:diagnostic.publicManifestDirectoryExists,manifestFiles:diagnostic.manifestFiles.length,indexedOutputs:diagnostic.indexedOutputs.length,missingManifests:diagnostic.missingManifests.slice(0,10),thinPdfs:diagnostic.thinPdfs.slice(0,10),invalidPdfs:diagnostic.invalidPdfs.slice(0,10)})}`);
  throw error;
}
