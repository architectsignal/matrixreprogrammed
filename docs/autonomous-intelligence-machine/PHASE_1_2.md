# Autonomous Intelligence Machine — Phase 1.2

## Status

Phase 1.2 adds read-only dossier matching and route proposals. It does not update a dossier, public page, clock, timeline, graph, search index or publication queue.

Pending records from `.autonomous-machine/review-queue.json` are compared with two existing repository registries:

- `data/dossier-packs.json`
- `data/epstein-people-index.json`

The result is written only to `.autonomous-machine/route-proposals.json` with status `pending_route_review`.

## Matching rules

### People and entities

A person-tracker proposal requires the complete registered name as an exact normalised phrase in the review record title, summary, lane or evidence boundary.

Partial names, initials and fuzzy similarity do not create a person proposal.

A person match means only that the source item may deserve comparison with the existing tracker. It does not prove identity, association, guilt, conduct or relevance.

### Dossier packs

Dossier-pack proposals use deterministic weighted matching against the existing registry:

- the review record's existing lane;
- pack title and slug;
- pack keywords;
- subject-map phrases;
- weekly watch phrases;
- evidence-upgrade phrases.

At most three dossier-pack routes are proposed. The score and reasons remain visible for human review.

## Safety rules

1. Publication mode remains `disabled`.
2. Phase 1.2 creates no `publication_candidate` tasks.
3. Route proposals never alter their source review record.
4. Registry source files are read only.
5. Site routes must be root-relative and cannot contain schemes, leading slashes, backslashes, control characters, `.` or `..` path segments.
6. Every proposal stores the registry fingerprint used to create it.
7. A task fails if the registry fingerprint changes after task creation.
8. Proposal batches are deterministic and deduplicated.
9. Unmatched records remain visible as unmatched batches; they are not forced into a dossier.
10. All route-proposal activity is recorded in the tamper-evident audit chain.

## Run the offline test

```bash
node scripts/autonomous-machine/phase1.2-self-test.js
```

Expected output includes:

```json
{
  "ok": true,
  "tests": 24,
  "productionWrites": 0,
  "publicationTasksCreated": 0
}
```

## Run the proposal process manually

First run the supervised source watch so review records exist. Then run:

```bash
AIM_PUBLICATION_MODE=disabled node scripts/autonomous-machine/run-phase1-route-proposals.js
```

Runtime files remain under `.autonomous-machine/` and are excluded from Git.

## What Phase 1.2 does not do

- accept or reject a route proposal;
- edit a dossier or entity record;
- insert evidence into a profile;
- update a clock or conclusion;
- generate a public card;
- publish or deploy;
- run on a schedule;
- use an LLM or external GPU.

## Next controlled increment

Phase 1.3 should create a human review command that can accept or reject a route proposal and produce a signed handoff record. Acceptance must still not modify production content automatically.
