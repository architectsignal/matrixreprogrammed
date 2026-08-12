import forumWorker from './worker-forum-persistence.js';
import emailWorker, { emailRoutes, processOutbox } from './worker-email-lifecycle.js';
import intelligenceReportWorker, { isIntelligenceReportRoute } from './worker-intelligence-reports.js';
import contactWorker, { contactRoutes } from './worker-contact-intake.js';
import memberWorker, { isMemberExperienceRoute } from './worker-member-experience.js';
import consequenceTrackerWorker, { isConsequenceTrackerRoute } from './worker-consequence-tracker.js';
import consequenceEvidenceWorker, { isConsequenceEvidenceRoute } from './worker-consequence-evidence.js';
import aiManagementWorker, { isAiManagementRoute } from './worker-ai-management.js';
import paypalWorker, { isPayPalRoute } from './worker-paypal-subscriptions.js';
import bootstrapWorker, { isPayPalSandboxBootstrapRoute } from './worker-paypal-sandbox-bootstrap.js';
import rehearsalWorker, {
  isPayPalSandboxRehearsalRoute,
  enforceSandboxRehearsalGate
} from './worker-paypal-sandbox-rehearsal.js';
import {
  queuePendingVerifiedSelfReports,
  queueVerifiedSelfReport
} from './worker-report-delivery.js';
import { isReleaseMetadataRoute, serveReleaseMetadata } from './worker-release-metadata.js';
import {
  handlePublicInvestigationRoute,
  isPublicInvestigationRoute
} from './worker-public-investigation.js';
import {
  enforceProtectedAssetAccess,
  protectedAssetTier
} from './worker-access-gate.js';

const CONSEQUENCE_TRACKER_CRON = '25 5 * * *';

const forumRoutes = new Set([
  '/forum-health',
  '/forum-feed',
  '/forum-feed-main',
  '/forum-feed-speculation',
  '/forum-feed-epstein-alive',
  '/forum-posts.json',
  '/downloads/forum-posts.json',
  '/forum-posts.md',
  '/downloads/forum-posts.md',
  '/submit-forum-post',
  '/submit-main-post',
  '/submit-speculation-post',
  '/submit-epstein-alive-post',
  '/report-forum-post',
  '/report-main-post',
  '/report-speculation-post',
  '/report-epstein-alive-post',
  '/.netlify/functions/forum-feed',
  '/.netlify/functions/submit-forum-post',
  '/.netlify/functions/report-forum-post'
]);

const authRoutes = new Set([
  '/api/auth/request-link',
  '/api/auth/verify',
  '/api/auth/logout',
  '/api/auth/health'
]);

const publicStaticAssetRoutes = new Map([
  ['/follow-the-money', '/follow-the-money.html'],
  ['/making-money', '/making-money.html'],
  ['/card-artwork-batches', '/card-artwork-batches.html'],
  ['/subject-briefs', '/subject-briefs.html'],
  ['/entity-timelines', '/entity-timelines.html'],
  ['/behind-the-curtain-access', '/behind-the-curtain-access.html'],
  ['/behind-the-curtain-access.html', '/behind-the-curtain-access.html'],
  ['/behind-the-curtain-capstone', '/behind-the-curtain-capstone.html'],
  ['/behind-the-curtain-capstone.html', '/behind-the-curtain-capstone.html'],
  ['/structural-power-map', '/structural-power-map.html'],
  ['/structural-power-map.html', '/structural-power-map.html'],
  ['/structural-power-capstone', '/structural-power-capstone.html'],
  ['/structural-power-capstone.html', '/structural-power-capstone.html'],
  ['/api/public/structural-power/people', '/data/behind-the-curtain-people-registry.json'],
  ['/api/public/structural-power/pyramid', '/data/behind-the-curtain-pyramid.json'],
  ['/api/public/structural-power/capstone', '/data/behind-the-curtain-capstone.json'],
  ['/api/public/structural-power/core', '/data/behind-the-curtain.json'],
  ['/api/public/structural-power/families', '/data/behind-the-curtain-family-access.json'],
  ['/api/public/structural-power/history', '/data/behind-the-curtain-living-access-history.json'],
  ['/api/public/structural-power/continuity', '/data/behind-the-curtain-continuity-layers.json']
]);

const jsonHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Matrix-Origin': 'cloudflare-worker-production-boundary'
};

function unavailable(reason, detail = '', subsystem = 'forum') {
  const authoritativeStorage = subsystem === 'email'
    ? 'Cloudflare D1 MEMBERS_DB email lifecycle tables'
    : subsystem === 'member'
      ? 'Cloudflare D1 MEMBERS_DB member, session and entitlement tables'
      : subsystem === 'paypal'
        ? 'Cloudflare D1 MEMBERS_DB PayPal billing ledger'
        : subsystem === 'paypal-bootstrap'
          ? 'Cloudflare D1 MEMBERS_DB PayPal sandbox bootstrap status ledger'
          : subsystem === 'paypal-rehearsal'
            ? 'Cloudflare D1 MEMBERS_DB PayPal sandbox rehearsal ledger'
            : subsystem === 'asset-gate'
              ? 'Cloudflare D1 MEMBERS_DB effective entitlements'
              : subsystem === 'ai-management'
                ? 'Cloudflare D1 MEMBERS_DB AI resource registry and audit tables'
              : 'Cloudflare D1 MEMBERS_DB.forum_posts';
  const error = subsystem === 'email'
    ? 'Email lifecycle storage is unavailable. No legacy success response was accepted.'
    : subsystem === 'member'
      ? 'Member authentication or entitlement storage is unavailable. No legacy success response was accepted.'
      : subsystem === 'ai-management'
        ? 'AI resource management is unavailable. No external provider fallback was attempted.'
      : subsystem === 'paypal'
        ? 'PayPal billing storage is unavailable. No legacy or unverified payment response was accepted.'
        : subsystem === 'paypal-bootstrap'
          ? 'PayPal sandbox plan readiness is unavailable. Checkout remains closed.'
          : subsystem === 'paypal-rehearsal'
            ? 'PayPal sandbox rehearsal controls are unavailable. Checkout remains closed.'
            : subsystem === 'asset-gate'
              ? 'Protected content entitlement could not be verified. Access remains closed.'
              : 'Forum storage is unavailable. No legacy success response was accepted.';
  return new Response(JSON.stringify({
    ok: false,
    persistent: false,
    saved: false,
    d1Connected: false,
    authoritativeStorage,
    error,
    reason,
    detail: String(detail || '').slice(0, 300),
    checkedAt: new Date().toISOString()
  }, null, 2), { status: 503, headers: jsonHeaders });
}

async function servePublicStaticAsset(request, env, assetPath) {
  if (!env?.ASSETS || typeof env.ASSETS.fetch !== 'function') {
    return unavailable('assets-binding-unavailable', assetPath, 'asset-gate');
  }
  const assetUrl = new URL(request.url);
  assetUrl.pathname = assetPath;
  assetUrl.search = '';
  const accept = assetPath.endsWith('.json')
    ? 'application/json, text/plain;q=0.9, */*;q=0.8'
    : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
  const assetRequest = new Request(assetUrl.toString(), {
    method: 'GET',
    headers: {
      Accept: accept,
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
      'User-Agent': 'Mozilla/5.0 (compatible; MatrixPublicRouteBridge/2.0)'
    }
  });
  const response = await env.ASSETS.fetch(assetRequest);
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'SAMEORIGIN');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('X-Matrix-Origin', 'cloudflare-worker-public-static-assets');
  headers.set('X-Matrix-Public-Alias', assetPath);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function sandboxCheckoutClosed(reason = 'sandbox-checkout-requires-active-rehearsal') {
  return new Response(JSON.stringify({
    ok: false,
    configured: true,
    environment: 'sandbox',
    checkoutEnabled: false,
    rehearsalRequired: true,
    liveChargingEnabled: false,
    error: 'Sandbox checkout opens only during an active, time-limited Phase 7 rehearsal.',
    reason
  }, null, 2), {
    status: 503,
    headers: {
      ...jsonHeaders,
      'X-Matrix-Origin': 'cloudflare-worker-paypal-sandbox-rehearsal'
    }
  });
}

function hasD1(env) {
  return Boolean(env?.MEMBERS_DB && typeof env.MEMBERS_DB.prepare === 'function');
}

function d1OnlyForumEnv(env) {
  return { ...env, FORUM_POSTS: undefined };
}

function completedReportJobId(path, method) {
  if (method !== 'POST') return '';
  const match = String(path || '').match(/^\/api\/admin\/tools\/jobs\/([^/]+)\/result$/);
  return match ? decodeURIComponent(match[1]) : '';
}

async function queueAndDeliverVerifiedReport(env, jobId) {
  try {
    const queued = await queueVerifiedSelfReport(env, jobId);
    if (!queued.queued) return queued;
    const delivery = await processOutbox(env, { limit: 10, memberId: queued.memberId });
    return { ...queued, delivery };
  } catch (error) {
    return { queued: false, reportId: jobId, error: String(error?.message || error).slice(0, 500) };
  }
}

async function validateForumResponse(path, response) {
  const origin = response.headers.get('x-matrix-origin');
  if (origin !== 'cloudflare-worker-forum-d1') {
    return unavailable('non-authoritative-forum-response-blocked', `Origin was ${origin || 'missing'}`);
  }
  if (path === '/forum-health') {
    let health;
    try { health = await response.clone().json(); } catch { return unavailable('invalid-forum-health-json'); }
    const valid = response.ok
      && health?.persistent === true
      && health?.d1Connected === true
      && health?.backend === 'src/worker-forum-persistence.js'
      && String(health?.authoritativeStorage || '').includes('D1');
    if (!valid) return unavailable('forum-health-did-not-prove-d1', JSON.stringify(health || {}));
  }
  return response;
}

async function validateEmailResponse(response) {
  const origin = response.headers.get('x-matrix-origin');
  if (origin !== 'cloudflare-worker-email-lifecycle') {
    return unavailable('non-authoritative-email-response-blocked', `Origin was ${origin || 'missing'}`, 'email');
  }
  return response;
}

async function validateIntelligenceReportResponse(response) {
  const responseOrigin = response.headers.get('x-matrix-origin');
  if (responseOrigin !== 'cloudflare-worker-intelligence-reports') {
    return unavailable('non-authoritative-intelligence-report-response-blocked', `Origin was ${responseOrigin || 'missing'}`, 'member');
  }
  return response;
}

async function validateContactResponse(response) {
  const origin = response.headers.get('x-matrix-origin');
  if (origin !== 'cloudflare-worker-contact-intake') {
    return unavailable('non-authoritative-contact-response-blocked', `Origin was ${origin || 'missing'}`, 'contact');
  }
  return response;
}


async function validateMemberResponse(response) {
  const origin = response.headers.get('x-matrix-origin');
  if (origin !== 'cloudflare-worker-member-experience') {
    return unavailable('non-authoritative-member-response-blocked', `Origin was ${origin || 'missing'}`, 'member');
  }
  return response;
}

async function validateConsequenceEvidenceResponse(response) {
  const origin = response.headers.get('x-matrix-origin');
  if (origin !== 'cloudflare-worker-consequence-evidence') {
    return unavailable('non-authoritative-consequence-evidence-response-blocked', `Origin was ${origin || 'missing'}`, 'member');
  }
  return response;
}

async function validateAiManagementResponse(response) {
  const origin = response.headers.get('x-matrix-origin');
  if (origin !== 'cloudflare-worker-ai-management') {
    return unavailable('non-authoritative-ai-management-response-blocked', `Origin was ${origin || 'missing'}`, 'ai-management');
  }
  return response;
}

async function validateConsequenceTrackerResponse(response) {
  const origin = response.headers.get('x-matrix-origin');
  if (origin !== 'cloudflare-worker-consequence-tracker') {
    return unavailable('non-authoritative-consequence-tracker-response-blocked', `Origin was ${origin || 'missing'}`, 'member');
  }
  return response;
}

async function validateAuthResponse(response) {
  const origin = response.headers.get('x-matrix-origin');
  if (origin !== 'cloudflare-worker-api') {
    return unavailable('non-authoritative-auth-response-blocked', `Origin was ${origin || 'missing'}`, 'member');
  }
  return response;
}

async function validatePayPalResponse(response) {
  const origin = response.headers.get('x-matrix-origin');
  if (origin !== 'cloudflare-worker-paypal-subscriptions') {
    return unavailable('non-authoritative-paypal-response-blocked', `Origin was ${origin || 'missing'}`, 'paypal');
  }
  return response;
}

async function validateBootstrapResponse(response) {
  const origin = response.headers.get('x-matrix-origin');
  if (origin !== 'cloudflare-worker-paypal-sandbox-bootstrap') {
    return unavailable('non-authoritative-paypal-bootstrap-response-blocked', `Origin was ${origin || 'missing'}`, 'paypal-bootstrap');
  }
  return response;
}

async function validateRehearsalResponse(response) {
  const origin = response.headers.get('x-matrix-origin');
  if (origin !== 'cloudflare-worker-paypal-sandbox-rehearsal') {
    return unavailable('non-authoritative-paypal-rehearsal-response-blocked', `Origin was ${origin || 'missing'}`, 'paypal-rehearsal');
  }
  return response;
}

export default {
  async fetch(request, env, ctx) {
    const requestUrl = new URL(request.url);
    if (requestUrl.hostname.toLowerCase() === 'www.matrixreprogrammed.com') {
      requestUrl.hostname = 'matrixreprogrammed.com';
      return Response.redirect(requestUrl.toString(), 308);
    }
    const path = requestUrl.pathname.replace(/\/+$/, '') || '/';

    if (isReleaseMetadataRoute(path)) return serveReleaseMetadata(request, env, path);

    if (isPublicInvestigationRoute(path)) {
      return handlePublicInvestigationRoute(request, env);
    }

    if ((request.method === 'GET' || request.method === 'HEAD') && publicStaticAssetRoutes.has(path)) {
      try {
        return await servePublicStaticAsset(request, env, publicStaticAssetRoutes.get(path));
      } catch (error) {
        return unavailable('public-static-asset-exception', error?.message || error, 'asset-gate');
      }
    }

    if (isAiManagementRoute(path)) {
      try {
        return validateAiManagementResponse(await aiManagementWorker.fetch(request, env, ctx));
      } catch (error) {
        return unavailable('ai-management-worker-exception', error?.message || error, 'ai-management');
      }
    }

    const minimumTier = protectedAssetTier(path);
    if (minimumTier) {
      try {
        const denied = await enforceProtectedAssetAccess(request, env, minimumTier);
        if (denied) return denied;
      } catch (error) {
        return unavailable('protected-asset-gate-exception', error?.message || error, 'asset-gate');
      }
    }

    if (isConsequenceEvidenceRoute(path)) {
      if (!hasD1(env)) return unavailable('members-db-binding-unavailable', '', 'member');
      try {
        return validateConsequenceEvidenceResponse(await consequenceEvidenceWorker.fetch(request, env, ctx));
      } catch (error) {
        return unavailable('consequence-evidence-worker-exception', error?.message || error, 'member');
      }
    }

    if (isConsequenceTrackerRoute(path)) {
      if (!hasD1(env)) return unavailable('members-db-binding-unavailable', '', 'member');
      try {
        return validateConsequenceTrackerResponse(await consequenceTrackerWorker.fetch(request, env, ctx));
      } catch (error) {
        return unavailable('consequence-tracker-worker-exception', error?.message || error, 'member');
      }
    }

    if (isIntelligenceReportRoute(path)) {
      if (!hasD1(env)) return unavailable('members-db-binding-unavailable', '', 'member');
      try {
        return validateIntelligenceReportResponse(await intelligenceReportWorker.fetch(request, env, ctx));
      } catch (error) {
        return unavailable('intelligence-report-worker-exception', error?.message || error, 'member');
      }
    }

    if (contactRoutes.has(path)) {
      if (!hasD1(env) && path !== '/api/contact/pgp-key' && path !== '/api/contact/config') return unavailable('members-db-binding-unavailable', '', 'contact');
      try {
        return validateContactResponse(await contactWorker.fetch(request, env, ctx));
      } catch (error) {
        return unavailable('contact-worker-exception', error?.message || error, 'contact');
      }
    }

    if (emailRoutes.has(path)) {
      if (!hasD1(env)) return unavailable('members-db-binding-unavailable', '', 'email');
      try {
        return validateEmailResponse(await emailWorker.fetch(request, env, ctx));
      } catch (error) {
        return unavailable('email-worker-exception', error?.message || error, 'email');
      }
    }
    if (isPayPalSandboxBootstrapRoute(path)) {
      if (!hasD1(env)) return unavailable('members-db-binding-unavailable', '', 'paypal-bootstrap');
      try {
        return validateBootstrapResponse(await bootstrapWorker.fetch(request, env, ctx));
      } catch (error) {
        return unavailable('paypal-bootstrap-worker-exception', error?.message || error, 'paypal-bootstrap');
      }
    }
    if (isPayPalSandboxRehearsalRoute(path)) {
      if (!hasD1(env)) return unavailable('members-db-binding-unavailable', '', 'paypal-rehearsal');
      try {
        return validateRehearsalResponse(await rehearsalWorker.fetch(request, env, ctx));
      } catch (error) {
        return unavailable('paypal-rehearsal-worker-exception', error?.message || error, 'paypal-rehearsal');
      }
    }
    if (isPayPalRoute(path)) {
      if (!hasD1(env)) return unavailable('members-db-binding-unavailable', '', 'paypal');
      if (['/api/paypal/checkout-intent', '/api/paypal/subscription/create'].includes(path)
        && request.method === 'POST'
        && String(env?.PAYPAL_ENVIRONMENT || 'sandbox').toLowerCase() !== 'live') {
        try {
          const gate = await enforceSandboxRehearsalGate(env);
          if (!gate.allowed) return sandboxCheckoutClosed(gate.reason);
        } catch (error) {
          return unavailable('paypal-rehearsal-gate-exception', error?.message || error, 'paypal-rehearsal');
        }
      }
      try {
        return validatePayPalResponse(await paypalWorker.fetch(request, env, ctx));
      } catch (error) {
        return unavailable('paypal-worker-exception', error?.message || error, 'paypal');
      }
    }
    if (authRoutes.has(path)) {
      if (!hasD1(env)) return unavailable('members-db-binding-unavailable', '', 'member');
      try {
        return validateAuthResponse(await forumWorker.fetch(request, d1OnlyForumEnv(env), ctx));
      } catch (error) {
        return unavailable('auth-worker-exception', error?.message || error, 'member');
      }
    }
    if (isMemberExperienceRoute(path)) {
      if (!hasD1(env)) return unavailable('members-db-binding-unavailable', '', 'member');
      try {
        return validateMemberResponse(await memberWorker.fetch(request, env, ctx));
      } catch (error) {
        return unavailable('member-worker-exception', error?.message || error, 'member');
      }
    }
    const reportJobId = completedReportJobId(path, request.method);
    if (reportJobId) {
      const response = await forumWorker.fetch(request, d1OnlyForumEnv(env), ctx);
      if (response.ok && hasD1(env)) {
        const deliveryTask = queueAndDeliverVerifiedReport(env, reportJobId);
        if (ctx?.waitUntil) ctx.waitUntil(deliveryTask);
        else await deliveryTask;
      }
      return response;
    }
    if (!forumRoutes.has(path)) return forumWorker.fetch(request, d1OnlyForumEnv(env), ctx);
    if (!hasD1(env)) return unavailable('members-db-binding-unavailable');
    try {
      const response = await forumWorker.fetch(request, d1OnlyForumEnv(env), ctx);
      return validateForumResponse(path, response);
    } catch (error) {
      return unavailable('forum-worker-exception', error?.message || error);
    }
  },

  async scheduled(event, env, ctx) {
    if (!hasD1(env)) return;
    if (event?.cron === CONSEQUENCE_TRACKER_CRON) {
      await consequenceTrackerWorker.scheduled(event, env, ctx);
      return;
    }
    await queuePendingVerifiedSelfReports(env, { limit: 100 });
    await Promise.all([
      emailWorker.scheduled(event, env, ctx),
      bootstrapWorker.scheduled(event, env, ctx),
      rehearsalWorker.scheduled(event, env, ctx)
    ]);
  }
};
