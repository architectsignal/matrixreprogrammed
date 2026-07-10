# Matrix Reprogrammed Membership — Phase 1 Setup

Phase 1 installs the member-data foundation without taking payments.

## What the repository now provides

- Cloudflare D1 schema for members, consent, sessions, magic links, PayPal subscriptions, webhook events and audit history.
- `POST /api/membership/signup` with explicit-consent enforcement.
- D1-first storage with the existing `FORUM_POSTS` KV namespace retained only as a temporary compatibility fallback.
- `GET /api/membership/health`, which returns counts and storage health but no personal data.
- `GET /api/admin/members`, protected by `ADMIN_API_TOKEN`.
- The old `/newsletter-subscribers.json` route is also protected and returns 404 when no administrator secret is configured.
- Signups remain `pending-verification` until the email-verification step is built.

## One-time Cloudflare action

Create the database from a terminal authenticated to the correct Cloudflare account:

```bash
npx wrangler@latest d1 create matrix-members
```

Cloudflare will return a database ID. Add this block to `wrangler.toml` using the real ID:

```toml
[[d1_databases]]
binding = "MEMBERS_DB"
database_name = "matrix-members"
database_id = "PASTE_THE_REAL_DATABASE_ID_HERE"
```

Do not add a placeholder ID to production `wrangler.toml`; deployment should only be changed after the real database exists.

## Apply the schema

```bash
npx wrangler@latest d1 execute matrix-members --remote --file=./migrations/0001_membership_foundation.sql
```

For a local test database:

```bash
npx wrangler@latest d1 execute matrix-members --local --file=./migrations/0001_membership_foundation.sql
```

## Create the administrator API secret

Generate a long random value and store it directly in Cloudflare:

```bash
npx wrangler secret put ADMIN_API_TOKEN
```

Do not place the value in GitHub, HTML, browser JavaScript, documentation or chat.

Administrator member-list requests use:

```text
GET /api/admin/members
x-admin-token: <secret value>
```

This header is an interim API safeguard. The later admin-dashboard phase will place `/admin/*` behind Cloudflare Access and administrator sessions.

## Repository validation

The deployment chain runs these automatically:

```bash
node scripts/patch-worker-newsletter-system.js
node scripts/newsletter-persistence-test.js
```

The newsletter patch now chains the D1 membership patch. The persistence test executes the full membership foundation test.

Direct tests:

```bash
node scripts/patch-worker-membership-foundation.js
node scripts/membership-foundation-test.js
```

Generated reports:

```text
downloads/membership-foundation-patch-report.json
downloads/membership-foundation-test.json
downloads/membership-foundation-test.md
downloads/newsletter-persistence-test.json
downloads/newsletter-persistence-test.md
```

## Current evidence boundary

Phase 1 stores pending member records and explicit consent. It does not yet:

- send verification emails;
- create login sessions;
- activate paid membership;
- process PayPal subscriptions;
- expose the member dashboard;
- send newsletters from the site.

Those are separate controlled phases. No paid access should be advertised as operational until the PayPal webhook and entitlement tests pass.
