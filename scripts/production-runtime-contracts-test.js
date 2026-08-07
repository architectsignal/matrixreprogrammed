#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const checks = [];

function fail(message) {
  throw new Error(message);
}

function requireFile(relative, minimumBytes = 1) {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
    fail(`Required production runtime file is missing: ${relative}`);
  }
  const bytes = fs.statSync(absolute).size;
  if (bytes < minimumBytes) {
    fail(`Required production runtime file is unexpectedly small: ${relative} (${bytes} bytes)`);
  }
  checks.push({ type: 'file', path: relative, bytes });
  return absolute;
}

function requireJson(relative) {
  const absolute = requireFile(relative, 2);
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(absolute, 'utf8'));
  } catch (error) {
    fail(`Required production JSON is invalid: ${relative}: ${error.message}`);
  }
  checks.push({ type: 'json', path: relative });
  return parsed;
}

function requireMarker(relative, marker) {
  const absolute = requireFile(relative, marker.length);
  const text = fs.readFileSync(absolute, 'utf8');
  if (!text.includes(marker)) {
    fail(`${relative} is missing required production marker: ${marker}`);
  }
  checks.push({ type: 'marker', path: relative, marker });
}

const workerModules = [
  'src/worker-production.js',
  'src/worker-production-autonomy.js',
  'src/worker-member-experience.js',
  'src/worker-matrix-synergy.js',
  'src/worker-ai-management.js',
  'src/worker-local-job-api.js',
  'src/worker-opportunity-hunter.js',
  'src/worker-forum-persistence.js'
];

for (const relative of workerModules) {
  const absolute = requireFile(relative, 64);
  execFileSync(process.execPath, ['--check', absolute], {
    cwd: root,
    stdio: 'pipe',
    encoding: 'utf8'
  });
  checks.push({ type: 'syntax', path: relative });
}

const deployableFiles = [
  '_site/index.html',
  '_site/search.html',
  '_site/forum.html',
  '_site/member-login.html',
  '_site/member-dashboard.html',
  '_site/membership.html',
  '_site/deploy-health.json',
  '_site/deploy-manifest.json'
];
for (const relative of deployableFiles) requireFile(relative, 32);

requireJson('deploy-health.json');
requireJson('deploy-manifest.json');
requireJson('_site/deploy-health.json');
requireJson('_site/deploy-manifest.json');

requireMarker('_site/index.html', 'class="accountability-home"');
requireMarker('_site/index.html', 'name="q"');
requireMarker('_site/search.html', 'search-query-handoff.js');
requireMarker('_site/forum.html', 'forum.js');
requireMarker('_site/member-login.html', '/api/auth/request-link');
requireMarker('_site/membership.html', 'paypal-membership.js');
requireMarker('_site/deploy-health.json', 'src/worker-production.js');

const deploySha = String(process.env.DEPLOY_COMMIT_SHA || '').trim().toLowerCase();
if (deploySha && !/^[0-9a-f]{40}$/.test(deploySha)) {
  fail(`DEPLOY_COMMIT_SHA is not a full Git SHA: ${deploySha}`);
}
checks.push({ type: 'deployment-sha', value: deploySha || 'not-supplied' });

console.log(
  `PRODUCTION RUNTIME CONTRACTS TEST PASSED: ${checks.length} read-only checks; ` +
  `${workerModules.length} Worker modules syntax-verified and ${deployableFiles.length} reconciled public assets present.`
);
