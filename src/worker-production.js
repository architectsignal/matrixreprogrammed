import forumWorker from './worker-forum-persistence.js';
import emailWorker, { emailRoutes } from './worker-email-lifecycle.js';
import memberWorker, { isMemberExperienceRoute } from './worker-member-experience.js';
import paypalWorker, { isPayPalRoute } from './worker-paypal-subscriptions.js';
import rehearsalWorker, {
  isPayPalSandboxRehearsalRoute,
  enforceSandboxRehearsalGate
} from './worker-paypal-sandbox-rehearsal.js';

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
        : subsystem === 'paypal-rehearsal'
          ? 'Cloudflare D1 MEMBERS_DB PayPal sandbox rehearsal ledger'
          : 'Cloudflare D1 MEMBERS_DB.forum_posts';
  const error = subsystem === 'email'
    ? 'Email lifecycle storage is unavailable. No legacy success response was accepted.'
    : subsystem === 'member'
      ? 'Member authentication or entitlement storage is unavailable. No legacy success response was accepted.'
      : subsystem === 'paypal'
        ? 'PayPal billing storage is unavailable. No legacy or unverified payment response was accepted.'
        : subsystem === 'paypal-rehearsal'
          ? 'PayPal sandbox rehearsal controls are unavailable. Checkout remains closed.'
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
  /*
   * D1 is the production forum database. The historical KV namespace is optional
   * migration/recovery infrastructure and must never be able to block forum startup,
   * reads, writes or health checks when its daily quota is exhausted.
   */
  return { ...env, FORUM_POSTS: undefined };
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

async function validateMemberResponse(response) {
  const origin = response.headers.get('x-matrix-origin');
  if (origin !== 'cloudflare-worker-member-experience') {
    return unavailable('non-authoritative-member-response-blocked', `Origin was ${origin || 'missing'}`, 'member');
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

async function validateRehearsalResponse(response) {
  const origin = response.headers.get('x-matrix-origin');
  if (origin !== 'cloudflare-worker-paypal-sandbox-rehearsal') {
    return unavailable('non-authoritative-paypal-rehearsal-response-blocked', `Origin was ${origin || 'missing'}`, 'paypal-rehearsal');
  }
  return response;
}

export default {
  async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/';
    if (emailRoutes.has(path)) {
      if (!hasD1(env)) return unavailable('members-db-binding-unavailable', '', 'email');
      try {
        return validateEmailResponse(await emailWorker.fetch(request, env, ctx));
      } catch (error) {
        return unavailable('email-worker-exception', error?.message || error, 'email');
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
      if (path === '/api/paypal/checkout-intent'
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
    if (isMemberExperienceRoute(path)) {
      if (!hasD1(env)) return unavailable('members-db-binding-unavailable', '', 'member');
      try {
        return validateMemberResponse(await memberWorker.fetch(request, env, ctx));
      } catch (error) {
        return unavailable('member-worker-exception', error?.message || error, 'member');
      }
    }
    if (!forumRoutes.has(path)) return forumWorker.fetch(request, env, ctx);
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
    await Promise.all([
      emailWorker.scheduled(event, env, ctx),
      rehearsalWorker.scheduled(event, env, ctx)
    ]);
  }
};
