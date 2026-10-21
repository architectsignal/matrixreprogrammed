# Autonomous Intelligence Machine — Phase 1.4

## Purpose

Phase 1.4 converts an **accepted, signed Phase 1.3 route handoff** into a staging-only preview bundle.

It does not edit a dossier, page, timeline, clock, graph, search index, public JSON file or production database. It does not create a commit, trigger a deployment or request publication.

The output exists only to let a human inspect what a later production integration might contain.

## Input boundary

A preview can be generated only from a handoff that:

- is present in the append-only Phase 1.3 handoff ledger;
- passes the complete HMAC-SHA-256 ledger verification;
- records an `accept` decision;
- has the handoff type `route_proposal_acceptance`;
- has authority limited to `handoff_only_manual_production_review_required`;
- records zero production writes and zero publication tasks;
- retains source provenance;
- references the current route-registry fingerprint;
- contains one or more signed route proposals that still exactly match the current route registry.

Rejected, stale, altered, unsigned, incorrectly signed, incomplete or zero-provenance handoffs fail closed.

## Output

Runtime output is written only beneath:

```text
.autonomous-machine/staging-previews/
```

The directory contains:

- `index.json` — local preview metadata;
- `preview-<sha256>.json` — the complete staging preview bundle.

The preview bundle contains:

- the signed handoff identifiers and hashes;
- the current route-registry fingerprint;
- a synthetic empty `before` staging document;
- a proposed `after` staging document;
- a JSON Patch-style preview;
- the source and provenance snapshot;
- selected dossier or person-tracker route candidates;
- explicit zero-action safety fields.

The patch target is always `isolated_staging_document`. Its `productionTarget` is always `null`.

## Permanent Phase 1.4 safety fields

Every preview requires:

```json
{
  "productionTarget": null,
  "autoApplyAllowed": false,
  "commitAllowed": false,
  "deploymentAllowed": false,
  "publicationAllowed": false,
  "productionWrites": 0,
  "publicationTasksCreated": 0,
  "commitActions": 0,
  "deploymentActions": 0
}
```

A bundle that does not preserve those values is rejected.

## Integrity controls

Phase 1.4:

- verifies the complete signed handoff chain before reading a decision;
- compares every selected target with the current canonical route registry;
- fingerprints the complete preview content;
- writes preview files atomically;
- deduplicates identical previews;
- revalidates an existing preview before idempotent reuse;
- detects altered preview content;
- rejects preview-index file names that could escape the staging directory;
- keeps the signing secret out of preview files;
- records preview creation in the tamper-evident audit log.

## Manual command

Publication mode must remain disabled.

```text
AIM_PUBLICATION_MODE=disabled
AIM_REVIEW_SIGNING_KEY=<secret containing at least 32 bytes>
```

List previews:

```text
node scripts/autonomous-machine/run-phase1-build-preview.js list
```

Build a preview from an accepted signed handoff:

```text
node scripts/autonomous-machine/run-phase1-build-preview.js build <handoff-id>
```

Show one preview:

```text
node scripts/autonomous-machine/run-phase1-build-preview.js show <preview-id>
```

Verify the signed handoff ledger, staging-preview store and audit chain:

```text
node scripts/autonomous-machine/run-phase1-build-preview.js verify
```

The runtime root must remain inside the repository working tree and defaults to `.autonomous-machine`.

## What Phase 1.4 cannot do

Phase 1.4 cannot:

- choose or approve a route autonomously;
- apply its JSON patch to a production file;
- resolve a production destination;
- modify the canonical dossier or people registries;
- modify public site content;
- create or stage a Git commit;
- push a branch;
- trigger a deployment;
- create a publication task;
- publish a claim.

## Validation

The Phase 1.4 offline test covers 54 checks, including:

- missing and incorrect signing keys;
- rejected and missing handoffs;
- stale registries;
- changed or missing route targets;
- incomplete, duplicate or provenance-free handoffs;
- zero-write enforcement;
- runtime path confinement;
- preview fingerprints and idempotence;
- preview-content tampering;
- preview-index path tampering;
- unchanged canonical registry files;
- zero commit, deployment, production and publication actions.

Run:

```text
node scripts/autonomous-machine/phase1.4-self-test.js
```

## Next controlled step

Phase 1.5 may apply an approved preview to a **disposable runtime copy** of a staging document and validate the resulting schema and diff. It must still be unable to alter a production file, create a commit, deploy or publish.
