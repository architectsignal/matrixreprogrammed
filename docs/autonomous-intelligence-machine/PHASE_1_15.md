# Phase 1.15 — Signed Human Token-Issuance Decisions

Phase 1.15 adds a separately signed human approval or rejection for each Phase 1.14 token-issuance request. It remains a decision-record layer only.

## Approval requirements

Approval requires:

- an active Phase 1.14 request with at least five seconds remaining;
- the request to remain inside both the Phase 1.12 token-request window and the upstream authorisation window;
- completed issuance-window, final-preflight, exact-scope, backup-evidence, restore-evidence and production-owner reviews;
- another read-only SHA-256 and byte-size check for every candidate;
- exact reconstruction of target IDs, operations, candidate paths and hashes from the signed execution plan;
- successful verification of every upstream signed ledger and binding.

Rejection does not perform candidate preflight and grants no authority.

## Signed ledger

Records are stored only in the excluded runtime area:

```text
.autonomous-machine/production-execution-token-issuance-decisions.jsonl
```

Set a distinct signing key:

```text
AIM_EXECUTION_TOKEN_ISSUANCE_DECISION_SIGNING_KEY
```

The key must contain at least 32 bytes. It is never stored in the ledger.

## Permanent safety boundary

Even an approved record requires:

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
tokenIssued: false
executionTokenAvailable: false
productionFilePath: null
productionDestinationResolved: false
finalDestinationConfirmed: false
readyForExecution: false
executionAuthorityGranted: false
authorisationGranted: false
productionWriteAllowed: false
executionAllowed: false
commitAllowed: false
deploymentAllowed: false
publicationAllowed: false
```

The approval points only to a later, separate token-material generation request and execution firebreak. Phase 1.15 cannot generate a bearer secret, capability credential or executable token.

## Manual command

```bash
node scripts/autonomous-machine/run-phase1-review-execution-token-issuance.js list
node scripts/autonomous-machine/run-phase1-review-execution-token-issuance.js show <decision-or-request-id>
node scripts/autonomous-machine/run-phase1-review-execution-token-issuance.js decide <request-id> approve \
  --reviewer "reviewer name" \
  --role "production owner" \
  --note "reason for approval" \
  --all-reviews-complete
node scripts/autonomous-machine/run-phase1-review-execution-token-issuance.js verify
```

Nothing is scheduled. Nothing is applied, committed, deployed or published.
