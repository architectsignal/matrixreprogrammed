'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { sha256, stableStringify } = require('./route-registry');

function assertSigningKey(signingKey) {
  if (typeof signingKey !== 'string' || Buffer.byteLength(signingKey, 'utf8') < 32) {
    throw new Error('AIM_REVIEW_SIGNING_KEY must contain at least 32 bytes');
  }
}

function hmac(signingKey, value) {
  return crypto.createHmac('sha256', signingKey).update(String(value)).digest('hex');
}

function safeEqualHex(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string'
    || !/^[0-9a-f]{64}$/i.test(left) || !/^[0-9a-f]{64}$/i.test(right)) return false;
  return crypto.timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

class ReviewHandoffStore {
  constructor(filePath) {
    if (!filePath) throw new TypeError('ReviewHandoffStore requires a file path');
    this.filePath = filePath;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, '', 'utf8');
  }

  readRecords() {
    const raw = fs.readFileSync(this.filePath, 'utf8').trim();
    if (!raw) return [];
    return raw.split('\n').map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`Invalid handoff record at line ${index + 1}: ${error.message}`);
      }
    });
  }

  findByRouteBatchId(routeBatchId) {
    return this.readRecords().find((record) => record.payload && record.payload.routeBatchId === routeBatchId) || null;
  }

  appendSigned(payload, signingKey, signingKeyId = 'manual-review-key') {
    assertSigningKey(signingKey);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new TypeError('handoff payload must be an object');
    if (typeof signingKeyId !== 'string' || !/^[a-zA-Z0-9._-]{3,80}$/.test(signingKeyId)) {
      throw new TypeError('signing key id is invalid');
    }
    const records = this.readRecords();
    const existing = this.findByRouteBatchId(payload.routeBatchId);
    if (existing) {
      if (existing.payloadHash === sha256(stableStringify(payload))) return { record: existing, idempotent: true };
      throw new Error(`A different signed decision already exists for route batch: ${payload.routeBatchId}`);
    }
    const previousRecordHash = records.length ? records.at(-1).recordHash : 'GENESIS';
    const payloadHash = sha256(stableStringify(payload));
    const unsigned = {
      sequence: records.length + 1,
      id: `handoff_${crypto.randomUUID()}`,
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

module.exports = { ReviewHandoffStore, assertSigningKey };
