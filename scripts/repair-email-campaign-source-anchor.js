const fs = require('fs');
const path = require('path');

const root = process.cwd();
const workerPath = path.join(root, 'src', 'worker-email-lifecycle.js');
const reportPath = path.join(root, 'downloads', 'email-campaign-source-anchor-repair.json');
if (!fs.existsSync(workerPath)) throw new Error('src/worker-email-lifecycle.js is missing');

let source = fs.readFileSync(workerPath, 'utf8');
const before = source;
const marker = '/data/weekly-investigation-conclusions.json';
const replacement = `async function loadCampaignSource(request,env,kind){
  if(!env?.ASSETS||typeof env.ASSETS.fetch!=='function')return null;
  const candidates=kind==='weekly'
    ? ['/data/weekly-investigation-conclusions.json','/downloads/weekly-investigation-report.json','/data/outcome-briefings.json','/data/daily-brain-brief.json']
    : ['/data/daily-brain-brief.json','/data/daily-investigation-conclusions.json','/data/live-intel.json','/data/outcome-briefings.json'];
  for(const pathname of candidates){
    try{
      const response=await env.ASSETS.fetch(new Request(new URL(pathname,request.url),{headers:{accept:'application/json'}}));
      if(response.ok){const data=await response.json();return{pathname,data};}
    }catch{}
  }
  return null;
}`;

let changed = false;
if (!source.includes(marker)) {
  const oneLine = /^(?:async\s+)?function\s+loadCampaignSource\s*\([^\n]*$/m;
  const match = source.match(oneLine);
  if (match && match[0].includes('}')) {
    source = source.replace(oneLine, replacement);
    changed = true;
  } else if (!/(?:async\s+)?function\s+loadCampaignSource\s*\(/m.test(source)) {
    const anchor = 'function sourceItems(';
    const index = source.indexOf(anchor);
    if (index < 0) throw new Error('Email campaign source repair could not find loadCampaignSource or sourceItems anchor');
    source = `${source.slice(0, index)}${replacement}\n${source.slice(index)}`;
    changed = true;
  } else {
    throw new Error('Email campaign source repair found an unsupported multiline loadCampaignSource implementation');
  }
}

if (!source.includes(marker) || !source.includes('/data/daily-brain-brief.json')) {
  throw new Error('Email campaign source repair did not install the required daily and weekly source routes');
}
if (changed) fs.writeFileSync(workerPath, source);
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  changed,
  dailySource: '/data/daily-brain-brief.json',
  weeklySource: '/data/weekly-investigation-conclusions.json',
  boundary: 'Campaign automation loads only approved same-origin JSON outputs and fails closed when no usable source is available.'
}, null, 2)}\n`);
console.log(`Email campaign source anchor ${changed ? 'repaired' : 'already current'}.`);
