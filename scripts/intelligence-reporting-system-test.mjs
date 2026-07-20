import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root=process.cwd();
const modulePath=path.join(root,'src','worker-intelligence-reports.js');
const analysisPath=path.join(root,'src','worker-intelligence-analysis.js');
const productionPath=path.join(root,'src','worker-production.js');
const emailPath=path.join(root,'src','worker-email-lifecycle.js');
const wranglerPath=path.join(root,'wrangler.jsonc');
const repairPath=path.join(root,'scripts','repair-email-subscription-delivery.js');
const deepInstallPath=path.join(root,'scripts','install-deep-pdf-intelligence.js');
const reportPath=path.join(root,'downloads','intelligence-reporting-system-test.json');
for(const required of [modulePath,analysisPath,productionPath,emailPath,wranglerPath,repairPath,deepInstallPath])assert.ok(fs.existsSync(required),`Required file missing: ${path.relative(root,required)}`);
await import(`${pathToFileURL(repairPath).href}?repair=${Date.now()}`);
await import(`${pathToFileURL(deepInstallPath).href}?install=${Date.now()}`);
const reporting=await import(`${pathToFileURL(modulePath).href}?test=${Date.now()}`);
const analysis=await import(`${pathToFileURL(analysisPath).href}?test=${Date.now()}`);
assert.equal(typeof reporting.__test?.buildReportDraft,'function');
assert.equal(typeof analysis.enrichIntelligenceReport,'function');
assert.equal(typeof analysis.buildDeepIntelligencePdf,'function');

const assets=[{pathname:'/data/daily-brain-brief.json',data:{generatedAt:'2026-07-19T15:00:00.000Z',records:[
{id:'white-house-trump-order',title:'President Donald Trump signs a new executive order',summary:'The official order changes administration policy and sets an implementation deadline.',publisher:'The White House',sourceUrl:'https://www.whitehouse.gov/presidential-actions/example',eventDate:'2026-07-19T10:00:00.000Z',publishedAt:'2026-07-19T10:30:00.000Z',status:'confirmed',people:['Donald Trump']},
{id:'court-trump-filing',title:'Court filing concerning Donald Trump is amended',summary:'The court docket records an amended filing and a future response date.',institution:'United States District Court',sourceUrl:'https://www.courtlistener.com/docket/example',eventDate:'2026-07-18T14:00:00.000Z',publishedAt:'2026-07-18T15:00:00.000Z',evidenceStatus:'reported',parties:['Donald Trump']},
{id:'trump-correction',title:'Agency corrects an earlier Donald Trump record',summary:'The agency replaced an earlier date and published a correction notice.',agency:'Official agency correction desk',route:'/source-changes.html#trump-correction',eventDate:'2026-07-19T12:00:00.000Z',status:'corrected',actors:['Donald Trump']},
{id:'unrelated-weather',title:'Regional weather outlook',summary:'Temperatures are expected to rise.',publisher:'Weather office',publishedAt:'2026-07-19T08:00:00.000Z',status:'confirmed'}]}},{pathname:'/data/relationship-registry.json',data:{relationships:[{id:'trump-contract-relationship',title:'Donald Trump administration contract relationship',summary:'A public procurement record identifies the agency, contractor and contract date.',publisher:'US procurement record',sourceUrl:'https://sam.gov/example',eventDate:'2026-07-17T09:00:00.000Z',evidenceGrade:'A',people:['Donald Trump'],organizations:['Example Contractor']}]}}];
const tracker={key:'watch:person:donald-trump',targetId:'donald-trump',label:'Donald Trump',type:'entity',route:'/search.html?q=Donald%20Trump',criteria:{aliases:['President Trump']}};
const rawDraft=reporting.__test.buildReportDraft({kind:'daily',member:{id:'member-test',tier:'intelligence_6',display_name:'Test Reader'},profile:{depth:'forensic',include_history:1,include_speculation:1,include_raw_sources:1},trackers:[tracker],assets,previous:{sourceIds:['old-trump-record']},generatedAt:'2026-07-19T16:00:00.000Z',failures:[{pathname:'/data/unavailable-source.json',error:'HTTP 503'}]});
const draft=analysis.enrichIntelligenceReport(rawDraft);draft.reportId='intelligence-report-test';draft.version=2;
assert.equal(draft.trackerSections.length,1);
assert.equal(draft.trackerSections[0].label,'Donald Trump');
assert.ok(draft.trackerSections[0].records.length>=4,'All relevant Trump records should be included');
assert.ok(draft.trackerSections[0].records.every(record=>!record.title.includes('weather')),'Unrelated records must not enter a tracked-subject report');
assert.ok(draft.whatChanged.some(change=>change.type==='new_record'));
assert.ok(draft.changes.removedSourceIds.includes('old-trump-record'));
assert.ok(draft.contradictions.some(record=>record.id==='trump-correction'));
assert.ok(draft.connections.some(record=>record.id==='trump-contract-relationship'));
assert.ok(draft.timeline.every(item=>item.eventDate!==undefined&&item.publishedDate!==undefined),'Timeline must expose separate event and publication dates');
assert.ok(draft.sourceLedger.every(record=>/^[A-E]$/.test(record.sourceQuality)));
assert.ok(draft.sourceLedger.every(record=>['CONFIRMED','STRONGLY SUPPORTED','REPORTED','DISPUTED','UNVERIFIED','ANALYTICAL INFERENCE','SPECULATIVE','FALSE OR CORRECTED'].includes(record.evidenceStatus)));
assert.ok(draft.coverageLimitations.some(item=>item.includes('unavailable-source')));
assert.match(draft.title,/Daily Intelligence Review/);
assert.equal(draft.evidenceLayers.length,5);
assert.ok(draft.keyFindings.length,'Deep report must contain key findings');
assert.ok(draft.claimsAndEvidenceMatrix.length,'Deep report must contain a claims and evidence matrix');
assert.ok(draft.evidenceBasedConclusions.length,'Deep report must contain evidence-based conclusions');
assert.ok(draft.analyticalInferences.length,'Deep report must contain analytical inferences');
assert.ok(draft.speculativeAnalyticalConclusions.length,'Deep report must contain clearly labelled speculative hypotheses');
assert.match(draft.speculativeAnalyticalConclusions[0].publicationWarning,/not an established fact/i);
assert.ok(draft.alternativeExplanations.length,'Deep report must test alternative explanations');
assert.ok(draft.evidenceGaps.some(item=>item.includes('unavailable-source')),'Source failures must enter evidence gaps');
assert.ok(draft.bottomLine.length>=6,'Bottom line must contain all required assessments');
const pdf=analysis.buildDeepIntelligencePdf(draft);
assert.ok(pdf instanceof Uint8Array);assert.ok(pdf.length>20000,'Generated PDF should be a substantive multi-section report');assert.equal(new TextDecoder().decode(pdf.slice(0,8)),'%PDF-1.4');

const production=fs.readFileSync(productionPath,'utf8'),email=fs.readFileSync(emailPath,'utf8'),wrangler=fs.readFileSync(wranglerPath,'utf8'),worker=fs.readFileSync(modulePath,'utf8');
for(const marker of ["import intelligenceReportWorker, { isIntelligenceReportRoute }",'validateIntelligenceReportResponse','intelligence-report-worker-exception'])assert.ok(production.includes(marker),`Production integration marker missing: ${marker}`);
for(const marker of ['buildWelcomeIntelligenceEmail','sendDetailedFirstDailyBrief','queuePersonalizedAutomatedCampaign','/api/email/admin/report-system-health','email_outbox','email_suppressions','sendProviderEmail','existingBeforeSignup','email.signup.verified_preferences_refreshed',"cron==='35 * * * *'"])assert.ok(email.includes(marker),`Email integration marker missing: ${marker}`);
for(const marker of ["from './worker-intelligence-analysis.js'",'enrichIntelligenceReport(buildReportDraft','buildDeepIntelligencePdf(report)',"pdfGeneration:'deep intelligence PDF 1.4'"])assert.ok(worker.includes(marker),`Deep PDF worker marker missing: ${marker}`);
assert.match(wrangler,/"EMAIL_AUTOMATION_ENABLED"\s*:\s*"true"/,'Validated daily and weekly report automation must be enabled');
assert.match(wrangler,/"EMAIL_TRANSACTIONAL_ENABLED"\s*:\s*"true"/,'Transactional welcome and verification delivery must remain enabled');
assert.match(wrangler,/"INTELLIGENCE_REPORT_BATCH_LIMIT"\s*:\s*"100"/,'Personalized report generation must retain a bounded batch limit');
assert.match(wrangler,/"35 \* \* \* \*"/,'Hourly idempotent catch-up cron must remain configured');
assert.ok(production.includes('import paypalWorker'),'PayPal worker import must remain intact');
assert.ok(production.includes('isPayPalRoute(path)'),'PayPal route boundary must remain intact');
assert.ok(email.includes("'/api/email/unsubscribe'"),'Unsubscribe route must remain intact');
assert.ok(email.includes('activeSuppression'),'Suppression checks must remain intact');
assert.ok(email.includes("event?.cron==='15 7 * * 1'")||email.includes("cron==='15 7 * * 1'"),'Weekly scheduled report path must remain wired');
assert.ok(email.includes("event?.cron==='5 6 * * *'")||email.includes("cron==='5 6 * * *'"),'Daily scheduled report path must remain wired');
const result={ok:true,testedAt:new Date().toISOString(),sample:{tracker:tracker.label,relevantRecords:draft.trackerSections[0].records.length,currentRecords:draft.trackerSections[0].currentCount,contradictions:draft.contradictions.length,connections:draft.connections.length,evidenceCount:draft.metrics.evidenceCount,primarySourceCount:draft.metrics.primarySourceCount,keyFindings:draft.keyFindings.length,conclusions:draft.evidenceBasedConclusions.length,inferences:draft.analyticalInferences.length,speculativeHypotheses:draft.speculativeAnalyticalConclusions.length,pdfBytes:pdf.length},safeguards:{unrelatedRecordExcluded:true,evidenceLabelsValidated:true,eventAndPublicationDatesSeparated:true,coverageFailuresDisclosed:true,deepNativePdfGenerated:true,fiveEvidenceLayers:true,conclusionsSeparatedFromSpeculation:true,alternativeExplanationsRequired:true,automationEnabled:true,batchLimit:100,transactionalEmailStillEnabled:true,paypalBoundaryPreserved:true,unsubscribeAndSuppressionPreserved:true,dailyAndWeeklySchedulesWired:true,verifiedRepeatSignupPreserved:true,idempotentCatchUpCron:true}};
fs.mkdirSync(path.dirname(reportPath),{recursive:true});fs.writeFileSync(reportPath,`${JSON.stringify(result,null,2)}\n`);console.log(`Deep intelligence reporting test passed: ${result.sample.relevantRecords} records, ${result.sample.conclusions} conclusions, ${result.sample.speculativeHypotheses} labelled hypothesis and ${result.sample.pdfBytes} PDF bytes.`);
