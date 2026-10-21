# Phase 1.22 — Signed Entropy-Source-Binding Requests

Phase 1.22 adds a separately signed request that binds an approved Phase 1.21 decision to the source-class label `operating_system_csprng`.

## Boundary

The binding is a **class-level policy record only**. It does not select a provider, library, API, operating-system service, device, syscall or implementation. It does not request or produce entropy bytes.

Every request preserves:

```text
bindingRequested: true
permittedSourceClass: operating_system_csprng
sourceClassBound: true
boundSourceClass: operating_system_csprng
providerSelectionRequired: true
providerSelected: false
providerName: null
implementationSelectionRequired: true
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
tokenMaterialGenerated: false
tokenMaterialIssued: false
bearerSecretGenerated: false
bearerSecretIssued: false
credentialGenerated: false
credentialIssued: false
readyForExecution: false
executionAuthorityGranted: false
```

## Request requirements

A request requires:

1. An approved Phase 1.21 decision.
2. The original Phase 1.20 request and parent entropy-request window to remain active.
3. At least one second remaining in the limiting signed window.
4. A duration between one and eight seconds.
5. A fresh read-only SHA-256 and byte-size check for every candidate file.
6. An exact match between the Phase 1.20 request, Phase 1.21 decision, target identifiers and operation scope.
7. Valid upstream, source-selection-request, source-selection-decision and binding-request ledgers.

Identical active requests are idempotent. Conflicting requests and renewal after expiry fail closed.

## Storage

Signed requests are written only to the excluded runtime ledger:

```text
.autonomous-machine/production-execution-entropy-source-binding-requests.jsonl
```

The ledger is append-only, HMAC-SHA-256 signed and hash chained.

## Manual command

```text
node scripts/autonomous-machine/production-execution-entropy-source-binding-request.js list
node scripts/autonomous-machine/production-execution-entropy-source-binding-request.js show <id>
node scripts/autonomous-machine/production-execution-entropy-source-binding-request.js request <source-selection-decision-id> --requester <name> --role <role> --note <reason> --duration-seconds 4
node scripts/autonomous-machine/production-execution-entropy-source-binding-request.js verify
```

The command requires the upstream signing keys plus:

```text
AIM_EXECUTION_ENTROPY_SOURCE_SELECTION_REQUEST_SIGNING_KEY
AIM_EXECUTION_ENTROPY_SOURCE_SELECTION_DECISION_SIGNING_KEY
AIM_EXECUTION_ENTROPY_SOURCE_BINDING_REQUEST_SIGNING_KEY
```

## Validation

The isolated Phase 1.22 harness covers weak keys, duration limits, expiry, insufficient remaining time, file drift, missing files, scope drift, rejected decisions, invalid upstream ledgers, idempotency, conflicting requests, ledger tampering and attempted provider or entropy selection.

No provider, implementation, API, device, syscall, entropy bytes, secret, credential, production write, Git action, deployment, publication, schedule, LLM or GPU execution is introduced.
