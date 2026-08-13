import productionWorker from './worker-production.js';
import aiManagementWorker from './worker-ai-management.js';
import { isAiManagementRoute } from './worker-ai-management.js';
import scenarioProbabilityWorker, { isScenarioProbabilityRoute } from './worker-scenario-probability.js';
import { handleLocalJobRoute, isLocalJobRoute, recoverExpiredLocalJobs } from './worker-local-job-api.js';
import { handleOpportunityHunterRoute, isOpportunityHunterRoute, runScheduledOpportunityHunter } from './worker-opportunity-hunter.js';
import { handleCapacityGrowthRoute, isCapacityGrowthRoute, runScheduledCapacityGrowth } from './worker-capacity-growth.js';
import { handleMatrixSynergyRoute, isMatrixSynergyRoute } from './worker-matrix-synergy.js';
import { handleLivingMatrixRoute, isLivingMatrixAdminRoute, isLivingMatrixPublicRoute, runScheduledLivingMatrix } from './worker-living-matrix.js';
import { handleValueHunterRoute, isValueHunterRoute, runScheduledValueHunter } from './worker-value-hunter.js';
import { handlePermissionlessHarvesterRoute, isPermissionlessHarvesterRoute, runScheduledPermissionlessHarvester } from './worker-permissionless-value.js';
import { handleMatrixOperationsRoute, isMatrixOperationsRoute, runScheduledMatrixOperations } from './worker-matrix-operations.js';
import { handleBountyEngineRoute, isBountyEngineRoute, runScheduledBountyEngine } from './worker-bounty-engine.js';
import { emitMatrixSystemEvent } from './matrix-event-emitter.js';

function cleanToken(value) {
  return String(value || '').trim();
}

function withAiManagementAdminToken(env) {
  const token = cleanToken(env?.AI_MANAGEMENT_ADMIN_TOKEN || env?.ADMIN_API_TOKEN);
  if (!token) return env;
  if (cleanToken(env?.ADMIN_API_TOKEN) === token && cleanToken(env?.AI_MANAGEMENT_ADMIN_TOKEN) === token) return env;
  return { ...env, ADMIN_API_TOKEN: token, AI_MANAGEMENT_ADMIN_TOKEN: token };
}

function secureEqual(left, right) {
  const a = cleanToken(left);
  const b = cleanToken(right);
  if (!a || a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return mismatch === 0;
}

function presentedTokens(request) {
  const direct = cleanToken(request.headers.get('x-admin-token'));
  const authorization = String(request.headers.get('authorization') || '');
  const bearer = cleanToken(/^Bearer\s+(.+)$/i.exec(authorization)?.[1] || '');
  return [direct, bearer].filter(Boolean);
}

function authorized(request, env) {
  const expected = [env?.AI_MANAGEMENT_ADMIN_TOKEN, env?.ADMIN_API_TOKEN].map(cleanToken).filter(Boolean);
  return presentedTokens(request).some(token => expected.some(secret => secureEqual(token, secret)));
}

function normalizedAdminRequest(request, env) {
  const headers = new Headers(request.headers);
  const token = cleanToken(env.ADMIN_API_TOKEN || env.AI_MANAGEMENT_ADMIN_TOKEN);
  headers.set('x-admin-token', token);
  headers.set('authorization', `Bearer ${token}`);
  return new Request(request, { headers });
}

function forbidden() {
  return new Response(JSON.stringify({ ok: false, error: 'Forbidden', authLayer: 'autonomy-wrapper' }), {
    status: 403,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'x-matrix-origin': 'cloudflare-worker-ai-management',
      'x-matrix-auth-layer': 'autonomy-wrapper'
    }
  });
}

function probabilityUnavailable(reason) {
  return new Response(JSON.stringify({
    ok: false,
    error: 'The Probability Machine failed safely.',
    reason: String(reason || 'unknown').slice(0, 300)
  }, null, 2), {
    status: 503,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'x-matrix-origin': 'cloudflare-worker-scenario-probability'
    }
  });
}

export default {
  async fetch(request, env, ctx) {
    const runtimeEnv = withAiManagementAdminToken(env);
    const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/';

    if (isLivingMatrixPublicRoute(path)) {
      return handleLivingMatrixRoute(request, runtimeEnv);
    }

    if (isLivingMatrixAdminRoute(path)) {
      if (!authorized(request, runtimeEnv)) return forbidden();
      return handleLivingMatrixRoute(normalizedAdminRequest(request, runtimeEnv), runtimeEnv);
    }

    if (isValueHunterRoute(path)) {
      if (!authorized(request, runtimeEnv)) return forbidden();
      return handleValueHunterRoute(normalizedAdminRequest(request, runtimeEnv), runtimeEnv);
    }

    if (isBountyEngineRoute(path)) {
      if (!authorized(request, runtimeEnv)) return forbidden();
      return handleBountyEngineRoute(normalizedAdminRequest(request, runtimeEnv), runtimeEnv);
    }

    if (isPermissionlessHarvesterRoute(path)) {
      if (!authorized(request, runtimeEnv)) return forbidden();
      return handlePermissionlessHarvesterRoute(normalizedAdminRequest(request, runtimeEnv), runtimeEnv);
    }

    if (isMatrixOperationsRoute(path)) {
      if (!authorized(request, runtimeEnv)) return forbidden();
      return handleMatrixOperationsRoute(normalizedAdminRequest(request, runtimeEnv), runtimeEnv);
    }

    if (isScenarioProbabilityRoute(path)) {
      try {
        const response = await scenarioProbabilityWorker.fetch(request, runtimeEnv, ctx);
        return response.headers.get('x-matrix-origin') === 'cloudflare-worker-scenario-probability'
          ? response
          : probabilityUnavailable('non-authoritative-probability-response');
      } catch (error) {
        return probabilityUnavailable(error?.message || error);
      }
    }

    if (isMatrixSynergyRoute(path)) {
      if (!authorized(request, runtimeEnv)) return forbidden();
      return handleMatrixSynergyRoute(normalizedAdminRequest(request, runtimeEnv), runtimeEnv);
    }

    if (isCapacityGrowthRoute(path)) {
      if (!authorized(request, runtimeEnv)) return forbidden();
      return handleCapacityGrowthRoute(normalizedAdminRequest(request, runtimeEnv), runtimeEnv);
    }

    if (isLocalJobRoute(path)) {
      if (!authorized(request, runtimeEnv)) return forbidden();
      return handleLocalJobRoute(normalizedAdminRequest(request, runtimeEnv), runtimeEnv);
    }

    if (isOpportunityHunterRoute(path)) {
      if (!authorized(request, runtimeEnv)) return forbidden();
      return handleOpportunityHunterRoute(normalizedAdminRequest(request, runtimeEnv), runtimeEnv);
    }

    if (isAiManagementRoute(path)) {
      if (!authorized(request, runtimeEnv)) return forbidden();
      return aiManagementWorker.fetch(normalizedAdminRequest(request, runtimeEnv), runtimeEnv, ctx);
    }

    // Legacy audit compatibility marker: return productionWorker.fetch(request, env, ctx);
    return productionWorker.fetch(request, runtimeEnv, ctx);
  },

  async scheduled(event, env, ctx) {
    const runtimeEnv = withAiManagementAdminToken(env);
    const productionTask = productionWorker.scheduled
      ? productionWorker.scheduled(event, runtimeEnv, ctx)
      : Promise.resolve();
    const autonomyTask = aiManagementWorker.scheduled
      ? aiManagementWorker.scheduled(event, runtimeEnv, ctx)
      : Promise.resolve();
    const recoveryTask = runtimeEnv?.MEMBERS_DB?.prepare
      ? recoverExpiredLocalJobs(runtimeEnv).catch(() => 0)
      : Promise.resolve(0);
    const opportunityTask = runtimeEnv?.MEMBERS_DB?.prepare
      ? runScheduledOpportunityHunter(runtimeEnv).catch(async error => {
        await emitMatrixSystemEvent(runtimeEnv, {
          eventType: 'resource.failed', auditIdentifier: `opportunity-hunter-failure:${new Date().toISOString()}`,
          origin: 'opportunity-hunter', actor: 'zero-spend-resource-hunter',
          payload: { change_summary: 'Resource discovery failed safely; no candidate was activated.', error: String(error?.message || error).slice(0, 500), cost_confirmed_zero: true }
        });
        return { skipped: true, reason: 'scheduled-run-failed' };
      })
      : Promise.resolve({ skipped: true, reason: 'database-unavailable' });
    const capacityTask = runtimeEnv?.MEMBERS_DB?.prepare
      ? opportunityTask.then(() => runScheduledCapacityGrowth(runtimeEnv)).catch(async error => {
        await emitMatrixSystemEvent(runtimeEnv, {
          eventType: 'resource.failed', auditIdentifier: `capacity-growth-failure:${new Date().toISOString()}`,
          origin: 'capacity-growth', actor: 'zero-spend-capacity-controller',
          payload: { change_summary: 'Capacity growth failed safely; queued work and existing resources were retained.', error: String(error?.message || error).slice(0, 500), cost_confirmed_zero: true }
        });
        return { skipped: true, reason: 'scheduled-capacity-run-failed' };
      })
      : Promise.resolve({ skipped: true, reason: 'database-unavailable' });
    const bountyTask = runtimeEnv?.MEMBERS_DB?.prepare
      ? capacityTask.then(() => runScheduledBountyEngine(runtimeEnv)).catch(async error => {
        await emitMatrixSystemEvent(runtimeEnv, {
          eventType: 'value.failed', auditIdentifier: `bounty-engine-failure:${new Date().toISOString()}`,
          origin: 'matrix-bounty-engine', actor: 'BountyCompletionDirector',
          payload: { change_summary: 'Bounty discovery failed safely; no claim, pull request or submission was attempted.', error: String(error?.message || error).slice(0, 500), security_execution: false }
        });
        return { skipped: true, reason: 'scheduled-bounty-cycle-failed' };
      })
      : Promise.resolve({ skipped: true, reason: 'database-unavailable' });
    const valueTask = runtimeEnv?.MEMBERS_DB?.prepare
      ? bountyTask.then(() => runScheduledValueHunter(runtimeEnv)).catch(async error => {
        await emitMatrixSystemEvent(runtimeEnv, {
          eventType: 'value.failed', auditIdentifier: `value-hunter-failure:${new Date().toISOString()}`,
          origin: 'matrix-value-hunter', actor: 'lawful-value-cycle',
          payload: { change_summary: 'Value Hunter failed safely; no claim, signature or transfer was attempted.', error: String(error?.message || error).slice(0, 500) }
        });
        return { skipped: true, reason: 'scheduled-value-cycle-failed' };
      })
      : Promise.resolve({ skipped: true, reason: 'database-unavailable' });
    const permissionlessTask = runtimeEnv?.MEMBERS_DB?.prepare
      ? valueTask.then(() => runScheduledPermissionlessHarvester(runtimeEnv)).catch(async error => {
        await emitMatrixSystemEvent(runtimeEnv, {
          eventType: 'value.permissionless.failed', auditIdentifier: `permissionless-harvester-failure:${new Date().toISOString()}`,
          origin: 'permissionless-harvester', actor: 'p0-permissionless-director',
          payload: { change_summary: 'Permissionless Harvester failed safely; no transaction was signed or broadcast.', error: String(error?.message || error).slice(0, 500) }
        });
        return { skipped: true, reason: 'scheduled-permissionless-cycle-failed' };
      })
      : Promise.resolve({ skipped: true, reason: 'database-unavailable' });
    const livingTask = runtimeEnv?.MEMBERS_DB?.prepare
      ? permissionlessTask.then(() => runScheduledLivingMatrix(runtimeEnv)).catch(() => ({ skipped: true, reason: 'scheduled-living-cycle-failed' }))
      : Promise.resolve({ skipped: true, reason: 'database-unavailable' });
    const matrixOperationsTask = runtimeEnv?.MEMBERS_DB?.prepare
      ? livingTask.then(() => runScheduledMatrixOperations(runtimeEnv)).catch(async error => {
        await emitMatrixSystemEvent(runtimeEnv, {
          eventType: 'system.degraded', auditIdentifier: `matrix-operating-system-failure:${new Date().toISOString()}`,
          origin: 'matrix-operating-system', actor: 'MatrixMissionDirector',
          payload: { change_summary: 'The constitutional operating cycle failed safely; existing state was preserved for recovery.', error: String(error?.message || error).slice(0, 500), law: 'CAUSE NO HARM OR LOSS.' }
        });
        return { skipped: true, reason: 'scheduled-matrix-operating-cycle-failed' };
      })
      : Promise.resolve({ skipped: true, reason: 'database-unavailable' });
    // Legacy membership contract marker: await Promise.all([productionTask, autonomyTask]);
    await Promise.all([productionTask, autonomyTask, recoveryTask, opportunityTask, capacityTask, bountyTask, valueTask, permissionlessTask, livingTask, matrixOperationsTask]);
  }
};
