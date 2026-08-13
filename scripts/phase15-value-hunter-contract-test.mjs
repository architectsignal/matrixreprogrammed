import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { valueHunterWorkerInternals } from '../src/worker-value-hunter.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const migration = read('migrations/phase15_matrix_value_hunter.sql');
for (const marker of [
  'matrix_value_jurisdictions', 'matrix_value_sources', 'matrix_value_claimants', 'matrix_value_destinations',
  'matrix_value_mandates', 'matrix_value_objectives', 'matrix_value_opportunities', 'matrix_value_entitlement_evidence',
  'matrix_value_claim_queue', 'matrix_value_operations', 'matrix_value_receipts', 'matrix_value_audit', 'matrix_value_improvement_proposals', 'matrix_value_cycles',
  'matrix_value_learning', 'measured-reconciled-receipts-only',
  'value-milestone-eur-10000', 'target_net_minor', '1000000', 'unclaimed_is_not_ownerless',
  "intent_type IN ('CLAIM_REWARD','SWEEP_RECEIVED_ASSET','WITHDRAW_OWNED_BALANCE')"
]) assert.ok(migration.includes(marker), `missing Phase 15 migration marker: ${marker}`);

for (const forbidden of ['private_key', 'seed_phrase', 'mnemonic', 'recovery_phrase']) {
  assert.equal(new RegExp(`\\b${forbidden}\\b`, 'i').test(migration), false, `schema must never persist ${forbidden}`);
}

const production = read('src/worker-production-autonomy.js');
assert.ok(production.includes("from './worker-value-hunter.js'"));
assert.ok(production.includes('runScheduledValueHunter'));
assert.ok(production.indexOf('runScheduledValueHunter') < production.lastIndexOf('runScheduledLivingMatrix'), 'Value Hunter must feed the later Living Matrix cycle');

const worker = read('src/worker-value-hunter.js');
for (const marker of [
  '/api/ai-management/admin/value-hunter', 'INSTALLED_COLLECTION_ADAPTERS', 'containsSensitiveMaterial',
  'processClaimQueue', 'collectProvenValue', 'matrix_value_operations', 'matrix_value_receipts',
  'generateValueCodeImprovements', '/improvements',
  'deterministic proof, current official rules, approved destination and constrained adapter',
  'discovery-and-proof-operational-collection-adapter-required'
]) assert.ok(worker.includes(marker), `missing worker boundary: ${marker}`);

const collector = read('ai-management/value-hunter/value-collector.mjs');
for (const marker of ['idempotencyEnforced', "receiptSchemaVersion !== 'value-receipt-v1'", 'ledger?.reserve', 'provider_receipt_reference', 'reconciled: claimReceipt.reconciled === true']) {
  assert.ok(collector.includes(marker), `missing durable collector boundary: ${marker}`);
}

const codeImprovement = read('ai-management/value-hunter/value-code-improvement.mjs');
for (const marker of ['same-host-official-claim-endpoint-required', 'provider-idempotency-required', 'provider-reconciliation-required', "activationState = 'sandbox-candidate'", 'activation_allowed: false', 'VALUE_ADAPTER_NOT_LIVE_CERTIFIED']) {
  assert.ok(codeImprovement.includes(marker), `missing code-improvement boundary: ${marker}`);
}

const core = read('ai-management/value-hunter/value-hunter-core.mjs');
assert.ok(core.includes("entitlement.ownership_status === 'unknown'"));
assert.ok(core.includes("legalBasis === 'lawful_appropriation'"));
assert.ok(core.includes('official_ownerless_determination'));
assert.ok(core.includes('confidence_is_legal_proof: false'));

const discoveryAdapter = read('ai-management/provider-adapters/value/official-html-links.mjs');
for (const marker of ['value-lead.discover', "approved_data_classes: ['public']", 'monetary_cost_per_unit_eur: 0', 'external_charge_possible: false', 'maximum_response_bytes', 'redirect-left-official-host', 'cost_confirmed_zero: true', 'provenance']) {
  assert.ok(discoveryAdapter.includes(marker), `missing governed discovery-adapter boundary: ${marker}`);
}

const leads = valueHunterWorkerInternals.extractOfficialLeads({
  official_url: 'https://official.example/grants',
  metadata_json: JSON.stringify({ allowed_host: 'official.example', link_terms: ['grant', 'funding'] })
}, `
  <a href="/grants/eligible-digital-project">Digital innovation grant</a>
  <a href="https://evil.example/grants/phishing">Huge grant</a>
  <a href="/privacy">Privacy</a>
`);
assert.deepEqual(leads, [{ title: 'Digital innovation grant', url: 'https://official.example/grants/eligible-digital-project' }]);

console.log('Phase 15 Value Hunter contract passed: EUR 10,000 target, claimant-safe entitlement, ownerless distinction, constrained collection and live-cycle wiring.');
