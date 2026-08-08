# Matrix Probability Machine implementation map

## First production slice

| Area | Implementation |
| --- | --- |
| Public page | `probability-machine.html`, `probability-machine.css`, `probability-machine.js` |
| Public routes | `/api/public/probability/health`, `/methodology`, `/forecast`, `/api/public/scenarios` |
| Scenario family | Surveillance State |
| Resolution rule | Six of nine threshold conditions sustained for twelve months |
| Calculation | Deterministic ensemble in log-odds space |
| Private coefficients | `PROBABILITY_MODEL_CONFIG_JSON` runtime binding |
| Persistence | Disabled in phase one; no D1 mutation |
| External models | Disabled; no paid or remote fallback |
| Verification | `node scripts/scenario-probability-test.mjs` and Probability Machine GitHub Action |

## Accuracy roadmap

1. Build source-linked jurisdiction profiles for each signal dimension.
2. Add historical analogue features with dependency-aware similarity scoring.
3. Store forecast snapshots and immutable model receipts in a dedicated ledger.
4. Resolve outcomes under the published threshold definition.
5. Report Brier score, log loss, reliability, sharpness and resolution rate by family and horizon.
6. Reweight component models only through versioned, reversible calibration releases.

The public generic fallback is not presented as a calibrated country forecast. It exists so the interface and deterministic contract remain usable while private calibration data is built.
