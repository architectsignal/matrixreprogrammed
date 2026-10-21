# Autonomous Intelligence Machine — Phase 1.14

## Purpose

Phase 1.14 creates a separately signed, short-lived request for a later human token-issuance decision.

It does **not** create an execution token, bearer secret, capability credential, production write, Git action, deployment or publication action.

## Required upstream state

A request can be created only from an approved Phase 1.13 token decision that:

- is bound to the exact Phase 1.12 token request;
- contains an exact file preflight;
- contains an exact operation-scope review;
- reports no token issuance or execution authority;
- remains inside the Phase 1.12 and upstream authorisation windows.

The service re-verifies the complete signed ledger chain before creating a request.

## Last-moment checks

Immediately before signing the Phase 1.14 request, the service:

1. Reopens every candidate in read-only mode.
2. Recomputes SHA-256 and byte size.
3. Compares the result with the Phase 1.13 decision.
4. Reconstructs the permitted operations from the signed execution plan.
5. Recomputes the complete scope hash.
6. Requires exact equality with the Phase 1.12 request and Phase 1.13 decision.

Changed, missing, additional or differently scoped files fail closed.

## Validity window

The request duration must be between **10 and 60 seconds**. The default is 30 seconds.

A request:

- cannot outlive the Phase 1.12 token-request window;
- cannot outlive the upstream authorisation window;
- requires at least 10 seconds remaining when created;
- cannot be silently renewed after expiry;
- is idempotent only while an identical request remains active.

## Token boundary

Every request records:

```text
issuanceRequested: true
tokenMaterialIssued: false
tokenDigest: null
tokenId: null
bearerSecretIssued: false
credentialIssued: false
consumed: false
useCount: 0
maxUses: 1
```

It also requires:

```text
productionFilePath: null
productionDestinationResolved: false
finalDestinationConfirmed: false
readyForExecution: false
executionAuthorityGranted: false
authorisationGranted: false
tokenIssued: false
executionTokenAvailable: false
```

## Signed ledger

Requests are written only to the gitignored runtime ledger:

```text
.autonomous-machine/production-execution-token-issuance-requests.jsonl
```

Each record contains:

- canonical payload hash;
- record hash;
- previous-record hash;
- HMAC-SHA-256 signature;
- signing-key identifier;
- deterministic idempotency binding to the Phase 1.13 decision.

The signing secret is never stored.

## Operator command

```text
node scripts/autonomous-machine/run-phase1-request-execution-token-issuance.js request <token-decision-id> \
  --requester <name> \
  --role <role> \
  --note <reason> \
  --duration-seconds 30
```

Required new environment variable:

```text
AIM_EXECUTION_TOKEN_ISSUANCE_REQUEST_SIGNING_KEY
```

Optional key identifier:

```text
AIM_EXECUTION_TOKEN_ISSUANCE_REQUEST_SIGNING_KEY_ID
```

## Prohibited actions

Phase 1.14 cannot:

- create or expose token material;
- grant execution authority;
- resolve or modify production destinations;
- write to public pages or production data;
- stage or commit Git changes;
- deploy or publish;
- create a schedule or autonomous execution hook.

## Validation

The offline Phase 1.14 harness verifies signing-key strength, duration limits, active-window confinement, file drift, missing files, exact scope, upstream-ledger integrity, idempotency, conflict rejection, expiry, tamper detection and zero production, Git, deployment or publication actions.

## Next controlled increment

Phase 1.15 may add a separately signed human approval or rejection of the Phase 1.14 issuance request. Approval must perform another final preflight and still issue no bearer secret until a distinct issuance step exists.
