# Autonomous Intelligence Machine — Phase 1

## Status

Phase 1 creates the supervised control plane for Matrix Reprogrammed. It does **not** crawl the internet, call external models, change live dossiers or publish content automatically.

The purpose of this phase is to establish the contracts that every later autonomous worker must obey before it is allowed to touch production data.

Phase 1.1 now adds one separately documented, manual, review-only official RSS adapter. See `PHASE_1_1.md`. It does not change the Phase 1 publication boundary.

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
  "tests": 12
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

Not included in the core control plane:

- unrestricted live web retrieval;
- scheduled autonomous collection;
- LLM or GPU execution;
- entity resolution against production records;
- knowledge-graph writes;
- dossier or clock updates;
- report delivery;
- automatic publication;
- external compute brokering.

Phase 1.1 permits only the single approved manual official-source adapter described in its own document. Every item remains in local review storage.

## Next integration sequence

1. Keep the Phase 1.1 official-source adapter manual and review-only while observing its audit records.
2. Add a read-only mapper for existing dossier and evidence identifiers.
3. Propose dossier routes without writing to production records.
4. Add provenance and deduplication acceptance tests using real repository fixtures.
5. Route every proposed match into the review queue.
6. Observe failures and audit integrity before adding any schedule.
