'use strict';

const crypto = require('node:crypto');
const {
  TASK_STATUSES,
  TASK_TYPES,
  EVIDENCE_CLASSES,
  SENSITIVITY,
} = require('./constants');

function assertPlainObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${name} must be a plain object`);
  }
}

function assertEnum(value, enumObject, name) {
  if (!Object.values(enumObject).includes(value)) {
    throw new TypeError(`${name} must be one of: ${Object.values(enumObject).join(', ')}`);
  }
}

function normaliseUrl(rawUrl) {
  const url = new URL(rawUrl);
  url.hash = '';
  url.username = '';
  url.password = '';
  url.hostname = url.hostname.toLowerCase();
  if ((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80')) {
    url.port = '';
  }
  return url.toString();
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function buildTaskFingerprint(task) {
  return sha256(stableStringify({
    type: task.type,
    sourceId: task.sourceId || null,
    subjectKey: task.subjectKey || null,
    payload: task.payload || {},
  }));
}

function validateTaskInput(task) {
  assertPlainObject(task, 'task');
  assertEnum(task.type, TASK_TYPES, 'task.type');

  if (!Number.isInteger(task.priority) || task.priority < 1 || task.priority > 100) {
    throw new TypeError('task.priority must be an integer between 1 and 100');
  }

  if (task.payload !== undefined) {
    assertPlainObject(task.payload, 'task.payload');
  }

  if (task.evidenceClass !== undefined && task.evidenceClass !== null) {
    assertEnum(task.evidenceClass, EVIDENCE_CLASSES, 'task.evidenceClass');
  }

  if (task.sensitivity !== undefined && task.sensitivity !== null) {
    assertEnum(task.sensitivity, SENSITIVITY, 'task.sensitivity');
  }

  if (task.sourceId !== undefined && task.sourceId !== null && typeof task.sourceId !== 'string') {
    throw new TypeError('task.sourceId must be a string');
  }

  if (task.subjectKey !== undefined && task.subjectKey !== null && typeof task.subjectKey !== 'string') {
    throw new TypeError('task.subjectKey must be a string');
  }

  return true;
}

function validateStoredTask(task) {
  validateTaskInput(task);
  assertEnum(task.status, TASK_STATUSES, 'task.status');
  if (typeof task.id !== 'string' || task.id.length < 8) {
    throw new TypeError('task.id must be a non-empty identifier');
  }
  if (typeof task.fingerprint !== 'string' || task.fingerprint.length !== 64) {
    throw new TypeError('task.fingerprint must be a SHA-256 hash');
  }
  return true;
}

module.exports = {
  assertPlainObject,
  assertEnum,
  normaliseUrl,
  stableStringify,
  sha256,
  buildTaskFingerprint,
  validateTaskInput,
  validateStoredTask,
};
