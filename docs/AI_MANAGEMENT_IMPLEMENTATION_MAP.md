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
