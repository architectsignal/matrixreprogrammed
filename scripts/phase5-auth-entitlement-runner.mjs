import fs from 'node:fs';
import path from 'node:path';

const outputDir=path.join(process.cwd(),'downloads','phase5-auth-entitlement-test');
fs.mkdirSync(outputDir,{recursive:true});
try{
  const testPath=path.join(process.cwd(),'scripts','phase5-auth-entitlement-test.mjs');
  const marker="db.exec(fs.readFileSync(path.join(root,'migrations/phase5_member_experience.sql'),'utf8'));";
  const replacement=marker+"\ndb.exec(fs.readFileSync(path.join(root,'migrations/phase5_member_experience_timestamp_fix.sql'),'utf8'));";
  const source=fs.readFileSync(testPath,'utf8');
  if(!source.includes(marker))throw new Error('Phase 5 fixture migration marker is missing');
  const patched=source.replace(marker,replacement);
  await import(`data:text/javascript;base64,${Buffer.from(patched).toString('base64')}`);
}catch(error){
  const failure={
    ok:false,
    failedAt:new Date().toISOString(),
    name:error?.name||'Error',
    message:String(error?.message||error),
    stack:String(error?.stack||error),
    boundary:'Diagnostic only. No production database, member, session, payment or protected file was modified.'
  };
  fs.writeFileSync(path.join(outputDir,'failure.json'),JSON.stringify(failure,null,2)+'\n');
  console.error(failure.stack);
  process.exitCode=1;
}
