# Autonomous Intelligence Machine — Phase 1.19

## Purpose

Phase 1.19 creates a separately signed human approval or rejection of a Phase 1.18 entropy-generation request.

It remains a decision record only. Approval does not select an entropy source, request random bytes, generate entropy output, create token material, grant execution authority, edit production files, commit, deploy or publish.

## Preconditions

The decision service verifies:

1. Every supplied upstream signed ledger.
2. The complete Phase 1.18 entropy-request ledger.
3. The existing Phase 1.19 decision ledger.
4. The exact entropy-request record selected for review.
5. The request's signed candidate and operation scope.

Approval requires the request to remain active with at least two seconds remaining.

## Mandatory approval reviews

All eight reviews must be explicitly complete:

- entropy-request window;
- final candidate preflight;
- exact target and operation scope;
- entropy-source boundary;
- no-output boundary;
- backup evidence;
- restore evidence;
- production-owner review.

Rejection may be recorded after expiry and performs no file preflight.

## Final read-only preflight

Approval reopens each signed candidate in read-only mode and compares its current SHA-256 hash and byte size with the Phase 1.18 request. A changed or missing candidate blocks approval.

The service reconstructs the operation scope from the signed request. Unknown paths, altered operations, changed hashes, incomplete candidate coverage or scope-hash drift fail closed.

## Entropy boundary

Every decision requires:

```text
generationRequested: true
entropySourceSelected: false
entropySource: null
entropyBytesRequested: 0
entropyGenerated: false
entropyOutput: null
entropyDigest: null
tokenMaterialGenerated: false
tokenMaterialIssued: false
tokenDigest: null
tokenId: null
bearerSecretGenerated: false
bearerSecretIssued: false
credentialGenerated: false
credentialIssued: false
consumed: false
useCount: 0
maxUses: 1
```

No operating-system random generator or cryptographic entropy provider is invoked.

## Execution boundary

Every decision also requires:

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

An approved decision can only point to a later, separately reviewed entropy-source-selection request. It cannot perform that step.

## Signed ledger

Decisions are stored in excluded runtime state:

```text
.autonomous-machine/production-execution-entropy-generation-decisions.jsonl
```

The ledger uses HMAC-SHA-256 signatures, canonical payload hashes, record hashes and previous-record hash chaining. Identical decisions are idempotent. A conflicting second decision for the same request is rejected.

## Manual command

```bash
AIM_PUBLICATION_MODE=disabled \
AIM_EXECUTION_ENTROPY_GENERATION_REQUEST_SIGNING_KEY='...' \
AIM_EXECUTION_ENTROPY_GENERATION_DECISION_SIGNING_KEY='...' \
node scripts/autonomous-machine/production-execution-entropy-generation-decision.js \
  decide <entropy-request-id> approve \
  --reviewer '<name>' \
  --role '<role>' \
  --note '<reason>' \
  --all-reviews-complete
```

All upstream signing keys are also required for a real decision because their ledgers are re-verified.

## Test

```bash
AIM_PUBLICATION_MODE=disabled node scripts/autonomous-machine/phase1.19-self-test.js
```

The isolated harness covers weak keys, incomplete reviews, approval, rejection, expiry, changed or missing candidates, scope drift, upstream-ledger failure, idempotency, conflicting decisions and tamper detection.

## Next controlled step

Phase 1.20 may create a separately signed entropy-source-selection request. It must still select no source and produce no entropy output until a distinct generation step exists.