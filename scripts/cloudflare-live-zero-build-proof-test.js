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

function makeFetch({ workerTriggers = [], pagesProjects = [], failures = {} } = {}) {
  return async url => {
    const parsed = new URL(url);
    const key = parsed.pathname;
    if (failures[key]) return response({ success: false, errors: [{ message: failures[key] }] }, 403);
    if (key.endsWith('/workers/scripts')) {
      return response({ success: true, result: [{ id: 'matrixreprogrammed', tag: 'worker-tag-123' }] });
    }
    if (key.endsWith('/builds/workers/worker-tag-123/triggers')) {
      return response({ success: true, result: workerTriggers });
    }
    if (key.endsWith('/pages/projects')) {
      return response({ success: true, result: pagesProjects, result_info: { total_pages: 1 } });
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

  const proof = await verifyCloudflareGitBuildDisconnection({
    fetchImpl: makeFetch({ pagesProjects: [directUploadProject, unrelatedGitProject] }),
    token: 'test-token',
    accountId: 'account-123',
    now: new Date('2026-08-09T15:00:00.000Z')
  });
  assert.equal(proof.ok, true);
  assert.equal(proof.worker.workersBuildTriggers, 0);
  assert.equal(proof.worker.gitBuildsDisconnected, true);
  assert.equal(proof.pages.projectsEnumerated, 2);
  assert.equal(proof.pages.relevantProjects.length, 1);
  assert.equal(proof.pages.gitSourcesConnected, 0);

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

  const noLegacyPages = await verifyCloudflareGitBuildDisconnection({
    fetchImpl: makeFetch({ pagesProjects: [unrelatedGitProject] }),
    token: 'test-token',
    accountId: 'account-123'
  });
  assert.equal(noLegacyPages.pages.relevantProjects.length, 0);
  assert.equal(noLegacyPages.pages.gitDeploymentsDisconnected, true);

  console.log('Cloudflare live zero-build proof test passed: direct-upload/no-project Pages states pass, while Workers Builds triggers, matching Pages Git sources and API permission failures remain fail-closed.');
})().catch(error => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
