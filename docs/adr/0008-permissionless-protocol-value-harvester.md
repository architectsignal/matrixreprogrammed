# ADR 0008: Permissionless protocol-defined value harvester

- Status: Accepted for guarded simulation and production certification
- Date: 2026-08-13

## Context

Claim-based value and protocol-defined execution rewards have different authority models. A refund, grant, unclaimed balance or inheritance requires a proven claimant and entitlement. A public liquidation or keeper function may instead assign a reward to any caller who performs the documented protocol action. Requiring claimant identity for that second class would be the wrong gate, but removing the claim gate globally would be unsafe.

Permissionless does not mean unowned, exploitable or free of risk. Contract identity, public-call permission, reward assignment, current chain state, exact costs, wallet exposure and receipt reconciliation must all be proven independently. Search results, model confidence and keyword matches do not prove any of those facts.

## Decision

1. Add a separate `P0_PERMISSIONLESS_EARN` value class. Existing claim-based qualification is unchanged.
2. Allow only specialized protocol intents. Arbitrary calls, access-control bypass, delegated execution, blind signing, unlimited approvals, credential harvesting, key guessing and wallet draining are structurally forbidden.
3. Qualify an opportunity only from official source hashes, an allowlisted or dynamically proven contract, current bytecode, a compatible released adapter, public execution proof, executor reward proof and a deterministic current-block simulation.
4. Use integer micro-USD accounting. Gross reward minus every modelled gas, swap, DEX, slippage, flash-liquidity, bridge, RPC, failure and capital cost must equal expected net profit exactly.
5. Apply minimum net profit, success probability, cost-ratio, absolute-cost, daily-budget, single-loss and block-expiry gates before signing.
6. Isolate execution in a dedicated low-balance wallet with asset, chain, protocol, transaction and daily caps. Source, D1, logs and prompts may contain only public addresses and managed `signer://` or `vault://` references, never signing secrets.
7. Require an exact transaction proposal, fresh simulation and policy authorization before the constrained signer will sign. Reconcile only finalized receipts with explained asset deltas and exact realized net-profit arithmetic.
8. Reserve execution with a stable idempotency key before broadcasting. Duplicate worker results, opportunities, transactions and receipts do not execute twice.
9. Permit owner-local, LAN and reviewed external zero-spend workers to perform only public discovery, decoding, health calculations, ranking and simulation within exact host and network scopes. They receive no secrets and cannot sign.
10. Permit generated adapter candidates only into quarantine/CI. Static analysis, unit tests, fork simulation, historical replay and security tests are mandatory; activation still requires a protected release.
11. Implement Morpho on Base as the first adapter because its official address registry and source expose the relevant public liquidation surface. The installed adapter is `simulation-only`: its transaction codec, fork/RPC simulation and receipt decoder fail closed until production-certified implementations are released.
12. Keep Euler and Aave disabled and uninstalled until their own official specifications and adapter suites meet the same gates.
13. Count only reconciled realized receipts in `PERMISSIONLESS_NET_CRYPTO_COLLECTED`. Discovery, hypothetical profit and simulation do not count as funds.
14. Reuse the existing scheduled production chain and Matrix event spine. The permissionless cycle runs after claim-based Value Hunter and before Living Matrix, without a new cron slot.

## Consequences

- The system can discover and test protocol reward strategies without pretending that a claimant owns the reward in advance.
- A configured Worker can check chain health and persist truthful cycles, but it cannot sign transactions.
- The current release is production-equivalent under controlled fixtures, not live financial execution. `NO_PRODUCTION_CERTIFIED_PROTOCOL_ADAPTER` remains a hard blocker and measured funds remain zero until a real finalized receipt exists.
- Enabling feature flags alone cannot bypass missing RPC, wallet, signer, protocol, intent or adapter certification.
- Learning may rank strategies from measured outcomes; it cannot edit policy, activate generated code, grant itself signing access or deploy itself.

## Rollback

Phase 16 is additive. All permissionless flags default to false. Disabling `MATRIX_PERMISSIONLESS_VALUE_ENABLED` stops the cycle; disabling auto-execution stops signing eligibility; disabling distributed discovery stops external worker jobs. Removing the route and scheduled call leaves protocol, opportunity, simulation, intent, receipt and learning evidence intact. Claim-based Value Hunter, membership, payments and investigation paths do not depend on Phase 16.
