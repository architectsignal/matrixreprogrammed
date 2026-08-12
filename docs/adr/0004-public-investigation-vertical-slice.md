# ADR 0004: Public investigation vertical slice with owner-local synthesis

- Status: accepted for implementation
- Date: 2026-08-12
- Scope: Ask Matrix public investigation UI, Worker API, D1 state and optional local-model synthesis

## Decision

Ask Matrix will ship as one complete public vertical slice rather than as a second parallel investigation platform. The canonical request enters through `POST /api/investigate`, retrieves only from a build-time corpus compiled from the repository's existing evidence and search systems, persists its real state and selected evidence in D1, validates the public result, and returns an evidence-bounded answer with resolvable citations. `GET /api/investigate/:id` exposes the persisted public result and honest state history.

The first response is deterministic and evidence-only, so the public feature remains useful when the owner's machine is offline. When an approved zero-cost local model is available, the Worker may enqueue a structured public context in the existing `ai_local_jobs` table. The private prompt is compiled and inference is executed on the owner machine. The local agent may return only the strict public result contract; prompts, hidden reasoning, raw output and secrets are rejected and are never published.

Validated evidence selections are recorded in the existing phase 13 `matrix_learning_ledger`. Equivalent later questions may receive a bounded evidence-ranking boost, but learning cannot create evidence, expand the selected evidence set, invent routes, or weaken classification and citation rules.

## Pull-request reconciliation

PR #239 supplied useful concepts for a public/private result boundary, verified publication and learning. Its migrations are not applied wholesale because its later `matrix_learning_ledger` definition is structurally incompatible with the table already created by `migrations/phase13_matrix_synergy.sql`; `CREATE TABLE IF NOT EXISTS` would leave missing columns and make its trigger invalid. This implementation reuses the concepts on the current main schemas, local-model router, Resource Registry and local job queue.

PR #240's substantive release fixes are carried forward independently: live tests target `matrixreprogrammed.com`, the pressure test recognizes the current search-first homepage, and the homepage exploration set restores the Video/Rumble route. Its generated daily artifacts are not used as architecture inputs.

## Evidence and security boundaries

- A published fact, allegation or inference must cite at least one selected evidence ID.
- Published evidence IDs and source routes must be subsets of the selected public context.
- Allegations remain attributed and disputed; associations do not establish guilt, intent, coordination or wrongdoing.
- Insufficient retrieval returns an explicit evidence boundary, not a fabricated answer.
- Missing D1 or corpus assets fail closed with a recoverable response.
- Requests are size-limited and repeat questions are idempotent within the reuse window.
- Optional synthesis is restricted to registered owner-local, zero-cost models; paid and external fallback is prohibited.
- Pending local enrichment is capped so an offline owner machine cannot create an unbounded queue.

## Consequences

The public system now has an end-to-end, testable question-to-evidence path with useful offline behaviour and a safe local-enrichment lane. It does not perform arbitrary live web browsing, expose private chain-of-thought, or claim that retrieval proves more than the cited records establish. Production remains conditional on the existing Cloudflare zero-overage release gate, migration success, exact-SHA deployment and live verification.
