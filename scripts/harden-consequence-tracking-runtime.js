'use strict';

const fs=require('fs');
const path=require('path');
const root=process.cwd();
const evidenceFile=path.join(root,'src','worker-consequence-evidence.js');
const trackerFile=path.join(root,'src','worker-consequence-tracker.js');
const wranglerFile=path.join(root,'wrangler.toml');
const wranglerJsoncFile=path.join(root,'wrangler.jsonc');
for(const file of [evidenceFile,trackerFile,wranglerFile,wranglerJsoncFile])if(!fs.existsSync(file))throw new Error(`${path.relative(root,file)} is required`);
let evidence=fs.readFileSync(evidenceFile,'utf8');
let tracker=fs.readFileSync(trackerFile,'utf8');
let wrangler=fs.readFileSync(wranglerFile,'utf8');
let wranglerJsonc=fs.readFileSync(wranglerJsoncFile,'utf8');
const beforeEvidence=evidence,beforeTracker=tracker,beforeWrangler=wrangler,beforeWranglerJsonc=wranglerJsonc;
const evidenceNewline=evidence.includes('\r\n')?'\r\n':'\n';
const trackerNewline=tracker.includes('\r\n')?'\r\n':'\n';
const wranglerNewline=wrangler.includes('\r\n')?'\r\n':'\n';
const wranglerJsoncNewline=wranglerJsonc.includes('\r\n')?'\r\n':'\n';
evidence=evidence.replace(/\r\n/g,'\n');
tracker=tracker.replace(/\r\n/g,'\n');
wrangler=wrangler.replace(/\r\n/g,'\n');
wranglerJsonc=wranglerJsonc.replace(/\r\n/g,'\n');

const oldCurrent=`async function currentContracts(env,limit=100){
  const rows=await all(env.MEMBERS_DB.prepare('SELECT contract_id,title,route,action_date,source_url,evidence_route,accountability_question,evidence_boundary,terms_lock,outcome_verdict,current_version,next_checkpoint_days,next_due_at,review_state,updated_at FROM consequence_contracts WHERE active=1 ORDER BY action_date DESC LIMIT ?').bind(limit));
  const result=[];
  for(const row of rows){
    const latest=await first(env.MEMBERS_DB.prepare("SELECT checkpoint_days,version,overall_finding,confidence,summary,reviewed_at FROM consequence_outcome_assessments WHERE contract_id=? AND publication_status='published' ORDER BY reviewed_at DESC LIMIT 1").bind(row.contract_id));
    result.push({id:row.contract_id,title:row.title,route:row.route,actionDate:row.action_date,sourceUrl:row.source_url,evidenceRoute:row.evidence_route,accountabilityQuestion:row.accountability_question,evidenceBoundary:row.evidence_boundary,termsLock:row.terms_lock,outcomeVerdict:row.outcome_verdict,version:Number(row.current_version||1),nextCheckpointDays:row.next_checkpoint_days==null?null:Number(row.next_checkpoint_days),nextDueAt:row.next_due_at,reviewState:row.review_state,updatedAt:row.updated_at,latestAssessment:latest?{checkpointDays:Number(latest.checkpoint_days),version:Number(latest.version),overallFinding:latest.overall_finding,confidence:Number(latest.confidence),summary:latest.summary,reviewedAt:latest.reviewed_at}:null});
  }
  return result;
}`;
const newCurrent=`async function currentContracts(env,limit=100){
  const rows=await all(env.MEMBERS_DB.prepare(\`SELECT c.contract_id,c.title,c.route,c.action_date,c.source_url,c.evidence_route,c.accountability_question,c.evidence_boundary,c.terms_lock,c.outcome_verdict,c.current_version,c.next_checkpoint_days,c.next_due_at,c.review_state,c.updated_at,a.checkpoint_days assessment_checkpoint_days,a.version assessment_version,a.overall_finding assessment_finding,a.confidence assessment_confidence,a.summary assessment_summary,a.reviewed_at assessment_reviewed_at FROM consequence_contracts c LEFT JOIN consequence_outcome_assessments a ON a.id=(SELECT a2.id FROM consequence_outcome_assessments a2 WHERE a2.contract_id=c.contract_id AND a2.publication_status='published' ORDER BY a2.reviewed_at DESC LIMIT 1) WHERE c.active=1 ORDER BY c.action_date DESC LIMIT ?\`).bind(limit));
  return rows.map(row=>({id:row.contract_id,title:row.title,route:row.route,actionDate:row.action_date,sourceUrl:row.source_url,evidenceRoute:row.evidence_route,accountabilityQuestion:row.accountability_question,evidenceBoundary:row.evidence_boundary,termsLock:row.terms_lock,outcomeVerdict:row.outcome_verdict,version:Number(row.current_version||1),nextCheckpointDays:row.next_checkpoint_days==null?null:Number(row.next_checkpoint_days),nextDueAt:row.next_due_at,reviewState:row.review_state,updatedAt:row.updated_at,latestAssessment:row.assessment_version?{checkpointDays:Number(row.assessment_checkpoint_days),version:Number(row.assessment_version),overallFinding:row.assessment_finding,confidence:Number(row.assessment_confidence),summary:row.assessment_summary,reviewedAt:row.assessment_reviewed_at}:null}));
}`;
if(!evidence.includes(newCurrent)){
  if(!evidence.includes(oldCurrent))throw new Error('Consequence evidence currentContracts optimization target not found');
  evidence=evidence.replace(oldCurrent,newCurrent);
}

const retireLine=`  await env.MEMBERS_DB.prepare("UPDATE consequence_contracts SET active=0,updated_at=? WHERE active=1").bind(stamp).run();`;
if(!tracker.includes(retireLine)){
  const anchor=`  const manifest = await loadManifest(env);
  const sync = syncStatements(env, manifest.contracts, stamp);`;
  if(!tracker.includes(anchor))throw new Error('Consequence tracker manifest synchronization anchor not found');
  tracker=tracker.replace(anchor,`  const manifest = await loadManifest(env);\n${retireLine}\n  const sync = syncStatements(env, manifest.contracts, stamp);`);
}

const dedicatedCron='25 5 * * *';
const cronPattern=/crons\s*=\s*\[([^\]]*)\]/s;
const cronMatch=wrangler.match(cronPattern);
if(cronMatch){
  const crons=[...cronMatch[1].matchAll(/"([^"]+)"/g)].map(match=>match[1]);
  if(!crons.includes(dedicatedCron))crons.unshift(dedicatedCron);
  const unique=[...new Set(crons)];
  if(unique.length>5)throw new Error(`Configured cron count ${unique.length} exceeds Workers Free limit of five`);
  wrangler=wrangler.replace(cronPattern,`crons = [${unique.map(value=>`"${value}"`).join(', ')}]`);
}else{
  const triggerHeader='[triggers]';
  if(!wrangler.includes(triggerHeader))throw new Error('wrangler.toml is missing [triggers]');
  wrangler=wrangler.replace(triggerHeader,`${triggerHeader}\ncrons = ["${dedicatedCron}"]`);
}
const jsoncCronPattern=/"crons"\s*:\s*\[([^\]]*)\]/s;
const jsoncCronMatch=wranglerJsonc.match(jsoncCronPattern);
if(!jsoncCronMatch)throw new Error('wrangler.jsonc is missing triggers.crons');
const jsoncCrons=[...jsoncCronMatch[1].matchAll(/"([^"]+)"/g)].map(match=>match[1]);
if(!jsoncCrons.includes(dedicatedCron))jsoncCrons.unshift(dedicatedCron);
const uniqueJsonc=[...new Set(jsoncCrons)];
if(uniqueJsonc.length>5)throw new Error(`Configured JSONC cron count ${uniqueJsonc.length} exceeds Workers Free limit of five`);
wranglerJsonc=wranglerJsonc.replace(jsoncCronPattern,`"crons": [${uniqueJsonc.map(value=>`"${value}"`).join(', ')}]`);

evidence=evidence.replace(/\n/g,evidenceNewline);
tracker=tracker.replace(/\n/g,trackerNewline);
wrangler=wrangler.replace(/\n/g,wranglerNewline);
wranglerJsonc=wranglerJsonc.replace(/\n/g,wranglerJsoncNewline);
if(evidence!==beforeEvidence)fs.writeFileSync(evidenceFile,evidence);
if(tracker!==beforeTracker)fs.writeFileSync(trackerFile,tracker);
if(wrangler!==beforeWrangler)fs.writeFileSync(wranglerFile,wrangler);
if(wranglerJsonc!==beforeWranglerJsonc)fs.writeFileSync(wranglerJsoncFile,wranglerJsonc);
const checks={singleQueryPublicList:evidence.includes('LEFT JOIN consequence_outcome_assessments'),correlatedLatestAssessment:evidence.includes('a2.publication_status=\'published\''),retiresOldManifest:tracker.includes(retireLine),boundedManifest:tracker.includes('MAX_MANIFEST_CONTRACTS = 12'),dedicatedCron:wrangler.includes(`"${dedicatedCron}"`)&&wranglerJsonc.includes(`"${dedicatedCron}"`),cronSlotsAtMostFive:((wrangler.match(cronPattern)||['',''])[1].match(/"[^"]+"/g)||[]).length<=5&&((wranglerJsonc.match(jsoncCronPattern)||['',''])[1].match(/"[^"]+"/g)||[]).length<=5};
if(!Object.values(checks).every(Boolean))throw new Error(`Consequence tracking hardening incomplete: ${JSON.stringify(checks)}`);
fs.mkdirSync(path.join(root,'downloads'),{recursive:true});
fs.writeFileSync(path.join(root,'downloads','consequence-tracking-runtime-hardening.json'),`${JSON.stringify({ok:true,generatedAt:new Date().toISOString(),changedEvidence:evidence!==beforeEvidence,changedTracker:tracker!==beforeTracker,changedWrangler:wrangler!==beforeWrangler,changedWranglerJsonc:wranglerJsonc!==beforeWranglerJsonc,estimatedMaximumD1QueriesPerDailyRun:44,checks},null,2)}\n`);
console.log(`Consequence tracking runtime hardened (evidence ${evidence===beforeEvidence?'current':'optimized'}, tracker ${tracker===beforeTracker?'current':'retirement added'}, cron ${wrangler===beforeWrangler?'current':'restored'}).`);
