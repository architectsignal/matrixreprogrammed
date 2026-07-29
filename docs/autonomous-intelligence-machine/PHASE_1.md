# Autonomous Intelligence Machine — Phase 1

## Status

Phase 1 creates the supervised control plane for Matrix Reprogrammed. It does **not** crawl the internet, call external models, change live dossiers or publish content automatically.

The purpose of this phase is to establish the contracts that every later autonomous worker must obey before it is allowed to touch production data.

## Delivered foundation

- Persistent, priority-based task queue with deterministic deduplication.
- Approved-source registry with explicit terms review, automation permission and rate limits.
- Mission Director that claims one task at a time and delegates only to registered handlers.
- Default-deny publication gate.
- Human and editorial review requirements for sensitive claims.
- Tamper-evident append-only audit log using a SHA-256 hash chain.
- Environment kill switch.
- Atomic file writes for task and source state.
- Dependency-free self-test suitable for GitHub Actions and local Node execution.

## Safety rules

1. `AIM_PUBLICATION_MODE` defaults to `disabled`.
2. Phase 1 never publishes directly. Even an approved candidate is only cleared for handoff to the existing controlled publication pipeline.
3. Sources cannot be used unless all of the following are true:
   - the source is registered;
   - the source is enabled;
   - its terms have been reviewed;
   - automated access has been explicitly approved;
   - the requested URL remains inside the registered host boundary;
   - HTTPS is used.
4. Allegations, inference and speculation require qualified-language review.
5. High and critical sensitivity material requires editorial approval.
6. `AIM_KILL_SWITCH=1` stops the Mission Director before it claims another task.
7. No worker may exist without a registered task handler and an audit trail.

## Run the self-test

```bash
node scripts/autonomous-machine/phase1-self-test.js
```

Expected output includes:

```json
{
  "ok": true,
  "tests": 9
}
```

## Run the empty director safely

```bash
AIM_PUBLICATION_MODE=disabled node scripts/autonomous-machine/run-phase1.js --max-tasks=10
```

Runtime state is written to `.autonomous-machine/`, which should remain uncommitted and environment-specific.

## Environment controls

| Variable | Allowed values | Default | Purpose |
|---|---|---|---|
| `AIM_PUBLICATION_MODE` | `disabled`, `review_only` | `disabled` | Controls whether a reviewed candidate may be handed to the existing publishing pipeline. |
| `AIM_KILL_SWITCH` | `0`, `1` | `0` | Stops new task processing immediately when set to `1`. |

## Phase 1 boundaries

Not included yet:

- live web retrieval;
- scheduled autonomous collection;
- LLM or GPU execution;
- entity resolution against production records;
- knowledge-graph writes;
- dossier or clock updates;
- report delivery;
- automatic publication;
- external compute brokering.

These integrations belong in later supervised increments after the control plane has passed repository, deployment and editorial review.

## Next integration sequence

1. Map existing live-intelligence scripts into registered handlers without changing their outputs.
2. Add a read-only adapter for the current dossier and evidence structures.
3. Create an ingestion worker for one approved public source.
4. Add provenance and deduplication acceptance tests using real repository fixtures.
5. Route all generated claims into the review queue.
6. Enable a manual workflow run in staging.
7. Observe failures and audit integrity before adding any schedule.
