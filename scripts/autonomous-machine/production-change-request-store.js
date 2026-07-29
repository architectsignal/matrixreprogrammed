'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { assertSigningKey } = require('./review-handoff-store');
const { assertSafeRoute, sha256, stableStringify } = require('./route-registry');

const CHANGE_REQUEST_STATUS = 'pending_production_change_review';
const CHANGE_REQUEST_AUTHORITY = 'advisory_only_manual_production_authorisation_required';

function hmac(signingKey, value) {
  return crypto.createHmac('sha256', signingKey).update(String(value)).digest('hex');
}

function safeEqualHex(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string'
    || !/^[0-9a-f]{64}$/i.test(left) || !/^[0-9a-f]{64}$/i.test(right)) return false;
  return crypto.timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

function assertObject(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${field} must be an object`);
}

function assertHash(value, field) {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/i.test(value)) throw new TypeError(`${field} must be a SHA-256 hash`);
}

function assertZeroSafety(safety) {
  assertObject(safety, 'change request safety');
  for (const field of ['productionWrites', 'publicationTasksCreated', 'commitActions', 'deploymentActions']) {
    if (safety[field] !== 0) throw new Error(`change request safety requires ${field}=0`);
  }
  for (const field of ['productionWriteAllowed', 'commitAllowed', 'deploymentAllowed', 'publicationAllowed']) {
    if (safety[field] !== false) throw new Error(`change request safety requires ${field}=false`);
  }
  if (safety.productionTarget !== null) throw new Error('change request safety requires productionTarget=null');
}

function assertChangeRequestPayload(payload) {
  assertObject(payload, 'production change request payload');
  if (payload.schemaVersion !== 1) throw new Error('production change request schemaVersion must be 1');
  if (payload.requestType !== 'advisory_production_change_request') throw new Error('production change request type is invalid');
  if (payload.mode !== 'change_request_only') throw new Error('production change request mode is invalid');
  if (payload.authority !== CHANGE_REQUEST_AUTHORITY) throw new Error('production change request authority is invalid');
  if (payload.status !== CHANGE_REQUEST_STATUS) throw new Error('production change request status is invalid');

  assertObject(payload.application, 'change request application');
  for (const field of ['id', 'previewId', 'handoffId', 'routeBatchId']) {
    if (typeof payload.application[field] !== 'string' || !payload.application[field]) throw new TypeError(`change request application requires ${field}`);
  }
  for (const field of ['fingerprint', 'previewFingerprint', 'beforeHash', 'afterHash', 'patchHash', 'diffHash']) {
    assertHash(payload.application[field], `change request application ${field}`);
  }
  if (payload.application.exactMatch !== true) throw new Error('change request application requires exactMatch=true');

  assertObject(payload.requester, 'change request requester');
  if (typeof payload.requester.name !== 'string' || payload.requester.name.trim().length < 3) throw new TypeError('change request requester name is invalid');
  if (typeof payload.requester.note !== 'string' || payload.requester.note.trim().length < 10) throw new TypeError('change request requester note is invalid');

  assertObject(payload.sourceSnapshot, 'change request sourceSnapshot');
  for (const field of ['sourceId', 'sourceUrl', 'title', 'evidenceClass', 'sensitivity']) {
    if (typeof payload.sourceSnapshot[field] !== 'string' || !payload.sourceSnapshot[field].trim()) {
      throw new TypeError(`change request sourceSnapshot requires ${field}`);
    }
  }
  if (!Array.isArray(payload.sourceSnapshot.provenance) || payload.sourceSnapshot.provenance.length === 0) {
    throw new Error('production change request requires source provenance');
  }
  payload.sourceSnapshot.provenance.forEach((entry, index) => {
    assertObject(entry, `change request provenance ${index}`);
    if (typeof entry.sourceId !== 'string' || !entry.sourceId || typeof entry.locator !== 'string' || !entry.locator) {
      throw new TypeError(`change request provenance ${index} requires sourceId and locator`);
    }
  });

  if (!Array.isArray(payload.changes) || payload.changes.length === 0) throw new Error('production change request requires changes');
  const targetIds = new Set();
  payload.changes.forEach((change, index) => {
    assertObject(change, `change ${index}`);
    for (const field of ['targetId', 'targetType', 'title', 'route', 'evidenceRoute', 'requestedOperation', 'reviewStatus']) {
      if (typeof change[field] !== 'string' || !change[field].trim()) throw new TypeError(`change ${index} requires ${field}`);
    }
    if (targetIds.has(change.targetId)) throw new Error(`production change request has duplicate target: ${change.targetId}`);
    targetIds.add(change.targetId);
    assertSafeRoute(change.route, `change ${index}.route`);
    assertSafeRoute(change.evidenceRoute, `change ${index}.evidenceRoute`);
    if (change.machineRoute !== null && change.machineRoute !== undefined) assertSafeRoute(change.machineRoute, `change ${index}.machineRoute`);
    if (change.productionFilePath !== null || change.productionDestinationResolved !== false) {
      throw new Error('production change request cannot resolve a production file destination');
    }
    if (change.requestedOperation !== 'manual_review_and_integrate_evidence') throw new Error('production change request operation is invalid');
    if (change.reviewStatus !== 'pending_manual_production_review') throw new Error('production change request review status is invalid');
  });

  assertObject(payload.requiredApprovals, 'change request requiredApprovals');
  for (const field of ['evidenceReview', 'editorialReview', 'productionOwnerApproval']) {
    if (payload.requiredApprovals[field] !== true) throw new Error(`change request requires ${field}=true`);
  }
  if (typeof payload.requiredApprovals.legalReview !== 'boolean') throw new TypeError('change request legalReview must be boolean');
  assertZeroSafety(payload.safety);
  return true;
}

class ProductionChangeRequestStore {
  constructor(filePath) {
    if (!filePath) throw new TypeError('ProductionChangeRequestStore requires a file path');
    this.filePath = filePath;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, '', 'utf8');
  }

  readRecords() {
    const raw = fs.readFileSync(this.filePath, 'utf8').trim();
    if (!raw) return [];
    return raw.split('\n').map((line, index) => {
      try { return JSON.parse(line); }
      catch (error) { throw new Error(`Invalid production change request at line ${index + 1}: ${error.message}`); }
    });
  }

  findByApplicationId(applicationId) {
    return this.readRecords().find((record) => record.payload && record.payload.application
      && record.payload.application.id === applicationId) || null;
  }

  appendSigned(payload, signingKey, signingKeyId = 'production-change-request-key') {
    assertSigningKey(signingKey);
    assertChangeRequestPayload(payload);
    if (typeof signingKeyId !== 'string' || !/^[a-zA-Z0-9._-]{3,80}$/.test(signingKeyId)) {
      throw new TypeError('production change request signing key id is invalid');
    }
    const records = this.readRecords();
    const payloadHash = sha256(stableStringify(payload));
    const existing = this.findByApplicationId(payload.application.id);
    if (existing) {
      if (existing.payloadHash === payloadHash) return { record: existing, idempotent: true };
      throw new Error(`A different signed production change request already exists for application: ${payload.application.id}`);
    }
    const previousRecordHash = records.length ? records.at(-1).recordHash : 'GENESIS';
    const unsigned = {
      sequence: records.length + 1,
      id: `change_request_${crypto.randomUUID()}`,
      createdAt: new Date().toISOString(),
      signingKeyId,
      signatureAlgorithm: 'hmac-sha256',
      previousRecordHash,
      payloadHash,
      payload,
    };
    const recordHash = sha256(stableStringify(unsigned));
    const record = { ...unsigned, recordHash, signature: hmac(signingKey, recordHash) };
    fs.appendFileSync(this.filePath, `${JSON.stringify(record)}\n`, 'utf8');
    return { record, idempotent: false };
  }

  verify(signingKey) {
    assertSigningKey(signingKey);
    const records = this.readRecords();
    let previousRecordHash = 'GENESIS';
    for (let index = 0; index < records.length; index += 1) {
      const record = records[index];
      if (record.sequence !== index + 1) return { valid: false, index, reason: 'sequence_mismatch' };
      if (record.previousRecordHash !== previousRecordHash) return { valid: false, index, reason: 'previous_hash_mismatch' };
      if (record.signatureAlgorithm !== 'hmac-sha256') return { valid: false, index, reason: 'signature_algorithm_mismatch' };
      try { assertChangeRequestPayload(record.payload); }
      catch (error) { return { valid: false, index, reason: 'payload_contract_invalid', error: error.message }; }
      if (record.payloadHash !== sha256(stableStringify(record.payload))) return { valid: false, index, reason: 'payload_hash_mismatch' };
      const { recordHash, signature, ...unsigned } = record;
      const expectedRecordHash = sha256(stableStringify(unsigned));
      if (recordHash !== expectedRecordHash) return { valid: false, index, reason: 'record_hash_mismatch' };
      if (!safeEqualHex(signature, hmac(signingKey, recordHash))) return { valid: false, index, reason: 'signature_mismatch' };
      previousRecordHash = recordHash;
    }
    return { valid: true, records: records.length, finalHash: previousRecordHash };
  }
}

module.exports = {
  CHANGE_REQUEST_AUTHORITY,
  CHANGE_REQUEST_STATUS,
  ProductionChangeRequestStore,
  assertChangeRequestPayload,
};
