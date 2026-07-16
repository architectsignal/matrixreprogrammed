const fs = require('fs');
const path = require('path');

const root = process.cwd();
const base = process.env.SITE_URL || 'https://matrixreprogrammed.com';
const expectedHost = new URL(base).host;
const expectedSha = process.env.EXPECTED_BUILD_SHA || process.env.CF_PAGES_COMMIT_SHA || process.env.CF_COMMIT_SHA || process.env.GITHUB_SHA || '';
const allowChallenge = String(process.env.ALLOW_CLOUDFLARE_CHALLENGE_IN_CI || 'true').toLowerCase() !== 'false';
const commonForbidden = ['preservedaftervisible-de-duplication', 'new-intelligence-toolspreserved', '€19/month', '€49/month'];
const required = [
  { path: '/', markers: ['FOLLOW THE FILES.', 'READ THE SIGNALS.'], forbidden: [...commonForbidden, 'rogue broadcast node inside the simulation'], maxCounts: [{ text: 'Open Source Trail', max: 1 }] },
  { path: '/start-here.html', markers: ['START HERE.', 'CHOOSE YOUR DOOR.'], forbidden: commonForbidden },
  { path: '/deploy-status', markers: ['DEPLOY STATUS.'], requireOrigin: true },
  { path: '/deploy-status.json', json: true, markers: ['aliases'], requireOrigin: true },
  { path: '/search', markers: ['SEARCH THE SIGNAL.'] },
  { path: '/search-index.json', json: true, markers: ['url'], forbidden: ['object-object'] },
  { path: '/live-intel.html', markers: ['LIVE INTEL'] },
  { path: '/books.html', markers: ['BOOK'] },
  { path: '/download-center.html', markers: ['DOWNLOAD CENTER.'], mustInclude: ['downloads/forum-posts.json'], forbidden: [...commonForbidden, 'href=""', "href=''"] },
  { path: '/geographic-power-atlas.html', markers: ['GEOGRAPHIC POWER ATLAS.'], mustInclude: ['geographic-power-atlas.js'], forbidden: ['maplibre-gl@6.0.0-20', ...commonForbidden] },
  { path: '/geographic-power-atlas.js', markers: ['mapModule.default || mapModule'], mustInclude: ['fetchAtlasData', 'loadMapLibraries', 'Interactive map unavailable'], forbidden: ['import * as maplibregl', 'maplibre-gl@6.0.0-20'] },
  { path: '/data/geographic-power-atlas.json', json: true, markers: ['locations'] },
  { path: '/data/geographic-power-atlas-data.json', json: true, markers: ['FeatureCollection'] },
  { path: '/evidence-network-map.html', markers: ['PUBLIC EVIDENCE NETWORK.', 'EVIDENCE NETWORK MAP'], mustInclude: ['evidence-network-map.js'] },
  { path: '/data/evidence-network-map.json', json: true, markers: ['elements'] },
  { path: '/evidence-timeline.html', markers: ['EVIDENCE TIMELINE'], mustInclude: ['evidence-timeline.js'] },
  { path: '/data/evidence-timeline.json', json: true, markers: ['events'] },
  { path: '/data-lab.html', markers: ['PUBLIC DATA LAB'], mustInclude: ['data-lab.js'] },
  { path: '/data/public-data-lab.json', json: true, markers: ['datasets'] },
  { path: '/research-tools.html', markers: ['RESEARCH TOOLS'], mustInclude: ['research-tools.js'] },
  { path: '/timers.html', markers: ['MISSION TIMERS.'] },
  { path: '/data/global-risk-clocks.json', json: true, markers: ['clocks'] },
  { path: '/ai-speculative-conclusions.html', markers: ['HYPOTHESES.'], mustInclude: ['ai-speculative-conclusions.js'], forbidden: commonForbidden },
  { path: '/data/ai-speculative-conclusions.json', json: true, markers: ['items'] },
  { path: '/membership.html', markers: ['THE EVIDENCE IS FREE. DONATIONS FUND THE MACHINE.'], mustInclude: ['same underlying public-source evidence'], forbidden: ['€19/month', '€49/month', 'Paid access to premium briefs'] },
  { path: '/member-login.html', markers: ['SIGN IN WITHOUT A PASSWORD.', 'passwordless'], mustInclude: ['/api/auth/request-link'] },
  { path: '/member-dashboard.html', markers: ['Member Dashboard', 'MEMBER DASHBOARD'], mustInclude: ['member-dashboard-app.js'] },
  { path: '/billing-dashboard.html', markers: ['Billing', 'BILLING'], mustInclude: ['billing-dashboard.js'] },
  { path: '/forum.html', markers: ['SIGNAL BOARD'], mustInclude: ['forum.js'] },
  { path: '/forum-health', json: true, markers: ['forumPostsBinding'], requireOrigin: true },
  { path: '/machine-digest.html', markers: ['MACHINE DIGEST.'], forbidden: ['[object Object]', ...commonForbidden] },
  { path: '/entity-daily-briefs.html', markers: ['ENTITY DAILY BRIEFS.'], forbidden: ['[object Object]', '<h3></h3>', ...commonForbidden] },
  { path: '/entity-exposure-index.html', markers: ['ENTITY EXPOSURE'], forbidden: ['[object Object]', 'object-object', '<h3></h3>', ...commonForbidden] },
  { path: '/data/entity-observations.json', json: true, markers: ['observations'], forbidden: ['[object Object]', 'object-object'] },
  { path: '/data/entity-daily-briefs.json', json: true, markers: ['briefs'], forbidden: ['[object Object]', 'object-object'] },
  { path: '/data/entity-exposure-index.json', json: true, markers: ['entities', 'profiles'], forbidden: ['[object Object]', 'object-object'] },
  { path: '/entity-exposure/object-object.html', allowedStatuses: [404, 410], markers: [], forbidden: ['[object Object]'] },
  { path: '/dossier-elon-musk.html', markers: ['Power Dossier'], mustInclude: ['data/power-dossiers.json', 'power-dossier-runtime.js'] },
  { path: '/power-dossier-runtime.js', markers: ['DOSSIER TEMPORARILY UNAVAILABLE'], mustInclude: ["fetch('data/power-dossiers.json'"] },
  { path: '/data/power-dossiers.json', json: true, markers: ['elon-musk'] },
  { path: '/epstein', markers: ['THE EPSTEIN FILES COMMAND CENTER'] },
  { path: '/optin-center', markers: ['Last 7 Days Intelligence Window'] },
  { path: '/source-cards.html', markers: ['SOURCE CARDS.'] },
  { path: '/trust-corrections.html', markers: ['Corrections'] }
];
function ok(status, item) { return Array.isArray(item.allowedStatuses) ? item.allowedStatuses.includes(status) : status >= 200 && status < 400; }
function countText(text, needle) { return needle ? text.split(needle).length - 1 : 0; }
function contains(text, marker) { return String(text || '').toLowerCase().includes(String(marker || '').toLowerCase()); }
function isCloudflareChallenge(status, text) { return status === 403 && /Just a moment|cf-chl|challenge-platform|checking your browser|Cloudflare Ray ID/i.test(text || ''); }
async function check(item) {
  const url = new URL(item.path, base).href;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.LIVE_VERIFY_TIMEOUT_MS || 20000));
  let res;
  try {
    res = await fetch(url, { headers: { 'User-Agent': 'MatrixReprogrammedLiveVerifier/4.3', accept: item.json ? 'application/json,text/plain;q=0.8,*/*;q=0.5' : 'text/html,text/plain;q=0.8,*/*;q=0.5' }, redirect: 'follow', cache: 'no-store', signal: controller.signal });
  } finally { clearTimeout(timeout); }
  const text = await res.text();
  const finalUrl = res.url || url;
  const finalHost = new URL(finalUrl).host;
  const challenged = isCloudflareChallenge(res.status, text);
  const markers = Array.isArray(item.markers) ? item.markers : item.marker ? [item.marker] : [];
  const markerPresent = !markers.length || markers.some(marker => contains(text, marker));
  const mustIncludeMissing = (item.mustInclude || []).filter(marker => !contains(text, marker));
  const result = {
    path: item.path, url, finalUrl, requestedHost: expectedHost, finalHost,
    canonicalHostMatched: finalHost === expectedHost,
    status: res.status, ok: ok(res.status, item), challenged,
    markers, markerPresent, mustIncludeMissing,
    origin: res.headers.get('x-matrix-origin') || null,
    worker: res.headers.get('x-matrix-worker') || null,
    cfRay: res.headers.get('cf-ray') || null,
    cacheControl: res.headers.get('cache-control') || null,
    contentType: res.headers.get('content-type') || null,
    bodyBytes: Buffer.byteLength(text), bodyStart: text.slice(0, 160)
  };
  if (item.json) { try { result.json = JSON.parse(text); } catch (err) { result.jsonError = err.message; } }
  if (item.forbidden) result.forbiddenHits = item.forbidden.filter(value => contains(text, value));
  if (item.maxCounts) result.counts = item.maxCounts.map(rule => ({ text: rule.text, count: countText(text, rule.text), max: rule.max }));
  const errors = [];
  const warnings = [];
  if (!result.ok && !challenged) errors.push(`HTTP ${res.status}`);
  if (!result.canonicalHostMatched) errors.push(`canonical host mismatch: requested ${expectedHost}, final ${finalHost}`);
  if (!challenged && item.requireOrigin && !result.origin) errors.push('missing x-matrix-origin Worker header');
  else if (!challenged && !result.origin) warnings.push('x-matrix-origin header not present on this static route');
  if (!challenged && !result.markerPresent) errors.push(`missing one of expected markers: ${markers.join(' | ')}`);
  if (!challenged && mustIncludeMissing.length) errors.push(`missing required content: ${mustIncludeMissing.join(', ')}`);
  if (item.json && !challenged && result.jsonError) errors.push(`invalid JSON: ${result.jsonError}`);
  if (result.forbiddenHits && result.forbiddenHits.length) errors.push(`forbidden public output present: ${result.forbiddenHits.join(', ')}`);
  if (result.counts) for (const count of result.counts) if (count.count > count.max) errors.push(`duplicate marker ${count.text}: ${count.count} > ${count.max}`);
  if (!challenged && result.bodyBytes === 0 && !Array.isArray(item.allowedStatuses)) errors.push('empty response body');
  if (errors.length) result.error = errors.join('; ');
  if (warnings.length) result.warnings = warnings;
  return result;
}
async function main() {
  if (typeof fetch !== 'function') throw new Error('Node fetch unavailable; use Node 18+');
  const checkedAt = new Date().toISOString();
  const results = [];
  for (const item of required) {
    try { results.push(await check(item)); }
    catch (err) { results.push({ path: item.path, ok: false, challenged: false, error: err.message, markers: item.markers || [] }); }
  }
  const statusJson = results.find(result => result.path === '/deploy-status.json' && result.json);
  const liveSha = statusJson && (statusJson.json.buildSha || statusJson.json.buildShortSha || '');
  const shaMatches = expectedSha ? String(liveSha || '').startsWith(String(expectedSha).slice(0, 12)) || String(expectedSha).startsWith(String(liveSha || '').slice(0, 12)) : null;
  const allChallenged = results.length > 0 && results.every(result => result.challenged);
  const verifiedNormally = results.every(result => result.ok && result.markerPresent && !result.error) && shaMatches !== false;
  const report = {
    ok: verifiedNormally || (allowChallenge && allChallenged), verifiedNormally,
    cloudflareChallengeBlockedVerification: allChallenged,
    challengeAcceptedInCi: allowChallenge && allChallenged,
    warning: allChallenged ? 'Cloudflare returned challenge pages to live verification. Deployment is not marked failed, but public challenge rules should be reviewed.' : null,
    checkedAt, base, expectedHost, expectedSha: expectedSha || null, liveSha: liveSha || null, shaMatches,
    routeCount: required.length,
    passedRoutes: results.filter(result => result.ok && result.markerPresent && !result.error).length,
    failedRoutes: results.filter(result => result.error).map(result => ({ path: result.path, error: result.error })),
    warningRoutes: results.filter(result => result.warnings).map(result => ({ path: result.path, warnings: result.warnings })),
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
