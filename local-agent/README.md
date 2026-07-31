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

## Next construction step

The next PR will add the control-plane queue and signed job-dispatch bridge. It will select a registered node, issue a short-lived job lease, receive a signed completion receipt, and recover safely if the machine disappears.
