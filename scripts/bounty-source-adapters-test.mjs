import assert from 'node:assert/strict';
import { GitHubPaidIssueAdapter, OpireFeaturedBountyAdapter, bountyAdapterInternals } from '../ai-management/value-hunter/bounty/bounty-source-adapters.mjs';

const githubFetch = async url => {
  assert.equal(new URL(url).hostname, 'api.github.com');
  return new Response(JSON.stringify({ total_count: 2, items: [
    { id: 1, state: 'open', title: 'Bounty: reward EUR 50 documentation fix', body: 'Please claim this issue. AI agent welcome.', html_url: 'https://github.com/example/project/issues/1', url: 'https://api.github.com/repos/example/project/issues/1', repository_url: 'https://api.github.com/repos/example/project', comments: 1, labels: [{ name: 'bounty' }, { name: 'ai-agent-welcome' }] },
    { id: 2, state: 'open', title: 'Bounty $500', body: 'Claim bond: $25', html_url: 'https://github.com/example/project/issues/2', url: 'https://api.github.com/repos/example/project/issues/2', repository_url: 'https://api.github.com/repos/example/project', comments: 0, labels: [{ name: 'bounty' }] }
  ] }), { status: 200, headers: { 'content-type': 'application/json' } });
};
const github = await new GitHubPaidIssueAdapter({ fetchImpl: githubFetch }).discoverBounties({ now: '2026-08-13T12:00:00.000Z' });
assert.equal(github.ok, true);
assert.equal(github.bounties.length, 2);
assert.equal(github.bounties[0].reward_currency, 'EUR');
assert.equal(github.bounties[0].reward_eur_estimate_minor, 5000);
assert.equal(github.bounties[0].ai_usage_allowed, 'allowed');
assert.equal(github.bounties[1].claim_cost_minor, 2500);

const opireFetch = async url => {
  assert.equal(new URL(url).href, 'https://api.opire.dev/issues/featured');
  return new Response(JSON.stringify([{ id: 'opire-1', title: 'Fix README', url: 'https://github.com/example/project/issues/3', pendingPrice: { value: 7000, unit: 'EUR_CENT' }, project: { url: 'https://github.com/example/project' }, organization: { name: 'Example' }, claimerUsers: [], tryingUsers: [], programmingLanguages: ['JavaScript'] }]), { status: 200 });
};
const opire = await new OpireFeaturedBountyAdapter({ fetchImpl: opireFetch }).discoverBounties({ now: '2026-08-13T12:00:00.000Z' });
assert.equal(opire.ok, true);
assert.equal(opire.bounties.length, 1);
assert.equal(opire.bounties[0].reward_eur_estimate_minor, 7000);
assert.equal(opire.bounties[0].automation_allowed, 'unknown');
assert.equal(bountyAdapterInternals.safeUrl('http://api.opire.dev/issues/featured', 'api.opire.dev'), null);

console.log('Bounty source adapters passed: bounded official API calls, explicit rewards only, claim-cost detection, same-host HTTPS validation and unknown-permission fail-closed normalization.');
