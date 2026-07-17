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
function write(relative, content) {
  const file = path.join(root, relative);
  fs.writeFileSync(file, content);
  changed.push(relative);
}
function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`${label} patch target not found`);
  return source.replace(before, after);
}

let production = read('src/worker-production.js');
production = replaceRequired(
  production,
  'const response = await forumWorker.fetch(request, env, ctx);',
  'const response = await forumWorker.fetch(request, d1OnlyForumEnv(env), ctx);',
  'completed report route must not receive KV'
);
production = replaceRequired(
  production,
  'if (!forumRoutes.has(path)) return forumWorker.fetch(request, env, ctx);',
  'if (!forumRoutes.has(path)) return forumWorker.fetch(request, d1OnlyForumEnv(env), ctx);',
  'legacy/static route must not receive KV'
);
write('src/worker-production.js', production);

let forum = read('src/worker-forum-persistence.js');
if (!forum.includes('function kvMirrorEnabled(')) {
  forum = replaceRequired(
    forum,
    "function hasD1(env) {\n  return Boolean(env?.MEMBERS_DB && typeof env.MEMBERS_DB.prepare === 'function');\n}\n",
    "function hasD1(env) {\n  return Boolean(env?.MEMBERS_DB && typeof env.MEMBERS_DB.prepare === 'function');\n}\nfunction kvMirrorEnabled(env) {\n  return String(env?.ENABLE_KV_COMPATIBILITY_MIRROR || 'false').toLowerCase() === 'true' && Boolean(env?.FORUM_POSTS);\n}\n",
    'KV compatibility gate'
  );
}
forum = forum.replace("if (!env.FORUM_POSTS) return { migrated: 0, source: 'no-kv-binding' };", "if (!kvMirrorEnabled(env)) return { migrated: 0, source: 'kv-compatibility-disabled' };");
forum = forum.replace('if (!env.FORUM_POSTS || !hasD1(env)) return;', 'if (!kvMirrorEnabled(env) || !hasD1(env)) return;');
forum = forum.replace('if (!env.FORUM_POSTS) return;\n  await env.FORUM_POSTS.put(`post:${post.id}`', 'if (!kvMirrorEnabled(env)) return;\n  await env.FORUM_POSTS.put(`post:${post.id}`');
forum = forum.replace("kvBinding: env.FORUM_POSTS ? 'connected compatibility mirror' : 'missing',", "kvBinding: kvMirrorEnabled(env) ? 'connected opt-in compatibility mirror' : 'disabled in production',");
forum = forum.replace('compatibilityMirror: Boolean(env.FORUM_POSTS),', 'compatibilityMirror: kvMirrorEnabled(env),');
forum = forum.replace("indexSelfHealing: 'D1 authoritative; KV mirror rebuilt from D1',", "indexSelfHealing: 'D1 authoritative; KV compatibility mirror disabled by default',");
forum = forum.replace('if (ctx?.waitUntil && env.FORUM_POSTS) ctx.waitUntil(env.FORUM_POSTS.put(`report:${report.id}`', 'if (ctx?.waitUntil && kvMirrorEnabled(env)) ctx.waitUntil(env.FORUM_POSTS.put(`report:${report.id}`');
forum = forum.replace('mirroredToKv: Boolean(env.FORUM_POSTS),', 'mirroredToKv: kvMirrorEnabled(env),');
write('src/worker-forum-persistence.js', forum);

let legacy = read('src/worker.js');
const oldTrack = "async function handleTrackEvent(request,env){const body=await readBody(request);const event={id:makeId(),name:cleanText(body.name||'event',80),route:cleanText(body.route||'',120),page:cleanText(body.page||'',240),createdAt:new Date().toISOString()};if(env.FORUM_POSTS){await withTimeout(env.FORUM_POSTS.put(`analytics:${event.id}`,JSON.stringify(event),{expirationTtl:60*60*24*45,metadata:{name:event.name,route:event.route,page:event.page}}).catch(()=>false),500,false)}return new Response(null,{status:204,headers:{...securityHeaders,'Cache-Control':'no-store','X-Matrix-Origin':'cloudflare-worker-api','X-Matrix-Worker':workerName}})}";
const newTrack = "async function handleTrackEvent(request,env){const body=await readBody(request);const eventName=cleanText(body.name||'event',80);return new Response(null,{status:204,headers:{...securityHeaders,'Cache-Control':'no-store','X-Matrix-Origin':'cloudflare-worker-api','X-Matrix-Worker':workerName,'X-Matrix-Analytics':eventName?'client-provider-only':'ignored'}})}";
legacy = replaceRequired(legacy, oldTrack, newTrack, 'analytics KV write removal');
legacy = legacy.replace("async function handleNewsletterSendWeekly(){return json({ok:true,mode:'preview-only',storage:'Cloudflare KV FORUM_POSTS',digest:'/downloads/weekly-newsletter-latest.json'})}", "async function handleNewsletterSendWeekly(){return json({ok:true,mode:'preview-only',storage:'No analytics or newsletter payload is written to KV',digest:'/downloads/weekly-newsletter-latest.json'})}");
write('src/worker.js', legacy);

let wrangler = read('wrangler.toml');
if (!wrangler.includes('ENABLE_KV_COMPATIBILITY_MIRROR')) {
  wrangler = wrangler.replace('EMAIL_AUTOMATION_ENABLED = "true"', 'EMAIL_AUTOMATION_ENABLED = "true"\nENABLE_KV_COMPATIBILITY_MIRROR = "false"');
  write('wrangler.toml', wrangler);
}

let verifier = read('scripts/live-site-verification.js');
verifier = verifier.replace("{ path: '/forum-health', json: true, markers: ['forumPostsBinding'], requireOrigin: true },", "{ path: '/forum-health', json: true, markers: ['d1Connected', 'authoritativeStorage'], mustInclude: ['Cloudflare D1 MEMBERS_DB.forum_posts'], requireOrigin: true },");
write('scripts/live-site-verification.js', verifier);

const finalProduction = read('src/worker-production.js');
const finalForum = read('src/worker-forum-persistence.js');
const finalLegacy = read('src/worker.js');
const finalWrangler = read('wrangler.toml');
const finalVerifier = read('scripts/live-site-verification.js');
for (const [label, ok] of [
  ['production legacy route strips KV', finalProduction.includes('forumWorker.fetch(request, d1OnlyForumEnv(env), ctx)')],
  ['KV mirror defaults off', finalForum.includes("ENABLE_KV_COMPATIBILITY_MIRROR || 'false'")],
  ['analytics KV writes removed', !finalLegacy.includes('FORUM_POSTS.put(`analytics:')],
  ['wrangler KV mirror switch false', finalWrangler.includes('ENABLE_KV_COMPATIBILITY_MIRROR = "false"')],
  ['forum health verifier is D1 based', finalVerifier.includes("markers: ['d1Connected', 'authoritativeStorage']")]
]) if (!ok) failures.push(label);

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  changed: [...new Set(changed)],
  failures,
  policy: 'Cloudflare D1 is authoritative. Workers KV compatibility and analytics writes are disabled in production unless explicitly re-enabled.'
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'production-kv-traffic-repair.json'), `${JSON.stringify(report, null, 2)}\n`);
if (failures.length) {
  failures.forEach(item => console.error(`PRODUCTION KV TRAFFIC FAILURE: ${item}`));
  process.exit(1);
}
console.log('Production KV traffic disabled: D1 remains authoritative; analytics no longer creates one KV key per event.');
