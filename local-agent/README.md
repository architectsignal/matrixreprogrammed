# Matrix Local Execution Agent

The local agent turns an owner-controlled computer into a zero-cost execution node for Matrix Reprogrammed. It reports hardware and local-model metadata to the Cloudflare control plane while keeping prompts and inference on the local machine.

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

## Current construction state

The control-plane queue and signed job-dispatch bridge now exist on the autonomy branch. They select registered nodes, issue short-lived leases, receive bounded completion receipts, and recover safely when a machine disappears. The next release stage is an owner-approved deterministic live job through enqueue, lease, local execution, completion, and immutable receipt verification.
