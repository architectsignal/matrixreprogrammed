const API = '/api/agent-commons';

function clean(value, maximum = 160) { return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, maximum); }
function eligibleResources(runtime) {
  return (Array.isArray(runtime?.resources) ? runtime.resources : [])
    .filter(resource => Array.isArray(resource.capability_types) ? resource.capability_types.includes('llm') : Array.isArray(resource.capabilities) && resource.capabilities.includes('llm.generate'))
    .slice(0, 4);
}
async function readResponse(response) {
  const text = await response.text();
  let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 300) }; }
  if (!response.ok) throw new Error(`Agent Commons returned HTTP ${response.status}: ${clean(data.error || data.reason || text, 300)}`);
  return data;
}

export async function registerHostAgent(config, resource, { fetchImpl = globalThis.fetch } = {}) {
  if (!config?.adminToken) return { skipped: true, reason: 'owner-token-not-configured' };
  if (!config?.nodeId || !config?.siteUrl) throw new Error('Matrix Host identity and site URL are required');
  const model = clean(resource?.service_name || resource?.model_id || resource?.name || resource?.resource_id, 120);
  if (!model) throw new Error('A local model identity is required');
  const response = await fetchImpl(`${config.siteUrl}${API}/agents/register`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-admin-token': config.adminToken,
      'x-matrix-host-id': config.nodeId,
      'user-agent': `matrix-local-host/${config.version || '1.0.0'}`
    },
    body: JSON.stringify({
      name: `Matrix ${model}`,
      handle: `${config.nodeId.slice(-8)}-${model}`,
      model,
      bio: 'Owner-controlled zero-spend Matrix Host agent for bounded public-record investigations.',
      capabilities: ['public-record-analysis', 'source-check', 'peer-review', ...(resource?.capability_types || resource?.capabilities || [])]
    }),
    signal: AbortSignal.timeout(15000)
  });
  return readResponse(response);
}

export async function synchronizeAgentCommons(config, runtime, credentialCache = new Map(), { fetchImpl = globalThis.fetch, clock = () => new Date() } = {}) {
  if (config?.agentCommonsEnabled === false) return { skipped: true, reason: 'agent-commons-disabled', connected: 0, credentials: credentialCache };
  const resources = eligibleResources(runtime);
  if (!resources.length) return { ok: true, connected: 0, discovered: 0, credentials: credentialCache };
  let connected = 0;
  const errors = [];
  for (const resource of resources) {
    const resourceId = clean(resource.resource_id || resource.model_id || resource.service_name, 180);
    const cached = credentialCache.get(resourceId);
    const expiresSoon = !cached?.expiresAt || Date.parse(cached.expiresAt) - clock().getTime() < 10 * 60 * 1000;
    if (!expiresSoon) { connected += 1; continue; }
    try {
      const registered = await registerHostAgent(config, resource, { fetchImpl });
      if (registered?.credential?.token) {
        credentialCache.set(resourceId, {
          agentId: registered.agent.id,
          handle: registered.agent.handle,
          token: registered.credential.token,
          expiresAt: registered.credential.expiresAt
        });
        connected += 1;
      }
    } catch (error) { errors.push(clean(error?.message || error, 300)); }
  }
  return { ok: errors.length === 0, connected, discovered: resources.length, errors, credentials: credentialCache };
}

export async function pollAgentCommons(config, credentialCache, { fetchImpl = globalThis.fetch } = {}) {
  const snapshots = [];
  for (const [resourceId, credential] of credentialCache) {
    try {
      const response = await fetchImpl(`${config.siteUrl}${API}/bootstrap`, {
        method: 'GET',
        headers: { authorization: `Bearer ${credential.token}`, 'user-agent': `matrix-local-host/${config.version || '1.0.0'}` },
        signal: AbortSignal.timeout(15000)
      });
      const data = await readResponse(response);
      snapshots.push({ resourceId, agentId: credential.agentId, investigations: data.investigations?.length || 0, reviews: data.reviewQueue?.length || 0, ok: true });
    } catch (error) { snapshots.push({ resourceId, agentId: credential.agentId, ok: false, error: clean(error?.message || error, 300) }); }
  }
  return { ok: snapshots.every(item => item.ok), agents: snapshots.length, investigationsAvailable: snapshots.reduce((sum, item) => sum + Number(item.investigations || 0), 0), reviewsAvailable: snapshots.reduce((sum, item) => sum + Number(item.reviews || 0), 0), snapshots };
}
