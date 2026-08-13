# Permissionless Harvester operations

## Current truthful state

| Component | State |
| --- | --- |
| Qualification, profit engine, registry, wallet/signer policy, receipts and idempotency | Tested |
| Public zero-spend worker fabric and RPC failover | Tested with controlled resources |
| Full transaction lifecycle | Tested with deterministic controlled fixtures |
| Morpho Base | Simulation-only; no production-certified codec/simulator/receipt decoder |
| Euler and Aave | Not installed |
| Live signing and collection | Not configured |
| Reconciled permissionless funds | 0 until a finalized on-chain receipt is recorded |

The doctor must therefore report `LIVE_COLLECTION_NOT_CONFIGURED` and `NO_PRODUCTION_CERTIFIED_PROTOCOL_ADAPTER`. That is a safety result, not a service failure.

## Local commands

Run commands from the repository directory containing `package.json`:

```powershell
cd C:\Users\njjmg\Documents\Codex\2026-08-12\files-mentioned-by-the-user-matrix\work\matrixreprogrammed-compute
npm.cmd run matrix-local -- harvester doctor
npm.cmd run matrix-local -- harvester start
```

`doctor` reports configuration references and blockers without printing secret material. `start` asks the owner-authenticated Worker to perform an immediate readiness/chain-health cycle. It does not override a blocker.

## Configuration contract

Ordinary environment configuration may contain only references and public identifiers:

```text
MATRIX_SITE_URL=https://matrixreprogrammed.com
MATRIX_PERMISSIONLESS_SIGNER_REFERENCE=signer://managed/harvester
MATRIX_HARVESTER_EXECUTION_WALLET_REFERENCE=vault://managed/harvester-wallet
MATRIX_HARVESTER_EXECUTION_WALLET_ADDRESS=0x...
P0_ALLOWED_CHAINS=8453
P0_ALLOWED_PROTOCOLS=morpho
P0_ALLOWED_INTENTS=EXECUTE_LIQUIDATION
MATRIX_PERMISSIONLESS_RPC_RESOURCES_JSON=[...approved zero-spend public RPC records...]
```

The owner control-plane token belongs in a local secret store or GitHub Actions secret named `AI_MANAGEMENT_ADMIN_TOKEN`; never commit its value. A wallet private key, seed phrase or raw transaction must never be stored in GitHub variables, Wrangler variables, D1, source, logs or prompts. The future signer integration must retain the key inside its managed signing boundary and expose only a constrained `signer://` reference.

Do not enable the permissionless or auto-execution flags yet. The release contract intentionally has no production-certified adapter. A later protected release must supply and prove all three Morpho execution dependencies, pass fork/reorg/race/adversarial tests, provision the capped wallet, then perform a deliberately bounded canary before the flags can be reviewed.

## Production certification checklist

- Official source content hashes and current Base contract bytecode match the registry.
- At least two approved zero-spend RPCs agree on chain head and required state.
- Morpho transaction codec matches the released ABI and exact call.
- Fork simulation proves expected wallet deltas, approvals, callback behavior, gas and swap path.
- Receipt decoder proves the liquidation event, reward, full costs, confirmations and finality.
- Dedicated wallet has only bounded gas/capital and approved assets.
- Constrained signer rejects every contract, intent, chain, fee and calldata shape outside policy.
- Historical replay remains positive after competition, failed-transaction cost and conservative slippage.
- Canary caps, daily loss stop, stale-state rejection and duplicate suppression pass.
- First live receipt is reconciled before any live-collection claim is made.
