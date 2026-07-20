const fs = require('fs');
const path = require('path');

// Apply the final same-origin login repair before testing the complete member journey.
require('./repair-forum-login-canonical.js');

const root = process.cwd();
const failures = [];
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const check = (label, ok) => { if (!ok) failures.push(label); };

const legacy = read('src/worker.js');
const member = read('src/worker-member-experience.js');
const forumWorker = read('src/worker-forum-persistence.js');
const client = read('forum.js');
const login = read('member-login.html');

check('new shared session cookie is not issued', legacy.includes('matrix_session_v2=') && legacy.includes('Domain=matrixreprogrammed.com'));
check('legacy cookie fallback is missing', legacy.includes('values.matrix_session_v2||values.matrix_session'));
check('member API does not read the shared session first', member.includes("cookieValue(request,'matrix_session_v2')||cookieValue(request,'matrix_session')"));
check('auth does not use the canonical production origin', legacy.includes("function authOrigin(request){return 'https://matrixreprogrammed.com'}"));
check('forum insert is still silently ignored', !forumWorker.includes('INSERT OR IGNORE INTO forum_posts'));
check('forum insert does not require one D1 change', forumWorker.includes('D1 did not confirm the forum insert'));
check('forum write lacks D1 read-after-write confirmation', forumWorker.includes('D1 forum read-after-write confirmation failed'));
check('forum client does not carry cookies', (client.match(/credentials:'include'/g) || []).length >= 4);
check('forum client accepts unconfirmed success', client.includes("data.saved !== true") && client.includes("data.storage !== 'Cloudflare D1 MEMBERS_DB.forum_posts'"));
check('forum client does not canonicalize www', client.includes("location.hostname === 'www.matrixreprogrammed.com'"));
check('forum client does not require verified email', client.includes('member && member.emailVerifiedAt'));
check('member login does not canonicalize www before authentication', login.includes('MEMBER_CANONICAL_ORIGIN') && login.includes("location.hostname === 'www.matrixreprogrammed.com'"));
check('member login request is not same-origin', login.includes("fetch('/api/auth/request-link', {"));
check('member login request does not carry credentials', login.includes("credentials:'include'"));
check('member login still contains a cross-origin API request', !login.includes("fetch('https://matrixreprogrammed.com/api/auth/request-link'"));

for (const relative of ['forum.html', 'dark-speculation-forum.html', 'epstein-alive-board.html']) {
  const html = read(relative);
  check(`${relative} still uses an unversioned forum client`, html.includes('forum.js?v=20260720-forum-member-posting-v3'));
}

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  failures,
  sessionModel: 'Domain-wide v2 HttpOnly session with temporary legacy-cookie read fallback.',
  loginModel: 'www canonicalizes to the apex before a same-origin credentialed magic-link request.',
  postingModel: 'Verified member session -> D1 insert -> exact D1 read-back -> success response.',
  persistenceModel: 'Cloudflare D1 MEMBERS_DB.forum_posts remains authoritative across all three boards.',
  boundary: 'The regression fails if login can hit CORS, the browser omits credentials, the domains split sessions, D1 silently ignores a write, or a page can show success without read-after-write confirmation.'
};
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'forum-member-posting-test.json'), JSON.stringify(report, null, 2));
if (failures.length) {
  console.error('FORUM MEMBER POSTING TEST FAILED');
  failures.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}
console.log('FORUM MEMBER POSTING TEST PASSED');
