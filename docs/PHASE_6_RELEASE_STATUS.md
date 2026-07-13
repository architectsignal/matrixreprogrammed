# Phase 6 Release Status

- Phases 0–5 are merged into `main`.
- Phase 6 is tested on top of the merged Phase 5 base.
- The PayPal state-machine suite passes all 15 stages.
- Registered membership remains free.
- Paid monthly tiers remain locked at €3, €6 and €9.
- PayPal secrets remain stored in Cloudflare.
- Cloudflare is the authoritative production platform.
- Netlify is disabled and serves only a no-index compatibility placeholder.
- No live PayPal charge or production D1 migration is performed by CI.
- Sandbox and production checkout remain disabled until controlled activation.
