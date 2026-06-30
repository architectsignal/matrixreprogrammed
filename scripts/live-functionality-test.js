const fs = require('fs');
const path = require('path');

const BASE = (process.env.LIVE_SITE_BASE || 'https://www.matrixreprogrammed.com').replace(/\/$/, '');
const POST_TESTS = String(process.env.LIVE_FUNCTIONALITY_POST_TESTS || 'true').toLowerCase() !== 'false';
const startedAt = new Date().toISOString();
const report = { startedAt, base: BASE, postTests: POST_TESTS, checks: [], failures: [] };

function addCheck(name, ok, details = {}) {
  const item = { name, ok: Boolean(ok), details };
  report.checks.push(item);
  if (!item.ok) report.failures.push(item);
  const mark = item.ok ? 'PASS' : 'FAIL';
  console.log(`${mark} ${name}`);
  if (!item.ok) console.log(JSON.stringify(details, null, 2));
}

function url(route) { return `${BASE}${route.startsWith('/') ? route : '/' + route}`; }
async function fetchText(route, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.LIVE_FUNCTIONALITY_TIMEOUT_MS || 15000));
  const res = await fetch(url(route), { redirect: 'follow', cache: 'no-store', signal: controller.signal, headers: { 'user-agent': 'matrix-live-functionality-test/1.0', ...(options.headers || {}) }, ...options });
  clearTimeout(timeout);
  const text = await res.text();
  return { res, text };
}
async function fetchJson(route, options = {}) {
  const { res, text } = await fetchText(route, { headers: { accept: 'application/json', ...(options.headers || {}) }, ...options });
  let json = null;
  try { json = JSON.parse(text); } catch (error) { return { res, text, json: null, parseError: error.message }; }
  return { res, text, json };
}
async function expectPage(route, markers) {
  try { const { res, text } = await fetchText(route, { headers: { accept: 'text/html' } }); const missing = markers.filter(marker => !text.includes(marker)); addCheck(`page ${route}`, res.ok && missing.length === 0, { status: res.status, missing, bytes: text.length }); }
  catch (error) { addCheck(`page ${route}`, false, { error: error.message }); }
}
async function expectJson(route, validator) {
  try { const { res, json, parseError, text } = await fetchJson(route); const validation = json ? validator(json) : { ok: false, reason: parseError || 'invalid JSON' }; addCheck(`json ${route}`, res.ok && validation.ok, { status: res.status, validation, preview: text.slice(0, 180) }); return json; }
  catch (error) { addCheck(`json ${route}`, false, { error: error.message }); return null; }
}
async function submitBoardPost(board, submitRoute, feedRoute) {
  const stamp = new Date().toISOString();
  const payload = { board, name: 'Matrix Synthetic Test', category: 'System Test', title: `Synthetic live persistence test ${stamp}`, body: `Automated live functionality test for ${board}. This confirms Cloudflare Worker submit, KV persistence, and feed retrieval.`, sourceUrl: '/deploy-status.json', website: '' };
  try {
    const { res, json, text } = await fetchJson(submitRoute, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(payload) });
    const post = json && json.post;
    const submitOk = res.ok && json && json.ok === true && json.persistent === true && post && post.id && post.board === board;
    addCheck(`forum submit ${board}`, submitOk, { status: res.status, json: json || text.slice(0, 250) });
    if (!submitOk || !post) return;
    const feed = await fetchJson(`${feedRoute}?t=${Date.now()}`);
    const posts = feed.json && Array.isArray(feed.json.posts) ? feed.json.posts : (Array.isArray(feed.json) ? feed.json : []);
    const found = posts.some(item => item && item.id === post.id && item.board === board);
    addCheck(`forum feed contains submitted ${board}`, feed.res.ok && found, { status: feed.res.status, submittedId: post.id, postCount: posts.length });
  } catch (error) { addCheck(`forum submit ${board}`, false, { error: error.message }); }
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
async function main() {
  await expectPage('/', ['Matrix', 'Reprogrammed']);
  await expectPage('/search.html', ['archive-search', 'search-results']);
  await expectPage('/books.html', ['Books']);
  await expectPage('/forum.html', ['signal-board-feed', 'data-board="main"']);
  await expectPage('/dark-speculation-forum.html', ['signal-board-feed', 'data-board="speculation"']);
  await expectPage('/epstein-alive-board.html', ['signal-board-feed', 'data-board="epstein-alive"']);
  await expectPage('/newsletter.html', ['data-newsletter-form', 'Weekly Signal']);
  await expectPage('/intel-drop-vault.html', ['INTEL DROP VAULT', 'Old updates do not disappear']);

  await expectJson('/deploy-status.json', json => ({ ok: Boolean(json && (json.buildSha || json.commit || json.workerScript || json.assetOutput)), keys: Object.keys(json || {}) }));
  await expectJson('/deploy-health.json', json => ({ ok: Boolean(json && json.ok !== false), keys: Object.keys(json || {}) }));
  await expectJson('/forum-health', json => ({ ok: Boolean(json && (json.ok === true || json.configured === true || json.bindingHealthy === true || json.forumPostsBinding === 'connected')), json }));
  await expectJson('/newsletter-health', json => ({ ok: Boolean(json && json.capturePersistent === true), json }));
  await expectJson('/downloads/intel-drop-vault.json', json => ({ ok: Boolean(json && Array.isArray(json.records) && typeof json.totalCount === 'number'), count: json && json.totalCount }));

  const searchIndex = await expectJson('/search-index.json', json => ({ ok: Array.isArray(json) && json.length >= 20 && json.some(item => item && item.url === 'books.html'), count: Array.isArray(json) ? json.length : null }));
  if (Array.isArray(searchIndex)) for (const term of ['books', 'epstein', 'matrix']) addCheck(`search-index term ${term}`, searchIndex.filter(item => `${item.title || ''} ${item.description || ''} ${(item.keywords || []).join(' ')}`.toLowerCase().includes(term)).length > 0, {});

  await expectJson('/forum-feed-main', json => ({ ok: Boolean(json && json.persistent === true && Array.isArray(json.posts)), count: json && json.posts ? json.posts.length : null }));
  await expectJson('/forum-feed-speculation', json => ({ ok: Boolean(json && json.persistent === true && Array.isArray(json.posts)), count: json && json.posts ? json.posts.length : null }));
  await expectJson('/forum-feed-epstein-alive', json => ({ ok: Boolean(json && json.persistent === true && Array.isArray(json.posts)), count: json && json.posts ? json.posts.length : null }));

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
  fs.writeFileSync(path.join(process.cwd(), 'downloads/live-functionality-test-report.md'), ['# Live Functionality Test Report', '', `- Base: ${BASE}`, `- Started: ${report.startedAt}`, `- Finished: ${report.finishedAt}`, `- Result: ${report.ok ? 'PASS' : 'FAIL'}`, `- Checks: ${report.checks.length}`, `- Failures: ${report.failures.length}`, '', '## Checks', ...report.checks.map(check => `- ${check.ok ? 'PASS' : 'FAIL'} — ${check.name}`)].join('\n'));
  if (!report.ok) { console.error(`LIVE FUNCTIONALITY TEST FAILED: ${report.failures.length} failure(s)`); process.exit(1); }
  console.log('LIVE FUNCTIONALITY TEST PASSED');
}
main().catch(error => { addCheck('unhandled test failure', false, { error: error.stack || error.message }); report.finishedAt = new Date().toISOString(); report.ok = false; fs.mkdirSync(path.join(process.cwd(), 'downloads'), { recursive: true }); fs.writeFileSync(path.join(process.cwd(), 'downloads/live-functionality-test-report.json'), JSON.stringify(report, null, 2)); console.error(error); process.exit(1); });
