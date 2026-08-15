const REWARD_TERMS = Object.freeze([
  'keeper', 'executor', 'liquidator', 'caller incentive', 'settlement incentive', 'auction incentive',
  'harvest incentive', 'maintenance reward', 'rebalance incentive', 'maturity reward', 'public execution bounty'
]);

export class PublicRewardScanner {
  constructor({ clock = () => new Date() } = {}) { this.clock = clock; }

  scan(records = []) {
    return records.flatMap(record => {
      const haystack = `${record.title || ''} ${record.description || ''} ${record.verified_source_text || ''}`.toLowerCase();
      const concepts = REWARD_TERMS.filter(term => haystack.includes(term));
      if (!concepts.length) return [];
      return [{
        discovery_id: String(record.discovery_id || record.url || ''),
        concepts,
        official_source: record.official_source === true,
        source_url: String(record.url || ''),
        source_hash: String(record.source_hash || ''),
        execution_eligible: false,
        status: 'DISCOVERY_ONLY',
        discovered_at: this.clock().toISOString(),
        boundary: 'Keyword discovery is not protocol permission or reward-assignment proof.'
      }];
    });
  }
}

export const publicRewardScannerInternals = { REWARD_TERMS };
