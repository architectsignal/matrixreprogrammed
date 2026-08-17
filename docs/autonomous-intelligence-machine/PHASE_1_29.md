# Phase 1.29 — Signed Anonymous Criteria-Review Decisions

Phase 1.29 adds a separately signed human approval or rejection of a Phase 1.28 anonymous criteria-review request.

## Boundary

Approval authorises only a later, separately controlled anonymous review-session request. It does not begin a review or change any criterion state.

Every criterion remains:

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

The decision also preserves:

```text
candidateIdentityPresent: false
candidateMetadata: null
candidateEvidenceAttached: false
automaticScoringAllowed: false
manualScoringAllowed: false
providerSelected: false
implementationSelected: false
entropyBytesRequested: 0
entropyGenerated: false
entropyOutput: null
```

## Approval requirements

Approval requires:

1. An active Phase 1.28 request with at least one second remaining.
2. All 17 request-window, not-started-state, identity, metadata, evidence, finding, scoring, compliance, recommendation, selection, entropy, preflight, scope, backup, restore and production-owner reviews.
3. A fresh read-only SHA-256 and byte-size check of every candidate file.
4. Exact reconstruction of the signed target and operation scope.
5. Verification of the supplied upstream, criteria-request and criteria-decision ledgers.

Rejection performs no file preflight and grants no authority.

## Storage

```text
.autonomous-machine/production-execution-entropy-provider-anonymous-criteria-review-decisions.jsonl
```

The ledger is append-only, HMAC-SHA-256 signed and hash chained. Identical decisions are idempotent; conflicting second decisions fail closed.

## Manual command

```text
node scripts/autonomous-machine/production-execution-entropy-provider-anonymous-criteria-review-decision-cli.js list
node scripts/autonomous-machine/production-execution-entropy-provider-anonymous-criteria-review-decision-cli.js show <id>
node scripts/autonomous-machine/production-execution-entropy-provider-anonymous-criteria-review-decision-cli.js decide <request-id> approve --reviewer <name> --role <role> --note <reason> --all-reviews-complete
node scripts/autonomous-machine/production-execution-entropy-provider-anonymous-criteria-review-decision-cli.js verify
```

Required keys include:

```text
AIM_EXECUTION_ENTROPY_PROVIDER_ANONYMOUS_CRITERIA_REVIEW_REQUEST_SIGNING_KEY
AIM_EXECUTION_ENTROPY_PROVIDER_ANONYMOUS_CRITERIA_REVIEW_DECISION_SIGNING_KEY
```

## Validation

The isolated Phase 1.29 harness passes 44 checks covering approval, rejection, all 17 mandatory reviews, expiry, changed or missing files, exact scope, invalid upstream ledgers, idempotency, conflicting decisions, tamper detection and attempted review-state, identity, metadata, evidence, finding, score, compliance, recommendation, provider-selection, implementation-selection or entropy injection.

No review is started or completed. No provider identity, evidence, finding, score, compliance result, recommendation, selection, entropy output, production write, Git action, deployment, publication, schedule, LLM or GPU execution is introduced.