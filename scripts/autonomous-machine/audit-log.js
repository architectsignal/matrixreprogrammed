'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { stableStringify, sha256 } = require('./validation');

class AuditLog {
  constructor(filePath) {
    if (!filePath) throw new TypeError('AuditLog requires a file path');
    this.filePath = filePath;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, '', 'utf8');
  }

  readEntries() {
    const raw = fs.readFileSync(this.filePath, 'utf8').trim();
    if (!raw) return [];
    return raw.split('\n').map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`Invalid audit entry at line ${index + 1}: ${error.message}`);
      }
    });
  }

  append(eventType, details = {}, actor = 'autonomous-machine') {
    const entries = this.readEntries();
    const previousHash = entries.length ? entries.at(-1).hash : 'GENESIS';
    const unsigned = {
      sequence: entries.length + 1,
      timestamp: new Date().toISOString(),
      eventType,
      actor,
      details,
      previousHash,
    };
    const entry = { ...unsigned, hash: sha256(stableStringify(unsigned)) };
    fs.appendFileSync(this.filePath, `${JSON.stringify(entry)}\n`, 'utf8');
    return entry;
  }

  verify() {
    const entries = this.readEntries();
    let previousHash = 'GENESIS';
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      if (entry.sequence !== index + 1) {
        return { valid: false, index, reason: 'sequence_mismatch' };
      }
      if (entry.previousHash !== previousHash) {
        return { valid: false, index, reason: 'previous_hash_mismatch' };
      }
      const { hash, ...unsigned } = entry;
      const expectedHash = sha256(stableStringify(unsigned));
      if (hash !== expectedHash) {
        return { valid: false, index, reason: 'entry_hash_mismatch' };
      }
      previousHash = hash;
    }
    return { valid: true, entries: entries.length, finalHash: previousHash };
  }
}

module.exports = { AuditLog };
