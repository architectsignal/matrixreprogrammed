# ADR 0001: Brokered zero-spend resource orchestration

- Status: Accepted for incremental rollout
- Date: 2026-07-30
- Owners: Matrix Reprogrammed owner and maintainers

## Context

The existing AI Investigator is primarily a deterministic Node pipeline (`scripts/run-investigation-machine.js`) that retrieves configured public sources, parses them, classifies evidence, preserves a ledger, and builds daily or weekly conclusions. Cloudflare Workers provide authenticated site functions, D1 persistence, static assets, email/report scheduling, and strict production boundaries. External retrieval currently occurs directly inside several scripts, so policy, quotas, failover, provenance, and cost controls are not centralised.

The system must remain operational when every external service is unavailable and must make paid fallback impossible by default.

## Decision

Introduce an additive `/ai-management` layer with these boundaries:

1. A versioned job schema describes priority, capability, data class, latency/quality needs, idempotency, and provenance requirements.
2. A persistent D1 Resource Registry stores provider policy, quota, health, score, fallback, and approval metadata. A checked-in seed file supports local tests and migration bootstrap.
3. A zero-spend Policy Engine applies hard exclusions before configurable utility scoring.
4. A Quota Manager reserves capacity before dispatch and commits or releases reservations explicitly.
5. A Resource Broker is the only route for new investigator network calls. It performs cache/deduplication, selection, reservation, dispatch, validation, fallback, cooldown, and audit logging.
6. Deterministic local code is Tier 0. The first external adapter is restricted to allowlisted, public, account-free HTTP APIs or feeds and rejects credentials, non-HTTPS URLs, private hosts, oversized bodies, unsafe redirects, and sensitive data.
7. Runtime Cloudflare routes are owner-only and feature-flagged off until the D1 migration and operational review are complete. The Node Investigator uses the broker immediately because it replaces, rather than adds, its existing retrieval path.

## Consequences

- The Investigator fails closed for sources whose automated use has not been approved. This may reduce coverage until terms checks are completed, but preserved evidence and prior-ledger fallback keep the site usable.
- Resource performance and selection become explainable and testable.
- Existing payment, membership, publication, and evidence code remains unchanged.
- Other direct network callers remain migration work; they must not be represented as brokered until converted.

## Rejected alternatives

- A wholesale rewrite: too risky for the current static/build-heavy repository.
- A paid-provider fallback: incompatible with zero-spend lock.
- Treating public web pages as automatically approved for scraping: incompatible with terms and quota verification requirements.
- Using Codex as the runtime planner: expensive, non-local, and unnecessary for deterministic routing.

## Rollback

The Cloudflare feature flags default to disabled. The Node integration can be placed in local-only mode with `AI_RESOURCE_LOCAL_ONLY=true` or external retrieval can be stopped with `AI_RESOURCE_EXTERNAL_ENABLED=false`; it never falls back to direct fetch.
