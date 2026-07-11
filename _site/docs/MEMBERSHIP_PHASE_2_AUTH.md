# Matrix Reprogrammed Membership — Phase 2 Authentication

Phase 2 adds email verification and passwordless member login. PayPal and paid entitlements remain disabled.

## Implemented routes

- `POST /api/membership/signup` — stores the member and consent, then requests a verification email.
- `POST /api/auth/request-link` — sends a generic one-time verification or login link when an account exists.
- `GET /api/auth/verify` — consumes a single-use token, verifies the account when required, creates a secure session and redirects to the dashboard.
- `POST /api/auth/logout` — revokes the server-side session and clears the browser cookie.
- `GET /api/member/me` — returns the authenticated member's safe account and subscription summary.
- `GET /api/auth/health` — reports D1/auth schema and transactional-email configuration without personal data.

## Security model

- Raw magic-link and session tokens are never stored.
- D1 stores SHA-256 hashes only.
- Magic links expire after 15 minutes and become invalid after one use.
- Sessions expire after 30 days and can be revoked server-side.
- Session cookies are `HttpOnly`, `Secure`, `SameSite=Lax`, and scoped to `/`.
- Login-link responses do not reveal whether an email exists.
- Paid access remains `false` until PayPal webhook verification is built.

## Transactional email provider

The Worker uses Brevo's transactional email endpoint:

```text
POST https://api.brevo.com/v3/smtp/email
```

Required Cloudflare Worker secrets/variables:

```text
BREVO_API_KEY
MEMBERS_FROM_EMAIL
MEMBERS_FROM_NAME
```

`BREVO_API_KEY` must be a secret. The sender address must be verified in Brevo before delivery can succeed.

Do not commit or paste the API key into source code, GitHub issues, documentation or chat.

## Current evidence boundary

The authentication backend can deploy and report healthy without email delivery configured, but signup will truthfully report `emailSent: false`. The system is not fully usable by members until Brevo is connected and a live verification email is successfully received and consumed.
