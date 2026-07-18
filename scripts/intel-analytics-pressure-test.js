const fs = require('fs');
const path = require('path');

const root = process.cwd();
const problems = [];
function exists(file){ return fs.existsSync(path.join(root, file)); }
function read(file){ return fs.readFileSync(path.join(root, file), 'utf8'); }
function fail(msg){ problems.push(msg); }
function requireFile(file){ if(!exists(file)) fail(`missing required file: ${file}`); }
function requireIncludes(file, text, label=text){ if(!exists(file)) return; if(!read(file).includes(text)) fail(`${file}: missing ${label}`); }
function requireExcludes(file, text, label=text){ if(exists(file) && read(file).includes(text)) fail(`${file}: contains forbidden ${label}`); }
function json(file){ return JSON.parse(read(file)); }

for (const file of ['scripts/update-seven-day-intel.js','scripts/live-site-verification.js','scripts/patch-persistent-signal-board.js','analytics.js','src/worker.js','src/worker-production.js','src/worker-forum-persistence.js','src/worker-member-experience.js','migrations/phase9_signal_board_persistence.sql','wrangler.toml','data/live-intel.json','data/live-intel-sources.json','downloads/seven-day-intel.json','package.json']) requireFile(file);
requireIncludes('scripts/update-seven-day-intel.js','Seven-day intel updater complete','seven-day updater completion log');
requireIncludes('scripts/update-seven-day-intel.js','failed safely','fail-soft behavior');
requireIncludes('scripts/update-seven-day-intel.js','evidenceBoundaryForLane','evidence boundary classification');
requireIncludes('scripts/update-seven-day-intel.js','downloads/seven-day-intel.json','download export');
requireIncludes('scripts/live-site-verification.js','/deploy-status','deploy-status live check');
requireIncludes('scripts/live-site-verification.js','/forum-health','forum-health live check');
requireIncludes('scripts/live-site-verification.js','/source-cards.html','source-cards live check');
requireIncludes('scripts/live-site-verification.js','EXPECTED_BUILD_SHA','expected SHA support');
requireIncludes('analytics.js', "navigator.sendBeacon('/track-event'", 'analytics sends beacon to Cloudflare /track-event');
requireIncludes('analytics.js', "fetch('/track-event'", 'analytics fetch fallback uses Cloudflare /track-event');
requireIncludes('src/worker.js', 'handleTrackEvent', 'Worker track-event handler');
requireIncludes('src/worker.js', "originalPath === '/track-event'", 'Worker /track-event route');
requireIncludes('src/worker.js', "'X-Matrix-Analytics':eventName?'client-provider-only':'ignored'", 'Worker analytics endpoint is non-persistent');
requireExcludes('src/worker.js', 'FORUM_POSTS.put(`analytics:', 'per-event KV analytics write');
requireExcludes('src/worker.js', 'analytics:${event.id}', 'legacy KV analytics storage key');
requireIncludes('src/worker-production.js', 'forumWorker.fetch(request, d1OnlyForumEnv(env), ctx)', 'production legacy routes do not receive KV');

// The Signal Board is now D1-only. The old optional KV mirror is not an accepted
// persistence route and must not be reintroduced by a late compatibility generator.
for (const marker of ['forum_post_owners','forum_report_owners','forum_board_state','authoritativeStorage','crossDevice:true','no browser or legacy fallback was accepted']) requireIncludes('src/worker-forum-persistence.js', marker, `D1 Signal Board marker ${marker}`);
requireIncludes('src/worker-forum-persistence.js', "import { memberSessionContext } from './worker-member-experience.js';", 'verified member session integration');
requireIncludes('src/worker-member-experience.js', "'signal_board_posting'", 'free-member Signal Board capability');
requireIncludes('src/worker-member-experience.js', 'export async function memberSessionContext', 'member session context export');
requireIncludes('migrations/phase9_signal_board_persistence.sql', 'CREATE TABLE IF NOT EXISTS forum_post_owners', 'post ownership ledger');
requireIncludes('migrations/phase9_signal_board_persistence.sql', 'CREATE TABLE IF NOT EXISTS forum_report_owners', 'report ownership ledger');
requireIncludes('migrations/phase9_signal_board_persistence.sql', 'CREATE TABLE IF NOT EXISTS forum_board_state', 'board state ledger');
requireIncludes('migrations/phase9_signal_board_persistence.sql', 'CREATE VIEW forum_persistence_health', 'forum persistence health view');
requireExcludes('src/worker-forum-persistence.js', 'FORUM_POSTS.put(', 'Signal Board KV writes');
requireExcludes('src/worker-forum-persistence.js', 'FORUM_POSTS.get(', 'Signal Board KV reads');
requireExcludes('src/worker-forum-persistence.js', 'kvMirrorEnabled(', 'legacy optional KV mirror helper');
requireIncludes('wrangler.toml', 'ENABLE_KV_COMPATIBILITY_MIRROR = "false"', 'defensive production KV switch remains false');
requireIncludes('scripts/patch-persistent-signal-board.js', 'late-signal-board-owner', 'persistent Signal Board repair is late-generator wired');
requireIncludes('scripts/patch-persistent-signal-board.js', 'No browser-only, temporary or local-storage post is treated as saved.', 'persistent-board fail-closed public boundary');

for (const event of ['brief_open','brief_download','email_submit','black_file_click','amazon_click','rumble_click','epstein_source_click','source_card_click','evidence_route_click','forum_post_submit']) requireIncludes('analytics.js', event, `${event} analytics event`);
if (exists('data/live-intel.json')) {
  const live = json('data/live-intel.json');
  if (!Array.isArray(live.items) || live.items.length < 4) fail('data/live-intel.json expected at least 4 live-intel items');
  for (const item of live.items.slice(0, 4)) {
    for (const key of ['title','url','published','summary','evidenceBoundary','nextAction','evidenceRoute']) if (!item[key]) fail(`live-intel item missing ${key}: ${item.title || 'unknown'}`);
  }
}
const pkg = exists('package.json') ? json('package.json') : { scripts: {} };
const build = pkg.scripts && pkg.scripts.build || '';
if (!build.includes('update-seven-day-intel.js')) fail('package build missing update-seven-day-intel.js');
if (!build.includes('build-source-cards.js')) fail('package build missing build-source-cards.js');
if (!build.includes('source-card-pressure-test.js')) fail('package build missing source-card-pressure-test.js');
if (!build.includes('intel-analytics-pressure-test.js')) fail('package build missing intel-analytics-pressure-test.js');
if (!build.includes('build-daily-brain-brief.js')) fail('package build missing deep Daily Brief owner');
if (!pkg.scripts || !pkg.scripts['verify-live']) fail('package scripts missing verify-live');
if (!pkg.scripts || !pkg.scripts['update-seven-day-intel']) fail('package scripts missing update-seven-day-intel');
if (problems.length) {
  console.error('\nINTEL + ANALYTICS PRESSURE TEST FAILED\n');
  for (const problem of problems) console.error(`- ${problem}`);
  console.error(`\n${problems.length} issue(s) found.\n`);
  process.exit(1);
}
console.log('INTEL + ANALYTICS PRESSURE TEST PASSED');
console.log('Checked seven-day intel updater, live verifier, non-persistent analytics endpoint, D1-only cross-device Signal Board, conversion taxonomy, live-intel evidence fields and package wiring.');
