'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { TASK_STATUSES } = require('./constants');
const {
  buildTaskFingerprint,
  validateTaskInput,
  validateStoredTask,
} = require('./validation');

class TaskStore {
  constructor(filePath) {
    if (!filePath) throw new TypeError('TaskStore requires a file path');
    this.filePath = filePath;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    if (!fs.existsSync(filePath)) this.save({ version: 1, tasks: [] });
  }

  load() {
    const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
    if (!Array.isArray(parsed.tasks)) throw new Error('Task store must contain a tasks array');
    parsed.tasks.forEach(validateStoredTask);
    return parsed;
  }

  save(store) {
    const temporaryPath = `${this.filePath}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
    fs.renameSync(temporaryPath, this.filePath);
  }

  enqueue(input) {
    validateTaskInput(input);
    const store = this.load();
    const fingerprint = buildTaskFingerprint(input);
    const existing = store.tasks.find((task) => task.fingerprint === fingerprint && ![
      TASK_STATUSES.FAILED,
      TASK_STATUSES.REJECTED,
    ].includes(task.status));
    if (existing) return { task: existing, deduplicated: true };

    const now = new Date().toISOString();
    const task = {
      id: `aim_${crypto.randomUUID()}`,
      fingerprint,
      type: input.type,
      status: TASK_STATUSES.QUEUED,
      priority: input.priority,
      sourceId: input.sourceId || null,
      subjectKey: input.subjectKey || null,
      evidenceClass: input.evidenceClass || null,
      sensitivity: input.sensitivity || 'low',
      payload: input.payload || {},
      attemptCount: 0,
      createdAt: now,
      updatedAt: now,
      claimedAt: null,
      completedAt: null,
      error: null,
      result: null,
    };
    store.tasks.push(task);
    this.save(store);
    return { task, deduplicated: false };
  }

  nextQueued() {
    return this.load().tasks
      .filter((task) => task.status === TASK_STATUSES.QUEUED)
      .sort((a, b) => b.priority - a.priority || a.createdAt.localeCompare(b.createdAt))[0] || null;
  }

  update(taskId, patch) {
    const store = this.load();
    const index = store.tasks.findIndex((task) => task.id === taskId);
    if (index === -1) throw new Error(`Task not found: ${taskId}`);
    const updated = { ...store.tasks[index], ...patch, updatedAt: new Date().toISOString() };
    validateStoredTask(updated);
    store.tasks[index] = updated;
    this.save(store);
    return updated;
  }

  claim(taskId) {
    const task = this.load().tasks.find((item) => item.id === taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);
    if (task.status !== TASK_STATUSES.QUEUED) throw new Error(`Task is not queued: ${taskId}`);
    return this.update(taskId, {
      status: TASK_STATUSES.CLAIMED,
      attemptCount: task.attemptCount + 1,
      claimedAt: new Date().toISOString(),
      error: null,
    });
  }

  complete(taskId, result) {
    return this.update(taskId, {
      status: TASK_STATUSES.COMPLETED,
      completedAt: new Date().toISOString(),
      result: result || null,
      error: null,
    });
  }

  fail(taskId, error) {
    return this.update(taskId, {
      status: TASK_STATUSES.FAILED,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  hold(taskId, reason, result = null) {
    return this.update(taskId, {
      status: TASK_STATUSES.HELD,
      error: reason,
      result,
    });
  }

  reject(taskId, reason) {
    return this.update(taskId, {
      status: TASK_STATUSES.REJECTED,
      error: reason,
    });
  }

  list() {
    return this.load().tasks;
  }
}

module.exports = { TaskStore };
