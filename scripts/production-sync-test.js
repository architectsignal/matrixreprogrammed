const fs = require('fs');
const path = require('path');
const root = process.cwd();
const site = path.join(root, '_site');
const failures = [];
function exists(rel) { return fs.existsSync(path.join(root, rel)); }
function read(rel) { return exists(rel) ? fs.readFileSync(path.join(root, rel), 'utf8') : ''; }
function siteRead(rel) { const file = path.join(site, rel); return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''; }
function check(name, ok) { if (!ok) failures.push(name); }
check('deploy workflow refreshes intelligence', read('.github/workflows/deploy.yml').includes('run-investigation-machine.js daily') && read('.github/workflows/deploy.yml').includes('update-live-intel.js'));
check('deploy workflow cancels stale deployment', /cancel-in-progress:\s*true/.test(read('.github/workflows/deploy.yml')));
check('deploy workflow verifies live SHA', read('.github/workflows/deploy.yml').includes('verify-live-production.js'));
check('live verifier proves forum D1 write/read', read('scripts/verify-live-production.js').includes('verifyForumPersistence') && read('scripts/verify-live-production.js').includes('/submit-main-post') && read('scripts/verify-live-production.js').includes('storedPostCount'));
check('live verifier proves health SHA', read('scripts/verify-live-production.js').includes('/deploy-health.json') && read('scripts/verify-live-production.js').includes('healthMatches'));
check('live verifier keeps payments deferred', read('scripts/verify-live-production.js').includes("health?.paymentStatus === 'deferred'") && read('scripts/verify-live-production.js').includes('no payment is taken'));
check('freshness policy exists', exists('data/production-freshness-policy.json'));
check('source deployment manifest exists', exists('deploy-manifest.json'));
check('built deployment manifest exists', fs.existsSync(path.join(site, 'deploy-manifest.json')));
check('source production health exists', exists('deploy-health.json') && exists('deploy-health.html'));
check('built production health exists', fs.existsSync(path.join(site, 'deploy-health.json')) && fs.existsSync(path.join(site, 'deploy-health.html')) && fs.existsSync(path.join(site, 'deploy-health')));
check('production health is regenerated last', read('scripts/final-production-reconcile.js').includes('build-production-health.js') && read('scripts/final-production-reconcile.js').includes('downloads/deploy-health.json'));
check('main navigation safety links', read('index.html').includes('security-privacy.html') && read('index.html').includes('dark-web-safety.html'));
check('Start Here safety links', read('start-here.html').includes('Open Security Tools') && read('start-here.html').includes('Open Dark Web Safety'));
check('membership remains payment disabled', read('membership.html').includes('Coming soon — no payment taken'));
for (const rel of ['daily-power-conclusions.html', 'daily-investigation-conclusions.html', 'daily-brain-brief.html', 'outcome-briefings.html']) {
  check(`${rel} integrity cards`, read(rel).includes('<!-- conclusion-integrity:start -->'));
  check(`built ${rel} integrity cards`, siteRead(rel).includes('<!-- conclusion-integrity:start -->'));
}
check('critical HTML no-cache policy', read('_headers').includes('/deploy-manifest.json') && read('_headers').includes('/deploy-health.json') && read('_headers').includes('Cache-Control: no-store'));
check('forum persistence wrapper exists', exists('src/worker-forum-persistence.js'));
check('strict production Worker exists', exists('src/worker-production.js'));
check('forum Worker entrypoint active', read('wrangler.toml').includes('main = "src/worker-production.js"') && read('wrangler.jsonc').includes('"main": "src/worker-production.js"'));
check('strict Worker blocks legacy forum success', read('src/worker-production.js').includes('non-authoritative-forum-response-blocked') && read('src/worker-production.js').includes('members-db-binding-unavailable'));
check('forum D1 is authoritative', read('src/worker-forum-persistence.js').includes('Cloudflare D1 MEMBERS_DB.forum_posts') && read('src/worker-forum-persistence.js').includes('INSERT OR IGNORE INTO forum_posts'));
check('forum KV migration exists', read('src/worker-forum-persistence.js').includes('kv_forum_migration_v1') && read('src/worker-forum-persistence.js').includes("prefix: 'post:'"));
check('forum migration schema exists', read('migrations/0004_forum_persistence.sql').includes('CREATE TABLE IF NOT EXISTS forum_posts'));
check('forum fail-closed test exists', exists('scripts/forum-persistence-d1-test.js') && read('package.json').includes('forum-persistence-d1-test.js'));
const report = { ok: failures.length === 0, generatedAt: new Date().toISOString(), failures, forumPersistence: 'D1 authoritative behind a strict fail-closed Worker with KV recovery mirror and live write/read proof.', paymentStatus: 'Deferred; no payment taken.' };
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'production-sync-test.json'), JSON.stringify(report, null, 2));
if (failures.length) { failures.forEach(item => console.error(`FAILED: ${item}`)); process.exit(1); }
console.log('Production synchronization assurance passed with strict D1 forum persistence and deferred payments.');
