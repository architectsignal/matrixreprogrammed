import { normalizeBounty } from './bounty-completion-engine.mjs';

const OFFICIAL_HOSTS = Object.freeze(['api.github.com', 'api.opire.dev']);
function clean(value, maximum = 1000) { return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maximum); }
function safeUrl(value, expectedHost) { try { const url = new URL(String(value || '')); return url.protocol === 'https:' && url.hostname === expectedHost ? url : null; } catch { return null; } }
function labels(issue) { return (Array.isArray(issue?.labels) ? issue.labels : []).map(label => clean(typeof label === 'string' ? label : label?.name, 100)).filter(Boolean); }
function legacyRewardFromGitHub(issue) {
  const text = `${issue?.title || ''}\n${issue?.body || ''}\n${labels(issue).join(' ')}`;
  const match = /(?:reward|bounty|payout)\s*(?:[:=-]|is)?\s*(?:€|EUR\s*)?([0-9]+(?:[.,][0-9]{1,2})?)\s*(EUR|EURO|USD|USDC|GBP)?/i.exec(text)
    || /(€|EUR|USD|USDC|GBP|\$|£)\s*([0-9]+(?:[.,][0-9]{1,2})?)/i.exec(text);
  if (!match) return null;
  const number = Number(String(match[1] && /^\d/.test(match[1]) ? match[1] : match[2]).replace(',', '.'));
  const rawCurrency = String(match[2] && !/^\d/.test(match[2]) ? match[2] : match[1]).toUpperCase();
  const currency = rawCurrency === '€' || rawCurrency === 'EURO' ? 'EUR' : rawCurrency === '$' ? 'USD' : rawCurrency === '£' ? 'GBP' : rawCurrency;
  return Number.isFinite(number) && number > 0 && ['EUR','USD','USDC','GBP'].includes(currency) ? { amountMinor: Math.round(number * 100), currency } : null;
}

function rewardFromGitHub(issue) {
  const text = `${issue?.title || ''}\n${issue?.body || ''}\n${labels(issue).join(' ')}`;
  const explicit = /(?:reward|bounty|payout)\s*(?:[:=-]|is)?\s*(?:(\u20ac|EUR|EURO|USD|USDC|GBP|\$|\u00a3)\s*)?([0-9]+(?:[.,][0-9]{1,2})?)\s*(EUR|EURO|USD|USDC|GBP)?/i.exec(text);
  const symbol = /(\u20ac|EUR|EURO|USD|USDC|GBP|\$|\u00a3)\s*([0-9]+(?:[.,][0-9]{1,2})?)/i.exec(text);
  const match = explicit || symbol;
  if (!match) return null;
  const number = Number(String(match[2]).replace(',', '.'));
  const rawCurrency = String(explicit ? (match[1] || match[3] || '') : match[1]).toUpperCase();
  const currency = rawCurrency === '\u20ac' || rawCurrency === 'EURO' ? 'EUR' : rawCurrency === '$' ? 'USD' : rawCurrency === '\u00a3' ? 'GBP' : rawCurrency;
  return Number.isFinite(number) && number > 0 && ['EUR','USD','USDC','GBP'].includes(currency) ? { amountMinor: Math.round(number * 100), currency } : null;
}

export class GitHubPaidIssueAdapter {
  constructor({ fetchImpl = globalThis.fetch, query = 'org:projectdiscovery label:bounty is:issue is:open', maximum = 100 } = {}) {
    this.fetchImpl = fetchImpl; this.query = clean(query, 500); this.maximum = Math.max(1, Math.min(100, Number(maximum) || 100));
    this.adapterId = 'github-paid-issue-v1';
  }
  async discoverBounties({ now = new Date().toISOString() } = {}) {
    const endpoint = new URL('https://api.github.com/search/issues');
    endpoint.searchParams.set('q', this.query); endpoint.searchParams.set('sort', 'created'); endpoint.searchParams.set('order', 'desc'); endpoint.searchParams.set('per_page', String(this.maximum));
    const response = await this.fetchImpl(endpoint, { headers: { accept: 'application/vnd.github+json', 'user-agent': 'Matrix-Reprogrammed-Bounty-Scout', 'x-github-api-version': '2026-03-10' } });
    if (!response.ok) return { ok: false, source: this.adapterId, status: response.status, bounties: [], failure: `github-http-${response.status}` };
    const payload = await response.json();
    const bounties = [];
    for (const issue of Array.isArray(payload.items) ? payload.items : []) {
      if (issue.pull_request || issue.state !== 'open') continue;
      const reward = rewardFromGitHub(issue);
      if (!reward) continue;
      const repo = clean(issue.repository_url, 500).replace('https://api.github.com/repos/', 'https://github.com/');
      const issueLabels = labels(issue);
      const body = clean(issue.body, 20_000);
      const claimBond = /(?:claim|entry)\s+bond\s*[:=-]?\s*(?:\$|€)?\s*([0-9]+(?:[.,][0-9]{1,2})?)/i.exec(body);
      bounties.push(normalizeBounty({
        sourcePlatform: 'github-paid-issue', externalId: String(issue.id), title: issue.title, description: body,
        repository: repo, issueUrl: issue.html_url, bountyUrl: issue.html_url, rewardMinor: reward.amountMinor,
        rewardCurrency: reward.currency, rewardEurEstimateMinor: reward.currency === 'EUR' ? reward.amountMinor : 0,
        programRulesUrl: repo ? `${repo}/blob/HEAD/CONTRIBUTING.md` : null, aiUsageAllowed: issueLabels.includes('ai-agent-welcome') ? true : 'unknown',
        automationAllowed: issueLabels.includes('ai-agent-welcome') ? true : 'unknown', claimRequired: /\bclaim\b/i.test(body),
        claimCostMinor: claimBond ? Math.round(Number(claimBond[1].replace(',', '.')) * 100) : 0,
        labels: issueLabels, competitionCount: Number(issue.comments || 0), sourceEvidence: { api_url: issue.url, query: this.query, labels: issueLabels, official_api: true }, discoveredAt: now
      }, now));
    }
    return { ok: true, source: this.adapterId, discovered: bounties.length, available_reported: Number(payload.total_count || 0), bounties, rate_limit_policy: 'one bounded query per scheduled cycle' };
  }
}

export class OpireFeaturedBountyAdapter {
  constructor({ fetchImpl = globalThis.fetch } = {}) { this.fetchImpl = fetchImpl; this.adapterId = 'opire-featured-v1'; }
  async discoverBounties({ now = new Date().toISOString() } = {}) {
    const endpoint = safeUrl('https://api.opire.dev/issues/featured', 'api.opire.dev');
    const response = await this.fetchImpl(endpoint, { headers: { accept: 'application/json', 'user-agent': 'Matrix-Reprogrammed-Bounty-Scout' } });
    if (!response.ok) return { ok: false, source: this.adapterId, status: response.status, bounties: [], failure: `opire-http-${response.status}` };
    const payload = await response.json();
    const bounties = (Array.isArray(payload) ? payload : []).filter(item => safeUrl(item.url, 'github.com')).map(item => {
      const pending = item.pendingPrice || {};
      const currency = clean(pending.unit, 20).replace(/_CENT$/i, '').toUpperCase();
      const rewardMinor = Math.max(0, Number(pending.value || 0));
      return normalizeBounty({
        sourcePlatform: 'opire', externalId: item.id, title: item.title, repository: item.project?.url,
        issueUrl: item.url, bountyUrl: `https://app.opire.dev`, rewardMinor, rewardCurrency: currency,
        rewardEurEstimateMinor: currency === 'EUR' ? rewardMinor : 0,
        programRulesUrl: 'https://docs.opire.dev/overview/getting-started', aiUsageAllowed: 'unknown', automationAllowed: 'unknown',
        claimRequired: true, competitionCount: Math.max(item.claimerUsers?.length || 0, item.tryingUsers?.length || 0),
        languages: item.programmingLanguages || [], sourceEvidence: { endpoint: endpoint.href, official_public_api: true, organization: item.organization?.name, pending_price: pending }, discoveredAt: now
      }, now);
    });
    return { ok: true, source: this.adapterId, discovered: bounties.length, bounties, official_hosts: OFFICIAL_HOSTS, payout_dependency: 'Opire developer Stripe onboarding and platform acceptance/payment' };
  }
}

export const bountyAdapterInternals = { OFFICIAL_HOSTS, clean, safeUrl, labels, rewardFromGitHub, legacyRewardFromGitHub };
