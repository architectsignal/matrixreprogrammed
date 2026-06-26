const fs = require('fs');
const path = require('path');

const root = process.cwd();
const problems = [];
function exists(file){ return fs.existsSync(path.join(root, file)); }
function read(file){ return fs.readFileSync(path.join(root, file), 'utf8'); }
function fail(msg){ problems.push(msg); }
function requireFile(file){ if(!exists(file)) fail(`missing required file: ${file}`); }
function requireIncludes(file, text, label=text){ if(!exists(file)) return; if(!read(file).includes(text)) fail(`${file}: missing ${label}`); }
function json(file){ return JSON.parse(read(file)); }

for (const file of ['scripts/update-seven-day-intel.js','scripts/live-site-verification.js','analytics.js','data/live-intel.json','data/live-intel-sources.json','downloads/seven-day-intel.json','package.json']) requireFile(file);
requireIncludes('scripts/update-seven-day-intel.js','Seven-day intel updater complete','seven-day updater completion log');
requireIncludes('scripts/update-seven-day-intel.js','failed safely','fail-soft behavior');
requireIncludes('scripts/update-seven-day-intel.js','evidenceBoundaryForLane','evidence boundary classification');
requireIncludes('scripts/update-seven-day-intel.js','downloads/seven-day-intel.json','download export');
requireIncludes('scripts/live-site-verification.js','/deploy-status','deploy-status live check');
requireIncludes('scripts/live-site-verification.js','/forum-health','forum-health live check');
requireIncludes('scripts/live-site-verification.js','/source-cards.html','source-cards live check');
requireIncludes('scripts/live-site-verification.js','EXPECTED_BUILD_SHA','expected SHA support');
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
if (!pkg.scripts || !pkg.scripts['verify-live']) fail('package scripts missing verify-live');
if (!pkg.scripts || !pkg.scripts['update-seven-day-intel']) fail('package scripts missing update-seven-day-intel');
if (problems.length) {
  console.error('\nINTEL + ANALYTICS PRESSURE TEST FAILED\n');
  for (const problem of problems) console.error(`- ${problem}`);
  console.error(`\n${problems.length} issue(s) found.\n`);
  process.exit(1);
}
console.log('INTEL + ANALYTICS PRESSURE TEST PASSED');
console.log('Checked seven-day intel updater, live verifier, conversion event taxonomy, live-intel evidence fields, package wiring, and manual verify-live command.');
