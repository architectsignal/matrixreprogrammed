const fs = require('fs');
const path = require('path');

const root = process.cwd();
const changed = [];
const failures = [];

function read(relative) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) throw new Error(`Missing required file: ${relative}`);
  return fs.readFileSync(file, 'utf8');
}
function writeIfChanged(relative, before, after) {
  if (after === before) return;
  fs.writeFileSync(path.join(root, relative), after);
  changed.push(relative);
}
function replaceFunction(source, functionName, replacement) {
  const start = source.indexOf(`async function ${functionName}(`);
  if (start < 0) return source;
  const next = source.indexOf('\nasync function ', start + 16);
  if (next < 0) return source;
  return `${source.slice(0, start)}${replacement}\n${source.slice(next + 1)}`;
}

let production = read('src/worker-production.js');
const productionBefore = production;
production = production
  .replace(/const response\s*=\s*await forumWorker\.fetch\(request,\s*env,\s*ctx\);/g, 'const response = await forumWorker.fetch(request, d1OnlyForumEnv(env), ctx);')
  .replace(/if\s*\(!forumRoutes\.has\(path\)\)\s*return forumWorker\.fetch\(request,\s*env,\s*ctx\);/g, 'if (!forumRoutes.has(path)) return forumWorker.fetch(request, d1OnlyForumEnv(env), ctx);');
writeIfChanged('src/worker-production.js', productionBefore, production);

let forum = read('src/worker-forum-persistence.js');
const forumBefore = forum;
if (!forum.includes('function kvMirrorEnabled(')) {
  const hasD1Pattern = /function hasD1\(env\)\s*\{[\s\S]*?\n\}/;
  const match = forum.match(hasD1Pattern);
  if (match) forum = forum.replace(match[0], `${match[0]}\nfunction kvMirrorEnabled(env) {\n  return String(env?.ENABLE_KV_COMPATIBILITY_MIRROR || 'false').toLowerCase() === 'true' && Boolean(env?.FORUM_POSTS);\n}`);
}
forum = forum
  .replace(/if\s*\(!env\.FORUM_POSTS\)\s*return\s*\{\s*migrated:\s*0,\s*source:\s*['"]no-kv-binding['"]\s*\};/g, "if (!kvMirrorEnabled(env)) return { migrated: 0, source: 'kv-compatibility-disabled' };")
  .replace(/if\s*\(!env\.FORUM_POSTS\s*\|\|\s*!hasD1\(env\)\)\s*return;/g, 'if (!kvMirrorEnabled(env) || !hasD1(env)) return;')
  .replace(/if\s*\(!env\.FORUM_POSTS\)\s*return;\s*\n\s*await env\.FORUM_POSTS\.put\(`post:\$\{post\.id\}`/g, 'if (!kvMirrorEnabled(env)) return;\n  await env.FORUM_POSTS.put(`post:${post.id}`')
  .replace(/kvBinding:\s*env\.FORUM_POSTS\s*\?\s*['"]connected compatibility mirror['"]\s*:\s*['"]missing['"]/g, "kvBinding: kvMirrorEnabled(env) ? 'connected opt-in compatibility mirror' : 'disabled in production'")
  .replace(/compatibilityMirror:\s*Boolean\(env\.FORUM_POSTS\)/g, 'compatibilityMirror: kvMirrorEnabled(env)')
  .replace(/indexSelfHealing:\s*['"]D1 authoritative; KV mirror rebuilt from D1['"]/g, "indexSelfHealing: 'D1 authoritative; KV compatibility mirror disabled by default'")
  .replace(/if\s*\(ctx\?\.waitUntil\s*&&\s*env\.FORUM_POSTS\)/g, 'if (ctx?.waitUntil && kvMirrorEnabled(env))')
  .replace(/mirroredToKv:\s*Boolean\(env\.FORUM_POSTS\)/g, 'mirroredToKv: kvMirrorEnabled(env)');
writeIfChanged('src/worker-forum-persistence.js', forumBefore, forum);

let legacy = read('src/worker.js');
const legacyBefore = legacy;
const safeTrack = "async function handleTrackEvent(request,env){const body=await readBody(request);const eventName=cleanText(body.name||'event',80);return new Response(null,{status:204,headers:{...securityHeaders,'Cache-Control':'no-store','X-Matrix-Origin':'cloudflare-worker-api','X-Matrix-Worker':workerName,'X-Matrix-Analytics':eventName?'client-provider-only':'ignored'}})}";
if (!legacy.includes("'X-Matrix-Analytics':eventName?'client-provider-only':'ignored'")) {
  legacy = replaceFunction(legacy, 'handleTrackEvent', safeTrack);
}
legacy = legacy
  .replace(/async function handleNewsletterSendWeekly\(\)\{return json\(\{ok:true,mode:'preview-only',storage:'Cloudflare KV FORUM_POSTS',digest:'\/downloads\/weekly-newsletter-latest\.json'\}\)\}/g, "async function handleNewsletterSendWeekly(){return json({ok:true,mode:'preview-only',storage:'No analytics or newsletter payload is written to KV',digest:'/downloads/weekly-newsletter-latest.json'})}")
  .replace(/if\s*\(env\.FORUM_POSTS\)\s*\{?\s*await withTimeout\(env\.FORUM_POSTS\.put\(`analytics:[\s\S]*?\}\s*/g, '');
writeIfChanged('src/worker.js', legacyBefore, legacy);

let wrangler = read('wrangler.toml');
const wranglerBefore = wrangler;
if (!wrangler.includes('ENABLE_KV_COMPATIBILITY_MIRROR')) {
  if (wrangler.includes('EMAIL_AUTOMATION_ENABLED = "true"')) wrangler = wrangler.replace('EMAIL_AUTOMATION_ENABLED = "true"', 'EMAIL_AUTOMATION_ENABLED = "true"\nENABLE_KV_COMPATIBILITY_MIRROR = "false"');
  else wrangler += '\n[vars]\nENABLE_KV_COMPATIBILITY_MIRROR = "false"\n';
}
writeIfChanged('wrangler.toml', wranglerBefore, wrangler);

let verifier = read('scripts/live-site-verification.js');
const verifierBefore = verifier;
verifier = verifier.replace(/\{\s*path:\s*['"]\/forum-health['"][^\n]*\}/, "{ path: '/forum-health', json: true, markers: ['d1Connected', 'authoritativeStorage'], mustInclude: ['Cloudflare D1 MEMBERS_DB.forum_posts'], requireOrigin: true }");
writeIfChanged('scripts/live-site-verification.js', verifierBefore, verifier);

const finalProduction = read('src/worker-production.js');
const finalForum = read('src/worker-forum-persistence.js');
const finalLegacy = read('src/worker.js');
const finalWrangler = read('wrangler.toml');
const finalVerifier = read('scripts/live-site-verification.js');
for (const [label, ok] of [
  ['production legacy route strips KV', finalProduction.includes('forumWorker.fetch(request, d1OnlyForumEnv(env), ctx)')],
  ['KV mirror helper exists', finalForum.includes('function kvMirrorEnabled(')],
  ['KV mirror defaults off', finalForum.includes("ENABLE_KV_COMPATIBILITY_MIRROR || 'false'")],
  ['analytics endpoint remains available', finalLegacy.includes('async function handleTrackEvent(')],
  ['analytics endpoint is non-persistent', finalLegacy.includes("'X-Matrix-Analytics':eventName?'client-provider-only':'ignored'")],
  ['analytics KV writes removed', !finalLegacy.includes('FORUM_POSTS.put(`analytics:') && !finalLegacy.includes('analytics:${event.id}')],
  ['wrangler KV mirror switch false', finalWrangler.includes('ENABLE_KV_COMPATIBILITY_MIRROR = "false"')],
  ['forum health verifier is D1 based', finalVerifier.includes("markers: ['d1Connected', 'authoritativeStorage']")]
]) if (!ok) failures.push(label);

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  changed: [...new Set(changed)],
  failures,
  policy: 'Cloudflare D1 is authoritative. Workers KV compatibility and per-event analytics writes are disabled in production unless explicitly re-enabled.'
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'production-kv-traffic-repair.json'), `${JSON.stringify(report, null, 2)}\n`);
if (failures.length) {
  failures.forEach(item => console.error(`PRODUCTION KV TRAFFIC FAILURE: ${item}`));
  process.exit(1);
}
console.log('Production KV traffic disabled: D1 remains authoritative; analytics no longer creates one KV key per event.');
