'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = process.cwd();
const outputRoot = path.join(root, '_site');
const roots = [root, outputRoot].filter((value, index, all) => all.indexOf(value) === index && fs.existsSync(value));
const generatedAt = new Date().toISOString();

const array = value => Array.isArray(value) ? value : [];
const clean = (value, max = 2400) => String(value == null ? '' : value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[char]));

function readJson(relative, fallback = {}) {
  try { return JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8')); } catch { return fallback; }
}

function writeEverywhere(relative, content) {
  for (const base of roots) {
    const file = path.join(base, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
}

function copyToOutput(relative) {
  const source = path.join(root, relative);
  if (!fs.existsSync(source) || !fs.existsSync(outputRoot)) return;
  const destination = path.join(outputRoot, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.keys(value).sort().reduce((out, key) => { out[key] = stable(value[key]); return out; }, {});
  return value;
}

function hash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function snapshotRecord(record) {
  return {
    id: clean(record.id, 220),
    title: clean(record.title, 500),
    lane: clean(record.lane, 160),
    laneTitle: clean(record.laneTitle, 220),
    consequenceSummary: clean(record.consequenceSummary, 1400),
    sourceClassification: clean(record.source?.classification, 180),
    sourceLabel: clean(record.source?.label, 260),
    sourceUrl: clean(record.source?.url, 1200),
    path: array(record.path).map(item => ({ type: clean(item.type, 80), label: clean(item.label, 180), value: clean(item.value, 1600), status: clean(item.status, 120) })),
    unansweredQuestions: array(record.unansweredQuestions).map(item => clean(item, 900)).filter(Boolean),
    checkpoints: array(record.checkpoints).map(item => ({ id: clean(item.id, 220), label: clean(item.label, 260), dueAt: clean(item.dueAt, 80), status: clean(item.status, 120), reviewQuestion: clean(item.reviewQuestion, 900) })),
    knownBeneficiaries: array(record.knownBeneficiaries).map(item => clean(item, 260)).filter(Boolean),
    affectedGroups: array(record.affectedGroups).map(item => clean(item, 260)).filter(Boolean),
    evidenceBoundary: clean(record.evidenceBoundary, 1400)
  };
}

function flatten(record) {
  const values = {
    title: record.title,
    lane: record.lane,
    laneTitle: record.laneTitle,
    consequenceSummary: record.consequenceSummary,
    sourceClassification: record.sourceClassification,
    sourceLabel: record.sourceLabel,
    sourceUrl: record.sourceUrl,
    unansweredQuestions: record.unansweredQuestions,
    checkpoints: record.checkpoints,
    knownBeneficiaries: record.knownBeneficiaries,
    affectedGroups: record.affectedGroups,
    evidenceBoundary: record.evidenceBoundary
  };
  for (const item of record.path || []) values[`path.${item.type || item.label}`] = item;
  return values;
}

function diffRecord(previous, current) {
  const before = flatten(previous);
  const after = flatten(current);
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  const changes = [];
  for (const key of keys) {
    const oldValue = before[key];
    const newValue = after[key];
    if (JSON.stringify(stable(oldValue)) === JSON.stringify(stable(newValue))) continue;
    const oldEmpty = oldValue == null || oldValue === '' || (Array.isArray(oldValue) && oldValue.length === 0);
    const newEmpty = newValue == null || newValue === '' || (Array.isArray(newValue) && newValue.length === 0);
    let type = oldEmpty && !newEmpty ? 'added' : !oldEmpty && newEmpty ? 'ended' : 'changed';
    const newText = clean(typeof newValue === 'string' ? newValue : JSON.stringify(newValue), 2000).toLowerCase();
    if (/\b(?:disputed|challenged|contradicted|contested)\b/.test(newText)) type = 'disputed';
    if (/\b(?:corrected|correction|retracted|withdrawn)\b/.test(newText)) type = 'corrected';
    changes.push({ field: key, type, previous: oldValue ?? null, current: newValue ?? null });
  }
  return changes;
}

const reverseIndex = readJson('data/reverse-accountability-index.json', { records: [] });
const currentRecords = array(reverseIndex.records).map(snapshotRecord);
const currentSnapshot = {
  schemaVersion: 1,
  generatedAt,
  title: 'Power Diff Current Snapshot',
  boundary: 'This is the current normalized snapshot. It is not evidence that a change occurred until compared with a genuine earlier snapshot.',
  records: currentRecords.map(record => ({ ...record, fingerprint: hash(record) }))
};
writeEverywhere('data/power-diff-current.json', `${JSON.stringify(currentSnapshot, null, 2)}\n`);

const baseline = readJson('data/power-diff-baseline.json', { records: [] });
const baselineMap = new Map(array(baseline.records).map(item => [clean(item.id, 220), item]));
const entries = currentSnapshot.records.map(current => {
  const previous = baselineMap.get(current.id);
  const changes = previous ? diffRecord(previous, current) : [];
  return {
    schemaVersion: 1,
    id: `diff-${current.id}`,
    sourceRecordId: current.id,
    title: current.title,
    lane: current.lane,
    laneTitle: current.laneTitle,
    status: previous ? (changes.length ? 'material-diff' : 'no-material-change') : 'baseline-established',
    previousFingerprint: previous?.fingerprint || '',
    currentFingerprint: current.fingerprint,
    comparedAt: generatedAt,
    baselineAt: clean(baseline.generatedAt, 80),
    changes,
    summary: previous
      ? changes.length ? `${changes.length} material field change${changes.length === 1 ? '' : 's'} detected against the stored baseline.` : 'No material field change was detected against the stored baseline.'
      : 'A canonical baseline fingerprint has been established. No historical change is claimed because no genuine earlier snapshot was available.',
    accountabilityRoute: clean(reverseIndex.records.find(item => item.id === current.id)?.route || 'public-consequence-contracts.html', 900),
    powerSupplyChainRoute: clean(reverseIndex.records.find(item => item.id === current.id)?.powerSupplyChainRoute || `power-supply-chain.html#power-chain-${current.id}`, 900),
    evidenceHalfLifeRoute: clean(reverseIndex.records.find(item => item.id === current.id)?.evidenceHalfLifeRoute || `evidence-half-life.html#half-life-${current.id}`, 900),
    evidenceBoundary: 'Power Diff reports normalized field changes, not guilt, wrongdoing or causal significance. Every material change must still be interpreted against original sources, timing, corrections and alternative explanations.'
  };
});

const removedEntries = array(baseline.records)
  .filter(previous => !currentSnapshot.records.some(current => current.id === previous.id))
  .map(previous => ({
    schemaVersion: 1,
    id: `diff-${clean(previous.id, 220)}`,
    sourceRecordId: clean(previous.id, 220),
    title: clean(previous.title, 500),
    lane: clean(previous.lane, 160),
    laneTitle: clean(previous.laneTitle, 220),
    status: 'record-ended-or-removed',
    previousFingerprint: clean(previous.fingerprint, 80),
    currentFingerprint: '',
    comparedAt: generatedAt,
    baselineAt: clean(baseline.generatedAt, 80),
    changes: [{ field: 'record', type: 'ended', previous, current: null }],
    summary: 'The record existed in the stored baseline but is absent from the current snapshot. Removal does not establish why it ended and requires human review.',
    evidenceBoundary: 'Absence may reflect correction, consolidation, expiry, route changes or a build defect. It must not be interpreted as proof of concealment.'
  }));

const ledger = {
  schemaVersion: 1,
  generatedAt,
  title: 'Power Diff Ledger',
  baselineAvailable: baselineMap.size > 0,
  baselineAt: clean(baseline.generatedAt, 80),
  proposition: 'Show exactly what was added, changed, ended, disputed or corrected instead of forcing readers to reread a complete dossier.',
  boundary: 'No historical change is claimed without a genuine prior snapshot. A field difference is not automatically important, causal or evidence of wrongdoing.',
  count: entries.length + removedEntries.length,
  materialDiffCount: [...entries, ...removedEntries].filter(item => ['material-diff','record-ended-or-removed'].includes(item.status)).length,
  entries: [...entries, ...removedEntries]
};
writeEverywhere('data/power-diff.json', `${JSON.stringify(ledger, null, 2)}\n`);

const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Power Diff | Matrix Reprogrammed</title><meta name="description" content="See exactly what was added, changed, ended, disputed or corrected in accountability records, with no historical claim unless a genuine prior snapshot exists."><link rel="stylesheet" href="styles.css"><link rel="stylesheet" href="fixes.css"><link rel="stylesheet" href="power-diff.css"></head><body class="power-diff-page"><canvas id="matrix" aria-hidden="true"></canvas><div class="page"><header class="power-diff-topbar wrap"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil"> MATRIX REPROGRAMMED</a><nav><a href="reverse-accountability-search.html">Reverse Search</a><a href="power-supply-chain.html">Power Supply Chain</a><a href="evidence-half-life.html">Evidence Half-Life</a></nav></header><main><section class="power-diff-hero wrap"><p class="power-diff-kicker">A public change log for power</p><h1>POWER<br>DIFF.</h1><p>See exactly what changed without rereading an entire dossier. The first trustworthy snapshot establishes a baseline; it does not invent a past.</p><div class="power-diff-rule"><strong>Baseline rule:</strong> ${esc(ledger.boundary)}</div><form data-power-diff-search class="power-diff-search"><label class="sr-only" for="power-diff-query">Search Power Diff records</label><input id="power-diff-query" type="search" placeholder="Search a record, institution or changed field…"><select data-power-diff-filter aria-label="Filter diff status"><option value="all">All statuses</option><option value="material-diff">Material diff</option><option value="no-material-change">No material change</option><option value="baseline-established">Baseline established</option><option value="record-ended-or-removed">Ended or removed</option></select><button type="submit">Show changes</button></form><p data-power-diff-status class="power-diff-status" aria-live="polite">Loading normalized snapshots…</p></section><section data-power-diff-results class="power-diff-results wrap"></section><section class="power-diff-boundary wrap"><strong>Boundary:</strong> ${esc(ledger.boundary)}</section></main><footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — every material change should remain visible and reviewable.</p></footer></div><script src="matrix.js"></script><script src="power-diff.js"></script><script src="analytics.js"></script></body></html>`;
writeEverywhere('power-diff.html', page);
copyToOutput('power-diff.js');
copyToOutput('power-diff.css');

const updatedIndex = {
  ...reverseIndex,
  records: array(reverseIndex.records).map(record => ({ ...record, powerDiffRoute: `power-diff.html#diff-${clean(record.id, 220)}` }))
};
writeEverywhere('data/reverse-accountability-index.json', `${JSON.stringify(updatedIndex, null, 2)}\n`);

for (const relative of ['data/power-supply-chain.json','data/evidence-half-life.json']) {
  const payload = readJson(relative, {});
  if (Array.isArray(payload.chains)) payload.chains = payload.chains.map(item => ({ ...item, powerDiffRoute: `power-diff.html#diff-${clean(item.sourceRecordId, 220)}` }));
  if (Array.isArray(payload.entries)) payload.entries = payload.entries.map(item => ({ ...item, powerDiffRoute: `power-diff.html#diff-${clean(item.sourceRecordId, 220)}` }));
  writeEverywhere(relative, `${JSON.stringify(payload, null, 2)}\n`);
}

const report = {
  ok: entries.length > 0,
  generatedAt,
  baselineAvailable: ledger.baselineAvailable,
  recordCount: ledger.count,
  materialDiffCount: ledger.materialDiffCount,
  baselineOnlyCount: ledger.entries.filter(item => item.status === 'baseline-established').length,
  boundary: ledger.boundary
};
writeEverywhere('downloads/power-diff-report.json', `${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) throw new Error('Power Diff could not establish any normalized record snapshots.');
console.log(`Power Diff installed with ${ledger.count} records; baseline available: ${ledger.baselineAvailable}.`);
