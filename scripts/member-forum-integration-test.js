const fs = require('fs');
const path = require('path');

const root = process.cwd();
const at = relative => path.join(root, relative);
const read = relative => fs.readFileSync(at(relative), 'utf8');
const issues = [];
const need = (condition, message) => { if (!condition) issues.push(message); };

const template = read('scripts/templates/membership-auth/membership.template');
const membership = read('membership.html');
const matrix = JSON.parse(read('data/membership-feature-matrix.json'));
const forumClient = read('forum.js');
const forumWorker = read('src/worker-forum-persistence.js');
const memberWorker = read('src/worker-member-experience.js');
const productionWorker = read('src/worker-production.js');
const migration = read('migrations/phase9_signal_board_persistence.sql');

for (const html of [template, membership]) {
  need(html.includes('€0'), 'Free Member price is missing');
  need(html.includes('€3/month'), 'Supporter €3 price is missing');
  need(html.includes('€6/month'), 'Intelligence €6 price is missing');
  need(html.includes('€9/month'), 'Research Pro €9 price is missing');
  need(!/€19\/month|€49\/month/.test(html), 'Legacy €19/€49 membership pricing remains');
  need(html.includes('Free Member access never creates a PayPal subscription'), 'Free Member billing boundary is missing');
}

const priceById = Object.fromEntries((matrix.tiers || []).map(tier => [tier.id, tier.priceEurMonthly]));
need(priceById.free === 0, 'Feature matrix Free Member price must be €0');
need(priceById.supporter === 3, 'Feature matrix Supporter price must be €3');
need(priceById.intelligence === 6, 'Feature matrix Intelligence price must be €6');
need(priceById.research_pro === 9, 'Feature matrix Research Pro price must be €9');
need(JSON.stringify(matrix).includes('verified-member Signal Board posting'), 'Feature matrix does not include verified-member forum posting');

need(forumClient.includes('/api/member/me'), 'Forum client does not check the member session');
need(!forumClient.includes('localStorage'), 'Forum client still uses a browser-only unlock');
need(!forumClient.includes('paypal.me'), 'Forum client still references the false PayPal gate');
need(/verified free member account is required|Posting requires a verified free member account/i.test(forumClient), 'Forum client lacks the verified-member boundary');
need(forumClient.includes('No browser-only or temporary fallback is accepted'), 'Forum client can present a temporary fallback as persistent');

for (const relative of ['forum.html', 'dark-speculation-forum.html', 'epstein-alive-board.html']) {
  const html = read(relative);
  need(/id="(?:forum-member-status|signal-pass-status)"/.test(html), `${relative} lacks member-session status`);
  need(/member-login\.html/.test(html), `${relative} lacks free account login route`);
  need(html.includes('Cloudflare D1'), `${relative} lacks the D1 persistence promise`);
  need(!/paypal\.me|I(?:’|')ve Paid|Pay €1/i.test(html), `${relative} still exposes the false Signal Pass`);
}

need(memberWorker.includes('export async function memberSessionContext'), 'Member worker does not export its secure session context');
need(memberWorker.includes("'signal_board_posting'"), 'Free Member capabilities do not include Signal Board posting');
need(forumWorker.includes("import { memberSessionContext } from './worker-member-experience.js';"), 'Forum worker does not use the member session authority');
need(forumWorker.includes('A verified free member account is required to post.'), 'Forum submit does not fail closed for anonymous users');
need(forumWorker.includes('forum_post_owners') && migration.includes('CREATE TABLE IF NOT EXISTS forum_post_owners'), 'Forum post ownership ledger is missing');
need(forumWorker.includes('forum_report_owners') && migration.includes('CREATE TABLE IF NOT EXISTS forum_report_owners'), 'Forum report ownership ledger is missing');
need(forumWorker.includes('forum_board_state') && migration.includes('CREATE TABLE IF NOT EXISTS forum_board_state'), 'Forum board state ledger is missing');
need(/postingAccess\s*:\s*['"]verified-free-member-session['"]/.test(forumWorker), 'Forum health does not disclose posting access');
need(/readingAccess\s*:\s*['"]public['"]/.test(forumWorker), 'Forum health does not disclose public reading access');
need(forumWorker.includes('crossDevice:true'), 'Forum health does not declare cross-device persistence');
need(!forumWorker.includes('FORUM_POSTS.get(') && !forumWorker.includes('FORUM_POSTS.list(') && !forumWorker.includes('FORUM_POSTS.put('), 'Forum worker still contains a KV persistence route');

const memberBoundary = productionWorker.indexOf('if (isMemberExperienceRoute(path))');
const forumBoundary = productionWorker.indexOf('if (!forumRoutes.has(path))');
need(memberBoundary >= 0 && forumBoundary > memberBoundary, 'Production Worker does not route member authentication before forum handling');
need(productionWorker.includes('forumWorker.fetch(request, d1OnlyForumEnv(env), ctx)'), 'Production Worker does not remove KV from forum routes');
need(memberWorker.includes('supporter_3:2') && memberWorker.includes('intelligence_6:3') && memberWorker.includes('research_pro_9:4'), 'Member entitlement ranks do not match €3/€6/€9 tiers');

const report = {
  ok: issues.length === 0,
  generatedAt: new Date().toISOString(),
  membershipPrices: priceById,
  forumReading: 'public',
  forumPosting: 'verified-free-member-session',
  forumStorage: 'D1-only with post/report ownership ledgers',
  issues
};
fs.mkdirSync(at('downloads'), { recursive: true });
fs.writeFileSync(at('downloads/member-forum-integration-test.json'), JSON.stringify(report, null, 2));
if (issues.length) {
  console.error('MEMBER/FORUM INTEGRATION TEST FAILED');
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}
console.log('MEMBER/FORUM INTEGRATION TEST PASSED: €0/€3/€6/€9 tiers and verified-member D1 ownership-ledger Signal Board posting.');
require('./recovery-worker-api-contract-test.js');
