import { ProtocolLiquidationAdapter } from '../liquidation-engine.mjs';

export const MORPHO_BASE = Object.freeze({
  protocol_id: 'morpho',
  chain_id: 8453,
  core_contract: '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb',
  official_registry_source: 'https://docs.morpho.org/developers/contracts/addresses/',
  official_rules_source: 'https://github.com/morpho-org/morpho-blue/blob/main/src/Morpho.sol',
  official_reference_bot: 'https://github.com/morpho-org/morpho-blue-liquidation-bot'
});

function bigint(value, label) {
  try { return BigInt(value); } catch { throw new Error(`Morpho ${label} is invalid`); }
}

function verifiedMarket(market = {}) {
  if (!/^0x[a-fA-F0-9]{64}$/.test(String(market.market_id || ''))) throw new Error('Morpho market id is invalid');
  if (!/^0x[a-fA-F0-9]{40}$/.test(String(market.loan_token || '')) || !/^0x[a-fA-F0-9]{40}$/.test(String(market.collateral_token || '')) || !/^0x[a-fA-F0-9]{40}$/.test(String(market.oracle || ''))) throw new Error('Morpho market token/oracle address is invalid');
  if (market.whitelist_verified !== true || market.oracle_fresh !== true) throw new Error('Morpho market whitelist or oracle proof missing');
  return { ...market, contract_address: MORPHO_BASE.core_contract };
}

export class MorphoLiquidationAdapter extends ProtocolLiquidationAdapter {
  constructor({ dataProvider, transactionCodec, simulator, receiptDecoder } = {}) {
    super({ protocolId: 'morpho', adapterId: 'morpho-liquidation-v1', adapterVersion: '1.0.0-simulation', supportedChains: [8453], activationState: 'simulation-only' });
    this.dataProvider = dataProvider;
    this.transactionCodec = transactionCodec;
    this.simulator = simulator;
    this.receiptDecoder = receiptDecoder;
  }

  async discoverMarkets(input) {
    if (Number(input.chain_id) !== MORPHO_BASE.chain_id || typeof this.dataProvider?.discoverMarkets !== 'function') throw new Error('Morpho Base market discovery is not configured');
    return (await this.dataProvider.discoverMarkets(input)).map(verifiedMarket);
  }

  async getBorrowPositions(input) {
    if (typeof this.dataProvider?.getBorrowPositions !== 'function') throw new Error('Morpho position data provider is not configured');
    return this.dataProvider.getBorrowPositions(input);
  }

  async calculateHealth({ market, position }) {
    const collateral = bigint(position.collateral_assets, 'collateral');
    const borrowAssets = bigint(position.borrow_assets, 'borrow assets');
    const collateralValueLoan = bigint(position.collateral_value_loan_assets, 'collateral value');
    const lltvWad = bigint(market.lltv_wad, 'LLTV');
    const wad = 10n ** 18n;
    const maximumBorrow = collateralValueLoan * lltvWad / wad;
    return { collateral_assets: collateral.toString(), borrow_assets: borrowAssets.toString(), maximum_borrow_assets: maximumBorrow.toString(), healthy: borrowAssets <= maximumBorrow };
  }

  async isLiquidatable({ health }) { return health.healthy === false; }

  async estimateRepayAmount({ position }) {
    const shares = bigint(position.repay_shares || position.borrow_shares, 'repay shares');
    const assets = bigint(position.repay_assets || position.borrow_assets, 'repay assets');
    if (shares <= 0n || assets <= 0n) throw new Error('Morpho repay amount must be positive');
    return { repaid_shares: shares.toString(), repaid_assets: assets.toString() };
  }

  async estimateCollateralReceived({ position }) {
    const seized = bigint(position.seizable_collateral_assets, 'seizable collateral');
    if (seized <= 0n) throw new Error('Morpho seized collateral must be positive');
    return { seized_assets: seized.toString(), collateral_value_usd_micros: Number(position.collateral_value_usd_micros || 0) };
  }

  async estimateGrossReward({ repay, collateral, position }) {
    const gross = Number(position.gross_reward_usd_micros ?? (collateral.collateral_value_usd_micros - Number(position.repay_value_usd_micros || 0)));
    return { gross_reward_usd_micros: Math.max(0, Math.trunc(gross)), success_probability_ppm: Math.max(0, Math.min(1_000_000, Number(position.success_probability_ppm || 0))) };
  }

  async estimatePostLiquidationSwap({ position }) {
    return {
      gas_usd_micros: Number(position.gas_usd_micros || 0), swap_fee_usd_micros: Number(position.swap_fee_usd_micros || 0),
      dex_fee_usd_micros: Number(position.dex_fee_usd_micros || 0), slippage_usd_micros: Number(position.slippage_usd_micros || 0),
      flash_liquidity_fee_usd_micros: Number(position.flash_liquidity_fee_usd_micros || 0), bridge_cost_usd_micros: 0,
      rpc_execution_cost_usd_micros: 0, expected_failed_transaction_cost_usd_micros: Number(position.expected_failed_transaction_cost_usd_micros || 0),
      capital_opportunity_cost_usd_micros: Number(position.capital_opportunity_cost_usd_micros || 0)
    };
  }

  async buildLiquidationTransaction(input) {
    if (typeof this.transactionCodec?.encodeMorphoLiquidate !== 'function') throw new Error('Certified Morpho transaction codec is not installed');
    return this.transactionCodec.encodeMorphoLiquidate({
      market_params: input.market, borrower: input.position.borrower, seized_assets: input.collateral.seized_assets,
      repaid_shares: input.repay.repaid_shares, callback_data: input.callback_data || '0x'
    });
  }

  async simulateLiquidation(input) {
    if (typeof this.simulator?.simulate !== 'function') throw new Error('Morpho fork/RPC simulator is not installed');
    return this.simulator.simulate(input);
  }

  async verifyReceipt(receipt, expected) {
    if (typeof this.receiptDecoder?.verifyMorphoLiquidation !== 'function') throw new Error('Morpho receipt decoder is not installed');
    return this.receiptDecoder.verifyMorphoLiquidation(receipt, expected);
  }
}

export const morphoAdapterInternals = { bigint, verifiedMarket };
