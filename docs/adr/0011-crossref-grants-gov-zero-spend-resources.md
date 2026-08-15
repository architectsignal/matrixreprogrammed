# ADR 0011: Crossref and Grants.gov zero-spend public resources

Status: accepted for controlled release

Date: 2026-08-14

## Decision

Add Crossref's anonymous public metadata pool and Grants.gov's unauthenticated `search2` endpoint to the Opportunity Hunter defaults. Both remain behind the existing live documentation, terms, health, quota, zero-spend and billing-risk evaluation. Admission uses only `zero-spend-opportunity-public-http` and public data.

Grants.gov publishes documentation on `www.grants.gov` but executes searches on `api.grants.gov`. A new `metadata.execution_url` boundary is therefore accepted only when it is HTTPS, credential-free and in the same registrable host family as the official page. The resource allowlist contains the execution host, not an arbitrary submitted host.

Crossref is limited to metadata responses. Matrix must not automatically follow full-text links because publisher access, licence and copyright rules can differ from Crossref metadata terms.

## Operational limits

- Crossref: concurrency 1 and an operator cap of 100 requests per day, below the published anonymous public-pool rate.
- Grants.gov: concurrency 1 and an operator cap of 50 requests per day. This is a Matrix safety cap, not a claimed provider quota.
- Provider `429` responses require backoff; no paid pool, account, key or fallback may be selected automatically.
- Grants listings are discovery leads only. They are not eligibility, entitlement, awards, or authority to submit applications.

## Rejected alternatives

- Do not enable account/key-dependent services merely because they have a free tier.
- Do not infer full-text reuse rights from Crossref metadata.
- Do not allow execution hosts outside the verified official host family.
- Do not treat a Matrix operator cap as provider-issued quota evidence.

## Proof

Opportunity Hunter tests cover exact default seeds, same-family execution-host admission, unrelated-host rejection, no-auth language, public-only routing, POST support, host allowlisting and fail-closed billing/account/credential checks.
