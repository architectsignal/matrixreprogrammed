# Matrix Owner Automation Handoff

Verified on 13 August 2026. The immutable operating law is `CAUSE NO HARM OR LOSS.`

## Current truth

- The public site, search, evidence pages, passwordless login surface, investigation machine, public forum, newsletter, membership page, downloads and protected dashboard redirect are live and render correctly.
- Ask Matrix is live with an evidence-only fallback. The fresh two-authority retrieval and new local-compute adapter are tested but are not in production until this branch is deployed.
- Matrix Host is running locally, outbound-only and zero-spend. The real compute proof used `qwen/qwen3-4b` on CPU through LM Studio.
- The Qwen 4B model passed 3 of 4 representative benchmark profiles and completed a real public-evidence rerank. The 14B model is automatically excluded on this 16 GB machine by the 50% memory-admission guard.
- Value, bounty and capital-challenge code is receipt-only. No money has been received or reconciled. Current capital is EUR 0.
- Automatic bounty claims, bounty submissions, security bounty execution, capital financial execution and permissionless crypto execution remain off.
- Production release is blocked by the Cloudflare build-budget guard until the billing-period usage is verified at zero. Do not bypass the guard.
- The completed implementation and its scoped CI repairs are published on PR #255 at `architectsignal/matrixreprogrammed`, branch `agent/living-matrix-core`. The pull request remains a draft; publication does not authorize merging or deployment.
- The local supervisor and host are healthy, registered and heartbeat-fresh. `matrix-local matrix doctor` currently receives HTTP 404 because the Phase 17/18 Matrix-operations route is part of the unpublished Worker; it remains `WORKING_NOT_LIVE` until the guarded deployment completes.

## Owner actions in order

### 0. Review the published pull request

Review PR #255 and its required checks. The source is already published; Codex has not merged the pull request or deployed it. Merging, Cloudflare deployment, financial execution and bypassing any cost guard remain outside the publication approval.

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

### 3. Release the completed branch when Cloudflare usage resets

In GitHub repository variables, verify and update all four values from the Cloudflare dashboard at the time of release:

```text
CLOUDFLARE_GIT_BUILDS_DISCONNECTED=true
CLOUDFLARE_ZERO_BILLABLE_USAGE_CONFIRMED=true
CLOUDFLARE_BUILD_MINUTES_USED=0
CLOUDFLARE_USAGE_CHECKED_AT_UTC=<current UTC timestamp>
```

Then merge the reviewed pull request or run the controlled production workflow using the exact authorization phrase:

```text
DEPLOY MATRIX REPROGRAMMED
```

Leave the billing-exception field blank. A non-zero build-minute reading is a stop condition.

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

For a fresh local compute receipt, load the admitted model in LM Studio and run:

```powershell
lms runtime select llama.cpp-win-x86_64-avx2 --latest
lms load qwen/qwen3-4b --gpu off -c 4096 --parallel 1 --no-speculative-draft-mtp --ttl 3600 --yes
npm.cmd run proof:local-compute
```

The proof is valid only when it reports real selected evidence, benchmark results, a validated workload, zero inference spend and receipt hashes.
