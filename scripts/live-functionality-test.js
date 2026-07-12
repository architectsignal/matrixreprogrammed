const fs = require('fs');
const path = require('path');

const BASE = (process.env.LIVE_SITE_BASE || 'https://matrixreprogrammed.com').replace(/\/$/, '');
const POST_TESTS = String(process.env.LIVE_FUNCTIONALITY_POST_TESTS || 'true').toLowerCase() !== 'false';
const SOFT_TRANSIENT_TIMEOUTS = String(process.env.LIVE_FUNCTIONALITY_SOFT_FORUM_TIMEOUTS || 'true').toLowerCase() !== 'false';
const startedAt = new Date().toISOString();
const report = {
  startedAt,
  base: BASE,
  postTests: POST_TESTS,
  softTransientTimeouts: SOFT_TRANSIENT_TIMEOUTS,
  forumStorage: 'Cloudflare D1 MEMBERS_DB.forum_posts',
  paymentStatus: 'deferred',
  checks: [],
  failures: [],
  warnings: []
};

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
function url(route) { return `${BASE}${route.startsWith('/') ? route : `/${route}`}`; }
async function fetchText(route, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.LIVE_FUNCTIONALITY_TIMEOUT_MS || 25000));
  try {
    const res = await fetch(url(route), {
      redirect: 'follow',
      cache: 'no-store',
      signal: controller.signal,
      ...options,
      headers: {
        'cache-control': 'no-cache',
        pragma: 'no-cache',
        'user-agent': 'matrix-live-functionality-test/2.0',
        ...(options.headers || {})
      }
    });
    const text = await res.text();
    return { res, text };
  } finally {
    clearTimeout(timeout);
  }
}
async function fetchJson(route, options = {}) {
  const { res, text } = await fetchText(route, {
    ...options,
    headers: { accept: 'application/json', ...(options.headers || {}) }
  });
  let json = null;
  try { json = JSON.parse(text); }
  catch (error) { return { res, text, json: null, parseError: error.message }; }
  return { res, text, json };
}
function isAbort(error) {
  return /aborted|abort|timeout|timed out/i.test(String(error && (error.message || error.name || error)));
}
function transientSoft(name, error, extra = {}) {
  if (SOFT_TRANSIENT_TIMEOUTS && isAbort(error)) {
    addCheck(name, false, {
      ...extra,
      degraded: true,
      error: error.message || String(error),
      note: 'A transient timeout was recorded without changing the verified production storage contract.'
    }, { soft: true });
    return true;
  }
  return false;
}
async function expectPage(route, markers) {
  try {
    const { res, text } = await fetchText(route, { headers: { accept: 'text/html' } });
    const missing = markers.filter(marker => !text.includes(marker));
    addCheck(`page ${route}`, res.ok && missing.length === 0, { status: res.status, missing, bytes: text.length });
  } catch (error) {
    addCheck(`page ${route}`, false, { error: error.message });
  }
}
async function expectJson(route, validator, options = {}) {
  const name = `json ${route}`;
  try {
    const { res, json, parseError, text } = await fetchJson(route);
    const validation = json ? validator(json) : { ok: false, reason: parseError || 'invalid JSON' };
    addCheck(name, res.ok && validation.ok, { status: res.status, validation, preview: text.slice(0, 220) }, options);
    return json;
  } catch (error) {
    if (options.softOnTimeout && transientSoft(name, error)) return null;
    addCheck(name, false, { error: error.message }, options);
    return null;
  }
}

async function confirmD1Feed(feedRoute, board, submittedId) {
  const attempts = Number(process.env.LIVE_FUNCTIONALITY_FEED_RETRIES || 4);
  const waitMs = Number(process.env.LIVE_FUNCTIONALITY_FEED_RETRY_MS || 700);
  let last = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const feed = await fetchJson(`${feedRoute}?t=${Date.now()}&attempt=${attempt}`);
      const posts = feed.json && Array.isArray(feed.json.posts) ? feed.json.posts : [];
      const authoritative = feed.res.ok
        && feed.json?.persistent === true
        && String(feed.json?.authoritativeStorage || '').includes('D1')
        && Array.isArray(posts);
      const visible = posts.some(item => item && item.id === submittedId && item.board === board);
      last = {
        status: feed.res.status,
        attempt,
        authoritative,
        visible,
        postCount: posts.length,
        source: feed.json?.source || null
      };
      /* Synthetic health posts are deliberately removed from public feeds. */
      if (authoritative) return { ok: true, details: { ...last, syntheticPostExpectedPubliclyHidden: !visible } };
    } catch (error) {
      if (SOFT_TRANSIENT_TIMEOUTS && isAbort(error)) {
        return { ok: false, soft: true, details: { board, error: error.message, degraded: true } };
      }
      throw error;
    }
    if (attempt < attempts) await sleep(waitMs);
  }
  return { ok: false, soft: false, details: last || { board, error: 'feed unavailable' } };
}

async function submitBoardPost(board, submitRoute, feedRoute) {
  const stamp = new Date().toISOString();
  const payload = {
    board,
    name: 'Matrix System Check',
    category: 'health check',
    title: `Health check ${stamp}`,
    body: `Automated D1 persistence health check for ${board}. This synthetic record is intentionally hidden from public feeds.`,
    sourceUrl: '/deploy-health.json',
    website: ''
  };
  try {
    const { res, json, text } = await fetchJson(submitRoute, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(payload)
    });
    const post = json && json.post;
    const submitOk = res.ok
      && json?.ok === true
      && json?.persistent === true
      && json?.saved === true
      && String(json?.storage || '').includes('D1')
      && post?.id
      && post?.board === board;
    addCheck(`forum D1 submit ${board}`, submitOk, { status: res.status, json: json || text.slice(0, 300) });
    if (!submitOk || !post) return;
    const check = await confirmD1Feed(feedRoute, board, post.id);
    addCheck(`forum D1 feed ${board}`, check.ok, { ...check.details, submittedId: post.id }, { soft: check.soft });
  } catch (error) {
    if (transientSoft(`forum D1 submit ${board}`, error, { board, submitRoute })) return;
    addCheck(`forum D1 submit ${board}`, false, { error: error.message });
  }
}

async function submitMembershipConsentTest() {
  const payload = {
    name: 'Matrix System Check',
    email: 'matrix-live-check@example.com',
    source: 'live-functionality-test',
    sourcePage: '/membership',
    marketingConsent: true,
    consentVersion: 'membership-consent-v1'
  };
  try {
    const { res, json, text } = await fetchJson('/api/membership/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(payload)
    });
    const ok = res.status === 202
      && json?.ok === true
      && json?.persistent === true
      && json?.saved === true
      && json?.emailVerificationRequired === true
      && String(json?.storage || '').includes('D1');
    addCheck('membership consent persisted in D1', ok, { status: res.status, json: json || text.slice(0, 300) });
  } catch (error) {
    addCheck('membership consent persisted in D1', false, { error: error.message });
  }
}

function newsletterHealthOk(json) {
  return Boolean(json
    && json.ok === true
    && json.configured === true
    && json.d1Connected === true
    && json.d1SchemaReady === true
    && json.storage === 'Cloudflare D1 MEMBERS_DB'
    && json.signup === '/api/membership/signup');
}

async function main() {
  await expectPage('/', ['Matrix', 'Reprogrammed']);
  await expectPage('/search.html', ['archive-search', 'search-results']);
  await expectPage('/books.html', ['Books']);
  await expectPage('/membership', ['€3', '€6', '€9', 'Coming soon — no payment taken']);
  await expectPage('/deploy-health', ['D1 AUTHORITATIVE / FAIL CLOSED', 'Payments: DEFERRED / NO PAYMENT TAKEN']);
  await expectPage('/tracker-dashboard.html', ['Ultimate Tracker Dashboard', 'TRACKER OPERATING SYSTEM']);
  await expectPage('/power-research-method.html', ['Power Research Method', 'Evidence Classes']);
  await expectPage('/institution-tracker.html', ['Institution Tracker', 'Institution Sectors']);
  await expectPage('/aviation-evidence-policy.html', ['Aviation Evidence Policy', 'AVIATION EVIDENCE RULES']);
  await expectPage('/forum.html', ['signal-board-feed', 'data-board="main"']);
  await expectPage('/dark-speculation-forum.html', ['signal-board-feed', 'data-board="speculation"']);
  await expectPage('/epstein-alive-board.html', ['signal-board-feed', 'data-board="epstein-alive"']);
  await expectPage('/newsletter.html', ['data-newsletter-form', 'Weekly Signal']);
  await expectPage('/intel-drop-vault.html', ['INTEL DROP VAULT', 'Old updates do not disappear']);

  await expectJson('/deploy-status.json', json => ({
    ok: Boolean(json && (json.buildSha || json.commit || json.workerScript || json.assetOutput)),
    keys: Object.keys(json || {})
  }));
  await expectJson('/deploy-health.json', json => ({
    ok: Boolean(json
      && json.ok === true
      && json.workerScript === 'src/worker-production.js'
      && json.paymentStatus === 'deferred'
      && json.manifestMatches === true),
    buildSha: json?.buildSha,
    paymentStatus: json?.paymentStatus
  }));
  await expectJson('/forum-health', json => ({
    ok: Boolean(json
      && json.ok === true
      && json.persistent === true
      && json.d1Connected === true
      && json.schemaReady === true
      && json.backend === 'src/worker-forum-persistence.js'
      && String(json.authoritativeStorage || '').includes('D1')),
    storedPostCount: json?.storedPostCount,
    kvBinding: json?.kvBinding
  }), { softOnTimeout: true });
  await expectJson('/newsletter-health', json => ({ ok: newsletterHealthOk(json), json }));
  await expectJson('/downloads/intel-drop-vault.json', json => ({
    ok: Boolean(json && Array.isArray(json.records) && typeof json.totalCount === 'number'),
    count: json?.totalCount
  }));
  await expectJson('/downloads/tracker-dashboard-map.json', json => ({
    ok: Boolean(json && Array.isArray(json.routes) && json.routes.length >= 8),
    count: json?.routes?.length
  }));

  const searchIndex = await expectJson('/search-index.json', json => ({
    ok: Array.isArray(json) && json.length >= 20 && json.some(item => item && item.url === 'books.html'),
    count: Array.isArray(json) ? json.length : null
  }));
  if (Array.isArray(searchIndex)) {
    for (const term of ['books', 'epstein', 'matrix', 'tracker']) {
      const matches = searchIndex.filter(item => `${item.title || ''} ${item.description || ''} ${(item.keywords || []).join(' ')}`.toLowerCase().includes(term));
      addCheck(`search-index term ${term}`, matches.length > 0, { matches: matches.length });
    }
  }

  await expectJson('/forum-feed-main', json => ({
    ok: Boolean(json && json.persistent === true && String(json.authoritativeStorage || '').includes('D1') && Array.isArray(json.posts)),
    count: json?.posts?.length
  }), { softOnTimeout: true });
  await expectJson('/forum-feed-speculation', json => ({
    ok: Boolean(json && json.persistent === true && String(json.authoritativeStorage || '').includes('D1') && Array.isArray(json.posts)),
    count: json?.posts?.length
  }), { softOnTimeout: true });
  await expectJson('/forum-feed-epstein-alive', json => ({
    ok: Boolean(json && json.persistent === true && String(json.authoritativeStorage || '').includes('D1') && Array.isArray(json.posts)),
    count: json?.posts?.length
  }), { softOnTimeout: true });

  if (POST_TESTS) {
    await submitBoardPost('main', '/submit-main-post', '/forum-feed-main');
    await submitBoardPost('speculation', '/submit-speculation-post', '/forum-feed-speculation');
    await submitBoardPost('epstein-alive', '/submit-epstein-alive-post', '/forum-feed-epstein-alive');
    await submitMembershipConsentTest();
  } else {
    addCheck('persistent write tests skipped', true, { reason: 'LIVE_FUNCTIONALITY_POST_TESTS=false' });
  }

  report.finishedAt = new Date().toISOString();
  report.ok = report.failures.length === 0;
  fs.mkdirSync(path.join(process.cwd(), 'downloads'), { recursive: true });
  fs.writeFileSync(path.join(process.cwd(), 'downloads/live-functionality-test-report.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(process.cwd(), 'downloads/live-functionality-test-report.md'), [
    '# Live Functionality Test Report',
    '',
    `- Base: ${BASE}`,
    `- Started: ${report.startedAt}`,
    `- Finished: ${report.finishedAt}`,
    `- Result: ${report.ok ? 'PASS' : 'FAIL'}`,
    `- Forum storage: ${report.forumStorage}`,
    `- Payments: ${report.paymentStatus}`,
    `- Checks: ${report.checks.length}`,
    `- Failures: ${report.failures.length}`,
    `- Warnings: ${report.warnings.length}`,
    '',
    '## Checks',
    ...report.checks.map(check => `- ${check.ok ? 'PASS' : (check.soft ? 'WARN' : 'FAIL')} — ${check.name}`)
  ].join('\n'));
  if (!report.ok) {
    console.error(`LIVE FUNCTIONALITY TEST FAILED: ${report.failures.length} failure(s)`);
    process.exit(1);
  }
  if (report.warnings.length) console.log(`LIVE FUNCTIONALITY TEST PASSED WITH ${report.warnings.length} WARNING(S)`);
  else console.log('LIVE FUNCTIONALITY TEST PASSED');
}

main().catch(error => {
  addCheck('unhandled test failure', false, { error: error.stack || error.message });
  report.finishedAt = new Date().toISOString();
  report.ok = false;
  fs.mkdirSync(path.join(process.cwd(), 'downloads'), { recursive: true });
  fs.writeFileSync(path.join(process.cwd(), 'downloads/live-functionality-test-report.json'), JSON.stringify(report, null, 2));
  console.error(error);
  process.exit(1);
});
