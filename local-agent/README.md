# Matrix Local Execution Agent

The local agent turns an owner-controlled computer into a zero-cost execution node for Matrix Reprogrammed. It reports hardware and local-model metadata to the Cloudflare control plane while keeping prompts and inference on the local machine.

## Operator commands

The persistent outbound Host Node is managed through one command surface:

```powershell
npm run matrix-local -- start
npm run matrix-local -- status
npm run matrix-local -- doctor
npm run matrix-local -- benchmark
npm run matrix-local -- logs 100
npm run matrix-local -- stop
```

`start` launches a detached watchdog and Host process. The watchdog restarts an unexpected Host exit with bounded exponential backoff. Runtime state, health heartbeats, restart state, logs, and benchmark history are kept outside the repository under `%LOCALAPPDATA%\MatrixReprogrammed\host` on Windows. Set `MATRIX_LOCAL_STATE_DIR` only when a different owner-controlled location is required.

The Host remains useful in local-only mode when the owner token is absent: hardware discovery, loopback model discovery, health state, and deterministic benchmarking still work. It begins outbound registration and job leasing only after `MATRIX_AI_MANAGEMENT_ADMIN_TOKEN` is configured.

Daily idle-time benchmarks execute representative classification, bounded reasoning, structured extraction, and synthesis probes against every detected loopback model. Only scores, latency, success state, and output hashes are persisted. Those measured outcomes update the resource scores sent on the next registration and therefore change the next routing decision.

The Host protects the owner's computer by pausing new local leases when free memory falls below 4,096 MB or 25% (whichever reserves more memory). Benchmarks require a further 1,024 MB reserve. Configure these conservative defaults with `MATRIX_LOCAL_MIN_FREE_MEMORY_MB`, `MATRIX_LOCAL_MIN_FREE_MEMORY_PERCENT`, `MATRIX_LOCAL_BENCHMARK_RESERVE_MB`, and `MATRIX_LOCAL_BUSY_BACKOFF_SECONDS`. While constrained, the Host remains online and registered, reports only allowlisted pressure telemetry, and asks the control plane to prefer already-approved public-only zero-spend compute; it never enables a provider or paid fallback by itself.

Auto-start is opt-in. On Windows, enable it only after the owner token has been stored in the owner account environment:

```powershell
npm run matrix-local -- autostart enable
npm run matrix-local -- autostart status
```

The CLI prefers a limited scheduled task. If Windows denies task creation, it falls back to the current user's `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run` entry. The startup command contains only the Node executable and Host script path; it reads the owner token from the user environment and never stores the token in the task or registry value.

Remove either provider with `npm run matrix-local -- autostart disable`. Both run only for the current user at owner login; the scheduled-task provider explicitly uses limited privileges.

## Security boundary

- Binds to `127.0.0.1` by default.
- Refuses LAN binding unless explicitly enabled.
- Refuses non-loopback model endpoints.
- Requires HMAC-SHA256 signatures for every execution request.
- Rejects stale timestamps and replayed nonces.
- Supports an explicit allowlist of job types; it never exposes shell execution.
- Keeps the zero-spend claim explicit in every registration and result.
- LLM execution is disabled until explicitly enabled.

## Requirements

- Node.js 20 or newer.
- Optional: NVIDIA drivers and `nvidia-smi` for GPU inventory.
- Optional: Ollama bound to loopback for local LLM jobs.

## First safe test

From the repository root:

```powershell
$env:MATRIX_LOCAL_AGENT_SHARED_SECRET = "replace-with-a-random-secret-at-least-32-characters"
node local-agent/matrix-local-agent.test.mjs
node local-agent/matrix-local-agent.mjs
```

Then open another terminal:

```powershell
Invoke-RestMethod http://127.0.0.1:43117/health
```

The health response should report `zeroSpendLock: true`, `loopbackOnly: true`, and the detected hardware.

## Register the machine with Matrix Reprogrammed

Set the live owner token only in the machine environment. Never write it into this repository.

```powershell
$env:MATRIX_AI_MANAGEMENT_ADMIN_TOKEN = "your-existing-owner-token"
$env:MATRIX_LOCAL_AGENT_SHARED_SECRET = "a-separate-random-local-agent-secret"
node local-agent/matrix-local-agent.mjs
```

The daemon sends only hardware inventory, model metadata, availability, and the zero-cost proof to `/api/ai-management/admin/local-runtime`. Prompts are not included in registration.

## Register an Ollama model

```powershell
$env:MATRIX_LOCAL_MODEL_ID = "qwen2.5:14b"
$env:MATRIX_LOCAL_MODEL_CONTEXT_LENGTH = "32768"
$env:MATRIX_LOCAL_MODEL_PARAMETERS_BILLION = "14"
$env:MATRIX_LOCAL_MODEL_ESTIMATED_VRAM_GB = "10"
$env:MATRIX_LOCAL_AGENT_ALLOW_LLM_JOBS = "false"
node local-agent/matrix-local-agent.mjs
```

Keep `MATRIX_LOCAL_AGENT_ALLOW_LLM_JOBS=false` until the control-plane job-delivery step is reviewed and tested. Registration and routing metadata work without enabling prompt execution.

## Signed deterministic test job

Execution requests use this canonical signature input:

```text
METHOD\nPATH\nTIMESTAMP_MS\nNONCE\nSHA256_BODY
```

The signature is `HMAC-SHA256(canonical, MATRIX_LOCAL_AGENT_SHARED_SECRET)` and is sent in:

- `x-matrix-timestamp`
- `x-matrix-nonce`
- `x-matrix-signature`

Version 0.1 permits only `deterministic.hash` and, when explicitly enabled, `llm.generate`. Unknown job types fail closed.

## Compute capacity growth

The capacity manager in `ai-management/compute-capacity/compute-capacity-manager.mjs` evaluates potential execution capacity from four lawful sources:

1. owner-local machines;
2. owner-authorized LAN machines;
3. official free compute programmes;
4. official community compute pools.

Owner-controlled nodes may be admitted automatically only after they prove project authorization, zero cost, acceptable terms, privacy controls, supported workloads, and valid concurrency. External compute is never auto-enrolled: it enters an owner-approval queue even when it appears free and automation-permitted.

The manager explicitly rejects account rotation, quota evasion, credential harvesting, access-control bypass, payment-method requirements, paid fallback, and unverified terms. Capacity is scored, shortlisted, and allocated only through reversible zero-spend assignments.

Run the capacity proof with:

```powershell
node scripts/compute-capacity-manager-test.mjs
```

## Operational state

The control-plane queue and outbound job-dispatch bridge select registered nodes, issue short-lived leases, receive bounded completion receipts, and recover safely when a machine disappears. The Host process now provides persistent discovery, registration, polling, measured model benchmarking, durable health, watchdog recovery, and explicit Windows login start. A real connected local inference job still requires the owner's existing control-plane token and an installed loopback model runtime; neither is fabricated by the software.
