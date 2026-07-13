const { normalized, tokens, jaccard, getPath, dateAgeDays, sourceAuthority, sourceIds, recordSpecificTerms, containsAny } = require('./core');

function minConfidence(a, b, policy) { const order = policy.confidence.order; const ai = order.indexOf(a); const bi = order.indexOf(b); if (ai < 0) return b; if (bi < 0) return a; return order[Math.min(ai, bi)]; }
function candidateFieldValue(generated, fieldPath) {
  const map = {
    'solidConclusion.text': generated.evidenceBasedConclusion.candidateText,
    'mechanismOfPower.description': generated.mechanism.candidateText,
    'missionAssessment.missionRelevance': generated.mission.candidateText,
    'speculativeConclusion.text': generated.speculativeConclusion.text,
    'counterAnalysis.assessment': generated.counterAndMissing.counterHypothesis.candidateAssessment
  };
  return map[fieldPath] || '';
}
function inspectTextSet(record, fields, repeatCounts, mechanismStatus, useCandidate, policy) {
  const conclusion = fields['solidConclusion.text'] || '';
  const titleOverlap = jaccard(record.title, conclusion);
  const summaryOverlap = jaccard(record.summary, conclusion);
  const specificTerms = recordSpecificTerms(record);
  const conclusionTokens = new Set(tokens(conclusion, true));
  const recordSpecificTokenCount = specificTerms.filter(term => conclusionTokens.has(term)).length;
  const genericMatches = containsAny([fields['solidConclusion.text'], fields['mechanismOfPower.description'], fields['missionAssessment.missionRelevance']].join(' '), policy.genericPhrases);
  const certaintyMatches = containsAny([fields['solidConclusion.text'], fields['missionAssessment.missionRelevance'], fields['speculativeConclusion.text']].join(' '), policy.unsupportedCertaintyTerms);
  const fieldEqualities = [];
  for (const [left, right] of policy.specificity.fieldEqualityForbidden) if (normalized(fields[left]) && normalized(fields[left]) === normalized(fields[right])) fieldEqualities.push(`${left}=${right}`);
  const flags = [];
  if (tokens(conclusion).length < policy.specificity.minimumConclusionTokens) flags.push('conclusion_too_short');
  if (titleOverlap > policy.specificity.titleConclusionJaccardMaximum) flags.push('headline_restated_as_conclusion');
  if (summaryOverlap > policy.specificity.summaryConclusionJaccardMaximum) flags.push('summary_restated_as_conclusion');
  if (recordSpecificTokenCount < policy.specificity.minimumRecordSpecificTokens) flags.push('conclusion_lacks_record_specific_terms');
  if (Object.values(repeatCounts).some(count => count >= policy.specificity.exactRepeatMinimumRecords)) flags.push('exact_boilerplate_repetition');
  if (fieldEqualities.length) flags.push('analysis_fields_not_distinct');
  if (certaintyMatches.length) flags.push('unsupported_certainty_language');
  if (genericMatches.length && mechanismStatus === 'unestablished' && !useCandidate) flags.push('generic_control_language_without_mechanism');
  return { titleOverlap, summaryOverlap, recordSpecificTokenCount, genericMatches, certaintyMatches, fieldEqualities, repeatCounts, flags };
}
function qualityAnalysis(record, generated, sourceExactCounts, candidateExactCounts, policy) {
  const fieldPaths = Object.keys(sourceExactCounts);
  const sourceFields = Object.fromEntries(fieldPaths.map(fieldPath => [fieldPath, getPath(record, fieldPath) || '']));
  const candidateFields = Object.fromEntries(fieldPaths.map(fieldPath => [fieldPath, candidateFieldValue(generated, fieldPath)]));
  const sourceRepeatCounts = Object.fromEntries(fieldPaths.map(fieldPath => [fieldPath, sourceExactCounts[fieldPath][normalized(sourceFields[fieldPath])] || 0]));
  const candidateRepeatCounts = Object.fromEntries(fieldPaths.map(fieldPath => [fieldPath, candidateExactCounts[fieldPath][normalized(candidateFields[fieldPath])] || 0]));
  return { source: inspectTextSet(record, sourceFields, sourceRepeatCounts, generated.mechanism.status, false, policy), candidate: inspectTextSet(record, candidateFields, candidateRepeatCounts, generated.mechanism.status, true, policy) };
}

function presentationClass(record) {
  const claimClass = record.evidence?.claimClass || 'unsupported_claim';
  if (record.recordType === 'relationship_update') return 'research_hint';
  if (record.recordType === 'scenario' || claimClass === 'scenario_analysis') return 'scenario_analysis';
  if (record.recordType === 'speculation_review' || claimClass === 'speculative_interpretation') return 'speculative';
  if (claimClass === 'disputed_claim') return 'disputed';
  if (claimClass === 'unsupported_claim') return 'unsupported';
  return 'evidence_analysis';
}

function retentionStatus(record, policy) {
  if (record.status === 'withdrawn') return policy.retentionRules.withdrawn;
  if (record.freshness?.supersededBy) return policy.retentionRules.superseded;
  if (record.status === 'archived') return policy.retentionRules.archived;
  return policy.retentionRules[record.recordType] || policy.retentionRules.default;
}

function gateAnalysis(record, generated, quality, policy, now) {
  const claimClass = record.evidence?.claimClass || 'unsupported_claim';
  const claimRule = policy.claimRules[claimClass] || policy.claimRules.unsupported_claim;
  const authority = sourceAuthority(record);
  const currentConfidence = record.solidConclusion?.confidence || record.evidence?.confidence || 'very_low';
  const recommendedConfidence = minConfidence(currentConfidence, claimRule.maxConfidence, policy);
  const ageDays = dateAgeDays(record.freshness?.lastReviewedAt || record.freshness?.updatedAt, now);
  const freshnessLimit = policy.freshnessDays[authority] ?? policy.freshnessDays[claimClass] ?? policy.freshnessDays[record.recordType] ?? policy.freshnessDays.default;
  const stale = ageDays === null || ageDays > freshnessLimit;
  const classification = presentationClass(record);
  const presentationPolicy = policy.presentationClasses[classification] || policy.presentationClasses.unsupported;
  const gates = {
    fact_speculation_separation: record.speculativeConclusion?.label === policy.requiredSeparation.speculationLabel && Boolean(record.solidConclusion?.boundary) && Boolean(record.speculativeConclusion?.boundary),
    source_and_claim_compatibility: sourceIds(record).length > 0 && (!claimRule.requiresPrimary || authority === 'primary'),
    mechanism_specificity: ['documented','partially_documented','analytical_model'].includes(generated.mechanism.status) && !quality.candidate.fieldEqualities.includes('solidConclusion.text=mechanismOfPower.description'),
    mission_specificity: Boolean(record.missionAssessment?.boundary) && !quality.candidate.fieldEqualities.includes('solidConclusion.text=missionAssessment.missionRelevance'),
    counter_hypothesis: generated.counterAndMissing.counterHypothesis.alternativeExplanations.length > 0,
    missing_evidence_and_falsifiers: generated.counterAndMissing.missingEvidence.length > 0 && generated.counterAndMissing.falsifiers.length > 0,
    repetition_and_generic_language: !quality.candidate.flags.some(flag => ['headline_restated_as_conclusion','summary_restated_as_conclusion','exact_boilerplate_repetition','analysis_fields_not_distinct','unsupported_certainty_language','generic_control_language_without_mechanism'].includes(flag)),
    confidence_cap: currentConfidence === recommendedConfidence,
    freshness: !stale && record.freshness?.reviewStatus === 'current',
    correction_and_supersession: !record.freshness?.supersededBy && !['withdrawn','archived'].includes(record.status),
    convergence_discipline: generated.convergence.vectors.every(vector => vector.score <= vector.cap && (vector.coordinationStatus !== 'documented' || authority === 'primary'))
  };
  const failed = Object.entries(gates).filter(([, pass]) => !pass).map(([name]) => name);
  let state = 'publishable_preview';
  if (record.status === 'withdrawn') state = 'withdrawn';
  else if (record.freshness?.supersededBy) state = 'superseded';
  else if (stale) state = 'stale';
  else if (!gates.fact_speculation_separation || !gates.repetition_and_generic_language) state = 'needs_editorial_review';
  else if (!gates.source_and_claim_compatibility || generated.mechanism.status === 'unestablished' || !claimRule.canPublish) state = 'needs_evidence';
  else if (failed.length) state = 'review';
  const retainedAs = retentionStatus(record, policy);
  const labelledResearchSurfaceEligible = presentationPolicy.speculativeSurfaceEligible && gates.fact_speculation_separation && !['withdrawn','superseded'].includes(state);
  const factualSurfaceEligible = presentationPolicy.factualSurfaceEligible && state === 'publishable_preview';
  return {
    gates,
    failed,
    state,
    currentConfidence,
    recommendedConfidence,
    confidenceDowngradeRequired: currentConfidence !== recommendedConfidence,
    ageDays,
    freshnessLimitDays: freshnessLimit,
    stale,
    sourceAuthority: authority,
    claimClass,
    evidenceGrade: record.evidence?.grade || 'ungraded',
    presentation: {
      class: classification,
      label: presentationPolicy.label,
      retained: true,
      retainedAs,
      removalProhibited: true,
      factualSurfaceEligible,
      speculativeOrResearchSurfaceEligible: labelledResearchSurfaceEligible,
      factualBoundary: factualSurfaceEligible ? 'Eligible only as evidence analysis after all gates pass.' : 'Not eligible for presentation as established fact.',
      researchBoundary: labelledResearchSurfaceEligible ? `Retained and displayable only with the explicit label “${presentationPolicy.label}”.` : 'Retained for archive and editorial review but not currently deliverable.'
    }
  };
}

module.exports = { minConfidence, candidateFieldValue, inspectTextSet, qualityAnalysis, presentationClass, retentionStatus, gateAnalysis };
