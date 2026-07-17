# Matrix Reprogrammed — PayPal and Email Launch Master Plan

Status: LOCKED CANONICAL LAUNCH SEQUENCE
Owner: Matrix Reprogrammed
Timezone: Europe/Paris
Updated: 2026-07-17

## Governing rule

Do not activate automated marketing email or live PayPal checkout until every preceding phase has passed its acceptance checks. Free Member access retains the same underlying public-source evidence as paid tiers. Paid tiers add service, organisation, monitoring, exports and research tools.

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
11. Automated newsletter activation
12. PayPal Business and Developer preparation
13. PayPal sandbox credentials and webhook
14. Sandbox product and plan bootstrap
15. Sandbox checkout activation
16. Full sandbox payment test matrix
17. Production deployment and PayPal activation-state fix
18. Legal, tax and commercial readiness
19. PayPal live application and plans
20. Controlled live payment activation
21. Post-launch monitoring and reconciliation

## Phase 1 — Production stability

### Required outcomes

- All major GitHub workflows green.
- Current main branch deployed successfully to Cloudflare.
- Critical public, member, billing, newsletter and administration routes return valid responses.
- Automated newsletter sending disabled until email acceptance testing is complete.
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

### Critical routes

- /membership.html
- /member-login.html
- /member-dashboard.html
- /billing-dashboard.html
- /admin-payment-dashboard.html
- /newsletter.html
- /subscriber-dashboard.html
- /email-status.html
- /api/email/admin/health
- /api/paypal/admin/health
- /forum-health

### Phase 1 acceptance record

- [ ] Current main commit identified
- [ ] Email automation disabled in production configuration
- [ ] Full build passes
- [ ] Functional/tool audit passes
- [ ] Link audit passes
- [ ] Site Pressure Test passes
- [ ] Site QA passes
- [ ] Production Deploy passes
- [ ] Cloudflare live SHA matches main
- [ ] Critical route verification passes
- [ ] D1 health passes
- [ ] KV traffic remains within limits

## Activation boundaries

- PAYPAL_ENVIRONMENT remains sandbox until live launch approval.
- PAYPAL_PRODUCTION_ENABLED remains false until Phase 20.
- PayPal D1 checkout switches remain disabled until the relevant activation phase.
- EMAIL_AUTOMATION_ENABLED remains false until Phase 11.
- Brevo and PayPal secrets must never be committed to GitHub.
- Every marketing email must contain working personalised preference and unsubscribe routes.
- Every PayPal webhook must be verified before changing entitlement state.

## Change control

This document is the canonical order of work. New work may add acceptance checks, but phases must not be skipped or reordered without an explicit recorded decision.