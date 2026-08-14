# AI management task ledger

Updated: 2026-08-13

## Priority lock

The following capabilities are mandatory release requirements for PR #184 and must not be deferred, removed, bypassed, or described as optional follow-up work:

1. **Automatic Resource Scout**
   - Discover candidates from the investigation registry and verified seed documentation.
   - Automatically approve only resources that prove zero monetary cost, safe quotas, valid terms, privacy documentation, HTTPS access, healthy endpoints, acceptable provenance, and no payment method or billing risk.
   - Quarantine every uncertain, incomplete, unhealthy, stale, conflicting, or unverified candidate.

2. **Local hardware and LLM detection**
   - Detect NVIDIA, AMD, Windows and CPU fallback information without sending hardware data to unapproved external services.
   - Detect Ollama, LM Studio, llama.cpp and other owner-controlled OpenAI-compatible local servers on loopback-only endpoints.
   - Convert available models, including Qwen3 14B when present, into zero-cost broker-managed resources.

3. **Intelligent local model routing**
   - Route according to task complexity, context requirements, speed, model size, quantisation, available VRAM, health and freshness.
   - Keep prompts and inference on the owner-controlled local machine.
   - Prohibit paid, metered and external fallback.
   - Cloudflare may store inventory and routing metadata but must never receive or store the private prompt merely to select a local model.

4. **Autonomous Site Improvement Director**
   - Scan and classify site defects.
   - Apply only the small, reversible HTML allowlist under explicit limits.
   - Never modify payments, authentication, membership, forums, evidence claims, conclusions, dossiers, Worker runtime, migrations, deployment configuration or secrets.

5. **Cloudflare control plane**
   - Persist discovered candidates, approved resources, local nodes, local models, routing decisions and Site Director runs in D1.
   - Keep all administration endpoints owner-only and fail closed.
   - Integrate scheduling without replacing or weakening membership, forum, email, PayPal, evidence or publication boundaries.

6. **Controlled production deployment**
   - The owner has explicitly confirmed that free Cloudflare Worker build minutes are available and authorised removal of the production lock.
   - Deployment remains conditional on green tests, successful migrations, retained zero-spend lock, safe feature flags and live endpoint verification.

## Release gate checklist

- [x] Zero-spend Resource Broker foundation
- [x] Investigator retrieval broker integration
- [x] Automatic Resource Scout implementation on PR #184
- [x] Local hardware and model discovery implementation on PR #184
- [x] Intelligent local model-routing implementation on PR #184
- [x] Site Improvement Director implementation on PR #184
- [x] D1 autonomy schema implementation on PR #184
- [x] Owner-only Cloudflare control-plane implementation on PR #184
- [x] Production deployment lock removed with explicit owner authorisation
- [ ] Expand automated tests for Scout, hardware detection, routing, Site Director, Worker contracts and migrations
- [ ] Run syntax, broker, routing, Scout, Worker-contract and migration tests
- [ ] Resolve integration with the current production/main release line
- [ ] Complete Cloudflare production build and pressure-test matrix
- [ ] Apply phase 9 and phase 10 D1 migrations
- [ ] Enable approved autonomy flags while retaining `AI_RESOURCE_ZERO_SPEND_LOCK=true`
- [ ] Merge PR #184
- [ ] Deploy through the controlled production workflow
- [ ] Verify live owner-only health, resource, Scout, local-runtime, route-model and Site Director endpoints
- [ ] Confirm no paid/external fallback and no private prompt transfer to Cloudflare

## Phase ledger

| Phase | Task | Status | Evidence / next action |
| --- | --- | --- | --- |
| 0 | Repository, Investigator, Cloudflare, D1, workflows, provider, secret, and publication audit | Complete | `docs/AI_MANAGEMENT_IMPLEMENTATION_MAP.md` |
| 1 | Job and Resource Registry schemas | Complete | `ai-management/schemas`, D1 phase 9 migration |
| 1 | Zero-spend Policy Engine | Complete | Hard exclusions and scored eligible set |
| 1 | Quota reservation and Resource Broker | Complete | Memory + D1 quota stores; broker tests |
| 1 | Local-only fallback and feature flags | Complete | Deterministic adapter; Cloudflare flags fail closed |
| 1 | Investigator retrieval integration | Complete | `run-investigation-machine.js` no longer dispatches network calls directly |
| 2 | Hardware and local-model discovery | Implemented; verification pending | `ai-management/local-runtime/hardware-detector.mjs` |
| 2 | Intelligent local model routing | Implemented; verification pending | `ai-management/local-runtime/model-router.mjs`, local broker adapter |
| 3 | Terms-reviewed source adapter catalogue | In progress | Federal Register seed plus approved API/feed path; review remaining sources |
| 4 | Autonomous Resource Scout and revalidation | Implemented; verification pending | `ai-management/resource-scout/resource-scout.mjs` |
| 5 | Opportunistic external compute | Prohibited by default | No paid, borrowed, hidden, unauthorised or terms-violating compute |
| 6 | Route remaining Investigator/live-intel provider calls | Pending | Convert only through the governed zero-spend broker |
| 7 | Site Improvement Director | Implemented; verification pending | `ai-management/site-director/site-improvement-director.mjs` |
| 8 | Owner control-plane and metrics | Implemented; migration pending | Owner-only Worker routes plus D1 phase 10 schema |
| 9 | Failure, quota, poison, backlog, rollback and sensitive-claim stress tests | In progress | Full release and deployment tests remain |

## Verified foundation evidence

- `npm.cmd run test:ai-management` passed for the original broker foundation before the autonomy expansion.
- A real Investigator run fetched 100 Federal Register records through the broker at confirmed cost EUR 0; 11 unreviewed sources failed closed at policy evaluation.
- The isolated Worker contract includes the external `ai-management/` dependency tree and passed the original fail-closed boundaries.
- Default outbound Investigator identification contains no personal email address.
- The expanded autonomy implementation must receive a fresh complete verification before merge or deployment.

## 2026-08-02 Matrix synergy checkpoint

- [x] Reconciled zero-spend compute-resource scouting while keeping remote routing and execution disabled by default.
- [x] Added strict automatic `VERIFIED` / `SPECULATION` / `SECURITY_QUARANTINE` classification.
- [x] Added typed event propagation and correction/withdrawal reopening rules.
- [x] Added member evidence missions, contribution intake, ethical progression, reversible rewards and impact trails.
- [x] Added anti-duplication, submission-rate, coordination and prohibited-reward controls.
- [x] Limited human-action records to unavoidable provider, legal, identity, credential, permission, payment, destructive or consequential operations.
- [x] Added model benchmark/replacement and truthful capability-health contracts.
- [x] Added repeat-safe phase 13 schema and controlled-release workflow wiring.
- [ ] Complete the fresh full build, strict public audit, Worker/config/security matrix and draft PR.
- [ ] Production deployment remains blocked until the Cloudflare zero-overage policy permits a release.

## 2026-08-12 Ask Matrix checkpoint

- [x] Reconciled PR #239 at the contract level without applying its incompatible `matrix_learning_ledger` schema over the existing phase 13 table.
- [x] Reconciled the substantive release fixes from PR #240: production-domain smoke targets, search-first homepage pressure-test compatibility and the Video/Rumble exploration route.
- [x] Compiled a public investigation corpus from existing Search V3, Intel Vault, evidence-card, entity, relationship, record-event and missing-record assets.
- [x] Added the persisted `POST /api/investigate` and `GET /api/investigate/:id` vertical slice with explicit state history and a deterministic evidence-only fallback.
- [x] Added optional owner-local synthesis through the existing Resource Registry, local-model router and local job queue without storing prompt material or raw model output in Cloudflare.
- [x] Added strict public-result, evidence-ID, source-route and no-private-reasoning validation.
- [x] Added representative retrieval, citation-integrity, persistence, idempotency, malformed-output, invented-citation, learning-effect and local-completion tests.
- [ ] Complete the canonical Cloudflare build and full applicable release matrix.
- [ ] Apply `migrations/public_investigation_api.sql` in the controlled release workflow.
- [ ] Deploy only if the zero-spend budget gate is current, unlocked and non-billable; then verify the public UI and API live.

## 2026-08-12 zero-cost compute checkpoint

- [x] Scheduled Opportunity Hunter now has conservative official Kaggle and Hugging Face bootstrap sources and live-revalidates their documentation and terms at most daily.
- [x] The default external candidates retain `unknown` automation/commercial status and explicit account/identity/credential owner actions; no external GPU is falsely marked connected.
- [x] Scheduled capacity growth runs after Opportunity Hunter under `AI_RESOURCE_ZERO_SPEND_LOCK=true`.
- [x] Online owner-local nodes are policy-assessed, registered, and selected without paid or external fallback; nodes reporting external-network use are quarantined.
- [x] One daily zero-cost deterministic benchmark is persisted and assigned through the production D1 local-job queue.
- [x] Lease completion updates registry reliability and latency, and the Resource Broker demonstrably prefers the learned resource on the next route.
- [x] Daily compute reports and benchmark outcomes are written to `matrix_learning_ledger` without prompts, hidden reasoning, credentials or raw model output.
- [x] SQLite/D1 integration proves admission, assignment, lease, EUR 0 completion, immutable receipts, learning and next-cycle reporting.
- [x] Daily Opportunity Hunter seeds now include SEC EDGAR and USAspending public APIs; both require live official evidence for no-auth access, lawful automation and bounded zero-spend use before admission.
- [x] Approved public-data opportunities now activate through the tested public-only HTTP adapter and execute through the Resource Broker with provenance, host allowlisting, quota reserves and private-data rejection.
- [x] Local benchmark learning now disables installed models that fail real work; the live Qwen generator is unhealthy/disabled while both measured embedding models remain enabled.
- [ ] Complete the pinned public production release before any later release of this capacity change.
- [ ] After deployment, verify the live owner-only capacity route and capture a real online-owner-node report; external GPU candidates remain blocked until owner onboarding and current terms proof are complete.

## 2026-08-13 Living Matrix checkpoint

- [x] Added one durable, idempotent event consumer over the existing `matrix_events` spine; no second event bus was created.
- [x] Added versioned evidence, claim, dossier, forecast, stale-page and `what_changed` projections with previous-content hashes.
- [x] Enforced the public gate: only cryptographically `VERIFIED` events with explicit `publication_approved=true` can reach public projections or Ask Matrix.
- [x] Added durable page dependencies for incremental rebuild targeting.
- [x] Merged active public verified D1 evidence into Ask Matrix retrieval while retaining citation, source-route and uncertainty validation.
- [x] Added retryable dispatch receipts and proved recovery from an interrupted event; replay does not advance projection versions.
- [x] Added one Matrix Evolution Report sourced from real D1 intelligence, site, investigation, compute, node, job, opportunity, learning and failure counts.
- [x] Chained the living cycle after Opportunity Hunter and capacity growth without consuming another Cloudflare cron slot.
- [x] Connected daily and weekly investigation source changes/failures to the owner-authenticated event API and immediate living-cycle trigger; unchanged sources stay quiet and absent credentials fail closed.
- [x] Added the public read-only evolution endpoint and owner-only cycle run/history endpoint.
- [x] Added Phase 14 to repeat-safe migration rehearsal, CI safety, deploy schema checks and the production guard.
- [x] Proved dynamic event-to-Ask-Matrix propagation, correction versioning, recovery, idempotency, two-node expansion, zero-cost fallback, learned routing and guarded model replacement locally.
- [ ] Merge the guarded change and let the controlled production workflow apply Phase 14 when the daily zero-overage deployment gate permits it.
- [ ] After deployment, run the owner cycle endpoint once and verify `/api/matrix/evolution` plus a live Ask Matrix query against newly approved evidence.

## 2026-08-13 Matrix Value Hunter checkpoint

- [x] Recorded the EUR 10,000 first objective as 1,000,000 EUR minor units and count only reconciled EUR receipts toward it.
- [x] Added claimant, protected identity-reference, approved destination, mandate, jurisdiction, official source, opportunity, evidence, queue, operation, receipt, audit, cycle and measured-learning records.
- [x] Generalized entitlement to any registered authorized claimant, including the Matrix operating entity; the system does not assume the owner personally holds every claim.
- [x] Enforced that unclaimed or apparently abandoned value is not automatically ownerless; unknown ownership is `NOT_OURS`, and lawful appropriation requires an official ownerless determination.
- [x] Enabled the standing mandate for automatic collection of proven lawful entitlements without an extra owner pause when official automation, destination, adapter, contract and fee gates pass.
- [x] Limited financial execution to `CLAIM_REWARD`, `SWEEP_RECEIVED_ASSET` and `WITHDRAW_OWNED_BALANCE`; private keys, seeds, arbitrary calls, blind signing, unlimited approvals and unknown destinations fail closed.
- [x] Added bounded official-host discovery for UK government grants/innovation, EU Funding & Tenders, France business aid/Bpifrance and official unclaimed-property routes.
- [x] Added controlled learning that reorders strategies only from reconciled net receipts, success and evidence strength.
- [x] Added owner-only status, claimant, destination, opportunity and manual-cycle APIs and chained the daily cycle before Living Matrix.
- [x] Added Phase 15 migration/deploy/safety/live-verification gates plus automatic collection, crypto signer, fee, fraud, terms, duplicate, source-boundary and D1 integration tests.
- [ ] Register the real Matrix claimant authority and approved EUR account/wallet by vault reference; never enter identity, banking or signing secrets into D1 or prompts.
- [ ] Implement and review the first real provider-specific constrained collection adapter after its official API/terms, receipt format and signing boundary are known.
- [ ] Run the controlled production release only when the Cloudflare zero-overage deployment gate permits it, then capture the first live Value Hunter cycle receipt.

## 2026-08-13 Permissionless Harvester checkpoint

- [x] Added the separate `P0_PERMISSIONLESS_EARN` class without weakening claim-based claimant and entitlement gates.
- [x] Added specialized liquidation/keeper/settlement/auction/maintenance intents and blocked arbitrary calls, secret material, access bypass, blind signing and unlimited approvals.
- [x] Added exact micro-USD profit accounting, minimum profit/probability, cost-ratio, absolute-cost, daily-budget, single-loss and stale-block controls.
- [x] Added official protocol registry, static/dynamic contract verification, read-only zero-spend RPC failover and consensus primitives.
- [x] Added dedicated wallet policy, fresh transaction simulation, exact proposal validation, constrained signer interface and finalized receipt reconciliation.
- [x] Added public-only distributed discovery/simulation jobs with scoped hosts/networks, no secrets/signing, hashed receipts, deduplication and central re-verification.
- [x] Added a generic liquidation opportunity engine and Morpho Base discovery, position health, repay, collateral and profit calculations from the official contract/source references.
- [x] Added historical replay, competition-adjusted capture reporting, measured strategy learning and quarantined adapter-code candidate certification.
- [x] Added Phase 16 D1 schema, disabled-by-default flags, owner-only Worker doctor/start/activity, scheduled chaining and local `harvester doctor|start|status` commands.
- [x] Added controlled full-lifecycle, adversarial, RPC failover, public-worker, Morpho, receipt, idempotency and migration/contract tests.
- [ ] Production-certify Morpho codec, fork/RPC simulator and receipt decoder through protected review; current adapter remains `simulation-only`.
- [ ] Provision the separate capped execution wallet and managed constrained signer without placing keys/seeds in GitHub, D1, source, prompts or logs.
- [ ] Register at least two approved zero-spend Base RPCs and pass live chain/bytecode consensus plus fork, race and reorg tests.
- [ ] Release Phase 16 only when the Cloudflare zero-overage gate permits it; then run a bounded canary and reconcile the first finalized receipt before reporting live funds.

## 2026-08-13 constitutional Matrix operating-system checkpoint

- [x] Locked the exact `CAUSE NO HARM OR LOSS.` law and SHA-256 into code and an immutable-triggered D1 constitution.
- [x] Added deterministic harm, authorization, consequence, scope, simulation, rollback, approved-destination and destructive-action gates.
- [x] Added zero-amount Owner Delegation Vault records and a Matrix Delegated Action Broker; capability growth cannot grant authority.
- [x] Added durable recovery, systemic-failure, autonomy-stall, capability-gap, resource-expansion, technology-evaluation and stagnation missions with retry ladders.
- [x] Added truthful component manifest/state, Matrix Capability Index, Effective Power, current/24h/7d/30d/90d/lifetime windows and daily evolution baseline.
- [x] Added strict learning effects where unchanged observations are telemetry, plus measured resource/value/code-evolution directors.
- [x] Added immediate boot, watchdog, daily scheduled chain, local-host startup and owner-only doctor/start/missions/history/action-check controls.
- [x] Added contract, adversarial, D1 integration, twice-applied migration, auth, destructive-action and live-verification gates.
- [ ] Merge the protected PR after checks pass.
- [ ] Update the Cloudflare usage snapshot/variables only after a new period shows zero billable usage, then run the controlled deploy with exact confirmation.
- [ ] Capture a live `LIVE_WORKING` doctor receipt; until then Phase 17 remains truthfully `WORKING_NOT_LIVE` despite passing local tests.
## 2026-08-14 Agent Commons checkpoint

- [x] Added a first-party AI social and investigation surface using only the existing Worker, Assets and D1 stack.
- [x] Added verified-member and authenticated-Matrix-Host sponsorship, one-time scoped credentials, SHA-256-only persistence, expiration and revocation.
- [x] Added automated local Host registration for eligible generation models with in-memory-only credentials and bounded bootstrap polling.
- [x] Added public missions, claims, evidence submissions, peer reviews, agent posts, visible evidence grades and a public feed.
- [x] Added two-review settlement, sponsor-independence labels, automatic once-only reputation and zero monetary authority.
- [x] Added prompt-injection/private-content quarantine, public-HTTPS source constraints, idempotency, deduplication, rate limits and audit entries.
- [x] Added repeat-safe D1 migration, canonical deploy-chain wiring, production schema checks, Wrangler feature flags and required asset checks.
- [x] Added real SQLite/D1 integration tests covering registration, token hashing, claims, submissions, self-review rejection, independent review, reward settlement, duplicate rejection, quarantine and maintenance.
- [x] Added a future Matrix digital-value roadmap that permanently separates social credentials from custody, trading and payment keys.
- [ ] Run the complete applicable build, site audit, production guard and generated-output review.
- [ ] Deploy only after the current Cloudflare zero-overage policy reports a fresh zero-billable snapshot and an available guarded daily slot.
- [ ] Apply `migrations/agent_commons_v1.sql`, verify all nine D1 tables, then verify `/agent-commons` and `/api/agent-commons/health` at the exact deployed SHA.

## 2026-08-14 zero-spend public resource expansion

- [x] Added Crossref public scholarly metadata as an anonymous, account-free, key-free resource with concurrency 1, a conservative operator cap and no automatic full-text dereferencing.
- [x] Added Grants.gov `search2` as an unauthenticated public funding-discovery resource with bounded JSON POST, concurrency 1 and a conservative operator cap.
- [x] Added a same-official-family execution-host boundary so documentation on `www.grants.gov` can safely authorize only `api.grants.gov`, while unrelated hosts remain quarantined.
- [x] Kept listings discovery-only: neither Crossref metadata nor a Grants.gov result establishes eligibility, entitlement, award, ownership or permission to submit.
- [x] Kept Kaggle, Hugging Face and every account/key/identity-dependent source quarantined until their owner, terms, quota, health and zero-spend gates genuinely pass.
- [ ] After controlled release, run `use_defaults=true`, confirm live evaluation, and execute one bounded Crossref GET and one Grants.gov POST through `zero-spend-opportunity-public-http` before reporting either resource live.

## 2026-08-14 release-repeatability and resource-economy checkpoint

- [x] Made membership, investigation search and optional Pagefind fallback reconciliation idempotent after legacy generators run.
- [x] Removed raw structured-value placeholders from the 8,000-event evidence timeline, all 81 mission clocks and their public synthesis/download surfaces, with regression coverage.
- [x] Excluded private source, migration, runtime, diagnostic and internal build directories from the Cloudflare static bundle and added route-level privacy assertions.
- [x] Moved public editorial repair to the true packaging boundary and the public-copy audit boundary so neither a release build nor an audit can restore author-facing monetisation strategy text.
- [x] Rebuilt the Cloudflare bundle: 116 required assets verified and protected private artifacts excluded.
- [x] Passed Worker routes, site pressure, function harmony and two consecutive exhaustive public-audit cycles across 1,610 public pages with zero hard failures.
- [x] Passed public copy/intake review across 3,008 files and 1,161 intake areas with zero high issues and zero weak intake areas; two low-priority review strings remain queued.
- [x] Confirmed the local Host supervisor and Host are online, connected, registered, outbound-only and zero-spend locked with one completed benchmark job and no failed jobs.
- [x] Preserved the long-horizon resource-economy constraints in `docs/MATRIX_DIGITAL_VALUE_ROADMAP.md`: verified needs/resources/contribution, human rights, lawful ownership, transparent scarcity assumptions, appeal, reversibility, anti-capture and no seizure, coercion, secret rationing or unbounded agent control.
- [ ] Start an owner-controlled loopback model runtime before claiming local inference; current Host discovery reports zero healthy model servers and zero models.
- [ ] Diagnose the Host `matrix_operations` startup receipt and public-site fetch failure before claiming the complete control loop is live.
- [ ] Refresh the Cloudflare policy and GitHub usage variables only after the new billing period exposes a current zero-billable snapshot; do not bypass the production, billing or daily-slot guards.
- [ ] Publish the reviewed source commits, merge through the protected PR chain and deploy the exact merged SHA only after every controlled-release gate passes.
- [ ] After release, apply the pending schemas and verify Agent Commons, Ask Matrix, SEC/Crossref/Grants.gov public-only execution, evolution and owner-only health endpoints before enabling any additional resource.

## 2026-08-14 owner-computer load protection and external-compute routing

- [x] Diagnosed the local slowdown as memory pressure and paging from CPU-only LM Studio model servers that Matrix had not discovered or used; closed the model servers and their respawning LM Studio auto-loader while preserving the Matrix Host and supervisor.
- [x] Added a live free-memory pressure probe with conservative 4,096 MB / 25% floors, a separate benchmark reserve and bounded busy backoff.
- [x] Made the persistent Host and standalone poller defer new leases under pressure while remaining online, connected, outbound-only and zero-spend locked.
- [x] Added allowlisted pressure telemetry to registration and lease requests without exposing prompts, credentials, process arguments or arbitrary host state.
- [x] Made the Worker refuse a pressure-deferred lease and exclude memory-constrained nodes from benchmark creation, capacity totals and new assignments.
- [x] Extended the Capability Director so verified system-memory pressure can prefer bounded public-only remote jobs, while no job is offloaded unless a current approved zero-spend compute resource passes every existing billing, quota, expiry and terms gate.
- [x] Fixed the operating-system evolution-window test to use the cycle's injected clock instead of the wall clock, eliminating a time-of-day-dependent safety-gate failure.
- [x] Passed local Host, pressure, control-plane, capability routing, Worker/D1 capacity, Matrix operating-system and production queue regression suites.
- [ ] Merge and install this Host revision before claiming the pressure guard itself is active in the currently running original worktree.
- [ ] Register and real-workload benchmark at least one lawful zero-spend remote compute resource before reporting external execution capacity as usable; paid fallback remains impossible.
