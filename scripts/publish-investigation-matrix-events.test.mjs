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
assert.deepEqual(published.transportFallbacks, []);
assert.equal(calls.filter(call => call.url.endsWith('/api/matrix/admin/events')).length, 2);
assert.ok(calls.filter(call => call.url.endsWith('/api/matrix/admin/events')).every(call => call.options.headers['x-admin-token'] === 'owner-secret'));

const missingToken = await publishInvestigationMatrixEvents({ state, siteUrl: 'https://matrix.example', token: '', fetchImpl });
assert.equal(missingToken.skipped, true);
assert.equal(missingToken.reason, 'admin-token-unavailable');

const workerBase = 'https://matrixreprogrammed.njmgroupfrance.workers.dev';
const challengeCalls = [];
const challengeFetch = async (url, options = {}) => {
  challengeCalls.push({ url, options });
  if (url.startsWith('https://matrixreprogrammed.com/')) {
    return new Response('<!doctype html><html><head><title>Just a moment...</title></head><body>cloudflare</body></html>', {
      status: 403,
      headers: { 'content-type': 'text/html', 'cf-mitigated': 'challenge' }
    });
  }
  if (url === `${workerBase}/api/matrix/evolution`) return new Response(JSON.stringify({ ok: true, live: true }), { status: 200 });
  if (url === `${workerBase}/api/matrix/admin/events`) return new Response(JSON.stringify({ ok: true, created: true, eventId: `fallback-event-${challengeCalls.length}` }), { status: 201 });
  if (url === `${workerBase}/api/matrix/admin/living-cycle`) return new Response(JSON.stringify({ ok: true, report: { cycle_id: 'fallback-cycle' } }), { status: 200 });
  return new Response('missing', { status: 404 });
};

const fallbackPublished = await publishInvestigationMatrixEvents({
  state,
  siteUrl: 'https://matrixreprogrammed.com',
  fallbackSiteUrl: workerBase,
  token: 'owner-secret',
  fetchImpl: challengeFetch
});
assert.equal(fallbackPublished.ok, true);
assert.equal(fallbackPublished.cycle_id, 'fallback-cycle');
assert.equal(fallbackPublished.transportFallbacks.length, 4);
assert.ok(fallbackPublished.transportFallbacks.every(item => item.reason === 'known-cloudflare-challenge'));
assert.equal(challengeCalls.filter(call => call.url.startsWith('https://matrixreprogrammed.com') && call.options.headers?.['x-admin-token']).length, 3);
assert.ok(challengeCalls.filter(call => call.url.startsWith(workerBase) && call.options.method === 'POST').every(call => call.options.headers['x-admin-token'] === 'owner-secret'));

let unrecognizedFallbackCalls = 0;
await assert.rejects(
  publishInvestigationMatrixEvents({
    state,
    siteUrl: 'https://matrixreprogrammed.com',
    fallbackSiteUrl: workerBase,
    token: 'owner-secret',
    fetchImpl: async url => {
      if (url.startsWith(workerBase)) unrecognizedFallbackCalls += 1;
      return new Response(JSON.stringify({ error: 'forbidden-by-policy' }), { status: 403, headers: { 'content-type': 'application/json' } });
    }
  }),
  /403 forbidden-by-policy/
);
assert.equal(unrecognizedFallbackCalls, 0, 'an ordinary authorization failure must never trigger transport fallback');

await assert.rejects(
  publishInvestigationMatrixEvents({
    state,
    siteUrl: 'https://matrixreprogrammed.com',
    fallbackSiteUrl: 'https://untrusted.example',
    token: 'owner-secret',
    fetchImpl: async url => url.startsWith('https://untrusted.example')
      ? new Response(JSON.stringify({ ok: true }), { status: 200 })
      : new Response('<title>Just a moment...</title>cloudflare', { status: 403, headers: { 'content-type': 'text/html' } })
  }),
  /403/
);

console.log('Investigation-to-Living-Matrix publisher passed: events remain idempotent and authenticated, only the canonical Worker receives strict challenge fallback, ordinary 403 responses fail closed, and absent credentials stay quiet.');
