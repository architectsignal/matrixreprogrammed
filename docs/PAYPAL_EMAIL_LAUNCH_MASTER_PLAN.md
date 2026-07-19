# Matrix Reprogrammed — PayPal and Email Launch Master Plan

Status: LOCKED CANONICAL LAUNCH SEQUENCE
Owner: Matrix Reprogrammed
Timezone: Europe/Paris
Updated: 2026-07-19

## Governing rule

Do not activate scheduled marketing email or live PayPal checkout until every preceding acceptance gate has passed and the evidence has been recorded. Free Member access retains the same underlying public-source evidence as paid tiers. Paid tiers add service, organisation, monitoring, exports and research tools.

## Current safety state

| Control | Required state | Current launch position |
|---|---|---|
| Transactional email | Enabled | Enabled for passwordless verification, account and service messages |
| Scheduled marketing email | Disabled | Disabled until the first three daily deliveries, first weekly delivery and Brevo event webhooks are reviewed |
| PayPal environment | Sandbox | Sandbox only |
| Sandbox checkout | Disabled except during a timed rehearsal | Fail-closed |
| Live PayPal charging | Disabled | Must remain disabled until the full sandbox matrix and commercial-readiness gate pass |

The earlier statement that Email Phase 11 had activated scheduled marketing was superseded by the controlled production receipt of 18 July 2026. The authoritative state is now: **transactional email enabled; scheduled marketing automation disabled**.

## Phase sequence

1. Production stability and green workflows
2. D1 database protection and migrations
3. Professional email identity
4. Brevo domain authentication
5. Cloudflare email secrets and variables
6. Brevo delivery webhook
7. Personalised unsubscribe and preference links
8. Transactional magic-link email tests
9. Newsletter consent and lifecycle tests
10. Manual newsletter campaign tests
11. Scheduled newsletter proof and controlled activation
12. PayPal Business and Developer preparation
13. PayPal sandbox credentials and webhook
14. Sandbox product and plan bootstrap
15. Timed sandbox checkout activation
16. Full sandbox payment test matrix
17. Production deployment and PayPal activation-state verification
18. Legal, tax and commercial readiness
19. PayPal live application and plans
20. Controlled live payment activation
21. Post-launch monitoring and reconciliation

## Phase 1 — Production stability

### Required outcomes

- All major GitHub workflows green.
- Current main branch deployed successfully to Cloudflare.
- Critical public, member, billing, newsletter and administration routes return valid responses.
- Transactional email remains available while scheduled marketing remains disabled.
- No recurring Cloudflare KV quota warnings.
- D1 remains authoritative for membership, consent, sessions, forum and payment state.
- Sandbox and live activation boundaries remain fail-closed.

### Workflow targets

- Matrix Reprogrammed Production Deploy
- Site Pressure Test
- Site QA
- Link Audit
- Full System Audit
- Site-Wide Master Audit
- Mission Readiness Assurance
- Gated OSINT Tools Assurance
- Paid Launch Rehearsal Readiness

### Critical routes

- /membership.html
- /member-login.html
- /member-dashboard.html
- /billing-dashboard.html
- /admin-payment-dashboard.html
- /newsletter.html
- /subscriber-dashboard.html
- /email-status.html
- /membership-terms.html
- /terms-of-use.html
- /api/email/admin/health
- /api/paypal/admin/health
- /api/paypal/admin/rehearsal/readiness
- /forum-health

### Phase 1 acceptance record

- [x] Current main commit identified
- [x] Transactional email enabled in production configuration
- [x] Scheduled marketing automation disabled in production configuration
- [ ] Full build passes on the launch-hardening branch
- [ ] Functional/tool audit passes on the launch-hardening branch
- [ ] Link audit passes on the launch-hardening branch
- [ ] Site Pressure Test passes on the launch-hardening branch
- [ ] Site QA passes on the launch-hardening branch
- [ ] Controlled production deploy passes after merge
- [ ] Cloudflare live SHA matches merged main
- [ ] Critical route verification passes after deploy
- [x] D1 email lifecycle health passes
- [ ] KV traffic remains within limits

## Phase 11 — Scheduled email proof

### Completed

- [x] `matrixreprogrammed.com` authenticated in Brevo with DKIM and DMARC.
- [x] `members@matrixreprogrammed.com` verified as the sender.
- [x] Monitored reply-to identity configured.
- [x] Controlled Brevo transactional message accepted and received.
- [x] Verification and welcome sequence completed successfully.
- [x] Explicit consent and selectable daily, weekly and release-notice preferences enforced.
- [x] Personalised preference and unsubscribe routes installed.
- [x] Daily and weekly Cloudflare cron schedules configured.
- [x] Retry records predating activation automatically quarantined by cutoff.
- [x] Daily and weekly campaign content fails closed rather than inventing claims.

### Still required before scheduled marketing is enabled

- [ ] Review the first three controlled daily deliveries.
- [ ] Review the first controlled weekly delivery.
- [ ] Confirm Brevo delivery webhook processing.
- [ ] Confirm Brevo bounce webhook processing and suppression.
- [ ] Confirm Brevo complaint webhook processing and suppression.
- [ ] Confirm Brevo click event processing.
- [ ] Confirm Brevo unsubscribe event processing and preference state.
- [ ] Record the reviewed message IDs and D1 campaign/event rows in a sanitized launch receipt.

## Phase 16 — Full PayPal sandbox matrix

Each tier must complete a fresh, timed rehearsal using a PayPal sandbox personal buyer:

- [ ] €3 Supporter purchase, verified webhook, correct D1 state and correct entitlement.
- [ ] €6 Intelligence purchase, verified webhook, correct D1 state and correct entitlement.
- [ ] €9 Research Pro purchase, verified webhook, correct D1 state and correct entitlement.
- [ ] Checkout approval alone does not grant paid access.
- [ ] Cancellation retains access only until the verified paid-period end.
- [ ] Access disappears after the verified paid-period end.
- [ ] First failed renewal follows the documented grace rule.
- [ ] Second failed renewal or provider suspension removes paid access.
- [ ] A later verified completed payment restores only the correct tier.
- [ ] Duplicate webhook is acknowledged once and does not duplicate state, payment or access.
- [ ] Invalid webhook signature cannot alter state.
- [ ] Refund and reversal remove paid access and create an auditable hold state.
- [ ] Wrong member, wrong plan and wrong custom checkout intent are rejected.
- [ ] Reconciliation agrees with PayPal and cannot grant a higher or duplicate tier.
- [ ] Rehearsal completion closes sandbox checkout.
- [ ] Expiry or abort closes sandbox checkout automatically.
- [ ] Live charging remains disabled throughout.

## Phase 18 — Commercial readiness

Before live charging, all of the following must be complete and displayed consistently on the membership page, checkout summary, billing dashboard and footer:

- [ ] Complete legal operator name and postal address.
- [ ] Business registration identifiers where applicable.
- [ ] Confirmed VAT treatment and invoice wording.
- [ ] Confirmed PayPal merchant and customer statement descriptor.
- [ ] Consumer mediation details where legally required.
- [x] Website terms of use installed.
- [x] Recurring membership terms installed.
- [x] Cancellation, withdrawal, refund, reversal and failed-payment rules installed.
- [x] Membership payments described as non-charitable and non-tax-deductible.

## Activation boundaries

- `PAYPAL_ENVIRONMENT` remains `sandbox` until live launch approval.
- `PAYPAL_PRODUCTION_ENABLED` remains `false` until Phase 20.
- `COMMERCIAL_LAUNCH_APPROVED` remains `false` until Phase 18 is signed off.
- PayPal D1 checkout switches remain disabled except during a timed sandbox rehearsal or controlled live activation.
- `EMAIL_AUTOMATION_ENABLED` remains `false` until the Phase 11 scheduled-delivery evidence is complete.
- `EMAIL_TRANSACTIONAL_ENABLED` remains `true` while authenticated transactional delivery is healthy.
- Brevo and PayPal secrets must never be committed to GitHub.
- Sandbox buyer passwords must never be committed to GitHub or exposed in logs or artifacts.
- Every marketing email must contain working personalised preference and unsubscribe routes.
- Every PayPal webhook must be verified before changing entitlement state.
- No checkout confirmation, browser event or unverified provider event may grant paid access.

## Change control

This document is the canonical order of work. New work may add acceptance checks, but phases must not be skipped or reordered without an explicit recorded decision. Live charging must remain disabled when any evidence item is incomplete.