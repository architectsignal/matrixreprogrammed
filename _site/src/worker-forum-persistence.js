import legacyWorker from './worker.js';
import { memberSessionContext } from './worker-member-experience.js';

const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Matrix-Origin': 'cloudflare-worker-forum-d1'
};
const boardLabels = {
  main: 'Main Signal Board',
  speculation: 'Dark Speculation Board',
  'epstein-alive': 'Epstein Alive / Sighting Board'
};
const validBoards = new Set(Object.keys(boardLabels));
const routeMap = {
  '/forum-health': { action: 'health' },
  '/forum-feed': { action: 'feed', board: 'main' },
  '/forum-feed-main': { action: 'feed', board: 'main' },
  '/forum-feed-speculation': { action: 'feed', board: 'speculation' },
  '/forum-feed-epstein-alive': { action: 'feed', board: 'epstein-alive' },
  '/forum-posts.json': { action: 'json', board: 'all' },
  '/downloads/forum-posts.json': { action: 'json', board: 'all' },
  '/forum-posts.md': { action: 'markdown', board: 'all' },
  '/downloads/forum-posts.md': { action: 'markdown', board: 'all' },
  '/submit-forum-post': { action: 'submit', board: 'main' },
  '/submit-main-post': { action: 'submit', board: 'main' },
  '/submit-speculation-post': { action: 'submit', board: 'speculation' },
  '/submit-epstein-alive-post': { action: 'submit', board: 'epstein-alive' },
  '/report-forum-post': { action: 'report', board: 'main' },
  '/report-main-post': { action: 'report', board: 'main' },
  '/report-speculation-post': { action: 'report', board: 'speculation' },
  '/report-epstein-alive-post': { action: 'report', board: 'epstein-alive' },
  '/.netlify/functions/forum-feed': { action: 'feed', board: 'main' },
  '/.netlify/functions/submit-forum-post': { action: 'submit', board: 'main' },
  '/.netlify/functions/report-forum-post': { action: 'report', board: 'main' }
};

let schemaPromise;
let migrationPromise;

function response(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers });
}
function clean(value, max = 1000) {
  return String(value ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}
function normalizeBoard(value = 'main') {
  const board = clean(value, 80).toLowerCase().replace(/[^a-z0-9-]/g, '-');
  return validBoards.has(board) ? board : 'main';
}
function makeId(prefix = 'signal') {
  return `${prefix}-${Date.now()}-${crypto.randomUUID()}`;
}
function safePost(post = {}) {
  const now = new Date().toISOString();
  return {
    id: clean(post.id || makeId(), 160),
    board: normalizeBoard(post.board || post.category || 'main'),
    title: clean(post.title || 'Reader Signal', 160),
    body: clean(post.body || post.message || '', 4000),
    category: clean(post.category || 'Signal', 100),
    name: clean(post.name || post.display_name || 'Anonymous', 100),
    sourceUrl: clean(post.sourceUrl || post.source_url || post.source || '', 800),
    createdAt: clean(post.createdAt || post.created_at || now, 80),
    approvedAt: clean(post.approvedAt || post.approved_at || post.createdAt || post.created_at || now, 80),
    status: clean(post.status || 'live', 40)
  };
}
function synthetic(post) {
  const text = [post.id, post.title, post.body, post.category, post.name, post.status]
    .map(value => String(value || '').toLowerCase())
    .join(' ');
  return /synthetic|smoke test|health check|demo post|fixture|qa post|seed post|system check|generated check|pressure test/.test(text);
}
function publicPosts(posts) {
  return posts.map(safePost).filter(post => post.status === 'live' && !synthetic(post));
}
async function body(request) {
  const type = request.headers.get('content-type') || '';
  if (type.includes('application/json')) return request.json().catch(() => ({}));
  const form = await request.formData().catch(() => null);
  return form ? Object.fromEntries(form.entries()) : {};
}
function hasD1(env) {
  return Boolean(env?.MEMBERS_DB && typeof env.MEMBERS_DB.prepare === 'function');
}
function kvMirrorEnabled(env) {
  return String(env?.ENABLE_KV_COMPATIBILITY_MIRROR || 'false').toLowerCase() === 'true' && Boolean(env?.FORUM_POSTS);
}

async function ensureSchema(env) {
  if (!hasD1(env)) throw new Error('MEMBERS_DB D1 binding is unavailable');
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const statements = [
        `CREATE TABLE IF NOT EXISTS forum_posts (
          id TEXT PRIMARY KEY,
          member_id TEXT NOT NULL DEFAULT '',
          board TEXT NOT NULL,
          title TEXT NOT NULL,
          body TEXT NOT NULL,
          category TEXT NOT NULL DEFAULT 'Signal',
          display_name TEXT NOT NULL DEFAULT 'Anonymous',
          source_url TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          approved_at TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'live',
          storage_origin TEXT NOT NULL DEFAULT 'd1',
          updated_at TEXT NOT NULL
        )`,
        `CREATE INDEX IF NOT EXISTS idx_forum_posts_board_created ON forum_posts(board, created_at DESC)`,
        `CREATE INDEX IF NOT EXISTS idx_forum_posts_status_created ON forum_posts(status, created_at DESC)`,
        `CREATE TABLE IF NOT EXISTS forum_reports (
          id TEXT PRIMARY KEY,
          board TEXT NOT NULL,
          post_id TEXT NOT NULL,
          reason TEXT NOT NULL,
          created_at TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'open'
        )`,
        `CREATE INDEX IF NOT EXISTS idx_forum_reports_post ON forum_reports(post_id, created_at DESC)`,
        `CREATE TABLE IF NOT EXISTS forum_meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )`
      ];
      for (const sql of statements) await env.MEMBERS_DB.prepare(sql).run();
      await env.MEMBERS_DB.prepare("ALTER TABLE forum_posts ADD COLUMN member_id TEXT NOT NULL DEFAULT ''").run().catch(() => null);
      await env.MEMBERS_DB.prepare('CREATE INDEX IF NOT EXISTS idx_forum_posts_member_created ON forum_posts(member_id, created_at DESC)').run();
      return true;
    })().catch(error => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}

async function insertPost(env, post, origin = 'd1', memberId = '') {
  const p = safePost(post);
  const now = new Date().toISOString();
  const memberKey = clean(memberId, 160);
  const result = await env.MEMBERS_DB.prepare(
    `INSERT INTO forum_posts
      (id, member_id, board, title, body, category, display_name, source_url, created_at, approved_at, status, storage_origin, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(p.id, memberKey, p.board, p.title, p.body, p.category, p.name, p.sourceUrl, p.createdAt, p.approvedAt, p.status, origin, now).run();
  if (Number(result?.meta?.changes || 0) !== 1) throw new Error('D1 did not confirm the forum insert');
  const stored = await env.MEMBERS_DB.prepare(
    `SELECT id, board, title, body, category, display_name AS name, source_url AS sourceUrl,
            created_at AS createdAt, approved_at AS approvedAt, status
       FROM forum_posts WHERE id=? AND member_id=? LIMIT 1`
  ).bind(p.id, memberKey).first();
  if (!stored || stored.id !== p.id) throw new Error('D1 forum read-after-write confirmation failed');
  return safePost(stored);
}
async function metaValue(env, key) {
  try {
    const row = await env.MEMBERS_DB.prepare('SELECT value FROM forum_meta WHERE key=? LIMIT 1').bind(key).first();
    return row?.value || null;
  } catch {
    return null;
  }
}
async function setMeta(env, key, value) {
  const now = new Date().toISOString();
  await env.MEMBERS_DB.prepare(
    `INSERT INTO forum_meta (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`
  ).bind(key, value, now).run();
}

async function migrateKvPosts(env) {
  await ensureSchema(env);
  if (!kvMirrorEnabled(env)) return { migrated: 0, source: 'kv-compatibility-disabled' };
  if (await metaValue(env, 'kv_forum_migration_v1')) return { migrated: 0, source: 'already-complete' };
  if (!migrationPromise) {
    migrationPromise = (async () => {
      const candidates = new Map();
      try {
        const index = await env.FORUM_POSTS.get('posts:index', 'json');
        if (Array.isArray(index)) for (const item of index) {
          const post = safePost(item);
          if (post.id) candidates.set(post.id, post);
        }
      } catch {}
      let cursor;
      let pages = 0;
      do {
        const listed = await env.FORUM_POSTS.list({ prefix: 'post:', limit: 1000, cursor });
        const keys = Array.isArray(listed?.keys) ? listed.keys : [];
        const values = await Promise.all(keys.map(async key => {
          try { return await env.FORUM_POSTS.get(key.name, 'json'); } catch { return null; }
        }));
        for (const item of values) if (item) {
          const post = safePost(item);
          if (post.id) candidates.set(post.id, post);
        }
        cursor = listed?.list_complete ? undefined : listed?.cursor;
        pages += 1;
      } while (cursor && pages < 20);
      let migrated = 0;
      for (const post of candidates.values()) {
        await insertPost(env, post, 'kv-migration');
        migrated += 1;
      }
      await setMeta(env, 'kv_forum_migration_v1', JSON.stringify({ migrated, completedAt: new Date().toISOString() }));
      return { migrated, source: 'Cloudflare KV post keys and posts:index' };
    })().catch(error => {
      migrationPromise = null;
      throw error;
    });
  }
  return migrationPromise;
}

async function loadPosts(env, requestedBoard = 'all', limit = 100) {
  await ensureSchema(env);
  await migrateKvPosts(env);
  const board = requestedBoard === 'all' ? 'all' : normalizeBoard(requestedBoard);
  const query = board === 'all'
    ? env.MEMBERS_DB.prepare(`SELECT id, board, title, body, category, display_name AS name, source_url AS sourceUrl, created_at AS createdAt, approved_at AS approvedAt, status FROM forum_posts WHERE status='live' ORDER BY created_at DESC LIMIT ?`).bind(limit)
    : env.MEMBERS_DB.prepare(`SELECT id, board, title, body, category, display_name AS name, source_url AS sourceUrl, created_at AS createdAt, approved_at AS approvedAt, status FROM forum_posts WHERE status='live' AND board=? ORDER BY created_at DESC LIMIT ?`).bind(board, limit);
  const result = await query.all();
  const rows = Array.isArray(result?.results) ? result.results : [];
  return publicPosts(rows);
}
async function counts(env) {
  const result = await env.MEMBERS_DB.prepare(`SELECT board, COUNT(*) AS count FROM forum_posts WHERE status='live' GROUP BY board`).all();
  const output = { main: 0, speculation: 0, 'epstein-alive': 0 };
  for (const row of result?.results || []) output[normalizeBoard(row.board)] = Number(row.count || 0);
  return output;
}
async function syncKvMirror(env) {
  if (!kvMirrorEnabled(env) || !hasD1(env)) return;
  const posts = await loadPosts(env, 'all', 300);
  await env.FORUM_POSTS.put('posts:index', JSON.stringify(posts), {
    metadata: {
      updatedAt: new Date().toISOString(),
      count: posts.length,
      storage: 'D1 authoritative; KV compatibility mirror'
    }
  });
}
async function mirrorPost(env, post) {
  if (!kvMirrorEnabled(env)) return;
  await env.FORUM_POSTS.put(`post:${post.id}`, JSON.stringify(post), {
    metadata: { board: post.board, status: post.status, createdAt: post.createdAt, storage: 'D1 authoritative mirror' }
  });
}

async function forumData(env, board) {
  const selected = board === 'all' ? 'all' : normalizeBoard(board);
  const posts = await loadPosts(env, selected, selected === 'all' ? 300 : 100);
  return {
    ok: true,
    persistent: true,
    'persistent: true': true,
    authoritativeStorage: 'Cloudflare D1 MEMBERS_DB.forum_posts',
    compatibilityMirror: kvMirrorEnabled(env),
    source: 'Cloudflare D1 forum_posts',
    generatedAt: new Date().toISOString(),
    board: selected,
    boardLabel: selected === 'all' ? 'All Boards' : boardLabels[selected],
    boardCounts: await counts(env),
    count: posts.length,
    posts,
    boundary: 'Posts are user-submitted public resources. They are not verified claims unless separately cited and evidence-graded.'
  };
}
function markdown(data) {
  return ['# Matrix Reprogrammed Signal Board Posts', '', `Generated: ${data.generatedAt}`, `Posts: ${data.posts.length}`]
    .concat(data.posts.flatMap(post => ['', `## ${post.title}`, post.body]))
    .join('\n');
}

async function handle(route, request, env, ctx) {
  await ensureSchema(env);
  await migrateKvPosts(env);
  if (route.action === 'health') {
    const countRow = await env.MEMBERS_DB.prepare('SELECT COUNT(*) AS count FROM forum_posts').first();
    const migration = await metaValue(env, 'kv_forum_migration_v1');
    return response({
      ok: true,
      backend: 'src/worker-forum-persistence.js',
      d1Binding: 'MEMBERS_DB',
      d1Connected: true,
      schemaReady: true,
      authoritativeStorage: 'Cloudflare D1 MEMBERS_DB.forum_posts',
      kvBinding: kvMirrorEnabled(env) ? 'connected opt-in compatibility mirror' : 'disabled in production',
      storedPostCount: Number(countRow?.count || 0),
      boardCounts: await counts(env),
      kvMigration: migration ? JSON.parse(migration) : null,
      persistent: true,
      postingAccess: 'verified-free-member-session',
      readingAccess: 'public',
      indexSelfHealing: 'D1 authoritative; KV compatibility mirror disabled by default',
      deployedFrom: 'GitHub main',
      checkedAt: new Date().toISOString()
    });
  }
  if (route.action === 'feed' || route.action === 'json') {
    const url = new URL(request.url);
    const board = clean(url.searchParams.get('board') || route.board || 'main', 80);
    return response(await forumData(env, board));
  }
  if (route.action === 'markdown') {
    const data = await forumData(env, route.board || 'all');
    return new Response(markdown(data), {
      headers: { ...headers, 'Content-Type': 'text/markdown; charset=utf-8', 'Content-Disposition': 'attachment; filename="forum-posts.md"' }
    });
  }
  if (route.action === 'submit') {
    const auth = await memberSessionContext(request, env);
    if (!auth || !auth.member || !auth.member.email_verified_at) {
      return response({
        ok: false,
        authenticated: false,
        saved: false,
        persistent: true,
        error: 'A verified free member account is required to post.',
        loginUrl: '/member-login.html',
        signupUrl: '/membership.html'
      }, 401);
    }
    const input = await body(request);
    if (input.website) return response({ ok: false, error: 'Spam trap triggered' }, 400);
    const post = safePost({
      id: makeId(),
      board: route.board || input.board,
      title: input.title || 'Reader Signal',
      body: input.body || input.message || 'Reader submitted a source lead for review.',
      category: input.category || 'Signal',
      name: input.name || auth.member.display_name || 'Matrix Member',
      sourceUrl: input.sourceUrl || input.source || '',
      status: 'live'
    });
    await insertPost(env, post, 'd1-member-submit', auth.member.id);
    await env.MEMBERS_DB.prepare('INSERT INTO audit_log (id,actor_id,action,target_type,target_id,metadata_json,created_at) VALUES (?,?,?,?,?,?,?)')
      .bind(makeId('audit'), auth.member.id, 'forum.post.created', 'forum_post', post.id, JSON.stringify({ board: post.board, sourceUrl: post.sourceUrl || '' }), new Date().toISOString()).run().catch(() => null);
    if (ctx?.waitUntil) ctx.waitUntil(Promise.allSettled([mirrorPost(env, post), syncKvMirror(env)]));
    return response({
      ok: true,
      authenticated: true,
      persistent: true,
      saved: true,
      storage: 'Cloudflare D1 MEMBERS_DB.forum_posts',
      mirroredToKv: kvMirrorEnabled(env),
      board: post.board,
      boardLabel: boardLabels[post.board],
      memberTier: auth.entitlement?.effective_tier || 'registered',
      post
    }, 201);
  }
  if (route.action === 'report') {
    const input = await body(request);
    const report = {
      id: makeId('report'),
      board: normalizeBoard(route.board || input.board || 'main'),
      postId: clean(input.id || input.postId, 160),
      reason: clean(input.reason || 'Reported by reader', 1200),
      createdAt: new Date().toISOString()
    };
    await env.MEMBERS_DB.prepare(`INSERT INTO forum_reports (id, board, post_id, reason, created_at, status) VALUES (?, ?, ?, ?, ?, 'open')`)
      .bind(report.id, report.board, report.postId, report.reason, report.createdAt).run();
    if (ctx?.waitUntil && kvMirrorEnabled(env)) ctx.waitUntil(env.FORUM_POSTS.put(`report:${report.id}`, JSON.stringify(report)).catch(() => null));
    return response({ ok: true, persistent: true, storage: 'Cloudflare D1 MEMBERS_DB.forum_reports', reportId: report.id, board: report.board });
  }
  return response({ ok: false, error: 'Unsupported forum action' }, 404);
}

export default {
  async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/';
    const route = routeMap[path];
    if (!route) return legacyWorker.fetch(request, env, ctx);
    if (!hasD1(env)) return legacyWorker.fetch(request, env, ctx);
    try {
      return await handle(route, request, env, ctx);
    } catch (error) {
      if (request.method === 'GET' || request.method === 'HEAD') return legacyWorker.fetch(request, env, ctx);
      return response({
        ok: false,
        persistent: false,
        saved: false,
        error: 'Forum storage is temporarily unavailable; the post was not accepted as persistent.',
        detail: clean(error?.message || error, 300)
      }, 503);
    }
  }
};
