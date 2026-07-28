'use strict';

const fs=require('fs');
const path=require('path');
const root=process.cwd();
const outputRoot=path.join(root,'_site');
const roots=[root,outputRoot].filter((value,index,all)=>all.indexOf(value)===index&&fs.existsSync(value));
let patchedPages=0,patchedClients=0;
function patch(relative,transform){for(const base of roots){const file=path.join(base,relative);if(!fs.existsSync(file))continue;const before=fs.readFileSync(file,'utf8');const after=transform(before);if(after!==before){fs.writeFileSync(file,after);if(relative.endsWith('.html'))patchedPages+=1;else patchedClients+=1;}}}

patch('member-dashboard.html',html=>{
  let next=html;
  if(!next.includes('href="#accountability-alerts"'))next=next.replace('<a href="#sessions">Sessions</a><a href="#saved">Saved</a><a href="#follows">Follows</a>','<a href="#sessions">Sessions</a><a href="#accountability-alerts">Accountability Alerts</a><a href="#saved">Saved</a><a href="#follows">Follows</a>');
  if(!next.includes('id="accountability-alerts"')){
    const block='<section id="accountability-alerts" class="panel section-anchor"><div class="member-head"><div><h2>Accountability alerts</h2><p class="muted">Due 30-, 90- and 365-day consequence checks and reviewed outcomes from records you follow. A due alert is not a verdict.</p></div><a class="btn alt" href="/public-consequence-contracts.html">Open Accountability Twins</a></div><div id="accountability-alert-list" class="member-list"></div></section>';
    const anchor='<section id="sessions" class="panel section-anchor">';
    if(!next.includes(anchor))throw new Error('Member dashboard section anchor not found');
    next=next.replace(anchor,`${block}${anchor}`);
  }
  return next;
});

patch('member-dashboard-app.js',source=>{
  let next=source;
  next=next.replace('const state={dashboard:null,saved:[],follows:[],watchlists:[],archive:[],downloads:[],sessions:[]};','const state={dashboard:null,saved:[],follows:[],watchlists:[],archive:[],downloads:[],sessions:[],consequenceEvents:[]};');
  if(!next.includes('async function loadConsequenceEvents()')){
    const anchor='async function loadWatchlists(){';
    if(!next.includes(anchor))throw new Error('Member dashboard watchlist function anchor not found');
    const functionText=`async function loadConsequenceEvents(){const node=$('accountability-alert-list');if(!node)return;try{const data=await api('/api/member/consequence-events');state.consequenceEvents=data.events||[];node.replaceChildren();if(!state.consequenceEvents.length)return empty(node,'Follow a Public Consequence Contract and due or reviewed checkpoints will appear here.');for(const event of state.consequenceEvents){const type=title(event.event_type);const timing=event.checkpoint_days?event.checkpoint_days+'-day checkpoint · ':'';const item=card(type,timing+new Date(event.created_at).toLocaleString(),event.route||'');const summary=document.createElement('p');summary.className='muted';summary.textContent=event.summary||'The followed accountability record changed.';item.insertBefore(summary,item.querySelector('a'));if(event.evidence_route){const evidence=document.createElement('a');evidence.className='btn alt';evidence.href=event.evidence_route;evidence.textContent='Evidence';item.append(evidence)}node.append(item)}}catch(error){empty(node,error.message||'Accountability alerts are unavailable.')}}\n`;
    next=next.replace(anchor,`${functionText}${anchor}`);
  }
  next=next.replace('const tasks=[loadSessions(),loadSaved(),loadFollows(),loadArchive(),loadDownloads()];','const tasks=[loadSessions(),loadSaved(),loadFollows(),loadConsequenceEvents(),loadArchive(),loadDownloads()];');
  return next;
});

const sourcePage=path.join(root,'member-dashboard.html'),sourceClient=path.join(root,'member-dashboard-app.js');
for(const file of [sourcePage,sourceClient])if(!fs.existsSync(file))throw new Error(`${path.relative(root,file)} is required`);
const page=fs.readFileSync(sourcePage,'utf8'),client=fs.readFileSync(sourceClient,'utf8');
const checks={panel:page.includes('id="accountability-alerts"'),list:page.includes('id="accountability-alert-list"'),api:client.includes("api('/api/member/consequence-events')"),state:client.includes('consequenceEvents:[]'),load:client.includes('loadConsequenceEvents()'),boundary:page.includes('A due alert is not a verdict')};
if(!Object.values(checks).every(Boolean))throw new Error(`Accountability dashboard patch incomplete: ${JSON.stringify(checks)}`);
fs.mkdirSync(path.join(root,'downloads'),{recursive:true});
const report={ok:true,generatedAt:new Date().toISOString(),patchedPages,patchedClients,checks};
fs.writeFileSync(path.join(root,'downloads','accountability-alerts-dashboard-report.json'),`${JSON.stringify(report,null,2)}\n`);
if(fs.existsSync(outputRoot)){fs.mkdirSync(path.join(outputRoot,'downloads'),{recursive:true});fs.copyFileSync(path.join(root,'downloads','accountability-alerts-dashboard-report.json'),path.join(outputRoot,'downloads','accountability-alerts-dashboard-report.json'));}
console.log(`Accountability alerts added to member dashboard (${patchedPages} page copy/copies, ${patchedClients} client copy/copies patched).`);
