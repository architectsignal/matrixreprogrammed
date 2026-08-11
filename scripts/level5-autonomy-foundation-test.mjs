import assert from 'node:assert/strict';
import { AutonomousLearningDirector, deriveAutonomySignals } from '../ai-management/autonomy/autonomous-learning-director.mjs';
import { SelfFinancingDirector } from '../ai-management/finance/self-financing-director.mjs';

const summary = {
  ok: true,
  cost_confirmed_zero: true,
  resource_scout: { approved_new: 2, total_discovered: 20 },
  compute_resource_scout: { automatic_approved: 1, providers_checked: 4 },
  capability_director: { jobs_completed: 1, jobs_attempted: 1, eligible_remote_resources: 1 },
  site_director: { safe_changes_applied: 4, total_issues: 40, prohibited_changes_attempted: 0 }
};

const signals = deriveAutonomySignals(summary);
assert.equal(signals.zero_spend_confirmed, true);
assert.equal(signals.resource_discovery_yield, 0.1);
assert.equal(signals.compute_approval_yield, 0.25);
assert.equal(signals.remote_completion_rate, 1);
assert.equal(signals.site_safe_fix_rate, 0.1);

const learner = new AutonomousLearningDirector({ alpha: 0.5, maximumLessons: 10, clock: () => new Date('2026-08-12T00:00:00.000Z') });
const first = learner.learn({ cycleSummary: summary });
assert.equal(first.cycle_count, 1);
assert.equal(first.controls.automatic_policy_mutation_allowed, false);
assert.equal(first.controls.automatic_payment_action_allowed, false);
assert.equal(first.controls.evidence_and_zero_spend_gates_may_be_weakened, false);

const unsafe = learner.learn({
  priorState: first,
  cycleSummary: {
    ...summary,
    cost_confirmed_zero: false,
    capability_director: { jobs_completed: 0, jobs_attempted: 2, eligible_remote_resources: 0 },
    site_director: { safe_changes_applied: 0, total_issues: 100, prohibited_changes_attempted: 1 }
  }
});
assert.equal(unsafe.cycle_count, 2);
assert.ok(unsafe.recommendations.some(item => item.priority === 'P0' && item.action === 'quarantine-cycle'));
assert.ok(unsafe.recommendations.every(item => item.automatic_execution_allowed === false));

const finance = new SelfFinancingDirector({ clock: () => new Date('2026-08-12T00:00:00.000Z') });
const plan = finance.plan({
  snapshot: {
    revenue_sources: [
      { category: 'membership', verified: true, net_revenue_eur: 100 },
      { category: 'donation', verified: false, net_revenue_eur: 1000 }
    ],
    verified_operating_cost_eur: 40,
    verified_cash_reserve_eur: 120
  },
  policy: {
    baseline_monthly_operating_cost_eur: 40,
    minimum_reserve_months: 3,
    allowed_revenue_categories: ['membership', 'donation'],
    allocation_weights: { operating_reserve: 0.5, infrastructure: 0.5 }
  }
});
assert.equal(plan.observed.verified_net_revenue_eur, 100);
assert.equal(plan.observed.reserve_target_eur, 120);
assert.equal(plan.observed.operating_surplus_eur, 60);
assert.equal(plan.observed.proposal_pool_eur, 60);
assert.equal(plan.execution.executable_budget_eur, 0);
assert.equal(plan.execution.automatic_spend_limit_eur, 0);
assert.equal(plan.execution.payment_mutation_allowed, false);
assert.equal(plan.execution.payout_mutation_allowed, false);
assert.equal(plan.execution.borrowing_allowed, false);
assert.equal(plan.execution.investment_trading_allowed, false);
assert.ok(plan.allocation_plan.every(item => item.owner_approval_required === true && item.execution_allowed === false));

console.log('Level 5 autonomy foundation tests passed: learning is evidence-bound and self-financing remains planning-only with zero executable spend.');
