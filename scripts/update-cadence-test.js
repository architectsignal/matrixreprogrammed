const fs = require('fs');
const path = require('path');
const root = process.cwd();
const issues = [];
const file = name => path.join(root, name);
const exists = name => fs.existsSync(file(name));
const read = name => fs.readFileSync(file(name), 'utf8');
function needFile(name) { if (!exists(name)) issues.push(`missing ${name}`); }
function needText(name, text, label = text) { if (exists(name) && !read(name).includes(text)) issues.push(`${name} missing ${label}`); }
function forbidText(name, text, label = text) { if (exists(name) && read(name).includes(text)) issues.push(`${name} should not contain ${label}`); }

needFile('.github/workflows/auto-update-orchestrator.yml');
needText('.github/workflows/auto-update-orchestrator.yml', 'cron: "20 7 * * *"', 'daily orchestrator schedule');
needText('.github/workflows/auto-update-orchestrator.yml', 'Generate Daily Intel updates and vault old updates', 'daily update step');
needText('.github/workflows/auto-update-orchestrator.yml', 'archive-intel-drops-to-vault.js', 'old updates to vault step');
needText('.github/workflows/auto-update-orchestrator.yml', 'brand-downloads-audit.js', 'download quality step');
needText('.github/workflows/auto-update-orchestrator.yml', 'mission-critical-growth-test.js', 'mission-critical gate');
needText('.github/workflows/auto-update-orchestrator.yml', 'Commit all generated automatic updates once', 'single commit path');

for (const workflow of ['daily-intel-drop.yml', 'transparent-maintenance.yml', 'weekly-dog-video.yml', 'self-heal-generated-site.yml']) {
  needFile(`.github/workflows/${workflow}`);
  needText(`.github/workflows/${workflow}`, 'workflow_dispatch:', `${workflow} manual backup dispatch`);
  forbidText(`.github/workflows/${workflow}`, 'schedule:', `${workflow} automatic schedule`);
}

needFile('scripts/intel-drop-engine.js');
needFile('scripts/update-news-from-drop.js');
needFile('scripts/build-intel-archive-page.js');
needFile('scripts/archive-intel-drops-to-vault.js');
needFile('scripts/patch-worker-newsletter-system.js');
needFile('scripts/brand-downloads-audit.js');
needFile('scripts/mission-critical-growth-test.js');
needFile('.github/workflows/weekly-newsletter-send.yml');
needFile('.github/workflows/live-functionality-test.yml');
needText('scripts/update-news-from-drop.js', 'liveWindowDays = 7', '7-day live desk window');
needText('scripts/build-intel-archive-page.js', 'Older source-led drops are stored here', 'archive promise');
needText('scripts/archive-intel-drops-to-vault.js', '8+ days moves to vault', 'vault rule');
needText('scripts/patch-worker-newsletter-system.js', 'handleSubscribeNewsletter', 'newsletter capture handler');
needText('scripts/patch-worker-newsletter-system.js', 'handleSendWeeklyNewsletter', 'weekly newsletter send handler');
needText('.github/workflows/weekly-newsletter-send.yml', 'cron: "10 8 * * 1"', 'weekly newsletter cron');
needText('scripts/live-functionality-test.js', '/subscribe-newsletter', 'live newsletter subscribe test');
needText('scripts/live-functionality-test.js', '/newsletter-health', 'live newsletter health test');

if (issues.length) {
  console.error('UPDATE CADENCE TEST FAILED');
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}
console.log('UPDATE CADENCE TEST PASSED');
console.log('Daily updates run through one orchestrator, old updates vault, newsletter capture/send are wired, and legacy update workflows are manual backups.');
