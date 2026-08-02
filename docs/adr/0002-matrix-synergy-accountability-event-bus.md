# ADR 0002: Evidence-safe Matrix synergy event bus

- Status: Accepted for staged rollout
- Date: 2026-08-02
- Owners: Matrix Reprogrammed owner and maintainers

## Context

The site already has evidence records, conclusions, search, member accounts, watchlists, autonomous resource discovery, local models and controlled deployment. These systems need one auditable contract so a correction or new record cannot update one surface while leaving conclusions, alerts or machine-readable outputs stale. Member participation must reward useful evidence work without rewarding accusations, ideology, page views, mass posting or duplicate submissions. Human editorial review is not a permitted fallback for uncertainty.

## Decision

1. `src/matrix-synergy-core.js` is the pure policy layer for evidence classification, event construction, propagation, human-action routing, member rewards, model replacement and truthful capability states.
2. Only a trusted system assertion with a directly verifiable, attributable, authenticated primary or authoritative HTTPS source, UTC retrieval time and SHA-256 fingerprint can enter the `VERIFIED` class. Every incomplete case is visibly `SPECULATION`, with missing verification recorded. Unsafe executable content, secrets, prohibited personal data, prompt injection and malware are rejected into `SECURITY_QUARANTINE`.
3. `SPECULATION` has zero factual confidence and cannot support factual conclusions, allegations, factual alerts or guilt by association. Member submissions cannot authenticate themselves.
4. Events carry timestamp, origin, source, evidence class, actor, affected entities/pages, confidence, review state and a unique audit identifier. Accepted updates propagate to dossiers, entities, relationships, timelines, trackers, conclusions, search, dashboards, alerts, watchlists, sitemaps and machine-readable outputs. Corrections and withdrawals reopen or downgrade conclusions and recalculate rewards.
5. Human-action records are limited by schema and policy to provider-mandated, legal, identity, credential, permission, payment, destructive or consequential external operations. Content uncertainty is automatically classified; it never enters a human editorial queue.
6. Member progression rewards only authenticated, eligible, non-duplicate evidence work. Rewards are reversible. Rate limits, deduplication, suspicious coordination controls and prohibited reward bases prevent point farming.
7. Model replacement requires superior benchmark quality, no hallucination regression, citation integrity, licence/privacy approval, proven zero cost and rollback readiness. Unknown or unsafe candidates remain quarantined.
8. Capability health is derived from structural checks, dependency reachability, data connection, evidence readiness and live verification. File existence alone cannot produce a green state.

## Consequences

- The member mission intake is useful immediately for provenance capture, but new submissions start as `SPECULATION` and earn no points until an independent trusted verifier authenticates every required element.
- D1 phase 13 adds the event, mission, contribution, impact, reward, human-action, model, benchmark, capability and learning ledgers without replacing existing tables.
- New owner APIs remain behind the existing constant-time admin-token boundary.
- The additional migration and safety tests become mandatory controlled-release gates.

## Rollback

The new routes are additive. Rolling back the Worker removes route exposure while preserving immutable audit rows. No existing evidence, membership, payment or publication table is destructively altered. Remote compute remains disabled by default.
