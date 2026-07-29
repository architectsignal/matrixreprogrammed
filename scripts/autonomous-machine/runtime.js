'use strict';

const path = require('node:path');
const { AuditLog } = require('./audit-log');
const { SourceRegistry } = require('./source-registry');
const { TaskStore } = require('./task-store');
const { PublicationGate } = require('./publication-gate');
const { MissionDirector } = require('./mission-director');
const { PUBLICATION_MODES } = require('./constants');

function createRuntime(options = {}) {
  const rootDir = options.rootDir || path.resolve(process.cwd(), '.autonomous-machine');
  const publicationMode = options.publicationMode || process.env.AIM_PUBLICATION_MODE || PUBLICATION_MODES.DISABLED;

  const auditLog = new AuditLog(path.join(rootDir, 'audit.jsonl'));
  const sourceRegistry = new SourceRegistry(path.join(rootDir, 'source-registry.json'));
  const taskStore = new TaskStore(path.join(rootDir, 'tasks.json'));
  const publicationGate = new PublicationGate({ mode: publicationMode });
  const missionDirector = new MissionDirector({
    taskStore,
    sourceRegistry,
    auditLog,
    publicationGate,
    handlers: options.handlers || {},
    killSwitch: options.killSwitch,
  });

  return {
    rootDir,
    auditLog,
    sourceRegistry,
    taskStore,
    publicationGate,
    missionDirector,
  };
}

module.exports = { createRuntime };
