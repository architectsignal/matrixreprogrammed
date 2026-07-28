'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const outputRoot = path.join(root, '_site');
const roots = [root, outputRoot].filter((value, index, all) => all.indexOf(value) === index && fs.existsSync(value));
const generatedAt = new Date().toISOString();
const now = new Date(generatedAt);

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

function date(value) {
  const parsed = new Date(value || '');
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function latestEvent(events, type) {
  return events.filter(item => item.type === type).sort((a, b) => (date(b.occurredAt)?.getTime() || 0) - (date(a.occurredAt)?.getTime() || 0))[0] || null;
}

function verifiedEvent(event) {
  return Boolean(event && date(event.occurredAt) && clean(event.verifiedBy, 200) && clean(event.verificationReference, 1000));
}

const reverseIndex = readJson('data/reverse-accountability-index.json', { records: [] });
const chains = readJson('data/power-supply-chain.json', { chains: [] });
const redTeam = readJson('data/red-team-mirror.json', { mirrors: [] });
const eventLedger = readJson('data/public-answer-clock-events.json', { events: [] });
const chainsById = new Map(array(chains.chains).map(item => [clean(item.sourceRecordId, 220), item]));
const mirrorsById = new Map(array(redTeam.mirrors).map(item => [clean(item.sourceRecordId, 220), item]));
const allowedTypes = new Set(['prepared','delivered','receipt-confirmed','response-received','correction-issued','closed','withdrawn']);
const validEvents = array(eventLedger.events)
  .filter(event => allowedTypes.has(clean(event.type, 80)) && clean(event.sourceRecordId, 220) && date(event.occurredAt))
  .map(event => ({
    id: clean(event.id || `${event.sourceRecordId}-${event.type}-${event.occurredAt}`, 260),
    sourceRecordId: clean(event.sourceRecordId, 220),
    type: clean(event.type, 80),
    occurredAt: date(event.occurredAt).toISOString(),
    target: clean(event.target, 500),
    channel: clean(event.channel, 160),
    verifiedBy: clean(event.verifiedBy, 200),
    verificationReference: clean(event.verificationReference, 1000),
    summary: clean(event.summary, 1200),
    publicRoute: clean(event.publicRoute, 900)
  }));

const clocks = array(reverseIndex.records).map(record => {
  const id = clean(record.id, 220);
  const chain = chainsById.get(id);
  const mirror = mirrorsById.get(id);
  const authorization = array(chain?.stages).find(item => item.id === 'authorization');
  const targetResolved = Boolean(authorization && authorization.state !== 'unresolved');
  const target = targetResolved ? clean(authorization.value, 500) : 'Responsible authority not yet resolved';
  const events = validEvents.filter(item => item.sourceRecordId === id).sort((a, b) => (date(a.occurredAt)?.getTime() || 0) - (date(b.occurredAt)?.getTime() || 0));
  const prepared = latestEvent(events, 'prepared');
  const delivered = latestEvent(events, 'delivered');
  const receipt = latestEvent(events, 'receipt-confirmed');
  const response = latestEvent(events, 'response-received');
  const correction = latestEvent(events, 'correction-issued');
  const closed = latestEvent(events, 'closed');
  const withdrawn = latestEvent(events, 'withdrawn');
  const deliveryVerified = verifiedEvent(delivered);
  const startedAt = deliveryVerified ? delivered.occurredAt : '';
  const elapsedDays = deliveryVerified ? Math.max(0, Math.floor((now.getTime() - date(startedAt).getTime()) / 86400000)) : null;
  const followUpReviewAt = deliveryVerified ? new Date(date(startedAt).getTime() + 14 * 86400000).toISOString() : '';
  let status = 'not-prepared';
  if (prepared) status = 'prepared-not-delivered';
  if (delivered && !deliveryVerified) status = 'delivery-unverified-clock-stopped';
  if (deliveryVerified) status = 'delivered-awaiting-response';
  if (receipt && deliveryVerified) status = 'receipt-confirmed-awaiting-response';
  if (response) status = 'response-received-under-review';
  if (correction) status = 'correction-issued';
  if (closed) status = 'closed';
  if (withdrawn) status = 'withdrawn';
  const question = clean(record.unansweredQuestions?.[0] || `Which decision, authority and evidence would resolve the accountability record for ${record.title}?`, 1000);
  return {
    schemaVersion: 1,
    id: `answer-clock-${id}`,
    sourceRecordId: id,
    title: clean(record.title, 500),
    lane: clean(record.lane || 'public-accountability', 160),
    laneTitle: clean(record.laneTitle || 'Public Accountability', 220),
    question,
    target,
    targetStatus: targetResolved ? 'resolved-from-review-stage-authorization-record' : 'unresolved-no-contact-authorized',
    status,
    clockRunning: deliveryVerified && !response && !closed && !withdrawn,
    startedAt,
    elapsedDays,
    followUpReviewAt,
    followUpBoundary: followUpReviewAt ? 'This is an internal editorial review date, not a legal deadline or proof that the recipient was required to respond.' : 'No editorial follow-up date exists because verified delivery has not occurred.',
    events,
    deliveryProof: deliveryVerified ? {
      verifiedBy: delivered.verifiedBy,
      verificationReference: delivered.verificationReference,
      channel: delivered.channel,
      target: delivered.target || target
    } : null,
    responseSummary: response ? clean(response.summary || 'A response event is recorded and requires editorial review.', 1200) : '',
    correctionSummary: correction ? clean(correction.summary || 'A correction event is recorded.', 1200) : '',
    nonResponseBoundary: 'No response, delayed response or refusal to answer does not prove wrongdoing, dishonesty or the truth of the underlying proposition.',
    reviewRequirement: 'Any received response must be preserved, verified, summarized fairly and attached to the same record before a public status changes.',
    accountabilityRoute: clean(record.route || 'public-consequence-contracts.html', 900),
    powerSupplyChainRoute: clean(record.powerSupplyChainRoute || `power-supply-chain.html#power-chain-${id}`, 900),
    redTeamMirrorRoute: clean(record.redTeamMirrorRoute || `red-team-mirror.html#red-team-${id}`, 900),
    source: record.source || {},
    falsifiers: array(mirror?.falsifiers).map(item => clean(item, 900)).filter(Boolean).slice(0, 8),
    evidenceBoundary: 'Public Answer Clock documents a question and verified communication history. It does not convert silence, delay, refusal or an incomplete answer into proof of wrongdoing.'
  };
});

const ledger = {
  schemaVersion: 1,
  generatedAt,
  title: 'Public Answer Clock Ledger',
  proposition: 'A precise public-interest question should remain attached to the permanent accountability record, together with verified delivery, response, correction and closure history.',
  boundary: 'No clock starts without verified delivery. Non-response is never proof of wrongdoing. Editorial follow-up dates are not legal deadlines.',
  allowedEventTypes: [...allowedTypes],
  count: clocks.length,
  runningCount: clocks.filter(item => item.clockRunning).length,
  clocks
};
writeEverywhere('data/public-answer-clocks.json', `${JSON.stringify(ledger, null, 2)}\n`);

const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Public Answer Clock | Matrix Reprogrammed</title><meta name="description" content="Track precise public-interest questions, verified delivery, responses, corrections and closures without treating silence as guilt."><link rel="stylesheet" href="styles.css"><link rel="stylesheet" href="fixes.css"><link rel="stylesheet" href="public-answer-clock.css"></head><body class="answer-clock-page"><canvas id="matrix" aria-hidden="true"></canvas><div class="page"><header class="answer-clock-topbar wrap"><a class="brand" href="index.html"><img src="sigil.png" alt="Matrix Reprogrammed sigil"> MATRIX REPROGRAMMED</a><nav><a href="reverse-accountability-search.html">Reverse Search</a><a href="red-team-mirror.html">Red-Team Mirror</a><a href="accountability-review-inbox.html">Review Inbox</a></nav></header><main><section class="answer-clock-hero wrap"><p class="answer-clock-kicker">Questions should outlive the news cycle</p><h1>PUBLIC ANSWER<br>CLOCK.</h1><p>Keep the question, verified delivery history, response, correction and closure attached to the permanent accountability record.</p><div class="answer-clock-rule"><strong>No silence verdict:</strong> ${esc(ledger.boundary)}</div><form data-answer-clock-search class="answer-clock-search"><label class="sr-only" for="answer-clock-query">Search public answer clocks</label><input id="answer-clock-query" type="search" placeholder="Search a question, target, record or response…"><select data-answer-clock-filter aria-label="Filter Public Answer Clock status"><option value="all">All statuses</option><option value="not-prepared">Not prepared</option><option value="prepared-not-delivered">Prepared, not delivered</option><option value="delivered-awaiting-response">Delivered, awaiting response</option><option value="response-received-under-review">Response received</option><option value="closed">Closed</option></select><button type="submit">Open clocks</button></form><p data-answer-clock-status class="answer-clock-status" aria-live="polite">Loading verified communication history…</p></section><section data-answer-clock-results class="answer-clock-results wrap"></section><section class="answer-clock-boundary wrap"><strong>Boundary:</strong> ${esc(ledger.boundary)}</section></main><footer class="footer wrap"><p><strong>MATRIX REPROGRAMMED</strong> — keep the question and the answer attached to the record.</p></footer></div><script src="matrix.js"></script><script src="public-answer-clock.js"></script><script src="analytics.js"></script></body></html>`;
writeEverywhere('public-answer-clock.html', page);
copyToOutput('public-answer-clock.js');
copyToOutput('public-answer-clock.css');
copyToOutput('data/public-answer-clock-events.json');

const updatedIndex = {
  ...reverseIndex,
  records: array(reverseIndex.records).map(record => ({ ...record, publicAnswerClockRoute: `public-answer-clock.html#answer-clock-${clean(record.id, 220)}` }))
};
writeEverywhere('data/reverse-accountability-index.json', `${JSON.stringify(updatedIndex, null, 2)}\n`);

for (const relative of ['data/power-supply-chain.json','data/evidence-half-life.json','data/power-diff.json','data/red-team-mirror.json']) {
  const payload = readJson(relative, {});
  if (Array.isArray(payload.chains)) payload.chains = payload.chains.map(item => ({ ...item, publicAnswerClockRoute: `public-answer-clock.html#answer-clock-${clean(item.sourceRecordId, 220)}` }));
  if (Array.isArray(payload.entries)) payload.entries = payload.entries.map(item => item.status === 'record-ended-or-removed' ? item : ({ ...item, publicAnswerClockRoute: `public-answer-clock.html#answer-clock-${clean(item.sourceRecordId, 220)}` }));
  if (Array.isArray(payload.mirrors)) payload.mirrors = payload.mirrors.map(item => ({ ...item, publicAnswerClockRoute: `public-answer-clock.html#answer-clock-${clean(item.sourceRecordId, 220)}` }));
  writeEverywhere(relative, `${JSON.stringify(payload, null, 2)}\n`);
}

const report = {
  ok: clocks.length > 0,
  generatedAt,
  clockCount: clocks.length,
  runningCount: ledger.runningCount,
  unverifiedDeliveryCount: clocks.filter(item => item.status === 'delivery-unverified-clock-stopped').length,
  silenceNeverVerdict: clocks.every(item => item.nonResponseBoundary.includes('does not prove wrongdoing')),
  boundary: ledger.boundary
};
writeEverywhere('downloads/public-answer-clock-report.json', `${JSON.stringify(report, null, 2)}\n`);
if (!report.ok || !report.silenceNeverVerdict) throw new Error('Public Answer Clock could not build safely.');
console.log(`Public Answer Clock installed with ${clocks.length} records and ${ledger.runningCount} verified running clock(s).`);
