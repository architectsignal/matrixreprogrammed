const LAW = 'CAUSE NO HARM OR LOSS.';
const LAW_SHA256 = '2f440056e992d3edbe9dcfd60a5c9d24397bb28d68e29d1d3ed476e84021b189';

function env(name, fallback = '') { return String(process.env[name] ?? fallback).trim(); }

export function localMatrixReadiness() {
  const token = env('MATRIX_AI_MANAGEMENT_ADMIN_TOKEN');
  const site = env('MATRIX_SITE_URL', 'https://matrixreprogrammed.com').replace(/\/+$/, '');
  const blockers = [];
  if (!token) blockers.push('NO_OWNER_CONTROL_PLANE_TOKEN');
  if (token && token.length < 32) blockers.push('OWNER_CONTROL_PLANE_TOKEN_TOO_SHORT');
  try { if (new URL(site).protocol !== 'https:') blockers.push('CONTROL_PLANE_REQUIRES_HTTPS'); } catch { blockers.push('MATRIX_SITE_URL_INVALID'); }
  return {
    status: blockers.length ? 'LOCAL_READY_REMOTE_BLOCKED' : 'CONTROL_PLANE_CONFIGURATION_PRESENT',
    law: LAW,
    law_sha256: LAW_SHA256,
    local_zero_spend_loop_ready: true,
    remote_cycle_configured: blockers.length === 0,
    secret_material_reported: false,
    blockers,
    exact_actions: blockers.includes('NO_OWNER_CONTROL_PLANE_TOKEN')
      ? ['Set MATRIX_AI_MANAGEMENT_ADMIN_TOKEN in the current user environment to the same 64-character token stored as the Worker secret, then restart the terminal and Matrix host.']
      : []
  };
}

export async function callMatrixControlPlane(action = 'doctor', { fetchImpl = globalThis.fetch } = {}) {
  if (!['doctor', 'start', 'status'].includes(action)) throw new Error('Use: matrix-local matrix doctor|start|status');
  const local = localMatrixReadiness();
  const token = env('MATRIX_AI_MANAGEMENT_ADMIN_TOKEN');
  if (!token) return { ok: action === 'doctor', local, remote: { checked: false, reason: 'owner-token-not-configured' } };
  const site = env('MATRIX_SITE_URL', 'https://matrixreprogrammed.com').replace(/\/+$/, '');
  const path = action === 'start' ? '/start' : '/doctor';
  const response = await fetchImpl(`${site}/api/ai-management/admin/matrix-operations${path}`, {
    method: action === 'start' ? 'POST' : 'GET',
    headers: { 'x-admin-token': token, authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20_000)
  });
  const body = await response.json().catch(() => ({}));
  return { ok: response.ok, local, remote: body, http_status: response.status };
}
