# Phase 1.25 — Signed Entropy-Provider-Policy Decisions

Phase 1.25 adds a separately signed human approval or rejection of a Phase 1.24 entropy-provider-policy request.

## Boundary

Approval is a **policy authorisation record only**. It confirms these abstract constraints:

```text
sourceClassBound: true
boundSourceClass: operating_system_csprng
providerPolicyDefined: true
permittedProviderClass: local_operating_system_managed_csprng_interface
```

The approved characteristics require local operating-system management, cryptographic security, no network dependency, no external provider, no user-supplied seed, no deterministic fallback, fail-closed behaviour and no entropy-output logging.

Approval still makes no concrete operational choice:

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

Token material, credentials, bearer secrets, production writes, Git changes, deployment and publication remain disabled.

## Approval requirements

Approval requires:

1. An active Phase 1.24 request with at least one second remaining.
2. The Phase 1.22 binding, source-selection and parent entropy-request windows remain active.
3. All 13 provider-policy and safety reviews are complete.
4. The bound source class and permitted provider class exactly match the signed request.
5. Every required fail-closed characteristic remains true.
6. No provider, implementation, library, API, device, syscall, network or external provider is selected.
7. Every candidate file passes a fresh read-only SHA-256 and byte-size check.
8. The target and operation scope exactly matches the signed request.
9. All supplied upstream ledgers plus the request and decision ledgers verify.

Rejection may be recorded without a candidate preflight and grants no authority.

## Storage

Signed decisions are written only to the excluded runtime ledger:

```text
.autonomous-machine/production-execution-entropy-provider-policy-decisions.jsonl
```

The ledger is append-only, HMAC-SHA-256 signed and hash chained. Identical decisions are idempotent; conflicting second decisions fail closed.

## Manual command

```text
node scripts/autonomous-machine/production-execution-entropy-provider-policy-decision.js list
node scripts/autonomous-machine/production-execution-entropy-provider-policy-decision.js show <id>
node scripts/autonomous-machine/production-execution-entropy-provider-policy-decision.js decide <request-id> approve --reviewer <name> --role <role> --note <reason> --all-reviews-complete
node scripts/autonomous-machine/production-execution-entropy-provider-policy-decision.js verify
```

The command additionally requires:

```text
AIM_EXECUTION_ENTROPY_PROVIDER_POLICY_REQUEST_SIGNING_KEY
AIM_EXECUTION_ENTROPY_PROVIDER_POLICY_DECISION_SIGNING_KEY
```

## Validation

The isolated Phase 1.25 harness covers approval, rejection, all 13 mandatory reviews, expiry, minimum remaining time, changed or missing files, exact scope, invalid upstream ledgers, idempotency, conflicting decisions, tamper detection and attempted provider, implementation, policy or entropy mutation.

No provider, implementation, library, API, device, syscall, entropy output, production write, Git action, deployment, publication, schedule, LLM or GPU execution is introduced.
