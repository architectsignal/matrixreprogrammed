import fs from 'node:fs';
import path from 'node:path';
import { classifyAiManagementResponse } from './lib/live-ai-verification-classifier.mjs';

const siteUrl = String(process.env.SITE_URL || 'https://matrixreprogrammed.com').replace(/\/+$/, '');
const adminToken = String(process.env.ADMIN_API_TOKEN || process.env.AI_MANAGEMENT_ADMIN_TOKEN || '').trim();
const attempts = Math.max(1, Math.min(60, Number(process.env.AI_VERIFY_ATTEMPTS || 24)));
const delayMs = Math.max(250, Math.min(30000, Number(process.env.AI_VERIFY_DELAY_MS || 5000)));
const routeAttempts = Math.max(1, Math.min(12, Number(process.env.AI_VERIFY_ROUTE_ATTEMPTS || 6)));
const sendAuthorization = String(process.env.AI_VERIFY_SEND_AUTHORIZATION || '').toLowerCase() === 'true';
const outputPath = path.join(process.cwd(), 'downloads', 'live-ai-management-verification.json');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });

function sleep(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function diagnosticPreview(text = '') {
  return String(text).replace(/\s+/g, ' ').trim().slice(0, 300);
}

async function request(pathname, { method = 'GET', body, authorized = true } = {}) {
  const headers = {
    accept: 'application/json',
    'cache-control': 'no-cache',
    'user-agent': 'MatrixProductionVerifier/2.0'
  };
  if (authorized) {
    // The Worker authenticates with x-admin-token. Sending a Bearer header by
    // default can cause an upstream Access policy to intercept the request.
    headers['x-admin-token'] = adminToken;
    if (sendAuthorization) headers.authorization = `Bearer ${adminToken}`;
  }
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(`${siteUrl}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual'
  });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: diagnosticPreview(text) }; }
  return {
    requestedUrl: `${siteUrl}${pathname}`,
    responseUrl: response.url,
    status: response.status,
    ok: response.ok,
    origin: response.headers.get('x-matrix-origin'),
    authLayer: response.headers.get('x-matrix-auth-layer') || data?.authLayer || null,
    contentType: response.headers.get('content-type'),
    server: response.headers.get('server'),
    cfRay: response.headers.get('cf-ray'),
    cfMitigated: response.headers.get('cf-mitigated'),
    cfAccessApp: response.headers.get('cf-access-app'),
    cfAccessTeam: response.headers.get('cf-access-team'),
    location: response.headers.get('location'),
    data
  };
}

function responseDiagnostic(result) {
  if (!result) return null;
  return {
    status: result.status,
    origin: result.origin,
    authLayer: result.authLayer,
    contentType: result.contentType,
    server: result.server,
    cfRay: result.cfRay,
    cfMitigated: result.cfMitigated,
    cfAccessApp: result.cfAccessApp,
    cfAccessTeam: result.cfAccessTeam,
    responseUrl: result.responseUrl,
    location: result.location,
    error: result.data?.error || null,
    message: result.data?.message || null,
    preview: result.data?.raw || null
  };
}

function writeFailure(stage, result, extra = {}) {
  fs.writeFileSync(outputPath, `${JSON.stringify({
    ok: false,
    stage,
    siteUrl,
    verifiedAt: new Date().toISOString(),
    authorizationHeaderSent: sendAuthorization,
    response: responseDiagnostic(result),
    ...extra
  }, null, 2)}\n`);
}

if (!adminToken) {
  throw new Error('ADMIN_API_TOKEN or AI_MANAGEMENT_ADMIN_TOKEN is required for owner-authorized live verification');
}

let health;
const attemptsLog = [];
for (let attempt = 1; attempt <= attempts; attempt += 1) {
  try {
    health = await request('/api/ai-management/admin/health');
    const classification = classifyAiManagementResponse(health, {
      siteUrl,
      pathname: '/api/ai-management/admin/health'
    });
    attemptsLog.push({
      attempt,
      status: health.status,
      origin: health.origin,
      authLayer: health.authLayer,
      contentType: health.contentType,
      schemaReady: health.data?.schemaReady,
      autonomySchemaReady: health.data?.autonomySchemaReady,
      classification: classification.code,
      error: health.data?.error || null
    });
    if (health.ok && health.data?.schemaReady === true && health.data?.autonomySchemaReady === true) break;
  } catch (error) {
    attemptsLog.push({ attempt, error: String(error?.message || error).slice(0, 300) });
  }
  if (attempt < attempts) await sleep(delayMs);
}

if (health?.status !== 200) {
  const classification = classifyAiManagementResponse(health, {
    siteUrl,
    pathname: '/api/ai-management/admin/health'
  });
  fs.writeFileSync(outputPath, `${JSON.stringify({
    ok: false,
    siteUrl,
    verifiedAt: new Date().toISOString(),
    classification,
    remediation: classification.remediation,
    edgeBlocked: ['cloudflare-access-rejection', 'waf-or-bot-rejection'].includes(classification.code),
    authorizationHeaderSent: sendAuthorization,
    attempts: attemptsLog,
    final: responseDiagnostic(health)
  }, null, 2)}\n`);
}

assert(
  health?.status === 200,
  `AI-management health did not return 200; got ${health?.status}; origin=${health?.origin || 'missing'}; authLayer=${health?.authLayer || 'missing'}; contentType=${health?.contentType || 'missing'}`
);
assert(health.origin === 'cloudflare-worker-ai-management', `Unexpected AI-management origin: ${health.origin || 'missing'}`);
assert(health.data?.ok === true, 'AI-management health did not report ok');
assert(health.data?.schemaReady === true, 'Phase 9 AI resource schema is not ready');
assert(health.data?.autonomySchemaReady === true, 'Phase 10 AI autonomy schema is not ready');
assert(health.data?.monetaryCeilingEur === 0, 'AI-management monetary ceiling is not exactly EUR 0');
assert(health.data?.paidFallbackPossible === false, 'AI-management reports that paid fallback is possible');
assert(health.data?.flags?.zeroSpendLock === true, 'Zero-spend lock is not active');
for (const flag of ['brokerEnabled', 'externalEnabled', 'backgroundEnabled', 'scoutEnabled', 'autoApprovalEnabled', 'localModelRoutingEnabled', 'siteDirectorEnabled']) {
  assert(health.data?.flags?.[flag] === true, `${flag} is not active in production`);
}
assert(health.data?.flags?.localOnly === false, 'Approved public-source retrieval is still blocked by local-only mode');

const unauthorized = await request('/api/ai-management/admin/health', { authorized: false });
assert(unauthorized.status === 403, `Owner-only AI endpoint did not reject an unauthenticated request; got ${unauthorized.status}`);
assert(unauthorized.origin === 'cloudflare-worker-ai-management', 'Unauthorized AI response did not originate from the AI-management Worker');

const resources = await request('/api/ai-management/admin/resources');
assert(resources.status === 200 && resources.data?.ok === true, 'Live AI resource registry is unavailable');
assert(Array.isArray(resources.data?.resources), 'Live AI resource registry did not return resources');
assert(resources.data.resources.length >= 2, 'Live AI resource registry is missing the deterministic and approved public seeds');
for (const resource of resources.data.resources) {
  assert(Number(resource.monetary_cost_per_unit_eur || 0) === 0, `Resource ${resource.resource_id} has non-zero monetary cost`);
  assert(resource.billing_enabled === false, `Resource ${resource.resource_id} has billing enabled`);
  assert(resource.payment_method_present === false, `Resource ${resource.resource_id} reports a payment method`);
  assert(resource.billing_risk === 'none', `Resource ${resource.resource_id} has billing risk ${resource.billing_risk}`);
}

const scout = await request('/api/ai-management/admin/scout');
assert(scout.status === 200 && scout.data?.ok === true && Array.isArray(scout.data?.candidates), 'Live Resource Scout endpoint failed');

const localRuntime = await request('/api/ai-management/admin/local-runtime');
assert(localRuntime.status === 200 && localRuntime.data?.ok === true, 'Live local-runtime inventory endpoint failed');
assert(Array.isArray(localRuntime.data?.nodes) && Array.isArray(localRuntime.data?.models), 'Local runtime inventory has an invalid shape');
assert(String(localRuntime.data?.inferenceBoundary || '').toLowerCase().includes('prompts'), 'Local runtime response does not state the prompt-local boundary');

const capacityHealth = await request('/api/ai-management/admin/capacity-growth');
assert(capacityHealth.status === 200 && capacityHealth.data?.ok === true, 'Live zero-cost capacity health endpoint failed');
assert(capacityHealth.data?.zero_spend_lock === true && capacityHealth.data?.paid_fallback_possible === false, 'Capacity health weakened the zero-spend boundary');
const capacityCycle = await request('/api/ai-management/admin/capacity-growth', { method: 'POST', body: {} });
assert(capacityCycle.status === 200 && capacityCycle.data?.ok === true, 'Live zero-cost capacity cycle failed');
assert(capacityCycle.data?.zero_spend_lock === true && capacityCycle.data?.paid_fallback_possible === false, 'Capacity cycle weakened the zero-spend boundary');
assert(capacityCycle.data?.compute_report?.title === 'MATRIX COMPUTE REPORT', 'Capacity cycle did not produce the daily compute report');
assert(Number(capacityCycle.data?.compute_report?.confirmed_compute_cost_eur) === 0, 'Capacity report did not confirm EUR 0 execution');

const valueUnauthorized = await request('/api/ai-management/admin/value-hunter', { authorized: false });
assert(valueUnauthorized.status === 403, `Owner-only Value Hunter endpoint did not reject an unauthenticated request; got ${valueUnauthorized.status}`);
const valueStatus = await request('/api/ai-management/admin/value-hunter');
assert(valueStatus.status === 200 && valueStatus.data?.ok === true, 'Live Value Hunter status endpoint failed');
assert(valueStatus.data?.target?.currency === 'EUR' && Number(valueStatus.data?.target?.target_net_minor) === 1000000, 'Value Hunter EUR 10,000 net objective is not live');
assert(Array.isArray(valueStatus.data?.installed_collection_adapters), 'Value Hunter did not truthfully report installed collection adapters');
const valueCycle = await request('/api/ai-management/admin/value-hunter', { method: 'POST', body: {} });
assert(valueCycle.status === 200 && valueCycle.data?.ok === true, 'Live Value Hunter daily cycle failed');
assert(Number(valueCycle.data?.report?.objective?.target_net_minor) === 1000000, 'Value Hunter cycle did not preserve the EUR 10,000 objective');
assert(/deterministic proof/i.test(String(valueCycle.data?.report?.policy || '')), 'Value Hunter cycle did not prove the entitlement boundary');

const livingUnauthorized = await request('/api/matrix/admin/living-cycle', { authorized: false });
assert(livingUnauthorized.status === 403, `Owner-only Living Matrix endpoint did not reject an unauthenticated request; got ${livingUnauthorized.status}`);
const livingCycle = await request('/api/matrix/admin/living-cycle', { method: 'POST', body: {} });
assert(livingCycle.status === 200 && livingCycle.data?.ok === true, 'Live Matrix evolution cycle failed');
assert(livingCycle.data?.report?.report_type === 'Matrix Evolution Report', 'Living Matrix did not produce the daily evolution report');
assert(livingCycle.data?.report?.cost_confirmed_zero === true, 'Living Matrix report did not confirm zero monetary cost');
assert(livingCycle.data?.report?.ask_matrix?.dynamic_verified_evidence_enabled === true, 'Living Matrix did not enable dynamic verified Ask Matrix evidence');
const publicEvolution = await request('/api/matrix/evolution', { authorized: false });
assert(publicEvolution.status === 200 && publicEvolution.data?.ok === true && publicEvolution.data?.live === true, 'Public Matrix evolution state is unavailable after a completed cycle');
assert(publicEvolution.origin === 'living-matrix-cycle', `Unexpected Living Matrix origin: ${publicEvolution.origin || 'missing'}`);

const matrixOperationsUnauthorized = await request('/api/ai-management/admin/matrix-operations/doctor', { authorized: false });
assert(matrixOperationsUnauthorized.status === 403, `Owner-only Matrix operations endpoint did not reject an unauthenticated request; got ${matrixOperationsUnauthorized.status}`);
const matrixOperationsCycle = await request('/api/ai-management/admin/matrix-operations/start', { method: 'POST', body: {} });
assert(matrixOperationsCycle.status === 200 && matrixOperationsCycle.data?.ok === true, 'Live constitutional Matrix operating cycle failed');
assert(matrixOperationsCycle.origin === 'cloudflare-worker-matrix-operations', `Unexpected Matrix operations origin: ${matrixOperationsCycle.origin || 'missing'}`);
assert(matrixOperationsCycle.data?.report?.law === 'CAUSE NO HARM OR LOSS.', 'Live Matrix operating cycle did not preserve the exact law');
assert(matrixOperationsCycle.data?.report?.law_sha256 === '2f440056e992d3edbe9dcfd60a5c9d24397bb28d68e29d1d3ed476e84021b189', 'Live Matrix operating cycle law hash is invalid');
assert(matrixOperationsCycle.data?.report?.constitution_verified === true, 'Live Matrix operating cycle did not verify the immutable D1 constitution');
assert(Number(matrixOperationsCycle.data?.report?.consequential_actions_executed) === 0, 'Matrix operating cycle unexpectedly executed a consequential action');
assert(matrixOperationsCycle.data?.report?.cost_confirmed_zero === true, 'Matrix operating cycle did not confirm zero monetary cost');
const matrixOperationsDoctor = await request('/api/ai-management/admin/matrix-operations/doctor');
assert(matrixOperationsDoctor.status === 200 && matrixOperationsDoctor.data?.ok === true, 'Live Matrix operations doctor failed');
assert(matrixOperationsDoctor.data?.constitution?.valid === true, 'Live Matrix operations doctor did not verify the constitution');
assert(matrixOperationsDoctor.data?.state === 'LIVE_WORKING', `Matrix operations is not live-working after boot; got ${matrixOperationsDoctor.data?.state || 'missing'}`);
const blockedDestructiveAction = await request('/api/ai-management/admin/matrix-operations/action/check', {
  method: 'POST',
  body: { actionType: 'DELETE_DATABASE', consequenceClass: 'DESTRUCTIVE', scope: 'matrix-internal', amountMinor: 0, boundedScope: true, simulationPassed: true, rollbackReady: true }
});
assert(blockedDestructiveAction.status === 200 && blockedDestructiveAction.data?.execution_performed === false, 'Destructive action check did not remain evaluation-only');
assert(blockedDestructiveAction.data?.decision?.allowed === false && blockedDestructiveAction.data?.decision?.decision === 'BLOCKED', 'Constitutional gate did not block a destructive action');

const siteDirector = await request('/api/ai-management/admin/site-director');
assert(siteDirector.status === 200 && siteDirector.data?.ok === true && Array.isArray(siteDirector.data?.runs), 'Live Site Improvement Director endpoint failed');

const promptRejection = await request('/api/ai-management/admin/route-model', {
  method: 'POST',
  body: { prompt: 'This content must never enter Cloudflare routing.' }
});
assert(promptRejection.status === 400, `Cloudflare routing did not reject prompt material; got ${promptRejection.status}`);
assert(/prompt material is forbidden/i.test(String(promptRejection.data?.error || promptRejection.data?.message || '')), 'Prompt rejection did not identify the privacy boundary');

const routeRequest = {
  method: 'POST',
  body: {
    task_profile: 'reasoning',
    task_tags: ['investigation', 'long-context'],
    data_class: 'internal',
    prompt_tokens_estimate: 4096,
    max_tokens: 1024,
    allow_cpu_fallback: true
  }
};
let route;
const routeAttemptLog = [];
for (let attempt = 1; attempt <= routeAttempts; attempt += 1) {
  route = await request('/api/ai-management/admin/route-model', routeRequest);
  routeAttemptLog.push({ attempt, ...responseDiagnostic(route) });
  if ([200, 503].includes(route.status)) break;
  if (attempt < routeAttempts) await sleep(delayMs);
}
if (![200, 503].includes(route.status)) {
  writeFailure('metadata-route', route, {
    routeAttempts: routeAttemptLog,
    promptRejection: responseDiagnostic(promptRejection),
    health: responseDiagnostic(health)
  });
  throw new Error(`Metadata-only route endpoint returned unexpected status ${route.status}; origin=${route.origin || 'missing'}; authLayer=${route.authLayer || 'missing'}; server=${route.server || 'missing'}; cfRay=${route.cfRay || 'missing'}; error=${route.data?.error || route.data?.message || 'missing'}`);
}
if (route.status === 200) {
  assert(route.data?.promptReceived === false && route.data?.promptStored === false && route.data?.promptTransferred === false, 'Successful route did not prove prompt-free selection');
  assert(route.data?.costStatus === 'EUR 0', 'Successful route did not prove zero cost');
} else {
  assert(/no online compatible local model/i.test(String(route.data?.error || '')), '503 route response was not the expected empty-local-inventory boundary');
}

const proof = {
  ok: true,
  siteUrl,
  verifiedAt: new Date().toISOString(),
  attempts: attemptsLog,
  health: {
    schemaReady: health.data.schemaReady,
    autonomySchemaReady: health.data.autonomySchemaReady,
    flags: health.data.flags,
    counts: health.data.counts,
    monetaryCeilingEur: health.data.monetaryCeilingEur,
    paidFallbackPossible: health.data.paidFallbackPossible
  },
  unauthorized: { status: unauthorized.status, origin: unauthorized.origin },
  resources: { count: resources.data.resources.length, allZeroSpend: true },
  scout: { count: scout.data.candidates.length },
  localRuntime: { nodes: localRuntime.data.nodes.length, models: localRuntime.data.models.length },
  capacity: {
    onlineLocalNodes: capacityCycle.data.compute_report.online_local_nodes,
    usableBrokerResources: capacityCycle.data.compute_report.usable_broker_resources,
    effectiveCapacityScore: capacityCycle.data.compute_report.effective_capacity_score,
    jobsAssigned: capacityCycle.data.compute_report.jobs_assigned.length,
    zeroSpendLock: true
  },
  valueHunter: {
    targetNetMinor: valueCycle.data.report.objective.target_net_minor,
    receivedNetMinor: valueCycle.data.report.objective.received_net_minor,
    remainingNetMinor: valueCycle.data.report.objective.remaining_net_minor,
    evaluated: valueCycle.data.report.evaluated,
    readyToClaim: valueCycle.data.report.ready_to_claim,
    truthfulStatus: valueCycle.data.report.status.truthful_status,
    installedCollectionAdapters: valueCycle.data.report.status.installed_collection_adapters
  },
  livingMatrix: {
    status: livingCycle.data.status,
    cycleId: livingCycle.data.report.cycle_id,
    processedEvents: livingCycle.data.report.intelligence.processed_this_cycle,
    publicChanges: livingCycle.data.report.site.public_what_changed,
    dynamicAskMatrixEvidence: livingCycle.data.report.ask_matrix.dynamic_verified_evidence_enabled,
    costConfirmedZero: livingCycle.data.report.cost_confirmed_zero,
    unauthorizedStatus: livingUnauthorized.status,
    publicStatus: publicEvolution.status
  },
  matrixOperations: {
    state: matrixOperationsDoctor.data.state,
    cycleId: matrixOperationsCycle.data.report.cycle_id,
    law: matrixOperationsCycle.data.report.law,
    lawSha256: matrixOperationsCycle.data.report.law_sha256,
    capabilityIndex: matrixOperationsCycle.data.report.matrix_capability_index,
    effectivePower: matrixOperationsCycle.data.report.matrix_effective_power,
    dailyEvolutionScore: matrixOperationsCycle.data.report.daily_evolution_score,
    missionsCreated: matrixOperationsCycle.data.report.operating_missions_created,
    consequentialActionsExecuted: matrixOperationsCycle.data.report.consequential_actions_executed,
    destructiveActionBlocked: true,
    unauthorizedStatus: matrixOperationsUnauthorized.status
  },
  siteDirector: { runs: siteDirector.data.runs.length },
  promptBoundary: { rejectionStatus: promptRejection.status, promptAccepted: false },
  route: {
    status: route.status,
    attempts: routeAttemptLog,
    selectedResource: route.status === 200 ? route.data?.selected?.resource_id || null : null,
    noModelYet: route.status === 503
  },
  boundaries: {
    ownerOnly: true,
    promptReceivedByCloudflare: false,
    promptStoredByCloudflare: false,
    paidFallbackPossible: false,
    localInferenceRequired: true
  }
};

fs.writeFileSync(outputPath, `${JSON.stringify(proof, null, 2)}\n`);
console.log(`Live AI management, Value Hunter, Living Matrix and constitutional Matrix operations verified: ${proof.resources.count} resource(s), ${proof.localRuntime.models} registered local model(s), EUR ${proof.valueHunter.targetNetMinor / 100} target, Matrix cycle ${proof.matrixOperations.cycleId}, prompt transfer blocked, destructive action blocked, paid fallback impossible.`);
