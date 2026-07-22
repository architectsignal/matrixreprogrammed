const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { spawnSync } = require('child_process');

const root = process.cwd();
const reportDir = path.join(root, 'downloads');
fs.mkdirSync(reportDir, { recursive: true });

class MockKV {
  constructor() { this.data = new Map(); }
  async get(key) { return this.data.has(key) ? this.data.get(key) : null; }
  async put(key, value) { this.data.set(key, String(value)); }
}

class MockStatement {
  constructor(db, sql) { this.db = db; this.sql = String(sql); this.args = []; }
  bind(...args) { this.args = args; return this; }

  async run() {
    const sql = this.sql;
    if (sql.includes('INSERT INTO members')) {
      const [id, email, displayName, source, createdAt, updatedAt] = this.args;
      const key = String(email).toLowerCase();
      const existing = this.db.membersByEmail.get(key);
      const row = existing ? {
        ...existing,
        display_name: displayName || existing.display_name,
        status: existing.status === 'deleted' ? 'deleted' : 'pending',
        marketing_status: existing.marketing_status === 'suppressed' ? 'suppressed' : 'pending',
        source,
        updated_at: updatedAt
      } : {
        id, email: key, display_name: displayName, role: 'member', tier: 'free', status: 'pending',
        marketing_status: 'pending', source, email_verified_at: null, created_at: createdAt,
        updated_at: updatedAt, last_login_at: null
      };
      this.db.membersByEmail.set(key, row);
      this.db.membersById.set(row.id, row);
      return { success: true };
    }
    if (sql.includes('INSERT INTO email_consents')) {
      const [id, memberId, wordingVersion, sourcePage, grantedAt, createdAt] = this.args;
      this.db.consents.push({ id, member_id: memberId, wording_version: wordingVersion, source_page: sourcePage, granted_at: grantedAt, created_at: createdAt, granted: 1 });
      return { success: true };
    }
    if (sql.includes('INSERT INTO audit_log')) {
      this.db.audit.push({ args: this.args });
      return { success: true };
    }
    if (sql.includes("UPDATE magic_links SET used_at=? WHERE member_id=? AND purpose=?")) {
      const [usedAt, memberId, purpose] = this.args;
      for (const row of this.db.magicByHash.values()) {
        if (row.member_id === memberId && row.purpose === purpose && !row.used_at) row.used_at = usedAt;
      }
      return { success: true };
    }
    if (sql.includes('INSERT INTO magic_links')) {
      const [id, memberId, tokenHash, purpose, expiresAt, createdAt] = this.args;
      const row = { id, member_id: memberId, token_hash: tokenHash, purpose, expires_at: expiresAt, used_at: null, created_at: createdAt };
      this.db.magicByHash.set(tokenHash, row);
      this.db.magicById.set(id, row);
      return { success: true };
    }
    if (sql.includes('UPDATE magic_links SET used_at=? WHERE id=?')) {
      const [usedAt, id] = this.args;
      const row = this.db.magicById.get(id);
      if (row) row.used_at = usedAt;
      return { success: true };
    }
    if (sql.includes("UPDATE members SET status='active'")) {
      const [verifiedAt, updatedAt, id] = this.args;
      const row = this.db.membersById.get(id);
      if (row) {
        row.status = 'active';
        if (row.marketing_status !== 'suppressed') row.marketing_status = 'subscribed';
        row.email_verified_at = row.email_verified_at || verifiedAt;
        row.updated_at = updatedAt;
        this.db.membersByEmail.set(row.email, row);
      }
      return { success: true };
    }
    if (sql.includes('INSERT INTO member_sessions')) {
      const [id, memberId, sessionHash, expiresAt, createdAt, lastSeenAt] = this.args;
      const row = { id, member_id: memberId, session_hash: sessionHash, expires_at: expiresAt, created_at: createdAt, last_seen_at: lastSeenAt, revoked_at: null };
      this.db.sessionsByHash.set(sessionHash, row);
      this.db.sessionsById.set(id, row);
      return { success: true };
    }
    if (sql.includes('UPDATE members SET last_login_at=')) {
      const [lastLoginAt, updatedAt, id] = this.args;
      const row = this.db.membersById.get(id);
      if (row) {
        row.last_login_at = lastLoginAt;
        row.updated_at = updatedAt;
        this.db.membersByEmail.set(row.email, row);
      }
      return { success: true };
    }
    if (sql.includes('UPDATE member_sessions SET last_seen_at=')) {
      const [lastSeenAt, id] = this.args;
      const row = this.db.sessionsById.get(id);
      if (row) row.last_seen_at = lastSeenAt;
      return { success: true };
    }
    if (sql.includes('UPDATE member_sessions SET revoked_at=')) {
      const [revokedAt, sessionHash] = this.args;
      const row = this.db.sessionsByHash.get(sessionHash);
      if (row && !row.revoked_at) row.revoked_at = revokedAt;
      return { success: true };
    }
    if (sql.includes('UPDATE members SET marketing_status')) {
      const [updatedAt, email] = this.args;
      const row = this.db.membersByEmail.get(String(email).toLowerCase());
      if (row) { row.marketing_status = 'unsubscribed'; row.updated_at = updatedAt; }
      return { success: true };
    }
    throw new Error('Unhandled mock D1 run SQL: ' + sql.slice(0, 180));
  }

  async first() {
    const sql = this.sql;
    if (sql.includes('FROM members WHERE email=?')) return this.db.membersByEmail.get(String(this.args[0]).toLowerCase()) || null;
    if (sql.includes('FROM members WHERE id=?')) return this.db.membersById.get(String(this.args[0])) || null;
    if (sql.includes('FROM magic_links WHERE token_hash=?')) return this.db.magicByHash.get(String(this.args[0])) || null;
    if (sql.includes('FROM member_sessions WHERE session_hash=?')) return this.db.sessionsByHash.get(String(this.args[0])) || null;
    if (sql.includes('FROM subscriptions WHERE member_id=?')) return null;
    if (sql.includes('COUNT(*) AS count FROM members')) return { count: this.db.membersByEmail.size };
    if (sql.includes('COUNT(*) AS count FROM magic_links')) return { count: this.db.magicByHash.size };
    if (sql.includes('COUNT(*) AS count FROM member_sessions')) return { count: this.db.sessionsByHash.size };
    return null;
  }

  async all() {
    if (this.sql.includes('FROM members')) return { results: [...this.db.membersByEmail.values()] };
    return { results: [] };
  }
}

class MockD1 {
  constructor() {
    this.membersByEmail = new Map();
    this.membersById = new Map();
    this.magicByHash = new Map();
    this.magicById = new Map();
    this.sessionsByHash = new Map();
    this.sessionsById = new Map();
    this.consents = [];
    this.audit = [];
  }
  prepare(sql) { return new MockStatement(this, sql); }
}

function jsonRequest(url, body, headers = {}) {
  return new Request(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
}

async function readJson(response) {
  const text = await response.text();
  try { return JSON.parse(text); } catch { return { parseError: text.slice(0, 300) }; }
}

function extractLink(email) {
  const source = String(email.htmlContent || '') + '\n' + String(email.textContent || '');
  const match = source.match(/https:\/\/[^\s"<]+\/api\/auth\/verify\?purpose=[^\s"<]+/);
  return match ? match[0].replace(/&amp;/g, '&') : '';
}

async function main() {
  const patch = spawnSync(process.execPath, ['scripts/patch-worker-newsletter-system.js'], { cwd: root, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  if (patch.stdout) process.stdout.write(patch.stdout);
  if (patch.stderr) process.stderr.write(patch.stderr);
  if (patch.status !== 0) throw new Error('membership auth patch chain failed');

  const workerFile = path.join(root, 'src', 'worker.js');
  const source = fs.readFileSync(workerFile, 'utf8');
  const tempFile = path.join(reportDir, '.membership-auth-worker-' + Date.now() + '.mjs');
  fs.writeFileSync(tempFile, source);
  let module;
  try { module = await import(pathToFileURL(tempFile).href + '?v=' + Date.now()); }
  finally { try { fs.unlinkSync(tempFile); } catch {} }
  const worker = module && module.default;
  if (!worker || typeof worker.fetch !== 'function') throw new Error('Worker fetch handler unavailable');

  const outbound = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    if (String(url) === 'https://api.brevo.com/v3/smtp/email') {
      const body = JSON.parse(options.body || '{}');
      outbound.push(body);
      return new Response(JSON.stringify({ messageId: 'brevo-test-' + outbound.length }), { status: 201, headers: { 'content-type': 'application/json' } });
    }
    return originalFetch(url, options);
  };

  const checks = [];
  const d1 = new MockD1();
  const env = {
    MEMBERS_DB: d1,
    FORUM_POSTS: new MockKV(),
    BREVO_API_KEY: 'test-api-key',
    MEMBERS_FROM_EMAIL: 'members@matrixreprogrammed.com',
    MEMBERS_FROM_NAME: 'Matrix Reprogrammed'
  };

  try {
    const signupResponse = await worker.fetch(jsonRequest('https://matrixreprogrammed.com/api/membership/signup', {
      email: 'member@example.com', name: 'Test Member', marketingConsent: true,
      consentVersion: 'membership-consent-v1', source: 'auth-test', sourcePage: '/membership.html'
    }), env);
    const signup = await readJson(signupResponse);
    checks.push({ name: 'signup persists pending member and sends verification email', ok: signupResponse.status === 202 && signup.ok === true && signup.emailSent === true && signup.status === 'pending-verification' && outbound.length === 1 });

    const verifyLink = extractLink(outbound[0] || {});
    const verifyToken = new URL(verifyLink).searchParams.get('token') || '';
    const storedMagic = [...d1.magicByHash.values()][0];
    checks.push({ name: 'verification email contains one-time link', ok: /purpose=verify_email/.test(verifyLink) && verifyToken.length >= 32 });
    checks.push({ name: 'raw verification token is never stored', ok: storedMagic && storedMagic.token_hash.length === 64 && storedMagic.token_hash !== verifyToken && !JSON.stringify(storedMagic).includes(verifyToken) });

    const verifyResponse = await worker.fetch(new Request(verifyLink), env);
    const sessionCookieHeader = verifyResponse.headers.get('set-cookie') || '';
    const sessionCookie = sessionCookieHeader.split(';')[0];
    const verifiedMember = d1.membersByEmail.get('member@example.com');
    checks.push({ name: 'verification activates member and creates secure cookie', ok: verifyResponse.status === 303 && verifiedMember.status === 'active' && verifiedMember.marketing_status === 'subscribed' && Boolean(verifiedMember.email_verified_at) && /(?:matrix_session_v2|matrix_session)=/.test(sessionCookieHeader) && /HttpOnly/.test(sessionCookieHeader) && /Secure/.test(sessionCookieHeader) && /SameSite=Lax/.test(sessionCookieHeader) });

    const meResponse = await worker.fetch(new Request('https://matrixreprogrammed.com/api/member/me', { headers: { cookie: sessionCookie } }), env);
    const me = await readJson(meResponse);
    checks.push({ name: 'authenticated member identity endpoint returns safe account data', ok: meResponse.status === 200 && me.authenticated === true && me.member.email === 'member@example.com' && me.member.tier === 'free' && me.paidAccessEnabled === false });

    const reusedResponse = await worker.fetch(new Request(verifyLink), env);
    checks.push({ name: 'verification link is single-use', ok: reusedResponse.status === 303 && /expired-or-used/.test(reusedResponse.headers.get('location') || '') });

    const logoutResponse = await worker.fetch(new Request('https://matrixreprogrammed.com/api/auth/logout', { method: 'POST', headers: { cookie: sessionCookie } }), env);
    checks.push({ name: 'logout revokes server session and clears cookie', ok: logoutResponse.status === 200 && /Max-Age=0/.test(logoutResponse.headers.get('set-cookie') || '') && [...d1.sessionsByHash.values()].some(row => Boolean(row.revoked_at)) });

    const meAfterLogout = await worker.fetch(new Request('https://matrixreprogrammed.com/api/member/me', { headers: { cookie: sessionCookie } }), env);
    checks.push({ name: 'revoked session cannot access member identity', ok: meAfterLogout.status === 401 });

    const knownLoginResponse = await worker.fetch(jsonRequest('https://matrixreprogrammed.com/api/auth/request-link', { email: 'member@example.com' }), env);
    const knownLogin = await readJson(knownLoginResponse);
    const outboundBeforeUnknown = outbound.length;
    const unknownLoginResponse = await worker.fetch(jsonRequest('https://matrixreprogrammed.com/api/auth/request-link', { email: 'unknown@example.com' }), env);
    const unknownLogin = await readJson(unknownLoginResponse);
    checks.push({ name: 'login request response does not reveal account existence', ok: knownLoginResponse.status === 202 && unknownLoginResponse.status === 202 && knownLogin.message === unknownLogin.message && outbound.length === outboundBeforeUnknown });

    const loginLink = extractLink(outbound[outbound.length - 1] || {});
    const loginResponse = await worker.fetch(new Request(loginLink), env);
    checks.push({ name: 'verified member can create a new passwordless session', ok: loginResponse.status === 303 && /login=1/.test(loginResponse.headers.get('location') || '') && /(?:matrix_session_v2|matrix_session)=/.test(loginResponse.headers.get('set-cookie') || '') });

    const invalidResponse = await worker.fetch(new Request('https://matrixreprogrammed.com/api/auth/verify?purpose=login&token=invalid-token'), env);
    checks.push({ name: 'invalid magic token is rejected safely', ok: invalidResponse.status === 303 && /invalid|expired/.test(invalidResponse.headers.get('location') || '') });

    const healthResponse = await worker.fetch(new Request('https://matrixreprogrammed.com/api/auth/health'), env);
    const health = await readJson(healthResponse);
    checks.push({ name: 'auth health proves D1 schema and email configuration without PII', ok: healthResponse.status === 200 && health.ok === true && health.authSchemaReady === true && health.transactionalEmailConfigured === true && !JSON.stringify(health).includes('member@example.com') });

    const noMailResponse = await worker.fetch(jsonRequest('https://matrixreprogrammed.com/api/membership/signup', {
      email: 'saved-no-mail@example.com', marketingConsent: true, source: 'no-mail-test'
    }), { MEMBERS_DB: d1, FORUM_POSTS: new MockKV() });
    const noMail = await readJson(noMailResponse);
    checks.push({ name: 'member persistence stays truthful when email provider is absent', ok: noMailResponse.status === 202 && noMail.saved === true && noMail.emailSent === false && noMail.emailDeliveryConfigured === false && /not configured|failed/i.test(noMail.message || '') });
  } finally {
    globalThis.fetch = originalFetch;
  }

  for (const marker of [
    'membership-auth-v1:', "crypto.subtle.digest('SHA-256'", 'api.brevo.com/v3/smtp/email',
    "originalPath==='/api/auth/request-link'", "originalPath==='/api/auth/verify'",
    "originalPath==='/api/auth/logout'", "originalPath==='/api/member/me'"
  ]) checks.push({ name: 'Worker contains ' + marker, ok: source.includes(marker) });

  const report = {
    ok: checks.every(check => check.ok),
    generatedAt: new Date().toISOString(),
    checks,
    memberCount: d1.membersByEmail.size,
    verificationEmails: outbound.filter(item => /Verify/.test(item.subject || '')).length,
    loginEmails: outbound.filter(item => /login/i.test(item.subject || '')).length,
    boundary: 'Authentication is healthy only when raw tokens are never stored, links are single-use, verified accounts receive secure server-side sessions, logout revokes them, account existence is not disclosed, and email delivery status remains truthful.'
  };
  fs.writeFileSync(path.join(reportDir, 'membership-auth-test.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(reportDir, 'membership-auth-test.md'), '# Membership Authentication Test\n\nGenerated: ' + report.generatedAt + '\nResult: ' + (report.ok ? 'PASS' : 'FAIL') + '\n\n' + checks.map(check => '- ' + (check.ok ? 'PASS' : 'FAIL') + ': ' + check.name).join('\n'));
  if (!report.ok) {
    console.error('MEMBERSHIP AUTHENTICATION TEST FAILED');
    checks.filter(check => !check.ok).forEach(check => console.error('- ' + check.name));
    process.exit(1);
  }
  console.log('MEMBERSHIP AUTHENTICATION TEST PASSED');
}

main().catch(error => {
  const report = { ok: false, generatedAt: new Date().toISOString(), error: error.message, stack: error.stack };
  fs.writeFileSync(path.join(reportDir, 'membership-auth-test.json'), JSON.stringify(report, null, 2));
  console.error(error.stack || error.message);
  process.exit(1);
});
