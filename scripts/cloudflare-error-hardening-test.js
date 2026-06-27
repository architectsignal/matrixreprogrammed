const fs = require('fs');
const path = require('path');
const root = process.cwd();
const issues=[];
function exists(name){return fs.existsSync(path.join(root,name))}
function read(name){return fs.readFileSync(path.join(root,name),'utf8')}
function needFile(name){if(!exists(name))issues.push(`missing ${name}`)}
function needText(name,text){if(exists(name)&&!read(name).includes(text))issues.push(`${name} missing ${text}`)}
for(const f of ['scripts/build-cloudflare-error-hardening.js','src/worker.js','_headers','scripts/harden-public-html.js'])needFile(f);
needText('scripts/harden-public-html.js','build-cloudflare-error-hardening.js');
for(const marker of ['isHostileProbePath','cacheHeadersForPath','hardenResponse','safeNotConfigured','Strict-Transport-Security','Worker handled failure safely'])needText('src/worker.js',marker);
for(const route of ['/black-file-index','/answer-index','/atlas-index','/evidence-vault-index','/secret-societies-hub','/intelligence-hub','/crime-hub','/war-conflict-hub','/dashboard-human-cost','/dashboard-conflict','/dashboard-economy','/epstein-files','/migration','/newsletter'])needText('src/worker.js',route);
needText('src/worker.js','ELEVENLABS_API_KEY');
needText('src/worker.js','safeNotConfigured');
needText('_headers','Strict-Transport-Security');
needText('_headers','max-age=31536000');
needText('_headers','/*.js');
needText('_headers','immutable');
needText('_headers','/downloads/*.pdf');
if(issues.length){console.error('CLOUDFLARE ERROR HARDENING TEST FAILED');for(const i of issues)console.error(`- ${i}`);process.exit(1)}
console.log('CLOUDFLARE ERROR HARDENING TEST PASSED');
console.log('Checked route aliases, safe Worker failure handling, hostile probe handling, HTTPS/security headers, and cache headers.');
