import fs from 'node:fs';
import path from 'node:path';

const outputDir=path.join(process.cwd(),'downloads','phase6-paypal-state-test');
fs.mkdirSync(outputDir,{recursive:true});
try{
  const testPath=path.join(process.cwd(),'scripts','phase6-paypal-state-test.mjs');
  const source=fs.readFileSync(testPath,'utf8')
    .replace("requiredStages:14","requiredStages:15")
    .replace("stages.length===14","stages.length===15")
    .replace("all 14 state stages","all 15 state stages");
  await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}catch(error){
  const failure={ok:false,failedAt:new Date().toISOString(),name:error?.name||'Error',message:String(error?.message||error),stack:String(error?.stack||error),boundary:'Diagnostic only. No real PayPal account, charge, subscription, member or production database was modified.'};
  fs.writeFileSync(path.join(outputDir,'failure.json'),JSON.stringify(failure,null,2)+'\n');
  console.error(failure.stack);
  process.exitCode=1;
}
