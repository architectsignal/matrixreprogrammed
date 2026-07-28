'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const siteUrl = String(process.env.SITE_URL || 'https://matrixreprogrammed.com').replace(/\/$/, '');
const expectedSha = String(process.env.EXPECTED_DEPLOY_SHA || '').trim();
const attempts = Number(process.env.EXPOSURE_LIVE_ATTEMPTS || 8);
const delayMs = Number(process.env.EXPOSURE_LIVE_DELAY_MS || 5000);
const reportPath = path.join(root, 'downloads', 'live-exposure-integrity-verification.json');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

if (!/^[a-f0-9]{40}$/i.test(expectedSha)) {
  throw new Error('EXPECTED_DEPLOY_SHA must be the exact 40-character deployed commit SHA.');
}

async function fetchRoute(route, options = {}) {
  const join = route.includes('?') ? '&' : '?';
  const urls = [`${siteUrl}${route}${join}exposure_verify=${Date.now()}`, `${siteUrl}${route}`];
  let last = null;
  for (const url of urls) {
    const response = await fetch(url, {
      redirect: 'follow',
      ...options,
      headers: {
        accept: route.endsWith('.json') || route.startsWith('/api/') || route === '/forum-health'
          ? 'application/json,text/plain;q=0.9,*/*;q=0.8'
          : 'text/html,application/xhtml+xml,application/javascript,application/json;q=0.9,*/*;q=0.8',
        'accept-language': 'en-GB,en;q=0.9',
        'cache-control': 'no-cache',
        pragma: 'no-cache',
        'user-agent': 'Matrix-Exposure-Integrity-Live-Verifier/1.0',
        ...(options.headers || {})
      }
    });
    const result = {
      route,
      url,
      status: response.status,
      ok: response.ok,
      text: await response.text(),
      headers: Object.fromEntries(response.headers.entries())
    };
    last = result;
    if (result.status !== 403) return result;
  }
  return last;
}

const parseJson = text => { try { return JSON.parse(text); } catch { return null; } };
const array = value => Array.isArray(value) ? value : [];
const clean = value => String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
const absoluteUrl = value => /^https?:\/\//i.test(clean(value));

function validateLedger(model) {
  const failures = [];
  if (model?.schemaVersion !== 1) failures.push('ledger schemaVersion must be 1');
  if (!Number.isInteger(model?.count) || model.count < 84) failures.push('ledger must contain at least 84 canonical records');
  if (model?.count !== array(model?.entries).length) failures.push('ledger count mismatch');
  const keys = array(model?.entries).map(entry => `${clean(entry.entityId)}:${clean(entry.recordId)}`);
  if (new Set(keys).size !== keys.length) failures.push('duplicate entity/record keys remain');
  const allowed = new Set(['fact_adjudicated','fact_official_record','fact_corroborated','official_allegation','attributed_allegation','documented_association','analytical_inference','rumour','speculation','unsupported_or_debunked']);
  for (const entry of array(model?.entries)) {
    const id = `${clean(entry.entityId)}:${clean(entry.recordId)}`;
    if (!allowed.has(entry.classification)) failures.push(`${id} invalid classification`);
    if (!clean(entry.title) || !clean(entry.establishes) || !clean(entry.doesNotEstablish)) failures.push(`${id} incomplete evidence boundary`);
    if (/^fact_/.test(clean(entry.classification)) && !array(entry.sourceRoutes).some(absoluteUrl)) failures.push(`${id} fact record lacks external source route`);
  }
  return { ok: failures.length === 0, failures, count: Number(model?.count || 0) };
}

function validateEngine(model) {
  const failures = [];
  if (model?.schemaVersion !== 1) failures.push('engine schemaVersion must be 1');
  if (model?.ok !== true) failures.push('engine did not report ok');
  if (Number(model?.summary?.evidenceLedgerEntries) < 84) failures.push('engine ledger count below 84');
  if (Number(model?.summary?.hitListEntries) < 275) failures.push('engine Hit List count below 275');
  if (Number(model?.summary?.sensitiveRecordFailures) !== 0) failures.push('sensitive-record failures remain');
  if (Number(model?.summary?.entriesWithoutAction) !== 0) failures.push('entries without investigation action remain');
  if (Number(model?.summary?.unresolvedGraphEdges) !== 172) failures.push('unexpected quarantined graph-edge count');
  if (!clean(model?.operatingRule).includes('Facts require evidence')) failures.push('operating rule missing');
  return { ok: failures.length === 0, failures, summary: model?.summary || {} };
}

function validateHitList(model) {
  const failures = [];
  if (model?.schemaVersion !== 1) failures.push('Hit List schemaVersion must be 1');
  if (!Number.isInteger(model?.count) || model.count < 275) failures.push('Hit List must contain at least 275 entries');
  if (model?.count !== array(model?.entries).length) failures.push('Hit List count mismatch');
  if (!clean(model?.boundary).includes('not a threat list')) failures.push('Hit List boundary missing');
  for (const entry of array(model?.entries)) {
    if (!clean(entry.name)) failures.push('Hit List entry missing name');
    if (!clean(entry.primaryClassification)) failures.push(`${clean(entry.name) || entry.id} missing primary classification`);
    if (!clean(entry.plainEnglishReason)) failures.push(`${clean(entry.name) || entry.id} missing plain-English reason`);
    if (!array(entry.doesNotProve).length) failures.push(`${clean(entry.name) || entry.id} missing does-not-prove boundary`);
    const actions = [
      ...array(entry.dossierRoutes),
      ...array(entry.timerRoutes).map(item => item && item.route),
      ...array(entry.sourceRoutes)
    ].filter(Boolean);
    if (!actions.length) failures.push(`${clean(entry.name) || entry.id} has no action route`);
  }
  return { ok: failures.length === 0, failures, count: Number(model?.count || 0) };
}

function pageCheck(response, markers) {
  return response.ok && markers.every(marker => response.text.includes(marker));
}

async function verifyProtectedBoundaries() {
  const [forum, paypal, email] = await Promise.all([
    fetchRoute('/forum-health'),
    fetchRoute('/api/paypal/config'),
    fetchRoute('/api/email/admin/health')
  ]);
  const forumData = parseJson(forum.text);
  const paypalData = parseJson(paypal.text);
  const forumOk = forum.ok
    && forum.headers['x-matrix-origin'] === 'cloudflare-worker-forum-d1'
    && forumData?.persistent === true
    && forumData?.d1Connected === true
    && String(forumData?.authoritativeStorage || '').includes('D1');
  const paypalOk = paypal.status === 401
    && paypal.headers['x-matrix-origin'] === 'cloudflare-worker-paypal-subscriptions'
    && paypalData?.ok === false
    && paypalData?.authenticated === false;
  const emailOk = [401, 403, 404].includes(email.status);
  return {
    ok: forumOk && paypalOk && emailOk,
    forum: { ok: forumOk, status: forum.status, origin: forum.headers['x-matrix-origin'] || null, data: forumData },
    paypal: { ok: paypalOk, status: paypal.status, origin: paypal.headers['x-matrix-origin'] || null, data: paypalData },
    email: { ok: emailOk, status: email.status, origin: email.headers['x-matrix-origin'] || null }
  };
}

async function verifyOnce() {
  const routes = {
    manifest: '/deploy-manifest.json',
    health: '/deploy-health.json',
    hitListHtml: '/hit-list.html',
    hitListClean: '/hit-list',
    evidenceLedger: '/data/exposure-evidence-ledger.json',
    integrityEngine: '/data/exposure-integrity-engine.json',
    hitListData: '/data/cinematic-hit-list.json',
    home: '/',
    timers: '/timers.html',
    subjectIndex: '/subject-index.html',
    predators: '/predators-in-power.html',
    darkFiles: '/dark-speculation-lab.html',
    corrections: '/trust-corrections.html',
    gatesTop52: '/top-52/bill-gates.html',
    gatesBillionaire: '/billionaire-briefs/bill-gates.html',
    newsletter: '/newsletter.html',
    newsletterRuntime: '/newsletter.js'
  };
  const fetched = await Promise.all(Object.entries(routes).map(async ([key, route]) => [key, await fetchRoute(route)]));
  const responses = Object.fromEntries(fetched);
  const manifest = parseJson(responses.manifest.text);
  const health = parseJson(responses.health.text);
  const ledger = parseJson(responses.evidenceLedger.text);
  const engine = parseJson(responses.integrityEngine.text);
  const hitData = parseJson(responses.hitListData.text);
  const ledgerCheck = validateLedger(ledger);
  const engineCheck = validateEngine(engine);
  const hitListCheck = validateHitList(hitData);

  const manifestOk = responses.manifest.ok && manifest?.ok === true && manifest?.commitSha === expectedSha;
  const healthOk = responses.health.ok
    && health?.ok === true
    && health?.buildSha === expectedSha
    && health?.manifestSha === expectedSha
    && health?.manifestMatches === true
    && health?.workerScript === 'src/worker-production.js';
  const hitListHtmlOk = pageCheck(responses.hitListHtml, ['THE HIT', 'Investigative priority—not guilt', 'id="hit-search"', 'data-hit-card', 'data/exposure-evidence-ledger.json']);
  const hitListCleanOk = pageCheck(responses.hitListClean, ['THE HIT', 'Investigative priority—not guilt', 'id="hit-search"', 'data-hit-card']);
  const hitListRouteOk = hitListHtmlOk || hitListCleanOk;
  const hitListWafBounded = !hitListRouteOk
    && [responses.hitListHtml, responses.hitListClean].every(response => response.status === 403 && response.headers['cf-ray'])
    && ledgerCheck.ok && engineCheck.ok && hitListCheck.ok;

  const linkedPages = {
    home: pageCheck(responses.home, ['hit-list.html']),
    timers: pageCheck(responses.timers, ['hit-list.html']),
    subjectIndex: pageCheck(responses.subjectIndex, ['hit-list.html']),
    predators: pageCheck(responses.predators, ['hit-list.html']),
    darkFiles: pageCheck(responses.darkFiles, ['hit-list.html']),
    corrections: responses.corrections.ok && /correction|right of reply/i.test(responses.corrections.text),
    gatesTop52: pageCheck(responses.gatesTop52, ['/hit-list.html', 'Continue the investigation']),
    gatesBillionaire: pageCheck(responses.gatesBillionaire, ['/hit-list.html', 'Continue the investigation'])
  };
  const linkedPagesOk = Object.values(linkedPages).every(Boolean);

  const newsletterRuntimeOk = responses.newsletterRuntime.ok
    && responses.newsletterRuntime.text.includes('/newsletter-signup')
    && responses.newsletterRuntime.text.includes('marketingConsent')
    && responses.newsletterRuntime.text.includes('activate reports');
  const newsletterHtmlOk = responses.newsletter.ok
    && responses.newsletter.text.includes('newsletter-public-value:start')
    && responses.newsletter.text.includes('placeholder="you@example.com"');
  const newsletterWafBounded = responses.newsletter.status === 403
    && Boolean(responses.newsletter.headers['cf-ray'])
    && newsletterRuntimeOk;
  const newsletterOk = newsletterHtmlOk || newsletterWafBounded;

  const protectedBoundaries = await verifyProtectedBoundaries();
  const statuses = Object.fromEntries(Object.entries(responses).map(([key, response]) => [key, response.status]));
  const cfRays = Object.fromEntries(Object.entries(responses)
    .filter(([, response]) => response.headers['cf-ray'])
    .map(([key, response]) => [key, response.headers['cf-ray']]));
  const checks = {
    manifest: manifestOk,
    health: healthOk,
    evidenceLedger: responses.evidenceLedger.ok && ledgerCheck.ok,
    integrityEngine: responses.integrityEngine.ok && engineCheck.ok,
    hitListData: responses.hitListData.ok && hitListCheck.ok,
    hitListRoute: hitListRouteOk || hitListWafBounded,
    linkedPages: linkedPagesOk,
    newsletter: newsletterOk,
    protectedBoundaries: protectedBoundaries.ok
  };
  return {
    ok: Object.values(checks).every(Boolean),
    checkedAt: new Date().toISOString(),
    siteUrl,
    expectedSha,
    manifestSha: manifest?.commitSha || null,
    workerVersionEvidence: health?.buildSha || null,
    checks,
    statuses,
    cfRays,
    hitListRouteProof: { hitListHtmlOk, hitListCleanOk, hitListWafBounded },
    linkedPages,
    newsletterProof: { newsletterHtmlOk, newsletterRuntimeOk, newsletterWafBounded },
    ledgerCheck,
    engineCheck,
    hitListCheck,
    protectedBoundaries,
    boundary: 'A Cloudflare 403 is accepted only for the newsletter or both equivalent Hit List HTML routes when a CF-Ray is present and independent live runtime/data proof passes. No data, manifest, health or protected-boundary failure is downgraded.'
  };
}

(async () => {
  let report = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      report = await verifyOnce();
    } catch (error) {
      report = { ok: false, checkedAt: new Date().toISOString(), siteUrl, expectedSha, error: error.stack || error.message };
    }
    report.attempt = attempt;
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    if (report.ok) {
      console.log(`Live Exposure Integrity verification PASS for ${expectedSha.slice(0, 12)} on attempt ${attempt}.`);
      return;
    }
    if (attempt < attempts) await sleep(delayMs);
  }
  console.error('Live Exposure Integrity verification failed:', JSON.stringify(report, null, 2));
  process.exit(1);
})().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
