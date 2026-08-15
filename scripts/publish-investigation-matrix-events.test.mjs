import assert from 'node:assert/strict';
import { buildSourceEvents, publishInvestigationMatrixEvents } from './publish-investigation-matrix-events.mjs';

const state = {
  'official-change': {
    label: 'Official Change Feed', lane: 'enforcement', authority: 'official-primary', url: 'https://official.example/change',
    checkedAt: '2026-08-13T12:00:00.000Z', status: 'fetched', statusCode: 200, bodyHash: 'a'.repeat(64),
    changed: true, itemCount: 3, resourceId: 'approved-public-source', costConfirmedZero: true
  },
  'official-failure': {
    label: 'Official Failure Feed', lane: 'filings', authority: 'official-primary', url: 'https://official.example/failure',
    checkedAt: '2026-08-13T12:00:00.000Z', status: 'failed-provider', changed: false, error: 'HTTP 503'
  },
  unchanged: {
    label: 'Unchanged Feed', url: 'https://official.example/unchanged', checkedAt: '2026-08-13T12:00:00.000Z',
    status: 'fetched', bodyHash: 'b'.repeat(64), changed: false
  }
};

const events = buildSourceEvents(state);
assert.equal(events.length, 2);
assert.equal(events[0].eventType, 'source.changed');
assert.equal(events[0].evidence.directlyVerifiable, true);
assert.equal(events[0].evidence.contentSha256.length, 64);
assert.equal(events[0].payload.cost_confirmed_zero, true);
assert.equal(events[1].eventType, 'source.failed');
assert.equal(events[1].evidence.directlyVerifiable, false);
assert.ok(events.every(event => !event.payload.evidence?.publication_approved));

const calls = [];
const fetchImpl = async (url, options = {}) => {
  calls.push({ url, options });
  if (url.endsWith('/api/matrix/evolution')) return new Response(JSON.stringify({ ok: true, live: true }), { status: 200 });
  if (url.endsWith('/api/matrix/admin/events')) return new Response(JSON.stringify({ ok: true, created: calls.length === 2, eventId: `event-${calls.length}` }), { status: calls.length === 2 ? 201 : 200 });
  if (url.endsWith('/api/matrix/admin/living-cycle')) return new Response(JSON.stringify({ ok: true, report: { cycle_id: 'living-test' } }), { status: 200 });
  return new Response('missing', { status: 404 });
};

const published = await publishInvestigationMatrixEvents({ state, siteUrl: 'https://matrix.example', token: 'owner-secret', fetchImpl });
assert.equal(published.ok, true);
assert.equal(published.candidates, 2);
assert.equal(published.created, 1);
assert.equal(published.reused, 1);
assert.equal(published.cycle_id, 'living-test');
assert.equal(calls.filter(call => call.url.endsWith('/api/matrix/admin/events')).length, 2);
assert.ok(calls.filter(call => call.url.endsWith('/api/matrix/admin/events')).every(call => call.options.headers['x-admin-token'] === 'owner-secret'));

const missingToken = await publishInvestigationMatrixEvents({ state, siteUrl: 'https://matrix.example', token: '', fetchImpl });
assert.equal(missingToken.skipped, true);
assert.equal(missingToken.reason, 'admin-token-unavailable');

console.log('Investigation-to-Living-Matrix publisher passed: changed and failed sources become idempotent owner-authenticated events, unchanged sources stay quiet, and absent credentials fail closed.');
