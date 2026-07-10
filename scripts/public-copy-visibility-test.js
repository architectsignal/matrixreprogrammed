const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const reportDir = path.join(root, 'downloads');
fs.mkdirSync(reportDir, { recursive: true });
const failures = [];
const checks = [];

function check(name, ok, detail = '') {
  checks.push({ name, ok: Boolean(ok), detail });
  if (!ok) failures.push(`${name}${detail ? `: ${detail}` : ''}`);
}

function read(file) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) return '';
  return fs.readFileSync(full, 'utf8');
}

function visibleText(html) {
  let text = String(html || '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ');
  for (const tag of ['article', 'section', 'details', 'footer', 'div', 'p', 'li', 'a', 'span']) {
    const hidden = new RegExp(`<${tag}\\b[^>]*(?:internal-only|data-internal-only=["']true["'])[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi');
    let before;
    do { before = text; text = text.replace(hidden, ' '); } while (text !== before);
  }
  return text
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchingAnchors(html, hrefFragment) {
  const escaped = hrefFragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...html.matchAll(new RegExp(`<a\\b[^>]*href\\s*=\\s*["'][^"']*${escaped}[^"']*["'][^>]*>`, 'gi'))].map(match => match[0]);
}

function allMatchingAnchorsHidden(html, hrefFragment) {
  const anchors = matchingAnchors(html, hrefFragment);
  return anchors.length > 0 && anchors.every(anchor => /internal-only|data-internal-only=["']true["']/i.test(anchor));
}

const scrub = spawnSync(process.execPath, ['scripts/hide-internal-public-controls.js'], {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 30 * 1024 * 1024
});
if (scrub.stdout) process.stdout.write(scrub.stdout);
if (scrub.stderr) process.stderr.write(scrub.stderr);
check('visibility scrub executes', scrub.status === 0, `exit ${scrub.status}`);

for (const file of ['index.html', 'membership.html', 'member-dashboard.html']) {
  check(`${file} exists`, Boolean(read(file)));
  check(`${file} includes hidden-control CSS`, read(file).includes('id="public-internal-visibility"'));
  check(`${file} retains internal-copy vault`, read(file).includes('id="public-copy-internal-vault"'));
}

const indexHtml = read('index.html');
const indexVisible = visibleText(indexHtml);
for (const phrase of [
  'Sell / Capture',
  'Copy/Intake Audit',
  'Card System Health',
  'Artwork Automation',
  'Next Art Batch',
  'Site Brain Router',
  'Gathering System',
  'Conclusion Engine',
  'Machine Index',
  'Update Monitor'
]) check(`homepage hides “${phrase}”`, !indexVisible.includes(phrase));
check('homepage uses reader-facing navigation label', indexVisible.includes('Reader Resources'));

for (const route of [
  'review-dashboard.html',
  'site-brain-router.html',
  'card-artwork-automation.html',
  'card-artwork-queue.html',
  'card-system-health.html',
  'information-gathering-system.html',
  'conclusion-engine.html',
  'update-monitor.html',
  'distribution-center.html',
  'launch-room.html',
  'offer-center.html',
  'sales-ladder.html',
  'schema-index.html'
]) {
  if (indexHtml.includes(route)) check(`homepage link hidden: ${route}`, allMatchingAnchorsHidden(indexHtml, route));
}

const rawAnchors = [...indexHtml.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+\.(?:json|md))(?:[?#][^"']*)?["'][^>]*>/gi)];
for (const match of rawAnchors) check(`raw data link hidden: ${match[1]}`, /internal-only|data-internal-only=["']true["']/i.test(match[0]));

const membershipHtml = read('membership.html');
const membershipVisible = visibleText(membershipHtml);
for (const phrase of [
  'Membership System',
  'protected-access testing',
  'webhooks can prove',
  'HttpOnly cookies',
  'not configured yet',
  'PayPal activation pending'
]) check(`membership page hides “${phrase}”`, !membershipVisible.includes(phrase));
check('membership page keeps working signup form', membershipHtml.includes('id="membership-signup"') && membershipHtml.includes('/api/membership/signup'));

const dashboardHtml = read('member-dashboard.html');
const dashboardVisible = visibleText(dashboardHtml);
for (const phrase of ['Private Member Layer', 'secure session', 'entitlement', 'tier-aware', 'PayPal reference']) {
  check(`member dashboard hides “${phrase}”`, !dashboardVisible.includes(phrase));
}
check('member dashboard keeps useful account controls', dashboardHtml.includes('id="dashboard-content"') && dashboardHtml.includes('/api/member/me'));

for (const file of ['review-dashboard.html', 'deploy-status.html', 'card-system-health.html', 'site-brain-router.html']) {
  const html = read(file);
  if (html) check(`${file} excluded from search indexing`, /name=["']robots["'][^>]*noindex/i.test(html));
}

const siteIndex = read('_site/index.html');
if (siteIndex) {
  check('deployed homepage includes hidden-control CSS', siteIndex.includes('id="public-internal-visibility"'));
  check('deployed homepage hides author-facing navigation', !visibleText(siteIndex).includes('Sell / Capture'));
}

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  checks,
  failures,
  boundary: 'Operational pages, routes, raw data and diagnostic text remain in the repository. The normal public interface must not display author, automation, audit, health or configuration controls.'
};
fs.writeFileSync(path.join(reportDir, 'public-copy-visibility-test.json'), JSON.stringify(report, null, 2));
fs.writeFileSync(path.join(reportDir, 'public-copy-visibility-test.md'), `# Public Copy Visibility Test\n\nResult: ${report.ok ? 'PASS' : 'FAIL'}\n\n${checks.map(item => `- ${item.ok ? 'PASS' : 'FAIL'}: ${item.name}`).join('\n')}\n`);

if (failures.length) {
  console.error('PUBLIC COPY VISIBILITY TEST FAILED');
  failures.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}
console.log('PUBLIC COPY VISIBILITY TEST PASSED');
