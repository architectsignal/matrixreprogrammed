#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const API_ROOT = 'https://api.cloudflare.com/client/v4';

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function fail(message) {
  const error = new Error(message);
  error.code = 'CLOUDFLARE_ZERO_BUILD_PROOF_FAILED';
  throw error;
}

async function cloudflareGet(fetchImpl, token, pathname) {
  const response = await fetchImpl(`${API_ROOT}${pathname}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json'
    }
  });
  let payload;
  try {
    payload = await response.json();
  } catch {
    fail(`Cloudflare ${pathname} returned non-JSON status ${response.status}.`);
  }
  if (!response.ok || payload?.success !== true) {
    const messages = Array.isArray(payload?.errors)
      ? payload.errors.map(item => item?.message || item?.code).filter(Boolean).join('; ')
      : '';
    fail(`Cloudflare ${pathname} failed with status ${response.status}${messages ? `: ${messages}` : ''}.`);
  }
  return payload;
}

async function listPagesProjects(fetchImpl, token, accountId) {
  const projects = [];
  for (let page = 1; page <= 20; page += 1) {
    // Let Cloudflare choose its supported page size. The Pages API currently
    // rejects the historical per_page=100 override, so completeness is proven
    // from result_info.total_pages instead of forcing a page size.
    const payload = await cloudflareGet(
      fetchImpl,
      token,
      `/accounts/${encodeURIComponent(accountId)}/pages/projects?page=${page}`
    );
    const batch = Array.isArray(payload.result) ? payload.result : [];
    projects.push(...batch);

    const totalPages = Number(payload?.result_info?.total_pages);
    if (!Number.isInteger(totalPages) || totalPages < 1) {
      fail('Cloudflare Pages project enumeration did not return a valid result_info.total_pages value.');
    }
    if (page > totalPages) {
      fail(`Cloudflare Pages pagination returned inconsistent total_pages=${totalPages} on page ${page}.`);
    }
    if (page >= totalPages) break;
    if (page === 20) fail('Cloudflare Pages project enumeration exceeded 20 pages.');
  }
  return projects;
}

function pageProjectRelevant(project, { workerName, repoOwner, repoName, siteDomain }) {
  const projectName = normalize(project?.name);
  const source = project?.source || null;
  const config = source?.config || {};
  const domains = Array.isArray(project?.domains) ? project.domains.map(normalize) : [];
  const sourceRepo = normalize(config.repo_name || config.repo || '');
  const sourceOwner = normalize(config.owner || '');
  return projectName === normalize(workerName)
    || domains.some(domain => domain === normalize(siteDomain) || domain === `www.${normalize(siteDomain)}`)
    || (sourceRepo === normalize(repoName) && (!sourceOwner || sourceOwner === normalize(repoOwner)));
}

function summarizePageProject(project) {
  return {
    name: String(project?.name || ''),
    domains: Array.isArray(project?.domains) ? project.domains.map(String) : [],
    sourceType: project?.source?.type ? String(project.source.type) : null,
    sourceRepository: project?.source?.config?.repo_name ? String(project.source.config.repo_name) : null,
    sourceOwner: project?.source?.config?.owner ? String(project.source.config.owner) : null
  };
}

async function verifyCloudflareGitBuildDisconnection({
  fetchImpl = globalThis.fetch,
  token,
  workerToken,
  pagesToken,
  accountId,
  workerName = 'matrixreprogrammed',
  repoOwner = 'architectsignal',
  repoName = 'matrixreprogrammed',
  siteDomain = 'matrixreprogrammed.com',
  now = new Date()
} = {}) {
  if (typeof fetchImpl !== 'function') fail('A fetch implementation is required.');
  const effectiveWorkerToken = String(workerToken || token || '').trim();
  const effectivePagesToken = String(pagesToken || token || '').trim();
  if (!effectiveWorkerToken) fail('A Cloudflare Workers Builds read token is required.');
  if (!effectivePagesToken) fail('A Cloudflare Pages read token is required.');
  if (!accountId) fail('CLOUDFLARE_ACCOUNT_ID is required.');

  const scriptsPayload = await cloudflareGet(
    fetchImpl,
    effectiveWorkerToken,
    `/accounts/${encodeURIComponent(accountId)}/workers/scripts`
  );
  const scripts = Array.isArray(scriptsPayload.result) ? scriptsPayload.result : [];
  const worker = scripts.find(item => String(item?.id || '') === workerName);
  if (!worker) fail(`Cloudflare Worker ${workerName} was not found in the account.`);
  const workerTag = String(worker?.tag || '').trim();
  if (!workerTag) fail(`Cloudflare Worker ${workerName} does not expose the immutable tag required by the Builds API.`);

  const triggersPayload = await cloudflareGet(
    fetchImpl,
    effectiveWorkerToken,
    `/accounts/${encodeURIComponent(accountId)}/builds/workers/${encodeURIComponent(workerTag)}/triggers`
  );
  const triggers = Array.isArray(triggersPayload.result) ? triggersPayload.result : [];
  if (triggers.length !== 0) {
    fail(`Cloudflare Worker ${workerName} still has ${triggers.length} Workers Builds trigger(s); zero-build release refused.`);
  }

  const projects = await listPagesProjects(fetchImpl, effectivePagesToken, accountId);
  const relevantProjects = projects.filter(project => pageProjectRelevant(project, {
    workerName,
    repoOwner,
    repoName,
    siteDomain
  }));
  const connectedPages = relevantProjects.filter(project => project?.source && project.source.type);
  if (connectedPages.length) {
    fail(`Cloudflare Pages still has Git source control on: ${connectedPages.map(project => project.name).join(', ')}.`);
  }

  return {
    ok: true,
    checkedAt: now.toISOString(),
    accountIdSuffix: String(accountId).slice(-6),
    worker: {
      name: workerName,
      tag: workerTag,
      workersBuildTriggers: 0,
      gitBuildsDisconnected: true
    },
    pages: {
      projectsEnumerated: projects.length,
      relevantProjects: relevantProjects.map(summarizePageProject),
      gitSourcesConnected: 0,
      gitDeploymentsDisconnected: true
    },
    repository: `${repoOwner}/${repoName}`,
    siteDomain,
    evidence: 'Cloudflare Workers Scripts + Workers Builds trigger listing + complete Pages project source listing',
    boundary: 'Read-only Cloudflare API proof. Separate least-privilege tokens may be used for Workers Builds and Pages. No build, deployment, Pages mutation, Worker mutation, D1 mutation or billing action is performed.'
  };
}

function recordPolicyProof(report, policyPath = '.github/build-budget-policy.json') {
  const resolved = path.resolve(policyPath);
  const policy = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  const previous = policy.verifiedCloudflareConnectionState || {};
  const lockedSnapshotDate = String(policy?.ownerUsageSnapshot?.observedOn || previous.observedOn || '').trim();
  policy.verifiedCloudflareConnectionState = {
    ...previous,
    observedOn: lockedSnapshotDate,
    observedAt: report.checkedAt,
    workersGitBuilds: 'disconnected',
    pagesGitDeployments: 'disconnected',
    verification: `Live Cloudflare API proof at ${report.checkedAt}: Worker ${report.worker.name} returned zero Workers Builds triggers; ${report.pages.relevantProjects.length} matching legacy Pages project(s) returned no Git source. ${report.pages.projectsEnumerated} Pages project(s) enumerated account-wide.`
  };
  fs.writeFileSync(resolved, `${JSON.stringify(policy, null, 2)}\n`);
}

async function main() {
  const report = await verifyCloudflareGitBuildDisconnection({
    token: process.env.CLOUDFLARE_API_TOKEN,
    workerToken: process.env.CLOUDFLARE_BUILDS_API_TOKEN,
    pagesToken: process.env.CLOUDFLARE_PAGES_API_TOKEN,
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    workerName: process.env.CLOUDFLARE_WORKER_NAME || 'matrixreprogrammed',
    repoOwner: process.env.MATRIX_GITHUB_OWNER || 'architectsignal',
    repoName: process.env.MATRIX_GITHUB_REPOSITORY || 'matrixreprogrammed',
    siteDomain: process.env.MATRIX_SITE_DOMAIN || 'matrixreprogrammed.com'
  });

  const output = path.resolve(process.env.CLOUDFLARE_ZERO_BUILD_PROOF_PATH || 'downloads/cloudflare-live-zero-build-proof.json');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);

  if (String(process.env.MATRIX_UPDATE_BUDGET_POLICY || '').toLowerCase() === 'true') {
    recordPolicyProof(report, process.env.MATRIX_CLOUDFLARE_BUDGET_POLICY_PATH || '.github/build-budget-policy.json');
  }

  const githubEnv = process.env.GITHUB_ENV;
  if (githubEnv) {
    fs.appendFileSync(githubEnv, `CLOUDFLARE_GIT_BUILDS_DISCONNECTED=true\n`);
    fs.appendFileSync(githubEnv, `CLOUDFLARE_GIT_BUILDS_CHECKED_AT_UTC=${report.checkedAt}\n`);
    fs.appendFileSync(githubEnv, `CLOUDFLARE_ZERO_BUILD_PROOF_PATH=${output}\n`);
  }
  console.log(
    `Cloudflare live zero-build proof PASS: Worker ${report.worker.name} has 0 Workers Builds triggers; ` +
    `${report.pages.relevantProjects.length} relevant Pages project(s) have 0 Git sources.`
  );
}

if (require.main === module) {
  main().catch(error => {
    console.error(`CLOUDFLARE LIVE ZERO-BUILD PROOF FAILED: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  cloudflareGet,
  listPagesProjects,
  pageProjectRelevant,
  recordPolicyProof,
  verifyCloudflareGitBuildDisconnection
};
