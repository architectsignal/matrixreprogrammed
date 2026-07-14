# Phase 7 Release Status

## Objective

Prove the complete PayPal subscription lifecycle with real PayPal sandbox infrastructure before any production charging is considered.

## Implemented

- A D1-backed sandbox rehearsal ledger and append-only evidence table.
- A strict administrator-only control room at `/admin-paypal-rehearsal`.
- A maximum 45-minute sandbox checkout window.
- Exact start, completion and abort phrases.
- Automatic closure when a rehearsal expires, is aborted or passes.
- A production-boundary checkout gate: sandbox checkout cannot create an intent without an active rehearsal.
- Evidence collection for:
  - Matrix test member
  - PayPal sandbox subscription
  - verified PayPal webhook
  - entitlement activation
  - subscription state transition
  - payment record
  - cancellation
- Production charging remains explicitly disabled.
- Automatic and manual Cloudflare deployments both apply and verify the Phase 7 migration.
- Live deployment verification proves the control page exists and checkout remains fail-closed without an active rehearsal.

## Runtime switches

- `PAYPAL_ENVIRONMENT=sandbox`
- `PAYPAL_SANDBOX_ENABLED=true`
- `PAYPAL_PRODUCTION_ENABLED=false`
- D1 `paypal_runtime_settings.checkout_enabled=0` after every deployment.

The sandbox environment switch permits an administrator to start a rehearsal. It does not open checkout by itself.

## Passing definition

A rehearsal can be marked passed only after the system has observed all of the following:

1. A subscription for the chosen tier and test-member email.
2. Paid entitlement activation.
3. A successfully verified PayPal webhook.
4. At least one recorded subscription transition.
5. At least one recorded payment.
6. A cancellation transition.
7. Automatic closure of sandbox checkout.

## Not included

- No live PayPal activation.
- No production activation phrase.
- No production purchase.
- No copied PayPal secrets.
- No bypass around D1, webhook verification or entitlement state.
