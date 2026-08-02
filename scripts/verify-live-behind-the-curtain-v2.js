const fs = require('fs');
const path = require('path');

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('Usage: node scripts/verify-live-behind-the-curtain-v2.js');
  console.log('Read-only live verification. Configure SITE_URL, PYRAMID_VERIFY_ATTEMPTS and PYRAMID_VERIFY_DELAY_MS with environment variables.');
  process.exit(0);
}

const root = process.cwd();
const siteUrl = String(process.env.SITE_URL || 'https://matrixreprogrammed.com').replace(/\/$/, '');
const directWorkerUrl = String(process.env.AI_DIRECT_WORKER_URL || '').replace(/\/$/, '');
const attempts = Number(process.env.PYRAMID_VERIFY_ATTEMPTS || 36);
const delayMs = Number(process.env.PYRAMID_VERIFY_DELAY_MS || 10000);
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function fetchText(route) {
  const join = route.includes('?') ? '&' : '?';
  const accept = route.includes('/api/public/') || route.endsWith('.json')
    ? 'application/json,text/plain;q=0.9,*/*;q=0.8'
    : 'text/html,application/xhtml+xml,application/javascript,application/json;q=0.9,*/*;q=0.8';
  const bases = [siteUrl];
  if (directWorkerUrl && directWorkerUrl !== siteUrl) bases.push(directWorkerUrl);
  const urls = bases.flatMap(base => [`${base}${route}${join}matrix_verify=${Date.now()}`, `${base}${route}`]);
  let last = null;
  for (const url of urls) {
    const response = await fetch(url, {
      redirect: 'follow',
      headers: {
        accept,
        'accept-language': 'en-GB,en;q=0.9',
        'cache-control': 'no-cache',
        pragma: 'no-cache',
        'user-agent': 'Matrix-Reprogrammed-Production-Verifier/2.1'
      }
    });
    const result = {
      status: response.status,
      ok: response.ok,
      text: await response.text(),
      headers: Object.fromEntries(response.headers.entries()),
      url
    };
    last = result;
    if (result.status !== 403) return result;
  }
  return last;
}

const parse = text => { try { return JSON.parse(text); } catch { return null; } };

function validatePeople(model) {
  const issues = [];
  if (model?.schemaVersion !== 1) issues.push('schemaVersion must be 1');
  if (!Array.isArray(model?.people) || model.people.length < 80) issues.push('at least 80 named people required');
  const factual = ['public-stage','permanent-system','money-gatekeepers','ownership-infrastructure','intelligence-security','policy-architects','connectors'];
  const counts = {};
  for (const tier of factual) {
    counts[tier] = (model?.people || []).filter(person => (person.tierAccess || []).some(access => access.tierId === tier)).length;
    if (counts[tier] < 10) issues.push(`${tier} has only ${counts[tier]} people`);
  }
  const union = new Set((model?.people || []).filter(person => (person.tierAccess || []).some(access => factual.includes(access.tierId))).map(person => person.id));
  if (union.size < 80) issues.push(`only ${union.size} unique factual-tier people`);
  return { ok: issues.length === 0, issues, counts, uniquePeople: union.size, totalPeople: model?.people?.length || 0 };
}

function validatePyramid(model) {
  const issues = [];
  if (model?.schemaVersion !== 2) issues.push('schemaVersion must be 2');
  if (model?.levels?.length !== 12) issues.push('12 levels required');
  if (model?.chokePoints?.length !== 10) issues.push('10 choke points required');
  const apex = (model?.levels || []).find(item => item.id === 'human-apex');
  if (apex?.memberQuery !== 'cross-system-top-10' || (apex?.memberRefs || []).length !== 0) issues.push('Human Apex is not dynamic');
  if (!(model?.hiddenHandHypotheses || []).some(item => item.classification === 'speculative_hypothesis' && item.notEstablished)) issues.push('bounded speculative hypothesis missing');
  if (!(model?.symbolicDossiers || []).some(item => item.id === 'lightbringer' && item.notEstablished)) issues.push('bounded Lightbringer dossier missing');
  return { ok: issues.length === 0, issues, levels: model?.levels?.length || 0, chokePoints: model?.chokePoints?.length || 0, hypotheses: model?.hiddenHandHypotheses?.length || 0 };
}

function validateSymbolic(model) {
  const issues = [];
  if (model?.schemaVersion !== 1) issues.push('schemaVersion must be 1');
  if (!Array.isArray(model?.families) || model.families.length < 13) issues.push('at least 13 historical family files required');
  for (const id of ['orsini','colonna','borghese','chigi','odescalchi','caetani','massimo']) {
    if (!(model?.families || []).some(item => item.id === id && item.notEstablished)) issues.push(`bounded family file missing: ${id}`);
  }
  for (const id of ['baal','moloch','lightbringer','saturn-black-cube']) {
    if (!(model?.symbolicApex || []).some(item => item.id === id && item.notEstablished)) issues.push(`bounded symbolic dossier missing: ${id}`);
  }
  if (!(model?.models || []).some(item => item.classification === 'speculative_hypothesis')) issues.push('explicit speculative model missing');
  return { ok: issues.length === 0, issues, families: model?.families?.length || 0, symbols: model?.symbolicApex?.length || 0, models: model?.models?.length || 0 };
}

function validateCurated(model) {
  const issues = [];
  if (model?.schemaVersion !== 1) issues.push('schemaVersion must be 1');
  if (!Array.isArray(model?.people) || model.people.length < 18) issues.push('at least 18 curated living profiles required');
  if (!Array.isArray(model?.familyPersonLinks) || model.familyPersonLinks.length < 18) issues.push('at least 18 typed family-person links required');
  if (!Array.isArray(model?.sources) || model.sources.length < 20) issues.push('at least 20 curated sources required');
  const people = new Set((model?.people || []).map(item => item.id));
  const sources = new Set((model?.sources || []).map(item => item.id));
  if (people.size !== (model?.people || []).length) issues.push('duplicate curated person IDs');
  if (!(model?.familyPersonLinks || []).every(link => people.has(link.personId) && link.familyId && link.roleType && link.relationship)) issues.push('unresolved or untyped family-person link');
  if ((model?.familyPersonLinks || []).filter(link => link.roleType === 'professional_gatekeeper').length < 5) issues.push('at least five professional gatekeepers required');
  if (!(model?.people || []).every(person => person.sourceIds?.length && person.sourceIds.every(id => sources.has(id)))) issues.push('curated person has unresolved source');
  return {
    ok: issues.length === 0,
    issues,
    people: model?.people?.length || 0,
    links: model?.familyPersonLinks?.length || 0,
    gatekeepers: (model?.familyPersonLinks || []).filter(link => link.roleType === 'professional_gatekeeper').length,
    sources: model?.sources?.length || 0
  };
}

function validateConfig(model) {
  const issues = [];
  if (model?.schemaVersion !== 1) issues.push('schemaVersion must be 1');
  if (model?.scoreDimensions?.length !== 8) issues.push('eight score dimensions required');
  if (!Array.isArray(model?.claimClasses) || model.claimClasses.length < 9) issues.push('at least nine claim classes required');
  return { ok: issues.length === 0, issues, scoreDimensions: model?.scoreDimensions?.length || 0, claimClasses: model?.claimClasses?.length || 0 };
}

function noMarkerLeak(response) {
  return response.status === 403 || (response.ok && !/preservedaftervisiblede-duplication/i.test(response.text));
}

async function verifyOnce() {
  const routes = {
    pyramidHtml: '/structural-power-map',
    pyramidJs: '/behind-the-curtain-access-v2.js',
    peopleApi: '/api/public/structural-power/people',
    pyramidApi: '/api/public/structural-power/pyramid',
    symbolicApi: '/api/public/structural-power/capstone',
    primaryCapstone: '/behind-the-curtain-capstone.html',
    primaryRuntime: '/power-family-intelligence-layer.js',
    curatedData: '/data/power-family-curated-people.json',
    configData: '/data/power-family-intelligence-layer.json',
    symbolicAnnex: '/behind-the-curtain-symbolic-capstone.html',
    symbolicRuntime: '/behind-the-curtain-capstone.js',
    home: '/',
    startHere: '/start-here.html',
    newsletter: '/newsletter.html',
    newsletterRuntime: '/newsletter.js',
    news: '/news.html'
  };
  const entries = await Promise.all(Object.entries(routes).map(async ([key, route]) => [key, await fetchText(route)]));
  const responses = Object.fromEntries(entries);
  const people = parse(responses.peopleApi.text);
  const pyramid = parse(responses.pyramidApi.text);
  const symbolic = parse(responses.symbolicApi.text);
  const curated = parse(responses.curatedData.text);
  const config = parse(responses.configData.text);
  const peopleCheck = validatePeople(people);
  const pyramidCheck = validatePyramid(pyramid);
  const symbolicCheck = validateSymbolic(symbolic);
  const curatedCheck = validateCurated(curated);
  const configCheck = validateConfig(config);
  const htmlResponses = [responses.pyramidHtml, responses.primaryCapstone, responses.symbolicAnnex, responses.home, responses.startHere, responses.newsletter, responses.news];
  const wafBlocked = htmlResponses.every(response => response.status === 403) && responses.primaryRuntime.ok && responses.curatedData.ok;
  const routeChecks = {
    pyramidHtml: responses.pyramidHtml.ok && responses.pyramidHtml.text.includes('SELECT A LEVEL. NAME ITS OPERATORS.') && responses.pyramidHtml.text.includes('behind-the-curtain-access-v2.js'),
    pyramidRenderer: responses.pyramidJs.ok && responses.pyramidJs.text.includes('renderSelectedTier') && !responses.pyramidJs.text.includes('renderHumanApex'),
    peopleData: responses.peopleApi.ok && peopleCheck.ok,
    pyramidData: responses.pyramidApi.ok && pyramidCheck.ok,
    primaryCapstone: responses.primaryCapstone.ok && responses.primaryCapstone.text.includes('POWER-FAMILY INTELLIGENCE LAYER') && responses.primaryCapstone.text.includes('power-family-intelligence-layer.js') && responses.primaryCapstone.text.includes('behind-the-curtain-symbolic-capstone.html'),
    primaryRuntime: responses.primaryRuntime.ok && responses.primaryRuntime.text.includes('power-family-curated-people.json') && !responses.primaryRuntime.text.includes('behind-the-curtain-people-registry.json') && responses.primaryRuntime.text.includes('fails closed'),
    curatedData: responses.curatedData.ok && curatedCheck.ok,
    configData: responses.configData.ok && configCheck.ok,
    symbolicAnnex: responses.symbolicAnnex.ok && responses.symbolicAnnex.text.includes('SEPARATE EVIDENCE LANE') && responses.symbolicAnnex.text.includes('BLACK NOBILITY IS A HISTORY BEFORE IT IS A THEORY.') && responses.symbolicAnnex.text.includes('behind-the-curtain-capstone.js'),
    symbolicRenderer: responses.symbolicRuntime.ok && responses.symbolicRuntime.text.includes('behind-the-curtain-capstone.json'),
    symbolicData: responses.symbolicApi.ok && symbolicCheck.ok,
    homepageGateway: responses.home.ok && responses.home.text.includes('behind-the-curtain-capstone.html') && responses.home.text.includes('WHO HOLDS THE MECHANISM WHEN THE CAMERAS TURN OFF?'),
    startHereGateway: responses.startHere.ok && responses.startHere.text.includes('behind-the-curtain-capstone.html') && responses.startHere.text.includes('WHO HOLDS THE MECHANISM WHEN THE CAMERAS TURN OFF?'),
    newsletter: responses.newsletter.ok && responses.newsletter.text.includes('newsletter-public-value:start') && responses.newsletter.text.includes('placeholder="Name"') && responses.newsletter.text.includes('placeholder="you@example.com"') && !responses.newsletter.text.includes('reader field='),
    newsletterRuntime: responses.newsletterRuntime.ok && responses.newsletterRuntime.text.includes('/newsletter-signup') && responses.newsletterRuntime.text.includes('activate reports') && responses.newsletterRuntime.text.includes('marketingConsent'),
    markerCleanup: [responses.home, responses.startHere, responses.newsletter, responses.news, responses.primaryCapstone, responses.symbolicAnnex].every(noMarkerLeak)
  };
  return {
    ok: Object.values(routeChecks).every(Boolean),
    wafBlocked,
    checkedAt: new Date().toISOString(),
    siteUrl,
    statuses: Object.fromEntries(Object.entries(responses).map(([key, response]) => [key, response.status])),
    routeChecks,
    peopleCheck,
    pyramidCheck,
    symbolicCheck,
    curatedCheck,
    configCheck,
    cfRays: Object.values(responses).map(response => response.headers['cf-ray']).filter(Boolean)
  };
}

(async () => {
  let result = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try { result = await verifyOnce(); }
    catch (error) { result = { ok: false, wafBlocked: false, checkedAt: new Date().toISOString(), siteUrl, error: error.message }; }
    result.attempt = attempt;
    fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
    fs.writeFileSync(path.join(root, 'downloads', 'live-behind-the-curtain-verification.json'), JSON.stringify(result, null, 2));
    if (result.ok) {
      console.log(`Live Behind the Curtain, Power-Family Capstone, newsletter and public gateway verification PASS on attempt ${attempt}.`);
      return;
    }
    if (result.wafBlocked) {
      console.warn('Live HTML content probes were blocked by Cloudflare WAF; static intelligence assets are live. Deferring exact route and SHA proof to verify-live-production.js.');
      return;
    }
    if (attempt < attempts) await sleep(delayMs);
  }
  console.error('Live Behind the Curtain verification failed:', JSON.stringify(result, null, 2));
  process.exit(1);
})().catch(error => { console.error(error); process.exit(1); });
