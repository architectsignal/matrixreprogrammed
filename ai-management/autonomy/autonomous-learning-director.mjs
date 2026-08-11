function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function ratio(numerator, denominator) {
  const bottom = finite(denominator, 0);
  if (bottom <= 0) return 0;
  return Math.max(0, Math.min(1, finite(numerator, 0) / bottom));
}

function blend(previous, current, alpha) {
  if (!Number.isFinite(Number(previous))) return current;
  return Number(previous) * (1 - alpha) + current * alpha;
}

export function deriveAutonomySignals(summary = {}) {
  const resource = summary.resource_scout || {};
  const compute = summary.compute_resource_scout || {};
  const capability = summary.capability_director || {};
  const site = summary.site_director || {};

  return {
    resource_discovery_yield: ratio(resource.approved_new, resource.total_discovered),
    compute_approval_yield: ratio(compute.automatic_approved, compute.providers_checked),
    remote_completion_rate: ratio(capability.jobs_completed, capability.jobs_attempted),
    site_safe_fix_rate: ratio(site.safe_changes_applied, site.total_issues),
    eligible_remote_resources: Math.max(0, finite(capability.eligible_remote_resources, 0)),
    site_issue_count: Math.max(0, finite(site.total_issues, 0)),
    prohibited_site_changes: Math.max(0, finite(site.prohibited_changes_attempted, 0)),
    zero_spend_confirmed: summary.cost_confirmed_zero === true
  };
}

function recommendationsFor(signals = {}) {
  const recommendations = [];
  if (!signals.zero_spend_confirmed) {
    recommendations.push({
      priority: 'P0',
      domain: 'governance',
      action: 'quarantine-cycle',
      reason: 'The cycle did not positively attest zero spend.',
      automatic_execution_allowed: false
    });
  }
  if (signals.resource_discovery_yield < 0.05) {
    recommendations.push({
      priority: 'P2',
      domain: 'resource-discovery',
      action: 'improve-seed-quality',
      reason: 'Few discovered resources passed the existing hard policy gates.',
      automatic_execution_allowed: false
    });
  }
  if (signals.eligible_remote_resources === 0) {
    recommendations.push({
      priority: 'P2',
      domain: 'compute',
      action: 'continue-approved-compute-scouting',
      reason: 'No remote compute resource is currently eligible under the existing zero-spend/public-only rules.',
      automatic_execution_allowed: false
    });
  }
  if (signals.site_issue_count > 0 && signals.site_safe_fix_rate === 0) {
    recommendations.push({
      priority: 'P1',
      domain: 'site-improvement',
      action: 'increase-safe-repair-candidate-quality',
      reason: 'The site director observed issues but applied no safe changes.',
      automatic_execution_allowed: false
    });
  }
  if (signals.prohibited_site_changes > 0) {
    recommendations.push({
      priority: 'P0',
      domain: 'safety',
      action: 'review-prohibited-change-attempts',
      reason: 'The site director reported prohibited change attempts.',
      automatic_execution_allowed: false
    });
  }
  if (signals.remote_completion_rate < 0.5) {
    recommendations.push({
      priority: 'P2',
      domain: 'compute',
      action: 'deprioritize-unreliable-remote-capacity',
      reason: 'Observed remote completion performance is below the learning threshold.',
      automatic_execution_allowed: false
    });
  }
  return recommendations;
}

export class AutonomousLearningDirector {
  constructor({ alpha = 0.25, maximumLessons = 100, clock = () => new Date() } = {}) {
    this.alpha = Math.max(0.01, Math.min(1, finite(alpha, 0.25)));
    this.maximumLessons = Math.max(10, Math.min(1000, Math.floor(finite(maximumLessons, 100))));
    this.clock = clock;
  }

  learn({ priorState = {}, cycleSummary = {} } = {}) {
    const current = deriveAutonomySignals(cycleSummary);
    const priorMetrics = priorState.metrics || {};
    const metrics = {};
    for (const [key, value] of Object.entries(current)) {
      metrics[key] = typeof value === 'number' ? blend(priorMetrics[key], value, this.alpha) : value;
    }

    const generatedAt = this.clock().toISOString();
    const recommendations = recommendationsFor(current);
    const lesson = {
      observed_at: generatedAt,
      cycle_index: Math.max(0, Math.floor(finite(priorState.cycle_count, 0))) + 1,
      signals: current,
      recommendations,
      evidence_basis: 'deterministic-operational-metrics',
      policy_mutation_performed: false
    };
    const lessons = [...(Array.isArray(priorState.lessons) ? priorState.lessons : []), lesson].slice(-this.maximumLessons);

    return {
      schema_version: 1,
      generated_at: generatedAt,
      cycle_count: lesson.cycle_index,
      metrics,
      latest_signals: current,
      recommendations,
      lessons,
      controls: {
        automatic_policy_mutation_allowed: false,
        automatic_terms_acceptance_allowed: false,
        automatic_account_creation_allowed: false,
        automatic_payment_action_allowed: false,
        evidence_and_zero_spend_gates_may_be_weakened: false
      },
      boundary: 'Learning may change recommendations and future ranking inputs only after explicit integration. It may not weaken evidence, privacy, terms, quota, zero-spend, deployment, payment or human-approval gates.'
    };
  }
}

export const autonomousLearningInternals = { finite, ratio, blend, recommendationsFor };
