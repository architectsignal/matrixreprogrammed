'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { assertSigningKey } = require('./review-handoff-store');
const { assertSafeRoute, sha256, stableStringify } = require('./route-registry');

const EXECUTION_PLAN_AUTHORITY = 'preview_only_no_execution_authority';
const EXECUTION_PLAN_STATUS = 'pending_manual_execution_plan_review';

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

function assertCandidatePath(value, field) {
  const route = assertSafeRoute(value, field);
  if (route.includes('%')) throw new Error(`${field} cannot contain encoded path characters`);
  const pathname = route.split(/[?#]/, 1)[0];
  if (!/^[A-Za-z0-9._/-]+$/.test(pathname)) throw new Error(`${field} contains unsupported characters`);
  if (pathname.startsWith('.') || pathname.split('/').some((segment) => segment.startsWith('.'))) {
    throw new Error(`${field} cannot target hidden or protected paths`);
  }
  return pathname;
}

function assertZeroSafety(safety) {
  assertObject(safety, 'execution plan safety');
  for (const field of ['productionWrites', 'publicationTasksCreated', 'commitActions', 'deploymentActions']) {
    if (safety[field] !== 0) throw new Error(`execution plan safety requires ${field}=0`);
  }
  for (const field of ['productionWriteAllowed', 'executionAllowed', 'commitAllowed', 'deploymentAllowed', 'publicationAllowed']) {
    if (safety[field] !== false) throw new Error(`execution plan safety requires ${field}=false`);
  }
  if (safety.productionTarget !== null) throw new Error('execution plan safety requires productionTarget=null');
}

function assertExecutionPlanPayload(payload) {
  assertObject(payload, 'production execution plan payload');
  if (payload.schemaVersion !== 1) throw new Error('production execution plan schemaVersion must be 1');
  if (payload.planType !== 'production_target_mapping_execution_plan_preview') throw new Error('production execution plan type is invalid');
  if (payload.mode !== 'mapping_and_execution_plan_preview_only') throw new Error('production execution plan mode is invalid');
  if (payload.authority !== EXECUTION_PLAN_AUTHORITY) throw new Error('production execution plan authority is invalid');
  if (payload.status !== EXECUTION_PLAN_STATUS) throw new Error('production execution plan status is invalid');

  for (const objectField of ['decision', 'changeRequest', 'planner', 'repositorySnapshot', 'executionPlan']) {
    assertObject(payload[objectField], `execution plan ${objectField}`);
  }
  for (const field of ['id', 'changeRequestId', 'applicationId']) {
    if (typeof payload.decision[field] !== 'string' || !payload.decision[field]) throw new TypeError(`execution plan decision requires ${field}`);
  }
  for (const field of ['recordHash', 'payloadHash', 'applicationFingerprint']) assertHash(payload.decision[field], `execution plan decision ${field}`);
  for (const field of ['id', 'applicationId']) {
    if (typeof payload.changeRequest[field] !== 'string' || !payload.changeRequest[field]) throw new TypeError(`execution plan changeRequest requires ${field}`);
  }
  for (const field of ['recordHash', 'payloadHash', 'applicationFingerprint']) assertHash(payload.changeRequest[field], `execution plan changeRequest ${field}`);
  if (payload.decision.changeRequestId !== payload.changeRequest.id) throw new Error('execution plan request binding is inconsistent');
  if (payload.decision.applicationId !== payload.changeRequest.applicationId
    || payload.decision.applicationFingerprint !== payload.changeRequest.applicationFingerprint) {
    throw new Error('execution plan application binding is inconsistent');
  }
  if (typeof payload.planner.name !== 'string' || payload.planner.name.trim().length < 3) throw new TypeError('execution plan planner name is invalid');
  if (typeof payload.planner.note !== 'string' || payload.planner.note.trim().length < 10) throw new TypeError('execution plan planner note is invalid');
  if (payload.repositorySnapshot.rootLabel !== 'repository_root') throw new Error('execution plan repository root label is invalid');
  if (payload.repositorySnapshot.accessMode !== 'read_only') throw new Error('execution plan repository snapshot must be read_only');
  if (!Number.isInteger(payload.repositorySnapshot.maxFileBytes) || payload.repositorySnapshot.maxFileBytes < 1) throw new Error('execution plan maxFileBytes is invalid');
  if (payload.repositorySnapshot.gitCommandsExecuted !== false || payload.repositorySnapshot.writesPerformed !== 0) {
    throw new Error('execution plan repository snapshot must remain read-only');
  }
  for (const field of ['existingCandidateCount', 'missingCandidateCount']) {
    if (!Number.isInteger(payload.repositorySnapshot[field]) || payload.repositorySnapshot[field] < 0) {
      throw new Error(`execution plan repository snapshot ${field} is invalid`);
    }
  }

  if (!Array.isArray(payload.targetMappings) || payload.targetMappings.length === 0) throw new Error('production execution plan requires targetMappings');
  const targetIds = new Set();
  payload.targetMappings.forEach((mapping, index) => {
    assertObject(mapping, `target mapping ${index}`);
    for (const field of ['targetId', 'targetType', 'title']) {
      if (typeof mapping[field] !== 'string' || !mapping[field].trim()) throw new TypeError(`target mapping ${index} requires ${field}`);
    }
    if (targetIds.has(mapping.targetId)) throw new Error(`production execution plan has duplicate target: ${mapping.targetId}`);
    targetIds.add(mapping.targetId);
    assertObject(mapping.sourceRoutes, `target mapping ${index} sourceRoutes`);
    for (const field of ['primaryRoute', 'evidenceRoute']) assertCandidatePath(mapping.sourceRoutes[field], `target mapping ${index} ${field}`);
    if (mapping.sourceRoutes.machineRoute !== null) assertCandidatePath(mapping.sourceRoutes.machineRoute, `target mapping ${index} machineRoute`);
    if (mapping.productionDestinationResolved !== false || mapping.mappingConfirmedForExecution !== false) {
      throw new Error('production execution plan cannot confirm a production destination');
    }
    if (!Array.isArray(mapping.candidates) || mapping.candidates.length === 0) throw new Error(`target mapping ${index} requires candidates`);
    const paths = new Set();
    mapping.candidates.forEach((candidate, candidateIndex) => {
      assertObject(candidate, `target mapping ${index} candidate ${candidateIndex}`);
      if (!Array.isArray(candidate.roles) || candidate.roles.length === 0) throw new Error('execution plan candidate requires roles');
      candidate.roles.forEach((role) => {
        if (!['primary_route', 'evidence_route', 'machine_route'].includes(role)) throw new Error('execution plan candidate role is invalid');
      });
      assertCandidatePath(candidate.proposedRepositoryPath, `target mapping ${index} candidate path`);
      if (paths.has(candidate.proposedRepositoryPath)) throw new Error('execution plan target contains duplicate candidate path');
      paths.add(candidate.proposedRepositoryPath);
      if (typeof candidate.exists !== 'boolean' || typeof candidate.regularFile !== 'boolean' || typeof candidate.symlink !== 'boolean') {
        throw new TypeError('execution plan candidate file-state fields must be boolean');
      }
      if (candidate.symlink !== false) throw new Error('execution plan candidate cannot be a symlink');
      if (candidate.exists) {
        if (!candidate.regularFile) throw new Error('existing execution plan candidate must be a regular file');
        assertHash(candidate.currentSha256, 'execution plan candidate currentSha256');
        if (!Number.isInteger(candidate.currentBytes) || candidate.currentBytes < 0) throw new Error('execution plan candidate currentBytes is invalid');
        if (candidate.mappingStatus !== 'candidate_existing_read_only') throw new Error('existing execution plan candidate status is invalid');
      } else {
        if (candidate.regularFile || candidate.currentSha256 !== null || candidate.currentBytes !== null) {
          throw new Error('missing execution plan candidate has invalid file metadata');
        }
        if (candidate.mappingStatus !== 'candidate_missing_manual_resolution_required') throw new Error('missing execution plan candidate status is invalid');
      }
      if (candidate.mappingConfirmedForExecution !== false || candidate.writeAllowed !== false) {
        throw new Error('execution plan candidate cannot grant write or execution confirmation');
      }
    });
  });

  if (!Array.isArray(payload.executionPlan.steps) || payload.executionPlan.steps.length !== payload.targetMappings.length) {
    throw new Error('execution plan steps must correspond to target mappings');
  }
  let existingCandidates = 0;
  let missingCandidates = 0;
  payload.targetMappings.forEach((mapping) => mapping.candidates.forEach((candidate) => {
    if (candidate.exists) existingCandidates += 1; else missingCandidates += 1;
  }));
  if (existingCandidates !== payload.repositorySnapshot.existingCandidateCount
    || missingCandidates !== payload.repositorySnapshot.missingCandidateCount) {
    throw new Error('execution plan repository candidate counts are inconsistent');
  }
  payload.executionPlan.steps.forEach((step, index) => {
    assertObject(step, `execution plan step ${index}`);
    if (step.sequence !== index + 1) throw new Error('execution plan step sequence is invalid');
    if (step.targetId !== payload.targetMappings[index].targetId) throw new Error('execution plan step target is inconsistent');
    if (step.action !== 'manual_review_and_integrate_evidence') throw new Error('execution plan step action is invalid');
    if (step.executionAllowed !== false || step.productionWriteAllowed !== false) throw new Error('execution plan step cannot grant execution');
    if (!Array.isArray(step.candidatePaths) || step.candidatePaths.length === 0) throw new Error('execution plan step requires candidatePaths');
    step.candidatePaths.forEach((item) => assertCandidatePath(item, 'execution plan step candidate path'));
    const expectedPaths = payload.targetMappings[index].candidates.map((candidate) => candidate.proposedRepositoryPath);
    if (JSON.stringify(step.candidatePaths) !== JSON.stringify(expectedPaths)) throw new Error('execution plan step candidate paths are inconsistent');
    if (!Array.isArray(step.preconditions) || step.preconditions.length < 1
      || !Array.isArray(step.validationChecks) || step.validationChecks.length < 1) {
      throw new Error('execution plan step requires preconditions and validation checks');
    }
  });
  if (payload.executionPlan.separateExecutionAuthorisationRequired !== true
    || payload.executionPlan.finalDestinationConfirmationRequired !== true
    || payload.executionPlan.currentHashRevalidationRequired !== true
    || payload.executionPlan.rollbackPlanRequired !== true
    || payload.executionPlan.humanDiffReviewRequired !== true
    || payload.executionPlan.readyForExecution !== false) {
    throw new Error('execution plan must require separate execution authorisation');
  }
  assertZeroSafety(payload.safety);
  return true;
}

class ProductionExecutionPlanStore {
  constructor(filePath) {
    if (!filePath) throw new TypeError('ProductionExecutionPlanStore requires a file path');
    this.filePath = filePath;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, '', 'utf8');
  }

  readRecords() {
    const raw = fs.readFileSync(this.filePath, 'utf8').trim();
    if (!raw) return [];
    return raw.split('\n').map((line, index) => {
      try { return JSON.parse(line); }
      catch (error) { throw new Error(`Invalid production execution plan at line ${index + 1}: ${error.message}`); }
    });
  }

  findByDecisionId(decisionId) {
    return this.readRecords().find((record) => record.payload && record.payload.decision
      && record.payload.decision.id === decisionId) || null;
  }

  appendSigned(payload, signingKey, signingKeyId = 'production-execution-plan-key') {
    assertSigningKey(signingKey);
    assertExecutionPlanPayload(payload);
    if (typeof signingKeyId !== 'string' || !/^[a-zA-Z0-9._-]{3,80}$/.test(signingKeyId)) {
      throw new TypeError('production execution plan signing key id is invalid');
    }
    const records = this.readRecords();
    const payloadHash = sha256(stableStringify(payload));
    const existing = this.findByDecisionId(payload.decision.id);
    if (existing) {
      if (existing.payloadHash === payloadHash) return { record: existing, idempotent: true };
      throw new Error(`A different signed production execution plan already exists for decision: ${payload.decision.id}`);
    }
    const previousRecordHash = records.length ? records.at(-1).recordHash : 'GENESIS';
    const unsigned = {
      sequence: records.length + 1,
      id: `execution_plan_${crypto.randomUUID()}`,
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
      try { assertExecutionPlanPayload(record.payload); }
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
  EXECUTION_PLAN_AUTHORITY,
  EXECUTION_PLAN_STATUS,
  ProductionExecutionPlanStore,
  assertCandidatePath,
  assertExecutionPlanPayload,
};
