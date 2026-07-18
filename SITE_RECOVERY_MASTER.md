# Matrix Reprogrammed — Site Recovery Master

Status: ACTIVE
Branch: `recovery/site-mission-restoration`
Owner: Nicholas Matthews / Matrix Reprogrammed
Recovery principle: no feature is declared working until it passes a real live-browser user journey.

## Locked mission

Build a functioning public-record intelligence system that connects records, entities, institutions, money routes, contracts, access systems, evidence, missing records, analysis and clearly labelled speculation.

Every meaningful card must open a useful dossier. Every dossier must lead to evidence and related entities. Every report and brief must be substantive, tier-specific and generated from the same evidence model. Every tool must either work, clearly state its dependency, or be visibly unavailable. No decorative dead controls and no permanent loading placeholders are permitted.

## Locked evidence language

All claims and report sections must use one of these statuses:

1. Verified public record
2. Documented association
3. Analytical inference
4. Unverified allegation
5. Speculative scenario
6. Contradictory or counter-evidence

Speculation must never be presented as fact. Each speculative conclusion must state what supports it, what weakens it, and which missing record would change the assessment.

## Locked working method

1. Stabilise production before adding features.
2. Work on this recovery branch rather than making uncontrolled direct changes to `main`.
3. Give every page, dataset and runtime exactly one authoritative owner.
4. Build once, reconcile before packaging, then freeze the deploy bundle.
5. Run static validation, headless-browser validation and live validation.
6. Deploy only a named tested commit.
7. Do not call a stage complete until the live site proves it.
8. At external activation gates—Cloudflare secrets, Brevo, PayPal, domain verification, private OSINT runner or third-party credentials—stop and give Nicholas exact actions to perform.

## Recovery phases

### Phase 0 — Production stabilisation

- Inventory workflows that mutate or deploy production.
- Suspend scheduled content and automatic production deploys during recovery.
- Preserve the current live deployment and the last known good commit.
- Establish a controlled manual deployment path.
- Record production health, live commit and rollback instructions.

Exit test: no process can silently overwrite production during repair.

### Phase 1 — Complete functional inventory

Inventory every:

- public route
- HTML page
- JavaScript/CSS asset
- JSON/CSV/PDF dependency
- Cloudflare Worker route
- form and button
- login/member flow
- payment flow
- email flow
- download
- search route
- network map
- data tool
- card and dossier route

Each item receives: owner, dependency, tier, expected success, expected failure, test and live status.

Exit test: every visible interactive surface is registered.

### Phase 2 — Platform and deployment repair

- Eliminate build-order overwrites.
- Ensure final reconciliation happens before `_site` packaging, or explicitly copies every reconciled asset.
- Remove unsafe long-term caching from unversioned assets.
- Separate API routing from static asset routing.
- Add deterministic asset versioning.
- Add rollback and exact-commit deployment proof.

Exit test: repository output, deployed output and live output are identical for the tested commit.

### Phase 3 — Core reader journeys

Restore and prove:

1. Homepage and global navigation
2. Search
3. Entity index
4. Card → dossier routes
5. Evidence Vault and source downloads
6. Live Intel and daily/weekly briefs
7. Network maps
8. Data Lab

Exit test: a reader can start from the homepage, find an entity, read its dossier, inspect evidence, follow relationships and run a data query.

### Phase 4 — Membership and communication

Restore and prove:

- signup
- verification email
- passwordless login
- session handling
- member dashboard
- saved items
- follows and watchlists
- tier entitlements
- transactional email
- tier-specific brief delivery

External gate: Nicholas may need to verify Brevo/domain settings and secrets.

Exit test: a real test member can sign up, verify, log in, save/follow an entity and receive the correct tier report.

### Phase 5 — Payments

- Keep checkout disabled until all sandbox tests pass.
- Validate PayPal credentials, products, plans, webhooks and D1 entitlement transitions.
- Run a controlled sandbox subscription lifecycle.
- Provide Nicholas exact PayPal dashboard actions when required.
- Enable live checkout only after explicit approval.

External gate: Nicholas must perform or confirm PayPal dashboard actions and approve live charging.

Exit test: sandbox create, approval, confirmation, webhook, entitlement, cancellation and downgrade all work; live remains deliberately controlled.

### Phase 6 — Tools and private runners

Restore and prove:

- forum
- market watchlists
- research tools
- security/privacy tools
- Data Lab
- evidence reader
- maps
- private OSINT jobs

External gate: Nicholas may need to run/configure the private local OSINT runner and secrets.

Exit test: every tool is live, login/tier gated, dependency-labelled, or explicitly unavailable.

### Phase 7 — Unified intelligence content system

Create one authoritative schema for:

- entities
- relationships
- evidence items
- source citations
- contracts and financial routes
- institutional roles
- control mechanisms
- missing records
- contradictions
- hypotheses and scenarios
- tier-specific disclosure

Every substantive entity dossier must include:

- identity and roles
- timeline
- organisations and relationships
- money/ownership/contracts
- political, regulatory, intelligence, media, philanthropic or infrastructure leverage
- documented evidence
- missing records
- counter-evidence
- evidence boundary
- analytical conclusions
- labelled speculation
- triggers to strengthen or weaken the assessment
- related dossiers and source routes

Exit test: cards, dossiers, reports and briefs are generated from the same evidence graph rather than disconnected templates.

### Phase 8 — Tier-specific products

- Free: public facts, concise dossier, source routes and public archive.
- Supporter €3: deeper weekly synthesis, named actors, contradictions and selected source drops.
- Intelligence €6: daily entity briefs, relationship analysis, probability movement, counter-evidence and structured speculation.
- Research Pro €9: full source ledger, timelines, money/contract maps, competing hypotheses, missing-record programme and downloadable research dossiers.

Higher tiers must add analytical capability and source depth, not merely more words.

Exit test: the same entity produces clearly different, correctly gated products for all four tiers.

### Phase 9 — Release acceptance

A release fails if any of the following occur:

- permanent `Loading…` state
- `[object Object]`
- dead button or form
- script error
- HTML returned where JSON is expected
- card without a valid dossier
- dossier without evidence routes
- unsupported factual upgrade
- incorrect tier access
- stale asset from an earlier commit
- API response from the wrong Worker subsystem
- deployment commit mismatch

Final exit test: complete browser journeys pass against the live production domain on desktop and mobile widths.

## Current checkpoint

- Automatic production deployment is frozen.
- The confirmed manual fallback remains available but will not be used until acceptance testing passes.
- Recovery branch is synchronised with the production freeze.
- This master plan is the persistent source of truth.
- Next action: generate the authoritative route/function inventory.
