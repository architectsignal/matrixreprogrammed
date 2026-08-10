'use strict';

const assert = require('assert');
const { verifyCloudflareGitBuildDisconnection } = require('./cloudflare-live-zero-build-proof.js');

function response(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return payload; }
  };
}

function makeFetch({
  workerTriggers = [],
  pagesProjects = [],
  pagesByPage = null,
  pagesResultInfo = null,
  failures = {},
  requests = []
} = {}) {
  return async (url, options = {}) => {
    const parsed = new URL(url);
    const key = parsed.pathname;
    requests.push({
      key,
      search: parsed.search,
      authorization: options?.headers?.Authorization || ''
    });
    if (failures[key]) return response({ success: false, errors: [{ message: failures[key] }] }, 403);
    if (key.endsWith('/workers/scripts')) {
      return response({ success: true, result: [{ id: 'matrixreprogrammed', tag: 'worker-tag-123' }] });
    }
    if (key.endsWith('/builds/workers/worker-tag-123/triggers')) {
      return response({ success: true, result: workerTriggers });
    }
    if (key.endsWith('/pages/projects')) {
      const page = Number(parsed.searchParams.get('page') || 1);
      const result = Array.isArray(pagesByPage)
        ? (pagesByPage[page - 1] || [])
        : pagesProjects;
      const resultInfo = pagesResultInfo || {
        total_pages: Array.isArray(pagesByPage) ? Math.max(1, pagesByPage.length) : 1
      };
      return response({ success: true, result, result_info: resultInfo });
    }
    return response({ success: false, errors: [{ message: `Unexpected URL ${url}` }] }, 404);
  };
}

async function expectReject(promise, pattern) {
  let error = null;
  try { await promise; } catch (caught) { error = caught; }
  assert(error, 'Expected verification to reject');
  assert.match(error.message, pattern);
}

(async () => {
  const directUploadProject = {
    name: 'matrixreprogrammed',
    domains: ['matrixreprogrammed.pages.dev', 'matrixreprogrammed.com'],
    source: null
  };
  const unrelatedGitProject = {
    name: 'other-site',
    domains: ['other-site.pages.dev'],
    source: { type: 'github', config: { owner: 'someone', repo_name: 'other-repo' } }
  };

  const splitRequests = [];
  const proof = await verifyCloudflareGitBuildDisconnection({
    fetchImpl: makeFetch({ pagesProjects: [directUploadProject, unrelatedGitProject], requests: splitRequests }),
    workerToken: 'workers-builds-token',
    pagesToken: 'pages-read-token',
    accountId: 'account-123',
    now: new Date('2026-08-10T08:40:00.000Z')
  });
  assert.equal(proof.ok, true);
  assert.equal(proof.worker.workersBuildTriggers, 0);
  assert.equal(proof.worker.gitBuildsDisconnected, true);
  assert.equal(proof.pages.projectsEnumerated, 2);
  assert.equal(proof.pages.relevantProjects.length, 1);
  assert.equal(proof.pages.gitSourcesConnected, 0);
  for (const request of splitRequests.filter(item => item.key.includes('/workers/') || item.key.includes('/builds/workers/'))) {
    assert.equal(request.authorization, 'Bearer workers-builds-token');
  }
  for (const request of splitRequests.filter(item => item.key.includes('/pages/projects'))) {
    assert.equal(request.authorization, 'Bearer pages-read-token');
    assert(!request.search.includes('per_page='), 'Pages proof must not force an unsupported per_page value');
  }

  const paginationRequests = [];
  const paginatedProof = await verifyCloudflareGitBuildDisconnection({
    fetchImpl: makeFetch({
      pagesByPage: [[unrelatedGitProject], [directUploadProject]],
      requests: paginationRequests
    }),
    token: 'test-token',
    accountId: 'account-123'
  });
  assert.equal(paginatedProof.pages.projectsEnumerated, 2);
  assert.equal(paginatedProof.pages.relevantProjects.length, 1);
  const pageRequests = paginationRequests.filter(item => item.key.endsWith('/pages/projects'));
  assert.equal(pageRequests.length, 2);
  assert.equal(pageRequests[0].search, '?page=1');
  assert.equal(pageRequests[1].search, '?page=2');

  await expectReject(
    verifyCloudflareGitBuildDisconnection({
      fetchImpl: makeFetch({
        workerTriggers: [{ trigger_uuid: 'trigger-1', branch_includes: ['main'] }],
        pagesProjects: [directUploadProject]
      }),
      token: 'test-token',
      accountId: 'account-123'
    }),
    /still has 1 Workers Builds trigger/
  );

  await expectReject(
    verifyCloudflareGitBuildDisconnection({
      fetchImpl: makeFetch({
        pagesProjects: [{
          name: 'matrixreprogrammed',
          domains: ['matrixreprogrammed.com'],
          source: { type: 'github', config: { owner: 'architectsignal', repo_name: 'matrixreprogrammed' } }
        }]
      }),
      token: 'test-token',
      accountId: 'account-123'
    }),
    /Pages still has Git source control/
  );

  await expectReject(
    verifyCloudflareGitBuildDisconnection({
      fetchImpl: makeFetch({ failures: { '/client/v4/accounts/account-123/builds/workers/worker-tag-123/triggers': 'permission denied' } }),
      token: 'test-token',
      accountId: 'account-123'
    }),
    /permission denied/
  );

  await expectReject(
    verifyCloudflareGitBuildDisconnection({
      fetchImpl: makeFetch({ pagesProjects: [directUploadProject], pagesResultInfo: {} }),
      token: 'test-token',
      accountId: 'account-123'
    }),
    /valid result_info\.total_pages/
  );

  const noLegacyPages = await verifyCloudflareGitBuildDisconnection({
    fetchImpl: makeFetch({ pagesProjects: [unrelatedGitProject] }),
    token: 'test-token',
    accountId: 'account-123'
  });
  assert.equal(noLegacyPages.pages.relevantProjects.length, 0);
  assert.equal(noLegacyPages.pages.gitDeploymentsDisconnected, true);

  await expectReject(
    verifyCloudflareGitBuildDisconnection({
      fetchImpl: makeFetch(),
      workerToken: 'workers-only',
      pagesToken: '',
      accountId: 'account-123'
    }),
    /Pages read token is required/
  );

  console.log('Cloudflare live zero-build proof test passed: split least-privilege tokens are routed correctly; Pages enumeration uses API-native pagination without forcing per_page; incomplete pagination metadata, Workers Builds triggers, matching Pages Git sources and permission failures remain fail-closed.');
})().catch(error => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
