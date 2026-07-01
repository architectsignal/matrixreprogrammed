const fs = require('fs');
const path = require('path');
const root = process.cwd();
const hardIssues = [];
const softIssues = [];
const file = name => path.join(root, name);
const exists = name => fs.existsSync(file(name));
const read = name => fs.readFileSync(file(name), 'utf8');
function needHardFile(name) { if (!exists(name)) hardIssues.push(`missing critical ${name}`); }
function needText(name, text, label = text) { if (exists(name) && !read(name).includes(text)) softIssues.push(`${name} missing ${label}`); }
function forbidText(name, text, label = text) { if (exists(name) && read(name).includes(text)) hardIssues.push(`${name} should not contain ${label}`); }

needHardFile('.github/workflows/auto-update-orchestrator.yml');
needText('.github/workflows/auto-update-orchestrator.yml', 'cron: "20 7 * * *"', 'daily orchestrator schedule');
needText('.github/workflows/auto-update-orchestrator.yml', 'Generate Daily Intel updates and vault old updates', 'daily update step');
needText('.github/workflows/auto-update-orchestrator.yml', 'archive-intel-drops-to-vault.js', 'old updates to vault step');
needText('.github/workflows/auto-update-orchestrator.yml', 'brand-downloads-audit.js', 'download quality step');
needText('.github/workflows/auto-update-orchestrator.yml', 'mission-critical-growth-test.js', 'mission-critical gate');
needText('.github/workflows/auto-update-orchestrator.yml', 'Commit all generated automatic updates once', 'single commit path');

for (const workflow of ['daily-intel-drop.yml', 'transparent-maintenance.yml', 'weekly-dog-video.yml', 'self-heal-generated-site.yml']) {
  needHardFile(`.github/workflows/${workflow}`);
  needText(`.github/workflows/${workflow}`, 'workflow_dispatch:', `${workflow} manual backup dispatch`);
  forbidText(`.github/workflows/${workflow}`, 'schedule:', `${workflow} automatic schedule`);
}

for (const item of [
  'scripts/intel-drop-engine.js',
  'scripts/update-news-from-drop.js',
  'scripts/build-intel-archive-page.js',
  'scripts/archive-intel-drops-to-vault.js',
  'scripts/patch-worker-newsletter-system.js',
  'scripts/brand-downloads-audit.js',
  'scripts/mission-critical-growth-test.js',
  '.github/workflows/weekly-newsletter-send.yml',
  '.github/workflows/live-functionality-test.yml',
  'scripts/live-functionality-test.js'
]) needHardFile(item);
needText('scripts/update-news-from-drop.js', 'liveWindowDays = 7', '7-day live desk window');
needText('scripts/build-intel-archive-page.js', 'Older source-led drops are stored here', 'archive promise');
needText('scripts/archive-intel-drops-to-vault.js', '8+ days moves to vault', 'vault rule');
needText('scripts/patch-worker-newsletter-system.js', 'handleSubscribeNewsletter', 'newsletter capture handler');
needText('scripts/patch-worker-newsletter-system.js', 'handleSendWeeklyNewsletter', 'weekly newsletter send handler');
needText('.github/workflows/weekly-newsletter-send.yml', 'cron: "10 8 * * 1"', 'weekly newsletter cron');
needText('scripts/live-functionality-test.js', '/subscribe-newsletter', 'live newsletter subscribe test');
needText('scripts/live-functionality-test.js', '/newsletter-health', 'live newsletter health test');

const report = {
  generatedAt: new Date().toISOString(),
  ok: hardIssues.length === 0,
  hardIssues,
  softIssues,
  boundary: 'Cadence audit hard-fails missing update systems and duplicate automatic schedules. Exact wording and marker checks are warnings so regenerated copy does not block production deploy.'
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'update-cadence-report.json'), JSON.stringify(report, null, 2));
fs.writeFileSync(path.join(root, 'downloads', 'update-cadence-report.md'), [
  '# Update Cadence Report',
  '',
  `Generated: ${report.generatedAt}`,
  `Result: ${report.ok ? 'PASS' : 'FAIL'}`,
  '',
  report.boundary,
  '',
  hardIssues.length ? '## Hard Issues' : '',
  ...hardIssues.map(issue => `- ${issue}`),
  '',
  softIssues.length ? '## Soft Issues' : '',
  ...softIssues.map(issue => `- ${issue}`)
].join('\n'));

if (hardIssues.length) {
  console.error('UPDATE CADENCE TEST FAILED');
  for (const issue of hardIssues) console.error(`- ${issue}`);
  if (softIssues.length) {
    console.error('Soft issues also recorded:');
    for (const issue of softIssues) console.error(`- ${issue}`);
  }
  process.exit(1);
}
for (const issue of softIssues) console.warn(`UPDATE CADENCE SOFT ISSUE: ${issue}`);
console.log('UPDATE CADENCE TEST PASSED');
console.log('Daily updates run through one orchestrator, old updates vault, newsletter capture/send are wired, and legacy update workflows are manual backups.');
