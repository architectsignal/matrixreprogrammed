DEPLOY MATRIX REPROGRAMMED
Requested: 2026-07-25T21:23:00+02:00
Target: homepage intro v6 with both private MP4 chunks statically imported as Cloudflare Text modules
Authorization: one isolated Cloudflare production deployment of the corrected intro Worker with no competing recovery run
Required proof: forced replay homepage contains the v6 overlay and runtime, both video-part routes identify worker-bundled-payload, their combined response decodes to an MP4 with an ftyp header, packaged and live byte counts match, and the workflow commits the exact result
Purpose: complete the uncancelled deployment and remove the “Opening sequence unavailable” failure
Nonce: homepage-intro-text-modules-uncontested-20260725-2123-paris
