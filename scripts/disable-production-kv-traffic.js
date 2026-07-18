const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

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
function functionRange(source, functionName) {
  const candidates = [`async function ${functionName}`, `function ${functionName}`];
  let start = -1;
  for (const candidate of candidates) {
    const found = source.indexOf(candidate);
    if (found >= 0 && (start < 0 || found < start)) start = found;
  }
  if (start < 0) return null;
  const paramsOpen = source.indexOf('(', start);
  if (paramsOpen < 0) return null;
  let quote = '', escaped = false, lineComment = false, blockComment = false, parenDepth = 0, paramsClose = -1;
  for (let index = paramsOpen; index < source.length; index += 1) {
    const char = source[index], next = source[index + 1] || '';
    if (lineComment) { if (char === '\n') lineComment = false; continue; }
    if (blockComment) { if (char === '*' && next === '/') { blockComment = false; index += 1; } continue; }
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (char === '\\') { escaped = true; continue; }
      if (char === quote) quote = '';
      continue;
    }
    if (char === '/' && next === '/') { lineComment = true; index += 1; continue; }
    if (char === '/' && next === '*') { blockComment = true; index += 1; continue; }
    if (char === "'" || char === '"' || char === '`') { quote = char; continue; }
    if (char === '(') parenDepth += 1;
    else if (char === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) { paramsClose = index; break; }
    }
  }
  if (paramsClose < 0) return null;
  const bodyOpen = source.indexOf('{', paramsClose + 1);
  if (bodyOpen < 0) return null;
  quote = ''; escaped = false; lineComment = false; blockComment = false;
  let braceDepth = 0;
  for (let index = bodyOpen; index < source.length; index += 1) {
    const char = source[index], next = source[index + 1] || '';
    if (lineComment) { if (char === '\n') lineComment = false; continue; }
    if (blockComment) { if (char === '*' && next === '/') { blockComment = false; index += 1; } continue; }
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (char === '\\') { escaped = true; continue; }
      if (char === quote) quote = '';
      continue;
    }
    if (char === '/' && next === '/') { lineComment = true; index += 1; continue; }
    if (char === '/' && next === '*') { blockComment = true; index += 1; continue; }
    if (char === "'" || char === '"' || char === '`') { quote = char; continue; }
    if (char === '{') braceDepth += 1;
    else if (char === '}') {
      braceDepth -= 1;
      if (braceDepth === 0) return { start, end: index + 1 };
    }
  }
  return null;
}
function replaceFunction(source, functionName, replacement, required = true) {
  const found = functionRange(source, functionName);
  if (!found) {
    if (required) throw new Error(`Function ${functionName} was not found or was unbalanced`);
    return source;
  }
  return `${source.slice(0, found.start)}${replacement}${source.slice(found.end)}`;
}
function removeFunction(source, functionName) {
  const found = functionRange(source, functionName);
  if (!found) return source;
  let end = found.end;
  while (end < source.length && (source[end] === '\r' || source[end] === '\n')) end += 1;
  return `${source.slice(0, found.start)}${source.slice(end)}`;
}

let production = read('src/worker-production.js');
const productionBefore = production;
production = production
  .replace(/const response\s*=\s*await forumWorker\.fetch\(request,\s*env,\s*ctx\);/g, 'const response = await forumWorker.fetch(request, d1OnlyForumEnv(env), ctx);')
  .replace(/if\s*\(!forumRoutes\.has\(path\)\)\s*return forumWorker\.fetch\(request,\s*env,\s*ctx\);/g, 'if (!forumRoutes.has(path)) return forumWorker.fetch(request, d1OnlyForumEnv(env), ctx);');
writeIfChanged('src/worker-production.js', productionBefore, production);

let forum = read('src/worker-forum-persistence.js');
const forumBefore = forum;
for (const functionName of ['kvMirrorEnabled', 'migrateKvPosts', 'syncKvMirror', 'mirrorPost']) forum = removeFunction(forum, functionName);
forum = forum
  .replace(/\n?let migrationPromise;\n?/g, '\n')
  .replace(/await ensureSchema\(env\);await migrateKvPosts\(env\);/g, 'await ensureSchema(env);')
  .replace(/await migrateKvPosts\(env\);/g, '')
  .replace(/compatibilityMirror:kvMirrorEnabled\(env\)/g, 'compatibilityMirror:false')
  .replace(/const migration=await metaValue\(env,'kv_forum_migration_v1'\);/g, '')
  .replace(/kvBinding:kvMirrorEnabled\(env\)\?'optional recovery mirror enabled':'D1 authoritative; KV compatibility mirror disabled by default'/g, "kvBinding:'not used; D1 is the only forum store'")
  .replace(/kvMigration:migration\?JSON\.parse\(migration\):null/g, 'kvMigration:null')
  .replace(/if\(ctx\?\.waitUntil&&kvMirrorEnabled\(env\)\)ctx\.waitUntil\(Promise\.allSettled\(\[mirrorPost\(env,saved\),syncKvMirror\(env\)\]\)\);/g, '')
  .replace(/mirroredToKv:kvMirrorEnabled\(env\)/g, 'mirroredToKv:false')
  .replace(/D1 authoritative; KV compatibility mirror disabled by default/g, 'D1 authoritative; no KV forum path exists');
writeIfChanged('src/worker-forum-persistence.js', forumBefore, forum);

let legacy = read('src/worker.js');
const legacyBefore = legacy;
legacy = replaceFunction(legacy, 'handleTrackEvent', "async function handleTrackEvent(request,env){const body=await readBody(request);const eventName=cleanText(body.name||'event',80);return new Response(null,{status:204,headers:{...securityHeaders,'Cache-Control':'no-store','X-Matrix-Origin':'cloudflare-worker-api','X-Matrix-Worker':workerName,'X-Matrix-Analytics':eventName?'client-provider-only':'ignored'}})}");
legacy = replaceFunction(legacy, 'handleNewsletterSendWeekly', "async function handleNewsletterSendWeekly(){return json({ok:true,mode:'preview-only',storage:'No analytics or newsletter payload is written to KV',digest:'/downloads/weekly-newsletter-latest.json'})}", false);
writeIfChanged('src/worker.js', legacyBefore, legacy);

for (const configRel of ['wrangler.toml', 'wrangler.jsonc']) {
  let config = read(configRel);
  const before = config;
  if (configRel.endsWith('.toml')) {
    if (!config.includes('ENABLE_KV_COMPATIBILITY_MIRROR')) {
      if (config.includes('EMAIL_AUTOMATION_ENABLED = "true"')) config = config.replace('EMAIL_AUTOMATION_ENABLED = "true"', 'EMAIL_AUTOMATION_ENABLED = "true"\nENABLE_KV_COMPATIBILITY_MIRROR = "false"');
      else config += '\n[vars]\nENABLE_KV_COMPATIBILITY_MIRROR = "false"\n';
    } else config = config.replace(/ENABLE_KV_COMPATIBILITY_MIRROR\s*=\s*"[^"]*"/g, 'ENABLE_KV_COMPATIBILITY_MIRROR = "false"');
  } else {
    if (!config.includes('"ENABLE_KV_COMPATIBILITY_MIRROR"')) {
      config = config.replace(/("EMAIL_AUTOMATION_ENABLED"\s*:\s*"true"\s*,?)/, '$1\n    "ENABLE_KV_COMPATIBILITY_MIRROR": "false",');
    } else config = config.replace(/"ENABLE_KV_COMPATIBILITY_MIRROR"\s*:\s*"[^"]*"/g, '"ENABLE_KV_COMPATIBILITY_MIRROR": "false"');
  }
  writeIfChanged(configRel, before, config);
}

let verifier = read('scripts/live-site-verification.js');
const verifierBefore = verifier;
verifier = verifier.replace(/\{\s*path:\s*['"]\/forum-health['"][^\n]*\}/, "{ path: '/forum-health', json: true, markers: ['d1Connected', 'authoritativeStorage'], mustInclude: ['Cloudflare D1 MEMBERS_DB.forum_posts'], requireOrigin: true }");
writeIfChanged('scripts/live-site-verification.js', verifierBefore, verifier);

const finalProduction = read('src/worker-production.js');
const finalForum = read('src/worker-forum-persistence.js');
const finalLegacy = read('src/worker.js');
const finalWrangler = read('wrangler.toml');
const finalWranglerJson = read('wrangler.jsonc');
const finalVerifier = read('scripts/live-site-verification.js');
const semanticChecks = [
  ['production legacy route strips KV', finalProduction.includes('forumWorker.fetch(request, d1OnlyForumEnv(env), ctx)')],
  ['forum has no KV mirror helper', !finalForum.includes('kvMirrorEnabled(')],
  ['forum has no KV migration function', !finalForum.includes('migrateKvPosts(')],
  ['forum has no KV read path', !finalForum.includes('FORUM_POSTS.get(') && !finalForum.includes('FORUM_POSTS.list(')],
  ['forum has no KV write path', !finalForum.includes('FORUM_POSTS.put(')],
  ['forum declares D1-only state', finalForum.includes('compatibilityMirror:false') && finalForum.includes('mirroredToKv:false')],
  ['forum remains verified-member persistent', finalForum.includes('verified-free-member-session') && finalForum.includes('crossDevice:true')],
  ['analytics endpoint remains available', finalLegacy.includes('async function handleTrackEvent(')],
  ['analytics endpoint is non-persistent', finalLegacy.includes("'X-Matrix-Analytics':eventName?'client-provider-only':'ignored'")],
  ['analytics KV writes removed from handler', !functionRange(finalLegacy, 'handleTrackEvent') || !finalLegacy.slice(functionRange(finalLegacy, 'handleTrackEvent').start, functionRange(finalLegacy, 'handleTrackEvent').end).includes('FORUM_POSTS')],
  ['wrangler defensive KV switch false', finalWrangler.includes('ENABLE_KV_COMPATIBILITY_MIRROR = "false"')],
  ['wrangler JSON defensive KV switch false', finalWranglerJson.includes('"ENABLE_KV_COMPATIBILITY_MIRROR": "false"')],
  ['forum health verifier is D1 based', finalVerifier.includes("markers: ['d1Connected', 'authoritativeStorage']")]
];
for (const [label, ok] of semanticChecks) if (!ok) failures.push(label);

for (const relative of ['src/worker-production.js', 'src/worker-forum-persistence.js', 'src/worker.js']) {
  const syntax = spawnSync(process.execPath, ['--check', path.join(root, relative)], { cwd: root, encoding: 'utf8' });
  if (syntax.status !== 0) failures.push(`${relative} syntax: ${syntax.stderr || syntax.stdout}`);
}

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  changed: [...new Set(changed)],
  checks: Object.fromEntries(semanticChecks),
  failures,
  policy: 'Cloudflare D1 is the only Signal Board persistence layer. Production forum routes receive no KV binding, and analytics events are not persisted to KV.'
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'production-kv-traffic-repair.json'), `${JSON.stringify(report, null, 2)}\n`);
if (failures.length) {
  failures.forEach(item => console.error(`PRODUCTION KV TRAFFIC FAILURE: ${item}`));
  process.exit(1);
}
console.log('Production KV traffic disabled: Signal Board is D1-only and analytics is non-persistent; Worker syntax validated.');
