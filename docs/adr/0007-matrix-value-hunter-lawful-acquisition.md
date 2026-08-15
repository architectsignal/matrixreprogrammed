# ADR 0007: Matrix Value Hunter lawful acquisition cycle

- Status: Accepted for guarded production rollout
- Date: 2026-08-13

## Context

Matrix already discovers zero-cost compute and information resources, but it did not distinguish a financial lead from a legal entitlement or provide a safe collection path. “Unclaimed,” abandoned, technically accessible, or apparently ownerless value is not automatically available to Matrix. Most such assets retain an owner, beneficiary or heir, or are held by an official custodian. Financial actions also introduce destination, fee, signing, duplicate and malicious-asset risks that ordinary resource activation does not cover.

The owner supplied a standing mandate to acquire lawful value automatically and set the first measured milestone at EUR 10,000 net received. A claimant may be the Matrix operating entity, the owner, another represented person or entity, or a named beneficiary. The mandate does not change legal ownership or authorize false documents, bypasses, blind signing, unknown destinations, new contracts, or acceptance of provider terms.

## Decision

1. Treat discovery, entitlement and collection as separate stages. Official public pages can generate `DISCOVERED` leads; no lead becomes collectible until claimant authority, identity match and deterministic entitlement evidence are all proven.
2. Use the strict Value Hunter states in the owner specification, including `ENTITLEMENT_UNCERTAIN`, `AUTOMATION_NOT_PERMITTED`, `OWNER_APPROVAL_REQUIRED`, `NOT_OURS` and `FRAUD_BLOCKED`. LLM confidence is never legal proof.
3. Record a standing mandate that automatically collects any proven legal entitlement held by a registered authorized claimant when current jurisdiction and provider rules permit automation. There is no additional owner pause merely because ordinary collection is consequential.
4. Surface only genuinely unavoidable human/legal steps: KYC, signature, notarization, CAPTCHA, tax declaration, account creation, new terms, a new contract, an unknown destination, an unapproved fee or a provider-mandated manual submission.
5. Classify unknown ownership as `NOT_OURS`. `lawful_appropriation` requires an official ownerless determination; `statutory_finder_award` requires an official award rule. Unclaimed or abandoned status alone proves neither.
6. Permit only `CLAIM_REWARD`, `SWEEP_RECEIVED_ASSET` and `WITHDRAW_OWNED_BALANCE` financial intents. A financial firewall requires an approved destination and provider adapter, exact fee limits, contract allowlisting where applicable, idempotency and current terms. Private keys, seed phrases, arbitrary calls, blind signing and unlimited approvals are forbidden.
7. Store only identity and destination vault references plus public-identifier hashes in D1. Never store raw identity records, banking details, private keys, seeds or signing secrets in source, D1, logs, events or prompts.
8. Run bounded daily discovery over allowlisted official hosts. Same-domain link extraction creates internal leads only. Current seeds cover official unclaimed-property routes plus UK, EU and France grant/funding portals. Applications remain manual when the official process requires accounts, declarations, proposals or human attestations.
9. Learn priority from measured, reconciled receipts: historical success, net value per evaluation and evidence strength can change ordering. Learning cannot weaken entitlement, jurisdiction, terms, fee, destination or signing gates and cannot modify code or policy.
10. Count the EUR 10,000 milestone only from reconciled EUR receipts. Discovered value, advertised award ceilings, pending claims and other currencies do not count without a governed conversion and receipt.
11. Add Value Hunter events to the shared Matrix spine and run Value Hunter before the Living Matrix projection cycle using the existing schedule.
12. Execute every `READY_TO_CLAIM` item through the persistent claim queue. Reserve an immutable operation before an external submission, require provider-enforced idempotency and the `value-receipt-v1` contract, record every transition, retry bounded pending/failure states, reconcile receipts and suppress duplicate submissions.
13. Permit automated code improvement only through generated adapter candidates. A candidate requires an exact same-host official claim endpoint, current terms hash, a vault credential reference, explicit automation, provider idempotency and reconciliation support. The Worker stores source, hash and self-test report but never evaluates or executes generated code.
14. Keep entitlement, claimant authority, jurisdiction, terms, fees, destinations, signing, secrets and deployment immutable to the learning loop. Measured learning can reorder work; generated code can enter provider sandbox and repository CI, but only reviewed source included in a protected release becomes an installed financial adapter.

## Consequences

- The discovery and entitlement system can run every day with no claimant secrets and no additional cron slot.
- A real deposit cannot occur until a claimant, an approved destination and a provider-specific constrained collection adapter are registered. The owner endpoint reports this truthfully instead of simulating acquisition.
- Grant, bounty and tender leads can be discovered aggressively but remain potential value until eligibility, award and entitlement are established.
- Every collection and sweep is duplicate-safe, auditable and reconcilable to the correct claimant and destination. Persistent operations are reserved before provider submission.
- Matrix can automatically generate and self-test provider-adapter source candidates from reviewed official specifications. Candidates remain non-executable until sandbox, reconciliation, CI and protected release gates pass.

## Rollback

Phase 15 is additive. Disabling `MATRIX_VALUE_HUNTER_ENABLED` stops discovery and evaluation; disabling `MATRIX_VALUE_AUTO_COLLECTION_ENABLED` stops collection eligibility; disabling `MATRIX_VALUE_CODE_IMPROVEMENT_ENABLED` stops new code candidates. Removing the Worker routes and scheduled call leaves all sources, decisions, operations, receipts, proposals and audit history intact. No existing payment, membership, investigation or static-site path depends on Value Hunter.
