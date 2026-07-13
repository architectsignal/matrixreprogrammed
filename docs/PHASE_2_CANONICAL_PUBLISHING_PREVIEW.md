# Phase 2 — Canonical Publishing Preview

Status: **preview-only / non-destructive**

## Objective

Generate cumulative Public, Free Registered, Supporter (€3), Intelligence (€6) and Research Pro (€9) views from one canonical intelligence record without changing the record's evidential status, current site pages, authentication, entitlements, email delivery or payments.

## Locked rules

1. One intelligence item exists once. Tier copies are generated deterministically and are never edited independently.
2. Access level adds depth, tools and export value. It cannot upgrade an allegation, inference, scenario or speculation into fact.
3. Public projections always expose the source route, claim class, solid-conclusion boundary, mission boundary, association boundary and freshness status.
4. Corrections, withdrawals, evidence downgrades, dismissals, acquittals, reversals and material contradictory records must remain public wherever they qualify a public claim.
5. Each higher tier is cumulative. It must contain every field visible in lower tiers.
6. Speculative conclusions remain separately labelled in every tier where they appear.
7. Live Intel leads and graph hints remain evidence-bounded and cannot become findings through projection.
8. Current URLs, HTML pages, generators, Workers, D1 data, authentication, membership, email and payment systems are not modified in Phase 2 preview.
9. Prices may remain visible, but checkout and paid entitlement activation remain disabled.
10. Generated previews write only beneath `downloads/phase2-tier-projections/` and are CI artifacts, not production output.

## Projection outputs

- `public.json` and `public.ndjson`
- `registered.json` and `registered.ndjson`
- `supporter_3.json` and `supporter_3.ndjson`
- `intelligence_6.json` and `intelligence_6.ndjson`
- `research_pro_9.json` and `research_pro_9.ndjson`
- `projection-manifest.json`
- `preview.html`
- `non-mutation-report.json`

## Activation boundary

No projection is connected to production pages, dashboards, email, authentication or entitlements until:

- projection output is deterministic;
- lower-tier output is a structural subset of every higher tier;
- mandatory public safety fields are always present;
- all 253 canonical records project successfully;
- protected source hashes remain unchanged;
- current production regression tests are reviewed;
- authentication and entitlement checks fail closed;
- payments remain disabled until the complete sandbox lifecycle passes.
