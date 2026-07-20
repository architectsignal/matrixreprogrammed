# AI Speculative Conclusions — Publication Policy

## Purpose

The AI Speculative Conclusions page is a quarantined public surface for machine-generated hypotheses. It must never be confused with verified intelligence, court findings, regulator findings, admissions, convictions or established fact.

## Mandatory label

Every item must be classified as:

`ai_speculative_conclusion`

Every item imported from an editorial or evidence review queue must also display:

`AUTO-PUBLISHED FROM REVIEW QUEUE — UNVERIFIED SPECULATION`

The page must state prominently that:

- the material is AI generated;
- it is a hypothesis, not a verdict;
- association is not guilt;
- appearing in a document does not establish misconduct;
- review-queue publication does not mean the item passed factual publication gates;
- later evidence may strengthen, weaken or reject the conclusion.

## Automatic publication scope

Automatic publication is permitted only to:

`ai-speculative-conclusions.html`

Every conclusion-engine item whose state is not `publishable_preview` is automatically published to this page as `unverified` speculation. Human approval is not required for publication in this quarantined lane.

Auto-published review items must retain:

- their original review state;
- their failed factual-publication gates;
- their record ID and record type;
- a confidence ceiling below factual territory;
- contrary evidence, missing proof, alternatives and falsifiers;
- `humanReviewed: false` until a review actually occurs;
- `criminalConductEstablished: false`.

They must not modify verified-evidence pages, entity records, court summaries, source-document pages, factual timelines, accusation surfaces, critical alarm rankings or confirmed conclusions.

## Required fields

Every published item must include:

1. Title.
2. AI hypothesis.
3. Status: evidence-supported, developing, unverified, weakened or rejected.
4. Confidence score and plain-language meaning.
5. Documented support or source leads.
6. Public source routes with locators.
7. Contrary or weakening evidence.
8. Missing records.
9. Alternative explanations.
10. Falsification conditions.
11. Generated date.
12. Human-review status.
13. Explicit boundary.
14. `criminalConductEstablished: false`.
15. For review-queue imports: publication state, review origin, failed gates and auto-publication date.

## Prohibited material

Automatic publication still rejects:

- private victim identities;
- minors’ identifying information;
- private addresses, phone numbers or personal contact data;
- credentials, recovery codes, private keys or seed phrases;
- intimate or exploitative material;
- illegal content or links to illegal content;
- doxxing;
- unsupported direct accusations;
- claims that convert association into guilt;
- statements that present allegations, investigative leads or witness claims as proven facts.

Weak evidence, failed gates, uncertainty or a lack of human review are **not** reasons to hide a review item. They are reasons to publish it only as visibly labelled unverified speculation.

## Named-person rule

A named person may appear only where a public record route is linked and the exact documented role is stated. The conclusion must not imply criminality merely because a person appears in an address book, flight log, email, photograph, event record, corporate filing, witness statement or court exhibit.

## Evidence standard

The AI may describe what a source records. It must distinguish:

- primary record;
- official release;
- court allegation;
- witness claim;
- regulator finding;
- secondary reporting;
- inference;
- speculation;
- unverified review-queue hypothesis.

A source route is not proof that the source’s underlying allegation is true.

## Reversibility

The system must preserve weakened and rejected hypotheses. This creates an auditable record of correction and prevents the page from becoming a one-way confirmation engine. Auto-published review items may be updated, weakened or rejected, but their earlier publication state remains auditable.

## Schema gate

The public feed must validate against:

`data/ai-speculative-conclusions.schema.json`

A malformed feed must fail closed. The page must display an unavailable message rather than inventing replacement conclusions.

## Relationship to the site mission

The page may explore whether documented systems, contracts, institutions, standards, funding routes and authority relationships form larger patterns. It must also publish evidence that weakens the Matrix Reprogrammed mission thesis when that is the stronger conclusion.

The required outcomes are:

- supports a bounded mission hypothesis;
- challenges a mission hypothesis;
- insufficient evidence;
- unverified review-queue speculation;
- weakened or rejected.

## Final boundary

The purpose is transparent hypothesis testing, not automated accusation. Review items are published rather than hidden, but they remain quarantined from factual surfaces. Source first. Claim second. Speculation unmistakably labelled.
