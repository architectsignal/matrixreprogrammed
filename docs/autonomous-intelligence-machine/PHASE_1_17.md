# Autonomous Intelligence Machine — Phase 1.17

Phase 1.17 adds separately signed human approval or rejection of a Phase 1.16 token-material-generation request.

## Boundary

This phase records a decision only. It does not generate entropy, token bytes, a digest, identifier, credential, bearer secret or executable capability. It cannot modify production files, stage or commit Git changes, deploy or publish.

An approval requires:

- an active Phase 1.16 request with at least three seconds remaining;
- all seven reviews complete, including an explicit entropy-boundary review;
- another read-only SHA-256 and byte-size check for every candidate;
- exact reconstruction of the signed target and operation scope;
- verification of every upstream signed ledger and binding.

Rejection can be recorded without a file preflight and grants no authority.

## Runtime state

Signed decisions are stored only in:

`.autonomous-machine/production-execution-token-material-generation-decisions.jsonl`

The ledger is append-only, HMAC-SHA-256 signed and hash chained. Identical decisions are idempotent. Conflicting decisions fail closed.

## Mandatory safety state

Even an approved decision requires:

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
productionFilePath: null
productionDestinationResolved: false
finalDestinationConfirmed: false
readyForExecution: false
executionAuthorityGranted: false
authorisationGranted: false
tokenIssued: false
executionTokenAvailable: false
```

## Manual command

```bash
node scripts/autonomous-machine/production-execution-token-material-generation-decision.js decide <request-id> approve \
  --reviewer <name> --role <role> --note <reason> --all-reviews-complete
```

The signing secret is supplied through `AIM_EXECUTION_TOKEN_MATERIAL_GENERATION_DECISION_SIGNING_KEY` and is never stored.
