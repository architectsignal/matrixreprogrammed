import {
  DEFAULT_STANDING_MANDATE, LEGAL_BASES, VALUE_INTENT_TYPES, canTransitionValueState,
  evaluateValueOpportunity, priorityScore
} from '../ai-management/value-hunter/value-hunter-core.mjs';
import { collectProvenValue, ValueProviderRegistry } from '../ai-management/value-hunter/value-collector.mjs';
import {
  buildValueCollectionAdapterCandidate, certifyValueCollectionAdapterCandidate
} from '../ai-management/value-hunter/value-code-improvement.mjs';
import { OfficialHtmlValueLeadAdapter, allowedOfficialHost, extractOfficialValueLeads } from '../ai-management/provider-adapters/value/official-html-links.mjs';
import {
  CapitalChallengeWatchdog, MatrixCapitalChallenge, MatrixOpportunityGraph, NovelOpportunityDirector,
  RevenueCreationDirector, acquisitionVelocity, capitalForecast
} from '../ai-management/value-hunter/matrix-capital-challenge.mjs';
import { emitMatrixSystemEvent } from './matrix-event-emitter.js';

const ROOT_ROUTE = '/api/ai-management/admin/value-hunter';
const ROUTES = new Set([
  ROOT_ROUTE, `${ROOT_ROUTE}/claimants`, `${ROOT_ROUTE}/destinations`, `${ROOT_ROUTE}/opportunities`, `${ROOT_ROUTE}/improvements`,
  `${ROOT_ROUTE}/capital`, `${ROOT_ROUTE}/capital/opportunities`, `${ROOT_ROUTE}/capital/graph`, `${ROOT_ROUTE}/capital/experiments`
]);
// Financial providers are installed in reviewed source code, never from D1, prompts or arbitrary URLs.
const BUILT_IN_COLLECTION_PROVIDERS = Object.freeze([]);
const INSTALLED_COLLECTION_ADAPTERS = Object.freeze(BUILT_IN_COLLECTION_PROVIDERS.map(provider => provider.adapterId));
const SECRET_OR_PII_FIELD = /(private.?key|seed.?phrase|mnemonic|password|secret|raw.?signature|recovery.?phrase|social.?security|national.?insurance|passport|date.?of.?birth|bank.?account|routing.?number)/i;

function clean(value, maximum = 500) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maximum);
}

function id(value, fallback = '') {
  return clean(value, 160).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || fallback;
}

function integer(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : fallback;
}

function parseJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
      'x-content-type-options': 'nosniff', 'x-matrix-origin': 'cloudflare-worker-value-hunter'
    }
  });
}

function enabled(value, fallback = false) {
  if (value == null || value === '') return fallback;
  return String(value).toLowerCase() === 'true';
}

function containsSensitiveMaterial(value, path = '') {
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, nested]) => SECRET_OR_PII_FIELD.test(`${path}.${key}`) ||
    (nested && typeof nested === 'object' && containsSensitiveMaterial(nested, `${path}.${key}`)));
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value || '')));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function tableExists(db, table) {
  const row = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1").bind(table).first();
  return row?.name === table;
}

async function schemaReady(env) {
  if (!env?.MEMBERS_DB?.prepare) return false;
  const required = [
    'matrix_value_sources', 'matrix_value_claimants', 'matrix_value_destinations', 'matrix_value_mandates',
    'matrix_value_objectives', 'matrix_value_opportunities', 'matrix_value_entitlement_evidence',
    'matrix_value_claim_queue', 'matrix_value_operations', 'matrix_value_receipts', 'matrix_value_audit', 'matrix_value_improvement_proposals',
    'matrix_value_cycles', 'matrix_value_learning', 'matrix_capital_challenges', 'matrix_capital_destination_registry',
    'matrix_capital_receipts', 'matrix_capital_milestone_receipts', 'matrix_capital_channels', 'matrix_capital_opportunities',
    'matrix_opportunity_graph_nodes', 'matrix_opportunity_graph_edges', 'matrix_acquisition_experiments',
    'matrix_future_opportunity_radar', 'matrix_capital_cycles'
  ];
  return (await Promise.all(required.map(table => tableExists(env.MEMBERS_DB, table).catch(() => false)))).every(Boolean);
}

async function discoverOfficialPublicValueLeads(db, { fetchImpl = globalThis.fetch, now = new Date().toISOString() } = {}) {
  if (typeof fetchImpl !== 'function') return { scanned: 0, discovered: 0, failures: [{ reason: 'fetch-unavailable' }] };
  const sources = await rows(db.prepare(`SELECT source_id,jurisdiction_id,category,provider_name,official_url,metadata_json
    FROM matrix_value_sources WHERE official_verified=1 AND source_status IN ('discovery-only','active')
      AND json_extract(metadata_json,'$.discovery_adapter')='official-html-links-v1'
    ORDER BY source_id LIMIT 12`));
  let discovered = 0;
  const failures = [];
  const adapter = new OfficialHtmlValueLeadAdapter({ fetchImpl });
  for (const source of sources) {
    const response = await adapter.execute({ job_type: 'value-lead.discover', data_class: 'public', monetary_ceiling_eur: 0, source });
    await db.prepare('UPDATE matrix_value_sources SET last_checked_at=?,updated_at=? WHERE source_id=?').bind(now, now, source.source_id).run();
    if (!response.ok) { failures.push({ source_id: source.source_id, reason: response.reason || `http-${response.status}` }); continue; }
    for (const lead of response.leads || []) {
      const leadHash = await sha256(`${source.source_id}:${lead.url}`);
      const result = await db.prepare(`INSERT OR IGNORE INTO matrix_value_opportunities(
        opportunity_id,objective_id,source_id,jurisdiction_id,claimant_id,destination_id,category,title,legal_basis,state,
        asset,amount_minor,fee_minor,entitlement_proven,provider_adapter_id,contract_id,expires_at,priority_score,idempotency_key,decision_json,discovered_at,updated_at
      ) VALUES(?,'value-milestone-eur-10000',?,?,NULL,NULL,?,?,?,'DISCOVERED',?,0,0,0,NULL,NULL,NULL,0,?,?,?,?)`).bind(
        `value-lead-${leadHash.slice(0, 32)}`, source.source_id, source.jurisdiction_id, source.category,
        lead.title, source.category === 'grant' ? 'grant' : 'contract', source.jurisdiction_id.startsWith('jurisdiction-gb') ? 'GBP' : 'EUR',
        `official-lead:${leadHash}`, JSON.stringify({ provenance: lead.url, discovery_only: true, requires_eligibility_and_entitlement_proof: true }), now, now
      ).run();
      discovered += Number(result?.meta?.changes || 0);
    }
  }
  return { scanned: sources.length, discovered, failures };
}

async function rows(statement) {
  const result = await statement.all();
  return result?.results || [];
}

async function activeMandate(db) {
  const row = await db.prepare('SELECT * FROM matrix_value_mandates WHERE active=1 LIMIT 1').first();
  if (!row) return DEFAULT_STANDING_MANDATE;
  return {
    mandate_id: row.mandate_id,
    active: row.active === 1,
    auto_collect_proven_entitlements: row.auto_collect_proven_entitlements === 1,
    covered_categories: parseJson(row.covered_categories_json, []),
    allowed_intents: parseJson(row.allowed_intents_json, []),
    maximum_fee_minor: integer(row.maximum_fee_minor),
    maximum_fee_ratio: Number(row.maximum_fee_ratio || 0),
    maximum_daily_fee_minor: integer(row.maximum_daily_fee_minor),
    minimum_net_value_minor: integer(row.minimum_net_value_minor, 1),
    large_value_confirmation_threshold_minor: row.large_value_confirmation_threshold_minor == null ? null : integer(row.large_value_confirmation_threshold_minor)
  };
}

function evaluationInput(row, { autoCollectionEnabled = true, installedCollectionAdapters = INSTALLED_COLLECTION_ADAPTERS } = {}) {
  return {
    opportunity_id: row.opportunity_id,
    state: row.state,
    amount_minor: integer(row.amount_minor),
    fee_minor: integer(row.fee_minor),
    currency: row.asset,
    legal_basis: row.legal_basis,
    expires_at: row.expires_at,
    idempotency_key: row.idempotency_key,
    contract_id: row.contract_id,
    claimant: {
      claimant_id: row.claimant_id,
      authorized: row.claimant_id ? row.claimant_enabled === 1 : undefined,
      authority_status: row.authority_status,
      identity_status: row.identity_status
    },
    entitlement: {
      legal_basis: row.legal_basis,
      ownership_status: row.entitlement_proven === 1 ? 'proven' : 'unconfirmed',
      deterministic_proof: row.entitlement_proven === 1 && integer(row.evidence_count) > 0 && integer(row.ownership_evidence_count) > 0,
      evidence_count: integer(row.evidence_count),
      official_ownerless_determination: integer(row.ownerless_evidence_count) > 0,
      official_award_rule_verified: integer(row.finder_award_evidence_count) > 0
    },
    source: {
      official: row.official_verified === 1,
      verified: row.official_verified === 1,
      active: row.source_status === 'active',
      terms_current: row.terms_current === 1,
      terms_changed: row.source_status === 'terms-changed',
      terms_hash: row.terms_hash,
      validated_terms_hash: row.validated_terms_hash
    },
    jurisdiction: {
      checked: row.jurisdiction_status === 'current',
      claim_permitted: row.claim_permitted === 1,
      automation_permitted: row.automation_permitted === 1,
      automation_level: integer(row.automation_level),
      valid_until: row.jurisdiction_valid_until
    },
    destination: {
      destination_id: row.destination_id,
      approved: row.destination_approved === 1,
      active: row.destination_active === 1,
      allowed_assets: parseJson(row.allowed_assets_json, [])
    },
    provider: {
      adapter_id: row.provider_adapter_id,
      automation_supported: autoCollectionEnabled && installedCollectionAdapters.includes(row.provider_adapter_id)
    },
    human_requirements: parseJson(row.human_requirements_json || '[]', []),
    security: parseJson(row.security_json || '{}', {})
  };
}

async function recordDecision(db, row, evaluation, now, installedCollectionAdapters = INSTALLED_COLLECTION_ADAPTERS) {
  const next = evaluation.state;
  let state = row.state;
  let reasons = evaluation.reasons;
  if (state !== next) {
    if (canTransitionValueState(state, next)) state = next;
    else reasons = [...evaluation.reasons, `illegal-transition-blocked:${state}->${next}`];
  }
  const decision = { ...evaluation, state, reasons, evaluated_at: now, installed_collection_adapters: installedCollectionAdapters };
  await db.prepare(`UPDATE matrix_value_opportunities SET state=?,priority_score=?,decision_json=?,updated_at=? WHERE opportunity_id=?`).bind(
    state,
    priorityScore({
      amount_minor: row.amount_minor, fee_minor: row.fee_minor,
      historical_success_rate: row.learning_evaluated_count > 0 ? Number(row.learning_success_rate || 0) : 0.5,
      evidence_strength: row.entitlement_proven === 1 ? 1 : 0,
      fraud_risk: state === 'FRAUD_BLOCKED' ? 1 : 0,
      expected_days: 30 / Math.max(0.5, Number(row.learning_priority_multiplier || 1))
    }),
    JSON.stringify(decision), now, row.opportunity_id
  ).run();
  const auditKey = `${row.idempotency_key}:decision:${state}:${row.terms_hash || 'no-terms-hash'}`;
  await db.prepare(`INSERT OR IGNORE INTO matrix_value_audit(
    audit_id,opportunity_id,event_type,from_state,to_state,actor,reason_json,evidence_json,idempotency_key,created_at
  ) VALUES(?,?,?,?,?,'matrix-value-hunter',?,?,?,?)`).bind(
    `value-audit-${(await sha256(auditKey)).slice(0, 32)}`, row.opportunity_id, 'value.evaluated', row.state, state,
    JSON.stringify(reasons), JSON.stringify({ evidence_count: integer(row.evidence_count), legal_basis: row.legal_basis }), auditKey, now
  ).run();
  if (state === 'READY_TO_CLAIM') {
    const intentType = row.category === 'credit_balance' ? 'WITHDRAW_OWNED_BALANCE' : 'CLAIM_REWARD';
    const queueKey = `${row.idempotency_key}:claim`;
    await db.prepare(`INSERT OR IGNORE INTO matrix_value_claim_queue(
      queue_id,opportunity_id,intent_type,status,idempotency_key,attempts,next_attempt_at,last_error,created_at,updated_at
    ) VALUES(?,?,?,'queued',?,0,?,NULL,?,?)`).bind(
      `value-queue-${(await sha256(queueKey)).slice(0, 32)}`, row.opportunity_id, intentType, queueKey, now, now, now
    ).run();
  }
  return { opportunity_id: row.opportunity_id, from_state: row.state, state, reasons, auto_collect: state === 'READY_TO_CLAIM' };
}

async function opportunityRows(db) {
  return rows(db.prepare(`SELECT o.*,s.source_status,s.official_verified,s.official_url,s.metadata_json,s.terms_current,s.terms_hash,s.validated_terms_hash,
      j.claim_permitted,j.automation_permitted,j.automation_level,j.status AS jurisdiction_status,j.valid_until AS jurisdiction_valid_until,
      c.authority_status,c.identity_status,c.enabled AS claimant_enabled,
      d.approved AS destination_approved,d.active AS destination_active,d.allowed_assets_json,
      l.evaluated_count AS learning_evaluated_count,l.success_rate AS learning_success_rate,l.priority_multiplier AS learning_priority_multiplier,
      COUNT(e.evidence_id) AS evidence_count,
      SUM(CASE WHEN e.authority_verified=1 AND e.identity_match_verified=1 AND e.ownership_verified=1 THEN 1 ELSE 0 END) AS ownership_evidence_count,
      SUM(CASE WHEN e.evidence_type='official-ownerless-determination' AND e.authority_verified=1 AND e.ownership_verified=1 THEN 1 ELSE 0 END) AS ownerless_evidence_count,
      SUM(CASE WHEN e.evidence_type='official-finder-award-rule' AND e.authority_verified=1 THEN 1 ELSE 0 END) AS finder_award_evidence_count,
      json_extract(o.decision_json,'$.human_requirements') AS human_requirements_json,
      json_extract(o.decision_json,'$.security') AS security_json
    FROM matrix_value_opportunities o
    JOIN matrix_value_sources s ON s.source_id=o.source_id
    JOIN matrix_value_jurisdictions j ON j.jurisdiction_id=o.jurisdiction_id
    LEFT JOIN matrix_value_claimants c ON c.claimant_id=o.claimant_id
    LEFT JOIN matrix_value_destinations d ON d.destination_id=o.destination_id AND d.claimant_id=o.claimant_id
    LEFT JOIN matrix_value_entitlement_evidence e ON e.opportunity_id=o.opportunity_id
    LEFT JOIN matrix_value_learning l ON l.strategy_key=(o.category || ':' || o.asset)
    WHERE o.state NOT IN ('SWEPT_TO_APPROVED_DESTINATION','REJECTED','EXPIRED','NOT_OURS','FRAUD_BLOCKED')
    GROUP BY o.opportunity_id
    ORDER BY o.priority_score DESC,o.discovered_at ASC LIMIT 250`));
}

function collectionProviderRegistry(providers) {
  if (providers && typeof providers.get === 'function' && typeof providers.approvedAdapterIds === 'function') return providers;
  return new ValueProviderRegistry(BUILT_IN_COLLECTION_PROVIDERS);
}

function operationStatusForValueState(state) {
  if (state === 'CLAIM_SUBMITTED') return 'submitted';
  if (state === 'CLAIM_ACCEPTED') return 'accepted';
  if (state === 'PAYMENT_PENDING') return 'pending';
  if (state === 'SWEPT_TO_APPROVED_DESTINATION' || state === 'RECEIVED') return 'confirmed';
  if (state === 'REJECTED') return 'rejected';
  if (['AUTOMATION_NOT_PERMITTED', 'OWNER_APPROVAL_REQUIRED', 'FRAUD_BLOCKED'].includes(state)) return 'blocked';
  return 'created';
}

function nextAttemptAt(now, attempts) {
  const delayMinutes = Math.min(24 * 60, Math.max(5, 5 * (2 ** Math.max(0, attempts - 1))));
  return new Date(Date.parse(now) + delayMinutes * 60000).toISOString();
}

function collectionLedger(db, now) {
  return {
    async get(idempotencyKey) {
      const row = await db.prepare(`SELECT o.status,o.opportunity_id,r.receipt_id,r.gross_amount_minor,r.fee_minor,r.destination_id,r.reconciled
        FROM matrix_value_operations o LEFT JOIN matrix_value_receipts r ON r.operation_id=o.operation_id
        WHERE o.idempotency_key=? AND o.status='confirmed' LIMIT 1`).bind(idempotencyKey).first();
      if (!row?.receipt_id) return null;
      return {
        state: 'SWEPT_TO_APPROVED_DESTINATION', opportunity_id: row.opportunity_id,
        amount_minor: integer(row.gross_amount_minor), fee_minor: integer(row.fee_minor),
        destination_id: row.destination_id, receipt_id: row.receipt_id, reconciled: row.reconciled === 1
      };
    },

    async reserve(idempotencyKey, { intent } = {}) {
      const operationId = `value-operation-${(await sha256(idempotencyKey)).slice(0, 32)}`;
      const result = await db.prepare(`INSERT OR IGNORE INTO matrix_value_operations(
        operation_id,opportunity_id,intent_type,provider_adapter_id,destination_id,asset,amount_minor,maximum_fee_minor,
        actual_fee_minor,status,idempotency_key,terms_hash,contract_id,receipt_id,created_at,updated_at
      ) VALUES(?,?,?,?,?,?,?,?,NULL,'created',?,?,?,NULL,?,?)`).bind(
        operationId, intent.opportunity_id, intent.intent_type, intent.provider_adapter_id, intent.destination_id,
        intent.asset, integer(intent.amount_minor), integer(intent.maximum_fee_minor), idempotencyKey,
        clean(intent.terms_hash, 128), intent.contract_id || null, now, now
      ).run();
      if (Number(result?.meta?.changes || 0) > 0) return { existing: false, terminal: false, operation_id: operationId };
      const existing = await db.prepare('SELECT operation_id,status,receipt_id FROM matrix_value_operations WHERE idempotency_key=? LIMIT 1').bind(idempotencyKey).first();
      return { existing: true, terminal: existing?.status === 'confirmed' && Boolean(existing?.receipt_id), operation_id: existing?.operation_id, state: existing?.status === 'confirmed' ? 'SWEPT_TO_APPROVED_DESTINATION' : undefined };
    },

    async put(idempotencyKey, receipt) {
      const operation = await db.prepare('SELECT operation_id,asset,amount_minor,maximum_fee_minor,destination_id FROM matrix_value_operations WHERE idempotency_key=? LIMIT 1').bind(idempotencyKey).first();
      if (!operation) throw new Error('Reserved value operation is missing');
      const gross = Math.max(0, integer(receipt.amount_minor));
      const fee = Math.max(0, integer(receipt.fee_minor));
      if (fee > gross || fee > integer(operation.maximum_fee_minor)) throw new Error('Provider receipt exceeds the approved fee boundary');
      const receiptId = `value-receipt-${(await sha256(`${idempotencyKey}:${receipt.provider_receipt_reference}`)).slice(0, 32)}`;
      const safeReceipt = {
        provider_receipt_reference: clean(receipt.provider_receipt_reference, 240),
        claim_receipt_id: clean(receipt.claim_receipt_id, 160), sweep_receipt_id: clean(receipt.sweep_receipt_id, 160) || null,
        confirmation_count: Math.max(0, integer(receipt.confirmation_count)), reconciled: receipt.reconciled === true
      };
      await db.prepare(`INSERT OR IGNORE INTO matrix_value_receipts(
        receipt_id,operation_id,provider_receipt_reference,asset,gross_amount_minor,fee_minor,net_amount_minor,destination_id,
        confirmation_count,reconciled,received_at,reconciled_at,receipt_json
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
        receiptId, operation.operation_id, safeReceipt.provider_receipt_reference, operation.asset, gross, fee, gross - fee,
        operation.destination_id, safeReceipt.confirmation_count, safeReceipt.reconciled ? 1 : 0,
        clean(receipt.received_at, 50) || now, safeReceipt.reconciled ? now : null, JSON.stringify(safeReceipt)
      ).run();
      await db.prepare(`UPDATE matrix_value_operations SET actual_fee_minor=?,status='confirmed',receipt_id=?,updated_at=? WHERE operation_id=?`).bind(
        fee, receiptId, now, operation.operation_id
      ).run();
      return { receipt_id: receiptId };
    }
  };
}

async function auditCollectionTransitions(db, queue, result, now) {
  for (const [index, transition] of (result.transitions || []).entries()) {
    const auditKey = `${queue.idempotency_key}:transition:${index}:${transition.from}:${transition.to}`;
    await db.prepare(`INSERT OR IGNORE INTO matrix_value_audit(
      audit_id,opportunity_id,event_type,from_state,to_state,actor,reason_json,evidence_json,idempotency_key,created_at
    ) VALUES(?,?,?,?,?,'matrix-value-collector',?,?,?,?)`).bind(
      `value-audit-${(await sha256(auditKey)).slice(0, 32)}`, queue.opportunity_id, 'value.collection.transition',
      transition.from, transition.to, JSON.stringify([]), JSON.stringify({ receipt_id: clean(transition.receipt?.receipt_id, 160) || null }), auditKey, now
    ).run();
  }
}

async function processClaimQueue(db, {
  mandate, providers, signer, approvedContracts = [], autoCollectionEnabled = true, now, limit = 25
} = {}) {
  const registry = collectionProviderRegistry(providers);
  const installedCollectionAdapters = registry.approvedAdapterIds();
  const queueRows = await rows(db.prepare(`SELECT queue_id,opportunity_id,intent_type,status,idempotency_key,attempts,next_attempt_at
    FROM matrix_value_claim_queue WHERE status IN ('queued','failed') AND (next_attempt_at IS NULL OR next_attempt_at<=?)
    ORDER BY created_at LIMIT ?`).bind(now, Math.max(1, Math.min(100, integer(limit, 25)))));
  const candidates = new Map((await opportunityRows(db)).map(candidate => [candidate.opportunity_id, candidate]));
  const processed = [];
  const failures = [];
  for (const queue of queueRows) {
    const leased = await db.prepare(`UPDATE matrix_value_claim_queue SET status='leased',attempts=attempts+1,updated_at=?
      WHERE queue_id=? AND status IN ('queued','failed')`).bind(now, queue.queue_id).run();
    if (Number(leased?.meta?.changes || 0) < 1) continue;
    const attempts = integer(queue.attempts) + 1;
    const candidate = candidates.get(queue.opportunity_id);
    if (!candidate) {
      await db.prepare("UPDATE matrix_value_claim_queue SET status='blocked',last_error='opportunity-not-collectible',updated_at=? WHERE queue_id=?").bind(now, queue.queue_id).run();
      failures.push({ opportunity_id: queue.opportunity_id, reason: 'opportunity-not-collectible' });
      continue;
    }
    try {
      const input = evaluationInput(candidate, { autoCollectionEnabled, installedCollectionAdapters });
      input.idempotency_key = queue.idempotency_key;
      input.claim_intent_type = queue.intent_type;
      const result = await collectProvenValue(input, {
        mandate, providers: registry, ledger: collectionLedger(db, now), signer, approvedContracts, now
      });
      await auditCollectionTransitions(db, queue, result, now);
      const nextState = result.state || candidate.state;
      const operationStatus = operationStatusForValueState(nextState);
      await db.prepare('UPDATE matrix_value_operations SET status=?,updated_at=? WHERE idempotency_key=?').bind(operationStatus, now, queue.idempotency_key).run();
      if (candidate.state !== nextState) await db.prepare('UPDATE matrix_value_opportunities SET state=?,updated_at=? WHERE opportunity_id=?').bind(nextState, now, queue.opportunity_id).run();
      let queueStatus = 'completed';
      let retryAt = null;
      if (['CLAIM_SUBMITTED', 'CLAIM_ACCEPTED', 'PAYMENT_PENDING'].includes(nextState)) { queueStatus = attempts >= 8 ? 'blocked' : 'failed'; retryAt = queueStatus === 'failed' ? nextAttemptAt(now, attempts) : null; }
      if (['AUTOMATION_NOT_PERMITTED', 'OWNER_APPROVAL_REQUIRED', 'FRAUD_BLOCKED'].includes(nextState)) queueStatus = 'blocked';
      await db.prepare('UPDATE matrix_value_claim_queue SET status=?,next_attempt_at=?,last_error=?,updated_at=? WHERE queue_id=?').bind(
        queueStatus, retryAt, queueStatus === 'failed' ? `provider-state:${nextState}` : null, now, queue.queue_id
      ).run();
      processed.push({ opportunity_id: queue.opportunity_id, state: nextState, queue_status: queueStatus, duplicate: result.duplicate === true, collected: result.collected === true });
    } catch (error) {
      const reason = clean(error?.message || error, 500);
      const queueStatus = attempts >= 8 ? 'blocked' : 'failed';
      await db.prepare('UPDATE matrix_value_claim_queue SET status=?,next_attempt_at=?,last_error=?,updated_at=? WHERE queue_id=?').bind(
        queueStatus, queueStatus === 'failed' ? nextAttemptAt(now, attempts) : null, reason, now, queue.queue_id
      ).run();
      failures.push({ opportunity_id: queue.opportunity_id, reason });
    }
  }
  return {
    installed_collection_adapters: installedCollectionAdapters,
    leased: queueRows.length, processed, failures,
    submitted: processed.filter(item => ['CLAIM_SUBMITTED', 'CLAIM_ACCEPTED', 'PAYMENT_PENDING', 'RECEIVED', 'SWEPT_TO_APPROVED_DESTINATION'].includes(item.state)).length,
    received: processed.filter(item => ['RECEIVED', 'SWEPT_TO_APPROVED_DESTINATION'].includes(item.state) && item.collected).length
  };
}

async function generateValueCodeImprovements(db, now) {
  const candidates = await rows(db.prepare(`SELECT o.opportunity_id,o.source_id,o.provider_adapter_id,s.official_url,s.validated_terms_hash,s.metadata_json
    FROM matrix_value_opportunities o JOIN matrix_value_sources s ON s.source_id=o.source_id
    WHERE o.state='AUTOMATION_NOT_PERMITTED' AND o.provider_adapter_id IS NOT NULL
      AND json_extract(s.metadata_json,'$.collection_adapter_spec') IS NOT NULL
    ORDER BY o.priority_score DESC LIMIT 10`));
  const generated = [];
  const quarantined = [];
  for (const row of candidates) {
    const metadata = parseJson(row.metadata_json, {});
    const specification = {
      ...(metadata.collection_adapter_spec || {}), adapter_id: row.provider_adapter_id,
      official_url: row.official_url, validated_terms_hash: row.validated_terms_hash
    };
    const proposal = await buildValueCollectionAdapterCandidate(specification, { now: new Date(now) });
    const certification = certifyValueCollectionAdapterCandidate(proposal);
    if (!certification.certified) {
      quarantined.push({ opportunity_id: row.opportunity_id, adapter_id: row.provider_adapter_id, blockers: certification.blockers });
      continue;
    }
    await db.prepare(`INSERT OR IGNORE INTO matrix_value_improvement_proposals(
      proposal_id,source_id,opportunity_id,provider_adapter_id,target_path,official_host,source_code,source_sha256,state,
      blockers_json,test_report_json,immutable_boundaries_json,activation_allowed,generated_at,updated_at
    ) VALUES(?,?,?,?,?,?,?,?,'sandbox-candidate','[]',?,?,0,?,?)`).bind(
      proposal.proposal_id, row.source_id, row.opportunity_id, proposal.adapter_id, proposal.target_path, proposal.official_host,
      proposal.source_code, proposal.source_sha256, JSON.stringify(certification), JSON.stringify(proposal.immutable_boundaries), now, now
    ).run();
    generated.push({
      proposal_id: proposal.proposal_id, opportunity_id: row.opportunity_id, adapter_id: proposal.adapter_id,
      source_sha256: proposal.source_sha256, state: certification.state, activation_allowed: false
    });
  }
  return {
    evaluated: candidates.length, generated, quarantined,
    policy: 'Generated financial code is stored as a non-executable sandbox candidate. Live activation requires provider sandbox, reconciliation, repository CI and protected deployment gates.'
  };
}

async function refreshMeasuredLearning(db, now) {
  const measurements = await rows(db.prepare(`SELECT o.category,o.asset,
      COUNT(DISTINCT o.opportunity_id) AS evaluated_count,
      COUNT(DISTINCT CASE WHEN o.entitlement_proven=1 THEN o.opportunity_id END) AS entitlement_proven_count,
      COUNT(DISTINCT CASE WHEN o.state IN ('RECEIVED','SWEPT_TO_APPROVED_DESTINATION') THEN o.opportunity_id END) AS received_count,
      COALESCE((SELECT SUM(r.net_amount_minor) FROM matrix_value_receipts r
        JOIN matrix_value_operations op ON op.operation_id=r.operation_id
        JOIN matrix_value_opportunities ro ON ro.opportunity_id=op.opportunity_id
        WHERE r.reconciled=1 AND ro.category=o.category AND ro.asset=o.asset),0) AS received_net_minor
    FROM matrix_value_opportunities o GROUP BY o.category,o.asset`));
  for (const item of measurements) {
    const evaluated = integer(item.evaluated_count);
    const received = integer(item.received_count);
    const net = integer(item.received_net_minor);
    const successRate = evaluated ? received / evaluated : 0;
    const netPerEvaluation = evaluated ? net / evaluated : 0;
    const multiplier = Math.max(0.5, Math.min(3, 0.5 + successRate * 1.5 + Math.min(1, netPerEvaluation / 100000)));
    await db.prepare(`INSERT INTO matrix_value_learning(strategy_key,category,asset,evaluated_count,entitlement_proven_count,received_count,received_net_minor,success_rate,net_per_evaluation_minor,priority_multiplier,basis,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,'measured-reconciled-receipts-only',?)
      ON CONFLICT(strategy_key) DO UPDATE SET evaluated_count=excluded.evaluated_count,entitlement_proven_count=excluded.entitlement_proven_count,
      received_count=excluded.received_count,received_net_minor=excluded.received_net_minor,success_rate=excluded.success_rate,
      net_per_evaluation_minor=excluded.net_per_evaluation_minor,priority_multiplier=excluded.priority_multiplier,updated_at=excluded.updated_at`).bind(
      `${item.category}:${item.asset}`, item.category, item.asset, evaluated, integer(item.entitlement_proven_count), received, net,
      successRate, netPerEvaluation, multiplier, now
    ).run();
  }
  return measurements.length;
}

async function summary(db, installedCollectionAdapters = INSTALLED_COLLECTION_ADAPTERS) {
  const objective = await db.prepare("SELECT * FROM matrix_value_objectives WHERE status='active' ORDER BY created_at LIMIT 1").first();
  const sourceCounts = await db.prepare("SELECT COUNT(*) AS total,SUM(CASE WHEN source_status='active' THEN 1 ELSE 0 END) AS active FROM matrix_value_sources").first();
  const opportunityCounts = await rows(db.prepare('SELECT state,COUNT(*) AS count,COALESCE(SUM(amount_minor-fee_minor),0) AS net_minor FROM matrix_value_opportunities GROUP BY state ORDER BY state'));
  const received = await db.prepare("SELECT COALESCE(SUM(net_amount_minor),0) AS net_minor,COUNT(*) AS count FROM matrix_value_receipts WHERE reconciled=1 AND asset='EUR'").first();
  const claimantCounts = await db.prepare("SELECT COUNT(*) AS total,SUM(CASE WHEN enabled=1 AND authority_status='proven' AND identity_status='matched' THEN 1 ELSE 0 END) AS ready FROM matrix_value_claimants").first();
  const destinationCounts = await db.prepare('SELECT COUNT(*) AS total,SUM(CASE WHEN approved=1 AND active=1 THEN 1 ELSE 0 END) AS ready FROM matrix_value_destinations').first();
  const improvementCounts = await db.prepare("SELECT COUNT(*) AS total,SUM(CASE WHEN state='sandbox-candidate' THEN 1 ELSE 0 END) AS sandbox_candidates FROM matrix_value_improvement_proposals").first();
  const learning = await rows(db.prepare('SELECT strategy_key,evaluated_count,entitlement_proven_count,received_count,received_net_minor,success_rate,net_per_evaluation_minor,priority_multiplier,basis,updated_at FROM matrix_value_learning ORDER BY priority_multiplier DESC,received_net_minor DESC LIMIT 50'));
  return {
    target: objective ? { objective_id: objective.objective_id, currency: objective.target_currency, target_net_minor: objective.target_net_minor, received_net_minor: integer(received?.net_minor), remaining_net_minor: Math.max(0, integer(objective.target_net_minor) - integer(received?.net_minor)) } : null,
    sources: { total: integer(sourceCounts?.total), active_for_claims: integer(sourceCounts?.active) },
    claimants: { total: integer(claimantCounts?.total), authority_and_identity_ready: integer(claimantCounts?.ready) },
    destinations: { total: integer(destinationCounts?.total), approved_and_active: integer(destinationCounts?.ready) },
    code_improvements: { total: integer(improvementCounts?.total), sandbox_candidates: integer(improvementCounts?.sandbox_candidates), automatic_live_activation: false },
    installed_collection_adapters: installedCollectionAdapters,
    opportunities: opportunityCounts.map(item => ({ state: item.state, count: integer(item.count), net_minor: integer(item.net_minor) })),
    reconciled_receipts: { count: integer(received?.count), net_minor: integer(received?.net_minor) },
    learning: { strategy_count: learning.length, strategies: learning },
    truthful_status: installedCollectionAdapters.length ? 'collection-adapter-ready' : 'discovery-and-proof-operational-collection-adapter-required'
  };
}

async function capitalReceiptInputs(db) {
  return (await rows(db.prepare(`SELECT cr.capital_receipt_id,cr.source_class,cr.source_receipt_id,cr.external_reference,
      cr.asset,cr.net_amount_minor,cr.destination_id,cr.received_at,cr.reconciled_at,d.approved,d.active
    FROM matrix_capital_receipts cr JOIN matrix_value_destinations d ON d.destination_id=cr.destination_id
    WHERE cr.reconciled=1 ORDER BY cr.reconciled_at,cr.capital_receipt_id`))).map(item => ({
    sourceClass: item.source_class,
    sourceReceiptId: item.source_receipt_id,
    externalReference: item.external_reference,
    asset: item.asset,
    netAmountMinor: integer(item.net_amount_minor),
    destinationApproved: item.approved === 1 && item.active === 1,
    reconciled: true,
    receivedAt: item.received_at,
    reconciledAt: item.reconciled_at,
    capitalReceiptId: item.capital_receipt_id,
    destinationId: item.destination_id
  }));
}

async function capitalAdjustmentInputs(db) {
  return (await rows(db.prepare(`SELECT adjustment_id,source_class,source_record_id,external_reference,asset,amount_minor,
      capital_receipt_id,occurred_at,reconciled
    FROM matrix_capital_adjustments WHERE reconciled=1 ORDER BY occurred_at,adjustment_id`))).map(item => ({
    adjustmentId: item.adjustment_id,
    sourceClass: item.source_class,
    sourceRecordId: item.source_record_id,
    externalReference: item.external_reference,
    asset: item.asset,
    amountMinor: integer(item.amount_minor),
    capitalReceiptId: item.capital_receipt_id,
    occurredAt: item.occurred_at,
    reconciled: item.reconciled === 1
  }));
}

async function syncCapitalDestinations(db, now) {
  const result = await db.prepare(`INSERT OR IGNORE INTO matrix_capital_destination_registry(
      registry_id,destination_id,role,allowed_assets_json,exposure_limit_minor,approved,active,raw_credentials_stored,created_at,updated_at
    ) SELECT 'capital-destination-' || destination_id,destination_id,'COLLECTION',allowed_assets_json,0,approved,active,0,?,?
      FROM matrix_value_destinations WHERE approved=1 AND active=1`).bind(now, now).run();
  await db.prepare(`UPDATE matrix_capital_destination_registry SET approved=(SELECT approved FROM matrix_value_destinations d WHERE d.destination_id=matrix_capital_destination_registry.destination_id),
    active=(SELECT active FROM matrix_value_destinations d WHERE d.destination_id=matrix_capital_destination_registry.destination_id),updated_at=?`).bind(now).run();
  return Number(result?.meta?.changes || 0);
}

async function syncCapitalReceipts(db, now) {
  const claimResult = await db.prepare(`INSERT OR IGNORE INTO matrix_capital_receipts(
      capital_receipt_id,source_class,source_receipt_id,external_reference,asset,gross_amount_minor,cost_minor,net_amount_minor,
      eur_net_minor,conversion_evidence_json,destination_id,reconciled,received_at,reconciled_at,evidence_json,created_at
    ) SELECT 'capital-claim-' || r.receipt_id,'CLAIM_VALUE',r.receipt_id,r.provider_receipt_reference,r.asset,
      r.gross_amount_minor,r.fee_minor,r.net_amount_minor,r.net_amount_minor,'{"basis":"native-EUR-no-conversion"}',r.destination_id,1,
      r.received_at,COALESCE(r.reconciled_at,r.received_at),json_object('operation_id',r.operation_id,'receipt_only',1),?
    FROM matrix_value_receipts r JOIN matrix_value_destinations d ON d.destination_id=r.destination_id
    WHERE r.reconciled=1 AND r.asset='EUR' AND r.net_amount_minor>0 AND d.approved=1 AND d.active=1`).bind(now).run();
  const feeExpression = `COALESCE(
    json_extract(p.raw_resource_json,'$.seller_receivable_breakdown.paypal_fee.value'),
    json_extract(p.raw_resource_json,'$.purchase_units[0].payments.captures[0].seller_receivable_breakdown.paypal_fee.value')
  )`;
  const paypalResult = await db.prepare(`INSERT OR IGNORE INTO matrix_capital_receipts(
      capital_receipt_id,source_class,source_receipt_id,external_reference,asset,gross_amount_minor,cost_minor,net_amount_minor,
      eur_net_minor,conversion_evidence_json,destination_id,reconciled,received_at,reconciled_at,evidence_json,created_at
    ) SELECT 'capital-paypal-' || p.id,CASE WHEN p.payment_type='donation' THEN 'DONATION' ELSE 'DIRECT_REVENUE' END,p.id,
      p.provider_payment_id,'EUR',ROUND(CAST(p.gross_amount AS REAL)*100),ROUND(CAST(${feeExpression} AS REAL)*100),
      ROUND(CAST(p.gross_amount AS REAL)*100)-ROUND(CAST(${feeExpression} AS REAL)*100),
      ROUND(CAST(p.gross_amount AS REAL)*100)-ROUND(CAST(${feeExpression} AS REAL)*100),
      '{"basis":"native-EUR-PayPal-live-capture","fee_basis":"seller-receivable-breakdown"}',d.destination_id,1,p.paid_at,p.paid_at,
      json_object('provider','paypal','provider_event_id',p.provider_event_id,'environment',p.environment,'receipt_only',1,'fee_evidence_present',1),?
    FROM paypal_payment_records p
    JOIN matrix_value_destinations d ON d.destination_id=(
      SELECT destination_id FROM matrix_value_destinations
      WHERE approved=1 AND active=1 AND LOWER(COALESCE(provider_adapter_id,''))='paypal' AND allowed_assets_json LIKE '%"EUR"%'
      ORDER BY destination_id LIMIT 1
    )
    WHERE p.environment='live' AND p.payment_type IN ('sale','capture','donation') AND UPPER(p.status) IN ('COMPLETED','CAPTURED')
      AND UPPER(p.currency_code)='EUR' AND p.paid_at IS NOT NULL AND CAST(p.gross_amount AS REAL)>0
      AND ${feeExpression} IS NOT NULL
      AND ROUND(CAST(p.gross_amount AS REAL)*100)>ROUND(CAST(${feeExpression} AS REAL)*100)`).bind(now).run();
  const adjustmentResult = await db.prepare(`INSERT OR IGNORE INTO matrix_capital_adjustments(
      adjustment_id,source_class,source_record_id,external_reference,asset,amount_minor,eur_amount_minor,capital_receipt_id,
      reconciled,occurred_at,evidence_json,created_at
    ) SELECT 'capital-paypal-adjustment-' || p.id,CASE WHEN p.payment_type='refund' THEN 'REFUND' ELSE 'REVERSAL' END,p.id,
      p.provider_event_id,'EUR',ROUND(CAST(COALESCE(p.refund_amount,p.gross_amount) AS REAL)*100),
      ROUND(CAST(COALESCE(p.refund_amount,p.gross_amount) AS REAL)*100),NULL,1,
      COALESCE(p.refunded_at,p.reversed_at,p.updated_at),
      json_object('provider','paypal','environment',p.environment,'provider_payment_id',p.provider_payment_id,'reconciled_adjustment',1),?
    FROM paypal_payment_records p
    WHERE p.environment='live' AND p.payment_type IN ('refund','reversal') AND UPPER(p.currency_code)='EUR'
      AND CAST(COALESCE(p.refund_amount,p.gross_amount) AS REAL)>0
      AND EXISTS(SELECT 1 FROM matrix_capital_receipts WHERE source_class IN ('DONATION','DIRECT_REVENUE'))`).bind(now).run();
  const bountyTable = await db.prepare("SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name='matrix_bounty_receipts'").first();
  let bountyChanges = 0;
  if (integer(bountyTable?.count) === 1) {
    const bountyResult = await db.prepare(`INSERT OR IGNORE INTO matrix_capital_receipts(
        capital_receipt_id,source_class,source_receipt_id,external_reference,asset,gross_amount_minor,cost_minor,net_amount_minor,
        eur_net_minor,conversion_evidence_json,destination_id,reconciled,received_at,reconciled_at,evidence_json,created_at
      ) SELECT 'capital-bounty-' || r.bounty_receipt_id,'BOUNTY',r.bounty_receipt_id,r.provider_receipt_reference,r.asset,
        r.gross_amount_minor,r.fee_minor,r.net_amount_minor,r.eur_net_minor,r.conversion_evidence_json,r.destination_id,1,
        r.received_at,r.reconciled_at,json_object('bounty_id',r.bounty_id,'submission_id',r.submission_id,'receipt_only',1),?
      FROM matrix_bounty_receipts r JOIN matrix_value_destinations d ON d.destination_id=r.destination_id
      WHERE r.reconciled=1 AND r.eur_net_minor>0 AND d.approved=1 AND d.active=1`).bind(now).run();
    bountyChanges = Number(bountyResult?.meta?.changes || 0);
  }
  const waitingForFee = await db.prepare(`SELECT COUNT(*) count FROM paypal_payment_records p
    WHERE p.environment='live' AND p.payment_type IN ('sale','capture','donation') AND UPPER(p.status) IN ('COMPLETED','CAPTURED')
      AND UPPER(p.currency_code)='EUR' AND p.paid_at IS NOT NULL AND CAST(p.gross_amount AS REAL)>0 AND ${feeExpression} IS NULL`).first();
  return {
    claim_receipts: Number(claimResult?.meta?.changes || 0),
    paypal_live_receipts: Number(paypalResult?.meta?.changes || 0),
    paypal_adjustments: Number(adjustmentResult?.meta?.changes || 0),
    bounty_receipts: bountyChanges,
    paypal_live_completed_waiting_for_fee_evidence: integer(waitingForFee?.count)
  };
}

async function persistCapitalMilestones(db, status, receipts, now) {
  let cumulative = integer(status.baseline_net_minor);
  let previous = cumulative;
  let inserted = 0;
  for (const receipt of receipts) {
    previous = cumulative;
    cumulative += integer(receipt.netAmountMinor);
    for (const milestone of [100, 1000, 10000, 100000, 1000000, 10000000, 100000000]) {
      if (previous >= milestone || cumulative < milestone) continue;
      const result = await db.prepare(`INSERT OR IGNORE INTO matrix_capital_milestone_receipts(
        milestone_receipt_id,challenge_id,milestone_minor,crossed_by_capital_receipt_id,cumulative_net_minor,crossed_at,evidence_json
      ) VALUES(?,'matrix-capital-challenge-eur-v1',?,?,?,?,?)`).bind(
        `milestone-eur-${milestone}`, milestone, receipt.capitalReceiptId, cumulative, receipt.reconciledAt || now,
        JSON.stringify({ source_class: receipt.sourceClass, source_receipt_id: receipt.sourceReceiptId, external_reference: receipt.externalReference, receipt_only: true })
      ).run();
      inserted += Number(result?.meta?.changes || 0);
    }
  }
  return inserted;
}

async function persistCapitalHypotheses(db, now) {
  const revenue = new RevenueCreationDirector().invent({
    assets: ['Matrix evidence briefs', 'Matrix public investigations', 'Matrix downloadable research packs'],
    capabilities: ['evidence synthesis', 'citation verification', 'public-interest research'],
    audiences: ['researchers and readers'],
    problems: ['slow source verification', 'fragmented public evidence']
  }, now);
  const novel = new NovelOpportunityDirector().discover({
    assets: ['public evidence corpus', 'investigation templates', 'daily intelligence updates'],
    capabilities: ['source synthesis', 'structured timelines', 'citation checking'],
    audiences: ['journalists', 'researchers', 'supporters'],
    problems: ['verification cost', 'fragmented records', 'research update burden']
  }, now);
  const opportunities = [...revenue, ...novel];
  for (const opportunity of opportunities) {
    await db.prepare(`INSERT OR IGNORE INTO matrix_capital_opportunities(
      opportunity_id,challenge_id,opportunity_type,taxonomy_version,priority_lane,title,state,next_action,policy_class,
      method_authorized,destination_ready,evidence_ready,estimated_gross_minor,estimated_cost_minor,expected_net_minor,
      success_probability_ppm,source_json,blockers_json,created_at,updated_at
    ) VALUES(?,'matrix-capital-challenge-eur-v1',?,1,'P2_DIRECT_REVENUE',?,'HYPOTHESIS',?,'METHOD_PERMISSION_REQUIRED',0,0,0,0,0,0,0,?,'["real-demand-evidence-required","approved-revenue-adapter-required"]',?,?)`).bind(
      opportunity.opportunity_id, opportunity.opportunity_type,
      clean(opportunity.title || Object.values(opportunity.combination || {}).join(' + '), 500) || opportunity.opportunity_id,
      opportunity.next_action, JSON.stringify(opportunity), now, now
    ).run();
  }
  const graph = new MatrixOpportunityGraph().build(novel);
  for (const node of graph.nodes) {
    await db.prepare(`INSERT INTO matrix_opportunity_graph_nodes(node_id,node_type,label,evidence_state,metadata_json,updated_at)
      VALUES(?,?,?,?,?,?) ON CONFLICT(node_id) DO UPDATE SET node_type=excluded.node_type,label=excluded.label,
      evidence_state=excluded.evidence_state,metadata_json=excluded.metadata_json,updated_at=excluded.updated_at`).bind(
      node.node_id, node.node_type, node.node_id, node.state, JSON.stringify(node), now
    ).run();
  }
  for (const edge of graph.edges) {
    await db.prepare(`INSERT INTO matrix_opportunity_graph_edges(edge_id,from_node_id,to_node_id,relationship,evidence_state,metadata_json,updated_at)
      VALUES(?,?,?,?,?,?,?) ON CONFLICT(edge_id) DO UPDATE SET relationship=excluded.relationship,evidence_state=excluded.evidence_state,
      metadata_json=excluded.metadata_json,updated_at=excluded.updated_at`).bind(
      edge.edge_id, edge.from_node_id, edge.to_node_id, edge.relationship, edge.evidence_state, JSON.stringify(edge), now
    ).run();
  }
  return { opportunities: opportunities.length, graph_nodes: graph.nodes.length, graph_edges: graph.edges.length, hypotheses_are_not_value: true };
}

async function capitalStatus(db) {
  const challenge = await db.prepare("SELECT * FROM matrix_capital_challenges WHERE challenge_id='matrix-capital-challenge-eur-v1'").first();
  const milestones = await rows(db.prepare('SELECT milestone_minor,cumulative_net_minor,crossed_at,crossed_by_capital_receipt_id FROM matrix_capital_milestone_receipts ORDER BY milestone_minor'));
  const receipts = await rows(db.prepare('SELECT capital_receipt_id,source_class,source_receipt_id,external_reference,asset,gross_amount_minor,cost_minor,net_amount_minor,eur_net_minor,destination_id,reconciled,received_at,reconciled_at FROM matrix_capital_receipts ORDER BY reconciled_at DESC LIMIT 100'));
  const adjustments = await rows(db.prepare('SELECT adjustment_id,source_class,source_record_id,external_reference,asset,amount_minor,eur_amount_minor,capital_receipt_id,reconciled,occurred_at FROM matrix_capital_adjustments ORDER BY occurred_at DESC LIMIT 100'));
  const opportunityCounts = await rows(db.prepare('SELECT state,COUNT(*) count FROM matrix_capital_opportunities GROUP BY state ORDER BY state'));
  return {
    challenge,
    milestones,
    receipts,
    adjustments,
    opportunities: opportunityCounts.map(item => ({ state: item.state, count: integer(item.count) })),
    truthful_status: challenge?.operational_claim_allowed === 1 ? 'first-real-euro-receipt-proven' : 'awaiting-first-real-euro-receipt'
  };
}

async function runCapitalChallengeCycle(env, { valueCycleId, trigger = 'value-cycle', now = new Date().toISOString() } = {}) {
  const db = env.MEMBERS_DB;
  if (!enabled(env.MATRIX_CAPITAL_CHALLENGE_ENABLED, true)) return { enabled: false, skipped: true, reason: 'capital-challenge-disabled' };
  await syncCapitalDestinations(db, now);
  const importedReceipts = await syncCapitalReceipts(db, now);
  const receiptInputs = await capitalReceiptInputs(db);
  const adjustmentInputs = await capitalAdjustmentInputs(db);
  const current = await db.prepare("SELECT baseline_net_minor FROM matrix_capital_challenges WHERE challenge_id='matrix-capital-challenge-eur-v1'").first();
  const status = new MatrixCapitalChallenge().summarize(receiptInputs, { baselineEurMinor: integer(current?.baseline_net_minor), adjustments: adjustmentInputs, now });
  const first = receiptInputs[0] || null;
  await db.prepare(`UPDATE matrix_capital_challenges SET received_net_minor=?,next_milestone_minor=?,state=?,first_real_receipt_id=?,
    operational_claim_allowed=?,updated_at=? WHERE challenge_id='matrix-capital-challenge-eur-v1'`).bind(
    status.received_net_minor, status.next_milestone_minor, status.state, status.first_real_euro_received ? first?.capitalReceiptId : null,
    status.operational_claim_allowed ? 1 : 0, now
  ).run();
  const milestonesRecorded = await persistCapitalMilestones(db, status, receiptInputs, now);
  const discovery = await persistCapitalHypotheses(db, now);
  const open = await db.prepare("SELECT COUNT(*) count FROM matrix_capital_opportunities WHERE state IN ('HYPOTHESIS','VERIFYING','READY_FOR_BOUNDED_TEST','ACTIVE','WAIT','OWNER_ACTION_REQUIRED')").first();
  const activeExperiments = await db.prepare("SELECT COUNT(*) count FROM matrix_acquisition_experiments WHERE state IN ('READY_FOR_BOUNDED_TEST','RUNNING')").first();
  const velocity = acquisitionVelocity(receiptInputs, { windowDays: 30, adjustments: adjustmentInputs });
  const forecast = capitalForecast(status, velocity);
  const watchdog = new CapitalChallengeWatchdog().assess({ status, openOpportunities: integer(open?.count), activeExperiments: integer(activeExperiments?.count), lastReceiptAt: receiptInputs.at(-1)?.reconciledAt || null });
  const report = {
    status, imported_receipts: importedReceipts, milestones_recorded: milestonesRecorded, discovery, velocity, forecast, watchdog,
    financial_execution_enabled: enabled(env.MATRIX_CAPITAL_FINANCIAL_EXECUTION_ENABLED, false),
    automatic_spending: false,
    receipt_only_accounting: true,
    policy: 'Explore every lawful authorized zero-spend-first route; execute financial methods only through method-specific gates and count only reconciled receipts at approved destinations.'
  };
  const capitalCycleId = `capital-${valueCycleId || `${now.slice(0, 10)}-${id(trigger, 'cycle')}`}`;
  await db.prepare(`INSERT INTO matrix_capital_cycles(capital_cycle_id,value_cycle_id,trigger_name,status,received_net_minor,next_milestone_minor,velocity_json,forecast_json,watchdog_json,report_json,started_at,completed_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(capital_cycle_id) DO UPDATE SET status=excluded.status,received_net_minor=excluded.received_net_minor,
    next_milestone_minor=excluded.next_milestone_minor,velocity_json=excluded.velocity_json,forecast_json=excluded.forecast_json,
    watchdog_json=excluded.watchdog_json,report_json=excluded.report_json,completed_at=excluded.completed_at`).bind(
    capitalCycleId, valueCycleId || null, clean(trigger, 100), watchdog.stalled ? 'completed_with_findings' : 'completed',
    status.received_net_minor, status.next_milestone_minor, JSON.stringify(velocity), JSON.stringify(forecast), JSON.stringify(watchdog), JSON.stringify(report), now, now
  ).run();
  if (status.first_real_euro_received && first) {
    await db.prepare(`UPDATE matrix_acceptance_receipts SET state='LIVE_VERIFIED',first_real_receipt=1,external_receipt_reference=?,
      result_json=?,after_json=?,net_value_minor=?,evidence_json=?,verified_at=? WHERE receipt_id='acceptance-value'`).bind(
      first.externalReference, JSON.stringify({ capital_challenge: status.state }), JSON.stringify(status), status.received_net_minor,
      JSON.stringify({ source_receipt_id: first.sourceReceiptId, destination_id: first.destinationId, reconciled: true }), now
    ).run();
    await db.prepare(`UPDATE matrix_system_components SET state='LIVE_WORKING',reliability=1,blocker=NULL,last_verified_at=?,updated_at=?,
      health_evidence_json=? WHERE component_id='matrix-capital-challenge'`).bind(
      now, now, JSON.stringify([capitalCycleId, first.capitalReceiptId])
    ).run();
  }
  return report;
}

export async function runValueHunterCycle(env, { trigger = 'manual', clock, providers, signer, approvedContracts = [] } = {}) {
  if (!(await schemaReady(env))) return { ok: false, skipped: true, reason: 'value-hunter-schema-unavailable' };
  if (!enabled(env.MATRIX_VALUE_HUNTER_ENABLED, true)) return { ok: true, skipped: true, reason: 'value-hunter-disabled' };
  if (!enabled(env.AI_RESOURCE_ZERO_SPEND_LOCK, true)) return { ok: false, skipped: true, reason: 'zero-spend-lock-required' };
  const db = env.MEMBERS_DB;
  const startedAt = (clock?.() || new Date()).toISOString();
  const cycleId = `value-cycle-${startedAt.slice(0, 10)}-${id(trigger, 'manual')}`;
  const existing = await db.prepare("SELECT report_json FROM matrix_value_cycles WHERE cycle_id=? AND status IN ('completed','completed-with-findings') LIMIT 1").bind(cycleId).first();
  if (existing) return { ok: true, reused: true, report: parseJson(existing.report_json, {}) };
  await db.prepare(`INSERT INTO matrix_value_cycles(cycle_id,trigger_name,status,started_at)
    VALUES(?,?,'running',?) ON CONFLICT(cycle_id) DO UPDATE SET status='running',started_at=excluded.started_at,completed_at=NULL`).bind(cycleId, clean(trigger, 100), startedAt).run();
  const mandate = await activeMandate(db);
  const autoCollectionEnabled = enabled(env.MATRIX_VALUE_AUTO_COLLECTION_ENABLED, true);
  const providerRegistry = collectionProviderRegistry(providers);
  const installedCollectionAdapters = providerRegistry.approvedAdapterIds();
  const discovery = await discoverOfficialPublicValueLeads(db, { now: startedAt });
  const candidates = await opportunityRows(db);
  const decisions = [];
  const failures = [];
  const codeImprovements = enabled(env.MATRIX_VALUE_CODE_IMPROVEMENT_ENABLED, true)
    ? await generateValueCodeImprovements(db, startedAt)
    : { evaluated: 0, generated: [], quarantined: [], disabled: true };
  for (const candidate of candidates) {
    try {
      decisions.push(await recordDecision(
        db, candidate,
        evaluateValueOpportunity(evaluationInput(candidate, { autoCollectionEnabled, installedCollectionAdapters }), { mandate, now: startedAt }),
        startedAt, installedCollectionAdapters
      ));
    }
    catch (error) { failures.push({ opportunity_id: candidate.opportunity_id, error: clean(error?.message || error, 500) }); }
  }
  const collection = await processClaimQueue(db, {
    mandate, providers: providerRegistry, signer, approvedContracts, autoCollectionEnabled, now: startedAt
  });
  failures.push(...collection.failures.map(item => ({ opportunity_id: item.opportunity_id, error: item.reason })));
  const learnedStrategies = await refreshMeasuredLearning(db, startedAt);
  const status = await summary(db, installedCollectionAdapters);
  const completedAt = (clock?.() || new Date()).toISOString();
  const capital = await runCapitalChallengeCycle(env, { valueCycleId: cycleId, trigger, now: completedAt });
  const report = {
    cycle_id: cycleId, trigger, started_at: startedAt, completed_at: completedAt,
    objective: status.target, discovery, evaluated: decisions.length, learned_strategies: learnedStrategies,
    ready_to_claim: decisions.filter(item => item.state === 'READY_TO_CLAIM').length,
    blocked_or_manual: decisions.filter(item => ['AUTOMATION_NOT_PERMITTED', 'OWNER_APPROVAL_REQUIRED', 'FRAUD_BLOCKED'].includes(item.state)).length,
    submitted_this_cycle: collection.submitted, received_this_cycle: collection.received,
    code_improvements: codeImprovements, collection, failures, status, capital,
    auto_collection_enabled: autoCollectionEnabled,
    policy: 'Automatically collect any registered claimant legal entitlement only after deterministic proof, current official rules, approved destination and constrained adapter checks pass. LLM confidence is never entitlement proof.'
  };
  await db.prepare(`UPDATE matrix_value_cycles SET status=?,received_net_minor=?,discovered_count=?,evaluated_count=?,ready_count=?,submitted_count=?,received_count=?,blocked_count=?,report_json=?,completed_at=? WHERE cycle_id=?`).bind(
    failures.length || discovery.failures.length ? 'completed-with-findings' : 'completed',
    status.reconciled_receipts.net_minor, discovery.discovered, decisions.length, report.ready_to_claim,
    collection.submitted, collection.received, report.blocked_or_manual, JSON.stringify(report), completedAt, cycleId
  ).run();
  await db.prepare(`UPDATE matrix_capabilities SET structural_checks_passed=1,dependencies_reachable=1,data_connected=1,evidence_ready=1,
    live_verification_passed=?,state=?,blocker=?,checked_at=?,evidence_json=? WHERE capability_id='matrix-value-hunter'`).bind(
    installedCollectionAdapters.length ? 1 : 0,
    installedCollectionAdapters.length ? 'live_verified' : 'evidence_ready',
    installedCollectionAdapters.length ? null : 'No constrained live financial provider adapter is installed; discovery and entitlement evaluation continue.',
    completedAt, JSON.stringify({ cycle_id: cycleId, target_net_eur: 10000, decisions: decisions.length, failures: failures.length, collection_adapters: installedCollectionAdapters })
  ).run();
  await emitMatrixSystemEvent(env, {
    eventType: 'value.cycle.completed', auditIdentifier: cycleId, origin: 'matrix-value-hunter', actor: 'lawful-value-cycle',
    payload: { change_summary: `Value Hunter discovered ${discovery.discovered} new official lead(s), evaluated ${decisions.length} candidate(s), and found ${report.ready_to_claim} that passed every automatic-collection gate.`, target_net_eur: 10000, received_net_minor: status.reconciled_receipts.net_minor, failure_count: failures.length + discovery.failures.length }
  });
  return { ok: true, reused: false, report, decisions };
}

async function readBody(request) {
  let body;
  try { body = await request.json(); } catch { throw new Error('Request body must be valid JSON'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Request body must be an object');
  if (containsSensitiveMaterial(body)) throw new Error('Secrets and raw identity/banking data are forbidden; submit only vault references and hashes');
  return body;
}

async function registerClaimant(db, body, now) {
  const claimantId = id(body.claimant_id || body.claimantId);
  const vaultReference = clean(body.identity_vault_reference || body.identityVaultReference, 300);
  if (!claimantId || !clean(body.display_label || body.displayLabel, 200) || !vaultReference.startsWith('vault://')) throw new Error('claimant_id, display_label and a vault:// identity reference are required');
  const authority = clean(body.authority_status || body.authorityStatus, 40);
  const identity = clean(body.identity_status || body.identityStatus, 40);
  if (!['unverified', 'proven', 'revoked'].includes(authority) || !['unmatched', 'matched', 'expired'].includes(identity)) throw new Error('Invalid claimant authority or identity status');
  await db.prepare(`INSERT INTO matrix_value_claimants(claimant_id,display_label,authority_status,identity_status,identity_vault_reference,jurisdictions_json,enabled,created_at,updated_at)
    VALUES(?,?,?,?,?,?,1,?,?) ON CONFLICT(claimant_id) DO UPDATE SET display_label=excluded.display_label,authority_status=excluded.authority_status,
    identity_status=excluded.identity_status,identity_vault_reference=excluded.identity_vault_reference,jurisdictions_json=excluded.jurisdictions_json,enabled=1,updated_at=excluded.updated_at`).bind(
    claimantId, clean(body.display_label || body.displayLabel, 200), authority, identity, vaultReference,
    JSON.stringify(Array.isArray(body.jurisdictions) ? body.jurisdictions.map(item => id(item)).filter(Boolean).slice(0, 50) : []), now, now
  ).run();
  return { claimant_id: claimantId, registered: true, stores_raw_identity: false };
}

async function registerDestination(db, body, now) {
  const destinationId = id(body.destination_id || body.destinationId);
  const claimantId = id(body.claimant_id || body.claimantId);
  const vaultReference = clean(body.destination_vault_reference || body.destinationVaultReference, 300);
  const type = clean(body.destination_type || body.destinationType, 50);
  if (!destinationId || !claimantId || !vaultReference.startsWith('vault://') || !['bank-account', 'payment-account', 'custodial-wallet', 'self-custody-wallet'].includes(type)) throw new Error('A valid destination, claimant, type and vault:// destination reference are required');
  const fingerprint = clean(body.public_identifier_hash || body.publicIdentifierHash, 128);
  if (!/^[a-f0-9]{64}$/i.test(fingerprint)) throw new Error('A SHA-256 public identifier hash is required');
  const assets = Array.isArray(body.allowed_assets || body.allowedAssets) ? (body.allowed_assets || body.allowedAssets).map(item => clean(item, 30)).filter(Boolean).slice(0, 50) : [];
  const intents = Array.isArray(body.allowed_intents || body.allowedIntents) ? (body.allowed_intents || body.allowedIntents).filter(item => VALUE_INTENT_TYPES.includes(item)) : VALUE_INTENT_TYPES;
  await db.prepare(`INSERT INTO matrix_value_destinations(destination_id,claimant_id,destination_type,destination_vault_reference,public_identifier_hash,allowed_assets_json,allowed_intents_json,provider_adapter_id,approved,active,approved_by_owner_at,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,1,1,?,?,?) ON CONFLICT(destination_id) DO UPDATE SET claimant_id=excluded.claimant_id,destination_type=excluded.destination_type,
    destination_vault_reference=excluded.destination_vault_reference,public_identifier_hash=excluded.public_identifier_hash,allowed_assets_json=excluded.allowed_assets_json,
    allowed_intents_json=excluded.allowed_intents_json,provider_adapter_id=excluded.provider_adapter_id,approved=1,active=1,approved_by_owner_at=excluded.approved_by_owner_at,updated_at=excluded.updated_at`).bind(
    destinationId, claimantId, type, vaultReference, fingerprint, JSON.stringify(assets), JSON.stringify(intents), clean(body.provider_adapter_id || body.providerAdapterId, 160) || null, now, now, now
  ).run();
  return { destination_id: destinationId, approved: true, stores_raw_destination: false };
}

async function registerOpportunity(db, body, now) {
  const opportunityId = id(body.opportunity_id || body.opportunityId);
  const category = clean(body.category, 80);
  const legalBasis = clean(body.legal_basis || body.legalBasis, 80);
  const sourceId = id(body.source_id || body.sourceId);
  const jurisdictionId = id(body.jurisdiction_id || body.jurisdictionId);
  const idempotencyKey = clean(body.idempotency_key || body.idempotencyKey, 200);
  const amount = integer(body.amount_minor ?? body.amountMinor, -1);
  const fee = integer(body.fee_minor ?? body.feeMinor, 0);
  if (!opportunityId || !sourceId || !jurisdictionId || !LEGAL_BASES.includes(legalBasis) || !idempotencyKey || amount < 0 || fee < 0 || fee > amount) throw new Error('Opportunity identifiers, legal basis, idempotency key and valid minor-unit amounts are required');
  const source = await db.prepare('SELECT jurisdiction_id,official_url,metadata_json FROM matrix_value_sources WHERE source_id=? LIMIT 1').bind(sourceId).first();
  if (!source || source.jurisdiction_id !== jurisdictionId) throw new Error('Opportunity source and jurisdiction are not registered together');
  const sourceMetadata = parseJson(source.metadata_json, {});
  let evidenceHost = clean(sourceMetadata.allowed_host, 300).toLowerCase();
  if (!evidenceHost) {
    try { evidenceHost = new URL(source.official_url).hostname.toLowerCase(); } catch { throw new Error('Registered source URL is invalid'); }
  }
  const evidence = [];
  for (const item of Array.isArray(body.evidence) ? body.evidence.slice(0, 50) : []) {
    const evidenceId = id(item.evidence_id || item.evidenceId);
    const digest = clean(item.content_sha256 || item.contentSha256, 64);
    const url = clean(item.source_url || item.sourceUrl, 1500);
    let evidenceUrl;
    try { evidenceUrl = new URL(url); } catch { continue; }
    if (!evidenceId || evidenceUrl.protocol !== 'https:' || !allowedOfficialHost(evidenceUrl.hostname, evidenceHost) || !/^[a-f0-9]{64}$/i.test(digest)) continue;
    evidence.push({
      evidenceId, evidenceType: clean(item.evidence_type || item.evidenceType, 80) || 'official-record', url, digest,
      establishes: clean(item.establishes, 1200), authorityVerified: item.authority_verified === true,
      identityMatchVerified: item.identity_match_verified === true, ownershipVerified: item.ownership_verified === true,
      retrievedAt: clean(item.retrieved_at || item.retrievedAt, 50) || now
    });
  }
  const entitlementProven = (body.entitlement_proven === true || body.entitlementProven === true) &&
    evidence.some(item => item.establishes && item.authorityVerified && item.identityMatchVerified && item.ownershipVerified);
  const decisionSeed = {
    human_requirements: Array.isArray(body.human_requirements || body.humanRequirements) ? (body.human_requirements || body.humanRequirements).map(item => clean(item, 100)).slice(0, 30) : [],
    security: body.security && typeof body.security === 'object' ? body.security : {},
    provenance: clean(body.provenance, 1000)
  };
  await db.prepare(`INSERT OR IGNORE INTO matrix_value_opportunities(opportunity_id,objective_id,source_id,jurisdiction_id,claimant_id,destination_id,category,title,legal_basis,state,asset,amount_minor,fee_minor,entitlement_proven,provider_adapter_id,contract_id,expires_at,priority_score,idempotency_key,decision_json,discovered_at,updated_at)
    VALUES(?,'value-milestone-eur-10000',?,?,?,?,?,?,?,'DISCOVERED',?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
    opportunityId, sourceId, jurisdictionId, id(body.claimant_id || body.claimantId) || null, id(body.destination_id || body.destinationId) || null,
    category || legalBasis, clean(body.title, 300) || opportunityId, legalBasis, clean(body.asset || 'EUR', 30), amount, fee,
    entitlementProven ? 1 : 0, clean(body.provider_adapter_id || body.providerAdapterId, 160) || null,
    clean(body.contract_id || body.contractId, 240) || null, clean(body.expires_at || body.expiresAt, 50) || null,
    priorityScore({ amount_minor: amount, fee_minor: fee }), idempotencyKey, JSON.stringify(decisionSeed), now, now
  ).run();
  for (const item of evidence) {
    await db.prepare(`INSERT OR IGNORE INTO matrix_value_entitlement_evidence(evidence_id,opportunity_id,evidence_type,source_url,content_sha256,establishes,authority_verified,identity_match_verified,ownership_verified,retrieved_at,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(
      item.evidenceId, opportunityId, item.evidenceType, item.url, item.digest, item.establishes,
      item.authorityVerified ? 1 : 0, item.identityMatchVerified ? 1 : 0, item.ownershipVerified ? 1 : 0,
      item.retrievedAt, now
    ).run();
  }
  return { opportunity_id: opportunityId, registered: true, entitlement_proven: entitlementProven, accepted_evidence: evidence.length, duplicate_safe: true };
}

export function isValueHunterRoute(pathname = '') {
  return ROUTES.has(String(pathname || '').replace(/\/+$/, '') || '/');
}

export async function handleValueHunterRoute(request, env) {
  if (!(await schemaReady(env))) return json({ ok: false, error: 'Value Hunter schema unavailable' }, 503);
  const db = env.MEMBERS_DB;
  const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/';
  if (request.method === 'GET') {
    if (path === ROOT_ROUTE) {
      const cycles = await rows(db.prepare('SELECT cycle_id,trigger_name,status,target_net_minor,received_net_minor,evaluated_count,ready_count,submitted_count,received_count,blocked_count,report_json,started_at,completed_at FROM matrix_value_cycles ORDER BY started_at DESC LIMIT 30'));
      return json({ ok: true, ...(await summary(db)), capital: await capitalStatus(db), cycles: cycles.map(item => ({ ...item, report: parseJson(item.report_json, {}) })) });
    }
    if (path.endsWith('/claimants')) return json({ ok: true, claimants: await rows(db.prepare('SELECT claimant_id,display_label,authority_status,identity_status,jurisdictions_json,enabled,created_at,updated_at FROM matrix_value_claimants ORDER BY updated_at DESC LIMIT 100')) });
    if (path.endsWith('/destinations')) return json({ ok: true, destinations: await rows(db.prepare('SELECT destination_id,claimant_id,destination_type,public_identifier_hash,allowed_assets_json,allowed_intents_json,provider_adapter_id,approved,active,approved_by_owner_at,created_at,updated_at FROM matrix_value_destinations ORDER BY updated_at DESC LIMIT 100')) });
    if (path === `${ROOT_ROUTE}/opportunities`) return json({ ok: true, opportunities: await rows(db.prepare('SELECT opportunity_id,objective_id,source_id,jurisdiction_id,claimant_id,destination_id,category,title,legal_basis,state,asset,amount_minor,fee_minor,entitlement_proven,provider_adapter_id,expires_at,priority_score,decision_json,discovered_at,updated_at FROM matrix_value_opportunities ORDER BY priority_score DESC,updated_at DESC LIMIT 250')) });
    if (path.endsWith('/improvements')) return json({ ok: true, executable_in_worker: false, proposals: await rows(db.prepare('SELECT proposal_id,source_id,opportunity_id,provider_adapter_id,target_path,official_host,source_sha256,state,blockers_json,test_report_json,immutable_boundaries_json,activation_allowed,generated_at,updated_at FROM matrix_value_improvement_proposals ORDER BY updated_at DESC LIMIT 100')) });
    if (path === `${ROOT_ROUTE}/capital`) return json({ ok: true, ...(await capitalStatus(db)), financial_execution_enabled: enabled(env.MATRIX_CAPITAL_FINANCIAL_EXECUTION_ENABLED, false), automatic_spending: false });
    if (path === `${ROOT_ROUTE}/capital/opportunities`) return json({ ok: true, opportunities: await rows(db.prepare('SELECT opportunity_id,opportunity_type,taxonomy_version,priority_lane,title,state,next_action,policy_class,method_authorized,destination_ready,evidence_ready,estimated_gross_minor,estimated_cost_minor,expected_net_minor,success_probability_ppm,source_json,blockers_json,created_at,updated_at FROM matrix_capital_opportunities ORDER BY expected_net_minor DESC,updated_at DESC LIMIT 250')) });
    if (path === `${ROOT_ROUTE}/capital/graph`) return json({ ok: true, nodes: await rows(db.prepare('SELECT * FROM matrix_opportunity_graph_nodes ORDER BY updated_at DESC LIMIT 500')), edges: await rows(db.prepare('SELECT * FROM matrix_opportunity_graph_edges ORDER BY updated_at DESC LIMIT 1000')), graph_does_not_prove_value: true });
    if (path === `${ROOT_ROUTE}/capital/experiments`) return json({ ok: true, automatic_financial_execution: false, experiments: await rows(db.prepare('SELECT * FROM matrix_acquisition_experiments ORDER BY updated_at DESC LIMIT 250')) });
  }
  if (request.method === 'POST') {
    try {
      const body = await readBody(request);
      const now = new Date().toISOString();
      if (path === ROOT_ROUTE) return json(await runValueHunterCycle(env, { trigger: 'owner-api' }));
      if (path.endsWith('/claimants')) return json({ ok: true, ...(await registerClaimant(db, body, now)) }, 201);
      if (path.endsWith('/destinations')) return json({ ok: true, ...(await registerDestination(db, body, now)) }, 201);
      if (path.endsWith('/opportunities')) return json({ ok: true, ...(await registerOpportunity(db, body, now)) }, 201);
    } catch (error) { return json({ ok: false, error: clean(error?.message || error, 500) }, 400); }
  }
  return json({ ok: false, error: 'Method not allowed' }, 405);
}

export async function runScheduledValueHunter(env) {
  return runValueHunterCycle(env, { trigger: 'scheduled-daily-cycle' });
}

export const valueHunterWorkerInternals = {
  BUILT_IN_COLLECTION_PROVIDERS, INSTALLED_COLLECTION_ADAPTERS, SECRET_OR_PII_FIELD, containsSensitiveMaterial, schemaReady,
  activeMandate, allowedOfficialHost, extractOfficialLeads: extractOfficialValueLeads, discoverOfficialPublicValueLeads,
  evaluationInput, recordDecision, collectionProviderRegistry, collectionLedger, processClaimQueue,
  generateValueCodeImprovements, refreshMeasuredLearning, summary
  , capitalReceiptInputs, capitalAdjustmentInputs, syncCapitalDestinations, syncCapitalReceipts, persistCapitalMilestones,
  persistCapitalHypotheses, capitalStatus, runCapitalChallengeCycle
};
