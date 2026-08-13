# Matrix operating-system operations

## What is implemented

Phase 17 joins the existing event, Living Matrix, Ask Matrix, resource, compute, value, learning and protected-improvement systems through one constitutional operating loop. It records capability index, effective power, 24-hour/7-day/30-day/90-day/lifetime windows, daily evolution, boot receipts, watchdog events, strict learning effects and durable operating missions.

The scheduled loop runs after Living Matrix without adding a Cloudflare cron. A connected local host requests one immediate boot cycle on startup. The loop can create internal recovery work automatically; it cannot sign transactions, transfer funds, expose credentials, delete data or self-deploy production code.

## Local verification

Run these commands from the repository root:

```powershell
cd "C:\Users\njjmg\Documents\Codex\2026-08-12\files-mentioned-by-the-user-matrix\work\matrixreprogrammed-compute"
npm.cmd run test:matrix-operating-system
npm.cmd run matrix-local -- matrix doctor
npm.cmd run matrix-local -- matrix start
npm.cmd run matrix-local -- matrix status
```

`matrix doctor` succeeds locally without a token and reports that the remote check was skipped. Remote `start` and `status` require `MATRIX_AI_MANAGEMENT_ADMIN_TOKEN` in the current user environment. Use the same 64-character value already stored as the Worker secret; do not paste it into source, D1, GitHub logs, issues or prompts.

After changing a Windows user environment variable, close and reopen PowerShell, then run:

```powershell
cd "C:\Users\njjmg\Documents\Codex\2026-08-12\files-mentioned-by-the-user-matrix\work\matrixreprogrammed-compute"
npm.cmd run matrix-local -- stop
npm.cmd run matrix-local -- start
npm.cmd run matrix-local -- matrix doctor
```

## Live routes

All Phase 17 routes are owner-only and accept the existing admin token in `x-admin-token` or a bearer header:

- `GET /api/ai-management/admin/matrix-operations/doctor`
- `POST /api/ai-management/admin/matrix-operations/start`
- `GET /api/ai-management/admin/matrix-operations/missions`
- `GET /api/ai-management/admin/matrix-operations/history`
- `POST /api/ai-management/admin/matrix-operations/action/check`

`action/check` is evaluation-only. It writes an authorization receipt but never performs the requested action.

## Exact production blocker and release steps

The code, D1 migration and live verifier are ready, but Phase 17 cannot truthfully be called live until the controlled Cloudflare release passes. The committed policy currently records 5,470 billable Workers build minutes and deliberately blocks another deployment.

When a new Cloudflare billing period begins:

1. In Cloudflare Billing, confirm every metered product shows zero billable usage and record Workers Builds included, total and billable minutes.
2. Confirm Workers Git builds and legacy Pages Git deployments remain disconnected and non-production branch builds remain disabled.
3. Update `.github/build-budget-policy.json` with the new observation, current-period lock state and current connection proof.
4. In GitHub repository Settings → Secrets and variables → Actions → Variables, update `CLOUDFLARE_GIT_BUILDS_DISCONNECTED=true`, `CLOUDFLARE_ZERO_BILLABLE_USAGE_CONFIRMED=true`, `CLOUDFLARE_BUILD_MINUTES_USED=0`, and `CLOUDFLARE_USAGE_CHECKED_AT_UTC` to the current UTC timestamp.
5. Merge the Phase 17 PR to `main` only after all required checks pass.
6. Open Actions → **Matrix Reprogrammed Controlled Production Deploy** → **Run workflow**. Enter exactly `DEPLOY MATRIX REPROGRAMMED`; leave `billing_exception` blank.
7. The workflow will capture a D1 rollback bookmark, apply Phase 17, verify the immutable constitution and zero-amount delegations, deploy the exact commit, run the immediate Matrix cycle, block a destructive action in the live gate, and upload the production proof.
8. On the owner machine, reopen PowerShell and run the four local commands above. `matrix doctor` must report `remote.state: LIVE_WORKING` and a valid constitution.

Do not weaken or bypass the budget guard. A deployment performed outside this workflow would lack the D1 rollback bookmark, exact-SHA verification and constitutional live receipt.

## External dependencies that code cannot manufacture

- A real external resource counts only after current terms/licence/privacy checks and a successful eligible workload receipt at confirmed zero monetary cost.
- Claim-based collection needs proved claimant authority, an approved destination and a reviewed provider adapter.
- Permissionless collection remains simulation-only until a production-certified codec/simulator/receipt decoder, approved zero-spend RPCs, a capped wallet, constrained signer and gas reserve exist.
- KYC, CAPTCHA, account creation, contract acceptance, bank ownership proof and wallet funding remain exact owner/provider dependencies.
