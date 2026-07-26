const fs = require('fs');
const path = require('path');

const root = process.cwd();
const siteUrl = String(process.env.SITE_URL || 'https://matrixreprogrammed.com').replace(/\/$/, '');
const expectedSha = String(process.env.DEPLOY_COMMIT_SHA || process.env.GITHUB_SHA || '');
const attempts = Number(process.env.COMPACT_LIVE_VERIFY_ATTEMPTS || 3);
const delayMs = Number(process.env.COMPACT_LIVE_VERIFY_DELAY_MS || 30000);
const timeoutMs = Number(process.env.COMPACT_LIVE_VERIFY_TIMEOUT_MS || 15000);
const reportPath = path.join(root, 'downloads', 'live-release-surfaces-compact.json');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function readJson(rel, fallback = null) {
  try { return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8')); }
  catch { return fallback; }
}
function parse(text) { try { return JSON.parse(text); } catch { return null; } }
function count(text, token) { return String(text || '').split(token).length - 1; }
function browserHeaders(route) {
  const data = /\.(?:json|csv)(?:$|\?)/i.test(route);
  return {
    accept: data ? 'application/json,text/csv,text/plain;q=0.9,*/*;q=0.8' : 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
    'accept-language': 'en-GB,en;q=0.9',
    'cache-control': 'no-cache',
    pragma: 'no-cache',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
  };
}
async function fetchText(route) {
  const options = { redirect: 'follow', headers: browserHeaders(route) };
  if (typeof AbortSignal?.timeout === 'function') options.signal = AbortSignal.timeout(timeoutMs);
  const response = await fetch(`${siteUrl}${route}`, options);
  return {
    route,
    status: response.status,
    ok: response.ok,
    text: await response.text(),
    headers: Object.fromEntries(response.headers.entries())
  };
}
function conductPageOk(text) {
  return count(text, '<!-- criminal-conduct-engine:start -->') === 1
    && count(text, '<!-- criminal-conduct-engine:end -->') === 1
    && text.includes('<details class="criminal-conduct-engine">')
    && text.includes('Criminal Conduct &amp; Allegations')
    && text.includes('Charges and investigations are not proof of guilt.')
    && text.includes('Association is not wrongdoing.')
    && text.includes('Rumors / Speculation')
    && text.includes('Acquittals / Dismissals / Reversals / Responses')
    && text.includes('<!-- predators-in-power-conduct-link:start -->')
    && text.includes('Open Predators in Power')
    && !text.includes('[object Object]');
}

async function verifyOnce() {
  const localManifest = readJson('deploy-manifest.json', {});
  const conductPressure = readJson('downloads/criminal-conduct-engine-pressure-test.json', {});
  const predatorsPressure = readJson('downloads/predators-in-power-pressure-test.json', {});
  const sampleFiles = Array.isArray(localManifest.conductSampleFiles) ? localManifest.conductSampleFiles.slice(0, 7) : [];
  const routes = [
    '/deploy-manifest.json',
    '/deploy-health.json',
    '/',
    '/timers.html',
    '/predators-in-power.html',
    '/data/predators-in-power.json',
    '/downloads/predators-in-power.csv',
    '/death-files.html',
    '/data/death-files.json',
    '/independent-links.html',
    ...sampleFiles.map(rel => `/${rel}`)
  ];
  const responses = await Promise.all(routes.map(fetchText));
  const byRoute = Object.fromEntries(responses.map(item => [item.route, item]));
  const liveManifest = parse(byRoute['/deploy-manifest.json']?.text || '');
  const liveHealth = parse(byRoute['/deploy-health.json']?.text || '');
  const predators = parse(byRoute['/data/predators-in-power.json']?.text || '');
  const deaths = parse(byRoute['/data/death-files.json']?.text || '');
  const failures = [];

  const manifestExact = byRoute['/deploy-manifest.json']?.ok
    && liveManifest?.ok === true
    && liveManifest?.commitSha === expectedSha
    && localManifest?.commitSha === expectedSha
    && JSON.stringify(liveManifest?.criticalFiles || {}) === JSON.stringify(localManifest?.criticalFiles || {})
    && JSON.stringify(liveManifest?.corePublicSurfaces || {}) === JSON.stringify(localManifest?.corePublicSurfaces || {});
  if (!manifestExact) failures.push({ route: '/deploy-manifest.json', status: byRoute['/deploy-manifest.json']?.status || 0, reason: 'exact SHA, critical hashes or public-surface contract mismatch' });

  const healthExact = byRoute['/deploy-health.json']?.ok
    && liveHealth?.ok === true
    && liveHealth?.buildSha === expectedSha
    && liveHealth?.manifestSha === expectedSha
    && liveHealth?.workerScript === 'src/worker-production.js';
  if (!healthExact) failures.push({ route: '/deploy-health.json', status: byRoute['/deploy-health.json']?.status || 0, reason: 'health SHA or strict Worker mismatch' });

  if (!conductPressure?.ok || Number(conductPressure.sourceSurfaces || 0) < 1 || Number(conductPressure.builtSurfaces || 0) < 1) failures.push({ route: 'local-conduct-pressure-test', status: 0, reason: 'full predeploy conduct audit missing or failed' });
  if (!predatorsPressure?.ok) failures.push({ route: 'local-predators-pressure-test', status: 0, reason: 'full predeploy Predators audit missing or failed' });

  const clocks = localManifest?.corePublicSurfaces?.homepageClocksOver90 || [];
  const home = byRoute['/']?.text || '';
  if (!byRoute['/']?.ok || !home.includes('All Clocks Over 90%') || !home.includes('Documented / practical') || !home.includes('Classified speculation')) failures.push({ route: '/', status: byRoute['/']?.status || 0, reason: 'homepage all-over-90 clock section missing' });
  for (const clock of clocks) {
    if (!home.includes(`data-critical-clock="${clock.slug}"`) || !home.includes(`data-clock-lane="${clock.lane}"`)) failures.push({ route: '/', status: byRoute['/']?.status || 0, reason: `homepage clock missing or misclassified: ${clock.slug}` });
    if (!(byRoute['/timers.html']?.text || '').includes(`id="${clock.slug}"`)) failures.push({ route: '/timers.html', status: byRoute['/timers.html']?.status || 0, reason: `timer card missing: ${clock.slug}` });
  }

  const predatorsPage = byRoute['/predators-in-power.html']?.text || '';
  for (const marker of ['PREDATORS IN POWER.', 'Read the legal lane before the name', 'Charges and investigations are not proof of guilt.', 'Predator score: DISABLED']) {
    if (!byRoute['/predators-in-power.html']?.ok || !predatorsPage.includes(marker)) failures.push({ route: '/predators-in-power.html', status: byRoute['/predators-in-power.html']?.status || 0, reason: `missing marker: ${marker}` });
  }
  if (!byRoute['/data/predators-in-power.json']?.ok || predators?.schemaVersion !== 1 || !Array.isArray(predators?.subjects) || Number(predators?.count || 0) !== Number(localManifest?.corePublicSurfaces?.predatorsInPowerSubjects || 0)) failures.push({ route: '/data/predators-in-power.json', status: byRoute['/data/predators-in-power.json']?.status || 0, reason: 'Predators data contract mismatch' });
  if (!byRoute['/downloads/predators-in-power.csv']?.ok || !String(byRoute['/downloads/predators-in-power.csv']?.text || '').startsWith('"subject","dossier_route"')) failures.push({ route: '/downloads/predators-in-power.csv', status: byRoute['/downloads/predators-in-power.csv']?.status || 0, reason: 'Predators CSV missing or invalid' });

  if (!byRoute['/death-files.html']?.ok || !String(byRoute['/death-files.html']?.text || '').includes('THE DEATH FILES.')) failures.push({ route: '/death-files.html', status: byRoute['/death-files.html']?.status || 0, reason: 'Death Files landing page missing' });
  if (!byRoute['/data/death-files.json']?.ok || !Array.isArray(deaths?.dossiers) || deaths.dossiers.length !== 100) failures.push({ route: '/data/death-files.json', status: byRoute['/data/death-files.json']?.status || 0, reason: 'Death Files must contain exactly 100 dossiers' });
  if (!byRoute['/independent-links.html']?.ok || !String(byRoute['/independent-links.html']?.text || '').includes('TOP 100 INDEPENDENT RESEARCH LINKS.')) failures.push({ route: '/independent-links.html', status: byRoute['/independent-links.html']?.status || 0, reason: 'Independent Links page missing' });

  for (const rel of sampleFiles) {
    const route = `/${rel}`;
    if (!byRoute[route]?.ok || !conductPageOk(byRoute[route]?.text || '')) failures.push({ route, status: byRoute[route]?.status || 0, reason: 'representative conduct dropdown or Predators link missing' });
  }

  return {
    ok: failures.length === 0,
    checkedAt: new Date().toISOString(),
    expectedSha,
    manifestExact,
    healthExact,
    clocksOver90: clocks,
    fullPredeployConductCoverage: {
      source: Number(conductPressure.sourceSurfaces || 0),
      built: Number(conductPressure.builtSurfaces || 0),
      approvedRecords: Number(conductPressure.approvedRecords || 0),
      reviewCandidates: Number(conductPressure.reviewCandidates || 0)
    },
    predatorsInPowerSubjects: Number(predators?.count || 0),
    deathFiles: Array.isArray(deaths?.dossiers) ? deaths.dossiers.length : 0,
    representativeDossiers: sampleFiles.length,
    statuses: Object.fromEntries(responses.map(item => [item.route, item.status])),
    cfRays: responses.map(item => item.headers['cf-ray']).filter(Boolean),
    failures
  };
}

(async () => {
  let result = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try { result = await verifyOnce(); }
    catch (error) { result = { ok: false, checkedAt: new Date().toISOString(), expectedSha, error: error.stack || error.message, failures: [] }; }
    result.attempt = attempt;
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\n`);
    if (result.ok) {
      console.log(`Compact live release proof passed at ${expectedSha.slice(0, 12)}: ${result.fullPredeployConductCoverage.built} audited conduct dossiers, ${result.representativeDossiers} live samples, ${result.deathFiles} Death Files and ${result.clocksOver90.length} homepage clock(s) above 90%.`);
      process.exit(0);
    }
    console.log(`Compact live release proof not synchronized (${attempt}/${attempts}); ${result.failures?.length ?? 'unknown'} check(s) failing.`);
    if (attempt < attempts) await sleep(delayMs);
  }
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
})().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
