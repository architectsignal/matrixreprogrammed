const fs = require('fs');
const path = require('path');

const root = process.cwd();
const file = path.join(root, 'src', 'worker-forum-persistence.js');
if (!fs.existsSync(file)) throw new Error('Forum persistence worker is missing');

const before = fs.readFileSync(file, 'utf8');
let after = before;

if (!after.includes("postingAccess: 'verified-free-member-session'")) {
  const healthStart = after.indexOf("if (route.action === 'health')");
  const feedStart = after.indexOf("if (route.action === 'feed'", healthStart);
  if (healthStart < 0 || feedStart < 0) throw new Error('Forum health block is missing');
  const health = after.slice(healthStart, feedStart);
  const updated = health.replace(
    /(\n\s*persistent:\s*true,\s*\n)(\s*)(indexSelfHealing:)/,
    "$1$2postingAccess: 'verified-free-member-session',\n$2readingAccess: 'public',\n$2$3"
  );
  if (updated === health) throw new Error('Forum health persistent-policy insertion point is missing');
  after = after.slice(0, healthStart) + updated + after.slice(feedStart);
}

if (!after.includes("readingAccess: 'public'")) {
  after = after.replace(
    /(\n\s*postingAccess:\s*'verified-free-member-session',\s*\n)/,
    "$1      readingAccess: 'public',\n"
  );
}

if (!after.includes("postingAccess: 'verified-free-member-session'") || !after.includes("readingAccess: 'public'")) {
  throw new Error('Forum health member-access policy could not be normalised');
}

if (after !== before) fs.writeFileSync(file, after);
fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
fs.writeFileSync(path.join(root, 'downloads', 'forum-health-member-policy-normalize.json'), JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  changed: after !== before,
  postingAccess: 'verified-free-member-session',
  readingAccess: 'public'
}, null, 2));
console.log(`Forum health member policy normalised: ${after !== before ? 'changed' : 'already current'}.`);
