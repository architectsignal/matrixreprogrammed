# AI management task ledger

Updated: 2026-07-30

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
