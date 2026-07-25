DEPLOY MATRIX REPROGRAMMED
Requested: 2026-07-25T21:17:00+02:00
Target: homepage intro v6 with the complete MP4 payload embedded directly inside the Cloudflare Worker bundle
Authorization: one isolated Cloudflare production deployment of the corrected intro Worker
Required proof: forced replay homepage contains the v6 overlay and runtime, both video-part routes identify worker-bundled-payload, their combined response decodes to an MP4 with an ftyp header, packaged and live byte counts match, and the workflow commits the exact result
Purpose: run the corrected generated-payload assertion and permanently remove the dependency that displayed “Opening sequence unavailable”
Nonce: homepage-intro-worker-bundled-payload-corrected-20260725-2117-paris
