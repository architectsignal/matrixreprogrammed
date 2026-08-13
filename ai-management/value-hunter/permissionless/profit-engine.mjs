function integer(value, label) {
  const parsed = Number(value ?? 0);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`${label} must be a non-negative safe integer`);
  return parsed;
}

export class ProfitEngine {
  calculate(input = {}) {
    const gross = integer(input.gross_reward_usd_micros, 'gross reward');
    const costs = {
      gas_usd_micros: integer(input.gas_usd_micros, 'gas'),
      swap_fee_usd_micros: integer(input.swap_fee_usd_micros, 'swap fee'),
      dex_fee_usd_micros: integer(input.dex_fee_usd_micros, 'DEX fee'),
      slippage_usd_micros: integer(input.slippage_usd_micros, 'slippage'),
      flash_liquidity_fee_usd_micros: integer(input.flash_liquidity_fee_usd_micros, 'flash liquidity fee'),
      bridge_cost_usd_micros: integer(input.bridge_cost_usd_micros, 'bridge cost'),
      rpc_execution_cost_usd_micros: integer(input.rpc_execution_cost_usd_micros, 'RPC/execution cost'),
      expected_failed_transaction_cost_usd_micros: integer(input.expected_failed_transaction_cost_usd_micros, 'expected failed transaction cost'),
      capital_opportunity_cost_usd_micros: integer(input.capital_opportunity_cost_usd_micros, 'capital opportunity cost')
    };
    const total = Object.values(costs).reduce((sum, value) => sum + value, 0);
    const net = gross - total;
    const success = integer(input.success_probability_ppm ?? 0, 'success probability');
    if (success > 1_000_000) throw new Error('success probability exceeds one million ppm');
    return Object.freeze({
      gross_reward_usd_micros: gross,
      ...costs,
      total_cost_usd_micros: total,
      expected_net_profit_usd_micros: net,
      success_probability_ppm: success,
      expected_value_usd_micros: Math.trunc(net * success / 1_000_000),
      profitable: net > 0
    });
  }
}

export const profitEngineInternals = { integer };
