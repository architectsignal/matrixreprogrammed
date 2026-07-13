# Phase 2B — Preview Publishing Layer

## Status

Protected-branch implementation. Preview-only. No live route, account, entitlement, email, Worker, database or payment behaviour is changed.

## Purpose

Turn the deterministic Phase 2 tier projections into a reviewable static publishing package before any live integration.

The package must prove that one canonical intelligence record can produce cumulative views for:

- Public
- Free Registered
- Supporter €3
- Intelligence Member €6
- Research Pro €9

## Generated preview package

The builder writes only beneath:

`downloads/phase2-publishing-preview/`

It generates:

- A preview index.
- Five static dashboard pages.
- Five dashboard JSON feeds.
- A tier-specific static record page for every canonical record.
- A publishing manifest containing counts, hashes and safety status.
- A machine-readable route manifest for later preview deployment work.

## Isolation boundary

Every generated page:

- Uses a `__preview/canonical/` route namespace.
- Includes `noindex, nofollow, noarchive` metadata.
- Is generated only from the corresponding tier projection.
- Contains no form submission.
- Contains no authentication or entitlement calls.
- Contains no email capture or campaign calls.
- Contains no checkout, PayPal or subscription code.
- Contains no external executable script.
- Does not replace or link-rewrite any current production page.

## Evidential boundary

Tier projection changes visibility only. It must not change:

- Record status.
- Claim class.
- Evidence grade.
- Solid conclusion wording or confidence.
- Mission outcome.
- Public correction, contradiction or association boundary.

Speculation is rendered only where the projected tier contains it and remains visibly labelled as speculation.

## Dashboard feed contract

Each tier feed contains:

- Tier metadata.
- Record count.
- Record-type, evidence and mission-outcome counts.
- Dashboard cards derived only from the tier projection.
- Preview record routes.
- Review and delivery flags already present in the projected record.

The feeds are static CI artifacts. They are not connected to authentication or a live dashboard.

## Activation boundary

Nothing in this phase may be published to a live route until:

1. Static preview tests pass.
2. Public safety fields are present on every page.
3. Cross-tier factual invariants pass.
4. Preview routes are reviewed visually.
5. Authentication and entitlement design is separately implemented and fails closed.
6. Email delivery is separately tested.
7. Payments remain disabled until full sandbox lifecycle testing passes.
