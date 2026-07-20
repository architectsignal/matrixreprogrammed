const fs = require('fs');
const path = require('path');

const root = process.cwd();
const changed = [];
const reportPath = path.join(root, 'downloads', 'release-forum-contract-reconciliation.json');

function read(relative) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) throw new Error(`Required reconciliation file missing: ${relative}`);
  return fs.readFileSync(file, 'utf8');
}
function write(relative, content) {
  const file = path.join(root, relative);
  const before = fs.readFileSync(file, 'utf8');
  if (before === content) return false;
  fs.writeFileSync(file, content);
  changed.push(relative);
  return true;
}

// Preserve the canonical apex/www shared session. The reader continues to
// accept the old cookie temporarily, but all new sessions use matrix_session_v2.
{
  const relative = 'src/worker.js';
  let source = read(relative);
  source = source.replace(
    /function authSessionCookie\(token,maxAge=2592000\)\{return 'matrix_session='\+encodeURIComponent\(token\)\+'; Domain=matrixreprogrammed\.com; Path=\/; Max-Age='\+maxAge\+'; HttpOnly; Secure; SameSite=Lax'\}/,
    "function authSessionCookie(token,maxAge=2592000){return 'matrix_session_v2='+encodeURIComponent(token)+'; Domain=matrixreprogrammed.com; Path=/; Max-Age='+maxAge+'; HttpOnly; Secure; SameSite=Lax'}"
  );
  if (!source.includes("return values.matrix_session_v2||values.matrix_session||''")) throw new Error('Worker no longer accepts the temporary legacy session fallback');
  if (!source.includes("function authSessionCookie(token,maxAge=2592000){return 'matrix_session_v2='")) throw new Error('Worker canonical matrix_session_v2 cookie was not restored');
  write(relative, source);
}

// Duplicate IDs must fail closed. Successful writes require one exact insert
// and a read-after-write proof from Cloudflare D1.
{
  const relative = 'src/worker-forum-persistence.js';
  let source = read(relative).replace(/INSERT OR IGNORE INTO forum_posts/g, 'INSERT INTO forum_posts');
  for (const marker of ['INSERT INTO forum_posts', 'D1 did not confirm the forum insert', 'D1 forum read-after-write confirmation failed']) {
    if (!source.includes(marker)) throw new Error(`Strict forum persistence marker missing: ${marker}`);
  }
  if (source.includes('INSERT OR IGNORE INTO forum_posts')) throw new Error('Silent duplicate-ignoring forum write remains');
  write(relative, source);
}

// The legacy auth test must validate both the canonical v2 cookie and the
// temporary v1 fallback without forcing production back to the old cookie.
{
  const relative = 'scripts/membership-auth-test.js';
  let source = read(relative);
  source = source.replace(/\/matrix_session=\/\.test\(sessionCookieHeader\)/g, '/(?:matrix_session_v2|matrix_session)=/.test(sessionCookieHeader)');
  source = source.replace(/\/matrix_session=\/\.test\(loginResponse\.headers\.get\('set-cookie'\) \|\| ''\)/g, "/(?:matrix_session_v2|matrix_session)=/.test(loginResponse.headers.get('set-cookie') || '')");
  if ((source.match(/\(\?:matrix_session_v2\|matrix_session\)=/g) || []).length < 2) throw new Error('Membership auth compatibility checks were not upgraded');
  write(relative, source);
}

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  changed,
  sessionCookie: 'matrix_session_v2 domain-wide with legacy read fallback',
  forumWrite: 'strict INSERT plus D1 read-after-write',
  compatibilityTest: 'accepts v2 and temporary v1 names',
  boundary: 'This reconciliation does not weaken authentication, accept unconfirmed writes, or restore browser-only forum storage.'
}, null, 2)}\n`);
console.log(`Release/forum contract reconciliation ${changed.length ? `updated ${changed.join(', ')}` : 'already current'}.`);
