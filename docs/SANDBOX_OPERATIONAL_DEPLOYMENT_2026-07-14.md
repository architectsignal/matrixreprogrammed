# Sandbox Operational Deployment — 2026-07-14

This commit requests a clean production deployment of the current `main` branch after the Search V3 Cloudflare asset-size correction.

Required deployment state:

- Member registration and passwordless login deployed.
- Member dashboard deployed.
- Billing dashboard deployed.
- Payment administration dashboard deployed.
- PayPal sandbox rehearsal control room deployed.
- D1 migrations through Phase 8 applied idempotently.
- Sandbox PayPal products and plans verified at EUR 3, EUR 6 and EUR 9.
- Sandbox capability enabled.
- Sandbox checkout closed unless an administrator opens a timed rehearsal.
- Production PayPal charging disabled.
- Live charging must not be enabled by this deployment.

Expected configuration:

```text
PAYPAL_ENVIRONMENT=sandbox
PAYPAL_SANDBOX_ENABLED=true
PAYPAL_PRODUCTION_ENABLED=false
```

The canonical GitHub Actions workflow remains responsible for D1 backup, migration, build, Cloudflare deployment, route verification and production proof artifacts.
