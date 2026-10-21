# Autonomous Intelligence Machine — Phase 1.1

## Status

Phase 1.1 connects one existing Matrix Reprogrammed intelligence pattern to the supervised control plane: the Live Intel RSS ingestion pattern.

This increment is deliberately narrow. It reads one approved official feed, sanitises and validates the complete response, and writes new records only to the local review queue. It does not update `data/live-intel.json`, generate public cards, alter dossiers, run a site build or create publication tasks.

## Approved source

- **Source:** U.S. Department of Justice, Southern District of New York press releases
- **Feed:** DOJ-provided SDNY RSS feed
- **Reliability class:** official
- **Request ceiling:** two attempts per rolling hour
- **Host:** `www.justice.gov` only
- **Permitted paths:** `/news/rss` and `/usao-sdny/pr/`
- **Subdomains:** not allowed

DOJ exposes the feed for automatic news updates. Approval is recorded in `data/autonomous-machine/phase1-approved-sources.json`. Any security-critical difference between that file and the runtime registry stops execution instead of silently broadening access.

## Data flow

1. The manual runner loads the approved source configuration.
2. The Mission Director receives one hourly-deduplicated `ingest` task.
3. The source registry validates the host, HTTPS scheme and path boundary.
4. The persistent rate-limit store authorises the request.
5. The handler fetches no more than 2 MiB and parses no more than 12 RSS or Atom entries.
6. HTML, scripts and styles are removed from stored text.
7. Every linked article is validated before any review record is written.
8. Valid items enter `.autonomous-machine/review-queue.json` with provenance and an evidence boundary.
9. Existing review fingerprints are deduplicated.
10. The audit chain records the batch and confirms that publication was not requested.

## Evidence boundary

A DOJ release may describe an allegation, charge, indictment, plea, conviction, sentence or settlement. The stored record must preserve that procedural status. An allegation or charge must never be rewritten as a conviction, and a settlement must not be expanded beyond the source wording.

## Run the offline integration test

```bash
AIM_PUBLICATION_MODE=disabled node scripts/autonomous-machine/phase1.1-self-test.js
```

Expected output includes:

```json
{
  "ok": true,
  "tests": 17,
  "publicationTasks": 0
}
```

The test uses a local fixture and makes no network request.

## Run the real source manually

```bash
AIM_PUBLICATION_MODE=disabled node scripts/autonomous-machine/run-phase1-sdny-watch.js
```

The runner is not scheduled. Runtime state remains inside `.autonomous-machine/` and is not committed.

## Fail-closed rules

- Publication mode is forced to `disabled` by the runner.
- No output path points to the public site or generated data directories.
- No publication-candidate task is created.
- A single off-domain or off-path article rejects the whole batch before review writes.
- Oversized, malformed or failed responses reject the task.
- Rate-limit exhaustion rejects the request before network access.
- Source configuration drift rejects startup.
- The global kill switch still stops the Mission Director before task claim.

## Next supervised increment

Phase 1.2 should add a read-only mapper that compares pending review records with existing dossier identifiers and proposes routes without writing to dossiers, clocks, timelines or the knowledge graph.
