# Autonomous Intelligence Machine — Phase 1.8

## Purpose

Phase 1.8 converts an approved Phase 1.7 decision into a signed, preview-only production-target mapping and execution plan.

It answers:

- Which repository files appear to correspond to the approved public, evidence and machine routes?
- Do those candidate files currently exist?
- What are their current byte sizes and SHA-256 fingerprints?
- Which manual steps and validation gates would be required before a later execution review?

It does not edit, stage, commit, deploy or publish anything.

## Required inputs

A plan requires:

1. A valid Phase 1.6 production change-request ledger.
2. A valid Phase 1.7 decision ledger.
3. An approved Phase 1.7 decision.
4. Exact request-record, request-payload, application and target bindings.
5. An identified planner and written rationale.
6. A separate execution-plan signing key containing at least 32 bytes.

Required environment variables:

```text
AIM_CHANGE_REQUEST_SIGNING_KEY
AIM_CHANGE_DECISION_SIGNING_KEY
AIM_EXECUTION_PLAN_SIGNING_KEY
```

Optional:

```text
AIM_EXECUTION_PLAN_SIGNING_KEY_ID
```

## Read-only candidate mapping

For every approved target, Phase 1.8 proposes candidates from:

- the primary public route;
- the evidence route;
- the machine route, when present.

Overlapping routes are deduplicated and retain all applicable roles.

Allowed candidate extensions are:

```text
.html
.json
.md
.txt
```

Candidate mapping rejects:

- absolute paths;
- URLs and protocol-relative paths;
- traversal segments;
- encoded path characters;
- backslashes;
- hidden paths;
- `.git`;
- `.autonomous-machine`;
- `node_modules`;
- symlinks in any existing path component;
- directories and non-regular files;
- files above the configured read-only size ceiling.

The default read ceiling is 5 MiB per candidate. It may be lowered manually and cannot exceed 50 MiB.

## Candidate states

Existing regular files are recorded as:

```text
mappingStatus: candidate_existing_read_only
exists: true
regularFile: true
symlink: false
currentSha256: <hash>
currentBytes: <integer>
mappingConfirmedForExecution: false
writeAllowed: false
```

Missing paths are recorded as:

```text
mappingStatus: candidate_missing_manual_resolution_required
exists: false
regularFile: false
symlink: false
currentSha256: null
currentBytes: null
mappingConfirmedForExecution: false
writeAllowed: false
```

A candidate path is a proposal only. Its existence does not make it the confirmed production destination.

## Execution-plan preview

Each target receives a manual step containing:

- candidate paths;
- destination-confirmation requirement;
- current-hash revalidation;
- backup or recovery-point requirement;
- evidence-boundary and provenance review;
- separate execution authorisation;
- schema and syntax validation;
- link and route validation;
- targeted tests;
- human diff review.

Every step is fixed to:

```text
executionAllowed: false
productionWriteAllowed: false
```

The complete plan is fixed to:

```text
mode: mapping_and_execution_plan_preview_only
authority: preview_only_no_execution_authority
status: pending_manual_execution_plan_review
readyForExecution: false
productionTarget: null
productionWriteAllowed: false
executionAllowed: false
commitAllowed: false
deploymentAllowed: false
publicationAllowed: false
```

## Signed ledger

Plans are stored only in:

```text
.autonomous-machine/production-execution-plans.jsonl
```

The ledger is excluded from Git and contains:

- canonical payload hashes;
- record hashes;
- HMAC-SHA-256 signatures;
- previous-record hash chaining;
- timing-safe signature verification.

The signing secret is never stored.

An identical plan is idempotent. A different plan for the same approved decision fails closed so the earlier signed record cannot be silently replaced.

## Manual command

```text
node scripts/autonomous-machine/run-phase1-build-execution-plan.js list
node scripts/autonomous-machine/run-phase1-build-execution-plan.js show <execution-plan-id-or-decision-id>
node scripts/autonomous-machine/run-phase1-build-execution-plan.js build <approved-decision-id> --planner <name> --note <reason>
node scripts/autonomous-machine/run-phase1-build-execution-plan.js verify
```

An optional read ceiling can be supplied:

```text
--max-file-bytes <bytes>
```

## Safety invariants

Phase 1.8 must always report:

```text
readyForExecution: false
executionAuthorityGranted: false
productionWrites: 0
publicationTasksCreated: 0
commitActions: 0
deploymentActions: 0
```

It cannot:

- confirm a final production destination;
- edit a candidate file;
- create a patch;
- stage Git changes;
- create a commit;
- trigger deployment;
- create a publication task;
- publish content;
- run on a schedule.

## Validation

The offline test suite covers approved-decision binding, request hashes, application fingerprints, target equality, route deduplication, existing and missing candidates, file hashes, size ceilings, protected paths, traversal, encoded paths, extensions, symlinks, directories, ledger tampering, wrong keys, idempotency and zero-write guarantees.

```text
node scripts/autonomous-machine/phase1.8-self-test.js
```

Expected summary:

```json
{
  "ok": true,
  "tests": 70,
  "signedExecutionPlans": 1,
  "targetMappings": 2,
  "existingCandidates": 3,
  "missingCandidates": 1,
  "readyForExecution": false,
  "executionAuthorityGranted": false,
  "productionWrites": 0,
  "publicationTasksCreated": 0,
  "commitActions": 0,
  "deploymentActions": 0
}
```

## Next boundary

A later Phase 1.9 may add a separately signed human review of the execution-plan preview and its proposed mappings. Approval must still be a record only and must not authorise file modification, Git operations, deployment or publication.
