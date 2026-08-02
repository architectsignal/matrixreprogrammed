import assert from 'node:assert/strict';
import { classifyAiManagementResponse } from './lib/live-ai-verification-classifier.mjs';

const context = { siteUrl: 'https://matrixreprogrammed.com' };
const fixtures = [
  ['worker-authentication-rejection', { status: 403, origin: 'cloudflare-worker-ai-management', authLayer: 'autonomy-wrapper', contentType: 'application/json', data: { error: 'Forbidden' } }],
  ['missing-worker-route', { status: 404, origin: 'cloudflare-worker-production-boundary', contentType: 'application/json', data: { error: 'Not found' } }],
  ['cloudflare-access-rejection', { status: 302, contentType: 'text/html', server: 'cloudflare', location: 'https://example.cloudflareaccess.com/cdn-cgi/access/login/matrix', data: { raw: '<html>Cloudflare Access</html>' } }],
  ['waf-or-bot-rejection', { status: 403, contentType: 'text/html', server: 'cloudflare', cfRay: 'fixture-LHR', cfMitigated: 'challenge', data: { raw: '<html>Attention Required</html>' } }],
  ['static-asset-interception', { status: 200, contentType: 'text/html', server: 'cloudflare', data: { raw: '<!doctype html><title>Matrix Reprogrammed</title>' } }],
  ['incorrect-origin', { status: 403, origin: 'cloudflare-worker-member-experience', contentType: 'application/json', data: { error: 'Forbidden' } }],
  ['application-exception', { status: 500, origin: 'cloudflare-worker-ai-management', contentType: 'application/json', data: { error: 'AI management failed safely', message: 'Unexpected failure' } }],
  ['schema-or-d1-failure', { status: 503, origin: 'cloudflare-worker-ai-management', contentType: 'application/json', data: { error: 'AI autonomy migration is not applied', schemaReady: false } }]
];

for (const [expected, fixture] of fixtures) {
  assert.equal(classifyAiManagementResponse(fixture, context).code, expected, expected);
}

assert.equal(classifyAiManagementResponse({ status: 200, origin: 'cloudflare-worker-ai-management', contentType: 'application/json', data: { ok: true } }, context).code, 'worker-healthy');
assert.equal(classifyAiManagementResponse({
  status: 308,
  contentType: 'text/html',
  responseUrl: 'https://www.matrixreprogrammed.com/api/ai-management/admin/health',
  location: 'https://matrixreprogrammed.com/api/ai-management/admin/health',
  data: {}
}, { siteUrl: 'https://www.matrixreprogrammed.com' }).code, 'incorrect-origin');

console.log('Live AI verification classifier passed all required failure classes plus healthy Worker routing.');
