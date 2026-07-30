# Matrix Reprogrammed project rules

## Mission and evidence

- Treat the site as a public-record intelligence system. Preserve source URLs, retrieval times, hashes, evidence grades, uncertainty, corrections, and alternative explanations.
- Never turn an allegation, association, model output, or analytical inference into established fact. Sensitive claims about identifiable people require the existing publication and editorial gates.
- Prefer deterministic parsing, validation, hashing, deduplication, and database work before model use.

## Zero-spend resource policy

- `AI_RESOURCE_ZERO_SPEND_LOCK` is on by default. A resource is ineligible unless immediate cost is exactly zero, billing and paid overage are impossible, quota is verifiable, automation is approved, and the data class is allowed.
- External or heavy local work must enter through `ai-management/resource-broker`. Do not add new direct provider calls to investigator code.
- Credentials belong in environment bindings or managed secret stores. Never store them in source, public JSON, D1 registry rows, logs, URLs, or generated output.
- Do not create accounts, accept provider terms, add payment methods, evade quotas, bypass CAPTCHAs, rotate proxies, or use visitor devices for compute.
- Unknown pricing, terms, health, quota, or privacy means fail closed. Local-only operation must remain usable.

## Architecture and changes

- Production is a Cloudflare Worker serving `_site`, with D1 `MEMBERS_DB`, compatibility KV, scheduled workflows, and Node-based build/investigation scripts.
- Edit source files, migrations, scripts, and canonical data. Do not hand-edit generated `_site` output unless an existing build script explicitly owns that artifact.
- Preserve the strict production boundary in `src/worker-production.js`, existing authentication, D1 fail-closed behavior, payment controls, and evidence-reporting safeguards.
- New resource adapters must implement the common adapter contract, declare data classes and supported job types, enforce time/size/egress limits, return provenance, and have a tested fallback.
- Autonomous site changes are staged and reversible. Class D changes require owner approval; Class E changes are prohibited.

## Verification and repository hygiene

- Inspect `git status` before editing and preserve unrelated user changes. Never discard or rewrite a dirty worktree.
- Run `npm run test:ai-management` for resource-orchestration changes, then targeted existing checks before the full build.
- The full build generates many files. Review its diff and do not attribute pre-existing or generated changes to the current task.
- Update `docs/AI_MANAGEMENT_IMPLEMENTATION_MAP.md`, the relevant ADR, and `ai-management/TASK_LEDGER.md` when architecture or rollout status changes.
