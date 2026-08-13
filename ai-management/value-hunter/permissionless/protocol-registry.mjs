const ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const HASH = /^(0x[a-fA-F0-9]{64}|[a-fA-F0-9]{64})$/;

function officialUrl(value) {
  const url = new URL(String(value || ''));
  if (url.protocol !== 'https:') throw new Error('Protocol sources must use HTTPS');
  return url.toString();
}

export class ProtocolRegistry {
  constructor(records = []) {
    this.protocols = new Map();
    for (const record of records) this.register(record);
  }

  register(record = {}) {
    const protocolId = String(record.protocol_id || '').trim().toLowerCase();
    const chainId = Number(record.chain_id);
    const adapterId = String(record.adapter_id || '').trim();
    if (!protocolId || !Number.isSafeInteger(chainId) || chainId <= 0 || !adapterId) throw new Error('Protocol registry record is incomplete');
    if (!HASH.test(String(record.registry_source_hash || '')) || !HASH.test(String(record.rules_source_hash || ''))) throw new Error('Protocol registry hashes are required');
    const contracts = [...new Set((record.contracts || []).map(value => String(value)))];
    if (!contracts.length || contracts.some(value => !ADDRESS.test(value))) throw new Error('At least one valid protocol contract is required');
    const normalized = Object.freeze({
      ...record,
      protocol_id: protocolId,
      chain_id: chainId,
      adapter_id: adapterId,
      official_registry_source: officialUrl(record.official_registry_source),
      official_rules_source: officialUrl(record.official_rules_source),
      contracts,
      dynamic_contract_discovery: record.dynamic_contract_discovery === true,
      status: record.status || 'simulation'
    });
    this.protocols.set(`${protocolId}:${chainId}`, normalized);
    return normalized;
  }

  get(protocolId, chainId) { return this.protocols.get(`${String(protocolId || '').toLowerCase()}:${Number(chainId)}`); }

  verifyContract({ protocol_id, chain_id, contract_address, discovery_proof = {} } = {}) {
    const record = this.get(protocol_id, chain_id);
    if (!record) return { verified: false, reason: 'protocol-not-registered' };
    const address = String(contract_address || '');
    if (!ADDRESS.test(address)) return { verified: false, reason: 'invalid-contract-address' };
    if (record.contracts.some(value => value.toLowerCase() === address.toLowerCase())) return { verified: true, classification: 'STATICALLY_VERIFIED_CONTRACT', record };
    const dynamic = record.dynamic_contract_discovery === true &&
      discovery_proof.official_registry_proof === true &&
      discovery_proof.bytecode_verified === true &&
      discovery_proof.adapter_compatible === true &&
      discovery_proof.chain_verified === true &&
      HASH.test(String(discovery_proof.proof_hash || ''));
    return dynamic
      ? { verified: true, classification: 'DYNAMICALLY_VERIFIED_CONTRACT', record }
      : { verified: false, reason: 'dynamic-contract-proof-failed', record };
  }

  list() { return [...this.protocols.values()]; }
}

export const protocolRegistryInternals = { ADDRESS, HASH };
