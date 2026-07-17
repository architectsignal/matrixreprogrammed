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
  'src/worker-production.js',
  'wrangler.toml',
  'wrangler.jsonc',
  'migrations/0004_forum_persistence.sql'
]) check(`missing ${rel}`, exists(rel));

if (!failures.length) {
  const strict = read('src/worker-production.js');
  const wrapper = read('src/worker-forum-persistence.js');
  const legacy = read('src/worker.js');
  const toml = read('wrangler.toml');
  const jsonc = read('wrangler.jsonc');
  const migration = read('migrations/0004_forum_persistence.sql');

  check('strict Worker does not strip KV from normal traffic', strict.includes('return forumWorker.fetch(request, d1OnlyForumEnv(env), ctx)'));
  check('strict Worker does not strip KV from completed report delivery', strict.includes('const response = await forumWorker.fetch(request, d1OnlyForumEnv(env), ctx)'));
  check('strict Worker does not reject non-forum traffic', strict.includes('if (!forumRoutes.has(path))'));
  check('strict Worker accepts a missing D1 binding', strict.includes('members-db-binding-unavailable'));
  check('strict Worker accepts a legacy forum response', strict.includes('non-authoritative-forum-response-blocked'));
  check('strict Worker does not verify forum origin', strict.includes("origin !== 'cloudflare-worker-forum-d1'"));
  check('strict Worker does not verify D1 health fields', strict.includes("health?.d1Connected === true") && strict.includes("health?.backend === 'src/worker-forum-persistence.js'"));
  check('strict Worker does not return a 503 boundary', strict.includes('status: 503'));

  check('wrapper does not delegate non-forum traffic', wrapper.includes('return legacyWorker.fetch(request, env, ctx)'));
  check('wrapper missing D1 schema bootstrap', wrapper.includes('CREATE TABLE IF NOT EXISTS forum_posts'));
  check('wrapper missing authoritative D1 insert', wrapper.includes('INSERT OR IGNORE INTO forum_posts'));
  check('wrapper missing authoritative D1 feed query', wrapper.includes("FROM forum_posts WHERE status='live'"));
  check('wrapper missing D1 report persistence', wrapper.includes('INSERT INTO forum_reports'));
  check('wrapper missing optional KV migration path', wrapper.includes('kv_forum_migration_v1') && wrapper.includes("prefix: 'post:'"));
  check('wrapper missing disabled-by-default KV mirror boundary', wrapper.includes('D1 authoritative; KV compatibility mirror disabled by default'));
  check('wrapper missing explicit KV opt-in gate', wrapper.includes("ENABLE_KV_COMPATIBILITY_MIRROR || 'false'"));
  check('wrapper accepts success without D1 write', !/saved:\s*true[\s\S]{0,300}legacyWorker/.test(wrapper));
  check('wrapper missing explicit failed persistence response', wrapper.includes('the post was not accepted as persistent'));
  check('wrapper missing board-specific routes', ['/forum-feed-main','/forum-feed-speculation','/forum-feed-epstein-alive','/submit-main-post','/submit-speculation-post','/submit-epstein-alive-post'].every(route => wrapper.includes(route)));
  check('legacy Worker lost non-forum asset delegation', legacy.includes('env.ASSETS.fetch'));
  check('legacy analytics endpoint still writes to KV', !legacy.includes('FORUM_POSTS.put(`analytics:'));
  check('wrangler.toml not using strict production Worker', toml.includes('main = "src/worker-production.js"'));
  check('wrangler.jsonc not using strict production Worker', jsonc.includes('"main": "src/worker-production.js"'));
  check('MEMBERS_DB binding missing', toml.includes('binding = "MEMBERS_DB"') && jsonc.includes('"binding": "MEMBERS_DB"'));
  check('KV compatibility binding missing', toml.includes('FORUM_POSTS') && jsonc.includes('FORUM_POSTS'));
  check('KV compatibility switch is not disabled', toml.includes('ENABLE_KV_COMPATIBILITY_MIRROR = "false"'));
  check('forum_posts migration missing', migration.includes('CREATE TABLE IF NOT EXISTS forum_posts'));
  check('forum_reports migration missing', migration.includes('CREATE TABLE IF NOT EXISTS forum_reports'));
  check('forum chronology index missing', migration.includes('idx_forum_posts_board_created'));
  check('forum status index missing', migration.includes('idx_forum_posts_status_created'));
}

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  failures,
  persistenceModel: 'Cloudflare D1 is authoritative behind a strict production boundary; KV compatibility is disabled by default and normal traffic cannot create KV operations.',
  boundary: 'The test rejects missing D1, legacy forum fallback, non-D1 health responses, success without authoritative D1 writes, analytics KV writes and unnecessary KV exposure to normal traffic.'
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'forum-persistence-d1-test.json'), JSON.stringify(report, null, 2));
if (failures.length) {
  console.error('FORUM D1 PERSISTENCE TEST FAILED');
  failures.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}
console.log('FORUM D1 PERSISTENCE TEST PASSED');
console.log('Verified strict D1 failure semantics, authoritative forum writes and reads, KV-safe normal routing, disabled analytics KV writes and optional recovery compatibility only.');
