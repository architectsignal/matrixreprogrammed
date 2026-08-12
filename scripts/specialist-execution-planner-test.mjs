import assert from 'node:assert/strict';
import { SpecialistExecutionPlanner, EXECUTION_PROFILES } from '../ai-management/autonomy/specialist-execution-planner.mjs';

const planner = new SpecialistExecutionPlanner();
const baseMission = {
  mission_id: 'mission-1',
  specialist: 'investigator',
  execution_mode: 'plan_or_draft_only',
  evidence: {}
};

const investigator = planner.planMission({
  mission: baseMission,
  context: {
    evidence_reference_ids: ['evidence-1','evidence-2'],
    prompt_tokens_estimate: 12000
  }
});
assert.equal(investigator.status, 'planned');
assert.equal(investigator.model_route_request.task_profile, 'long-context');
assert.equal(investigator.model_route_request.prompt_material_included, false);
assert.equal(investigator.local_execution_contract.prompt_compilation_location, 'owner-controlled-local-machine');
assert.equal(investigator.local_execution_contract.prompt_material_in_cloud_payload, false);
assert.equal(investigator.local_execution_contract.cost_ceiling_eur, 0);
assert.equal(investigator.local_execution_contract.paid_fallback_allowed, false);
assert.equal(investigator.local_execution_contract.external_network_required, false);
assert.equal(investigator.controls.evidence_gate_bypass_allowed, false);

const architect = planner.planMission({
  mission: { ...baseMission, mission_id: 'architect-1', specialist: 'architect' }
});
assert.equal(architect.model_route_request.task_profile, 'coding');
assert.equal(architect.local_execution_contract.output_mode, 'plan_or_draft_only');

const blockedPublisher = planner.planMission({
  mission: {
    ...baseMission,
    mission_id: 'publisher-1',
    specialist: 'publisher',
    evidence: { auditor_gate_explicitly_satisfied: true }
  },
  context: { auditor_clearance_ids: [] }
});
assert.equal(blockedPublisher.status, 'blocked');
assert.equal(blockedPublisher.execution_allowed, false);
assert.equal(blockedPublisher.block_reason, 'explicit-auditor-clearance-required');

const publisher = planner.planMission({
  mission: {
    ...baseMission,
    mission_id: 'publisher-2',
    specialist: 'publisher',
    evidence: { auditor_gate_explicitly_satisfied: true }
  },
  context: { auditor_clearance_ids: ['audit-run-44'] }
});
assert.equal(publisher.status, 'planned');
assert.deepEqual(publisher.local_execution_contract.auditor_clearance_ids, ['audit-run-44']);

assert.equal(EXECUTION_PROFILES.mission_director.task_profile, 'reasoning');
assert.equal(EXECUTION_PROFILES.auditor.task_profile, 'reasoning');
assert.equal(EXECUTION_PROFILES.publisher.task_profile, 'long-context');
assert.equal(EXECUTION_PROFILES.growth.task_profile, 'reasoning');
assert.equal(EXECUTION_PROFILES.resource_hunter.task_profile, 'reasoning');
assert.equal(EXECUTION_PROFILES.architect.task_profile, 'coding');

console.log('Specialist execution planner tests passed: local model profiles are bounded, prompts stay local, cost stays zero and Publisher requires a persisted auditor clearance reference.');
