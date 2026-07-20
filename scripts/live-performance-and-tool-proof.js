const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

const root = process.cwd();
const siteUrl = String(process.env.SITE_URL || 'https://matrixreprogrammed.com').replace(/\/$/, '');
const output = path.join(root, 'data', 'performance-production-proof.json');
const deployedSha = process.env.DEPLOYED_SHA || null;
const deploymentRunId = process.env.DEPLOY_RUN_ID || null;
const failures = [];
const checks = [];
const timings = [];

function pass(id, detail = '') { checks.push({ id, ok: true, detail }); }
function fail(id, detail = '') { checks.push({ id, ok: false, detail }); failures.push(`${id}: ${detail}`); }
function cacheSeconds(value) {
  const match = String(value || '').match(/(?:^|,)\s*max-age=(\d+)/i);
  return match ? Number(match[1]) : null;
}
function cacheIsFreshnessSafe(value) {
  const text = String(value || '').toLowerCase();
  return text.includes('no-store') || text.includes('no-cache') || text.includes('must-revalidate') || cacheSeconds(text) === 0;
}
function cacheWithin(value, seconds) {
  if (cacheIsFreshnessSafe(value)) return true;
  const age = cacheSeconds(value);
  return Number.isFinite(age) && age <= seconds;
}
function sameOriginUrl(reference, base = siteUrl) {
  try {
    const url = new URL(reference, base);
    return url.origin === new URL(siteUrl).origin ? url : null;
  } catch { return null; }
}

async function request(route, options = {}) {
  const url = sameOriginUrl(route);
  if (!url) throw new Error(`Invalid or external proof route: ${route}`);
  if (options.bust) url.searchParams.set('performance_proof', Date.now());
  const started = performance.now();
  const response = await fetch(url, {
    method: options.method || 'GET',
    redirect: 'follow',
    headers: {
      accept: options.accept || '*/*',
      'cache-control': options.requestNoCache ? 'no-cache' : 'max-age=0',
      pragma: options.requestNoCache ? 'no-cache' : '',
      'user-agent': 'MatrixProductionPerformanceVerifier/1.0'
    }
  });
  const headersAt = performance.now();
  let bytes = Buffer.alloc(0);
  if ((options.method || 'GET') !== 'HEAD') bytes = Buffer.from(await response.arrayBuffer());
  const completed = performance.now();
  const result = {
    route: `${url.pathname}${url.search}`,
    finalUrl: response.url,
    status: response.status,
    ok: response.ok,
    contentType: response.headers.get('content-type') || '',
    cacheControl: response.headers.get('cache-control') || '',
    contentLength: Number(response.headers.get('content-length') || bytes.length || 0),
    bytes: bytes.length,
    headersMs: Number((headersAt - started).toFixed(1)),
    totalMs: Number((completed - started).toFixed(1)),
    text: options.binary ? '' : bytes.toString('utf8')
  };
  timings.push({ route: url.pathname, status: result.status, headersMs: result.headersMs, totalMs: result.totalMs, bytes: result.bytes });
  return result;
}

function assetReference(html, filename) {
  const escaped = filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<script\\b[^>]*\\bsrc=["']([^"']*${escaped}[^"']*)["']`, 'i'),
    new RegExp(`<link\\b[^>]*\\bhref=["']([^"']*${escaped}[^"']*)["']`, 'i')
  ];
  for (const pattern of patterns) {
    const match = String(html || '').match(pattern);
    if (match) return match[1];
  }
  return '';
}
function isHashed(reference) { return /[?&]v=[0-9a-f]{12}(?:&|$)/i.test(String(reference || '')); }

async function verify() {
  const home = await request('/', { bust: true, accept: 'text/html', requestNoCache: true });
  home.ok ? pass('homepage-route', `${home.status} in ${home.totalMs}ms`) : fail('homepage-route', `HTTP ${home.status}`);
  cacheIsFreshnessSafe(home.cacheControl) ? pass('homepage-freshness-cache', home.cacheControl) : fail('homepage-freshness-cache', home.cacheControl || 'missing');

  const matrixRef = assetReference(home.text, 'matrix.js');
  const stylesRef = assetReference(home.text, 'styles.css');
  isHashed(matrixRef) ? pass('homepage-matrix-hash', matrixRef) : fail('homepage-matrix-hash', matrixRef || 'missing');
  isHashed(stylesRef) ? pass('homepage-styles-hash', stylesRef) : fail('homepage-styles-hash', stylesRef || 'missing');

  const matrixAsset = await request(matrixRef || '/matrix.js', { accept: 'application/javascript' });
  matrixAsset.ok && matrixAsset.text.includes('visibilitychange') && matrixAsset.text.includes('saveData')
    ? pass('adaptive-matrix-runtime', `${matrixAsset.bytes} bytes`) : fail('adaptive-matrix-runtime', `status ${matrixAsset.status}`);
  cacheWithin(matrixAsset.cacheControl, 86400) ? pass('javascript-cache-policy', matrixAsset.cacheControl) : fail('javascript-cache-policy', matrixAsset.cacheControl || 'missing');

  const search = await request('/search', { bust: true, accept: 'text/html', requestNoCache: true });
  const searchRef = assetReference(search.text, 'search.js');
  search.ok ? pass('search-route', `${search.status} in ${search.totalMs}ms`) : fail('search-route', `HTTP ${search.status}`);
  isHashed(searchRef) ? pass('search-runtime-hash', searchRef) : fail('search-runtime-hash', searchRef || 'missing');
  const searchAsset = await request(searchRef || '/search.js', { accept: 'application/javascript' });
  searchAsset.ok && searchAsset.text.includes('matrix-search-performance-v1') && searchAsset.text.includes('ensureFullIndex')
    ? pass('deferred-search-runtime', `${searchAsset.bytes} bytes`) : fail('deferred-search-runtime', `status ${searchAsset.status}`);

  const searchIndex = await request('/search-index.json', { method: 'HEAD', accept: 'application/json' });
  searchIndex.ok ? pass('search-index-route', `${searchIndex.status}; ${searchIndex.contentLength} bytes`) : fail('search-index-route', `HTTP ${searchIndex.status}`);
  cacheWithin(searchIndex.cacheControl, 600) ? pass('search-index-cache-policy', searchIndex.cacheControl) : fail('search-index-cache-policy', searchIndex.cacheControl || 'missing');

  const network = await request('/evidence-network-map', { bust: true, accept: 'text/html', requestNoCache: true });
  const networkRef = assetReference(network.text, 'evidence-network-map.js');
  network.ok ? pass('evidence-network-route', `${network.status} in ${network.totalMs}ms`) : fail('evidence-network-route', `HTTP ${network.status}`);
  isHashed(networkRef) ? pass('network-runtime-hash', networkRef) : fail('network-runtime-hash', networkRef || 'missing');
  const networkAsset = await request(networkRef || '/evidence-network-map.js', { accept: 'application/javascript' });
  networkAsset.ok && networkAsset.text.includes('matrix-network-performance-v1') && networkAsset.text.includes('IntersectionObserver')
    ? pass('deferred-network-runtime', `${networkAsset.bytes} bytes`) : fail('deferred-network-runtime', `status ${networkAsset.status}`);
  const graphData = await request('/data/evidence-network-map.json', { method: 'HEAD', accept: 'application/json' });
  graphData.ok ? pass('evidence-network-data', `${graphData.status}; ${graphData.contentLength} bytes`) : fail('evidence-network-data', `HTTP ${graphData.status}`);
  cacheWithin(graphData.cacheControl, 3600) ? pass('evidence-network-cache-policy', graphData.cacheControl) : fail('evidence-network-cache-policy', graphData.cacheControl || 'missing');

  const pulse = await request('/investigation-pulse.js', { accept: 'application/javascript' });
  pulse.ok && pulse.text.includes('sessionStorage') && pulse.text.includes('requestIdleCallback')
    ? pass('deferred-investigation-pulse', `${pulse.bytes} bytes`) : fail('deferred-investigation-pulse', `status ${pulse.status}`);

  const [follow, making, profile, topData, pdf, liveIntel] = await Promise.all([
    request('/follow-the-money', { bust: true, accept: 'text/html', requestNoCache: true }),
    request('/making-money', { bust: true, accept: 'text/html', requestNoCache: true }),
    request('/follow-the-money/people/elon-musk', { bust: true, accept: 'text/html', requestNoCache: true }),
    request('/data/follow-the-money-top-100.json', { bust: true, accept: 'application/json', requestNoCache: true }),
    request('/downloads/wealth-guides/start-from-zero.pdf', { binary: true, accept: 'application/pdf' }),
    request('/data/live-intel.json', { bust: true, accept: 'application/json', requestNoCache: true })
  ]);
  follow.ok && follow.text.includes("World's Top 100 Wealth Holders") ? pass('follow-the-money-live', `${follow.bytes} bytes`) : fail('follow-the-money-live', `HTTP ${follow.status}`);
  making.ok && making.text.includes('Starting From Zero') && making.text.includes('Future of Making Money') ? pass('making-money-live', `${making.bytes} bytes`) : fail('making-money-live', `HTTP ${making.status}`);
  profile.ok && profile.text.includes('Elon Musk') && profile.text.includes('Estimated net worth') ? pass('wealth-profile-live', `${profile.bytes} bytes`) : fail('wealth-profile-live', `HTTP ${profile.status}`);
  let peopleCount = 0;
  try { const parsed = JSON.parse(topData.text); peopleCount = Array.isArray(parsed.people) ? parsed.people.length : 0; } catch {}
  topData.ok && peopleCount === 100 ? pass('top-100-data-live', `${peopleCount} people`) : fail('top-100-data-live', `${peopleCount} people; HTTP ${topData.status}`);
  pdf.ok && pdf.bytes >= 500 && pdf.text === '' ? pass('wealth-guide-pdf-live', `${pdf.bytes} bytes`) : fail('wealth-guide-pdf-live', `HTTP ${pdf.status}; ${pdf.bytes} bytes`);
  cacheIsFreshnessSafe(liveIntel.cacheControl) ? pass('live-intel-freshness-cache', liveIntel.cacheControl) : fail('live-intel-freshness-cache', liveIntel.cacheControl || 'missing');

  for (const timing of timings) {
    if (timing.headersMs > 10000) fail(`response-time-${timing.route}`, `${timing.headersMs}ms to headers`);
  }

  return { peopleCount };
}

(async () => {
  let extra = {};
  try { extra = await verify(); }
  catch (error) { fail('verifier-execution', error.stack || error.message); }
  const result = {
    ok: failures.length === 0,
    checkedAt: new Date().toISOString(),
    siteUrl,
    deployedSha,
    deploymentRunId,
    checks,
    failures,
    timings,
    ...extra,
    boundary: 'This proof checks live caching, hashed assets, deferred heavy data, adaptive runtime markers and critical public tools. It does not convert network timing into a guarantee for every user or location.'
  };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
  if (!result.ok) {
    console.error(JSON.stringify(result, null, 2));
    process.exit(1);
  }
  console.log(`Production performance proof passed: ${checks.length} checks, ${timings.length} live requests, ${result.peopleCount} wealth records.`);
})();
