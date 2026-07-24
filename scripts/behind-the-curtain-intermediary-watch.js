const fs=require('fs');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const write=(file,value)=>fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');
const profiles=[1,2,3].flatMap(n=>read(`data/behind-the-curtain-intermediaries-${String(n).padStart(2,'0')}.json`));
const sources=read('data/behind-the-curtain-intermediary-sources.json');
const sourceById=new Map(sources.map(x=>[x.id,x]));
const timeoutMs=Number(process.env.HIDDEN_HAND_SOURCE_TIMEOUT_MS||18000);
async function inspect(source){
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{
  const response=await fetch(source.url,{redirect:'follow',signal:controller.signal,headers:{'user-agent':'Matrix-Reprogrammed-Evidence-Watch/1.0','accept':'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.5'}});
  const text=(await response.text()).slice(0,600000);
  return {id:source.id,url:source.url,httpStatus:response.status,reachable:response.ok,text};
 }catch(error){return {id:source.id,url:source.url,httpStatus:null,reachable:false,error:String(error.message||error),text:''}}
 finally{clearTimeout(timer)}
}
(async()=>{
 const checkedAt=new Date().toISOString();
 const results=new Map();
 for(const source of sources){results.set(source.id,await inspect(source))}
 const flags=[];
 const healthProfiles=profiles.map(profile=>{
  const checks=profile.sourceIds.map(id=>results.get(id)).filter(Boolean);
  const reachable=checks.filter(x=>x.reachable);
  const haystack=reachable.map(x=>x.text.toLowerCase()).join('\n');
  const missingSignals=profile.roleSignals.filter(signal=>!haystack.includes(String(signal).toLowerCase()));
  const status=!reachable.length?'source_unreachable':missingSignals.length===profile.roleSignals.length?'role_signal_missing':'source_signals_present';
  if(status!=='source_signals_present')flags.push({profileId:profile.id,name:profile.name,status,missingSignals,sourceIds:profile.sourceIds});
  return {id:profile.id,name:profile.name,status,verifiedAt:profile.verifiedAt,nextReviewDue:profile.nextReviewDue,reachableSourceCount:reachable.length,sourceCount:checks.length,missingSignals};
 });
 const output={schemaVersion:1,checkedAt,mode:'automated_source_watch',status:flags.length?'review_required':'current',profileCount:profiles.length,sourceCount:sources.length,flaggedProfiles:flags.length,profiles:healthProfiles,flags,boundary:'Automated reachability and text-signal checks identify records for human review. They do not remove a person, confirm a replacement, upgrade a theory or publish an allegation.'};
 write('data/behind-the-curtain-intermediary-source-health.json',output);
 console.log(`Hidden-hand source watch complete: ${profiles.length} profiles, ${sources.length} sources, ${flags.length} review flags.`);
})().catch(error=>{console.error(error);process.exitCode=1});
