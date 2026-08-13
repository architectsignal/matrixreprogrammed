import { MATRIX_LAW, MATRIX_LAW_SHA256 } from '../../matrix-core/matrix-constitution.mjs';

export const BOUNTY_STATES = Object.freeze([
  'DISCOVERED','RULES_CHECK','FEASIBLE','REJECTED','SELECTED','CLAIMED','WORKING','TESTING',
  'READY_TO_SUBMIT','READY_FOR_OWNER_SUBMISSION','SUBMITTED','CHANGES_REQUESTED','ACCEPTED',
  'PAYMENT_PENDING','PAID','RECONCILED','FAILED','EXPIRED'
]);

export const BOUNTY_TRANSITIONS = Object.freeze({
  DISCOVERED: ['RULES_CHECK','REJECTED','EXPIRED'], RULES_CHECK: ['FEASIBLE','REJECTED','EXPIRED'],
  FEASIBLE: ['SELECTED','REJECTED','EXPIRED'], SELECTED: ['CLAIMED','WORKING','REJECTED','EXPIRED'],
  CLAIMED: ['WORKING','REJECTED','EXPIRED'], WORKING: ['TESTING','FAILED','REJECTED','EXPIRED'],
  TESTING: ['READY_TO_SUBMIT','FAILED','WORKING'], READY_TO_SUBMIT: ['READY_FOR_OWNER_SUBMISSION','SUBMITTED','FAILED'],
  READY_FOR_OWNER_SUBMISSION: ['SUBMITTED','EXPIRED'], SUBMITTED: ['CHANGES_REQUESTED','ACCEPTED','FAILED','EXPIRED'],
  CHANGES_REQUESTED: ['WORKING','FAILED','EXPIRED'], ACCEPTED: ['PAYMENT_PENDING','PAID'],
  PAYMENT_PENDING: ['PAID','FAILED'], PAID: ['RECONCILED'], RECONCILED: [], REJECTED: [], FAILED: [], EXPIRED: []
});

const EASY_TASK_PATTERNS = Object.freeze([
  ['documentation', /\b(doc|docs|documentation|readme|guide|example|typo)\b/i, 15],
  ['tests', /\b(test|coverage|fixture|regression)\b/i, 18],
  ['type-fix', /\b(type|typing|typescript|mypy)\b/i, 14],
  ['small-bug', /\b(bug|fix|edge case|error handling)\b/i, 12],
  ['dependency', /\b(dependency|dependencies|upgrade|update package)\b/i, 8],
  ['small-feature', /\b(feature|add support|integration)\b/i, 3]
]);

function clean(value, maximum = 1000) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maximum);
}
function list(value, maximum = 100) { return [...new Set((Array.isArray(value) ? value : []).map(item => clean(item, 200)).filter(Boolean))].slice(0, maximum); }
function finite(value, fallback = 0) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
function integer(value, fallback = 0) { const number = Number(value); return Number.isSafeInteger(number) ? number : fallback; }
function clamp(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, finite(value))); }
function slug(value, maximum = 150) { return clean(value, maximum).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, maximum); }

export function canTransitionBounty(from, to) {
  return BOUNTY_STATES.includes(from) && BOUNTY_STATES.includes(to) && (BOUNTY_TRANSITIONS[from] || []).includes(to);
}

export function normalizeBounty(input = {}, now = new Date().toISOString()) {
  const rewardMinor = Math.max(0, Math.trunc(finite(input.rewardMinor ?? input.reward_amount_minor)));
  const currency = clean(input.rewardCurrency || input.reward_currency || 'UNKNOWN', 12).toUpperCase();
  const title = clean(input.title, 500);
  const description = clean(input.description, 20_000);
  const taskText = `${title} ${description}`;
  const taskType = EASY_TASK_PATTERNS.find(([, pattern]) => pattern.test(taskText))?.[0] || 'unknown';
  const labels = list(input.labels, 100).map(label => label.toLowerCase());
  const securityClass = input.securityBounty === true || labels.some(label => /security|vulnerability|cve|exploit/.test(label));
  return {
    bounty_id: clean(input.bountyId || input.bounty_id, 180) || `bounty-${slug(input.sourcePlatform || 'unknown', 40)}-${slug(input.externalId || input.external_id || title, 110)}`,
    source_platform: clean(input.sourcePlatform || input.source_platform, 80),
    external_id: clean(input.externalId || input.external_id, 200),
    title, description,
    repository: clean(input.repository, 500),
    issue_url: clean(input.issueUrl || input.issue_url, 1500),
    bounty_url: clean(input.bountyUrl || input.bounty_url || input.issueUrl || input.issue_url, 1500),
    reward_amount_minor: rewardMinor,
    reward_currency: currency,
    reward_eur_estimate_minor: Math.max(0, Math.trunc(finite(input.rewardEurEstimateMinor ?? input.reward_eur_estimate_minor))),
    deadline: clean(input.deadline, 80) || null,
    program_rules_url: clean(input.programRulesUrl || input.program_rules_url, 1500) || null,
    program_rules_sha256: clean(input.programRulesSha256 || input.program_rules_sha256, 64) || null,
    ai_usage_allowed: input.aiUsageAllowed === true ? 'allowed' : input.aiUsageAllowed === false ? 'prohibited' : clean(input.aiUsageAllowed || input.ai_usage_allowed || 'unknown', 20).toLowerCase(),
    automation_allowed: input.automationAllowed === true ? 'allowed' : input.automationAllowed === false ? 'prohibited' : clean(input.automationAllowed || input.automation_allowed || 'unknown', 20).toLowerCase(),
    claim_required: input.claimRequired === true,
    claim_status: clean(input.claimStatus || input.claim_status || 'not-claimed', 50),
    claim_cost_minor: Math.max(0, Math.trunc(finite(input.claimCostMinor ?? input.claim_cost_minor))),
    task_type: taskType,
    skills_required: list(input.skillsRequired || input.skills_required, 50),
    languages: list(input.languages, 30),
    estimated_complexity: clamp(input.estimatedComplexity ?? input.estimated_complexity, 0, 100),
    estimated_compute_minutes: Math.max(0, Math.trunc(finite(input.estimatedComputeMinutes ?? input.estimated_compute_minutes))),
    estimated_time_minutes: Math.max(0, Math.trunc(finite(input.estimatedTimeMinutes ?? input.estimated_time_minutes))),
    competition_count: Math.max(0, Math.trunc(finite(input.competitionCount ?? input.competition_count))),
    acceptance_probability_ppm: Math.max(0, Math.min(1_000_000, Math.trunc(finite(input.acceptanceProbabilityPpm ?? input.acceptance_probability_ppm)))),
    payment_probability_ppm: Math.max(0, Math.min(1_000_000, Math.trunc(finite(input.paymentProbabilityPpm ?? input.payment_probability_ppm)))),
    security_bounty: securityClass,
    source_evidence: input.sourceEvidence || input.source_evidence || {},
    status: BOUNTY_STATES.includes(input.status) ? input.status : 'DISCOVERED',
    discovered_at: clean(input.discoveredAt || input.discovered_at || now, 80),
    updated_at: now
  };
}

export class BountyProfitEngine {
  evaluate(bounty = {}, policy = {}) {
    const reward = Math.max(0, integer(bounty.reward_eur_estimate_minor));
    const completion = clamp(policy.completionProbabilityPpm ?? 0, 0, 1_000_000);
    const acceptance = clamp(bounty.acceptance_probability_ppm ?? 0, 0, 1_000_000);
    const payment = clamp(bounty.payment_probability_ppm ?? 0, 0, 1_000_000);
    const grossExpected = Math.trunc(reward * completion / 1_000_000 * acceptance / 1_000_000 * payment / 1_000_000);
    const computeCost = Math.max(0, integer(policy.computeCostMinor));
    const humanCost = Math.max(0, integer(policy.expectedHumanCostMinor));
    const competitionPenalty = Math.max(0, integer(policy.competitionPenaltyMinor ?? bounty.competition_count * 10));
    const delayPenalty = Math.max(0, integer(policy.delayPenaltyMinor));
    const expectedNet = grossExpected - computeCost - humanCost - competitionPenalty - delayPenalty;
    return {
      gross_expected_eur_minor: grossExpected,
      compute_cost_eur_minor: computeCost,
      expected_human_cost_eur_minor: humanCost,
      competition_penalty_eur_minor: competitionPenalty,
      delay_penalty_eur_minor: delayPenalty,
      expected_net_eur_minor: expectedNet,
      positive_expected_value: expectedNet > 0,
      zero_spend: computeCost === 0 && integer(bounty.claim_cost_minor) === 0
    };
  }
}

export class BountyFeasibilityEvaluator {
  evaluate(bounty = {}, capability = {}) {
    const checks = {
      public_repository: /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/|$)/.test(bounty.issue_url || bounty.repository || ''),
      reward_verified: integer(bounty.reward_eur_estimate_minor) > 0 && bounty.reward_currency !== 'UNKNOWN',
      rules_current: Boolean(bounty.program_rules_url && /^[a-f0-9]{64}$/i.test(bounty.program_rules_sha256 || '')),
      ai_allowed: bounty.ai_usage_allowed === 'allowed',
      automation_allowed: bounty.automation_allowed === 'allowed',
      security_execution_safe: bounty.security_bounty !== true,
      zero_spend: integer(bounty.claim_cost_minor) === 0,
      tests_available: capability.testsAvailable === true,
      build_understood: capability.buildUnderstood === true,
      language_available: capability.languageAvailable === true,
      requirements_clear: capability.requirementsClear === true,
      reward_open: capability.rewardOpen === true,
      competition_acceptable: integer(bounty.competition_count) <= integer(capability.maximumCompetition, 10),
      payout_destination_ready: capability.payoutDestinationReady === true,
      identity_and_terms_ready: capability.identityAndTermsReady === true
    };
    const blockers = Object.entries(checks).filter(([, passed]) => !passed).map(([key]) => `${key.replace(/_/g, '-')}-required`);
    const technicalKeys = ['tests_available','build_understood','language_available','requirements_clear','reward_open','competition_acceptable'];
    const technicalPasses = technicalKeys.filter(key => checks[key]).length;
    const completionProbabilityPpm = Math.round(1_000_000 * technicalPasses / technicalKeys.length);
    return {
      feasible: blockers.length === 0,
      checks,
      blockers,
      completion_probability_ppm: completionProbabilityPpm,
      security_auto_execution: false,
      consequential_actions_executed: 0,
      law: MATRIX_LAW
    };
  }
}

export function submissionConfidence(input = {}) {
  const scores = {
    tests: input.testsPassing === true ? 100 : 0,
    requirements: clamp(input.requirementCoveragePercent, 0, 100),
    static_analysis: input.staticAnalysisPassing === true ? 100 : 0,
    conventions: clamp(input.repositoryConventionScore, 0, 100),
    review: Math.max(0, 100 - clamp(input.reviewFindingSeverity, 0, 100)),
    uncertainty: Math.max(0, 100 - clamp(input.uncertaintyPercent, 0, 100)),
    diff: integer(input.changedFiles) <= 20 && integer(input.changedLines) <= 800 ? 100 : 40
  };
  const confidence = Math.round(Object.values(scores).reduce((sum, value) => sum + value, 0) / Object.keys(scores).length);
  return { confidence_percent: confidence, ready_to_submit: confidence >= 85 && scores.tests === 100 && scores.static_analysis === 100, scores, separate_review_pass_required: true };
}

export function shouldStopBounty(input = {}) {
  const reasons = [];
  if (finite(input.actualMinutes) > finite(input.maximumMinutes)) reasons.push('effort-ceiling-exceeded');
  if (integer(input.consecutiveBuildFailures) >= 3) reasons.push('repeated-build-failures');
  if (finite(input.requirementsUncertaintyPercent) > 40) reasons.push('requirements-uncertainty-too-high');
  if (integer(input.competitionCount) > integer(input.maximumCompetition, 10)) reasons.push('competition-threshold-exceeded');
  if (finite(input.revisedExpectedNetMinor) <= 0) reasons.push('non-positive-revised-expected-value');
  return { stop: reasons.length > 0, reasons, sunk_cost_ignored: true };
}

export class BountyCompletionDirector {
  plan(bounties = [], capabilities = {}, policy = {}) {
    const evaluator = new BountyFeasibilityEvaluator();
    const profit = new BountyProfitEngine();
    const evaluated = (Array.isArray(bounties) ? bounties : []).map(bounty => {
      const capability = typeof capabilities === 'function' ? capabilities(bounty) : capabilities;
      const feasibility = evaluator.evaluate(bounty, capability);
      const economics = profit.evaluate(bounty, {
        completionProbabilityPpm: feasibility.completion_probability_ppm,
        computeCostMinor: 0,
        expectedHumanCostMinor: policy.expectedHumanCostMinor || 0,
        competitionPenaltyMinor: Math.max(0, integer(bounty.competition_count) * integer(policy.competitionPenaltyPerCompetitorMinor, 10)),
        delayPenaltyMinor: policy.delayPenaltyMinor || 0
      });
      const easyBonus = EASY_TASK_PATTERNS.find(([type]) => type === bounty.task_type)?.[2] || 0;
      const priority = economics.expected_net_eur_minor + easyBonus * 100 - bounty.estimated_time_minutes;
      return { bounty, feasibility, economics, priority_score: priority, selectable: feasibility.feasible && economics.positive_expected_value };
    }).sort((a, b) => Number(b.selectable) - Number(a.selectable) || b.priority_score - a.priority_score || a.bounty.bounty_id.localeCompare(b.bounty.bounty_id));
    const maximumActive = Math.max(1, Math.min(3, integer(policy.maximumActive, 3)));
    return {
      evaluated,
      selected: evaluated.filter(item => item.selectable).slice(0, maximumActive),
      maximum_active: maximumActive,
      security_auto_execution: false,
      automatic_claim_or_submission: false,
      law: MATRIX_LAW,
      law_sha256: MATRIX_LAW_SHA256
    };
  }
}

export function bountyRepositoryProfile(records = []) {
  const accepted = records.filter(item => item.accepted === true).length;
  const paid = records.filter(item => item.reconciled === true).length;
  const attempts = records.length;
  const net = records.reduce((total, item) => total + Math.max(0, integer(item.netEurMinor)), 0);
  return { attempts, accepted, paid, acceptance_rate: attempts ? accepted / attempts : 0, payout_reliability: accepted ? paid / accepted : 0, net_eur_minor: net, evidence_basis: 'accepted-and-reconciled-records-only' };
}

export const bountyEngineInternals = { clean, list, finite, integer, clamp, slug, EASY_TASK_PATTERNS };
