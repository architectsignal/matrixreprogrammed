import { MATRIX_LAW, MATRIX_LAW_SHA256 } from '../matrix-core/matrix-constitution.mjs';

export const CAPITAL_MILESTONES_EUR_MINOR = Object.freeze([
  100, 1_000, 10_000, 100_000, 1_000_000, 10_000_000, 100_000_000
]);

export const CAPITAL_PRIORITY_LANES = Object.freeze([
  'P0_IMMEDIATE_OWNED_VALUE', 'P1_BOUNTIES', 'P2_DIRECT_REVENUE',
  'P3_SPONSORSHIP', 'P4_GRANTS', 'P5_COMPLEX_CLAIMS'
]);

export const CAPITAL_NEXT_ACTIONS = Object.freeze([
  'VERIFY', 'PREPARE', 'PUBLISH', 'APPLY', 'CLAIM', 'COLLECT', 'MEASURE', 'WAIT', 'OWNER_ACTION_REQUIRED'
]);

function clean(value, maximum = 500) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maximum);
}

function list(value, maximum = 100) {
  return [...new Set((Array.isArray(value) ? value : []).map(item => clean(item, 300)).filter(Boolean))].slice(0, maximum);
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function minor(value) {
  return Math.max(0, Math.trunc(finite(value)));
}

function slug(value, maximum = 120) {
  return clean(value, maximum).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, maximum);
}

function receiptEligible(receipt = {}) {
  return receipt.reconciled === true && receipt.destinationApproved === true && receipt.externalReference &&
    clean(receipt.asset, 20).toUpperCase() === 'EUR' && minor(receipt.netAmountMinor) > 0;
}

function adjustmentEligible(adjustment = {}) {
  return adjustment.reconciled === true && clean(adjustment.asset, 20).toUpperCase() === 'EUR' &&
    clean(adjustment.externalReference, 300) && minor(adjustment.amountMinor) > 0;
}

export class MatrixDestinationRegistry {
  validate(destination = {}) {
    const reference = clean(destination.vaultReference || destination.vault_reference, 500);
    const allowedAssets = list(destination.allowedAssets || destination.allowed_assets).map(asset => asset.toUpperCase());
    const blockers = [];
    if (!clean(destination.destinationId || destination.destination_id, 160)) blockers.push('destination-id-required');
    if (!reference.startsWith('vault://')) blockers.push('vault-reference-required');
    if (destination.approved !== true || destination.active !== true) blockers.push('owner-approved-active-destination-required');
    if (!allowedAssets.length) blockers.push('allowed-assets-required');
    if (destination.rawCredentialPresent === true) blockers.push('raw-credentials-forbidden');
    return {
      approved: blockers.length === 0,
      blockers,
      destination_id: clean(destination.destinationId || destination.destination_id, 160),
      vault_reference: reference,
      allowed_assets: allowedAssets,
      credentials_exposed: false,
      law: MATRIX_LAW
    };
  }
}

export class MatrixCapitalChallenge {
  summarize(receipts = [], { baselineEurMinor = 0, adjustments = [], now = new Date().toISOString() } = {}) {
    const real = (Array.isArray(receipts) ? receipts : []).filter(receiptEligible);
    const deduplicated = [...new Map(real.map(receipt => [`${clean(receipt.sourceClass, 50)}:${clean(receipt.sourceReceiptId, 180)}`, receipt])).values()];
    const grossReceived = deduplicated.reduce((total, receipt) => total + minor(receipt.netAmountMinor), 0);
    const realAdjustments = (Array.isArray(adjustments) ? adjustments : []).filter(adjustmentEligible);
    const deduplicatedAdjustments = [...new Map(realAdjustments.map(adjustment => [`${clean(adjustment.sourceClass, 50)}:${clean(adjustment.sourceRecordId, 180)}`, adjustment])).values()];
    const adjustmentTotal = deduplicatedAdjustments.reduce((total, adjustment) => total + minor(adjustment.amountMinor), 0);
    const received = Math.max(0, grossReceived - adjustmentTotal);
    const total = minor(baselineEurMinor) + received;
    const achieved = CAPITAL_MILESTONES_EUR_MINOR.filter(target => total >= target);
    const next = CAPITAL_MILESTONES_EUR_MINOR.find(target => total < target) || null;
    return {
      challenge_id: 'matrix-capital-challenge-eur-v1',
      law: MATRIX_LAW,
      law_sha256: MATRIX_LAW_SHA256,
      currency: 'EUR',
      baseline_net_minor: minor(baselineEurMinor),
      gross_received_minor: grossReceived,
      adjustments_minor: adjustmentTotal,
      received_net_minor: received,
      total_net_minor: total,
      reconciled_receipt_count: deduplicated.length,
      reconciled_adjustment_count: deduplicatedAdjustments.length,
      achieved_milestones_minor: achieved,
      next_milestone_minor: next,
      next_milestone_progress_percent: next ? Math.round(Math.min(100, total * 10_000 / next)) / 100 : 100,
      first_real_euro_received: total >= 100,
      operational_claim_allowed: total >= 100 && deduplicated.length > 0,
      state: total >= 100 ? 'ACTIVE_REAL_RECEIPTS' : 'AWAITING_FIRST_REAL_RECEIPT',
      counted_value_rule: 'Only finalized/reconciled value received into an approved Matrix destination counts.',
      updated_at: now
    };
  }
}

export class CapitalAcquisitionDirector {
  rank(opportunities = [], { now = new Date().toISOString() } = {}) {
    return (Array.isArray(opportunities) ? opportunities : []).map((item, index) => {
      const gross = minor(item.estimatedGrossMinor ?? item.estimated_gross_minor);
      const cost = minor(item.estimatedCostMinor ?? item.estimated_cost_minor);
      const probabilityPpm = Math.max(0, Math.min(1_000_000, Math.trunc(finite(item.successProbabilityPpm ?? item.success_probability_ppm))));
      const nextAction = clean(item.nextAction || item.next_action, 80).toUpperCase();
      const lawful = item.lawful === true && item.authorizedMethod === true;
      const destinationReady = item.destinationReady === true;
      const evidenceReady = item.evidenceReady === true;
      const expectedNet = Math.trunc((gross - cost) * probabilityPpm / 1_000_000);
      const blockers = [];
      if (!lawful) blockers.push('lawful-authorized-method-required');
      if (!CAPITAL_NEXT_ACTIONS.includes(nextAction)) blockers.push('valid-next-action-required');
      if (cost > 0 && item.spendingAuthorized !== true) blockers.push('spending-not-authorized');
      if (['CLAIM', 'COLLECT'].includes(nextAction) && !destinationReady) blockers.push('approved-destination-required');
      if (['CLAIM', 'COLLECT'].includes(nextAction) && !evidenceReady) blockers.push('evidence-or-entitlement-required');
      if (expectedNet <= 0) blockers.push('positive-expected-net-required');
      return {
        opportunity_id: clean(item.opportunityId || item.opportunity_id, 180) || `capital-opportunity-${index + 1}`,
        opportunity_type: clean(item.opportunityType || item.opportunity_type || 'dynamic', 100),
        priority_lane: CAPITAL_PRIORITY_LANES.includes(item.priorityLane || item.priority_lane) ? (item.priorityLane || item.priority_lane) : 'P5_COMPLEX_CLAIMS',
        next_action: CAPITAL_NEXT_ACTIONS.includes(nextAction) ? nextAction : 'VERIFY',
        estimated_gross_minor: gross,
        estimated_cost_minor: cost,
        expected_net_minor: expectedNet,
        success_probability_ppm: probabilityPpm,
        executable: blockers.length === 0,
        blockers,
        authorization_is_method_scoped: true,
        generated_at: now
      };
    }).sort((a, b) => Number(b.executable) - Number(a.executable) || b.expected_net_minor - a.expected_net_minor || a.opportunity_id.localeCompare(b.opportunity_id));
  }
}

export class RevenueCreationDirector {
  invent({ assets = [], capabilities = [], audiences = [], problems = [] } = {}, now = new Date().toISOString()) {
    const candidates = [];
    for (const asset of list(assets, 20)) {
      for (const problem of list(problems, 10)) {
        const audience = list(audiences, 10)[0] || 'existing Matrix audience';
        candidates.push({
          opportunity_id: `revenue-${slug(asset, 50)}-${slug(problem, 50)}`,
          opportunity_type: 'digital-product-hypothesis',
          title: `${asset} for ${audience}: ${problem}`,
          source_asset: asset,
          customer_problem: problem,
          next_action: 'PREPARE',
          estimated_cost_minor: 0,
          evidence_state: 'HYPOTHESIS_ONLY',
          automatic_publication: false,
          generated_at: now
        });
      }
    }
    return candidates.slice(0, 50).map(candidate => ({ ...candidate, available_capabilities: list(capabilities, 20) }));
  }
}

export class NovelOpportunityDirector {
  discover(dimensions = {}, now = new Date().toISOString()) {
    const assets = list(dimensions.assets, 12);
    const capabilities = list(dimensions.capabilities, 12);
    const audiences = list(dimensions.audiences, 12);
    const problems = list(dimensions.problems, 12);
    const opportunities = [];
    const width = Math.min(Math.max(assets.length, capabilities.length, audiences.length, problems.length), 20);
    for (let index = 0; index < width; index += 1) {
      const asset = assets[index % Math.max(1, assets.length)] || 'Matrix knowledge';
      const capability = capabilities[index % Math.max(1, capabilities.length)] || 'evidence synthesis';
      const audience = audiences[index % Math.max(1, audiences.length)] || 'public audience';
      const problem = problems[index % Math.max(1, problems.length)] || 'need for verifiable information';
      opportunities.push({
        opportunity_id: `novel-${slug(asset, 35)}-${slug(capability, 35)}-${index + 1}`,
        opportunity_type: clean(dimensions.opportunityType || 'invented-capability-combination', 100),
        combination: { asset, capability, audience, problem },
        next_action: 'VERIFY',
        policy_class: 'METHOD_PERMISSION_REQUIRED',
        authority_expansion: false,
        schema_version: 1,
        generated_at: now
      });
    }
    return opportunities;
  }
}

export class MatrixOpportunityGraph {
  build(opportunities = []) {
    const nodes = [];
    const edges = [];
    for (const opportunity of Array.isArray(opportunities) ? opportunities : []) {
      const id = clean(opportunity.opportunity_id || opportunity.opportunityId, 180);
      if (!id) continue;
      nodes.push({ node_id: id, node_type: 'opportunity', state: clean(opportunity.evidence_state || 'HYPOTHESIS_ONLY', 50) });
      const parts = opportunity.combination || {};
      for (const [type, label] of Object.entries(parts)) {
        const partId = `${slug(type, 30)}:${slug(label, 100)}`;
        nodes.push({ node_id: partId, node_type: slug(type, 30), state: 'OBSERVED_INPUT' });
        edges.push({ edge_id: `${partId}->${id}`, from_node_id: partId, to_node_id: id, relationship: 'supports-hypothesis', evidence_state: 'HYPOTHESIS_ONLY' });
      }
    }
    return {
      nodes: [...new Map(nodes.map(node => [node.node_id, node])).values()],
      edges: [...new Map(edges.map(edge => [edge.edge_id, edge])).values()],
      graph_does_not_prove_value: true
    };
  }
}

export class AcquisitionExperiment {
  design(opportunity = {}, { maximumCostMinor = 0, now = new Date().toISOString() } = {}) {
    const requestedCost = minor(opportunity.estimated_cost_minor ?? opportunity.estimatedCostMinor);
    const ceiling = minor(maximumCostMinor);
    const blockers = [];
    if (requestedCost > ceiling) blockers.push('experiment-cost-exceeds-authorized-ceiling');
    if (requestedCost > 0) blockers.push('zero-spend-first-requires-separate-owner-authorization');
    if (!clean(opportunity.opportunity_id || opportunity.opportunityId, 180)) blockers.push('opportunity-id-required');
    return {
      experiment_id: `experiment-${slug(opportunity.opportunity_id || opportunity.opportunityId, 140)}`,
      opportunity_id: clean(opportunity.opportunity_id || opportunity.opportunityId, 180),
      hypothesis: clean(opportunity.hypothesis || `A bounded zero-spend test will produce measurable demand evidence.`, 1000),
      maximum_cost_minor: ceiling,
      test_cost_minor: requestedCost,
      state: blockers.length ? 'BLOCKED' : 'READY_FOR_BOUNDED_TEST',
      blockers,
      success_metric: clean(opportunity.successMetric || 'one independently verifiable conversion or qualified response', 500),
      automatic_financial_execution: false,
      created_at: now
    };
  }
}

export class FutureOpportunityRadar {
  scan(signals = [], now = new Date().toISOString()) {
    return (Array.isArray(signals) ? signals : []).map((signal, index) => ({
      radar_id: clean(signal.radarId || signal.id, 160) || `future-signal-${index + 1}`,
      signal: clean(signal.signal || signal.detail || signal, 1000),
      horizon: clean(signal.horizon || 'unknown', 50),
      confidence_ppm: Math.max(0, Math.min(1_000_000, Math.trunc(finite(signal.confidencePpm)))),
      immediate_value_minor: 0,
      state: 'WATCH_ONLY',
      discovered_at: now
    }));
  }
}

export function acquisitionVelocity(receipts = [], { windowDays = 30, adjustments = [] } = {}) {
  const eligible = (Array.isArray(receipts) ? receipts : []).filter(receiptEligible);
  const eligibleAdjustments = (Array.isArray(adjustments) ? adjustments : []).filter(adjustmentEligible);
  const gross = eligible.reduce((total, receipt) => total + minor(receipt.netAmountMinor), 0);
  const adjusted = eligibleAdjustments.reduce((total, adjustment) => total + minor(adjustment.amountMinor), 0);
  const net = Math.max(0, gross - adjusted);
  return { window_days: Math.max(1, Math.trunc(finite(windowDays, 30))), reconciled_receipts: eligible.length, reconciled_adjustments: eligibleAdjustments.length, net_eur_minor: net, net_eur_minor_per_day: Math.round(net / Math.max(1, finite(windowDays, 30))) };
}

export function realizedChannelScore(channel = {}) {
  const realized = minor(channel.realizedNetMinor);
  const failedCost = minor(channel.failedCostMinor);
  const attempts = Math.max(0, Math.trunc(finite(channel.attempts)));
  const receipts = Math.max(0, Math.trunc(finite(channel.receipts)));
  return { score: attempts ? (realized - failedCost) / attempts : 0, success_rate: attempts ? receipts / attempts : 0, basis: 'reconciled-receipts-minus-realized-costs' };
}

export function capitalForecast(status = {}, velocity = {}) {
  const remaining = Math.max(0, minor(status.next_milestone_minor) - minor(status.total_net_minor));
  const daily = minor(velocity.net_eur_minor_per_day);
  if (!daily) return { forecast_available: false, reason: 'No positive reconciled acquisition velocity.', earliest_days: null, latest_days: null, no_fake_precision: true };
  const central = Math.ceil(remaining / daily);
  return { forecast_available: true, earliest_days: Math.max(0, Math.floor(central * 0.75)), latest_days: Math.ceil(central * 1.5), no_fake_precision: true };
}

export class CapitalChallengeWatchdog {
  assess({ status, openOpportunities = 0, activeExperiments = 0, lastReceiptAt = null } = {}) {
    const stalled = !status?.first_real_euro_received && Number(openOpportunities) === 0 && Number(activeExperiments) === 0;
    return {
      event: stalled ? 'CAPITAL_STAGNATION' : 'CAPITAL_ACTIVE',
      stalled,
      recovery_mission_required: stalled,
      last_receipt_at: lastReceiptAt,
      first_real_receipt_required: !status?.first_real_euro_received,
      law: MATRIX_LAW
    };
  }
}

export const matrixCapitalInternals = { clean, list, finite, minor, slug, receiptEligible, adjustmentEligible };
