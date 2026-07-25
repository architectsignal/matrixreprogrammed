DEPLOY MATRIX REPROGRAMMED
Requested: 2026-07-25T21:20:00+02:00
Target: homepage intro v6 with both private MP4 chunks statically imported as Cloudflare Text modules
Authorization: one isolated Cloudflare production deployment of the corrected intro Worker
Required proof: forced replay homepage contains the v6 overlay and runtime, both video-part routes identify worker-bundled-payload, their combined response decodes to an MP4 with an ftyp header, packaged and live byte counts match, and the workflow commits the exact result
Purpose: eliminate the empty generated-module placeholder and remove the “Opening sequence unavailable” failure
Nonce: homepage-intro-direct-text-modules-20260725-2120-paris
