# ADR 0006: Living Matrix event-projection cycle

- Status: Accepted for guarded production rollout
- Date: 2026-08-13

## Context

Matrix had an evidence-safe event contract, public Ask Matrix retrieval, resource discovery, a zero-spend broker, a local job fabric and learning ledgers. The event bus stored propagation plans but did not consume them into one durable set of evidence, claim, dossier, forecast, page-dependency and change projections. As a result, a valid event could exist without changing Ask Matrix or identifying which pages were stale, and daily reporting was split across subsystems.

## Decision

1. Consume `matrix_events` through one versioned consumer, `living-matrix-v1`. A durable `(event_id, consumer_id)` dispatch receipt makes processing retryable and idempotent.
2. Project each accepted event into stable evidence, claim, dossier, forecast, page and `what_changed` keys. Content hashes and monotonically increasing versions preserve the prior hash when material changes; replays do not create new versions.
3. Permit public visibility only when the event is `VERIFIED`, its type is publication-eligible, and its evidence payload explicitly sets `publication_approved=true`. `SPECULATION` remains internal and `SECURITY_QUARANTINE` remains quarantined. Corrections version existing projections; withdrawals remove public eligibility.
4. Record page dependencies rather than rebuilding the whole site for every change. Changed dependencies make only declared page projections stale for the next incremental build.
5. Merge active, public, verified D1 evidence projections into the existing compiled Ask Matrix corpus at request time. Existing evidence-ID, route-subset, uncertainty and no-private-reasoning validation remains authoritative.
6. Run the cycle after Opportunity Hunter and capacity growth in the existing Worker schedule. Do not add a Cloudflare cron slot.
7. Publish a public-safe Matrix Evolution Report from measured D1 counts. Resource, node, queue, investigation, learning and projection values must be queried from real state; every cycle structurally records confirmed monetary cost as zero.
8. Preserve owner control. The public route exposes only the latest report and approved `what_changed` projections. Running and inspecting cycles remains behind the existing admin-token wrapper.

## Consequences

- A single verified event can now drive the complete source-to-public-answer path without duplicating intelligence stores.
- An interrupted consumer can retry failed dispatches; successful events are not replayed.
- Resource discovery and job outcomes are visible in the same daily report while their existing broker and learning contracts remain the decision authority.
- The public site is dynamic at request time for verified Ask Matrix evidence, while static page rebuilding remains staged, reversible and dependency-scoped.
- This is controlled machine learning and routing adaptation, not unconstrained weight training or autonomous publication.

## Rollback

The Phase 14 tables and routes are additive. Rolling back the Worker stops consumption and public evolution exposure while preserving dispatch receipts, projection versions and cycle reports for audit. Existing static evidence, investigations, resource routing, membership, payment and deployment systems continue independently.
