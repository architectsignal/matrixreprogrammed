# ADR 0005: Daily lawful zero-cost compute fabric

- Status: Accepted
- Date: 2026-08-12

## Context

Matrix already had a Resource Registry, Resource Broker, owner-local runtime inventory, local job queue, provider candidates and strict zero-spend policy. Those parts did not yet form a closed operational loop: scheduled production did not run capacity growth, broker assignments were not persisted to the queue, local outcomes did not change routing reliability, and the Opportunity Hunter could silently skip when no dashboard seed existed.

## Decision

1. Run the Opportunity Hunter before capacity growth in the existing bounded Worker schedule. Bootstrap it with the current official Kaggle and Hugging Face compute documentation when no explicit seed binding is present. Fetch and re-evaluate the official documentation and terms no more than once per UTC day.
2. Treat the bootstrap records as discovery inputs, never approvals. Their automation and commercial-use status remains `unknown`; account, identity and credential requirements remain explicit. They therefore stay quarantined or awaiting owner action until current official evidence and owner onboarding satisfy every gate.
3. Auto-admit only online owner-controlled nodes that confirm zero monetary cost and no external-network execution. Paid fallback, payment methods, account rotation, quota evasion, credential harvesting and access-control bypass remain forbidden.
4. Create one idempotent `deterministic.hash` benchmark per UTC day when an owner node is online. Persist the selected node on the D1 job, require a hashed lease token, and accept completion only with explicit `cost_confirmed_zero=true` and `external_network_used=false`.
5. Feed successful and failed job outcomes into Resource Registry reliability, success rate, latency and cooldown state. Subsequent Resource Broker rankings therefore use observed outcomes.
6. Persist a daily `MATRIX COMPUTE REPORT` in the existing learning ledger. Report only eligible compute resources, online hardware, assignments, outcomes, owner gates and quarantines. Confirmed cost is EUR 0; cost avoided stays unknown until a defensible comparison model exists.
7. Keep private prompts, hidden reasoning, credentials and raw model output out of the capacity report and learning ledger. This loop improves capacity selection and verification; it does not autonomously rewrite protected site, evidence, payment, authentication or deployment code.

## Consequences

- Owner-local capacity is automatically usable, benchmarked and learned from while it remains online.
- Kaggle and Hugging Face are actively rechecked but not represented as connected GPU capacity. They require owner-controlled accounts, terms review, credentials and a bounded endpoint before routing can be enabled.
- Explicit `AI_OPPORTUNITY_SEEDS_JSON=[]` disables the bootstrap watchlist; malformed configuration fails closed.
- Broad discovery beyond the audited official-source watchlist still requires a lawful, owner-authorised search/feed source. It cannot be simulated with scraping, fabricated availability or unapproved accounts.
