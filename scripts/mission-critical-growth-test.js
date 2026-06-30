const fs = require('fs');
const path = require('path');

const root = process.cwd();
const hardIssues = [];
const softIssues = [];
function file(name){ return path.join(root, name); }
function exists(name){ return fs.existsSync(file(name)); }
function read(name){ return fs.readFileSync(file(name), 'utf8'); }
function needHardFile(name){ if (!exists(name)) hardIssues.push(`missing critical ${name}`); }
function needSoftFile(name){ if (!exists(name)) softIssues.push(`missing optional ${name}`); }
function needText(name, text, label = text, level = 'soft'){
  if (!exists(name)) return;
  if (!read(name).includes(text)) {
    const issue = `${name} missing ${label}`;
    if (level === 'hard') hardIssues.push(issue);
    else softIssues.push(issue);
  }
}
function needAnyText(name, texts, label, level = 'soft'){
  if (!exists(name)) return;
  const content = read(name);
  if (!texts.some(text => content.includes(text))) {
    const issue = `${name} missing ${label}`;
    if (level === 'hard') hardIssues.push(issue);
    else softIssues.push(issue);
  }
}
function forbidText(name, text, label = text, level = 'hard'){
  if (exists(name) && read(name).includes(text)) {
    const issue = `${name} should not contain ${label}`;
    if (level === 'hard') hardIssues.push(issue);
    else softIssues.push(issue);
  }
}

// One orchestrator should own automatic daily updates. Older workflows stay manual backups.
needHardFile('.github/workflows/auto-update-orchestrator.yml');
needText('.github/workflows/auto-update-orchestrator.yml', 'schedule:', 'daily schedule', 'hard');
needText('.github/workflows/auto-update-orchestrator.yml', 'cron: "20 7 * * *"', 'daily orchestrator cron', 'hard');
needText('.github/workflows/auto-update-orchestrator.yml', 'archive-intel-drops-to-vault.js', 'vault archiver in orchestrator', 'hard');
needText('.github/workflows/auto-update-orchestrator.yml', 'brand-downloads-audit.js', 'download audit in orchestrator', 'hard');
needText('.github/workflows/auto-update-orchestrator.yml', 'patch-newsletter-capture-ui.js', 'newsletter UI patch in orchestrator', 'hard');
needText('.github/workflows/auto-update-orchestrator.yml', 'mission-critical-growth-test.js', 'growth test in orchestrator', 'hard');
needText('.github/workflows/auto-update-orchestrator.yml', 'Commit all generated automatic updates once', 'single commit path', 'hard');
for (const wf of ['daily-intel-drop.yml','transparent-maintenance.yml','weekly-dog-video.yml','self-heal-generated-site.yml']) {
  needHardFile(`.github/workflows/${wf}`);
  needText(`.github/workflows/${wf}`, 'workflow_dispatch:', `${wf} manual dispatch`, 'hard');
  forbidText(`.github/workflows/${wf}`, 'schedule:', `${wf} automatic schedule`, 'hard');
  forbidText(`.github/workflows/${wf}`, '.github/update-triggers/all-auto-updates.txt', `${wf} shared trigger`, 'hard');
}

// Daily intel and vault route. Exact copy can change, but the route files/scripts must exist.
for (const item of [
  'scripts/intel-drop-engine.js',
  'scripts/update-news-from-drop.js',
  'scripts/build-intel-archive-page.js',
  'scripts/archive-intel-drops-to-vault.js',
  'data/latest-drop.json',
  'data/drops',
  'intel-archive.html',
  'intel-drop-vault.html',
  'downloads/intel-drop-vault.json',
  'downloads/intel-drop-vault.md'
]) needHardFile(item);
needText('scripts/update-news-from-drop.js', 'liveWindowDays = 7', '7-day live window', 'soft');
needText('scripts/build-intel-archive-page.js', 'THE OLD SIGNALS', 'archive old signal copy', 'soft');
needText('scripts/archive-intel-drops-to-vault.js', '8+ days moves to vault', 'vault ageing rule', 'soft');
needAnyText('intel-drop-vault.html', ['Old updates do not disappear', 'Vault', 'vault'], 'vault promise/copy', 'soft');

// Newsletter and capture route. Missing files are critical; generated-page exact panels are warnings.
for (const item of [
  'newsletter.html',
  'newsletter.js',
  'scripts/patch-worker-newsletter-system.js',
  'scripts/patch-newsletter-capture-ui.js',
  '.github/workflows/weekly-newsletter-send.yml'
]) needHardFile(item);
needText('newsletter.html', 'data-newsletter-form', 'capture form', 'hard');
needAnyText('newsletter.html', ['Weekly Signal', 'WEEKLY SIGNAL', 'weekly signal'], 'newsletter promise', 'soft');
needText('newsletter.js', '/subscribe-newsletter', 'subscriber endpoint', 'hard');
needText('scripts/patch-newsletter-capture-ui.js', 'data-newsletter-form', 'capture UI patch form', 'hard');
needText('scripts/patch-newsletter-capture-ui.js', 'Cloudflare Worker newsletter capture', 'Cloudflare Worker wording', 'soft');
for (const page of ['optin-center.html','download-center.html','index.html']) {
  needHardFile(page);
  needText(page, 'newsletter.js', `${page} newsletter script`, 'soft');
  needAnyText(page, ['newsletter-capture', 'data-newsletter-form', 'optin-center.html'], `${page} newsletter capture route`, 'soft');
}
needText('scripts/patch-worker-newsletter-system.js', 'handleSubscribeNewsletter', 'capture Worker handler', 'hard');
needText('scripts/patch-worker-newsletter-system.js', 'handleSendWeeklyNewsletter', 'weekly send Worker handler', 'hard');
needText('scripts/patch-worker-newsletter-system.js', 'RESEND_API_KEY', 'email provider secret', 'soft');
needText('scripts/patch-worker-newsletter-system.js', 'NEWSLETTER_ADMIN_TOKEN', 'protected sender token', 'soft');
needText('.github/workflows/weekly-newsletter-send.yml', 'cron:', 'weekly newsletter cron', 'hard');
needText('.github/workflows/weekly-newsletter-send.yml', 'send-weekly-newsletter', 'send endpoint call', 'hard');
needText('.github/workflows/weekly-newsletter-send.yml', 'NEWSLETTER_ADMIN_TOKEN', 'GitHub send token', 'soft');

// Download and branded asset route.
for (const item of [
  'scripts/brand-downloads-audit.js',
  'download-center.html',
  'downloads/downloads-index.json',
  'downloads/downloads-index.md'
]) needHardFile(item);
needText('download-center.html', 'MATRIX REPROGRAMMED', 'download branding', 'hard');
needAnyText('download-center.html', ['Evidence', 'evidence'], 'download evidence boundary', 'hard');
needAnyText('scripts/brand-downloads-audit.js', ['branded', 'brand'], 'download branding test', 'hard');

// Live functionality hooks.
needHardFile('scripts/live-functionality-test.js');
needHardFile('.github/workflows/live-functionality-test.yml');
needText('scripts/live-functionality-test.js', '/newsletter-health', 'newsletter live health check', 'soft');
needText('scripts/live-functionality-test.js', '/subscribe-newsletter', 'newsletter live subscription check', 'soft');
needText('.github/workflows/deploy-production.yml', 'mission-critical-growth-test.js', 'deploy mission-critical gate', 'hard');
needText('.github/workflows/deploy-production.yml', 'patch-worker-newsletter-system.js', 'deploy Worker newsletter patch', 'hard');
needText('.github/workflows/deploy-production.yml', 'patch-newsletter-capture-ui.js', 'deploy newsletter UI patch', 'hard');

const report = {
  generatedAt: new Date().toISOString(),
  ok: hardIssues.length === 0,
  hardIssues,
  softIssues,
  boundary: 'Mission-critical gate hard-fails missing systems and duplicate automation risk. Generated wording/capture variations are soft issues so updates, forums, and deploys are not blocked unnecessarily.'
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'mission-critical-growth-report.json'), JSON.stringify(report, null, 2));
fs.writeFileSync(path.join(root, 'downloads', 'mission-critical-growth-report.md'), [
  '# Mission Critical Growth Report',
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
  console.error('MISSION CRITICAL GROWTH TEST FAILED');
  for (const issue of hardIssues) console.error(`- ${issue}`);
  if (softIssues.length) {
    console.error('Soft issues also recorded:');
    for (const issue of softIssues) console.error(`- ${issue}`);
  }
  process.exit(1);
}
for (const issue of softIssues) console.warn(`MISSION SOFT ISSUE: ${issue}`);
console.log('MISSION CRITICAL GROWTH TEST PASSED');
console.log('Checked daily updates, vault movement, persistent capture, weekly sender readiness, download quality, live functionality hooks, and single-orchestrator automation.');
