const { asArray, recordDescriptor } = require('./core');

function setConvergenceBoundary(generated, cap, boundaryText) {
  generated.convergence.cap = Math.min(Number(generated.convergence.cap ?? cap), cap);
  generated.convergence.vectors = asArray(generated.convergence.vectors).map(vector => ({
    ...vector,
    score: Math.min(Number(vector.score || 0), cap),
    cap: Math.min(Number(vector.cap ?? cap), cap),
    coordinationStatus: 'not_shown',
    rationale: boundaryText,
    confidence: 'very_low'
  }));
  generated.convergence.totalScore = generated.convergence.vectors.reduce((sum, vector) => sum + Number(vector.score || 0), 0);
  generated.convergence.activeVectors = generated.convergence.vectors.filter(vector => Number(vector.score || 0) > 0).length;
}

function enforceRelationshipBoundary(record, generated, policy) {
  const subject = recordDescriptor(record);
  generated.evidenceBasedConclusion.candidateText = `The graph preserves “${subject}” as a speculative research hint. Association, shared attendance, proximity or network placement does not establish wrongdoing, control, causation, coordination or a power mechanism.`;
  generated.evidenceBasedConclusion.claimClass = 'speculative_interpretation';
  generated.evidenceBasedConclusion.confidence = 'very_low';
  generated.mechanism.status = 'unestablished';
  generated.mechanism.candidateText = `No external power mechanism is established by the graph association in “${subject}.” Primary records must independently document authority, ownership, payment, access, implementation or protection.`;
  generated.mechanism.missingLink = 'The graph edge lacks an independently sourced authority and implementation chain.';
  generated.mission.outcome = 'insufficient_evidence';
  generated.mission.candidateText = `“${subject}” is retained because it may identify a useful research route, but the graph association does not yet support a factual mission or elite-control conclusion.`;
  generated.mission.eliteControl.status = 'not_established';
  generated.mission.eliteControl.coordinationStatus = 'not_shown';
  generated.mission.eliteControl.boundary = 'Graph association is not proof of coordination, control, wrongdoing or guilt.';
  setConvergenceBoundary(generated, policy.convergenceRules.relationshipMaximum, 'This vector remains at zero because a graph association is a speculative research hint, not documented convergence movement.');
  generated.speculativeConclusion.label = policy.requiredSeparation.speculationLabel;
  generated.speculativeConclusion.text = `Speculatively, the graph hint in “${subject}” could become mission-relevant if independent primary records establish a repeatable authority, money, access, ownership or implementation route. Until then it remains association only.`;
  generated.speculativeConclusion.confidence = 'very_low';
  generated.speculativeConclusion.boundary = 'Speculative research hint. Association is not proof and this is not established fact.';
  return generated;
}

function enforceScenarioBoundary(record, generated, policy) {
  const subject = recordDescriptor(record);
  generated.evidenceBasedConclusion.candidateText = `“${subject}” is a speculative scenario analysis produced by the site, not an external factual finding or a certain forecast.`;
  generated.evidenceBasedConclusion.claimClass = 'scenario_analysis';
  generated.evidenceBasedConclusion.confidence = 'very_low';
  generated.mechanism.status = 'analytical_model';
  generated.mission.outcome = 'insufficient_evidence';
  generated.mission.candidateText = `The scenario “${subject}” is retained to test possible mission-relevant pathways, but it cannot establish that the modelled authorities, implementation routes or convergence outcome will occur.`;
  generated.mission.eliteControl.status = 'model_only';
  generated.mission.eliteControl.coordinationStatus = 'not_shown';
  setConvergenceBoundary(generated, policy.convergenceRules.scenarioMaximum, 'This score represents a speculative scenario route only and cannot be reported as documented convergence movement.');
  generated.speculativeConclusion.label = policy.requiredSeparation.speculationLabel;
  generated.speculativeConclusion.confidence = 'very_low';
  generated.speculativeConclusion.boundary = 'Speculative scenario analysis. This is not an established fact or factual forecast.';
  return generated;
}

function enforceSpeculationBoundary(record, generated, policy) {
  const subject = recordDescriptor(record);
  generated.evidenceBasedConclusion.candidateText = `“${subject}” is retained as a speculative interpretation. It does not establish the proposed control, coordination or convergence mechanism as fact.`;
  generated.evidenceBasedConclusion.claimClass = 'speculative_interpretation';
  generated.evidenceBasedConclusion.confidence = 'very_low';
  if (generated.mechanism.status === 'documented') generated.mechanism.status = 'partially_documented';
  generated.mission.outcome = 'insufficient_evidence';
  generated.mission.candidateText = `The interpretation “${subject}” may guide research into the site mission, but it remains speculative until primary records establish a concrete authority and implementation route.`;
  generated.mission.eliteControl.coordinationStatus = 'not_shown';
  setConvergenceBoundary(generated, policy.recordTypeRules.speculation_review.maxConvergenceScore, 'This score is a speculative research indicator only and is not documented convergence movement.');
  generated.speculativeConclusion.label = policy.requiredSeparation.speculationLabel;
  generated.speculativeConclusion.confidence = 'very_low';
  generated.speculativeConclusion.boundary = 'Speculative interpretation. This is not established fact.';
  return generated;
}

function enforceInterpretiveBoundaries(record, generated, policy) {
  if (record.recordType === 'relationship_update') return enforceRelationshipBoundary(record, generated, policy);
  if (record.recordType === 'scenario' || record.evidence?.claimClass === 'scenario_analysis') return enforceScenarioBoundary(record, generated, policy);
  if (record.recordType === 'speculation_review' || record.evidence?.claimClass === 'speculative_interpretation') return enforceSpeculationBoundary(record, generated, policy);
  generated.speculativeConclusion.label = policy.requiredSeparation.speculationLabel;
  return generated;
}

module.exports = { setConvergenceBoundary, enforceRelationshipBoundary, enforceScenarioBoundary, enforceSpeculationBoundary, enforceInterpretiveBoundaries };
