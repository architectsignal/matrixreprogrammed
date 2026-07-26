const fs = require('fs');
const path = require('path');

const root = process.cwd();
const siteUrl = String(process.env.SITE_URL || 'https://matrixreprogrammed.com').replace(/\/$/, '');
const attempts = Number(process.env.RESTORED_SURFACES_VERIFY_ATTEMPTS || 36);
const delayMs = Number(process.env.RESTORED_SURFACES_VERIFY_DELAY_MS || 10000);
const concurrency = Number(process.env.RESTORED_SURFACES_VERIFY_CONCURRENCY || 12);
const reportPath = path.join(root, 'downloads', 'live-restored-surfaces-verification.json');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fetchText(route) {
  const join = route.includes('?') ? '&' : '?';
  const response = await fetch(`${siteUrl}${route}${join}restored_surface_check=${Date.now()}`, {
    redirect: 'follow',
    headers: {
      'cache-control': 'no-cache',
      pragma: 'no-cache',
      'accept-language': 'en-GB,en;q=0.9',
      'user-agent': 'MatrixRestoredSurfacesVerifier/1.0'
    }
  });
  return {
    route,
    status: response.status,
    ok: response.ok,
    text: await response.text(),
    cacheControl: response.headers.get('cache-control') || null
  };
}

function parseJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

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

async function verifyOnce() {
  const [home, linksPage, deathLanding, deathDataResponse] = await Promise.all([
    fetchText('/'),
    fetchText('/independent-links.html'),
    fetchText('/death-files.html'),
    fetchText('/data/death-files.json')
  ]);

  const homeChecks = {
    status: home.status,
    banner: home.ok && home.text.includes('UNDER CONSTRUCTION — HELP US BUILD THE MACHINE.'),
    fundingLink: home.text.includes('https://gofund.me/0a3c74fc9'),
    independentLinksRoute: /href=["'][^"']*independent-links\.html["']/i.test(home.text),
    deathFilesRoute: /href=["'][^"']*death-files\.html["']/i.test(home.text),
    familyTrackerRoute: /href=["'][^"']*elite-family-tracker\.html["']/i.test(home.text),
    obsoleteFamilyRouteAbsent: !home.text.includes('track-the-families.html')
  };

  const independentPageChecks = {
    status: linksPage.status,
    title: linksPage.ok && linksPage.text.includes('TOP 100 INDEPENDENT RESEARCH LINKS.'),
    dataWiring: [1, 2, 3, 4].every(number => linksPage.text.includes(`data/independent-links-${number}.json`))
  };

  const linkResponses = await Promise.all([1, 2, 3, 4].map(number => fetchText(`/data/independent-links-${number}.json`)));
  const linkArrays = linkResponses.map(response => parseJson(response.text));
  const allLinks = linkArrays.every(Array.isArray) ? linkArrays.flat() : [];
  const independentDataChecks = {
    statuses: linkResponses.map(response => response.status),
    arraysValid: linkArrays.every(Array.isArray),
    count: allLinks.length,
    uniqueNames: new Set(allLinks.map(item => String(item?.n || '').trim()).filter(Boolean)).size,
    uniqueUrls: new Set(allLinks.map(item => String(item?.u || '').trim()).filter(Boolean)).size,
    complete: allLinks.length === 100
      && new Set(allLinks.map(item => String(item?.n || '').trim()).filter(Boolean)).size === 100
      && new Set(allLinks.map(item => String(item?.u || '').trim()).filter(Boolean)).size === 100
  };

  const deathData = parseJson(deathDataResponse.text);
  const dossiers = Array.isArray(deathData?.dossiers) ? deathData.dossiers : [];
  const slugs = dossiers.map(item => String(item?.slug || '').trim()).filter(Boolean);
  const ids = dossiers.map(item => String(item?.id || '').trim()).filter(Boolean);
  const years = [...new Set(dossiers.map(item => Number(item?.year)).filter(Number.isFinite))].sort((a, b) => b - a);
  const deathDataChecks = {
    status: deathDataResponse.status,
    count: dossiers.length,
    uniqueSlugs: new Set(slugs).size,
    uniqueIds: new Set(ids).size,
    yearCount: years.length,
    complete: deathDataResponse.ok
      && dossiers.length === 100
      && slugs.length === 100
      && ids.length === 100
      && new Set(slugs).size === 100
      && new Set(ids).size === 100
  };
  const deathLandingChecks = {
    status: deathLanding.status,
    title: deathLanding.ok && deathLanding.text.includes('THE DEATH FILES.'),
    dossierContainer: deathLanding.text.includes('id="dossiers"'),
    methodologyRoute: deathLanding.text.includes('death-files-methodology.html'),
    patternLabRoute: deathLanding.text.includes('death-files-pattern-lab.html')
  };

  const dossierResults = deathDataChecks.complete
    ? await mapLimit(dossiers, concurrency, async dossier => {
        const route = `/death-file-${dossier.slug}.html`;
        const response = await fetchText(route);
        return {
          route,
          status: response.status,
          ok: response.ok
            && response.text.includes(`data-death-dossier="${dossier.slug}"`)
            && response.text.includes('Signal Drop')
            && response.text.includes('Evidence-Based Conclusion')
            && !response.text.includes('[object Object]')
        };
      })
    : [];

  const yearResults = deathDataChecks.complete
    ? await mapLimit(years, Math.min(concurrency, 8), async year => {
        const route = `/death-files-year-${year}.html`;
        const response = await fetchText(route);
        return {
          route,
          status: response.status,
          ok: response.ok
            && response.text.includes(String(year))
            && response.text.includes('death-card')
            && response.text.includes('Death Files')
        };
      })
    : [];

  const failedDossiers = dossierResults.filter(item => !item.ok);
  const failedYears = yearResults.filter(item => !item.ok);
  const ok = Object.values(homeChecks).every(value => value === true || typeof value === 'number')
    && Object.values(independentPageChecks).every(value => value === true || typeof value === 'number')
    && independentDataChecks.complete
    && deathDataChecks.complete
    && Object.values(deathLandingChecks).every(value => value === true || typeof value === 'number')
    && dossierResults.length === 100
    && failedDossiers.length === 0
    && yearResults.length === years.length
    && failedYears.length === 0;

  return {
    ok,
    checkedAt: new Date().toISOString(),
    siteUrl,
    homeChecks,
    independentPageChecks,
    independentDataChecks,
    deathLandingChecks,
    deathDataChecks,
    dossierRoutesChecked: dossierResults.length,
    failedDossiers,
    yearRoutesChecked: yearResults.length,
    failedYears
  };
}

(async () => {
  let result = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      result = await verifyOnce();
    } catch (error) {
      result = { ok: false, checkedAt: new Date().toISOString(), siteUrl, error: error.stack || error.message };
    }
    result.attempt = attempt;
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\n`);
    if (result.ok) {
      console.log(`Restored public surfaces verified live on attempt ${attempt}: construction banner, 100 independent links, Death Files landing, ${result.dossierRoutesChecked} dossiers and ${result.yearRoutesChecked} year pages.`);
      process.exit(0);
    }
    console.log(`Restored public surfaces are not fully synchronized yet (${attempt}/${attempts}).`);
    if (attempt < attempts) await sleep(delayMs);
  }
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
})().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
