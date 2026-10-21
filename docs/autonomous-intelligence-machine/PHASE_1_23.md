# Phase 1.23 — Signed Entropy-Source-Binding Decisions

Phase 1.23 adds a separately signed human approval or rejection of a Phase 1.22 entropy-source-binding request.

## Boundary

Approval is an **authorisation record only**. It confirms only that the already approved source-class label remains bound:

```text
sourceClassBound: true
boundSourceClass: operating_system_csprng
```

It does not choose or expose any operational entropy source:

```text
providerSelected: false
providerName: null
implementationSelected: false
implementationName: null
apiSelected: false
apiName: null
deviceSelected: false
deviceName: null
syscallSelected: false
syscallName: null
networkSourceAllowed: false
externalProviderAllowed: false
entropyBytesRequested: 0
entropyGenerated: false
entropyOutput: null
entropyDigest: null
```

Token material, credentials, bearer secrets, production writes, Git changes, deployment and publication remain disabled.

## Approval requirements

Approval requires:

1. An active Phase 1.22 request with at least one second remaining.
2. The request remains inside the Phase 1.20 source-selection and parent entropy-request windows.
3. All 11 reviews are complete.
4. The binding remains limited to `operating_system_csprng`.
5. No provider, implementation, API, device, syscall or network source is selected.
6. Every candidate file passes a fresh read-only SHA-256 and byte-size check.
7. The target and operation scope exactly matches the signed request.
8. All supplied upstream ledgers plus the request and decision ledgers verify.

Rejection may be recorded without a file preflight and grants no authority.

## Storage

Signed decisions are written only to the excluded runtime ledger:

```text
.autonomous-machine/production-execution-entropy-source-binding-decisions.jsonl
```

The ledger is append-only, HMAC-SHA-256 signed and hash chained. Identical decisions are idempotent; conflicting second decisions fail closed.

## Manual command

```text
node scripts/autonomous-machine/production-execution-entropy-source-binding-decision.js list
node scripts/autonomous-machine/production-execution-entropy-source-binding-decision.js show <id>
node scripts/autonomous-machine/production-execution-entropy-source-binding-decision.js decide <request-id> approve --reviewer <name> --role <role> --note <reason> --all-reviews-complete
node scripts/autonomous-machine/production-execution-entropy-source-binding-decision.js verify
```

The command requires the upstream signing keys plus:

```text
AIM_EXECUTION_ENTROPY_SOURCE_BINDING_REQUEST_SIGNING_KEY
AIM_EXECUTION_ENTROPY_SOURCE_BINDING_DECISION_SIGNING_KEY
```

## Validation

The isolated Phase 1.23 harness covers approval, rejection, all 11 mandatory reviews, expiry, minimum remaining time, file drift, missing files, scope drift, invalid upstream ledgers, idempotency, conflicting decisions, tamper detection and attempted provider, implementation or entropy selection.

No production write, Git action, deployment, publication, schedule, LLM or GPU execution is introduced.
