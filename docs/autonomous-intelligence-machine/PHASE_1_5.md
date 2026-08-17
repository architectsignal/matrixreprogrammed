# Autonomous Intelligence Machine — Phase 1.5

## Purpose

Phase 1.5 validates a Phase 1.4 staging preview by applying its restricted JSON operations to a **disposable runtime copy** of the preview's synthetic `before` document.

It does not apply the preview to a site file, dossier, data registry, generated page, deployment artifact or Git working tree.

## Input boundary

The consumer accepts only a staging preview already stored by Phase 1.4 under:

```text
.autonomous-machine/staging-previews/
```

Before processing, it verifies:

- the complete staging-preview store;
- the selected preview's deterministic fingerprint;
- the preview contract and `staging_preview_only` status;
- `productionTarget: null` in both the patch and safety block;
- all automatic-apply, commit, deployment and publication permissions remain `false`;
- all recorded production, publication, commit and deployment action counts remain zero.

An optional expected preview fingerprint can be supplied to prevent an operator from applying a different preview than the one reviewed.

## Restricted patch application

Phase 1.5 permits exactly three `replace` operations:

```text
/generatedFrom
/sourceSnapshot
/routeCandidates
```

It rejects:

- `add`, `remove`, `move`, `copy` and `test` operations;
- any unapproved path;
- duplicate paths;
- incomplete patch sets;
- path traversal;
- invalid route destinations;
- duplicate route targets;
- missing source provenance;
- route candidates not marked `proposed_for_manual_production_review`.

The operations are applied to an in-memory clone of the synthetic staging document. No repository path is opened or resolved.

## Exact validation

After application, Phase 1.5 validates the resulting staging schema and calculates:

- canonical `before` hash;
- expected `after` hash;
- actual applied-document hash;
- patch hash;
- canonical diff-summary hash.

The disposable result is stored only when the actual document is byte-equivalent under canonical JSON serialisation to the reviewed preview's expected `after` document.

Any mismatch fails closed and creates no application record.

## Runtime output

Validated applications are stored under:

```text
.autonomous-machine/staging-applies/
```

Each record contains:

- preview ID and fingerprint;
- handoff and route-batch references;
- before, expected-after, actual-after and patch hashes;
- the disposable applied document;
- a top-level canonical diff summary;
- deterministic application fingerprint;
- explicit zero-authority safety fields.

The application store uses:

- atomic writes;
- deterministic deduplication;
- file-name and directory confinement;
- content-integrity verification;
- index-integrity verification;
- fail-closed handling of a tampered existing application.

## Authority boundary

Every Phase 1.5 result is fixed to:

```json
{
  "mode": "disposable_runtime_only",
  "workspaceType": "disposable_runtime_copy",
  "productionTarget": null,
  "productionWriteAllowed": false,
  "commitAllowed": false,
  "deploymentAllowed": false,
  "publicationAllowed": false,
  "productionWrites": 0,
  "publicationTasksCreated": 0,
  "commitActions": 0,
  "deploymentActions": 0
}
```

A successful application proves only that the reviewed preview can be reproduced exactly in an isolated runtime document. It is not permission to alter production content.

## Manual commands

List disposable applications:

```bash
node scripts/autonomous-machine/run-phase1-apply-preview.js list
```

Inspect one application:

```bash
node scripts/autonomous-machine/run-phase1-apply-preview.js show <application-id-or-fingerprint>
```

Apply a preview to a disposable copy:

```bash
node scripts/autonomous-machine/run-phase1-apply-preview.js apply <preview-id-or-fingerprint> [expected-preview-fingerprint]
```

Verify preview, application and audit stores:

```bash
node scripts/autonomous-machine/run-phase1-apply-preview.js verify
```

## Validation

The Phase 1.5 offline suite performs 66 checks covering:

- required stores and identifiers;
- optional fingerprint pinning;
- patch-operation and path restrictions;
- complete patch-set enforcement;
- schema and provenance validation;
- route and duplicate-target validation;
- exact expected-versus-actual hash equality;
- disposable safety fields;
- deterministic deduplication;
- audit-chain integrity;
- application-content tampering;
- manipulated application-index paths;
- unchanged production sentinel files;
- absence of Git lock, deployment and production-output artifacts.

Run it with:

```bash
AIM_PUBLICATION_MODE=disabled node scripts/autonomous-machine/phase1.5-self-test.js
```

## Not included

Phase 1.5 does not:

- read or write a production destination;
- alter an existing dossier or person tracker;
- update public pages or machine-readable production data;
- stage or commit Git changes;
- open or merge a pull request;
- deploy;
- publish;
- schedule itself;
- use an LLM or GPU.

## Next controlled increment

Phase 1.6 may create a separately signed **production change request package** from an exact Phase 1.5 result. That package must remain advisory and incapable of modifying, committing, deploying or publishing production content.
