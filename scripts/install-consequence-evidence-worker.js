'use strict';

const fs=require('fs');
const path=require('path');
const root=process.cwd();
require('./harden-consequence-tracking-runtime.js');
const workerFile=path.join(root,'src','worker-production.js');
if(!fs.existsSync(workerFile))throw new Error('src/worker-production.js is required');
let source=fs.readFileSync(workerFile,'utf8');
const before=source;
const importLine="import consequenceEvidenceWorker, { isConsequenceEvidenceRoute } from './worker-consequence-evidence.js';";
if(!source.includes(importLine)){
  const anchor="import consequenceTrackerWorker, { isConsequenceTrackerRoute } from './worker-consequence-tracker.js';";
  if(!source.includes(anchor))throw new Error('Consequence tracker import anchor not found');
  source=source.replace(anchor,`${anchor}\n${importLine}`);
}
const validator=`async function validateConsequenceEvidenceResponse(response) {
  const origin = response.headers.get('x-matrix-origin');
  if (origin !== 'cloudflare-worker-consequence-evidence') {
    return unavailable('non-authoritative-consequence-evidence-response-blocked', \`Origin was \${origin || 'missing'}\`, 'member');
  }
  return response;
}

`;
if(!source.includes('validateConsequenceEvidenceResponse')){
  const anchor='async function validateConsequenceTrackerResponse(response) {';
  if(!source.includes(anchor))throw new Error('Consequence tracker validator anchor not found');
  source=source.replace(anchor,`${validator}${anchor}`);
}
const dispatch=`    if (isConsequenceEvidenceRoute(path)) {
      if (!hasD1(env)) return unavailable('members-db-binding-unavailable', '', 'member');
      try {
        return validateConsequenceEvidenceResponse(await consequenceEvidenceWorker.fetch(request, env, ctx));
      } catch (error) {
        return unavailable('consequence-evidence-worker-exception', error?.message || error, 'member');
      }
    }

`;
if(!source.includes('isConsequenceEvidenceRoute(path)')){
  const anchor='    if (isConsequenceTrackerRoute(path)) {';
  if(!source.includes(anchor))throw new Error('Consequence tracker dispatch anchor not found');
  source=source.replace(anchor,`${dispatch}${anchor}`);
}
if(source!==before)fs.writeFileSync(workerFile,source);
const checks={imported:source.includes(importLine),validated:source.includes('validateConsequenceEvidenceResponse'),routed:source.includes('isConsequenceEvidenceRoute(path)'),boundedSchedulerPreserved:source.includes('consequenceTrackerWorker.scheduled')};
if(!Object.values(checks).every(Boolean))throw new Error(`Consequence evidence worker installation failed: ${JSON.stringify(checks)}`);
fs.mkdirSync(path.join(root,'downloads'),{recursive:true});
fs.writeFileSync(path.join(root,'downloads','consequence-evidence-worker-install.json'),`${JSON.stringify({ok:true,generatedAt:new Date().toISOString(),changed:source!==before,checks},null,2)}\n`);
console.log(`Consequence evidence worker installed (${source===before?'already current':'updated'}).`);
