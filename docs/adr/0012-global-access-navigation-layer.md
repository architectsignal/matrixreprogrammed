# ADR 0012: Global access navigation at the packaging boundary

## Status

Accepted for staged release on 2026-08-14. Production remains subject to the existing exact-SHA, zero-spend and deployment guards.

## Context

Matrix Reprogrammed has more than a thousand public HTML documents produced by many legacy builders. Their local navigation differs, but the real member login and consent-backed newsletter routes are shared. Editing every generated or canonical page would create a large, fragile diff and later builders could overwrite it.

## Decision

The Cloudflare output packager injects one same-origin stylesheet and one deferred same-origin script into every copied HTML document and its extensionless route variant. A final idempotent lifecycle reconciler repeats that assertion after legacy post-build repair scripts, because some of those scripts can rewrite selected member and forum outputs. The script mounts a small, accessible quick-access dock with:

- an Explore drawer for the highest-value public routes;
- a Login action to the existing passwordless member flow;
- a Subscribe action to the existing consent-backed newsletter form.

Existing page headers and navigation remain untouched. The dock does not call an authentication API on page load, use an external dependency, create an account, start a payment, or claim a subscription state. Packaging and the final npm lifecycle fail closed if either asset is missing or if any deployable HTML output lacks exactly one stylesheet and one script marker.

## Consequences

- Every deployable page gets consistent entry points without a mass rewrite of source pages.
- The feature adds two small cacheable assets and no background requests.
- The Explore drawer is keyboard-operable, Escape-dismissible, responsive, reduced-motion aware and excluded from print.
- A rollback removes the packager hook and the two assets; existing navigation continues to work throughout.
- Real login, newsletter persistence and member entitlement behavior remain owned by their existing Worker/D1 boundaries and tests.
- Public navigation inventories exclude private build roots such as `card-artwork-batches` and `src`; an internal index may describe a private batch, but it must not emit a clickable route that deployment intentionally excludes.

## Verification

`scripts/global-access-dock-test.mjs` proves idempotent injection, canonical routes, same-origin operation, keyboard/mobile markers, packager ownership and final-output coverage. `scripts/build-cloudflare-output.js` audits every copied HTML document during packaging, and `scripts/reconcile-global-access-dock.cjs` audits the complete deployable output after late generators. `scripts/private-output-route-boundary-test.js` also locks the public route-map and artwork-index behavior so excluded private children cannot return as dead navigation.
