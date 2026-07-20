const fs = require('fs');
const path = require('path');

const root = process.cwd();
const changed = [];
function read(relative) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) throw new Error(`Required session compatibility file is missing: ${relative}`);
  return fs.readFileSync(file, 'utf8');
}
function write(relative, content) {
  const file = path.join(root, relative);
  const before = fs.readFileSync(file, 'utf8');
  if (before === content) return;
  fs.writeFileSync(file, content);
  changed.push(relative);
}
function replaceOrFail(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`${label} anchor is missing`);
  return source.replace(before, after);
}

// Existing www-only legacy sessions remain usable on www. New logins receive the
// shared v2 cookie, but the forum does not forcibly move a live legacy session.
{
  const relative = 'forum.js';
  let source = read(relative);
  const redirectBlock = `  if (location.hostname === 'www.matrixreprogrammed.com') {
    location.replace(CANONICAL_ORIGIN + location.pathname + location.search + location.hash);
    return;
  }

`;
  source = source.replace(redirectBlock, '');
  write(relative, source);
}

// Logout must revoke the D1 session and remove both the domain-wide v2 cookie
// and any temporary host-only legacy cookie.
{
  const relative = 'src/worker.js';
  let source = read(relative);
  source = replaceOrFail(
    source,
    "function authClearCookie(){return 'matrix_session_v2=; Domain=matrixreprogrammed.com; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax'}",
    "function authClearCookies(){return ['matrix_session_v2=; Domain=matrixreprogrammed.com; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax','matrix_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax']}",
    'dual session clear helper'
  );
  const oldLogout = "async function handleAuthLogout(request,env){const rawToken=authCookieValue(request);if(rawToken&&hasMembersDb(env)){const sessionHash=await authHash(rawToken);await env.MEMBERS_DB.prepare(\"UPDATE member_sessions SET revoked_at=? WHERE session_hash=? AND revoked_at IS NULL\").bind(new Date().toISOString(),sessionHash).run().catch(()=>null)}return new Response(JSON.stringify({ok:true,authenticated:false}),{status:200,headers:{...jsonHeaders,'Set-Cookie':authClearCookie()}})}";
  const newLogout = "async function handleAuthLogout(request,env){const rawToken=authCookieValue(request);if(rawToken&&hasMembersDb(env)){const sessionHash=await authHash(rawToken);await env.MEMBERS_DB.prepare(\"UPDATE member_sessions SET revoked_at=? WHERE session_hash=? AND revoked_at IS NULL\").bind(new Date().toISOString(),sessionHash).run().catch(()=>null)}const logoutHeaders=new Headers(jsonHeaders);for(const cookie of authClearCookies())logoutHeaders.append('Set-Cookie',cookie);return new Response(JSON.stringify({ok:true,authenticated:false}),{status:200,headers:logoutHeaders})}";
  source = replaceOrFail(source, oldLogout, newLogout, 'dual-cookie logout response');
  write(relative, source);
}

fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'forum-session-compatibility-repair.json'), JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  changed,
  existingLegacySessions: 'accepted on their current host',
  newSessions: 'matrix_session_v2 shared across apex and www',
  logout: 'revokes D1 session and clears v2 plus legacy cookies',
  boundary: 'The repair fixes split-domain posting without discarding a valid existing session or leaving an old cookie active after logout.'
}, null, 2));
console.log(`Forum session compatibility repair ${changed.length ? `applied to ${changed.join(', ')}` : 'already current'}.`);
