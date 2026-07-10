# PayPal Membership Setup

This system uses PayPal Subscriptions with server-side verification. The browser can begin checkout, but it cannot grant membership access.

## Membership plans

Create one PayPal subscription product and three monthly EUR plans:

| Tier | Price | Billing cycle |
|---|---:|---|
| Supporter | €9.00 | Monthly |
| Intelligence Member | €19.00 | Monthly |
| Research Pro | €49.00 | Monthly |

Each tier requires its own PayPal Plan ID. Keep all three plans in EUR.

## Start in PayPal Sandbox

1. Open the PayPal Developer Dashboard.
2. Create a Sandbox REST application for Matrix Reprogrammed.
3. Record the Sandbox Client ID and Secret.
4. Create the subscription product and three Sandbox plans.
5. Create a webhook for:

```text
https://matrixreprogrammed.com/api/paypal/webhook
```

6. Subscribe the webhook to:

```text
BILLING.SUBSCRIPTION.CREATED
BILLING.SUBSCRIPTION.ACTIVATED
BILLING.SUBSCRIPTION.UPDATED
BILLING.SUBSCRIPTION.CANCELLED
BILLING.SUBSCRIPTION.SUSPENDED
BILLING.SUBSCRIPTION.EXPIRED
BILLING.SUBSCRIPTION.PAYMENT.FAILED
PAYMENT.SALE.COMPLETED
PAYMENT.SALE.REFUNDED
PAYMENT.SALE.REVERSED
```

7. Record the Webhook ID.

## Cloudflare Worker variables

Add these under the `matrixreprogrammed` Worker in **Settings → Variables and Secrets**:

| Name | Type | Value |
|---|---|---|
| `PAYPAL_ENVIRONMENT` | Plaintext | `sandbox` |
| `PAYPAL_CLIENT_ID` | Plaintext | Sandbox Client ID |
| `PAYPAL_CLIENT_SECRET` | Secret | Sandbox Client Secret |
| `PAYPAL_WEBHOOK_ID` | Plaintext or Secret | Sandbox Webhook ID |
| `PAYPAL_PLAN_SUPPORTER` | Plaintext | €9 Sandbox Plan ID |
| `PAYPAL_PLAN_INTELLIGENCE` | Plaintext | €19 Sandbox Plan ID |
| `PAYPAL_PLAN_RESEARCH_PRO` | Plaintext | €49 Sandbox Plan ID |

The Client Secret must never be committed to GitHub, placed in HTML, sent in a screenshot or pasted into chat.

## Security and entitlement rules

The backend enforces all of the following:

- a member must have a verified, active session before checkout;
- each checkout uses a server-created, member-bound, expiring intent;
- the PayPal subscription ID is re-fetched from PayPal after approval;
- the PayPal Plan ID and custom checkout ID must match the server record;
- raw payment credentials are never stored;
- webhook signatures are verified through PayPal;
- webhook event IDs are processed idempotently;
- only a PayPal subscription with status `ACTIVE` grants paid access;
- suspended, cancelled or expired subscriptions revert the member to the free tier.

## Sandbox acceptance tests

Before switching to live mode, test:

1. New Supporter subscription.
2. New Intelligence Member subscription.
3. New Research Pro subscription.
4. Browser approval followed by server confirmation.
5. Reusing a checkout intent is rejected.
6. Wrong Plan ID is rejected.
7. Unsigned webhook is rejected.
8. Duplicate webhook is ignored safely.
9. Cancellation removes paid access.
10. Suspension or payment failure removes paid access.
11. Member dashboard displays the correct tier and PayPal status.

## Switch to live

After every Sandbox test passes:

1. Create or select a Live PayPal REST application.
2. Create the product and three Live EUR plans.
3. Create the Live webhook using the same endpoint.
4. Replace all Sandbox values in Cloudflare with Live values.
5. Change:

```text
PAYPAL_ENVIRONMENT=live
```

6. Save and deploy.
7. Complete one real low-risk membership purchase and cancellation test.

Do not mix Sandbox Client credentials with Live Plan IDs or the Live Webhook ID.
