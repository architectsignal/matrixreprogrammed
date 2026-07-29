'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { sha256, stableStringify } = require('./route-registry');

const STAGING_APPLY_STATUS = 'disposable_staging_application_only';

function assertPlainObject(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${field} must be an object`);
  }
}

function resolveApplyDir(runtimeRoot, relativePath) {
  if (typeof relativePath !== 'string' || !relativePath.trim() || path.isAbsolute(relativePath)) {
    throw new TypeError('staging apply directory must be a relative runtime path');
  }
  const root = path.resolve(runtimeRoot);
  const target = path.resolve(root, relativePath);
  if (target === root || !target.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Staging apply path escapes runtime root: ${relativePath}`);
  }
  return target;
}

function assertZeroSafety(safety) {
  assertPlainObject(safety, 'staging apply safety');
  for (const field of ['productionWrites', 'publicationTasksCreated', 'commitActions', 'deploymentActions']) {
    if (safety[field] !== 0) throw new Error(`staging apply safety requires ${field}=0`);
  }
  for (const field of ['productionWriteAllowed', 'commitAllowed', 'deploymentAllowed', 'publicationAllowed']) {
    if (safety[field] !== false) throw new Error(`staging apply safety requires ${field}=false`);
  }
  if (safety.productionTarget !== null) throw new Error('staging apply safety requires productionTarget=null');
  if (safety.workspaceType !== 'disposable_runtime_copy') {
    throw new Error('staging apply safety requires a disposable runtime workspace');
  }
}

function assertHash(value, field) {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/i.test(value)) {
    throw new TypeError(`${field} must be a SHA-256 hash`);
  }
}

function assertApplyBundle(bundle) {
  assertPlainObject(bundle, 'staging apply bundle');
  if (bundle.schemaVersion !== 1) throw new Error('staging apply schemaVersion must be 1');
  if (bundle.applyType !== 'disposable_staging_application') throw new Error('staging apply type is invalid');
  if (bundle.mode !== 'disposable_runtime_only') throw new Error('staging apply mode is invalid');
  assertPlainObject(bundle.preview, 'staging apply preview');
  for (const field of ['id', 'fingerprint']) {
    if (typeof bundle.preview[field] !== 'string' || !bundle.preview[field]) {
      throw new TypeError(`staging apply preview requires ${field}`);
    }
  }
  assertHash(bundle.preview.fingerprint, 'staging apply preview fingerprint');
  for (const field of ['beforeHash', 'expectedAfterHash', 'actualAfterHash', 'patchHash', 'diffHash']) {
    assertHash(bundle[field], field);
  }
  if (bundle.exactMatch !== true) throw new Error('staging apply requires exactMatch=true');
  assertPlainObject(bundle.appliedDocument, 'applied staging document');
  assertPlainObject(bundle.diff, 'staging apply diff');
  if (bundle.diff.format !== 'canonical-json-diff-summary') throw new Error('staging apply diff format is invalid');
  if (!Array.isArray(bundle.diff.changedTopLevelPaths) || bundle.diff.changedTopLevelPaths.length === 0) {
    throw new Error('staging apply diff requires changedTopLevelPaths');
  }
  if (!Number.isInteger(bundle.diff.operationCount) || bundle.diff.operationCount < 1) {
    throw new Error('staging apply diff operationCount is invalid');
  }
  assertZeroSafety(bundle.safety);
  return true;
}

function buildApplyFingerprint(bundle) {
  assertApplyBundle(bundle);
  return sha256(stableStringify({
    schemaVersion: bundle.schemaVersion,
    applyType: bundle.applyType,
    mode: bundle.mode,
    preview: bundle.preview,
    beforeHash: bundle.beforeHash,
    expectedAfterHash: bundle.expectedAfterHash,
    actualAfterHash: bundle.actualAfterHash,
    patchHash: bundle.patchHash,
    exactMatch: bundle.exactMatch,
    appliedDocument: bundle.appliedDocument,
    diff: bundle.diff,
    diffHash: bundle.diffHash,
    safety: bundle.safety,
  }));
}

class StagingApplyStore {
  constructor(runtimeRoot, relativeDir = 'staging-applies') {
    if (!runtimeRoot) throw new TypeError('StagingApplyStore requires a runtime root');
    this.runtimeRoot = path.resolve(runtimeRoot);
    fs.mkdirSync(this.runtimeRoot, { recursive: true });
    this.applyDir = resolveApplyDir(this.runtimeRoot, relativeDir);
    fs.mkdirSync(this.applyDir, { recursive: true });
    this.indexPath = path.join(this.applyDir, 'index.json');
    if (!fs.existsSync(this.indexPath)) this.saveIndex({ version: 1, applications: [] });
  }

  applyFilePath(fileName) {
    if (typeof fileName !== 'string' || !/^apply-[0-9a-f]{64}\.json$/i.test(fileName)) {
      throw new Error('staging apply index contains an invalid file name');
    }
    const filePath = path.resolve(this.applyDir, fileName);
    if (!filePath.startsWith(`${this.applyDir}${path.sep}`)) {
      throw new Error('staging apply file escapes apply directory');
    }
    return filePath;
  }

  loadIndex() {
    const parsed = JSON.parse(fs.readFileSync(this.indexPath, 'utf8'));
    if (!Array.isArray(parsed.applications)) throw new Error('staging apply index must contain applications');
    return parsed;
  }

  saveIndex(index) {
    const temporaryPath = `${this.indexPath}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
    fs.renameSync(temporaryPath, this.indexPath);
  }

  add(bundle) {
    const fingerprint = buildApplyFingerprint(bundle);
    const index = this.loadIndex();
    const existing = index.applications.find((item) => item.fingerprint === fingerprint);
    if (existing) {
      const application = this.read(existing.id);
      if (!application || buildApplyFingerprint(application) !== fingerprint || application.fingerprint !== fingerprint) {
        throw new Error('Existing staging application failed integrity verification');
      }
      return { application, deduplicated: true };
    }

    const createdAt = new Date().toISOString();
    const id = `apply_${crypto.randomUUID()}`;
    const fileName = `apply-${fingerprint}.json`;
    const filePath = this.applyFilePath(fileName);
    const stored = {
      ...bundle,
      id,
      fingerprint,
      status: STAGING_APPLY_STATUS,
      createdAt,
    };
    const temporaryPath = `${filePath}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(stored, null, 2)}\n`, 'utf8');
    fs.renameSync(temporaryPath, filePath);
    index.applications.push({
      id,
      fingerprint,
      status: STAGING_APPLY_STATUS,
      previewId: bundle.preview.id,
      previewFingerprint: bundle.preview.fingerprint,
      fileName,
      createdAt,
    });
    this.saveIndex(index);
    return { application: stored, deduplicated: false };
  }

  read(idOrFingerprint) {
    const item = this.loadIndex().applications.find((entry) => (
      entry.id === idOrFingerprint || entry.fingerprint === idOrFingerprint
    ));
    if (!item) return null;
    return JSON.parse(fs.readFileSync(this.applyFilePath(item.fileName), 'utf8'));
  }

  list() {
    return this.loadIndex().applications;
  }

  verify() {
    const index = this.loadIndex();
    for (let itemIndex = 0; itemIndex < index.applications.length; itemIndex += 1) {
      const item = index.applications[itemIndex];
      let filePath;
      try { filePath = this.applyFilePath(item.fileName); }
      catch (_) { return { valid: false, index: itemIndex, reason: 'apply_file_name_invalid' }; }
      if (!fs.existsSync(filePath)) return { valid: false, index: itemIndex, reason: 'apply_file_missing' };
      let application;
      try { application = JSON.parse(fs.readFileSync(filePath, 'utf8')); }
      catch (_) { return { valid: false, index: itemIndex, reason: 'apply_json_invalid' }; }
      try {
        const fingerprint = buildApplyFingerprint(application);
        if (fingerprint !== item.fingerprint || fingerprint !== application.fingerprint) {
          return { valid: false, index: itemIndex, reason: 'apply_fingerprint_mismatch' };
        }
        if (application.id !== item.id || application.status !== STAGING_APPLY_STATUS) {
          return { valid: false, index: itemIndex, reason: 'apply_metadata_mismatch' };
        }
      } catch (error) {
        return { valid: false, index: itemIndex, reason: 'apply_contract_invalid', error: error.message };
      }
    }
    return { valid: true, applications: index.applications.length };
  }
}

module.exports = {
  STAGING_APPLY_STATUS,
  StagingApplyStore,
  assertApplyBundle,
  buildApplyFingerprint,
  resolveApplyDir,
};
