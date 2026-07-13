const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const {spawnSync}=require('child_process');

const root=process.cwd();
const outputDir=process.env.PHASE4_EMAIL_INVENTORY_OUTPUT_DIR?path.resolve(process.env.PHASE4_EMAIL_INVENTORY_OUTPUT_DIR):path.join(root,'downloads','phase4-email-lifecycle-inventory');
const policyPath=path.join(root,'data','phase4-email-lifecycle-policy.json');
const inspectExtensions=new Set(['.js','.mjs','.cjs','.html','.toml','.yml','.yaml','.sql','.json','.md']);
const ignoredDirs=new Set(['.git','node_modules','_site','.wrangler','downloads']);

function walk(dir,out=[]){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){if(entry.isDirectory()&&ignoredDirs.has(entry.name))continue;const target=path.join(dir,entry.name);if(entry.isDirectory())walk(target,out);else{const rel=path.relative(root,target).split(path.sep).join('/');if(inspectExtensions.has(path.extname(rel).toLowerCase()))out.push(rel);}}return out;}
function read(rel){try{return fs.readFileSync(path.join(root,rel),'utf8');}catch{return'';}}
function readJson(rel){return JSON.parse(read(rel));}
function stableValue(value){if(Array.isArray(value))return value.map(stableValue);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stableValue(value[key])]));return value;}
function stableJson(value){return JSON.stringify(stableValue(value),null,2)+'\n';}
function ensureDir(target){fs.mkdirSync(target,{recursive:true});}
function writeJson(name,value){ensureDir(outputDir);fs.writeFileSync(path.join(outputDir,name),stableJson(value));}
function writeText(name,value){ensureDir(outputDir);fs.writeFileSync(path.join(outputDir,name),value);}
function sha256(value){return crypto.createHash('sha256').update(value).digest('hex');}
function unique(values){return[...new Set(values.filter(Boolean))];}
function countBy(items,getter){const counts={};for(const item of items){const key=String(getter(item)??'unknown');counts[key]=(counts[key]||0)+1;}return Object.fromEntries(Object.entries(counts).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])));}
function sourceCheckpoint(){const result=spawnSync('git',['show','-s','--format=%cI','HEAD'],{cwd:root,encoding:'utf8'});const value=result.status===0?result.stdout.trim():'';return Number.isFinite(Date.parse(value))?new Date(value).toISOString():'1970-01-01T00:00:00.000Z';}
function evidence(files,patterns){const hits=[];for(const file of files){const content=read(file);for(const pattern of patterns){const regex=pattern instanceof RegExp?new RegExp(pattern.source,pattern.flags.includes('g')?pattern.flags:pattern.flags+'g'):new RegExp(String(pattern),'gi');let match;let guard=0;while((match=regex.exec(content))&&guard++<30){const before=content.slice(0,match.index);const line=before.split('\n').length;hits.push({file,line,match:String(match[0]).slice(0,180)});if(match[0]==='')regex.lastIndex++;}}}return hits;}
function stage(stageName,strongPatterns,partialPatterns=[],notes=''){const strong=evidence(files,strongPatterns);const partial=evidence(files,partialPatterns);const status=strong.length?'implemented':partial.length?'partial':'missing';return{stage:stageName,status,strongEvidence:strong.slice(0,20),partialEvidence:partial.slice(0,20),evidenceCount:strong.length+partial.length,notes};}
function routeStrings(content){const matches=[];const regex=/['"`]((?:\/api\/email|\/api\/auth|\/newsletter|\/email|\/member)[A-Za-z0-9_?&=./:-]*)['"`]/g;let match;while((match=regex.exec(content)))matches.push(match[1].split('?')[0]);return matches;}
function tableNames(content){const names=[];const regex=/(?:CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?|INSERT\s+INTO|UPDATE|FROM|JOIN)\s+([A-Za-z_][A-Za-z0-9_]*)/gi;let match;while((match=regex.exec(content)))names.push(match[1].toLowerCase());return names;}
function envNames(content){const names=[];const regex=/env\.([A-Z][A-Z0-9_]+)/g;let match;while((match=regex.exec(content)))names.push(match[1]);return names;}
function formInventory(file,content){const forms=[];const formRegex=/<form\b[\s\S]*?<\/form>/gi;let match;let index=0;while((match=formRegex.exec(content))){const html=match[0];const email=/type=["']email["']|name=["'](?:email|Email)["']/i.test(html);if(!email)continue;forms.push({file,index:index++,id:html.match(/\bid=["']([^"']+)/i)?.[1]||null,name:html.match(/\bname=["']([^"']+)/i)?.[1]||null,action:html.match(/\baction=["']([^"']+)/i)?.[1]||null,method:(html.match(/\bmethod=["']([^"']+)/i)?.[1]||'script/default').toLowerCase(),dataNewsletter:/data-newsletter-form|data-newsletter-capture/i.test(html),explicitConsentControl:/type=["']checkbox["'][^>]*(?:consent|marketing)|name=["'](?:consent|marketingConsent|marketing_consent)["']/i.test(html),honeypot:/name=["']website["']|autocomplete=["']off["'][^>]*tabindex=["']-1["']/i.test(html),statusRegion:/aria-live|newsletter-status|form-status/i.test(html),snippet:html.replace(/\s+/g,' ').slice(0,240)});}return forms;}

fs.rmSync(outputDir,{recursive:true,force:true});
const policy=readJson('data/phase4-email-lifecycle-policy.json');
if(policy.mode!=='audit-only')throw new Error('Phase 4 inventory requires audit-only policy.');
const files=walk(root).sort();
const contents=new Map(files.map(file=>[file,read(file)]));
const combined=[...contents.values()].join('\n');
const routes=unique(files.flatMap(file=>routeStrings(contents.get(file)))).sort();
const tables=unique(files.flatMap(file=>tableNames(contents.get(file)))).sort();
const envBindings=unique(files.flatMap(file=>envNames(contents.get(file)))).sort();
const forms=files.filter(file=>file.endsWith('.html')).flatMap(file=>formInventory(file,contents.get(file)));
const emailForms=forms.filter(form=>form.dataNewsletter||/newsletter|brief|weekly|digest|membership/i.test(`${form.file} ${form.id||''} ${form.name||''} ${form.snippet}`));
const workflowFiles=files.filter(file=>file.startsWith('.github/workflows/'));
const scheduledEmailWorkflows=workflowFiles.filter(file=>/schedule:|cron:/i.test(contents.get(file))&&/email|newsletter|brevo|campaign|daily brief|weekly brief/i.test(contents.get(file)));
const emailPages=files.filter(file=>file.endsWith('.html')&&/newsletter|member|preference|unsubscribe|confirm|email/i.test(`${file} ${contents.get(file).slice(0,2000)}`));
const sqlFiles=files.filter(file=>file.endsWith('.sql'));

const stages=[
  stage('capture_form',[/data-newsletter-form/i,/newsletter-form/i],[/type=["']email["']/i],`${emailForms.length} email-capture forms detected.`),
  stage('input_validation',[/\^\[\^\\s@\]\+@|Valid email required|\/\^[^\n]*@[^\n]*\$\//i],[/type=["']email["']/i]),
  stage('spam_and_rate_control',[/rate.?limit|turnstile|captcha|ip_hash|signup_attempt|retry-after/i],[/body\.website|honeypot|Spam trap triggered/i]),
  stage('consent_record',[/INSERT INTO email_consents/i],[/consentGranted|consent:true|marketing-consent|marketing_email/i]),
  stage('authoritative_subscriber_persistence',[/INSERT INTO members/i,/Cloudflare D1 MEMBERS_DB/i],[/newsletter:subscriber:|newsletter:index/i]),
  stage('provider_contact_sync',[/api\.brevo\.com\/v3\/contacts|\/v3\/contacts/i],[/BREVO_API_KEY|api\.brevo\.com/i]),
  stage('verification_token_issue',[/INSERT INTO magic_links|token_hash|verify_email/i],[/verification token|verification link/i]),
  stage('verification_delivery',[/authSendEmail|Verify your Matrix Reprogrammed membership/i],[/BREVO_API_KEY|smtp\/email/i]),
  stage('verification_completion',[/email_verified_at|marketing_status=.*subscribed|purpose===['"]verify_email/i],[/verified=1|email verified/i]),
  stage('welcome_delivery',[/welcome_email|welcome delivery|Welcome to Matrix Reprogrammed|purpose===['"]welcome/i],[/welcome/i]),
  stage('preference_read',[/SELECT[^;\n]*email_preferences|handleEmailPreferences|\/api\/email\/preferences/i],[/newsletter preferences|preference centre|preference center/i]),
  stage('preference_update',[/UPDATE[^;\n]*email_preferences|INSERT INTO email_preferences/i],[/preference update|notification preferences/i]),
  stage('unsubscribe',[/marketing_status=['"]unsubscribed|\/api\/email\/unsubscribe|unsubscribe_token|email_suppressions/i],[/unsubscribe/i]),
  stage('resubscribe',[/\/api\/email\/resubscribe|resubscribe_token|explicit new consent/i],[/resubscribe/i]),
  stage('suppression_and_bounce_handling',[/hard_bounce|soft_bounce|complaint|email_suppressions|marketing_status=['"]suppressed/i],[/bounce|suppression|complaint/i]),
  stage('segment_assignment',[/email_segments|email_segment_memberships|segment_id|public_daily_brief/i],[/tier|marketing_status|segment/i]),
  stage('daily_campaign_build',[/email_campaigns|daily_campaign|public_daily_brief|intelligence_daily_member_brief/i],[/daily brief|daily control brief/i]),
  stage('weekly_campaign_build',[/weekly_campaign|public_weekly_digest|supporter_weekly_member_brief/i],[/weekly signal drop|weekly brief|weekly digest/i]),
  stage('test_send',[/test_send|test sent|send test email/i],[/smtp\/email/i]),
  stage('scheduled_send',[/campaignScheduling|scheduleCampaign|scheduled_at|cron[^\n]*email/i],[/schedule:|cron:/i]),
  stage('delivery_event_ingest',[/email_webhook_receipts|email_events|provider-webhook|messageId|event_type/i],[/webhook|delivered|opened|clicked/i]),
  stage('campaign_metrics',[/email_deliveries|campaign_metrics|delivery_rate|open_rate|click_rate/i],[/messageId|campaign/i]),
  stage('subscriber_dashboard',[/subscriber-dashboard|email-preferences|member-dashboard/i],[/member-dashboard\.html|handleMemberMe/i]),
  stage('admin_monitoring',[/api\/email\/admin|admin.*campaign|email.*health|campaign dashboard/i],[/membership-health|admin.*subscriber|getSubscribers/i]),
  stage('audit_and_reconciliation',[/email_provider_contacts|reconciliation|audit_log|email_webhook_receipts/i],[/membershipSchemaStatus|audit/i])
];

const requiredRoutes=policy.requiredRoutes.map(route=>({route,present:routes.includes(route)||combined.includes(`'${route}'`)||combined.includes(`"${route}"`),evidence:evidence(files,[new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i')]).slice(0,10)}));
const requiredObjects=policy.requiredDataObjects.map(object=>({object,present:tables.includes(object.toLowerCase())||new RegExp(`\\b${object}\\b`,'i').test(combined),tableDetected:tables.includes(object.toLowerCase()),evidence:evidence(files,[new RegExp(`\\b${object}\\b`,'i')]).slice(0,10)}));
const requiredSurfaces=policy.requiredSurfaces.map(surface=>{const patterns={newsletter_signup:/newsletter|membership/i,confirmation_result:/confirm|verified/i,preference_center:/preference/i,unsubscribe_result:/unsubscribe/i,subscriber_dashboard:/member-dashboard|subscriber-dashboard/i,admin_campaign_dashboard:/admin.*campaign|campaign.*admin/i};const pattern=patterns[surface]||new RegExp(surface.replaceAll('_','[-_ ]'),'i');const matches=emailPages.filter(file=>pattern.test(`${file} ${contents.get(file).slice(0,4000)}`));return{surface,present:matches.length>0,files:matches};});

const staleCopy=[];
for(const file of emailPages){const content=contents.get(file);if(/Cloudflare KV capture active/i.test(content))staleCopy.push({file,issue:'Public copy states KV capture is active although the Worker prefers D1 MEMBERS_DB and uses KV as compatibility fallback.'});if(/Unsubscribe link will be added/i.test(content))staleCopy.push({file,issue:'Public copy promises a future unsubscribe link rather than proving a current preference/unsubscribe lifecycle.'});if(/Weekly Signal Drop enabled/i.test(content)&&!stages.find(item=>item.stage==='weekly_campaign_build').strongEvidence.length)staleCopy.push({file,issue:'Signup success copy says weekly delivery is enabled although no verified campaign lifecycle was detected.'});}
const consentRisks=[];
for(const form of emailForms)if(!form.explicitConsentControl)consentRisks.push({file:form.file,id:form.id,issue:'No explicit marketing-consent control detected; newsletter.js sends consent:true programmatically.'});
const providerRisks=[];
if(stages.find(item=>item.stage==='verification_delivery').status==='implemented'&&stages.find(item=>item.stage==='provider_contact_sync').status!=='implemented')providerRisks.push({issue:'Brevo transactional email delivery exists, but Brevo contact synchronization was not detected.'});
if(stages.find(item=>item.stage==='unsubscribe').status!=='implemented')providerRisks.push({issue:'No complete unsubscribe/suppression route was detected; campaign activation must remain blocked.'});
if(stages.find(item=>item.stage==='delivery_event_ingest').status!=='implemented')providerRisks.push({issue:'No idempotent Brevo delivery-event webhook ingestion was detected.'});

const statusCounts=countBy(stages,item=>item.status);
const implemented=stages.filter(item=>item.status==='implemented').map(item=>item.stage);
const partial=stages.filter(item=>item.status==='partial').map(item=>item.stage);
const missing=stages.filter(item=>item.status==='missing').map(item=>item.stage);
const blockers=unique([
  ...missing,
  ...partial.filter(stageName=>['spam_and_rate_control','provider_contact_sync','welcome_delivery','preference_read','preference_update','unsubscribe','resubscribe','suppression_and_bounce_handling','segment_assignment','daily_campaign_build','weekly_campaign_build','test_send','scheduled_send','delivery_event_ingest','campaign_metrics','admin_monitoring','audit_and_reconciliation'].includes(stageName))
]);
const summary={filesInspected:files.length,emailPages:emailPages.length,emailForms:emailForms.length,formsWithoutExplicitConsent:consentRisks.length,routesDetected:routes.length,databaseObjectsDetected:tables.length,environmentBindingsDetected:envBindings.length,scheduledEmailWorkflows:scheduledEmailWorkflows.length,stageStatus:statusCounts,implementedStages:implemented.length,partialStages:partial.length,missingStages:missing.length,activationBlockers:blockers.length,stalePublicCopyFindings:staleCopy.length,providerRiskFindings:providerRisks.length};
const report={ok:true,mode:'audit-only',version:policy.version,generatedAt:sourceCheckpoint(),liveEmailSend:false,providerContactMutation:false,campaignCreation:false,campaignScheduling:false,subscriberMutation:false,d1MigrationExecution:false,workerMutation:false,paymentActivation:false,boundary:'This inventory reads repository files only. It does not call Brevo, execute D1 migrations, mutate subscribers, send email, schedule campaigns or change Worker routes.',summary,stages,requiredRoutes,requiredObjects,requiredSurfaces,forms:emailForms,routes,tables,envBindings,emailPages,sqlFiles,workflowFiles,scheduledEmailWorkflows,risks:{stalePublicCopy:staleCopy,consent:consentRisks,provider:providerRisks},activationBlockers:blockers};
writeJson('inventory.json',report);
writeJson('lifecycle-stages.json',{ok:true,mode:'audit-only',generatedAt:report.generatedAt,recordCount:stages.length,records:stages});
writeJson('route-and-schema-gap-report.json',{ok:true,mode:'audit-only',generatedAt:report.generatedAt,requiredRoutes,requiredObjects,requiredSurfaces});
writeJson('form-and-consent-report.json',{ok:true,mode:'audit-only',generatedAt:report.generatedAt,formCount:emailForms.length,forms:emailForms,consentRisks});
writeJson('activation-blockers.json',{ok:true,mode:'audit-only',generatedAt:report.generatedAt,recordCount:blockers.length,blockers,stalePublicCopy:staleCopy,providerRisks});
const lines=['# Phase 4 Email Lifecycle Inventory','',`Generated: ${report.generatedAt}`,`Mode: ${report.mode}`,'','## Boundary','',report.boundary,'','## Current coverage','',`- Files inspected: ${summary.filesInspected}`,`- Email pages: ${summary.emailPages}`,`- Email capture forms: ${summary.emailForms}`,`- Forms without explicit consent control: ${summary.formsWithoutExplicitConsent}`,`- Implemented stages: ${summary.implementedStages}`,`- Partial stages: ${summary.partialStages}`,`- Missing stages: ${summary.missingStages}`,`- Activation blockers: ${summary.activationBlockers}`,'','## Stage status','',...stages.map(item=>`- ${item.stage}: ${item.status}`),'','## Activation blockers','',...blockers.map(item=>`- ${item}`),'','## Exit condition','',policy.exitCondition];
writeText('summary.md',lines.join('\n')+'\n');
const hashes={};for(const file of fs.readdirSync(outputDir).sort()){if(file==='manifest.json')continue;hashes[file]=sha256(fs.readFileSync(path.join(outputDir,file)));}
writeJson('manifest.json',{ok:true,mode:'audit-only',version:policy.version,generatedAt:report.generatedAt,fileHashes:hashes,liveEmailSend:false,providerContactMutation:false,subscriberMutation:false,paymentActivation:false,boundary:report.boundary});
console.log(`PHASE 4 EMAIL INVENTORY: ${implemented.length} implemented; ${partial.length} partial; ${missing.length} missing; ${blockers.length} blockers.`);
console.log(`Output: ${outputDir}`);
