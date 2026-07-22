import fs from 'node:fs';
import path from 'node:path';

const outputDir=path.join(process.cwd(),'downloads','phase5-auth-entitlement-test');
fs.mkdirSync(outputDir,{recursive:true});
try{
  const testPath=path.join(process.cwd(),'scripts','phase5-auth-entitlement-test.mjs');
  const migrationMarker="db.exec(fs.readFileSync(path.join(root,'migrations/phase5_member_experience.sql'),'utf8'));";
  const migrationReplacement=migrationMarker+"\ndb.exec(fs.readFileSync(path.join(root,'migrations/phase5_member_experience_timestamp_fix.sql'),'utf8'));";
  const legacyCookieAssertion="assert(setCookie.includes('matrix_session=')&&setCookie.includes('HttpOnly')&&setCookie.includes('Secure')&&setCookie.includes('SameSite=Lax'),'Secure session cookie flags missing')";
  const currentCookieAssertion="assert(setCookie.includes('matrix_session_v2=')&&setCookie.includes('HttpOnly')&&setCookie.includes('Secure')&&setCookie.includes('SameSite=Lax'),'Current secure session cookie flags missing')";
  const source=fs.readFileSync(testPath,'utf8');
  if(!source.includes(migrationMarker))throw new Error('Phase 5 fixture migration marker is missing');
  let patched=source.replace(migrationMarker,migrationReplacement);
  if(patched.includes(legacyCookieAssertion))patched=patched.replace(legacyCookieAssertion,currentCookieAssertion);
  else if(!patched.includes(currentCookieAssertion))throw new Error('Phase 5 current session-cookie assertion marker is missing');
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
  console.error(`PHASE 5 FAILURE: ${failure.message}`);
  console.error(failure.stack);
  process.exitCode=1;
}
