function env(name, fallback = '') { return String(process.env[name] ?? fallback).trim(); }
function list(name) { return [...new Set(env(name).split(',').map(value => value.trim()).filter(Boolean))]; }
function enabled(name) { return env(name).toLowerCase() === 'true'; }

export function localHarvesterReadiness() {
  const blockers = [];
  const signer = env('MATRIX_PERMISSIONLESS_SIGNER_REFERENCE');
  const walletReference = env('MATRIX_HARVESTER_EXECUTION_WALLET_REFERENCE');
  const walletAddress = env('MATRIX_HARVESTER_EXECUTION_WALLET_ADDRESS');
  let rpcs = [];
  try { rpcs = JSON.parse(env('MATRIX_PERMISSIONLESS_RPC_RESOURCES_JSON', '[]')); } catch { blockers.push('RPC_CONFIGURATION_INVALID_JSON'); }
  if (!enabled('MATRIX_PERMISSIONLESS_VALUE_ENABLED')) blockers.push('MATRIX_PERMISSIONLESS_VALUE_ENABLED=false');
  if (!enabled('MATRIX_PERMISSIONLESS_AUTO_EXECUTION_ENABLED')) blockers.push('MATRIX_PERMISSIONLESS_AUTO_EXECUTION_ENABLED=false');
  if (!signer.startsWith('signer://')) blockers.push('NO_SIGNER');
  if (!walletReference.startsWith('vault://') || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) blockers.push('NO_GAS_WALLET');
  if (!list('P0_ALLOWED_CHAINS').length) blockers.push('NO_CHAIN_CONFIGURATION');
  if (!list('P0_ALLOWED_PROTOCOLS').length) blockers.push('NO_APPROVED_PROTOCOL');
  if (!list('P0_ALLOWED_INTENTS').length) blockers.push('NO_APPROVED_INTENT');
  if (!Array.isArray(rpcs) || !rpcs.length) blockers.push('NO_RPC');
  if (!env('MATRIX_AI_MANAGEMENT_ADMIN_TOKEN')) blockers.push('NO_OWNER_CONTROL_PLANE_TOKEN');
  return {
    status: blockers.length ? 'LIVE_COLLECTION_NOT_CONFIGURED' : 'CONTROL_PLANE_CONFIGURATION_PRESENT',
    ready_for_live_collection: false,
    blockers: [...new Set([...blockers, 'NO_PRODUCTION_CERTIFIED_PROTOCOL_ADAPTER'])],
    secret_material_reported: false,
    signer_reference_configured: signer.startsWith('signer://'),
    execution_wallet_reference_configured: walletReference.startsWith('vault://'),
    configured_rpc_resources: Array.isArray(rpcs) ? rpcs.length : 0,
    allowed_chains: list('P0_ALLOWED_CHAINS'),
    allowed_protocols: list('P0_ALLOWED_PROTOCOLS')
  };
}

export async function callHarvesterControlPlane(action = 'doctor', { fetchImpl = globalThis.fetch } = {}) {
  const local = localHarvesterReadiness();
  if (action === 'doctor' && !env('MATRIX_AI_MANAGEMENT_ADMIN_TOKEN')) return { ok: true, local, remote: { checked: false, reason: 'owner-token-not-configured' } };
  if (!['doctor', 'start', 'status'].includes(action)) throw new Error('Use: matrix-local harvester doctor|start|status');
  const token = env('MATRIX_AI_MANAGEMENT_ADMIN_TOKEN');
  const site = env('MATRIX_SITE_URL', 'https://matrixreprogrammed.com').replace(/\/+$/, '');
  if (!token) return { ok: false, local, error: 'MATRIX_AI_MANAGEMENT_ADMIN_TOKEN is required' };
  const path = action === 'start' ? '/start' : '/doctor';
  const response = await fetchImpl(`${site}/api/ai-management/admin/permissionless-harvester${path}`, {
    method: action === 'start' ? 'POST' : 'GET', headers: { 'x-admin-token': token, authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000)
  });
  const body = await response.json().catch(() => ({}));
  return { ok: response.ok, local, remote: body, http_status: response.status };
}
