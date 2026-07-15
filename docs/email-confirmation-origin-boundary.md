# Authoritative email confirmation redirects

Newsletter verification, resubscription, unsubscribe and email-action error routes are handled by `src/worker-email-lifecycle.js` and validated by `src/worker-production.js`.

Every response from the email lifecycle subsystem, including HTTP 303 redirects, must include:

```text
X-Matrix-Origin: cloudflare-worker-email-lifecycle
```

Without that header, the production boundary deliberately returns `non-authoritative-email-response-blocked` instead of accepting a legacy, static or incorrectly routed response.

The Cloudflare route contract checks the shared redirect helper so all email-action redirects retain the authoritative origin identity.
