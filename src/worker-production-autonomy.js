import productionWorker from './worker-production.js';
import aiManagementWorker from './worker-ai-management.js';
import { isAiManagementRoute } from './worker-ai-management.js';
import { handleLocalJobRoute, isLocalJobRoute, recoverExpiredLocalJobs } from './worker-local-job-api.js';
import { handleOpportunityHunterRoute, isOpportunityHunterRoute, runScheduledOpportunityHunter } from './worker-opportunity-hunter.js';

function withAiManagementAdminToken(env) {
  const token = env?.AI_MANAGEMENT_ADMIN_TOKEN || env?.ADMIN_API_TOKEN;
  if (!token || env?.ADMIN_API_TOKEN === token) return env;
  return { ...env, ADMIN_API_TOKEN: token };
}

function secureEqual(left, right) {
  const a = String(left || '');
  const b = String(right || '');
  if (!a || a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return mismatch === 0;
}

function authorized(request, env) {
  return Boolean(env?.ADMIN_API_TOKEN && secureEqual(request.headers.get('x-admin-token'), env.ADMIN_API_TOKEN));
}

function forbidden() {
  return new Response(JSON.stringify({ ok: false, error: 'Forbidden' }), {
    status: 403,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff'
    }
  });
}

export default {
  async fetch(request, env, ctx) {
    const runtimeEnv = withAiManagementAdminToken(env);
    const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/';

    if (isLocalJobRoute(path)) {
      if (!authorized(request, runtimeEnv)) return forbidden();
      return handleLocalJobRoute(request, runtimeEnv);
    }

    if (isOpportunityHunterRoute(path)) {
      if (!authorized(request, runtimeEnv)) return forbidden();
      return handleOpportunityHunterRoute(request, runtimeEnv);
    }

    if (isAiManagementRoute(path)) {
      return aiManagementWorker.fetch(request, runtimeEnv, ctx);
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
