import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildLocalModelResources,
  detectHardware,
  discoverLocalModelServers,
  isLoopbackUrl
} from '../ai-management/local-runtime/hardware-detector.mjs';
import { modelCompatibility, routeLocalModel } from '../ai-management/local-runtime/model-router.mjs';
import { ResourceScout } from '../ai-management/resource-scout/resource-scout.mjs';
import { SiteImprovementDirector } from '../ai-management/site-director/site-improvement-director.mjs';

const root = process.cwd();
const fixedNow = new Date('2026-07-30T12:00:00.000Z');
const clock = () => fixedNow;

assert.equal(isLoopbackUrl('http://127.0.0.1:11434/api/tags'), true);
assert.equal(isLoopbackUrl('http://localhost:1234/v1/models'), true);
assert.equal(isLoopbackUrl('https://example.com/v1/models'), false);

const fakeExec = command => {
  if (command === 'nvidia-smi') return 'NVIDIA RTX Test, 24576, 20000, 11, 999.1';
  throw new Error('not installed');
};
const hardware = detectHardware({ platform: 'linux', execFile: fakeExec, clock });
assert.equal(hardware.gpus.length, 1);
assert.equal(hardware.gpus[0].vendor, 'nvidia');
assert.equal(hardware.total_gpu_memory_mb, 24576);
assert.equal(hardware.free_gpu_memory_mb, 20000);

const localFetch = async url => {
  if (String(url).includes('11434/api/tags')) {
    return new Response(JSON.stringify({
      models: [{
        name: 'qwen3:14b-q4_K_M',
        size: 9000000000,
        modified_at: fixedNow.toISOString(),
        details: { parameter_size: '14B', quantization_level: 'Q4_K_M', context_length: 65536 }
      }]
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
};
const servers = await discoverLocalModelServers({
  fetchImpl: localFetch,
  clock,
  endpoints: [{ protocol: 'ollama', url: 'http://127.0.0.1:11434/api/tags' }]
});
assert.equal(servers.length, 1);
assert.equal(servers[0].healthy, true);
assert.equal(servers[0].models[0].parameters_billion, 14);

const modelResources = buildLocalModelResources({ hardware, servers, clock });
assert.equal(modelResources.length, 1);
assert.equal(modelResources[0].metadata.local, true);
assert.equal(modelResources[0].metadata.model_id, 'qwen3:14b-q4_K_M');
assert.equal(modelResources[0].billing_enabled, false);
assert.equal(modelResources[0].monetary_cost_per_unit_eur, 0);

const smallModel = {
  ...modelResources[0],
  resource_id: 'local-llm-test-small',
  service_name: 'small-3b',
  quality_score: 72,
  latency_score: 100,
  metadata: {
    ...modelResources[0].metadata,
    model_id: 'small-3b-q4',
    parameters_billion: 3,
    context_length: 8192,
    estimated_vram_gb: 2
  }
};
const routingJob = {
  job_type: 'llm.generate',
  capability_type: 'llm',
  data_class: 'internal',
  payload: {
    metadata_only_routing: true,
    prompt_tokens_estimate: 12000,
    max_tokens: 2000,
    task_profile: 'reasoning',
    task_tags: ['long-context']
  },
  requirements: { allow_cpu_fallback: false }
};
const route = routeLocalModel([smallModel, modelResources[0]], routingJob, { now: fixedNow });
assert.equal(route.selected.resource.resource_id, modelResources[0].resource_id);
assert.ok(route.excluded.some(item => item.resource_id === smallModel.resource_id && item.reasons.includes('context-window-too-small')));
const compatibility = modelCompatibility(modelResources[0], routingJob, { now: fixedNow });
assert.equal(compatibility.prompt_tokens_estimate, 12000);
assert.equal(compatibility.eligible, true);

const approvedSource = {
  id: 'approved-official-api',
  label: 'Approved official API',
  lane: 'oversight-audit',
  authority: 'primary-official',
  type: 'json',
  url: 'https://api.example.gov/data.json',
  resourcePolicy: {
    approvedForAutomation: true,
    zeroSpendVerified: true,
    quotaVerified: true,
    billingRisk: 'none',
    paymentMethodPresent: false,
    hardDailyRequestCeiling: 25,
    concurrencyLimit: 1,
    officialDocumentationUrl: 'https://api.example.gov/docs',
    termsUrl: 'https://api.example.gov/terms',
    privacyUrl: 'https://api.example.gov/privacy',
    licence: 'open government data',
    lastTermsCheck: fixedNow.toISOString(),
    lastQuotaCheck: fixedNow.toISOString(),
    termsRevalidationDue: '2026-08-29T00:00:00.000Z'
  }
};
const uncertainSource = {
  ...approvedSource,
  id: 'uncertain-api',
  label: 'Uncertain API',
  url: 'https://api.example.gov/uncertain.json',
  resourcePolicy: { ...approvedSource.resourcePolicy, billingRisk: 'unknown', zeroSpendVerified: false }
};
const scoutFetch = async url => {
  const value = String(url);
  if (value.endsWith('/docs')) {
    return new Response('<html><body>Free public API. No API key or registration. Available at no cost.</body></html>', {
      status: 200,
      headers: { 'content-type': 'text/html' }
    });
  }
  if (value.endsWith('/terms')) {
    return new Response('This public API is free of charge and has no paid fallback.', {
      status: 200,
      headers: { 'content-type': 'text/plain' }
    });
  }
  if (value.endsWith('/privacy')) {
    return new Response('Public privacy notice.', { status: 200, headers: { 'content-type': 'text/plain' } });
  }
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
};
const scout = new ResourceScout({ fetchImpl: scoutFetch, clock, concurrency: 2 });
const scoutReport = await scout.run({ sources: [approvedSource, uncertainSource] });
assert.equal(scoutReport.discovered, 2);
assert.equal(scoutReport.approved.length, 1);
assert.equal(scoutReport.approved[0].billing_enabled, false);
assert.equal(scoutReport.approved[0].payment_method_present, false);
assert.equal(scoutReport.quarantined.length, 1);
assert.ok(scoutReport.quarantined[0].reasons.includes('billing-risk-not-zero'));

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-site-director-'));
try {
  fs.mkdirSync(path.join(temporaryRoot, 'data'), { recursive: true });
  const publicFile = path.join(temporaryRoot, 'index.html');
  const protectedFile = path.join(temporaryRoot, 'data', 'protected.html');
  const publicBefore = '<html><head><title>Test Page</title></head><body><a href="https://example.com" target="_blank">Open</a></body></html>';
  const protectedBefore = '<html><head><title>Protected</title></head><body><a href="https://example.com" target="_blank">Open</a></body></html>';
  fs.writeFileSync(publicFile, publicBefore);
  fs.writeFileSync(protectedFile, protectedBefore);

  const director = new SiteImprovementDirector({ root: temporaryRoot, clock });
  const directorReport = director.run({ applySafe: true, maximumChanges: 10, writeReport: true });
  const publicAfter = fs.readFileSync(publicFile, 'utf8');
  const protectedAfter = fs.readFileSync(protectedFile, 'utf8');
  assert.match(publicAfter, /<html lang="en">/i);
  assert.match(publicAfter, /name="description"/i);
  assert.match(publicAfter, /rel="noopener noreferrer"/i);
  assert.equal(protectedAfter, protectedBefore);
  assert.equal(directorReport.safe_changes_applied, 1);
  assert.equal(directorReport.prohibited_changes_attempted, 0);
  assert.ok(directorReport.boundaries.prohibited.includes('payments'));
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}

const workerSource = fs.readFileSync(path.join(root, 'src', 'worker-ai-management.js'), 'utf8');
const productionWrapper = fs.readFileSync(path.join(root, 'src', 'worker-production-autonomy.js'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'migrations', 'phase10_ai_autonomy.sql'), 'utf8');
const wranglerToml = fs.readFileSync(path.join(root, 'wrangler.toml'), 'utf8');
const wranglerJson = fs.readFileSync(path.join(root, 'wrangler.jsonc'), 'utf8');
const managerSource = fs.readFileSync(path.join(root, 'scripts', 'run-autonomous-ai-manager.mjs'), 'utf8');
const taskLedger = fs.readFileSync(path.join(root, 'ai-management', 'TASK_LEDGER.md'), 'utf8');

assert.match(workerSource, /containsPromptMaterial/);
assert.doesNotMatch(workerSource, /prompt:\s*body\.prompt/);
assert.doesNotMatch(workerSource, /messages:\s*body\.messages/);
assert.match(workerSource, /Prompt material is forbidden/);
assert.match(workerSource, /promptReceived:\s*false/);
assert.match(workerSource, /promptTransferred:\s*false/);
assert.match(migration, /CREATE TABLE IF NOT EXISTS ai_model_routing_decisions/);
assert.match(migration, /prompt_received INTEGER NOT NULL DEFAULT 0 CHECK \(prompt_received = 0\)/);
assert.match(wranglerToml, /main = "src\/worker-production-autonomy\.js"/);
assert.match(wranglerJson, /"main": "src\/worker-production-autonomy\.js"/);
for (const flag of ['AI_RESOURCE_AUTO_APPROVAL_ENABLED', 'AI_LOCAL_MODEL_ROUTING_ENABLED', 'AI_SITE_DIRECTOR_ENABLED']) {
  assert.match(wranglerToml, new RegExp(`${flag} = "false"`));
  assert.match(wranglerJson, new RegExp(`"${flag}": "false"`));
}
assert.match(productionWrapper, /productionWorker\.scheduled/);
assert.match(productionWrapper, /aiManagementWorker\.scheduled/);
assert.match(managerSource, /discoverFromVerifiedDocumentation/);
assert.match(managerSource, /linked_candidates_discovered/);
assert.match(taskLedger, /## Priority lock/);
assert.match(taskLedger, /must not be deferred/);

console.log('AI autonomy tests passed: automatic Scout approval and quarantine, bounded discovery contract, local GPU and model detection, metadata-only intelligent routing, prompt-leak prevention, safe Site Director boundaries, D1 routing ledger and production wrapper wiring.');
