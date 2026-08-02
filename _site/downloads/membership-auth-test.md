# Membership Authentication Test

Generated: 2026-08-02T12:52:34.322Z
Result: PASS

- PASS: signup persists pending member and sends verification email
- PASS: verification email contains one-time link
- PASS: raw verification token is never stored
- PASS: verification activates member and creates secure cookie
- PASS: authenticated member identity endpoint returns safe account data
- PASS: verification link is single-use
- PASS: logout revokes server session and clears cookie
- PASS: revoked session cannot access member identity
- PASS: login request response does not reveal account existence
- PASS: verified member can create a new passwordless session
- PASS: invalid magic token is rejected safely
- PASS: auth health proves D1 schema and email configuration without PII
- PASS: member persistence stays truthful when email provider is absent
- PASS: Worker contains membership-auth-v1:
- PASS: Worker contains crypto.subtle.digest('SHA-256'
- PASS: Worker contains api.brevo.com/v3/smtp/email
- PASS: Worker contains originalPath==='/api/auth/request-link'
- PASS: Worker contains originalPath==='/api/auth/verify'
- PASS: Worker contains originalPath==='/api/auth/logout'
- PASS: Worker contains originalPath==='/api/member/me'