const fs = require('fs');
const path = require('path');

const root = process.cwd();
const reportPath = path.join(root, 'cloudflare-domain-repair-report.json');
const API = 'https://api.cloudflare.com/client/v4';
const token = process.env.CLOUDFLARE_API_TOKEN || '';
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || '';
const zoneName = process.env.CLOUDFLARE_ZONE_NAME || 'matrixreprogrammed.com';
const scriptName = process.env.CLOUDFLARE_WORKER_NAME || 'matrixreprogrammed';
const hosts = ['matrixreprogrammed.com', 'www.matrixreprogrammed.com'];
const patterns = hosts.map(host => `${host}/*`);

const report = {
  checkedAt: new Date().toISOString(),
  zoneName,
  scriptName,
  ok: false,
  actions: [],
  warnings: [],
  errors: [],
  routes: [],
  dns: [],
  liveChecks: [],
  accessApps: [],
  wafRules: []
};

function save() { fs.writeFileSync(reportPath, JSON.stringify(report, null, 2)); }
function addError(message, detail) { report.errors.push({ message, detail: detail || null }); save(); }
function addWarning(message, detail) { report.warnings.push({ message, detail: detail || null }); }
function headers() { return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }; }
async function cf(pathname, options = {}) {
  const res = await fetch(`${API}${pathname}`, { ...options, headers: { ...headers(), ...(options.headers || {}) } });
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
async function getZone() {
  const params = new URLSearchParams({ name: zoneName, status: 'active', per_page: '20' });
  const body = await cf(`/zones?${params}`);
  const zones = body.result || [];
  const zone = zones.find(z => z.name === zoneName) || zones[0];
  if (!zone) throw new Error(`No active Cloudflare zone found for ${zoneName}`);
  report.zoneId = zone.id;
  report.zoneStatus = zone.status;
  return zone;
}
async function ensureRoutes(zoneId) {
  try {
    const routeBody = await cf(`/zones/${zoneId}/workers/routes?per_page=100`);
    const existing = routeBody.result || [];
    for (const pattern of patterns) {
      const found = existing.find(route => route.pattern === pattern);
      if (!found) {
        const created = await cf(`/zones/${zoneId}/workers/routes`, { method: 'POST', body: JSON.stringify({ pattern, script: scriptName }) });
        report.actions.push({ type: 'created-worker-route', pattern, script: scriptName, id: created.result && created.result.id });
        report.routes.push(created.result);
        continue;
      }
      if (found.script !== scriptName) {
        const updated = await cf(`/zones/${zoneId}/workers/routes/${found.id}`, { method: 'PUT', body: JSON.stringify({ pattern, script: scriptName }) });
        report.actions.push({ type: 'updated-worker-route', pattern, previousScript: found.script, script: scriptName, id: found.id });
        report.routes.push(updated.result);
        continue;
      }
      report.routes.push(found);
    }
  } catch (err) {
    addWarning('Could not inspect or repair Worker routes with current token permissions.', err.body || err.message);
  }
}
async function inspectDns(zoneId) {
  for (const host of hosts) {
    try {
      const params = new URLSearchParams({ name: host, per_page: '100' });
      const body = await cf(`/zones/${zoneId}/dns_records?${params}`);
      const records = body.result || [];
      report.dns.push({ host, records: records.map(r => ({ id: r.id, type: r.type, name: r.name, content: r.content, proxied: r.proxied, ttl: r.ttl })) });
      if (!records.length) addWarning(`No DNS record found for ${host}. Worker routes only receive traffic when the hostname resolves through Cloudflare.`);
      if (records.length && !records.some(r => r.proxied)) addWarning(`${host} has DNS records but none are proxied/orange-clouded. Worker routes need proxied Cloudflare traffic.`);
    } catch (err) {
      addWarning(`Could not inspect DNS record for ${host} with current token permissions. Repair will continue.`, err.body || err.message);
    }
  }
}
async function inspectAccessApps() {
  if (!accountId) return;
  try {
    const body = await cf(`/accounts/${accountId}/access/apps?per_page=100`);
    const apps = body.result || [];
    report.accessApps = apps
      .filter(app => hosts.some(host => JSON.stringify(app).includes(host)))
      .map(app => ({ id: app.id, name: app.name, domain: app.domain, type: app.type, aud: app.aud, self_hosted_domains: app.self_hosted_domains || [] }));
    if (report.accessApps.length) addWarning('Cloudflare Access application appears to match the production host. This can return 403 before the Worker runs. Disable or bypass Access for public site routes in Cloudflare Zero Trust.', report.accessApps);
  } catch (err) {
    addWarning('Could not inspect Cloudflare Access applications with current token permissions.', err.body || err.message);
  }
}
async function inspectRulesets(zoneId) {
  try {
    const body = await cf(`/zones/${zoneId}/rulesets`);
    const rulesets = body.result || [];
    const interesting = rulesets.filter(r => /http_request_firewall|http_request_transform|http_request_cache|http_ratelimit|http_request_redirect/i.test(`${r.phase || ''} ${r.name || ''}`));
    report.wafRules = interesting.map(r => ({ id: r.id, name: r.name, phase: r.phase, kind: r.kind, version: r.version }));
  } catch (err) {
    addWarning('Could not inspect Cloudflare rulesets with current token permissions.', err.body || err.message);
  }
}
async function purgeCache(zoneId) {
  try {
    await cf(`/zones/${zoneId}/purge_cache`, { method: 'POST', body: JSON.stringify({ purge_everything: true }) });
    report.actions.push({ type: 'purged-zone-cache', zoneId });
  } catch (err) {
    addWarning('Could not purge Cloudflare cache with current token permissions.', err.body || err.message);
  }
}
async function liveCheck() {
  for (const host of hosts) {
    const url = `https://${host}/forum-health?matrix_repair=${Date.now()}`;
    try {
      const res = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'MatrixCloudflareDomainRepair/1.1' } });
      const text = await res.text();
      const markerPresent = text.includes('forumPostsBinding') || text.includes('cloudflare-worker') || text.includes('matrixreprogrammed') || text.includes('FORUM_POSTS');
      report.liveChecks.push({
        url,
        finalUrl: res.url,
        status: res.status,
        ok: res.status >= 200 && res.status < 400,
        workerHeader: res.headers.get('x-matrix-origin') || null,
        matrixWorker: res.headers.get('x-matrix-worker') || null,
        cfRay: res.headers.get('cf-ray') || null,
        server: res.headers.get('server') || null,
        markerPresent,
        bodyStart: text.slice(0, 160)
      });
    } catch (err) {
      report.liveChecks.push({ url, ok: false, error: err.message });
    }
  }
}
async function main() {
  if (!token) throw new Error('CLOUDFLARE_API_TOKEN missing');
  if (typeof fetch !== 'function') throw new Error('Node fetch unavailable; use Node 18+');
  try {
    const zone = await getZone();
    await inspectDns(zone.id);
    await ensureRoutes(zone.id);
    await inspectAccessApps();
    await inspectRulesets(zone.id);
    await purgeCache(zone.id);
    await liveCheck();
    report.ok = report.liveChecks.some(check => check.ok && (check.workerHeader || check.matrixWorker || check.markerPresent));
    save();
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) {
      console.error('Cloudflare domain repair completed but live host still does not appear to hit the Matrix Worker. Check Access/WAF/DNS warnings in cloudflare-domain-repair-report.json.');
      process.exit(1);
    }
  } catch (err) {
    addError(err.message, err.body || null);
    console.error(JSON.stringify(report, null, 2));
    process.exit(1);
  }
}
main();
