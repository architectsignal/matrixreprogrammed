const fs = require('fs');
const path = require('path');

// Run after the canonical forum owner so deployable pages cannot retain paid-pass
// wording, malformed form attributes or retired browser-export filenames.
require('./finalize-forum-public-surfaces.js');

const root = process.cwd();
const at = relative => path.join(root, relative);
const read = relative => fs.readFileSync(at(relative), 'utf8');
const issues = [];
const need = (condition, message) => { if (!condition) issues.push(message); };

const membership = read('membership.html');
const matrix = JSON.parse(read('data/membership-feature-matrix.json'));
const forumClient = read('forum.js');
const forumWorker = read('src/worker-forum-persistence.js');
const memberWorker = read('src/worker-member-experience.js');
const productionWorker = read('src/worker-production.js');

const articleById = id => {
  const marker = `id="${id}"`;
  const markerAt = membership.indexOf(marker);
  if (markerAt < 0) return '';
  const start = membership.lastIndexOf('<article', markerAt);
  const end = membership.indexOf('</article>', markerAt);
  if (start < 0 || end < 0) return '';
  return membership.slice(start, end + '</article>'.length);
};

const canonicalTiers = [
  { id: 'join-free-member', label: 'Free Member', price: 0 },
  { id: 'join-supporter', label: 'Supporter', price: 3 },
  { id: 'join-intelligence-member', label: 'Intelligence Member', price: 6 },
  { id: 'join-research-pro', label: 'Research Pro', price: 9 }
];
for (const tier of canonicalTiers) {
  const article = articleById(tier.id);
  need(Boolean(article), `${tier.label} tier is missing from membership.html`);
  need(new RegExp(`data-tier-price=["']${tier.price}["']`, 'i').test(article), `${tier.label} canonical tier price must be €${tier.price}`);
  need(article.includes(`€${tier.price}`), `${tier.label} displayed €${tier.price} amount is missing`);
}
need(!/€19\s*(?:\/\s*month|per\s+month)|€49\s*(?:\/\s*month|per\s+month)/i.test(membership), 'Legacy €19/€49 membership pricing remains');
need(membership.includes('Free Member access never creates a PayPal subscription'), 'Free Member billing boundary is missing');
need(/same underlying public-source evidence/i.test(membership), 'Membership page does not preserve the same-evidence access promise');
need((membership.match(/donation\s*\/\s*month/gi) || []).length >= 3, 'Paid tiers no longer disclose their monthly donation cadence');

const priceById = Object.fromEntries((matrix.tiers || []).map(tier => [tier.id, tier.priceEurMonthly]));
need(priceById.free === 0, 'Feature matrix Free Member price must be €0');
need(priceById.supporter === 3, 'Feature matrix Supporter price must be €3');
need(priceById.intelligence === 6, 'Feature matrix Intelligence price must be €6');
need(priceById.research_pro === 9, 'Feature matrix Research Pro price must be €9');
need(JSON.stringify(matrix).includes('verified-member Signal Board posting'), 'Feature matrix does not include verified-member forum posting');

const credentialedMemberSessionFetch = /fetch\(\s*['"]\/api\/member\/me[\s\S]{0,260}?credentials\s*:\s*['"]include['"]/m.test(forumClient);
need(credentialedMemberSessionFetch, 'Forum client does not check the member session with credentials');
need(!forumClient.includes('localStorage'), 'Forum client still uses a browser-only unlock');
need(!forumClient.includes('paypal.me'), 'Forum client still references the false PayPal gate');
need(forumClient.includes('Posting requires a verified free member account'), 'Forum client lacks the verified-member boundary');

for (const relative of ['forum.html', 'dark-speculation-forum.html', 'epstein-alive-board.html']) {
  const html = read(relative);
  need(html.includes('id="forum-member-status"'), `${relative} lacks member-session status`);
  need(html.includes('Create Free Account'), `${relative} lacks free account route`);
  need(!/paypal\.me|I(?:’|')ve Paid|Pay €1/i.test(html), `${relative} still exposes the false payment gate`);
  need(!/\bSignal Pass\b/i.test(html), `${relative} still exposes obsolete paid-pass wording`);
  need(!/downloads\/forum-posts\.(?:json|md)/i.test(html), `${relative} still exposes retired local forum exports`);
  need(!/\sreader\s+field=/i.test(html), `${relative} still contains malformed form attributes`);
  need(/reading is public|reading stays public|free to read|board is free to read/i.test(html), `${relative} lacks the public-reading promise`);
}

need(memberWorker.includes('export async function memberSessionContext'), 'Member worker does not export its secure session context');
need(forumWorker.includes("import { memberSessionContext } from './worker-member-experience.js';"), 'Forum worker does not use the member session authority');
need(forumWorker.includes("error: 'A verified free member account is required to post.'"), 'Forum submit does not fail closed for anonymous users');
need(forumWorker.includes("member_id TEXT NOT NULL DEFAULT ''"), 'Forum D1 schema lacks accountable member IDs');
need(forumWorker.includes("'forum.post.created'"), 'Forum post audit logging is missing');
need(forumWorker.includes("postingAccess: 'verified-free-member-session'"), 'Forum health does not disclose posting access');

const memberBoundary = productionWorker.indexOf('if (isMemberExperienceRoute(path))');
const forumBoundary = productionWorker.indexOf('if (!forumRoutes.has(path))');
need(memberBoundary >= 0 && forumBoundary > memberBoundary, 'Production Worker does not route member authentication before forum handling');
need(memberWorker.includes("supporter_3:2") && memberWorker.includes("intelligence_6:3") && memberWorker.includes("research_pro_9:4"), 'Member entitlement ranks do not match €3/€6/€9 tiers');

const report = {
  ok: issues.length === 0,
  generatedAt: new Date().toISOString(),
  membershipPrices: priceById,
  forumReading: 'public',
  forumPosting: 'verified-free-member-session',
  forumPublicSurface: 'clean-authoritative-d1',
  issues
};
fs.mkdirSync(at('downloads'), { recursive: true });
fs.writeFileSync(at('downloads/member-forum-integration-test.json'), JSON.stringify(report, null, 2));
if (issues.length) {
  console.error('MEMBER/FORUM INTEGRATION TEST FAILED');
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}
console.log('MEMBER/FORUM INTEGRATION TEST PASSED: canonical €0/€3/€6/€9 tier contracts, clean public pages and verified-member D1 forum posting.');
require('./recovery-worker-api-contract-test.js');
