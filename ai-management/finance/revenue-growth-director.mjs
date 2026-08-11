const SAFE_AUTOMATIC_EXPERIMENTS = new Set(['cta_copy','landing_page_order','report_preview','membership_positioning','newsletter_positioning']);
const CONSEQUENTIAL_EXPERIMENTS = new Set(['pricing','payment_flow','sponsorship_terms']);
const ALLOWED_CATEGORIES = new Set(['membership','donation','books_and_reports','sponsorship','approved_affiliate','approved_services']);

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function money(value) {
  return Math.round(finite(value, 0) * 100) / 100;
}

function ratio(numerator, denominator) {
  const d = finite(denominator, 0);
  if (d <= 0) return 0;
  return Math.max(0, finite(numerator, 0) / d);
}

function normalizeChannel(input = {}) {
  const category = String(input.category || '').trim();
  return {
    channel_id: String(input.channel_id || '').trim(),
    label: String(input.label || input.channel_id || '').trim(),
    category,
    enabled: input.enabled !== false,
    visits: Math.max(0, finite(input.visits, 0)),
    leads: Math.max(0, finite(input.leads, 0)),
    checkout_starts: Math.max(0, finite(input.checkout_starts, 0)),
    verified_purchases: Math.max(0, finite(input.verified_purchases, 0)),
    verified_renewals: Math.max(0, finite(input.verified_renewals, 0)),
    verified_gross_revenue_eur: Math.max(0, money(input.verified_gross_revenue_eur)),
    verified_refunds_eur: Math.max(0, money(input.verified_refunds_eur)),
    verified_chargebacks_eur: Math.max(0, money(input.verified_chargebacks_eur)),
    verified_operating_cost_eur: Math.max(0, money(input.verified_operating_cost_eur)),
    evidence_quality: Math.max(0, Math.min(1, finite(input.evidence_quality, 0))),
    zero_spend_experiment_available: input.zero_spend_experiment_available === true
  };
}

function scoreChannel(channel) {
  const netRevenue = money(channel.verified_gross_revenue_eur - channel.verified_refunds_eur - channel.verified_chargebacks_eur - channel.verified_operating_cost_eur);
  const conversionRate = ratio(channel.verified_purchases + channel.verified_renewals, channel.visits);
  const leadRate = ratio(channel.leads, channel.visits);
  const checkoutRate = ratio(channel.checkout_starts, channel.visits);
  const revenuePerVisit = channel.visits > 0 ? netRevenue / channel.visits : 0;
  const score = Math.max(0, Math.min(100,
    conversionRate * 3000 +
    leadRate * 800 +
    checkoutRate * 500 +
    Math.min(20, Math.max(0, revenuePerVisit * 4)) +
    channel.evidence_quality * 15
  ));
  return {
    ...channel,
    verified_net_revenue_eur: netRevenue,
    conversion_rate: Number(conversionRate.toFixed(6)),
    lead_rate: Number(leadRate.toFixed(6)),
    checkout_rate: Number(checkoutRate.toFixed(6)),
    revenue_per_visit_eur: money(revenuePerVisit),
    growth_score: Number(score.toFixed(3))
  };
}

function experimentFor(channel, sequence) {
  if (!channel.enabled || !channel.zero_spend_experiment_available) return null;
  const type = channel.lead_rate < 0.03 ? 'cta_copy'
    : channel.checkout_rate < 0.1 ? 'report_preview'
      : channel.conversion_rate < 0.03 ? 'membership_positioning'
        : 'landing_page_order';
  return {
    experiment_id: `growth-${channel.channel_id}-${type}-${sequence}`,
    channel_id: channel.channel_id,
    category: channel.category,
    experiment_type: type,
    hypothesis: type === 'cta_copy'
      ? 'A clearer evidence-led call to action will increase qualified leads without changing claims or using urgency.'
      : type === 'report_preview'
        ? 'Showing a stronger factual preview of the paid product will increase checkout intent without withholding evidence needed to assess public claims.'
        : type === 'membership_positioning'
          ? 'Explaining member utility earlier will improve conversion without changing price, payment terms or evidence access.'
          : 'Reordering existing revenue modules by demonstrated usefulness will improve conversion without altering factual content.',
    primary_metric: type === 'cta_copy' ? 'lead_rate' : type === 'report_preview' ? 'checkout_rate' : 'conversion_rate',
    maximum_duration_hours: 168,
    automatic_execution_allowed: SAFE_AUTOMATIC_EXPERIMENTS.has(type),
    owner_approval_required: !SAFE_AUTOMATIC_EXPERIMENTS.has(type),
    zero_spend_required: true,
    rollback_required: true,
    forbidden_changes: ['claim-strength','evidence-rating','source-ordering-for-commercial-reasons','fake-scarcity','false-urgency','price','payment-credentials','checkout-terms']
  };
}

export class RevenueGrowthDirector {
  constructor({ clock = () => new Date(), maximumExperiments = 3 } = {}) {
    this.clock = clock;
    this.maximumExperiments = Math.max(1, Math.min(10, Math.floor(finite(maximumExperiments, 3))));
  }

  plan({ channels = [], policy = {} } = {}) {
    const allowedCategories = new Set(Array.isArray(policy.allowed_revenue_categories) && policy.allowed_revenue_categories.length
      ? policy.allowed_revenue_categories
      : [...ALLOWED_CATEGORIES]);
    const normalized = (Array.isArray(channels) ? channels : [])
      .map(normalizeChannel)
      .filter(channel => channel.channel_id && ALLOWED_CATEGORIES.has(channel.category) && allowedCategories.has(channel.category))
      .map(scoreChannel)
      .sort((a, b) => b.growth_score - a.growth_score || b.verified_net_revenue_eur - a.verified_net_revenue_eur || a.channel_id.localeCompare(b.channel_id));

    const totalGross = money(normalized.reduce((sum, channel) => sum + channel.verified_gross_revenue_eur, 0));
    const totalRefunds = money(normalized.reduce((sum, channel) => sum + channel.verified_refunds_eur + channel.verified_chargebacks_eur, 0));
    const totalCosts = money(normalized.reduce((sum, channel) => sum + channel.verified_operating_cost_eur, 0));
    const totalNet = money(totalGross - totalRefunds - totalCosts);

    const experiments = normalized
      .map((channel, index) => experimentFor(channel, index + 1))
      .filter(Boolean)
      .slice(0, this.maximumExperiments);

    const blockedExperimentTypes = [...CONSEQUENTIAL_EXPERIMENTS].map(type => ({
      experiment_type: type,
      automatic_execution_allowed: false,
      owner_approval_required: true
    }));

    return {
      schema_version: 1,
      generated_at: this.clock().toISOString(),
      summary: {
        channels_evaluated: normalized.length,
        verified_gross_revenue_eur: totalGross,
        verified_refunds_and_chargebacks_eur: totalRefunds,
        verified_operating_cost_eur: totalCosts,
        verified_net_revenue_eur: totalNet,
        experiments_proposed: experiments.length
      },
      ranked_channels: normalized,
      experiments,
      blocked_experiment_types: blockedExperimentTypes,
      controls: {
        zero_spend_only: true,
        automatic_price_changes_allowed: false,
        automatic_payment_flow_changes_allowed: false,
        automatic_contract_changes_allowed: false,
        commercial_ranking_may_change_evidence_strength: false,
        commercial_ranking_may_hide_contrary_evidence: false,
        dark_patterns_allowed: false,
        fake_scarcity_allowed: false,
        false_urgency_allowed: false,
        rollback_required_for_automatic_experiments: true
      },
      boundary: 'Revenue learning may optimize reversible zero-cost presentation experiments around lawful offers. It may never alter evidence strength, suppress contrary evidence, create deceptive urgency, change prices or payment terms, move money, enter contracts or spend funds without owner approval.'
    };
  }
}

export const revenueGrowthInternals = { SAFE_AUTOMATIC_EXPERIMENTS, CONSEQUENTIAL_EXPERIMENTS, ALLOWED_CATEGORIES, finite, money, ratio, normalizeChannel, scoreChannel, experimentFor };
