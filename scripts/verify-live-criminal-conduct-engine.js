const fs = require('fs');
const path = require('path');

const root = process.cwd();
const siteUrl = String(process.env.SITE_URL || 'https://matrixreprogrammed.com').replace(/\/$/, '');
const attempts = Number(process.env.CRIMINAL_CONDUCT_VERIFY_ATTEMPTS || 36);
const delayMs = Number(process.env.CRIMINAL_CONDUCT_VERIFY_DELAY_MS || 10000);
const concurrency = Number(process.env.CRIMINAL_CONDUCT_VERIFY_CONCURRENCY || 12);
const reportPath = path.join(root, 'downloads', 'live-criminal-conduct-engine-verification.json');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fetchText(route) {
  const join = route.includes('?') ? '&' : '?';
  const urls = [`${siteUrl}${route}${join}criminal_conduct_verify=${Date.now()}`, `${siteUrl}${route}`];
  let last = null;
  for (const url of urls) {
    const response = await fetch(url, {
      redirect: 'follow',
      headers: {
        accept: route.endsWith('.json') ? 'application/json,text/plain;q=0.9,*/*;q=0.8' : 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en-GB,en;q=0.9',
        'cache-control': 'no-cache',
        pragma: 'no-cache',
        'user-agent': 'Matrix-Criminal-Conduct-Engine-Verifier/1.1'
      }
    });
    last = { route, url, status: response.status, ok: response.ok, text: await response.text() };
    if (response.status !== 403) return last;
  }
  return last;
}
function parse(text) { try { return JSON.parse(text); } catch { return null; } }
function count(text, token) { return String(text).split(token).length - 1; }
async function mapLimit(items, limit, mapper) {
  const output = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      output[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length || 1)) }, worker));
  return output;
}
function pageCheck(response) {
  const text = response.text || '';
  return {
    route: response.route,
    status: response.status,
    ok: response.ok
      && count(text, '<!-- criminal-conduct-engine:start -->') === 1
      && count(text, '<!-- criminal-conduct-engine:end -->') === 1
      && text.includes('<details class="criminal-conduct-engine">')
      && text.includes('Criminal Conduct &amp; Allegations')
      && text.includes('Charges and investigations are not proof of guilt.')
      && text.includes('Association is not wrongdoing.')
      && text.includes('Rumors / Speculation')
      && text.includes('Acquittals / Dismissals / Reversals / Responses')
      && text.includes('<!-- predators-in-power-conduct-link:start -->')
      && text.includes('Open Predators in Power')
      && text.includes('predators-in-power.html')
      && !text.includes('[object Object]')
  };
}
async function verifyOnce() {
  const [powerResponse, deathResponse, subjectResponse] = await Promise.all([
    fetchText('/data/power-dossiers.json'),
    fetchText('/data/death-files.json'),
    fetchText('/data/subject-intelligence-profiles.json')
  ]);
  const power = parse(powerResponse.text);
  const deaths = parse(deathResponse.text);
  const subjects = parse(subjectResponse.text);
  const routes = [];
  for (const item of power?.dossiers || []) {
    routes.push(`/dossier-${item.slug}.html`, `/dossier-${item.slug}`);
  }
  for (const item of deaths?.dossiers || []) routes.push(`/death-file-${item.slug}.html`);
  for (const item of subjects?.subjects || []) routes.push(`/subject-${item.slug}.html`);
  for (const route of ['/atlas-cia.html', '/authority-intelligence.html']) routes.push(route);
  const uniqueRoutes = [...new Set(routes)];
  const results = await mapLimit(uniqueRoutes, concurrency, async route => pageCheck(await fetchText(route)));
  const failed = results.filter(item => !item.ok);
  return {
    ok: powerResponse.ok && deathResponse.ok && subjectResponse.ok && uniqueRoutes.length >= 110 && failed.length === 0,
    checkedAt: new Date().toISOString(),
    siteUrl,
    sourceStatuses: {
      powerDossiers: powerResponse.status,
      deathFiles: deathResponse.status,
      subjectProfiles: subjectResponse.status
    },
    expectedRoutes: uniqueRoutes.length,
    verifiedRoutes: results.length - failed.length,
    failed
  };
}

(async () => {
  let result = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try { result = await verifyOnce(); }
    catch (error) { result = { ok: false, checkedAt: new Date().toISOString(), siteUrl, error: error.stack || error.message }; }
    result.attempt = attempt;
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\n`);
    if (result.ok) {
      console.log(`Live Criminal Conduct & Allegations engine and Predators in Power links verified across ${result.verifiedRoutes} dossier routes on attempt ${attempt}.`);
      process.exit(0);
    }
    console.log(`Live criminal conduct engine is not fully synchronized yet (${attempt}/${attempts}); ${result.failed?.length ?? 'unknown'} route(s) failing.`);
    if (attempt < attempts) await sleep(delayMs);
  }
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
})().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
