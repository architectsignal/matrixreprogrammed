# Autonomous Intelligence Machine — Phase 1.18

## Purpose

Phase 1.18 creates a separately signed, short-lived **entropy-generation request** from an approved Phase 1.17 token-material-generation decision.

It remains a request record only. It does not choose an entropy source, request entropy bytes from the operating system, generate random output, create token material, resolve a production destination, edit a file, commit, deploy or publish.

## Preconditions

The request service verifies the complete signed chain from the Phase 1.6 change request through the Phase 1.17 generation decision. The Phase 1.17 decision must be approved, exact, non-executing and explicitly record that no entropy or secret material exists.

Before creating a request, Phase 1.18:

1. Re-verifies every upstream signed ledger.
2. Re-validates the application, target and plan bindings.
3. Reads every candidate in read-only mode.
4. Recalculates each SHA-256 hash and byte size.
5. Reconstructs the approved operation scope from the signed plan.
6. Requires exact agreement with the Phase 1.17 decision.

## Time boundary

- Minimum duration: **3 seconds**
- Maximum duration: **15 seconds**
- Default duration: **9 seconds**
- Minimum remaining upstream window: **3 seconds**

The request cannot outlive the Phase 1.16 generation request, Phase 1.14 issuance request, Phase 1.12 token request or Phase 1.10 authorisation window. An expired request cannot be renewed silently.

## Entropy boundary

Every request must record:

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
```

The schema rejects any request that selects a source, requests bytes, stores entropy output or claims secret material was created.

## Execution boundary

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

## Runtime ledger

Requests are stored only in the gitignored runtime file:

```text
.autonomous-machine/production-execution-entropy-generation-requests.jsonl
```

The ledger is HMAC-SHA-256 signed, append-only and hash chained. Identical active requests are idempotent. Conflicting requests and renewal after expiry fail closed.

## Validation

Run:

```bash
AIM_PUBLICATION_MODE=disabled node scripts/autonomous-machine/phase1.18-self-test.js
```

The isolated harness verifies signing keys, duration limits, active-window confinement, file drift, missing files, exact scope, upstream-ledger failure, idempotency, conflict rejection, expiry, tamper detection and zero production, Git, deployment or publication actions.

## Manual command

```bash
node scripts/autonomous-machine/run-phase1-request-entropy-generation.js request <generation-decision-id> \
  --requester "Reviewer name" \
  --role "Production owner" \
  --note "Request a separate entropy-generation review without entropy output or execution authority." \
  --duration-seconds 9
```

The command requires all upstream signing keys plus `AIM_EXECUTION_ENTROPY_GENERATION_REQUEST_SIGNING_KEY`.

## Next controlled step

Phase 1.19 may add a separately signed human approval or rejection of this entropy-generation request. Approval must still produce no entropy output until a distinct generation step exists.
