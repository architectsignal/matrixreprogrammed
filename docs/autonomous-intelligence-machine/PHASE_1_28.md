# Phase 1.28 — Signed Anonymous Criteria-Review Requests

Phase 1.28 creates a separately signed request to authorise manual inspection of the eight abstract provider-policy criteria after an approved Phase 1.27 anonymous evaluation decision.

## Boundary

The request authorises **inspection only**. Every criterion remains not started:

```text
manualReviewAuthorised: true
reviewStatus: not_started
reviewStarted: false
reviewCompleted: false

evidenceAttachmentAllowed: false
evidenceAttached: false
findingAllowed: false
finding: null
scoreAllowed: false
score: null
complianceDeterminationAllowed: false
complianceDetermined: false
complianceResult: null
recommendationAllowed: false
recommendation: null
```

The eight criteria are:

1. local operating-system management;
2. cryptographic security;
3. no network dependency;
4. no external provider;
5. no user-supplied seed;
6. no deterministic fallback;
7. fail-closed behaviour;
8. forbidden entropy-output logging.

The request cannot identify or describe a provider, attach evidence, begin or complete a review, record a finding, assign a score, determine compliance, make a recommendation, select a provider or implementation, or request entropy.

## Requirements

A request requires:

1. An approved, exact and non-executing Phase 1.27 decision.
2. Active evaluation and upstream signed windows.
3. A one-to-four-second lifetime.
4. Another read-only SHA-256 and byte-size check of every candidate file.
5. Exact target and operation scope.
6. Verification of the supplied upstream, evaluation-request, evaluation-decision and criteria-review-request ledgers.

## Storage

```text
.autonomous-machine/production-execution-entropy-provider-anonymous-criteria-review-requests.jsonl
```

The ledger is append-only, HMAC-SHA-256 signed and hash chained. Identical active requests are idempotent; conflicting requests and renewal after expiry fail closed.

## Manual command

```text
node scripts/autonomous-machine/production-execution-entropy-provider-anonymous-criteria-review-request-cli.js list
node scripts/autonomous-machine/production-execution-entropy-provider-anonymous-criteria-review-request-cli.js show <id>
node scripts/autonomous-machine/production-execution-entropy-provider-anonymous-criteria-review-request-cli.js request <evaluation-decision-id> --requester <name> --role <role> --note <reason> [--duration-seconds <1-4>]
node scripts/autonomous-machine/production-execution-entropy-provider-anonymous-criteria-review-request-cli.js verify
```

The command additionally requires:

```text
AIM_EXECUTION_ENTROPY_PROVIDER_CANDIDATE_EVALUATION_REQUEST_SIGNING_KEY
AIM_EXECUTION_ENTROPY_PROVIDER_CANDIDATE_EVALUATION_DECISION_SIGNING_KEY
AIM_EXECUTION_ENTROPY_PROVIDER_ANONYMOUS_CRITERIA_REVIEW_REQUEST_SIGNING_KEY
```

## Validation

The isolated Phase 1.28 harness passes 53 checks covering weak signing keys, duration limits, expiry, insufficient remaining time, changed or missing files, exact scope, rejected decisions, invalid upstream ledgers, idempotency, conflicting requests, tamper detection and attempted identity, evidence, review-state, finding, score, compliance, recommendation, provider-selection or entropy injection.

No provider identity, evidence, finding, score, compliance result, recommendation, selection, entropy output, production write, Git action, deployment, publication, schedule, LLM or GPU execution is introduced.