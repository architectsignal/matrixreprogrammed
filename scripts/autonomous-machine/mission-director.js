'use strict';

const { TASK_STATUSES, TASK_TYPES } = require('./constants');

class MissionDirector {
  constructor({ taskStore, sourceRegistry, auditLog, publicationGate, handlers = {}, killSwitch }) {
    if (!taskStore || !sourceRegistry || !auditLog || !publicationGate) {
      throw new TypeError('MissionDirector requires taskStore, sourceRegistry, auditLog and publicationGate');
    }
    this.taskStore = taskStore;
    this.sourceRegistry = sourceRegistry;
    this.auditLog = auditLog;
    this.publicationGate = publicationGate;
    this.handlers = { ...handlers };
    this.killSwitch = killSwitch || (() => process.env.AIM_KILL_SWITCH === '1');
  }

  registerHandler(taskType, handler) {
    if (typeof handler !== 'function') throw new TypeError('handler must be a function');
    this.handlers[taskType] = handler;
  }

  async processOne() {
    if (this.killSwitch()) {
      this.auditLog.append('director_halted', { reason: 'kill_switch_active' });
      return { status: 'halted', reason: 'kill_switch_active' };
    }

    const queued = this.taskStore.nextQueued();
    if (!queued) return { status: 'idle' };

    const task = this.taskStore.claim(queued.id);
    this.auditLog.append('task_claimed', { taskId: task.id, type: task.type, attemptCount: task.attemptCount });

    try {
      if (task.sourceId) this.sourceRegistry.assertUsable(task.sourceId);

      if (task.type === TASK_TYPES.PUBLICATION_CANDIDATE) {
        const decision = this.publicationGate.evaluate(task.payload);
        this.auditLog.append('publication_gate_evaluated', { taskId: task.id, decision });
        if (!decision.allowed) {
          const held = this.taskStore.hold(task.id, decision.reason, { decision });
          return { status: TASK_STATUSES.HELD, task: held, decision };
        }
        const completed = this.taskStore.complete(task.id, { decision, handoffOnly: true });
        return { status: TASK_STATUSES.COMPLETED, task: completed };
      }

      const handler = this.handlers[task.type];
      if (!handler) {
        const rejected = this.taskStore.reject(task.id, `No handler registered for ${task.type}`);
        this.auditLog.append('task_rejected', { taskId: task.id, reason: rejected.error });
        return { status: TASK_STATUSES.REJECTED, task: rejected };
      }

      const result = await handler(task, {
        sourceRegistry: this.sourceRegistry,
        auditLog: this.auditLog,
      });
      const completed = this.taskStore.complete(task.id, result);
      this.auditLog.append('task_completed', { taskId: task.id, type: task.type });
      return { status: TASK_STATUSES.COMPLETED, task: completed };
    } catch (error) {
      const failed = this.taskStore.fail(task.id, error);
      this.auditLog.append('task_failed', { taskId: task.id, type: task.type, error: failed.error });
      return { status: TASK_STATUSES.FAILED, task: failed };
    }
  }

  async run({ maxTasks = 10 } = {}) {
    if (!Number.isInteger(maxTasks) || maxTasks < 1 || maxTasks > 1000) {
      throw new TypeError('maxTasks must be an integer between 1 and 1000');
    }
    const results = [];
    for (let index = 0; index < maxTasks; index += 1) {
      const result = await this.processOne();
      results.push(result);
      if (result.status === 'idle' || result.status === 'halted') break;
    }
    return results;
  }
}

module.exports = { MissionDirector };
