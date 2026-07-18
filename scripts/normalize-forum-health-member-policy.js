const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const file = path.join(root, 'src', 'worker-forum-persistence.js');
const reportPath = path.join(root, 'downloads', 'forum-health-member-policy-normalize.json');
if (!fs.existsSync(file)) throw new Error('Forum persistence worker is missing');

const before = fs.readFileSync(file, 'utf8');
let after = before;
const postingPattern = /postingAccess\s*:\s*['"]verified-free-member-session['"]/g;
const readingPattern = /readingAccess\s*:\s*['"]public['"]/;

if (!postingPattern.test(after)) throw new Error('Verified Free Member posting policy is missing from the D1 forum worker');
postingPattern.lastIndex = 0;

// Add public-reading state beside every persisted posting-access declaration. This
// works for compact generated objects and formatted source without parsing a legacy
// health-function layout that no longer exists.
after = after.replace(postingPattern, match => {
  const tail = after.slice(after.indexOf(match) + match.length, after.indexOf(match) + match.length + 80);
  return /readingAccess\s*:/.test(tail) ? match : `${match},readingAccess:'public'`;
});

if (!/postingAccess\s*:\s*['"]verified-free-member-session['"]/.test(after) || !readingPattern.test(after)) {
  throw new Error('Forum member-access policy could not be normalised');
}
if (!after.includes("authoritativeStorage:'Cloudflare D1 MEMBERS_DB.forum_posts + forum_post_owners'") && !after.includes("authoritativeStorage: 'Cloudflare D1 MEMBERS_DB.forum_posts + forum_post_owners'")) {
  throw new Error('Forum access policy is not attached to the authoritative D1 worker');
}

if (after !== before) fs.writeFileSync(file, after);
const syntax = spawnSync(process.execPath, ['--check', file], { cwd: root, encoding: 'utf8' });
if (syntax.status !== 0) throw new Error(`Forum access-policy normalisation produced invalid Worker syntax: ${syntax.stderr || syntax.stdout}`);

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  changed: after !== before,
  authoritativeStorage: 'Cloudflare D1 MEMBERS_DB.forum_posts + forum_post_owners',
  postingAccess: 'verified-free-member-session',
  readingAccess: 'public',
  parser: 'format-independent semantic marker normalisation',
  syntaxChecked: true
}, null, 2));
console.log(`Forum health/member policy normalised for compact D1 Worker output: ${after !== before ? 'changed' : 'already current'}.`);
