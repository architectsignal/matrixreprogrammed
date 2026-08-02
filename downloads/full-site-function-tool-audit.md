# Full Site Function and Tool Audit

Generated: 2026-08-02T06:38:21.896Z
Mode: postbuild-cloudflare-output
Status: PASS

## Coverage

- html: 3465
- js: 114
- json: 1235
- links: 159993
- localFetches: 68
- forms: 330
- buttons: 2530
- criticalTools: 31

## Hard Issues

- None

## Warnings

- .cloudflare/pages-output/living-pulse.js: fetch target not found data/daily-brain-brief.json
- heroes-fighting-matrix-card: missing local target ${esc(source.url)}
- heroes-fighting-matrix-card.html: missing local target ${esc(source.url)}
- heroes-fighting-matrix-research-ledger: missing local target ${esc(source.url)}
- heroes-fighting-matrix-research-ledger.html: missing local target ${esc(source.url)}
- src/money-command-center.js: fetch target not found data/money-intelligence-registry.json
- src/money-command-center.js: fetch target not found data/money-overlap-graph.json
- src/money-overlap-graph.js: fetch target not found data/money-overlap-graph.json
- src/money-overlap-graph.js: fetch target not found data/money-intelligence-registry.json
- src/money-profile.js: fetch target not found data/money-profile-index.json
- src/money-profile.js: fetch target not found data/money-relationship-feed.json
- src/money-profile.js: fetch target not found data/money-intelligence-registry.json

Boundary: Static audit validates local routes, syntax, JSON, critical DOM contracts, core tool wiring, supported MapLibre browser-bundle wiring, public-copy leaks and generated Cloudflare assets. Authenticated transactions and third-party services still require live environment verification.