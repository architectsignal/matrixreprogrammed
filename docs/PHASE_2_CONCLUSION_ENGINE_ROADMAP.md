# Phase 2 — Rebuild the Conclusion Engine

## Locked objective

Ensure every important update contains a useful, evidence-bounded conclusion rather than generic synthesis.

The engine must explain what the records establish, how power operates, how the finding relates to the Matrix Reprogrammed mission, and what deeper interpretation may be considered without presenting speculation as fact.

## Non-negotiable exit condition

No published item can confuse documented fact, allegation, inference, model output or speculation.

A record must fail closed and remain unpublished when its evidence class, factual conclusion, speculative conclusion or public boundary cannot be distinguished reliably.

## Required deliverables

### 1. Evidence-based conclusion generator

Produce the strongest conclusion directly supported by the preserved evidence.

Required output:

- Conclusion text.
- Scope of the conclusion.
- Evidence grade.
- Claim class.
- Confidence score and label.
- Explicit boundary describing what the records do not establish.
- Supporting source IDs.
- Contradictory evidence affecting the conclusion.

The generator must not infer coordinated intent from proximity, association, shared membership, timing or model ranking alone.

### 2. Mechanism-of-power analysis

Explain the operational route rather than merely naming powerful entities.

Required output:

- Authority holder.
- Legal, financial, institutional, technological or informal authority.
- Implementation route.
- Affected population, market or institution.
- Enforcement or compliance mechanism.
- Funding and ownership route where evidenced.
- Accountability and oversight route.
- Observable effect.
- Missing link preventing a stronger conclusion.

### 3. Mission-link analysis

Explain exactly how the finding relates to the site mission.

Allowed mission outcomes:

- direct_support
- indirect_support
- contextual_connection
- contradictory_evidence
- insufficient_evidence

Required output:

- Mission relevance.
- Reason for the selected outcome.
- Evidence supporting the link.
- Evidence weakening the link.
- Boundary preventing overstatement.

### 4. Elite-control analysis

Assess whether the documented mechanism concentrates authority, access, information, money or enforcement power.

Required output:

- Type of concentration.
- Beneficiaries and affected parties where evidenced.
- Public, private and public-private actors.
- Accountability gap.
- Whether coordination is documented, inferred or absent.
- Legitimate operational explanation.
- Confidence and evidence boundary.

The analysis must distinguish elite influence, institutional convergence, regulatory capture, ordinary administration and proven coordination.

### 5. Convergence-vector scoring

Score relevance from 0 to 5 for:

1. Political governance.
2. Monetary control.
3. Digital identity and access.
4. Surveillance and data.
5. Emergency power.
6. Information and narrative.
7. Corporate-institutional convergence.
8. Security architecture.
9. Religious or ethical convergence.
10. Legal and regulatory convergence.

Each score requires:

- Evidence basis.
- Coordination status: documented, inferred or not shown.
- Alternative explanation.
- Upgrade condition.
- Downgrade condition.
- Confidence.

Unverified leads, relationship hints and scenario-only records cannot enter the convergence tracker as established movement.

### 6. Speculative conclusion

Produce a separately labelled deeper interpretation only when the factual record and missing evidence are already clear.

Required output:

- Permanent label: speculative.
- Speculative conclusion text.
- Conditions required for the scenario to be plausible.
- Falsifiers.
- Missing records.
- Confidence.
- Boundary stating that the interpretation is not established fact.

Speculation must never overwrite or visually merge with the evidence-based conclusion.

### 7. Counter-hypothesis

Generate the strongest reasonable competing explanation.

Required output:

- Alternative explanations.
- Conventional or innocent explanation.
- Evidence supporting each alternative.
- Evidence weakening each alternative.
- Assessment of which explanation currently fits best.
- What future evidence would change the assessment.

### 8. Missing-evidence and falsification section

Every important conclusion must show what is absent and how it could be disproved.

Required output:

- Missing record.
- Why it matters.
- Likely custodian.
- Lawful acquisition route.
- Confirmation indicator.
- Falsification indicator.
- Watch-next action.

### 9. Repetition and generic-language detection

Block low-value conclusions that merely restate the headline, repeat boilerplate or use generic control-language without evidence.

Detection requirements:

- Near-duplicate conclusion detection across the archive.
- Headline-to-conclusion similarity threshold.
- Reused paragraph and template-fragment detection.
- Generic phrase density.
- Unsupported certainty language.
- Unexplained references to elite control, one-world systems, convergence or coordination.
- Minimum record-specific entity, mechanism and evidence requirements.

A conclusion that fails originality or specificity checks must be regenerated or sent for editorial review.

### 10. Confidence and freshness gates

Publication eligibility depends on both evidential confidence and source freshness.

Required gates:

- Evidence grade threshold.
- Claim-class compatibility.
- Source-authority and corroboration checks.
- Primary-record presence where required.
- Last-reviewed date.
- Supersession and correction status.
- Contradictory-evidence review.
- Staleness threshold by source type.
- Confidence downgrade when records become stale or disputed.
- Automatic withdrawal from delivery surfaces when the conclusion is no longer safe.

## Required processing order

```text
Preserved source records
→ claim and record-status classification
→ established facts
→ evidence-based conclusion
→ mechanism-of-power analysis
→ mission-link analysis
→ elite-control analysis
→ convergence-vector scoring
→ counter-hypothesis
→ missing evidence and falsifiers
→ separately labelled speculative conclusion
→ repetition and generic-language checks
→ confidence and freshness gates
→ tier projection
→ publishing eligibility decision
```

## Publication states

- draft
- review
- publishable
- published
- needs_evidence
- needs_editorial_review
- stale
- downgraded
- superseded
- withdrawn

Only `publishable` records may enter live publishing after the later activation phase.

## Mandatory fail-closed rules

A record cannot become publishable when:

- The factual and speculative conclusions are not structurally separate.
- A source-backed boundary is missing.
- A person or organisation is linked only by association or graph proximity.
- A convergence score has no evidence basis or downgrade condition.
- The conclusion repeats generic language without a record-specific mechanism.
- Material contradictory evidence has not been addressed.
- The record is stale, superseded or legally corrected.
- Confidence cannot be explained from the evidence.
- The conclusion implies coordination that the sources do not establish.

## Implementation sequence after Phase 2B

1. Define conclusion-engine policy, output contracts and controlled vocabularies.
2. Build deterministic evidence and conclusion input normalisation.
3. Add evidence-based conclusion and mechanism analyzers.
4. Add mission, elite-control and convergence analyzers.
5. Add counter-hypothesis, missing-evidence and speculation analyzers.
6. Add repetition, generic-language and unsupported-certainty detection.
7. Add confidence, freshness, correction and supersession gates.
8. Run in report-only mode across all canonical records.
9. Compare new conclusions with current outputs and produce an editorial review queue.
10. Permit publishing only after the exit condition and regression suite pass.

## Safety boundary

This roadmap does not activate live publishing, authentication, entitlements, email delivery or payments. The conclusion engine must first run in report-only mode and preserve all current production files and routes.
