# External Compute Activation Requirement

This is a permanent Matrix Reprogrammed release requirement.

## Objective

The autonomous AI must continuously discover, verify, activate and safely use lawful free online compute to increase project capability while preserving owner control, privacy, auditability and a hard EUR 0 ceiling.

## Required operating loop

1. Discover only official provider documentation, official APIs, owner-authorized machines, donated capacity or community resources explicitly offered for automated use.
2. Verify current pricing, free quota, automation permission, data handling, commercial-use rules, authentication requirements, expiry, overage behavior and provider terms.
3. Reject or quarantine any resource with uncertain pricing, possible overage, required payment method, paid fallback, account rotation, quota evasion, credential harvesting, unauthorized access or concealed automation.
4. Automatically admit owner-controlled zero-cost machines after health and authorization checks.
5. Place external resources requiring account creation, credentials, identity verification or terms acceptance into an owner-approval queue.
6. After owner approval, use credential references only; never store plaintext credentials in D1, logs, receipts or repository files.
7. Execute a harmless bounded probe before activation.
8. Register measured capabilities, quota, latency, reliability, privacy class, supported job types and expiry in the resource registry.
9. Allocate only compatible jobs with a monetary ceiling of EUR 0 and no paid fallback.
10. Reverify pricing, terms and quota before use; suspend immediately when evidence is stale, quota is exhausted, terms change, health fails or cost cannot be proven zero.
11. Record immutable discovery, approval, probe, allocation, completion, suspension and quota receipts.

## First production activation target

The first external adapter is the Hugging Face Inference Providers OpenAI-compatible router pinned to the PublicAI provider. It remains disabled until the owner supplies a fine-grained Hugging Face token and explicitly approves activation. The adapter must never use automatic provider selection, `:fastest`, `:cheapest` or another provider because those routes may be billable.

## Non-negotiable boundaries

- No fake identities or automated account creation.
- No account or IP rotation.
- No quota evasion or free-tier farming.
- No payment methods.
- No paid credits, billing accounts or automatic upgrades.
- No use of exposed, compromised or unauthorized machines.
- No cryptocurrency mining or unrelated workloads.
- No private, confidential or restricted Matrix data sent to external providers.
- No external prompt execution without an explicit resource-level data policy.
- No silent fallback to a paid provider.

## Release gate

The AI build is not complete until at least one real external resource has passed:

`official discovery -> terms verification -> owner approval -> credential reference -> harmless probe -> EUR 0 receipt -> broker registration -> bounded real job -> completion receipt`

Every production release must retain tests proving these boundaries.