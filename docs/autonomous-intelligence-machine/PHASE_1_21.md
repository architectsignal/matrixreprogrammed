# Phase 1.21 — Signed Entropy-Source-Selection Decisions

Phase 1.21 adds a separately signed human approval or rejection of a Phase 1.20 entropy-source-selection request.

## Boundary

Approval is an **authorisation record only**. It does not select an entropy source or provider and does not request or produce entropy bytes.

Every decision preserves:

```text
requestedSourceClass: null
entropySourceSelected: false
entropySource: null
providerSelected: false
providerName: null
networkSourceAllowed: false
externalProviderAllowed: false
entropyBytesRequested: 0
entropyGenerated: false
entropyOutput: null
entropyDigest: null
tokenMaterialGenerated: false
tokenMaterialIssued: false
bearerSecretGenerated: false
bearerSecretIssued: false
credentialGenerated: false
credentialIssued: false
readyForExecution: false
executionAuthorityGranted: false
```

## Approval requirements

Approval requires:

1. An active Phase 1.20 request with at least one second remaining.
2. The request remains inside its parent entropy-request window.
3. All nine reviews are complete.
4. The permitted class remains only `operating_system_csprng`.
5. No provider or network source is selected.
6. Every candidate file passes a fresh read-only SHA-256 and byte-size check.
7. The target and operation scope exactly matches the signed request.
8. All supplied upstream ledgers, the request ledger and decision ledger verify.

Rejection may be recorded without a file preflight and grants no authority.

## Storage

Signed decisions are written only to the excluded runtime ledger:

```text
.autonomous-machine/production-execution-entropy-source-selection-decisions.jsonl
```

The ledger is append-only, HMAC-SHA-256 signed and hash chained. Identical decisions are idempotent; conflicting second decisions fail closed.

## Manual command

```text
node scripts/autonomous-machine/production-execution-entropy-source-selection-decision.js list
node scripts/autonomous-machine/production-execution-entropy-source-selection-decision.js show <id>
node scripts/autonomous-machine/production-execution-entropy-source-selection-decision.js decide <request-id> approve --reviewer <name> --role <role> --note <reason> --all-reviews-complete
node scripts/autonomous-machine/production-execution-entropy-source-selection-decision.js verify
```

The command requires the upstream signing keys plus:

```text
AIM_EXECUTION_ENTROPY_SOURCE_SELECTION_REQUEST_SIGNING_KEY
AIM_EXECUTION_ENTROPY_SOURCE_SELECTION_DECISION_SIGNING_KEY
```

## Validation

The isolated Phase 1.21 harness covers approval, rejection, mandatory reviews, expiry, minimum remaining time, file drift, missing files, scope drift, invalid upstream ledgers, idempotency, conflicting decisions, tamper detection and attempted provider selection.

No production write, Git action, deployment, publication, schedule, LLM or GPU execution is introduced.
