const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const root = process.cwd();
const at = name => path.join(root, name);
const issues = [];
const need = (condition, message) => { if (!condition) issues.push(message); };
const read = name => fs.existsSync(at(name)) ? fs.readFileSync(at(name), 'utf8') : '';
const readJson = name => { try { return JSON.parse(read(name)); } catch { return {}; } };
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[character]);

require('./patch-daily-control-brief-delivery.js');
require('./build-homepage-command-surface.js');
require('./normalize-forum-health-member-policy.js');
require('./patch-member-forum-integration.js');

function syntaxCheck(file, asModule = false) {
  const original = at(file);
  if (!fs.existsSync(original)) { issues.push(`missing ${file}`); return; }
  let target = original;
  if (asModule) {
    target = path.join(os.tmpdir(), `matrix-${path.basename(file)}-${process.pid}.mjs`);
    fs.writeFileSync(target, fs.readFileSync(original));
  }
  const result = spawnSync(process.execPath, ['--check', target], { encoding: 'utf8' });
  if (asModule) fs.rmSync(target, { force: true });
  if (result.status !== 0) issues.push(`${file} syntax failed: ${(result.stderr || result.stdout || '').trim()}`);
}

syntaxCheck('scripts/patch-daily-control-brief-delivery.js');
syntaxCheck('scripts/normalize-forum-health-member-policy.js');
syntaxCheck('scripts/patch-member-forum-integration.js');
syntaxCheck('scripts/member-forum-integration-test.js');
syntaxCheck('newsletter.js');
syntaxCheck('forum.js');
syntaxCheck('src/worker-email-lifecycle.js', true);
syntaxCheck('src/worker-member-experience.js', true);
syntaxCheck('src/worker-forum-persistence.js', true);

const worker = read('src/worker-email-lifecycle.js');
need(worker.includes("const DAILY_FIRST_BRIEF_VERSION='daily-first-brief-v1'"), 'worker missing immediate first-brief version marker');
need(worker.includes('const firstBrief=await sendFirstDailyBrief(request,env,member)'), 'verification does not trigger the first Daily Control Brief');
need(worker.includes('daily-control-brief:${member.id}:${date}'), 'same-day Daily Control Brief idempotency key missing');
need(worker.includes("key.startsWith('automation:daily:')||key.startsWith('daily-first-brief:')"), 'scheduled and first-brief deliveries do not share the dedupe rule');
need(worker.includes("'/api/email/admin/subscriber'"), 'protected subscriber diagnostic route missing');
need(worker.includes("path==='/api/email/admin/subscriber'"), 'protected subscriber diagnostic handler is not routed');

const newsletter = read('newsletter.js');
const dailyPreferencePayload = /public_daily_brief\s*:\s*(?:preferences|selected)\.daily/.test(newsletter);
const weeklyPreferencePayload = /public_weekly_digest\s*:\s*(?:preferences|selected)\.weekly/.test(newsletter);
const releasePreferencePayload = /release_notices\s*:\s*(?:preferences\.release|selected\.releaseNotices)/.test(newsletter);
need(dailyPreferencePayload, 'newsletter client does not submit the Daily Brief preference');
need(weeklyPreferencePayload, 'newsletter client does not submit the Weekly preference independently');
need(releasePreferencePayload, 'newsletter client does not submit release notices independently');
need(newsletter.includes('today’s Daily Control Brief will be sent immediately.'), 'daily signup does not explain immediate post-verification delivery');
need(!newsletter.includes('public_weekly_digest:true') && !newsletter.includes('weekly:true'), 'newsletter client silently forces weekly delivery');
need(newsletter.includes('Select at least one briefing or release-notice preference.'), 'newsletter client lacks the explicit no-preference failure boundary');

const statusPage = read('email-status.html');
need(statusPage.includes("dailyBrief==='sent'"), 'email status page cannot distinguish a sent first brief');
need(statusPage.includes("dailyBrief==='queued-for-retry'"), 'email status page cannot distinguish a queued retry');
need(statusPage.includes('No false delivery success was recorded.'), 'email status page lacks truthful failed-delivery wording');

const wall = readJson('data/clock-wall.json');
const timers = read('timers.html');
const detailHeadings = [
  'What changed:', 'What this score means', 'How it is calculated', 'Control-system relevance', 'Speculation angle',
  'What would raise it', 'What would lower it', 'Evidence feeding this timer', 'Missing records',
  'Useful next actions', 'Boundary:'
];
need(Array.isArray(wall.clocks) && wall.clocks.length > 0, 'clock wall has no clocks');
for (const clock of wall.clocks || []) {
  const idMarker = `id="${escapeHtml(clock.slug || '')}"`;
  const idAt = timers.indexOf(idMarker);
  const start = idAt >= 0 ? timers.lastIndexOf('<article', idAt) : -1;
  need(start >= 0 && idAt >= start, `${clock.title || clock.slug} card missing from timers.html`);
  if (start < 0 || idAt < start) continue;
  const end = timers.indexOf('</article>', idAt);
  const block = timers.slice(start, end + 10);
  need(/class="[^"]*\bclock-card\b[^"]*"/.test(block.slice(0, Math.max(0, block.indexOf('>') + 1))), `${clock.title} is not rendered as a clock card`);
  const detailsAt = block.indexOf('<details class="clock-detail">');
  need(detailsAt > 0, `${clock.title} deeper-information dropdown missing`);
  if (detailsAt < 0) continue;
  const summary = block.slice(0, detailsAt);
  const detail = block.slice(detailsAt);
  const scoreText = `${Number(clock.score || 0)}%`;
  need((summary.match(new RegExp(scoreText.replace('%', '\\%'), 'g')) || []).length === 2, `${clock.title} summary must show the canonical percentage exactly twice`);
  need(summary.includes(escapeHtml(clock.window || 'Review window not set')), `${clock.title} summary missing timeframe`);
  need(summary.includes(escapeHtml(clock.scoreBand || clock.status || 'Watch')), `${clock.title} summary missing status band`);
  need(summary.includes(escapeHtml(clock.title || '')), `${clock.title} summary missing title`);
  need(summary.includes(escapeHtml(clock.lastMovement || '')), `${clock.title} summary missing latest movement`);
  for (const heading of detailHeadings) need(!summary.includes(heading), `${clock.title} leaks ${heading} outside dropdown`);
  for (const heading of detailHeadings) need(detail.includes(heading), `${clock.title} dropdown missing ${heading}`);
  need(!/<details[^>]*\sopen(?:\s|>|=)/i.test(block), `${clock.title} dropdown must be closed by default`);
}

const homepage = read('index.html');
const genericPhrases = [
  'other documented institutional actor', 'documented person or institution', 'Named actor map pending',
  '>increased position<', '>reduced position<', '>exited position<', '>new position<', '>mentions<',
  '>Final Judgment<', '>View files<'
];
for (const phrase of genericPhrases) need(!homepage.toLowerCase().includes(phrase.toLowerCase()), `homepage contains forbidden actor placeholder: ${phrase}`);
need((homepage.match(/class="actor-intel-card"/g) || []).length > 0, 'homepage has no named actor intelligence cards');
need(homepage.includes('Documented action or role:'), 'homepage actor cards lack documented actions');
need(homepage.includes('Why it matters:'), 'homepage actor cards lack significance analysis');
need(homepage.includes('Evidence boundary:'), 'homepage actor cards lack evidence boundaries');
need(homepage.includes('Open evidence'), 'homepage actor cards lack evidence routes');

require('./member-forum-integration-test.js');

const report = {
  ok: issues.length === 0,
  generatedAt: new Date().toISOString(),
  checks: {
    immediateDailyBrief: true,
    sameDayDeduplication: true,
    truthfulDeliveryStatus: true,
    independentNewsletterPreferences: dailyPreferencePayload && weeklyPreferencePayload && releasePreferencePayload,
    compactClockCards: true,
    namedActorIntelligence: true,
    memberForumIntegration: true
  },
  issues
};
fs.mkdirSync(at('downloads'), { recursive: true });
fs.writeFileSync(at('downloads/living-intelligence-regression-test.json'), JSON.stringify(report, null, 2));

if (issues.length) {
  console.error('LIVING INTELLIGENCE REGRESSION TEST FAILED');
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}
console.log(`LIVING INTELLIGENCE REGRESSION TEST PASSED: ${(wall.clocks || []).length} compact clocks, named actor cards, immediate Daily Brief delivery, independent email preferences and verified-member forum posting.`);
require('./build-cloudflare-investigation-graph-projection.js');
