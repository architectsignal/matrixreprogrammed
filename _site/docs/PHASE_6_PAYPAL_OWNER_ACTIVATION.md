# Phase 6 — Owner PayPal Activation Runbook

## Current checkpoint

The repository implementation is complete and the isolated PayPal state suite passes:

- 15/15 payment stages.
- Supporter €3, Intelligence €6 and Research Pro €9.
- Three sandbox products and plans.
- Approval without premature access.
- Activation and renewal.
- Consecutive payment failures and recovery.
- Cancellation, period end and expiry.
- Refund and reversal holds.
- Signed webhook verification and duplicate-event protection.
- Reconciliation and administrator logs.
- Deterministic rebuild and protected-file non-mutation.
- Sandbox and production checkout disabled at the end.

No real PayPal call, charge or production migration was performed by CI.

## Locked site values

- Cloudflare Worker: `matrixreprogrammed`
- D1 database: `matrix-members`
- D1 binding: `MEMBERS_DB`
- Public webhook URL: `https://matrixreprogrammed.com/api/paypal/webhook`
- Member billing page: `https://matrixreprogrammed.com/billing-dashboard.html`
- Payment administration: `https://matrixreprogrammed.com/admin-payment-dashboard.html`
- Live confirmation secret value: `MATRIX_PAYPAL_LIVE_CONFIRMED`
- Exact live activation phrase: `ACTIVATE MATRIX PAYPAL LIVE`

## Part A — Prepare the code in GitHub

The protected work is stacked. Merge only after reviewing the current green checks, in this order:

1. PR #54 — Phase 0–3.
2. Retarget PR #55 to `main`, then merge Phase 4.
3. Retarget PR #56 to `main`, then merge Phase 5.
4. Retarget PR #57 to `main`, then merge Phase 6.

Do not merge a higher phase directly before its lower-phase schema and Worker code are present on `main`.

## Part B — Back up D1

From a terminal opened in the repository:

```bash
npx wrangler login
npx wrangler d1 info matrix-members
npx wrangler d1 export matrix-members --remote --output matrix-members-before-paypal.sql
```

Keep the backup outside the public site folder and do not commit it.

## Part C — Apply the database schema

First confirm the foundation exists:

```bash
npx wrangler d1 execute matrix-members --remote --command="SELECT name FROM sqlite_master WHERE type='table' AND name IN ('members','member_sessions','subscriptions','audit_log') ORDER BY name;"
```

Apply the additive files in this exact order. They use `CREATE TABLE IF NOT EXISTS`, additive views and explicit corrections.

```bash
npx wrangler d1 execute matrix-members --remote --file=migrations/0001_membership_foundation.sql --yes
npx wrangler d1 execute matrix-members --remote --file=migrations/phase4_email_lifecycle.sql --yes
npx wrangler d1 execute matrix-members --remote --file=migrations/phase4_email_lifecycle_portability.sql --yes
npx wrangler d1 execute matrix-members --remote --file=migrations/phase5_member_experience.sql --yes
npx wrangler d1 execute matrix-members --remote --file=migrations/phase5_member_experience_timestamp_fix.sql --yes
npx wrangler d1 execute matrix-members --remote --file=migrations/phase6_paypal_subscriptions.sql --yes
npx wrangler d1 execute matrix-members --remote --file=migrations/phase6_paypal_failure_counter_fix.sql --yes
```

Verify:

```bash
npx wrangler d1 execute matrix-members --remote --command="SELECT environment,checkout_enabled,activation_reason FROM paypal_runtime_settings ORDER BY environment;"
npx wrangler d1 execute matrix-members --remote --command="SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'paypal_%' ORDER BY name;"
```

Both sandbox and live checkout must show `0` before deployment.

## Part D — Create the PayPal sandbox app

1. Sign in at the PayPal Developer Dashboard.
2. Open **My Apps & Credentials**.
3. Select **Sandbox**.
4. Create a REST application named `Matrix Reprogrammed Sandbox`.
5. Copy the sandbox **Client ID**.
6. Reveal and copy the sandbox **Secret**.
7. Under sandbox accounts, create or identify:
   - One sandbox Business seller account.
   - At least one sandbox Personal buyer account.
8. Do not use the seller account as the buyer.

## Part E — Add the sandbox webhook

Inside the sandbox REST application:

1. Add webhook URL:
   `https://matrixreprogrammed.com/api/paypal/webhook`
2. Subscribe to these events:
   - `BILLING.SUBSCRIPTION.CREATED`
   - `BILLING.SUBSCRIPTION.ACTIVATED`
   - `BILLING.SUBSCRIPTION.UPDATED`
   - `BILLING.SUBSCRIPTION.SUSPENDED`
   - `BILLING.SUBSCRIPTION.CANCELLED`
   - `BILLING.SUBSCRIPTION.EXPIRED`
   - `BILLING.SUBSCRIPTION.PAYMENT.FAILED`
   - `PAYMENT.SALE.COMPLETED`
   - `PAYMENT.SALE.REFUNDED`
   - `PAYMENT.SALE.REVERSED`
   - `PAYMENT.CAPTURE.REFUNDED`
   - `PAYMENT.CAPTURE.REVERSED`
3. Save the webhook.
4. Copy its webhook ID.

The webhook must belong to the same PayPal REST app whose Client ID and Secret are used by the Worker.

## Part F — Add Cloudflare sandbox configuration

In Cloudflare:

1. Open **Workers & Pages**.
2. Select Worker `matrixreprogrammed`.
3. Open **Settings** → **Variables and Secrets**.
4. Add these as **Secrets**:
   - `PAYPAL_CLIENT_ID` = sandbox Client ID
   - `PAYPAL_CLIENT_SECRET` = sandbox Secret
   - `PAYPAL_WEBHOOK_ID` = sandbox webhook ID
5. Add these as variables or secrets:
   - `PAYPAL_ENVIRONMENT` = `sandbox`
   - `PAYPAL_SANDBOX_ENABLED` = `true`
   - `PAYPAL_PRODUCTION_ENABLED` = `false`
6. Do not add a live confirmation secret during sandbox testing.
7. Deploy the variable changes.

Equivalent Wrangler secret commands for the sensitive values:

```bash
npx wrangler secret put PAYPAL_CLIENT_ID
npx wrangler secret put PAYPAL_CLIENT_SECRET
npx wrangler secret put PAYPAL_WEBHOOK_ID
```

Do not commit credentials to GitHub, `.env`, generated reports or browser JavaScript.

## Part G — Deploy with checkout still disabled

Build and deploy the merged code:

```bash
npm run build
npx wrangler deploy
```

Even with `PAYPAL_SANDBOX_ENABLED=true`, checkout remains disabled because the D1 switch is still `0`.

Log in as the site administrator and open:

`https://matrixreprogrammed.com/admin-payment-dashboard.html`

The page should show:

- Environment: sandbox.
- Checkout: disabled.
- Plans: 0/3 before bootstrap.
- Credentials and webhook configured in the health response.

## Part H — Create the exact sandbox plans

On the payment administration page:

1. Select **Create or confirm PayPal plans**.
2. Confirm the result shows exactly:
   - Supporter €3.00.
   - Intelligence €6.00.
   - Research Pro €9.00.
3. Repeat the button once to confirm it is idempotent and does not create duplicate plans.
4. Keep checkout disabled until all three plans show ready.

## Part I — Enable sandbox checkout

On the payment administration page:

1. Environment: `Sandbox`.
2. Action: `Enable checkout`.
3. Reason: `Sandbox lifecycle test approved`.
4. Apply the protected switch.
5. Confirm the dashboard says sandbox checkout is enabled.

Both conditions are required:

- Cloudflare `PAYPAL_SANDBOX_ENABLED=true`.
- D1 `paypal_runtime_settings.checkout_enabled=1` for sandbox.

## Part J — Complete the real sandbox buyer lifecycle

Use the sandbox Personal buyer credentials, not the seller credentials.

1. Create or verify a clean Matrix Reprogrammed member account.
2. Log in to the site.
3. Open `/membership.html`.
4. Subscribe to Supporter €3 using the PayPal sandbox buyer.
5. Confirm:
   - PayPal shows €3.00 monthly.
   - Approval alone does not create access before PayPal activation is verified.
   - The member dashboard changes to Supporter only after active state is recorded.
   - The billing dashboard shows sandbox, Supporter and active entitlement.
6. Open the payment administration page and confirm:
   - The subscription exists.
   - The activation webhook was verified.
   - An entitlement transition was recorded.
7. Cancel from the billing dashboard.
8. Confirm cancellation state and the paid-period rule.
9. Repeat the purchase test for Intelligence €6 and Research Pro €9, using clean test members when practical.
10. Use the PayPal sandbox Business account to inspect the mock transactions and subscription records.
11. Resend a sandbox webhook event and confirm it is reported as duplicate rather than processed twice.
12. Run **Reconcile subscriptions** and confirm zero unexplained failures.

## Part K — Disable sandbox checkout after testing

On the payment administration page:

1. Environment: Sandbox.
2. Action: Disable checkout.
3. Reason: `Sandbox test complete`.
4. Apply.

Also change `PAYPAL_SANDBOX_ENABLED` to `false` before moving to live credentials.

## Part L — Prepare the live PayPal app

Do this only after all sandbox steps pass.

1. Confirm the PayPal account is a verified Business account.
2. In **My Apps & Credentials**, switch to **Live**.
3. Create a live REST application named `Matrix Reprogrammed`.
4. Copy the live Client ID and Secret.
5. Add the same public webhook URL.
6. Select the same 12 webhook events.
7. Copy the live webhook ID.
8. Keep the live checkout switch off.

Sandbox credentials, sandbox webhook IDs and sandbox plan IDs do not work in production.

## Part M — Install live credentials with checkout disabled

Replace the Cloudflare PayPal credentials with the live values and set:

- `PAYPAL_ENVIRONMENT=live`
- `PAYPAL_SANDBOX_ENABLED=false`
- `PAYPAL_PRODUCTION_ENABLED=false`
- Secret `PAYPAL_LIVE_ACTIVATION_CONFIRMATION=MATRIX_PAYPAL_LIVE_CONFIRMED`

Deploy and open the payment administration page. It must show live environment and checkout disabled.

Create or confirm the three live plans. Confirm €3.00, €6.00 and €9.00 exactly.

## Part N — Final live activation

Only after reviewing the live app, webhook, prices and plans:

1. Set `PAYPAL_PRODUCTION_ENABLED=true` in Cloudflare.
2. Deploy the variable change.
3. Open the payment administration page.
4. Environment: Live.
5. Action: Enable checkout.
6. Reason: `Live PayPal launch approved`.
7. Enter the exact phrase:
   `ACTIVATE MATRIX PAYPAL LIVE`
8. Apply the protected switch.

Live checkout will only open when all of these agree:

- `PAYPAL_ENVIRONMENT=live`.
- Valid live Client ID, Secret and webhook ID.
- Three live active plans.
- `PAYPAL_PRODUCTION_ENABLED=true`.
- `PAYPAL_LIVE_ACTIVATION_CONFIRMATION=MATRIX_PAYPAL_LIVE_CONFIRMED`.
- D1 live checkout switch enabled.
- Exact activation phrase entered by an administrator.

## Part O — First live transaction

Use a different PayPal buyer account from the Business seller account.

1. Purchase the €3 Supporter plan.
2. Confirm the amount and monthly interval inside PayPal.
3. Confirm the member dashboard grants Supporter access only after verified activation.
4. Confirm the billing dashboard and administrator logs agree.
5. Confirm the webhook is verified and the transition is recorded once.
6. Cancel the test subscription and verify the cancellation state.
7. When appropriate, issue a real refund from PayPal and confirm the local refund hold removes paid access.
8. Run reconciliation.

If any step fails, immediately disable the D1 live switch from the administrator page and set `PAYPAL_PRODUCTION_ENABLED=false` in Cloudflare. Existing billing history and webhook processing remain preserved.

## Exit condition

Do not begin a later phase until:

- All automated Phase 6 checks are green.
- All three sandbox tiers have been manually purchased and verified.
- Sandbox cancellation and webhook reconciliation pass.
- Live credentials and webhook are configured.
- One controlled live €3 transaction completes end to end.
- Cancellation/refund behavior is confirmed.
- Administrator logs and D1 entitlement agree with PayPal.
