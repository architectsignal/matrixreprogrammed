# Matrix Owner Automation Handoff

Verified on 14 August 2026. The immutable operating law is `CAUSE NO HARM OR LOSS.`

## Current truth

- The current public site, search, evidence pages, passwordless login surface, investigation machine, public forum, newsletter, membership page, downloads and protected dashboard redirect are live. The new global Explore, Login and Subscribe dock is source-complete and tested but is not live until the guarded PR chain is merged and deployed.
- Ask Matrix is live with an evidence-only fallback. Fresh two-authority retrieval, the governed Agent Commons, new resource adapters and the updated local-compute controls remain staged until this branch is deployed.
- Matrix Host is online, connected, registered, heartbeat-fresh, outbound-only and zero-spend locked. It currently reports zero loaded models and zero healthy model servers, one completed job and zero failed jobs.
- The Qwen 4B model previously passed 3 of 4 representative benchmark profiles and completed a real public-evidence rerank. Do not auto-load Qwen 14B on this 16 GB machine: it consumed about 6.9 GB itself and reduced free RAM to about 1 GB. The staged Host revision adds a 4,096 MB / 25% free-memory floor and defers work under pressure.
- Value, bounty and capital-challenge code is receipt-only. No money has been received or reconciled. Current capital is EUR 0.
- Automatic bounty claims, bounty submissions, security bounty execution, capital financial execution and permissionless crypto execution remain off.
- The previous Cloudflare snapshot still records 5,470 billable Workers Build minutes and $27.34 for the completed period. A new-period dashboard reading must be copied into the GitHub release variables before release; do not reuse the old timestamp or bypass the guard.
- PR #257 (`agent/matrix-integrated` into `agent/living-matrix-core`) contains the integrated navigation, Host-pressure, Agent Commons, resource and release-repeatability work. PR #255 (`agent/living-matrix-core` into `main`) is the parent production PR. Both remain drafts until review is complete.
- The local supervisor and host are healthy, registered and heartbeat-fresh. `matrix-local matrix doctor` currently receives HTTP 404 because the Phase 17/18 Matrix-operations route is part of the unpublished Worker; it remains `WORKING_NOT_LIVE` until the guarded deployment completes.

## Owner actions in order

### 0. Review and merge the PR chain in order

1. Review PR #257 and wait for every exact-head check to pass.
2. Mark PR #257 ready and merge it into `agent/living-matrix-core`.
3. Confirm PR #255 updates to contain the merged PR #257 commit.
4. Review PR #255, mark it ready and merge it into `main` only when its checks pass.
5. Do not deploy a branch SHA; the production workflow must target the exact reviewed `main` SHA.

Codex has not merged either pull request or deployed this branch. Financial execution and bypassing any cost or safety guard remain prohibited.

### 1. Keep the local host running after Windows sign-in

Open PowerShell as Administrator, change to this repository, and run:

```powershell
cd "C:\Users\njjmg\Documents\Codex\2026-08-12\files-mentioned-by-the-user-matrix\work\matrixreprogrammed-compute"
npm.cmd run matrix-local -- autostart enable
npm.cmd run matrix-local -- autostart status
```

If Task Scheduler is still denied, keep using these non-admin commands after sign-in until the task is installed:

```powershell
cd "C:\Users\njjmg\Documents\Codex\2026-08-12\files-mentioned-by-the-user-matrix\work\matrixreprogrammed-compute"
npm.cmd run matrix-local -- start
npm.cmd run matrix-local -- status
```

### 2. Preserve the control-plane secret

Use the same 64-character value already saved at user scope. Never paste it into chat, source control or a log.

Required secret locations:

- Windows user environment variable: `MATRIX_AI_MANAGEMENT_ADMIN_TOKEN`
- GitHub Actions repository secret: `AI_MANAGEMENT_ADMIN_TOKEN`
- GitHub Actions repository secret: `ADMIN_API_TOKEN` (same value is acceptable for the current Worker contract)
- Cloudflare Worker secret: `AI_MANAGEMENT_ADMIN_TOKEN`
- Cloudflare Worker secret: `ADMIN_API_TOKEN`

After changing the Windows value, restart the host so the process inherits it:

```powershell
npm.cmd run matrix-local -- stop
npm.cmd run matrix-local -- start
npm.cmd run matrix-local -- matrix doctor
```

Before the new Worker is deployed, the final `matrix doctor` command will truthfully return HTTP 404. The ordinary `matrix-local -- status` and `matrix-local -- doctor` commands remain the authoritative local-host checks during that interval.

### 2A. Keep the 16 GB owner computer responsive

Keep LM Studio and Qwen unloaded during ordinary Host supervision. If a model was loaded for a bounded proof, stop it afterward:

```powershell
lms unload --all
lms server stop
```

Do not configure Qwen 14B to auto-load or run as a login service on this computer. For a deliberate local proof, load only Qwen 4B with one parallel worker and a one-hour TTL, then unload it when the receipt is complete. After PR #257 is merged into the local Host checkout, restart the supervisor/Host so the staged memory-pressure guard becomes active.

### 3. Record the new Cloudflare period and release only the reviewed `main` SHA

The 15 July–14 August period is complete, but the repository still contains its old-period snapshot. Open the new Cloudflare billing period and update the GitHub repository variables from the visible dashboard at release time:

```text
CLOUDFLARE_GIT_BUILDS_DISCONNECTED=true
CLOUDFLARE_ZERO_BILLABLE_USAGE_CONFIRMED=true
CLOUDFLARE_BUILD_MINUTES_USED=<new-period Workers Build minutes, expected 0>
CLOUDFLARE_USAGE_CHECKED_AT_UTC=<current UTC timestamp>
```

Set `CLOUDFLARE_ZERO_BILLABLE_USAGE_CONFIRMED=true` only if the new period visibly shows zero billable usage. Then run the controlled production workflow from `main` using the exact authorization phrase:

```text
DEPLOY MATRIX REPROGRAMMED
```

Leave the billing-exception field blank. Any current billable amount, stale timestamp, unreviewed SHA or unavailable daily release slot is a stop condition. Netlify is not part of this release path.

### 4. Configure a lawful first-receipt rail

The fastest existing public route is the live GoFundMe support link. To receive its payout, the owner must finish the platform's identity, bank-account and payout verification. Matrix cannot complete KYC or prove ownership of a bank account for the owner.

For PayPal subscriptions, the owner needs:

- a PayPal Business account in the correct legal name;
- PayPal identity/business verification and a verified bank destination;
- a PayPal Developer application with client ID and secret stored only as provider secrets;
- one PayPal plan ID for each paid membership tier;
- sandbox end-to-end confirmation first, followed by deliberate live activation;
- webhook verification configured for the production Worker;
- a real provider receipt reconciled before any amount counts toward the Capital Challenge.

Do not set PayPal live flags merely because the page renders. Checkout, webhook confirmation, receipt persistence and reconciliation must all pass.

### 5. Configure bounty accounts without granting unbounded authority

For each selected platform (currently official GitHub/ProjectDiscovery and Opire discovery adapters):

- create or verify an owner-controlled platform account;
- accept the current platform rules personally;
- complete payout/KYC/tax details where required;
- configure an owner-controlled payout destination;
- record whether AI and automated submissions are explicitly permitted;
- grant repository access only to selected repositories;
- keep `MATRIX_BOUNTY_AUTO_CLAIM_ENABLED=false` and `MATRIX_BOUNTY_AUTO_SUBMISSION_ENABLED=false` until a small task has passed human review end to end;
- never enable security bounty execution without explicit scope, authorization and safe-testing rules.

A discovered bounty is not income. Only a provider-confirmed and reconciled payout is capital.

### 6. Leave crypto execution disabled

The current permissionless harvester is simulation-only. There is no production-certified protocol adapter. Do not add wallet keys to source or browser storage. A future activation requires an owner-controlled execution wallet, managed signer reference, gas limits, chain/protocol allowlists, current simulation, idempotency and receipt reconciliation.

### 7. Prove the public access paths after deployment

1. Open the homepage and one nested dossier page on `matrixreprogrammed.com`.
2. Confirm the small Explore, Login and Subscribe dock appears once on both pages.
3. Open Explore and verify Start Here, Search, Today, Evidence, Investigations and Signal Board.
4. Open Login, enter an owner-controlled test address and consume one real one-time link. Never paste the link or token into chat or logs.
5. Open Subscribe, tick explicit consent, submit the test address and confirm the saved/verification response.
6. Confirm the member record, consent event and delivery state through the protected administrator health surfaces.
7. Record the exact deployed SHA and rollback target before calling this live.

### 8. Activate external compute one resource at a time

GitHub Actions is already the preferred zero-spend build/test lane. No external inference provider is currently admitted as live compute. For each candidate provider:

1. Use only the official provider site and create an owner-controlled account.
2. Reject any plan requiring a payment method, possible overage, automatic provider selection or paid fallback.
3. Read and accept current automation, commercial-use, privacy and quota terms personally.
4. Create the narrowest credential and store it only as a provider/Worker secret reference—not in GitHub source, D1, prompts or logs.
5. Keep the provider quarantined until live health, terms, quota, expiry, data-policy and EUR 0 checks all pass.
6. Run one harmless bounded probe, then one real public-only job.
7. Admit it to the broker only after a zero-cost completion receipt is persisted and centrally verified.

Kaggle, Hugging Face/PublicAI, Qwen generators and every account-dependent source remain disabled until this complete gate passes. Crossref and Grants.gov are public data resources, not external model compute.

## First receipt checklist

Matrix may mark `FIRST_REAL_MATRIX_RECEIPT` only after all items exist:

```text
provider confirmation
receipt_id or transaction reference
gross amount and currency
fees
net amount
EUR equivalent
approved destination reference
received_at timestamp
reconciled=true
```

Until then the exact value state is `READY_BUT_EXTERNAL_ACTION_REQUIRED`, received amount EUR 0.

## Daily checks

```powershell
cd "C:\Users\njjmg\Documents\Codex\2026-08-12\files-mentioned-by-the-user-matrix\work\matrixreprogrammed-compute"
npm.cmd run matrix-local -- status
npm.cmd run matrix-local -- matrix doctor
npm.cmd run test:local-host
npm.cmd run test:public-investigation
npm.cmd run test:value-hunter
```

For a fresh local compute receipt only, load the admitted 4B model in LM Studio and run:

```powershell
lms runtime select llama.cpp-win-x86_64-avx2 --latest
lms load qwen/qwen3-4b --gpu off -c 4096 --parallel 1 --no-speculative-draft-mtp --ttl 3600 --yes
npm.cmd run proof:local-compute
lms unload --all
lms server stop
```

The proof is valid only when it reports real selected evidence, benchmark results, a validated workload, zero inference spend and receipt hashes.
