const origin = 'cloudflare-worker-membership-asset-gate';

const tierRank = {
  public: 0,
  registered: 1,
  supporter_3: 2,
  intelligence_6: 3,
  research_pro_9: 4
};

const exactRules = new Map([
  ['/downloads/the-black-file-matrix-reprogrammed.pdf', 'registered'],
  ['/downloads/seven-day-intel.json', 'registered'],
  ['/downloads/intel-vault.json', 'registered'],
  ['/downloads/intel-vault.md', 'registered'],
  ['/downloads/timer-synthesis.md', 'supporter_3'],
  ['/downloads/probability-snapshot.md', 'intelligence_6']
]);

const patternRules = [
  { pattern: /^\/downloads\/(?:supporter|weekly-(?:brief|archive)|signal-drop|source-drop-bundle)[^/]*\.(?:pdf|md|json|csv)$/i, tier: 'supporter_3' },
  { pattern: /^\/downloads\/(?:daily-(?:command|intel|intelligence)|intelligence-(?:brief|report)|in-depth-report|elite-report|member-report|intelligence-card-deck)[^/]*\.(?:pdf|md|json|csv)$/i, tier: 'intelligence_6' },
  { pattern: /^\/downloads\/(?:research|full-dossier|citation|bibliography|evidence-path|source-pack|research-bundle|data-export|network-export)[^/]*\.(?:pdf|md|json|csv|zip)$/i, tier: 'research_pro_9' }
];

const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Matrix-Origin': origin
};

function cleanPath(value = '') {
  try { return new URL(value, 'https://matrixreprogrammed.com').pathname.replace(/\/+$/, '') || '/'; }
  catch { return '/'; }
}
function cookieValue(request, name) {
  const raw = request.headers.get('cookie') || '';
  for (const part of raw.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) return decodeURIComponent(part.slice(index + 1).trim());
  }
  return '';
}
async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value || '')));
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}
function json(data, status) {
  return new Response(JSON.stringify(data, null, 2), { status, headers });
}

export function protectedAssetTier(pathname = '') {
  const path = cleanPath(pathname);
  if (exactRules.has(path)) return exactRules.get(path);
  const match = patternRules.find(rule => rule.pattern.test(path));
  return match?.tier || '';
}

export function isProtectedAssetPath(pathname = '') {
  return Boolean(protectedAssetTier(pathname));
}

export async function enforceProtectedAssetAccess(request, env, minimumTier = '') {
  const requiredTier = minimumTier || protectedAssetTier(new URL(request.url).pathname);
  if (!requiredTier) return null;
  if (!env?.MEMBERS_DB || typeof env.MEMBERS_DB.prepare !== 'function') {
    return json({
      ok: false,
      authenticated: false,
      error: 'Membership storage is unavailable. Protected content remains closed.',
      requiredTier,
      upgradeUrl: '/membership.html'
    }, 503);
  }

  const token = cookieValue(request, 'matrix_session');
  if (!token) {
    return json({
      ok: false,
      authenticated: false,
      error: 'Member login required for this resource.',
      requiredTier,
      loginUrl: `/member-login.html?next=${encodeURIComponent(new URL(request.url).pathname)}`,
      upgradeUrl: '/membership.html'
    }, 401);
  }

  const sessionHash = await sha256(token);
  const now = new Date().toISOString();
  let row = null;
  try {
    row = await env.MEMBERS_DB.prepare(`
      SELECT e.effective_tier,e.tier_rank,e.is_admin,e.status,e.email_verified_at
      FROM member_sessions s
      JOIN member_effective_entitlements e ON e.member_id=s.member_id
      WHERE s.session_hash=?
        AND s.revoked_at IS NULL
        AND s.expires_at>?
      LIMIT 1
    `).bind(sessionHash, now).first();
  } catch {
    return json({
      ok: false,
      authenticated: false,
      error: 'Membership entitlement could not be verified. Protected content remains closed.',
      requiredTier,
      upgradeUrl: '/membership.html'
    }, 503);
  }

  if (!row || row.status !== 'active' || !row.email_verified_at) {
    return json({
      ok: false,
      authenticated: false,
      error: 'An active verified member account is required.',
      requiredTier,
      loginUrl: `/member-login.html?next=${encodeURIComponent(new URL(request.url).pathname)}`,
      upgradeUrl: '/membership.html'
    }, 401);
  }

  const currentRank = Number(row.tier_rank || 0);
  const requiredRank = tierRank[requiredTier] ?? 99;
  if (!Boolean(row.is_admin) && currentRank < requiredRank) {
    return json({
      ok: false,
      authenticated: true,
      error: 'This resource is not included in the current membership tier.',
      currentTier: row.effective_tier || 'registered',
      requiredTier,
      upgradeUrl: '/membership.html'
    }, 403);
  }
  return null;
}

export const accessRules = {
  exact: Object.fromEntries(exactRules),
  patterns: patternRules.map(rule => ({ pattern: String(rule.pattern), tier: rule.tier })),
  tierRank
};
