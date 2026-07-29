# Autonomous Intelligence Machine — Phase 1.6

## Purpose

Phase 1.6 converts an exact Phase 1.5 disposable staging application into a separately signed, advisory production change-request package.

The package requests human review. It does not authorise or perform a production change.

## Input boundary

A change request can be created only from a Phase 1.5 application that:

- exists in the verified staging-application store;
- has status `disposable_staging_application_only`;
- records `exactMatch: true`;
- uses a `disposable_runtime_copy` workspace;
- has `productionTarget: null`;
- records zero production, publication, commit and deployment actions;
- contains a valid applied staging document;
- contains source provenance;
- has matching expected and actual canonical document hashes;
- has a valid canonical diff hash;
- records `exactPreviewMatch: true`.

## Separate signing authority

Phase 1.6 uses a separate secret:

```text
AIM_CHANGE_REQUEST_SIGNING_KEY
```

The secret must contain at least 32 bytes. It must not be reused as the Phase 1.3 review-handoff key.

The optional public key identifier is:

```text
AIM_CHANGE_REQUEST_SIGNING_KEY_ID
```

The secret is never written into the request ledger.

## Request package

Each package contains:

- the disposable application ID and fingerprint;
- preview, handoff and route-batch references;
- before, after, patch and diff hashes;
- the identified requester;
- the requester’s written rationale;
- the source and provenance snapshot;
- canonical route-target references;
- evidence boundaries and match context;
- required evidence, editorial and production-owner approvals;
- a legal-review requirement for medium- and high-sensitivity records;
- an explicit zero-authority safety declaration.

The package status is:

```text
pending_production_change_review
```

Its authority is:

```text
advisory_only_manual_production_authorisation_required
```

## Destination boundary

A requested change may contain canonical public route references such as a dossier route, evidence route or machine route.

It may not resolve a repository or production filename.

Every change item is forced to:

```text
productionFilePath: null
productionDestinationResolved: false
requestedOperation: manual_review_and_integrate_evidence
reviewStatus: pending_manual_production_review
```

## Signed ledger

Requests are stored at runtime in:

```text
.autonomous-machine/production-change-requests.jsonl
```

The ledger is:

- append-only;
- HMAC-SHA-256 signed;
- payload hashed;
- record hashed;
- hash chained;
- timing-safe when comparing signatures;
- idempotent for an identical request;
- fail-closed for a conflicting second request based on the same application.

## Manual command

```bash
export AIM_CHANGE_REQUEST_SIGNING_KEY='use-a-separate-secret-with-at-least-32-bytes'

node scripts/autonomous-machine/run-phase1-build-change-request.js list
node scripts/autonomous-machine/run-phase1-build-change-request.js show <request-or-application-id>
node scripts/autonomous-machine/run-phase1-build-change-request.js verify
node scripts/autonomous-machine/run-phase1-build-change-request.js build <application-id> \
  --requester 'reviewer-name' \
  --note 'Reason this exact staging result should enter manual production review.'
```

The command has no apply, commit, deploy or publish operation.

## Permanent safety declarations

Every package requires:

```text
productionTarget: null
productionWriteAllowed: false
commitAllowed: false
deploymentAllowed: false
publicationAllowed: false
productionWrites: 0
publicationTasksCreated: 0
commitActions: 0
deploymentActions: 0
```

Phase 1.6 cannot:

- determine a production filename;
- edit a dossier, page, clock, timeline, graph or search index;
- stage Git changes;
- create a commit;
- push a branch;
- deploy the site;
- publish a claim;
- bypass evidence, editorial, legal or production-owner review.

## Validation

Run:

```bash
node scripts/autonomous-machine/phase1.6-self-test.js
```

The suite verifies separate-key requirements, exact application hashes, source provenance, route safety, duplicate-target rejection, sensitivity-based legal review, idempotency, conflicting-request rejection, ledger chaining, wrong-key rejection, tamper detection and zero production side effects.

## Next controlled phase

Phase 1.7 may add a human approval or rejection decision for an advisory production change request.

Approval must remain a signed authorisation record only. It must not itself edit a file, create a commit, deploy or publish.
