import assert from 'node:assert/strict';
import { SpecialistAIDirector } from '../ai-management/autonomy/specialist-ai-director.mjs';

const director = new SpecialistAIDirector({ clock: () => new Date('2026-08-12T00:00:00.000Z') });
const plan = director.plan({
  signals: {
    investigation_backlog: 8,
    unverified_evidence_count: 12,
    stale_report_count: 3,
    auditor_cleared_report_count: 0,
    revenue_health: 0.4,
    retention_health: 0.5,
    resource_pressure: 0.9,
    site_health: 0.7
  },
  policy: { owner_approval_required_for_external_consequence: true }
});

assert.equal(plan.schema_version, 1);
assert.equal(plan.architecture.shared_memory_required, true);
assert.equal(plan.architecture.shared_evidence_graph_required, true);
assert.equal(plan.architecture.independent_agent_memory_silos_allowed, false);
assert.equal(plan.controls.auditor_gate_before_publication_required, true);
assert.equal(plan.controls.explicit_auditor_clearance_required_for_publisher, true);
assert.equal(plan.controls.commercial_system_may_change_evidence_strength, false);
assert.equal(plan.controls.automatic_spending_allowed, false);
assert.equal(plan.controls.automatic_contract_acceptance_allowed, false);
assert.equal(plan.controls.automatic_production_deployment_allowed, false);
assert.equal(plan.controls.resource_policy_bypass_allowed, false);
assert.ok(plan.missions.some(item => item.specialist === 'investigator'));
assert.ok(plan.missions.some(item => item.specialist === 'auditor'));
assert.ok(plan.missions.some(item => item.specialist === 'growth'));
assert.ok(plan.missions.some(item => item.specialist === 'resource_hunter'));
assert.ok(plan.missions.some(item => item.specialist === 'architect'));
assert.ok(plan.missions.every(item => item.execution_mode === 'plan_or_draft_only'));
assert.ok(plan.missions.every(item => item.owner_approval_required_for_external_consequence === true));
assert.ok(plan.handoffs.some(item => item.from === 'investigator' && item.to === 'auditor' && item.mandatory === true));
assert.ok(plan.handoffs.some(item => item.from === 'auditor' && item.to === 'publisher' && item.mandatory === true));
assert.ok(!plan.missions.some(item => item.specialist === 'publisher'), 'Publisher must not receive a mission while unverified evidence remains.');

const notCleared = director.plan({
  signals: {
    investigation_backlog: 0,
    unverified_evidence_count: 0,
    stale_report_count: 2,
    auditor_cleared_report_count: 0,
    revenue_health: 1,
    retention_health: 1,
    resource_pressure: 0,
    site_health: 1
  }
});
assert.ok(!notCleared.missions.some(item => item.specialist === 'publisher'), 'Zero unverified items must not be treated as auditor approval.');

const publishable = director.plan({
  signals: {
    investigation_backlog: 0,
    unverified_evidence_count: 0,
    stale_report_count: 2,
    auditor_cleared_report_count: 2,
    revenue_health: 1,
    retention_health: 1,
    resource_pressure: 0,
    site_health: 1
  }
});
assert.ok(publishable.missions.some(item => item.specialist === 'publisher'));
const publisherMission = publishable.missions.find(item => item.specialist === 'publisher');
assert.equal(publisherMission.evidence.auditor_gate_required, true);
assert.equal(publisherMission.evidence.auditor_gate_explicitly_satisfied, true);

console.log('Specialist AI director tests passed: seven-agent orchestration shares memory, requires explicit audit clearance before publishing and preserves finance/resource/deploy boundaries.');
