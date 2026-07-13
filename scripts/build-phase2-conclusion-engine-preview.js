const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { readJson, sha256, writeJson, writeText, normalized, getPath, countBy } = require('./conclusion-engine/core');
const { generateRecordAnalysis } = require('./conclusion-engine/generate');
const { candidateFieldValue, qualityAnalysis, gateAnalysis } = require('./conclusion-engine/quality');

const root = process.cwd();
const canonicalOverride = process.env.CONCLUSION_ENGINE_CANONICAL_PACKAGE || null;
const policyOverride = process.env.CONCLUSION_ENGINE_POLICY || null;
const outputOverride = process.env.CONCLUSION_ENGINE_OUTPUT_DIR || null;
const outputDir = outputOverride ? path.resolve(outputOverride) : path.join(root, 'downloads', 'phase2-conclusion-engine-preview');
const qualityFieldPaths = ['solidConclusion.text','mechanismOfPower.description','missionAssessment.missionRelevance','speculativeConclusion.text','counterAnalysis.assessment'];

function runCanonicalBundle() {
  if (canonicalOverride) return path.resolve(canonicalOverride);
  const result = spawnSync(process.execPath, ['scripts/build-canonical-preview-bundle.js'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.status !== 0) throw new Error(`Canonical bundle failed\n${result.stdout || ''}\n${result.stderr || ''}`);
  process.stdout.write(result.stdout || '');
  return path.join(root, 'downloads', 'canonical-preview-bundle', 'canonical-records.json');
}

const canonicalPath = runCanonicalBundle();
const policyPath = policyOverride ? path.resolve(policyOverride) : path.join(root, 'data', 'conclusion-engine-policy.json');
const packageData = readJson(canonicalPath);
const policy = readJson(policyPath);
if (!packageData.ok) throw new Error('Canonical package is not healthy.');
if (policy.mode !== 'report-only') throw new Error('Conclusion engine must remain report-only.');
const records = packageData.records;
const generatedAt = packageData.generatedAt || new Date().toISOString();
const now = Date.parse(generatedAt) || Date.now();
const sourceExactCounts = Object.fromEntries(qualityFieldPaths.map(fieldPath => [fieldPath, countBy(records.filter(record => normalized(getPath(record, fieldPath))), record => normalized(getPath(record, fieldPath)))]));
const baseAnalyses = records.map(record => ({ record, generated: generateRecordAnalysis(record, policy) }));
const candidateExactCounts = Object.fromEntries(qualityFieldPaths.map(fieldPath => [fieldPath, countBy(baseAnalyses.filter(item => normalized(candidateFieldValue(item.generated, fieldPath))), item => normalized(candidateFieldValue(item.generated, fieldPath)))]));
const analyses = baseAnalyses.map(({ record, generated }) => {
  const quality = qualityAnalysis(record, generated, sourceExactCounts, candidateExactCounts, policy);
  const publication = gateAnalysis(record, generated, quality, policy, now);
  return {
    id: record.id,
    title: record.title,
    recordType: record.recordType,
    sourceRecordStatus: record.status,
    sourceFile: record.legacy?.sourceFile || null,
    previewSourceIds: record.previewSourceIds || [record.previewSourceId].filter(Boolean),
    generated,
    quality,
    publication,
    boundary: 'Report-only conclusion-engine analysis. Candidate text does not replace, publish or alter the canonical source record.'
  };
});

const reviewQueue = analyses.filter(item => item.publication.state !== 'publishable_preview').sort((a,b) => b.publication.failed.length - a.publication.failed.length || b.quality.candidate.flags.length - a.quality.candidate.flags.length || a.title.localeCompare(b.title));
const genericReport = analyses.filter(item => item.quality.source.flags.length || item.quality.candidate.flags.length).map(item => ({ id: item.id, title: item.title, recordType: item.recordType, sourceFlags: item.quality.source.flags, candidateFlags: item.quality.candidate.flags, sourceRepeatCounts: item.quality.source.repeatCounts, candidateRepeatCounts: item.quality.candidate.repeatCounts, sourceFieldEqualities: item.quality.source.fieldEqualities, candidateFieldEqualities: item.quality.candidate.fieldEqualities, genericMatches: item.quality.source.genericMatches, candidateConclusion: item.generated.evidenceBasedConclusion.candidateText }));
const convergenceReview = analyses.map(item => ({ id: item.id, title: item.title, recordType: item.recordType, claimClass: item.publication.claimClass, authority: item.publication.sourceAuthority, totalScore: item.generated.convergence.totalScore, activeVectors: item.generated.convergence.activeVectors, vectors: item.generated.convergence.vectors.filter(vector => vector.score > 0) })).filter(item => item.activeVectors || records.find(record => record.id === item.id)?.delivery?.includeInConvergenceTracker);
const summary = {
  recordCount: analyses.length,
  byPublicationState: countBy(analyses, item => item.publication.state),
  byClaimClass: countBy(analyses, item => item.publication.claimClass),
  bySourceAuthority: countBy(analyses, item => item.publication.sourceAuthority),
  byEvidenceGrade: countBy(analyses, item => item.publication.evidenceGrade),
  byRecordType: countBy(analyses, item => item.recordType),
  sourceRecordsWithQualityFlags: analyses.filter(item => item.quality.source.flags.length).length,
  candidateRecordsWithQualityFlags: analyses.filter(item => item.quality.candidate.flags.length).length,
  recordsRequiringConfidenceDowngrade: analyses.filter(item => item.publication.confidenceDowngradeRequired).length,
  staleRecords: analyses.filter(item => item.publication.stale).length,
  recordsWithEstablishedMechanism: analyses.filter(item => item.generated.mechanism.status === 'documented').length,
  recordsWithAnalyticalModelMechanism: analyses.filter(item => item.generated.mechanism.status === 'analytical_model').length,
  recordsWithPartialMechanism: analyses.filter(item => item.generated.mechanism.status === 'partially_documented').length,
  recordsWithNoEstablishedMechanism: analyses.filter(item => item.generated.mechanism.status === 'unestablished').length,
  convergenceActiveRecords: analyses.filter(item => item.generated.convergence.activeVectors > 0).length,
  factSpeculationSeparationFailures: analyses.filter(item => !item.publication.gates.fact_speculation_separation).length,
  candidateGenericOrRepetitionFailures: analyses.filter(item => !item.publication.gates.repetition_and_generic_language).length
};
const manifest = {
  ok: analyses.length === records.length && analyses.every(item => item.generated.speculativeConclusion.label === 'speculative'),
  mode: 'report-only',
  version: policy.version,
  generatedAt,
  sourceCanonicalPackage: canonicalPath,
  canonicalRecordCount: records.length,
  analysisRecordCount: analyses.length,
  publicationEnforcement: false,
  paymentActivation: false,
  summary,
  outputHashes: {},
  boundary: 'This engine generates candidate conclusions and quality decisions for review only. It does not change canonical records, publish pages, send email, grant access or take payment.'
};

fs.rmSync(outputDir, { recursive: true, force: true });
writeJson(outputDir, 'engine-records.json', { ok: manifest.ok, mode: manifest.mode, generatedAt, recordCount: analyses.length, records: analyses });
writeJson(outputDir, 'review-queue.json', { ok: true, mode: 'report-only', generatedAt, recordCount: reviewQueue.length, records: reviewQueue });
writeJson(outputDir, 'generic-language-report.json', { ok: true, mode: 'report-only', generatedAt, recordCount: genericReport.length, records: genericReport });
writeJson(outputDir, 'convergence-review.json', { ok: true, mode: 'report-only', generatedAt, recordCount: convergenceReview.length, records: convergenceReview });
const lines = [
  '# Phase 2 Conclusion Engine Preview', '',
  `Generated: ${generatedAt}`, `Mode: ${manifest.mode}`, '',
  '## Safety boundary', '', manifest.boundary, '',
  '## Coverage', '',
  `- Canonical records: ${summary.recordCount}`,
  `- Source records with quality flags: ${summary.sourceRecordsWithQualityFlags}`,
  `- Candidate records with quality flags: ${summary.candidateRecordsWithQualityFlags}`,
  `- Fact/speculation separation failures: ${summary.factSpeculationSeparationFailures}`,
  `- Candidate generic or repetition failures: ${summary.candidateGenericOrRepetitionFailures}`,
  `- Confidence downgrades required: ${summary.recordsRequiringConfidenceDowngrade}`,
  `- Stale records: ${summary.staleRecords}`,
  `- Documented mechanisms: ${summary.recordsWithEstablishedMechanism}`,
  `- Partially documented mechanisms: ${summary.recordsWithPartialMechanism}`,
  `- Analytical-model mechanisms: ${summary.recordsWithAnalyticalModelMechanism}`,
  `- Unestablished mechanisms: ${summary.recordsWithNoEstablishedMechanism}`,
  `- Records with active convergence vectors: ${summary.convergenceActiveRecords}`, '',
  '## Publication states', '',
  ...Object.entries(summary.byPublicationState).map(([key,value]) => `- ${key}: ${value}`), '',
  '## Exit condition', '', policy.exitCondition
];
writeText(outputDir, 'summary.md', lines.join('\n') + '\n');
for (const file of ['engine-records.json','review-queue.json','generic-language-report.json','convergence-review.json','summary.md']) manifest.outputHashes[file] = sha256(fs.readFileSync(path.join(outputDir,file)));
writeJson(outputDir, 'manifest.json', manifest);
console.log(`PHASE 2 CONCLUSION ENGINE PREVIEW: ${analyses.length} records; ${reviewQueue.length} require review or evidence.`);
console.log(`Output: ${outputDir}`);
if (!manifest.ok) process.exit(1);
