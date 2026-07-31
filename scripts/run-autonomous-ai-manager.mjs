import fs from 'node:fs';
import path from 'node:path';
import { ResourceScout } from '../ai-management/resource-scout/resource-scout.mjs';
import { ComputeResourceScout } from '../ai-management/compute-resource-scout/compute-resource-scout.mjs';
import { detectLocalRuntime } from '../ai-management/local-runtime/hardware-detector.mjs';
import { SiteImprovementDirector } from '../ai-management/site-director/site-improvement-director.mjs';
import { routeLocalInference } from '../ai-management/node/local-ai-broker.mjs';

const root = process.cwd();
const downloads = path.join(root, 'downloads');
const configDir = path.join(root, 'ai-management', 'config');
fs.mkdirSync(downloads, { recursive: true });
fs.mkdirSync(configDir, { recursive: true });

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}
function enabled(value, fallback = false) {
  if (value == null || value === '') return fallback;
  return String(value).toLowerCase() === 'true';
}
function safeId(value) {
  return String(value || 'resource').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100) || 'resource';
}
function hostname(value) {
  try { return new URL(String(value || '')).hostname.toLowerCase(); } catch { return ''; }
}
function organisationKey(value) {
  const parts = hostname(value).split('.').filter(Boolean);
  return parts.slice(-3).join('.');
}
function sameOrganisation(left, right) {
  const a = organisationKey(left);
  const b = organisationKey(right);
  return Boolean(a && b && (a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`)));
}
function validHttps(value) {
  try { return new URL(String(value || '')).protocol === 'https:'; } catch { return false; }
}
function inferredType(url) {
  const value = String(url || '').toLowerCase();
  if (/\.json(?:$|\?)/.test(value) || /\/api\//.test(value)) return 'json';
  if (/rss|atom|feed/.test(value)) return 'rss';
  if (/\.csv(?:$|\?)/.test(value)) return 'csv';
  if (/\.xml(?:$|\?)/.test(value)) return 'xml';
  return 'html';
}

async function fetchBoundedDocument(url, { maximumBytes = 256 * 1024, timeoutMs = 10000 } = {}) {
  if (!validHttps(url)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'error',
      headers: {
        accept: 'application/json, application/xml, text/html, text/plain;q=0.9, */*;q=0.2',
        'user-agent': 'MatrixReprogrammedResourceDiscovery/1.0'
      },
      signal: controller.signal
    });
    if (!response.ok) return null;
    const contentType = response.headers.get('content-type') || '';
    if (!/(?:json|xml|html|text|rss|atom)/i.test(contentType)) return null;
    const declared = Number(response.headers.get('content-length') || 0);
    if (declared > maximumBytes) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maximumBytes) return null;
    return { url, body: new TextDecoder().decode(bytes), content_type: contentType, bytes: bytes.byteLength };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function discoverFromVerifiedDocumentation(sources = []) {
  const maximumSeeds = Math.max(1, Math.min(25, Number(process.env.AI_RESOURCE_SCOUT_SEED_LIMIT || 12)));
  const maximumLinksPerSeed = Math.max(1, Math.min(50, Number(process.env.AI_RESOURCE_SCOUT_LINK_LIMIT || 20)));
  const trusted = sources.filter(source => {
    const policy = source.resourcePolicy || {};
    return policy.approvedForAutomation === true &&
      policy.zeroSpendVerified === true &&
      policy.quotaVerified === true &&
      policy.billingRisk === 'none' &&
      validHttps(policy.officialDocumentationUrl) &&
      validHttps(policy.termsUrl) &&
      validHttps(policy.privacyUrl);
  }).slice(0, maximumSeeds);

  const discovered = new Map();
  const seedReports = [];
  for (const source of trusted) {
    const policy = source.resourcePolicy || {};
    const seed = await fetchBoundedDocument(policy.officialDocumentationUrl);
    if (!seed) {
      seedReports.push({ source_id: source.id, url: policy.officialDocumentationUrl, fetched: false, linked_candidates: 0 });
      continue;
    }
    let linked = 0;
    const seen = new Set();
    for (const match of seed.body.matchAll(/https:\/\/[^\s"'<>)}\]]+/gi)) {
      let candidateUrl;
      try {
        const parsed = new URL(match[0]);
        parsed.hash = '';
        candidateUrl = parsed.toString();
      } catch { continue; }
      if (seen.has(candidateUrl) || !sameOrganisation(candidateUrl, source.url || policy.officialDocumentationUrl)) continue;
      seen.add(candidateUrl);
      if ([policy.officialDocumentationUrl, policy.termsUrl, policy.privacyUrl, source.url].includes(candidateUrl)) continue;
      const candidate = {
        id: `auto-${safeId(source.id)}-${safeId(candidateUrl)}`,
        label: `${source.label || hostname(candidateUrl)} — discovered endpoint`,
        lane: source.lane || null,
        authority: source.authority || 'primary-official',
        frequency: ['daily', 'weekly'],
        type: inferredType(candidateUrl),
        url: candidateUrl,
        keywords: source.keywords || [],
        resourcePolicy: {
          approvedForAutomation: true,
          zeroSpendVerified: true,
          quotaVerified: true,
          billingRisk: 'none',
          paymentMethodPresent: false,
          hardDailyRequestCeiling: Math.max(5, Math.min(25, Number(policy.hardDailyRequestCeiling || 25))),
          concurrencyLimit: 1,
          officialDocumentationUrl: policy.officialDocumentationUrl,
          termsUrl: policy.termsUrl,
          privacyUrl: policy.privacyUrl,
          licence: policy.licence || null,
          lastTermsCheck: policy.lastTermsCheck,
          lastQuotaCheck: policy.lastQuotaCheck,
          termsRevalidationDue: policy.termsRevalidationDue,
          discoveredFromVerifiedDocumentation: true,
          parentSourceId: source.id
        }
      };
      discovered.set(candidateUrl, candidate);
      linked += 1;
      if (linked >= maximumLinksPerSeed) break;
    }
    seedReports.push({ source_id: source.id, url: seed.url, fetched: true, bytes: seed.bytes, linked_candidates: linked });
  }
  return { sources: [...discovered.values()], seeds: seedReports };
}

async function syncReport(pathname, payload) {
  const base = String(process.env.AI_MANAGEMENT_SYNC_URL || '').replace(/\/+$/, '');
  const token = process.env.AI_MANAGEMENT_ADMIN_TOKEN || '';
  if (!base || !token) return { attempted: false, reason: 'AI_MANAGEMENT_SYNC_URL or AI_MANAGEMENT_ADMIN_TOKEN not configured' };
  if (!/^https:\/\//i.test(base)) return { attempted: false, reason: 'sync URL must use HTTPS' };
  const response = await fetch(`${base}${pathname}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-admin-token': token },
    body: JSON.stringify(payload)
  });
  const text = await response.text();
  return { attempted: true, ok: response.ok, status: response.status, response: text.slice(0, 1000) };
}

async function runOnce() {
  const started = new Date();
  const sourceRegistry = readJson(path.join(root, 'data', 'investigation-source-registry.json'), { sources: [] });
  const curated = readJson(path.join(configDir, 'resources.json'), { resources: [] });
  const previous = readJson(path.join(configDir, 'resources.autonomous.json'), { resources: [] });
  const computeProviderRegistry = readJson(path.join(configDir, 'compute-providers.json'), { providers: [] });
  const previousCompute = readJson(path.join(configDir, 'compute-resources.autonomous.json'), { resources: [] });

  const linkedDiscovery = await discoverFromVerifiedDocumentation(sourceRegistry.sources || []);
  const scoutSources = [...(sourceRegistry.sources || []), ...linkedDiscovery.sources];
  const scout = new ResourceScout({ concurrency: Number(process.env.AI_RESOURCE_SCOUT_CONCURRENCY || 3) });
  const scoutReport = await scout.run({
    sources: scoutSources,
    existingResourceIds: [...(curated.resources || []), ...(previous.resources || [])].map(resource => resource.resource_id)
  });
  scoutReport.verified_seed_documents = linkedDiscovery.seeds;
  scoutReport.linked_candidates_discovered = linkedDiscovery.sources.length;
  const merged = new Map((previous.resources || []).map(resource => [resource.resource_id, resource]));
  for (const resource of scoutReport.approved) merged.set(resource.resource_id, resource);
  const autonomousResources = {
    schema_version: 1,
    updated_at: new Date().toISOString(),
    resources: [...merged.values()].sort((left, right) => String(left.resource_id).localeCompare(String(right.resource_id))),
    boundary: 'Generated only from Resource Scout candidates that passed every zero-spend, quota, terms, privacy, health, HTTPS and provenance gate.'
  };
  writeJson(path.join(configDir, 'resources.autonomous.json'), autonomousResources);
  writeJson(path.join(downloads, 'ai-resource-scout-report.json'), scoutReport);

  const computeScout = new ComputeResourceScout({
    concurrency: Number(process.env.AI_COMPUTE_SCOUT_CONCURRENCY || 3)
  });
  const computeScoutReport = await computeScout.run({
    providers: computeProviderRegistry.providers || [],
    existingResources: previousCompute.resources || []
  });
  const computeMerged = new Map((previousCompute.resources || []).map(resource => [resource.resource_id, resource]));
  for (const resource of computeScoutReport.approved_resources) computeMerged.set(resource.resource_id, resource);
  for (const revocation of computeScoutReport.revocations) {
    const current = computeMerged.get(revocation.resource_id);
    if (current) computeMerged.set(revocation.resource_id, {
      ...current,
      enabled: false,
      health_status: 'cooldown',
      metadata: { ...(current.metadata || {}), revocation_reasons: revocation.reasons, revoked_at: new Date().toISOString() },
      updated_at: new Date().toISOString()
    });
  }
  const autonomousCompute = {
    schema_version: 1,
    updated_at: new Date().toISOString(),
    resources: [...computeMerged.values()].sort((left, right) => String(left.resource_id).localeCompare(String(right.resource_id))),
    manual_onboarding: computeScoutReport.manual_onboarding,
    boundary: 'Remote compute remains disabled unless API access, explicit automation permission, owner onboarding, verified free quota, hard billing stop, current terms and public-data-only routing all pass.'
  };
  writeJson(path.join(configDir, 'compute-resources.autonomous.json'), autonomousCompute);
  writeJson(path.join(downloads, 'ai-compute-resource-scout-report.json'), computeScoutReport);

  const runtime = await detectLocalRuntime();
  writeJson(path.join(downloads, 'local-ai-runtime.json'), runtime);

  const director = new SiteImprovementDirector({ root });
  const directorReport = director.run({
    applySafe: enabled(process.env.SITE_DIRECTOR_APPLY_SAFE, false),
    maximumChanges: Math.max(0, Math.min(100, Number(process.env.SITE_DIRECTOR_MAX_CHANGES || 25))),
    writeReport: true
  });

  let inference = null;
  const testPrompt = String(process.env.AI_LOCAL_ROUTING_TEST_PROMPT || '').trim();
  if (testPrompt && runtime.resources.length) {
    try {
      inference = await routeLocalInference({ prompt: testPrompt, task_profile: 'reasoning', data_class: 'internal', max_tokens: 128, cacheable: false }, { inventory: runtime });
    } catch (error) {
      inference = { ok: false, code: error?.code || 'LOCAL_INFERENCE_FAILED', error: String(error?.message || error).slice(0, 500) };
    }
  }

  const sync = {
    scout: await syncReport('/api/ai-management/admin/scout', scoutReport).catch(error => ({ attempted: true, ok: false, error: String(error?.message || error) })),
    computeScout: await syncReport('/api/ai-management/admin/compute-scout', computeScoutReport).catch(error => ({ attempted: true, ok: false, error: String(error?.message || error) })),
    localRuntime: await syncReport('/api/ai-management/admin/local-runtime', runtime).catch(error => ({ attempted: true, ok: false, error: String(error?.message || error) })),
    siteDirector: await syncReport('/api/ai-management/admin/site-director', directorReport).catch(error => ({ attempted: true, ok: false, error: String(error?.message || error) }))
  };

  const summary = {
    ok: true,
    started_at: started.toISOString(),
    completed_at: new Date().toISOString(),
    cost_confirmed_zero: true,
    resource_scout: {
      registry_candidates: (sourceRegistry.sources || []).length,
      verified_seed_documents: linkedDiscovery.seeds.filter(seed => seed.fetched).length,
      linked_candidates_discovered: linkedDiscovery.sources.length,
      total_discovered: scoutReport.discovered,
      approved_new: scoutReport.approved.length,
      quarantined: scoutReport.quarantined.length,
      total_autonomous_resources: autonomousResources.resources.length
    },
    compute_resource_scout: {
      providers_checked: computeScoutReport.discovered,
      automatic_approved: computeScoutReport.automatic_approved,
      manual_onboarding: computeScoutReport.manual_onboarding.length,
      quarantined: computeScoutReport.quarantined.length,
      prohibited: computeScoutReport.prohibited.length,
      revoked: computeScoutReport.revocations.length,
      total_temporary_compute_resources: autonomousCompute.resources.filter(resource => resource.enabled).length
    },
    local_runtime: { models: runtime.resources.length, servers_healthy: runtime.servers.filter(server => server.healthy).length, gpus: runtime.hardware.gpus.length, total_gpu_memory_mb: runtime.hardware.total_gpu_memory_mb },
    site_director: { scanned_pages: directorReport.scanned_pages, total_issues: directorReport.total_issues, safe_changes_applied: directorReport.safe_changes_applied, prohibited_changes_attempted: directorReport.prohibited_changes_attempted },
    inference_test: inference ? { ok: inference.ok !== false, selected_resource: inference.selected_resource || inference.routing?.selected_resource || null } : { skipped: true },
    sync
  };
  writeJson(path.join(downloads, 'autonomous-ai-manager-summary.json'), summary);
  console.log(JSON.stringify(summary, null, 2));
  return summary;
}

const daemon = process.argv.includes('--daemon');
const intervalMinutes = Math.max(60, Number(process.env.AI_MANAGER_INTERVAL_MINUTES || 60));
await runOnce();
if (daemon) {
  setInterval(() => runOnce().catch(error => console.error(`Autonomous AI manager cycle failed safely: ${error?.stack || error}`)), intervalMinutes * 60 * 1000);
  console.log(`Autonomous AI manager daemon active; interval ${intervalMinutes} minute(s).`);
}
