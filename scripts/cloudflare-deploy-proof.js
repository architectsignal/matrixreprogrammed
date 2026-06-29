const fs = require('fs');
const path = require('path');

const root = process.cwd();
const reportPath = path.join(root, 'cloudflare-deploy-proof-report.json');
const API = 'https://api.cloudflare.com/client/v4';
const token = process.env.CLOUDFLARE_API_TOKEN || '';
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || '';
const zoneName = process.env.CLOUDFLARE_ZONE_NAME || 'matrixreprogrammed.com';
const scriptName = process.env.CLOUDFLARE_WORKER_NAME || 'matrixreprogrammed';
const expectedSha = process.env.EXPECTED_BUILD_SHA || process.env.GITHUB_SHA || '';
const hosts = ['matrixreprogrammed.com', 'www.matrixreprogrammed.com'];
const routePatterns = hosts.map(host => `${host}/*`);

const report = {
  ok: false,
  checkedAt: new Date().toISOString(),
  accountIdPresent: Boolean(accountId),
  zoneName,
  scriptName,
  expectedSha: expectedSha || null,
  zone: null,
  workerScript: null,
  deployments: [],
  routes: [],
  dns: [],
  publicCanaries: [],
  errors: [],
  warnings: [],
  summary: {}
};

function save() {
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
}
function warn(message, detail) {
  report.warnings.push({ message, detail: detail || null });
}
function error(message, detail) {
  report.errors.push({ message, detail: detail || null });
}
function authHeaders(extra = {}) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...extra };
}
async function cf(pathname, options = {}) {
  const res = await fetch(`${API}${pathname}`, { ...options, headers: authHeaders(options.headers || {}) });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  if (!res.ok || body.success === false) {
    const err = new Error(`Cloudflare API ${options.method || 'GET'} ${pathname} failed: HTTP ${res.status}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}
function arrayResult(body) {
  if (Array.isArray(body && body.result)) return body.result;
  if (Array.isArray(body && body.result && body.result.items)) return body.result.items;
  return [];
}
function isChallenge(status, text) {
  return status === 403 && /Just a moment|cf-chl|challenge-platform|checking your browser|Cloudflare Ray ID/i.test(text || '');
}
async function getZone() {
  const params = new URLSearchParams({ name: zoneName, status: 'active', per_page: '20' });
  const body = await cf(`/zones?${params}`);
  const zone = arrayResult(body).find(item => item.name === zoneName) || arrayResult(body)[0];
  if (!zone) throw new Error(`No active Cloudflare zone found for ${zoneName}`);
  report.zone = { id: zone.id, name: zone.name, status: zone.status, paused: zone.paused, type: zone.type };
  return zone;
}
async function verifyWorkerScript() {
  if (!accountId) {
    warn('CLOUDFLARE_ACCOUNT_ID missing; cannot inspect Worker script metadata.');
    return;
  }
  try {
    const body = await cf(`/accounts/${accountId}/workers/scripts/${scriptName}`);
    report.workerScript = {
      exists: true,
      id: body.result && (body.result.id || body.result.script_name || scriptName),
      handlers: body.result && body.result.handlers,
      modified_on: body.result && body.result.modified_on,
      created_on: body.result && body.result.created_on
    };
  } catch (err) {
    error('Could not confirm deployed Worker script via Cloudflare API.', err.body || err.message);
  }
}
async function readDeployments() {
  if (!accountId) return;
  try {
    const body = await cf(`/accounts/${accountId}/workers/scripts/${scriptName}/deployments`);
    report.deployments = arrayResult(body).slice(0, 5).map(item => ({
      id: item.id,
      source: item.source,
      strategy: item.strategy,
      author_email: item.author_email,
      created_on: item.created_on,
      annotations: item.annotations || null,
      versions: item.versions || []
    }));
  } catch (err) {
    warn('Could not read Worker deployment history. This is advisory and does not mean deploy failed.', err.body || err.message);
  }
}
async function verifyRoutes(zoneId) {
  const body = await cf(`/zones/${zoneId}/workers/routes?per_page=100`);
  const existing = arrayResult(body);
  report.routes = routePatterns.map(pattern => {
    const route = existing.find(item => item.pattern === pattern);
    return route ? { pattern, ok: route.script === scriptName, id: route.id, script: route.script } : { pattern, ok: false, missing: true };
  });
}
async function verifyDns(zoneId) {
  for (const host of hosts) {
    try {
      const params = new URLSearchParams({ name: host, per_page: '100' });
      const body = await cf(`/zones/${zoneId}/dns_records?${params}`);
      const records = arrayResult(body);
      report.dns.push({
        host,
        ok: records.some(record => record.proxied),
        unknown: false,
        records: records.map(record => ({ type: record.type, name: record.name, content: record.content, proxied: record.proxied, ttl: record.ttl }))
      });
    } catch (err) {
      report.dns.push({ host, ok: false, unknown: true, error: err.message });
      warn(`Could not inspect DNS for ${host}. DNS-read permission is advisory because Worker route mapping already proves Cloudflare ownership/routing.`, err.body || err.message);
    }
  }
}
async function publicCanary() {
  for (const host of hosts) {
    const url = `https://${host}/forum-health?matrix_canary=${Date.now()}`;
    try {
      const res = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'MatrixReprogrammedDeployProof/1.1' } });
      const text = await res.text();
      const challenged = isChallenge(res.status, text);
      report.publicCanaries.push({
        url,
        finalUrl: res.url,
        status: res.status,
        ok: res.status >= 200 && res.status < 400,
        challenged,
        cfRay: res.headers.get('cf-ray') || null,
        server: res.headers.get('server') || null,
        workerHeader: res.headers.get('x-matrix-origin') || null,
        matrixWorker: res.headers.get('x-matrix-worker') || null,
        markerPresent: /forumPostsBinding|cloudflare-worker|FORUM_POSTS/i.test(text),
        bodyStart: text.slice(0, 160)
      });
    } catch (err) {
      report.publicCanaries.push({ url, ok: false, challenged: false, error: err.message });
    }
  }
}
async function main() {
  if (!token) throw new Error('CLOUDFLARE_API_TOKEN missing');
  if (typeof fetch !== 'function') throw new Error('Node fetch unavailable; use Node 18+');

  try {
    const zone = await getZone();
    await verifyWorkerScript();
    await readDeployments();
    await verifyRoutes(zone.id);
    await verifyDns(zone.id);
    await publicCanary();

    const routesOk = report.routes.length === routePatterns.length && report.routes.every(route => route.ok);
    const dnsKnown = report.dns.length === hosts.length && report.dns.every(item => !item.unknown);
    const dnsOk = dnsKnown && report.dns.every(item => item.ok);
    const dnsUnknown = report.dns.length === hosts.length && report.dns.every(item => item.unknown);
    const workerOk = Boolean(report.workerScript && report.workerScript.exists);
    const publicVerified = report.publicCanaries.some(item => item.ok && (item.markerPresent || item.workerHeader || item.matrixWorker));
    const challengeOnly = report.publicCanaries.length > 0 && report.publicCanaries.every(item => item.challenged);

    if (challengeOnly) {
      warn('Cloudflare challenge blocked public GitHub canary requests. Deployment proof is based on Cloudflare API and Worker route mapping. Review WAF/Bot challenge rules for SEO and external monitors.');
    }
    if (dnsUnknown) {
      warn('DNS verification skipped because the Cloudflare token cannot read DNS records. This is not treated as a deploy failure when Worker script and route mappings are confirmed.');
    }

    report.summary = { workerOk, routesOk, dnsKnown, dnsOk, dnsUnknown, publicVerified, challengeOnly };
    report.ok = workerOk && routesOk && (dnsOk || dnsUnknown);
    save();
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exit(1);
  } catch (err) {
    error(err.message, err.body || null);
    save();
    console.error(JSON.stringify(report, null, 2));
    process.exit(1);
  }
}

main();
