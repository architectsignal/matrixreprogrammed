# Autonomous Intelligence Machine — Phase 1.9

## Purpose

Phase 1.9 adds a separately signed human approval or rejection record for a Phase 1.8 production-target mapping and execution-plan preview.

It does not execute the plan.

It does not confirm a final production destination.

It does not modify repository files, stage or commit Git changes, deploy, publish, or schedule work.

## Authority boundary

Every Phase 1.9 record uses:

```text
mode: execution_plan_decision_record_only
authority: signed_human_execution_plan_decision_only_no_execution_authority
readyForExecution: false
executionAuthorityGranted: false
```

Approval is a review record only. It cannot be interpreted as permission to write or execute.

## Required signed inputs

Before a decision can be recorded, the service verifies:

1. The Phase 1.6 production change-request ledger with `AIM_CHANGE_REQUEST_SIGNING_KEY`.
2. The Phase 1.7 production change-decision ledger with `AIM_CHANGE_DECISION_SIGNING_KEY`.
3. The Phase 1.8 execution-plan ledger with `AIM_EXECUTION_PLAN_SIGNING_KEY`.
4. The existing Phase 1.9 decision ledger with `AIM_EXECUTION_PLAN_DECISION_SIGNING_KEY`.

The plan must remain:

```text
authority: preview_only_no_execution_authority
status: pending_manual_execution_plan_review
readyForExecution: false
```

The Phase 1.7 source decision must remain an approved authorisation record with no execution authority.

## Exact binding

A Phase 1.9 record binds to the exact:

- execution-plan ID;
- execution-plan record hash;
- execution-plan payload hash;
- Phase 1.7 decision ID;
- change-request ID;
- application ID and fingerprint;
- sorted target IDs;
- complete target-mapping snapshot hash;
- complete execution-step snapshot hash.

A decision cannot be transferred to a changed plan, altered mapping, different request, or different staging application.

## Approval requirements

Approval requires all five reviews to be explicitly complete:

- target mapping review;
- current file-snapshot review;
- rollback-plan review;
- validation-plan review;
- production-owner review.

Approval also requires every candidate path in the Phase 1.8 plan to exist at review time. A plan containing a missing candidate cannot be approved. It can only be rejected or rebuilt after manual resolution.

Even after approval, the mapping remains unconfirmed for execution and all destinations remain unresolved.

## Rejection

A reviewer may reject a plan without marking every review complete.

Rejection records:

```text
status: rejected_mapping_or_plan_no_authorisation
nextAction: none
executionAuthorityGranted: false
```

## Signed decision ledger

Records are written only to excluded runtime state:

```text
.autonomous-machine/production-execution-plan-decisions.jsonl
```

Each record includes:

- a canonical payload hash;
- a record hash;
- the previous record hash;
- an HMAC-SHA-256 signature;
- a signing-key identifier;
- reviewer identity, role and rationale.

The signing secret is never stored.

Identical repeated decisions are idempotent. A conflicting second decision for the same execution plan fails closed.

## Permanent safety values

Every record must contain:

```text
productionFilePath: null
productionDestinationResolved: false
mappingConfirmedForExecution: false
finalDestinationConfirmed: false
readyForExecution: false
executionAuthorityGranted: false

productionTarget: null
productionWriteAllowed: false
executionAllowed: false
commitAllowed: false
deploymentAllowed: false
publicationAllowed: false

productionWrites: 0
publicationTasksCreated: 0
commitActions: 0
deploymentActions: 0
```

An approved record can only point to:

```text
separate_manual_execution_authorisation_and_fresh_hash_review
```

That later review must revalidate current file hashes and must remain separate from this decision.

## Manual command

```text
node scripts/autonomous-machine/run-phase1-review-execution-plan.js list
node scripts/autonomous-machine/run-phase1-review-execution-plan.js show <decision-or-plan-id>
node scripts/autonomous-machine/run-phase1-review-execution-plan.js verify
```

Approval example:

```text
node scripts/autonomous-machine/run-phase1-review-execution-plan.js decide <plan-id> approve \
  --reviewer "reviewer name" \
  --role "production plan reviewer" \
  --note "Mapping and plan reviewed as a non-executing record." \
  --target-mapping-reviewed \
  --file-snapshots-reviewed \
  --rollback-plan-reviewed \
  --validation-plan-reviewed \
  --production-owner-reviewed
```

Rejection example:

```text
node scripts/autonomous-machine/run-phase1-review-execution-plan.js decide <plan-id> reject \
  --reviewer "reviewer name" \
  --role "editorial reviewer" \
  --note "Reject because a candidate path or validation step requires correction."
```

## Required environment

```text
AIM_CHANGE_REQUEST_SIGNING_KEY
AIM_CHANGE_DECISION_SIGNING_KEY
AIM_EXECUTION_PLAN_SIGNING_KEY
AIM_EXECUTION_PLAN_DECISION_SIGNING_KEY
```

Optional:

```text
AIM_EXECUTION_PLAN_DECISION_SIGNING_KEY_ID
```

Every signing key must contain at least 32 bytes.

## Validation

The Phase 1.9 safety test verifies:

- weak or missing signing keys fail closed;
- invalid decisions and reviewer metadata are rejected;
- all approval reviews are mandatory;
- missing candidate paths prevent approval;
- rejection remains possible without granting authority;
- exact request, decision, application, target, mapping and step bindings are preserved;
- duplicate identical decisions are idempotent;
- conflicting decisions are blocked;
- wrong signing keys and tampered ledgers fail verification;
- audit records report zero production, publication, commit and deployment actions;
- production sentinel files remain byte-for-byte unchanged.

## Explicitly out of scope

Phase 1.9 does not:

- confirm final production paths;
- refresh or approve changed file hashes;
- generate a writable patch;
- modify a file;
- stage or commit Git changes;
- deploy;
- publish;
- create a schedule;
- grant autonomous execution authority.
