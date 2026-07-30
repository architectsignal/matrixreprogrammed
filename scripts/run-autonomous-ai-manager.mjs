import fs from 'node:fs';
import path from 'node:path';
import { ResourceScout } from '../ai-management/resource-scout/resource-scout.mjs';
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

  const scout = new ResourceScout({ concurrency: Number(process.env.AI_RESOURCE_SCOUT_CONCURRENCY || 3) });
  const scoutReport = await scout.run({
    sources: sourceRegistry.sources || [],
    existingResourceIds: [...(curated.resources || []), ...(previous.resources || [])].map(resource => resource.resource_id)
  });
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
    localRuntime: await syncReport('/api/ai-management/admin/local-runtime', runtime).catch(error => ({ attempted: true, ok: false, error: String(error?.message || error) })),
    siteDirector: await syncReport('/api/ai-management/admin/site-director', directorReport).catch(error => ({ attempted: true, ok: false, error: String(error?.message || error) }))
  };

  const summary = {
    ok: true,
    started_at: started.toISOString(),
    completed_at: new Date().toISOString(),
    cost_confirmed_zero: true,
    resource_scout: { discovered: scoutReport.discovered, approved_new: scoutReport.approved.length, quarantined: scoutReport.quarantined.length, total_autonomous_resources: autonomousResources.resources.length },
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
