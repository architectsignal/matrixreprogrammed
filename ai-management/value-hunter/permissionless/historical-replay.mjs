import { evaluatePermissionlessOpportunity } from './permissionless-core.mjs';

export class HistoricalReplayEngine {
  constructor({ policy, clock = () => new Date() } = {}) { this.policy = policy || {}; this.clock = clock; }

  replay(fixtures = []) {
    const outcomes = fixtures.map(fixture => {
      const evaluation = evaluatePermissionlessOpportunity(fixture, { policy: this.policy, current_block: fixture.current_block });
      const wouldExecute = evaluation.execution_allowed === true;
      const captured = wouldExecute && fixture.competitor_captured_first !== true && fixture.execution_would_succeed !== false;
      const realistic = captured ? Number(fixture.realized_net_profit_usd_micros ?? evaluation.expected_net_profit_usd_micros) : 0;
      return { fixture_id: fixture.fixture_id, would_execute: wouldExecute, captured, realistic_net_profit_usd_micros: realistic, blockers: evaluation.blockers };
    });
    const profitable = outcomes.filter(item => item.would_execute);
    const captured = outcomes.filter(item => item.captured);
    const net = captured.reduce((sum, item) => sum + item.realistic_net_profit_usd_micros, 0);
    return {
      generated_at: this.clock().toISOString(), historical_opportunities: outcomes.length,
      profitable_opportunities: profitable.length, estimated_capture_rate_ppm: profitable.length ? Math.trunc(captured.length * 1_000_000 / profitable.length) : 0,
      realistic_simulated_profit_usd_micros: net, failed_executions: profitable.length - captured.length,
      strategy_classification: net > 0 && captured.length >= 2 ? 'PROVEN_POSITIVE' : net > 0 ? 'PROMISING' : profitable.length ? 'MARGINAL' : 'UNPROVEN',
      outcomes
    };
  }
}
