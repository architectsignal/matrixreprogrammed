# Autonomous Intelligence Machine — Phase 1.3

## Status

Phase 1.3 adds an explicit human decision boundary between route proposals and any future production integration. It can accept or reject a proposal batch and create a keyed, tamper-evident handoff record. It still cannot edit or publish production content.

## Decision states

- `pending_route_review`
- `accepted_for_handoff`
- `rejected`

Acceptance means only that a human selected one or more proposed targets for a later manual production review. It does not establish identity, guilt, conduct, relevance beyond the selected routing purpose, or permission to publish.

## Signed handoff record

Each decision records:

- the route batch and review-record fingerprints;
- the current route-registry fingerprint;
- accept or reject;
- reviewer identity and reason;
- selected target snapshots;
- source and provenance snapshot;
- decision time;
- `productionWrites: 0`;
- `publicationTasksCreated: 0`;
- a SHA-256 payload hash;
- a hash-chain link to the previous decision;
- an HMAC-SHA-256 integrity signature.

The HMAC is a keyed integrity control. It proves that the record was produced by a process holding the configured secret; it is not a qualified electronic signature or independent proof of a reviewer’s legal identity.

## Secret boundary

Set a private signing key of at least 32 bytes:

```bash
export AIM_REVIEW_SIGNING_KEY='replace-with-a-private-random-secret'
export AIM_REVIEW_SIGNING_KEY_ID='manual-review-key-v1'
```

The secret is never written to the handoff file, audit log or proposal store. Do not commit it to GitHub or place it in command-line arguments.

## List pending decisions

```bash
node scripts/autonomous-machine/run-phase1-review-route.js --list
```

## Accept selected targets

```bash
export AIM_REVIEWER_ID='reviewer-id'
export AIM_REVIEW_NOTE='Approved as a routing handoff only; manual production review remains required.'
node scripts/autonomous-machine/run-phase1-review-route.js \
  --batch=route_BATCH_ID \
  --decision=accept \
  --targets=dossier-pack:crime-state-overlap
```

## Reject a proposal batch

```bash
export AIM_REVIEWER_ID='reviewer-id'
export AIM_REVIEW_NOTE='Rejected because the proposed route is too broad for this record.'
node scripts/autonomous-machine/run-phase1-review-route.js \
  --batch=route_BATCH_ID \
  --decision=reject
```

## Verify the handoff chain

```bash
node scripts/autonomous-machine/run-phase1-review-route.js --verify
```

## Fail-closed rules

A decision fails when:

- the signing key is absent or shorter than 32 bytes;
- the reviewer or review reason is missing;
- the route-registry fingerprint changed;
- the underlying review record changed;
- an accepted target is not inside the proposal batch;
- an unmatched batch is accepted;
- a rejection contains selected targets;
- another signed decision already exists for the batch;
- the handoff chain or signature cannot be verified.

## Recovery rule

The signed handoff is appended before the proposal batch is marked resolved. Repeating the identical command repairs the proposal status without creating a second handoff. A conflicting second decision is rejected.

## Phase boundary

Phase 1.3 does not:

- write dossiers or public pages;
- change clocks, timelines, knowledge graphs or search indexes;
- create publication candidates;
- publish accepted records;
- run on a schedule;
- use an LLM or GPU;
- deploy anything.
