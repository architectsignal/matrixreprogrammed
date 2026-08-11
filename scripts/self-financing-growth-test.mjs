import assert from 'node:assert/strict';
import { RevenueGrowthDirector } from '../ai-management/finance/revenue-growth-director.mjs';

const director = new RevenueGrowthDirector({
  clock: () => new Date('2026-08-12T12:00:00.000Z'),
  maximumExperiments: 3
});

const plan = director.plan({
  channels: [
    {
      channel_id: 'membership-core',
      label: 'Core membership',
      category: 'membership',
      visits: 1000,
      leads: 20,
      checkout_starts: 6,
      verified_purchases: 2,
      verified_renewals: 1,
      verified_gross_revenue_eur: 90,
      verified_refunds_eur: 0,
      verified_chargebacks_eur: 0,
      verified_operating_cost_eur: 0,
      evidence_quality: 1,
      zero_spend_experiment_available: true
    },
    {
      channel_id: 'report-store',
      label: 'Reports',
      category: 'books_and_reports',
      visits: 100,
      leads: 10,
      checkout_starts: 20,
      verified_purchases: 6,
      verified_renewals: 0,
      verified_gross_revenue_eur: 180,
      verified_refunds_eur: 20,
      verified_chargebacks_eur: 0,
      verified_operating_cost_eur: 0,
      evidence_quality: 1,
      zero_spend_experiment_available: true
    },
    {
      channel_id: 'unknown-category',
      category: 'crypto-trading',
      visits: 100000,
      verified_gross_revenue_eur: 999999,
      evidence_quality: 1,
      zero_spend_experiment_available: true
    }
  ],
  policy: {
    allowed_revenue_categories: ['membership','books_and_reports']
  }
});

assert.equal(plan.schema_version, 1);
assert.equal(plan.summary.channels_evaluated, 2);
assert.equal(plan.summary.verified_gross_revenue_eur, 270);
assert.equal(plan.summary.verified_refunds_and_chargebacks_eur, 20);
assert.equal(plan.summary.verified_net_revenue_eur, 250);
assert.equal(plan.ranked_channels[0].channel_id, 'report-store');
assert.ok(plan.experiments.length > 0);
assert.ok(plan.experiments.every(item => item.zero_spend_required === true));
assert.ok(plan.experiments.every(item => item.rollback_required === true));
assert.ok(plan.experiments.every(item => !item.forbidden_changes.includes('')));
assert.ok(plan.blocked_experiment_types.some(item => item.experiment_type === 'pricing' && item.owner_approval_required === true));
assert.ok(plan.blocked_experiment_types.some(item => item.experiment_type === 'payment_flow' && item.automatic_execution_allowed === false));
assert.equal(plan.controls.automatic_price_changes_allowed, false);
assert.equal(plan.controls.automatic_payment_flow_changes_allowed, false);
assert.equal(plan.controls.commercial_ranking_may_change_evidence_strength, false);
assert.equal(plan.controls.commercial_ranking_may_hide_contrary_evidence, false);
assert.equal(plan.controls.dark_patterns_allowed, false);

console.log('Self-financing growth tests passed: verified revenue can drive bounded growth learning without price, payment, contract or evidence-policy mutation.');
