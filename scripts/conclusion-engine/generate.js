const { asArray, text, unique, containsAny, sourceAuthority, sourceIds, recordDescriptor, recordSourceLabel, recordStatusLabel, firstFact, existingVectorMap } = require('./core');

function generatedEvidenceConclusion(record) {
  const subject = recordDescriptor(record);
  const claimClass = record.evidence?.claimClass || 'unsupported_claim';
  const source = recordSourceLabel(record);
  const status = recordStatusLabel(record);
  if (claimClass === 'official_finding' || claimClass === 'established_fact') return `The cited ${source} record, “${subject},” is classified as ${status} and supports only the official or adjudicated outcome described in that record.`;
  if (record.recordType === 'signal' || sourceAuthority(record) === 'lead_only' && claimClass !== 'scenario_analysis') return `“${subject}” is a lead from ${source}. Until the underlying primary record is reviewed, it supports no conclusion about wrongdoing, causation, coordination or a wider control system.`;
  if (record.trigger?.changeType === 'source_changed' || String(record.id).startsWith('source-change-')) return `The preserved source associated with “${subject}” changed between captures. The change is documented at the source level, but its cause, intent and wider significance are not established.`;
  if (record.recordType === 'relationship_update') return `The graph proposes “${subject}” as a research hint. No documented relationship or power mechanism is established by this record.`;
  if (claimClass === 'scenario_analysis' || record.recordType === 'scenario' || record.recordType === 'brief') return `“${subject}” is a site analysis or scenario, not an external factual finding. It identifies a research route that remains subject to source verification and counter-analysis.`;
  return firstFact(record) || record.solidConclusion?.text || `The current record supports only the limited conclusion stated by ${source}.`;
}

function mechanismAnalysis(record, policy) {
  const subject = recordDescriptor(record);
  const description = record.mechanismOfPower?.description || '';
  const routeText = [description, ...asArray(record.mechanismOfPower?.implementationRoute), ...asArray(record.moneyAndAuthority)].map(text).join(' ');
  const dimensions = [];
  for (const [dimension, terms] of Object.entries(policy.mechanismDimensions)) if (containsAny(routeText, terms).length) dimensions.push(dimension);
  const genericMarkers = containsAny(description, ['no external mechanism is established', 'remains unestablished', 'routed into a source review lane', 'track the chain', 'actual power mechanism must be established']);
  const explicitRoutes = asArray(record.moneyAndAuthority).filter(route => route && route.routeType && route.description);
  const authorityHolders = asArray(record.mechanismOfPower?.authorityHolder);
  const implementationRoutes = asArray(record.mechanismOfPower?.implementationRoute);
  const evidenceBasis = asArray(record.mechanismOfPower?.evidenceBasis);
  const affectedGroups = asArray(record.mechanismOfPower?.affectedGroups);
  const claimClass = record.evidence?.claimClass;
  const primary = sourceAuthority(record) === 'primary';
  const officialRoute = primary && ['established_fact','official_finding'].includes(claimClass) && authorityHolders.length && implementationRoutes.length && evidenceBasis.length;
  const documentedSourceChange = primary && (record.trigger?.changeType === 'source_changed' || String(record.id).startsWith('source-change-')) && evidenceBasis.length;
  const modelOnly = claimClass === 'scenario_analysis' || ['scenario','brief'].includes(record.recordType);
  let status = 'unestablished';
  if (explicitRoutes.length && primary && ['established_fact','official_finding','documented_association'].includes(claimClass)) status = 'documented';
  else if (officialRoute || documentedSourceChange) status = 'documented';
  else if (modelOnly) status = 'analytical_model';
  else if (!genericMarkers.length && dimensions.length && evidenceBasis.length) status = 'partially_documented';
  let candidateText;
  if (status === 'documented' && explicitRoutes.length) candidateText = `The documented power route in “${subject}” operates through ${unique(explicitRoutes.map(route => route.routeType.replaceAll('_',' '))).join(', ')} under the authority identified in the cited record.`;
  else if (status === 'documented') candidateText = `The documented mechanism in “${subject}” is the formal authority, regulatory, judicial or source-control route reflected in the cited primary record and exercised by ${authorityHolders.join(', ')}. This establishes that accountability route only, not a wider control structure.`;
  else if (status === 'analytical_model') candidateText = `“${subject}” describes a site analysis workflow rather than an external power mechanism. Its value is to identify records and tests required before a real-world authority or implementation route can be claimed.`;
  else if (status === 'partially_documented') candidateText = `The current record identifies a possible mechanism through ${dimensions.join(', ')}. The route remains limited to the authority and implementation evidence cited in “${subject}.”`;
  else candidateText = `No external power mechanism is established for “${subject}.” A stronger conclusion requires primary records showing authority, ownership, payment, contract, mandate, access, data control or implementation.`;
  const fundingOwnershipRoutes = explicitRoutes.filter(route => ['ownership','beneficial_ownership','contract','payment','grant','lobbying','procurement','proxy_vote'].includes(route.routeType));
  const enforcementOrComplianceRoutes = unique(implementationRoutes.filter(route => containsAny(route, ['enforcement','compliance','sanction','eligibility','access','mandate','order','police','security']).length));
  const accountabilityAndOversightRoutes = unique([
    ...authorityHolders,
    ...explicitRoutes.filter(route => ['legal_authority','regulatory_action','office','custody'].includes(route.routeType)).map(route => route.description)
  ]);
  return {
    status,
    candidateText,
    dimensions,
    authorityHolders,
    implementationRoutes,
    affectedGroups,
    enforcementOrComplianceRoutes,
    fundingOwnershipRoutes,
    accountabilityAndOversightRoutes,
    observableEffect: firstFact(record) || record.trigger?.description || '',
    explicitMoneyAndAuthorityRoutes: explicitRoutes,
    evidenceBasis,
    limitation: record.mechanismOfPower?.limitation || '',
    missingLink: status === 'unestablished' ? 'A primary record connecting an identifiable authority to an implementation route and observable effect is missing.' : record.mechanismOfPower?.limitation || '',
    genericMarkers
  };
}

function actorGroups(record) {
  const publicTypes = new Set(['government','agency','court','regulator','international_body']);
  const privateTypes = new Set(['person','company','bank','fund','foundation','ngo','contractor','media','religious_body','technology_platform']);
  const publicActors = [];
  const privateActors = [];
  const otherActors = [];
  for (const entity of asArray(record.entities)) {
    const label = entity.name || entity.id;
    if (!label) continue;
    if (publicTypes.has(entity.entityType)) publicActors.push(label);
    else if (privateTypes.has(entity.entityType)) privateActors.push(label);
    else otherActors.push(label);
  }
  return { publicActors: unique(publicActors), privateActors: unique(privateActors), otherActors: unique(otherActors) };
}

function missionAnalysis(record, mechanism) {
  const subject = recordDescriptor(record);
  const outcome = record.missionAssessment?.outcome || 'insufficient_evidence';
  let candidateText;
  if (outcome === 'direct_support') candidateText = `The records directly support a mission-relevant concentration or control mechanism in “${subject},” limited to the documented authority, implementation and affected scope.`;
  else if (outcome === 'indirect_support') candidateText = `“${subject}” indirectly supports the mission by identifying a documented capacity or convergence route, but it does not establish coordinated intent or a unified programme.`;
  else if (outcome === 'contextual_connection') candidateText = `“${subject}” is relevant as contextual evidence for an accountability or institutional map. It does not by itself establish elite coordination, global convergence or a one-world programme.`;
  else if (outcome === 'contradictory_evidence') candidateText = `“${subject}” weakens or narrows a prior mission hypothesis and must remain visible wherever the affected claim appears.`;
  else candidateText = `No mission conclusion is currently supportable from “${subject}.” The record remains a research lead until a concrete authority, money, access, ownership or implementation route is documented.`;
  const coordinationStatus = asArray(record.missionAssessment?.convergenceVectors).some(vector => vector.coordinationStatus === 'documented') && sourceAuthority(record) === 'primary' ? 'documented' : 'not_shown';
  const eliteStatus = mechanism.status === 'documented' && mechanism.dimensions.length ? 'documented_concentration_route' : mechanism.status === 'partially_documented' ? 'possible_concentration_route' : mechanism.status === 'analytical_model' ? 'model_only' : 'not_established';
  const actors = actorGroups(record);
  const beneficiaryEntities = asArray(record.entities).filter(entity => /beneficiar|recipient|owner|awardee|contractor/i.test(entity.role || '')).map(entity => entity.name).filter(Boolean);
  return {
    outcome,
    candidateText,
    originalRelevance: record.missionAssessment?.missionRelevance || '',
    supportingEvidence: mechanism.evidenceBasis,
    weakeningEvidence: asArray(record.counterAnalysis?.contradictoryEvidence),
    eliteControl: {
      status: eliteStatus,
      concentrationDimensions: mechanism.dimensions,
      beneficiaries: unique(beneficiaryEntities),
      affectedParties: mechanism.affectedGroups,
      publicActors: actors.publicActors,
      privateActors: actors.privateActors,
      otherActors: actors.otherActors,
      publicPrivateRoute: actors.publicActors.length && actors.privateActors.length ? 'public_private_overlap_identified' : 'not_established',
      coordinationStatus,
      accountabilityGap: mechanism.status === 'unestablished' ? 'The record does not yet identify a complete authority, implementation and oversight chain.' : record.mechanismOfPower?.limitation || '',
      legitimateAlternative: 'The documented activity may reflect ordinary administration, enforcement, commercial operation or institutional coordination rather than a hidden command structure.',
      boundary: record.missionAssessment?.boundary || ''
    },
    confidence: record.missionAssessment?.overallConfidence || 'very_low',
    boundary: record.missionAssessment?.boundary || ''
  };
}

function convergenceAnalysis(record, policy) {
  const existing = existingVectorMap(record);
  const recordRule = policy.recordTypeRules[record.recordType] || { maxConvergenceScore: 1 };
  const grade = record.evidence?.grade || 'ungraded';
  const authority = sourceAuthority(record);
  const scenarioOnly = record.evidence?.claimClass === 'scenario_analysis';
  let cap = recordRule.maxConvergenceScore;
  if (grade === 'ungraded') cap = Math.min(cap, policy.convergenceRules.ungradedMaximum);
  if (scenarioOnly) cap = Math.min(cap, policy.convergenceRules.scenarioMaximum);
  else if (authority === 'lead_only') cap = Math.min(cap, policy.convergenceRules.leadOnlyMaximum);
  if (record.recordType === 'relationship_update') cap = Math.min(cap, policy.convergenceRules.relationshipMaximum);
  const vectors = policy.convergenceVectors.map(vectorName => {
    const original = existing.get(vectorName);
    const originalScore = Number(original?.score || 0);
    const score = Math.max(policy.convergenceRules.minimum, Math.min(policy.convergenceRules.maximum, cap, originalScore));
    const coordinationStatus = original?.coordinationStatus === 'documented' && sourceAuthority(record) === 'primary' && policy.convergenceRules.documentedCoordinationRequiresClaimClass.includes(record.evidence?.claimClass) ? 'documented' : 'not_shown';
    return {
      vector: vectorName,
      score,
      originalScore,
      cap,
      coordinationStatus,
      evidenceBasis: asArray(original?.evidenceBasis),
      rationale: original?.rationale || (score === 0 ? 'No evidence-bounded movement on this vector is established by the current record.' : 'The current record identifies a limited research route.'),
      alternativeExplanation: 'The observed development may reflect ordinary policy, compliance, interoperability, administration, market incentives or isolated conduct rather than coordinated global convergence.',
      confidence: original?.confidence || 'very_low',
      upgradeCondition: `Primary records must document a concrete ${vectorName.replaceAll('_',' ')} authority or implementation route beyond the current evidence.`,
      downgradeCondition: 'A correction, superseding record, failed implementation or counter-record would reduce or remove this score.'
    };
  });
  return { cap, vectors, totalScore: vectors.reduce((sum, vector) => sum + vector.score, 0), activeVectors: vectors.filter(vector => vector.score > 0).length };
}

function generatedSpeculativeConclusion(record) {
  const subject = recordDescriptor(record);
  const claimClass = record.evidence?.claimClass || 'unsupported_claim';
  if (record.recordType === 'relationship_update') return `The hinted route in “${subject}” could become mission-relevant only if primary records establish a repeatable authority, ownership, payment, access or implementation connection. The current graph hint does not establish that connection.`;
  if (record.recordType === 'signal' || sourceAuthority(record) === 'lead_only' && claimClass !== 'scenario_analysis') return `A wider mission interpretation of “${subject}” would become plausible only if the underlying primary record confirms the reported development and documents a concrete power mechanism. At present that interpretation is unproven.`;
  if (claimClass === 'scenario_analysis' || ['scenario','brief'].includes(record.recordType)) return `The scenario “${subject}” could indicate a future convergence route only if later records document the stated authority, implementation and cross-institutional links. The current output is a modelled research hypothesis, not a factual forecast.`;
  return `A broader control interpretation of “${subject}” would become more plausible only if later records show repeatable cross-institutional authority, funding, implementation or protection beyond the cited event. The current record does not establish that.`;
}

function inferCustodian(record) {
  const primary = asArray(record.sources).find(source => source.authority === 'primary') || asArray(record.sources)[0] || {};
  return primary.publisher || primary.title || asArray(record.mechanismOfPower?.authorityHolder)[0] || 'The originating agency, court, regulator, company or records custodian';
}

function lawfulRoutes(record, requestRoute) {
  const statuses = new Set(asArray(record.recordStatus));
  const routes = [];
  if (requestRoute) routes.push(requestRoute);
  if ([...statuses].some(status => ['final_judgment','conviction','guilty_plea','sentence','charge_or_indictment','filing'].includes(status))) routes.push('Court docket, court clerk or official judgment repository');
  if ([...statuses].some(status => ['regulator_order','law_or_regulation','official_dataset','official_report','audit_finding'].includes(status))) routes.push('Official publication portal or public-record request to the issuing authority');
  if ([...statuses].some(status => ['contract'].includes(status)) || asArray(record.moneyAndAuthority).some(route => ['contract','procurement','payment','grant'].includes(route.routeType))) routes.push('Procurement portal, contract register, audit record or public-record request');
  if ([...statuses].some(status => ['declassified_record'].includes(status))) routes.push('Declassification archive or freedom-of-information request');
  if ([...statuses].some(status => ['authenticated_leak','unverified_leak'].includes(status))) routes.push('Authentication through the originating custodian, metadata chain and independent corroboration');
  if (!routes.length) routes.push('Official publication, public-record request or direct records-custodian inquiry');
  return unique(routes);
}

function evidenceIndicators(effectIfFound) {
  const confirmation = effectIfFound === 'falsify' || effectIfFound === 'contradict'
    ? ['The requested record directly contradicts the current mechanism, authority, timing or claimed relationship.']
    : ['The requested record identifies the same authority, parties, action, timing and implementation route described in the current conclusion.'];
  const falsification = effectIfFound === 'falsify' || effectIfFound === 'contradict'
    ? ['The requested record instead confirms the current mechanism and resolves the alleged contradiction.']
    : ['The requested record attributes the event to a different authority, shows no proposed mechanism, or documents that the proposed route was not implemented.'];
  return { confirmation, falsification };
}

function enrichMissingEvidence(record, item) {
  const effectIfFound = item.effectIfFound || 'narrow';
  const indicators = evidenceIndicators(effectIfFound);
  return {
    record: item.record || text(item),
    whyItMatters: item.whyItMatters || 'This record could confirm, narrow, contradict or falsify the current conclusion.',
    effectIfFound,
    likelyCustodian: item.likelyCustodian || inferCustodian(record),
    lawfulAcquisitionRoutes: unique([...(asArray(item.lawfulAcquisitionRoutes)), ...lawfulRoutes(record, item.requestRoute)]),
    confirmationIndicators: unique([...(asArray(item.confirmationIndicators)), ...indicators.confirmation]),
    falsificationIndicators: unique([...(asArray(item.falsificationIndicators)), ...indicators.falsification]),
    watchNextActions: unique([...(asArray(item.watchNextActions)), ...asArray(record.watchNext).map(watch => watch.indicator).filter(Boolean)]),
    requestRoute: item.requestRoute ?? null
  };
}

function buildCounterAndMissing(record, mechanism) {
  const subject = recordDescriptor(record);
  const alternatives = unique(asArray(record.counterAnalysis?.alternativeExplanations));
  if (!alternatives.length) alternatives.push('The development may reflect ordinary administration, isolated conduct, standard enforcement, commercial incentives or incomplete reporting rather than a wider control structure.');
  const missingEvidence = asArray(record.missingEvidence).map(item => enrichMissingEvidence(record, item));
  if (sourceAuthority(record) !== 'primary') missingEvidence.push(enrichMissingEvidence(record, { record: 'Underlying primary or official record', whyItMatters: 'A lead cannot support a factual or mission conclusion until the underlying record is reviewed.', effectIfFound: 'confirm', requestRoute: null }));
  if (mechanism.status === 'unestablished') missingEvidence.push(enrichMissingEvidence(record, { record: 'Authority, ownership, payment, contract, mandate, access, data-control or implementation record', whyItMatters: 'This is required to establish how power operates rather than merely naming associated entities.', effectIfFound: 'upgrade', requestRoute: null }));
  const falsifiers = unique([...asArray(record.speculativeConclusion?.falsifiers), ...asArray(record.watchNext).map(item => item.downgradeCondition)]);
  if (!falsifiers.length) falsifiers.push('A correction, superseding primary record or failed mechanism would falsify or materially narrow the interpretation.');
  const establishedStatements = asArray(record.establishedFacts).map(fact => fact.statement).filter(Boolean);
  const contradictoryEvidence = asArray(record.counterAnalysis?.contradictoryEvidence);
  return {
    counterHypothesis: {
      alternativeExplanations: alternatives,
      contradictoryEvidence,
      evidenceForAlternative: contradictoryEvidence,
      evidenceAgainstAlternative: establishedStatements,
      evidenceRequired: missingEvidence.map(item => ({ record: item.record, likelyCustodian: item.likelyCustodian, lawfulAcquisitionRoutes: item.lawfulAcquisitionRoutes })),
      sourceIdsReviewed: sourceIds(record),
      assessment: record.counterAnalysis?.assessment || 'The current evidence does not eliminate ordinary or non-coordinated explanations.',
      candidateAssessment: `For “${subject},” the strongest competing explanation is ordinary administration, isolated conduct, standard enforcement, commercial incentives, incomplete reporting or model artefact rather than a coordinated wider control structure.`
    },
    missingEvidence,
    falsifiers,
    watchNext: asArray(record.watchNext)
  };
}

function generateRecordAnalysis(record, policy) {
  const evidenceBasedConclusion = {
    candidateText: generatedEvidenceConclusion(record),
    existingText: record.solidConclusion?.text || '',
    scope: record.solidConclusion?.scope || '',
    sourceIds: sourceIds(record),
    claimClass: record.evidence?.claimClass || 'unsupported_claim',
    evidenceGrade: record.evidence?.grade || 'ungraded',
    confidence: record.solidConclusion?.confidence || record.evidence?.confidence || 'very_low',
    boundary: record.solidConclusion?.boundary || ''
  };
  const mechanism = mechanismAnalysis(record, policy);
  const mission = missionAnalysis(record, mechanism);
  const convergence = convergenceAnalysis(record, policy);
  const counterAndMissing = buildCounterAndMissing(record, mechanism);
  const speculativeConclusion = {
    label: 'speculative',
    text: generatedSpeculativeConclusion(record),
    existingText: record.speculativeConclusion?.text || '',
    conditions: asArray(record.speculativeConclusion?.conditions),
    falsifiers: counterAndMissing.falsifiers,
    confidence: record.speculativeConclusion?.confidence || 'very_low',
    boundary: record.speculativeConclusion?.boundary || 'This interpretation is speculative and is not established fact.'
  };
  return { evidenceBasedConclusion, mechanism, mission, convergence, speculativeConclusion, counterAndMissing };
}

module.exports = { generatedEvidenceConclusion, mechanismAnalysis, missionAnalysis, convergenceAnalysis, generatedSpeculativeConclusion, buildCounterAndMissing, generateRecordAnalysis };
