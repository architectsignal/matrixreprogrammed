const fs = require('fs');
const path = require('path');
const root = process.cwd();
const issues = [];
const file = name => path.join(root, name);
const exists = name => fs.existsSync(file(name));
const read = name => fs.readFileSync(file(name), 'utf8');
function needFile(name) { if (!exists(name)) issues.push(`missing ${name}`); }
function needText(name, text) { if (exists(name) && !read(name).includes(text)) issues.push(`${name} missing ${text}`); }

needFile('data/update-cadence-policy.json');
needFile('.github/workflows/test-site.yml');
needFile('.github/workflows/deploy-production.yml');
needFile('.github/workflows/daily-update-check.yml');
needFile('.github/workflows/weekly-update-check.yml');

const policy = exists('data/update-cadence-policy.json') ? JSON.parse(read('data/update-cadence-policy.json')) : {};
if (!Array.isArray(policy.daily) || policy.daily.length < 4) issues.push('daily cadence must include news, epstein, timers, and figures');
if (!Array.isArray(policy.weekly) || policy.weekly.length < 3) issues.push('weekly cadence must include full site, atlas, and quality');
for (const lane of policy.daily || []) {
  if (!lane.lane || !Array.isArray(lane.scripts) || !Array.isArray(lane.mustCheck)) issues.push('daily lane missing lane/scripts/mustCheck');
  for (const target of lane.mustCheck || []) if (!target.endsWith('.json') && !target.endsWith('.md') && target !== '_site') needFile(target);
}
for (const lane of policy.weekly || []) {
  if (!lane.lane || !Array.isArray(lane.scripts) || !Array.isArray(lane.mustCheck)) issues.push('weekly lane missing lane/scripts/mustCheck');
}
const dailyWorkflow = exists('.github/workflows/daily-update-check.yml') ? read('.github/workflows/daily-update-check.yml') : '';
needText('.github/workflows/daily-update-check.yml', 'cron:');
needText('.github/workflows/daily-update-check.yml', 'build-intel-desk.js');
needText('.github/workflows/daily-update-check.yml', 'enhance-epstein-watch.js');
needText('.github/workflows/daily-update-check.yml', 'patch-homepage-alerts.js');
needText('.github/workflows/daily-update-check.yml', 'figure-source-rules-pressure-test.js');
needText('.github/workflows/daily-update-check.yml', 'migration-flow-test.js');
needText('.github/workflows/daily-update-check.yml', 'global-risk-clocks-test.js');
if (/wrangler deploy|deploy-production/i.test(dailyWorkflow)) issues.push('daily update check must not deploy');
const weeklyWorkflow = exists('.github/workflows/weekly-update-check.yml') ? read('.github/workflows/weekly-update-check.yml') : '';
needText('.github/workflows/weekly-update-check.yml', 'cron:');
needText('.github/workflows/weekly-update-check.yml', 'npm run build');
needText('.github/workflows/weekly-update-check.yml', 'pressure-test:atlas-layers');
needText('.github/workflows/weekly-update-check.yml', 'pressure-test:migration-flow');
needText('.github/workflows/weekly-update-check.yml', 'pressure-test:global-risk-clocks');
if (/wrangler deploy|deploy-production/i.test(weeklyWorkflow)) issues.push('weekly update check must not deploy');
if (issues.length) {
  console.error('UPDATE CADENCE TEST FAILED');
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}
console.log('UPDATE CADENCE TEST PASSED');
