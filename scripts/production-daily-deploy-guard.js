'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_TIMEZONE = 'Europe/Paris';
const DEPLOY_STEP_NAME = 'Deploy exact reconciled assets and autonomous D1 Worker to Cloudflare';
const WORKFLOW_ID = 'deploy.yml';
const OUTPUT_PATH = path.join('downloads', 'production-daily-deploy-guard.json');

function localDateKey(value, timeZone = DEFAULT_TIMEZONE) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`Invalid date: ${value}`);
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const get = type => parts.find(part => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function successfulDeploysForLocalDay(runs, jobsByRun, options = {}) {
  const timeZone = options.timeZone || DEFAULT_TIMEZONE;
  const today = localDateKey(options.now || new Date(), timeZone);
  const currentRunId = String(options.currentRunId || '');
  const deployments = [];
  for (const run of runs || []) {
    if (currentRunId && String(run.id) === currentRunId) continue;
    for (const job of jobsByRun.get(String(run.id)) || []) {
      for (const step of job.steps || []) {
        if (step.name !== DEPLOY_STEP_NAME || step.conclusion !== 'success' || !step.completed_at) continue;
        if (localDateKey(step.completed_at, timeZone) !== today) continue;
        deployments.push({ runId: run.id, runNumber: run.run_number ?? null, runUrl: run.html_url || null, headSha: run.head_sha || null, completedAt: step.completed_at, localDate: today });
      }
    }
  }
  return deployments.sort((a, b) => String(a.completedAt).localeCompare(String(b.completedAt)));
}

async function githubJson(url, token = '') {
  const headers = {
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    'user-agent': 'matrix-production-daily-deploy-guard'
  };
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(url, { headers, signal: typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(20000) : undefined });
  if (!response.ok) throw new Error(`GitHub API ${response.status} for ${url}`);
  return response.json();
}

async function loadRecentRuns(repository, token) {
  const [owner, repo] = repository.split('/');
  if (!owner || !repo) throw new Error('GITHUB_REPOSITORY must be owner/repo');
  const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${encodeURIComponent(WORKFLOW_ID)}/runs?per_page=30`;
  const payload = await githubJson(url, token);
  return Array.isArray(payload.workflow_runs) ? payload.workflow_runs : [];
}

async function loadJobs(repository, runId, token) {
  const [owner, repo] = repository.split('/');
  const payload = await githubJson(`https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}/jobs?per_page=100`, token);
  return Array.isArray(payload.jobs) ? payload.jobs : [];
}

function writeProof(proof) {
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(proof, null, 2)}\n`);
}

function selfTest() {
  const runs = [
    { id: 1, run_number: 100, head_sha: 'a'.repeat(40) },
    { id: 2, run_number: 101, head_sha: 'b'.repeat(40) },
    { id: 3, run_number: 102, head_sha: 'c'.repeat(40) }
  ];
  const jobs = new Map([
    ['1', [{ steps: [{ name: DEPLOY_STEP_NAME, conclusion: 'success', completed_at: '2026-08-11T21:43:19Z' }] }]],
    ['2', [{ steps: [{ name: DEPLOY_STEP_NAME, conclusion: 'failure', completed_at: '2026-08-12T10:00:00Z' }] }]],
    ['3', [{ steps: [{ name: DEPLOY_STEP_NAME, conclusion: 'success', completed_at: '2026-08-12T12:00:00Z' }] }]]
  ]);
  if (localDateKey('2026-08-11T21:43:19Z', 'Europe/Paris') !== '2026-08-11') throw new Error('Summer Paris date conversion failed');
  if (localDateKey('2026-12-31T23:30:00Z', 'Europe/Paris') !== '2027-01-01') throw new Error('Winter Paris date conversion failed');
  const allowed = successfulDeploysForLocalDay(runs, jobs, { timeZone: 'Europe/Paris', now: '2026-08-12T13:00:00Z', currentRunId: '3' });
  if (allowed.length !== 0) throw new Error('Failed/prior-day/current-run filtering failed');
  const blocked = successfulDeploysForLocalDay(runs, jobs, { timeZone: 'Europe/Paris', now: '2026-08-12T13:00:00Z', currentRunId: '999' });
  if (blocked.length !== 1 || String(blocked[0].runId) !== '3') throw new Error('Successful same-day deployment was not detected');
  console.log('Production daily deploy guard self-test passed: Europe/Paris DST, failed attempts, current-run exclusion and successful-deploy blocking verified.');
}

async function runGuard() {
  selfTest();
  const token = process.env.GITHUB_TOKEN || '';
  const repository = process.env.GITHUB_REPOSITORY || '';
  const currentRunId = process.env.GITHUB_RUN_ID || '';
  const timeZone = process.env.MATRIX_PRODUCTION_TIMEZONE || DEFAULT_TIMEZONE;
  const now = process.env.MATRIX_NOW || new Date().toISOString();
  if (!repository) throw new Error('GITHUB_REPOSITORY is required for the production daily deploy guard');
  const nowMs = new Date(now).getTime();
  if (!Number.isFinite(nowMs)) throw new Error(`Invalid MATRIX_NOW: ${now}`);

  const runs = await loadRecentRuns(repository, token);
  const jobsByRun = new Map();
  for (const run of runs) {
    if (String(run.id) === String(currentRunId)) continue;
    const created = new Date(run.created_at || 0).getTime();
    if (!Number.isFinite(created) || nowMs - created > 36 * 60 * 60 * 1000) continue;
    jobsByRun.set(String(run.id), await loadJobs(repository, run.id, token));
  }
  const localDate = localDateKey(now, timeZone);
  const deployments = successfulDeploysForLocalDay(runs, jobsByRun, { timeZone, now, currentRunId });
  const proof = {
    ok: deployments.length === 0,
    checkedAt: new Date().toISOString(),
    policy: 'maximum-one-successful-cloudflare-production-deploy-per-local-calendar-day',
    timeZone,
    localDate,
    currentRunId: currentRunId || null,
    successfulDeploymentsToday: deployments,
    slotAvailable: deployments.length === 0,
    boundary: 'Only a successful Cloudflare production deploy step consumes the daily slot. Failed, skipped or pre-deploy attempts do not.'
  };
  writeProof(proof);
  if (deployments.length) throw new Error(`Daily production deploy limit reached for ${localDate} ${timeZone}: run ${deployments[0].runId} already deployed successfully at ${deployments[0].completedAt}`);
  console.log(`Daily production deploy guard PASS: ${localDate} ${timeZone} has no earlier successful Cloudflare production deploy.`);
  return proof;
}

if (require.main === module) {
  if (process.argv.includes('--self-test')) {
    try { selfTest(); } catch (error) { console.error(error.stack || error.message); process.exit(1); }
  } else {
    runGuard().catch(error => {
      try { writeProof({ ok: false, checkedAt: new Date().toISOString(), policy: 'maximum-one-successful-cloudflare-production-deploy-per-local-calendar-day', timeZone: process.env.MATRIX_PRODUCTION_TIMEZONE || DEFAULT_TIMEZONE, error: String(error?.message || error), failClosed: true }); } catch {}
      console.error(`PRODUCTION DAILY DEPLOY GUARD FAILED: ${error.message || error}`);
      process.exit(1);
    });
  }
}

module.exports = { localDateKey, successfulDeploysForLocalDay, selfTest, runGuard, DEPLOY_STEP_NAME };
