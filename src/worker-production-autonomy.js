import productionWorker from './worker-production.js';
import aiManagementWorker from './worker-ai-management.js';

export default {
  async fetch(request, env, ctx) {
    return productionWorker.fetch(request, env, ctx);
  },

  async scheduled(event, env, ctx) {
    const productionTask = productionWorker.scheduled
      ? productionWorker.scheduled(event, env, ctx)
      : Promise.resolve();
    const autonomyTask = aiManagementWorker.scheduled
      ? aiManagementWorker.scheduled(event, env, ctx)
      : Promise.resolve();
    await Promise.all([productionTask, autonomyTask]);
  }
};
