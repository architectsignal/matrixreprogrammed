# Autonomous Intelligence Machine — Phase 1.7

## Signed human decisions on production change requests

Phase 1.7 adds a separately signed human decision layer above Phase 1.6 advisory production change requests.

It does not execute an approved request.

An approval is only a tamper-evident authorisation record confirming that the stated review requirements were completed and that the request may proceed to a separate manual production-execution review.

A rejection closes the request without granting any authority.

## Inputs

Phase 1.7 consumes the append-only Phase 1.6 ledger:

```text
.autonomous-machine/production-change-requests.jsonl
```

Before any decision is recorded, the complete request ledger is verified using:

```text
AIM_CHANGE_REQUEST_SIGNING_KEY
```

The decision is signed with a different secret:

```text
AIM_CHANGE_DECISION_SIGNING_KEY
```

Both secrets must contain at least 32 bytes. Neither secret is written to a runtime record.

## Required human input

Every decision requires:

- the exact Phase 1.6 change-request identifier;
- `approve` or `reject`;
- reviewer name;
- reviewer role;
- a written review note;
- explicit boolean completion states for:
  - evidence review;
  - editorial review;
  - legal review;
  - production-owner approval.

An approval fails closed unless every approval required by the Phase 1.6 package is marked complete.

When the request requires legal review, legal review must be complete before approval can be recorded.

A rejection may be recorded without completed approvals because it grants no authority.

## Exact binding

Each decision is bound to:

- the change-request identifier;
- change-request record hash;
- change-request payload hash;
- disposable application identifier;
- disposable application fingerprint;
- the sorted canonical target identifiers.

The decision cannot silently move to another request or application.

## Decision statuses

Approval:

```text
approved_authorisation_record_only
```

Rejection:

```text
rejected_no_authorisation
```

Both use the authority boundary:

```text
signed_human_decision_only_no_execution_authority
```

## Approval boundary

Even an approved record contains:

```text
productionFilePath: null
productionDestinationResolved: false
executionAuthorityGranted: false
productionTarget: null
productionWriteAllowed: false
executionAllowed: false
commitAllowed: false
deploymentAllowed: false
publicationAllowed: false
```

The next action after approval is only:

```text
separate_manual_production_execution_review
```

No production operation is created or invoked.

## Signed decision ledger

Decisions are stored only at runtime:

```text
.autonomous-machine/production-change-decisions.jsonl
```

Each record contains:

- a canonical payload hash;
- a record hash;
- an HMAC-SHA-256 signature;
- the previous record hash;
- a signing-key identifier;
- the complete decision payload.

The ledger is append-only and hash-chained.

An identical repeated decision is idempotent and returns the existing record.

A conflicting second decision for the same change request fails closed.

## Manual command

```text
node scripts/autonomous-machine/run-phase1-review-change-request.js list
node scripts/autonomous-machine/run-phase1-review-change-request.js show <request-or-decision-id>
node scripts/autonomous-machine/run-phase1-review-change-request.js verify
```

Record an approval or rejection:

```text
node scripts/autonomous-machine/run-phase1-review-change-request.js decide <change-request-id> \
  --decision approve \
  --reviewer "reviewer-name" \
  --role "production-owner" \
  --note "Review rationale" \
  --evidence-review true \
  --editorial-review true \
  --legal-review true \
  --production-owner-approval true
```

Required environment:

```text
AIM_CHANGE_REQUEST_SIGNING_KEY
AIM_CHANGE_DECISION_SIGNING_KEY
```

Optional environment:

```text
AIM_CHANGE_DECISION_SIGNING_KEY_ID
```

## Test coverage

The Phase 1.7 self-test verifies:

- missing and undersized signing keys;
- invalid decisions and reviewer data;
- missing change requests;
- malformed approval-completion input;
- incomplete evidence, editorial, legal or production-owner review;
- exact request, record-hash and payload-hash binding;
- approval and rejection statuses;
- zero execution authority after approval;
- deterministic idempotency;
- conflicting decision rejection;
- record hash chaining;
- wrong-key failure;
- decision-ledger tamper detection;
- request-ledger tamper detection;
- unchanged production sentinel;
- absence of production output, Git lock and deployment artifacts;
- zero production, publication, commit and deployment actions.

## Explicit exclusions

Phase 1.7 does not:

- resolve a production filename;
- edit a dossier, page, timeline, graph, clock or search index;
- apply a change request;
- stage or commit Git changes;
- create a pull request;
- deploy;
- publish;
- schedule itself;
- invoke an LLM or GPU.

Any future execution phase must use a separate authority boundary, fresh validation, an independently reviewable implementation plan and explicit production controls.
