# Phase 4 — Email Live-Readiness Runbook

## Verified implementation checkpoint

The protected implementation provides:

- Working signup endpoint.
- D1 subscriber, consent, preference, provider-contact, segment, campaign, delivery, event, suppression, outbox and audit records.
- Brevo contact synchronisation and transactional delivery.
- Verification and welcome sequence.
- Preferences, unsubscribe and explicit resubscribe.
- Daily, weekly and release segments.
- Scheduled daily and weekly campaign builders.
- Idempotent provider-event recording.
- Subscriber dashboard.
- Admin campaign monitoring and retry controls.

The clean-account integration fixture completed the full lifecycle against a D1-compatible SQLite database and a failure-capable Brevo mock. Schema, lifecycle, deterministic rebuild and non-mutation gates passed.

## Production activation remains fail-closed

The code does not consider a deployment production-ready merely because the implementation tests pass. Real activation requires the checks below in order.

### 1. Required Cloudflare bindings and secrets

- `MEMBERS_DB`
- `BREVO_API_KEY`
- `MEMBERS_FROM_EMAIL`
- `MEMBERS_FROM_NAME`
- `EMAIL_WEBHOOK_SECRET`
- `ADMIN_API_TOKEN`
- `EMAIL_AUTOMATION_ENABLED=false` for first deployment
- `EMAIL_TEST_MODE=false` in production

No secret value belongs in source control, workflow logs, generated reports or browser JavaScript.

### 2. D1 migration procedure

1. Back up the current membership database.
2. Apply the reviewed Phase 4 migration to a staging D1 database.
3. Run schema validation and the campaign-eligibility views.
4. Confirm existing members, sessions, subscriptions, consent and audit records remain intact.
5. Apply to production only after the staging database passes.
6. Do not delete or rewrite the legacy membership tables.

### 3. Brevo configuration

- Confirm the sender address and domain are verified.
- Configure the provider webhook to `/api/email/provider-webhook`.
- Send the webhook secret only in the expected secret header.
- Confirm contact updates do not silently resubscribe suppressed users.
- Confirm hard bounce and complaint events create immediate local suppression.

### 4. First deployment

Deploy with:

- Email routes enabled.
- `EMAIL_AUTOMATION_ENABLED=false`.
- No scheduled campaign delivery.
- Payments and paid entitlement activation unchanged.

Verify:

- `/api/email/admin/health` proves D1 and Brevo configuration.
- Existing forum and non-email routes remain on their previous Worker paths.
- Signup failure never returns false success.
- The public page no longer describes KV as the authoritative subscriber store.

### 5. One real test-account lifecycle

Use a clean controlled inbox and complete:

1. Signup with explicit consent.
2. D1 pending subscriber and consent record.
3. Brevo contact creation or update.
4. Verification email receipt.
5. Verification completion.
6. Welcome email receipt.
7. Subscriber dashboard access.
8. Preference update and segment recalculation.
9. Admin test campaign to the test segment.
10. Delivery-event reconciliation.
11. Unsubscribe and immediate campaign suppression.
12. Explicit resubscribe and re-verification.
13. Hard-bounce or complaint fixture in staging.
14. Admin dashboard reconciliation.

### 6. Automation activation

Only after the real test account completes the lifecycle:

1. Enable automation in staging.
2. Verify one daily and one weekly scheduled run.
3. Confirm idempotent campaign keys prevent duplicate sends.
4. Confirm empty segments do not generate false delivery success.
5. Confirm provider failure leaves retryable outbox state.
6. Set `EMAIL_AUTOMATION_ENABLED=true` in production.

## Rollback

If any production check fails:

- Set `EMAIL_AUTOMATION_ENABLED=false` immediately.
- Keep subscriber, consent and delivery history in D1.
- Stop campaign/outbox processing without deleting queued evidence.
- Preserve suppression records.
- Revert only the email route delegation if necessary; do not disturb forum or general asset routing.

## Exit condition

Phase 4 is operationally complete only when one clean real account completes the entire lifecycle in the deployed environment and the admin monitor reconciles local D1 state with Brevo delivery state. Until then, the repository implementation is complete but production activation remains gated.
