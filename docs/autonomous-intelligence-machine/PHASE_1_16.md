# Autonomous Intelligence Machine — Phase 1.16

## Purpose

Phase 1.16 creates a separately signed, short-lived request for a future token-material-generation review. It is another execution firebreak after an approved Phase 1.15 token-issuance decision.

It does **not** generate entropy, token material, a token identifier, a digest, a credential or a bearer secret. It cannot execute a production operation.

## Required upstream state

The request service verifies the complete signed chain and requires:

- an approved Phase 1.15 issuance decision;
- an approved and non-executing Phase 1.13 token decision;
- the exact Phase 1.14 issuance request;
- approved plan, authorisation and change decisions;
- unchanged application and route bindings;
- valid backup and restore evidence hashes inherited from the signed chain;
- exact candidate and execution-step snapshots.

Every upstream ledger is verified before a new request is considered.

## Validity window

A request:

- lasts between 5 and 30 seconds;
- defaults to 15 seconds;
- requires at least 5 seconds remaining in every signed parent window;
- cannot outlive the Phase 1.14 issuance request;
- cannot outlive the Phase 1.12 token request;
- cannot outlive the upstream execution authorisation;
- cannot be silently renewed after expiry.

An identical active request is idempotent. A conflicting request fails closed.

## Final preflight

Before writing the signed request record, Phase 1.16:

1. Reads each candidate file without write access.
2. Recalculates SHA-256 and byte size.
3. Compares the result with the Phase 1.15 signed decision.
4. Reconstructs the exact operation scope from the signed execution plan.
5. Requires every candidate and operation to match all previous signed scope hashes.

Changed files, missing files, stale bindings, altered operations or incomplete candidate coverage block the request.

## Non-secret generation state

Every record requires:

```text
generationRequested: true
entropyGenerated: false
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

The schema rejects a record that contains generated or issued secret material.

## Authority boundary

Every record also requires:

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

The only permitted next action is a separately signed human approval or rejection of this request. Phase 1.16 cannot create that decision, generate a secret, edit a production file, stage or commit Git changes, deploy or publish.

## Runtime storage

Signed requests are stored only in the gitignored runtime ledger:

```text
.autonomous-machine/production-execution-token-material-generation-requests.jsonl
```

The ledger uses HMAC-SHA-256 signatures, canonical payload hashes, record hashes, previous-record hash chaining and timing-safe signature verification. Signing keys are never stored in the ledger.

## Operator command

```text
node scripts/autonomous-machine/run-phase1-request-token-material-generation.js list
node scripts/autonomous-machine/run-phase1-request-token-material-generation.js show <request-id-or-issuance-decision-id>
node scripts/autonomous-machine/run-phase1-request-token-material-generation.js request <issuance-decision-id> --requester <name> --role <role> --note <reason> --duration-seconds 15
node scripts/autonomous-machine/run-phase1-request-token-material-generation.js verify
```

The command requires a separate `AIM_EXECUTION_TOKEN_MATERIAL_GENERATION_REQUEST_SIGNING_KEY` in addition to the upstream signing keys.

## Validation

The isolated Phase 1.16 harness covers:

- weak signing keys;
- duration boundaries;
- requester validation;
- last-moment file drift and missing files;
- exact scope reconstruction;
- upstream ledger failure;
- idempotency and conflicting requests;
- expiry and window confinement;
- ledger tampering;
- mutation attempts that claim token material was generated;
- zero production, Git, deployment and publication actions.
