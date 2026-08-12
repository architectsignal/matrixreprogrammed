function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function money(value) {
  return Math.round(Math.max(0, finite(value, 0)) * 100) / 100;
}

function verifiedRevenue(sources = []) {
  return (Array.isArray(sources) ? sources : []).reduce((total, source) => {
    if (source?.verified !== true) return total;
    return total + money(source?.net_revenue_eur);
  }, 0);
}

function normalizedAllocations(policy = {}) {
  const configured = policy?.allocation_weights || {};
  const positive = Object.entries(configured)
    .map(([key, value]) => [key, Math.max(0, finite(value, 0))])
    .filter(([, value]) => value > 0);
  const total = positive.reduce((sum, [, value]) => sum + value, 0);
  if (total <= 0) return [];
  return positive.map(([key, value]) => [key, value / total]);
}

export class SelfFinancingDirector {
  constructor({ clock = () => new Date() } = {}) {
    this.clock = clock;
  }

  plan({ snapshot = {}, policy = {} } = {}) {
    const observedRevenue = money(verifiedRevenue(snapshot.revenue_sources));
    const operatingCost = money(snapshot.verified_operating_cost_eur);
    const currentReserve = money(snapshot.verified_cash_reserve_eur);
    const baselineMonthlyCost = money(policy.baseline_monthly_operating_cost_eur);
    const reserveMonths = Math.max(0, finite(policy.minimum_reserve_months, 3));
    const reserveTarget = money(baselineMonthlyCost * reserveMonths);
    const reserveGap = money(Math.max(0, reserveTarget - currentReserve));
    const operatingSurplus = money(Math.max(0, observedRevenue - operatingCost));
    const proposalPool = money(Math.max(0, operatingSurplus - reserveGap));

    const allocationPlan = normalizedAllocations(policy).map(([purpose, share]) => ({
      purpose,
      share: Math.round(share * 10000) / 10000,
      proposed_amount_eur: money(proposalPool * share),
      execution_allowed: false,
      owner_approval_required: true
    }));

    const selfFinancingRatio = operatingCost > 0
      ? Math.round((observedRevenue / operatingCost) * 1000) / 1000
      : observedRevenue > 0 ? null : 0;

    return {
      schema_version: 1,
      generated_at: this.clock().toISOString(),
      observed: {
        verified_net_revenue_eur: observedRevenue,
        verified_operating_cost_eur: operatingCost,
        verified_cash_reserve_eur: currentReserve,
        reserve_target_eur: reserveTarget,
        reserve_gap_eur: reserveGap,
        operating_surplus_eur: operatingSurplus,
        proposal_pool_eur: proposalPool,
        self_financing_ratio: selfFinancingRatio
      },
      allocation_plan: allocationPlan,
      execution: {
        automatic_spend_limit_eur: 0,
        executable_budget_eur: 0,
        payment_mutation_allowed: false,
        payout_mutation_allowed: false,
        contract_commitment_allowed: false,
        borrowing_allowed: false,
        investment_trading_allowed: false,
        owner_approval_required_for_any_spend: true,
        human_action_reason: 'payment_approval'
      },
      revenue_rules: {
        count_unverified_revenue: false,
        allowed_categories: Array.isArray(policy.allowed_revenue_categories) ? policy.allowed_revenue_categories : [],
        evidence_required: true,
        commercial_ranking_may_change_evidence_strength: false
      },
      state: observedRevenue >= operatingCost && reserveGap === 0 ? 'self-sustaining-observed' : 'building-sustainability',
      boundary: 'The finance director may measure verified revenue, model sustainability and propose reinvestment envelopes. It cannot move money, spend, borrow, trade, create contracts, change payment providers or commit the owner without explicit approval.'
    };
  }
}

export const selfFinancingInternals = { finite, money, verifiedRevenue, normalizedAllocations };
