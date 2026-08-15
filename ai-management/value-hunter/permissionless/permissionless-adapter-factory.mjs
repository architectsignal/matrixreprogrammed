const FORBIDDEN = /(private.?key|seed.?phrase|mnemonic|eval\s*\(|new Function|child_process|exec\s*\(|arbitrary.?call|delegatecall|setapprovalforall)/i;

export function certifyPermissionlessAdapterCandidate(candidate = {}) {
  const blockers = [];
  if (!candidate.protocol_id || !candidate.adapter_id || !candidate.official_docs_source || !candidate.official_registry_source) blockers.push('official-adapter-specification-incomplete');
  for (const value of [candidate.official_docs_source, candidate.official_registry_source]) {
    try { if (new URL(String(value || '')).protocol !== 'https:') blockers.push('official-source-not-https'); } catch { blockers.push('official-source-invalid'); }
  }
  if (!/^[a-f0-9]{64}$/i.test(String(candidate.docs_source_hash || '')) || !/^[a-f0-9]{64}$/i.test(String(candidate.registry_source_hash || ''))) blockers.push('official-source-hash-missing');
  if (FORBIDDEN.test(String(candidate.source_code || ''))) blockers.push('dangerous-generated-code');
  const tests = candidate.tests || {};
  for (const name of ['static_analysis', 'unit_tests', 'fork_simulation', 'historical_replay', 'security_tests']) if (tests[name] !== 'passed') blockers.push(`${name.replaceAll('_', '-')}-not-passed`);
  return {
    certified_candidate: blockers.length === 0,
    activation_allowed: false,
    state: blockers.length ? 'QUARANTINED' : 'CI_CANDIDATE',
    blockers: [...new Set(blockers)],
    protected_release_required: true,
    immutable_boundaries: ['no-secret-access', 'no-self-deployment', 'no-arbitrary-call', 'fresh-simulation-required', 'constrained-signer-required']
  };
}

export const permissionlessAdapterFactoryInternals = { FORBIDDEN };
