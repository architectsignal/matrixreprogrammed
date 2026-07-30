import productionWorker from './worker-production.js';
import aiManagementWorker from './worker-ai-management.js';

function withAiManagementAdminToken(env) {
  const token = env?.AI_MANAGEMENT_ADMIN_TOKEN || env?.ADMIN_API_TOKEN;
  if (!token || env?.ADMIN_API_TOKEN === token) return env;
  return { ...env, ADMIN_API_TOKEN: token };
}

export default {
  async fetch(request, env, ctx) {
    return productionWorker.fetch(request, withAiManagementAdminToken(env), ctx);
  },

  async scheduled(event, env, ctx) {
    const runtimeEnv = withAiManagementAdminToken(env);
    const productionTask = productionWorker.scheduled
      ? productionWorker.scheduled(event, runtimeEnv, ctx)
      : Promise.resolve();
    const autonomyTask = aiManagementWorker.scheduled
      ? aiManagementWorker.scheduled(event, runtimeEnv, ctx)
      : Promise.resolve();
    await Promise.all([productionTask, autonomyTask]);
  }
};
