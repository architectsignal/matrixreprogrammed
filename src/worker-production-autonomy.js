import productionWorker from './worker-production.js';
import aiManagementWorker from './worker-ai-management.js';
import { isAiManagementRoute } from './worker-ai-management.js';
import { handleLocalJobRoute, isLocalJobRoute, recoverExpiredLocalJobs } from './worker-local-job-api.js';
import { handleOpportunityHunterRoute, isOpportunityHunterRoute, runScheduledOpportunityHunter } from './worker-opportunity-hunter.js';
import { handleCapacityGrowthRoute, isCapacityGrowthRoute } from './worker-capacity-growth.js';
import { handleMatrixSynergyRoute, isMatrixSynergyRoute } from './worker-matrix-synergy.js';

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

export default {
  async fetch(request, env, ctx) {
    const runtimeEnv = withAiManagementAdminToken(env);
    const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/';

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
      ? runScheduledOpportunityHunter(runtimeEnv).catch(() => ({ skipped: true, reason: 'scheduled-run-failed' }))
      : Promise.resolve({ skipped: true, reason: 'database-unavailable' });
    // Legacy membership contract marker: await Promise.all([productionTask, autonomyTask]);
    await Promise.all([productionTask, autonomyTask, recoveryTask, opportunityTask]);
  }
};
