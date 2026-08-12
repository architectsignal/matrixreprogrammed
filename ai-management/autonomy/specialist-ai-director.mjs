const SPECIALISTS = Object.freeze({
  mission_director: {
    label: 'Mission Director',
    purpose: 'Prioritise work across Matrix and coordinate specialist handoffs.',
    can_execute_external_actions: false,
    required_inputs: ['site_health','investigation_backlog','revenue_health','resource_health'],
    outputs: ['mission_plan','handoff_plan','priority_queue']
  },
  investigator: {
    label: 'Investigator',
    purpose: 'Discover, collect, connect and structure lawful public-record evidence.',
    can_execute_external_actions: false,
    required_inputs: ['research_question'],
    outputs: ['evidence_candidates','entity_links','timeline_events','open_questions']
  },
  auditor: {
    label: 'Auditor',
    purpose: 'Challenge claims, provenance, contradictory evidence and publication readiness.',
    can_execute_external_actions: false,
    required_inputs: ['evidence_candidates'],
    outputs: ['verification_result','contradictions','risk_flags','publication_gate']
  },
  publisher: {
    label: 'Publisher',
    purpose: 'Turn verified evidence into useful reports, dossiers, alerts and explanations.',
    can_execute_external_actions: false,
    required_inputs: ['verified_evidence','auditor_clearance'],
    outputs: ['report_draft','dossier_update','briefing','what_changed']
  },
  growth: {
    label: 'Growth Director',
    purpose: 'Improve lawful revenue and retention through bounded evidence-independent experiments.',
    can_execute_external_actions: false,
    required_inputs: ['verified_revenue','retention_metrics'],
    outputs: ['growth_experiment','channel_ranking','reinvestment_signal']
  },
  resource_hunter: {
    label: 'Resource Hunter',
    purpose: 'Discover and benchmark lawful zero-cost or owner-approved tools, data and compute.',
    can_execute_external_actions: false,
    required_inputs: ['capability_gap'],
    outputs: ['resource_candidates','benchmark_request','replacement_proposal']
  },
  architect: {
    label: 'Architect',
    purpose: 'Improve Matrix software using reversible tested changes through the guarded development pipeline.',
    can_execute_external_actions: false,
    required_inputs: ['site_issue','validated_improvement_opportunity'],
    outputs: ['change_proposal','test_plan','pull_request_plan','rollback_plan']
  }
});

const FORBIDDEN = Object.freeze({
  mission_director: ['weaken_policy','move_money','deploy_production','accept_terms','override_auditor'],
  investigator: ['presuppose_guilt','fabricate_evidence','credential_harvesting','access_control_evasion','publish_sensitive_claim'],
  auditor: ['hide_contrary_evidence','lower_evidence_threshold_for_commercial_reason','approve_unsupported_claim'],
  publisher: ['invent_evidence','publish_unverified_sensitive_claim','change_evidence_strength_for_engagement','bypass_auditor_clearance'],
  growth: ['change_evidence_strength','hide_contrary_evidence','fake_scarcity','false_urgency','change_price','move_money','accept_contract'],
  resource_hunter: ['abuse_free_tier','evade_access_controls','accept_terms','create_paid_account','attach_payment_method','transfer_private_prompt'],
  architect: ['deploy_production','weaken_safety_gate','weaken_evidence_gate','change_payment_credentials','disable_rollback']
});

function clamp(value, min = 0, max = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function safeTarget(value) {
  return String(value || '').trim().replace(/[^a-zA-Z0-9:_./-]+/g, '-').slice(0, 300);
}

function mission(id, specialist, objective, priority, evidence = {}) {
  return {
    mission_id: id,
    specialist,
    objective,
    priority,
    evidence,
    execution_mode: 'plan_or_draft_only',
    owner_approval_required_for_external_consequence: true,
    forbidden_actions: FORBIDDEN[specialist] || [],
    status: 'proposed'
  };
}

export class SpecialistAIDirector {
  constructor({ clock = () => new Date(), maximumMissions = 12 } = {}) {
    this.clock = clock;
    this.maximumMissions = Math.max(1, Math.min(50, Number(maximumMissions) || 12));
  }

  describe() {
    return {
      schema_version: 1,
      specialists: SPECIALISTS,
      shared_memory_required: true,
      shared_evidence_graph_required: true,
      independent_agent_memory_silos_allowed: false,
      external_execution_default_allowed: false
    };
  }

  plan({ signals = {}, policy = {} } = {}) {
    const now = this.clock().toISOString();
    const missions = [];
    const backlog = Math.max(0, Number(signals.investigation_backlog || 0));
    const unverified = Math.max(0, Number(signals.unverified_evidence_count || 0));
    const staleReports = Math.max(0, Number(signals.stale_report_count || 0));
    const auditorClearedReports = Math.max(0, Number(signals.auditor_cleared_report_count || 0));
    const publicationTargetId = safeTarget(signals.publication_target_id);
    const revenueHealth = clamp(signals.revenue_health ?? 0.5);
    const retentionHealth = clamp(signals.retention_health ?? 0.5);
    const resourcePressure = clamp(signals.resource_pressure ?? 0);
    const siteHealth = clamp(signals.site_health ?? 1);

    if (backlog > 0) missions.push(mission(
      `investigate-${now}`,
      'investigator',
      `Work the highest-value unresolved public-record investigation from a backlog of ${backlog}.`,
      'P1',
      { investigation_backlog: backlog }
    ));

    if (unverified > 0) missions.push(mission(
      `audit-${now}`,
      'auditor',
      `Challenge and verify ${unverified} evidence candidates before any publication handoff.`,
      'P0',
      { unverified_evidence_count: unverified, publication_target_id: publicationTargetId || null }
    ));

    if (staleReports > 0 && auditorClearedReports > 0 && publicationTargetId) missions.push(mission(
      `publish-${publicationTargetId}-${now}`,
      'publisher',
      `Refresh auditor-cleared evidence-backed publication target ${publicationTargetId}.`,
      'P2',
      {
        publication_target_id: publicationTargetId,
        stale_report_count: staleReports,
        auditor_cleared_report_count: auditorClearedReports,
        auditor_gate_required: true,
        auditor_gate_explicitly_satisfied: true,
        target_specific_auditor_clearance_required: true
      }
    ));

    if (revenueHealth < 0.7 || retentionHealth < 0.7) missions.push(mission(
      `growth-${now}`,
      'growth',
      'Propose a reversible zero-cost growth experiment using verified revenue and retention telemetry.',
      'P2',
      { revenue_health: revenueHealth, retention_health: retentionHealth, evidence_independence_required: true }
    ));

    if (resourcePressure > 0.5) missions.push(mission(
      `resource-${now}`,
      'resource_hunter',
      'Find and benchmark lawful zero-cost capacity or tools that address the current capability bottleneck.',
      'P2',
      { resource_pressure: resourcePressure, zero_spend_required: true }
    ));

    if (siteHealth < 0.95) missions.push(mission(
      `architect-${now}`,
      'architect',
      'Prepare a tested reversible repair for the highest-impact site reliability issue.',
      siteHealth < 0.75 ? 'P0' : 'P1',
      { site_health: siteHealth, deployment_allowed: false }
    ));

    const ordered = missions
      .sort((a, b) => ['P0','P1','P2','P3','P4'].indexOf(a.priority) - ['P0','P1','P2','P3','P4'].indexOf(b.priority))
      .slice(0, this.maximumMissions);

    const handoffs = [];
    if (ordered.some(item => item.specialist === 'investigator')) {
      handoffs.push({ from: 'investigator', to: 'auditor', condition: 'evidence_candidates_ready', mandatory: true });
    }
    handoffs.push({ from: 'auditor', to: 'publisher', condition: 'publication_gate_passed', mandatory: true });
    handoffs.push({ from: 'growth', to: 'mission_director', condition: 'experiment_result_ready', mandatory: true });
    handoffs.push({ from: 'resource_hunter', to: 'mission_director', condition: 'resource_benchmark_ready', mandatory: true });
    handoffs.push({ from: 'architect', to: 'mission_director', condition: 'tested_change_ready', mandatory: true });

    return {
      schema_version: 1,
      generated_at: now,
      architecture: this.describe(),
      missions: ordered,
      handoffs,
      controls: {
        shared_memory_required: true,
        shared_evidence_graph_required: true,
        auditor_gate_before_publication_required: true,
        explicit_auditor_clearance_required_for_publisher: true,
        target_specific_auditor_clearance_required: true,
        commercial_system_may_change_evidence_strength: false,
        automatic_spending_allowed: false,
        automatic_contract_acceptance_allowed: false,
        automatic_production_deployment_allowed: false,
        resource_policy_bypass_allowed: false,
        owner_approval_required_for_external_consequence: policy?.owner_approval_required_for_external_consequence !== false
      }
    };
  }
}

export { SPECIALISTS, FORBIDDEN };
export default SpecialistAIDirector;
