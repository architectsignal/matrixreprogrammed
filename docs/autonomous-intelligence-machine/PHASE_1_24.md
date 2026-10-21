# Phase 1.24 — Signed Entropy-Provider-Policy Requests

Phase 1.24 adds a separately signed provider-policy request derived from an approved Phase 1.23 source-binding decision.

## Boundary

The request defines acceptable provider characteristics only:

```text
sourceClassBound: true
boundSourceClass: operating_system_csprng
providerPolicyDefined: true
permittedProviderClass: local_operating_system_managed_csprng_interface
```

Required characteristics are:

- local operating-system management;
- cryptographic security;
- no network dependency;
- no external provider;
- no user-supplied seed;
- no deterministic fallback;
- fail closed when unavailable;
- never log entropy output.

No concrete operational choice is made:

```text
providerSelected: false
providerName: null
implementationSelected: false
implementationName: null
librarySelected: false
libraryName: null
apiSelected: false
apiName: null
deviceSelected: false
deviceName: null
syscallSelected: false
syscallName: null
entropyBytesRequested: 0
entropyGenerated: false
entropyOutput: null
entropyDigest: null
```

Token material, credentials, bearer secrets, execution authority, production writes, Git changes, deployment and publication remain disabled.

## Request requirements

A request requires:

1. An approved, exact and non-executing Phase 1.23 decision.
2. Active Phase 1.22, source-selection and parent entropy-request windows.
3. A one-to-six-second request lifetime.
4. Another read-only SHA-256 and byte-size check of every candidate.
5. Exact target and operation scope.
6. Verification of all supplied upstream ledgers plus the Phase 1.22–1.24 ledgers.

## Storage

Signed requests are written only to:

```text
.autonomous-machine/production-execution-entropy-provider-policy-requests.jsonl
```

The ledger is append-only, HMAC-SHA-256 signed and hash chained. Identical active requests are idempotent; conflicting requests and renewal after expiry fail closed.

## Manual command

```text
node scripts/autonomous-machine/production-execution-entropy-provider-policy-request.js list
node scripts/autonomous-machine/production-execution-entropy-provider-policy-request.js show <id>
node scripts/autonomous-machine/production-execution-entropy-provider-policy-request.js request <source-binding-decision-id> --requester <name> --role <role> --note <reason>
node scripts/autonomous-machine/production-execution-entropy-provider-policy-request.js verify
```

The command additionally requires:

```text
AIM_EXECUTION_ENTROPY_PROVIDER_POLICY_REQUEST_SIGNING_KEY
```

## Validation

The isolated Phase 1.24 harness covers signing keys, duration limits, expiry, insufficient remaining time, changed or missing files, exact scope, rejected decisions, invalid upstream ledgers, idempotency, conflicting requests, tamper detection and attempted provider, implementation, policy or entropy mutation.

No provider, implementation, library, API, device, syscall, entropy output, production write, Git action, deployment, publication, schedule, LLM or GPU execution is introduced.
