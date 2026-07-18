const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const root = process.cwd();
const reportDir = path.join(root, 'downloads');
fs.mkdirSync(reportDir, { recursive: true });

class Statement {
  constructor(db, sql) { this.db = db; this.sql = String(sql); this.args = []; }
  bind(...args) { this.args = args; return this; }
  async run() {
    const sql = this.sql;
    if (sql.includes('UPDATE magic_links SET used_at=? WHERE member_id=? AND purpose=?')) {
      const [usedAt, memberId, purpose] = this.args;
      for (const row of this.db.magicByHash.values()) if (row.member_id === memberId && row.purpose === purpose && !row.used_at) row.used_at = usedAt;
      return { success: true };
    }
    if (sql.includes('INSERT INTO magic_links')) {
      const [id, memberId, tokenHash, purpose, expiresAt, createdAt] = this.args;
      const row = { id, member_id: memberId, token_hash: tokenHash, purpose, expires_at: expiresAt, created_at: createdAt, used_at: null };
      this.db.magicByHash.set(tokenHash, row); this.db.magicById.set(id, row); this.db.magicOrder.push(row);
      return { success: true };
    }
    if (sql.includes('UPDATE magic_links SET used_at=? WHERE id=?')) {
      const [usedAt, id] = this.args; const row = this.db.magicById.get(id); if (row) row.used_at = usedAt; return { success: true };
    }
    if (sql.includes('INSERT INTO audit_log')) { this.db.audit.push(this.args); return { success: true }; }
    if (sql.includes('INSERT INTO member_sessions')) {
      const [id, memberId, sessionHash, expiresAt, createdAt, lastSeenAt] = this.args;
      const row = { id, member_id: memberId, session_hash: sessionHash, expires_at: expiresAt, created_at: createdAt, last_seen_at: lastSeenAt, revoked_at: null };
      this.db.sessionsByHash.set(sessionHash, row); this.db.sessionsById.set(id, row); this.db.sessionOrder.push(row);
      return { success: true };
    }
    if (sql.includes('UPDATE members SET last_login_at=')) {
      const [lastLoginAt, updatedAt, id] = this.args; const row = this.db.membersById.get(id); if (row) { row.last_login_at = lastLoginAt; row.updated_at = updatedAt; } return { success: true };
    }
    if (sql.includes('UPDATE member_sessions SET last_seen_at=')) {
      const [lastSeenAt, id] = this.args; const row = this.db.sessionsById.get(id); if (row) row.last_seen_at = lastSeenAt; return { success: true };
    }
    if (sql.includes('UPDATE member_sessions SET revoked_at=')) {
      const [revokedAt, sessionHash] = this.args; const row = this.db.sessionsByHash.get(sessionHash); if (row && !row.revoked_at) row.revoked_at = revokedAt; return { success: true };
    }
    throw new Error('Unhandled passwordless D1 run SQL: ' + sql.slice(0, 220));
  }
  async first() {
    const sql = this.sql;
    if (sql.includes('FROM members WHERE email=?')) return this.db.membersByEmail.get(String(this.args[0]).toLowerCase()) || null;
    if (sql.includes('FROM members WHERE id=?')) return this.db.membersById.get(String(this.args[0])) || null;
    if (sql.includes('FROM magic_links WHERE token_hash=?')) return this.db.magicByHash.get(String(this.args[0])) || null;
    if (sql.includes('FROM member_sessions WHERE session_hash=?')) return this.db.sessionsByHash.get(String(this.args[0])) || null;
    if (sql.includes('FROM subscriptions WHERE member_id=?')) return null;
    if (sql.includes('FROM member_effective_entitlements WHERE member_id=?')) return null;
    return null;
  }
  async all() { return { results: [] }; }
}
class D1 {
  constructor() {
    const member = { id: 'member-passwordless-gate', email: 'controlled-account@example.com', display_name: 'Controlled Account', role: 'member', tier: 'free', status: 'active', marketing_status: 'subscribed', email_verified_at: '2026-07-18T00:00:00.000Z', created_at: '2026-07-18T00:00:00.000Z', updated_at: '2026-07-18T00:00:00.000Z', last_login_at: null };
    this.membersByEmail = new Map([[member.email, member]]); this.membersById = new Map([[member.id, member]]);
    this.magicByHash = new Map(); this.magicById = new Map(); this.magicOrder = [];
    this.sessionsByHash = new Map(); this.sessionsById = new Map(); this.sessionOrder = [];
    this.audit = [];
  }
  prepare(sql) { return new Statement(this, sql); }
}
function requestLink(email) {
  return new Request('https://matrixreprogrammed.com/api/auth/request-link', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) });
}
function extractLink(email) {
  const source = String(email.htmlContent || '') + '\n' + String(email.textContent || '');
  const match = source.match(/https:\/\/[^\s"<]+\/api\/auth\/verify\?purpose=[^\s"<]+/);
  return match ? match[0].replace(/&amp;/g, '&') : '';
}
async function responseJson(response) { const text = await response.text(); try { return JSON.parse(text); } catch { return { raw: text }; } }
function cookieFrom(response) { return String(response.headers.get('set-cookie') || '').split(';')[0]; }

async function main() {
  const source = fs.readFileSync(path.join(root, 'src', 'worker.js'), 'utf8');
  const temp = path.join(reportDir, `.passwordless-worker-${Date.now()}.mjs`);
  fs.writeFileSync(temp, source);
  let module;
  try { module = await import(pathToFileURL(temp).href + '?v=' + Date.now()); }
  finally { try { fs.unlinkSync(temp); } catch {} }
  const worker = module && module.default;
  if (!worker || typeof worker.fetch !== 'function') throw new Error('Worker fetch handler unavailable');

  const d1 = new D1();
  const outbound = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    if (String(url) === 'https://api.brevo.com/v3/smtp/email') {
      outbound.push(JSON.parse(options.body || '{}'));
      return new Response(JSON.stringify({ messageId: `controlled-${outbound.length}` }), { status: 201, headers: { 'content-type': 'application/json' } });
    }
    return originalFetch(url, options);
  };
  const env = { MEMBERS_DB: d1, BREVO_API_KEY: 'controlled-test-key', MEMBERS_FROM_EMAIL: 'members@matrixreprogrammed.com', MEMBERS_FROM_NAME: 'Matrix Reprogrammed' };
  const checks = [];
  const check = (name, ok, detail = '') => checks.push({ name, ok: Boolean(ok), detail });

  try {
    const firstRequest = await worker.fetch(requestLink('controlled-account@example.com'), env);
    const firstBody = await responseJson(firstRequest);
    const firstLink = extractLink(outbound[0] || {});
    check('first controlled login request accepted', firstRequest.status === 202 && firstBody.accepted === true && Boolean(firstLink), `status=${firstRequest.status}`);

    const secondRequest = await worker.fetch(requestLink('controlled-account@example.com'), env);
    const secondLink = extractLink(outbound[1] || {});
    check('resend creates a distinct newest link', secondRequest.status === 202 && Boolean(secondLink) && firstLink !== secondLink, `emails=${outbound.length}`);
    check('resend revokes every earlier unused link for the same purpose', d1.magicOrder.length === 2 && Boolean(d1.magicOrder[0].used_at) && !d1.magicOrder[1].used_at, JSON.stringify(d1.magicOrder.map(row => ({ used: Boolean(row.used_at), purpose: row.purpose }))));

    const oldLinkResponse = await worker.fetch(new Request(firstLink), env);
    check('superseded login link is rejected', oldLinkResponse.status === 303 && /expired-or-used/.test(oldLinkResponse.headers.get('location') || ''), oldLinkResponse.headers.get('location') || '');

    const newestResponse = await worker.fetch(new Request(secondLink), env);
    const activeCookie = cookieFrom(newestResponse);
    check('newest login link creates a secure session', newestResponse.status === 303 && /matrix_session=/.test(activeCookie) && /login=1/.test(newestResponse.headers.get('location') || ''), newestResponse.headers.get('location') || '');

    const thirdRequest = await worker.fetch(requestLink('controlled-account@example.com'), env);
    const expiredLink = extractLink(outbound[2] || {});
    const expiringRecord = d1.magicOrder[d1.magicOrder.length - 1];
    expiringRecord.expires_at = '2000-01-01T00:00:00.000Z';
    const expiredLinkResponse = await worker.fetch(new Request(expiredLink), env);
    check('expired magic link is rejected', thirdRequest.status === 202 && expiredLinkResponse.status === 303 && /expired-or-used/.test(expiredLinkResponse.headers.get('location') || ''), expiredLinkResponse.headers.get('location') || '');

    const activeSession = d1.sessionOrder[d1.sessionOrder.length - 1];
    activeSession.expires_at = '2000-01-01T00:00:00.000Z';
    const expiredSessionResponse = await worker.fetch(new Request('https://matrixreprogrammed.com/api/member/me', { headers: { cookie: activeCookie } }), env);
    check('expired session cannot access member data', expiredSessionResponse.status === 401, `status=${expiredSessionResponse.status}`);

    await worker.fetch(requestLink('controlled-account@example.com'), env);
    const freshLink = extractLink(outbound[3] || {});
    const freshLogin = await worker.fetch(new Request(freshLink), env);
    const freshCookie = cookieFrom(freshLogin);
    const beforeLogout = await worker.fetch(new Request('https://matrixreprogrammed.com/api/member/me', { headers: { cookie: freshCookie } }), env);
    const logout = await worker.fetch(new Request('https://matrixreprogrammed.com/api/auth/logout', { method: 'POST', headers: { cookie: freshCookie } }), env);
    const afterLogout = await worker.fetch(new Request('https://matrixreprogrammed.com/api/member/me', { headers: { cookie: freshCookie } }), env);
    check('fresh controlled session works before logout', beforeLogout.status === 200, `status=${beforeLogout.status}`);
    check('logout revokes controlled session and clears browser cookie', logout.status === 200 && /Max-Age=0/.test(logout.headers.get('set-cookie') || '') && afterLogout.status === 401, `logout=${logout.status} after=${afterLogout.status}`);

    check('raw passwordless tokens are never stored', d1.magicOrder.every(row => /^[a-f0-9]{64}$/.test(row.token_hash)) && !d1.magicOrder.some(row => [firstLink, secondLink, expiredLink, freshLink].some(link => link && JSON.stringify(row).includes(new URL(link).searchParams.get('token') || ''))), `${d1.magicOrder.length} hashed rows`);
  } finally {
    globalThis.fetch = originalFetch;
  }

  const report = {
    ok: checks.every(item => item.ok),
    generatedAt: new Date().toISOString(),
    controlledAccount: 'controlled-account@example.com',
    emailCount: outbound.length,
    magicLinkRows: d1.magicOrder.length,
    sessionRows: d1.sessionOrder.length,
    checks,
    boundary: 'This deterministic controlled-account test proves newest-link-only resend semantics, one-time use, magic-link expiry, server-session expiry, logout revocation and hashed-token storage without sending to a real external mailbox.'
  };
  fs.writeFileSync(path.join(reportDir, 'passwordless-resend-expiry-test.json'), JSON.stringify(report, null, 2));
  if (!report.ok) {
    console.error('PASSWORDLESS RESEND AND EXPIRY TEST FAILED');
    checks.filter(item => !item.ok).forEach(item => console.error(`- ${item.name}: ${item.detail}`));
    process.exit(1);
  }
  console.log('PASSWORDLESS RESEND AND EXPIRY TEST PASSED');
}

main().catch(error => {
  fs.writeFileSync(path.join(reportDir, 'passwordless-resend-expiry-test.json'), JSON.stringify({ ok: false, generatedAt: new Date().toISOString(), error: error.message, stack: error.stack }, null, 2));
  console.error(error.stack || error.message);
  process.exit(1);
});
