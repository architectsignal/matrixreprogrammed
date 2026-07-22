# Full Site Function and Tool Audit

Generated: 2026-07-22T06:24:59.253Z
Mode: postbuild-cloudflare-output
Status: PASS

## Coverage

- html: 3001
- js: 77
- json: 900
- links: 131635
- localFetches: 34
- forms: 101
- buttons: 2170
- criticalTools: 31

## Hard Issues

- None

## Warnings

- src/money-command-center.js: fetch target not found data/money-intelligence-registry.json
- src/money-command-center.js: fetch target not found data/money-overlap-graph.json
- src/money-overlap-graph.js: fetch target not found data/money-overlap-graph.json
- src/money-overlap-graph.js: fetch target not found data/money-intelligence-registry.json

Boundary: Static audit validates local routes, syntax, JSON, critical DOM contracts, core tool wiring, supported MapLibre browser-bundle wiring, public-copy leaks and generated Cloudflare assets. Authenticated transactions and third-party services still require live environment verification.