import forumWorker from './worker-forum-persistence.js';

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

function unavailable(reason, detail = '') {
  return new Response(JSON.stringify({
    ok: false,
    persistent: false,
    saved: false,
    d1Connected: false,
    authoritativeStorage: 'Cloudflare D1 MEMBERS_DB.forum_posts',
    error: 'Forum storage is unavailable. No legacy success response was accepted.',
    reason,
    detail: String(detail || '').slice(0, 300),
    checkedAt: new Date().toISOString()
  }, null, 2), { status: 503, headers: jsonHeaders });
}

function hasD1(env) {
  return Boolean(env?.MEMBERS_DB && typeof env.MEMBERS_DB.prepare === 'function');
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

export default {
  async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/';
    if (!forumRoutes.has(path)) return forumWorker.fetch(request, env, ctx);
    if (!hasD1(env)) return unavailable('members-db-binding-unavailable');
    try {
      const response = await forumWorker.fetch(request, env, ctx);
      return validateForumResponse(path, response);
    } catch (error) {
      return unavailable('forum-worker-exception', error?.message || error);
    }
  }
};
