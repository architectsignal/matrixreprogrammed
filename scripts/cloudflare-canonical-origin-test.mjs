import assert from 'node:assert/strict';
import worker from '../src/worker-production.js';

const wwwRequest = new Request('https://www.matrixreprogrammed.com/api/paypal/config?source=member-page', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ probe: true })
});
const redirected = await worker.fetch(wwwRequest, {}, {});
assert.equal(redirected.status, 308, 'www member/API requests must use a method-preserving redirect');
assert.equal(
  redirected.headers.get('location'),
  'https://matrixreprogrammed.com/api/paypal/config?source=member-page',
  'canonical redirect must preserve the full path and query'
);

const apexRequest = new Request('https://matrixreprogrammed.com/api/paypal/config', { method: 'GET' });
const routed = await worker.fetch(apexRequest, {}, {});
assert.notEqual(routed.status, 308, 'apex requests must continue into the normal Cloudflare route');
assert.equal(routed.status, 503, 'without a D1 binding, the authoritative PayPal route must fail closed rather than redirect or fall back');

console.log('Cloudflare canonical-origin runtime test passed: www POST preserved by 308 and apex routing remained authoritative.');
