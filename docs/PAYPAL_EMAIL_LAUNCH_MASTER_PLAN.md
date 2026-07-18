# Matrix Reprogrammed — PayPal, Email and Signal Board Launch Master Plan

Status: LOCKED CANONICAL OPERATING SEQUENCE  
Owner: Matrix Reprogrammed  
Timezone: Europe/Paris  
Updated: 2026-07-18

## Governing rule

Consent-based briefing email may operate only for verified subscribers whose selected preference and suppression state permit delivery. Live PayPal checkout remains separately blocked until every payment, legal and commercial acceptance phase has passed. Free Member access retains the same underlying public-source evidence as paid tiers. Paid tiers add curation, delivery, monitoring, exports, research tools and member services.

## Current controlled state

- Cloudflare D1 is authoritative for membership, sessions, Signal Board posts and owners, email consent, preferences, suppression, delivery state and PayPal billing state.
- Transactional account email is enabled.
- Automated daily and weekly briefing email is enabled.
- The Daily Control Brief is scheduled for **08:05 Europe/Paris**.
- The Weekly Signal Drop is scheduled for **09:15 Europe/Paris each Monday**.
- Cloudflare runs both summer and winter UTC candidates; the Worker checks Europe/Paris local time before sending, preventing duplicate or DST-shifted campaigns.
- A subscriber who verifies an address and selected the Daily Control Brief receives an **Immediate first Daily Control Brief** after verification.
- Every campaign uses the verified subscriber segment, selected preference, active consent, tier boundary and suppression ledger.
- Personalised preference and unsubscribe routes are inserted into each queued campaign email.
- Deep brief content uses structure version 3: trigger, primary record, record status, established facts, key entities, money and authority, mechanism of power, solid conclusion, mission relevance, elite-control relevance, global convergence assessment, speculative conclusion, counter-analysis, missing evidence, watch next, confidence and access tier.
- The Signal Board is free to read and requires a verified Free Member session to post or report.
- Signal Board writes are accepted only after D1 confirms persistence. Browser-only/local-storage posting and the old €1 Signal Pass are removed.
- PayPal remains in the sandbox environment.
- Sandbox checkout remains closed outside a timed administrator rehearsal.
- PayPal live charging remains disabled.
- `COMMERCIAL_LEGAL_READY` remains false.

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
10. Structured daily and weekly content validation
11. Controlled automated briefing activation
12. Persistent verified-member Signal Board activation
13. PayPal Business and Developer preparation
14. PayPal sandbox credentials and webhook
15. Sandbox product and plan bootstrap
16. Timed sandbox checkout activation
17. Full sandbox payment lifecycle matrix
18. Production deployment and activation-state verification
19. Legal, tax and commercial readiness
20. PayPal live application and live plans
21. Controlled live payment activation
22. Post-launch monitoring and reconciliation

## Production stability acceptance

- [x] Current production deployment completed successfully before this branch.
- [x] D1 is authoritative for membership and forum state.
- [x] Transactional email is enabled.
- [x] PayPal sandbox plans are protected behind disabled checkout.
- [x] Live PayPal charging remains disabled.
- [x] Deep briefing generation is protected by the normal prebuild and final reconciliation chain.
- [x] Signal Board source and output pages are protected against restoration of the old device-only Signal Pass.
- [ ] All current branch workflows complete green on the same head SHA.
- [ ] Final human browser journey is completed on desktop, Android and iPhone/Safari.

## Email acceptance

Completed in code and configuration:

- [x] `matrixreprogrammed.com` authenticated in Brevo with DKIM and DMARC.
- [x] `members@matrixreprogrammed.com` verified as sender.
- [x] Monitored reply-to identity configured.
- [x] Verification, welcome, preference and unsubscribe lifecycle installed.
- [x] Explicit consent and selectable briefing preferences enforced.
- [x] Suppression after unsubscribe, complaint and hard bounce is enforced in the lifecycle.
- [x] Retry records predating activation are quarantined by cutoff.
- [x] Campaign content fails closed instead of inventing claims when a source bundle is unavailable.
- [x] Daily and weekly campaigns use the deep structured briefing renderer.
- [x] Immediate first daily brief is queued after verification when the daily preference is active.
- [x] Every recipient receives personalised preference and unsubscribe links.
- [x] Daily scheduling is guarded at 08:05 Europe/Paris.
- [x] Weekly scheduling is guarded at 09:15 Europe/Paris each Monday.
- [x] Membership contract-confirmation email remains idempotent and separate from marketing email.

Operational proof and monitoring still required:

- [ ] Confirm the first three scheduled Daily Control Brief campaigns in D1 and Brevo.
- [ ] Confirm the first scheduled Weekly Signal Drop.
- [ ] Confirm one immediate first daily brief after a fresh verification.
- [ ] Confirm delivered, bounce, complaint, click and unsubscribe webhook events update D1.
- [ ] Confirm no duplicate campaign is created across the two UTC DST candidate schedules.
- [ ] Review depth, source quality and formatting of the first live campaign after each material template change.

## Signal Board persistence acceptance

Completed in code and configuration:

- [x] Reading remains public.
- [x] Posting and reporting require a verified Free Member session.
- [x] Posts are stored in `MEMBERS_DB.forum_posts`.
- [x] Post ownership is stored in `forum_post_owners`.
- [x] Report ownership is stored in `forum_report_owners`.
- [x] Per-board persistence state is stored in `forum_board_state`.
- [x] The main, speculation and Epstein-sighting boards use the same authoritative D1 system.
- [x] The old PayPalMe/€1 device unlock and localStorage pass are removed.
- [x] KV compatibility mirroring is disabled by default.
- [x] A failed D1 write returns an explicit failure; no temporary browser post is shown as saved.

Operational proof still required:

- [ ] Apply `phase9_signal_board_persistence.sql` to production D1 with a Time Travel bookmark.
- [ ] Post from a verified account on one device and confirm the post appears on another device.
- [ ] Confirm refresh and redeployment do not remove the post.
- [ ] Confirm anonymous posting and reporting are rejected.
- [ ] Confirm all three board feeds remain isolated while the all-board exports remain complete.

## PayPal sandbox lifecycle acceptance

The timed sandbox rehearsal must prove Supporter €3, Intelligence Member €6 and Research Pro €9.

- [ ] Start an administrator-authorised rehearsal.
- [ ] Confirm checkout closes automatically outside the rehearsal window.
- [ ] Complete checkout with a PayPal sandbox buyer.
- [ ] Confirm versioned terms and withdrawal acknowledgements are written before PayPal opens.
- [ ] Confirm approval alone does not grant entitlement.
- [ ] Confirm verified ACTIVE state grants the exact selected tier.
- [ ] Confirm durable membership contract confirmation is delivered once.
- [ ] Confirm duplicate webhook delivery and duplicate activation are idempotent.
- [ ] Confirm failed payment, recovery, cancellation, expiry, refund and reversal states.
- [ ] Complete reconciliation and close the rehearsal with checkout disabled.

## Commercial and legal acceptance

Live checkout remains blocked until all of the following are verified and published:

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
- [x] Durable server-side checkout consent record.
- [x] Durable contract-confirmation email.
- [x] Live activation requires authenticated transactional email readiness.
- [x] `COMMERCIAL_LEGAL_READY=false` is the committed default.
- [ ] Controlled sandbox proof of contract-confirmation delivery.
- [ ] `COMMERCIAL_LEGAL_CONFIRMATION` installed only after legal verification.
- [ ] Explicit approval to change `COMMERCIAL_LEGAL_READY` to true.

## Activation boundaries

- `EMAIL_AUTOMATION_ENABLED` is true only for verified, consented and unsuppressed recipients.
- Daily and weekly send decisions are made from Europe/Paris local time inside the Worker.
- `EMAIL_TRANSACTIONAL_ENABLED` remains true only while authenticated delivery is healthy.
- Every campaign email must contain working personalised preference and unsubscribe routes.
- Signal Board posts must never be accepted as saved unless D1 confirms the write.
- `ENABLE_KV_COMPATIBILITY_MIRROR` remains false unless a controlled recovery operation explicitly enables it.
- `PAYPAL_ENVIRONMENT` remains `sandbox` until controlled live launch approval.
- `PAYPAL_PRODUCTION_ENABLED` remains false until the live payment phase.
- `COMMERCIAL_LEGAL_READY` remains false until commercial legal acceptance is complete.
- `COMMERCIAL_LEGAL_CONFIRMATION` must never be committed to GitHub.
- Every PayPal webhook must be verified before changing entitlement state.
- Live checkout must fail closed if consent, commercial readiness or durable contract-confirmation delivery is unavailable.

## Change control

This document is the canonical operating sequence. Briefing automation, Signal Board persistence and live charging have separate evidence requirements. Briefing email is authorised in its consent-controlled state; live PayPal charging remains unauthorised until its separate gates pass.
