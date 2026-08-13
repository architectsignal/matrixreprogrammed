import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { handleBountyEngineRoute, runBountyCompletionCycle } from '../src/worker-bounty-engine.js';
import { valueHunterWorkerInternals } from '../src/worker-value-hunter.js';

class D1Statement {
  constructor(database, sql) { this.database = database; this.sql = sql; this.parameters = []; }
  bind(...parameters) { this.parameters = parameters; return this; }
  async first() { return this.database.prepare(this.sql).get(...this.parameters) || null; }
  async all() { return { results: this.database.prepare(this.sql).all(...this.parameters) }; }
  async run() { const result = this.database.prepare(this.sql).run(...this.parameters); return { success: true, meta: { changes: Number(result.changes || 0) } }; }
}
class D1Database { constructor(database) { this.database = database; } prepare(sql) { return new D1Statement(this.database, sql); } }

const migrations = [
  'migrations/0001_membership_foundation.sql','migrations/phase5_member_experience.sql','migrations/phase13_member_entitlement_datetime_fix.sql',
  'migrations/phase6_paypal_subscriptions.sql','migrations/phase6_paypal_failure_counter_fix.sql',
  'migrations/phase9_ai_resource_orchestration.sql','migrations/phase10_ai_autonomy.sql','migrations/phase11_local_job_queue.sql',
  'migrations/phase12_opportunity_hunter.sql','migrations/phase13_matrix_synergy.sql','migrations/public_investigation_api.sql',
  'migrations/phase14_living_matrix.sql','migrations/phase15_matrix_value_hunter.sql','migrations/phase16_permissionless_value_harvester.sql',
  'migrations/phase17_matrix_operating_system.sql','migrations/phase18_matrix_continuous_evolution.sql','migrations/phase19_matrix_capital_challenge.sql',
  'migrations/phase20_bounty_completion_engine.sql'
];
const raw = new DatabaseSync(':memory:');
for (const migration of migrations) raw.exec(fs.readFileSync(migration, 'utf8'));
const env = { MEMBERS_DB: new D1Database(raw), MATRIX_BOUNTY_ENGINE_ENABLED: 'true', MATRIX_BOUNTY_AUTO_CLAIM_ENABLED: 'false', MATRIX_BOUNTY_AUTO_SUBMISSION_ENABLED: 'false' };
const sources = raw.prepare('SELECT * FROM matrix_bounty_sources ORDER BY source_id').all();
const adapters = sources.map(source => ({ source, adapter: {
  adapterId: source.adapter_id,
  async discoverBounties() {
    if (source.platform === 'github-paid-issue') return { ok: true, bounties: [{
      bountyId: 'fixture-docs-eur-1', sourcePlatform: 'github-paid-issue', externalId: '101', title: 'Fix documentation example and tests',
      description: 'Small documented regression with clear acceptance criteria.', repository: 'https://github.com/example/project',
      issueUrl: 'https://github.com/example/project/issues/101', bountyUrl: 'https://github.com/example/project/issues/101',
      rewardMinor: 5000, rewardCurrency: 'EUR', rewardEurEstimateMinor: 5000, programRulesUrl: source.rules_url,
      aiUsageAllowed: true, automationAllowed: true, acceptanceProbabilityPpm: 900000, paymentProbabilityPpm: 900000,
      competitionCount: 0, estimatedTimeMinutes: 45, sourceEvidence: { fixture: true, official_api_shape: true }
    }, {
      bountyId: 'fixture-security-1', sourcePlatform: 'github-paid-issue', externalId: '102', title: 'Security bounty',
      description: 'Find vulnerability', repository: 'https://github.com/example/security', issueUrl: 'https://github.com/example/security/issues/102',
      bountyUrl: 'https://github.com/example/security/issues/102', rewardMinor: 100000, rewardCurrency: 'EUR', rewardEurEstimateMinor: 100000,
      programRulesUrl: source.rules_url, aiUsageAllowed: true, automationAllowed: true, securityBounty: true,
      acceptanceProbabilityPpm: 1000000, paymentProbabilityPpm: 1000000
    }] };
    return { ok: true, bounties: [{
      bountyId: 'fixture-opire-usd-1', sourcePlatform: 'opire', externalId: '201', title: 'README wording', repository: 'https://github.com/example/other',
      issueUrl: 'https://github.com/example/other/issues/201', bountyUrl: 'https://app.opire.dev', rewardMinor: 7000,
      rewardCurrency: 'USD', rewardEurEstimateMinor: 0, programRulesUrl: source.rules_url, aiUsageAllowed: 'unknown', automationAllowed: 'unknown',
      acceptanceProbabilityPpm: 800000, paymentProbabilityPpm: 800000, sourceEvidence: { fixture: true, official_api_shape: true }
    }] };
  }
} }));
const rulesFetch = async () => new Response('Official bounty rules document with enough content to produce a current immutable evidence hash. AI permission remains per bounty.', { status: 200 });

try {
  const first = await runBountyCompletionCycle(env, { trigger: 'integration-one', now: '2026-08-13T12:00:00.000Z', adapters, fetchImpl: rulesFetch });
  assert.equal(first.ok, true);
  assert.equal(first.discovered_count, 3);
  assert.equal(first.selected_count, 0);
  assert.equal(first.truth, 'ENGINE OPERATIONAL / FIRST RECEIPT PENDING');
  assert.equal(first.automatic_claims, false);
  assert.equal(first.security_execution, false);
  assert.equal(raw.prepare("SELECT status FROM matrix_bounties WHERE bounty_id='fixture-security-1'").get().status, 'REJECTED');
  assert.equal(raw.prepare("SELECT status FROM matrix_bounties WHERE bounty_id='fixture-docs-eur-1'").get().status, 'RULES_CHECK');
  assert.ok(raw.prepare('SELECT COUNT(*) count FROM matrix_bounty_rules_checks').get().count >= 3);
  assert.equal(raw.prepare('SELECT COUNT(*) count FROM matrix_bounty_learning WHERE behavior_changed=1').get().count, 1);
  assert.equal(raw.prepare("SELECT COUNT(*) count FROM matrix_events WHERE event_type='value.cycle.completed'").get().count, 1);
  const duplicate = await runBountyCompletionCycle(env, { trigger: 'integration-one', now: '2026-08-13T13:00:00.000Z', adapters, fetchImpl: rulesFetch });
  assert.equal(duplicate.duplicate, true);

  raw.prepare(`INSERT INTO matrix_value_claimants(claimant_id,display_label,authority_status,identity_status,identity_vault_reference,jurisdictions_json,enabled,created_at,updated_at)
    VALUES('matrix-bounty-entity','Matrix bounty entity','proven','matched','vault://claimants/matrix-bounty-entity','[]',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).run();
  raw.prepare(`INSERT INTO matrix_value_destinations(destination_id,claimant_id,destination_type,destination_vault_reference,public_identifier_hash,allowed_assets_json,allowed_intents_json,provider_adapter_id,approved,active,approved_by_owner_at,created_at,updated_at)
    VALUES('matrix-bounty-eur','matrix-bounty-entity','payment-account','vault://destinations/matrix-bounty-eur',?,'["EUR"]','["CLAIM_REWARD"]','github-paid-issue',1,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).run('d'.repeat(64));

  const unsafe = await handleBountyEngineRoute(new Request('https://matrixreprogrammed.com/api/ai-management/admin/bounty-engine/platforms', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ platform: 'github-paid-issue', token: 'do-not-store' })
  }), env);
  assert.equal(unsafe.status, 400);
  assert.match((await unsafe.json()).error, /raw credentials/i);
  const platform = await handleBountyEngineRoute(new Request('https://matrixreprogrammed.com/api/ai-management/admin/bounty-engine/platforms', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      platform: 'github-paid-issue', credential_vault_reference: 'vault://providers/github-bounty', destination_id: 'matrix-bounty-eur',
      payout_identity_ready: true, terms_accepted: true, external_writes_enabled: true
    })
  }), env);
  assert.equal(platform.status, 201);
  assert.equal((await platform.json()).raw_credentials_stored, false);
  const rules = await handleBountyEngineRoute(new Request('https://matrixreprogrammed.com/api/ai-management/admin/bounty-engine/rules', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ bounty_id: 'fixture-docs-eur-1', rules_sha256: 'e'.repeat(64), ai_usage_allowed: 'allowed', automation_allowed: 'allowed' })
  }), env);
  assert.equal(rules.status, 201);
  const workspace = await handleBountyEngineRoute(new Request('https://matrixreprogrammed.com/api/ai-management/admin/bounty-engine/workspaces', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ bounty_id: 'fixture-docs-eur-1', isolated_workspace_reference: 'workspace://bounties/fixture-docs-eur-1', base_sha: 'f'.repeat(40) })
  }), env);
  assert.equal(workspace.status, 201);
  const second = await runBountyCompletionCycle(env, { trigger: 'integration-two', now: '2026-08-14T12:00:00.000Z', adapters, fetchImpl: rulesFetch });
  assert.equal(second.selected_count, 1);
  assert.equal(second.engine_status, 'REAL_OPPORTUNITY_IN_PROGRESS');
  assert.equal(raw.prepare("SELECT status FROM matrix_bounties WHERE bounty_id='fixture-docs-eur-1'").get().status, 'SELECTED');
  assert.equal(raw.prepare('SELECT COUNT(*) count FROM matrix_bounty_submissions').get().count, 0, 'selection must not fake a claim or submission');

  raw.prepare(`INSERT INTO matrix_bounty_reviews(review_id,bounty_id,workspace_id,reviewer_class,tests_passing,static_analysis_passing,requirement_coverage_percent,confidence_percent,findings_json,decision,reviewed_at)
    VALUES('review-fixture','fixture-docs-eur-1','workspace-fixture-docs-eur-1','SEPARATE_REVIEW_PASS',1,1,100,100,'[]','READY_TO_SUBMIT','2026-08-15T10:00:00.000Z')`).run();
  raw.prepare(`INSERT INTO matrix_bounty_submissions(submission_id,bounty_id,workspace_id,platform,external_submission_reference,pull_request_url,status,external_write_authorized,idempotency_key,submitted_at,updated_at)
    VALUES('submission-fixture','fixture-docs-eur-1','workspace-fixture-docs-eur-1','github-paid-issue','github-pr-999','https://github.com/example/project/pull/999','PAID',1,'fixture-docs-eur-1:v1','2026-08-15T11:00:00.000Z','2026-08-16T11:00:00.000Z')`).run();
  raw.prepare(`INSERT INTO matrix_bounty_receipts(bounty_receipt_id,bounty_id,submission_id,source_platform,provider_receipt_reference,asset,gross_amount_minor,fee_minor,net_amount_minor,eur_net_minor,conversion_evidence_json,destination_id,received_at,reconciled,reconciled_at,evidence_json,created_at)
    VALUES('bounty-receipt-fixture','fixture-docs-eur-1','submission-fixture','github-paid-issue','provider-payout-fixture','EUR',5000,100,4900,4900,'{"basis":"native-EUR"}','matrix-bounty-eur','2026-08-16T12:00:00.000Z',1,'2026-08-16T13:00:00.000Z','{"fixture_contract_only":true}','2026-08-16T13:00:00.000Z')`).run();
  raw.prepare("UPDATE matrix_bounties SET status='RECONCILED' WHERE bounty_id='fixture-docs-eur-1'").run();
  const imported = await valueHunterWorkerInternals.syncCapitalReceipts(env.MEMBERS_DB, '2026-08-16T14:00:00.000Z');
  assert.equal(imported.bounty_receipts, 1);
  assert.equal(raw.prepare("SELECT eur_net_minor FROM matrix_capital_receipts WHERE source_class='BOUNTY'").get().eur_net_minor, 4900);
  const doctor = await handleBountyEngineRoute(new Request('https://matrixreprogrammed.com/api/ai-management/admin/bounty-engine/doctor'), env);
  const health = await doctor.json();
  assert.equal(health.engine_status, 'REAL_RECEIPT_VERIFIED');
  assert.equal(health.reconciled_net_eur_minor, 4900);
  assert.equal(health.security_bounty_execution, false);

  console.log('Bounty Worker integration passed: official-shaped discovery, rules hashing, D1 normalization, security rejection, owner vault/profile gates, isolated workspace, max-active selection, no automatic external writes, reconciled receipt and Capital Challenge bridge.');
} finally {
  raw.close();
}
