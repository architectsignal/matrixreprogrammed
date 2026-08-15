import { RPCBroker } from '../ai-management/value-hunter/permissionless/rpc-broker.mjs';
import { emitMatrixSystemEvent } from './matrix-event-emitter.js';

const ROOT = '/api/ai-management/admin/permissionless-harvester';
const ROUTES = new Set([ROOT, `${ROOT}/doctor`, `${ROOT}/start`, `${ROOT}/activity`]);
const MORPHO_BASE_CONTRACT = '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb';
const PRODUCTION_CERTIFIED_ADAPTERS = Object.freeze([]);
const ALLOWED_PERMISSIONLESS_INTENTS = new Set(['EXECUTE_PUBLIC_REWARD','EXECUTE_LIQUIDATION','EXECUTE_KEEPER_REWARD','EXECUTE_SETTLEMENT_REWARD','EXECUTE_AUCTION_REWARD','EXECUTE_MAINTENANCE_REWARD','CLAIM_PERMISSIONLESS_REWARD','SWEEP_EARNED_PROCEEDS']);

function enabled(value, fallback = false) { return value == null || value === '' ? fallback : String(value).toLowerCase() === 'true'; }
function clean(value, maximum = 300) { return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maximum); }
function parseJson(value, fallback) { try { return JSON.parse(value); } catch { return fallback; } }
function list(value) { return [...new Set(String(value || '').split(',').map(item => clean(item, 120)).filter(Boolean))]; }
function json(value, status = 200) {
  return new Response(JSON.stringify(value, null, 2), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'x-matrix-origin': 'cloudflare-worker-permissionless-harvester' } });
}
async function tableExists(db, name) { const row = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1").bind(name).first(); return row?.name === name; }
async function schemaReady(env) {
  if (!env?.MEMBERS_DB?.prepare) return false;
  return (await Promise.all(['matrix_permissionless_protocols', 'matrix_permissionless_opportunities', 'matrix_permissionless_simulations', 'matrix_permissionless_execution_intents', 'matrix_permissionless_receipts', 'matrix_permissionless_cycles'].map(name => tableExists(env.MEMBERS_DB, name).catch(() => false)))).every(Boolean);
}

function rpcResources(env) {
  const records = parseJson(env.MATRIX_PERMISSIONLESS_RPC_RESOURCES_JSON, []);
  return Array.isArray(records) ? records : [];
}

export function permissionlessReadiness(env = {}, { gas = null, chain = null } = {}) {
  const blockers = [];
  const featureEnabled = enabled(env.MATRIX_PERMISSIONLESS_VALUE_ENABLED);
  const autoEnabled = enabled(env.MATRIX_PERMISSIONLESS_AUTO_EXECUTION_ENABLED);
  const allowedChains = list(env.P0_ALLOWED_CHAINS).map(Number).filter(value => Number.isSafeInteger(value) && value > 0);
  const allowedProtocols = list(env.P0_ALLOWED_PROTOCOLS);
  const allowedIntents = list(env.P0_ALLOWED_INTENTS);
  const signerReference = clean(env.MATRIX_PERMISSIONLESS_SIGNER_REFERENCE, 200);
  const walletReference = clean(env.MATRIX_HARVESTER_EXECUTION_WALLET_REFERENCE, 200);
  const walletAddress = clean(env.MATRIX_HARVESTER_EXECUTION_WALLET_ADDRESS, 80);
  const rpcs = rpcResources(env);
  if (!featureEnabled) blockers.push('MATRIX_PERMISSIONLESS_VALUE_ENABLED=false');
  if (!autoEnabled) blockers.push('MATRIX_PERMISSIONLESS_AUTO_EXECUTION_ENABLED=false');
  if (!signerReference.startsWith('signer://')) blockers.push('NO_SIGNER');
  if (!walletReference.startsWith('vault://') || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) blockers.push('NO_GAS_WALLET');
  if (!allowedChains.length) blockers.push('NO_CHAIN_CONFIGURATION');
  if (!allowedProtocols.length) blockers.push('NO_APPROVED_PROTOCOL');
  if (!allowedIntents.length) blockers.push('NO_APPROVED_INTENT');
  if (allowedIntents.some(intent => !ALLOWED_PERMISSIONLESS_INTENTS.has(intent))) blockers.push('UNRECOGNIZED_PERMISSIONLESS_INTENT');
  if (!rpcs.length) blockers.push('NO_RPC');
  for (const protocol of allowedProtocols) {
    const flag = `MATRIX_PERMISSIONLESS_${protocol.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_ENABLED`;
    if (!enabled(env[flag])) blockers.push(`${flag}=false`);
  }
  if (!PRODUCTION_CERTIFIED_ADAPTERS.some(adapter => allowedProtocols.includes(adapter.protocol_id) && allowedChains.includes(adapter.chain_id))) blockers.push('NO_PRODUCTION_CERTIFIED_PROTOCOL_ADAPTER');
  if (gas?.sufficient === false) blockers.push('GAS_RESERVE_BELOW_MINIMUM');
  if (chain?.healthy === false) blockers.push('CHAIN_HEAD_UNAVAILABLE');
  return {
    ready: blockers.length === 0,
    status: blockers.length === 0 ? 'READY' : 'LIVE_COLLECTION_NOT_CONFIGURED',
    blockers,
    feature_flags: { permissionless_value: featureEnabled, auto_execution: autoEnabled, distributed_discovery: enabled(env.MATRIX_DISTRIBUTED_DISCOVERY_ENABLED) },
    signer: { configured: signerReference.startsWith('signer://'), secret_exposed: false },
    execution_wallet: { configured: walletReference.startsWith('vault://') && /^0x[a-fA-F0-9]{40}$/.test(walletAddress), treasury_wallet: false, secret_exposed: false },
    configured_rpc_resources: rpcs.length,
    allowed_chains: allowedChains,
    allowed_protocols: allowedProtocols,
    allowed_intents: allowedIntents,
    production_certified_adapters: PRODUCTION_CERTIFIED_ADAPTERS.map(item => item.adapter_id)
  };
}

async function liveReadProbe(env) {
  const resources = rpcResources(env);
  if (!resources.length) return { healthy: false, reason: 'NO_RPC' };
  try {
    const broker = new RPCBroker(resources);
    const [head, code] = await Promise.all([
      broker.call(8453, 'eth_blockNumber', []),
      broker.call(8453, 'eth_getCode', [MORPHO_BASE_CONTRACT, 'latest'])
    ]);
    return { healthy: code.result !== '0x', chain_id: 8453, block_number: Number.parseInt(head.result, 16), contract_code_present: code.result !== '0x', rpc_resource_ids: [...new Set([head.resource_id, code.resource_id])] };
  } catch (error) { return { healthy: false, reason: clean(error?.message || error, 300) }; }
}

async function summary(db) {
  const opportunity = await db.prepare(`SELECT COUNT(*) count,
    SUM(CASE WHEN state='PROFITABLE' THEN 1 ELSE 0 END) profitable,
    SUM(CASE WHEN state='RECONCILED' THEN 1 ELSE 0 END) reconciled
    FROM matrix_permissionless_opportunities`).first();
  const receipts = await db.prepare(`SELECT COUNT(*) count,COALESCE(SUM(realized_net_profit_usd_micros),0) net
    FROM matrix_permissionless_receipts WHERE reconciled=1`).first();
  const first = await db.prepare(`SELECT transaction_hash,protocol_id,chain_id,gross_reward_usd_micros,realized_total_cost_usd_micros,
    realized_net_profit_usd_micros,reconciled_at FROM matrix_permissionless_receipts WHERE reconciled=1 ORDER BY reconciled_at LIMIT 1`).first();
  return {
    metric: 'PERMISSIONLESS_NET_CRYPTO_COLLECTED',
    opportunities: { total: Number(opportunity?.count || 0), profitable_now: Number(opportunity?.profitable || 0), reconciled: Number(opportunity?.reconciled || 0) },
    reconciled_receipts: { count: Number(receipts?.count || 0), realized_net_profit_usd_micros: Number(receipts?.net || 0) },
    first_permissionless_receipt: first || null,
    theoretical_value_counted: false
  };
}

export async function runPermissionlessHarvesterCycle(env, { trigger = 'scheduled-or-startup', probe = liveReadProbe, clock = () => new Date() } = {}) {
  if (!(await schemaReady(env))) return { ok: false, skipped: true, reason: 'permissionless-schema-unavailable' };
  const db = env.MEMBERS_DB;
  const startedAt = clock().toISOString();
  const cycleId = `p0-${startedAt.replace(/[^0-9]/g, '').slice(0, 14)}-${clean(trigger, 50).replace(/[^a-z0-9-]/gi, '-')}`;
  const preliminary = permissionlessReadiness(env);
  const chain = preliminary.configured_rpc_resources ? await probe(env) : { healthy: false, reason: 'NO_RPC' };
  const readiness = permissionlessReadiness(env, { chain });
  const status = readiness.ready ? 'completed' : 'not-configured';
  const report = {
    cycle_id: cycleId, trigger, started_at: startedAt, completed_at: clock().toISOString(), readiness, chain,
    ...(await summary(db)),
    live_collection_state: readiness.ready ? 'LIVE_READY_NO_OPPORTUNITY_YET' : (chain.healthy ? 'SIMULATION_ONLY' : 'READY_PENDING_CONFIGURATION'),
    boundary: 'No transaction is signed by the Worker. An owner-controlled execution node performs a fresh simulation and constrained signing.'
  };
  await db.prepare(`INSERT INTO matrix_permissionless_cycles(cycle_id,trigger_name,status,report_json,started_at,completed_at)
    VALUES(?,?,?,?,?,?) ON CONFLICT(cycle_id) DO UPDATE SET status=excluded.status,report_json=excluded.report_json,completed_at=excluded.completed_at`).bind(
    cycleId, clean(trigger, 100), status, JSON.stringify(report), startedAt, report.completed_at
  ).run();
  await db.prepare(`UPDATE matrix_capabilities SET dependencies_reachable=?,data_connected=?,live_verification_passed=?,state=?,blocker=?,checked_at=?,evidence_json=?
    WHERE capability_id='matrix-permissionless-harvester'`).bind(
    chain.healthy ? 1 : 0, chain.healthy ? 1 : 0, readiness.ready ? 1 : 0,
    readiness.ready ? 'live_verified' : chain.healthy ? 'evidence_ready' : 'structural_only',
    readiness.ready ? null : readiness.blockers.join(', '), report.completed_at,
    JSON.stringify({ live_collection_state: report.live_collection_state, chain, reconciled_receipts: report.reconciled_receipts })
  ).run();
  await emitMatrixSystemEvent(env, {
    eventType: 'value.permissionless.cycle.completed', auditIdentifier: cycleId, origin: 'permissionless-harvester', actor: 'p0-permissionless-director',
    payload: { change_summary: readiness.ready ? 'Permissionless Harvester completed a live-ready scan cycle.' : 'Permissionless Harvester checked configuration and failed closed before signing.', live_collection_state: report.live_collection_state, blockers: readiness.blockers }
  });
  return { ok: true, report };
}

export function isPermissionlessHarvesterRoute(pathname = '') { return ROUTES.has(String(pathname || '').replace(/\/+$/, '') || '/'); }

export async function handlePermissionlessHarvesterRoute(request, env) {
  if (!(await schemaReady(env))) return json({ ok: false, error: 'Permissionless Harvester schema unavailable' }, 503);
  const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/';
  if (request.method === 'GET' && (path === ROOT || path.endsWith('/doctor'))) return json({ ok: true, readiness: permissionlessReadiness(env), ...(await summary(env.MEMBERS_DB)) });
  if (request.method === 'GET' && path.endsWith('/activity')) {
    const result = await env.MEMBERS_DB.prepare('SELECT cycle_id,trigger_name,status,report_json,started_at,completed_at FROM matrix_permissionless_cycles ORDER BY started_at DESC LIMIT 50').all();
    return json({ ok: true, fabricated_activity: false, cycles: (result.results || []).map(item => ({ ...item, report: parseJson(item.report_json, {}) })) });
  }
  if (request.method === 'POST' && (path === ROOT || path.endsWith('/start'))) return json(await runPermissionlessHarvesterCycle(env, { trigger: 'owner-immediate-start' }));
  return json({ ok: false, error: 'Method not allowed' }, 405);
}

export async function runScheduledPermissionlessHarvester(env) { return runPermissionlessHarvesterCycle(env, { trigger: 'scheduled-reconciliation' }); }

export const permissionlessWorkerInternals = { ROOT, ROUTES, MORPHO_BASE_CONTRACT, PRODUCTION_CERTIFIED_ADAPTERS, ALLOWED_PERMISSIONLESS_INTENTS, schemaReady, rpcResources, liveReadProbe, summary };
