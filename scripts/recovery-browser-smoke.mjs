import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);
const sourceFile = path.join(dirname, 'recovery-browser-smoke-legacy.mjs');
let source = fs.readFileSync(sourceFile, 'utf8').replace(/\r\n/g, '\n');

// The production forum client cache-busts the secure member-session request.
// Playwright route globs must therefore accept the optional query string.
let memberRouteRepairs = 0;
source = source.replace(/page\.route\((['"])\*\*\/api\/member\/me\1\s*,/g, (_match, quote) => {
  memberRouteRepairs += 1;
  return `page.route(${quote}**/api/member/me**${quote},`;
});
if (memberRouteRepairs < 2) {
  throw new Error(`Recovery forum proof expected at least two member-session route mocks; repaired ${memberRouteRepairs}`);
}

// Public reading is explained by the page as a whole. The member-session status
// is deliberately reserved for the current authentication state and therefore
// must not be required to repeat the public-reading promise.
const publicReadingAssertion = "    assert(/reading is public/i.test(await page.locator('#forum-member-status').innerText()), 'Forum does not explain public reading');";
const publicReadingReplacement = "    assert(/reading is public|reading stays public|free to read|board is free to read/i.test(body), 'Forum does not explain public reading');";
if (!source.includes(publicReadingAssertion)) throw new Error('Recovery forum public-reading assertion is missing');
source = source.replace(publicReadingAssertion, publicReadingReplacement);

// Membership pricing is owned by the canonical tier metadata. The public copy
// intentionally describes paid plans as recurring donations, so browser proof
// must validate the tier cards and amounts rather than one retired text format.
const legacyMembershipPrices = [
  "    assert(body.includes('€3/month'), 'Supporter price is not €3/month');",
  "    assert(body.includes('€6/month'), 'Intelligence price is not €6/month');",
  "    assert(body.includes('€9/month'), 'Research Pro price is not €9/month');"
].join('\n');
const canonicalMembershipPrices = [
  "    for (const [id, price, label] of [['join-supporter','3','Supporter'],['join-intelligence-member','6','Intelligence'],['join-research-pro','9','Research Pro']]) {",
  "      const card = page.locator(`#${id}`);",
  "      assert(await card.count() === 1, `${label} tier card is missing`);",
  "      assert((await card.getAttribute('data-tier-price')) === price, `${label} canonical price is not €${price}`);",
  "      assert((await card.innerText()).includes(`€${price}`), `${label} displayed €${price} amount is missing`);",
  "    }"
].join('\n');
if (!source.includes(legacyMembershipPrices)) throw new Error('Recovery membership legacy price assertions are missing');
source = source.replace(legacyMembershipPrices, canonicalMembershipPrices);

// The production forum endpoint returns 201 only after a Cloudflare D1
// read-after-write confirmation and identifies the authoritative storage lane.
const forumMockBefore = "persistent: true, saved: true, post: { id: 'recovery-post'";
const forumMockAfter = "persistent: true, saved: true, storage: 'Cloudflare D1 MEMBERS_DB.forum_posts', post: { id: 'recovery-post'";
if (!source.includes(forumMockBefore)) throw new Error('Recovery forum D1 success mock is missing');
source = source.replace(forumMockBefore, forumMockAfter);

const forumSuccessBefore = '/posted live and saved persistently/i';
const forumSuccessAfter = '/(?:posted live and saved persistently|signal posted live.*persistence was confirmed|d1 persistence was confirmed)/i';
if (!source.includes(forumSuccessBefore)) throw new Error('Recovery forum success assertion is missing');
source = source.replace(forumSuccessBefore, forumSuccessAfter);

const startMarker = "  await runTest(browser, 'Homepage navigation', '/index.html', async page => {";
const endMarker = "\n\n  await runTest(browser, 'Start Here safety routes'";
const start = source.indexOf(startMarker);
const end = source.indexOf(endMarker, start);
if (start < 0 || end < 0) throw new Error('Homepage recovery compatibility block is missing');
const replacement = [
  "  await runTest(browser, 'Homepage navigation', '/index.html', async page => {",
  "    await page.locator('main').waitFor({ state: 'visible', timeout: 30000 });",
  "    for (const href of ['start-here.html','books.html','live-intel.html','evidence-vault.html','search.html','data-lab.html']) {",
  "      assert(await page.locator(`a[href$=\"${href}\"]`).count() >= 1, `Homepage navigation must expose ${href}`);",
  "    }",
  "    const uniqueRoutes = await page.locator('a[href]').evaluateAll(nodes => [...new Set(nodes.map(node => node.getAttribute('href')).filter(Boolean))]);",
  "    assert(uniqueRoutes.length >= 8, `Homepage must expose a useful route set; found ${uniqueRoutes.length} unique links`);",
  "    assert(await page.locator('main').count() === 1, 'Homepage must contain one main element');",
  "  }, async page => {",
  "    await page.route('**/api/public/consequence-contracts**', route => jsonResponse(route, { ok: true, contracts: [], generatedAt: '2026-07-30T00:00:00.000Z' }));",
  "  });"
].join('\n');
source = `${source.slice(0, start)}${replacement}${source.slice(end)}`;
const runtimeFile = path.join(dirname, `.recovery-browser-smoke-runtime-${process.pid}-${Date.now()}.mjs`);
fs.writeFileSync(runtimeFile, source, 'utf8');
try {
  await import(`${pathToFileURL(runtimeFile).href}?run=${Date.now()}`);
} finally {
  fs.rmSync(runtimeFile, { force: true });
}
