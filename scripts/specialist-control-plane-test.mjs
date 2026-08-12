import assert from 'node:assert/strict';
import { handleSpecialistAIRoute, specialistAIInternals } from '../src/worker-specialist-ai.js';

function createFakeDb() {
  const tables = new Set(['matrix_agent_missions','matrix_agent_runs','matrix_agent_handoffs','matrix_agent_execution_specs']);
  const state = {
    mission: {
      mission_id: 'audit-1',
      specialist: 'auditor',
      status: 'proposed',
      evidence_json: JSON.stringify({ publication_target_id: 'dossier/example' })
    },
    runs: [],
    handoff: {
      handoff_id: 'audit-1:auditor:publisher:publication_gate_passed',
      mission_id: 'audit-1',
      from_specialist: 'auditor',
      to_specialist: 'publisher',
      condition_name: 'publication_gate_passed',
      gate_passed: 0,
      evidence_json: '{}',
      resolved_at: null
    },
    executionStatus: 'planned'
  };

  function statement(sql) {
    const normalized = String(sql).replace(/\s+/g, ' ').trim();
    let bindings = [];
    return {
      bind(...values) { bindings = values; return this; },
      async first() {
        if (normalized.includes("FROM sqlite_master")) {
          const name = bindings[0];
          return tables.has(name) ? { name } : null;
        }
        if (normalized.includes('FROM ai_feature_flags')) return { enabled: 1 };
        if (normalized.includes('FROM matrix_agent_missions WHERE mission_id=?')) {
          return bindings[0] === state.mission.mission_id ? { ...state.mission } : null;
        }
        if (normalized.includes('SELECT COUNT(*) AS count FROM matrix_agent_handoffs')) {
          return { count: state.handoff.gate_passed ? 1 : 0 };
        }
        return null;
      },
      async all() {
        if (normalized.includes('FROM matrix_agent_handoffs') && normalized.includes("condition_name='publication_gate_passed'")) {
          return {
            results: state.handoff.gate_passed ? [{
              handoff_id: state.handoff.handoff_id,
              mission_id: state.handoff.mission_id,
              evidence_json: state.handoff.evidence_json,
              resolved_at: state.handoff.resolved_at
            }] : []
          };
        }
        return { results: [] };
      },
      async run() {
        if (normalized.startsWith('INSERT OR REPLACE INTO matrix_agent_runs')) {
          state.runs.push({
            run_id: bindings[0],
            mission_id: bindings[1],
            specialist: bindings[2],
            model_id: bindings[3],
            resource_id: bindings[4],
            input_evidence_ids_json: bindings[5],
            output_evidence_ids_json: bindings[6],
            metrics_json: bindings[7],
            status: bindings[10]
          });
        } else if (normalized.startsWith('UPDATE matrix_agent_missions SET status=')) {
          state.mission.status = bindings[0];
          state.mission.result_json = bindings[1];
        } else if (normalized.startsWith('UPDATE matrix_agent_execution_specs SET status=')) {
          state.executionStatus = bindings[0];
        } else if (normalized.startsWith('UPDATE matrix_agent_handoffs SET gate_passed=')) {
          state.handoff.gate_passed = Number(bindings[0]);
          state.handoff.evidence_json = bindings[1];
          state.handoff.resolved_at = bindings[2];
        }
        return { success: true, meta: { changes: 1 } };
      }
    };
  }

  return { db: { prepare: statement }, state };
}

function request(body) {
  return new Request('https://matrixreprogrammed.com/api/ai-management/admin/specialists/result', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}

const { db, state } = createFakeDb();
const env = {
  MEMBERS_DB: db,
  MATRIX_SPECIALIST_AI_ORCHESTRATION_ENABLED: 'true'
};

const baseReceipt = {
  mission_id: 'audit-1',
  specialist: 'auditor',
  status: 'completed',
  result_digest: 'a'.repeat(64),
  model_id: 'matrix-test-14b',
  resource_id: 'local-model',
  model_route_score: 92,
  input_evidence_ids: ['ev-1','ev-2'],
  output_evidence_ids: ['ev-1','ev-2'],
  publication_target_id: 'dossier/example',
  publication_gate_passed: true,
  provenance_checked: true,
  contrary_evidence_considered: true,
  cost_confirmed_zero: true,
  inference_external_network_used: false,
  external_consequence_performed: false,
  production_deployment_performed: false,
  money_moved: false
};

const rawAttempt = await handleSpecialistAIRoute(request({ ...baseReceipt, raw_output: 'never upload this' }), env);
assert.equal(rawAttempt.status, 400);
const rawPayload = await rawAttempt.json();
assert.match(rawPayload.error, /Raw prompt\/model output is forbidden/);
assert.equal(state.runs.length, 0);

const badDigest = await handleSpecialistAIRoute(request({ ...baseReceipt, result_digest: 'not-a-digest' }), env);
assert.equal(badDigest.status, 400);
assert.equal(state.runs.length, 0);

const paidAttempt = await handleSpecialistAIRoute(request({ ...baseReceipt, cost_confirmed_zero: false }), env);
assert.equal(paidAttempt.status, 400);
assert.equal(state.runs.length, 0);

const accepted = await handleSpecialistAIRoute(request(baseReceipt), env);
assert.equal(accepted.status, 200);
const acceptedPayload = await accepted.json();
assert.equal(acceptedPayload.ok, true);
assert.equal(acceptedPayload.publication_cleared, true);
assert.equal(acceptedPayload.raw_output_persisted, false);
assert.equal(acceptedPayload.controls.cost_confirmed_zero, true);
assert.equal(acceptedPayload.controls.inference_external_network_used, false);
assert.equal(acceptedPayload.controls.external_consequence_performed, false);
assert.equal(acceptedPayload.controls.production_deployment_performed, false);
assert.equal(acceptedPayload.controls.money_moved, false);
assert.equal(state.runs.length, 1);
assert.equal(state.mission.status, 'completed');
assert.equal(state.executionStatus, 'completed');
assert.equal(state.handoff.gate_passed, 1);
const handoffEvidence = JSON.parse(state.handoff.evidence_json);
assert.equal(handoffEvidence.publication_target_id, 'dossier/example');
assert.equal(handoffEvidence.publication_gate_passed, true);
assert.equal(handoffEvidence.provenance_checked, true);
assert.equal(handoffEvidence.contrary_evidence_considered, true);
assert.deepEqual(handoffEvidence.output_evidence_ids, ['ev-1','ev-2']);
assert.equal(handoffEvidence.raw_output_persisted, false);

const matching = await specialistAIInternals.readAuditorClearances(db, 'dossier/example');
assert.equal(matching.length, 1);
assert.equal(matching[0].handoff_id, state.handoff.handoff_id);
const unrelated = await specialistAIInternals.readAuditorClearances(db, 'dossier/unrelated');
assert.equal(unrelated.length, 0);

console.log('Specialist control-plane tests passed: raw outputs are rejected, only zero-cost hashed receipts are accepted, and Auditor clearance is persisted and retrieved only for the exact publication target.');
