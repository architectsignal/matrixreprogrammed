# Autonomous Intelligence Machine — Phase 1.13

## Purpose

Phase 1.13 adds a separately signed human approval or rejection of a Phase 1.12 single-use execution-token request.

It remains a decision record only. It does not issue executable token material and cannot modify production files, stage or commit Git changes, deploy, publish, schedule autonomous execution, or activate an LLM/GPU worker.

## Approval boundary

Approval requires all of the following:

1. Every upstream signed ledger verifies.
2. The Phase 1.12 request is bound to the exact approved Phase 1.11 decision.
3. The token-request window is active.
4. At least 15 seconds remain before expiry.
5. The request remains within its upstream authorisation window.
6. Token-request-window review is complete.
7. Final-preflight review is complete.
8. Exact-scope review is complete.
9. Backup-evidence review is complete.
10. Restore-evidence review is complete.
11. Production-owner review is complete.
12. Every candidate file passes another read-only SHA-256 and byte-size check.
13. The operation scope is reconstructed from the signed execution plan and exactly matches the Phase 1.12 scope.

Rejection requires an identified reviewer and written rationale but does not run the final file preflight or scope reconstruction.

## Signed ledger

Decision records are stored only in the gitignored runtime file:

```text
.autonomous-machine/production-execution-token-decisions.jsonl
```

The ledger uses:

- HMAC-SHA-256 signatures;
- canonical payload hashes;
- record hashes;
- previous-record hash chaining;
- timing-safe signature comparison;
- deterministic idempotency;
- conflicting-decision rejection.

The signing secret is never stored.

## Token state

Even an approved decision requires:

```text
tokenMaterialIssued: false
tokenDigest: null
tokenId: null
consumed: false
useCount: 0
maxUses: 1
tokenIssued: false
executionTokenAvailable: false
```

## Authority state

Every decision, including approval, requires:

```text
productionFilePath: null
productionDestinationResolved: false
finalDestinationConfirmed: false
readyForExecution: false
executionAuthorityGranted: false
authorisationGranted: false
productionWriteAllowed: false
executionAllowed: false
commitAllowed: false
deploymentAllowed: false
publicationAllowed: false
```

An approval may proceed only to a separate execution-token issuance review with another last-moment hash check. Phase 1.13 cannot perform that step.

## Operator command

```text
node scripts/autonomous-machine/run-phase1-review-execution-token.js list
node scripts/autonomous-machine/run-phase1-review-execution-token.js show <decision-id-or-request-id>
node scripts/autonomous-machine/run-phase1-review-execution-token.js decide <request-id> approve --reviewer <name> --role <role> --note <reason> --all-reviews-complete
node scripts/autonomous-machine/run-phase1-review-execution-token.js decide <request-id> reject --reviewer <name> --role <role> --note <reason>
node scripts/autonomous-machine/run-phase1-review-execution-token.js verify
```

Required signing keys are supplied through environment variables. Phase 1.13 adds:

```text
AIM_EXECUTION_TOKEN_DECISION_SIGNING_KEY
```

## Validation

The Phase 1 workflow runs:

```text
node scripts/autonomous-machine/phase1.13-self-test.js
```

The test covers mandatory reviews, request expiry, minimum remaining time, file drift, missing files, scope drift, upstream-ledger failure, approval, rejection, idempotency, conflicting decisions, ledger tampering, unchanged production state and zero Git/deployment/publication actions.
