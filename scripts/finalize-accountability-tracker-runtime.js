'use strict';

const fs=require('fs');
const path=require('path');
const root=process.cwd();
const outputRoot=path.join(root,'_site');
const roots=[root,outputRoot].filter((value,index,all)=>all.indexOf(value)===index&&fs.existsSync(value));
const assets=['accountability-tracker-runtime.js','accountability-tracker-runtime.css'];
const reviewAssets=['accountability-review-inbox.html','accountability-review-inbox.js'];
for(const relative of [...assets,...reviewAssets])if(!fs.existsSync(path.join(root,relative)))throw new Error(`${relative} is required`);
let patched=0;
for(const base of roots){
  for(const relative of ['index.html','public-consequence-contracts.html']){
    const file=path.join(base,relative);if(!fs.existsSync(file))continue;
    let html=fs.readFileSync(file,'utf8');const before=html;
    if(!html.includes('accountability-tracker-runtime.css'))html=html.replace('</head>','<link rel="stylesheet" href="accountability-tracker-runtime.css"></head>');
    if(!html.includes('accountability-tracker-runtime.js'))html=html.replace('</body>','<script src="accountability-tracker-runtime.js"></script></body>');
    if(html!==before){fs.writeFileSync(file,html);patched+=1;}
  }
  if(base!==root)for(const relative of [...assets,...reviewAssets]){
    const destination=path.join(base,relative);
    fs.mkdirSync(path.dirname(destination),{recursive:true});
    fs.copyFileSync(path.join(root,relative),destination);
  }
}
require('./add-accountability-alerts-dashboard.js');
fs.mkdirSync(path.join(root,'downloads'),{recursive:true});
const report={ok:true,generatedAt:new Date().toISOString(),patchedPages:patched,assets,reviewAssets,memberDashboardAlerts:true,humanReviewInbox:true};
fs.writeFileSync(path.join(root,'downloads','accountability-tracker-runtime-report.json'),`${JSON.stringify(report,null,2)}\n`);
if(fs.existsSync(outputRoot)){
  fs.mkdirSync(path.join(outputRoot,'downloads'),{recursive:true});
  fs.copyFileSync(path.join(root,'downloads','accountability-tracker-runtime-report.json'),path.join(outputRoot,'downloads','accountability-tracker-runtime-report.json'));
}
console.log(`Accountability tracker public runtime finalized across ${patched} page copy/copies with member dashboard alerts and the human review inbox.`);
