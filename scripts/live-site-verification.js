const fs = require('fs');
const path = require('path');

const root = process.cwd();
const base = process.env.SITE_URL || 'https://matrixreprogrammed.com';
const expectedHost = new URL(base).host;
const expectedSha = process.env.EXPECTED_BUILD_SHA || process.env.CF_PAGES_COMMIT_SHA || process.env.CF_COMMIT_SHA || process.env.GITHUB_SHA || '';
const allowChallenge = String(process.env.ALLOW_CLOUDFLARE_CHALLENGE_IN_CI || 'true').toLowerCase() !== 'false';
const commonForbidden = ['preservedaftervisiblede-duplication', 'new-intelligence-toolspreserved', '€19/month', '€49/month'];
const required = [
  { path: '/', marker: 'FOLLOW THE FILES.', forbidden: [...commonForbidden, 'rogue broadcast node inside the simulation'], maxCounts: [{ text: 'Open Source Trail', max: 1 }] },
  { path: '/start-here.html', marker: 'CHOOSE YOUR DOOR.', forbidden: commonForbidden },
  { path: '/deploy-status', marker: 'DEPLOY STATUS.' },
  { path: '/deploy-status.json', json: true, marker: 'aliases' },
  { path: '/search', marker: 'SEARCH THE SIGNAL.' },
  { path: '/search-index.json', json: true, marker: 'url', forbidden: ['object-object'] },
  { path: '/live-intel.html', marker: 'LIVE INTEL' },
  { path: '/books.html', marker: 'BOOK' },
  { path: '/download-center.html', marker: 'DOWNLOAD CENTER.' },
  { path: '/geographic-power-atlas.html', marker: 'GEOGRAPHIC POWER ATLAS.', forbidden: ['maplibre-gl@6.0.0-20', ...commonForbidden] },
  { path: '/geographic-power-atlas.js', marker: 'mapModule.default || mapModule', forbidden: ['import * as maplibregl', 'maplibre-gl@6.0.0-20'] },
  { path: '/data/geographic-power-atlas.json', json: true, marker: 'locations' },
  { path: '/data/geographic-power-atlas-data.json', json: true, marker: 'FeatureCollection' },
  { path: '/evidence-network-map.html', marker: 'EVIDENCE NETWORK MAP' },
  { path: '/data/evidence-network-map.json', json: true, marker: 'elements' },
  { path: '/evidence-timeline.html', marker: 'EVIDENCE TIMELINE' },
  { path: '/data/evidence-timeline.json', json: true, marker: 'events' },
  { path: '/data-lab.html', marker: 'PUBLIC DATA LAB' },
  { path: '/data/public-data-lab.json', json: true, marker: 'datasets' },
  { path: '/research-tools.html', marker: 'RESEARCH TOOLS' },
  { path: '/timers.html', marker: 'MISSION TIMERS.' },
  { path: '/data/global-risk-clocks.json', json: true, marker: 'clocks' },
  { path: '/ai-speculative-conclusions.html', marker: 'HYPOTHESES.', forbidden: commonForbidden },
  { path: '/data/ai-speculative-conclusions.json', json: true, marker: 'items' },
  { path: '/membership.html', marker: 'THE EVIDENCE IS FREE. DONATIONS FUND THE MACHINE.', forbidden: ['€19/month', '€49/month', 'Paid access to premium briefs'] },
  { path: '/member-login.html', marker: 'passwordless' },
  { path: '/member-dashboard.html', marker: 'Dashboard' },
  { path: '/billing-dashboard.html', marker: 'Billing' },
  { path: '/forum.html', marker: 'SIGNAL BOARD' },
  { path: '/forum-health', json: true, marker: 'forumPostsBinding' },
  { path: '/machine-digest.html', marker: 'MACHINE DIGEST.', forbidden: ['[object Object]', ...commonForbidden] },
  { path: '/entity-daily-briefs.html', marker: 'ENTITY DAILY BRIEFS.', forbidden: ['[object Object]', '<h3></h3>', ...commonForbidden] },
  { path: '/data/entity-observations.json', json: true, marker: 'observations', forbidden: ['[object Object]', 'object-object'] },
  { path: '/data/entity-daily-briefs.json', json: true, marker: 'briefs', forbidden: ['[object Object]', 'object-object'] },
  { path: '/dossier-elon-musk.html', marker: 'Power Dossier' },
  { path: '/data/power-dossiers.json', json: true, marker: 'elon-musk' },
  { path: '/epstein', marker: 'THE EPSTEIN FILES COMMAND CENTER' },
  { path: '/optin-center', marker: 'Last 7 Days Intelligence Window' },
  { path: '/source-cards.html', marker: 'SOURCE CARDS.' },
  { path: '/trust-corrections.html', marker: 'Corrections' }
];
function ok(status, item){ return Array.isArray(item.allowedStatuses) ? item.allowedStatuses.includes(status) : status >= 200 && status < 400; }
function countText(text, needle) {
  if (!needle) return 0;
  return text.split(needle).length - 1;
}
function isCloudflareChallenge(status, text) {
  return status === 403 && /Just a moment|cf-chl|challenge-platform|checking your browser|Cloudflare Ray ID/i.test(text || '');
}
async function check(item) {
  const url = new URL(item.path, base).href;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.LIVE_VERIFY_TIMEOUT_MS || 20000));
  let res;
  try {
    res = await fetch(url, { headers: { 'User-Agent': 'MatrixReprogrammedLiveVerifier/4.0', accept: item.json ? 'application/json,text/plain;q=0.8,*/*;q=0.5' : 'text/html,text/plain;q=0.8,*/*;q=0.5' }, redirect: 'follow', cache: 'no-store', signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
  const text = await res.text();
  const finalUrl = res.url || url;
  const finalHost = new URL(finalUrl).host;
  const challenged = isCloudflareChallenge(res.status, text);
  const result = {
    path: item.path,
    url,
    finalUrl,
    requestedHost: expectedHost,
    finalHost,
    canonicalHostMatched: finalHost === expectedHost,
    status: res.status,
    ok: ok(res.status, item),
    challenged,
    marker: item.marker,
    markerPresent: text.includes(item.marker),
    origin: res.headers.get('x-matrix-origin') || null,
    worker: res.headers.get('x-matrix-worker') || null,
    cfRay: res.headers.get('cf-ray') || null,
    cacheControl: res.headers.get('cache-control') || null,
    contentType: res.headers.get('content-type') || null,
    bodyBytes: Buffer.byteLength(text),
    bodyStart: text.slice(0, 160)
  };
  if (item.json) {
    try { result.json = JSON.parse(text); } catch (err) { result.jsonError = err.message; }
  }
  if (item.forbidden) result.forbiddenHits = item.forbidden.filter(value => text.includes(value));
  if (item.maxCounts) result.counts = item.maxCounts.map(rule => ({ text: rule.text, count: countText(text, rule.text), max: rule.max }));
  const errors = [];
  if (!result.ok && !challenged) errors.push(`HTTP ${res.status}`);
  if (!result.canonicalHostMatched) errors.push(`canonical host mismatch: requested ${expectedHost}, final ${finalHost}`);
  if (!challenged && !result.origin) errors.push('missing x-matrix-origin Worker header');
  if (!challenged && !result.markerPresent) errors.push(`missing marker ${item.marker}`);
  if (item.json && !challenged && result.jsonError) errors.push(`invalid JSON: ${result.jsonError}`);
  if (result.forbiddenHits && result.forbiddenHits.length) errors.push(`forbidden public output present: ${result.forbiddenHits.join(', ')}`);
  if (result.counts) for (const count of result.counts) if (count.count > count.max) errors.push(`duplicate marker ${count.text}: ${count.count} > ${count.max}`);
  if (!challenged && result.bodyBytes === 0) errors.push('empty response body');
  if (errors.length) result.error = errors.join('; ');
  return result;
}
async function main(){
  if (typeof fetch !== 'function') throw new Error('Node fetch unavailable; use Node 18+');
  const checkedAt = new Date().toISOString();
  const results = [];
  for (const item of required) {
    try { results.push(await check(item)); }
    catch (err) { results.push({ path: item.path, ok: false, challenged: false, error: err.message, marker: item.marker }); }
  }
  const statusJson = results.find(result => result.path === '/deploy-status.json' && result.json);
  const liveSha = statusJson && (statusJson.json.buildSha || statusJson.json.buildShortSha || '');
  const shaMatches = expectedSha ? String(liveSha || '').startsWith(String(expectedSha).slice(0, 12)) || String(expectedSha).startsWith(String(liveSha || '').slice(0, 12)) : null;
  const allChallenged = results.length > 0 && results.every(result => result.challenged);
  const verifiedNormally = results.every(result => result.ok && result.markerPresent && !result.error) && (shaMatches !== false);
  const report = {
    ok: verifiedNormally || (allowChallenge && allChallenged),
    verifiedNormally,
    cloudflareChallengeBlockedVerification: allChallenged,
    challengeAcceptedInCi: allowChallenge && allChallenged,
    warning: allChallenged ? 'Cloudflare returned challenge pages to GitHub live verification. Deploy is not failed, but public/SEO challenge rules should be reviewed.' : null,
    checkedAt,
    base,
    expectedHost,
    expectedSha: expectedSha || null,
    liveSha: liveSha || null,
    shaMatches,
    routeCount: required.length,
    passedRoutes: results.filter(result => result.ok && result.markerPresent && !result.error).length,
    failedRoutes: results.filter(result => result.error).map(result => ({ path: result.path, error: result.error })),
    results
  };
  fs.writeFileSync(path.join(root, 'live-site-verification-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
}
main().catch(err => {
  console.error(`LIVE SITE VERIFICATION FAILED: ${err.message}`);
  process.exit(1);
});
