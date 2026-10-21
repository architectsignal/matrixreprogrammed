# Phase 1.27 — Signed Anonymous Provider-Evaluation Decisions

Phase 1.27 adds a separately signed human approval or rejection of a Phase 1.26 anonymous provider-candidate-evaluation request.

## Boundary

Approval authorises only a later abstract criteria-review request. It does not identify, describe, fingerprint, score, recommend or select any provider.

The decision preserves:

```text
evaluationMode: anonymous_abstract_policy_compliance_only
candidateIdentityPresent: false
candidateIdentifier: null
candidateName: null
candidateFingerprint: null
candidateMetadata: null
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

All eight policy criteria remain `pending_manual_abstract_compliance_review` with no evidence or result attached.

## Approval requirements

Approval requires:

1. An active Phase 1.26 request with at least one second remaining.
2. All 15 identity, evidence, scoring, compliance, selection, entropy, scope, backup, restore and production-owner reviews.
3. A fresh read-only SHA-256 and byte-size check of every candidate file.
4. Exact reconstruction of the signed target and operation scope.
5. Verification of the signed provider-policy parents, request ledger and decision ledger.

Rejection performs no file preflight and grants no authority.

## Storage

```text
.autonomous-machine/production-execution-entropy-provider-candidate-evaluation-decisions.jsonl
```

The ledger is append-only, HMAC-SHA-256 signed and hash chained. Identical decisions are idempotent; conflicting second decisions fail closed.

## Manual command

```text
node scripts/autonomous-machine/production-execution-entropy-provider-candidate-evaluation-decision-cli.js list
node scripts/autonomous-machine/production-execution-entropy-provider-candidate-evaluation-decision-cli.js show <id>
node scripts/autonomous-machine/production-execution-entropy-provider-candidate-evaluation-decision-cli.js decide <request-id> approve --reviewer <name> --role <role> --note <reason> --all-reviews-complete
node scripts/autonomous-machine/production-execution-entropy-provider-candidate-evaluation-decision-cli.js verify
```

Required keys:

```text
AIM_EXECUTION_ENTROPY_PROVIDER_POLICY_REQUEST_SIGNING_KEY
AIM_EXECUTION_ENTROPY_PROVIDER_POLICY_DECISION_SIGNING_KEY
AIM_EXECUTION_ENTROPY_PROVIDER_CANDIDATE_EVALUATION_REQUEST_SIGNING_KEY
AIM_EXECUTION_ENTROPY_PROVIDER_CANDIDATE_EVALUATION_DECISION_SIGNING_KEY
```

## Validation

The isolated Phase 1.27 harness covers approval, rejection, all 15 mandatory reviews, request expiry, file drift, missing files, exact scope, invalid upstream ledgers, idempotency, conflicting decisions, tamper detection and attempted identity, metadata, evidence, scoring, compliance, recommendation, provider selection, implementation selection or entropy injection.

No provider identity, evidence, score, compliance result, selection, entropy output, production write, Git action, deployment, publication, schedule, LLM or GPU execution is introduced.
