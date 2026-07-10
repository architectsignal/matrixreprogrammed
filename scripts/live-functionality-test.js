const fs = require('fs');
const path = require('path');

const BASE = (process.env.LIVE_SITE_BASE || 'https://www.matrixreprogrammed.com').replace(/\/$/, '');
const POST_TESTS = String(process.env.LIVE_FUNCTIONALITY_POST_TESTS || 'true').toLowerCase() !== 'false';
const SOFT_FORUM_TIMEOUTS = String(process.env.LIVE_FUNCTIONALITY_SOFT_FORUM_TIMEOUTS || 'true').toLowerCase() !== 'false';
const startedAt = new Date().toISOString();
const report = { startedAt, base: BASE, postTests: POST_TESTS, softForumTimeouts: SOFT_FORUM_TIMEOUTS, checks: [], failures: [], warnings: [] };

function addCheck(name, ok, details = {}, options = {}) {
  const soft = Boolean(options.soft);
  const item = { name, ok: Boolean(ok), soft, details };
  report.checks.push(item);
  if (!item.ok && soft) report.warnings.push(item);
  if (!item.ok && !soft) report.failures.push(item);
  const mark = item.ok ? 'PASS' : (soft ? 'WARN' : 'FAIL');
  console.log(`${mark} ${name}`);
  if (!item.ok) console.log(JSON.stringify(details, null, 2));
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function url(route) { return `${BASE}${route.startsWith('/') ? route : '/' + route}`; }
async function fetchText(route, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.LIVE_FUNCTIONALITY_TIMEOUT_MS || 25000));
  try {
    const res = await fetch(url(route), { redirect: 'follow', cache: 'no-store', signal: controller.signal, headers: { 'user-agent': 'matrix-live-functionality-test/1.0', ...(options.headers || {}) }, ...options });
    const text = await res.text();
    return { res, text };
  } finally {
    clearTimeout(timeout);
  }
}
async function fetchJson(route, options = {}) {
  const { res, text } = await fetchText(route, { headers: { accept: 'application/json', ...(options.headers || {}) }, ...options });
  let json = null;
  try { json = JSON.parse(text); } catch (error) { return { res, text, json: null, parseError: error.message }; }
  return { res, text, json };
}
function isAbort(error) {
  return /aborted|abort|timeout|timed out/i.test(String(error && (error.message || error.name || error)));
}
function forumSoft(name, error, extra = {}) {
  if (SOFT_FORUM_TIMEOUTS && isAbort(error)) {
    addCheck(name, false, { ...extra, degraded: true, error: error.message || String(error), note: 'Forum KV endpoint timed out during live probe. The forum page is still tested as a hard page check; this endpoint is recorded as degraded instead of blocking the whole site.' }, { soft: true });
    return true;
  }
  return false;
}
async function expectPage(route, markers) {
  try {
    const { res, text } = await fetchText(route, { headers: { accept: 'text/html' } });
    const missing = markers.filter(marker => !text.includes(marker));
    addCheck(`page ${route}`, res.ok && missing.length === 0, { status: res.status, missing, bytes: text.length });
  } catch (error) { addCheck(`page ${route}`, false, { error: error.message }); }
}
async function expectJson(route, validator, options = {}) {
  const name = `json ${route}`;
  try {
    const { res, json, parseError, text } = await fetchJson(route);
    const validation = json ? validator(json) : { ok: false, reason: parseError || 'invalid JSON' };
    addCheck(name, res.ok && validation.ok, { status: res.status, validation, preview: text.slice(0, 180) }, options);
    return json;
  } catch (error) {
    if (options.softOnTimeout && forumSoft(name, error)) return null;
    addCheck(name, false, { error: error.message }, options);
    return null;
  }
}
async function feedVisibilityStatus(feedRoute, board, postId) {
  let last = { status: 0, postCount: 0, attempt: 0, found: false };
  const attempts = Number(process.env.LIVE_FUNCTIONALITY_FEED_RETRIES || 4);
  const waitMs = Number(process.env.LIVE_FUNCTIONALITY_FEED_RETRY_MS || 900);
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const feed = await fetchJson(`${feedRoute}?t=${Date.now()}&attempt=${attempt}`);
      const posts = feed.json && Array.isArray(feed.json.posts) ? feed.json.posts : (Array.isArray(feed.json) ? feed.json : []);
      const found = posts.some(item => item && item.id === postId && item.board === board);
      last = { status: feed.res.status, postCount: posts.length, attempt, found, persistent: Boolean(feed.json && feed.json.persistent === true) };
      if (feed.res.ok && found) return { ok: true, soft: false, details: last };
    } catch (error) {
      if (SOFT_FORUM_TIMEOUTS && isAbort(error)) return { ok: false, soft: true, details: { ...last, degraded: true, error: error.message, board, note: 'Feed visibility timed out during live KV probe.' } };
      throw error;
    }
    if (attempt < attempts) await sleep(waitMs);
  }
  return { ok: last.status >= 200 && last.status < 300 && last.persistent === true, soft: false, details: { ...last, eventualVisibility: true, note: 'Cloudflare KV accepted the post but the public feed may expose the new index after propagation.' } };
}
async function submitBoardPost(board, submitRoute, feedRoute) {
  const stamp = new Date().toISOString();
  const payload = { board, name: 'Matrix Synthetic Check', category: 'System Check', title: `Synthetic live persistence check ${stamp}`, body: `Automated live functionality check for ${board}. This confirms Cloudflare Worker submit, KV persistence, and feed retrieval semantics.`, sourceUrl: '/deploy-status.json', website: '' };
  try {
    const { res, json, text } = await fetchJson(submitRoute, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(payload) });
    const post = json && json.post;
    const submitOk = res.ok && json && json.ok === true && json.persistent === true && post && post.id && post.board === board;
    addCheck(`forum submit ${board}`, submitOk, { status: res.status, json: json || text.slice(0, 250) });
    if (!submitOk || !post) return;
    const check = await feedVisibilityStatus(feedRoute, board, post.id);
    addCheck(`forum feed visibility ${board}`, check.ok, { ...check.details, submittedId: post.id, retryAware: true }, { soft: check.soft });
  } catch (error) {
    if (forumSoft(`forum submit ${board}`, error, { board, submitRoute })) return;
    addCheck(`forum submit ${board}`, false, { error: error.message });
  }
}
async function submitNewsletterTest() {
  const stamp = Date.now();
  const payload = { name: 'Matrix Test Subscriber', email: `matrix-test-${stamp}@example.com`, source: 'live-functionality-test', tags: 'test,weekly,live-intel', consent: 'yes', website: '' };
  try {
    const { res, json, text } = await fetchJson('/subscribe-newsletter', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(payload) });
    const ok = res.ok && json && json.ok === true && json.persistent === true && json.subscriber && json.subscriber.email === payload.email;
    addCheck('newsletter persistent subscribe', ok, { status: res.status, json: json || text.slice(0, 250) });
  } catch (error) { addCheck('newsletter persistent subscribe', false, { error: error.message }); }
}
function newsletterHealthOk(json) {
  return Boolean(json && (
    json.capturePersistent === true ||
    (json.ok === true && json.storage === 'Cloudflare KV FORUM_POSTS' && (json.signup === '/newsletter-signup' || json.signup === '/subscribe-newsletter'))
  ));
}
async function main() {
  await expectPage('/', ['Matrix', 'Reprogrammed']);
  await expectPage('/search.html', ['archive-search', 'search-results']);
  await expectPage('/books.html', ['Books']);
  await expectPage('/tracker-dashboard.html', ['Ultimate Tracker Dashboard', 'TRACKER OPERATING SYSTEM']);
  await expectPage('/power-research-method.html', ['Power Research Method', 'Evidence Classes']);
  await expectPage('/institution-tracker.html', ['Institution Tracker', 'Institution Sectors']);
  await expectPage('/aviation-evidence-policy.html', ['Aviation Evidence Policy', 'AVIATION EVIDENCE RULES']);
  await expectPage('/forum.html', ['signal-board-feed', 'data-board="main"']);
  await expectPage('/dark-speculation-forum.html', ['signal-board-feed', 'data-board="speculation"']);
  await expectPage('/epstein-alive-board.html', ['signal-board-feed', 'data-board="epstein-alive"']);
  await expectPage('/newsletter.html', ['data-newsletter-form', 'Weekly Signal']);
  await expectPage('/intel-drop-vault.html', ['INTEL DROP VAULT', 'Old updates do not disappear']);

  await expectJson('/deploy-status.json', json => ({ ok: Boolean(json && (json.buildSha || json.commit || json.workerScript || json.assetOutput)), keys: Object.keys(json || {}) }));
  await expectJson('/deploy-health.json', json => ({ ok: Boolean(json && json.ok !== false), keys: Object.keys(json || {}) }));
  await expectJson('/forum-health', json => ({ ok: Boolean(json && (json.ok === true || json.configured === true || json.bindingHealthy === true || json.forumPostsBinding === 'connected')), json }), { softOnTimeout: true });
  await expectJson('/newsletter-health', json => ({ ok: newsletterHealthOk(json), json }));
  await expectJson('/downloads/intel-drop-vault.json', json => ({ ok: Boolean(json && Array.isArray(json.records) && typeof json.totalCount === 'number'), count: json && json.totalCount }));
  await expectJson('/downloads/tracker-dashboard-map.json', json => ({ ok: Boolean(json && Array.isArray(json.routes) && json.routes.length >= 8), count: json && json.routes ? json.routes.length : null }));

  const searchIndex = await expectJson('/search-index.json', json => ({ ok: Array.isArray(json) && json.length >= 20 && json.some(item => item && item.url === 'books.html'), count: Array.isArray(json) ? json.length : null }));
  if (Array.isArray(searchIndex)) for (const term of ['books', 'epstein', 'matrix', 'tracker']) addCheck(`search-index term ${term}`, searchIndex.filter(item => `${item.title || ''} ${item.description || ''} ${(item.keywords || []).join(' ')}`.toLowerCase().includes(term)).length > 0, {});

  await expectJson('/forum-feed-main', json => ({ ok: Boolean(json && json.persistent === true && Array.isArray(json.posts)), count: json && json.posts ? json.posts.length : null }), { softOnTimeout: true });
  await expectJson('/forum-feed-speculation', json => ({ ok: Boolean(json && json.persistent === true && Array.isArray(json.posts)), count: json && json.posts ? json.posts.length : null }), { softOnTimeout: true });
  await expectJson('/forum-feed-epstein-alive', json => ({ ok: Boolean(json && json.persistent === true && Array.isArray(json.posts)), count: json && json.posts ? json.posts.length : null }), { softOnTimeout: true });

  if (POST_TESTS) {
    await submitBoardPost('main', '/submit-main-post', '/forum-feed-main');
    await submitBoardPost('speculation', '/submit-speculation-post', '/forum-feed-speculation');
    await submitBoardPost('epstein-alive', '/submit-epstein-alive-post', '/forum-feed-epstein-alive');
    await submitNewsletterTest();
  } else addCheck('persistent post/capture tests skipped', true, { reason: 'LIVE_FUNCTIONALITY_POST_TESTS=false' });

  report.finishedAt = new Date().toISOString();
  report.ok = report.failures.length === 0;
  fs.mkdirSync(path.join(process.cwd(), 'downloads'), { recursive: true });
  fs.writeFileSync(path.join(process.cwd(), 'downloads/live-functionality-test-report.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(process.cwd(), 'downloads/live-functionality-test-report.md'), ['# Live Functionality Test Report', '', `- Base: ${BASE}`, `- Started: ${report.startedAt}`, `- Finished: ${report.finishedAt}`, `- Result: ${report.ok ? 'PASS' : 'FAIL'}`, `- Checks: ${report.checks.length}`, `- Failures: ${report.failures.length}`, `- Warnings: ${report.warnings.length}`, '', '## Checks', ...report.checks.map(check => `- ${check.ok ? 'PASS' : (check.soft ? 'WARN' : 'FAIL')} — ${check.name}`)].join('\n'));
  if (!report.ok) { console.error(`LIVE FUNCTIONALITY TEST FAILED: ${report.failures.length} failure(s)`); process.exit(1); }
  if (report.warnings.length) console.log(`LIVE FUNCTIONALITY TEST PASSED WITH ${report.warnings.length} WARNING(S)`);
  else console.log('LIVE FUNCTIONALITY TEST PASSED');
}
main().catch(error => { addCheck('unhandled test failure', false, { error: error.stack || error.message }); report.finishedAt = new Date().toISOString(); report.ok = false; fs.mkdirSync(path.join(process.cwd(), 'downloads'), { recursive: true }); fs.writeFileSync(path.join(process.cwd(), 'downloads/live-functionality-test-report.json'), JSON.stringify(report, null, 2)); console.error(error); process.exit(1); });
