'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const outputRoot = path.join(root, '_site');
const roots = [root, outputRoot].filter((value, index, all) => all.indexOf(value) === index && fs.existsSync(value));
const generatedAt = new Date().toISOString();
const now = new Date(generatedAt);

const array = value => Array.isArray(value) ? value : [];
const clean = (value, max = 1800) => String(value == null ? '' : value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
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

function validDate(value) {
  const parsed = new Date(value || '');
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 86400000);
}

function reviewInterval(record) {
  const text = clean([record.title, record.lane, record.laneTitle, record.consequenceSummary, ...(record.path || []).map(item => item.value)].join(' '), 8000).toLowerCase();
  if (/\b(?:price|tariff|rate|current office|appointment|director|ownership|shareholding|contract|procurement|funding|sanction|policy in force|implementation status)\b/.test(text)) return { days: 30, class: 'fast-changing-current-state' };
  if (/official|primary|court|regulator|government|corporate filing/.test(clean(record.source?.classification).toLowerCase())) return { days: 90, class: 'primary-or-official-record' };
  return { days: 45, class: 'public-source-lead' };
}

const reverseIndex = readJson('data/reverse-accountability-index.json', { records: [] });
const records = array(reverseIndex.records);
const entries = records.map(record => {
  const sourceDate = validDate(record.source?.publishedAt);
  const actionDate = validDate(record.actionDate);
  const baseline = sourceDate || actionDate || now;
  const baselineType = sourceDate ? 'source-publication-date' : actionDate ? 'action-date-provisional-baseline' : 'build-date-fallback';
  const interval = reviewInterval(record);
  const dueAt = addDays(baseline, interval.days);
  const deltaDays = Math.floor((dueAt.getTime() - now.getTime()) / 86400000);
  const freshnessState = baselineType === 'build-date-fallback'
    ? 'source-date-missing'
    : deltaDays < 0
      ? 'review-due'
      : deltaDays <= 7
        ? 'review-soon'
        : 'within-review-window';
  const recallNotice = freshnessState === 'review-due'
    ? `Evidence recall notice: the current applicability of this record is overdue for re-verification. Age does not make the evidence false, but office, ownership, law, policy, contract status or source availability may have changed.`
    : freshnessState === 'source-date-missing'
      ? 'Evidence recall notice: no reliable source or action date was available, so freshness cannot be established.'
      : '';
  const id = `half-life-${clean(record.id, 220)}`;
  return {
    schemaVersion: 1,
    id,
    sourceRecordId: clean(record.id, 220),
    title: clean(record.title, 500),
    lane: clean(record.lane || 'public-accountability', 160),
    laneTitle: clean(record.laneTitle || 'Public Accountability', 220),
    accountabilityRoute: clean(record.route || 'public-consequence-contracts.html', 900),
    powerSupplyChainRoute: clean(record.powerSupplyChainRoute || `power-supply-chain.html#power-chain-${clean(record.id, 220)}`, 900),
    source: record.source || {},
    baselineAt: baseline.toISOString(),
    baselineType,
    reviewIntervalDays: interval.days,
    reviewClass: interval.class,
    nextReviewAt: dueAt.toISOString(),
    freshnessState,
    daysUntilReview: deltaDays,
    sourceAvailability: 'not-checked-in-static-build',
    currentApplicability: 'not-human-reverified',
    recallNotice,
    reviewQuestions: [
      'Does the original source remain accessible and unchanged?',
      'Has the relevant office, ownership, law, policy, contract or institutional role changed?',
      'Does newer primary evidence confirm, narrow, contradict or supersede the record?',
      'Should any public conclusion, prominence or alert be revised?'
    ],
    evidenceBoundary: 'Evidence age is not a truth score. This system measures when current applicability must be checked again; it must not silently downgrade historical facts or declare a claim false because time passed.'
  };
});

const ledger = {
  schemaVersion: 1,
  generatedAt,
  title: 'Evidence Half-Life Ledger',
  proposition: 'Every material public claim should show when its supporting record was last anchored, when current applicability must be checked again and whether a recall notice is active.',
  boundary: 'Evidence age is not evidence of falsity. Review states concern freshness, source availability and current applicability, not guilt, credibility or truth by themselves.',
  count: entries.length,
  recallCount: entries.filter(item => item.recallNotice).length,
  entries
};
writeEverywhere('data/evidence-half-life.json', `${JSON.stringify(ledger, null, 2)}\n`);

const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Evidence Half-Life | Matrix Reprogrammed</title><meta name="description" content="See when evidence must be re-verified, whether current applicability has been checked and which public records carry an evidence recall notice."><link rel="stylesheet" href="styles.css"><link rel="stylesheet" href="fixes.css"><link rel="stylesheet" href="evidence-half-life.css"></head><body class="half-life-page"><canvas id="matrix" aria-hidden="true"></canvas><div class="page"><header class="half-life-topbar wrap"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil"> MATRIX REPROGRAMMED</a><nav><a href="reverse-accountability-search.html">Reverse Search</a><a href="power-supply-chain.html">Power Supply Chain</a><a href="evidence-vault.html">Evidence Vault</a></nav></header><main><section class="half-life-hero wrap"><p class="half-life-kicker">Evidence should not silently go stale</p><h1>EVIDENCE<br>HALF-LIFE.</h1><p>See when current applicability must be checked again, whether the source remains available and which records carry an evidence recall notice.</p><div class="half-life-rule"><strong>Important:</strong> age does not make evidence false. It triggers a review of changing facts such as office, ownership, law, policy, contracts and implementation.</div><form data-half-life-search class="half-life-search"><label class="sr-only" for="half-life-query">Search evidence review records</label><input id="half-life-query" type="search" placeholder="Search a person, decision, institution or source…"><select data-half-life-filter aria-label="Filter evidence review state"><option value="all">All review states</option><option value="review-due">Review due</option><option value="review-soon">Review soon</option><option value="within-review-window">Within review window</option><option value="source-date-missing">Source date missing</option></select><button type="submit">Review evidence</button></form><p data-half-life-status class="half-life-status" aria-live="polite">Loading evidence review ledger…</p></section><section data-half-life-results class="half-life-results wrap"></section><section class="half-life-boundary wrap"><strong>Boundary:</strong> ${esc(ledger.boundary)}</section></main><footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — evidence remains reviewable, correctable and time-aware.</p></footer></div><script src="matrix.js"></script><script src="evidence-half-life.js"></script><script src="analytics.js"></script></body></html>`;
writeEverywhere('evidence-half-life.html', page);
copyToOutput('evidence-half-life.js');
copyToOutput('evidence-half-life.css');

const updatedIndex = {
  ...reverseIndex,
  records: records.map(record => ({
    ...record,
    evidenceHalfLifeRoute: `evidence-half-life.html#half-life-${clean(record.id, 220)}`
  }))
};
writeEverywhere('data/reverse-accountability-index.json', `${JSON.stringify(updatedIndex, null, 2)}\n`);

const chainLedger = readJson('data/power-supply-chain.json', { chains: [] });
if (array(chainLedger.chains).length) {
  chainLedger.chains = array(chainLedger.chains).map(chain => ({
    ...chain,
    evidenceHalfLifeRoute: `evidence-half-life.html#half-life-${clean(chain.sourceRecordId, 220)}`
  }));
  writeEverywhere('data/power-supply-chain.json', `${JSON.stringify(chainLedger, null, 2)}\n`);
}

const report = {
  ok: entries.length > 0,
  generatedAt,
  recordCount: entries.length,
  recallCount: ledger.recallCount,
  boundary: ledger.boundary
};
writeEverywhere('downloads/evidence-half-life-report.json', `${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) throw new Error('Evidence Half-Life could not build any review records.');
console.log(`Evidence Half-Life installed with ${entries.length} records and ${ledger.recallCount} active recall notices.`);
