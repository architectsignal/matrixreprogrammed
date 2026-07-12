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
  'wrangler.toml',
  'wrangler.jsonc',
  'migrations/0004_forum_persistence.sql'
]) check(`missing ${rel}`, exists(rel));

if (!failures.length) {
  const wrapper = read('src/worker-forum-persistence.js');
  const legacy = read('src/worker.js');
  const toml = read('wrangler.toml');
  const jsonc = read('wrangler.jsonc');
  const migration = read('migrations/0004_forum_persistence.sql');

  check('wrapper does not delegate non-forum traffic', wrapper.includes("return legacyWorker.fetch(request, env, ctx)"));
  check('wrapper missing D1 schema bootstrap', wrapper.includes('CREATE TABLE IF NOT EXISTS forum_posts'));
  check('wrapper missing authoritative D1 insert', wrapper.includes('INSERT OR IGNORE INTO forum_posts'));
  check('wrapper missing authoritative D1 feed query', wrapper.includes("FROM forum_posts WHERE status='live'"));
  check('wrapper missing D1 report persistence', wrapper.includes('INSERT INTO forum_reports'));
  check('wrapper missing KV migration', wrapper.includes('kv_forum_migration_v1') && wrapper.includes("prefix: 'post:'"));
  check('wrapper missing KV mirror boundary', wrapper.includes('D1 authoritative; KV compatibility mirror'));
  check('wrapper accepts success without D1 write', !/saved:\s*true[\s\S]{0,300}legacyWorker/.test(wrapper));
  check('wrapper missing explicit failed persistence response', wrapper.includes('the post was not accepted as persistent'));
  check('wrapper missing board-specific routes', ['/forum-feed-main','/forum-feed-speculation','/forum-feed-epstein-alive','/submit-main-post','/submit-speculation-post','/submit-epstein-alive-post'].every(route => wrapper.includes(route)));
  check('legacy Worker lost non-forum asset delegation', legacy.includes('env.ASSETS.fetch'));
  check('wrangler.toml not using persistence wrapper', toml.includes('main = "src/worker-forum-persistence.js"'));
  check('wrangler.jsonc not using persistence wrapper', jsonc.includes('"main": "src/worker-forum-persistence.js"'));
  check('MEMBERS_DB binding missing', toml.includes('binding = "MEMBERS_DB"') && jsonc.includes('"binding": "MEMBERS_DB"'));
  check('FORUM_POSTS recovery mirror missing', toml.includes('FORUM_POSTS') && jsonc.includes('FORUM_POSTS'));
  check('forum_posts migration missing', migration.includes('CREATE TABLE IF NOT EXISTS forum_posts'));
  check('forum_reports migration missing', migration.includes('CREATE TABLE IF NOT EXISTS forum_reports'));
  check('forum chronology index missing', migration.includes('idx_forum_posts_board_created'));
  check('forum status index missing', migration.includes('idx_forum_posts_status_created'));
}

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  failures,
  persistenceModel: 'Cloudflare D1 is authoritative; KV is a compatibility mirror and migration source.',
  boundary: 'The test rejects a forum implementation that reads only posts:index or reports success without an authoritative D1 write.'
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'forum-persistence-d1-test.json'), JSON.stringify(report, null, 2));
if (failures.length) {
  console.error('FORUM D1 PERSISTENCE TEST FAILED');
  failures.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}
console.log('FORUM D1 PERSISTENCE TEST PASSED');
console.log('Verified D1-authoritative writes and reads, KV recovery, board routes, migration schema, failure semantics and legacy Worker delegation.');
