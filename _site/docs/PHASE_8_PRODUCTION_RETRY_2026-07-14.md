# Phase 8 Production Retry — 14 July 2026

This commit intentionally retriggers the canonical Cloudflare production workflow after the Phase 8 merge.

The workflow must:

- export a private rollback snapshot of the `matrix-members` D1 database;
- apply the complete idempotent Phase 4–8 migration chain;
- verify checkout remains disabled during deployment;
- create or verify only the PayPal sandbox products and monthly plans at EUR 3, EUR 6 and EUR 9;
- keep PayPal live charging disabled;
- deploy the strict Cloudflare Worker and exact reconciled site assets;
- verify the live commit, production health, sandbox bootstrap health, PayPal fail-closed routes and D1 forum persistence;
- upload a sanitized production deployment receipt as a GitHub Actions artifact.

The only step that remains intentionally human after successful deployment is approval of one PayPal sandbox purchase during the timed Phase 7 rehearsal, followed by cancellation and evidence-ledger verification.
