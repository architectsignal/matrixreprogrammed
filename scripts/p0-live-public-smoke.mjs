import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const siteUrl = String(process.env.SITE_URL || 'https://matrixreprogrammed.com').replace(/\/$/, '');
const fallbackSiteUrl = String(process.env.SITE_FALLBACK_URL || '').replace(/\/$/, '');
const expectedSha = String(process.env.EXPECTED_LIVE_SHA || '').trim().toLowerCase();
const repository = String(process.env.GITHUB_REPOSITORY || 'architectsignal/matrixreprogrammed');
const attempts = Math.max(1, Number(process.env.P0_SMOKE_ATTEMPTS || 36));
const delayMs = Math.max(0, Number(process.env.P0_SMOKE_DELAY_MS || 10000));
const reportPath = path.join(root, 'downloads', 'p0-live-public-smoke.json');
const transportFallbacks = [];
const dockStyleMarker = 'data-matrix-access-dock-asset="style"';
const dockScriptMarker = 'data-matrix-access-dock-asset="script"';

const forbiddenResidue = [
  'compatibility-marker-vault',
  'public-copy-internal-vault',
  'compatibility-routes-preserved-with-clean-public-copy',
  'preservedaftervisiblede-duplication',
  'downloads/forum-posts.json',
  'downloads/forum-posts.md',
  ' reader field='
];

const pageChecks = [
  { route: '/', markers: ['POWER SHOULD HAVE'] },
  { route: '/search', markers: ['START WITH WHAT HAPPENED.', 'archive-search'] },
  { route: '/member-login', markers: ['SIGN IN WITHOUT A PASSWORD.', 'login-form', 'login-email'] },
  { route: '/forum', markers: ['SIGNAL BOARD', 'forum-member-status', 'Create Free Account'] },
  { route: '/newsletter', markers: ['GET THE WEEKLY FILE.', 'newsletter-form', 'data-marketing-consent'] },
  { route: '/evidence-vault', markers: ['SOURCES BEFORE SIGNALS.', 'Evidence Ratings'] },
  { route: '/live-intel', markers: ['LIVE INTEL'] }
];

const aliasPairs = [
  ['/start-here.html', '/start-here'],
  ['/search.html', '/search'],
  ['/member-login.html', '/member-login'],
  ['/forum.html', '/forum'],
  ['/newsletter.html', '/newsletter'],
  ['/evidence-vault.html', '/evidence-vault'],
  ['/follow-the-money.html', '/follow-the-money'],
  ['/making-money.html', '/making-money'],
  ['/subject-briefs.html', '/subject-briefs'],
  ['/entity-timelines.html', '/entity-timelines']
];

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const parseJson = text => { try { return JSON.parse(text); } catch { return null; } };
const countText = (text, marker) => String(text || '').split(marker).length - 1;

async function fetchLive(route, options = {}) {
  const separator = route.includes('?') ? '&' : '?';
  const request = async base => {
    const response = await fetch(`${base}${route}${separator}p0_smoke=${Date.now()}-${Math.random().toString(36).slice(2)}`, {
      redirect: 'follow',
      cache: 'no-store',
      ...options,
      headers: {
        'cache-control': 'no-cache',
        pragma: 'no-cache',
        'user-agent': 'MatrixP0LiveSmoke/1.0',
        ...(options.headers || {})
      }
    });
    return {
      route,
      base,
      status: response.status,
      ok: response.ok,
      url: response.url,
      headers: Object.fromEntries(response.headers.entries()),
      text: await response.text()
    };
  };
  const primary = await request(siteUrl);
  const challenge = primary.status === 403
    && (primary.headers['cf-mitigated'] === 'challenge'
      || (/<title>Just a moment\.\.\.<\/title>/i.test(primary.text) && /cloudflare/i.test(primary.text)));
  if (challenge && fallbackSiteUrl && fallbackSiteUrl !== siteUrl) {
    const fallback = await request(fallbackSiteUrl);
    transportFallbacks.push({ route, reason: 'known-cloudflare-challenge', primaryStatus: primary.status, fallbackStatus: fallback.status });
    return fallback;
  }
  return primary;
}

function residueIn(text = '') {
  return forbiddenResidue.filter(token => String(text).includes(token));
}

function normalizeCloudflareHtml(text = '') {
  return String(text).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, block => {
    const injected = /\/cdn-cgi\/challenge-platform\/scripts\/jsd\//i.test(block)
      && /(?:window\._cf_chl_opt|\(function\(\)\{function\s+[a-z]\(\))/i.test(block);
    return injected ? '' : block;
  }).trim();
}

async function verifyGitAncestry(liveSha) {
  if (!/^[a-f0-9]{40}$/.test(liveSha)) return { ok: false, error: 'live manifest SHA is not a full Git commit' };
  const headers = {
    accept: 'application/vnd.github+json',
    'user-agent': 'MatrixP0LiveSmoke/1.0'
  };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const response = await fetch(`https://api.github.com/repos/${repository}/compare/${liveSha}...main`, { headers });
  const payload = await response.json().catch(() => ({}));
  const status = String(payload.status || '');
  return {
    ok: response.ok && ['identical', 'ahead'].includes(status),
    httpStatus: response.status,
    comparisonStatus: status,
    aheadBy: Number(payload.ahead_by || 0),
    behindBy: Number(payload.behind_by || 0),
    error: response.ok ? null : String(payload.message || `GitHub HTTP ${response.status}`)
  };
}

async function verifyOnce() {
  const failures = [];
  const manifestResponse = await fetchLive('/deploy-manifest.json');
  const healthResponse = await fetchLive('/deploy-health.json');
  const manifest = parseJson(manifestResponse.text);
  const health = parseJson(healthResponse.text);
  const liveSha = String(manifest?.commitSha || '').toLowerCase();

  const manifestOk = manifestResponse.ok && /^[a-f0-9]{40}$/.test(liveSha);
  if (!manifestOk) failures.push('live deploy manifest is missing or not commit-bound');
  const healthOk = healthResponse.ok
    && health?.ok === true
    && health?.buildSha === liveSha
    && health?.manifestSha === liveSha
    && health?.manifestMatches === true;
  if (!healthOk) failures.push('live production health does not agree with the manifest SHA');
  if (expectedSha && liveSha !== expectedSha) failures.push(`live SHA ${liveSha || 'missing'} does not match expected ${expectedSha}`);

  const ancestry = manifestOk ? await verifyGitAncestry(liveSha) : { ok: false, error: 'manifest not ready' };
  if (!ancestry.ok) failures.push(`live SHA is not a verified ancestor of current main: ${ancestry.error || ancestry.comparisonStatus}`);

  const pages = [];
  for (const spec of pageChecks) {
    const response = await fetchLive(spec.route);
    const missingMarkers = spec.markers.filter(marker => !response.text.includes(marker));
    const residue = residueIn(response.text);
    const dockStyleCount = countText(response.text, dockStyleMarker);
    const dockScriptCount = countText(response.text, dockScriptMarker);
    const dockOk = dockStyleCount === 1 && dockScriptCount === 1;
    const ok = response.ok && missingMarkers.length === 0 && residue.length === 0 && dockOk;
    if (!ok) failures.push(`${spec.route} failed: HTTP ${response.status}; missing ${missingMarkers.join(', ') || 'none'}; residue ${residue.join(', ') || 'none'}; dock ${dockStyleCount}/${dockScriptCount}`);
    pages.push({ route: spec.route, status: response.status, ok, missingMarkers, residue, dockStyleCount, dockScriptCount, dockOk });
  }
  const [dockScriptResponse, dockStyleResponse] = await Promise.all([
    fetchLive('/matrix-access-dock.js'),
    fetchLive('/matrix-access-dock.css')
  ]);
  const accessDock = {
    ok: dockScriptResponse.ok
      && dockStyleResponse.ok
      && dockScriptResponse.text.includes('/member-login.html')
      && dockScriptResponse.text.includes('/newsletter.html#newsletter-form')
      && dockScriptResponse.text.includes('matrix-access-dock'),
    scriptStatus: dockScriptResponse.status,
    styleStatus: dockStyleResponse.status,
    loginRoute: dockScriptResponse.text.includes('/member-login.html'),
    subscribeRoute: dockScriptResponse.text.includes('/newsletter.html#newsletter-form')
  };
  if (!accessDock.ok) failures.push('global access dock assets or Login/Subscribe routes are incomplete');

  const searchResponse = await fetchLive('/search-index.json');
  const searchIndex = parseJson(searchResponse.text);
  const searchResidue = residueIn(searchResponse.text);
  const retiredSearchUrls = Array.isArray(searchIndex)
    ? searchIndex.filter(item => ['/downloads/forum-posts.json', '/downloads/forum-posts.md', 'downloads/forum-posts.json', 'downloads/forum-posts.md'].includes(String(item?.url || ''))).map(item => item.url)
    : [];
  const forumSearchRoutes = Array.isArray(searchIndex) ? searchIndex.filter(item => item?.url === 'forum.html').length : 0;
  const searchOk = searchResponse.ok && Array.isArray(searchIndex) && searchIndex.length > 0 && searchResidue.length === 0 && retiredSearchUrls.length === 0 && forumSearchRoutes === 1;
  if (!searchOk) failures.push(`search corpus failed: residue=${searchResidue.join(', ') || 'none'}, retired=${retiredSearchUrls.length}, forumRoutes=${forumSearchRoutes}`);

  const semanticResponse = await fetchLive('/search-semantic-index.json');
  const semantic = parseJson(semanticResponse.text);
  const semanticOk = semanticResponse.ok && Number(semantic?.count) === Number(searchIndex?.length || 0);
  if (!semanticOk) failures.push(`semantic search count ${semantic?.count ?? 'missing'} does not match route count ${searchIndex?.length ?? 'missing'}`);

  const aliases = [];
  for (const [htmlRoute, extensionlessRoute] of aliasPairs) {
    const [html, extensionless] = await Promise.all([fetchLive(htmlRoute), fetchLive(extensionlessRoute)]);
    const htmlResidue = residueIn(html.text);
    const extensionlessResidue = residueIn(extensionless.text);
    const normalizedHtml = normalizeCloudflareHtml(html.text);
    const normalizedExtensionless = normalizeCloudflareHtml(extensionless.text);
    const ok = html.ok
      && extensionless.ok
      && normalizedHtml === normalizedExtensionless
      && htmlResidue.length === 0
      && extensionlessResidue.length === 0;
    if (!ok) failures.push(`route alias mismatch: ${htmlRoute} <> ${extensionlessRoute}`);
    aliases.push({
      htmlRoute, extensionlessRoute, htmlStatus: html.status, extensionlessStatus: extensionless.status,
      bytes: html.text.length, identical: normalizedHtml === normalizedExtensionless,
      cloudflareInjectionStripped: normalizedHtml !== html.text.trim() || normalizedExtensionless !== extensionless.text.trim(),
      htmlResidue, extensionlessResidue, ok
    });
  }

  const protectedArtworkRoutes = await Promise.all([
    fetchLive('/card-artwork-batches.html'),
    fetchLive('/card-artwork-batches')
  ]);
  const protectedArtworkOk = protectedArtworkRoutes.every(result => {
    const payload = parseJson(result.text);
    return result.status === 401
      && result.headers['x-matrix-origin'] === 'cloudflare-worker-membership-asset-gate'
      && payload?.authenticated === false
      && payload?.requiredTier === 'admin';
  });
  if (!protectedArtworkOk) failures.push('card artwork control routes are not consistently admin-protected');

  const authHealthResponse = await fetchLive('/api/auth/health');
  const authHealth = parseJson(authHealthResponse.text);
  const authHealthOk = authHealthResponse.ok
    && authHealthResponse.headers['x-matrix-origin'] === 'cloudflare-worker-api'
    && authHealth?.ok === true
    && authHealth?.d1Connected === true
    && authHealth?.authSchemaReady === true
    && authHealth?.transactionalEmailConfigured === true;
  if (!authHealthOk) failures.push('passwordless authentication health is not fully ready');

  const invalidLoginResponse = await fetchLive('/api/auth/request-link', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'not-an-email' })
  });
  const invalidLogin = parseJson(invalidLoginResponse.text);
  const loginBoundaryOk = invalidLoginResponse.status === 400
    && invalidLoginResponse.headers['x-matrix-origin'] === 'cloudflare-worker-api'
    && invalidLogin?.ok === false
    && /valid email/i.test(String(invalidLogin?.error || ''));
  if (!loginBoundaryOk) failures.push('passwordless login validation did not fail closed without mutation');

  const newsletterHealthResponse = await fetchLive('/newsletter-health');
  const newsletterHealth = parseJson(newsletterHealthResponse.text);
  const newsletterHealthOk = newsletterHealthResponse.ok
    && newsletterHealthResponse.headers['x-matrix-origin'] === 'cloudflare-worker-api'
    && newsletterHealth?.ok === true
    && newsletterHealth?.configured === true
    && newsletterHealth?.d1Connected === true
    && newsletterHealth?.d1SchemaReady === true
    && String(newsletterHealth?.storage || '').includes('D1');
  if (!newsletterHealthOk) failures.push('newsletter/membership health is not D1-ready');

  const noConsentResponse = await fetchLive('/api/membership/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: `p0-smoke-${Date.now()}@example.invalid`,
      name: 'P0 non-mutating consent test',
      marketingConsent: false
    })
  });
  const noConsent = parseJson(noConsentResponse.text);
  const consentBoundaryOk = noConsentResponse.status === 400
    && noConsentResponse.headers['x-matrix-origin'] === 'cloudflare-worker-email-lifecycle'
    && noConsent?.ok === false
    && noConsent?.saved !== true
    && noConsent?.persistent !== true
    && /consent/i.test(String(noConsent?.error || ''));
  if (!consentBoundaryOk) failures.push('newsletter explicit-consent gate did not fail closed without mutation');

  const forumHealthResponse = await fetchLive('/forum-health');
  const forumHealth = parseJson(forumHealthResponse.text);
  const forumHealthOk = forumHealthResponse.ok
    && forumHealthResponse.headers['x-matrix-origin'] === 'cloudflare-worker-forum-d1'
    && forumHealth?.persistent === true
    && forumHealth?.d1Connected === true
    && forumHealth?.backend === 'src/worker-forum-persistence.js';
  if (!forumHealthOk) failures.push('Signal Board D1 health is not authoritative');

  const forumFeedResponse = await fetchLive('/forum-feed-main');
  const forumFeed = parseJson(forumFeedResponse.text);
  const forumReadOk = forumFeedResponse.ok
    && forumFeedResponse.headers['x-matrix-origin'] === 'cloudflare-worker-forum-d1'
    && forumFeed?.ok === true
    && forumFeed?.persistent === true
    && forumFeed?.board === 'main'
    && Array.isArray(forumFeed?.posts);
  if (!forumReadOk) failures.push('public Signal Board reading is not available from D1');

  const anonymousPostResponse = await fetchLive('/submit-main-post', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: 'P0 anonymous write boundary',
      message: 'This request must be rejected before any D1 insert.',
      category: 'health check'
    })
  });
  const anonymousPost = parseJson(anonymousPostResponse.text);
  const forumWriteBoundaryOk = anonymousPostResponse.status === 401
    && anonymousPostResponse.headers['x-matrix-origin'] === 'cloudflare-worker-forum-d1'
    && anonymousPost?.ok === false
    && anonymousPost?.saved === false
    && anonymousPost?.authenticated === false;
  if (!forumWriteBoundaryOk) failures.push('anonymous Signal Board posting did not fail closed');

  return {
    ok: failures.length === 0,
    checkedAt: new Date().toISOString(),
    siteUrl,
    fallbackSiteUrl: fallbackSiteUrl || null,
    transportFallbacks,
    expectedSha: expectedSha || null,
    liveSha,
    manifest: { status: manifestResponse.status, ok: manifestOk, payload: manifest },
    health: { status: healthResponse.status, ok: healthOk, payload: health },
    ancestry,
    pages,
    accessDock,
    search: { status: searchResponse.status, ok: searchOk, records: Array.isArray(searchIndex) ? searchIndex.length : 0, residue: searchResidue, retiredSearchUrls, forumSearchRoutes, semanticStatus: semanticResponse.status, semanticRecords: Number(semantic?.count || 0), semanticOk },
    aliases,
    protectedRoutes: protectedArtworkRoutes.map(result => ({
      route: result.route,
      status: result.status,
      origin: result.headers['x-matrix-origin'] || null,
      requiredTier: parseJson(result.text)?.requiredTier || null,
      ok: result.status === 401
    })),
    authentication: { healthStatus: authHealthResponse.status, health: authHealth, healthOk: authHealthOk, invalidRequestStatus: invalidLoginResponse.status, invalidRequest: invalidLogin, invalidRequestOk: loginBoundaryOk },
    newsletter: { healthStatus: newsletterHealthResponse.status, health: newsletterHealth, healthOk: newsletterHealthOk, noConsentStatus: noConsentResponse.status, noConsent, consentBoundaryOk },
    forum: { healthStatus: forumHealthResponse.status, health: forumHealth, healthOk: forumHealthOk, feedStatus: forumFeedResponse.status, feedCount: Number(forumFeed?.count || 0), readOk: forumReadOk, anonymousPostStatus: anonymousPostResponse.status, anonymousPost, writeBoundaryOk: forumWriteBoundaryOk },
    forbiddenResidue,
    failures
  };
}

let finalResult = null;
for (let attempt = 1; attempt <= attempts; attempt += 1) {
  try {
    finalResult = await verifyOnce();
  } catch (error) {
    finalResult = {
      ok: false,
      checkedAt: new Date().toISOString(),
      siteUrl,
      fallbackSiteUrl: fallbackSiteUrl || null,
      transportFallbacks,
      expectedSha: expectedSha || null,
      failures: [String(error?.stack || error?.message || error)]
    };
  }
  finalResult.attempt = attempt;
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(finalResult, null, 2)}\n`);
  if (finalResult.ok) {
    console.log(`P0 LIVE PUBLIC SMOKE PASSED at ${String(finalResult.liveSha).slice(0, 12)} on attempt ${attempt}: exact SHA, primary journeys, D1 boundaries, clean search and canonical route aliases verified.`);
    process.exit(0);
  }
  console.log(`P0 live public smoke not ready (${attempt}/${attempts}): ${(finalResult.failures || []).slice(0, 3).join(' | ')}`);
  if (attempt < attempts) await sleep(delayMs);
}

console.error(JSON.stringify(finalResult, null, 2));
process.exit(1);
