const fs = require('fs');
const path = require('path');

const root = process.cwd();
const base = String(process.env.SITE_URL || 'https://matrixreprogrammed.com').replace(/\/$/, '');
const attempts = Number(process.env.SPECULATION_LIVE_ATTEMPTS || 18);
const delayMs = Number(process.env.SPECULATION_LIVE_DELAY_MS || 5000);
const output = path.join(root, 'downloads', 'review-queue-speculation-live-test.json');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function request(route) {
  const separator = route.includes('?') ? '&' : '?';
  const response = await fetch(`${base}${route}${separator}speculation_check=${Date.now()}`, {
    redirect: 'follow',
    headers: { 'cache-control': 'no-cache', pragma: 'no-cache', 'user-agent': 'MatrixSpeculationVerifier/1.0' }
  });
  const text = await response.text();
  return { route, status: response.status, ok: response.ok, contentType: response.headers.get('content-type') || '', bytes: Buffer.byteLength(text), text };
}

async function verify() {
  const [page, data] = await Promise.all([
    request('/ai-speculative-conclusions.html'),
    request('/data/ai-speculative-conclusions.json')
  ]);
  let feed = null;
  try { feed = JSON.parse(data.text); } catch {}
  const items = Array.isArray(feed?.items) ? feed.items : [];
  const imported = items.filter(item => item.publicationState === 'auto-published-from-review-queue');
  const checks = [
    { id: 'page-live', ok: page.ok },
    { id: 'visible-review-rule', ok: page.text.includes('Review queue publication rule:') },
    { id: 'unverified-filter', ok: page.text.includes('data-filter="unverified"') },
    { id: 'feed-live', ok: data.ok && Boolean(feed) },
    { id: 'auto-publication-enabled', ok: feed?.reviewQueueAutoPublication?.enabled === true },
    { id: 'review-items-present', ok: imported.length > 0 },
    { id: 'all-imports-unverified', ok: imported.every(item => item.status === 'unverified' && item.humanReviewed === false) },
    { id: 'no-factual-promotion', ok: feed?.verifiedEvidencePagesAffected === false && feed?.reviewQueueAutoPublication?.factualPromotionAllowed === false },
    { id: 'visible-card-warning-runtime', ok: page.text.includes('ai-speculative-conclusions.js') }
  ];
  return {
    ok: checks.every(check => check.ok),
    checkedAt: new Date().toISOString(),
    siteUrl: base,
    totalItems: items.length,
    importedReviewItems: imported.length,
    checks,
    routes: [page, data].map(item => ({ route: item.route, status: item.status, contentType: item.contentType, bytes: item.bytes }))
  };
}

(async () => {
  let result;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try { result = await verify(); }
    catch (error) { result = { ok: false, checkedAt: new Date().toISOString(), siteUrl: base, error: error.message, checks: [] }; }
    result.attempt = attempt;
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
    if (result.ok) {
      console.log(`REVIEW QUEUE SPECULATION LIVE TEST PASSED: ${result.importedReviewItems} review item(s), ${result.totalItems} total hypotheses.`);
      return;
    }
    if (attempt < attempts) await sleep(delayMs);
  }
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
})();
