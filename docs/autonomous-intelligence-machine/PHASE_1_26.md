# Phase 1.26 — Signed Anonymous Provider-Candidate-Evaluation Requests

Phase 1.26 creates a separately signed request to evaluate **abstract policy compliance only** after an approved Phase 1.25 provider-policy decision.

## Boundary

The request creates an eight-criterion anonymous review matrix covering:

- local operating-system management;
- cryptographic security;
- no network dependency;
- no external provider;
- no user-supplied seed;
- no deterministic fallback;
- fail-closed behaviour;
- forbidden entropy-output logging.

Every criterion remains `pending_manual_abstract_compliance_review`. No evidence or result is attached.

```text
evaluationMode: anonymous_abstract_policy_compliance_only
candidateIdentityAllowed: false
candidateIdentityPresent: false
candidateIdentifier: null
candidateName: null
candidateFingerprint: null
candidateEvidenceAttached: false
automaticScoringAllowed: false
complianceDetermined: false
complianceResult: null
selectionRecommendation: null
providerSelected: false
implementationSelected: false
entropyBytesRequested: 0
entropyGenerated: false
entropyOutput: null
```

The request cannot identify, fingerprint, score, recommend or select a provider. It cannot choose an implementation, library, API, device or syscall, attach provider evidence, request entropy, generate secrets, write production files, commit, deploy or publish.

## Requirements

A request requires:

1. An approved, exact and non-executing Phase 1.25 decision.
2. Active provider-policy and upstream signed windows.
3. A one-to-five-second lifetime.
4. Another read-only SHA-256 and byte-size check of every candidate file.
5. Exact target and operation scope.
6. Verification of all supplied upstream, policy-request, policy-decision and evaluation-request ledgers.

## Storage

```text
.autonomous-machine/production-execution-entropy-provider-candidate-evaluation-requests.jsonl
```

The ledger is append-only, HMAC-SHA-256 signed and hash chained. Identical active requests are idempotent; conflicting requests and renewal after expiry fail closed.

## Manual command

```text
node scripts/autonomous-machine/production-execution-entropy-provider-candidate-evaluation-request-cli.js list
node scripts/autonomous-machine/production-execution-entropy-provider-candidate-evaluation-request-cli.js show <id>
node scripts/autonomous-machine/production-execution-entropy-provider-candidate-evaluation-request-cli.js request <provider-policy-decision-id> --requester <name> --role <role> --note <reason>
node scripts/autonomous-machine/production-execution-entropy-provider-candidate-evaluation-request-cli.js verify
```

The command additionally requires:

```text
AIM_EXECUTION_ENTROPY_PROVIDER_CANDIDATE_EVALUATION_REQUEST_SIGNING_KEY
```

## Validation

The isolated Phase 1.26 harness covers weak keys, duration limits, expiry, insufficient remaining time, changed or missing files, exact scope, rejected decisions, invalid upstream ledgers, idempotency, conflicting requests, tamper detection and attempted identity, evidence, scoring, selection or entropy injection.

No provider identity, implementation, entropy output, production write, Git action, deployment, publication, schedule, LLM or GPU execution is introduced.
