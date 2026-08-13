import { ProfitEngine } from './profit-engine.mjs';
import { PERMISSIONLESS_VALUE_CLASS, stableOpportunityId } from './permissionless-core.mjs';

const REQUIRED_ADAPTER_METHODS = Object.freeze([
  'discoverMarkets', 'getBorrowPositions', 'calculateHealth', 'isLiquidatable', 'estimateRepayAmount',
  'estimateCollateralReceived', 'estimateGrossReward', 'buildLiquidationTransaction',
  'simulateLiquidation', 'estimatePostLiquidationSwap', 'verifyReceipt'
]);

export class ProtocolLiquidationAdapter {
  constructor(metadata = {}) {
    this.protocolId = String(metadata.protocolId || '');
    this.adapterId = String(metadata.adapterId || '');
    this.adapterVersion = String(metadata.adapterVersion || '');
    this.supportedChains = Object.freeze([...(metadata.supportedChains || [])].map(Number));
    this.activationState = metadata.activationState || 'simulation';
  }
}

export function assertLiquidationAdapter(adapter) {
  if (!adapter?.protocolId || !adapter?.adapterId || !adapter?.adapterVersion || !adapter.supportedChains?.length) throw new Error('Liquidation adapter metadata is incomplete');
  const missing = REQUIRED_ADAPTER_METHODS.filter(method => typeof adapter[method] !== 'function');
  if (missing.length) throw new Error(`Liquidation adapter methods missing: ${missing.join(', ')}`);
  return adapter;
}

export class LiquidationOpportunityEngine {
  constructor({ adapters = [], profitEngine = new ProfitEngine(), clock = () => new Date() } = {}) {
    this.adapters = new Map(adapters.map(adapter => {
      assertLiquidationAdapter(adapter);
      return [`${adapter.protocolId}:${adapter.adapterId}`, adapter];
    }));
    this.profitEngine = profitEngine;
    this.clock = clock;
  }

  adapter(protocolId, adapterId) { return this.adapters.get(`${protocolId}:${adapterId}`); }

  async discover({ protocol_id, adapter_id, chain_id, detected_block, valid_until_block, context = {} } = {}) {
    const adapter = this.adapter(protocol_id, adapter_id);
    if (!adapter || !adapter.supportedChains.includes(Number(chain_id))) throw new Error('No compatible liquidation adapter');
    const markets = await adapter.discoverMarkets({ chain_id, context });
    const opportunities = [];
    for (const market of markets) {
      for (const position of await adapter.getBorrowPositions({ chain_id, market, context })) {
        const health = await adapter.calculateHealth({ chain_id, market, position, context });
        if (!await adapter.isLiquidatable({ chain_id, market, position, health, context })) continue;
        const repay = await adapter.estimateRepayAmount({ chain_id, market, position, health, context });
        const collateral = await adapter.estimateCollateralReceived({ chain_id, market, position, repay, context });
        const gross = await adapter.estimateGrossReward({ chain_id, market, position, repay, collateral, context });
        const swap = await adapter.estimatePostLiquidationSwap({ chain_id, market, position, repay, collateral, context });
        const profit = this.profitEngine.calculate({ ...gross, ...swap });
        const actionType = 'EXECUTE_LIQUIDATION';
        opportunities.push({
          opportunity_id: stableOpportunityId({ chain_id, protocol_id, market_id: market.market_id, position_id: position.position_id, action_type: actionType, detected_block }),
          value_class: PERMISSIONLESS_VALUE_CLASS, protocol_id, chain_id: Number(chain_id), contract_address: market.contract_address,
          market_id: market.market_id, position_id: position.position_id, reward_type: 'liquidation-incentive', action_type: actionType,
          adapter_id, adapter_version: adapter.adapterVersion, detected_at: this.clock().toISOString(), detected_block: Number(detected_block),
          valid_until_block: Number(valid_until_block), health, repay, collateral, profit
        });
      }
    }
    return opportunities.sort((left, right) => right.profit.expected_value_usd_micros - left.profit.expected_value_usd_micros);
  }
}

export const liquidationEngineInternals = { REQUIRED_ADAPTER_METHODS };
