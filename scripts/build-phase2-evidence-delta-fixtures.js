const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { clone, stableJson, ensureDir } = require('./evidence-delta/core');

const root = process.cwd();
const outputDir = process.env.EVIDENCE_DELTA_FIXTURE_DIR
  ? path.resolve(process.env.EVIDENCE_DELTA_FIXTURE_DIR)
  : path.join(root, 'downloads', 'phase2-evidence-delta-fixtures');

function runCanonicalBundle() {
  const result = spawnSync(process.execPath, ['scripts/build-canonical-preview-bundle.js'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  if (result.status !== 0) throw new Error(`Canonical bundle failed\n${result.stdout || ''}\n${result.stderr || ''}`);
  process.stdout.write(result.stdout || '');
  return path.join(root, 'downloads', 'canonical-preview-bundle', 'canonical-records.json');
}

function write(name, value) {
  ensureDir(outputDir);
  fs.writeFileSync(path.join(outputDir, name), stableJson(value));
}

function requireRecord(records, predicate, label, excluded = new Set()) {
  const record = records.find(item => predicate(item) && !excluded.has(item.id));
  if (!record) throw new Error(`Could not find fixture record for ${label}`);
  excluded.add(record.id);
  return record;
}

function appendUnique(array, value, keyGetter = item => JSON.stringify(item)) {
  const values = Array.isArray(array) ? array : [];
  const key = keyGetter(value);
  if (!values.some(item => keyGetter(item) === key)) values.push(value);
  return values;
}

function mutateTimestamp(record, suffixMinutes) {
  const base = Date.parse(record.freshness?.updatedAt || record.freshness?.lastReviewedAt || record.trigger?.detectedAt || '2026-07-13T00:00:00.000Z');
  const value = new Date((Number.isFinite(base) ? base : Date.parse('2026-07-13T00:00:00.000Z')) + suffixMinutes * 60000).toISOString();
  record.freshness = record.freshness || {};
  record.freshness.updatedAt = value;
  record.freshness.lastReviewedAt = value;
  record.trigger = record.trigger || {};
  record.trigger.detectedAt = value;
  return value;
}

const canonicalPath = runCanonicalBundle();
const canonical = JSON.parse(fs.readFileSync(canonicalPath, 'utf8'));
if (!canonical.ok || !Array.isArray(canonical.records) || canonical.records.length < 8) throw new Error('Canonical package is not suitable for fixture generation.');
const previous = clone(canonical);
const current = clone(canonical);
const excluded = new Set();
const records = previous.records;

const newEvidenceBase = requireRecord(records, record => ['finding','intelligence_card','document','source_change'].includes(record.recordType), 'new evidence', excluded);
const contradictionBase = requireRecord(records, record => ['finding','intelligence_card','document','source_change'].includes(record.recordType), 'contradiction', excluded);
const correctionBase = requireRecord(records, record => ['finding','intelligence_card','document','source_change'].includes(record.recordType), 'correction', excluded);
const withdrawalBase = requireRecord(records, record => ['finding','intelligence_card','document','source_change'].includes(record.recordType), 'withdrawal', excluded);
const supersessionBase = requireRecord(records, record => ['finding','intelligence_card','document','source_change'].includes(record.recordType), 'supersession', excluded);
const graphBase = requireRecord(records, record => record.recordType === 'relationship_update', 'graph speculation', excluded);
const removedBase = requireRecord(records, record => record.recordType !== 'relationship_update', 'record disappearance', excluded);

const byId = new Map(current.records.map(record => [record.id, record]));

const newRecord = clone(newEvidenceBase);
newRecord.id = `${newEvidenceBase.id}-delta-new`;
newRecord.title = `${newEvidenceBase.title} — newly preserved evidence`;
newRecord.status = 'review';
newRecord.trigger = clone(newEvidenceBase.trigger || {});
newRecord.trigger.changeType = 'new_record';
newRecord.trigger.description = `A newly preserved source record was added for ${newEvidenceBase.title}.`;
mutateTimestamp(newRecord, 11);
newRecord.sources = clone(newEvidenceBase.sources || []);
newRecord.sources.push({
  id: `${newRecord.id}-primary-source`,
  title: 'Newly preserved primary record',
  sourceType: 'government',
  url: `https://example.invalid/evidence-delta/${encodeURIComponent(newRecord.id)}`,
  publisher: 'Evidence Delta Fixture Authority',
  publishedAt: newRecord.trigger.detectedAt,
  retrievedAt: newRecord.trigger.detectedAt,
  authority: 'primary',
  status: 'preserved',
  hash: `fixture-${newRecord.id}`,
  archivePath: null,
  notes: 'Deterministic evidence-delta fixture.'
});
newRecord.establishedFacts = clone(newEvidenceBase.establishedFacts || []);
newRecord.establishedFacts.push({
  statement: 'A new primary record has been preserved for review.',
  sourceIds: [`${newRecord.id}-primary-source`],
  boundary: 'The fixture proves only that a new source was added, not the underlying allegation.',
  factStatus: 'documented'
});
current.records.push(newRecord);

const contradiction = byId.get(contradictionBase.id);
mutateTimestamp(contradiction, 12);
contradiction.trigger.changeType = 'contradiction';
contradiction.trigger.description = `A contradictory record was added for ${contradiction.title}.`;
contradiction.counterAnalysis = contradiction.counterAnalysis || { alternativeExplanations: [], contradictoryEvidence: [], assessment: '' };
contradiction.counterAnalysis.contradictoryEvidence = appendUnique(
  contradiction.counterAnalysis.contradictoryEvidence,
  'A newly preserved official record attributes the event to a different authority and weakens the current mechanism.'
);
contradiction.counterAnalysis.assessment = 'The new contradictory record requires the factual and speculative conclusions to be re-evaluated.';
contradiction.evidence.confidence = 'low';
contradiction.solidConclusion.confidence = 'low';

const correction = byId.get(correctionBase.id);
mutateTimestamp(correction, 13);
correction.status = 'corrected';
correction.trigger.changeType = 'correction';
correction.trigger.description = `A material correction was issued for ${correction.title}.`;
correction.solidConclusion.text = `Correction: the earlier conclusion for ${correction.title} is narrowed pending review of the corrected primary record.`;
correction.solidConclusion.boundary = 'The previous version remains preserved and must not be presented as current without the correction notice.';
correction.freshness.reviewStatus = 'review_due';

const withdrawal = byId.get(withdrawalBase.id);
mutateTimestamp(withdrawal, 14);
withdrawal.status = 'withdrawn';
withdrawal.freshness.reviewStatus = 'withdrawn';
withdrawal.trigger.changeType = 'other';
withdrawal.trigger.description = `The current interpretation of ${withdrawal.title} was withdrawn after review.`;
withdrawal.speculativeConclusion.text = `The prior interpretation of ${withdrawal.title} has been withdrawn and is retained only for historical transparency.`;
withdrawal.speculativeConclusion.boundary = 'Withdrawn speculative interpretation. It is not current analysis or established fact.';

const supersession = byId.get(supersessionBase.id);
mutateTimestamp(supersession, 15);
supersession.status = 'archived';
supersession.freshness.reviewStatus = 'superseded';
supersession.freshness.supersededBy = `${supersession.id}-replacement`;
supersession.trigger.changeType = 'source_changed';
supersession.trigger.description = `${supersession.title} was superseded by a replacement record.`;

const graph = byId.get(graphBase.id);
mutateTimestamp(graph, 16);
graph.speculativeConclusion.label = 'speculative';
graph.speculativeConclusion.text = `Speculative research hint update for ${graph.title}: a second association was observed, but association remains not proof of control, wrongdoing or coordination.`;
graph.speculativeConclusion.conditions = appendUnique(graph.speculativeConclusion.conditions, 'Independent primary records must document an authority and implementation route.');
graph.speculativeConclusion.falsifiers = appendUnique(graph.speculativeConclusion.falsifiers, 'The apparent association is explained by ordinary shared attendance or data duplication.');
graph.evidence.associationBoundary = 'Association and graph proximity are retained as research hints and are not proof of guilt, control or coordinated intent.';

current.records = current.records.filter(record => record.id !== removedBase.id);

previous.recordCount = previous.records.length;
current.recordCount = current.records.length;
previous.generatedAt = canonical.generatedAt;
current.generatedAt = canonical.generatedAt;
previous.ok = true;
current.ok = true;

const expectations = {
  version: '1.0.0',
  previousRecordCount: previous.recordCount,
  currentRecordCount: current.recordCount,
  expectedUnionRecordCount: previous.recordCount + 1,
  cases: [
    { id: newRecord.id, expectedChangeState: 'new', expectedDeltaTypes: ['new_record'], minimumSeverity: 'high' },
    { id: contradiction.id, expectedChangeState: 'modified', expectedDeltaTypes: ['contradiction_added'], minimumSeverity: 'critical' },
    { id: correction.id, expectedChangeState: 'modified', expectedDeltaTypes: ['correction'], minimumSeverity: 'critical' },
    { id: withdrawal.id, expectedChangeState: 'modified', expectedDeltaTypes: ['withdrawal'], expectedTerminalState: 'withdrawn', minimumSeverity: 'critical' },
    { id: supersession.id, expectedChangeState: 'modified', expectedDeltaTypes: ['supersession'], expectedTerminalState: 'superseded', minimumSeverity: 'critical' },
    { id: graph.id, expectedChangeState: 'modified', expectedDeltaTypes: ['speculative_conclusion_changed'], expectedPresentationClass: 'research_hint', expectedSpeculativeEligible: true, minimumSeverity: 'medium' },
    { id: removedBase.id, expectedChangeState: 'missing_from_current', expectedDeltaTypes: ['record_missing_from_current'], expectedTerminalState: 'missing_from_current', minimumSeverity: 'critical' }
  ],
  boundaries: {
    graphAndSpeculationRetained: true,
    changedRecordsHeldFromFactualSurfaces: true,
    previousAndCurrentVersionsRetained: true,
    automaticPublishingDisabled: true
  }
};

write('previous-package.json', previous);
write('current-package.json', current);
write('expectations.json', expectations);
console.log(`EVIDENCE DELTA FIXTURES: ${previous.recordCount} previous, ${current.recordCount} current, ${expectations.cases.length} adversarial changes.`);
console.log(`Output: ${outputDir}`);
