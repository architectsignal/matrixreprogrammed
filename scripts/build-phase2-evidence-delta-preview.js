const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const {
  readJson,
  asArray,
  stableJson,
  sha256,
  fingerprint,
  writeJson,
  writeText,
  safeSegment,
  sourceKey,
  factKey,
  differenceByKey,
  stringSetDifference,
  changedSections,
  maxSeverity,
  countBy
} = require('./evidence-delta/core');

const root = process.cwd();
const previousOverride = process.env.EVIDENCE_DELTA_PREVIOUS_PACKAGE || null;
const currentOverride = process.env.EVIDENCE_DELTA_CURRENT_PACKAGE || null;
const policyOverride = process.env.EVIDENCE_DELTA_POLICY || null;
const outputOverride = process.env.EVIDENCE_DELTA_OUTPUT_DIR || null;
const outputDir = outputOverride
  ? path.resolve(outputOverride)
  : path.join(root, 'downloads', 'phase2-evidence-delta-preview');
const policyPath = policyOverride
  ? path.resolve(policyOverride)
  : path.join(root, 'data', 'evidence-delta-policy.json');

function runCanonicalBundle() {
  const result = spawnSync(process.execPath, ['scripts/build-canonical-preview-bundle.js'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  if (result.status !== 0) {
    throw new Error(`Canonical bundle failed\n${result.stdout || ''}\n${result.stderr || ''}`);
  }
  process.stdout.write(result.stdout || '');
  return path.join(root, 'downloads', 'canonical-preview-bundle', 'canonical-records.json');
}

function resolvePackages() {
  const currentPath = currentOverride ? path.resolve(currentOverride) : runCanonicalBundle();
  const previousPath = previousOverride ? path.resolve(previousOverride) : currentPath;
  return { previousPath, currentPath };
}

function validatePackage(packageData, label) {
  if (!packageData || packageData.ok !== true || !Array.isArray(packageData.records)) {
    throw new Error(`${label} canonical package is not healthy.`);
  }
  const ids = packageData.records.map(record => record.id);
  if (new Set(ids).size !== ids.length) throw new Error(`${label} canonical package contains duplicate IDs.`);
}

function runConclusionEngine(packagePath, label, tempRoot) {
  const target = path.join(tempRoot, label);
  const result = spawnSync(process.execPath, ['scripts/build-phase2-conclusion-engine-preview.js'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      CONCLUSION_ENGINE_CANONICAL_PACKAGE: packagePath,
      CONCLUSION_ENGINE_OUTPUT_DIR: target
    }
  });
  if (result.status !== 0) {
    throw new Error(`Conclusion engine failed for ${label}\n${result.stdout || ''}\n${result.stderr || ''}`);
  }
  return readJson(path.join(target, 'engine-records.json'));
}

function sourceDeltas(previousRecord, currentRecord) {
  const diff = differenceByKey(previousRecord.sources, currentRecord.sources, sourceKey);
  const types = [];
  if (diff.added.length) types.push('source_added');
  if (diff.removed.length) types.push('source_removed');
  if (diff.modified.length) types.push('source_modified');
  if (diff.removed.some(source => source.authority === 'primary')) types.push('primary_source_removed');
  return { types, diff };
}

function factDeltas(previousRecord, currentRecord) {
  const diff = differenceByKey(previousRecord.establishedFacts, currentRecord.establishedFacts, factKey);
  const types = [];
  if (diff.added.length) types.push('established_fact_added');
  if (diff.removed.length) types.push('established_fact_removed');
  if (diff.modified.length) types.push('established_fact_modified');
  return { types, diff };
}

function classifyDelta(previousRecord, currentRecord, policy) {
  if (!previousRecord) {
    return {
      changeState: 'new',
      deltaTypes: ['new_record'],
      changedSections: policy.comparisonSections,
      sectionHashes: { previous: {}, current: changedSections({}, currentRecord, policy.comparisonSections).current },
      sourceDiff: { added: currentRecord.sources || [], removed: [], modified: [] },
      factDiff: { added: currentRecord.establishedFacts || [], removed: [], modified: [] },
      contradictionDiff: { added: asArray(currentRecord.counterAnalysis?.contradictoryEvidence), removed: [] }
    };
  }
  if (!currentRecord) {
    return {
      changeState: 'missing_from_current',
      deltaTypes: ['record_missing_from_current'],
      changedSections: policy.comparisonSections,
      sectionHashes: { previous: changedSections(previousRecord, {}, policy.comparisonSections).previous, current: {} },
      sourceDiff: { added: [], removed: previousRecord.sources || [], modified: [] },
      factDiff: { added: [], removed: previousRecord.establishedFacts || [], modified: [] },
      contradictionDiff: { added: [], removed: asArray(previousRecord.counterAnalysis?.contradictoryEvidence) }
    };
  }

  const sectionResult = changedSections(previousRecord, currentRecord, policy.comparisonSections);
  const source = sourceDeltas(previousRecord, currentRecord);
  const facts = factDeltas(previousRecord, currentRecord);
  const contradictions = stringSetDifference(
    previousRecord.counterAnalysis?.contradictoryEvidence,
    currentRecord.counterAnalysis?.contradictoryEvidence
  );
  const types = [...source.types, ...facts.types];

  if (fingerprint(previousRecord.status) !== fingerprint(currentRecord.status)) types.push('record_status_changed');
  if (fingerprint(previousRecord.recordStatus) !== fingerprint(currentRecord.recordStatus)) types.push('record_status_changed');
  if (fingerprint(previousRecord.mechanismOfPower) !== fingerprint(currentRecord.mechanismOfPower)) types.push('mechanism_changed');
  if (fingerprint(previousRecord.solidConclusion) !== fingerprint(currentRecord.solidConclusion)) types.push('factual_conclusion_changed');
  if (fingerprint(previousRecord.missionAssessment) !== fingerprint(currentRecord.missionAssessment)) types.push('mission_assessment_changed');
  if (fingerprint(previousRecord.speculativeConclusion) !== fingerprint(currentRecord.speculativeConclusion)) types.push('speculative_conclusion_changed');
  if (contradictions.added.length) types.push('contradiction_added');
  if (contradictions.removed.length) types.push('contradiction_removed');
  if (fingerprint(previousRecord.entities) !== fingerprint(currentRecord.entities)) types.push('entity_or_association_changed');
  if (fingerprint(previousRecord.moneyAndAuthority) !== fingerprint(currentRecord.moneyAndAuthority)) types.push('money_or_authority_changed');
  if (fingerprint(previousRecord.missingEvidence) !== fingerprint(currentRecord.missingEvidence)) types.push('missing_evidence_changed');
  if (fingerprint(previousRecord.watchNext) !== fingerprint(currentRecord.watchNext)) types.push('watch_conditions_changed');
  if (previousRecord.evidence?.claimClass !== currentRecord.evidence?.claimClass) types.push('claim_class_changed');
  if (previousRecord.evidence?.grade !== currentRecord.evidence?.grade) types.push('evidence_grade_changed');
  if (
    previousRecord.evidence?.confidence !== currentRecord.evidence?.confidence ||
    previousRecord.solidConclusion?.confidence !== currentRecord.solidConclusion?.confidence ||
    previousRecord.missionAssessment?.overallConfidence !== currentRecord.missionAssessment?.overallConfidence ||
    previousRecord.speculativeConclusion?.confidence !== currentRecord.speculativeConclusion?.confidence
  ) types.push('confidence_changed');
  if (fingerprint(previousRecord.freshness) !== fingerprint(currentRecord.freshness)) types.push('freshness_changed');

  const becameCorrected = currentRecord.status === 'corrected' && previousRecord.status !== 'corrected';
  const correctionTrigger = currentRecord.trigger?.changeType === 'correction' && previousRecord.trigger?.changeType !== 'correction';
  if (becameCorrected || correctionTrigger) types.push('correction');
  if (currentRecord.status === 'withdrawn' && previousRecord.status !== 'withdrawn') types.push('withdrawal');
  if (currentRecord.freshness?.supersededBy && currentRecord.freshness.supersededBy !== previousRecord.freshness?.supersededBy) types.push('supersession');
  if (currentRecord.trigger?.changeType === 'contradiction' && previousRecord.trigger?.changeType !== 'contradiction') types.push('contradiction_added');

  const uniqueTypes = [...new Set(types)];
  if (sectionResult.changed.length && !uniqueTypes.length) uniqueTypes.push('other_material_change');
  return {
    changeState: sectionResult.changed.length ? 'modified' : 'unchanged',
    deltaTypes: uniqueTypes,
    changedSections: sectionResult.changed,
    sectionHashes: { previous: sectionResult.previous, current: sectionResult.current },
    sourceDiff: source.diff,
    factDiff: facts.diff,
    contradictionDiff: contradictions
  };
}

function terminalState(previousRecord, currentRecord, classification) {
  if (classification.deltaTypes.includes('withdrawal') || currentRecord?.status === 'withdrawn') return 'withdrawn';
  if (classification.deltaTypes.includes('supersession') || currentRecord?.freshness?.supersededBy) return 'superseded';
  if (!currentRecord) return 'missing_from_current';
  return null;
}

function presentationFor(record, analysis, policy) {
  if (!record) return {
    presentationClass: 'historical_record',
    requiredLabel: 'historical version retained pending review',
    factualSurfaceEligible: false,
    currentSpeculativeOrResearchSurfaceEligible: false
  };
  const configured = policy.presentationRules[record.recordType];
  if (configured) return configured;
  return {
    presentationClass: analysis?.publication?.presentation?.presentationClass || 'factual_analysis',
    requiredLabel: analysis?.publication?.presentation?.requiredLabel || 'evidence-bounded analysis',
    factualSurfaceEligible: analysis?.publication?.state === 'publishable_preview',
    currentSpeculativeOrResearchSurfaceEligible: record.speculativeConclusion?.label === 'speculative'
  };
}

function impactDecision(previousRecord, currentRecord, classification, previousAnalysis, currentAnalysis, policy) {
  const severity = maxSeverity(classification.deltaTypes, policy);
  const terminal = terminalState(previousRecord, currentRecord, classification);
  const base = policy.automaticActions[severity] || policy.automaticActions.medium;
  const presentation = presentationFor(currentRecord || previousRecord, currentAnalysis || previousAnalysis, policy);
  const unchanged = classification.changeState === 'unchanged';
  const terminalRule = terminal ? policy.terminalStateRules[terminal] : null;
  const factualEligible = unchanged && !terminal
    ? Boolean(currentAnalysis?.publication?.state === 'publishable_preview' && presentation.factualSurfaceEligible !== false)
    : false;
  const speculativeEligible = terminal
    ? Boolean(terminalRule?.currentSpeculativeOrResearchSurfaceEligible)
    : Boolean((currentAnalysis?.publication?.presentation?.speculativeOrResearchSurfaceEligible ?? presentation.currentSpeculativeOrResearchSurfaceEligible) && currentRecord?.speculativeConclusion?.label === 'speculative');
  const archiveEligible = Boolean(previousRecord) || Boolean(terminalRule?.archiveSurfaceEligible);

  let factualAction = 'preserve';
  let speculativeAction = 'preserve_labelled';
  let editorialState = unchanged ? currentAnalysis?.publication?.state || 'unchanged' : base.editorialState;
  if (classification.changeState === 'new') {
    factualAction = 'evaluate_new_record';
    speculativeAction = 'retain_labelled_and_review';
    editorialState = 'review';
  } else if (classification.changeState === 'missing_from_current') {
    factualAction = 'remove_from_current_surfaces_and_retain_historical_version';
    speculativeAction = 'retain_historical_version_with_notice';
    editorialState = 'needs_editorial_review';
  } else if (terminal === 'withdrawn') {
    factualAction = 'withdraw_current_factual_presentation';
    speculativeAction = 'retain_archived_speculation_with_withdrawal_notice';
    editorialState = 'withdrawn';
  } else if (terminal === 'superseded') {
    factualAction = 'replace_current_presentation_with_supersession_notice';
    speculativeAction = 'retain_archived_speculation_with_supersession_notice';
    editorialState = 'superseded';
  } else if (!unchanged) {
    factualAction = 'recalculate_and_return_to_review';
    speculativeAction = 'retain_labelled_recalculate_and_return_to_review';
  }

  const previousConvergence = previousAnalysis?.generated?.convergence?.totalScore ?? null;
  const currentConvergence = currentAnalysis?.generated?.convergence?.totalScore ?? null;
  return {
    severity,
    reviewRequired: !unchanged || classification.deltaTypes.some(type => policy.deltaTypes[type]?.reviewRequired),
    editorialState,
    terminalState: terminal,
    requiredNotice: terminalRule?.requiredNotice || null,
    factualConclusion: {
      action: factualAction,
      currentSurfaceEligible: factualEligible,
      previousState: previousAnalysis?.publication?.state || null,
      currentState: currentAnalysis?.publication?.state || null,
      previousCandidate: previousAnalysis?.generated?.evidenceBasedConclusion?.candidateText || null,
      currentCandidate: currentAnalysis?.generated?.evidenceBasedConclusion?.candidateText || null
    },
    speculativeConclusion: {
      action: speculativeAction,
      currentResearchSurfaceEligible: speculativeEligible,
      archiveSurfaceEligible: archiveEligible,
      requiredLabel: presentation.requiredLabel,
      previousText: previousAnalysis?.generated?.speculativeConclusion?.text || previousRecord?.speculativeConclusion?.text || null,
      currentText: currentAnalysis?.generated?.speculativeConclusion?.text || currentRecord?.speculativeConclusion?.text || null,
      previousLabel: previousAnalysis?.generated?.speculativeConclusion?.label || previousRecord?.speculativeConclusion?.label || null,
      currentLabel: currentAnalysis?.generated?.speculativeConclusion?.label || currentRecord?.speculativeConclusion?.label || null
    },
    confidence: {
      action: unchanged ? 'preserve' : base.confidenceAction,
      previousCurrentConfidence: previousAnalysis?.publication?.currentConfidence || null,
      previousRecommendedConfidence: previousAnalysis?.publication?.recommendedConfidence || null,
      currentCurrentConfidence: currentAnalysis?.publication?.currentConfidence || null,
      currentRecommendedConfidence: currentAnalysis?.publication?.recommendedConfidence || null
    },
    convergence: {
      action: unchanged ? 'preserve' : base.convergenceAction,
      previousTotalScore: previousConvergence,
      currentTotalScore: currentConvergence,
      scoreDelta: previousConvergence === null || currentConvergence === null ? null : currentConvergence - previousConvergence,
      previousActiveVectors: previousAnalysis?.generated?.convergence?.activeVectors ?? null,
      currentActiveVectors: currentAnalysis?.generated?.convergence?.activeVectors ?? null,
      documentedCoordinationAllowed: false
    },
    presentation: {
      presentationClass: presentation.presentationClass,
      requiredLabel: presentation.requiredLabel,
      factualSurfaceEligible: factualEligible,
      currentSpeculativeOrResearchSurfaceEligible: speculativeEligible,
      archiveSurfaceEligible: archiveEligible
    }
  };
}

function newestTimestamp(packages) {
  const values = packages
    .flatMap(packageData => [packageData.generatedAt, ...packageData.records.flatMap(record => [record.freshness?.lastReviewedAt, record.freshness?.updatedAt, record.trigger?.detectedAt])])
    .map(value => Date.parse(value || ''))
    .filter(Number.isFinite);
  return values.length ? new Date(Math.max(...values)).toISOString() : '1970-01-01T00:00:00.000Z';
}

const policy = readJson(policyPath);
if (policy.mode !== 'report-only') throw new Error('Evidence delta engine must remain report-only.');
const { previousPath, currentPath } = resolvePackages();
const previousPackage = readJson(previousPath);
const currentPackage = readJson(currentPath);
validatePackage(previousPackage, 'Previous');
validatePackage(currentPackage, 'Current');
const generatedAt = newestTimestamp([previousPackage, currentPackage]);
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-evidence-delta-'));
let previousEngine;
let currentEngine;
try {
  previousEngine = runConclusionEngine(previousPath, 'previous', tempRoot);
  currentEngine = runConclusionEngine(currentPath, 'current', tempRoot);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
if (!previousEngine.ok || !currentEngine.ok) throw new Error('Previous or current conclusion analysis is not healthy.');

const previousRecords = new Map(previousPackage.records.map(record => [record.id, record]));
const currentRecords = new Map(currentPackage.records.map(record => [record.id, record]));
const previousAnalyses = new Map(previousEngine.records.map(record => [record.id, record]));
const currentAnalyses = new Map(currentEngine.records.map(record => [record.id, record]));
const ids = [...new Set([...previousRecords.keys(), ...currentRecords.keys()])].sort();

fs.rmSync(outputDir, { recursive: true, force: true });
const deltaRecords = [];
const versionEntries = [];
for (const id of ids) {
  const previousRecord = previousRecords.get(id) || null;
  const currentRecord = currentRecords.get(id) || null;
  const previousAnalysis = previousAnalyses.get(id) || null;
  const currentAnalysis = currentAnalyses.get(id) || null;
  const classification = classifyDelta(previousRecord, currentRecord, policy);
  const impact = impactDecision(previousRecord, currentRecord, classification, previousAnalysis, currentAnalysis, policy);
  const previousHash = previousRecord ? fingerprint(previousRecord) : null;
  const currentHash = currentRecord ? fingerprint(currentRecord) : null;
  const segment = safeSegment(id);
  const versions = [];
  if (previousRecord) {
    const relativePath = `versions/${segment}/${previousHash}.json`;
    writeJson(outputDir, relativePath, previousRecord);
    versions.push({ role: 'previous', hash: previousHash, path: relativePath, retained: true });
  }
  if (currentRecord) {
    const relativePath = `versions/${segment}/${currentHash}.json`;
    if (!previousRecord || previousHash !== currentHash) writeJson(outputDir, relativePath, currentRecord);
    versions.push({ role: 'current', hash: currentHash, path: relativePath, retained: true });
  }
  versionEntries.push({ id, recordType: currentRecord?.recordType || previousRecord?.recordType || 'unknown', versions });
  deltaRecords.push({
    id,
    title: currentRecord?.title || previousRecord?.title || id,
    recordType: currentRecord?.recordType || previousRecord?.recordType || 'unknown',
    changeState: classification.changeState,
    deltaTypes: classification.deltaTypes,
    severity: impact.severity,
    changedSections: classification.changedSections,
    sectionHashes: classification.sectionHashes,
    sourceDiff: classification.sourceDiff,
    factDiff: classification.factDiff,
    contradictionDiff: classification.contradictionDiff,
    previousVersionHash: previousHash,
    currentVersionHash: currentHash,
    versions,
    impact,
    boundary: 'Evidence-delta preview only. Prior and current versions are retained; changed records are returned to review and are not automatically published.'
  });
}

const changed = deltaRecords.filter(record => record.changeState !== 'unchanged');
const reEvaluationQueue = changed
  .filter(record => record.impact.reviewRequired)
  .sort((left, right) => policy.severityOrder.indexOf(right.severity) - policy.severityOrder.indexOf(left.severity) || left.title.localeCompare(right.title));
const summary = {
  unionRecordCount: deltaRecords.length,
  previousRecordCount: previousPackage.recordCount,
  currentRecordCount: currentPackage.recordCount,
  unchangedRecordCount: deltaRecords.length - changed.length,
  changedRecordCount: changed.length,
  reEvaluationQueueCount: reEvaluationQueue.length,
  byChangeState: countBy(deltaRecords, record => record.changeState),
  bySeverity: countBy(deltaRecords, record => record.severity),
  byDeltaType: countBy(changed.flatMap(record => record.deltaTypes.map(type => ({ type }))), item => item.type),
  factualSurfaceHeldCount: deltaRecords.filter(record => !record.impact.presentation.factualSurfaceEligible).length,
  speculativeOrResearchSurfaceEligibleCount: deltaRecords.filter(record => record.impact.presentation.currentSpeculativeOrResearchSurfaceEligible).length,
  archiveSurfaceEligibleCount: deltaRecords.filter(record => record.impact.presentation.archiveSurfaceEligible).length,
  graphRecordsRetained: deltaRecords.filter(record => record.recordType === 'relationship_update' && record.versions.length).length,
  scenarioRecordsRetained: deltaRecords.filter(record => record.recordType === 'scenario' && record.versions.length).length,
  speculationRecordsRetained: deltaRecords.filter(record => record.recordType === 'speculation_review' && record.versions.length).length
};
const manifest = {
  ok: deltaRecords.length === ids.length && versionEntries.every(entry => entry.versions.length > 0),
  mode: 'report-only',
  version: policy.version,
  generatedAt,
  previousPackage: previousPath,
  currentPackage: currentPath,
  previousPackageHash: sha256(fs.readFileSync(previousPath)),
  currentPackageHash: sha256(fs.readFileSync(currentPath)),
  publicationEnforcement: false,
  emailDelivery: false,
  entitlementActivation: false,
  paymentActivation: false,
  canonicalMutation: false,
  summary,
  outputHashes: {},
  boundary: 'The evidence-delta engine preserves every prior/current version and generates review decisions only. It does not mutate canonical data or activate delivery.'
};

writeJson(outputDir, 'delta-records.json', { ok: manifest.ok, mode: manifest.mode, generatedAt, recordCount: deltaRecords.length, records: deltaRecords });
writeJson(outputDir, 're-evaluation-queue.json', { ok: true, mode: 'report-only', generatedAt, recordCount: reEvaluationQueue.length, records: reEvaluationQueue });
writeJson(outputDir, 'version-ledger.json', { ok: true, mode: 'report-only', generatedAt, recordCount: versionEntries.length, records: versionEntries });
writeJson(outputDir, 'conclusion-impact.json', {
  ok: true,
  mode: 'report-only',
  generatedAt,
  recordCount: changed.length,
  records: changed.map(record => ({
    id: record.id,
    title: record.title,
    recordType: record.recordType,
    deltaTypes: record.deltaTypes,
    severity: record.severity,
    factualConclusion: record.impact.factualConclusion,
    speculativeConclusion: record.impact.speculativeConclusion,
    confidence: record.impact.confidence,
    convergence: record.impact.convergence,
    presentation: record.impact.presentation
  }))
});
const summaryLines = [
  '# Phase 2 Evidence Delta Preview',
  '',
  `Generated: ${generatedAt}`,
  `Mode: ${manifest.mode}`,
  '',
  '## Safety boundary',
  '',
  manifest.boundary,
  '',
  '## Coverage',
  '',
  `- Previous records: ${summary.previousRecordCount}`,
  `- Current records: ${summary.currentRecordCount}`,
  `- Union records retained: ${summary.unionRecordCount}`,
  `- Changed records: ${summary.changedRecordCount}`,
  `- Re-evaluation queue: ${summary.reEvaluationQueueCount}`,
  `- Graph records retained: ${summary.graphRecordsRetained}`,
  `- Scenario records retained: ${summary.scenarioRecordsRetained}`,
  `- Speculation-review records retained: ${summary.speculationRecordsRetained}`,
  `- Current speculative/research eligible: ${summary.speculativeOrResearchSurfaceEligibleCount}`,
  `- Archive eligible: ${summary.archiveSurfaceEligibleCount}`,
  '',
  '## Change states',
  '',
  ...Object.entries(summary.byChangeState).map(([key, value]) => `- ${key}: ${value}`),
  '',
  '## Severities',
  '',
  ...Object.entries(summary.bySeverity).map(([key, value]) => `- ${key}: ${value}`),
  '',
  '## Exit condition',
  '',
  policy.exitCondition
];
writeText(outputDir, 'summary.md', summaryLines.join('\n') + '\n');
for (const file of ['delta-records.json', 're-evaluation-queue.json', 'version-ledger.json', 'conclusion-impact.json', 'summary.md']) {
  manifest.outputHashes[file] = sha256(fs.readFileSync(path.join(outputDir, file)));
}
writeJson(outputDir, 'manifest.json', manifest);

console.log(`PHASE 2 EVIDENCE DELTA: ${deltaRecords.length} records retained; ${changed.length} changed; ${reEvaluationQueue.length} queued for re-evaluation.`);
console.log(`Output: ${outputDir}`);
if (!manifest.ok) process.exit(1);
