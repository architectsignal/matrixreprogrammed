const fs = require('fs');
const path = require('path');

const root = process.cwd();
const siteUrl = String(process.env.SITE_URL || 'https://matrixreprogrammed.com').replace(/\/$/, '');
const attempts = Number(process.env.PREDATORS_IN_POWER_VERIFY_ATTEMPTS || 36);
const delayMs = Number(process.env.PREDATORS_IN_POWER_VERIFY_DELAY_MS || 10000);
const reportPath = path.join(root, 'downloads', 'live-predators-in-power-verification.json');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fetchText(route) {
  const join = route.includes('?') ? '&' : '?';
  const urls = [`${siteUrl}${route}${join}predators_in_power_verify=${Date.now()}`, `${siteUrl}${route}`];
  let last = null;
  for (const url of urls) {
    const response = await fetch(url, {
      redirect: 'follow',
      headers: {
        accept: route.endsWith('.json') ? 'application/json,text/plain;q=0.9,*/*;q=0.8' : route.endsWith('.csv') ? 'text/csv,text/plain;q=0.9,*/*;q=0.8' : 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en-GB,en;q=0.9',
        'cache-control': 'no-cache',
        pragma: 'no-cache',
        'user-agent': 'Matrix-Predators-In-Power-Verifier/1.0'
      }
    });
    last = { route, url, status: response.status, ok: response.ok, text: await response.text() };
    if (response.status !== 403) return last;
  }
  return last;
}
function parse(text) { try { return JSON.parse(text); } catch { return null; } }
function pageOk(text) {
  return [
    'PREDATORS IN POWER.',
    'Read the legal lane before the name',
    'The page title is the name of an accountability project, not a blanket legal finding.',
    'Charges and investigations are not proof of guilt.',
    'Association, employment, office, fame or proximity is not wrongdoing.',
    'id="pip-index"',
    'id="pip-search"',
    'id="pip-lane"',
    'id="pip-sector"',
    'id="pip-conduct"',
    'id="pip-signal-form"',
    'Predators in Power Source Drop',
    'pending editorial review',
    'Predator score: DISABLED',
    'downloads/predators-in-power.json',
    'downloads/predators-in-power.csv'
  ].every(marker => String(text).includes(marker)) && !String(text).includes('[object Object]');
}
async function verifyOnce() {
  const routes = [
    '/predators-in-power.html',
    '/predators-in-power',
    '/data/predators-in-power.json',
    '/downloads/predators-in-power.json',
    '/downloads/predators-in-power.csv',
    '/index.html',
    '/wrongdoing-tracker.html',
    '/evidence-vault.html',
    '/subject-index.html'
  ];
  const responses = await Promise.all(routes.map(fetchText));
  const byRoute = Object.fromEntries(responses.map(item => [item.route, item]));
  const publicData = parse(byRoute['/data/predators-in-power.json']?.text || '');
  const downloadData = parse(byRoute['/downloads/predators-in-power.json']?.text || '');
  const failures = [];
  for (const route of ['/predators-in-power.html', '/predators-in-power']) {
    const response = byRoute[route];
    if (!response?.ok || !pageOk(response.text)) failures.push({ route, status: response?.status || 0, reason: 'page markers missing' });
  }
  for (const route of ['/index.html', '/wrongdoing-tracker.html', '/evidence-vault.html', '/subject-index.html']) {
    const response = byRoute[route];
    if (!response?.ok || !response.text.includes('<!-- predators-in-power-route:start -->') || !response.text.includes('predators-in-power.html')) failures.push({ route, status: response?.status || 0, reason: 'route block missing' });
  }
  if (!byRoute['/data/predators-in-power.json']?.ok || !publicData || publicData.schemaVersion !== 1 || !Array.isArray(publicData.subjects)) failures.push({ route: '/data/predators-in-power.json', status: byRoute['/data/predators-in-power.json']?.status || 0, reason: 'invalid public data' });
  if (!byRoute['/downloads/predators-in-power.json']?.ok || !downloadData || downloadData.count !== publicData?.count) failures.push({ route: '/downloads/predators-in-power.json', status: byRoute['/downloads/predators-in-power.json']?.status || 0, reason: 'download JSON mismatch' });
  const csv = byRoute['/downloads/predators-in-power.csv'];
  if (!csv?.ok || !csv.text.startsWith('"subject","dossier_route"')) failures.push({ route: '/downloads/predators-in-power.csv', status: csv?.status || 0, reason: 'CSV header missing' });
  return {
    ok: failures.length === 0,
    checkedAt: new Date().toISOString(),
    siteUrl,
    qualifyingSubjects: publicData?.count ?? null,
    approvedRecords: Array.isArray(publicData?.subjects) ? publicData.subjects.reduce((sum, subject) => sum + (subject.records || []).length, 0) : null,
    routesChecked: routes.length,
    failures
  };
}

(async () => {
  let result = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try { result = await verifyOnce(); }
    catch (error) { result = { ok: false, checkedAt: new Date().toISOString(), siteUrl, error: error.stack || error.message, failures: [] }; }
    result.attempt = attempt;
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\n`);
    if (result.ok) {
      console.log(`Live Predators in Power verified across ${result.routesChecked} routes on attempt ${attempt}: ${result.qualifyingSubjects} qualifying subject(s), ${result.approvedRecords} approved record(s).`);
      process.exit(0);
    }
    console.log(`Live Predators in Power is not fully synchronized yet (${attempt}/${attempts}); ${result.failures?.length ?? 'unknown'} check(s) failing.`);
    if (attempt < attempts) await sleep(delayMs);
  }
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
})().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
