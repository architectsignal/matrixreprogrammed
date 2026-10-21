# Autonomous Intelligence Machine — Phase 1.11

## Purpose

Phase 1.11 adds a separately signed human approval or rejection of a Phase 1.10 time-limited manual execution-authorisation request.

This phase still grants no execution capability. Approval is an integrity and readiness record only.

## Required approval conditions

Approval requires all of the following at decision time:

1. The Phase 1.10 request is still active.
2. At least 30 seconds remain in its signed validity window.
3. The Phase 1.10 fresh snapshot remains within its signed maximum age.
4. Every candidate file is re-read in read-only mode.
5. Every current SHA-256 and byte size matches the Phase 1.10 request.
6. Exactly one external backup artifact exists for every unique candidate.
7. The external backup root is outside the repository.
8. Backup artifacts are regular files reached without symlinks or traversal.
9. Every backup SHA-256 and byte size matches its current candidate.
10. Every backup is restored into a disposable gitignored rehearsal workspace.
11. Every restored file matches the expected SHA-256 and byte size.
12. The disposable rehearsal workspace is removed.
13. Request-window, fresh-hash, external-backup, restore-rehearsal and production-owner reviews are all explicitly complete.

## Rejection

A human reviewer can reject a request without supplying backup artifacts or running a restore rehearsal.

Rejection creates a signed record and grants no authority.

## Runtime files

Phase 1.11 uses only excluded runtime state:

```text
.autonomous-machine/production-execution-authorisation-decisions.jsonl
.autonomous-machine/restore-rehearsals/
```

The restore rehearsal directory is temporary. Each approval creates a disposable workspace, verifies restored bytes and removes the workspace before the signed decision is written.

## Signing

Phase 1.11 requires a separate key:

```text
AIM_EXECUTION_AUTHORISATION_DECISION_SIGNING_KEY
```

Optional key identifier:

```text
AIM_EXECUTION_AUTHORISATION_DECISION_SIGNING_KEY_ID
```

The signing secret is never stored.

Each decision record contains:

- canonical payload hash;
- record hash;
- HMAC-SHA-256 signature;
- previous-record hash;
- exact Phase 1.10 request binding;
- request and plan snapshot bindings;
- decision-time validity review;
- final fresh-hash snapshot;
- verified external-backup manifest;
- disposable restore-rehearsal manifest;
- reviewer identity, role and rationale.

## Backup manifest format

The manual command accepts a JSON array or an object containing an `entries` array:

```json
[
  {
    "proposedRepositoryPath": "target-page.html",
    "backupArtifactPath": "backup-target-page.html"
  }
]
```

`backupArtifactPath` is relative to the separately supplied external backup root.

## Manual command

```text
node scripts/autonomous-machine/run-phase1-review-execution-authorisation.js help
```

Approval example:

```text
node scripts/autonomous-machine/run-phase1-review-execution-authorisation.js decide <request-id> approve \
  --reviewer "Production Owner" \
  --role "production-owner" \
  --note "Backups and disposable restoration were verified." \
  --all-reviews-complete \
  --backup-root /external/verified-backups \
  --backup-manifest /external/verified-backups/manifest.json
```

Rejection example:

```text
node scripts/autonomous-machine/run-phase1-review-execution-authorisation.js decide <request-id> reject \
  --reviewer "Editorial Reviewer" \
  --role "editorial-reviewer" \
  --note "Reject because the execution window or evidence package is not acceptable."
```

## Permanent safety boundary

Even an approved Phase 1.11 record requires:

```text
productionFilePath: null
productionDestinationResolved: false
finalDestinationConfirmed: false
readyForExecution: false
executionAuthorityGranted: false
authorisationGranted: false
```

It also requires:

```text
productionWriteAllowed: false
executionAllowed: false
commitAllowed: false
deploymentAllowed: false
publicationAllowed: false
```

Phase 1.11 performs:

```text
productionWrites: 0
publicationTasksCreated: 0
commitActions: 0
deploymentActions: 0
```

Disposable restore files are runtime-only safety tests, not production writes.

## Validation

The Phase 1.11 self-test checks:

- weak signing keys;
- invalid reviewer input;
- incomplete reviews;
- expired, stale and nearly expired requests;
- changed candidate files;
- backup roots inside the repository;
- missing, incorrect and traversal-based backup entries;
- restore rehearsal confinement and cleanup;
- approval and rejection records;
- idempotent identical decisions;
- conflicting second decisions;
- ledger tampering and incorrect signing keys;
- upstream ledger failures;
- unchanged production sentinel;
- absence of Git and deployment actions.

Expected test command:

```text
node scripts/autonomous-machine/phase1.11-self-test.js
```

## Next controlled boundary

A later phase may create a separately signed, single-use execution-token request. It must require another final hash check and must remain unable to execute until a distinct human decision grants narrowly scoped authority.
