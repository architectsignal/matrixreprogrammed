# MATRIX REPROGRAMMED — FEDIVERSE MASTER REQUIREMENT

**Status: locked for future implementation.**

This is a permanent product requirement for Matrix Reprogrammed.

## Mission

Build a federated distribution and community layer that turns Matrix Reprogrammed investigations into followable, evidence-led public intelligence channels without surrendering the site's editorial boundaries, member privacy or source provenance.

## Phase 1 — Matrix Relay

- Operate an official Matrix Reprogrammed Mastodon account.
- Publish approved Live Intel, evidence drops, report releases, investigation changes and Signal Board requests.
- Require editorial status, significance threshold, evidence classification and source link before automated publication.
- Use idempotency keys and a D1 publication ledger so retries cannot duplicate posts.
- Respect content warnings, rate limits and correction history.

## Phase 2 — Fediverse Wire

- Build a curated site feed for approved investigative journalists, researchers, transparency bodies, OSINT analysts, public institutions and tracked hashtags.
- Preserve the originating account, instance, timestamp and canonical post URL.
- Separate verified sources, breaking signals, community finds and unverified leads.
- Never treat a Mastodon post as proof merely because it is popular or widely repeated.

## Phase 3 — Matrix Signal PWA

Build an installable Progressive Web App with:

- Home intelligence dashboard
- Live Intel
- Fediverse Wire
- Signal Boards
- Follow the Investigation
- Evidence Drop
- Saved reports and dossiers
- Consolidated push alerts
- Membership and connected-account settings

Notifications must combine related changes into a useful intelligence summary rather than creating notification spam.

## Phase 4 — ActivityPub Investigation Actors

Make major investigations independently followable through ActivityPub identities, including future channels such as:

- Epstein Files
- Follow the Money
- Agenda 2030
- Pyramid of Power
- Evidence Vault

Each actor must publish evidence-state changes, not unreviewed accusations. Corrections and retractions must federate as visible updates.

## Phase 5 — Optional Matrix Mastodon Instance

Consider `social.matrixreprogrammed.com` only when user demand, moderation capacity and infrastructure justify a dedicated Mastodon server. Keep Mastodon's PostgreSQL/Redis runtime separate from the existing Cloudflare Worker and D1 application boundary.

## Security and privacy

- Keep Mastodon OAuth client secrets and member access tokens server-side.
- Encrypt connected-account tokens before D1 storage.
- Use minimum required OAuth scopes.
- Permit immediate disconnect and token revocation.
- Never sell or expose member social graphs.
- Do not publish private Signal Board submissions without explicit approval.

## Permanent architecture boundary

The authoritative Matrix Reprogrammed application remains Cloudflare Worker + Cloudflare Assets + D1. Mastodon and ActivityPub extend distribution and discussion; they do not replace the site's evidence graph, editorial review, membership, forum or source vault.
