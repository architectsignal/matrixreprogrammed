const EXECUTION_PROFILES = Object.freeze({
  mission_director: {
    task_profile: 'reasoning',
    max_tokens: 4096,
    context_policy: 'reference_ids_only',
    purpose: 'Prioritise missions and coordinate specialist handoffs.'
  },
  investigator: {
    task_profile: 'long-context',
    fallback_task_profile: 'reasoning',
    max_tokens: 8192,
    context_policy: 'reference_ids_only',
    purpose: 'Analyse lawful public-record evidence and identify connections and open questions.'
  },
  auditor: {
    task_profile: 'reasoning',
    max_tokens: 6144,
    context_policy: 'reference_ids_only',
    purpose: 'Challenge evidence, provenance, contradictions and publication readiness.'
  },
  publisher: {
    task_profile: 'long-context',
    fallback_task_profile: 'reasoning',
    max_tokens: 8192,
    context_policy: 'reference_ids_only',
    purpose: 'Draft evidence-backed reports only after an explicit auditor clearance.'
  },
  growth: {
    task_profile: 'reasoning',
    max_tokens: 4096,
    context_policy: 'aggregate_metrics_only',
    purpose: 'Propose reversible zero-cost retention and revenue experiments without changing evidence.'
  },
  resource_hunter: {
    task_profile: 'reasoning',
    max_tokens: 4096,
    context_policy: 'public_metadata_only',
    purpose: 'Evaluate lawful zero-cost or owner-approved resources under existing resource policy.'
  },
  architect: {
    task_profile: 'coding',
    fallback_task_profile: 'reasoning',
    max_tokens: 8192,
    context_policy: 'reference_ids_only',
    purpose: 'Prepare tested reversible code changes, test plans and rollback plans without deploying.'
  }
});

const ALLOWED_SPECIALISTS = new Set(Object.keys(EXECUTION_PROFILES));

function clampInteger(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function cleanRefs(values, maximum = 500) {
  const source = Array.isArray(values) ? values : [];
  const seen = new Set();
  const result = [];
  for (const value of source) {
    const text = String(value || '').trim().slice(0, 300);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
    if (result.length >= maximum) break;
  }
  return result;
}

function assertMission(mission) {
  if (!mission || typeof mission !== 'object') throw new Error('Mission is required');
  if (!mission.mission_id) throw new Error('Mission id is required');
  if (!ALLOWED_SPECIALISTS.has(mission.specialist)) throw new Error(`Unsupported specialist: ${mission.specialist || 'missing'}`);
  if (mission.execution_mode !== 'plan_or_draft_only') throw new Error('Specialist execution mode must remain plan_or_draft_only');
}

function publisherGateSatisfied(mission, context) {
  if (mission.specialist !== 'publisher') return true;
  const ids = cleanRefs(context?.auditor_clearance_ids, 100);
  return mission?.evidence?.auditor_gate_explicitly_satisfied === true && ids.length > 0;
}

export class SpecialistExecutionPlanner {
  describe() {
    return {
      schema_version: 1,
      profiles: EXECUTION_PROFILES,
      local_controller_required: true,
      cloud_prompt_material_allowed: false,
      prompt_compilation_location: 'owner-controlled-local-machine',
      paid_fallback_allowed: false,
      external_network_inference_allowed: false
    };
  }

  planMission({ mission, context = {} } = {}) {
    assertMission(mission);
    const profile = EXECUTION_PROFILES[mission.specialist];
    const evidenceReferenceIds = cleanRefs(context.evidence_reference_ids);
    const artifactReferenceIds = cleanRefs(context.artifact_reference_ids);
    const auditorClearanceIds = cleanRefs(context.auditor_clearance_ids, 100);
    const gateSatisfied = publisherGateSatisfied(mission, { auditor_clearance_ids: auditorClearanceIds });
    const promptTokensEstimate = clampInteger(context.prompt_tokens_estimate, 1, 2_000_000, 2048);
    const maxTokens = clampInteger(context.max_tokens, 1, profile.max_tokens, profile.max_tokens);

    if (!gateSatisfied) {
      return {
        schema_version: 1,
        mission_id: mission.mission_id,
        specialist: mission.specialist,
        status: 'blocked',
        block_reason: 'explicit-auditor-clearance-required',
        execution_allowed: false,
        controls: this.controls()
      };
    }

    return {
      schema_version: 1,
      mission_id: mission.mission_id,
      specialist: mission.specialist,
      status: 'planned',
      execution_allowed: true,
      model_route_request: {
        task_profile: profile.task_profile,
        fallback_task_profile: profile.fallback_task_profile || null,
        prompt_tokens_estimate: promptTokensEstimate,
        max_tokens: maxTokens,
        data_class: 'metadata-only',
        prompt_material_included: false,
        evidence_reference_count: evidenceReferenceIds.length,
        artifact_reference_count: artifactReferenceIds.length
      },
      local_execution_contract: {
        job_type: 'llm.generate',
        execution_location: 'owner-controlled-local-machine',
        prompt_compilation_location: 'owner-controlled-local-machine',
        prompt_material_in_cloud_payload: false,
        context_policy: profile.context_policy,
        evidence_reference_ids: evidenceReferenceIds,
        artifact_reference_ids: artifactReferenceIds,
        auditor_clearance_ids: auditorClearanceIds,
        maximum_output_tokens: maxTokens,
        cost_ceiling_eur: 0,
        paid_fallback_allowed: false,
        external_network_required: false,
        provenance_required: true,
        output_mode: 'plan_or_draft_only'
      },
      controls: this.controls()
    };
  }

  planMany({ missions = [], contexts = {} } = {}) {
    return missions.map(mission => this.planMission({
      mission,
      context: contexts?.[mission.mission_id] || {}
    }));
  }

  controls() {
    return {
      local_controller_required: true,
      cloud_prompt_material_allowed: false,
      cloud_credentials_transfer_allowed: false,
      paid_fallback_allowed: false,
      external_network_inference_allowed: false,
      automatic_spending_allowed: false,
      automatic_contract_acceptance_allowed: false,
      automatic_production_deployment_allowed: false,
      evidence_gate_bypass_allowed: false
    };
  }
}

export { EXECUTION_PROFILES };
export default SpecialistExecutionPlanner;
