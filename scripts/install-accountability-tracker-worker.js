'use strict';

const fs=require('fs');
const path=require('path');
const root=process.cwd();
const workerFile=path.join(root,'src','worker-production.js');
if(!fs.existsSync(workerFile))throw new Error('src/worker-production.js is required');
let source=fs.readFileSync(workerFile,'utf8');
const before=source;

const importLine="import accountabilityTrackerWorker, { isAccountabilityTrackerRoute, runAccountabilityTracker } from './worker-accountability-tracker.js';";
if(!source.includes(importLine)){
  const anchor="import emailWorker, { emailRoutes, processOutbox } from './worker-email-lifecycle.js';";
  if(!source.includes(anchor))throw new Error('Email worker import anchor not found');
  source=source.replace(anchor,`${anchor}\n${importLine}`);
}

const validator=`async function validateAccountabilityTrackerResponse(response) {
  const origin = response.headers.get('x-matrix-origin');
  if (origin !== 'cloudflare-worker-accountability-tracker') {
    return unavailable('non-authoritative-accountability-response-blocked', \`Origin was \${origin || 'missing'}\`, 'member');
  }
  return response;
}

`;
if(!source.includes('function validateAccountabilityTrackerResponse')){
  const anchor='export default {';
  if(!source.includes(anchor))throw new Error('Production worker export anchor not found');
  source=source.replace(anchor,`${validator}${anchor}`);
}

const routeBlock=`    if (isAccountabilityTrackerRoute(path)) {
      if (!hasD1(env)) return unavailable('members-db-binding-unavailable', '', 'member');
      try {
        return validateAccountabilityTrackerResponse(await accountabilityTrackerWorker.fetch(request, env, ctx));
      } catch (error) {
        return unavailable('accountability-tracker-worker-exception', error?.message || error, 'member');
      }
    }

`;
if(!source.includes('isAccountabilityTrackerRoute(path)')){
  const anchor='    if (isIntelligenceReportRoute(path)) {';
  if(!source.includes(anchor))throw new Error('Intelligence route anchor not found');
  source=source.replace(anchor,`${routeBlock}${anchor}`);
}

if(!source.includes('runAccountabilityTracker(env')){
  const scheduledPattern=/  async scheduled\(event, env, ctx\) \{[\s\S]*?\n  \}\n\};\s*$/;
  if(!scheduledPattern.test(source))throw new Error('Scheduled handler anchor not found');
  source=source.replace(scheduledPattern,`  async scheduled(event, env, ctx) {
    if (!hasD1(env)) return;
    await queuePendingVerifiedSelfReports(env, { limit: 100 });
    await Promise.all([
      emailWorker.scheduled(event, env, ctx),
      bootstrapWorker.scheduled(event, env, ctx),
      rehearsalWorker.scheduled(event, env, ctx)
    ]);
    await runAccountabilityTracker(env, { trigger: event?.cron || 'scheduled' });
    await processOutbox(env, { limit: 100 });
  }
};\n`);
}

if(source!==before)fs.writeFileSync(workerFile,source);
const checks={
  imported:source.includes(importLine),
  routed:source.includes('isAccountabilityTrackerRoute(path)'),
  validated:source.includes('validateAccountabilityTrackerResponse'),
  scheduled:source.includes('runAccountabilityTracker(env'),
  deliversQueuedAlerts:source.includes("processOutbox(env, { limit: 100 })")
};
if(!Object.values(checks).every(Boolean))throw new Error(`Accountability tracker installation incomplete: ${JSON.stringify(checks)}`);
fs.mkdirSync(path.join(root,'downloads'),{recursive:true});
fs.writeFileSync(path.join(root,'downloads','accountability-tracker-worker-install.json'),`${JSON.stringify({ok:true,generatedAt:new Date().toISOString(),changed:source!==before,checks},null,2)}\n`);
console.log(`Accountability tracker production worker installed (${source===before?'already current':'updated'}).`);
