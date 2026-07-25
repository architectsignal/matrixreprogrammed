DEPLOY MATRIX REPROGRAMMED
Requested: 2026-07-25T21:38:00+02:00
Target: homepage intro v7 served as one direct Cloudflare Worker video/mp4 endpoint backed by Wrangler Text modules
Authorization: one isolated Cloudflare production deployment of the simplified intro Worker
Required proof: forced replay homepage loads the direct v7 runtime, /_matrix-intro.mp4 returns the exact 15,003-byte MP4 with video/mp4 headers and Range support, and the workflow commits full diagnostics with the SHA-matched result
Purpose: remove browser Base64 reconstruction, Blob playback, split-route assembly, asset fallback and CDN dependencies that caused “Opening sequence unavailable”
Nonce: homepage-intro-direct-mp4-v7-20260725-2138-paris
