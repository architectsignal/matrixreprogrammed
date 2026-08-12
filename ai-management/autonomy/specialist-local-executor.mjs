import { routeLocalModel, estimateTokens } from '../local-runtime/model-router.mjs';
import { OpenAiCompatibleLocalAdapter } from '../provider-adapters/local/openai-compatible-local.mjs';

const SPECIALIST_INSTRUCTIONS = Object.freeze({
  mission_director: 'Prioritise Matrix work from the supplied evidence and operational signals. Coordinate specialists, but never override evidence, finance, resource, security or deployment gates.',
  investigator: 'Investigate the supplied lawful public-record material. Do not presuppose guilt. Separate observed fact, allegation, inference and speculation. Identify provenance, connections, contradictions and unanswered questions.',
  auditor: 'Act as an adversarial verifier. Challenge source quality, provenance, corroboration, contradictions, alternative explanations and unsupported claims. Prefer blocking publication when evidence is insufficient.',
  publisher: 'Draft a clear evidence-backed report using only auditor-cleared material. Preserve citations and contrary evidence. Never strengthen a claim beyond the evidence or invent missing facts.',
  growth: 'Analyse verified aggregate retention and revenue information. Propose reversible zero-cost growth experiments only. Never alter evidence, hide contrary material, create false urgency, change prices, move money or accept contracts.',
  resource_hunter: 'Evaluate lawful resource candidates for capability, reliability, privacy, terms, quota and zero-cost fit. Never evade controls, abuse free tiers, accept terms, create paid accounts, attach payment methods or transfer private prompts.',
  architect: 'Prepare code-change proposals, tests and rollback plans. Prefer small reversible changes. Never deploy production, weaken safety/evidence gates, change payment credentials or disable rollback.'
});

function ensureMission(mission) {
  if (!mission?.mission_id || !SPECIALIST_INSTRUCTIONS[mission.specialist]) throw new Error('Valid specialist mission is required');
  if (mission.execution_mode !== 'plan_or_draft_only') throw new Error('Specialist mission must remain plan_or_draft_only');
}

function ensureExecutionSpec(mission, spec) {
  if (!spec || spec.mission_id !== mission.mission_id || spec.specialist !== mission.specialist) throw new Error('Execution spec does not match mission');
  if (spec.status !== 'planned' || spec.execution_allowed !== true) throw new Error(`Execution spec is not runnable: ${spec?.block_reason || spec?.status || 'unknown'}`);
  if (spec.controls?.cloud_prompt_material_allowed !== false) throw new Error('Cloud prompt material boundary is missing');
  if (spec.controls?.paid_fallback_allowed !== false) throw new Error('Paid fallback must remain disabled');
  if (spec.controls?.external_network_inference_allowed !== false) throw new Error('External-network inference must remain disabled');
  if (mission.specialist === 'publisher') {
    const clearances = spec.local_execution_contract?.auditor_clearance_ids;
    if (mission?.evidence?.auditor_gate_explicitly_satisfied !== true || !Array.isArray(clearances) || clearances.length === 0) {
      throw new Error('Publisher execution requires explicit auditor clearance references');
    }
  }
}

function safeContext(context) {
  if (context == null) return {};
  if (typeof context === 'string') return { text: context };
  if (Array.isArray(context)) return { items: context };
  if (typeof context === 'object') return context;
  return { value: String(context) };
}

function safeTarget(value) {
  return String(value || '').trim().replace(/[^a-zA-Z0-9:_./-]+/g, '-').slice(0, 300);
}

function cleanRefs(values, maximum = 500) {
  const source = Array.isArray(values) ? values : [];
  const seen = new Set();
  const output = [];
  for (const value of source) {
    const text = String(value || '').trim().slice(0, 300);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    output.push(text);
    if (output.length >= maximum) break;
  }
  return output;
}

function auditorOutputContract(mission, evidenceReferenceIds) {
  if (mission.specialist !== 'auditor') return '';
  const target = safeTarget(mission?.evidence?.publication_target_id);
  return [
    '',
    'AUDITOR OUTPUT CONTRACT — RETURN JSON ONLY:',
    JSON.stringify({
      publication_target_id: target || null,
      publication_gate_passed: false,
      provenance_checked: false,
      contrary_evidence_considered: false,
      evidence_ids: evidenceReferenceIds,
      uncertainties: [],
      reason: 'Explain why the target is or is not safe to hand to Publisher for drafting.'
    }),
    'Rules: publication_gate_passed may be true only when provenance_checked and contrary_evidence_considered are true and evidence_ids contains only supplied evidence reference IDs. This gate permits a Publisher DRAFT only; it is not public-release approval.'
  ].join('\n');
}

export function parseAuditorDecision({ text, mission, allowedEvidenceIds = [] } = {}) {
  if (mission?.specialist !== 'auditor') return { valid: false, publication_gate_passed: false, reason: 'not-an-auditor-mission' };
  const raw = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first < 0 || last <= first) return { valid: false, publication_gate_passed: false, reason: 'auditor-output-not-json' };
  let parsed;
  try { parsed = JSON.parse(raw.slice(first, last + 1)); } catch { return { valid: false, publication_gate_passed: false, reason: 'auditor-output-invalid-json' }; }
  const expectedTarget = safeTarget(mission?.evidence?.publication_target_id);
  const target = safeTarget(parsed?.publication_target_id);
  const allowed = new Set(cleanRefs(allowedEvidenceIds));
  const evidenceIds = cleanRefs(parsed?.evidence_ids).filter(id => allowed.has(id));
  const requestedIds = cleanRefs(parsed?.evidence_ids);
  const evidenceSubsetValid = requestedIds.length > 0 && requestedIds.length === evidenceIds.length;
  const provenanceChecked = parsed?.provenance_checked === true;
  const contraryEvidenceConsidered = parsed?.contrary_evidence_considered === true;
  const targetValid = Boolean(expectedTarget && target === expectedTarget);
  const contractValid = targetValid && evidenceSubsetValid && provenanceChecked && contraryEvidenceConsidered;
  return {
    valid: contractValid,
    publication_target_id: target || null,
    publication_gate_passed: contractValid && parsed?.publication_gate_passed === true,
    provenance_checked: provenanceChecked,
    contrary_evidence_considered: contraryEvidenceConsidered,
    evidence_ids: evidenceIds,
    uncertainties: Array.isArray(parsed?.uncertainties) ? parsed.uncertainties.slice(0, 50).map(value => String(value).slice(0, 1000)) : [],
    reason: String(parsed?.reason || '').slice(0, 4000),
    draft_only_gate: true
  };
}

export function compileSpecialistPrompt({ mission, context = {}, evidenceReferenceIds = [], artifactReferenceIds = [] } = {}) {
  ensureMission(mission);
  const localContext = safeContext(context);
  const evidenceRefs = cleanRefs(evidenceReferenceIds);
  return [
    'MATRIX REPROGRAMMED — LOCAL SPECIALIST EXECUTION',
    `Mission ID: ${mission.mission_id}`,
    `Specialist: ${mission.specialist}`,
    `Objective: ${String(mission.objective || '').slice(0, 20000)}`,
    '',
    'Operating instruction:',
    SPECIALIST_INSTRUCTIONS[mission.specialist],
    '',
    'Hard boundaries:',
    '- This is plan/draft analysis only. Do not perform external actions.',
    '- Do not spend money, accept contracts or provider terms, create accounts, change payment details or deploy production.',
    '- Preserve provenance and distinguish fact, allegation, inference and speculation where claims are involved.',
    '- Treat contrary evidence as first-class evidence.',
    '- Do not claim a source says something unless the supplied local context supports it.',
    '',
    `Evidence reference IDs: ${JSON.stringify(evidenceRefs)}`,
    `Artifact reference IDs: ${JSON.stringify(cleanRefs(artifactReferenceIds))}`,
    '',
    'Local context (never intentionally sent to a non-loopback inference endpoint):',
    JSON.stringify(localContext),
    '',
    mission.specialist === 'auditor'
      ? auditorOutputContract(mission, evidenceRefs)
      : 'Return a concise specialist result with: findings/output, evidence references used, uncertainties, blocked actions if any, and recommended next handoff.'
  ].join('\n');
}

export class SpecialistLocalExecutor {
  constructor({ fetchImpl = globalThis.fetch, clock = () => new Date() } = {}) {
    this.fetchImpl = fetchImpl;
    this.clock = clock;
  }

  route({ mission, executionSpec, resources = [], context = {} } = {}) {
    ensureMission(mission);
    ensureExecutionSpec(mission, executionSpec);
    const contract = executionSpec.local_execution_contract || {};
    const routeRequest = executionSpec.model_route_request || {};
    const localPromptTokenEstimate = estimateTokens(context);
    const job = {
      job_type: 'llm.generate',
      data_class: 'internal',
      payload: {
        task_profile: routeRequest.task_profile,
        metadata_only_routing: true,
        prompt_tokens_estimate: Math.max(Number(routeRequest.prompt_tokens_estimate || 1), localPromptTokenEstimate),
        max_tokens: contract.maximum_output_tokens
      },
      requirements: {
        cost_ceiling_eur: 0,
        external_network_allowed: false,
        allow_cpu_fallback: true,
        requires_provenance: true
      }
    };
    const routing = routeLocalModel(resources, job, { now: this.clock() });
    return { job, routing };
  }

  async execute({ mission, executionSpec, resources = [], context = {} } = {}) {
    ensureMission(mission);
    ensureExecutionSpec(mission, executionSpec);
    const { job: routingJob, routing } = this.route({ mission, executionSpec, resources, context });
    if (!routing.selected?.resource) {
      return {
        ok: false,
        status: 'blocked',
        mission_id: mission.mission_id,
        specialist: mission.specialist,
        reason: 'no-eligible-owner-local-model',
        excluded: routing.excluded,
        external_network_used: false,
        cost_confirmed_zero: true
      };
    }

    const resource = routing.selected.resource;
    const contract = executionSpec.local_execution_contract;
    const prompt = compileSpecialistPrompt({
      mission,
      context,
      evidenceReferenceIds: contract.evidence_reference_ids,
      artifactReferenceIds: contract.artifact_reference_ids
    });
    const adapter = new OpenAiCompatibleLocalAdapter({ fetchImpl: this.fetchImpl, clock: this.clock });
    const inferenceJob = {
      job_type: 'llm.generate',
      data_class: 'internal',
      priority: mission.priority || 'P2',
      payload: {
        model_id: resource.metadata?.model_id,
        prompt,
        max_tokens: contract.maximum_output_tokens,
        temperature: mission.specialist === 'publisher' ? 0.25 : 0.1,
        task_profile: executionSpec.model_route_request?.task_profile
      },
      requirements: {
        cost_ceiling_eur: 0,
        external_network_allowed: false,
        maximum_latency_ms: 180000,
        requires_provenance: true
      }
    };
    const response = await adapter.execute(inferenceJob, resource);
    return {
      ok: response.ok === true,
      status: response.ok === true ? 'completed' : 'failed',
      mission_id: mission.mission_id,
      specialist: mission.specialist,
      model_resource_id: resource.resource_id,
      model_route_score: routing.selected.route_score,
      model_id: response.output?.model,
      output: response.output,
      provenance: response.provenance,
      execution_controls: {
        routing_prompt_material_included: 'prompt' in routingJob.payload || 'messages' in routingJob.payload,
        prompt_compiled_locally: true,
        inference_endpoint_scope: response.provenance?.endpoint_scope,
        external_network_used: response.provenance?.external_network_used,
        cost_confirmed_zero: true,
        external_consequence_performed: false,
        production_deployment_performed: false,
        money_moved: false
      }
    };
  }
}

export { SPECIALIST_INSTRUCTIONS };
export default SpecialistLocalExecutor;
