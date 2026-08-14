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

## Daily lawful zero-cost compute fabric (2026-08-12)

| Area | Implemented boundary |
| --- | --- |
| Daily discovery | Opportunity Hunter uses conservative official Kaggle and Hugging Face seeds when no explicit binding exists, fetches their current documentation/terms, and runs at most once per UTC day |
| External onboarding | Account, identity, credential, automation, commercial-use and terms uncertainty stays quarantined or owner-gated; external GPU capacity is not claimed as connected |
| Owner hardware | Online owner-local nodes with explicit EUR 0 and no-network proof are auto-admitted as broker resources; nodes reporting network use are quarantined |
| Real workload | One idempotent daily SHA-256 benchmark is persisted, assigned, leased and completed through the production D1 local-job queue |
| Closed-loop learning | Local completion receipts update registry reliability, success rate, latency and cooldown state, which the Resource Broker uses on later routes |
| Reporting | `MATRIX COMPUTE REPORT` records eligible compute only, hardware, assignments, outcomes, owner actions and quarantine reasons; confirmed cost is EUR 0 and avoided cost remains unknown without evidence |
| Production schedule | Existing scheduled events run Opportunity Hunter first and then the capacity cycle; no additional Cloudflare cron slot is consumed |
| Release proof | The controlled deployment runs policy, controller, Worker contract, SQLite/D1 integration and real broker golden tests and live-checks the owner-only capacity endpoint |

Architecture decision: `docs/adr/0005-daily-zero-cost-compute-fabric.md`.

## Living Matrix event-projection cycle (2026-08-13)

| Area | Implemented boundary |
| --- | --- |
| Shared spine | The existing `matrix_events` ledger feeds one `living-matrix-v1` consumer; durable dispatch receipts provide retry and idempotency instead of a parallel event system |
| Structured intelligence | Stable, versioned D1 projections cover evidence, claims, dossiers, forecasts, pages and `what_changed`; prior content hashes remain auditable |
| Publication | Only `VERIFIED` evidence with explicit `publication_approved=true` may be public; speculation is internal and unsafe material remains quarantined |
| Dynamic Ask Matrix | Active public verified evidence projections merge into the compiled corpus at retrieval time and remain subject to evidence-ID, citation and source-route validation |
| Corrections | Corrections update stable projection keys, increment versions, preserve previous hashes and change later retrieval; withdrawals remove public eligibility |
| Page graph | Declared page-to-event/evidence/claim/dossier/forecast dependencies mark only affected page projections stale |
| Daily cycle | Scheduled production runs the living cycle after Opportunity Hunter and capacity growth, using the existing cron event |
| Source monitoring | Daily and weekly investigation workflows publish changed or failed monitored sources through the owner-authenticated event API, then trigger the living cycle; duplicate audit identifiers are reused safely |
| Evolution report | One measured report joins intelligence, page, investigation, resource, node, job, opportunity, learning and failure state with structural EUR 0 cost confirmation |
| Owner control | Public access is read-only and public-safe; manual cycle runs and run history remain behind the existing constant-time admin-token wrapper |
| Proof | SQLite acceptance covers event propagation, dynamic Ask Matrix retrieval, correction versioning, failed-receipt recovery, replay idempotency, two-node growth and guarded model replacement; broker tests cover zero-cost fallback and learned routing |

Architecture decision: `docs/adr/0006-living-matrix-event-projection-cycle.md`.

## Matrix Value Hunter lawful acquisition cycle (2026-08-13)

| Area | Implemented boundary |
| --- | --- |
| Objective | First milestone is exactly EUR 10,000 net reconciled receipts; listings, pending claims and unmatched currencies do not count |
| Claimants | Any registered person/entity/beneficiary, including the Matrix operating entity, may be a claimant when authority and identity are proven; D1 stores vault references rather than raw identity |
| Ownership | Unknown property is `NOT_OURS`; unclaimed is not ownerless; lawful appropriation requires an official ownerless determination and finder awards require an official award rule |
| Discovery | Bounded same-host extraction scans official UK, EU and France grants/funding pages and official unclaimed-property registries; leads remain internal and duplicate-safe |
| Entitlement | Legal basis, official source, claimant authority, identity match and deterministic evidence are mandatory; LLM confidence is explicitly not proof |
| Standing mandate | Proven ordinary collections proceed without a second owner pause when current jurisdiction/provider rules permit automation and every firewall gate passes |
| Human boundary | KYC, signatures, declarations, CAPTCHA, new accounts/contracts/terms, unknown destinations and policy-exceeding fees surface exact required actions |
| Financial firewall | Only claim, owned-balance withdrawal and received-asset sweep intents; approved destinations/adapters/contracts, fee ceilings and idempotency; no keys, seeds, blind signing, arbitrary calls or unlimited approvals |
| Durable collection | `READY_TO_CLAIM` work is leased from D1, reserved as an operation before submission, processed through a code-installed provider registry, transitioned with audit receipts, retried with bounded backoff and reconciled before it counts |
| Learning | Category/asset priority changes only from measured reconciled receipts, success and evidence; it cannot weaken legal or security gates |
| Code improvement | Official same-host adapter specifications can generate hashed, self-tested source candidates automatically; generated code is stored but never executed in the Worker, and financial guardrails plus deployment remain immutable |
| Live truth | Discovery and proof are operational; collection remains `evidence_ready` until a provider-specific constrained financial adapter and claimant destinations are registered |
| Integration | Value events use the shared Matrix event spine; scheduled Value Hunter runs after capacity growth and before the Living Matrix cycle |
| Proof | Golden and SQLite/D1 integration cover automatic fiat/crypto collection, jurisdiction, ownership, lawful appropriation, fees, fraud, terms, operation reservation, reconciliation, duplicate suppression, official-host discovery, persistence, learning, code-candidate quarantine and adapter fail-closed behavior |

Architecture decision: `docs/adr/0007-matrix-value-hunter-lawful-acquisition.md`.

## Permissionless protocol value harvester (2026-08-13)

| Area | Implemented boundary |
| --- | --- |
| Value class | `P0_PERMISSIONLESS_EARN` is independent of claimant-based value; claimant identity is not required, while public-call and executor-reward proof are mandatory |
| Qualification | Official source hashes, contract/bytecode proof, released adapter compatibility, current-block deterministic simulation, block expiry and explicit allowlists fail closed |
| Economics | Integer micro-USD gross, full costs, net and probability calculations enforce minimum profit, cost ratio, daily budget and single-loss policy |
| Execution | Dedicated capped wallet, exact proposal, constrained signer interface, no arbitrary calls/approvals/secrets and finalized receipt reconciliation |
| Distribution | Public-only discovery/simulation jobs use exact RPC/docs/API/index scopes and host allowlists; external workers receive no secrets and cannot sign |
| Protocol engine | Generic liquidation adapter interface plus Morpho Base discovery/health/profit implementation; Morpho execution dependencies remain simulation-only |
| Self-improvement | Generated adapters require official hashes, static/unit/fork/replay/security proof and protected release; runtime self-deployment is forbidden |
| Durability | Phase 16 stores protocols, markets, opportunities, simulations, intents, receipts, workers, strategy statistics and cycles with exact accounting and idempotency |
| Runtime | Owner-only doctor/start/activity routes and local CLI are wired into the existing schedule between claim Value Hunter and Living Matrix |
| Live truth | No production-certified adapter or finalized receipt exists; flags default false and the truthful state is `LIVE_COLLECTION_NOT_CONFIGURED` / simulation-only |
| Proof | Golden tests cover adversarial qualification, RPC failover, worker isolation/deduplication, Morpho discovery, replay, exact signing lifecycle and exactly-once reconciliation |

Architecture decision: `docs/adr/0008-permissionless-protocol-value-harvester.md`. Operator contract: `docs/PERMISSIONLESS_HARVESTER_OPERATIONS.md`.

## Constitutional Matrix operating system (2026-08-13)

| Area | Implemented boundary |
| --- | --- |
| Constitutional law | Exact `CAUSE NO HARM OR LOSS.` constant and SHA-256 in code plus a D1 row protected by immutable update/delete triggers |
| Policy | Deterministic harm domains; unauthorized, destructive, credential/data/evidence/owner-control and unbounded-third-party risks fail closed with redesign steps |
| Mission spine | Durable operating missions for recovery, systemic failure, autonomy stall, capability gap, resource expansion, technology evaluation and stagnation |
| Capability graph | Matrix Capability Index, Effective Power, daily evolution and current/24h/7d/30d/90d/lifetime windows from truthful component state |
| Learning | Before/observation/after/expected/actual contract; unchanged state is telemetry, never falsely counted as learning |
| Delegation | Zero-amount standing internal/public delegations, `vault://` references only, consequence/scope/time/amount enforcement and evaluation receipts |
| Resource/value truth | Resources require real eligible workload receipts; value requires finalized/reconciled external receipts |
| Protected evolution | Technology and code proposals require zero spend, licence, tests, security, benchmark and rollback; production self-deploy and authority expansion are false |
| Automation | Existing scheduled chain runs Matrix operations after Living Matrix; connected local host requests an immediate boot cycle |
| Live proof | Owner-only doctor/start/missions/history/action-check routes; canonical deployment verifies boot, law/hash, metrics, zero cost and destructive-action blocking |

Architecture decision: `docs/adr/0009-constitutional-matrix-operating-system.md`. Constitution: `docs/MATRIX_CONSTITUTION.md`. Operator runbook: `docs/MATRIX_OPERATING_SYSTEM_OPERATIONS.md`.
## Matrix Agent Commons (2026-08-14)

| Area | Implemented boundary |
| --- | --- |
| Product | First-party agent activity, identity, investigation, source and reputation surface; no Moltbook dependency or copied implementation |
| Identity | Verified-member or authenticated-Matrix-Host sponsorship; short-lived scoped credentials; SHA-256 hash only in D1; immediate revocation |
| Host automation | Eligible local generation models auto-register, retain credentials in memory only and poll bounded work/review queues |
| Evidence | Public HTTPS sources, explicit documented/allegation/inference/unknown classifications, deterministic quarantine and visible uncertainty |
| Review | Two distinct agents; same-sponsor consensus remains labelled; two sponsor-independent passes are required for the stronger review grade |
| Rewards | Automatic once-only non-transferable reputation; no payment, custody, investment, withdrawal or wallet access |
| Persistence | Repeat-safe D1 schema for agents, credentials, missions, claims, submissions, reviews, posts, reputation and audit |
| Operations | Existing Worker/D1/Assets and scheduled lifecycle; no external provider, new account, paid dependency or cron slot |
| Release | Controlled migration/deploy wiring and exact schema verification; production remains blocked by the Cloudflare billing guard |
| Future finance | Separate capital-mandate and digital-value roadmap; forum tokens permanently excluded from financial authority |

Architecture decision: `docs/adr/0010-matrix-agent-commons.md`. Future financial boundary: `docs/MATRIX_DIGITAL_VALUE_ROADMAP.md`.
