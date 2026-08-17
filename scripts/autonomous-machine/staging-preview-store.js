'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { sha256, stableStringify } = require('./route-registry');

const STAGING_PREVIEW_STATUS = 'staging_preview_only';

function assertPlainObject(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${field} must be an object`);
  }
}

function resolveInsideRuntime(runtimeRoot, relativePath) {
  if (typeof relativePath !== 'string' || !relativePath.trim() || path.isAbsolute(relativePath)) {
    throw new TypeError('preview directory must be a relative runtime path');
  }
  const root = path.resolve(runtimeRoot);
  const target = path.resolve(root, relativePath);
  if (target === root || !target.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Preview path escapes runtime root: ${relativePath}`);
  }
  return target;
}

function assertZeroSafety(safety) {
  assertPlainObject(safety, 'preview safety');
  for (const field of ['productionWrites', 'publicationTasksCreated', 'commitActions', 'deploymentActions']) {
    if (safety[field] !== 0) throw new Error(`preview safety requires ${field}=0`);
  }
  for (const field of ['autoApplyAllowed', 'commitAllowed', 'deploymentAllowed', 'publicationAllowed']) {
    if (safety[field] !== false) throw new Error(`preview safety requires ${field}=false`);
  }
  if (safety.productionTarget !== null) throw new Error('preview safety requires productionTarget=null');
}

function assertPreviewBundle(bundle) {
  assertPlainObject(bundle, 'staging preview bundle');
  if (bundle.schemaVersion !== 1) throw new Error('staging preview schemaVersion must be 1');
  if (bundle.previewType !== 'route_handoff_staging_preview') throw new Error('staging preview type is invalid');
  if (bundle.mode !== 'preview_only') throw new Error('staging preview mode must be preview_only');
  assertPlainObject(bundle.handoff, 'preview handoff');
  for (const field of ['id', 'routeBatchId']) {
    if (typeof bundle.handoff[field] !== 'string' || !bundle.handoff[field]) throw new TypeError(`preview handoff requires ${field}`);
  }
  for (const field of ['recordHash', 'payloadHash']) {
    if (typeof bundle.handoff[field] !== 'string' || !/^[0-9a-f]{64}$/i.test(bundle.handoff[field])) {
      throw new TypeError(`preview handoff ${field} must be a SHA-256 hash`);
    }
  }
  if (bundle.handoff.decision !== 'accept') throw new Error('staging preview requires an accepted handoff');
  if (typeof bundle.registryFingerprint !== 'string' || !/^[0-9a-f]{64}$/i.test(bundle.registryFingerprint)) {
    throw new TypeError('preview registryFingerprint must be a SHA-256 hash');
  }
  assertPlainObject(bundle.before, 'preview before document');
  assertPlainObject(bundle.after, 'preview after document');
  if (!Array.isArray(bundle.before.routeCandidates) || bundle.before.routeCandidates.length !== 0) {
    throw new Error('preview before document must contain an empty routeCandidates array');
  }
  if (!Array.isArray(bundle.after.routeCandidates) || bundle.after.routeCandidates.length === 0) {
    throw new Error('preview after document requires route candidates');
  }
  assertPlainObject(bundle.patch, 'preview patch');
  if (bundle.patch.format !== 'json-patch-preview' || bundle.patch.target !== 'isolated_staging_document') {
    throw new Error('preview patch target or format is invalid');
  }
  if (bundle.patch.productionTarget !== null) throw new Error('preview patch productionTarget must be null');
  if (!Array.isArray(bundle.patch.operations) || bundle.patch.operations.length === 0) {
    throw new Error('preview patch requires operations');
  }
  bundle.patch.operations.forEach((operation) => {
    assertPlainObject(operation, 'preview patch operation');
    if (!['add', 'replace'].includes(operation.op)) throw new Error('preview patch operation is not allowed');
    if (typeof operation.path !== 'string' || !operation.path.startsWith('/') || operation.path.includes('..')) {
      throw new Error('preview patch path is invalid');
    }
  });
  assertZeroSafety(bundle.safety);
  return true;
}

function buildPreviewFingerprint(bundle) {
  assertPreviewBundle(bundle);
  return sha256(stableStringify({
    schemaVersion: bundle.schemaVersion,
    previewType: bundle.previewType,
    mode: bundle.mode,
    handoff: bundle.handoff,
    registryFingerprint: bundle.registryFingerprint,
    before: bundle.before,
    after: bundle.after,
    patch: bundle.patch,
    safety: bundle.safety,
  }));
}

class StagingPreviewStore {
  constructor(runtimeRoot, relativeDir = 'staging-previews') {
    if (!runtimeRoot) throw new TypeError('StagingPreviewStore requires a runtime root');
    this.runtimeRoot = path.resolve(runtimeRoot);
    fs.mkdirSync(this.runtimeRoot, { recursive: true });
    this.previewDir = resolveInsideRuntime(this.runtimeRoot, relativeDir);
    fs.mkdirSync(this.previewDir, { recursive: true });
    this.indexPath = path.join(this.previewDir, 'index.json');
    if (!fs.existsSync(this.indexPath)) this.saveIndex({ version: 1, previews: [] });
  }

  previewFilePath(fileName) {
    if (typeof fileName !== 'string' || !/^preview-[0-9a-f]{64}\.json$/i.test(fileName)) {
      throw new Error('staging preview index contains an invalid file name');
    }
    const filePath = path.resolve(this.previewDir, fileName);
    if (!filePath.startsWith(`${this.previewDir}${path.sep}`)) {
      throw new Error('staging preview file escapes preview directory');
    }
    return filePath;
  }

  loadIndex() {
    const parsed = JSON.parse(fs.readFileSync(this.indexPath, 'utf8'));
    if (!Array.isArray(parsed.previews)) throw new Error('staging preview index must contain previews');
    return parsed;
  }

  saveIndex(index) {
    const temporaryPath = `${this.indexPath}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
    fs.renameSync(temporaryPath, this.indexPath);
  }

  add(bundle) {
    const fingerprint = buildPreviewFingerprint(bundle);
    const index = this.loadIndex();
    const existing = index.previews.find((item) => item.fingerprint === fingerprint);
    if (existing) {
      const preview = this.read(existing.id);
      if (!preview || buildPreviewFingerprint(preview) !== fingerprint || preview.fingerprint !== fingerprint) {
        throw new Error('Existing staging preview failed integrity verification');
      }
      return { preview, deduplicated: true };
    }

    const createdAt = new Date().toISOString();
    const previewId = `preview_${crypto.randomUUID()}`;
    const fileName = `preview-${fingerprint}.json`;
    const filePath = this.previewFilePath(fileName);
    const stored = {
      ...bundle,
      id: previewId,
      fingerprint,
      status: STAGING_PREVIEW_STATUS,
      createdAt,
    };
    const temporaryPath = `${filePath}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(stored, null, 2)}\n`, 'utf8');
    fs.renameSync(temporaryPath, filePath);
    index.previews.push({
      id: previewId,
      fingerprint,
      status: STAGING_PREVIEW_STATUS,
      handoffId: bundle.handoff.id,
      routeBatchId: bundle.handoff.routeBatchId,
      fileName,
      createdAt,
    });
    this.saveIndex(index);
    return { preview: stored, deduplicated: false };
  }

  read(previewId) {
    const item = this.loadIndex().previews.find((entry) => entry.id === previewId || entry.fingerprint === previewId);
    if (!item) return null;
    return JSON.parse(fs.readFileSync(this.previewFilePath(item.fileName), 'utf8'));
  }

  list() {
    return this.loadIndex().previews;
  }

  verify() {
    const index = this.loadIndex();
    for (let itemIndex = 0; itemIndex < index.previews.length; itemIndex += 1) {
      const item = index.previews[itemIndex];
      let filePath;
      try { filePath = this.previewFilePath(item.fileName); }
      catch (_) { return { valid: false, index: itemIndex, reason: 'preview_file_name_invalid' }; }
      if (!fs.existsSync(filePath)) return { valid: false, index: itemIndex, reason: 'preview_file_missing' };
      let preview;
      try { preview = JSON.parse(fs.readFileSync(filePath, 'utf8')); }
      catch (_) { return { valid: false, index: itemIndex, reason: 'preview_json_invalid' }; }
      try {
        const fingerprint = buildPreviewFingerprint(preview);
        if (fingerprint !== item.fingerprint || fingerprint !== preview.fingerprint) {
          return { valid: false, index: itemIndex, reason: 'preview_fingerprint_mismatch' };
        }
        if (preview.id !== item.id || preview.status !== STAGING_PREVIEW_STATUS) {
          return { valid: false, index: itemIndex, reason: 'preview_metadata_mismatch' };
        }
      } catch (error) {
        return { valid: false, index: itemIndex, reason: 'preview_contract_invalid', error: error.message };
      }
    }
    return { valid: true, previews: index.previews.length };
  }
}

module.exports = {
  STAGING_PREVIEW_STATUS,
  StagingPreviewStore,
  assertPreviewBundle,
  buildPreviewFingerprint,
  resolveInsideRuntime,
};
