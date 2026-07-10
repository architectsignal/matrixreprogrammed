const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

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
    if (this.sql.includes('INSERT INTO members')) {
      const [id, email, displayName, source, createdAt, updatedAt] = this.args;
      const existing = this.db.members.get(String(email).toLowerCase());
      this.db.members.set(String(email).toLowerCase(), existing ? {
        ...existing,
        display_name: displayName || existing.display_name,
        status: existing.status === 'deleted' ? 'deleted' : 'pending',
        marketing_status: existing.marketing_status === 'suppressed' ? 'suppressed' : 'pending',
        source,
        updated_at: updatedAt
      } : {
        id, email: String(email).toLowerCase(), display_name: displayName, role: 'member', tier: 'free',
        status: 'pending', marketing_status: 'pending', source, email_verified_at: null,
        created_at: createdAt, updated_at: updatedAt, last_login_at: null
      });
      return { success: true };
    }
    if (this.sql.includes('INSERT INTO email_consents')) {
      const [id, memberId, wordingVersion, sourcePage, grantedAt, createdAt] = this.args;
      this.db.consents.push({ id, member_id: memberId, wording_version: wordingVersion, source_page: sourcePage, granted_at: grantedAt, created_at: createdAt, granted: 1 });
      return { success: true };
    }
    if (this.sql.includes('INSERT INTO audit_log')) {
      this.db.audit.push({ args: this.args });
      return { success: true };
    }
    if (this.sql.includes('UPDATE members SET marketing_status')) {
      const [updatedAt, email] = this.args;
      const key = String(email).toLowerCase();
      const existing = this.db.members.get(key);
      if (existing) this.db.members.set(key, { ...existing, marketing_status: 'unsubscribed', updated_at: updatedAt });
      return { success: true };
    }
    throw new Error(`Unhandled mock D1 run SQL: ${this.sql.slice(0, 120)}`);
  }
  async first() {
    if (this.sql.includes('FROM members WHERE email=?')) return this.db.members.get(String(this.args[0]).toLowerCase()) || null;
    return null;
  }
  async all() {
    if (this.sql.includes('FROM members')) return { results: [...this.db.members.values()] };
    return { results: [] };
  }
}

class MockD1 {
  constructor() { this.members = new Map(); this.consents = []; this.audit = []; }
  prepare(sql) { return new MockStatement(this, sql); }
}

function jsonRequest(url, body, headers = {}) {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body)
  });
}

async function readJson(response) {
  const text = await response.text();
  try { return JSON.parse(text); } catch { return { parseError: text.slice(0, 300) }; }
}

async function main() {
  const workerFile = path.join(root, 'src', 'worker.js');
  const migrationFile = path.join(root, 'migrations', '0001_membership_foundation.sql');
  if (!fs.existsSync(workerFile)) throw new Error('src/worker.js missing');
  if (!fs.existsSync(migrationFile)) throw new Error('membership migration missing');

  const source = fs.readFileSync(workerFile, 'utf8');
  const migration = fs.readFileSync(migrationFile, 'utf8');
  const tempFile = path.join(reportDir, `.membership-worker-test-${Date.now()}.mjs`);
  fs.writeFileSync(tempFile, source);
  let module;
  try {
    module = await import(`${pathToFileURL(tempFile).href}?v=${Date.now()}`);
  } finally {
    try { fs.unlinkSync(tempFile); } catch {}
  }
  const worker = module && module.default;
  if (!worker || typeof worker.fetch !== 'function') throw new Error('Worker default fetch handler unavailable');

  const checks = [];
  const d1 = new MockD1();
  const kv = new MockKV();
  const env = { MEMBERS_DB: d1, FORUM_POSTS: kv, ADMIN_API_TOKEN: 'admin-test-secret' };

  const signupResponse = await worker.fetch(jsonRequest('https://matrixreprogrammed.com/api/membership/signup', {
    email: 'member@example.com',
    name: 'Test Member',
    marketingConsent: true,
    consentVersion: 'membership-consent-v1',
    source: 'membership-test',
    sourcePage: '/membership.html'
  }), env);
  const signup = await readJson(signupResponse);
  checks.push({ name: 'D1 signup returns pending verification', ok: signupResponse.status === 202 && signup.ok === true && signup.saved === true && signup.status === 'pending-verification' && signup.storage === 'Cloudflare D1 MEMBERS_DB' });
  checks.push({ name: 'D1 member row created', ok: d1.members.has('member@example.com') && d1.members.get('member@example.com').tier === 'free' });
  checks.push({ name: 'D1 consent row created', ok: d1.consents.length === 1 && d1.consents[0].wording_version === 'membership-consent-v1' });
  checks.push({ name: 'D1 audit row created', ok: d1.audit.length === 1 });

  const repeatResponse = await worker.fetch(jsonRequest('https://matrixreprogrammed.com/newsletter-signup', {
    email: 'member@example.com', name: 'Updated Member', marketingConsent: 'true', source: 'repeat-test'
  }), env);
  const repeat = await readJson(repeatResponse);
  checks.push({ name: 'repeat signup is idempotent', ok: repeatResponse.status === 202 && repeat.ok === true && d1.members.size === 1 && d1.members.get('member@example.com').display_name === 'Updated Member' });

  const noConsentResponse = await worker.fetch(jsonRequest('https://matrixreprogrammed.com/api/membership/signup', { email: 'no-consent@example.com' }), env);
  const noConsent = await readJson(noConsentResponse);
  checks.push({ name: 'explicit consent required', ok: noConsentResponse.status === 400 && noConsent.ok === false && /consent/i.test(noConsent.error || '') });

  const invalidResponse = await worker.fetch(jsonRequest('https://matrixreprogrammed.com/api/membership/signup', { email: 'not-an-email', marketingConsent: true }), env);
  checks.push({ name: 'invalid email rejected', ok: invalidResponse.status === 400 });

  const deniedResponse = await worker.fetch(new Request('https://matrixreprogrammed.com/api/admin/members'), env);
  const denied = await readJson(deniedResponse);
  checks.push({ name: 'member list denied without admin token', ok: deniedResponse.status === 403 && denied.ok === false });

  const adminResponse = await worker.fetch(new Request('https://matrixreprogrammed.com/api/admin/members', { headers: { 'x-admin-token': 'admin-test-secret' } }), env);
  const admin = await readJson(adminResponse);
  checks.push({ name: 'member list available with admin token', ok: adminResponse.status === 200 && admin.ok === true && admin.count === 1 && admin.subscribers[0].email === 'member@example.com' });

  const hiddenResponse = await worker.fetch(new Request('https://matrixreprogrammed.com/newsletter-subscribers.json'), { MEMBERS_DB: d1 });
  checks.push({ name: 'member list hidden when admin secret is not configured', ok: hiddenResponse.status === 404 });

  const healthResponse = await worker.fetch(new Request('https://matrixreprogrammed.com/api/membership/health'), env);
  const health = await readJson(healthResponse);
  checks.push({ name: 'membership health reports D1 without exposing PII', ok: healthResponse.status === 200 && health.ok === true && health.d1Connected === true && health.members === 1 && !JSON.stringify(health).includes('member@example.com') });

  const fallbackEnv = { FORUM_POSTS: new MockKV(), ADMIN_API_TOKEN: 'fallback-admin' };
  const fallbackResponse = await worker.fetch(jsonRequest('https://matrixreprogrammed.com/api/membership/signup', { email: 'fallback@example.com', marketingConsent: true }), fallbackEnv);
  const fallback = await readJson(fallbackResponse);
  checks.push({ name: 'KV compatibility fallback remains truthful', ok: fallbackResponse.status === 202 && fallback.ok === true && /KV/.test(fallback.storage || '') });

  const missingResponse = await worker.fetch(jsonRequest('https://matrixreprogrammed.com/api/membership/signup', { email: 'missing@example.com', marketingConsent: true }), {});
  const missing = await readJson(missingResponse);
  checks.push({ name: 'missing storage cannot claim success', ok: missingResponse.status === 503 && missing.ok === false && missing.saved === false && missing.persistent === false });

  for (const marker of ['CREATE TABLE IF NOT EXISTS members', 'CREATE TABLE IF NOT EXISTS email_consents', 'CREATE TABLE IF NOT EXISTS subscriptions', "provider TEXT NOT NULL DEFAULT 'paypal'"]) {
    checks.push({ name: `migration contains ${marker}`, ok: migration.includes(marker) });
  }
  checks.push({ name: 'public unprotected subscriber response removed', ok: !source.includes("return json({ok:true,count:subscribers.length,subscribers})") });

  const report = {
    ok: checks.every(check => check.ok),
    generatedAt: new Date().toISOString(),
    checks,
    d1MemberCount: d1.members.size,
    d1ConsentCount: d1.consents.length,
    boundary: 'Phase 1 is healthy only when signups persist to D1, consent is recorded, missing storage cannot claim success, and member lists require administrator authentication.'
  };
  fs.writeFileSync(path.join(reportDir, 'membership-foundation-test.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(reportDir, 'membership-foundation-test.md'), '# Membership Foundation Test\n\nGenerated: '+report.generatedAt+'\nResult: '+(report.ok?'PASS':'FAIL')+'\n\n'+checks.map(c=>`- ${c.ok?'PASS':'FAIL'}: ${c.name}`).join('\n'));
  if (!report.ok) {
    console.error('MEMBERSHIP FOUNDATION TEST FAILED');
    checks.filter(check => !check.ok).forEach(check => console.error(`- ${check.name}`));
    process.exit(1);
  }
  console.log('MEMBERSHIP FOUNDATION TEST PASSED');
}

main().catch(error => {
  const report = { ok: false, generatedAt: new Date().toISOString(), error: error.message, stack: error.stack };
  fs.writeFileSync(path.join(reportDir, 'membership-foundation-test.json'), JSON.stringify(report, null, 2));
  console.error(error.stack || error.message);
  process.exit(1);
});
