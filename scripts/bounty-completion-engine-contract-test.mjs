import assert from 'node:assert/strict';
import {
  BountyCompletionDirector, BountyFeasibilityEvaluator, BountyProfitEngine, canTransitionBounty,
  normalizeBounty, shouldStopBounty, submissionConfidence, bountyRepositoryProfile
} from '../ai-management/value-hunter/bounty/bounty-completion-engine.mjs';

const normalized = normalizeBounty({
  bountyId: 'docs-bounty-1', sourcePlatform: 'official-test', externalId: '1', title: 'Fix documentation example',
  description: 'Add regression tests and correct the README.', repository: 'https://github.com/example/project',
  issueUrl: 'https://github.com/example/project/issues/1', rewardMinor: 10000, rewardCurrency: 'EUR',
  rewardEurEstimateMinor: 10000, programRulesUrl: 'https://github.com/example/project/CONTRIBUTING.md',
  programRulesSha256: 'a'.repeat(64), aiUsageAllowed: true, automationAllowed: true,
  acceptanceProbabilityPpm: 900000, paymentProbabilityPpm: 950000, estimatedTimeMinutes: 60
}, '2026-08-13T12:00:00.000Z');
assert.equal(normalized.task_type, 'documentation');
assert.equal(normalized.security_bounty, false);
assert.equal(canTransitionBounty('DISCOVERED', 'RULES_CHECK'), true);
assert.equal(canTransitionBounty('DISCOVERED', 'PAID'), false);

const capability = { testsAvailable: true, buildUnderstood: true, languageAvailable: true, requirementsClear: true, rewardOpen: true, maximumCompetition: 10, payoutDestinationReady: true, identityAndTermsReady: true };
const feasible = new BountyFeasibilityEvaluator().evaluate(normalized, capability);
assert.equal(feasible.feasible, true);
assert.equal(feasible.consequential_actions_executed, 0);
const economics = new BountyProfitEngine().evaluate(normalized, { completionProbabilityPpm: feasible.completion_probability_ppm });
assert.equal(economics.positive_expected_value, true);
assert.equal(economics.zero_spend, true);
const plan = new BountyCompletionDirector().plan([normalized], capability, { maximumActive: 3 });
assert.equal(plan.selected.length, 1);
assert.equal(plan.automatic_claim_or_submission, false);
assert.equal(plan.security_auto_execution, false);

const security = normalizeBounty({ ...normalized, bountyId: 'security-1', labels: ['security'], securityBounty: true });
assert.equal(new BountyCompletionDirector().plan([security], capability).selected.length, 0);
assert.equal(new BountyFeasibilityEvaluator().evaluate({ ...normalized, ai_usage_allowed: 'unknown' }, capability).feasible, false);
assert.equal(submissionConfidence({ testsPassing: true, requirementCoveragePercent: 100, staticAnalysisPassing: true, repositoryConventionScore: 100, reviewFindingSeverity: 0, uncertaintyPercent: 0, changedFiles: 2, changedLines: 40 }).ready_to_submit, true);
assert.equal(shouldStopBounty({ actualMinutes: 121, maximumMinutes: 120, revisedExpectedNetMinor: 1 }).stop, true);
assert.deepEqual(bountyRepositoryProfile([{ accepted: true, reconciled: true, netEurMinor: 500 }]), { attempts: 1, accepted: 1, paid: 1, acceptance_rate: 1, payout_reliability: 1, net_eur_minor: 500, evidence_basis: 'accepted-and-reconciled-records-only' });

console.log('Bounty Completion Engine contract passed: normalized lifecycle, easy-task preference, profit gates, explicit AI/rules/payout requirements, security rejection, stop rules, review confidence and receipt-derived profiles.');
