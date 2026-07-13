# Phase 3 — Categorise and Migrate All Content

## Locked objective

Move every important page, report, card, document, source, entity, relationship, dashboard, download, newsletter item and product into the correct canonical section and access tier without breaking existing routes, search visibility, navigation, evidence boundaries or historical versions.

## Exit condition

No important item is uncategorised, materially duplicated or inaccessible through navigation and search.

An important item is not considered complete merely because it exists in the repository. It must have:

- A canonical ID.
- A canonical content type.
- A primary category and subcategory.
- An editorial owner.
- A public/private classification.
- A tier decision.
- A canonical or archive route.
- A search-index decision.
- A navigation or related-content entry.
- Entity and topic tags where relevant.
- A duplicate or historical-version decision.
- An evidence, factual, disputed or speculative presentation label where relevant.

## Safety boundary

Phase 3 begins in report-only and preview-only mode.

It does not initially:

- Move or rename routes.
- Activate redirects.
- Hide or delete content.
- Enforce paywalls.
- Remove pages from search.
- Remove pages from navigation.
- Activate authentication or entitlements.
- Activate payment.
- Merge graph associations or speculation into factual content.
- Delete historical, corrected, withdrawn or superseded versions.

## Delivery order

### 1. Canonical taxonomy

Define one content ontology covering:

- Intelligence.
- Evidence.
- Power Mapping.
- Control Structure.
- Interpretation.
- Membership.
- Commercial.
- Trust and Legal.
- Internal Operations.
- Restricted material.
- Temporary migration-review states.

Define canonical content types, entity types, topic families, claim-presentation classes, access classes, route conventions and duplicate rules.

**Completion rule:** every downstream classifier uses the same taxonomy identifiers.

### 2. Public/private classification

Classify every inventoried item into:

- Public core.
- Public preview.
- Free registered private.
- Supporter €3 private.
- Intelligence €6 private.
- Research Pro €9 private.
- Separate product.
- Internal only.
- Restricted sensitive.

A paid target remains a public-preview route until locked-section logic and authentication pass.

**Completion rule:** every important item has explicit current visibility, target visibility, public-preview requirements, search decision, navigation decision and editorial owner.

### 3. Tier matrix

Create a deterministic matrix showing which fields, sections, tools, downloads and delivery channels are visible at each tier.

The matrix must preserve:

- Evidence status.
- Claim class.
- Public correction and withdrawal notices.
- Association boundaries.
- Speculation labels.
- Contradictory evidence affecting public claims.

**Completion rule:** no tier changes factual status, and higher tiers are cumulative.

### 4. Locked-section logic

Create fail-closed entitlement rules for private sections without activating them.

Required states:

- Anonymous.
- Registered.
- Supporter.
- Intelligence Member.
- Research Pro.
- Separate-product purchaser.
- Internal administrator.
- Restricted reviewer.

**Completion rule:** unauthorized access receives a safe preview or access-denied response; no private content leaks through feeds, search, source HTML, exports or API responses.

### 5. Preview generation

Generate isolated previews for:

- Public section hubs.
- Public evidence-bounded previews.
- Registered dashboards.
- Supporter dashboards.
- Intelligence dashboards.
- Research Pro dashboards.
- Internal review queues.
- Restricted-content review surfaces.

**Completion rule:** every target route and locked section can be reviewed before enforcement.

### 6. Redirect map

Map existing routes to canonical routes without activating redirects.

Each redirect decision records:

- Existing route.
- Canonical route.
- Redirect type.
- Inbound links.
- Search references.
- Navigation references.
- Historical value.
- Duplicate decision.
- Rollback route.

**Completion rule:** no important route becomes orphaned and no redirect loop exists.

### 7. Search-index repair

Build a canonical search document for every important item.

Required search states:

- Public index candidate.
- Public-preview index candidate.
- Authenticated noindex.
- Internal noindex.
- Restricted noindex.
- Historical archive index or noindex decision.

Search results must respect access boundaries and still expose public corrections, evidence boundaries and upgrade routes.

**Completion rule:** every important public item is discoverable, every private item is represented safely, and obsolete duplicate routes do not compete with canonical routes.

### 8. Related-content links

Generate evidence-led relationships between:

- Records and sources.
- Records and entities.
- Entities and institutions.
- Investigations and dossiers.
- Daily items and weekly synthesis.
- Factual conclusions and counter-analysis.
- Graph hints and their supporting or missing records.
- Current versions and historical versions.

**Completion rule:** no important item is isolated from section navigation or related-content discovery.

### 9. Entity and topic tagging

Assign canonical entity IDs and controlled topic IDs.

Tags must distinguish:

- Documented entity role.
- Documented association.
- Speculative research hint.
- Historical association.
- Allegation or disputed claim.
- Source custodian.
- Authority holder.
- Beneficiary or affected party.

**Completion rule:** tagging improves discovery without turning proximity or association into guilt or control.

## Duplicate handling

Potential duplicates are reviewed, not deleted automatically.

The following are not duplicates merely because they share a basename or subject:

- Public preview and member depth.
- Current and historical version.
- Correction and prior version.
- Source record and investigation using the source.
- Entity profile and entity timeline.
- Graph hint and documented relationship.

Consolidation requires canonical ownership, evidence preservation, inbound-link review, search review, navigation review, redirect planning and rollback capability.

## Migration review states

- inventory_only
- taxonomy_assigned
- privacy_classified
- tier_assigned
- preview_generated
- redirect_planned
- search_repaired
- related_content_linked
- entity_topic_tagged
- ready_for_review
- approved_for_migration
- migrated
- verified

## Activation boundary

No live migration begins until the complete report-only migration package is deterministic, non-mutating and reviewed. Authentication, email, dashboards and payment activation remain separately gated.
