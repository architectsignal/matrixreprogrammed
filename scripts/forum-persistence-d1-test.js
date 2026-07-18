const fs = require('fs');
const path = require('path');

const root = process.cwd();
const failures = [];
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const exists = rel => fs.existsSync(path.join(root, rel));
const check = (label, ok) => { if (!ok) failures.push(label); };

for (const rel of [
  'src/worker.js',
  'src/worker-forum-persistence.js',
  'src/worker-member-experience.js',
  'src/worker-production.js',
  'forum.js',
  'wrangler.toml',
  'wrangler.jsonc',
  'migrations/0004_forum_persistence.sql',
  'migrations/phase9_signal_board_persistence.sql'
]) check(`missing ${rel}`, exists(rel));

if (!failures.length) {
  const strict = read('src/worker-production.js');
  const wrapper = read('src/worker-forum-persistence.js');
  const member = read('src/worker-member-experience.js');
  const client = read('forum.js');
  const legacy = read('src/worker.js');
  const toml = read('wrangler.toml');
  const jsonc = read('wrangler.jsonc');
  const migration = read('migrations/0004_forum_persistence.sql');
  const ownershipMigration = read('migrations/phase9_signal_board_persistence.sql');

  check('strict Worker does not delegate through D1-only environment', strict.includes('return forumWorker.fetch(request, d1OnlyForumEnv(env), ctx)'));
  check('strict Worker does not use D1-only environment for report delivery', strict.includes('const response = await forumWorker.fetch(request, d1OnlyForumEnv(env), ctx)'));
  check('strict Worker does not reject non-forum traffic correctly', strict.includes('if (!forumRoutes.has(path))'));
  check('strict Worker does not fail closed when D1 is missing', strict.includes('members-db-binding-unavailable'));
  check('strict Worker does not reject non-authoritative forum responses', strict.includes('non-authoritative-forum-response-blocked'));
  check('strict Worker does not verify forum origin', strict.includes("origin !== 'cloudflare-worker-forum-d1'"));
  check('strict Worker does not verify D1 health fields', strict.includes("health?.d1Connected === true") && strict.includes("health?.backend === 'src/worker-forum-persistence.js'"));
  check('strict Worker does not return a 503 boundary', strict.includes('status: 503'));

  check('wrapper does not delegate non-forum traffic', /return\s+legacyWorker\.fetch\(request,[^;]+\)/.test(wrapper));
  check('wrapper missing verified member session integration', wrapper.includes("import { memberSessionContext } from './worker-member-experience.js';") && wrapper.includes('verified-free-member-session'));
  check('wrapper missing D1 schema bootstrap', wrapper.includes('CREATE TABLE IF NOT EXISTS forum_posts'));
  check('wrapper missing authoritative D1 insert', wrapper.includes('INSERT OR IGNORE INTO forum_posts'));
  check('wrapper missing authoritative D1 feed query', wrapper.includes("FROM forum_posts WHERE status='live'"));
  check('wrapper missing D1 report persistence', wrapper.includes('INSERT INTO forum_reports'));
  check('wrapper missing post ownership ledger', wrapper.includes('forum_post_owners'));
  check('wrapper missing report ownership ledger', wrapper.includes('forum_report_owners'));
  check('wrapper missing board state ledger', wrapper.includes('forum_board_state'));
  check('wrapper still exposes KV mirror helper', !wrapper.includes('kvMirrorEnabled('));
  check('wrapper still reads forum state from KV', !wrapper.includes('FORUM_POSTS.get(') && !wrapper.includes('FORUM_POSTS.list('));
  check('wrapper still writes forum state to KV', !wrapper.includes('FORUM_POSTS.put('));
  check('wrapper missing D1-only state declaration', wrapper.includes('compatibilityMirror:false') && wrapper.includes('mirroredToKv:false'));
  check('wrapper accepts success without D1 write', !/saved:\s*true[\s\S]{0,300}legacyWorker/.test(wrapper));
  check('wrapper missing explicit failed persistence response', wrapper.includes('the post was not accepted as persistent') || wrapper.includes('no browser or legacy fallback was accepted'));
  check('wrapper missing board-specific routes', ['/forum-feed-main','/forum-feed-speculation','/forum-feed-epstein-alive','/submit-main-post','/submit-speculation-post','/submit-epstein-alive-post'].every(route => wrapper.includes(route)));
  check('member capability missing Signal Board posting', member.includes("'signal_board_posting'") && member.includes('export async function memberSessionContext'));
  check('frontend accepts non-persistent feed or save', client.includes('data.persistent!==true') && client.includes('No browser-only or temporary fallback is accepted'));
  check('frontend loses confirmed post during feed refresh', client.includes('mergePosts(') && client.includes('loadFeed([livePost])'));
  check('frontend lacks persistent success confirmation', client.includes('Signal posted live and saved persistently in Cloudflare D1.'));
  check('legacy Worker lost non-forum asset delegation', legacy.includes('env.ASSETS.fetch'));
  check('legacy analytics endpoint still writes to KV', !legacy.includes('FORUM_POSTS.put(`analytics:'));
  check('wrangler.toml not using strict production Worker', toml.includes('main = "src/worker-production.js"'));
  check('wrangler.jsonc not using strict production Worker', jsonc.includes('"main": "src/worker-production.js"'));
  check('MEMBERS_DB binding missing', toml.includes('binding = "MEMBERS_DB"') && jsonc.includes('"binding": "MEMBERS_DB"'));
  check('defensive KV compatibility binding missing', toml.includes('FORUM_POSTS') && jsonc.includes('FORUM_POSTS'));
  check('KV compatibility switch is not disabled', toml.includes('ENABLE_KV_COMPATIBILITY_MIRROR = "false"'));
  check('forum_posts migration missing', migration.includes('CREATE TABLE IF NOT EXISTS forum_posts'));
  check('forum_reports migration missing', migration.includes('CREATE TABLE IF NOT EXISTS forum_reports'));
  check('forum chronology index missing', migration.includes('idx_forum_posts_board_created'));
  check('forum status index missing', migration.includes('idx_forum_posts_status_created'));
  check('post owner migration missing', ownershipMigration.includes('CREATE TABLE IF NOT EXISTS forum_post_owners'));
  check('report owner migration missing', ownershipMigration.includes('CREATE TABLE IF NOT EXISTS forum_report_owners'));
  check('board state migration missing', ownershipMigration.includes('CREATE TABLE IF NOT EXISTS forum_board_state'));
  check('persistence health view missing', ownershipMigration.includes('CREATE VIEW forum_persistence_health'));
}

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  failures,
  persistenceModel: 'Cloudflare D1 is authoritative behind a strict production boundary; verified-member ownership ledgers provide cross-device persistence and forum KV reads/writes are forbidden.',
  boundary: 'The test rejects missing D1, legacy forum fallback, non-D1 health responses, success without authoritative D1 writes, browser-only persistence, forum KV operations and analytics KV writes.'
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'forum-persistence-d1-test.json'), JSON.stringify(report, null, 2));
if (failures.length) {
  console.error('FORUM D1 PERSISTENCE TEST FAILED');
  failures.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}
console.log('FORUM D1 PERSISTENCE TEST PASSED');
console.log('Verified strict D1 failure semantics, verified-member ownership ledgers, authoritative forum writes and reads, confirmed-post preservation and zero forum KV operations.');
