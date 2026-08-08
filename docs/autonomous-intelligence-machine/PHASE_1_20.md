# Autonomous Intelligence Machine — Phase 1.20

## Purpose

Phase 1.20 creates a separately signed, short-lived **entropy-source-selection request** from an approved Phase 1.19 entropy-generation decision.

It is a request record only. It does not select a provider, call an entropy API, request random bytes, produce entropy, create credentials, modify production, stage or commit Git changes, deploy or publish.

## Preconditions

The request service verifies all supplied upstream ledgers plus the Phase 1.18 entropy-request ledger, the Phase 1.19 entropy-decision ledger and the Phase 1.20 request ledger.

The Phase 1.19 decision must:

- be approved;
- remain non-executing;
- contain no entropy source, output or digest;
- retain a complete final candidate preflight;
- retain an exact scope review;
- remain bound to the exact Phase 1.18 request.

## Fresh candidate verification

Before a request is recorded, Phase 1.20 reads every candidate again and verifies its SHA-256 hash and byte size against the signed Phase 1.19 decision.

Changed, missing or unscoped candidates fail closed.

## Source-selection boundary

The request may describe only a constrained future selection policy:

```text
selectionRequested: true
permittedSourceClasses:
  - operating_system_csprng
requestedSourceClass: null
entropySourceSelected: false
entropySource: null
providerSelected: false
providerName: null
networkSourceAllowed: false
externalProviderAllowed: false
entropyBytesRequested: 0
```

The permitted class is a review constraint, not a selected source. No provider name, operating-system API or entropy implementation is chosen.

The request also permanently requires:

```text
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

## Validity window

- Minimum duration: 2 seconds
- Maximum duration: 10 seconds
- Default duration: 6 seconds
- Minimum remaining Phase 1.18 window: 2 seconds
- The request cannot outlive the signed entropy-generation request.
- An expired request cannot be silently renewed.

## Signed ledger

Requests are stored only in excluded runtime state:

```text
.autonomous-machine/production-execution-entropy-source-selection-requests.jsonl
```

Each record includes:

- HMAC-SHA-256 signature;
- canonical payload hash;
- record hash;
- previous-record hash chaining;
- timing-safe signature verification;
- deterministic idempotency;
- rejection of conflicting requests.

The signing key is never stored.

## Execution boundary

Every Phase 1.20 request requires:

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

## Run the safety test

```bash
AIM_PUBLICATION_MODE=disabled node scripts/autonomous-machine/phase1.20-self-test.js
```

The test covers weak signing keys, invalid durations, file drift, missing files, exact scope, conflicting and expired requests, invalid upstream ledgers, payload tampering, attempted provider selection, attempted entropy-byte requests and zero production, Git, deployment or publication actions.

## Manual command

```bash
AIM_EXECUTION_ENTROPY_SOURCE_SELECTION_REQUEST_SIGNING_KEY='<secret>' \
node scripts/autonomous-machine/run-phase1-request-entropy-source-selection.js \
request <entropy-decision-id> \
--requester '<name>' \
--role '<role>' \
--note '<reason>' \
--duration-seconds 6
```

All upstream signing keys are also required. The command creates only a signed request record.

## Next controlled step

Phase 1.21 may add a separately signed human approval or rejection of the source-selection request. Even approval must keep the provider and source unselected and must produce no entropy output until a distinct source-selection execution step exists.
