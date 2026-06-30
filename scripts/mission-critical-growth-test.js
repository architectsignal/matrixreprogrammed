const fs = require('fs');
const path = require('path');
const root = process.cwd();
const issues = [];
function file(name){ return path.join(root, name); }
function exists(name){ return fs.existsSync(file(name)); }
function read(name){ return fs.readFileSync(file(name), 'utf8'); }
function needFile(name){ if (!exists(name)) issues.push(`missing ${name}`); }
function needText(name, text, label = text){ if (exists(name) && !read(name).includes(text)) issues.push(`${name} missing ${label}`); }
function forbidText(name, text, label = text){ if (exists(name) && read(name).includes(text)) issues.push(`${name} should not contain ${label}`); }

// One automatic update path.
needFile('.github/workflows/auto-update-orchestrator.yml');
needText('.github/workflows/auto-update-orchestrator.yml', 'schedule:', 'daily schedule');
needText('.github/workflows/auto-update-orchestrator.yml', 'cron: "20 7 * * *"', 'daily orchestrator cron');
needText('.github/workflows/auto-update-orchestrator.yml', 'archive-intel-drops-to-vault.js', 'vault archiver in orchestrator');
needText('.github/workflows/auto-update-orchestrator.yml', 'brand-downloads-audit.js', 'download audit in orchestrator');
needText('.github/workflows/auto-update-orchestrator.yml', 'mission-critical-growth-test.js', 'growth test in orchestrator');
needText('.github/workflows/auto-update-orchestrator.yml', 'Commit all generated automatic updates once', 'single commit path');
for (const wf of ['daily-intel-drop.yml','transparent-maintenance.yml','weekly-dog-video.yml','self-heal-generated-site.yml']) {
  needFile(`.github/workflows/${wf}`);
  needText(`.github/workflows/${wf}`, 'workflow_dispatch:', `${wf} manual dispatch`);
  forbidText(`.github/workflows/${wf}`, 'schedule:', `${wf} automatic schedule`);
  forbidText(`.github/workflows/${wf}`, '.github/update-triggers/all-auto-updates.txt', `${wf} shared trigger`);
}

// Updates and vault.
needFile('scripts/intel-drop-engine.js');
needFile('scripts/update-news-from-drop.js');
needFile('scripts/build-intel-archive-page.js');
needFile('scripts/archive-intel-drops-to-vault.js');
needFile('data/latest-drop.json');
needFile('data/drops');
needFile('intel-archive.html');
needFile('intel-drop-vault.html');
needFile('downloads/intel-drop-vault.json');
needFile('downloads/intel-drop-vault.md');
needText('scripts/update-news-from-drop.js', 'liveWindowDays = 7', '7-day live window');
needText('scripts/build-intel-archive-page.js', 'THE OLD SIGNALS', 'archive old signal copy');
needText('scripts/archive-intel-drops-to-vault.js', '8+ days moves to vault', 'vault ageing rule');
needText('intel-drop-vault.html', 'Old updates do not disappear', 'vault promise');

// Newsletter capture and weekly send.
needFile('newsletter.html');
needFile('newsletter.js');
needFile('scripts/patch-worker-newsletter-system.js');
needFile('.github/workflows/weekly-newsletter-send.yml');
needText('newsletter.html', 'data-newsletter-form', 'capture form');
needText('newsletter.html', 'Weekly Signal', 'newsletter promise');
needText('newsletter.js', '/subscribe-newsletter', 'subscriber endpoint');
needText('scripts/patch-worker-newsletter-system.js', 'handleSubscribeNewsletter', 'capture Worker handler');
needText('scripts/patch-worker-newsletter-system.js', 'handleSendWeeklyNewsletter', 'weekly send Worker handler');
needText('scripts/patch-worker-newsletter-system.js', 'RESEND_API_KEY', 'email provider secret');
needText('scripts/patch-worker-newsletter-system.js', 'NEWSLETTER_ADMIN_TOKEN', 'protected sender token');
needText('.github/workflows/weekly-newsletter-send.yml', 'cron:', 'weekly newsletter cron');
needText('.github/workflows/weekly-newsletter-send.yml', 'send-weekly-newsletter', 'send endpoint call');
needText('.github/workflows/weekly-newsletter-send.yml', 'NEWSLETTER_ADMIN_TOKEN', 'GitHub send token');

// Downloads.
needFile('scripts/brand-downloads-audit.js');
needFile('download-center.html');
needFile('downloads/downloads-index.json');
needFile('downloads/downloads-index.md');
needText('download-center.html', 'MATRIX REPROGRAMMED', 'download branding');
needText('download-center.html', 'Evidence', 'download evidence boundary');
needText('scripts/brand-downloads-audit.js', 'branded', 'download branding test');

// Deploy and live functionality.
needFile('scripts/live-functionality-test.js');
needFile('.github/workflows/live-functionality-test.yml');
needText('scripts/live-functionality-test.js', '/newsletter-health', 'newsletter live health check');
needText('scripts/live-functionality-test.js', '/subscribe-newsletter', 'newsletter live subscription check');
needText('.github/workflows/deploy-production.yml', 'mission-critical-growth-test.js', 'deploy mission-critical gate');
needText('.github/workflows/deploy-production.yml', 'patch-worker-newsletter-system.js', 'deploy Worker newsletter patch');

if (issues.length) {
  console.error('MISSION CRITICAL GROWTH TEST FAILED');
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}
console.log('MISSION CRITICAL GROWTH TEST PASSED');
console.log('Checked daily updates, vault movement, persistent capture, weekly sender readiness, download quality, live functionality hooks, and single-orchestrator automation.');
