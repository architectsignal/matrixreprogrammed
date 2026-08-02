export const AI_MANAGEMENT_ORIGIN = 'cloudflare-worker-ai-management';

function text(value) {
  return String(value || '').toLowerCase();
}

function includesAny(value, markers) {
  const normalized = text(value);
  return markers.some(marker => normalized.includes(marker));
}

function hostname(value) {
  try { return new URL(String(value || '')).hostname.toLowerCase(); } catch { return ''; }
}

function resultText(result = {}) {
  return [result.data?.error, result.data?.message, result.data?.reason, result.data?.raw]
    .filter(Boolean)
    .join(' ');
}

function outcome(code, layer, summary, remediation, retryable = false, confidence = 'high') {
  return { code, layer, summary, remediation, retryable, confidence };
}

export function classifyAiManagementResponse(result = {}, context = {}) {
  const status = Number(result.status || 0);
  const contentType = text(result.contentType);
  const origin = text(result.origin);
  const authLayer = text(result.authLayer);
  const server = text(result.server);
  const location = String(result.location || '');
  const body = resultText(result);
  const html = /text\/html|application\/xhtml\+xml/.test(contentType) || /<!doctype html|<html[\s>]/i.test(body);
  const expectedHost = hostname(context.siteUrl);
  const responseHost = hostname(result.responseUrl);
  const locationHost = hostname(location);
  const matrixOrigin = origin.startsWith('cloudflare-worker-');
  const expectedOrigin = origin === AI_MANAGEMENT_ORIGIN;

  if (expectedOrigin && status === 200) {
    return outcome('worker-healthy', 'ai-management-worker', 'The request reached the AI-management Worker and returned HTTP 200.', null);
  }

  if (expectedOrigin && [401, 403].includes(status)
    && (authLayer || includesAny(body, ['forbidden', 'unauthorized', 'admin token', 'owner']))) {
    return outcome(
      'worker-authentication-rejection',
      'ai-management-worker',
      'The request reached the AI-management authentication boundary and its credential was rejected.',
      'Verify that the workflow secret matches AI_MANAGEMENT_ADMIN_TOKEN or ADMIN_API_TOKEN. Do not weaken the owner-only boundary.'
    );
  }

  if (expectedOrigin && (
    result.data?.schemaReady === false
    || result.data?.autonomySchemaReady === false
    || includesAny(body, ['schema', 'migration', 'members_db', 'members db', 'database', 'd1', 'no such table'])
  )) {
    return outcome(
      'schema-or-d1-failure',
      'ai-management-worker',
      'The Worker responded, but its D1 binding or required schema is unavailable.',
      'Verify the MEMBERS_DB binding and apply the reviewed, repeat-safe AI-management migrations before retrying.',
      true
    );
  }

  if (expectedOrigin && status >= 500) {
    return outcome(
      'application-exception',
      'ai-management-worker',
      'The request reached the AI-management Worker, which failed while handling it.',
      'Inspect the Worker exception and deployment logs; keep the endpoint fail closed.',
      true
    );
  }

  const accessSignal = includesAny(`${location} ${body}`, [
    '/cdn-cgi/access/',
    'cloudflare access',
    'access login',
    'access denied by policy',
    'identity provider',
    'zero trust'
  ]) || Boolean(result.cfAccessApp || result.cfAccessTeam);
  if (!expectedOrigin && accessSignal && [301, 302, 303, 307, 308, 401, 403].includes(status)) {
    return outcome(
      'cloudflare-access-rejection',
      'cloudflare-access',
      'Cloudflare Access rejected or redirected the request before the Worker.',
      'Review the Access application and service-token policy for this exact host and path. Preserve the Worker admin-token check as a second boundary.'
    );
  }

  const wafSignal = result.cfMitigated === 'challenge'
    || includesAny(body, ['error code 1020', 'attention required', 'just a moment', 'cf-chl-', 'challenge-platform', 'managed challenge']);
  if (!expectedOrigin && [403, 429].includes(status) && (wafSignal || (server === 'cloudflare' && html && result.cfRay))) {
    return outcome(
      'waf-or-bot-rejection',
      'cloudflare-edge-security',
      'A Cloudflare WAF, bot or challenge layer rejected the request before the Worker.',
      'Inspect the cf-ray in Cloudflare Security Events and narrowly exempt the authenticated verifier path or identity; do not make the admin endpoint public.',
      false,
      wafSignal ? 'high' : 'medium'
    );
  }

  if (!expectedOrigin && html && [200, 404].includes(status)) {
    return outcome(
      'static-asset-interception',
      'cloudflare-assets',
      'The API request was answered by HTML/static-asset routing instead of the Worker.',
      'Add the exact route to assets.run_worker_first and verify extensionless and normalized path coverage.'
    );
  }

  if ([404, 405].includes(status) && (!origin || matrixOrigin)) {
    return outcome(
      'missing-worker-route',
      matrixOrigin ? 'matrix-worker' : 'routing',
      'No matching AI-management Worker route handled the requested method and path.',
      'Verify the deployed Worker entry point, isAiManagementRoute contract, method and run_worker_first route.'
    );
  }

  if (([301, 302, 303, 307, 308].includes(status) && locationHost && expectedHost && locationHost !== expectedHost)
    || (responseHost && expectedHost && responseHost !== expectedHost)
    || (origin && !expectedOrigin && status !== 404 && status !== 405)) {
    return outcome(
      'incorrect-origin',
      matrixOrigin ? 'different-matrix-worker' : 'routing',
      'The response came from a different host or Worker origin than the AI-management endpoint.',
      'Use the canonical deployment host and verify domain, www redirect, route precedence and Worker route configuration.'
    );
  }

  if (!expectedOrigin && (origin || responseHost || status > 0)) {
    return outcome(
      'incorrect-origin',
      matrixOrigin ? 'different-matrix-worker' : 'routing',
      'The response did not carry the authoritative AI-management Worker origin.',
      'Verify the exact host, redirect target, route precedence and deployed Worker entry point.',
      false,
      'medium'
    );
  }

  return outcome(
    'network-or-unclassified-failure',
    'network',
    'No classifiable HTTP response was received.',
    'Check DNS, TLS, connectivity and verifier logs, then retry.',
    true,
    'low'
  );
}
