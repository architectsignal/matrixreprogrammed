# AI management task ledger

Updated: 2026-07-30

| Phase | Task | Status | Evidence / next action |
| --- | --- | --- | --- |
| 0 | Repository, Investigator, Cloudflare, D1, workflows, provider, secret, and publication audit | Complete | `docs/AI_MANAGEMENT_IMPLEMENTATION_MAP.md` |
| 1 | Job and Resource Registry schemas | Complete | `ai-management/schemas`, D1 phase 9 migration |
| 1 | Zero-spend Policy Engine | Complete | Hard exclusions and scored eligible set |
| 1 | Quota reservation and Resource Broker | Complete | Memory + D1 quota stores; broker tests |
| 1 | Local-only fallback and feature flags | Complete | Deterministic adapter; Cloudflare flags default locked/disabled |
| 1 | Investigator retrieval integration | Complete | `run-investigation-machine.js` no longer dispatches network calls directly |
| 2 | Hardware, thermal, local-model discovery and routing | Pending | Implement after owner confirms available local runtimes |
| 3 | Terms-reviewed source adapter catalogue | In progress | Federal Register seed plus approved API/feed path; review remaining sources |
| 4 | Autonomous Resource Scout and revalidation | Pending | Needs trusted documentation fetch, diffing, sandbox, and approval queue |
| 5 | Opportunistic compute exports | Pending | Keep disabled until provider-specific terms review |
| 6 | Route all remaining Investigator/live-intel provider calls | Pending | `update-live-intel.js` and `update-seven-day-intel.js` still need conversion |
| 7 | Site Improvement Director | Pending | Start observation-only after metrics persistence |
| 8 | Owner control-centre UI and full metrics | Pending | API foundation first; UI after D1 rollout |
| 9 | Failure, quota, poison, backlog, rollback, and sensitive-claim stress tests | In progress | Foundation covers policy/fallback/dedup; full deployment tests remain |

## First-pass verification

- `npm.cmd run test:ai-management` passes after the full site lifecycle.
- A real Investigator run fetched 100 Federal Register records through the broker at confirmed cost EUR 0; 11 unreviewed sources failed closed at policy evaluation.
- The production build, Cloudflare output, post-build acceptance audit, Worker route tests, site-function harmony, and PayPal sandbox rehearsal pass.
- The isolated Worker contract includes the external `ai-management/` dependency tree and passes all fail-closed boundaries.
- Default outbound Investigator identification contains no personal email address.
- No deployment was performed and the phase 9 D1 migration was not applied to production.
