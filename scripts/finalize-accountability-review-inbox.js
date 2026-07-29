'use strict';

const fs=require('fs');
const path=require('path');
const root=process.cwd();
const outputRoot=path.join(root,'_site');
const roots=[root,outputRoot].filter((value,index,all)=>all.indexOf(value)===index&&fs.existsSync(value));
const assets=['accountability-review-inbox.html','accountability-review-inbox.js'];
for(const relative of assets)if(!fs.existsSync(path.join(root,relative)))throw new Error(`${relative} is required`);

function copy(relative){if(!fs.existsSync(outputRoot))return;const source=path.join(root,relative),destination=path.join(outputRoot,relative);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.copyFileSync(source,destination);}
function patchDashboard(base){const file=path.join(base,'review-dashboard.html');if(!fs.existsSync(file))return false;let html=fs.readFileSync(file,'utf8');const before=html;const link='<a class="btn" href="accountability-review-inbox.html">Accountability Review Inbox</a>';if(!html.includes('href="accountability-review-inbox.html"')){const anchor='<div class="cta-row">';if(!html.includes(anchor))throw new Error(`Review dashboard CTA anchor missing in ${path.relative(root,file)}`);html=html.replace(anchor,`${anchor}${link}`);}if(html!==before){fs.writeFileSync(file,html);return true;}return false;}

let patchedDashboards=0;
for(const base of roots)if(patchDashboard(base))patchedDashboards+=1;
for(const relative of assets)copy(relative);

const page=fs.readFileSync(path.join(root,'accountability-review-inbox.html'),'utf8');
const client=fs.readFileSync(path.join(root,'accountability-review-inbox.js'),'utf8');
const dashboard=fs.readFileSync(path.join(root,'review-dashboard.html'),'utf8');
const checks={
  linkedFromReviewDashboard:dashboard.includes('href="accountability-review-inbox.html"'),
  noIndex:page.includes('noindex,nofollow,noarchive'),
  tokenMemoryOnly:page.includes('Held in memory only')&&!/localStorage|sessionStorage/.test(client),
  dueQueue:client.includes("api('/api/public/consequence-due')"),
  contractDetail:client.includes('/api/public/consequence-contracts/'),
  lockTerms:client.includes("'/api/admin/consequence-contracts/lock'"),
  addEvidence:client.includes("'/api/admin/consequence-evidence'"),
  publishAssessment:client.includes("'/api/admin/consequence-assessment'"),
  evidenceLimits:page.includes('What this does not establish'),
  namedReviewer:page.includes('Named reviewer'),
  dueNotVerdict:page.includes('A due checkpoint is not a verdict'),
  publicTwinFallback:page.includes('id="workspace-public" class="btn alt" href="index.html#accountability-hit-list"'),
  originalSourceFallback:page.includes('id="workspace-source" class="btn alt" href="source-document-vault.html"'),
  evidenceRouteFallback:page.includes('id="workspace-evidence" class="btn alt" href="evidence-vault.html"')
};
if(!Object.values(checks).every(Boolean))throw new Error(`Accountability review inbox finalization failed: ${JSON.stringify(checks)}`);
fs.mkdirSync(path.join(root,'downloads'),{recursive:true});
const report={ok:true,generatedAt:new Date().toISOString(),patchedDashboards,assets,checks};
fs.writeFileSync(path.join(root,'downloads','accountability-review-inbox-report.json'),`${JSON.stringify(report,null,2)}\n`);
if(fs.existsSync(outputRoot)){fs.mkdirSync(path.join(outputRoot,'downloads'),{recursive:true});fs.copyFileSync(path.join(root,'downloads','accountability-review-inbox-report.json'),path.join(outputRoot,'downloads','accountability-review-inbox-report.json'));}
console.log(`Accountability Review Inbox finalized (${patchedDashboards} dashboard copy/copies patched).`);