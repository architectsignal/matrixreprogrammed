const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const reportPath = path.join(root, 'downloads', 'member-forum-integration-patch.json');

function runRequired(relative, label) {
  const target = path.join(root, relative);
  if (!fs.existsSync(target)) throw new Error(`${label} is missing: ${relative}`);
  const result = spawnSync(process.execPath, [target], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 30 * 1024 * 1024
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) throw new Error(`${label} failed with status ${result.status}`);
}

// The original patch wrote a member_id column into the legacy forum_posts table and
// rebuilt old submit blocks. The authoritative design now uses forum_post_owners and
// forum_report_owners, so delegate to that final owner instead of mutating the schema.
runRequired('scripts/patch-persistent-signal-board.js', 'Persistent D1 Signal Board owner');
runRequired('scripts/normalize-forum-health-member-policy.js', 'Public-reading and verified-posting policy normalizer');

const workerPath = path.join(root, 'src', 'worker-forum-persistence.js');
const memberPath = path.join(root, 'src', 'worker-member-experience.js');
const clientPath = path.join(root, 'forum.js');
for (const file of [workerPath, memberPath, clientPath]) if (!fs.existsSync(file)) throw new Error(`Required member/forum file is missing: ${path.relative(root, file)}`);
const worker = fs.readFileSync(workerPath, 'utf8');
const member = fs.readFileSync(memberPath, 'utf8');
const client = fs.readFileSync(clientPath, 'utf8');

const checks = {
  memberSessionExport: member.includes('export async function memberSessionContext'),
  freeMemberCapability: member.includes("'signal_board_posting'"),
  verifiedPosting: /postingAccess\s*:\s*['"]verified-free-member-session['"]/.test(worker),
  publicReading: /readingAccess\s*:\s*['"]public['"]/.test(worker),
  postOwnerLedger: worker.includes('forum_post_owners'),
  reportOwnerLedger: worker.includes('forum_report_owners'),
  crossDevice: worker.includes('crossDevice:true'),
  d1Authoritative: worker.includes('Cloudflare D1 MEMBERS_DB.forum_posts + forum_post_owners'),
  noKvReads: !worker.includes('FORUM_POSTS.get(') && !worker.includes('FORUM_POSTS.list('),
  noKvWrites: !worker.includes('FORUM_POSTS.put('),
  noBrowserPass: !client.includes('localStorage') && !client.includes('matrix_signal_pass_unlocked'),
  memberEndpoint: client.includes('/api/member/me')
};
const failures = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
if (failures.length) throw new Error(`Canonical member/forum integration remains incomplete: ${failures.join(', ')}`);

for (const file of [workerPath, memberPath, clientPath]) {
  const syntax = spawnSync(process.execPath, ['--check', file], { cwd: root, encoding: 'utf8' });
  if (syntax.status !== 0) throw new Error(`${path.relative(root, file)} syntax failed: ${syntax.stderr || syntax.stdout}`);
}

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify({
  ok: true,
  generatedAt: new Date().toISOString(),
  legacyPatchRetired: true,
  authoritativeOwner: 'scripts/patch-persistent-signal-board.js',
  checks,
  membershipPrices: { free: 0, supporter: 3, intelligence: 6, researchPro: 9 },
  forumReading: 'public',
  forumPosting: 'verified free member session',
  storage: 'Cloudflare D1 forum_posts plus ownership ledgers',
  paymentGateRemoved: true,
  boundary: 'No browser-only or payment switch may claim authentication, entitlement or persistent storage has been verified.'
}, null, 2));
console.log('Legacy member/forum patch routed to the canonical verified-member, D1-only persistent Signal Board owner.');
