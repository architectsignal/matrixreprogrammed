DEPLOY MATRIX REPROGRAMMED
Requested: 2026-07-25T21:34:00+02:00
Target: homepage intro v6 with both MP4 chunks statically imported as Cloudflare Wrangler Text modules
Authorization: one isolated Cloudflare production deployment of the corrected intro Worker with a clean, pushable verification receipt
Required proof: forced replay homepage contains the v6 overlay and runtime, both video-part routes identify worker-bundled-payload, their combined response decodes to an MP4 with an ftyp header, packaged and live byte counts match, and the workflow commits the SHA-matched result
Purpose: deploy the direct Text-module payload and eliminate both the “Opening sequence unavailable” failure and the dirty-worktree receipt failure
Nonce: homepage-intro-text-modules-clean-receipt-20260725-2134-paris
