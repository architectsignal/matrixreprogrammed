# Production Deploy Guard

Generated: 2026-08-02T13:22:43.138Z
Result: PASS
Expected SHA: 
Manifest SHA: 8e0338102cc89a1ae04dca64114cc6de0fcbb3e7
Health SHA: 8e0338102cc89a1ae04dca64114cc6de0fcbb3e7
Deployment mode: deployment-enabled
Deployment model: One manually confirmed canonical release is active. The fallback remains hard frozen and the dispatcher cannot mutate Cloudflare or D1 directly.
Rollback: The canonical release captures a validated Cloudflare D1 Time Travel bookmark before migrations with an exact restore command.
Release metadata: src/worker-release-metadata.js with exact runtime aliases republished at the final pre-Wrangler guard.
Forum storage: Cloudflare D1 is authoritative behind a strict fail-closed production Worker.
AI management: Cloudflare stores only zero-spend resource state and metadata-only routing decisions. Prompts and inference remain on the owner-controlled local machine.
Payments: PayPal runtime values are dashboard-managed and deployment-preserved; the Worker creates subscriptions and redirects to the official approval URL while checkout still requires credentials, the matching environment switch, D1 activation, live confirmation and three active plans.

## Hard Issues
- None
