import assert from 'node:assert/strict';
import {
  AcquisitionExperiment,
  CapitalAcquisitionDirector,
  CapitalChallengeWatchdog,
  FutureOpportunityRadar,
  MatrixCapitalChallenge,
  MatrixDestinationRegistry,
  MatrixOpportunityGraph,
  NovelOpportunityDirector,
  RevenueCreationDirector,
  acquisitionVelocity,
  capitalForecast,
  realizedChannelScore
} from '../ai-management/value-hunter/matrix-capital-challenge.mjs';

const registry = new MatrixDestinationRegistry();
assert.equal(registry.validate({ destinationId: 'matrix-eur', vaultReference: 'vault://destinations/matrix-eur', approved: true, active: true, allowedAssets: ['EUR'] }).approved, true);
assert.equal(registry.validate({ destinationId: 'unsafe', vaultReference: 'bank-account-raw', approved: true, active: true, allowedAssets: ['EUR'], rawCredentialPresent: true }).approved, false);

const challenge = new MatrixCapitalChallenge();
const empty = challenge.summarize([], { now: '2026-08-13T12:00:00.000Z' });
assert.equal(empty.state, 'AWAITING_FIRST_REAL_RECEIPT');
assert.equal(empty.operational_claim_allowed, false);
assert.equal(empty.next_milestone_minor, 100);
const received = challenge.summarize([
  { sourceClass: 'CLAIM_VALUE', sourceReceiptId: 'receipt-1', externalReference: 'external-1', asset: 'EUR', netAmountMinor: 125, reconciled: true, destinationApproved: true },
  { sourceClass: 'CLAIM_VALUE', sourceReceiptId: 'receipt-1', externalReference: 'external-1', asset: 'EUR', netAmountMinor: 125, reconciled: true, destinationApproved: true },
  { sourceClass: 'CLAIM_VALUE', sourceReceiptId: 'unreconciled', externalReference: 'external-2', asset: 'EUR', netAmountMinor: 999999, reconciled: false, destinationApproved: true }
], { adjustments: [
  { sourceClass: 'REFUND', sourceRecordId: 'refund-1', externalReference: 'refund-external-1', asset: 'EUR', amountMinor: 25, reconciled: true },
  { sourceClass: 'REFUND', sourceRecordId: 'refund-1', externalReference: 'refund-external-1', asset: 'EUR', amountMinor: 25, reconciled: true }
], now: '2026-08-14T12:00:00.000Z' });
assert.equal(received.total_net_minor, 100);
assert.equal(received.gross_received_minor, 125);
assert.equal(received.adjustments_minor, 25);
assert.equal(received.received_net_minor, 100);
assert.equal(received.reconciled_receipt_count, 1);
assert.equal(received.first_real_euro_received, true);
assert.equal(received.next_milestone_minor, 1000);

const ranked = new CapitalAcquisitionDirector().rank([
  { opportunityId: 'verified-free', opportunityType: 'bounty', priorityLane: 'P1_BOUNTIES', nextAction: 'COLLECT', estimatedGrossMinor: 500, estimatedCostMinor: 0, successProbabilityPpm: 900000, lawful: true, authorizedMethod: true, destinationReady: true, evidenceReady: true },
  { opportunityId: 'unauthorized', nextAction: 'COLLECT', estimatedGrossMinor: 50000, successProbabilityPpm: 1000000, lawful: false, authorizedMethod: false, destinationReady: false, evidenceReady: false }
]);
assert.equal(ranked[0].opportunity_id, 'verified-free');
assert.equal(ranked[0].executable, true);
assert.equal(ranked[1].executable, false);
assert.ok(ranked[1].blockers.includes('lawful-authorized-method-required'));

const revenue = new RevenueCreationDirector().invent({ assets: ['evidence brief'], capabilities: ['source synthesis'], audiences: ['researchers'], problems: ['slow verification'] });
assert.equal(revenue.length, 1);
assert.equal(revenue[0].evidence_state, 'HYPOTHESIS_ONLY');
assert.equal(revenue[0].automatic_publication, false);

const novel = new NovelOpportunityDirector().discover({ assets: ['public evidence corpus'], capabilities: ['citation checking'], audiences: ['journalists'], problems: ['verification cost'] });
assert.equal(novel.length, 1);
assert.equal(novel[0].authority_expansion, false);
const graph = new MatrixOpportunityGraph().build(novel);
assert.ok(graph.nodes.length >= 5);
assert.equal(graph.graph_does_not_prove_value, true);

const experiment = new AcquisitionExperiment();
assert.equal(experiment.design({ opportunity_id: 'novel-one', estimated_cost_minor: 0 }).state, 'READY_FOR_BOUNDED_TEST');
assert.equal(experiment.design({ opportunity_id: 'paid-test', estimated_cost_minor: 1 }, { maximumCostMinor: 1 }).state, 'BLOCKED');

const radar = new FutureOpportunityRadar().scan([{ id: 'signal-one', signal: 'New official bounty program', confidencePpm: 600000 }]);
assert.equal(radar[0].state, 'WATCH_ONLY');
assert.equal(radar[0].immediate_value_minor, 0);

const velocity = acquisitionVelocity([{ sourceClass: 'CLAIM_VALUE', sourceReceiptId: 'receipt-1', externalReference: 'external-1', asset: 'EUR', netAmountMinor: 3000, reconciled: true, destinationApproved: true }], { windowDays: 30 });
assert.equal(velocity.net_eur_minor_per_day, 100);
assert.equal(capitalForecast({ next_milestone_minor: 10000, total_net_minor: 3000 }, velocity).forecast_available, true);
assert.equal(capitalForecast({ next_milestone_minor: 10000, total_net_minor: 0 }, { net_eur_minor_per_day: 0 }).forecast_available, false);
assert.equal(realizedChannelScore({ realizedNetMinor: 1000, failedCostMinor: 100, attempts: 3, receipts: 1 }).score, 300);

const watchdog = new CapitalChallengeWatchdog().assess({ status: empty, openOpportunities: 0, activeExperiments: 0 });
assert.equal(watchdog.event, 'CAPITAL_STAGNATION');
assert.equal(watchdog.recovery_mission_required, true);

console.log('Matrix Capital Challenge contract passed: approved destinations, receipt-only milestones, lawful expected-value ranking, revenue and novel-opportunity hypotheses, bounded experiments, future radar, velocity and stagnation recovery.');
