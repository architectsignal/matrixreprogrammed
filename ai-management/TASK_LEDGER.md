# AI management task ledger

Updated: 2026-08-12

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
