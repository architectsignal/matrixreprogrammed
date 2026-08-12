import assert from 'node:assert/strict';
import { SpecialistExecutionPlanner } from '../ai-management/autonomy/specialist-execution-planner.mjs';
import { SpecialistLocalExecutor, compileSpecialistPrompt } from '../ai-management/autonomy/specialist-local-executor.mjs';

const now = new Date('2026-08-12T00:30:00.000Z');
const mission = {
  mission_id: 'investigation-local-1',
  specialist: 'investigator',
  objective: 'Analyse the supplied public-record ownership documents and identify supported connections.',
  priority: 'P1',
  execution_mode: 'plan_or_draft_only',
  evidence: {}
};
const executionSpec = new SpecialistExecutionPlanner().planMission({
  mission,
  context: {
    evidence_reference_ids: ['ev-1','ev-2'],
    prompt_tokens_estimate: 2000
  }
});

const resource = {
  resource_id: 'local-test-model',
  service_name: 'Local test model',
  capability_types: ['llm'],
  quality_score: 90,
  reliability_score: 95,
  latency_score: 80,
  privacy_score: 100,
  last_health_check: now.toISOString(),
  metadata: {
    local: true,
    endpoint: 'http://127.0.0.1:11434',
    endpoint_scope: 'loopback-only',
    protocol: 'ollama',
    model_id: 'matrix-test-14b',
    context_length: 65536,
    parameters_billion: 14,
    available_gpu_memory_gb: 24,
    estimated_vram_gb: 12,
    last_seen: now.toISOString()
  }
};

let calledUrl = null;
let calledBody = null;
const fakeFetch = async (url, options) => {
  calledUrl = String(url);
  calledBody = JSON.parse(options.body);
  return {
    ok: true,
    status: 200,
    async text() {
      return JSON.stringify({
        message: { content: 'Supported connection found; evidence references ev-1 and ev-2. Uncertainty remains.' },
        prompt_eval_count: 300,
        eval_count: 50,
        done_reason: 'stop'
      });
    }
  };
};

const executor = new SpecialistLocalExecutor({ fetchImpl: fakeFetch, clock: () => now });
const localContext = {
  documents: [
    { evidence_id: 'ev-1', fact: 'Company A owns 60% of Company B.' },
    { evidence_id: 'ev-2', fact: 'Registry filing lists the same beneficial owner.' }
  ]
};
const result = await executor.execute({ mission, executionSpec, resources: [resource], context: localContext });

assert.equal(result.ok, true);
assert.equal(result.status, 'completed');
assert.equal(result.model_resource_id, 'local-test-model');
assert.equal(result.execution_controls.routing_prompt_material_included, false);
assert.equal(result.execution_controls.prompt_compiled_locally, true);
assert.equal(result.execution_controls.inference_endpoint_scope, 'loopback-only');
assert.equal(result.execution_controls.external_network_used, false);
assert.equal(result.execution_controls.cost_confirmed_zero, true);
assert.equal(result.execution_controls.external_consequence_performed, false);
assert.equal(result.execution_controls.production_deployment_performed, false);
assert.equal(result.execution_controls.money_moved, false);
assert.equal(calledUrl, 'http://127.0.0.1:11434/api/chat');
assert.equal(calledBody.model, 'matrix-test-14b');
assert.ok(calledBody.messages[0].content.includes('Company A owns 60% of Company B.'));
assert.ok(calledBody.messages[0].content.includes('Do not presuppose guilt.'));

const prompt = compileSpecialistPrompt({ mission, context: localContext, evidenceReferenceIds: ['ev-1'] });
assert.ok(prompt.includes('Evidence reference IDs: ["ev-1"]'));
assert.ok(prompt.includes('fact, allegation, inference and speculation'));

const blockedPublisherMission = {
  ...mission,
  mission_id: 'publisher-blocked',
  specialist: 'publisher',
  evidence: { auditor_gate_explicitly_satisfied: true }
};
const blockedPublisherSpec = new SpecialistExecutionPlanner().planMission({
  mission: blockedPublisherMission,
  context: { auditor_clearance_ids: [] }
});
await assert.rejects(
  () => executor.execute({ mission: blockedPublisherMission, executionSpec: blockedPublisherSpec, resources: [resource], context: {} }),
  /Execution spec is not runnable/
);

console.log('Specialist local executor tests passed: routing contains metadata only, full context is compiled locally, inference stays loopback-only and external consequences remain disabled.');
