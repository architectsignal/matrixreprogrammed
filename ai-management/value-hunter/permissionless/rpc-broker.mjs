export const NETWORK_SCOPES = Object.freeze(['PUBLIC_RPC_READ', 'OFFICIAL_DOCS_READ', 'OFFICIAL_API_READ', 'CHAIN_INDEX_READ']);

function cleanHost(urlValue) {
  const url = new URL(String(urlValue || ''));
  if (url.protocol !== 'https:' && url.protocol !== 'wss:') throw new Error('RPC endpoint must use HTTPS or WSS');
  if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(url.hostname)) throw new Error('Private RPC endpoints require an owner-local resource');
  return url;
}

export class RPCBroker {
  constructor(resources = [], { fetchImpl = globalThis.fetch, clock = () => new Date() } = {}) {
    this.fetchImpl = fetchImpl;
    this.clock = clock;
    this.resources = resources.map(resource => this.validateResource(resource));
    this.health = new Map();
  }

  validateResource(resource = {}) {
    const endpoint = cleanHost(resource.endpoint);
    if (!resource.resource_id || !Number.isSafeInteger(Number(resource.chain_id))) throw new Error('RPC resource identity is incomplete');
    if (resource.billing_enabled !== false || resource.payment_method_present !== false || Number(resource.monetary_cost_per_unit_eur) !== 0 || resource.billing_risk !== 'none') throw new Error('RPC resource violates zero-spend policy');
    if (resource.approved_for_automation !== true || resource.quota_verified !== true) throw new Error('RPC automation and quota must be verified');
    if (!Array.isArray(resource.network_scopes) || !resource.network_scopes.includes('PUBLIC_RPC_READ') || resource.network_scopes.some(scope => !NETWORK_SCOPES.includes(scope))) throw new Error('RPC network scope is invalid');
    if (!resource.allowed_hosts?.map(value => String(value).toLowerCase()).includes(endpoint.hostname.toLowerCase())) throw new Error('RPC host is not allowlisted');
    return Object.freeze({ ...resource, endpoint: endpoint.toString(), chain_id: Number(resource.chain_id) });
  }

  candidates(chainId, capability = 'read') {
    const now = this.clock().getTime();
    return this.resources
      .filter(resource => resource.chain_id === Number(chainId) && resource.enabled !== false)
      .filter(resource => capability !== 'archive' || resource.archive === true)
      .filter(resource => capability !== 'trace' || resource.trace === true)
      .filter(resource => (this.health.get(resource.resource_id)?.cooldown_until || 0) <= now)
      .sort((left, right) => (this.health.get(left.resource_id)?.latency_ms ?? left.average_latency ?? 9999) - (this.health.get(right.resource_id)?.latency_ms ?? right.average_latency ?? 9999));
  }

  async call(chainId, method, params = [], { capability = 'read', timeoutMs = 10_000 } = {}) {
    if (!/^eth_(blockNumber|getBlockByNumber|getLogs|call|estimateGas|getCode|getTransactionReceipt)$/.test(String(method || ''))) throw new Error('RPC method is not read-only allowlisted');
    const failures = [];
    for (const resource of this.candidates(chainId, capability)) {
      const started = Date.now();
      try {
        const response = await this.fetchImpl(resource.endpoint, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(timeoutMs), redirect: 'error'
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        if (payload.error || payload.result == null) throw new Error(payload.error?.message || 'RPC result missing');
        this.health.set(resource.resource_id, { healthy: true, latency_ms: Date.now() - started, checked_at: this.clock().toISOString(), failures: 0 });
        return { result: payload.result, resource_id: resource.resource_id, chain_id: Number(chainId), method };
      } catch (error) {
        const previous = this.health.get(resource.resource_id) || {};
        const count = Number(previous.failures || 0) + 1;
        this.health.set(resource.resource_id, { healthy: false, failures: count, cooldown_until: Date.now() + Math.min(60_000, 1000 * (2 ** count)), error: String(error?.message || error).slice(0, 300) });
        failures.push({ resource_id: resource.resource_id, error: String(error?.message || error) });
      }
    }
    throw Object.assign(new Error('No healthy approved RPC resource completed the request'), { failures });
  }

  async consensus(chainId, method, params = [], { minimum = 2 } = {}) {
    const candidates = this.candidates(chainId).slice(0, Math.max(2, minimum));
    if (candidates.length < minimum) return { agreed: false, reason: 'insufficient-independent-rpcs', responses: [] };
    const responses = await Promise.all(candidates.map(async resource => {
      try {
        const response = await this.fetchImpl(resource.endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(10_000), redirect: 'error' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        if (payload.error || payload.result == null) throw new Error(payload.error?.message || 'RPC result missing');
        return { resource_id: resource.resource_id, result: payload.result };
      } catch (error) { return { resource_id: resource.resource_id, error: String(error?.message || error) }; }
    }));
    const successful = responses.filter(item => item.result != null);
    const canonical = successful[0]?.result;
    return { agreed: successful.length >= minimum && successful.every(item => JSON.stringify(item.result) === JSON.stringify(canonical)), result: canonical, responses };
  }
}

export const rpcBrokerInternals = { cleanHost };
