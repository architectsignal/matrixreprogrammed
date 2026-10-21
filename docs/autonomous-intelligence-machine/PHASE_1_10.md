# Autonomous Intelligence Machine — Phase 1.10

## Purpose

Phase 1.10 creates a separately signed, time-limited **manual execution-authorisation request** from an approved Phase 1.9 execution-plan decision.

It is still a request record only. It does not grant authority to edit a file, stage or commit Git changes, deploy, publish, or run on a schedule.

## Preconditions

The request service verifies the complete signed chain:

1. Phase 1.6 production change request.
2. Phase 1.7 human change-request decision.
3. Phase 1.8 production target mapping and execution-plan preview.
4. Phase 1.9 human mapping and plan decision.
5. Existing Phase 1.10 request ledger.

The Phase 1.9 decision must be approved, must report every candidate present, and must show all required mapping, snapshot, rollback, validation and production-owner reviews as complete.

## Fresh candidate verification

Before creating a request, Phase 1.10 reads every unique candidate file again.

It rejects:

- missing candidates;
- changed SHA-256 hashes;
- changed byte sizes;
- symlinks or symlink path components;
- protected, hidden, encoded or escaping paths;
- unsupported extensions;
- non-regular or oversized files;
- changed request, decision, plan or target bindings.

The fresh snapshot records:

- candidate path;
- related target IDs and route roles;
- original and current SHA-256;
- original and current byte size;
- verification timestamp;
- maximum permitted snapshot age;
- a deterministic snapshot hash.

Every candidate remains `writeAllowed: false`.

## Time limit

The request window must be between 60 and 3,600 seconds. The default is 900 seconds.

The payload records:

- `requestedAt`;
- `validFrom`;
- `expiresAt`;
- `durationSeconds`;
- `singleUseRequested: true`;
- `timeLimited: true`.

An identical active request is idempotent. A conflicting request is blocked. An expired request cannot be renewed by Phase 1.10.

## Rollback package

Phase 1.10 creates a signed rollback **manifest**, not a backup.

For every unique candidate it records:

- pre-execution path;
- pre-execution SHA-256 and byte size;
- affected target IDs;
- required restore action;
- required restore verification.

It also requires these later steps:

1. Create an external backup before any write.
2. Record backup location and SHA-256.
3. Rehearse restoration in a disposable workspace.
4. Verify the restored file matches the pre-execution snapshot.
5. Obtain a separate execution-authorisation decision.

The package is deliberately fixed to:

```text
backupsCreated: 0
packageComplete: false
externalVerifiedBackupRequired: true
restoreTestRequired: true
```

## Signing and storage

The request uses a separate secret:

```text
AIM_EXECUTION_AUTHORISATION_REQUEST_SIGNING_KEY
```

Runtime records are stored at:

```text
.autonomous-machine/production-execution-authorisation-requests.jsonl
```

The append-only ledger uses HMAC-SHA-256 signatures, canonical payload hashes, record hashes, previous-record hash chaining and timing-safe signature verification. The signing secret is never stored.

## Manual command

```text
node scripts/autonomous-machine/run-phase1-request-execution-authorisation.js build <approved-execution-plan-decision-id> \
  --requester <name> \
  --role <role> \
  --note <reason> \
  --rollback-custodian <name> \
  --rollback-note <reason> \
  --duration-seconds 900 \
  --fresh-hash-max-age-seconds 300
```

Other commands:

```text
list
show <request-id-or-execution-plan-decision-id>
verify
```

## Permanent safety boundary

Every request is fixed to:

```text
productionFilePath: null
productionDestinationResolved: false
finalDestinationConfirmed: false
readyForExecution: false
executionAuthorityGranted: false
authorisationGranted: false

productionWriteAllowed: false
executionAllowed: false
commitAllowed: false
deploymentAllowed: false
publicationAllowed: false
```

Phase 1.10 performs zero production writes, creates zero publication tasks, runs zero Git commands and performs zero deployment actions.

## Validation

The Phase 1.10 safety harness covers weak signing keys, invalid time windows, stale files, missing files, incomplete and rejected approvals, active-request idempotency, expired requests, conflicting requests, ledger tampering, rollback-manifest integrity and zero production/Git/deployment actions.

Expected result:

```json
{
  "ok": true,
  "tests": 57,
  "signedAuthorisationRequests": 1,
  "uniqueCandidates": 2,
  "rollbackPackageComplete": false,
  "readyForExecution": false,
  "executionAuthorityGranted": false,
  "authorisationGranted": false,
  "productionWrites": 0,
  "publicationTasksCreated": 0,
  "commitActions": 0,
  "deploymentActions": 0
}
```

## Next controlled increment

Phase 1.11 may add a separately signed human approval or rejection of the time-limited request. It must require a completed external rollback package and another fresh hash check, and it must still not perform a production write, Git commit, deployment or publication action.
