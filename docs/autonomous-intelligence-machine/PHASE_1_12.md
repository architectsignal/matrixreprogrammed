# Autonomous Intelligence Machine — Phase 1.12

## Purpose

Phase 1.12 creates a separately signed, short-lived request for a future single-use execution token. It does not create token material and does not grant execution authority.

The request is bound to the exact approved Phase 1.11 decision, final read-only file hashes, candidate repository paths and operation names inherited from the signed Phase 1.8 execution plan.

## Required upstream state

A request can be created only when:

- every upstream ledger verifies with its own signing key;
- the Phase 1.11 decision is an approval;
- the approval contains verified external backups and a successful disposable restore rehearsal;
- the upstream Phase 1.10 validity window is still active;
- the requested Phase 1.12 window fits entirely inside that upstream window;
- every candidate still matches the SHA-256 hash and byte size signed by Phase 1.11.

## Time and use limits

- Minimum request duration: 30 seconds.
- Maximum request duration: 300 seconds.
- Default request duration: 120 seconds.
- The request cannot outlive the Phase 1.10 authorisation window.
- It is marked for one future use only.
- Phase 1.12 cannot renew an expired request.

## Scope

The signed scope contains:

- exact candidate repository paths;
- exact final SHA-256 hashes and byte sizes;
- target identifiers;
- the operation `manual_review_and_integrate_evidence` inherited from the signed plan;
- a deterministic scope hash.

These are candidate references, not confirmed production destinations. Every scoped operation remains `executionAllowed: false` and `productionWriteAllowed: false`.

## No token material

Every request records:

```text
tokenMaterialIssued: false
tokenDigest: null
tokenId: null
consumed: false
useCount: 0
maxUses: 1
```

No bearer secret, capability token, credential or executable authorisation is generated.

## Runtime storage

Requests are stored only in the gitignored runtime ledger:

```text
.autonomous-machine/production-execution-token-requests.jsonl
```

Each record uses HMAC-SHA-256, a canonical payload hash, a record hash and previous-record hash chaining. Identical active requests are idempotent. Conflicting or expired requests fail closed.

## Safety boundary

Every Phase 1.12 record requires:

```text
productionFilePath: null
productionDestinationResolved: false
finalDestinationConfirmed: false
readyForExecution: false
executionAuthorityGranted: false
authorisationGranted: false
tokenIssued: false
executionTokenAvailable: false
productionWriteAllowed: false
executionAllowed: false
commitAllowed: false
deploymentAllowed: false
publicationAllowed: false
```

Phase 1.12 performs no production write, Git operation, deployment or publication action.

## Manual command

```text
node scripts/autonomous-machine/run-phase1-request-execution-token.js request <authorisation-decision-id> \
  --requester <name> \
  --role <role> \
  --note <reason> \
  --duration-seconds 120
```

The seven upstream and Phase 1.12 signing keys must be provided through environment variables. Signing secrets are never written to the ledger.

## Next controlled step

A later Phase 1.13 may add a separately signed human approval or rejection of the token request. Any approval must perform one final preflight, remain narrowly scoped and still issue no executable token until a distinct issuance step.
