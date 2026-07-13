const fs = require('fs');
const path = require('path');
const {
  normalized,
  getPath,
  countBy,
  writeJson,
  writeText
} = require('./conclusion-engine/core');
const { generateRecordAnalysis } = require('./conclusion-engine/generate');
const { enforceInterpretiveBoundaries } = require('./conclusion-engine/hardening');
const { candidateFieldValue, qualityAnalysis, gateAnalysis } = require('./conclusion-engine/quality');

const root = process.cwd();
const fixtures = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/conclusion-engine-adversarial.json'), 'utf8'));
const policy = JSON.parse(fs.readFileSync(path.join(root, 'data/conclusion-engine-policy.json'), 'utf8'));
const outputDir = path.join(root, 'downloads', 'phase2-conclusion-adversarial');
const qualityFieldPaths = ['solidConclusion.text','mechanismOfPower.description','missionAssessment.missionRelevance','speculativeConclusion.text','counterAnalysis.assessment'];
const checkpoint = '2026-07-13T08:00:00.000Z';

function makeRecord(testCase) {
  const input = testCase.record;
  const sourceId = `src-${testCase.id}`;
  return {
    schemaVersion: '1.0.0',
    id: `adversarial-${testCase.id}`,
    recordType: input.recordType,
    title: `Adversarial ${testCase.id.replaceAll('-', ' ')}`,
    summary: testCase.description,
    status: input.status || 'published',
    trigger: {
      description: testCase.description,
      detectedAt: checkpoint,
      eventDate: '2026-07-13',
      changeType: 'other'
    },
    sources: [{
      id: sourceId,
      title: `Fixture source for ${testCase.id}`,
      publisher: 'Adversarial Test Custodian',
      url: `https://example.invalid/${testCase.id}`,
      authority: input.sourceAuthority
    }],
    recordStatus: ['analysis'],
    establishedFacts: [{
      statement: `The fixture preserves the input statement for ${testCase.id}.`,
      sourceIds: [sourceId],
      boundary: 'The fixture statement does not establish the adversarial overclaim.',
      factStatus: 'documented'
    }],
    entities: [
      { id: 'entity-alpha', name: 'Person Alpha', entityType: 'person', role: 'graph subject', sourceIds: [sourceId], associationBoundary: 'Association is not guilt or control.' },
      { id: 'entity-beta', name: 'Institution Beta', entityType: 'company', role: 'graph subject', sourceIds: [sourceId], associationBoundary: 'Association is not guilt or control.' }
    ],
    moneyAndAuthority: [],
    mechanismOfPower: {
      description: input.mechanismDescription,
      authorityHolder: input.authorityHolders,
      implementationRoute: input.implementationRoutes,
      affectedGroups: ['Test readers'],
      evidenceBasis: [sourceId],
      limitation: 'The fixture does not independently establish an external authority and implementation chain.'
    },
    solidConclusion: {
      text: input.solidText,
      scope: 'Adversarial fixture only.',
      confidence: input.confidence,
      sourceIds: [sourceId],
      boundary: 'This source conclusion is intentionally adversarial and must be corrected by the engine.'
    },
    missionAssessment: {
      outcome: input.missionOutcome,
      missionRelevance: 'The adversarial input attempts to force a control conclusion from insufficient evidence.',
      eliteControlRelevance: 'The input tries to treat association, scenario or speculation as proven elite control.',
      convergenceVectors: policy.convergenceVectors.map((vector, index) => ({
        vector,
        score: index === 0 ? input.vectorScore : 0,
        rationale: 'Adversarial input attempts to overstate convergence.',
        evidenceBasis: [sourceId],
        coordinationStatus: input.coordinationStatus,
        confidence: input.confidence
      })),
      overallConfidence: input.confidence,
      boundary: 'The adversarial mission assessment must not be accepted without evidence.'
    },
    speculativeConclusion: {
      label: input.speculativeLabel,
      text: 'The adversarial input proposes a wider hidden-control interpretation.',
      conditions: ['Independent primary records establish authority and implementation.'],
      falsifiers: ['A primary record shows no proposed authority or implementation route.'],
      confidence: 'very_low',
      boundary: 'This section is speculative and is not established fact.'
    },
    counterAnalysis: {
      alternativeExplanations: ['Ordinary administration, shared attendance, modelling error or incomplete reporting.'],
      contradictoryEvidence: [],
      assessment: 'The alternative explanation remains viable and must be retained.'
    },
    missingEvidence: [{
      record: 'Independent primary record establishing authority and implementation',
      whyItMatters: 'It is required before the overclaim can be upgraded.',
      effectIfFound: 'upgrade',
      requestRoute: null
    }],
    watchNext: [{
      indicator: 'Independent primary record appears',
      reason: 'It could confirm or falsify the proposed mechanism.',
      upgradeCondition: 'The record identifies the same authority and implementation route.',
      downgradeCondition: 'The record identifies a different cause or no implementation route.',
      reviewDate: '2026-08-13'
    }],
    evidence: {
      grade: input.evidenceGrade,
      confidence: input.confidence,
      claimClass: input.claimClass,
      corroborationCount: 1,
      associationBoundary: 'Association, proximity and shared attendance do not establish wrongdoing, control or coordination.'
    },
    access: {
      minimumTier: 'research_pro_9',
      publicFields: ['title','summary','evidence.associationBoundary'],
      emailVisibility: [],
      dashboardVisibility: ['research_pro_9'],
      downloadPermissions: []
    },
    delivery: {
      includeInDailyDrop: false,
      includeInWeeklyReport: false,
      includeInNewsletter: false,
      includeInSearch: true,
      includeInEntityCards: false,
      includeInConvergenceTracker: false
    },
    freshness: {
      createdAt: checkpoint,
      updatedAt: checkpoint,
      lastReviewedAt: checkpoint,
      reviewStatus: 'current',
      supersedes: null,
      supersededBy: null
    }
  };
}

function makeExactCounts(items, getter) {
  return countBy(items, getter);
}

const records = fixtures.cases.map(testCase => ({ testCase, record: makeRecord(testCase) }));
const sourceExactCounts = Object.fromEntries(qualityFieldPaths.map(fieldPath => [
  fieldPath,
  makeExactCounts(records.filter(item => normalized(getPath(item.record, fieldPath))), item => normalized(getPath(item.record, fieldPath)))
]));

const generatedItems = records.map(({ testCase, record }) => ({
  testCase,
  record,
  generated: enforceInterpretiveBoundaries(record, generateRecordAnalysis(record, policy), policy)
}));
const candidateExactCounts = Object.fromEntries(qualityFieldPaths.map(fieldPath => [
  fieldPath,
  makeExactCounts(generatedItems.filter(item => normalized(candidateFieldValue(item.generated, fieldPath))), item => normalized(candidateFieldValue(item.generated, fieldPath)))
]));

const results = [];
const errors = [];
function assertCase(condition, testCase, message) {
  if (!condition) errors.push(`${testCase.id}: ${message}`);
}

for (const item of generatedItems) {
  const { testCase, record, generated } = item;
  const expected = testCase.expected;
  const quality = qualityAnalysis(record, generated, sourceExactCounts, candidateExactCounts, policy);
  const publication = gateAnalysis(record, generated, quality, policy, Date.parse(checkpoint));
  const maxScore = Math.max(...generated.convergence.vectors.map(vector => Number(vector.score || 0)));
  const documentedCoordination = generated.convergence.vectors.filter(vector => vector.coordinationStatus === 'documented');
  const missingEvidenceOperational = generated.counterAndMissing.missingEvidence.every(missing =>
    missing.likelyCustodian &&
    Array.isArray(missing.lawfulAcquisitionRoutes) && missing.lawfulAcquisitionRoutes.length &&
    Array.isArray(missing.confirmationIndicators) && missing.confirmationIndicators.length &&
    Array.isArray(missing.falsificationIndicators) && missing.falsificationIndicators.length
  );

  assertCase(publication.presentation.retained === true, testCase, 'record was not retained');
  assertCase(publication.presentation.removalProhibited === true, testCase, 'removal prohibition is missing');
  assertCase(publication.presentation.class === expected.presentationClass, testCase, `expected presentation ${expected.presentationClass}, received ${publication.presentation.class}`);
  assertCase(publication.presentation.retainedAs === expected.retainedAs, testCase, `expected retention ${expected.retainedAs}, received ${publication.presentation.retainedAs}`);
  assertCase(publication.state === expected.state, testCase, `expected state ${expected.state}, received ${publication.state}`);
  assertCase(publication.presentation.factualSurfaceEligible === expected.factualSurfaceEligible, testCase, 'factual-surface eligibility mismatch');
  assertCase(publication.presentation.speculativeOrResearchSurfaceEligible === expected.speculativeOrResearchSurfaceEligible, testCase, 'speculative/research-surface eligibility mismatch');
  assertCase(generated.speculativeConclusion.label === (expected.generatedSpeculationLabel || 'speculative'), testCase, 'generated speculation label is not speculative');
  assertCase(publication.presentation.label.toLowerCase().includes('speculative') || publication.presentation.class === 'unsupported', testCase, 'visible presentation label does not identify speculation');
  assertCase(documentedCoordination.length === 0, testCase, 'interpretive record retained documented coordination');
  assertCase(missingEvidenceOperational, testCase, 'missing-evidence output lacks custodian, lawful route or indicators');
  if (expected.maximumConvergenceScore !== undefined) assertCase(maxScore <= expected.maximumConvergenceScore, testCase, `convergence score ${maxScore} exceeded ${expected.maximumConvergenceScore}`);
  if (expected.generatedConclusionIncludes) assertCase(generated.evidenceBasedConclusion.candidateText.toLowerCase().includes(expected.generatedConclusionIncludes.toLowerCase()), testCase, `generated conclusion does not include “${expected.generatedConclusionIncludes}”`);
  if (expected.retained !== undefined) assertCase(publication.presentation.retained === expected.retained, testCase, 'retained status mismatch');

  results.push({
    id: testCase.id,
    description: testCase.description,
    passed: errors.every(error => !error.startsWith(`${testCase.id}:`)),
    publicationState: publication.state,
    presentation: publication.presentation,
    evidenceConclusion: generated.evidenceBasedConclusion,
    speculativeConclusion: generated.speculativeConclusion,
    convergence: generated.convergence,
    quality,
    missingEvidence: generated.counterAndMissing.missingEvidence
  });
}

const report = {
  ok: errors.length === 0,
  mode: 'adversarial-report-only',
  version: fixtures.version,
  generatedAt: checkpoint,
  caseCount: results.length,
  passedCount: results.filter(result => result.passed).length,
  failedCount: results.filter(result => !result.passed).length,
  retainedCount: results.filter(result => result.presentation.retained).length,
  factualSurfaceEligibleCount: results.filter(result => result.presentation.factualSurfaceEligible).length,
  speculativeOrResearchSurfaceEligibleCount: results.filter(result => result.presentation.speculativeOrResearchSurfaceEligible).length,
  errors,
  results,
  boundary: 'Graph associations, scenarios and speculation must be retained with explicit speculative labels. They may appear on appropriate research surfaces but cannot be presented as established fact or documented coordination.'
};

fs.rmSync(outputDir, { recursive: true, force: true });
writeJson(outputDir, 'adversarial-report.json', report);
writeText(outputDir, 'summary.md', [
  '# Conclusion Engine Adversarial Test',
  '',
  `Cases: ${report.caseCount}`,
  `Passed: ${report.passedCount}`,
  `Failed: ${report.failedCount}`,
  `Retained: ${report.retainedCount}`,
  `Factual-surface eligible: ${report.factualSurfaceEligibleCount}`,
  `Speculative/research-surface eligible: ${report.speculativeOrResearchSurfaceEligibleCount}`,
  '',
  report.boundary,
  '',
  ...results.map(result => `- ${result.id}: ${result.passed ? 'PASS' : 'FAIL'} — ${result.presentation.label} — ${result.publicationState}`)
].join('\n') + '\n');

console.log(`ADVERSARIAL CONCLUSION TEST: ${report.passedCount}/${report.caseCount} passed; ${report.retainedCount} retained; ${report.factualSurfaceEligibleCount} factual-surface eligible.`);
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
