# AI management implementation map

## Repository reconnaissance (2026-07-30)

| Area | Existing implementation | Integration decision |
| --- | --- | --- |
| Site/runtime | Static source files compiled to `_site`; Cloudflare Worker entry is `src/worker-production.js` | Add an owner-only management worker behind disabled feature flags; do not change public routes |
| AI Investigator | `scripts/run-investigation-machine.js`, source registry, evidence ledger, conclusion builders, scheduled GitHub workflows | Route retrieval through the broker; preserve parsing and evidence classifications |
| Member intelligence | `src/worker-intelligence-reports.js` and `src/worker-intelligence-analysis.js` | Preserve current source/claim/inference/speculation boundaries; broker asset/provider additions later |
| Queue/jobs | D1-backed OSINT tool jobs in legacy worker plus GitHub Actions schedules | Add common job/audit/quota tables without replacing existing job tables on this pass |
| Database | Cloudflare D1 `MEMBERS_DB`; migrations for membership, forum, email, market, and payments | Add `phase9_ai_resource_orchestration.sql`; no credentials in D1 |
| Storage | Cloudflare static assets and compatibility KV | Use D1 for registry/audit; in-process cache only in the first broker slice |
| External retrieval | Direct `fetch` in investigation/live-intel scripts; Brevo and PayPal in specialised workers | Migrate Investigator first. Payments and transactional email are explicitly out of broker scope because they are existing owner-authorised business functions |
| Cloudflare | Worker, Assets, D1, KV, three configured cron triggers | No new cron slot. Management runtime disabled pending migration |
| Deployment | Large Node build, GitHub Actions, Wrangler deploy, extensive custom pressure tests | Add targeted foundation tests before running the existing build |
| Security/publication | Strict production wrapper, D1 fail-closed paths, evidence grades and publication warnings | Keep intact; external outputs are untrusted and provenance is mandatory |

## First-pass modules

- `schemas`: job and resource JSON Schemas.
- `resource-registry`: memory and D1 registry access.
- `policy-engine`: zero-spend hard exclusions and transparent utility scoring.
- `quota-manager`: in-memory and D1-safe atomic reservations.
- `resource-broker`: cache, in-flight deduplication, dispatch, fallback, circuit cooldown, validation, and audit.
- `provider-adapters/local`: deterministic hashing, JSON parsing, URL canonicalisation, and text normalisation.
- `provider-adapters/datasets`: allowlisted public HTTP API/feed retrieval with strict egress controls.
- `observability`: redacted structured audit events.
- `node`: Investigator-specific registry and broker construction.

## Assumptions

- `matrixrepo` is the canonical checkout because it is the only discovered worktree connected to the GitHub origin. Its pre-existing dirty changes are preserved.
- D1 migration application and production enablement require an explicit owner-controlled deployment step; this implementation does not deploy.
- FederalRegister.gov is suitable as the first registered external source because its official documentation describes public endpoints requiring no API key. Its results remain informational and legal research must verify the official edition.
- Existing HTML sources are not automatically approved. JSON APIs and RSS/Atom feeds are eligible only when the source registry and adapter policy approve them.
- Local model discovery, Resource Scout automation, worker-node enrolment, admin UI, and full migration of every direct provider call remain later phases.

## Known current risks

- The repository has unrelated pending changes, including production-worker and cron edits.
- The build is unusually large and mutates generated artifacts.
- Source terms and quotas are not yet represented per HTML source, so those sources fail closed under the new broker.
- In-process cache and circuit state do not survive a Node process restart; D1 persistence exists in schema but requires the later runtime rollout.

## Matrix synergy integration (2026-08-02)

| Area | Implemented boundary |
| --- | --- |
| Event bus | Typed, auditable Matrix events with mandatory evidence class, origin, actor, affected outputs and propagation plan |
| Evidence | `VERIFIED` requires all authentication checks; incomplete material is automatically `SPECULATION`; unsafe material is security-quarantined |
| Corrections | Withdrawals and corrections reopen/downgrade conclusions, issue correction notices and recalculate reversible rewards |
| Member missions | Authenticated mission, contribution, progression and impact APIs; deduplication and hourly rate limiting |
| Anti-abuse | No rewards for views, ideology, accusations, duplicates, submission volume or suspicious coordination |
| Human actions | Schema allowlist limited to provider/legal/identity/credential/permission/payment/destructive/consequential operations; no editorial fallback |
| Model improvement | Superior-quality, citation, hallucination, licence, privacy, zero-cost and rollback gates before staged replacement |
| Truthful health | `structurally_operational`, `data_connected`, `evidence_ready`, `live_verified`, `blocked`, `awaiting_human_action`, `disabled`, `degraded`, `broken` derived from evidence, not file presence |
| Compute | Candidate discovery retained; remote routing and execution are explicitly disabled in both Wrangler configurations |

Architecture decision: `docs/adr/0002-matrix-synergy-accountability-event-bus.md`.

## Ask Matrix public investigation vertical slice (2026-08-12)

| Area | Implemented boundary |
| --- | --- |
| Public entry point | `answer-engine.html` posts a question to `POST /api/investigate`; `GET /api/investigate/:id` returns the persisted public state and result |
| Retrieval corpus | `scripts/build-public-investigation-corpus.js` compiles existing Search V3 routes, verified evidence cards, the Intel Vault, record events, entity/relationship registries and missing-record ledgers into `data/public-investigation-corpus.json` |
| Evidence discipline | Every factual, disputed and inferential claim must cite an evidence ID selected from the compiled corpus; unknowns remain explicit and association is never converted into wrongdoing |
| Orchestration | D1 records the real `queued -> retrieving -> analysing -> verifying -> complete` history, evidence snapshots, latency, validation status and any owner-local synthesis job |
| Immediate fallback | A deterministic evidence-only answer is returned even when no owner-local model is online; unavailable D1 or corpus state fails with a recoverable error instead of inventing an answer |
| Private reasoning | Cloudflare may enqueue only the public question plus selected public evidence and routes; the prompt is compiled on the owner machine and raw prompt, hidden reasoning and raw model output are rejected from the public completion contract |
| Zero-spend routing | Optional synthesis uses the existing Resource Registry, local-model router and `ai_local_jobs`; there is no paid or external-provider fallback |
| Learning | Validated evidence selections are written to the existing phase 13 `matrix_learning_ledger` and may boost equivalent later retrievals without relaxing evidence or citation policy |
| Security | Request-size limits, privacy-preserving per-client D1 rate limits, idempotent question hashes, pending-job caps, strict result-field validation, evidence-subset checks and source-route-subset checks fail closed |
| Release integration | The public investigation migration is rehearsed and applied by both controlled production workflows; Worker/config tests require its route, flags, tables and assets |

Architecture decision: `docs/adr/0004-public-investigation-vertical-slice.md`.
