# Matrix Reprogrammed — PayPal and Email Launch Master Plan

Status: LOCKED CANONICAL LAUNCH SEQUENCE  
Owner: Matrix Reprogrammed  
Timezone: Europe/Paris  
Updated: 2026-07-18

## Governing rule

Do not activate automated marketing email or live PayPal checkout until every preceding acceptance phase has passed. Free Member access retains the same underlying public-source evidence as paid tiers. Paid tiers add curation, delivery, monitoring, exports, research tools and member services.

## Current production state

The controlled Cloudflare production release completed successfully on 18 July 2026.

- D1 is authoritative for membership, sessions, forum, consent and payment state.
- Transactional account email is enabled.
- Automated marketing email is disabled.
- PayPal uses the sandbox environment.
- PayPal sandbox checkout is disabled outside a timed administrator rehearsal.
- PayPal live charging is disabled.
- Versioned checkout consent and durable membership-confirmation email code are installed behind the payment gates.
- `COMMERCIAL_LEGAL_READY` is false.
- No live payment activation is authorised by this document.

This replaces the earlier statement that Email Phase 11 had been activated. Verification, welcome and preference email tests passed, but scheduled marketing automation remains deliberately disabled until its review evidence is complete.

## Locked phase sequence

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
11. Scheduled email review and controlled automation activation
12. PayPal Business and Developer preparation
13. PayPal sandbox credentials and webhook
14. Sandbox product and plan bootstrap
15. Timed sandbox checkout activation
16. Full sandbox payment lifecycle matrix
17. Production deployment and activation-state verification
18. Legal, tax and commercial readiness
19. PayPal live application and live plans
20. Controlled live payment activation
21. Post-launch monitoring and reconciliation

## Production stability acceptance

Required outcomes:

- [x] Current main branch deployed successfully to Cloudflare.
- [x] Live deployment SHA verified.
- [x] D1 migration chain applied with a rollback bookmark.
- [x] Critical public, member, billing, newsletter and administration routes verified.
- [x] D1-authoritative forum write/read verification passed.
- [x] Transactional account email enabled.
- [x] PayPal sandbox plans available behind disabled checkout.
- [x] Live PayPal charging remains disabled.
- [ ] All recurring auxiliary workflows reviewed after the new commercial gate lands.
- [ ] Human browser journey completed on desktop, Android and iPhone/Safari.

## Email acceptance

Completed:

- [x] `matrixreprogrammed.com` authenticated in Brevo with DKIM and DMARC.
- [x] `members@matrixreprogrammed.com` verified as sender.
- [x] Monitored reply-to identity configured.
- [x] Controlled transactional message accepted and received.
- [x] Verification and welcome sequence completed.
- [x] Explicit consent and selectable public briefing preferences enforced.
- [x] Personalised preference and unsubscribe routes installed.
- [x] Retry records predating activation quarantined by cutoff.
- [x] Campaign content fails closed rather than inventing claims.
- [x] Membership contract-confirmation email is idempotent and includes the recurring price, PayPal subscription reference, consent versions, immediate-service request, billing route, terms and withdrawal notice.

Still required before `EMAIL_AUTOMATION_ENABLED=true`:

- [ ] Review three scheduled daily dry or controlled runs.
- [ ] Review one scheduled weekly dry or controlled run.
- [ ] Confirm Brevo delivery, bounce, complaint, click and unsubscribe event flow.
- [ ] Confirm suppression after unsubscribe, complaint and hard bounce.
- [ ] Record explicit owner approval for scheduled marketing automation.

## PayPal sandbox lifecycle acceptance

The timed sandbox rehearsal must prove all three tiers: Supporter €3, Intelligence Member €6 and Research Pro €9.

- [ ] Start an administrator-authorised rehearsal.
- [ ] Confirm checkout closes automatically outside the rehearsal window.
- [ ] Complete checkout with a PayPal sandbox buyer.
- [ ] Confirm versioned terms and withdrawal acknowledgements are written to `paypal_checkout_consents` before PayPal opens.
- [ ] Confirm approval alone does not grant entitlement.
- [ ] Confirm verified ACTIVE state grants the exact selected tier.
- [ ] Confirm the durable membership-confirmation email is queued once and delivered through authenticated transactional email.
- [ ] Confirm duplicate activation events do not send duplicate contract confirmations.
- [ ] Confirm duplicate webhook delivery is idempotent.
- [ ] Confirm first failed payment applies only the intended grace state.
- [ ] Confirm the failure threshold removes paid access.
- [ ] Confirm successful recovery restores the correct access.
- [ ] Confirm cancellation retains access only through a verified remaining paid period.
- [ ] Confirm expiry removes paid access.
- [ ] Confirm refund and reversal place entitlement on hold or remove it.
- [ ] Run reconciliation and confirm no unexplained divergence.
- [ ] Complete or abort the rehearsal and confirm checkout is disabled again.

## Commercial and legal acceptance

Live checkout is blocked until all of the following are verified and published:

- [ ] Legal name of the operator or registered business.
- [ ] Geographical postal address.
- [ ] Business registration details where applicable.
- [ ] VAT identification or verified VAT-status wording where applicable.
- [ ] Legally responsible publisher identity where required.
- [ ] Hosting notice details required by the applicable jurisdiction.
- [ ] Consumer-mediation service and contact route.
- [ ] Final tax-inclusive price presentation and billing descriptor.
- [x] Versioned Membership Terms route.
- [x] Versioned Cancellation and Withdrawal route.
- [x] Explicit recurring-payment acknowledgement.
- [x] Explicit immediate digital-service request.
- [x] Durable server-side consent record tied to the checkout intent.
- [x] Durable contract-confirmation email wired to the first verified active entitlement transition.
- [x] Live activation requires authenticated transactional email readiness.
- [x] `COMMERCIAL_LEGAL_READY=false` committed as the default.
- [ ] Complete one controlled sandbox proof of the contract-confirmation email.
- [ ] `COMMERCIAL_LEGAL_CONFIRMATION` installed as a Cloudflare secret only after verification.
- [ ] Explicit owner approval recorded to change `COMMERCIAL_LEGAL_READY` to true.

## Activation boundaries

- `PAYPAL_ENVIRONMENT` remains `sandbox` until controlled live launch approval.
- `PAYPAL_PRODUCTION_ENABLED` remains false until Phase 20.
- `COMMERCIAL_LEGAL_READY` remains false until Phase 18 is complete.
- `COMMERCIAL_LEGAL_CONFIRMATION` must never be committed to GitHub.
- PayPal D1 checkout switches remain disabled except during the controlled sandbox rehearsal or explicit live activation.
- `EMAIL_AUTOMATION_ENABLED` remains false until Phase 11 acceptance is recorded.
- `EMAIL_TRANSACTIONAL_ENABLED` remains true only while authenticated account and contract-confirmation delivery is healthy.
- Every marketing email must contain working personalised preference and unsubscribe routes.
- Every PayPal webhook must be verified before changing entitlement state.
- PayPal checkout must fail closed if current terms consent cannot be persisted.
- Live checkout must fail closed if authenticated durable contract-confirmation email is unavailable.

## Change control

This document is the canonical order of work. Phases may gain stronger checks, but they must not be skipped or reordered without an explicit recorded decision. Live charging and marketing automation require separate approvals.
